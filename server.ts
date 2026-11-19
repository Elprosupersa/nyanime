import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  LruTtlCache,
  MAX_API_PROXY_BYTES,
  MAX_IMG_PROXY_BYTES,
  buildRedirectHopHeaders,
  capStreamingRangeHeader,
  createIpRateLimiter,
  resolveValidatedVideoReferer,
  resolveVideoStreamReferer,
  rewriteHlsManifestUrls,
  sanitizeDownloadFilename,
  sanitizeForwardHeaderValue,
  shouldBypassProxyCache,
  validateIncomingRequestOrigin,
  validateProxyTargetUrl
} from './src/utils/proxySecurity.ts';
import { handleFeatureApiRoutes } from './src/server/featureRoutes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, 'dist');

const apiRateLimiter = createIpRateLimiter({ windowMs: 60_000, maxRequests: 600 });
const imgRateLimiter = createIpRateLimiter({ windowMs: 60_000, maxRequests: 600 });
const videoRateLimiter = createIpRateLimiter({ windowMs: 60_000, maxRequests: 600 });
const PROXY_CACHE_TTL_MS = 5 * 60 * 1000;
const PROXY_CACHE_MAX_ENTRIES = 250;
const PROXY_CACHE_MAX_BYTES = 32 * 1024 * 1024; // 32 MB ceiling
const proxyResponseCache = new LruTtlCache<{ buffer: Buffer; contentType: string }>({
  maxEntries: PROXY_CACHE_MAX_ENTRIES,
  maxTotalBytes: PROXY_CACHE_MAX_BYTES,
  defaultTtlMs: PROXY_CACHE_TTL_MS,
  getSize: (entry) => entry.buffer.byteLength
});

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

const STATIC_ASSET_EXT_RE =
  /\.(?:js|mjs|cjs|css|map|png|jpe?g|webp|gif|svg|ico|json|webmanifest|woff2?|ttf|eot|txt|xml|mp4|webm|m3u8)$/i;

const NO_STORE_FILES = new Set([
  'index.html',
  'sw.js',
  'sw-push.js',
  'firebase-messaging-sw.js',
  'manifest.webmanifest'
]);

function isStaticAssetPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return lower.startsWith('/assets/') || lower.startsWith('/api/') || STATIC_ASSET_EXT_RE.test(lower);
}

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
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
}

function bindClientDisconnectAbort(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  abortCtrl: AbortController,
  onAbort?: () => void
): () => void {
  let triggered = false;
  const triggerAbort = () => {
    if (triggered || res.writableFinished) return;
    triggered = true;
    abortCtrl.abort();
    onAbort?.();
  };
  const onReqClose = () => {
    // In Node 18+, GET requests emit 'close' on req once the empty body ends (req.complete === true).
    // Only abort on req 'close' if the request was cut short before completion.
    if (!req.complete && !res.writableFinished) {
      triggerAbort();
    }
  };
  const onResClose = () => {
    if (!res.writableFinished) {
      triggerAbort();
    }
  };
  req.on('close', onReqClose);
  req.on('aborted', triggerAbort);
  res.on('close', onResClose);

  return () => {
    req.off('close', onReqClose);
    req.off('aborted', triggerAbort);
    res.off('close', onResClose);
  };
}

async function fetchWithValidatedRedirects(
  initialUrl: URL,
  init: RequestInit & { headers?: Record<string, string> },
  maxRedirects = 3,
  resolveReferer?: (target: URL) => string,
  options?: { preserveVideoReferer?: boolean }
): Promise<{ resp: Response; finalUrl: URL }> {
  let currentUrl = initialUrl;
  let currentHeaders: Record<string, string> = { ...(init.headers || {}) };
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const resp = await fetch(currentUrl.toString(), {
      ...init,
      headers: currentHeaders,
      redirect: 'manual'
    });
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location');
      if (!location) return { resp, finalUrl: currentUrl };
      await resp.body?.cancel().catch(() => {});
      const nextRaw = new URL(location, currentUrl).toString();
      const check = validateProxyTargetUrl(nextRaw);
      if (!check.valid) {
        throw new Error(`Blocked redirect target (${check.reason})`);
      }
      currentHeaders = buildRedirectHopHeaders(currentHeaders, currentUrl, check.url, resolveReferer, options);
      currentUrl = check.url;
      continue;
    }
    return { resp, finalUrl: currentUrl };
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
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  return true;
}

