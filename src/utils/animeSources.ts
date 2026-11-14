export type AnimeAudioMode = 'SUB' | 'LATINO' | 'MULTI' | 'BEST';

export interface AnimeSourceCandidate {
  providerId: string;
  providerName: string;
  serverName: string;
  url: string;
  language: 'SUB' | 'LATINO' | 'MULTI';
  quality: string;
  type: 'embed' | 'mp4' | 'hls';
  direct: boolean;
  score: number;
  status?: 'AVAILABLE' | 'FAILED';
}

export interface EpisodeMetaEntry {
  episode: number;
  title: string;
  thumbnail: string;
  airDate: string;
  overview: string;
}

const BLOCKED_HOST_PATTERNS: readonly RegExp[] = [
  /embedsb\./i,
  /streamsb\./i,
  /sbembed/i,
  /sbfull/i,
  /sbplay/i,
  /sbcloud/i,
  /watchsb/i,
  /hqq\.tv/i,
  /hqq\.ac/i,
  /waaw\.to/i,
  /netu\.tv/i,
  /fembed/i,
  /femax20/i,
  /feurl/i,
  /1fichier\.com/i,
  /mega\.nz\/file\//i,
  /v\.tioanime\.com/i,
  /\.uns\.bio/i,
  /upnshare/i,
  /turbovio/i,
  /turboembed/i,
  /voe\.sx/i
];

export function isBlockedOrUnsafeStreamHost(url: string, serverName = ''): boolean {
  const u = String(url || '').toLowerCase();
  const s = String(serverName || '').toLowerCase();
  if (!u.startsWith('http')) return true;
  if (
    s === 'streamsb' ||
    s === 'netu' ||
    s === 'fembed' ||
    s === '1fichier' ||
    s === 'upnshare' ||
    s === 'turbovio' ||
    s === 'voe' ||
    s === 'amus' ||
    s === 'mepu'
  ) {
    return true;
  }
  return BLOCKED_HOST_PATTERNS.some((rx) => rx.test(u));
}

const SERVER_RELIABILITY_SCORES: Record<string, number> = {
  desu: 128,
  desuv: 126,
  desuka: 125,
  mp4upload: 124,
  yourupload: 118,
  mega: 114,
  streamwish: 110,
  flaswish: 110,
  wish: 108,
  okru: 104,
  filemoon: 96,
  savefiles: 92,
  luluvdo: 90,
  lulu: 90,
  doodstream: 86,
  mixdrop: 84,
  mxdrop: 84,
  byse: 82,
  bysekoze: 82,
  vidguard: 80,
  multiembed: 76,
  vidsrc: 74,
  hls: 65,
  zilla: 65,
  stream: 78
};

