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
  'hentaijk.com',
  '*.hentaijk.com',
  'hentaila.com',
  '*.hentaila.com',
  'dotanborito.net',
  '*.dotanborito.net',
  'ghbrisk.com',
  '*.ghbrisk.com',
  'ryderjet.com',
  '*.ryderjet.com',
  'fireload.com',
  '*.fireload.com',
  'jkdesa.com',
  '*.jkdesa.com',
  'playmudos.com',
  '*.playmudos.com',
  'streamhgapi.com',
  '*.streamhgapi.com',
  'vidhidevip.com',
  '*.vidhidevip.com',
  'bysekoze.com',
  '*.bysekoze.com',
  'byselapuix.com',
  '*.byselapuix.com',
  'bysesukior.com',
  '*.bysesukior.com',
  'dramiyos-cdn.com',
  '*.dramiyos-cdn.com',
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
  'api.aniskip.com',
  'myanimelist.net',
  '*.myanimelist.net',
  'animeflv.net',
  '*.animeflv.net',
  'tioanime.com',
  '*.tioanime.com',
  'monoschinos2.com',
  '*.monoschinos2.com',
  'monoschinos2.net',
  '*.monoschinos2.net',
  'monoschinos.st',
  '*.monoschinos.st',
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
  'vidcache.io',
  '*.vidcache.io',
  'flaswish.com',
  '*.flaswish.com',
  'streamwish.to',
  '*.streamwish.to',
  'streamwish.com',
  '*.streamwish.com',
  'streamwish.fun',
  '*.streamwish.fun',
  'streamwish.site',
  '*.streamwish.site',
  'sfastwish.com',
  '*.sfastwish.com',
  'wishfast.top',
  '*.wishfast.top',
  'dwish.pro',
  '*.dwish.pro',
  'cdnwish.com',
  '*.cdnwish.com',
  'dhcplay.com',
  '*.dhcplay.com',
  'swdyu.com',
  '*.swdyu.com',
  'cdnplay.pro',
  '*.cdnplay.pro',
  'filelions.to',
  '*.filelions.to',
  'filelions.live',
  '*.filelions.live',
  'filelions.site',
  '*.filelions.site',
  'filelions.online',
  '*.filelions.online',
  'filelions.top',
  '*.filelions.top',
  'fviplions.com',
  '*.fviplions.com',
  'vidhide.com',
  '*.vidhide.com',
  'vidhidepre.com',
  '*.vidhidepre.com',
  'vidhidepro.com',
  '*.vidhidepro.com',
  'vidhidefast.com',
  '*.vidhidefast.com',
  'movearnpre.com',
  '*.movearnpre.com',
  'uqload.vc',
  '*.uqload.vc',
  'uqload.is',
  '*.uqload.is',
  'uqload.to',
  '*.uqload.to',
  'uqload.net',
  '*.uqload.net',
  'uqload.ws',
  '*.uqload.ws',
  'uqload.io',
  '*.uqload.io',
  'ok.ru',
  '*.ok.ru',
  'mixdrop.co',
  '*.mixdrop.co',
  'mixdrop.ag',
  '*.mixdrop.ag',
  'mixdrop.ps',
  '*.mixdrop.ps',
  'mixdroop.bz',
  '*.mixdroop.bz',
  'filemoon.sx',
  '*.filemoon.sx',
  'filemoon.to',
  '*.filemoon.to',
  'filemoon.in',
  '*.filemoon.in',
  'luluvdo.com',
  '*.luluvdo.com',
  'lulustream.com',
  '*.lulustream.com',
  'dood.wf',
  'dood.la',
  'dood.li',
  'dood.to',
  'dsvplay.com',
  '*.dsvplay.com',
  'streamtape.com',
  '*.streamtape.com',
  'mega.nz',
  '*.mega.nz',
  'g.api.mega.co.nz',
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
  'api.dicebear.com',
  'archive.org',
  '*.archive.org'
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
    host.endsWith('.vidcache.net') ||
    host === 'vidcache.io' ||
    host.endsWith('.vidcache.io')
  ) {
    return 'https://www.yourupload.com/';
  }
  if (host === 'dotanborito.net' || host.endsWith('.dotanborito.net')) {
    return 'https://cdn.dotanborito.net/';
  }
  if (host === 'zilla-networks.com' || host.endsWith('.zilla-networks.com')) {
    return 'https://player.zilla-networks.com/';
  }
  if (host === 'hentaila.com' || host.endsWith('.hentaila.com')) {
    return 'https://hentaila.com/';
  }
  if (
    host === 'jkanime.net' ||
    host.endsWith('.jkanime.net') ||
    host === 'jkdesa.com' ||
    host.endsWith('.jkdesa.com') ||
    host === 'playmudos.com' ||
    host.endsWith('.playmudos.com')
  ) {
    return 'https://jkanime.net/';
  }
  if (host === 'hentaijk.com' || host.endsWith('.hentaijk.com')) {
    return 'https://hentaijk.com/';
  }
  if (host === 'flaswish.com' || host.endsWith('.flaswish.com') || host === 'sfastwish.com' || host.endsWith('.sfastwish.com')) {
    return 'https://flaswish.com/';
  }
  if (
    host === 'streamwish.to' ||
    host.endsWith('.streamwish.to') ||
    host === 'streamwish.com' ||
    host.endsWith('.streamwish.com') ||
    host === 'streamwish.fun' ||
    host.endsWith('.streamwish.fun') ||
    host === 'streamwish.site' ||
    host.endsWith('.streamwish.site') ||
    host === 'wishfast.top' ||
    host.endsWith('.wishfast.top') ||
    host === 'dwish.pro' ||
    host.endsWith('.dwish.pro') ||
    host === 'cdnwish.com' ||
    host.endsWith('.cdnwish.com') ||
    host === 'dhcplay.com' ||
    host.endsWith('.dhcplay.com') ||
    host === 'swdyu.com' ||
    host.endsWith('.swdyu.com') ||
    host === 'cdnplay.pro' ||
    host.endsWith('.cdnplay.pro')
  ) {
    return 'https://streamwish.to/';
  }
  if (host === 'ghbrisk.com' || host.endsWith('.ghbrisk.com')) {
    return 'https://ghbrisk.com/';
  }
  if (host === 'ryderjet.com' || host.endsWith('.ryderjet.com')) {
    return 'https://ryderjet.com/';
  }
  if (
    host === 'uqload.vc' ||
    host.endsWith('.uqload.vc') ||
    host === 'uqload.is' ||
    host.endsWith('.uqload.is') ||
    host === 'uqload.to' ||
    host.endsWith('.uqload.to') ||
    host === 'uqload.net' ||
    host.endsWith('.uqload.net') ||
    host === 'uqload.ws' ||
    host.endsWith('.uqload.ws')
  ) {
    return 'https://uqload.vc/';
  }
  if (host === 'archive.org' || host.endsWith('.archive.org')) {
    return 'https://archive.org/';
  }
  return targetUrl.origin + '/';
}