async function handleApiProxy(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!applyStrictCorsHeaders(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, x-custom-content-type, x-custom-requested-with, x-custom-referer'
  );
  res.setHeader(
    'Access-Control-Expose-Headers',
    'X-Upstream-Status, X-Upstream-XFO, X-Upstream-CSP, X-Upstream-Content-Type, X-Upstream-Final-Url'
  );
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

    const safeAccept = sanitizeForwardHeaderValue(req.headers['accept'], 256);
    const headers: Record<string, string> = {
      'User-Agent': isMangaDex
        ? 'NyAnime/2.3 (https://mangadex.org)'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: safeAccept || 'application/json, text/plain, */*'
    };

    if (!isMangaDex) {
      const rawCustomRef = sanitizeForwardHeaderValue(req.headers['x-custom-referer'], 512);
      const customRefCheck = rawCustomRef ? validateProxyTargetUrl(rawCustomRef) : null;
      if (customRefCheck && customRefCheck.valid) {
        headers['Referer'] = customRefCheck.url.toString();
        headers['Origin'] = customRefCheck.url.origin;
      } else if (
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
    const customCt = sanitizeForwardHeaderValue(req.headers['x-custom-content-type'], 160);
    const reqCt = sanitizeForwardHeaderValue(req.headers['content-type'], 160);
    if (customCt) {
      headers['Content-Type'] = customCt;
    } else if (reqCt) {
      headers['Content-Type'] = reqCt;
    }
    const reqWith = sanitizeForwardHeaderValue(req.headers['x-custom-requested-with'], 128);
    if (reqWith) {
      headers['X-Requested-With'] = reqWith;
    }

    let bodyData: Uint8Array | undefined;
    let bodyText = '';
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
      bodyText = buf.toString('utf8');
    }

    const isProbe = parsed.searchParams.get('probe') === '1';
    const bypassCache = shouldBypassProxyCache(targetUrl) || parsed.searchParams.get('nocache') === '1';
    const cacheKey = `${req.method || 'GET'}::${targetUrl.toString()}::${bodyText}`;
    if (!bypassCache && !isProbe) {
      const cachedEntry = proxyResponseCache.get(cacheKey);
      if (cachedEntry) {
        res.setHeader('Content-Type', cachedEntry.contentType);
        res.setHeader('Cache-Control', 'public, max-age=120');
        res.statusCode = 200;
        res.end(cachedEntry.buffer);
        return;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14_000);
    const unbindAbort = bindClientDisconnectAbort(req, res, controller, () => clearTimeout(timer));
    let upstream: Response;
    let finalUrl: URL;
    let payload: Buffer;
    try {
      const result = await fetchWithValidatedRedirects(targetUrl, {
        method: req.method || 'GET',
        headers,
        body: bodyData as BodyInit | undefined,
        signal: controller.signal
      }, 4);
      upstream = result.resp;
      finalUrl = result.finalUrl;
      payload = await readUpstreamWithLimit(upstream, MAX_API_PROXY_BYTES);
    } finally {
      clearTimeout(timer);
      unbindAbort();
    }

    if (res.writableEnded || res.destroyed) return;

    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    if (!bypassCache && !isProbe && upstream.status === 200 && payload.byteLength > 0 && payload.byteLength < 512_000) {
      proxyResponseCache.set(cacheKey, { buffer: payload, contentType }, PROXY_CACHE_TTL_MS);
    }

    res.setHeader('X-Upstream-Status', String(upstream.status));
    if (isProbe) {
      const xfo = sanitizeForwardHeaderValue(upstream.headers.get('x-frame-options'), 256);
      const csp = sanitizeForwardHeaderValue(upstream.headers.get('content-security-policy'), 512);
      if (xfo) res.setHeader('X-Upstream-XFO', xfo);
      if (csp) res.setHeader('X-Upstream-CSP', csp);
      res.setHeader('X-Upstream-Content-Type', sanitizeForwardHeaderValue(contentType, 160));
      res.setHeader('X-Upstream-Final-Url', sanitizeForwardHeaderValue(finalUrl.toString(), 512));
    }
    if (isProbe && upstream.status >= 400) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 200;
      res.end(payload.byteLength > 0 ? payload.subarray(0, 32_768) : '');
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', bypassCache || isProbe ? 'no-store' : 'public, max-age=120');
    res.statusCode = upstream.status;
    res.end(payload);
  } catch (err) {
    if (res.writableEnded || res.destroyed) return;
    const isProbe = Boolean(req.url && req.url.includes('probe=1'));
    res.setHeader('X-Upstream-Status', '502');
    res.statusCode = isProbe ? 200 : 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(isProbe ? '' : JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
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
    const timer = setTimeout(() => controller.abort(), 14_000);
    const unbindAbort = bindClientDisconnectAbort(req, res, controller, () => clearTimeout(timer));
    let upstream: Response;
    let payload: Buffer;
    try {
      const result = await fetchWithValidatedRedirects(targetUrl, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      upstream = result.resp;
      if (!upstream.ok) {
        await upstream.body?.cancel().catch(() => {});
        if (!res.writableEnded && !res.destroyed) {
          res.statusCode = upstream.status;
          res.end();
        }
        return;
      }
      payload = await readUpstreamWithLimit(upstream, MAX_IMG_PROXY_BYTES);
    } finally {
      clearTimeout(timer);
      unbindAbort();
    }

    if (res.writableEnded || res.destroyed) return;
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.statusCode = 200;
    res.end(payload);
  } catch {
    if (!res.writableEnded && !res.destroyed && !res.headersSent) {
      res.statusCode = 502;
      res.end();
    }
  }
}

async function handleVideoProxy(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!applyStrictCorsHeaders(req, res)) return;
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Accept-Ranges, Content-Type, X-Upstream-Status, X-Video-Probe-Ok'
  );
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
  const connectTimer = setTimeout(() => abortCtrl.abort(), 15_000);
  let activeNodeStream: Readable | null = null;
  let activeUpstreamBody: ReadableStream<Uint8Array> | null = null;
  const unbindAbort = bindClientDisconnectAbort(req, res, abortCtrl, () => {
    clearTimeout(connectTimer);
    if (activeNodeStream && !activeNodeStream.destroyed) {
      activeNodeStream.destroy();
    } else if (activeUpstreamBody) {
      activeUpstreamBody.cancel().catch(() => {});
    }
  });

  let isProbe = false;
  try {
    const parsed = new URL(req.url || '/', 'http://localhost:3000');
    isProbe = parsed.searchParams.get('probe') === '1';
    const rawTarget = parsed.searchParams.get('url') || '';
    const rawRefererParam = parsed.searchParams.get('referer');
    const validation = validateProxyTargetUrl(rawTarget);
    if (!validation.valid) {
      clearTimeout(connectTimer);
      unbindAbort();
      if (isProbe) {
        res.setHeader('X-Upstream-Status', String(validation.status));
        res.setHeader('X-Video-Probe-Ok', '0');
        res.statusCode = 200;
        res.end();
        return;
      }
      res.statusCode = validation.status;
      res.end(validation.reason);
      return;
    }

    const targetUrl = validation.url;
    const refererResolver = (u: URL) => resolveValidatedVideoReferer(u, rawRefererParam);
    const referer = refererResolver(targetUrl);
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: '*/*',
      Referer: referer,
      Origin: (() => {
        try {
          return new URL(referer).origin;
        } catch {
          return referer.replace(/\/$/, '');
        }
      })()
    };
    const isDownload = parsed.searchParams.get('download') === '1';
    const cappedRange = capStreamingRangeHeader(
      typeof req.headers['range'] === 'string' ? req.headers['range'] : undefined,
      isDownload
    );
    if (cappedRange) {
      headers['Range'] = cappedRange;
    }

    const { resp: upstream, finalUrl } = await fetchWithValidatedRedirects(
      targetUrl,
      {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
        signal: abortCtrl.signal
      },
      5,
      refererResolver,
      { preserveVideoReferer: true }
    );
    clearTimeout(connectTimer);

    res.setHeader('X-Upstream-Status', String(upstream.status));
    if (!upstream.ok && upstream.status !== 206) {
      await upstream.body?.cancel().catch(() => {});
      unbindAbort();
      if (!res.writableEnded && !res.destroyed) {
        if (isProbe) {
          const payload = JSON.stringify({ ok: false, status: upstream.status });
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Video-Probe-Ok', '0');
          res.statusCode = 200;
          res.end(payload);
          return;
        }
        res.statusCode = upstream.status;
        res.end();
      }
      return;
    }

    const rawCt = (upstream.headers.get('content-type') || '').toLowerCase();
    const lowerPath = finalUrl.pathname.toLowerCase();
    const lowerHost = finalUrl.hostname.toLowerCase();
    const isHlsManifest =
      rawCt.includes('mpegurl') ||
      rawCt.includes('x-mpegurl') ||
      lowerPath.endsWith('.m3u8') ||
      lowerPath.includes('/m3u8/');

    if (isHlsManifest && req.method !== 'HEAD') {
      const manifestBuf = await readUpstreamWithLimit(upstream, MAX_API_PROXY_BYTES);
      unbindAbort();
      if (res.writableEnded || res.destroyed) return;
      const manifestText = manifestBuf.toString('utf8');
      if (isProbe) {
        const validM3u = manifestText.includes('#EXTM3U');
        const payload = JSON.stringify({ ok: validM3u, status: upstream.status, type: 'hls' });
        res.setHeader('X-Video-Probe-Ok', validM3u ? '1' : '0');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 200;
        res.end(payload);
        return;
      }
      const rewritten = rewriteHlsManifestUrls(manifestText, finalUrl.toString(), rawRefererParam);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 200;
      res.end(rewritten);
      return;
    }

    const isDisguisedVideoSegment =
      ((lowerHost === 'dotanborito.net' || lowerHost.endsWith('.dotanborito.net')) && lowerPath.includes('/segs/')) ||
      ((lowerHost === 'zilla-networks.com' || lowerHost.endsWith('.zilla-networks.com')) && lowerPath.includes('/segs/')) ||
      lowerHost === 'playmudos.com' ||
      lowerHost.endsWith('.playmudos.com');

    if (!isDisguisedVideoSegment && (rawCt.includes('text/html') || rawCt.includes('application/xhtml'))) {
      await upstream.body?.cancel().catch(() => {});
      unbindAbort();
      if (!res.writableEnded && !res.destroyed) {
        if (isProbe) {
          const payload = JSON.stringify({ ok: false, status: upstream.status, reason: 'html' });
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Video-Probe-Ok', '0');
          res.statusCode = 200;
          res.end(payload);
          return;
        }
        res.statusCode = 502;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Upstream returned HTML error page instead of video stream');
      }
      return;
    }

    const mime = rawCt.includes('video/')
      ? rawCt
      : lowerPath.endsWith('.webm')
        ? 'video/webm'
        : lowerPath.endsWith('.ts')
          ? 'video/mp2t'
          : 'video/mp4';

    if (isProbe) {
      await upstream.body?.cancel().catch(() => {});
      unbindAbort();
      const payload = JSON.stringify({ ok: true, status: upstream.status, contentType: mime });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Video-Probe-Ok', '1');
      res.statusCode = 200;
      res.end(payload);
      return;
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    if (isDownload) {
      const safeFile = sanitizeDownloadFilename(parsed.searchParams.get('filename') || '', 'nyanime_episodio.mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFile}"`);
    }
    for (const h of ['content-length', 'content-range', 'etag', 'last-modified']) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }

    res.statusCode = upstream.status === 206 ? 206 : 200;
    if (req.method === 'HEAD' || !upstream.body) {
      unbindAbort();
      res.end();
      return;
    }

    if (abortCtrl.signal.aborted || res.destroyed) {
      await upstream.body.cancel().catch(() => {});
      unbindAbort();
      return;
    }

    res.flushHeaders();
    activeUpstreamBody = upstream.body;
    const nodeStream = Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream<Uint8Array>);
    activeNodeStream = nodeStream;
    nodeStream.on('end', unbindAbort);
    nodeStream.on('close', unbindAbort);
    nodeStream.on('error', () => {
      unbindAbort();
      if (!res.writableEnded) res.end();
    });
    nodeStream.pipe(res);
  } catch {
    clearTimeout(connectTimer);
    unbindAbort();
    if (!res.headersSent && !res.writableEnded && !res.destroyed) {
      if (isProbe) {
        const payload = JSON.stringify({ ok: false, status: 502 });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Upstream-Status', '502');
        res.setHeader('X-Video-Probe-Ok', '0');
        res.statusCode = 200;
        res.end(payload);
        return;
      }
      res.statusCode = 502;
      res.end();
    }
  }
}

