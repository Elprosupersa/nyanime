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
  vip: 136,
  dotanborito: 136,
  desu: 128,
  desuv: 126,
  desuka: 125,
  mp4upload: 124,
  yourupload: 118,
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
  stream: 78,
  multiembed: 76,
  mega: 75,
  vidsrc: 74,
  hls: 65,
  zilla: 65
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
  seasonNum = 1,
  synonyms?: ReadonlyArray<string | null | undefined> | null
): string[] {
  const candidates = new Set<string>();
  const suffixVariants = new Set<string>();
  const extraSynonyms = Array.isArray(synonyms)
    ? synonyms.filter((v): v is string => Boolean(v && v.trim())).slice(0, 4)
    : [];
  const titles = [romaji, seasonTitle, english, ...extraSynonyms].filter((v): v is string =>
    Boolean(v && v.trim())
  );

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
        suffixVariants.add(`${cleanBase}-part-2`);
        suffixVariants.add(`${cleanBase}-parte-2`);
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
  seasonTitle?: string | null,
  synonyms?: ReadonlyArray<string | null | undefined> | null
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const pushQuery = (q: string) => {
    const cleaned = q.replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned.length < 2) return;
    if (/[^\x00-\x7F\u00C0-\u024F]/.test(cleaned) && !/[a-zA-Z]{2,}/.test(cleaned)) return;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cleaned);
    }
  };

  const primaryInputs = [romaji, english, seasonTitle];
  const extraInputs = Array.isArray(synonyms) ? synonyms : [];

  for (const raw of [...primaryInputs, ...extraInputs]) {
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

  return out.slice(0, synonyms && synonyms.length > 0 ? 6 : 4);
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
  'tv', 'latino', 'audio', 'sub', 'esp', 'espanol', 'castellano', 'hd', 'uncensored', 'ova', 'ona', 'movie', 'pelicula', 'film', 'special'
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
  seasonNum = 1,
  formatHint = ''
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

  const wantsMovie =
    /^(OVA|MOVIE|ONA|SPECIAL)$/i.test(String(formatHint || '').trim()) ||
    cleanTargets.some((t) => /\b(movie|pelicula|film|ova|special|gaiden)\b/i.test(t));
  const expectedSeasonTokens = getExpectedSeasonTokens(seasonNum);

  interface PreparedTarget {
    exactSlugs: Set<string>;
    beforeColonSlug: string;
    usesNumberedSeasonTitle: boolean;
    hasDistinctSubtitle: boolean;
    allTokens: Set<string>;
    sigTokens: Set<string>;
    compounds: Map<string, [string, string]>;
  }

  const preparedTargets: PreparedTarget[] = cleanTargets.map((t) => {
    const exactSlugs = new Set<string>();
    const norm = normalizeSlugText(t);
    const usesNumberedSeasonTitle =
      /\b(?:2nd|3rd|4th|5th|\d+th)\s+season\b|\bseason\s+[2-9]\b|\btemporada\s+[2-9]\b/i.test(t);
    const colonIdx = t.indexOf(':');
    const beforeColonSlug = colonIdx > 2 ? normalizeSlugText(t.slice(0, colonIdx)) : '';
    const hasDistinctSubtitle =
      !usesNumberedSeasonTitle &&
      (colonIdx > 2 || /\b(hen|arc|chapter|saga|part|cour|final|shippuuden|alchemist|brotherhood|alicization)\b/i.test(t));

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

    const parts = norm
      .split('-')
      .filter((tok) => (tok.length >= 2 || tok === '0') && !['season', 'the', 'part', 'cour', 'movie', 'tv'].includes(tok));
    const allTokens = new Set<string>(parts);
    const sigTokens = new Set<string>(
      parts.filter((tok) => !SLUG_STOPWORDS.has(tok) && (!/^\d+(?:st|nd|rd|th)?$/.test(tok) || tok === '0'))
    );
    if (sigTokens.size === 0) {
      for (const p of parts) sigTokens.add(p);
    }

    const compounds = new Map<string, [string, string]>();
    for (let i = 0; i + 1 < parts.length; i++) {
      compounds.set(`${parts[i]}${parts[i + 1]}`, [parts[i], parts[i + 1]]);
    }

    return {
      exactSlugs,
      beforeColonSlug,
      usesNumberedSeasonTitle,
      hasDistinctSubtitle,
      allTokens,
      sigTokens,
      compounds
    };
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

      const strippedSlug = slug.replace(/-(?:tv|ova|ona|movie|pelicula|film|special)$/i, '');
      const isExact =
        pt.exactSlugs.has(slug) ||
        (seasonNum === 1 && pt.exactSlugs.has(strippedSlug));

      if (isExact) {
        score += 45;
      }

      for (let i = 0; i < slugTokens.length; i++) {
        const st = slugTokens[i];
        const nextSt = i + 1 < slugTokens.length ? slugTokens[i + 1] : '';
        const joinedPair = nextSt ? `${st}${nextSt}` : '';

        if (pt.allTokens.has(st)) {
          score += pt.sigTokens.has(st) ? 14 : 6;
          matchedCount++;
          if (pt.sigTokens.has(st)) sigMatched.add(st);
        } else if (joinedPair && pt.allTokens.has(joinedPair)) {
          score += pt.sigTokens.has(joinedPair) ? 22 : 12;
          matchedCount += 2;
          if (pt.sigTokens.has(joinedPair)) sigMatched.add(joinedPair);
          i++; // consume nextSt as part of compound match
        } else if (pt.compounds.has(st)) {
          score += 24;
          matchedCount += 2;
          const pair = pt.compounds.get(st)!;
          if (pt.sigTokens.has(pair[0])) sigMatched.add(pair[0]);
          if (pt.sigTokens.has(pair[1])) sigMatched.add(pair[1]);
        } else if (SLUG_META_SUFFIXES.has(st)) {
          if (st === 'tv' && seasonNum === 1 && !wantsMovie) score += 4;
          else if (wantsMovie && ['ova', 'ona', 'movie', 'pelicula', 'film', 'special'].includes(st)) score += 10;
        } else if (seasonNum > 1 && expectedSeasonTokens.has(st)) {
          score += 8;
        } else if (st.length >= 1) {
          extraTokens++;
        }
      }

      if (matchedCount === 0 || (pt.sigTokens.size > 0 && sigMatched.size === 0)) {
        continue;
      }

      const firstPair = slugTokens.length >= 2 ? `${slugTokens[0]}${slugTokens[1]}` : '';
      if (
        !pt.allTokens.has(firstTok) &&
        !pt.compounds.has(firstTok) &&
        (!firstPair || !pt.allTokens.has(firstPair)) &&
        extraTokens >= 2
      ) {
        continue;
      }

      // Reject unrelated titles that share only 1 word or low token coverage while adding foreign words (e.g. hagane-orchestra, shingeki-no-bahamut)
      if (!isExact && extraTokens >= 1) {
        if (pt.sigTokens.size === 1) {
          // Allow 1-word title only if first token matches and the sole extra token is a 4-digit release year (e.g. hunter-x-hunter-2011, berserk-2016)
          const onlyYearExtra =
            extraTokens === 1 &&
            pt.allTokens.has(firstTok) &&
            /^(19\d\d|20\d\d)$/.test(slugTokens[slugTokens.length - 1] || '');
          if (!onlyYearExtra) {
            continue;
          }
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
      } else if (
        pt.hasDistinctSubtitle &&
        !pt.usesNumberedSeasonTitle &&
        (isExact || (pt.sigTokens.size >= 3 && sigMatched.size >= Math.ceil(pt.sigTokens.size * 0.75))) &&
        slug !== pt.beforeColonSlug
      ) {
        // Subtitle-named sequel season (e.g. "Kimetsu no Yaiba: Yuukaku-hen", "Bleach: Sennen Kessen-hen", "Dr. STONE: New World")
        score += 18;
      } else if (pt.usesNumberedSeasonTitle) {
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

export function normalizeKnownEmbedUrl(rawUrl: string): string {
  const u = unescapeJsonSlashes(rawUrl);
  // Convert mega.nz/file/<id>#<key> or mega.co.nz/file/<id>#<key> -> mega.nz/embed/<id>#<key>
  const megaFileMatch = u.match(/^https?:\/\/(?:www\.)?mega(?:\.co)?\.nz\/file\/([a-zA-Z0-9_-]+)(#[a-zA-Z0-9_-]+)?/i);
  if (megaFileMatch?.[1]) {
    return `https://mega.nz/embed/${megaFileMatch[1]}${megaFileMatch[2] || ''}`;
  }
  // Convert legacy mega.nz/#!<id>!<key> or mega.nz/embed#!<id>!<key> -> mega.nz/embed/<id>#<key>
  const megaLegacyMatch = u.match(
    /^https?:\/\/(?:www\.)?mega(?:\.co)?\.nz\/(?:embed\/?)?#!([a-zA-Z0-9_-]+)(?:!([a-zA-Z0-9_-]+))?/i
  );
  if (megaLegacyMatch?.[1]) {
    const keyPart = megaLegacyMatch[2] ? `#${megaLegacyMatch[2]}` : '';
    return `https://mega.nz/embed/${megaLegacyMatch[1]}${keyPart}`;
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
      const rawUrl = normalizeKnownEmbedUrl(String(entry[1] || ''));
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
    const decoded = normalizeKnownEmbedUrl(decodeBase64Safe(m[1]));
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
  if (low === 'vip' || low.includes('dotanborito')) return 'VIP';
  if (low.includes('mp4upload')) return 'MP4Upload';
  if (low.includes('yourupload')) return 'YourUpload';
  if (low.includes('streamwish') || low.includes('dhcplay') || low.includes('ghbrisk')) return 'StreamWish';
  if (low.includes('filemoon')) return 'Filemoon';
  if (low.includes('uqload')) return 'Uqload';
  if (low.includes('vidhide') || low.includes('filelions') || low.includes('ryderjet')) return 'Vidhide';
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
  if (u.includes('dotanborito')) return 'VIP';
  if (u.includes('mp4upload')) return 'MP4Upload';
  if (u.includes('zilla-networks')) return 'HLS';
  if (u.includes('voe.sx')) return 'VOE';
  if (u.includes('mega.nz')) return 'Mega';
  if (u.includes('streamwish') || u.includes('flaswish') || u.includes('dhcplay') || u.includes('ghbrisk')) return 'StreamWish';
  if (u.includes('filemoon') || u.includes('byse')) return 'Filemoon';
  if (u.includes('movearnpre') || u.includes('filelions') || u.includes('ryderjet') || u.includes('vidhide')) return 'Vidhide';
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

export interface ArchiveOrgDocEntry {
  identifier?: string;
  title?: string | string[];
  downloads?: number;
}

export function selectBestArchiveOrgDocs(
  docs: ReadonlyArray<ArchiveOrgDocEntry>,
  targets: ReadonlyArray<string>,
  episodeNum = 1,
  isMovie = false
): string[] {
  if (!Array.isArray(docs) || docs.length === 0) return [];
  const cleanTargets = (targets || []).filter((t): t is string => Boolean(t && t.trim()));
  if (cleanTargets.length === 0) return [];

  const targetTokenSets = cleanTargets.map((t) => {
    const norm = normalizeSlugText(t);
    const parts = norm.split('-').filter((tok) => tok.length >= 2 && !SLUG_STOPWORDS.has(tok));
    return new Set(parts.length > 0 ? parts : norm.split('-').filter(Boolean));
  });

  const ep = Math.max(1, Number(episodeNum || 1));
  const epPad = ep < 10 ? `0${ep}` : String(ep);
  const epExactRx = new RegExp(
    `(?:^|[-_\\s]|ep(?:isode|isodio)?[-_\\s]*)(?:${ep}|${epPad})(?:$|[-_\\s]|v\\d|\\d{3,4}p)`,
    'i'
  );
  const anyEpRx = /(?:^|[-_\s]|ep(?:isode|isodio)?[-_\s]*)0*([1-9]\d?)(?:$|[-_\s]|v\d|\d{3,4}p)/gi;

  const scored: Array<{ id: string; score: number }> = [];

  for (const doc of docs) {
    const id = String(doc?.identifier || '').trim();
    if (!id || /^(youtube-|twitch-)/i.test(id)) continue;
    const rawTitle = Array.isArray(doc?.title) ? doc.title.join(' ') : String(doc?.title || '');
    const combinedNorm = normalizeSlugText(`${id} ${rawTitle}`);
    const docTokens = new Set(combinedNorm.split('-').filter(Boolean));

    let bestTokenScore = -999;
    for (const tSet of targetTokenSets) {
      if (tSet.size === 0) continue;
      let matched = 0;
      for (const tok of tSet) {
        if (docTokens.has(tok)) matched++;
      }
      const ratio = matched / tSet.size;
      if (matched === 0 || (tSet.size >= 2 && ratio < 0.5)) continue;
      const s = matched * 20 + Math.round(ratio * 30);
      if (s > bestTokenScore) bestTokenScore = s;
    }

    if (bestTokenScore < 0) continue;

    let score = bestTokenScore;
    const hay = `${id} ${rawTitle}`;
    if (/\b(review|reaction|amv|trailer|ost|soundtrack|opening|ending)\b/i.test(hay)) {
      score -= 80;
    }

    if (!isMovie) {
      if (epExactRx.test(id) || epExactRx.test(rawTitle)) {
        score += 55;
      } else {
        const foundEps: number[] = [];
        let m: RegExpExecArray | null;
        anyEpRx.lastIndex = 0;
        while ((m = anyEpRx.exec(hay)) !== null) {
          const n = parseInt(m[1], 10);
          if (Number.isFinite(n) && n > 0 && n < 100 && n < 1900) {
            foundEps.push(n);
          }
        }
        if (foundEps.length > 0 && !foundEps.includes(ep)) {
          score -= 65;
        }
      }
    }

    if (/\b(sub|espanol|spanish|latino|uncensored|sin-censura|1080p|720p)\b/i.test(hay)) {
      score += 10;
    }

    if (score > 0) {
      scored.push({ id, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((x) => x.id);
}

export function extractArchiveOrgSourcesFromMetadata(
  identifier: string,
  metaJson: unknown,
  episodeNum = 1,
  providerLabel = 'Archive HD'
): AnimeSourceCandidate[] {
  const id = String(identifier || '').trim();
  if (!id || !metaJson || typeof metaJson !== 'object') return [];
  const files = (metaJson as { files?: Array<Record<string, unknown>> }).files;
  if (!Array.isArray(files) || files.length === 0) return [];

  const ep = Math.max(1, Number(episodeNum || 1));
  const epPad = ep < 10 ? `0${ep}` : String(ep);
  const epFileRx = new RegExp(`(?:^|[-_\\s]|ep(?:isode|isodio)?[-_\\s]*)(?:${ep}|${epPad})(?:\\.|[-_\\s])`, 'i');

  const videoFiles = files.filter((f) => {
    const name = String(f?.name || '');
    if (!/\.(mp4|webm|ogv)$/i.test(name)) return false;
    if (/ia_thumb|\.thumbs\//i.test(name)) return false;
    const size = Number(f?.size || 0);
    if (size > 0 && size < 1_000_000) return false;
    return true;
  });

  if (videoFiles.length === 0) return [];

  const scoredFiles = videoFiles.map((f) => {
    const name = String(f.name || '');
    const fmt = String(f.format || '');
    let fScore = 50;
    if (/\.mp4$/i.test(name)) fScore += 30;
    if (/h\.?264|mpeg4/i.test(fmt)) fScore += 15;
    if (epFileRx.test(name)) fScore += 45;
    if (!name.includes('/')) fScore += 5;
    return { name, score: fScore };
  });

  scoredFiles.sort((a, b) => b.score - a.score);
  const bestFile = scoredFiles[0];
  if (!bestFile) return [];

  const encodedPath = bestFile.name
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const directMp4Url = `https://archive.org/download/${encodeURIComponent(id)}/${encodedPath}`;
  const embedUrl = `https://archive.org/embed/${encodeURIComponent(id)}`;
  const isLat = /latino|espanol|castellano/i.test(`${id} ${bestFile.name}`);
  const lang: 'SUB' | 'LATINO' = isLat ? 'LATINO' : 'SUB';

  return [
    {
      providerId: 'archive_org',
      providerName: `${providerLabel} (Direct MP4)`,
      serverName: 'Archive Direct',
      url: directMp4Url,
      language: lang,
      quality: '1080p',
      type: 'mp4',
      direct: true,
      score: 126,
      status: 'AVAILABLE'
    },
    {
      providerId: 'archive_org',
      providerName: `${providerLabel} (Embed)`,
      serverName: 'Archive Embed',
      url: embedUrl,
      language: lang,
      quality: '1080p',
      type: 'embed',
      direct: false,
      score: 105,
      status: 'AVAILABLE'
    }
  ];
}

export function isArchiveOrgSpanishMetadata(identifier: string, metaJson: unknown): boolean {
  const id = String(identifier || '').trim();
  if (!metaJson || typeof metaJson !== 'object') return false;
  const meta = (metaJson as { metadata?: Record<string, unknown>; files?: Array<Record<string, unknown>> }).metadata || {};
  const files = (metaJson as { files?: Array<Record<string, unknown>> }).files || [];

  const flattenVal = (v: unknown): string => {
    if (Array.isArray(v)) return v.map((x) => String(x || '')).join(' ');
    return String(v || '');
  };

  const langField = flattenVal(meta.language).toLowerCase().trim();
  const titleField = flattenVal(meta.title);
  const descField = flattenVal(meta.description);
  const subjField = flattenVal(meta.subject);
  const fileNames = files.map((f) => String(f?.name || '')).join(' ');

  const fullText = `${id} ${titleField} ${descField} ${subjField} ${fileNames}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/\b(spa|es|esp|spanish|espanol|castellano|latino)\b/i.test(langField)) {
    return true;
  }

  if (/\b(sub[\s._-]*esp|espanol|spanish|audio[\s._-]*latino|castellano|latino)\b/i.test(fullText)) {
    return true;
  }

  return false;
}

const HENTAIJK_RESERVED_SLUGS = new Set([
  'img',
  'buscar',
  'dash',
  'usuario',
  'pagina',
  'directorio',
  'letra',
  'genero',
  'assets',
  'jkplayer',
  'ajax',
  'horario',
  'top',
  'historial',
  'terminos',
  'privacidad',
  'contacto'
]);

export function parseHentaiJkSearchSlugs(html: string): string[] {
  if (!html) return [];
  const slugs = new Set<string>();
  const rx = /href=["'](?:https?:\/\/(?:www\.)?hentaijk\.com)?\/([a-z0-9-]+)\/["']/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const slug = String(m[1] || '').toLowerCase().trim();
    if (!slug || HENTAIJK_RESERVED_SLUGS.has(slug)) continue;
    slugs.add(slug);
  }
  return Array.from(slugs);
}

export function parseJkPlayerDirectM3u8(html: string): string | null {
  if (!html) return null;
  const atobRx = /atob\(\s*['"]([A-Za-z0-9+/=]{16,})['"]\s*\)/gi;
  let atobMatch: RegExpExecArray | null;
  while ((atobMatch = atobRx.exec(html)) !== null) {
    const decoded = unescapeJsonSlashes(decodeBase64Safe(atobMatch[1]));
    if (/^https?:\/\/[^\s"']+\.m3u8(?:\?[^\s"']*)?$/i.test(decoded)) {
      return decoded;
    }
  }
  const m1 = html.match(/url\s*:\s*["'](https?:\/\/[^"']+\.m3u8(?:\?[^"']*)?)["']/i);
  if (m1?.[1]) return unescapeJsonSlashes(m1[1]);
  const m2 = html.match(/<source[^>]+src=["'](https?:\/\/[^"']+\.m3u8(?:\?[^"']*)?)["']/i);
  if (m2?.[1]) return unescapeJsonSlashes(m2[1]);
  const m3 = html.match(/["'](https?:\/\/[^"'\s]+\.m3u8(?:\?[^"'\s]*)?)["']/i);
  if (m3?.[1]) return unescapeJsonSlashes(m3[1]);
  return null;
}

export function resolveDotanboritoDirectM3u8(embedOrPlayUrl: string): string | null {
  const raw = String(embedOrPlayUrl || '').trim();
  if (!raw) return null;
  const match = raw.match(/^https?:\/\/(?:cdn\.)?dotanborito\.net\/(?:play|m3u8)\/([a-f0-9]{32})(?:[/?#]|$)/i);
  if (match?.[1]) {
    return `https://cdn.dotanborito.net/m3u8/${match[1].toLowerCase()}`;
  }
  return null;
}

export const HENTAILA_CDN_URL = 'https://cdn.hentaila.com';

export interface HentaiLaMediaImages {
  cover: string;
  thumbnail: string;
  backdrop: string;
}

export function buildHentaiLaMediaImages(mediaId: number | string): HentaiLaMediaImages {
  const cleanId = String(mediaId ?? '').trim();
  if (!cleanId) {
    return { cover: '', thumbnail: '', backdrop: '' };
  }
  return {
    cover: `${HENTAILA_CDN_URL}/covers/${encodeURIComponent(cleanId)}.jpg`,
    thumbnail: `${HENTAILA_CDN_URL}/thumbnails/${encodeURIComponent(cleanId)}.jpg`,
    backdrop: `${HENTAILA_CDN_URL}/backdrops/${encodeURIComponent(cleanId)}.jpg`
  };
}

export function resolveDevalue(dataArray: unknown[], index: unknown, seen: Set<number> = new Set()): any {
  if (!Array.isArray(dataArray)) return index;
  if (typeof index === 'number' && index >= 0 && index < dataArray.length) {
    if (seen.has(index)) return null;
    const val = dataArray[index];
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) {
      if (val.length === 2 && val[0] === 'Date' && typeof val[1] === 'string') {
        return val[1];
      }
      const nextSeen = new Set(seen);
      nextSeen.add(index);
      return val.map((subIndex) => resolveDevalue(dataArray, subIndex, nextSeen));
    }
    const nextSeen = new Set(seen);
    nextSeen.add(index);
    const resolvedObj: Record<string, any> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      resolvedObj[k] = resolveDevalue(dataArray, v, nextSeen);
    }
    return resolvedObj;
  }
  return index;
}

function extractSvelteKitNodeRoot(json: unknown): any {
  if (!json || typeof json !== 'object') return null;
  const nodes = (json as { nodes?: Array<{ data?: unknown[] } | null> }).nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const dArr = nodes[i]?.data;
    if (Array.isArray(dArr) && dArr.length > 0) {
      return resolveDevalue(dArr, 0);
    }
  }
  return null;
}

export interface HentaiLaCatalogItem {
  id: string;
  mediaId: number;
  slug: string;
  title: string;
  synopsis: string;
  category: string;
  status: 'RELEASING' | 'FINISHED';
  episodesCount: number;
  malId?: number | null;
  genres: string[];
  cover: string;
  thumbnail: string;
  backdrop: string;
}

export function parseHentaiLaCatalogData(json: unknown): {
  items: HentaiLaCatalogItem[];
  total: number;
} {
  const root = extractSvelteKitNodeRoot(json);
  if (!root || typeof root !== 'object') return { items: [], total: 0 };
  const rawResults = Array.isArray(root.results)
    ? root.results
    : Array.isArray(root.results?.data)
      ? root.results.data
      : Array.isArray(root.media)
        ? root.media
        : [];
  const items: HentaiLaCatalogItem[] = [];
  for (const r of rawResults) {
    if (!r || typeof r !== 'object') continue;
    const mediaId = Number(r.id || 0);
    const slug = String(r.slug || '').trim().toLowerCase();
    const title = String(r.title || '').trim();
    if (!mediaId || !slug || !title) continue;
    const imgs = buildHentaiLaMediaImages(mediaId);
    const genres = Array.isArray(r.genres)
      ? r.genres
          .map((g: any) => String(g?.name || g || '').trim())
          .filter(Boolean)
      : ['Hentai'];
    if (!genres.some((g: string) => /hentai/i.test(g))) {
      genres.unshift('Hentai');
    }
    items.push({
      id: `hla_${mediaId}`,
      mediaId,
      slug,
      title,
      synopsis: String(r.synopsis || '').replace(/\r\n/g, '\n').trim(),
      category: String(r.category?.name || 'OVA').toUpperCase(),
      status: Number(r.status) === 1 ? 'RELEASING' : 'FINISHED',
      episodesCount: Math.max(1, Number(r.episodesCount || (Array.isArray(r.episodes) ? r.episodes.length : 2))),
      malId: r.malId ? Number(r.malId) : null,
      genres,
      cover: imgs.cover,
      thumbnail: imgs.thumbnail,
      backdrop: imgs.backdrop
    });
  }
  return {
    items,
    total: Number(root.total || items.length)
  };
}

export function parseHentaiLaHubData(json: unknown): {
  featured: HentaiLaCatalogItem[];
  latestEpisodes: Array<{
    id: number;
    number: number;
    createdAt: string;
    mediaId: number;
    slug: string;
    title: string;
    cover: string;
    thumbnail: string;
  }>;
  latestMedia: HentaiLaCatalogItem[];
} {
  const root = extractSvelteKitNodeRoot(json);
  if (!root || typeof root !== 'object') {
    return { featured: [], latestEpisodes: [], latestMedia: [] };
  }
  const mapMediaList = (arr: unknown): HentaiLaCatalogItem[] => {
    if (!Array.isArray(arr)) return [];
    return parseHentaiLaCatalogData({ nodes: [{ data: [{ results: arr }] }] }).items;
  };
  const latestEpisodes = Array.isArray(root.latestEpisodes)
    ? root.latestEpisodes
        .map((ep: any) => {
          const mediaId = Number(ep?.media?.id || ep?.mediaId || 0);
          const slug = String(ep?.media?.slug || '').trim().toLowerCase();
          const title = String(ep?.media?.title || '').trim();
          if (!mediaId || !slug) return null;
          const imgs = buildHentaiLaMediaImages(mediaId);
          return {
            id: Number(ep.id || 0),
            number: Math.max(1, Number(ep.number || 1)),
            createdAt: String(ep.createdAt || ''),
            mediaId,
            slug,
            title,
            cover: imgs.cover,
            thumbnail: imgs.thumbnail
          };
        })
        .filter(
          (x: any): x is {
            id: number;
            number: number;
            createdAt: string;
            mediaId: number;
            slug: string;
            title: string;
            cover: string;
            thumbnail: string;
          } => Boolean(x)
        )
    : [];

  return {
    featured: mapMediaList(root.featured),
    latestEpisodes,
    latestMedia: mapMediaList(root.latestMedia)
  };
}

export function parseHentaiLaMediaDetail(json: unknown): HentaiLaCatalogItem | null {
  const root = extractSvelteKitNodeRoot(json);
  const media = root?.media;
  if (!media || typeof media !== 'object') return null;
  const parsed = parseHentaiLaCatalogData({ nodes: [{ data: [{ results: [media] }] }] });
  return parsed.items[0] || null;
}

export function parseHentaiLaEpisodeSources(payload: unknown): AnimeSourceCandidate[] {
  if (!payload) return [];
  const results: AnimeSourceCandidate[] = [];

  const pushEntry = (rawServer: string, rawUrlInput: string, lang: 'SUB' | 'LATINO' = 'SUB') => {
    const cleanServerRaw = String(rawServer || '').trim();
    if (!rawUrlInput || /^(mediafire|1fichier|fireload)$/i.test(cleanServerRaw)) return;
    const rawUrl = normalizeKnownEmbedUrl(rawUrlInput);
    if (!rawUrl) return;
    const serverName = normalizePortalServerName(cleanServerRaw, rawUrl);
    if (isBlockedOrUnsafeStreamHost(rawUrl, serverName)) return;
    const isVip = serverName.toUpperCase() === 'VIP' || rawUrl.includes('dotanborito.net');
    const score = isVip ? 150 : getServerBaseScore(serverName) + 14;
    results.push({
      providerId: 'hentaila',
      providerName: isVip ? 'HentaiLA (VIP)' : `HentaiLA (${serverName})`,
      serverName: isVip ? 'VIP' : serverName,
      url: rawUrl,
      language: lang,
      quality: '1080p',
      type: 'embed',
      direct: false,
      score,
      status: 'AVAILABLE'
    });
  };

  if (typeof payload === 'object') {
    const root = (payload as any).nodes ? extractSvelteKitNodeRoot(payload) : payload;
    if (root && typeof root === 'object') {
      for (const bucketKey of ['embeds', 'downloads'] as const) {
        const bucket = (root as any)[bucketKey];
        if (!bucket || typeof bucket !== 'object') continue;
        for (const [langKey, arr] of Object.entries(bucket)) {
          if (!Array.isArray(arr)) continue;
          const lang: 'SUB' | 'LATINO' = /dub|lat/i.test(langKey) ? 'LATINO' : 'SUB';
          for (const item of arr) {
            if (item && typeof item === 'object') {
              pushEntry(String((item as any).server || ''), String((item as any).url || ''), lang);
            }
          }
        }
      }
    }
    return results;
  }

  if (typeof payload === 'string') {
    const html = payload;
    const embStr = extractBalancedJsObject(html, 'embeds:');
    const dlStr = extractBalancedJsObject(html, 'downloads:');
    const extractFromStr = (sourceStr: string | null) => {
      if (!sourceStr) return;
      const itemRegex = /\{\s*server:\s*["']([^"']+)["']\s*,\s*url:\s*["']([^"']+)["']\s*\}/g;
      let m: RegExpExecArray | null;
      while ((m = itemRegex.exec(sourceStr)) !== null) {
        pushEntry(m[1], m[2], 'SUB');
      }
    };
    extractFromStr(embStr);
    extractFromStr(dlStr);

    if (results.length === 0) {
      const iframeMatch = html.match(/<iframe[^>]+src=["'](https?:\/\/cdn\.dotanborito\.net\/play\/[a-f0-9]{32})["']/i);
      if (iframeMatch?.[1]) {
        pushEntry('VIP', iframeMatch[1], 'SUB');
      }
    }
  }

  return results;
}

export function parseHentaiJkEpisodeSources(html: string): AnimeSourceCandidate[] {
  if (!html) return [];
  const results: AnimeSourceCandidate[] = [];

  const srvMatch = html.match(/var\s+servers\s*=\s*(\[[\s\S]*?\])\s*;/i);
  if (srvMatch?.[1]) {
    try {
      const parsed = JSON.parse(srvMatch[1]) as Array<{ server?: string; remote?: string }>;
      for (const item of parsed) {
        const rawServer = String(item?.server || '').trim();
        const rawRemote = String(item?.remote || '').trim();
        if (!rawRemote || /^mediafire$/i.test(rawServer) || /^streamtape$/i.test(rawServer)) continue;
        const decoded = normalizeKnownEmbedUrl(decodeBase64Safe(rawRemote) || rawRemote);
        if (!decoded) continue;
        const serverName = normalizePortalServerName(rawServer, decoded);
        if (isBlockedOrUnsafeStreamHost(decoded, serverName)) continue;
        results.push({
          providerId: 'hentaijk',
          providerName: `HentaiJK (${serverName})`,
          serverName,
          url: decoded,
          language: 'SUB',
          quality: '1080p',
          type: 'embed',
          direct: false,
          score: getServerBaseScore(serverName) + 14,
          status: 'AVAILABLE'
        });
      }
    } catch {
      // ignore malformed JSON
    }
  }

  const desuMatch = html.match(/video\[0\]\s*=\s*.*?src=["']([^"']+)["']/i);
  const desuvMatch = html.match(/video\[1\]\s*=\s*.*?src=["']([^"']+)["']/i);
  if (desuMatch?.[1] && !isBlockedOrUnsafeStreamHost(desuMatch[1], 'Desu')) {
    results.push({
      providerId: 'hentaijk',
      providerName: 'HentaiJK (Desu)',
      serverName: 'Desu',
      url: unescapeJsonSlashes(desuMatch[1]),
      language: 'SUB',
      quality: '1080p',
      type: 'embed',
      direct: false,
      score: 132,
      status: 'AVAILABLE'
    });
  }
  if (desuvMatch?.[1] && !isBlockedOrUnsafeStreamHost(desuvMatch[1], 'Desuv')) {
    results.push({
      providerId: 'hentaijk',
      providerName: 'HentaiJK (Desuv)',
      serverName: 'Desuv',
      url: unescapeJsonSlashes(desuvMatch[1]),
      language: 'SUB',
      quality: '1080p',
      type: 'embed',
      direct: false,
      score: 130,
      status: 'AVAILABLE'
    });
  }

  return results;
}