export function resolveValidatedVideoReferer(
  targetUrl: URL,
  rawRefererParam?: string | null,
  allowlist: readonly string[] = ALLOWED_PROXY_DOMAINS
): string {
  const cleanParam = sanitizeForwardHeaderValue(rawRefererParam, 512);
  if (cleanParam) {
    const check = validateProxyTargetUrl(cleanParam, allowlist);
    if (check.valid) {
      return check.url.toString();
    }
  }
  return resolveVideoStreamReferer(targetUrl);
}

const EPHEMERAL_PROXY_CACHE_BYPASS_SUFFIXES: readonly string[] = [
  'mp4upload.com',
  'yourupload.com',
  'vidcache.net',
  'vidcache.io',
  'flaswish.com',
  'sfastwish.com',
  'streamwish.to',
  'streamwish.com',
  'streamwish.fun',
  'streamwish.site',
  'wishfast.top',
  'dwish.pro',
  'cdnwish.com',
  'dhcplay.com',
  'swdyu.com',
  'cdnplay.pro',
  'ghbrisk.com',
  'ryderjet.com',
  'streamhgapi.com',
  'vidhide.com',
  'vidhidepre.com',
  'vidhidepro.com',
  'vidhidevip.com',
  'vidhidefast.com',
  'filelions.to',
  'filelions.live',
  'filelions.site',
  'filelions.online',
  'filelions.top',
  'fviplions.com',
  'movearnpre.com',
  'dramiyos-cdn.com',
  'playmudos.com',
  'jkdesa.com',
  'bysesukior.com',
  'byselapuix.com',
  'bysekoze.com',
  'ok.ru',
  'mixdrop.co',
  'mixdrop.ag',
  'mixdrop.ps',
  'mixdroop.bz',
  'filemoon.sx',
  'filemoon.to',
  'filemoon.in',
  'uqload.vc',
  'uqload.is',
  'uqload.to',
  'uqload.net',
  'uqload.ws',
  'luluvdo.com',
  'lulustream.com',
  'dood.wf',
  'dood.la',
  'dood.li',
  'dood.to',
  'dsvplay.com',
  'streamtape.com',
  'zilla-networks.com',
  'mega.nz',
  'g.api.mega.co.nz'
];

