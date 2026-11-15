export const MAX_API_PROXY_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMG_PROXY_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_PROXY_DOMAINS: readonly string[] = [
  'mangadex.org',
  '*.mangadex.org',
  '*.mangadex.network',
  'inmanga.com',
  '*.inmanga.com',
  '*.intomanga.com',
  'mangapill.com',
  '*.mangapill.com',
  'readdetectiveconan.com',
  '*.readdetectiveconan.com',
  'jkanime.net',
  '*.jkanime.net',
  'jkanime.one',
  '*.jkanime.one',
  'ww1.henaojara.net',
  '*.henaojara.net',
  'animejara.com',
  '*.animejara.com',
  'ani.zip',
  '*.ani.zip',
  'jikan.moe',
  '*.jikan.moe',
  'anilist.co',
  '*.anilist.co',
  'myanimelist.net',
  '*.myanimelist.net',
  'animeflv.net',
  '*.animeflv.net',
  'tioanime.com',
  '*.tioanime.com',
  'monoschinos2.com',
  '*.monoschinos2.com',
  'animeav1.com',
  '*.animeav1.com',
  'tvanime.tv',
  '*.tvanime.tv',
  'mp4upload.com',
  '*.mp4upload.com',
  'yourupload.com',
  '*.yourupload.com',
  'vidcache.net',
  '*.vidcache.net',
  'flaswish.com',
  '*.flaswish.com',
  'streamwish.to',
  '*.streamwish.to',
  'streamwish.com',
  '*.streamwish.com',
  'sfastwish.com',
  '*.sfastwish.com',
  'dhcplay.com',
  '*.dhcplay.com',
  'zilla-networks.com',
  '*.zilla-networks.com',
  'manhwaweb.com',
  '*.manhwaweb.com',
  'img1mw.xyz',
  '*.img1mw.xyz',
  'img2mw.xyz',
  '*.img2mw.xyz',
  'img3mw.xyz',
  '*.img3mw.xyz',
  'img4mw.xyz',
  '*.img4mw.xyz',
  'toptoon.com',
  '*.toptoon.com',
  'lezhin.com',
  '*.lezhin.com',
  '*.lezhincomics.com',
  'webtoons.com',
  '*.webtoons.com',
  '*.pstatic.net',
  '*.naver.net',
  '*.kakaocdn.net',
  'tapas.io',
  '*.tapas.io',
  'wsrv.nl',
  'images.weserv.nl',
  'i.imgur.com',
  '*.imgur.com',
  'i.ibb.co',
  '*.ibb.co',
  '*.wp.com',
  '*.blogspot.com',
  '*.googleusercontent.com',
  'api.dicebear.com'
];

export function resolveVideoStreamReferer(targetUrl: URL): string {
  const host = targetUrl.hostname.toLowerCase();
  if (host === 'mp4upload.com' || host.endsWith('.mp4upload.com')) {
    return 'https://www.mp4upload.com/';
  }
  if (
    host === 'yourupload.com' ||
    host.endsWith('.yourupload.com') ||
    host === 'vidcache.net' ||
    host.endsWith('.vidcache.net')
  ) {
    return 'https://www.yourupload.com/';
  }
  return targetUrl.origin + '/';
}

function stripBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

function parseIPv4Octets(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const num = Number(part);
    if (num < 0 || num > 255) return null;
    octets.push(num);
  }
  return octets;
}

function isPrivateIPv4Octets(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // Multicast & reserved
  return false;
}

export function isPrivateOrReservedHost(rawHostname: string): boolean {
  const host = stripBrackets(rawHostname);
  if (!host) return true;

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal' ||
    host === '::1' ||
    host === '::' ||
    host === '0:0:0:0:0:0:0:1' ||
    host === '0:0:0:0:0:0:0:0'
  ) {
    return true;
  }

  // Integer / hex obfuscated IPv4 hostnames (e.g. 2130706433 or 0x7f000001)
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return true;
  }

  // IPv4-mapped IPv6 e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1
  if (host.startsWith('::ffff:')) {
    const mapped = host.slice('::ffff:'.length);
    const v4 = parseIPv4Octets(mapped);
    if (v4) return isPrivateIPv4Octets(v4);
    // Hex form of v4 inside IPv6 (e.g. 7f00:1 or a9fe:a9fe)
    const hexParts = mapped.split(':');
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16);
      const lo = parseInt(hexParts[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        return isPrivateIPv4Octets([(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255]);
      }
    }
    return true;
  }

  // IPv6 link-local fe80:: / ULA fc00::/7 (fc.. / fd..)
  if (host.includes(':')) {
    const first = host.split(':')[0];
    if (
      first.startsWith('fe8') ||
      first.startsWith('fe9') ||
      first.startsWith('fea') ||
      first.startsWith('feb') ||
      first.startsWith('fc') ||
      first.startsWith('fd')
    ) {
      return true;
    }
  }

  const ipv4 = parseIPv4Octets(host);
  if (ipv4) {
    return isPrivateIPv4Octets(ipv4);
  }

  return false;
}