export function getServerBaseScore(serverName: string): number {
  const key = String(serverName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  for (const [k, s] of Object.entries(SERVER_RELIABILITY_SCORES)) {
    if (key.includes(k)) return s;
  }
  return 80;
}

export function normalizeSlugText(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00d7/g, ' x ')
    .replace(/\((?:tv|ona|ova)\)/gi, ' ')
    .replace(/[:’'"–—_]/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function stripSeasonModifiersFromSlug(slug: string): string {
  return String(slug || '')
    .replace(/-(?:season|temporada|part|parte|cour)-[0-9a-z-]+/gi, '')
    .replace(/-[0-9]+(?:st|nd|rd|th)-season/gi, '')
    .replace(/-season-[0-9]+/gi, '')
    .replace(/-s[0-9]+$/i, '')
    .replace(/-tv$/i, '')
    .replace(/-+$/g, '');
}

export function generateAnimeSlugCandidates(
  romaji?: string | null,
  english?: string | null,
  seasonTitle?: string | null,
  seasonNum = 1
): string[] {
  const candidates = new Set<string>();
  const suffixVariants = new Set<string>();
  const titles = [romaji, seasonTitle, english].filter((v): v is string => Boolean(v && v.trim()));

  for (const raw of titles) {
    const base = normalizeSlugText(raw);
    if (!base) continue;

    const cleanBase = stripSeasonModifiersFromSlug(base);

    if (seasonNum === 1) {
      candidates.add(base);
      candidates.add(base.replace(/re-zero/g, 'rezero'));
      candidates.add(base.replace(/high-school/g, 'highschool'));

      if (raw.includes(';')) {
        const semiJoined = normalizeSlugText(raw.replace(/;/g, ''));
        if (semiJoined) candidates.add(semiJoined);
      }

      if (cleanBase) {
        candidates.add(cleanBase);
        candidates.add(cleanBase.replace(/re-zero/g, 'rezero'));
        suffixVariants.add(`${cleanBase}-tv`);
        suffixVariants.add(`${cleanBase}-latino`);
        suffixVariants.add(`${cleanBase}-audio-latino`);
      }
    } else if (cleanBase) {
      candidates.add(`${cleanBase}-${seasonNum === 2 ? '2nd' : seasonNum === 3 ? '3rd' : `${seasonNum}th`}-season`);
      candidates.add(`${cleanBase}-season-${seasonNum}`);
      if (seasonNum === 2) {
        candidates.add(`${cleanBase}-segunda-temporada`);
        candidates.add(`${cleanBase}-2`);
        suffixVariants.add(`${cleanBase}-ii`);
        suffixVariants.add(`${cleanBase}-latino-2`);
      } else if (seasonNum === 3) {
        candidates.add(`${cleanBase}-tercera-temporada`);
        candidates.add(`${cleanBase}-3`);
        suffixVariants.add(`${cleanBase}-iii`);
      } else if (seasonNum === 4) {
        candidates.add(`${cleanBase}-cuarta-temporada`);
        candidates.add(`${cleanBase}-4`);
        suffixVariants.add(`${cleanBase}-iv`);
      } else {
        candidates.add(`${cleanBase}-temporada-${seasonNum}`);
      }
      candidates.add(base);
    }
  }

  for (const v of suffixVariants) candidates.add(v);
  return Array.from(candidates).filter(Boolean);
}

function cleanSingleSearchQuery(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00d7/g, ' x ')
    .replace(/\[|\]/g, '')
    .replace(/\((?:tv|ona|ova|19\d\d|20\d\d)\)/gi, '')
    .replace(/\b(?:2nd|3rd|4th|5th|\d+th)\s+season\b/gi, '')
    .replace(/\bseason\s+\d+\b/gi, '')
    .replace(/\bpart\s+\d+\b/gi, '')
    .replace(/[?!]+/g, '')
    .replace(/[:\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractBestSearchQuery(romaji?: string | null, english?: string | null, seasonTitle?: string | null): string {
  const source = romaji || english || seasonTitle || '';
  return cleanSingleSearchQuery(source).replace(/;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildAnimeSearchQueries(
  romaji?: string | null,
  english?: string | null,
  seasonTitle?: string | null
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const pushQuery = (q: string) => {
    const cleaned = q.replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned.length < 2) return;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cleaned);
    }
  };

  for (const raw of [romaji, english, seasonTitle]) {
    if (!raw || !raw.trim()) continue;
    const base = cleanSingleSearchQuery(raw);
    if (!base) continue;

    if (base.includes(';')) {
      pushQuery(base.replace(/;/g, ' '));
      pushQuery(base);
    } else {
      pushQuery(base);
    }

    if (base.includes(':')) {
      const beforeColon = base.split(':')[0]?.trim() || '';
      if (beforeColon.length >= 3) {
        pushQuery(beforeColon.replace(/;/g, ' '));
      }
    }
  }

  return out.slice(0, 4);
}

export function parseAnimeAv1CatalogLinks(html: string): string[] {
  const matches = html.match(/href="(\/media\/[a-z0-9-]+)"/gi) || [];
  const slugs = new Set<string>();
  for (const m of matches) {
    const sub = m.match(/\/media\/([a-z0-9-]+)/i);
    if (sub && sub[1]) {
      slugs.add(sub[1].toLowerCase());
    }
  }
  return Array.from(slugs);
}

export function parseTioAnimeDirectoryLinks(html: string): string[] {
  const matches = html.match(/href="(\/anime\/[a-z0-9-]+)"/gi) || [];
  const slugs = new Set<string>();
  for (const m of matches) {
    const sub = m.match(/\/anime\/([a-z0-9-]+)/i);
    if (sub && sub[1]) {
      slugs.add(sub[1].toLowerCase());
    }
  }
  return Array.from(slugs);
}

export function parseTvAnimeDirectoryLinks(html: string): string[] {
  const matches = html.match(/href="(?:https?:\/\/tvanime\.tv)?(\/anime\/[a-z0-9-]+)"/gi) || [];
  const slugs = new Set<string>();
  for (const m of matches) {
    const sub = m.match(/\/anime\/([a-z0-9-]+)/i);
    if (sub && sub[1]) {
      slugs.add(sub[1].toLowerCase());
    }
  }
  return Array.from(slugs);
}

const SLUG_STOPWORDS = new Set([
  'no', 'wa', 'ga', 'ni', 'wo', 'to', 'de', 'ka', 'na', 'kara',
  'of', 'the', 'in', 'on', 'at', 'by', 'for', 'and', 'a', 'an', 'la', 'el',
  'season', 'temporada', 'part', 'parte', 'cour', 'movie', 'tv'
]);

const SLUG_META_SUFFIXES = new Set([
  'tv', 'latino', 'audio', 'sub', 'esp', 'espanol', 'castellano', 'hd', 'uncensored'
]);

function getExpectedSeasonTokens(seasonNum: number): Set<string> {
  const s = new Set<string>();
  if (seasonNum <= 1) return s;
  s.add('season');
  s.add('temporada');
  s.add(String(seasonNum));
  s.add(`s${seasonNum}`);
  if (seasonNum === 2) { s.add('2nd'); s.add('ii'); s.add('segunda'); }
  else if (seasonNum === 3) { s.add('3rd'); s.add('iii'); s.add('tercera'); }
  else if (seasonNum === 4) { s.add('4th'); s.add('iv'); s.add('cuarta'); }
  else s.add(`${seasonNum}th`);
  return s;
}

export function pickBestSlugMatch(
  foundSlugs: string[],
  targets: string[],
  seasonNum = 1
): string | null {
  if (!foundSlugs || foundSlugs.length === 0) return null;
  const cleanTargets = (targets || []).filter((t): t is string => Boolean(t && t.trim()));
  if (cleanTargets.length === 0) return null;

  const seasonMarkerRegex =
    seasonNum === 2
      ? /(2nd|season-2|temporada-2|-s2$|-2$|-ii$)/i
      : seasonNum === 3
        ? /(3rd|season-3|temporada-3|-s3$|-3$|-iii$)/i
        : seasonNum === 4
          ? /(4th|season-4|temporada-4|-s4$|-4$|-iv$)/i
          : seasonNum > 4
            ? new RegExp(`(${seasonNum}th|season-${seasonNum}|-s${seasonNum}$|-${seasonNum}$)`, 'i')
            : null;

  const wantsMovie = cleanTargets.some((t) => /\b(movie|pelicula|film|ova|special|gaiden)\b/i.test(t));
  const usesNumberedSeasonTitle = cleanTargets.some((t) =>
    /\b(?:2nd|3rd|4th|5th|\d+th)\s+season\b|\bseason\s+[2-9]\b|\btemporada\s+[2-9]\b/i.test(t)
  );
  const expectedSeasonTokens = getExpectedSeasonTokens(seasonNum);

  interface PreparedTarget {
    exactSlugs: Set<string>;
    beforeColonSlug: string;
    allTokens: Set<string>;
    sigTokens: Set<string>;
    compounds: Map<string, [string, string]>;
  }

  const preparedTargets: PreparedTarget[] = cleanTargets.map((t) => {
    const exactSlugs = new Set<string>();
    const norm = normalizeSlugText(t);
    if (norm) {
      exactSlugs.add(norm);
      if (seasonNum === 1) {
        const stripped = stripSeasonModifiersFromSlug(norm);
        if (stripped) exactSlugs.add(stripped);
      }
    }
    if (t.includes(';')) {
      const semiJoined = normalizeSlugText(t.replace(/;/g, ''));
      if (semiJoined) exactSlugs.add(semiJoined);
    }

    const colonIdx = t.indexOf(':');
    const beforeColonSlug = colonIdx > 2 ? normalizeSlugText(t.slice(0, colonIdx)) : '';

    const parts = norm
      .split('-')
      .filter((tok) => tok.length >= 2 && !['season', 'the', 'part', 'cour', 'movie', 'tv'].includes(tok));
    const allTokens = new Set<string>(parts);
    const sigTokens = new Set<string>(
      parts.filter((tok) => !SLUG_STOPWORDS.has(tok) && !/^\d+(?:st|nd|rd|th)?$/.test(tok))
    );
    if (sigTokens.size === 0) {
      for (const p of parts) sigTokens.add(p);
    }

    const compounds = new Map<string, [string, string]>();
    for (let i = 0; i + 1 < parts.length; i++) {
      compounds.set(`${parts[i]}${parts[i + 1]}`, [parts[i], parts[i + 1]]);
    }

    return { exactSlugs, beforeColonSlug, allTokens, sigTokens, compounds };
  });

  let bestSlug: string | null = null;
  let bestScore = -999;

  for (const slug of foundSlugs) {
    if (!wantsMovie && /(?:^|-)(movie|pelicula|ova|special|recap|gaiden|mugenjou|ressha|4-koma|gekijou)(?:-|$)/i.test(slug)) {
      continue;
    }

    const slugTokens = slug.split('-').filter(Boolean);
    const firstTok = slugTokens[0] || '';
    const hasAnyLaterSeasonMarker = /(2nd|3rd|4th|5th|season-[2-9]|temporada-[2-9]|-s[2-9]$|-[2-9]$|-ii$|-iii$|-iv$)/i.test(slug);

    for (const pt of preparedTargets) {
      let score = 0;
      let extraTokens = 0;
      let matchedCount = 0;
      const sigMatched = new Set<string>();

      const strippedSlug = slug.replace(/-tv$/i, '');
      const isExact =
        pt.exactSlugs.has(slug) ||
        (seasonNum === 1 && pt.exactSlugs.has(strippedSlug));

      if (isExact) {
        score += 45;
      }

      for (const st of slugTokens) {
        if (pt.allTokens.has(st)) {
          score += pt.sigTokens.has(st) ? 14 : 6;
          matchedCount++;
          if (pt.sigTokens.has(st)) sigMatched.add(st);
        } else if (pt.compounds.has(st)) {
          score += 24;
          matchedCount += 2;
          const pair = pt.compounds.get(st)!;
          if (pt.sigTokens.has(pair[0])) sigMatched.add(pair[0]);
          if (pt.sigTokens.has(pair[1])) sigMatched.add(pair[1]);
        } else if (SLUG_META_SUFFIXES.has(st)) {
          if (st === 'tv' && seasonNum === 1) score += 4;
        } else if (seasonNum > 1 && expectedSeasonTokens.has(st)) {
          score += 8;
        } else if (st.length >= 1) {
          extraTokens++;
        }
      }

      if (matchedCount === 0 || (pt.sigTokens.size > 0 && sigMatched.size === 0)) {
        continue;
      }

      if (!pt.allTokens.has(firstTok) && !pt.compounds.has(firstTok) && extraTokens >= 2) {
        continue;
      }

      // Reject unrelated titles that share only 1 word or low token coverage while adding foreign words (e.g. hagane-orchestra, shingeki-no-bahamut)
      if (!isExact && extraTokens >= 1) {
        if (pt.sigTokens.size === 1) {
          continue;
        }
        if (pt.sigTokens.size >= 2 && sigMatched.size < 2) {
          continue;
        }
        if (pt.sigTokens.size >= 3 && sigMatched.size < Math.ceil(pt.sigTokens.size * 0.65)) {
          continue;
        }
      }

      // Reject single-token partial match on a 3+ word title unless it is the exact pre-colon title
      if (!isExact && pt.sigTokens.size >= 3 && sigMatched.size <= 1 && slug !== pt.beforeColonSlug) {
        continue;
      }

      score -= extraTokens * 8;

      if (seasonNum === 1) {
        if (!hasAnyLaterSeasonMarker) {
          score += 18;
        } else {
          score -= 50;
        }
      } else if (seasonMarkerRegex && seasonMarkerRegex.test(slug)) {
        score += 28;
      } else if (hasAnyLaterSeasonMarker) {
        score -= 60;
      } else if (usesNumberedSeasonTitle) {
        score -= 60;
      } else {
        score -= 32;
      }

      if (score > bestScore) {
        bestScore = score;
        bestSlug = slug;
      }
    }
  }

  return bestScore > 0 ? bestSlug : null;
}

function unescapeJsonSlashes(url: string): string {
  return String(url || '').replace(/\\\//g, '/').trim();
}

function normalizeKnownEmbedUrl(rawUrl: string): string {
  const u = unescapeJsonSlashes(rawUrl);
  // Convert mega.nz/file/<id>#<key> -> mega.nz/embed/<id>#<key> (ad-free embed inside strict sandbox)
  const megaMatch = u.match(/^https?:\/\/mega\.nz\/file\/([a-zA-Z0-9_-]+)(#[a-zA-Z0-9_-]+)?/i);
  if (megaMatch?.[1]) {
    return `https://mega.nz/embed/${megaMatch[1]}${megaMatch[2] || ''}`;
  }
  // Convert mp4upload.com/<id> -> mp4upload.com/embed-<id>.html
  const mp4Short = u.match(/^https?:\/\/(?:www\.)?mp4upload\.com\/([a-z0-9]{10,16})$/i);
  if (mp4Short?.[1]) {
    return `https://www.mp4upload.com/embed-${mp4Short[1]}.html`;
  }
  return u;
}

function extractBalancedJsObject(html: string, anchor: string): string | null {
  const idx = html.indexOf(anchor);
  if (idx < 0) return null;
  const slice = html.slice(idx + anchor.length, idx + 12000);
  const start = slice.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let end = -1;
  let inQuotes: string | null = null;
  for (let i = start; i < slice.length; i++) {
    const ch = slice[i];
    const prev = i > 0 ? slice[i - 1] : '';
    if (inQuotes) {
      if (ch === inQuotes && prev !== '\\') inQuotes = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuotes = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return end > start ? slice.slice(start, end + 1) : null;
}

export function parseAnimeAv1EpisodeEmbeds(html: string): AnimeSourceCandidate[] {
  if (!html) return [];
  const objStr = extractBalancedJsObject(html, 'embeds:');
  const dlStr = extractBalancedJsObject(html, 'downloads:');
  const results: AnimeSourceCandidate[] = [];

  const extractBucket = (sourceStr: string | null, bucketName: 'DUB' | 'SUB', lang: 'LATINO' | 'SUB') => {
    if (!sourceStr) return;
    const bRegex = new RegExp(`${bucketName}:\\s*\\[([\\s\\S]*?)\\]`, 'i');
    const bMatch = sourceStr.match(bRegex);
    if (!bMatch) return;
    const itemRegex = /\{\s*server:\s*"([^"]+)"\s*,\s*url:\s*"([^"]+)"\s*\}/g;
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(bMatch[1])) !== null) {
      const serverName = m[1].trim();
      const rawUrl = normalizeKnownEmbedUrl(m[2]);
      if (!rawUrl || isBlockedOrUnsafeStreamHost(rawUrl, serverName)) continue;
      results.push({
        providerId: 'animeav1',
        providerName: `AnimeAV1 (${serverName})`,
        serverName,
        url: rawUrl,
        language: lang,
        quality: '1080p',
        type: 'embed',
        direct: false,
        score: getServerBaseScore(serverName) + 12,
        status: 'AVAILABLE'
      });
    }
  };

  extractBucket(objStr, 'SUB', 'SUB');
  extractBucket(objStr, 'DUB', 'LATINO');
  // Promote ad-free Mega embeds (and normalized MP4Upload) from AnimeAV1 downloads object
  extractBucket(dlStr, 'SUB', 'SUB');
  extractBucket(dlStr, 'DUB', 'LATINO');

  return results;
}

export function parseTvAnimeEpisodePlayers(html: string): AnimeSourceCandidate[] {
  if (!html) return [];
  const results: AnimeSourceCandidate[] = [];
  const tagRegex = /class="watch-server[^"]*"([\s\S]*?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(html)) !== null) {
    const attrs = m[1];
    const urlMatch = attrs.match(/data-server-url="([^"]+)"/i);
    const nameMatch = attrs.match(/data-server-name="([^"]+)"/i);
    const langMatch = attrs.match(/data-server-language="([^"]+)"/i);
    if (!urlMatch?.[1]) continue;

    const rawUrl = normalizeKnownEmbedUrl(urlMatch[1]);
    const serverName = (nameMatch?.[1] || inferServerNameFromUrl(rawUrl)).trim();
    if (!rawUrl || isBlockedOrUnsafeStreamHost(rawUrl, serverName)) continue;

    const rawLang = (langMatch?.[1] || 'SUB').toUpperCase();
    const language: 'SUB' | 'LATINO' = rawLang.includes('DUB') || rawLang.includes('LAT') ? 'LATINO' : 'SUB';

    results.push({
      providerId: 'tvanime',
      providerName: `TVAnime (${serverName})`,
      serverName,
      url: rawUrl,
      language,
      quality: '1080p',
      type: 'embed',
      direct: false,
      score: getServerBaseScore(serverName) + 10,
      status: 'AVAILABLE'
    });
  }
  return results;
}

export function parseTioAnimeEpisodeVideos(
  html: string,
  defaultLanguage: 'SUB' | 'LATINO' = 'SUB'
): AnimeSourceCandidate[] {
  if (!html) return [];
  const match = html.match(/var\s+videos\s*=\s*(\[[\s\S]*?\])\s*;/i);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[1]) as Array<[string, string, ...unknown[]]>;
    const list: AnimeSourceCandidate[] = [];
    for (const entry of parsed) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const serverName = String(entry[0] || 'Servidor').trim();
      const rawUrl = unescapeJsonSlashes(String(entry[1] || ''));
      if (isBlockedOrUnsafeStreamHost(rawUrl, serverName)) continue;
      list.push({
        providerId: 'tioanime',
        providerName: `TíoAnime (${serverName})`,
        serverName,
        url: rawUrl,
        language: defaultLanguage,
        quality: '1080p',
        type: 'embed',
        direct: false,
        score: getServerBaseScore(serverName) + 6,
        status: 'AVAILABLE'
      });
    }
    return list;
  } catch {
    return [];
  }
}