export function shouldBypassProxyCache(targetUrl: URL): boolean {
  const host = stripBrackets(targetUrl.hostname);
  const path = targetUrl.pathname.toLowerCase();
  if (path.includes('/jkplayer/') || path === '/jk') {
    return true;
  }
  return EPHEMERAL_PROXY_CACHE_BYPASS_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith('.' + suffix)
  );
}

export const BLOCKED_SENSITIVE_PORTS = new Set([
  '21',
  '22',
  '23',
  '25',
  '53',
  '110',
  '135',
  '137',
  '138',
  '139',
  '143',
  '445',
  '1433',
  '1521',
  '3306',
  '3389',
  '5432',
  '5900',
  '6379',
  '9200',
  '11211',
  '27017'
]);

function stripBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

function parseIPv4Octets(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith('0')) return null; // Octal form handled separately
    const num = Number(part);
    if (num < 0 || num > 255) return null;
    octets.push(num);
  }
  return octets;
}

function isObfuscatedNumericIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length < 1 || parts.length > 4) return false;
  const allNumericParts = parts.every(
    (p) => /^\d+$/.test(p) || /^0x[0-9a-f]+$/i.test(p)
  );
  if (!allNumericParts) return false;
  // Shorthand (e.g. 127.1, 10.1), hex parts, or leading-zero octal (e.g. 0177.0.0.1)
  if (parts.length !== 4) return true;
  return parts.some((p) => /^0x/i.test(p) || (p.length > 1 && p.startsWith('0')));
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
    host === '0:0:0:0:0:0:0:0' ||
    /^(?:0{1,4}:){7}0{0,3}[01]$/.test(host)
  ) {
    return true;
  }

  // Integer / hex / octal / shorthand obfuscated IPv4 hostnames (e.g. 2130706433, 0x7f000001, 0177.0.0.1, 127.1)
  if (isObfuscatedNumericIPv4(host)) {
    return true;
  }

  // IPv4-mapped IPv6 e.g. ::ffff:127.0.0.1, ::ffff:7f00:1, or expanded 0:0:0:0:0:ffff:127.0.0.1
  const v4MappedMatch = host.match(/^(?:::|(?:0{1,4}:){5})ffff:(.+)$/);
  if (v4MappedMatch) {
    const mapped = v4MappedMatch[1];
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

  // IPv6 link-local fe80::/10, ULA fc00::/7 (fc../fd..), multicast ff00::/8, discard 100::
  if (host.includes(':')) {
    const first = host.split(':')[0];
    if (
      first.startsWith('fe8') ||
      first.startsWith('fe9') ||
      first.startsWith('fea') ||
      first.startsWith('feb') ||
      first.startsWith('fc') ||
      first.startsWith('fd') ||
      first.startsWith('ff') ||
      first === '100'
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

  if (parsed.port && BLOCKED_SENSITIVE_PORTS.has(parsed.port)) {
    return { valid: false, reason: `Blocked sensitive target port: ${parsed.port}`, status: 403 };
  }

  if (isPrivateOrReservedHost(parsed.hostname)) {
    return { valid: false, reason: `Blocked private or reserved host: ${parsed.hostname}`, status: 403 };
  }

  if (!isDomainAllowlisted(parsed.hostname, allowlist)) {
    return { valid: false, reason: `Domain not in proxy allowlist: ${parsed.hostname}`, status: 403 };
  }

  return { valid: true, url: parsed };
}

export function sanitizeForwardHeaderValue(raw: unknown, maxLen = 256): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\r\n\0]+/g, '').trim().slice(0, maxLen);
}

