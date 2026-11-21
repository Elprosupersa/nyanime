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
  externalOnly?: boolean;
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

const NON_EMBEDDABLE_HOST_PATTERNS: readonly RegExp[] = [
  /(?:^|\/\/|\.)transfer\.it(?:\/|$)/i,
  /fireload\.com/i,
  /mediafire\.com/i,
  /gofile\.io/i,
  /pixeldrain\.com/i,
  /krakenfiles\.com/i,
  /qiwi\.gg/i,
  /buzzheavier\.com/i,
  /send\.cm/i,
  /megaup\.net/i,
  /workupload\.com/i,
  /katfile\./i,
  /rapidgator\./i,
  /nitroflare\./i,
  /hexupload\./i
];

export function isNonEmbeddableHost(url: string, serverName = ''): boolean {
  const u = String(url || '').toLowerCase().trim();
  const s = String(serverName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (
    s === 'transferit' ||
    s === 'fireload' ||
    s === 'mediafire' ||
    s === 'gofile' ||
    s === 'pixeldrain' ||
    s === 'krakenfiles' ||
    s === 'qiwi' ||
    s === 'buzzheavier' ||
    s === 'sendcm' ||
    s === 'megaup' ||
    s === '1fichier'
  ) {
    return true;
  }
  return NON_EMBEDDABLE_HOST_PATTERNS.some((rx) => rx.test(u));
}

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

export const JKANIME_PROVIDER_BONUS = 14;

const SERVER_RELIABILITY_SCORES: Record<string, number> = {
  // Tier 1: Native HLS 1080p Ad-Free (JKAnime Desu/Desuka & VIP Dotanborito)
  desu: 156,
  desuv: 154,
  desuka: 152,
  vip: 150,
  dotanborito: 150,
  // Tier 2: Direct MP4 Ad-Free (always above Archive.org & Mega)
  mp4upload: 146,
  yourupload: 142,
  // Tier 3: Extractable HLS cyberlockers
  streamwish: 132,
  flaswish: 132,
  wish: 130,
  vidhide: 128,
  filelions: 126,
  ryderjet: 126,
  // Tier 4: Verified Spanish Archive.org Direct MP4 (below MP4Upload/YourUpload/verified HLS, above embeds)
  archivedirect: 122,
  // Tier 5: Verified fallback embeds (sandboxed Filemoon/Mega first, then Okru/Archive Embed/MixDrop/Byse/Uqload/Lulu/Dood)
  filemoon: 102,
  mega: 98,
  okru: 94,
  archiveembed: 86,
  mixdrop: 84,
  mxdrop: 84,
  byse: 82,
  bysekoze: 82,
  byselapuix: 82,
  bysesukior: 82,
  uqload: 80,
  savefiles: 80,
  lulustream: 78,
  luluvdo: 78,
  lulu: 78,
  doodstream: 76,
  hls: 70,
  zilla: 70,
  vidguard: 68,
  stream: 66,
  multiembed: 62,
  vidsrc: 60,
  // Tier 6: Non-embeddable external hosts (never auto-selected)
  transferit: -120
};

export function getServerBaseScore(serverName: string): number {
  const key = String(serverName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  for (const [k, s] of Object.entries(SERVER_RELIABILITY_SCORES)) {
    if (k === 'vip') {
      if (key === 'vip' || key === 'jkanimevip' || key === 'hentailavip') return s;
      continue;
    }
    if (key.includes(k)) return s;
  }
  return 74;
}

export interface NormalizeSlugOptions {
  joinApostrophes?: boolean;
}

export function normalizeSlugText(raw: string, options?: NormalizeSlugOptions): string {
  const input = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00d7/g, ' x ')
    .replace(/\((?:tv|ona|ova)\)/gi, ' ');

  const apostropheHandled = options?.joinApostrophes
    ? input.replace(/([a-z0-9])[’'\u2018\u2019\u02bc]([a-z0-9])/g, '$1$2')
    : input;

  return apostropheHandled
    .replace(/[:’'\u2018\u2019\u02bc"–—_]/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function extractMainTitleSegments(raw: string): string[] {
  const trimmed = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return [];

  const seen = new Set<string>([trimmed.toLowerCase()]);
  const segments: string[] = [];

  const pushSegment = (candidate: string) => {
    const cleaned = candidate
      .replace(/\((?:tv|ona|ova)\)\s*$/gi, '')
      .replace(/[:\-–—\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length < 3) return;

    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      segments.push(cleaned);
    }

    if (/\s+the\s+animation$/i.test(cleaned)) {
      const withoutAnim = cleaned
        .replace(/\s+the\s+animation$/i, '')
        .replace(/[:\-–—\s]+$/g, '')
        .trim();
      const animKey = withoutAnim.toLowerCase();
      if (withoutAnim.length >= 3 && !seen.has(animKey)) {
        seen.add(animKey);
        segments.push(withoutAnim);
      }
    }
  };

  // Pre-colon main title (index >= 3 avoids splitting short prefixes like "Re:Zero" or "Re:Creators")
  const colonIdx = trimmed.indexOf(':', 3);
  if (colonIdx > 2) {
    const beforeColon = trimmed.slice(0, colonIdx);
    pushSegment(beforeColon);
    const beforeColonDash = beforeColon.match(/^(.{3,}?)\s+[-–—]\s+.+$/);
    if (beforeColonDash?.[1]) {
      pushSegment(beforeColonDash[1]);
    }
  }

  // Spaced dash subtitle ("Title - Subtitle", "Title – Subtitle", "Title — Subtitle")
  const dashMatch = trimmed.match(/^(.{3,}?)\s+[-–—]\s+.+$/);
  if (dashMatch?.[1]) {
    pushSegment(dashMatch[1]);
  }

  // Parenthetical subtitle ("Title (Long Subtitle)") excluding short format tags
  const parenMatch = trimmed.match(/^(.{3,}?)\s*\((?!(?:tv|ona|ova)\s*\))([^)]{3,})\)\s*$/i);
  if (parenMatch?.[1]) {
    pushSegment(parenMatch[1]);
  }

  // Trailing "The Animation" on titles without a colon/dash
  if (/\s+the\s+animation$/i.test(trimmed)) {
    pushSegment(trimmed.replace(/\s+the\s+animation$/i, ''));
  }

  return segments;
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
  const secondaryVariants = new Set<string>();
  const suffixVariants = new Set<string>();
  const extraSynonyms = Array.isArray(synonyms)
    ? synonyms.filter((v): v is string => Boolean(v && v.trim())).slice(0, 4)
    : [];
  const titles = [romaji, seasonTitle, english, ...extraSynonyms].filter((v): v is string =>
    Boolean(v && v.trim())
  );

  const addSeasonSlugs = (targetSet: Set<string>, slugBase: string, rawBase?: string) => {
    const clean = stripSeasonModifiersFromSlug(slugBase);
    if (!clean) return;
    targetSet.add(`${clean}-${seasonNum === 2 ? '2nd' : seasonNum === 3 ? '3rd' : `${seasonNum}th`}-season`);
    targetSet.add(`${clean}-season-${seasonNum}`);
    if (seasonNum === 2) {
      targetSet.add(`${clean}-segunda-temporada`);
      targetSet.add(`${clean}-2`);
      suffixVariants.add(`${clean}-ii`);
      suffixVariants.add(`${clean}-part-2`);
      suffixVariants.add(`${clean}-parte-2`);
    } else if (seasonNum === 3) {
      targetSet.add(`${clean}-tercera-temporada`);
      targetSet.add(`${clean}-3`);
      suffixVariants.add(`${clean}-iii`);
    } else if (seasonNum === 4) {
      targetSet.add(`${clean}-cuarta-temporada`);
      targetSet.add(`${clean}-4`);
      suffixVariants.add(`${clean}-iv`);
    } else {
      targetSet.add(`${clean}-temporada-${seasonNum}`);
    }
    if (rawBase) targetSet.add(rawBase);
  };

  for (const raw of titles) {
    const base = normalizeSlugText(raw);
    if (!base) continue;

    const joinedBase = normalizeSlugText(raw, { joinApostrophes: true });
    const cleanBase = stripSeasonModifiersFromSlug(base);
    const mainSegments = extractMainTitleSegments(raw);

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
      }

      if (joinedBase && joinedBase !== base) {
        secondaryVariants.add(joinedBase);
        const cleanJoined = stripSeasonModifiersFromSlug(joinedBase);
        if (cleanJoined) {
          secondaryVariants.add(cleanJoined);
          suffixVariants.add(`${cleanJoined}-tv`);
        }
      }

      for (const seg of mainSegments) {
        const segJoined = normalizeSlugText(seg, { joinApostrophes: true });
        const segHyphen = normalizeSlugText(seg);
        if (segJoined) {
          secondaryVariants.add(segJoined);
          secondaryVariants.add(segJoined.replace(/re-zero/g, 'rezero'));
          secondaryVariants.add(segJoined.replace(/high-school/g, 'highschool'));
          const cleanSegJoined = stripSeasonModifiersFromSlug(segJoined);
          if (cleanSegJoined) secondaryVariants.add(cleanSegJoined);
        }
        if (segHyphen && segHyphen !== segJoined) {
          secondaryVariants.add(segHyphen);
          secondaryVariants.add(segHyphen.replace(/re-zero/g, 'rezero'));
          secondaryVariants.add(segHyphen.replace(/high-school/g, 'highschool'));
          const cleanSegHyphen = stripSeasonModifiersFromSlug(segHyphen);
          if (cleanSegHyphen) secondaryVariants.add(cleanSegHyphen);
        }
      }
    } else if (cleanBase) {
      addSeasonSlugs(candidates, base, base);
      if (joinedBase && joinedBase !== base) {
        addSeasonSlugs(secondaryVariants, joinedBase, joinedBase);
      }
      for (const seg of mainSegments) {
        const segJoined = normalizeSlugText(seg, { joinApostrophes: true });
        const segHyphen = normalizeSlugText(seg);
        if (segJoined) addSeasonSlugs(secondaryVariants, segJoined);
        if (segHyphen && segHyphen !== segJoined) addSeasonSlugs(secondaryVariants, segHyphen);
      }
    }
  }

  for (const v of secondaryVariants) candidates.add(v);
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
  const joinInnerApostrophes = (text: string) =>
    text.replace(/([a-zA-Z0-9])[’'\u2018\u2019\u02bc]([a-zA-Z0-9])/g, '$1$2');

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
      const colonJoined = base.replace(/\b([a-zA-Z]{2,}):([a-zA-Z0-9]{2,})\b/g, '$1$2');
      if (colonJoined !== base) {
        const joinedHead = colonJoined.split(/[\s\-:]+/)[0]?.trim() || '';
        if (joinedHead.length >= 4) pushQuery(joinedHead);
      }
      const beforeColon = base.split(':')[0]?.trim() || '';
      if (beforeColon.length >= 3) {
        const cleanedBeforeColon = beforeColon.replace(/;/g, ' ');
        pushQuery(cleanedBeforeColon);
        const withoutAnim = cleanedBeforeColon.replace(/\s+the\s+animation$/i, '').trim();
        if (withoutAnim.length >= 3 && withoutAnim !== cleanedBeforeColon) {
          pushQuery(withoutAnim);
        }
        const apostropheJoinedMain = joinInnerApostrophes(withoutAnim || cleanedBeforeColon);
        if (apostropheJoinedMain !== (withoutAnim || cleanedBeforeColon)) {
          pushQuery(apostropheJoinedMain);
        }
      }
    } else {
      const dashMain = base.match(/^(.{3,}?)\s+[-–—]\s+.+$/)?.[1]?.trim() || '';
      if (dashMain.length >= 3) {
        pushQuery(dashMain);
      }
      const withoutAnim = base.replace(/\s+the\s+animation$/i, '').trim();
      if (withoutAnim.length >= 3 && withoutAnim !== base) {
        pushQuery(withoutAnim);
      }
      const apostropheJoined = joinInnerApostrophes(withoutAnim || base);
      if (apostropheJoined !== (withoutAnim || base)) {
        pushQuery(apostropheJoined);
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
  'no', 'wa', 'ga', 'ni', 'wo', 'to', 'de', 'ka', 'na', 'kara', 'x',
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

export interface SlugMatchMetadata {
  episodes?: number | null;
  seasonYear?: number | null;
}

const NON_TV_SPECIAL_TERMS: readonly string[] = [
  'movie',
  'pelicula',
  'peliculas',
  'film',
  'ova',
  'ovas',
  'oad',
  'special',
  'specials',
  'especial',
  'especiales',
  'recap',
  'gaiden',
  'mugenjou',
  'ressha',
  '4-koma',
  'gekijou',
  'gekijouban',
  'memory-snow',
  'hyouketsu',
  'kizuna',
  'bonds-of-ice',
  'frozen-bond',
  'break-time',
  'petit',
  'mini',
  'chibi',
  'shorts',
  'short',
  'omake',
  'shin-henshuu-ban',
  'directors-cut',
  'director-cut',
  'picture-drama',
  'summary',
  'recopilacion',
  'mahou-tei-no-ken',
  'sword-of-the-wizard-king'
];

const NON_TV_SPECIAL_REGEX = new RegExp(
  `(?:^|-)(${NON_TV_SPECIAL_TERMS.join('|')})(?:-|$)`,
  'gi'
);

const ANY_LATER_SEASON_REGEX =
  /(?:2nd|3rd|4th|5th|season-[2-9]|temporada-[2-9]|segunda-temporada|tercera-temporada|cuarta-temporada|part-[2-9]|parte-[2-9]|cour-[2-9]|-s[2-9](?:-|$)|-[2-9]$|-ii(?:-|$)|-iii(?:-|$)|-iv(?:-|$))/i;

function slugHasUnrequestedSpecialKeyword(slug: string, normalizedTargets: string[]): boolean {
  NON_TV_SPECIAL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NON_TV_SPECIAL_REGEX.exec(slug)) !== null) {
    const term = String(match[1] || '').toLowerCase();
    if (!term) continue;
    const targetRequestedTerm = normalizedTargets.some(
      (nt) => nt === term || nt.includes(`-${term}`) || nt.includes(`${term}-`) || nt.includes(term)
    );
    if (!targetRequestedTerm) {
      return true;
    }
  }
  return false;
}

export function pickBestSlugMatch(
  foundSlugs: string[],
  targets: string[],
  seasonNum = 1,
  formatHint = '',
  meta?: SlugMatchMetadata
): string | null {
  if (!foundSlugs || foundSlugs.length === 0) return null;
  const cleanTargets = (targets || []).filter((t): t is string => Boolean(t && t.trim()));
  if (cleanTargets.length === 0) return null;

  const seasonMarkerRegex =
    seasonNum === 2
      ? /(2nd|season-2|temporada-2|segunda-temporada|part-2|parte-2|-s2(?:-|$)|-2$|-ii(?:-|$))/i
      : seasonNum === 3
        ? /(3rd|season-3|temporada-3|tercera-temporada|part-3|parte-3|-s3(?:-|$)|-3$|-iii(?:-|$))/i
        : seasonNum === 4
          ? /(4th|season-4|temporada-4|cuarta-temporada|part-4|parte-4|-s4(?:-|$)|-4$|-iv(?:-|$))/i
          : seasonNum > 4
            ? new RegExp(`(${seasonNum}th|season-${seasonNum}|temporada-${seasonNum}|-s${seasonNum}(?:-|$)|-${seasonNum}$)`, 'i')
            : null;

  const normFormat = String(formatHint || '').trim().toUpperCase();
  const wantsMovie =
    /^(OVA|MOVIE|ONA|SPECIAL)$/i.test(normFormat) ||
    cleanTargets.some((t) => /\b(movie|pelicula|film|ova|oad|special|especial|gaiden|memory\s+snow|hyouketsu|break\s+time|directors?\s+cut)\b/i.test(t));
  const isTvRequest =
    !wantsMovie && (normFormat === '' || normFormat === 'TV' || normFormat === 'TV_SHORT' || (Number(meta?.episodes || 0) >= 6));
  const expectedSeasonTokens = getExpectedSeasonTokens(seasonNum);
  const normalizedTargets = cleanTargets.flatMap((t) => {
    const h = normalizeSlugText(t);
    const j = normalizeSlugText(t, { joinApostrophes: true });
    return j && j !== h ? [h, j] : [h];
  });

  interface MainTitleProfile {
    slugs: Set<string>;
    sigTokens: Set<string>;
    sigOrder: string[];
  }

  interface PreparedTarget {
    exactSlugs: Set<string>;
    beforeColonSlug: string;
    usesNumberedSeasonTitle: boolean;
    hasDistinctSubtitle: boolean;
    allTokens: Set<string>;
    sigTokens: Set<string>;
    sigOrder: string[];
    compounds: Map<string, [string, string]>;
    apostropheCompounds: Map<string, string[]>;
    mainTitleProfiles: MainTitleProfile[];
  }

  const tokenizeSlugParts = (normSlug: string): string[] =>
    normSlug
      .split('-')
      .filter((tok) => (tok.length >= 2 || tok === '0' || tok === 'x') && !['season', 'the', 'part', 'cour', 'movie', 'tv'].includes(tok));

  const extractSigOrder = (parts: string[]): string[] => {
    const sig = parts.filter(
      (tok) => (tok.length >= 2 || tok === '0') && !SLUG_STOPWORDS.has(tok) && (!/^\d+(?:st|nd|rd|th)?$/.test(tok) || tok === '0')
    );
    return sig.length > 0 ? sig : parts.filter((tok) => tok.length >= 2 || tok === '0');
  };

  const addSlugVariantsToSet = (targetSet: Set<string>, s: string) => {
    if (!s) return;
    targetSet.add(s);
    if (s.includes('re-zero')) targetSet.add(s.replace(/re-zero/g, 'rezero'));
    if (s.includes('high-school')) targetSet.add(s.replace(/high-school/g, 'highschool'));
  };

  const preparedTargets: PreparedTarget[] = cleanTargets.map((t) => {
    const exactSlugs = new Set<string>();
    const norm = normalizeSlugText(t);
    const joinedNorm = normalizeSlugText(t, { joinApostrophes: true });
    const usesNumberedSeasonTitle =
      /\b(?:2nd|3rd|4th|5th|\d+th)\s+season\b|\bseason\s+[2-9]\b|\btemporada\s+[2-9]\b/i.test(t) ||
      (seasonNum > 1 && /\s+(?:ii|iii|iv|[2-9])$/i.test(t.trim()));
    const colonIdx = t.indexOf(':', 3);
    const beforeColonSlug = colonIdx > 2 ? normalizeSlugText(t.slice(0, colonIdx)) : '';
    const hasDistinctSubtitle =
      !usesNumberedSeasonTitle &&
      (colonIdx > 2 || /\b(hen|arc|chapter|saga|part|cour|final|shippuuden|alchemist|brotherhood|alicization)\b/i.test(t));

    if (norm) {
      addSlugVariantsToSet(exactSlugs, norm);
      if (seasonNum === 1) {
        const stripped = stripSeasonModifiersFromSlug(norm);
        if (stripped) addSlugVariantsToSet(exactSlugs, stripped);
      }
    }
    if (joinedNorm && joinedNorm !== norm) {
      addSlugVariantsToSet(exactSlugs, joinedNorm);
      if (seasonNum === 1) {
        const strippedJoined = stripSeasonModifiersFromSlug(joinedNorm);
        if (strippedJoined) addSlugVariantsToSet(exactSlugs, strippedJoined);
      }
    }
    if (t.includes(';')) {
      const semiJoined = normalizeSlugText(t.replace(/;/g, ''));
      if (semiJoined) addSlugVariantsToSet(exactSlugs, semiJoined);
    }

    const parts = tokenizeSlugParts(norm);
    const allTokens = new Set<string>(parts);
    const sigOrder = extractSigOrder(parts);
    const sigTokens = new Set<string>(sigOrder);

    const compounds = new Map<string, [string, string]>();
    for (let i = 0; i + 1 < parts.length; i++) {
      compounds.set(`${parts[i]}${parts[i + 1]}`, [parts[i], parts[i + 1]]);
    }

    // Build apostrophe contraction map (e.g. "Kan'ochi" -> kanochi => ['kan', 'ochi'], "D'Artagnan" -> dartagnan => ['artagnan'])
    const apostropheCompounds = new Map<string, string[]>();
    const rawApostropheWords = t.match(/[a-zA-Z0-9\u00C0-\u024F]+[’'\u2018\u2019\u02bc][a-zA-Z0-9\u00C0-\u024F]+/g) || [];
    for (const word of rawApostropheWords) {
      const joinedWord = normalizeSlugText(word, { joinApostrophes: true });
      const rawSplitParts = normalizeSlugText(word).split('-').filter(Boolean);
      const meaningfulSplitParts = rawSplitParts.filter((tok) => tok.length >= 2 || tok === '0');
      if (joinedWord && meaningfulSplitParts.length > 0) {
        apostropheCompounds.set(joinedWord, meaningfulSplitParts);
        // Allow 1-char split prefix (like 'd' in "d-artagnan") as non-foreign token when target explicitly had "D'Artagnan"
        for (const sp of rawSplitParts) {
          if (sp.length === 1) allTokens.add(sp);
        }
      }
    }

    const mainSegments = extractMainTitleSegments(t);
    const mainTitleProfiles: MainTitleProfile[] = mainSegments.map((seg) => {
      const segNorm = normalizeSlugText(seg);
      const segJoined = normalizeSlugText(seg, { joinApostrophes: true });
      const slugs = new Set<string>();
      addSlugVariantsToSet(slugs, segNorm);
      addSlugVariantsToSet(slugs, segJoined);
      if (seasonNum === 1) {
        addSlugVariantsToSet(slugs, stripSeasonModifiersFromSlug(segNorm));
        addSlugVariantsToSet(slugs, stripSeasonModifiersFromSlug(segJoined));
      }
      const segParts = tokenizeSlugParts(segNorm);
      const segSigOrder = extractSigOrder(segParts);
      return {
        slugs,
        sigTokens: new Set<string>(segSigOrder),
        sigOrder: segSigOrder
      };
    });

    return {
      exactSlugs,
      beforeColonSlug,
      usesNumberedSeasonTitle,
      hasDistinctSubtitle,
      allTokens,
      sigTokens,
      sigOrder,
      compounds,
      apostropheCompounds,
      mainTitleProfiles
    };
  });

  let bestSlug: string | null = null;
  let bestScore = -999;

  for (const slug of foundSlugs) {
    if (!wantsMovie && slugHasUnrequestedSpecialKeyword(slug, normalizedTargets)) {
      continue;
    }

    const slugTokens = slug.split('-').filter(Boolean);
    const firstTok = slugTokens[0] || '';
    const hasAnyLaterSeasonMarker = ANY_LATER_SEASON_REGEX.test(slug);
    const slugYearMatch = slug.match(/-(19\d\d|20\d\d)$/);
    const slugYear = slugYearMatch ? Number(slugYearMatch[1]) : null;

    // Strictly reject sequel slugs when requesting Season 1 (unless the requested title itself contains that sequel marker)
    if (seasonNum === 1 && hasAnyLaterSeasonMarker && !normalizedTargets.some((nt) => ANY_LATER_SEASON_REGEX.test(nt))) {
      continue;
    }

    // Strictly reject wrong sequel numbers (e.g. Season 3/4 when requesting Season 2)
    if (seasonNum > 1 && hasAnyLaterSeasonMarker && seasonMarkerRegex && !seasonMarkerRegex.test(slug)) {
      continue;
    }

    for (const pt of preparedTargets) {
      let score = 0;
      let extraTokens = 0;
      let nonYearExtraTokens = 0;
      let matchedCount = 0;
      const sigMatched = new Set<string>();
      const matchedSeqTokens: string[] = [];

      const strippedSlug = slug.replace(/-(?:tv|ova|ona|movie|pelicula|film|special)$/i, '');
      const isExact =
        pt.exactSlugs.has(slug) ||
        (seasonNum === 1 && pt.exactSlugs.has(strippedSlug));

      if (isExact) {
        score += 60;
      }

      for (let i = 0; i < slugTokens.length; i++) {
        const st = slugTokens[i];
        const nextSt = i + 1 < slugTokens.length ? slugTokens[i + 1] : '';
        const joinedPair = nextSt ? `${st}${nextSt}` : '';

        if (pt.allTokens.has(st)) {
          score += pt.sigTokens.has(st) ? 14 : 6;
          matchedCount++;
          if (pt.sigTokens.has(st)) {
            sigMatched.add(st);
            matchedSeqTokens.push(st);
          }
        } else if (pt.apostropheCompounds.has(st)) {
          const apParts = pt.apostropheCompounds.get(st)!;
          score += apParts.length >= 2 ? 24 : 14;
          matchedCount += Math.max(1, apParts.length);
          for (const ap of apParts) {
            if (pt.sigTokens.has(ap)) {
              sigMatched.add(ap);
              matchedSeqTokens.push(ap);
            }
          }
        } else if (joinedPair && pt.allTokens.has(joinedPair)) {
          score += pt.sigTokens.has(joinedPair) ? 22 : 12;
          matchedCount += 2;
          if (pt.sigTokens.has(joinedPair)) {
            sigMatched.add(joinedPair);
            matchedSeqTokens.push(joinedPair);
          }
          i++; // consume nextSt as part of compound match
        } else if (pt.compounds.has(st)) {
          score += 24;
          matchedCount += 2;
          const pair = pt.compounds.get(st)!;
          if (pt.sigTokens.has(pair[0])) {
            sigMatched.add(pair[0]);
            matchedSeqTokens.push(pair[0]);
          }
          if (pt.sigTokens.has(pair[1])) {
            sigMatched.add(pair[1]);
            matchedSeqTokens.push(pair[1]);
          }
        } else if (SLUG_META_SUFFIXES.has(st)) {
          if (st === 'tv' && seasonNum === 1 && !wantsMovie) score += 6;
          else if (wantsMovie && ['ova', 'ona', 'movie', 'pelicula', 'film', 'special'].includes(st)) score += 10;
        } else if (seasonNum > 1 && expectedSeasonTokens.has(st)) {
          score += 8;
        } else if (st.length >= 1) {
          extraTokens++;
          if (!/^(19\d\d|20\d\d)$/.test(st)) {
            nonYearExtraTokens++;
          }
        }
      }

      if (matchedCount === 0 || (pt.sigTokens.size > 0 && sigMatched.size === 0)) {
        continue;
      }

      // Evaluate main-title (pre-subtitle) coverage & consecutive front-of-title alignment
      let isExactMainTitle = false;
      let matchesMainTitle = false;
      let matchesFrontConsecutive = false;

      for (const profile of pt.mainTitleProfiles) {
        if (profile.slugs.has(slug) || (seasonNum === 1 && profile.slugs.has(strippedSlug))) {
          isExactMainTitle = true;
          matchesMainTitle = true;
          matchesFrontConsecutive = true;
          break;
        }

        let profileSigMatched = 0;
        for (const tok of profile.sigTokens) {
          if (sigMatched.has(tok)) profileSigMatched++;
        }

        let maxRun = 0;
        let currentRun = 0;
        let cursor = 0;
        for (const tok of profile.sigOrder) {
          if (sigMatched.has(tok)) {
            const pos = matchedSeqTokens.indexOf(tok, cursor);
            if (pos !== -1) {
              currentRun++;
              cursor = pos + 1;
              if (currentRun > maxRun) maxRun = currentRun;
            } else {
              currentRun = 0;
            }
          } else {
            currentRun = 0;
          }
        }

        const meets75Pct =
          profile.sigTokens.size >= 2 &&
          profileSigMatched >= Math.ceil(profile.sigTokens.size * 0.75);
        const meetsConsecutiveMin =
          profile.sigOrder.length >= 3 &&
          maxRun >= 3 &&
          profileSigMatched >= Math.ceil(profile.sigTokens.size * 0.6);

        if (meets75Pct || meetsConsecutiveMin) {
          matchesMainTitle = true;
          if (maxRun >= 2 && matchedSeqTokens[0] === profile.sigOrder[0]) {
            matchesFrontConsecutive = true;
          }
        }
      }

      // A main-title match only bypasses the 65% full-title coverage guard when ZERO foreign (non-year) words are introduced
      const canAcceptViaMainTitle = matchesMainTitle && nonYearExtraTokens === 0;

      const firstPair = slugTokens.length >= 2 ? `${slugTokens[0]}${slugTokens[1]}` : '';
      if (
        !pt.allTokens.has(firstTok) &&
        !pt.apostropheCompounds.has(firstTok) &&
        !pt.compounds.has(firstTok) &&
        (!firstPair || !pt.allTokens.has(firstPair)) &&
        extraTokens >= 2
      ) {
        continue;
      }

      // For TV Season 1 requests, reject slugs with 2+ extra unrequested subtitle/spin-off words (e.g. OVAs/specials/movies with custom subtitles)
      if (isTvRequest && seasonNum === 1 && !isExact && nonYearExtraTokens >= 2) {
        continue;
      }

      // Reject unrelated titles that share only 1 word or low token coverage while adding foreign words (e.g. hagane-orchestra, shingeki-no-bahamut)
      if (!isExact && extraTokens >= 1) {
        if (pt.sigTokens.size === 1) {
          // Allow 1-word title only if first token matches and the sole extra token is a 4-digit release year (e.g. hunter-x-hunter-2011, berserk-2016)
          const onlyYearExtra =
            extraTokens === 1 &&
            (pt.allTokens.has(firstTok) || pt.apostropheCompounds.has(firstTok)) &&
            /^(19\d\d|20\d\d)$/.test(slugTokens[slugTokens.length - 1] || '');
          if (!onlyYearExtra) {
            continue;
          }
        }
        if (pt.sigTokens.size >= 2 && sigMatched.size < 2) {
          continue;
        }
        if (pt.sigTokens.size >= 3 && sigMatched.size < Math.ceil(pt.sigTokens.size * 0.65) && !canAcceptViaMainTitle) {
          continue;
        }
      }

      // Reject single-token partial match on a 3+ word title unless it is the exact pre-colon/main title
      if (!isExact && !isExactMainTitle && pt.sigTokens.size >= 3 && sigMatched.size <= 1 && slug !== pt.beforeColonSlug) {
        continue;
      }

      score -= extraTokens * 16;

      // Award a front/main-title match bonus for Season 1 (kept strictly below isExact's +60 so full exact matches still win)
      if (seasonNum === 1 && nonYearExtraTokens === 0 && !hasAnyLaterSeasonMarker) {
        if (isExactMainTitle) {
          score += 22;
        } else if (matchesMainTitle) {
          score += matchesFrontConsecutive ? 16 : 12;
        } else if (
          !isExact &&
          pt.sigOrder.length >= 2 &&
          matchedSeqTokens.length >= 2 &&
          matchedSeqTokens[0] === pt.sigOrder[0] &&
          matchedSeqTokens[1] === pt.sigOrder[1]
        ) {
          score += 8;
        }
      }

      if (slugYear && meta?.seasonYear && Number.isFinite(meta.seasonYear)) {
        const diff = Math.abs(slugYear - Number(meta.seasonYear));
        if (diff <= 1) score += 16;
        else if (diff >= 2) score -= 35;
      }

      if (seasonNum === 1) {
        if (!hasAnyLaterSeasonMarker) {
          score += 18;
        } else {
          score -= 70;
        }
      } else if (seasonMarkerRegex && seasonMarkerRegex.test(slug)) {
        score += 32;
      } else if (hasAnyLaterSeasonMarker) {
        score -= 70;
      } else if (
        pt.hasDistinctSubtitle &&
        !pt.usesNumberedSeasonTitle &&
        (isExact || (pt.sigTokens.size >= 3 && sigMatched.size >= Math.ceil(pt.sigTokens.size * 0.75))) &&
        slug !== pt.beforeColonSlug &&
        !isExactMainTitle
      ) {
        // Subtitle-named sequel season (e.g. "Kimetsu no Yaiba: Yuukaku-hen", "Bleach: Sennen Kessen-hen", "Dr. STONE: New World")
        score += 18;
      } else if (pt.usesNumberedSeasonTitle || isExactMainTitle || slug === pt.beforeColonSlug) {
        // Strictly reject bare Season 1 slugs when requesting Season 2+ (even on long titles where token score > 70)
        continue;
      } else {
        score -= 36;
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
  // Convert legacy mega.nz/#!<id>!<key>, mega.nz/embed#!<id>!<key>, or mega.nz/embed/!<id>!<key> -> mega.nz/embed/<id>#<key>
  const megaLegacyMatch = u.match(
    /^https?:\/\/(?:www\.)?mega(?:\.co)?\.nz\/(?:embed\/?)?#?!([a-zA-Z0-9_-]+)(?:!([a-zA-Z0-9_-]+))?/i
  );
  if (megaLegacyMatch?.[1]) {
    const keyPart = megaLegacyMatch[2] ? `#${megaLegacyMatch[2]}` : '';
    return `https://mega.nz/embed/${megaLegacyMatch[1]}${keyPart}`;
  }
  // Convert mp4upload.com/<id> -> www.mp4upload.com/embed-<id>.html
  const mp4Short = u.match(/^https?:\/\/(?:www\.)?mp4upload\.com\/([a-z0-9]{10,16})$/i);
  if (mp4Short?.[1]) {
    return `https://www.mp4upload.com/embed-${mp4Short[1]}.html`;
  }
  // Normalize mp4upload embed URL without www
  const mp4Embed = u.match(/^https?:\/\/mp4upload\.com\/(embed-[a-z0-9]+\.html)$/i);
  if (mp4Embed?.[1]) {
    return `https://www.mp4upload.com/${mp4Embed[1]}`;
  }
  // Normalize StreamTape /v/<id> -> /e/<id>
  const streamTapeView = u.match(/^https?:\/\/(?:www\.)?streamtape\.com\/v\/([a-zA-Z0-9_-]+)/i);
  if (streamTapeView?.[1]) {
    return `https://streamtape.com/e/${streamTapeView[1]}`;
  }
  // Normalize Byse /d/<id> -> /e/<id>
  const byseDownload = u.match(/^https?:\/\/(?:www\.)?(byse[a-z0-9]*\.com)\/d\/([a-zA-Z0-9_-]+)/i);
  if (byseDownload?.[1] && byseDownload?.[2]) {
    return `https://${byseDownload[1].toLowerCase()}/e/${byseDownload[2]}`;
  }
  // Normalize dhcplay.com/f/<id> -> streamwish.to/e/<id>
  const dhcPlay = u.match(/^https?:\/\/(?:www\.)?dhcplay\.com\/[fe]\/([a-zA-Z0-9_-]+)/i);
  if (dhcPlay?.[1]) {
    return `https://streamwish.to/e/${dhcPlay[1]}`;
  }
  // Normalize sfastwish.com -> flaswish.com
  if (/^https?:\/\/(?:www\.)?sfastwish\.com\//i.test(u)) {
    return u.replace(/sfastwish\.com/i, 'flaswish.com');
  }
  // Normalize uqload.is / uqload.io -> uqload.vc (canonical non-redirecting host)
  if (/^https?:\/\/(?:www\.)?uqload\.(?:is|io)\//i.test(u)) {
    return u.replace(/uqload\.(?:is|io)/i, 'uqload.vc');
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

  const extractBucket = (
    sourceStr: string | null,
    bucketName: 'DUB' | 'SUB',
    lang: 'LATINO' | 'SUB',
    isDownloadBucket: boolean
  ) => {
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
      const externalOnly = isNonEmbeddableHost(rawUrl, serverName);
      // In downloads bucket, only promote embeddable/extractable players (MP4Upload, Mega embed, etc.)
      // and tag non-embeddable file-hosting links (e.g. TransferIt) explicitly as externalOnly with low score.
      const baseScore = externalOnly
        ? -120
        : getServerBaseScore(serverName) + (isDownloadBucket ? 6 : 12);
      results.push({
        providerId: 'animeav1',
        providerName: `AnimeAV1 (${serverName})`,
        serverName,
        url: rawUrl,
        language: lang,
        quality: '1080p',
        type: 'embed',
        direct: false,
        externalOnly,
        score: baseScore,
        status: 'AVAILABLE'
      });
    }
  };

  extractBucket(objStr, 'SUB', 'SUB', false);
  extractBucket(objStr, 'DUB', 'LATINO', false);
  // Promote ad-free Mega embeds and normalized MP4Upload from AnimeAV1 downloads object
  extractBucket(dlStr, 'SUB', 'SUB', true);
  extractBucket(dlStr, 'DUB', 'LATINO', true);

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
  defaultLanguage: 'SUB' | 'LATINO' = 'SUB',
  pageSlug = ''
): AnimeSourceCandidate[] {
  if (!html) return [];
  const match = html.match(/var\s+videos\s*=\s*(\[[\s\S]*?\])\s*;/i);
  if (!match) return [];

  const pageTitle = extractEmbedTitleFromHtml(html);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1Text = h1Match?.[1] ? h1Match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const resolvedPageLang = detectAudioLanguageFromSignals({
    slug: pageSlug,
    title: `${pageTitle} ${h1Text}`,
    fallback: defaultLanguage
  });
  const baseLang: 'SUB' | 'LATINO' = resolvedPageLang === 'LATINO' ? 'LATINO' : defaultLanguage;

  try {
    const parsed = JSON.parse(match[1]) as Array<[string, string, ...unknown[]]>;
    const list: AnimeSourceCandidate[] = [];
    for (const entry of parsed) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const serverName = String(entry[0] || 'Servidor').trim();
      const rawUrl = normalizeKnownEmbedUrl(String(entry[1] || ''));
      if (isBlockedOrUnsafeStreamHost(rawUrl, serverName)) continue;
      const entryLang = detectAudioLanguageFromSignals({
        url: rawUrl,
        label: serverName,
        fallback: baseLang
      });
      list.push({
        providerId: 'tioanime',
        providerName: `TíoAnime (${serverName})`,
        serverName,
        url: rawUrl,
        language: entryLang === 'LATINO' ? 'LATINO' : baseLang,
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

export interface MonosChinosCatalogEntry {
  rawSlug: string;
  baseSlug: string;
  language: 'SUB' | 'LATINO';
}

export function parseMonosChinosSearchLinks(html: string): MonosChinosCatalogEntry[] {
  if (!html) return [];
  const entries: MonosChinosCatalogEntry[] = [];
  const seen = new Set<string>();
  const rx = /href="(?:https?:\/\/(?:www\.)?monoschinos(?:\.st|2\.(?:com|net)))?\/anime\/([a-z0-9-]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const rawSlug = m[1].toLowerCase().trim();
    if (!rawSlug || seen.has(rawSlug)) continue;
    seen.add(rawSlug);
    const isLat = /(?:^|-)(?:latino|audio-latino|espanol-latino|castellano|dub)(?=$|-)/i.test(rawSlug);
    const baseSlug = rawSlug
      .replace(/-(?:sub-espanol|sub|latino|audio-latino|espanol-latino|castellano)$/i, '')
      .replace(/-+$/g, '');
    if (!baseSlug) continue;
    entries.push({
      rawSlug,
      baseSlug,
      language: isLat ? 'LATINO' : 'SUB'
    });
  }
  return entries;
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
  defaultLanguage: 'SUB' | 'LATINO' = 'SUB',
  pageSlug = ''
): AnimeSourceCandidate[] {
  if (!html) return [];
  const pageLang = detectAudioLanguageFromSignals({
    slug: pageSlug,
    title: extractEmbedTitleFromHtml(html),
    fallback: defaultLanguage
  });
  const baseLang: 'SUB' | 'LATINO' = pageLang === 'LATINO' ? 'LATINO' : defaultLanguage;

  const regex = /data-player="([^"]+)"[^>]*>([^<]*)/gi;
  const list: AnimeSourceCandidate[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const decoded = normalizeKnownEmbedUrl(decodeBase64Safe(m[1]));
    const rawLabel = (m[2] || '').replace(/\s+/g, ' ').trim();
    const serverName = normalizePortalServerName(rawLabel, decoded);
    if (!decoded || isBlockedOrUnsafeStreamHost(decoded, serverName)) continue;
    const externalOnly = isNonEmbeddableHost(decoded, serverName);
    const entryLang = detectAudioLanguageFromSignals({
      url: decoded,
      label: rawLabel,
      fallback: baseLang
    });
    list.push({
      providerId: 'monoschinos',
      providerName: `MonosChinos (${serverName})`,
      serverName,
      url: decoded,
      language: entryLang === 'LATINO' ? 'LATINO' : baseLang,
      quality: '1080p',
      type: 'embed',
      direct: false,
      externalOnly,
      score: externalOnly ? -120 : getServerBaseScore(serverName) + 10,
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
  if (low.includes('filelions') || low.includes('fviplions')) return 'Filelions';
  if (low.includes('vidhide') || low.includes('ryderjet')) return 'Vidhide';
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

export function detectAudioLanguageFromSignals(signals: {
  url?: string;
  slug?: string;
  label?: string;
  title?: string;
  fallback?: 'SUB' | 'LATINO' | 'MULTI';
}): 'SUB' | 'LATINO' | 'MULTI' {
  const fallback = signals.fallback || 'SUB';
  const combined = `${signals.slug || ''} ${signals.url || ''} ${signals.label || ''} ${signals.title || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Strong Latino / Dub markers across URL slugs, HTML tabs, and video titles (e.g. "2433_LAT_1.mp4", "1645 1 DUB", "[Latino]")
  const latRegex =
    /(?:^|[\s_\-./([{"'])(?:lat|latino|espanol[\s._-]*latino|audio[\s._-]*latino|dub|doblado|doblaje|castellano)(?=$|[\s_\-./)\]}"'\d])/i;
  if (latRegex.test(combined) || /_lat_|lat_\d|-latino(?:\b|\/|$)|-dub(?:\b|\/|$)/i.test(combined)) {
    return 'LATINO';
  }

  const subRegex =
    /(?:^|[\s_\-./([{"'])(?:sub|subtitulado|sub[\s._-]*esp|sub[\s._-]*espanol|vose)(?=$|[\s_\-./)\]}"'\d])/i;
  if (subRegex.test(combined)) {
    return 'SUB';
  }

  return fallback;
}

export function parseJkNetEpisodeSources(
  html: string,
  defaultLanguage: 'SUB' | 'LATINO' = 'SUB'
): AnimeSourceCandidate[] {
  if (!html) return [];
  const results: AnimeSourceCandidate[] = [];

  const videoSlots: Array<{ idx: number; label: string }> = [
    { idx: 0, label: 'Desu' },
    { idx: 1, label: 'Desuv' },
    { idx: 2, label: 'Desuka' }
  ];

  for (const slot of videoSlots) {
    const rx = new RegExp(`video\\[${slot.idx}\\]\\s*=\\s*[\\s\\S]{0,180}?src=["']([^"']+)["']`, 'i');
    const m = html.match(rx);
    if (!m?.[1]) continue;
    let url = unescapeJsonSlashes(m[1]);
    if (url.startsWith('/')) {
      url = `https://jkanime.net${url}`;
    }
    url = normalizeKnownEmbedUrl(url);
    if (!url || isBlockedOrUnsafeStreamHost(url, slot.label)) continue;
    const isJkNative = /\/jkplayer\/(?:um|um2|c)/i.test(url) || /playmudos\.com/i.test(url);
    const serverName = isJkNative ? slot.label : normalizePortalServerName(slot.label, url);
    results.push({
      providerId: 'jkanime',
      providerName: `JKAnime (${serverName})`,
      serverName,
      url,
      language: detectAudioLanguageFromSignals({ url, label: serverName, fallback: defaultLanguage }),
      quality: '1080p',
      type: /\.m3u8(\?|$)/i.test(url) ? 'hls' : 'embed',
      direct: /\.m3u8(\?|$)/i.test(url),
      score: getServerBaseScore(serverName) + JKANIME_PROVIDER_BONUS,
      status: 'AVAILABLE'
    });
  }

  const serversMatch = html.match(/var\s+servers\s*=\s*(\[[\s\S]*?\])\s*;/i);
  if (serversMatch?.[1]) {
    try {
      const parsed = JSON.parse(serversMatch[1]) as Array<{
        remote?: string;
        server?: string;
        title?: string;
        lang?: string | number;
      }>;
      if (Array.isArray(parsed)) {
        for (const s of parsed) {
          if (!s?.remote) continue;
          const rawLabel = String(s.server || s.title || '').trim();
          if (/^mediafire$/i.test(rawLabel)) continue;
          const rawRemote = String(s.remote).trim();
          let decoded = /^https?:\/\//i.test(rawRemote) ? rawRemote : decodeBase64Safe(rawRemote);
          if (!decoded) decoded = rawRemote;
          if (decoded.startsWith('/')) {
            decoded = `https://jkanime.net${decoded}`;
          }
          decoded = normalizeKnownEmbedUrl(decoded);
          if (!decoded || !/^https?:\/\//i.test(decoded)) continue;
          const serverName = /\/jkplayer\/(?:um|um2|c)/i.test(decoded)
            ? rawLabel || 'Desu'
            : normalizePortalServerName(rawLabel, decoded);
          if (isBlockedOrUnsafeStreamHost(decoded, serverName)) continue;
          const externalOnly = isNonEmbeddableHost(decoded, serverName);
          const lang = detectAudioLanguageFromSignals({
            url: decoded,
            label: `${rawLabel} ${s.title || ''} ${s.lang || ''}`,
            fallback: defaultLanguage
          });
          results.push({
            providerId: 'jkanime',
            providerName: `JKAnime (${serverName})`,
            serverName,
            url: decoded,
            language: lang,
            quality: '1080p',
            type: /\.m3u8(\?|$)/i.test(decoded) ? 'hls' : 'embed',
            direct: /\.m3u8(\?|$)/i.test(decoded),
            externalOnly,
            score: externalOnly ? -120 : getServerBaseScore(serverName) + JKANIME_PROVIDER_BONUS,
            status: 'AVAILABLE'
          });
        }
      }
    } catch {
      // ignore malformed var servers JSON
    }
  }

  return results;
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
    const rawLabel = spanMatch?.[1] || titleMatch?.[1] || '';
    const serverName = normalizePortalServerName(rawLabel, decoded);
    if (isBlockedOrUnsafeStreamHost(decoded, serverName)) continue;
    const externalOnly = isNonEmbeddableHost(decoded, serverName);
    const lang = detectAudioLanguageFromSignals({
      url: decoded,
      label: `${rawLabel} ${titleMatch?.[1] || ''}`,
      fallback: defaultLanguage
    });

    results.push({
      providerId,
      providerName: `${providerLabel} (${serverName})`,
      serverName,
      url: decoded,
      language: lang,
      quality: '1080p',
      type: 'embed',
      direct: false,
      externalOnly,
      score: externalOnly
        ? -120
        : getServerBaseScore(serverName) + (providerId === 'jkanime' ? JKANIME_PROVIDER_BONUS : 9),
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
    const externalOnly = isNonEmbeddableHost(cleanUrl, serverName);
    const lang = detectAudioLanguageFromSignals({ url: cleanUrl, fallback: defaultLanguage });
    results.push({
      providerId,
      providerName: `${providerLabel} (${serverName})`,
      serverName,
      url: cleanUrl,
      language: lang,
      quality: '1080p',
      type: 'embed',
      direct: false,
      externalOnly,
      score: externalOnly
        ? -120
        : getServerBaseScore(serverName) + (providerId === 'jkanime' ? JKANIME_PROVIDER_BONUS : 9),
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
  if (u.includes('transfer.it')) return 'TransferIt';
  if (u.includes('voe.sx')) return 'VOE';
  if (u.includes('mega.nz')) return 'Mega';
  if (u.includes('streamwish') || u.includes('flaswish') || u.includes('dhcplay') || u.includes('ghbrisk')) return 'StreamWish';
  if (u.includes('filemoon') || u.includes('byse')) return 'Byse';
  if (u.includes('movearnpre') || u.includes('filelions') || u.includes('fviplions') || u.includes('ryderjet') || u.includes('vidhide')) return 'Vidhide';
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
  const unpacked = unpackDeanEdwards(html);
  const haystack = unpacked ? `${html}\n${unpacked}` : html;
  const m1 = haystack.match(/player\.src\(\{\s*type:\s*["']video\/mp4["']\s*,\s*src:\s*["'](https?:\/\/[^"']+)["']/i);
  if (m1?.[1]) return unescapeJsonSlashes(m1[1]);
  const m2 = haystack.match(/(?:src|file)\s*[:=]\s*["'](https?:\/\/[^"']+\.mp4(?:\?[^"']*)?)["']/i);
  if (m2?.[1]) return unescapeJsonSlashes(m2[1]);
  const m3 = haystack.match(/<source[^>]+src=["'](https?:\/\/[^"']+\.mp4(?:\?[^"']*)?)["']/i);
  if (m3?.[1]) return unescapeJsonSlashes(m3[1]);
  const m4 = haystack.match(/["'](https?:\/\/[a-zA-Z0-9_.\-:]+\/d\/[^"']+\/video\.mp4(?:\?[^"']*)?)["']/i);
  if (m4?.[1]) return unescapeJsonSlashes(m4[1]);
  return null;
}

export function parseYourUploadDirectUrl(html: string): string | null {
  if (!html) return null;
  const m1 = html.match(/file\s*:\s*['"](https?:\/\/[^'"]+\.mp4(?:\?[^'"]*)?)['"]/i);
  if (m1?.[1]) return unescapeJsonSlashes(m1[1]);
  const m2 = html.match(/["'](https?:\/\/[^"']*vidcache\.(?:net|io)[^"']+\.mp4(?:\?[^"']*)?)["']/i);
  if (m2?.[1]) return unescapeJsonSlashes(m2[1]);
  const m3 = html.match(/<meta[^>]+property=["']og:video["'][^>]+content=["'](https?:\/\/[^"']+\.mp4(?:\?[^"']*)?)["']/i);
  if (m3?.[1]) return unescapeJsonSlashes(m3[1]);
  const m4 = html.match(/<source[^>]+src=["'](https?:\/\/[^"']+\.mp4(?:\?[^"']*)?)["']/i);
  if (m4?.[1]) return unescapeJsonSlashes(m4[1]);
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

function buildCanonicalTargetFingerprint(url: string): { hostKey: string; targetId: string } {
  const clean = canonicalDedupeUrl(url);
  try {
    const parsed = new URL(clean);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    const hash = parsed.hash || '';
    const query = parsed.search || '';
    let hostKey = host;
    if (host.includes('mp4upload')) hostKey = 'mp4upload';
    else if (host.includes('yourupload')) hostKey = 'yourupload';
    else if (host.includes('streamwish') || host.includes('flaswish') || host.includes('dhcplay') || host.includes('ghbrisk')) {
      hostKey = 'streamwish';
    } else if (host.includes('vidhide') || host.includes('ryderjet') || host.includes('filelions') || host.includes('movearnpre')) {
      hostKey = 'vidhide';
    } else if (host.includes('byse')) hostKey = 'byse';
    else if (host.includes('filemoon')) hostKey = 'filemoon';
    else if (host.includes('uqload')) hostKey = 'uqload';
    else if (host.includes('mixdrop') || host.includes('mixdroop')) hostKey = 'mixdrop';
    else if (host.includes('ok.ru')) hostKey = 'okru';
    else if (host.includes('mega.nz')) hostKey = 'mega';
    else if (host.includes('streamtape')) hostKey = 'streamtape';
    else if (host.includes('luluvdo') || host.includes('lulustream')) hostKey = 'lulustream';
    else if (host.includes('dood') || host.includes('dsvplay')) hostKey = 'doodstream';
    else if (host.includes('zilla-networks')) hostKey = 'zilla';
    else if (host.includes('dotanborito')) hostKey = 'dotanborito';
    else if (host.includes('jkanime.net') || host.includes('playmudos.com')) hostKey = 'jkanime-native';

    const targetId = `${path}${query}${hash}`.toLowerCase();
    return { hostKey, targetId };
  } catch {
    return { hostKey: 'unknown', targetId: clean.toLowerCase() };
  }
}

export interface EmbedHealthResult {
  alive: boolean;
  frameBlocked?: boolean;
  reason?: string;
  detectedTitle?: string;
  detectedLanguage?: 'SUB' | 'LATINO';
}

export function extractEmbedTitleFromHtml(html: string, url = ''): string {
  if (!html) return '';
  const trimmed = html.trim();
  // Byse / JSON API payload: {"title":"1645 1 SUB", ...}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { title?: unknown; name?: unknown };
      const t = String(parsed?.title || parsed?.name || '').trim();
      if (t) return t;
    } catch {
      // fall through to regex
    }
  }
  const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogMatch?.[1]) {
    return ogMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
  }
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    return titleMatch[1].replace(/\s+/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
  }
  if (url.includes('ok.ru')) {
    const okTitle = html.match(/"title"\s*:\s*"([^"]+)"/i);
    if (okTitle?.[1]) return okTitle[1].trim();
  }
  return '';
}

export function isFrameBlockedByHeaders(
  xFrameOptions?: string | null,
  csp?: string | null
): boolean {
  const xfo = String(xFrameOptions || '').toUpperCase().trim();
  if (xfo.includes('DENY') || xfo.includes('SAMEORIGIN')) {
    return true;
  }
  const cspRaw = String(csp || '');
  const faMatch = cspRaw.match(/frame-ancestors\s+([^;]+)/i);
  if (faMatch?.[1]) {
    const val = faMatch[1].trim().toLowerCase();
    if (val.includes("'none'") || (val.includes("'self'") && !val.includes('*') && !val.includes('http'))) {
      return true;
    }
  }
  return false;
}

export interface MegaUrlParts {
  fileId: string;
  key: string;
}

export function parseMegaUrlFileIdAndKey(rawUrl: string): MegaUrlParts | null {
  const clean = normalizeKnownEmbedUrl(rawUrl);
  const m = clean.match(/^https?:\/\/(?:www\.)?mega(?:\.co)?\.nz\/(?:embed|file)\/([a-zA-Z0-9_-]{4,16})(?:#([a-zA-Z0-9_-]+))?/i);
  if (!m?.[1]) return null;
  return { fileId: m[1], key: m[2] || '' };
}

function decodeBase64UrlToBytes(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  if (typeof atob === 'function') {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

export async function decryptMegaAttributeName(atBase64: string, keyBase64: string): Promise<string> {
  if (!atBase64 || !keyBase64) return '';
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return '';
    const keyBytes = decodeBase64UrlToBytes(keyBase64);
    if (keyBytes.length < 32) return '';
    const aesKeyRaw = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      aesKeyRaw[i] = keyBytes[i] ^ keyBytes[i + 16];
    }
    const atBytes = decodeBase64UrlToBytes(atBase64);
    if (atBytes.length < 16 || atBytes.length % 16 !== 0) return '';

    const cryptoKey = await subtle.importKey('raw', aesKeyRaw, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
    const zeroIv = new Uint8Array(16);
    // Construct a synthetic trailing PKCS#7 padding block (16 bytes of 0x10) so WebCrypto AES-CBC decrypts zero-padded Mega attributes cleanly
    const lastCipherBlock = atBytes.subarray(atBytes.length - 16);
    const padPlain = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      padPlain[i] = lastCipherBlock[i] ^ 0x10;
    }
    const encryptedPad = new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv: zeroIv }, cryptoKey, padPlain));
    const combined = new Uint8Array(atBytes.length + 16);
    combined.set(atBytes, 0);
    combined.set(encryptedPad.subarray(0, 16), atBytes.length);

    const decryptedBuf = await subtle.decrypt({ name: 'AES-CBC', iv: zeroIv }, cryptoKey, combined);
    const rawText = new TextDecoder('utf-8').decode(new Uint8Array(decryptedBuf)).replace(/\0+$/g, '').trim();
    const jsonStart = rawText.indexOf('{');
    if (jsonStart < 0) return '';
    const parsed = JSON.parse(rawText.slice(jsonStart)) as { n?: unknown };
    return typeof parsed?.n === 'string' ? parsed.n.trim() : '';
  } catch {
    return '';
  }
}

export interface MegaApiCheckResult {
  alive: boolean;
  errorCode?: number;
  fileName?: string;
  detectedLanguage?: 'SUB' | 'LATINO';
}

export async function parseMegaApiCheckResult(
  apiResponse: unknown,
  keyBase64 = ''
): Promise<MegaApiCheckResult> {
  if (typeof apiResponse === 'number') {
    return apiResponse < 0 ? { alive: false, errorCode: apiResponse } : { alive: true };
  }
  if (!Array.isArray(apiResponse) || apiResponse.length === 0) {
    return { alive: false, errorCode: -1 };
  }
  const first = apiResponse[0];
  if (typeof first === 'number') {
    // Negative Mega API error codes: -9 ENOENT (deleted/not found), -16 EBLOCKED (TOS/DMCA), -6 ETOOMANY, -11 EACCESS, -17 EOVERQUOTA, -18 ETEMPUNAVAIL
    return first < 0 ? { alive: false, errorCode: first } : { alive: true };
  }
  if (!first || typeof first !== 'object') {
    return { alive: false, errorCode: -1 };
  }
  const record = first as { s?: unknown; at?: unknown; e?: unknown };
  if (typeof record.e === 'number' && record.e < 0) {
    return { alive: false, errorCode: record.e };
  }
  const size = Number(record.s || 0);
  const at = typeof record.at === 'string' ? record.at : '';
  if (size <= 0 && !at) {
    return { alive: false, errorCode: -9 };
  }
  const fileName = at && keyBase64 ? await decryptMegaAttributeName(at, keyBase64) : '';
  const lang = fileName
    ? detectAudioLanguageFromSignals({ title: fileName, fallback: 'MULTI' })
    : 'MULTI';
  return {
    alive: true,
    fileName: fileName || undefined,
    detectedLanguage: lang === 'SUB' || lang === 'LATINO' ? lang : undefined
  };
}

const DEAD_EMBED_TEXT_PATTERNS: readonly RegExp[] = [
  // Russian (OK.ru DMCA / removed)
  /видео\s+заблокировано/i,
  /нарушений\s+авторских\s+прав/i,
  /видео\s+удалено/i,
  /видео\s+не\s+найдено/i,
  /доступ\s+к\s+видео\s+ограничен/i,
  // English DMCA / removed / 404 / Mega / unavailable
  /blocked\s+due\s+to\s+author['’]?s?\s+rights/i,
  /blocked\s+due\s+to\s+copyright/i,
  /video\s+has\s+been\s+blocked/i,
  /video\s+(?:was|has\s+been)\s+(?:deleted|removed)/i,
  /file\s+(?:was|has\s+been)\s+(?:deleted|removed)/i,
  /video\s+(?:is\s+not|does\s+not)\s+exist/i,
  /file\s+(?:is\s+not|does\s+not)\s+exist/i,
  /not\s+exist\s+or\s+not\s+available/i,
  /(?:this\s+)?(?:video|file)\s+is\s+(?:no\s+longer\s+)?(?:not\s+available|unavailable)/i,
  /file\s+not\s+found/i,
  /video\s+not\s+found/i,
  /video\s+record\s+missing/i,
  /no\s+longer\s+available/i,
  /page\s+not\s+found/i,
  /404\s+not\s+found/i,
  /we\s+can['’]?t\s+find\s+the\s+file/i,
  /copyright\s+infringement/i,
  // Spanish DMCA / removed
  /bloqueado\s+por\s+infracci[oó]n/i,
  /derechos\s+de\s+autor/i,
  /video\s+(?:eliminado|no\s+disponible|no\s+encontrado)/i,
  /archivo\s+(?:eliminado|no\s+disponible|no\s+encontrado)/i
];

export function detectDeadEmbedFromHtml(
  html: string,
  upstreamStatus: number,
  url: string,
  headers?: { xFrameOptions?: string | null; csp?: string | null }
): EmbedHealthResult {
  const lowerUrl = String(url || '').toLowerCase();
  const body = String(html || '');
  const detectedTitle = extractEmbedTitleFromHtml(body, lowerUrl);
  const titleLang = detectedTitle
    ? detectAudioLanguageFromSignals({ title: detectedTitle, fallback: 'MULTI' })
    : 'MULTI';
  const detectedLanguage: 'SUB' | 'LATINO' | undefined =
    titleLang === 'SUB' || titleLang === 'LATINO' ? titleLang : undefined;

  // Hard HTTP failures: 404, 410, 451, 5xx are always dead
  if (upstreamStatus === 404 || upstreamStatus === 410 || upstreamStatus === 451 || upstreamStatus >= 500) {
    return { alive: false, reason: `HTTP ${upstreamStatus}`, detectedTitle, detectedLanguage };
  }

  // Byse JSON API response (/api/videos/<code>)
  if (lowerUrl.includes('/api/videos/') && body.trim().startsWith('{')) {
    try {
      const json = JSON.parse(body) as { error?: unknown; id?: unknown; title?: unknown };
      if (json.error || upstreamStatus >= 400) {
        return { alive: false, reason: String(json.error || `HTTP ${upstreamStatus}`), detectedTitle, detectedLanguage };
      }
      return { alive: true, detectedTitle, detectedLanguage };
    } catch {
      // continue generic inspection
    }
  }

  const isCfChallenge =
    /just a moment|cf-chl|challenge-platform|cloudflare/i.test(body) &&
    (upstreamStatus === 403 || upstreamStatus === 503);

  // Explicit HTTP 403 (non-Cloudflare) -> dead
  if (upstreamStatus === 403 && !isCfChallenge) {
    return { alive: false, reason: 'HTTP 403 Forbidden', detectedTitle, detectedLanguage };
  }

  // OK.ru specific DMCA / error stub check
  if (lowerUrl.includes('ok.ru')) {
    const hasPlayerData = /data-options=/i.test(body);
    const hasOkError = /"Error"\s*:\s*true/i.test(body) || /vp_video_stub/i.test(body);
    if (!hasPlayerData && (hasOkError || DEAD_EMBED_TEXT_PATTERNS.some((rx) => rx.test(body)))) {
      return { alive: false, reason: 'OK.ru video blocked/deleted', detectedTitle, detectedLanguage };
    }
  }

  // Generic EN/ES/RU DMCA & deleted file checks
  for (const rx of DEAD_EMBED_TEXT_PATTERNS) {
    if (rx.test(body)) {
      return { alive: false, reason: 'DMCA/deleted embed detected', detectedTitle, detectedLanguage };
    }
  }

  // Check if host explicitly blocks framing via X-Frame-Options or CSP frame-ancestors
  const frameBlocked = isFrameBlockedByHeaders(headers?.xFrameOptions, headers?.csp);
  if (frameBlocked && !isCfChallenge) {
    return { alive: true, frameBlocked: true, reason: 'Blocked by X-Frame-Options/CSP', detectedTitle, detectedLanguage };
  }

  // Cloudflare JS challenge with SAMEORIGIN cannot be framed cleanly in an iframe
  if (isCfChallenge && frameBlocked) {
    return { alive: true, frameBlocked: true, reason: 'Cloudflare SAMEORIGIN challenge', detectedTitle, detectedLanguage };
  }

  return { alive: true, frameBlocked: false, detectedTitle, detectedLanguage };
}

export type SourceBadgeType = 'native-hls' | 'native-direct' | 'hls-cyberlocker' | 'external' | 'embed';

export function classifySourceBadgeType(source: {
  url: string;
  serverName?: string;
  providerName?: string;
  direct?: boolean;
  externalOnly?: boolean;
  type?: string;
}): SourceBadgeType {
  const isExt = Boolean(source.externalOnly) || isNonEmbeddableHost(source.url, source.serverName || '');
  if (isExt) return 'external';
  const u = String(source.url || '').toLowerCase();
  const s = String(source.serverName || source.providerName || '').toLowerCase();
  if (
    u.includes('dotanborito.net') ||
    u.includes('/jkplayer/um') ||
    u.includes('/jkplayer/c') ||
    u.includes('playmudos.com') ||
    s.includes('desu') ||
    /\bvip\b/.test(s)
  ) {
    return 'native-hls';
  }
  if (
    source.direct ||
    source.type === 'mp4' ||
    /\.(mp4|webm)(\?|$)/i.test(u) ||
    u.includes('mp4upload.com') ||
    u.includes('yourupload.com') ||
    s.includes('archive direct')
  ) {
    return 'native-direct';
  }
  if (
    source.type === 'hls' ||
    /\.m3u8(\?|$)/i.test(u) ||
    u.includes('flaswish.com') ||
    u.includes('streamwish.') ||
    u.includes('sfastwish.com') ||
    u.includes('dhcplay.com') ||
    u.includes('ghbrisk.com') ||
    u.includes('ryderjet.com') ||
    u.includes('streamhgapi.com') ||
    u.includes('vidhide') ||
    u.includes('filelions')
  ) {
    return 'hls-cyberlocker';
  }
  return 'embed';
}

export interface RankDeduplicateOptions {
  deduplicateByProviderHost?: boolean;
  strictLanguageFilter?: boolean;
}

export function rankAndDeduplicateSources(
  candidates: AnimeSourceCandidate[],
  targetMode: AnimeAudioMode = 'SUB',
  failedUrls: ReadonlySet<string> = new Set(),
  options: RankDeduplicateOptions = {}
): AnimeSourceCandidate[] {
  const byUrl = new Map<string, AnimeSourceCandidate>();
  const byCanonicalSlot = new Map<string, string>();
  const byProviderEmbedHost = new Map<string, string>();
  const dedupeByProviderHost = options.deduplicateByProviderHost !== false;
  const strictLanguageFilter = options.strictLanguageFilter !== false;

  for (const raw of candidates) {
    if (!raw || !raw.url) continue;
    const cleanUrl = normalizeKnownEmbedUrl(raw.url);
    if (isBlockedOrUnsafeStreamHost(cleanUrl, raw.serverName)) continue;

    const urlKey = `${canonicalDedupeUrl(cleanUrl)}::${raw.language}`;
    const fp = buildCanonicalTargetFingerprint(cleanUrl);
    const slotKey = `${raw.providerId}::${fp.hostKey}::${raw.language}::${fp.targetId}`;
    const isDirectLike = Boolean(raw.direct || raw.type === 'mp4' || raw.type === 'hls');
    const providerHostLangKey =
      dedupeByProviderHost && !isDirectLike
        ? `${raw.providerId}::${fp.hostKey}::${raw.language}`
        : '';

    const externalOnly = Boolean(raw.externalOnly) || isNonEmbeddableHost(cleanUrl, raw.serverName);
    let score = Number(raw.score ?? getServerBaseScore(raw.serverName));
    if (isDirectLike) {
      score += 12;
    }
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

    if (externalOnly) {
      score = Math.min(score, 0) - 220;
    }

    const failed = failedUrls.has(cleanUrl) || failedUrls.has(raw.url);
    if (failed) score -= 250;

    const existingUrlKey =
      (byUrl.has(urlKey) ? urlKey : undefined) ||
      byCanonicalSlot.get(slotKey) ||
      (providerHostLangKey ? byProviderEmbedHost.get(providerHostLangKey) : undefined);
    const existing = existingUrlKey ? byUrl.get(existingUrlKey) : undefined;
    if (existing) {
      if (existing.providerId !== raw.providerId) {
        const otherBase = raw.providerName.replace(/\s*\([^)]*\)\s*$/, '').trim();
        const parenMatch = existing.providerName.match(/^(.*?)\s*(\([^)]*\))$/);
        if (otherBase && parenMatch && !parenMatch[1].includes(otherBase)) {
          existing.providerName = `${parenMatch[1]}+${otherBase} ${parenMatch[2]}`;
        }
      }
      if (score > existing.score) {
        existing.score = score;
      }
      continue;
    }

    byUrl.set(urlKey, {
      ...raw,
      url: cleanUrl,
      externalOnly,
      score,
      status: failed ? 'FAILED' : 'AVAILABLE'
    });
    byCanonicalSlot.set(slotKey, urlKey);
    if (providerHostLangKey) {
      byProviderEmbedHost.set(providerHostLangKey, urlKey);
    }
  }

  const sorted = Array.from(byUrl.values()).sort((a, b) => b.score - a.score);
  if (strictLanguageFilter && (targetMode === 'SUB' || targetMode === 'LATINO')) {
    const hasPlayableTargetLang = sorted.some(
      (s) =>
        (s.language === targetMode || s.language === 'MULTI') &&
        !s.externalOnly &&
        s.status !== 'FAILED'
    );
    if (hasPlayableTargetLang) {
      return sorted.filter((s) => s.language === targetMode || s.language === 'MULTI');
    }
  }
  return sorted;
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

export function sanitizeArchiveOrgQuery(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Strip Solr query operators/syntax chars like ':', '(', ')', '+', '-', '!', '^', '~', '*', '?', '[', ']', '{', '}', '\', '"'
    .replace(/[:()[\]{}"'^~*?!\\/+&|_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isRawOrNonSpanishArchiveText(rawText: string): boolean {
  const norm = String(rawText || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (!norm.trim()) return false;
  return (
    /(?:^|[\s._\-[(\/])(?:raw|raws|rawtx|leopard[\s._-]*raws|ohys[\s._-]*raws|zero[\s._-]*raws|beatrice[\s._-]*raws|erai[\s._-]*raws|horriblesubs|subsplease|eng[\s._-]*sub|english[\s._-]*sub|english[\s._-]*dub|sub[\s._-]*ita|vostfr|pt[\s._-]*br|legendado|dublado|ger[\s._-]*sub|sub[\s._-]*indo)(?=$|[\s._\-\])\/])/i.test(
      norm
    ) ||
    /\braw\s*\(\s*(?:tx|bs11|atx|mbs|tokyo|mx)/i.test(norm)
  );
}

export function selectBestArchiveOrgDocs(
  docs: ReadonlyArray<ArchiveOrgDocEntry>,
  targets: ReadonlyArray<string>,
  episodeNum = 1,
  isMovie = false,
  seasonNum = 1
): string[] {
  if (!Array.isArray(docs) || docs.length === 0) return [];
  const cleanTargets = (targets || []).filter((t): t is string => Boolean(t && t.trim()));
  if (cleanTargets.length === 0) return [];

  const normalizedTargets = cleanTargets.map((t) => normalizeSlugText(t));
  const targetTokenSets = cleanTargets.map((t) => {
    const norm = normalizeSlugText(t);
    const parts = norm.split('-').filter((tok) => tok.length >= 2 && !SLUG_STOPWORDS.has(tok));
    const set = new Set(parts.length > 0 ? parts : norm.split('-').filter(Boolean));
    if (norm.includes('re-zero')) set.add('rezero');
    return set;
  });

  const ep = Math.max(1, Number(episodeNum || 1));
  const epPad = ep < 10 ? `0${ep}` : String(ep);
  const epExactRx = new RegExp(
    `(?:^|[-_\\s(\\[.]|ep(?:isode|isodio)?[-_\\s]*)(?:${ep}|${epPad})(?=$|[-_\\s(\\[\\].]|v\\d|\\d{3,4}p)`,
    'i'
  );
  const anyEpRx = /(?:^|[-_\s]|ep(?:isode|isodio)?[-_\s]*)0*([1-9]\d?)(?:$|[-_\s(\[.]|v\d|\d{3,4}p)/gi;

  const scored: Array<{ id: string; score: number }> = [];

  const joinedTargetsNorm = normalizedTargets.join(' ');
  const ARCHIVE_JUNK_RX =
    /(?:^|-)(?:hentai|ecchi|nsfw|r34|rule34|porn|xxx|fan-?made|amv|mmv|gmv|trailer|teaser|preview|review|reaction|react|resumen|parody|parodia|abridged|youtube|you-tube|tiktok|shorts|soundtrack|ost|opening|ending|music-video|karaoke|cover|live-action|stage-play|dorama|podcast|interview|clips?|highlights?|memes?|tribute)(?=$|-)/i;
  const ARCHIVE_FOREIGN_LANG_RX =
    /(?:^|-)(?:sub-?ita|ita|italiano|vostfr|vf|french|ger-?sub|german|deutsch|pt-?br|portugues|dublado|legendado|rus|russian|arabic|turkish|hindi|indonesian|indo-sub|tagalog|polski|czech|thai-sub)(?=$|-)/i;
  const ARCHIVE_NOISE_TOKENS = new Set([
    'ep', 'eps', 'episode', 'episodes', 'episodio', 'capitulo', 'cap', 'sub', 'subs', 'subbed',
    'dub', 'dubbed', 'esp', 'es', 'spanish', 'espanol', 'latino', 'lat', 'castellano', 'eng',
    'english', 'en', 'jp', 'jpn', 'japanese', 'multi', 'dual', 'audio', 'hd', 'sd', 'fhd', 'uhd',
    'bd', 'bluray', 'blu', 'ray', 'web', 'webrip', 'webdl', 'dvdrip', 'remux', 'x264', 'x265',
    'h264', 'h265', 'hevc', 'av1', '10bit', 'aac', 'mp4', 'mkv', 'anime', 'tv', 'series',
    'complete', 'completo', 'uncensored', 'censura', 'sin', 'raw', 'animepahe', 'horriblesubs',
    'subsplease', 'erai', 'raws', 'judas', 'ember', 'sev', 'sof', 'v2', 'v3', 'the', 'of', 'no',
    'a', 'to', 'in', 'and', 'de', 'el', 'la', 'los', 'las'
  ]);

  for (const doc of docs) {
    const id = String(doc?.identifier || '').trim();
    if (!id || /^(youtube-|twitch-)/i.test(id)) continue;
    const rawTitle = Array.isArray(doc?.title) ? doc.title.join(' ') : String(doc?.title || '');
    const combinedNorm = normalizeSlugText(`${id} ${rawTitle}`);
    if (!isMovie && slugHasUnrequestedSpecialKeyword(combinedNorm, normalizedTargets)) {
      continue;
    }

    // Hard-reject RAW / Leopard-Raws / Ohys-Raws / HorribleSubs / SubsPlease / Eng Sub / foreign sub archives
    if (isRawOrNonSpanishArchiveText(`${id} ${rawTitle}`)) {
      continue;
    }

    // Hard-reject fan-made/NSFW/YouTube/AMV/live-action junk unless explicitly present in the requested anime title
    const junkMatch = combinedNorm.match(ARCHIVE_JUNK_RX);
    if (junkMatch && !joinedTargetsNorm.includes(junkMatch[0].replace(/^-/, ''))) {
      continue;
    }

    // Hard-reject non-Spanish/non-English foreign sub/dub archives (e.g. SUB ITA, VOSTFR, PT-BR, RUS)
    const foreignMatch = combinedNorm.match(ARCHIVE_FOREIGN_LANG_RX);
    if (foreignMatch && !joinedTargetsNorm.includes(foreignMatch[0].replace(/^-/, ''))) {
      continue;
    }

    // Reject obvious season/sequel mismatch (e.g. "Temporada 2/3", "2-part-2", "Part 2" when requesting Season 1)
    const explicitSeasonMatch = combinedNorm.match(
      /(?:season|temporada)-([1-9])|([2-9])(?:nd|rd|th)-season|(?:^|-)s0?([1-9])(?:$|e\d|-)|(?:^|-)(segunda|tercera|cuarta)-temporada|(?:^|-)([2-9])-part-[1-9](?=$|-)/i
    );
    const wordSeasonMap: Record<string, number> = { segunda: 2, tercera: 3, cuarta: 4 };
    const docSeason = explicitSeasonMatch
      ? Number(
          explicitSeasonMatch[1] ||
            explicitSeasonMatch[2] ||
            explicitSeasonMatch[3] ||
            explicitSeasonMatch[5] ||
            wordSeasonMap[String(explicitSeasonMatch[4] || '').toLowerCase()] ||
            0
        )
      : 0;
    if (docSeason > 0 && docSeason !== seasonNum) {
      continue;
    }
    if (!isMovie && seasonNum === 1 && /(?:^|-)(?:part-[12]|cour-[12]|final-season|the-final)(?=$|-)/i.test(combinedNorm)) {
      if (!/(?:^|-)(?:part|cour|final)(?=$|-)/i.test(joinedTargetsNorm)) {
        continue;
      }
    }
    if (!isMovie && seasonNum > 1 && docSeason !== seasonNum) {
      continue;
    }

    const docTokens = new Set(combinedNorm.split('-').filter(Boolean));
    if (combinedNorm.includes('re-zero')) docTokens.add('rezero');
    if (combinedNorm.includes('rezero')) {
      docTokens.add('re');
      docTokens.add('zero');
    }

    let bestTokenScore = -999;
    let bestTargetSet: Set<string> | null = null;
    for (const tSet of targetTokenSets) {
      if (tSet.size === 0) continue;
      let matched = 0;
      for (const tok of tSet) {
        if (docTokens.has(tok)) matched++;
      }
      const ratio = matched / tSet.size;
      if (matched === 0 || (tSet.size >= 2 && ratio < 0.5)) continue;
      const s = matched * 20 + Math.round(ratio * 30);
      if (s > bestTokenScore) {
        bestTokenScore = s;
        bestTargetSet = tSet;
      }
    }

    if (bestTokenScore < 0 || !bestTargetSet) continue;

    // Generic spin-off/sequel subtitle guard: count extra content words in doc title that aren't in target or media noise
    const titleNorm = normalizeSlugText(rawTitle || id);
    const extraContentTokens = titleNorm
      .split('-')
      .filter(
        (tok) =>
          tok.length >= 3 &&
          !/^\d+p?$/.test(tok) &&
          !/^s\d+e\d+$/i.test(tok) &&
          !ARCHIVE_NOISE_TOKENS.has(tok) &&
          !bestTargetSet!.has(tok) &&
          !joinedTargetsNorm.includes(tok)
      );
    if (!isMovie && bestTargetSet.size <= 3 && extraContentTokens.length >= 2) {
      // Unrequested spin-off/arc subtitle (e.g. "Title New Generation", "Title Some Arc")
      continue;
    }

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

function extractArchiveFileEpisodeNumber(fileName: string): number | null {
  const base = String(fileName || '').split('/').pop() || '';
  const withoutExt = base.replace(/\.(?:mp4|webm|ogv|mkv)$/i, '');
  // Explicit episode labels take priority (handles "Episode 1(mp4)_1" -> 1, "Episode 10(mp4)_1" -> 10)
  const explicit = withoutExt.match(/(?:episode|episodio|capitulo|cap|ep|e)[-_.#\s]*0*(\d{1,4})(?=$|[^0-9])/i);
  if (explicit?.[1]) {
    const n = parseInt(explicit[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // Remove noise tokens (resolutions, codecs, years, "(mp4)_1" copy suffixes) before reading standalone episode number
  const cleaned = withoutExt
    .replace(/\((?:mp4|hd|sd|sub|dub|latino|espanol)\)(?:_\d+)?/gi, ' ')
    .replace(/\b(?:19\d\d|20\d\d|\d{3,4}p|x264|x265|h264|h265|hevc|av1|10bit|aac)\b/gi, ' ')
    .replace(/s\d{1,2}/gi, ' ');
  const matches = Array.from(cleaned.matchAll(/(?:^|[-_\s.\[(#])0*(\d{1,4})(?=$|[-_\s.\])])/g));
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const n = parseInt(last[1], 10);
    if (Number.isFinite(n) && n > 0 && n < 1900) return n;
  }
  return null;
}

export function extractArchiveOrgSourcesFromMetadata(
  identifier: string,
  metaJson: unknown,
  episodeNum = 1,
  providerLabel = 'Archive HD',
  isMovie = false
): AnimeSourceCandidate[] {
  const id = String(identifier || '').trim();
  if (!id || !metaJson || typeof metaJson !== 'object') return [];
  const metaObj = (metaJson as { metadata?: Record<string, unknown>; files?: Array<Record<string, unknown>> });
  const files = metaObj.files;
  if (!Array.isArray(files) || files.length === 0) return [];

  const metaTitleRaw = metaObj.metadata?.title;
  const metaTitle = Array.isArray(metaTitleRaw) ? metaTitleRaw.join(' ') : String(metaTitleRaw || '');
  const metaDescRaw = metaObj.metadata?.description;
  const metaDesc = Array.isArray(metaDescRaw) ? metaDescRaw.join(' ') : String(metaDescRaw || '');

  // Hard-reject RAW / non-Spanish releases across BOTH Direct MP4 and Embed!
  if (isRawOrNonSpanishArchiveText(`${id} ${metaTitle} ${metaDesc}`)) {
    return [];
  }

  const ep = Math.max(1, Number(episodeNum || 1));

  const videoFiles = files.filter((f) => {
    const name = String(f?.name || '');
    if (!/\.(mp4|webm|ogv)$/i.test(name)) return false;
    if (/ia_thumb|\.thumbs\//i.test(name)) return false;
    if (isRawOrNonSpanishArchiveText(name)) return false;
    const size = Number(f?.size || 0);
    if (size > 0 && size < 1_000_000) return false;
    return true;
  });

  if (videoFiles.length === 0) return [];

  const scoredFiles = videoFiles.map((f) => {
    const name = String(f.name || '');
    const fmt = String(f.format || '');
    const parsedEp = extractArchiveFileEpisodeNumber(name);
    const epMatched = parsedEp === ep;
    const epMismatched = parsedEp !== null && parsedEp !== ep;
    let fScore = 50;
    if (/\.mp4$/i.test(name)) fScore += 30;
    if (/h\.?264|mpeg4/i.test(fmt)) fScore += 15;
    if (epMatched) fScore += 65;
    else if (epMismatched) fScore -= 80;
    if (!name.includes('/')) fScore += 5;
    return { name, score: fScore, epMatched, epMismatched };
  });

  scoredFiles.sort((a, b) => b.score - a.score);
  const bestFile = scoredFiles[0];
  if (!bestFile) return [];

  // For TV series, never serve a clearly wrong episode (e.g. Episode 105 when Episode 1 was requested)
  if (!isMovie) {
    const hasAnyMatched = scoredFiles.some((f) => f.epMatched);
    if (!hasAnyMatched && (videoFiles.length > 1 || bestFile.epMismatched)) {
      return [];
    }
  }

  const encodedPath = bestFile.name
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const directMp4Url = `https://archive.org/download/${encodeURIComponent(id)}/${encodedPath}`;
  const embedUrl = `https://archive.org/embed/${encodeURIComponent(id)}`;
  const langSignal = detectAudioLanguageFromSignals({
    slug: id,
    title: `${metaTitle} ${bestFile.name}`,
    fallback: 'SUB'
  });
  const lang: 'SUB' | 'LATINO' = langSignal === 'LATINO' ? 'LATINO' : 'SUB';

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
      score: getServerBaseScore('Archive Direct'),
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
      score: getServerBaseScore('Archive Embed'),
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

  const rawCombined = `${id} ${titleField} ${descField} ${subjField} ${fileNames}`;
  // Never treat RAW or non-Spanish fansub packs as Spanish-subbed!
  if (isRawOrNonSpanishArchiveText(rawCombined)) {
    return false;
  }

  const fullText = rawCombined
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/\b(spa|es|esp|spanish|espanol|castellano|latino)\b/i.test(langField)) {
    return true;
  }

  if (/\b(sub[\s._-]*esp|sub[\s._-]*espanol|subtitulado|espanol|spanish|audio[\s._-]*latino|castellano|latino)\b/i.test(fullText)) {
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
  const m1 = html.match(/(?:url|source|file|src)\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8(?:\?[^"']*)?)["']/i);
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
    const score = isVip ? 150 : Math.min(148, getServerBaseScore(serverName));
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

export type ProviderFailureReason = 'timeout' | 'http_403' | 'http_5xx' | 'http_429' | 'network' | 'error';

export interface ProviderCircuitState {
  failures: number;
  openUntil: number;
  lastReason?: ProviderFailureReason;
  lastFailureAt?: number;
}

export function isCircuitBreakerFailureStatus(status: number): boolean {
  if (!Number.isFinite(status)) return true;
  if (status === 0 || status === 403 || status === 429) return true;
  return status >= 500 && status <= 599;
}

export function classifyHttpFailureReason(status: number, timedOut = false): ProviderFailureReason | null {
  if (timedOut) return 'timeout';
  if (status === 403) return 'http_403';
  if (status === 429) return 'http_429';
  if (status >= 500 && status <= 599) return 'http_5xx';
  if (status === 0) return 'network';
  return null;
}

export class ProviderCircuitBreaker {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly states = new Map<string, ProviderCircuitState>();

  constructor(options: { failureThreshold?: number; cooldownMs?: number } = {}) {
    this.failureThreshold = Math.max(1, Math.floor(options.failureThreshold ?? 3));
    this.cooldownMs = Math.max(1000, Math.floor(options.cooldownMs ?? 60 * 1000));
  }

  canAttempt(providerId: string, nowMs = Date.now()): boolean {
    const key = String(providerId || '').trim().toLowerCase();
    if (!key) return true;
    const entry = this.states.get(key);
    if (!entry) return true;
    if (entry.openUntil > nowMs) return false;
    if (entry.openUntil > 0 && entry.openUntil <= nowMs) {
      entry.openUntil = 0;
      entry.failures = Math.max(0, this.failureThreshold - 1);
    }
    return true;
  }

  recordHttpStatus(
    providerId: string,
    status: number,
    timedOut = false,
    nowMs = Date.now()
  ): { tripped: boolean; failures: number; openUntil: number } {
    const key = String(providerId || '').trim().toLowerCase();
    if (!key) return { tripped: false, failures: 0, openUntil: 0 };
    // HTTP 404 (missing slug/episode) proves the upstream host is reachable and MUST NOT trip the circuit breaker.
    if (!timedOut && status === 404) {
      const current = this.states.get(key);
      return {
        tripped: false,
        failures: current?.failures ?? 0,
        openUntil: current?.openUntil ?? 0
      };
    }
    if (!timedOut && status >= 200 && status < 400) {
      this.recordSuccess(key);
      return { tripped: false, failures: 0, openUntil: 0 };
    }
    if (timedOut || isCircuitBreakerFailureStatus(status)) {
      const reason = classifyHttpFailureReason(status, timedOut) || 'network';
      return this.recordFailure(key, reason, nowMs);
    }
    const current = this.states.get(key);
    return {
      tripped: false,
      failures: current?.failures ?? 0,
      openUntil: current?.openUntil ?? 0
    };
  }

  recordFailure(
    providerId: string,
    reason: ProviderFailureReason = 'network',
    nowMs = Date.now()
  ): { tripped: boolean; failures: number; openUntil: number } {
    const key = String(providerId || '').trim().toLowerCase();
    if (!key) return { tripped: false, failures: 0, openUntil: 0 };
    const prev = this.states.get(key) || { failures: 0, openUntil: 0 };
    const nextFailures = prev.failures + 1;
    const tripped = nextFailures >= this.failureThreshold;
    const openUntil = tripped ? nowMs + this.cooldownMs : prev.openUntil;
    this.states.set(key, {
      failures: nextFailures,
      openUntil,
      lastReason: reason,
      lastFailureAt: nowMs
    });
    return { tripped, failures: nextFailures, openUntil };
  }

  recordSuccess(providerId: string): void {
    const key = String(providerId || '').trim().toLowerCase();
    if (!key) return;
    this.states.delete(key);
  }

  getState(
    providerId: string,
    nowMs = Date.now()
  ): { isOpen: boolean; failures: number; remainingCooldownMs: number; lastReason?: ProviderFailureReason } {
    const key = String(providerId || '').trim().toLowerCase();
    const entry = this.states.get(key);
    if (!entry) {
      return { isOpen: false, failures: 0, remainingCooldownMs: 0 };
    }
    const remaining = Math.max(0, entry.openUntil - nowMs);
    return {
      isOpen: remaining > 0,
      failures: entry.failures,
      remainingCooldownMs: remaining,
      lastReason: entry.lastReason
    };
  }

  reset(providerId?: string): void {
    if (providerId) {
      this.states.delete(String(providerId).trim().toLowerCase());
    } else {
      this.states.clear();
    }
  }
}

export type ProviderTimeoutOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'timeout' | 'error'; error: Error };

export async function withProviderTimeout<T>(
  task: Promise<T> | (() => Promise<T>),
  timeoutMs: number,
  providerId: string
): Promise<ProviderTimeoutOutcome<T>> {
  const safeTimeout = Math.max(10, Math.floor(timeoutMs));
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const promise = typeof task === 'function' ? task() : task;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`Provider ${providerId} timed out after ${safeTimeout}ms`);
        (err as Error & { code?: string }).code = 'PROVIDER_TIMEOUT';
        reject(err);
      }, safeTimeout);
    });
    const value = await Promise.race([promise, timeoutPromise]);
    return { ok: true, value };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err || 'Provider error'));
    const isTimeout = (error as Error & { code?: string }).code === 'PROVIDER_TIMEOUT';
    return {
      ok: false,
      reason: isTimeout ? 'timeout' : 'error',
      error
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const ADULT_PROVIDER_IDS: ReadonlySet<string> = new Set(['hentaila', 'hentaijk']);

export function isAdultProviderId(providerId: unknown): boolean {
  const clean = String(providerId || '').trim().toLowerCase();
  return ADULT_PROVIDER_IDS.has(clean);
}

const ADULT_GENRE_REGEX = /\b(hentai|erotica|pornographic|adult|18\+|nsfw)\b/i;

export function isAdultMediaEntry(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  if (item.isAdult === true) return true;
  if (item.hentailaId || item.hentailaSlug) return true;
  const idStr = String(item.id || '').toLowerCase();
  if (idStr.startsWith('hla_')) return true;
  const rating = String(item.contentRating || item.attributes?.contentRating || '').toLowerCase();
  if (rating === 'erotica' || rating === 'pornographic') return true;
  const src = String(item.source || item.providerId || '').toLowerCase();
  if (src.includes('hentaila') || src.includes('hentaijk')) return true;
  if (Array.isArray(item.genres)) {
    for (const g of item.genres) {
      if (typeof g === 'string' && ADULT_GENRE_REGEX.test(g)) return true;
    }
  }
  return false;
}

export function filterSafeMediaList<T>(items: T[], showAdultContent: boolean): T[] {
  const list = Array.isArray(items) ? items : [];
  if (showAdultContent) return list;
  return list.filter((item) => !isAdultMediaEntry(item));
}

export function filterSafeAnimeSources<
  T extends { providerId?: string; providerName?: string; url?: string }
>(sources: T[], showAdultContent: boolean): T[] {
  const list = Array.isArray(sources) ? sources : [];
  if (showAdultContent) return list;
  return list.filter((src) => {
    if (!src) return false;
    if (isAdultProviderId(src.providerId)) return false;
    const pName = String(src.providerName || '').toLowerCase();
    const url = String(src.url || '').toLowerCase();
    if (pName.includes('hentaila') || pName.includes('hentaijk')) return false;
    if (url.includes('hentaila.com') || url.includes('hentaijk.com')) return false;
    return true;
  });
}



