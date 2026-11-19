import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import {
  buildVideoDownloadProxyUrl,
  createIpRateLimiter,
  isDomainAllowlisted,
  isPrivateOrReservedHost,
  resolveVideoStreamReferer,
  rewriteHlsManifestUrls,
  sanitizeDownloadFilename,
  validateIncomingRequestOrigin,
  validateProxyTargetUrl
} from '../utils/proxySecurity.ts';
import { createAppServer } from '../../server.ts';

describe('proxySecurity - Anti-SSRF & Allowlist', () => {
  it('blocks loopback, link-local, AWS/GCP metadata and RFC1918 private IPs', () => {
    const blockedUrls = [
      'http://127.0.0.1:3000/secret',
      'http://localhost:3000/',
      'http://sub.localhost/test',
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://10.0.0.5/admin',
      'http://172.16.0.1/status',
      'http://172.31.255.254/',
      'http://192.168.1.1/router',
      'http://[::1]:8080/',
      'http://[::ffff:127.0.0.1]/',
      'http://2130706433/',
      'http://0x7f000001/',
      'http://[fe80::1]/'
    ];

    for (const url of blockedUrls) {
      const res = validateProxyTargetUrl(url);
      expect(res.valid, `Expected ${url} to be blocked`).toBe(false);
      if (!res.valid) {
        expect(res.status).toBe(403);
      }
    }
  });

  it('blocks non-HTTP protocols and URL credentials', () => {
    expect(validateProxyTargetUrl('file:///etc/passwd')).toEqual({
      valid: false,
      reason: 'Disallowed protocol: file:',
      status: 403
    });
    expect(validateProxyTargetUrl('ftp://files.example.com/a')).toEqual({
      valid: false,
      reason: 'Disallowed protocol: ftp:',
      status: 403
    });
    expect(validateProxyTargetUrl('javascript:alert(1)')).toEqual({
      valid: false,
      reason: 'Disallowed protocol: javascript:',
      status: 403
    });
    expect(validateProxyTargetUrl('https://user:pass@api.mangadex.org/manga')).toEqual({
      valid: false,
      reason: 'Credentials in URL are not allowed',
      status: 403
    });
    expect(validateProxyTargetUrl('')).toEqual({
      valid: false,
      reason: 'Missing target url',
      status: 400
    });
    expect(validateProxyTargetUrl('not a valid url')).toEqual({
      valid: false,
      reason: 'Malformed target url',
      status: 400
    });
  });

  it('blocks non-allowlisted public domains to prevent open proxy abuse', () => {
    const res = validateProxyTargetUrl('https://evil-attacker.example.com/steal');
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.status).toBe(403);
      expect(res.reason).toContain('allowlist');
    }
  });

  it('allows legitimate anime/manga APIs and image/video CDNs', () => {
    const validUrls = [
      'https://api.mangadex.org/manga?title=solo+leveling',
      'https://uploads.mangadex.org/covers/abc/def.jpg',
      'https://cmdxd98sb0x3yprd.mangadex.network/data/hash/1.png',
      'https://api.jikan.moe/v4/users/test/animelist',
      'https://graphql.anilist.co',
      'https://inmanga.com/chapter/get?id=1',
      'https://cdn.readdetectiveconan.com/file/mangap/1.jpg',
      'https://jkanime.net/solo-leveling/1/',
      'https://jkanime.one/ver/jujutsu-kaisen-tv/1',
      'https://ww1.henaojara.net/ver/jujutsu-kaisen-1',
      'https://tvanime.tv/anime/bleach/episodio/episodio-1',
      'https://flaswish.com/e/abc123',
      'https://dhcplay.com/f/abc123',
      'https://a4.mp4upload.com:183/d/abc/video.mp4',
      'https://s216.vidcache.net:8166/play/abc/video.mp4',
      'https://archive.org/download/ane-wa-yanmama-junyuu-chuu-1_202602/ane-wa-yanmama-junyuu-chuu-1.mp4',
      'https://ia801401.us.archive.org/15/items/ane-wa-yanmama-junyuu-chuu-1_202602/ane-wa-yanmama-junyuu-chuu-1.mp4'
    ];

    for (const url of validUrls) {
      const res = validateProxyTargetUrl(url);
      expect(res.valid, `Expected ${url} to be allowed`).toBe(true);
    }

    expect(resolveVideoStreamReferer(new URL('https://a4.mp4upload.com:183/d/abc/video.mp4'))).toBe(
      'https://www.mp4upload.com/'
    );
    expect(resolveVideoStreamReferer(new URL('https://s216.vidcache.net:8166/play/abc/video.mp4'))).toBe(
      'https://www.yourupload.com/'
    );
    expect(
      resolveVideoStreamReferer(
        new URL('https://archive.org/download/ane-wa-yanmama-junyuu-chuu-1_202602/ane-wa-yanmama-junyuu-chuu-1.mp4')
      )
    ).toBe('https://archive.org/');
  });

  it('detects private hosts and allowlist wildcards accurately', () => {
    expect(isPrivateOrReservedHost('172.15.0.1')).toBe(false);
    expect(isPrivateOrReservedHost('172.16.5.1')).toBe(true);
    expect(isDomainAllowlisted('api.mangadex.org')).toBe(true);
    expect(isDomainAllowlisted('fakemangadex.org')).toBe(false);
  });

  it('enforces per-IP sliding/fixed window rate limiting', () => {
    const limiter = createIpRateLimiter({ windowMs: 1000, maxRequests: 2 });
    const d1 = limiter.check('1.2.3.4', 100);
    const d2 = limiter.check('1.2.3.4', 200);
    const d3 = limiter.check('1.2.3.4', 300);
    const otherIp = limiter.check('5.6.7.8', 300);
    const afterReset = limiter.check('1.2.3.4', 1200);

    expect(d1.allowed).toBe(true);
    expect(d1.remaining).toBe(1);
    expect(d2.allowed).toBe(true);
    expect(d2.remaining).toBe(0);
    expect(d3.allowed).toBe(false);
    expect(otherIp.allowed).toBe(true);
    expect(afterReset.allowed).toBe(true);
  });

  it('sanitizes download filenames, rewrites HLS manifests, and validates incoming CORS origins', () => {
    expect(sanitizeDownloadFilename('Attack on Titan: S1E1 / Inicio?')).toBe('Attack_on_Titan_S1E1_Inicio.mp4');
    expect(sanitizeDownloadFilename('Solo_Leveling_Ep_05.mp4')).toBe('Solo_Leveling_Ep_05.mp4');

    const fromRaw = buildVideoDownloadProxyUrl(
      'https://a4.mp4upload.com:183/d/abc/video.mp4',
      'Jujutsu Kaisen - S1E1.mp4'
    );
    expect(fromRaw).toBe(
      '/api/video-proxy?url=https%3A%2F%2Fa4.mp4upload.com%3A183%2Fd%2Fabc%2Fvideo.mp4&download=1&filename=Jujutsu_Kaisen_-_S1E1.mp4'
    );

    const fromExistingProxy = buildVideoDownloadProxyUrl(
      '/api/video-proxy?url=https%3A%2F%2Fs216.vidcache.net%3A8166%2Fplay%2Fabc%2Fvideo.mp4',
      'Bleach Ep 1'
    );
    expect(fromExistingProxy).toBe(
      '/api/video-proxy?url=https%3A%2F%2Fs216.vidcache.net%3A8166%2Fplay%2Fabc%2Fvideo.mp4&download=1&filename=Bleach_Ep_1.mp4'
    );

    const hls = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nseg1.ts';
    const rewritten = rewriteHlsManifestUrls(hls, 'https://cdn.flaswish.com/hls/master.m3u8');
    expect(rewritten).toContain('URI="/api/video-proxy?url=https%3A%2F%2Fcdn.flaswish.com%2Fhls%2Fkey.bin"');
    expect(rewritten).toContain('/api/video-proxy?url=https%3A%2F%2Fcdn.flaswish.com%2Fhls%2Fseg1.ts');

    expect(validateIncomingRequestOrigin({ host: 'localhost:3000', origin: 'https://evil.com' }).allowed).toBe(false);
    expect(validateIncomingRequestOrigin({ host: 'nyanime.run.app', origin: 'https://nyanime.run.app' }).allowed).toBe(true);
  });

  describe('server.ts HTTP endpoint SSRF & CORS enforcement', () => {
    let srv: http.Server;
    let baseUrl = '';

    beforeAll(async () => {
      srv = createAppServer();
      await new Promise<void>((resolve) => {
        srv.listen(0, '127.0.0.1', () => {
          const addr = srv.address();
          if (addr && typeof addr !== 'string') {
            baseUrl = `http://127.0.0.1:${addr.port}`;
          }
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    });

    it('rejects private/disallowed targets on /api/proxy, /api/img-proxy, and /api/video-proxy', async () => {
      const endpoints = ['/api/proxy', '/api/img-proxy', '/api/video-proxy'];
      const badTargets = [
        { url: 'http://127.0.0.1:3000/', expected: 403 },
        { url: 'http://169.254.169.254/latest/meta-data/', expected: 403 },
        { url: 'http://10.0.0.1/', expected: 403 },
        { url: 'http://192.168.1.1/', expected: 403 },
        { url: 'http://172.16.0.1/', expected: 403 },
        { url: 'file:///etc/passwd', expected: 403 },
        { url: 'ftp://example.com/a', expected: 403 },
        { url: 'https://evil.example.org/', expected: 403 },
        { url: '', expected: 400 }
      ];

      for (const ep of endpoints) {
        for (const t of badTargets) {
          const r = await fetch(`${baseUrl}${ep}?url=${encodeURIComponent(t.url)}`);
          expect(r.status, `${ep} ${t.url}`).toBe(t.expected);
        }
      }
    });

    it('serves built dist/index.html, CSS/JS with exact MIME & Cache-Control, and returns 404 for missing static assets', async () => {
      const rootRes = await fetch(`${baseUrl}/`);
      expect(rootRes.status).toBe(200);
      expect(rootRes.headers.get('content-type')).toContain('text/html');
      expect(rootRes.headers.get('cache-control')).toBe('no-cache, no-store, must-revalidate');
      const html = await rootRes.text();
      expect(html).not.toContain('/src/main.ts');

      const cssMatch = html.match(/href="(\/assets\/index-[^"]+\.css)"/);
      const jsMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
      expect(cssMatch?.[1]).toBeTruthy();
      expect(jsMatch?.[1]).toBeTruthy();
      expect(html).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+crossorigin[^>]+href="\/assets\//i);
      expect(html).not.toMatch(/<script[^>]+type="module"[^>]+crossorigin[^>]+src="\/assets\//i);

      const cssRes = await fetch(`${baseUrl}${cssMatch![1]}`);
      expect(cssRes.status).toBe(200);
      expect(cssRes.headers.get('content-type')).toBe('text/css; charset=utf-8');
      expect(cssRes.headers.get('cache-control')).toContain('immutable');
      const cssBody = await cssRes.text();
      expect(cssBody.length).toBeGreaterThan(5000);
      expect(cssBody.trim().startsWith('<!DOCTYPE')).toBe(false);

      const jsRes = await fetch(`${baseUrl}${jsMatch![1]}`);
      expect(jsRes.status).toBe(200);
      expect(jsRes.headers.get('content-type')).toBe('application/javascript; charset=utf-8');
      expect(jsRes.headers.get('cache-control')).toContain('immutable');
      const jsBody = await jsRes.text();
      expect(jsBody.length).toBeGreaterThan(10000);
      expect(jsBody.trim().startsWith('<!DOCTYPE')).toBe(false);

      // Strict SPA rule: missing static assets MUST return 404, never index.html
      for (const missingPath of ['/assets/no-existe.css', '/assets/no-existe.js', '/missing-icon.svg', '/missing.json', '/missing.webmanifest']) {
        const missRes = await fetch(`${baseUrl}${missingPath}`);
        expect(missRes.status, missingPath).toBe(404);
        expect(missRes.headers.get('content-type')).not.toContain('text/html');
      }

      // Non-asset SPA client route still falls back to dist/index.html
      const spaRes = await fetch(`${baseUrl}/anime/21355`);
      expect(spaRes.status).toBe(200);
      expect(spaRes.headers.get('content-type')).toContain('text/html');

      // SW & manifest must never be cached aggressively
      for (const noStorePath of ['/sw.js', '/sw-push.js', '/firebase-messaging-sw.js', '/manifest.webmanifest']) {
        const nsRes = await fetch(`${baseUrl}${noStorePath}`);
        expect(nsRes.status, noStorePath).toBe(200);
        expect(nsRes.headers.get('cache-control'), noStorePath).toBe('no-cache, no-store, must-revalidate');
      }
    });
  });
});