export function isValidRangeHeader(raw: string): boolean {
  const clean = sanitizeForwardHeaderValue(raw, 128);
  return /^bytes=(?:\d+-\d*|-\d+)(?:,\s*(?:\d+-\d*|-\d+))*$/i.test(clean);
}

export const DEFAULT_VIDEO_STREAM_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB window stays safely under Cloud Run 32 MB HTTP/1.1 buffer limits

export function capStreamingRangeHeader(
  rawRange: string | null | undefined,
  isDownload = false,
  maxChunkBytes = DEFAULT_VIDEO_STREAM_CHUNK_BYTES
): string | undefined {
  const clean = sanitizeForwardHeaderValue(rawRange, 128);
  if (!clean || !isValidRangeHeader(clean)) return undefined;
  if (isDownload) return clean;
  // Only cap single open-ended or oversized forward ranges; preserve suffix or multi-range headers
  const singleMatch = clean.match(/^bytes=(\d+)-(\d*)$/i);
  if (!singleMatch) return clean;
  const start = Number(singleMatch[1]);
  if (!Number.isFinite(start) || start < 0) return clean;
  const chunk = Math.max(256 * 1024, Math.floor(maxChunkBytes));
  const rawEnd = singleMatch[2];
  if (!rawEnd) {
    return `bytes=${start}-${start + chunk - 1}`;
  }
  const end = Number(rawEnd);
  if (!Number.isFinite(end) || end < start) return clean;
  if (end - start + 1 > chunk) {
    return `bytes=${start}-${start + chunk - 1}`;
  }
  return `bytes=${start}-${end}`;
}

export interface RedirectHopHeaderOptions {
  preserveVideoReferer?: boolean;
}

export function buildRedirectHopHeaders(
  currentHeaders: Record<string, string>,
  fromUrl: URL,
  toUrl: URL,
  resolveReferer?: (target: URL) => string,
  options: RedirectHopHeaderOptions = {}
): Record<string, string> {
  const nextHeaders: Record<string, string> = { ...currentHeaders };
  if (fromUrl.origin === toUrl.origin) {
    return nextHeaders;
  }

  let existingReferer = '';
  // Always strip sensitive auth/session headers on cross-origin redirect hops
  for (const key of Object.keys(nextHeaders)) {
    const lower = key.toLowerCase();
    if (lower === 'referer' && !existingReferer) {
      existingReferer = sanitizeForwardHeaderValue(nextHeaders[key], 512);
    }
    if (
      lower === 'authorization' ||
      lower === 'cookie' ||
      lower === 'proxy-authorization' ||
      lower === 'referer' ||
      lower === 'origin'
    ) {
      delete nextHeaders[key];
    }
  }

  const isMangaDex =
    toUrl.hostname.endsWith('mangadex.org') || toUrl.hostname.endsWith('mangadex.network');
  if (!isMangaDex) {
    const genericOriginRef = `${toUrl.origin}/`;
    const resolvedRef = resolveReferer ? sanitizeForwardHeaderValue(resolveReferer(toUrl), 512) : '';
    let nextRef = resolvedRef || genericOriginRef;

    // On allowlisted video CDN redirects (e.g. YourUpload -> vidcache, MP4Upload, StreamWish, Archive.org mirrors),
    // preserve the required extractor Referer when the destination host has no more specific override.
    if (
      options.preserveVideoReferer &&
      (!resolvedRef || resolvedRef === genericOriginRef) &&
      /^https?:\/\/[^/\s]+/i.test(existingReferer)
    ) {
      nextRef = existingReferer;
    }

    nextHeaders['Referer'] = nextRef;
    try {
      nextHeaders['Origin'] = new URL(nextRef).origin;
    } catch {
      nextHeaders['Origin'] = nextRef.replace(/\/$/, '');
    }
  }

  return nextHeaders;
}

export interface LruTtlCacheOptions<V> {
  maxEntries: number;
  maxTotalBytes?: number;
  defaultTtlMs: number;
  getSize?: (value: V) => number;
}

interface LruCacheRecord<V> {
  value: V;
  size: number;
  expiresAt: number;
}