function serveStaticFile(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): void {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end('Bad Request');
    return;
  }

  const normalizedRel = path.posix.normalize(decodedPath).replace(/^\/+/, '');
  const safePath = normalizedRel === '' || normalizedRel === '.' ? 'index.html' : normalizedRel;
  let filePath = path.resolve(DIST_DIR, safePath);

  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end('Forbidden');
    return;
  }

  const existsAsFile = fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory();
  if (!existsAsFile) {
    // STRICT RULE: Never serve index.html when a static asset (/assets/*, .css, .js, .svg, .json, etc.) is missing
    if (isStaticAssetPath(decodedPath)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end('Not Found');
      return;
    }

    // SPA fallback strictly for client navigation routes
    filePath = path.join(DIST_DIR, 'index.html');
    if (!fs.existsSync(filePath)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end('dist/index.html not built. Run npm run build first.');
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const raw = fs.readFileSync(filePath);

  res.setHeader('Content-Type', mime);
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (ext === '.html' || NO_STORE_FILES.has(baseName)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }

  const acceptEnc = String(req.headers['accept-encoding'] || '');
  const compressible =
    mime.startsWith('text/') || mime.includes('javascript') || mime.includes('json') || mime.includes('svg');
  if (compressible && /\bgzip\b/i.test(acceptEnc) && raw.byteLength > 1024) {
    const gzipped = zlib.gzipSync(raw);
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Length', String(gzipped.byteLength));
    res.statusCode = 200;
    res.end(req.method === 'HEAD' ? undefined : gzipped);
    return;
  }

  res.setHeader('Content-Length', String(raw.byteLength));
  res.statusCode = 200;
  res.end(req.method === 'HEAD' ? undefined : raw);
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
    if (await handleFeatureApiRoutes(req, res, urlObj)) {
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
