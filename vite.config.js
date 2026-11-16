import { Readable } from 'node:stream';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
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

function nyanimeServerProxyPlugin() {
  const apiLimiter = createIpRateLimiter({ windowMs: 60_000, maxRequests: 600 });
  const imgLimiter = createIpRateLimiter({ windowMs: 60_000, maxRequests: 600 });
  const videoLimiter = createIpRateLimiter({ windowMs: 60_000, maxRequests: 600 });
  const proxyResponseCache = new Map();
  const PROXY_CACHE_TTL_MS = 5 * 60 * 1000;

  const getIp = (req) => {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
    return req.socket?.remoteAddress || '127.0.0.1';
  };

  const fetchSafeRedirects = async (initialUrl, init, maxHops = 3) => {
    let curr = initialUrl;
    for (let hop = 0; hop <= maxHops; hop++) {
      const resp = await fetch(curr.toString(), { ...init, redirect: 'manual' });
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location');
        if (!loc) return resp;
        const nextUrl = new URL(loc, curr).toString();
        const check = validateProxyTargetUrl(nextUrl);
        if (!check.valid) throw new Error(`Blocked redirect (${check.reason})`);
        curr = check.url;
        continue;
      }
      return resp;
    }
    throw new Error('Too many redirects');
  };

  const applyStrictCors = (req, res) => {
    const check = validateIncomingRequestOrigin(req.headers || {});
    res.setHeader('Vary', 'Origin');
    if (!check.allowed) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: check.reason }));
      return false;
    }
    if (check.corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', check.corsOrigin);
    }
    return true;
  };

  const attachMiddleware = (middlewares) => {
    middlewares.use('/api/proxy', async (req, res) => {
      if (!applyStrictCors(req, res)) return;
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, x-custom-content-type, x-custom-requested-with');
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (!apiLimiter.check(getIp(req)).allowed) {
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Too many requests' }));
        return;
      }

      try {
        const parsed = new URL(req.url, 'http://localhost:3000');
        const targetUrl = parsed.searchParams.get('url') || '';
        const check = validateProxyTargetUrl(targetUrl);
        if (!check.valid) {
          res.statusCode = check.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: check.reason }));
          return;
        }

        const safeUrl = check.url;
        const isMangaDex = safeUrl.hostname.endsWith('mangadex.org') || safeUrl.hostname.endsWith('mangadex.network');

        const headers = {
          'User-Agent': isMangaDex
            ? 'NyAnime/2.3 (https://mangadex.org)'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': req.headers['accept'] || 'application/json, text/plain, */*'
        };

        if (!isMangaDex) {
          if (
            safeUrl.hostname.endsWith('manhwaweb.com') ||
            safeUrl.hostname.endsWith('img1mw.xyz') ||
            safeUrl.hostname.endsWith('img2mw.xyz') ||
            safeUrl.hostname.endsWith('img3mw.xyz') ||
            safeUrl.hostname.endsWith('img4mw.xyz') ||
            safeUrl.hostname.endsWith('lezhin.com') ||
            safeUrl.hostname.endsWith('lezhincomics.com')
          ) {
            headers['Referer'] = 'https://manhwaweb.com/';
            headers['Origin'] = 'https://manhwaweb.com';
          } else {
            headers['Referer'] = safeUrl.origin + '/';
            headers['Origin'] = safeUrl.origin;
          }
        }
        if (req.headers['x-custom-content-type']) {
          headers['Content-Type'] = req.headers['x-custom-content-type'];
        } else if (req.headers['content-type']) {
          headers['Content-Type'] = req.headers['content-type'];
        }
        if (req.headers['x-custom-requested-with']) {
          headers['X-Requested-With'] = req.headers['x-custom-requested-with'];
        }

        let bodyData = undefined;
        if (req.method === 'POST') {
          bodyData = await new Promise((resolve, reject) => {
            const chunks = [];
            let bytes = 0;
            req.on('data', chunk => {
              bytes += chunk.byteLength;
              if (bytes > 1048576) {
                reject(new Error('Request body too large'));
                return;
              }
              chunks.push(chunk);
            });
            req.on('end', () => resolve(Buffer.concat(chunks)));
            req.on('error', reject);
          });
        }

        const cacheKey = `${req.method || 'GET'}::${safeUrl.toString()}::${bodyData ? bodyData.toString('utf8') : ''}`;
        const cachedEntry = proxyResponseCache.get(cacheKey);
        if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
          res.setHeader('Content-Type', cachedEntry.contentType);
          res.setHeader('Cache-Control', 'public, max-age=120');
          res.statusCode = 200;
          res.end(cachedEntry.buffer);
          return;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        const upstream = await fetchSafeRedirects(safeUrl, {
          method: req.method || 'GET',
          headers,
          body: bodyData,
          signal: controller.signal
        });
        clearTimeout(timer);

        const arrayBuf = await upstream.arrayBuffer();
        if (arrayBuf.byteLength > MAX_API_PROXY_BYTES) {
          res.statusCode = 413;
          res.end(JSON.stringify({ error: 'Upstream payload too large' }));
          return;
        }

        const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
        const outBuf = Buffer.from(arrayBuf);
        if (upstream.status === 200 && outBuf.byteLength > 0 && outBuf.byteLength < 512_000) {
          if (proxyResponseCache.size > 400) {
            const firstKey = proxyResponseCache.keys().next().value;
            if (firstKey) proxyResponseCache.delete(firstKey);
          }
          proxyResponseCache.set(cacheKey, {
            buffer: outBuf,
            contentType,
            expiresAt: Date.now() + PROXY_CACHE_TTL_MS
          });
        }

        const isProbe = parsed.searchParams.get('probe') === '1';
        res.setHeader('X-Upstream-Status', String(upstream.status));
        if (isProbe && upstream.status >= 400) {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.statusCode = 200;
          res.end('');
          return;
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=120');
        res.statusCode = upstream.status;
        res.end(outBuf);
      } catch (err) {
        const isProbe = req.url?.includes('probe=1');
        res.setHeader('X-Upstream-Status', '502');
        res.statusCode = isProbe ? 200 : 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(isProbe ? '' : JSON.stringify({ error: String(err?.message || err) }));
      }
    });

    middlewares.use('/api/img-proxy', async (req, res) => {
      if (!applyStrictCors(req, res)) return;
      if (!imgLimiter.check(getIp(req)).allowed) {
        res.statusCode = 429;
        res.end('Too many requests');
        return;
      }

      try {
        const parsed = new URL(req.url, 'http://localhost:3000');
        const targetUrl = parsed.searchParams.get('url') || '';
        const check = validateProxyTargetUrl(targetUrl);
        if (!check.valid) {
          res.statusCode = check.status;
          res.end(check.reason);
          return;
        }

        const safeUrl = check.url;
        const isMangaDex = safeUrl.hostname.endsWith('mangadex.org') || safeUrl.hostname.endsWith('mangadex.network');

        const headers = {
          'User-Agent': isMangaDex
            ? 'NyAnime/2.3 (https://mangadex.org)'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        };

        if (!isMangaDex) {
          if (
            safeUrl.hostname.endsWith('readdetectiveconan.com') ||
            safeUrl.hostname.endsWith('mangapill.com') ||
            safeUrl.pathname.includes('/mangap/')
          ) {
            headers['Referer'] = 'https://mangapill.com/';
          } else if (
            safeUrl.hostname.endsWith('manhwaweb.com') ||
            safeUrl.hostname.endsWith('img1mw.xyz') ||
            safeUrl.hostname.endsWith('img2mw.xyz') ||
            safeUrl.hostname.endsWith('img3mw.xyz') ||
            safeUrl.hostname.endsWith('img4mw.xyz') ||
            safeUrl.hostname.endsWith('toptoon.com') ||
            safeUrl.hostname.endsWith('lezhin.com') ||
            safeUrl.hostname.endsWith('lezhincomics.com')
          ) {
            headers['Referer'] = 'https://manhwaweb.com/';
            headers['Origin'] = 'https://manhwaweb.com';
          } else if (
            safeUrl.hostname.endsWith('webtoons.com') ||
            safeUrl.hostname.endsWith('pstatic.net') ||
            safeUrl.hostname.endsWith('naver.net')
          ) {
            headers['Referer'] = 'https://www.webtoons.com/';
          } else {
            headers['Referer'] = safeUrl.origin + '/';
          }
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 11000);
        const upstream = await fetchSafeRedirects(safeUrl, {
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

        const arrayBuf = await upstream.arrayBuffer();
        if (arrayBuf.byteLength > MAX_IMG_PROXY_BYTES) {
          res.statusCode = 413;
          res.end('Image exceeds max size');
          return;
        }

        const contentType = upstream.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        res.statusCode = 200;
        res.end(Buffer.from(arrayBuf));
      } catch {
        res.statusCode = 502;
        res.end();
      }
    });

    middlewares.use('/api/video-proxy', async (req, res) => {
      if (!applyStrictCors(req, res)) return;
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (!videoLimiter.check(getIp(req)).allowed) {
        res.statusCode = 429;
        res.end('Too many video requests');
        return;
      }

      const abortCtrl = new AbortController();
      const connectTimer = setTimeout(() => abortCtrl.abort(), 6500);
      res.on('close', () => {
        clearTimeout(connectTimer);
        abortCtrl.abort();
      });

      try {
        const parsed = new URL(req.url, 'http://localhost:3000');
        const targetUrl = parsed.searchParams.get('url') || '';
        const check = validateProxyTargetUrl(targetUrl);
        if (!check.valid) {
          clearTimeout(connectTimer);
          res.statusCode = check.status;
          res.end(check.reason);
          return;
        }

        const safeUrl = check.url;
        const referer = resolveVideoStreamReferer(safeUrl);
        const headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Referer': referer,
          'Origin': referer.replace(/\/$/, '')
        };
        if (typeof req.headers['range'] === 'string' && req.headers['range']) {
          headers['Range'] = req.headers['range'];
        }

        const upstream = await fetchSafeRedirects(safeUrl, {
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
          safeUrl.pathname.toLowerCase().endsWith('.m3u8');

        if (isHlsManifest && req.method !== 'HEAD') {
          const buf = Buffer.from(await upstream.arrayBuffer());
          if (buf.byteLength > MAX_API_PROXY_BYTES) {
            res.statusCode = 413;
            res.end('HLS manifest too large');
            return;
          }
          const rewritten = rewriteHlsManifestUrls(buf.toString('utf8'), safeUrl.toString());
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
          : safeUrl.pathname.endsWith('.webm')
            ? 'video/webm'
            : safeUrl.pathname.endsWith('.ts')
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

        const nodeStream = Readable.fromWeb(upstream.body);
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
    });
  };

  return {
    name: 'nyanime-server-proxy',
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    }
  };
}

export default defineConfig({
  plugins: [
    nyanimeServerProxyPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
      manifest: {
        id: '/',
        name: 'NyAnime TV',
        short_name: 'NyAnime',
        description: 'Streaming de Anime HD, Calendario de Emisión y Lector de Manga/Manhwa.',
        theme_color: '#050507',
        background_color: '#050507',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        globIgnores: ['assets/aistudio/**', 'assets/aistudio/**/*', 'legacy_archive/**', 'legacy_archive/**/*'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase-vendor';
          }
        }
      }
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  preview: {
    port: 3000,
    host: '0.0.0.0'
  }
});