function decodeBase64Safe(b64: string): string {
  try {
    if (typeof atob === 'function') {
      return atob(b64).trim();
    }
  } catch {
    // fallback below for Node
  }
  try {
    return Buffer.from(b64, 'base64').toString('utf8').trim();
  } catch {
    return '';
  }
}

export function parseMonosChinosEpisodePlayers(
  html: string,
  defaultLanguage: 'SUB' | 'LATINO' = 'SUB'
): AnimeSourceCandidate[] {
  if (!html) return [];
  const regex = /data-player="([^"]+)"[^>]*>([^<]*)/gi;
  const list: AnimeSourceCandidate[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const decoded = unescapeJsonSlashes(decodeBase64Safe(m[1]));
    const rawLabel = (m[2] || '').replace(/\s+/g, ' ').trim();
    const serverName = rawLabel || inferServerNameFromUrl(decoded);
    if (!decoded || isBlockedOrUnsafeStreamHost(decoded, serverName)) continue;
    list.push({
      providerId: 'monoschinos',
      providerName: `MonosChinos (${serverName})`,
      serverName,
      url: decoded,
      language: defaultLanguage,
      quality: '1080p',
      type: 'embed',
      direct: false,
      score: getServerBaseScore(serverName) + 4,
      status: 'AVAILABLE'
    });
  }
  return list;
}