export function isDomainAllowlisted(
  hostname: string,
  allowlist: readonly string[] = ALLOWED_PROXY_DOMAINS
): boolean {
  const cleanHost = stripBrackets(hostname);
  if (!cleanHost) return false;
  for (const pattern of allowlist) {
    const p = pattern.toLowerCase();
    if (p.startsWith('*.')) {
      const base = p.slice(2);
      if (cleanHost === base || cleanHost.endsWith('.' + base)) {
        return true;
      }
    } else if (cleanHost === p) {
      return true;
    }
  }
  return false;
}

export type ProxyValidationResult =
  | { valid: true; url: URL }
  | { valid: false; reason: string; status: number };

export function validateProxyTargetUrl(
  rawUrl: string,
  allowlist: readonly string[] = ALLOWED_PROXY_DOMAINS
): ProxyValidationResult {
  const input = String(rawUrl ?? '').trim();
  if (!input) {
    return { valid: false, reason: 'Missing target url', status: 400 };
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { valid: false, reason: 'Malformed target url', status: 400 };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: `Disallowed protocol: ${parsed.protocol}`, status: 403 };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'Credentials in URL are not allowed', status: 403 };
  }

  if (isPrivateOrReservedHost(parsed.hostname)) {
    return { valid: false, reason: `Blocked private or reserved host: ${parsed.hostname}`, status: 403 };
  }

  if (!isDomainAllowlisted(parsed.hostname, allowlist)) {
    return { valid: false, reason: `Domain not in proxy allowlist: ${parsed.hostname}`, status: 403 };
  }

  return { valid: true, url: parsed };
}

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function createIpRateLimiter(options: RateLimiterOptions) {
  const { windowMs, maxRequests } = options;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    check(ip: string, now = Date.now()): RateLimitDecision {
      const key = (ip || 'unknown').trim();
      const existing = buckets.get(key);
      if (!existing || now >= existing.resetAt) {
        const next = { count: 1, resetAt: now + windowMs };
        buckets.set(key, next);
        // Prevent unbounded memory growth across long uptime
        if (buckets.size > 5000) {
          for (const [k, v] of buckets.entries()) {
            if (now >= v.resetAt) buckets.delete(k);
          }
        }
        return { allowed: true, remaining: Math.max(0, maxRequests - 1), resetAt: next.resetAt };
      }
      existing.count += 1;
      const allowed = existing.count <= maxRequests;
      return {
        allowed,
        remaining: Math.max(0, maxRequests - existing.count),
        resetAt: existing.resetAt
      };
    },
    reset() {
      buckets.clear();
    }
  };
}

export type IncomingHeadersLike = Record<string, string | string[] | undefined>;

function readSingleHeader(headers: IncomingHeadersLike, name: string): string {
  const lower = name.toLowerCase();
  const raw = headers[lower] ?? headers[name];
  if (Array.isArray(raw)) {
    return String(raw[0] || '').trim();
  }
  return typeof raw === 'string' ? raw.trim() : '';
}

export function extractHostname(rawHeaderValue: string): string {
  const val = String(rawHeaderValue || '').trim();
  if (!val || val.toLowerCase() === 'null') return '';
  if (val.includes('://')) {
    try {
      return stripBrackets(new URL(val).hostname);
    } catch {
      return '';
    }
  }
  // Host header form: "example.com:3000" or "[::1]:3000"
  try {
    return stripBrackets(new URL(`http://${val}`).hostname);
  } catch {
    return stripBrackets(val.split(':')[0]);
  }
}

