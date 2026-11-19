import { Readable } from 'node:stream';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
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

function nyanimeServerProxyPlugin() {
  const apiLimiter = createIpRateLimiter({ windowMs: 60_000, maxRequests: 600 });
  const imgLimiter = createIpRateLimiter({ windowMs: 60_000, maxRequests: 600 });
  const videoLimiter = createIpRateLimiter({ windowMs: 60_000, maxRequests: 600 });
  const PROXY_CACHE_TTL_MS = 5 * 60 * 1000;
  const proxyResponseCache = new LruTtlCache({
    maxEntries: 250,
    maxTotalBytes: 32 * 1024 * 1024,
    defaultTtlMs: PROXY_CACHE_TTL_MS,
    getSize: (entry) => entry.buffer.byteLength
  });

  const getIp = (req) => {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
    return req.socket?.remoteAddress || '127.0.0.1';
  };

  const bindClientDisconnectAbort = (req, res, abortCtrl, onAbort) => {
    let triggered = false;
    const triggerAbort = () => {
      if (triggered || res.writableFinished) return;
      triggered = true;
      abortCtrl.abort();
      if (onAbort) onAbort();
    };
    const onReqClose = () => {
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
  };

  const readUpstreamWithLimit = async (resp, maxBytes) => {
    const lenHeader = Number(resp.headers.get('content-length') || '0');
    if (lenHeader > maxBytes) {
      await resp.body?.cancel().catch(() => {});
      const err = new Error(`Upstream payload exceeds limit (${maxBytes} bytes)`);
      err.statusCode = 413;
      throw err;
    }
    if (!resp.body) {
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.byteLength > maxBytes) {
        const err = new Error(`Upstream payload exceeds limit (${maxBytes} bytes)`);
        err.statusCode = 413;
        throw err;
      }
      return buf;
    }
    const reader = resp.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          const err = new Error(`Upstream payload exceeds limit (${maxBytes} bytes)`);
          err.statusCode = 413;
          throw err;
        }
        chunks.push(Buffer.from(value));
      }
    }
    return Buffer.concat(chunks);
  };

  const fetchSafeRedirects = async (initialUrl, init, maxHops = 3, resolveReferer, options) => {
    let curr = initialUrl;
    let currentHeaders = { ...(init.headers || {}) };
    for (let hop = 0; hop <= maxHops; hop++) {
      const resp = await fetch(curr.toString(), { ...init, headers: currentHeaders, redirect: 'manual' });
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location');
        if (!loc) return { resp, finalUrl: curr };
        await resp.body?.cancel().catch(() => {});
        const nextUrl = new URL(loc, curr).toString();
        const check = validateProxyTargetUrl(nextUrl);
        if (!check.valid) throw new Error(`Blocked redirect (${check.reason})`);
        currentHeaders = buildRedirectHopHeaders(currentHeaders, curr, check.url, resolveReferer, options);
        curr = check.url;
        continue;
      }
      return { resp, finalUrl: curr };
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
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    return true;
  };

  const attachMiddleware = (middlewares) => {
    middlewares.use(async (req, res, next) => {
      try {
        const rawUrl = req.url || '/';
        if (!rawUrl.startsWith('/api/auth/') && !rawUrl.startsWith('/api/push/')) {
          next();
          return;
        }
        const urlObj = new URL(rawUrl, 'http://localhost:3000');
        const handled = await handleFeatureApiRoutes(req, res, urlObj);
        if (!handled) next();
      } catch (err) {
        next(err);
      }
    });

    middlewares.use('/api/proxy', async (req, res) => {
      if (!applyStrictCors(req, res)) return;
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

        const safeAccept = sanitizeForwardHeaderValue(req.headers['accept'], 256);
        const headers = {
          'User-Agent': isMangaDex
            ? 'NyAnime/2.3 (https://mangadex.org)'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': safeAccept || 'application/json, text/plain, */*'
        };

        if (!isMangaDex) {
          const rawCustomRef = sanitizeForwardHeaderValue(req.headers['x-custom-referer'], 512);
          const customRefCheck = rawCustomRef ? validateProxyTargetUrl(rawCustomRef) : null;
          if (customRefCheck && customRefCheck.valid) {
            headers['Referer'] = customRefCheck.url.toString();
            headers['Origin'] = customRefCheck.url.origin;
          } else if (
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

        const isProbe = parsed.searchParams.get('probe') === '1';
        const bypassCache = shouldBypassProxyCache(safeUrl) || parsed.searchParams.get('nocache') === '1';
        const cacheKey = `${req.method || 'GET'}::${safeUrl.toString()}::${bodyData ? bodyData.toString('utf8') : ''}`;
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
        const timer = setTimeout(() => controller.abort(), 14000);
        const unbindAbort = bindClientDisconnectAbort(req, res, controller, () => clearTimeout(timer));
        let upstream;
        let finalUrl;
        let outBuf;
        try {
          const result = await fetchSafeRedirects(safeUrl, {
            method: req.method || 'GET',
            headers,
            body: bodyData,
            signal: controller.signal
          }, 4);
          upstream = result.resp;
          finalUrl = result.finalUrl;
          outBuf = await readUpstreamWithLimit(upstream, MAX_API_PROXY_BYTES);
        } finally {
          clearTimeout(timer);
          unbindAbort();
        }

        if (res.writableEnded || res.destroyed) return;

        const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
        if (!bypassCache && !isProbe && upstream.status === 200 && outBuf.byteLength > 0 && outBuf.byteLength < 512_000) {
          proxyResponseCache.set(cacheKey, { buffer: outBuf, contentType }, PROXY_CACHE_TTL_MS);
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
          res.end(outBuf.byteLength > 0 ? outBuf.subarray(0, 32_768) : '');
          return;
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', bypassCache || isProbe ? 'no-store' : 'public, max-age=120');
        res.statusCode = upstream.status;
        res.end(outBuf);
      } catch (err) {
        if (res.writableEnded || res.destroyed) return;
        const isProbe = req.url?.includes('probe=1');
        res.setHeader('X-Upstream-Status', err?.statusCode === 413 ? '413' : '502');
        res.statusCode = isProbe ? 200 : (err?.statusCode === 413 ? 413 : 502);
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
        const timer = setTimeout(() => controller.abort(), 14000);
        const unbindAbort = bindClientDisconnectAbort(req, res, controller, () => clearTimeout(timer));
        let upstream;
        let imgBuf;
        try {
          const result = await fetchSafeRedirects(safeUrl, {
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
          imgBuf = await readUpstreamWithLimit(upstream, MAX_IMG_PROXY_BYTES);
        } finally {
          clearTimeout(timer);
          unbindAbort();
        }

        if (res.writableEnded || res.destroyed) return;
        const contentType = upstream.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        res.statusCode = 200;
        res.end(imgBuf);
      } catch (err) {
        if (!res.writableEnded && !res.destroyed && !res.headersSent) {
          res.statusCode = err?.statusCode === 413 ? 413 : 502;
          res.end();
        }
      }
    });

    middlewares.use('/api/video-proxy', async (req, res) => {
      if (!applyStrictCors(req, res)) return;
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

      if (!videoLimiter.check(getIp(req)).allowed) {
        res.statusCode = 429;
        res.end('Too many video requests');
        return;
      }

      const abortCtrl = new AbortController();
      const connectTimer = setTimeout(() => abortCtrl.abort(), 15000);
      let activeNodeStream = null;
      let activeUpstreamBody = null;
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
        const parsed = new URL(req.url, 'http://localhost:3000');
        isProbe = parsed.searchParams.get('probe') === '1';
        const targetUrl = parsed.searchParams.get('url') || '';
        const rawRefererParam = parsed.searchParams.get('referer');
        const check = validateProxyTargetUrl(targetUrl);
        if (!check.valid) {
          clearTimeout(connectTimer);
          unbindAbort();
          if (isProbe) {
            res.setHeader('X-Upstream-Status', String(check.status));
            res.setHeader('X-Video-Probe-Ok', '0');
            res.statusCode = 200;
            res.end();
            return;
          }
          res.statusCode = check.status;
          res.end(check.reason);
          return;
        }

        const safeUrl = check.url;
        const refererResolver = (u) => resolveValidatedVideoReferer(u, rawRefererParam);
        const referer = refererResolver(safeUrl);
        let refOrigin = referer.replace(/\/$/, '');
        try {
          refOrigin = new URL(referer).origin;
        } catch {
          // keep fallback
        }
        const headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Referer': referer,
          'Origin': refOrigin
        };
        const isDownload = parsed.searchParams.get('download') === '1';
        const cappedRange = capStreamingRangeHeader(
          typeof req.headers['range'] === 'string' ? req.headers['range'] : undefined,
          isDownload
        );
        if (cappedRange) {
          headers['Range'] = cappedRange;
        }

        const { resp: upstream, finalUrl } = await fetchSafeRedirects(
          safeUrl,
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
          const buf = await readUpstreamWithLimit(upstream, MAX_API_PROXY_BYTES);
          unbindAbort();
          if (res.writableEnded || res.destroyed) return;
          const manifestText = buf.toString('utf8');
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
        const nodeStream = Readable.fromWeb(upstream.body);
        activeNodeStream = nodeStream;
        nodeStream.on('end', unbindAbort);
        nodeStream.on('close', unbindAbort);
        nodeStream.on('error', () => {
          unbindAbort();
          if (!res.writableEnded) res.end();
        });
        nodeStream.pipe(res);
      } catch (err) {
        clearTimeout(connectTimer);
        unbindAbort();
        if (!res.headersSent && !res.writableEnded && !res.destroyed) {
          if (isProbe) {
            const st = err?.statusCode === 413 ? 413 : 502;
            const payload = JSON.stringify({ ok: false, status: st });
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Upstream-Status', String(st));
            res.setHeader('X-Video-Probe-Ok', '0');
            res.statusCode = 200;
            res.end(payload);
            return;
          }
          res.statusCode = err?.statusCode === 413 ? 413 : 502;
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

function nyanimeNoHmrReloadPlugin() {
  const inertViteClient = `import "/@vite/env";
const sheetsMap = new Map();
if ("document" in globalThis) {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    decline() {},
    on() {},
    off() {},
    send() {},
    get data() { return {}; }
  };
}
export function injectQuery(url) {
  return url;
}
export const ErrorOverlay = typeof HTMLElement !== "undefined" ? class ErrorOverlay extends HTMLElement {} : class ErrorOverlay {};
`;
  return {
    name: 'nyanime-no-hmr-reload',
    enforce: 'post',
    configureServer(server) {
      server.middlewares.use('/@vite/client', (_req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(inertViteClient);
      });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx?.server) {
          return html.replace(/<script id="vite-plugin-pwa:register-dev-sw"[\s\S]*?<\/script>/i, '');
        }
        // In production builds behind auth-proxied previews (e.g. Cloud Run / AI Studio Shared App),
        // Vite's bare `crossorigin` ("anonymous") on same-origin `/assets/*` tags strips session cookies
        // (and makes Vite's modulepreload polyfill use credentials: "omit"), causing CSS & JS to fail even in Incognito.
        return html
          .replace(/(<link\b[^>]*?\brel="(?:stylesheet|modulepreload)"[^>]*?)\s+crossorigin(?:="anonymous")?([^>]*?\bhref="\/assets\/)/gi, '$1$2')
          .replace(/(<script\b[^>]*?\btype="module"[^>]*?)\s+crossorigin(?:="anonymous")?([^>]*?\bsrc="\/assets\/)/gi, '$1$2');
      }
    }
  };
}

export default defineConfig(({ command }) => {
  const isBuild = command === 'build';
  return {
    plugins: [
      nyanimeServerProxyPlugin(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png', 'sw-push.js'],
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
          importScripts: ['/sw-push.js'],
          globPatterns: ['**/*.{js,css,ico,png,svg,woff,woff2}'],
          globIgnores: ['index.html', 'assets/aistudio/**', 'assets/aistudio/**/*', 'legacy_archive/**', 'legacy_archive/**/*'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) =>
                request.mode === 'navigate' &&
                !url.pathname.startsWith('/api/') &&
                !url.pathname.startsWith('/assets/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'html-nav-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 5,
                  maxAgeSeconds: 60 * 60 * 24
                },
                cacheableResponse: {
                  statuses: [200]
                }
              }
            },
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
          enabled: false
        }
      }),
      nyanimeNoHmrReloadPlugin()
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
      host: '0.0.0.0',
      hmr: false
    },
    preview: {
      port: 3000,
      host: '0.0.0.0'
    }
  };
});