function decodeHexSafe(hex: string): string {
  const clean = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
  if (!clean || clean.length % 2 !== 0) return '';
  let out = '';
  for (let i = 0; i < clean.length; i += 2) {
    out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  }
  return out.trim();
}

function normalizePortalServerName(rawLabel: string, decodedUrl: string): string {
  const cleaned = String(rawLabel || '')
    .replace(/^Opci[oó]n\s+/i, '')
    .replace(/\s+\d+$/g, '')
    .trim();
  if (!cleaned) return inferServerNameFromUrl(decodedUrl);
  const low = cleaned.toLowerCase();
  if (low.includes('mp4upload')) return 'MP4Upload';
  if (low.includes('streamwish') || low.includes('dhcplay')) return 'StreamWish';
  if (low.includes('filemoon')) return 'Filemoon';
  if (low.includes('uqload')) return 'Uqload';
  if (low.includes('vidhide') || low.includes('filelions')) return 'Vidhide';
  if (low.includes('lulu')) return 'LuluStream';
  if (low.includes('dood')) return 'Doodstream';
  if (low.includes('mixdrop')) return 'MixDrop';
  if (low.includes('netu')) return 'Netu';
  if (low.includes('voe')) return 'VOE';
  return cleaned;
}

export function parseAnimePortalSearchSlugs(html: string): string[] {
  if (!html) return [];
  const slugs = new Set<string>();
  const cardRx = /<article[^>]*class="[^"]*\bli\b[^"]*"[^>]*>[\s\S]*?<\/article>/gi;
  let cardMatch: RegExpExecArray | null;
  while ((cardMatch = cardRx.exec(html)) !== null) {
    const linkMatch = cardMatch[0].match(/href="(?:\.|https?:\/\/[^"/]+)?\/anime\/([a-z0-9-]+)"/i);
    if (linkMatch?.[1]) {
      slugs.add(linkMatch[1].toLowerCase());
    }
  }
  return Array.from(slugs);
}