export type OriginValidationResult =
  | { allowed: true; corsOrigin: string | null }
  | { allowed: false; reason: string; status: 403 };

export function validateIncomingRequestOrigin(headers: IncomingHeadersLike): OriginValidationResult {
  const originHeader = readSingleHeader(headers, 'origin');
  const refererHeader = readSingleHeader(headers, 'referer');
  const fwdHostHeader = readSingleHeader(headers, 'x-forwarded-host').split(',')[0].trim();
  const hostHeader = fwdHostHeader || readSingleHeader(headers, 'host').split(',')[0].trim();
  const requestHost = extractHostname(hostHeader);

  const isTrustedHost = (candidateHost: string): boolean => {
    if (!candidateHost) return false;
    if (
      candidateHost === 'localhost' ||
      candidateHost === '127.0.0.1' ||
      candidateHost === '::1' ||
      candidateHost === '0.0.0.0'
    ) {
      return true;
    }
    return Boolean(requestHost && candidateHost === requestHost);
  };

  if (originHeader) {
    if (originHeader.toLowerCase() === 'null') {
      return { allowed: false, reason: 'Forbidden origin: null origin is not allowed', status: 403 };
    }
    const originHost = extractHostname(originHeader);
    if (!isTrustedHost(originHost)) {
      return {
        allowed: false,
        reason: `Forbidden origin: ${originHeader} is not authorized to access proxy`,
        status: 403
      };
    }
  }

  if (refererHeader) {
    const refHost = extractHostname(refererHeader);
    if (!refHost || !isTrustedHost(refHost)) {
      return {
        allowed: false,
        reason: `Forbidden referer: ${refererHeader} is not authorized to hotlink proxy`,
        status: 403
      };
    }
  }

  return {
    allowed: true,
    corsOrigin: originHeader || null
  };
}

export function resolveAllowedCorsOrigin(headers: IncomingHeadersLike): string | null {
  const check = validateIncomingRequestOrigin(headers);
  return check.allowed ? check.corsOrigin : null;
}

export function rewriteHlsManifestUrls(manifestText: string, baseManifestUrl: string): string {
  if (!manifestText) return '';
  let parsedBase: URL;
  try {
    parsedBase = new URL(baseManifestUrl);
  } catch {
    return manifestText;
  }

  const wrapIfAllowed = (candidateRaw: string): string => {
    const clean = candidateRaw.trim();
    if (!clean || clean.startsWith('/api/video-proxy?')) return clean;
    try {
      const resolved = new URL(clean, parsedBase).toString();
      const check = validateProxyTargetUrl(resolved);
      if (check.valid) {
        return `/api/video-proxy?url=${encodeURIComponent(check.url.toString())}`;
      }
    } catch {
      // Keep original URL if invalid
    }
    return clean;
  };

  return manifestText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, rawUri: string) => {
          return `URI="${wrapIfAllowed(rawUri)}"`;
        });
      }
      return wrapIfAllowed(trimmed);
    })
    .join('\n');
}

export function sanitizeDownloadFilename(rawName: string, fallback = 'nyanime_episodio.mp4'): string {
  const cleaned = String(rawName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\r\n\t"<>|:*?\\/]+/g, ' ')
    .replace(/[^a-zA-Z0-9._\-\s()[\]]+/g, '')
    .trim()
    .replace(/\s+/g, '_');

  if (!cleaned) return fallback;
  const maxBase = cleaned.slice(0, 110).replace(/^[._-]+|[._-]+$/g, '');
  if (!maxBase) return fallback;
  if (/\.(mp4|webm|mkv)$/i.test(maxBase)) {
    return maxBase;
  }
  return `${maxBase}.mp4`;
}

export function buildVideoDownloadProxyUrl(streamOrProxyUrl: string, filename: string): string {
  const safeFile = sanitizeDownloadFilename(filename);
  const raw = String(streamOrProxyUrl || '').trim();
  if (!raw) return '';

  if (raw.startsWith('/api/video-proxy?')) {
    const sep = raw.includes('?') ? '&' : '?';
    return `${raw}${sep}download=1&filename=${encodeURIComponent(safeFile)}`;
  }

  return `/api/video-proxy?url=${encodeURIComponent(raw)}&download=1&filename=${encodeURIComponent(safeFile)}`;
}