export class LruTtlCache<V> {
  private readonly store = new Map<string, LruCacheRecord<V>>();
  private readonly maxEntries: number;
  private readonly maxTotalBytes: number | null;
  private readonly defaultTtlMs: number;
  private readonly getSize: (value: V) => number;
  private currentBytes = 0;

  constructor(options: LruTtlCacheOptions<V>) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries));
    this.maxTotalBytes =
      typeof options.maxTotalBytes === 'number' && options.maxTotalBytes > 0
        ? Math.floor(options.maxTotalBytes)
        : null;
    this.defaultTtlMs = Math.max(1, Math.floor(options.defaultTtlMs));
    this.getSize = options.getSize ?? (() => 1);
  }

  get size(): number {
    return this.store.size;
  }

  get totalBytes(): number {
    return this.currentBytes;
  }

  get(key: string, now = Date.now()): V | undefined {
    const record = this.store.get(key);
    if (!record) return undefined;
    if (now >= record.expiresAt) {
      this.store.delete(key);
      this.currentBytes = Math.max(0, this.currentBytes - record.size);
      return undefined;
    }
    // Promote to most-recently-used
    this.store.delete(key);
    this.store.set(key, record);
    return record.value;
  }

  set(key: string, value: V, ttlMs = this.defaultTtlMs, now = Date.now()): boolean {
    const size = Math.max(0, Number(this.getSize(value)) || 0);
    if (this.maxTotalBytes !== null && size > this.maxTotalBytes) {
      return false;
    }

    const existing = this.store.get(key);
    if (existing) {
      this.store.delete(key);
      this.currentBytes = Math.max(0, this.currentBytes - existing.size);
    }

    this.pruneExpired(now);

    this.store.set(key, {
      value,
      size,
      expiresAt: now + Math.max(1, ttlMs)
    });
    this.currentBytes += size;

    while (
      this.store.size > this.maxEntries ||
      (this.maxTotalBytes !== null && this.currentBytes > this.maxTotalBytes)
    ) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.store.get(oldestKey);
      this.store.delete(oldestKey);
      if (oldest) {
        this.currentBytes = Math.max(0, this.currentBytes - oldest.size);
      }
    }

    return true;
  }

  delete(key: string): boolean {
    const existing = this.store.get(key);
    if (!existing) return false;
    this.store.delete(key);
    this.currentBytes = Math.max(0, this.currentBytes - existing.size);
    return true;
  }

  pruneExpired(now = Date.now()): number {
    let removed = 0;
    for (const [k, rec] of this.store.entries()) {
      if (now >= rec.expiresAt) {
        this.store.delete(k);
        this.currentBytes = Math.max(0, this.currentBytes - rec.size);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.store.clear();
    this.currentBytes = 0;
  }
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
  const rawHostHeader = readSingleHeader(headers, 'host').split(',')[0].trim();
  const trustedRequestHosts = new Set(
    [extractHostname(fwdHostHeader), extractHostname(rawHostHeader)].filter(Boolean)
  );

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
    return trustedRequestHosts.has(candidateHost);
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

export function rewriteHlsManifestUrls(
  manifestText: string,
  baseManifestUrl: string,
  explicitReferer?: string | null
): string {
  if (!manifestText) return '';
  let parsedBase: URL;
  try {
    parsedBase = new URL(baseManifestUrl);
  } catch {
    return manifestText;
  }

  let validatedRefSuffix = '';
  const cleanRef = sanitizeForwardHeaderValue(explicitReferer, 512);
  if (cleanRef) {
    const refCheck = validateProxyTargetUrl(cleanRef);
    if (refCheck.valid) {
      validatedRefSuffix = `&referer=${encodeURIComponent(refCheck.url.toString())}`;
    }
  }

  const wrapIfAllowed = (candidateRaw: string): string => {
    const clean = candidateRaw.trim();
    if (!clean || clean.startsWith('/api/video-proxy?')) return clean;
    try {
      const resolved = new URL(clean, parsedBase).toString();
      const check = validateProxyTargetUrl(resolved);
      if (check.valid) {
        return `/api/video-proxy?url=${encodeURIComponent(check.url.toString())}${validatedRefSuffix}`;
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


