import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  MAX_API_PROXY_BYTES,
  MAX_IMG_PROXY_BYTES,
  createIpRateLimiter,
  resolveVideoStreamReferer,
  rewriteHlsManifestUrls,
  sanitizeDownloadFilename,
  validateIncomingRequestOrigin,
  validateProxyTargetUrl
} from './src/utils/proxySecurity.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, 'dist');

const apiRateLimiter = createIpRateLimiter({ windowMs: 60_000, maxRequests: 600 });
const imgRateLimiter = createIpRateLimiter({ windowMs: 60_000, maxRequests: 600 });
const videoRateLimiter = createIpRateLimiter({ windowMs: 60_000, maxRequests: 600 });

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function getClientIp(req: http.IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function setCommonSecurityHeaders(res: http.ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
}

async function fetchWithValidatedRedirects(
  initialUrl: URL,
  init: RequestInit,
  maxRedirects = 3
): Promise<Response> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const resp = await fetch(currentUrl.toString(), {
      ...init,
      redirect: 'manual'
    });
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location');
      if (!location) return resp;
      const nextRaw = new URL(location, currentUrl).toString();
      const check = validateProxyTargetUrl(nextRaw);
      if (!check.valid) {
        throw new Error(`Blocked redirect target (${check.reason})`);
      }
      currentUrl = check.url;
      continue;
    }
    return resp;
  }
  throw new Error('Too many redirects');
}

async function readUpstreamWithLimit(resp: Response, maxBytes: number): Promise<Buffer> {
  const lenHeader = Number(resp.headers.get('content-length') || '0');
  if (lenHeader > maxBytes) {
    throw new Error(`Upstream payload exceeds limit (${maxBytes} bytes)`);
  }
  if (!resp.body) {
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new Error(`Upstream payload exceeds limit (${maxBytes} bytes)`);
    }
    return buf;
  }
  const reader = resp.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`Upstream payload exceeds limit (${maxBytes} bytes)`);
      }
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks);
}

function applyStrictCorsHeaders(
  req: http.IncomingMessage,
  res: http.ServerResponse
): boolean {
  const originCheck = validateIncomingRequestOrigin(req.headers);
  res.setHeader('Vary', 'Origin');
  if (!originCheck.allowed) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: originCheck.reason }));
    return false;
  }
  if (originCheck.corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', originCheck.corsOrigin);
  }
  return true;
}

async function handleApiProxy(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!applyStrictCorsHeaders(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, x-custom-content-type, x-custom-requested-with');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const rl = apiRateLimiter.check(getClientIp(req));
  if (!rl.allowed) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Too many proxy requests' }));
    return;
  }

  try {
    const parsed = new URL(req.url || '/', 'http://localhost:3000');
    const rawTarget = parsed.searchParams.get('url') || '';
    const validation = validateProxyTargetUrl(rawTarget);
    if (!validation.valid) {
      res.statusCode = validation.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: validation.reason }));
      return;
    }

    const targetUrl = validation.url;
    const targetOrigin = targetUrl.origin;
    const isMangaDex =
      targetUrl.hostname.endsWith('mangadex.org') || targetUrl.hostname.endsWith('mangadex.network');

    const headers: Record<string, string> = {
      'User-Agent': isMangaDex
        ? 'NyAnime/2.3 (https://mangadex.org)'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: String(req.headers['accept'] || 'application/json, text/plain, */*')
    };

    if (!isMangaDex) {
      if (
        targetUrl.hostname.endsWith('manhwaweb.com') ||
        targetUrl.hostname.endsWith('img1mw.xyz') ||
        targetUrl.hostname.endsWith('img2mw.xyz') ||
        targetUrl.hostname.endsWith('img3mw.xyz') ||
        targetUrl.hostname.endsWith('img4mw.xyz') ||
        targetUrl.hostname.endsWith('lezhin.com') ||
        targetUrl.hostname.endsWith('lezhincomics.com')
      ) {
        headers['Referer'] = 'https://manhwaweb.com/';
        headers['Origin'] = 'https://manhwaweb.com';
      } else {
        headers['Referer'] = targetOrigin + '/';
        headers['Origin'] = targetOrigin;
      }
    }
    const customCt = req.headers['x-custom-content-type'];
    const reqCt = req.headers['content-type'];
    if (typeof customCt === 'string' && customCt) {
      headers['Content-Type'] = customCt;
    } else if (typeof reqCt === 'string' && reqCt) {
      headers['Content-Type'] = reqCt;
    }
    const reqWith = req.headers['x-custom-requested-with'];
    if (typeof reqWith === 'string' && reqWith) {
      headers['X-Requested-With'] = reqWith;
    }

    let bodyData: Uint8Array | undefined;
    if (req.method === 'POST') {
      const buf = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > 1_048_576) {
            reject(new Error('POST body too large'));
            return;
          }
          chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });
      bodyData = new Uint8Array(buf);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const upstream = await fetchWithValidatedRedirects(targetUrl, {
      method: req.method || 'GET',
      headers,
      body: bodyData as BodyInit | undefined,
      signal: controller.signal
    });
    clearTimeout(timer);

    const payload = await readUpstreamWithLimit(upstream, MAX_API_PROXY_BYTES);
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.statusCode = upstream.status;
    res.end(payload);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
}