export function parseAnimePortalEpisodeData(html: string): {
  encryptId: string | null;
  downloadUrls: string[];
} {
  if (!html) return { encryptId: null, downloadUrls: [] };
  const encMatch = html.match(/data-encrypt="([0-9a-fA-F]+)"/i);
  const dwnMatch = html.match(/data-dwn="([^"]+)"/i);
  const downloadUrls: string[] = [];
  if (dwnMatch?.[1]) {
    const rawDwn = dwnMatch[1].replace(/&quot;/g, '"').replace(/\\\//g, '/').trim();
    if (rawDwn.startsWith('[')) {
      try {
        const arr = JSON.parse(rawDwn);
        if (Array.isArray(arr)) {
          for (const u of arr) {
            if (typeof u === 'string' && u.startsWith('http')) downloadUrls.push(u.trim());
          }
        }
      } catch {
        // ignore malformed JSON
      }
    } else {
      for (const u of rawDwn.split(',')) {
        const trimmed = u.trim();
        if (trimmed.startsWith('http')) downloadUrls.push(trimmed);
      }
    }
  }
  return {
    encryptId: encMatch?.[1] || null,
    downloadUrls
  };
}

export function parseHexOptServerList(
  optHtml: string,
  providerId: string,
  providerLabel: string,
  defaultLanguage: 'SUB' | 'LATINO' = 'SUB'
): AnimeSourceCandidate[] {
  if (!optHtml) return [];
  const results: AnimeSourceCandidate[] = [];
  const itemRx = /<li[^>]*encrypt="([0-9a-fA-F]+)"[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRx.exec(optHtml)) !== null) {
    const hex = m[1];
    const inner = m[0];
    const decoded = normalizeKnownEmbedUrl(decodeHexSafe(hex));
    if (!decoded) continue;
    const titleMatch = inner.match(/title="([^"]+)"/i);
    const spanMatch = m[2].match(/<span>([^<]+)<\/span>/i);
    const serverName = normalizePortalServerName(spanMatch?.[1] || titleMatch?.[1] || '', decoded);
    if (isBlockedOrUnsafeStreamHost(decoded, serverName)) continue;

    results.push({
      providerId,
      providerName: `${providerLabel} (${serverName})`,
      serverName,
      url: decoded,
      language: defaultLanguage,
      quality: '1080p',
      type: 'embed',
      direct: false,
      score: getServerBaseScore(serverName) + (providerId === 'jkanime' ? 14 : 9),
      status: 'AVAILABLE'
    });
  }
  return results;
}