async function handleImgProxy(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!applyStrictCorsHeaders(req, res)) return;
  const rl = imgRateLimiter.check(getClientIp(req));
  if (!rl.allowed) {
    res.statusCode = 429;
    res.end('Too many image requests');
    return;
  }

  try {
    const parsed = new URL(req.url || '/', 'http://localhost:3000');
    const rawTarget = parsed.searchParams.get('url') || '';
    const validation = validateProxyTargetUrl(rawTarget);
    if (!validation.valid) {
      res.statusCode = validation.status;
      res.end(validation.reason);
      return;
    }

    const targetUrl = validation.url;
    const isMangaDex =
      targetUrl.hostname.endsWith('mangadex.org') || targetUrl.hostname.endsWith('mangadex.network');

    const headers: Record<string, string> = {
      'User-Agent': isMangaDex
        ? 'NyAnime/2.3 (https://mangadex.org)'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    };

    if (!isMangaDex) {
      if (
        targetUrl.hostname.endsWith('readdetectiveconan.com') ||
        targetUrl.hostname.endsWith('mangapill.com') ||
        targetUrl.pathname.includes('/mangap/')
      ) {
        headers['Referer'] = 'https://mangapill.com/';
      } else if (
        targetUrl.hostname.endsWith('manhwaweb.com') ||
        targetUrl.hostname.endsWith('img1mw.xyz') ||
        targetUrl.hostname.endsWith('img2mw.xyz') ||
        targetUrl.hostname.endsWith('img3mw.xyz') ||
        targetUrl.hostname.endsWith('img4mw.xyz') ||
        targetUrl.hostname.endsWith('toptoon.com') ||
        targetUrl.hostname.endsWith('lezhin.com') ||
        targetUrl.hostname.endsWith('lezhincomics.com')
      ) {
        headers['Referer'] = 'https://manhwaweb.com/';
        headers['Origin'] = 'https://manhwaweb.com';
      } else if (
        targetUrl.hostname.endsWith('webtoons.com') ||
        targetUrl.hostname.endsWith('pstatic.net') ||
        targetUrl.hostname.endsWith('naver.net')
      ) {
        headers['Referer'] = 'https://www.webtoons.com/';
      } else {
        headers['Referer'] = targetUrl.origin + '/';
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const upstream = await fetchWithValidatedRedirects(targetUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      res.statusCode = upstream.status;
      res.end();
      return;
    }

    const payload = await readUpstreamWithLimit(upstream, MAX_IMG_PROXY_BYTES);
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.statusCode = 200;
    res.end(payload);
  } catch {
    res.statusCode = 502;
    res.end();
  }
}

async function handleVideoProxy(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!applyStrictCorsHeaders(req, res)) return;
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const rl = videoRateLimiter.check(getClientIp(req));
  if (!rl.allowed) {
    res.statusCode = 429;
    res.end('Too many video requests');
    return;
  }

  const abortCtrl = new AbortController();
  const connectTimer = setTimeout(() => abortCtrl.abort(), 6_500);
  res.on('close', () => {
    clearTimeout(connectTimer);
    abortCtrl.abort();
  });

  try {
    const parsed = new URL(req.url || '/', 'http://localhost:3000');
    const rawTarget = parsed.searchParams.get('url') || '';
    const validation = validateProxyTargetUrl(rawTarget);
    if (!validation.valid) {
      clearTimeout(connectTimer);
      res.statusCode = validation.status;
      res.end(validation.reason);
      return;
    }

    const targetUrl = validation.url;
    const referer = resolveVideoStreamReferer(targetUrl);
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: '*/*',
      Referer: referer,
      Origin: referer.replace(/\/$/, '')
    };
    if (typeof req.headers['range'] === 'string' && req.headers['range']) {
      headers['Range'] = req.headers['range'];
    }

    const upstream = await fetchWithValidatedRedirects(targetUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      signal: abortCtrl.signal
    });
    clearTimeout(connectTimer);

    if (!upstream.ok && upstream.status !== 206) {
      res.statusCode = upstream.status;
      res.end();
      return;
    }

    const rawCt = (upstream.headers.get('content-type') || '').toLowerCase();
    const isHlsManifest =
      rawCt.includes('mpegurl') ||
      rawCt.includes('x-mpegurl') ||
      targetUrl.pathname.toLowerCase().endsWith('.m3u8');

    if (isHlsManifest && req.method !== 'HEAD') {
      const manifestBuf = await readUpstreamWithLimit(upstream, MAX_API_PROXY_BYTES);
      const rewritten = rewriteHlsManifestUrls(manifestBuf.toString('utf8'), targetUrl.toString());
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 200;
      res.end(rewritten);
      return;
    }

    if (rawCt.includes('text/html') || rawCt.includes('application/xhtml')) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Upstream returned HTML error page instead of video stream');
      return;
    }

    const mime = rawCt.includes('video/')
      ? rawCt
      : targetUrl.pathname.endsWith('.webm')
        ? 'video/webm'
        : targetUrl.pathname.endsWith('.ts')
          ? 'video/mp2t'
          : 'video/mp4';
    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
    res.setHeader('Cache-Control', 'no-store');
    if (parsed.searchParams.get('download') === '1') {
      const safeFile = sanitizeDownloadFilename(parsed.searchParams.get('filename') || '', 'nyanime_episodio.mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFile}"`);
    }
    for (const h of ['content-length', 'content-range', 'etag', 'last-modified']) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }

    res.statusCode = upstream.status === 206 ? 206 : 200;
    if (req.method === 'HEAD' || !upstream.body) {
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream<Uint8Array>);
    nodeStream.on('error', () => {
      if (!res.writableEnded) res.end();
    });
    nodeStream.pipe(res);
  } catch {
    clearTimeout(connectTimer);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end();
    }
  }
}

function serveStaticFile(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): void {
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath === '/' ? 'index.html' : safePath);

  if (!filePath.startsWith(DIST_DIR)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback for client routes
    filePath = path.join(DIST_DIR, 'index.html');
    if (!fs.existsSync(filePath)) {
      res.statusCode = 404;
      res.end('dist/index.html not built. Run npm run build first.');
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const raw = fs.readFileSync(filePath);

  res.setHeader('Content-Type', mime);
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (ext === '.html' || path.basename(filePath) === 'sw.js') {
    res.setHeader('Cache-Control', 'no-cache');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }

  const acceptEnc = String(req.headers['accept-encoding'] || '');
  const compressible =
    mime.startsWith('text/') || mime.includes('javascript') || mime.includes('json') || mime.includes('svg');
  if (compressible && acceptEnc.includes('gzip') && raw.byteLength > 1024) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.statusCode = 200;
    res.end(zlib.gzipSync(raw));
    return;
  }

  res.statusCode = 200;
  res.end(raw);
}

export function createAppServer(): http.Server {
  return http.createServer(async (req, res) => {
    setCommonSecurityHeaders(res);
    const rawUrl = req.url || '/';
    const urlObj = new URL(rawUrl, 'http://localhost:3000');

    if (urlObj.pathname === '/api/proxy') {
      await handleApiProxy(req, res);
      return;
    }
    if (urlObj.pathname === '/api/img-proxy') {
      await handleImgProxy(req, res);
      return;
    }
    if (urlObj.pathname === '/api/video-proxy') {
      await handleVideoProxy(req, res);
      return;
    }

    serveStaticFile(req, res, urlObj.pathname);
  });
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === __filename;

if (isEntrypoint) {
  const port = Number(process.env.PORT || 3000);
  const host = '0.0.0.0';
  const server = createAppServer();
  server.listen(port, host, () => {
    console.log(`NyAnime TV production server listening on http://${host}:${port}`);
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`[NyAnime Server] ${signal} recibido. Cerrando conexiones limpiamente...`);
    const forceTimer = setTimeout(() => {
      console.warn('[NyAnime Server] Tiempo de drenado agotado. Saliendo.');
      process.exit(1);
    }, 8_000);
    forceTimer.unref();
    server.close(() => {
      clearTimeout(forceTimer);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