export function parsePortalDownloadUrls(
  downloadUrls: string[],
  providerId: string,
  providerLabel: string,
  defaultLanguage: 'SUB' | 'LATINO' = 'SUB'
): AnimeSourceCandidate[] {
  const results: AnimeSourceCandidate[] = [];
  for (const raw of downloadUrls) {
    const cleanUrl = normalizeKnownEmbedUrl(raw);
    const serverName = inferServerNameFromUrl(cleanUrl);
    if (!cleanUrl || isBlockedOrUnsafeStreamHost(cleanUrl, serverName)) continue;
    results.push({
      providerId,
      providerName: `${providerLabel} (${serverName})`,
      serverName,
      url: cleanUrl,
      language: defaultLanguage,
      quality: '1080p',
      type: 'embed',
      direct: false,
      score: getServerBaseScore(serverName) + (providerId === 'jkanime' ? 14 : 9),
      status: 'AVAILABLE'
    });
  }
  return results;
}

export function inferServerNameFromUrl(url: string): string {
  const u = String(url || '').toLowerCase();
  if (u.includes('mp4upload')) return 'MP4Upload';
  if (u.includes('zilla-networks')) return 'HLS';
  if (u.includes('voe.sx')) return 'VOE';
  if (u.includes('mega.nz')) return 'Mega';
  if (u.includes('streamwish') || u.includes('flaswish') || u.includes('dhcplay')) return 'StreamWish';
  if (u.includes('filemoon') || u.includes('byse')) return 'Filemoon';
  if (u.includes('movearnpre') || u.includes('filelions')) return 'Vidhide';
  if (u.includes('uqload')) return 'Uqload';
  if (u.includes('luluvdo')) return 'LuluStream';
  if (u.includes('ok.ru')) return 'Okru';
  if (u.includes('yourupload')) return 'YourUpload';
  if (u.includes('vgfplay') || u.includes('vidguard')) return 'VidGuard';
  if (u.includes('savefiles')) return 'Savefiles';
  if (u.includes('dood') || u.includes('dsvplay')) return 'Doodstream';
  if (u.includes('mixdrop')) return 'MixDrop';
  if (u.includes('multiembed')) return 'MultiEmbed';
  if (u.includes('vidsrc')) return 'VidSrc';
  return 'Servidor';
}

export function parseMp4UploadDirectUrl(html: string): string | null {
  if (!html) return null;
  const m1 = html.match(/player\.src\(\{\s*type:\s*["']video\/mp4["']\s*,\s*src:\s*["'](https?:\/\/[^"']+)["']/i);
  if (m1?.[1]) return unescapeJsonSlashes(m1[1]);
  const m2 = html.match(/src:\s*["'](https?:\/\/[^"']+\.mp4(?:\?[^"']*)?)["']/i);
  if (m2?.[1]) return unescapeJsonSlashes(m2[1]);
  const m3 = html.match(/"(https?:\/\/[a-zA-Z0-9_.\-:]+\/d\/[^"]+\/video\.mp4)"/i);
  if (m3?.[1]) return unescapeJsonSlashes(m3[1]);
  return null;
}

export function parseYourUploadDirectUrl(html: string): string | null {
  if (!html) return null;
  const m1 = html.match(/file:\s*['"](https?:\/\/[^'"]+\.mp4(?:\?[^'"]*)?)['"]/i);
  if (m1?.[1]) return unescapeJsonSlashes(m1[1]);
  const m2 = html.match(/["'](https?:\/\/[^"']*vidcache\.net[^"']+\.mp4(?:\?[^"']*)?)["']/i);
  if (m2?.[1]) return unescapeJsonSlashes(m2[1]);
  return null;
}

export function unpackDeanEdwards(packedHtml: string): string {
  if (!packedHtml) return '';
  const rx = /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']*)'\.split\('\|'\)/g;
  const outputs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rx.exec(packedHtml)) !== null) {
    const payload = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    const radix = Math.max(2, Math.min(36, parseInt(match[2], 10) || 36));
    const count = parseInt(match[3], 10) || 0;
    const dict = match[4].split('|');
    const lookup = (idx: number): string => {
      if (idx < 0 || idx >= dict.length || !dict[idx]) return '';
      return dict[idx];
    };
    const decoded = payload.replace(/\b\w+\b/g, (tok) => {
      const parsed = parseInt(tok, radix);
      if (Number.isNaN(parsed) || parsed < 0 || (count > 0 && parsed >= count) || parsed >= dict.length) {
        return tok;
      }
      const word = lookup(parsed);
      return word || tok;
    });
    outputs.push(decoded);
  }
  return outputs.join('\n');
}

export function parseStreamWishDirectUrl(html: string): string | null {
  if (!html) return null;
  const unpacked = unpackDeanEdwards(html);
  const haystack = `${html}\n${unpacked}`;
  const m3u8 = haystack.match(/(?:file|src)\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8(?:\?[^"']*)?)["']/i);
  if (m3u8?.[1]) return unescapeJsonSlashes(m3u8[1]);
  const anyM3u8 = haystack.match(/["'](https?:\/\/[^"'\s]+\.m3u8(?:\?[^"'\s]*)?)["']/i);
  if (anyM3u8?.[1]) return unescapeJsonSlashes(anyM3u8[1]);
  return null;
}

function canonicalDedupeUrl(url: string): string {
  return String(url || '')
    .trim()
    .replace(/^http:\/\//i, 'https://')
    .replace(/^(https:\/\/)www\./i, '$1')
    .replace(/\/+$/, '');
}

export function rankAndDeduplicateSources(
  candidates: AnimeSourceCandidate[],
  targetMode: AnimeAudioMode = 'SUB',
  failedUrls: ReadonlySet<string> = new Set()
): AnimeSourceCandidate[] {
  const byUrl = new Map<string, AnimeSourceCandidate>();

  for (const raw of candidates) {
    if (!raw || !raw.url) continue;
    const cleanUrl = normalizeKnownEmbedUrl(raw.url);
    if (isBlockedOrUnsafeStreamHost(cleanUrl, raw.serverName)) continue;
    const key = `${canonicalDedupeUrl(cleanUrl)}::${raw.language}`;
    const existing = byUrl.get(key);
    if (existing) {
      if (existing.providerId !== raw.providerId) {
        const otherBase = raw.providerName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        const parenMatch = existing.providerName.match(/^(.*?)\s*(\([^)]*\))$/);
        if (otherBase && parenMatch && !parenMatch[1].includes(otherBase)) {
          existing.providerName = `${parenMatch[1]}+${otherBase} ${parenMatch[2]}`;
        }
      }
      continue;
    }

    let score = Number(raw.score || getServerBaseScore(raw.serverName));
    if (targetMode === 'LATINO') {
      if (raw.language === 'LATINO') score += 60;
      else if (raw.language === 'MULTI') score += 25;
      else score -= 15;
    } else if (targetMode === 'SUB') {
      if (raw.language === 'SUB') score += 60;
      else if (raw.language === 'MULTI') score += 25;
      else score -= 25;
    } else if (targetMode === 'BEST') {
      if (raw.quality === '1080p') score += 25;
      if (raw.direct) score += 20;
    }

    const failed = failedUrls.has(cleanUrl) || failedUrls.has(raw.url);
    if (failed) score -= 250;

    byUrl.set(key, {
      ...raw,
      url: cleanUrl,
      score,
      status: failed ? 'FAILED' : 'AVAILABLE'
    });
  }

  return Array.from(byUrl.values()).sort((a, b) => b.score - a.score);
}

export function formatAiringCountdown(timeUntilAiringSec?: number | null, nextEp?: number | null): string {
  if (!timeUntilAiringSec || timeUntilAiringSec <= 0 || !nextEp) return '';
  const totalMins = Math.floor(timeUntilAiringSec / 60);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `Ep ${nextEp} en ${days}d ${hours}h`;
  if (hours > 0) return `Ep ${nextEp} en ${hours}h ${mins}m`;
  return `Ep ${nextEp} en ${Math.max(1, mins)}m`;
}

export function extractEpisodeDetailsMap(anizipJson: unknown): Record<number, EpisodeMetaEntry> {
  const result: Record<number, EpisodeMetaEntry> = {};
  if (!anizipJson || typeof anizipJson !== 'object') return result;
  const epsObj = (anizipJson as { episodes?: Record<string, unknown> }).episodes;
  if (!epsObj || typeof epsObj !== 'object') return result;

  for (const [k, val] of Object.entries(epsObj)) {
    const epNum = parseInt(k, 10);
    if (!Number.isFinite(epNum) || epNum <= 0 || !val || typeof val !== 'object') continue;
    const item = val as {
      title?: { es?: string; en?: string; 'x-jat'?: string } | string;
      image?: string;
      airDate?: string;
      overview?: string;
    };
    const rawTitle =
      typeof item.title === 'string'
        ? item.title
        : item.title?.es || item.title?.en || item.title?.['x-jat'] || '';
    result[epNum] = {
      episode: epNum,
      title: String(rawTitle || '').trim(),
      thumbnail: String(item.image || '').trim(),
      airDate: String(item.airDate || '').trim(),
      overview: String(item.overview || '').trim()
    };
  }
  return result;
}
