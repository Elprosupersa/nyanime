import {
  AnimeWatchedManager,
  AppPreferencesManager,
  CommentsManager,
  DownloadManager,
  HistoryManager,
  UserManager,
  escHtml,
  fetchWithTimeout,
  hasActiveModal,
  nativeFetchHtml,
  nWin,
  onProxyUpstreamEvent,
  showToast,
  state,
  uiHooks
} from './appState.ts';
import {
  NATIVE_BUFFER_TIMEOUT_MS,
  NATIVE_STARTUP_FAILOVER_MS,
  type NativeStartupWatchdogHandle,
  attachNativeStartupFailoverWatchdog,
  buildUpNextCountdownText,
  formatPlaybackTime,
  shouldResumePlayback
} from '../utils/playerResume.ts';
import {
  type AniSkipInterval,
  buildAniSkipUrl,
  computeSafeSeekTarget,
  findActiveAniSkipInterval,
  isIntroSkipType,
  parseAniSkipResponse
} from '../utils/aniskip.ts';
import {
  type WatchRoomState,
  buildWatchRoomInviteUrl,
  computeRoomDriftSeconds,
  computeTargetSyncedTime,
  extractInviteKeyFromSearch,
  isRoomPlaying,
  normalizeRoomCode,
  normalizeRoomSecret,
  parseRoomJoinInput,
  parseTimecodeInput,
  resolveRoomAnchorTimestampMs,
  shouldApplyRemotePlaybackUpdate,
  shouldSeekForDrift,
  verifyRoomAccess
} from '../utils/watchTogether.ts';
import {
  computeIframeActiveDeltaSeconds,
  computeRealWatchDeltaSeconds
} from '../utils/profileStats.ts';
import {
  cargarAniZipMappingAsync,
  renderDetalleEpisodios
} from './animeDetailView.ts';
import {
  ProviderCircuitBreaker,
  type RankDeduplicateOptions,
  classifySourceBadgeType,
  detectAudioLanguageFromSignals,
  detectDeadEmbedFromHtml,
  extractAnimeTitleTargets,
  extractArchiveOrgSourcesFromMetadata,
  extractEmbedTitleFromHtml,
  filterSafeAnimeSources,
  isAdultProviderId,
  isArchiveOrgSpanishMetadata,
  isNonEmbeddableHost,
  normalizeKnownEmbedUrl,
  parseHentaiJkEpisodeSources,
  parseHentaiJkSearchSlugs,
  parseHentaiLaCatalogData,
  parseHentaiLaEpisodeSources,
  parseJkNetEpisodeSources,
  parseJkPlayerDirectM3u8,
  parseMegaApiCheckResult,
  parseMegaUrlFileIdAndKey,
  parseMonosChinosEpisodePlayers,
  parseMonosChinosSearchLinks,
  pickBestSlugMatch,
  resolveDotanboritoDirectM3u8,
  sanitizeArchiveOrgQuery,
  selectBestArchiveOrgDocs,
  withProviderTimeout
} from '../utils/animeSources.ts';
import { isDomainAllowlisted } from '../utils/proxySecurity.ts';
import {
  buildStateCardHtml,
  createRequestGuard,
  resolvePlayerShortcutAction
} from '../utils/uiPolishHelpers.ts';

const aniSkipRequestGuard = createRequestGuard();
const episodeResolveGuard = createRequestGuard();
const sourceExecutionGuard = createRequestGuard();
let playerKeydownListener: ((e: KeyboardEvent) => void) | null = null;

export interface NormalizedSourceInput {
  providerId: string;
  providerName: string;
  serverName?: string;
  url: string;
  language: string;
  quality?: string;
  type?: string;
  direct?: boolean;
  externalOnly?: boolean;
  verified?: boolean;
  score?: number;
  status?: string;
}

export class NormalizedSource {
  providerId: string;
  providerName: string;
  serverName: string;
  url: string;
  language: string;
  quality: string;
  type: string;
  direct: boolean;
  externalOnly: boolean;
  verified: boolean;
  score: number;
  status: string;

  constructor({
    providerId,
    providerName,
    serverName,
    url,
    language,
    quality = '1080p',
    type = 'embed',
    direct = false,
    externalOnly = false,
    verified = false,
    score = 100,
    status = 'AVAILABLE'
  }: NormalizedSourceInput) {
    this.providerId = providerId;
    this.providerName = providerName;
    this.serverName = serverName || providerName;
    this.url = url;
    this.language = language;
    this.quality = quality;
    this.type = type;
    this.direct = direct;
    this.externalOnly = Boolean(externalOnly) || isNonEmbeddableHost(url, this.serverName);
    this.verified = Boolean(verified);
    this.score = score;
    this.status = status;
  }
}

export interface EpisodeResolveContext {
  imdbId?: string;
  tmdbId?: number | string;
  malId?: number | string;
  slug: string;
  season: number;
  episode: number;
  episodes?: number | null;
  seasonYear?: number | null;
  seasonId: number | string;
  isMovie: boolean;
  format?: string;
  isAdult?: boolean;
  hentailaSlug?: string;
  synonyms?: string[];
  romaji: string;
  english: string;
  seasonTitle: string;
}

export function generateSlugCandidates(
  titleRomaji: string,
  titleEnglish: string,
  seasonTitle: string,
  seasonNum: number,
  synonyms?: string[]
): string[] {
  if (nWin.NyAnimeVideoSources?.generateAnimeSlugCandidates) {
    return nWin.NyAnimeVideoSources.generateAnimeSlugCandidates(
      titleRomaji,
      titleEnglish,
      seasonTitle,
      seasonNum,
      synonyms
    );
  }
  const candidates = new Set<string>();
  const clean = (str: string) =>
    (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, '-');
  [seasonTitle, titleRomaji, titleEnglish, ...(synonyms || [])].filter(Boolean).forEach((t) => {
    const b = clean(t);
    if (b) candidates.add(b);
  });
  return Array.from(candidates);
}

function buildSearchQueriesForCtx(
  romaji: string,
  english: string,
  seasonTitle: string,
  synonyms?: string[]
): string[] {
  if (nWin.NyAnimeVideoSources?.buildAnimeSearchQueries) {
    return nWin.NyAnimeVideoSources.buildAnimeSearchQueries(romaji, english, seasonTitle, synonyms);
  }
  const qRomaji = nWin.NyAnimeVideoSources?.extractBestSearchQuery
    ? nWin.NyAnimeVideoSources.extractBestSearchQuery(romaji, '', '')
    : (romaji || '');
  const qEnglish = nWin.NyAnimeVideoSources?.extractBestSearchQuery
    ? nWin.NyAnimeVideoSources.extractBestSearchQuery('', english, '')
    : (english || '');
  return Array.from(new Set([qRomaji, qEnglish, seasonTitle, ...(synonyms || [])].filter(Boolean))).slice(0, 5);
}

function buildTargetTitlesForCtx(ctx: EpisodeResolveContext): string[] {
  return extractAnimeTitleTargets({
    romaji: ctx.romaji,
    english: ctx.english,
    seasonTitle: ctx.seasonTitle,
    synonyms: ctx.synonyms
  });
}

class AnimeAV1SourceProvider {
  id = 'animeav1';
  name = 'AnimeAV1 HD';
  languages = ['SUB', 'LATINO'];
  slugCache = new Map<string, string>();

  async resolve(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    const { romaji, english, seasonTitle, season, episode, seasonId, synonyms, format, episodes, seasonYear } = ctx;
    const ep = episode || 1;
    const sNum = season || 1;
    const slugKey = String(seasonId || seasonTitle || romaji || english);

    try {
      let matchedSlug = this.slugCache.get(slugKey) || null;
      if (!matchedSlug) {
        const queries = buildSearchQueriesForCtx(romaji, english, seasonTitle, synonyms);
        const targets = buildTargetTitlesForCtx(ctx);
        for (const q of queries) {
          const catHtml = await nativeFetchHtml(`https://animeav1.com/catalogo?search=${encodeURIComponent(q)}`, {}, 7000);
          if (catHtml && nWin.NyAnimeVideoSources?.parseAnimeAv1CatalogLinks) {
            const foundSlugs = nWin.NyAnimeVideoSources.parseAnimeAv1CatalogLinks(catHtml);
            if (foundSlugs.length > 0) {
              matchedSlug = pickBestSlugMatch(
                foundSlugs,
                targets,
                sNum,
                format || '',
                { episodes, seasonYear }
              );
              if (matchedSlug) {
                this.slugCache.set(slugKey, matchedSlug);
                break;
              }
            }
          }
        }
      }

      const candidatesToTry = Array.from(
        new Set([
          ...(matchedSlug ? [matchedSlug] : []),
          ...generateSlugCandidates(romaji, english, seasonTitle, sNum, synonyms).slice(0, 3)
        ])
      ).filter(Boolean);

      for (const slug of candidatesToTry) {
        const epHtml = await nativeFetchHtml(`https://animeav1.com/media/${slug}/${ep}`, {}, 7000);
        if (!epHtml || !nWin.NyAnimeVideoSources?.parseAnimeAv1EpisodeEmbeds) continue;
        const parsed = nWin.NyAnimeVideoSources.parseAnimeAv1EpisodeEmbeds(epHtml);
        if (parsed.length > 0) {
          this.slugCache.set(slugKey, slug);
          return parsed.map((s: NormalizedSourceInput) => new NormalizedSource(s));
        }
      }
      return [];
    } catch {
      return [];
    }
  }
}

class TioAnimeSourceProvider {
  id = 'tioanime';
  name = 'TíoAnime Streams';
  languages = ['SUB', 'LATINO'];
  slugCache = new Map<string, string>();

  async resolve(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    const { romaji, english, seasonTitle, season, episode, seasonId, synonyms, format, episodes, seasonYear } = ctx;
    const ep = episode || 1;
    const sNum = season || 1;
    const slugKey = String(seasonId || seasonTitle || romaji || english);

    try {
      let matchedSlug = this.slugCache.get(slugKey) || null;
      if (!matchedSlug) {
        const queries = buildSearchQueriesForCtx(romaji, english, seasonTitle, synonyms);
        const targets = buildTargetTitlesForCtx(ctx);
        for (const q of queries) {
          const dirHtml = await nativeFetchHtml(`https://tioanime.com/directorio?q=${encodeURIComponent(q)}`, {}, 7000);
          if (dirHtml && nWin.NyAnimeVideoSources?.parseTioAnimeDirectoryLinks) {
            const foundSlugs = nWin.NyAnimeVideoSources.parseTioAnimeDirectoryLinks(dirHtml);
            if (foundSlugs.length > 0) {
              matchedSlug = pickBestSlugMatch(
                foundSlugs,
                targets,
                sNum,
                format || '',
                { episodes, seasonYear }
              );
              if (matchedSlug) {
                this.slugCache.set(slugKey, matchedSlug);
                break;
              }
            }
          }
        }
      }

      const candidatesToTry = Array.from(
        new Set([
          ...(matchedSlug ? [matchedSlug] : []),
          ...generateSlugCandidates(romaji, english, seasonTitle, sNum, synonyms).slice(0, 3)
        ])
      ).filter(Boolean);

      for (const slug of candidatesToTry) {
        const epHtml = await nativeFetchHtml(`https://tioanime.com/ver/${slug}-${ep}`, {}, 7000);
        if (!epHtml || !nWin.NyAnimeVideoSources?.parseTioAnimeEpisodeVideos) continue;
        const slugLang = detectAudioLanguageFromSignals({ slug, fallback: 'SUB' });
        const defaultLang: 'SUB' | 'LATINO' = slugLang === 'LATINO' ? 'LATINO' : 'SUB';
        const parsed = nWin.NyAnimeVideoSources.parseTioAnimeEpisodeVideos(epHtml, defaultLang, slug);
        if (parsed.length > 0) {
          this.slugCache.set(slugKey, slug);
          return parsed.map((s: NormalizedSourceInput) => new NormalizedSource(s));
        }
      }
      return [];
    } catch {
      return [];
    }
  }
}

class TVAnimeSourceProvider {
  id = 'tvanime';
  name = 'TVAnime HD';
  languages = ['SUB', 'LATINO'];
  slugCache = new Map<string, string>();

  async resolve(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    const { romaji, english, seasonTitle, season, episode, seasonId, synonyms, format, episodes, seasonYear } = ctx;
    const ep = episode || 1;
    const sNum = season || 1;
    const slugKey = String(seasonId || seasonTitle || romaji || english);

    try {
      let matchedSlug = this.slugCache.get(slugKey) || null;
      if (!matchedSlug) {
        const queries = buildSearchQueriesForCtx(romaji, english, seasonTitle, synonyms);
        const targets = buildTargetTitlesForCtx(ctx);
        for (const q of queries) {
          const dirHtml = await nativeFetchHtml(`https://tvanime.tv/directorio?q=${encodeURIComponent(q)}`, {}, 7000);
          if (dirHtml && nWin.NyAnimeVideoSources?.parseTvAnimeDirectoryLinks) {
            const foundSlugs = nWin.NyAnimeVideoSources.parseTvAnimeDirectoryLinks(dirHtml);
            if (foundSlugs.length > 0) {
              matchedSlug = pickBestSlugMatch(
                foundSlugs,
                targets,
                sNum,
                format || '',
                { episodes, seasonYear }
              );
              if (matchedSlug) {
                this.slugCache.set(slugKey, matchedSlug);
                break;
              }
            }
          }
        }
      }

      const candidatesToTry = Array.from(
        new Set([
          ...(matchedSlug ? [matchedSlug] : []),
          ...generateSlugCandidates(romaji, english, seasonTitle, sNum, synonyms).slice(0, 3)
        ])
      ).filter(Boolean);

      for (const slug of candidatesToTry) {
        const epHtml = await nativeFetchHtml(`https://tvanime.tv/anime/${slug}/episodio/episodio-${ep}`, {}, 7000);
        if (!epHtml || !nWin.NyAnimeVideoSources?.parseTvAnimeEpisodePlayers) continue;
        const parsed = nWin.NyAnimeVideoSources.parseTvAnimeEpisodePlayers(epHtml);
        if (parsed.length > 0) {
          this.slugCache.set(slugKey, slug);
          return parsed.map((s: NormalizedSourceInput) => new NormalizedSource(s));
        }
      }
      return [];
    } catch {
      return [];
    }
  }
}

async function fetchPortalOptSources(
  episodeUrl: string,
  postAjaxUrl: string,
  providerId: string,
  providerLabel: string,
  timeoutMs = 5500,
  defaultLanguage: 'SUB' | 'LATINO' = 'SUB'
): Promise<NormalizedSource[]> {
  try {
    const res = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(episodeUrl)}&probe=1`, {}, timeoutMs).catch(() => null);
    const upStatus = Number(res?.headers.get('x-upstream-status') || res?.status || 500);
    if (!res || !res.ok || upStatus >= 400) return [];
    const epHtml = await res.text();
    if (!epHtml || epHtml.includes('Just a moment') || epHtml.includes('cf-chl')) return [];

    const detectedPageLang = detectAudioLanguageFromSignals({
      url: episodeUrl,
      title: extractEmbedTitleFromHtml(epHtml),
      fallback: defaultLanguage
    });
    const resolvedLang: 'SUB' | 'LATINO' = detectedPageLang === 'LATINO' ? 'LATINO' : defaultLanguage;

    const data = nWin.NyAnimeVideoSources?.parseAnimePortalEpisodeData
      ? nWin.NyAnimeVideoSources.parseAnimePortalEpisodeData(epHtml)
      : { encryptId: null, downloadUrls: [] };

    let sources: NormalizedSourceInput[] = [];
    if (data.encryptId) {
      const optRes = await fetchWithTimeout(
        `/api/proxy?url=${encodeURIComponent(postAjaxUrl)}&probe=1`,
        {
          method: 'POST',
          headers: {
            'x-custom-content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'x-custom-requested-with': 'XMLHttpRequest',
            'x-custom-referer': episodeUrl
          },
          body: `acc=opt&i=${encodeURIComponent(data.encryptId)}`
        },
        timeoutMs
      ).catch(() => null);
      const optUpStatus = Number(optRes?.headers.get('x-upstream-status') || optRes?.status || 500);
      if (optRes && optRes.ok && optUpStatus < 400) {
        const optHtml = await optRes.text();
        if (nWin.NyAnimeVideoSources?.parseHexOptServerList) {
          sources = nWin.NyAnimeVideoSources.parseHexOptServerList(optHtml, providerId, providerLabel, resolvedLang);
        }
      }
    }

    if (data.downloadUrls && data.downloadUrls.length > 0 && nWin.NyAnimeVideoSources?.parsePortalDownloadUrls) {
      const dlSources = nWin.NyAnimeVideoSources.parsePortalDownloadUrls(data.downloadUrls, providerId, providerLabel, resolvedLang);
      sources = sources.concat(dlSources);
    }
    return sources.map((s) => new NormalizedSource(s));
  } catch {
    return [];
  }
}

class JKAnimeSourceProvider {
  id = 'jkanime';
  name = 'JKAnime Streams';
  languages = ['SUB', 'LATINO'];
  oneSlugCache = new Map<string, string>();
  cfBlockedUntil = 0;
  oneBlockedUntil = 0;
  oneFailureCount = 0;

  async fetchJkOnePage(targetUrl: string, timeoutMs = 7000): Promise<string | null> {
    if (Date.now() < this.oneBlockedUntil) return null;
    try {
      const res = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(targetUrl)}&probe=1`, {}, timeoutMs);
      const upStatus = Number(res.headers.get('x-upstream-status') || res.status || 502);
      if (upStatus === 403 || upStatus === 429) {
        this.oneBlockedUntil = Date.now() + 2 * 60 * 1000;
        return null;
      }
      if (upStatus === 502 || upStatus === 503 || upStatus === 504) {
        this.oneFailureCount += 1;
        if (this.oneFailureCount >= 2) {
          this.oneBlockedUntil = Date.now() + 90 * 1000;
          this.oneFailureCount = 0;
        }
        return null;
      }
      if (!res.ok || upStatus >= 400) return null;
      const html = await res.text();
      if (!html || html.includes('Just a moment') || html.includes('cf-chl')) {
        this.oneBlockedUntil = Date.now() + 2 * 60 * 1000;
        return null;
      }
      this.oneFailureCount = 0;
      return html;
    } catch {
      this.oneFailureCount += 1;
      if (this.oneFailureCount >= 2) {
        this.oneBlockedUntil = Date.now() + 90 * 1000;
        this.oneFailureCount = 0;
      }
      return null;
    }
  }

  async resolveViaJkOne(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    if (Date.now() < this.oneBlockedUntil) return [];
    const { romaji, english, seasonTitle, season, episode, seasonId, synonyms, format, episodes, seasonYear } = ctx;
    const ep = episode || 1;
    const sNum = season || 1;
    const slugKey = String(seasonId || seasonTitle || romaji || english);
    const candidates = generateSlugCandidates(romaji, english, seasonTitle, sNum, synonyms).slice(0, 3);
    const targets = buildTargetTitlesForCtx(ctx);

    try {
      const cachedSlug = this.oneSlugCache.get(slugKey) || null;
      if (cachedSlug) {
        const slugLang = detectAudioLanguageFromSignals({ slug: cachedSlug, fallback: 'SUB' });
        const out = await fetchPortalOptSources(
          `https://jkanime.one/ver/${cachedSlug}/${ep}`,
          'https://jkanime.one/jk',
          this.id,
          'JKAnime',
          7500,
          slugLang === 'LATINO' ? 'LATINO' : 'SUB'
        );
        if (out.length > 0) return out;
      }

      // Run direct top candidate and parallel catalog search queries simultaneously so jkanime.one resolves in ~3-6s instead of ~14s
      const queries = buildSearchQueriesForCtx(romaji, english, seasonTitle, synonyms).slice(0, 2);
      const firstCandidate = candidates[0] || '';
      const directTryPromise = firstCandidate
        ? fetchPortalOptSources(
            `https://jkanime.one/ver/${firstCandidate}/${ep}`,
            'https://jkanime.one/jk',
            this.id,
            'JKAnime',
            7000,
            detectAudioLanguageFromSignals({ slug: firstCandidate, fallback: 'SUB' }) === 'LATINO' ? 'LATINO' : 'SUB'
          ).catch(() => [] as NormalizedSource[])
        : Promise.resolve([] as NormalizedSource[]);

      const searchPagesPromise = Promise.all(
        queries.map((q) =>
          this.fetchJkOnePage(`https://jkanime.one/anime-online?buscar=${encodeURIComponent(q)}`, 6500).catch(() => null)
        )
      );

      const directOut = await directTryPromise;
      if (directOut.length > 0 && firstCandidate) {
        this.oneSlugCache.set(slugKey, firstCandidate);
        return directOut;
      }

      const searchPages = await searchPagesPromise;
      const foundSet = new Set<string>();
      for (const sHtml of searchPages) {
        if (sHtml && nWin.NyAnimeVideoSources?.parseAnimePortalSearchSlugs) {
          for (const slug of nWin.NyAnimeVideoSources.parseAnimePortalSearchSlugs(sHtml)) {
            foundSet.add(slug);
          }
        }
      }

      if (foundSet.size > 0) {
        const matchedSlug = pickBestSlugMatch(
          Array.from(foundSet),
          targets,
          sNum,
          format || '',
          { episodes, seasonYear }
        );
        if (matchedSlug && matchedSlug !== firstCandidate) {
          const slugLang = detectAudioLanguageFromSignals({ slug: matchedSlug, fallback: 'SUB' });
          const out = await fetchPortalOptSources(
            `https://jkanime.one/ver/${matchedSlug}/${ep}`,
            'https://jkanime.one/jk',
            this.id,
            'JKAnime',
            7500,
            slugLang === 'LATINO' ? 'LATINO' : 'SUB'
          );
          if (out.length > 0) {
            this.oneSlugCache.set(slugKey, matchedSlug);
            return out;
          }
        }
      }

      for (const slug of candidates.slice(1)) {
        if (Date.now() < this.oneBlockedUntil) return [];
        if (!slug) continue;
        const slugLang = detectAudioLanguageFromSignals({ slug, fallback: 'SUB' });
        const out = await fetchPortalOptSources(
          `https://jkanime.one/ver/${slug}/${ep}`,
          'https://jkanime.one/jk',
          this.id,
          'JKAnime',
          6500,
          slugLang === 'LATINO' ? 'LATINO' : 'SUB'
        );
        if (out.length > 0) {
          this.oneSlugCache.set(slugKey, slug);
          return out;
        }
      }
    } catch {
      // ignore
    }
    return [];
  }

  async resolveViaJkNet(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    if (Date.now() < this.cfBlockedUntil) return [];
    const { romaji, english, seasonTitle, season, episode, synonyms } = ctx;
    const candidates = generateSlugCandidates(romaji, english, seasonTitle, season, synonyms).slice(0, 3);
    const ep = episode || 1;

    try {
      for (const slug of candidates) {
        if (Date.now() < this.cfBlockedUntil) return [];
        const targetUrl = `https://jkanime.net/${slug}/${ep}/`;
        const res = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(targetUrl)}&probe=1`, {}, 2600).catch(() => null);
        if (!res) continue;
        const upStatus = Number(res.headers.get('x-upstream-status') || res.status);
        if (upStatus === 403 || upStatus === 429) {
          this.cfBlockedUntil = Date.now() + 5 * 60 * 1000;
          return [];
        }
        if (!res.ok || upStatus >= 400) continue;
        const html = await res.text();
        if (!html || html.includes('Just a moment') || html.includes('cf-chl')) {
          this.cfBlockedUntil = Date.now() + 5 * 60 * 1000;
          return [];
        }

        const parsed = parseJkNetEpisodeSources(html, 'SUB');
        if (parsed.length > 0) {
          return parsed.map((s) => new NormalizedSource(s));
        }
      }
    } catch {
      // ignore
    }
    return [];
  }

  async resolve(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    const [oneRes, netRes] = await Promise.all([
      this.resolveViaJkOne(ctx).catch(() => []),
      this.resolveViaJkNet(ctx).catch(() => [])
    ]);
    return [...netRes, ...oneRes];
  }
}

class HenaoJaraSourceProvider {
  id = 'henaojara';
  name = 'HenaoJara HD';
  languages = ['SUB', 'LATINO'];
  slugCache = new Map<string, string>();
  blockedUntil = 0;

  async fetchSearchPage(targetUrl: string, timeoutMs = 4200): Promise<string | null> {
    if (Date.now() < this.blockedUntil) return null;
    try {
      const res = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(targetUrl)}&probe=1`, {}, timeoutMs);
      const upStatus = Number(res.headers.get('x-upstream-status') || res.status || 502);
      if (upStatus === 403 || upStatus === 429 || upStatus === 502 || upStatus === 503 || upStatus === 504) {
        this.blockedUntil = Date.now() + 3 * 60 * 1000;
        return null;
      }
      if (!res.ok || upStatus >= 400) return null;
      return await res.text();
    } catch {
      this.blockedUntil = Date.now() + 3 * 60 * 1000;
      return null;
    }
  }

  async resolve(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    if (Date.now() < this.blockedUntil) return [];
    const { romaji, english, seasonTitle, season, episode, seasonId, synonyms, format, episodes, seasonYear } = ctx;
    const ep = episode || 1;
    const sNum = season || 1;
    const slugKey = String(seasonId || seasonTitle || romaji || english);
    const candidates = generateSlugCandidates(romaji, english, seasonTitle, sNum, synonyms).slice(0, 4);
    const targets = buildTargetTitlesForCtx(ctx);

    try {
      let matchedSlug = this.slugCache.get(slugKey) || null;
      if (!matchedSlug) {
        const queries = buildSearchQueriesForCtx(romaji, english, seasonTitle, synonyms);
        for (const q of queries) {
          if (Date.now() < this.blockedUntil) return [];
          const sHtml = await this.fetchSearchPage(`https://ww1.henaojara.net/animes?buscar=${encodeURIComponent(q)}`, 4200);
          if (sHtml && nWin.NyAnimeVideoSources?.parseAnimePortalSearchSlugs) {
            const found = nWin.NyAnimeVideoSources.parseAnimePortalSearchSlugs(sHtml);
            if (found.length > 0) {
              const candidate = pickBestSlugMatch(
                found,
                targets,
                sNum,
                format || '',
                { episodes, seasonYear }
              );
              if (candidate) {
                const out = await fetchPortalOptSources(
                  `https://ww1.henaojara.net/ver/${candidate}-${ep}`,
                  'https://ww1.henaojara.net/hj',
                  this.id,
                  'HenaoJara',
                  5500
                );
                if (out.length > 0) {
                  this.slugCache.set(slugKey, candidate);
                  return out;
                }
              }
            }
          }
        }
      } else {
        const out = await fetchPortalOptSources(
          `https://ww1.henaojara.net/ver/${matchedSlug}-${ep}`,
          'https://ww1.henaojara.net/hj',
          this.id,
          'HenaoJara',
          5500
        );
        if (out.length > 0) return out;
      }

      for (const slug of candidates) {
        if (!slug) continue;
        const out = await fetchPortalOptSources(
          `https://ww1.henaojara.net/ver/${slug}-${ep}`,
          'https://ww1.henaojara.net/hj',
          this.id,
          'HenaoJara',
          5000
        );
        if (out.length > 0) {
          this.slugCache.set(slugKey, slug);
          return out;
        }
      }
    } catch {
      // ignore
    }
    return [];
  }
}

class MonosChinosSourceProvider {
  id = 'monoschinos';
  name = 'MonosChinos HD';
  languages = ['SUB', 'LATINO'];
  slugCache = new Map<string, Array<{ baseSlug: string; language: 'SUB' | 'LATINO' }>>();
  blockedUntil = 0;
  failureCount = 0;

  async fetchPage(targetUrl: string, timeoutMs = 5500): Promise<string | null> {
    if (Date.now() < this.blockedUntil) return null;
    try {
      const res = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(targetUrl)}&probe=1`, {}, timeoutMs);
      const upStatus = Number(res.headers.get('x-upstream-status') || res.status || 502);
      if (upStatus === 403 || upStatus === 429) {
        this.blockedUntil = Date.now() + 2 * 60 * 1000;
        return null;
      }
      if (upStatus === 502 || upStatus === 503 || upStatus === 504) {
        this.failureCount += 1;
        if (this.failureCount >= 2) {
          this.blockedUntil = Date.now() + 90 * 1000;
          this.failureCount = 0;
        }
        return null;
      }
      if (!res.ok || upStatus >= 400) return null;
      const html = await res.text();
      if (!html || html.includes('Just a moment') || html.includes('cf-chl')) {
        this.blockedUntil = Date.now() + 2 * 60 * 1000;
        return null;
      }
      this.failureCount = 0;
      return html;
    } catch {
      this.failureCount += 1;
      if (this.failureCount >= 2) {
        this.blockedUntil = Date.now() + 90 * 1000;
        this.failureCount = 0;
      }
      return null;
    }
  }

  async resolve(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    if (Date.now() < this.blockedUntil) return [];
    const { romaji, english, seasonTitle, season, episode, seasonId, synonyms, format, episodes, seasonYear } = ctx;
    const ep = Math.max(1, Number(episode || 1));
    const sNum = Math.max(1, Number(season || 1));
    const slugKey = String(seasonId || seasonTitle || romaji || english);
    const targets = buildTargetTitlesForCtx(ctx);

    try {
      let matchedEntries = this.slugCache.get(slugKey) || [];
      if (matchedEntries.length === 0) {
        const queries = buildSearchQueriesForCtx(romaji, english, seasonTitle, synonyms).slice(0, 2);
        for (const q of queries) {
          if (Date.now() < this.blockedUntil) return [];
          const searchHtml = await this.fetchPage(`https://monoschinos.st/buscar?q=${encodeURIComponent(q)}`, 5500);
          if (!searchHtml) continue;
          const entries = parseMonosChinosSearchLinks(searchHtml);
          if (entries.length === 0) continue;
          const uniqueBases = Array.from(new Set(entries.map((e) => e.baseSlug)));
          const bestBase = pickBestSlugMatch(uniqueBases, targets, sNum, format || '', { episodes, seasonYear });
          if (bestBase) {
            matchedEntries = entries
              .filter((e) => e.baseSlug === bestBase)
              .map((e) => ({ baseSlug: e.baseSlug, language: e.language }));
            if (matchedEntries.length > 0) {
              this.slugCache.set(slugKey, matchedEntries);
              break;
            }
          }
        }
      }

      const out: NormalizedSource[] = [];
      if (matchedEntries.length > 0) {
        const resolvedBatches = await Promise.all(
          matchedEntries.slice(0, 2).map(async (entry) => {
            const epSlug = entry.language === 'LATINO' ? `${entry.baseSlug}-latino` : entry.baseSlug;
            const epHtml = await this.fetchPage(`https://monoschinos.st/ver/${epSlug}-episodio-${ep}`, 5500);
            if (!epHtml) return [];
            const parsed = parseMonosChinosEpisodePlayers(epHtml, entry.language, epSlug);
            return parsed.map((s) => new NormalizedSource(s));
          })
        );
        for (const batch of resolvedBatches) {
          out.push(...batch);
        }
        if (out.length > 0) return out;
      }

      const fallbackCandidates = generateSlugCandidates(romaji, english, seasonTitle, sNum, synonyms).slice(0, 2);
      for (const slug of fallbackCandidates) {
        if (Date.now() < this.blockedUntil) return [];
        const epHtml = await this.fetchPage(`https://monoschinos.st/ver/${slug}-episodio-${ep}`, 5000);
        if (!epHtml) continue;
        const parsed = parseMonosChinosEpisodePlayers(epHtml, 'SUB', slug);
        if (parsed.length > 0) {
          this.slugCache.set(slugKey, [{ baseSlug: slug, language: 'SUB' }]);
          return parsed.map((s) => new NormalizedSource(s));
        }
      }
    } catch {
      // ignore
    }
    return [];
  }
}

class HentaiJKSourceProvider {
  id = 'hentaijk';
  name = 'HentaiJK Español';
  languages = ['SUB'];
  slugCache = new Map<string, string>();

  async resolve(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    const { romaji, english, seasonTitle, season, episode, seasonId, synonyms, format } = ctx;
    const ep = Math.max(1, Number(episode || 1));
    const sNum = Math.max(1, Number(season || 1));
    const slugKey = String(seasonId || seasonTitle || romaji || english);
    const candidates = generateSlugCandidates(romaji, english, seasonTitle, sNum, synonyms).slice(0, 6);
    const targets = buildTargetTitlesForCtx(ctx);

    try {
      const cachedSlug = this.slugCache.get(slugKey) || null;
      const trySlug = async (slug: string): Promise<NormalizedSource[]> => {
        if (!slug) return [];
        const epHtml = await nativeFetchHtml(`https://hentaijk.com/${slug}/${ep}/`, {}, 3500);
        if (!epHtml) return [];
        const parsed = parseHentaiJkEpisodeSources(epHtml);
        return parsed.map((s) => new NormalizedSource(s));
      };

      if (cachedSlug) {
        const fromCache = await trySlug(cachedSlug);
        if (fromCache.length > 0) return fromCache;
      }

      for (const slug of candidates) {
        if (!slug || slug === cachedSlug) continue;
        const out = await trySlug(slug);
        if (out.length > 0) {
          this.slugCache.set(slugKey, slug);
          return out;
        }
      }

      const rawQueries = buildSearchQueriesForCtx(romaji, english, seasonTitle, synonyms);
      const searchTerms = new Set<string>();
      for (const q of rawQueries) {
        const underscored = q
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .trim()
          .replace(/\s+/g, '_');
        if (underscored.length >= 3) searchTerms.add(underscored);
        const words = underscored.split('_').filter((w) => w.length >= 3);
        if (words.length >= 2) {
          searchTerms.add(`${words[0]}_${words[1]}`);
        }
        if (words[0] && words[0].length >= 4) {
          searchTerms.add(words[0]);
        }
      }

      for (const term of Array.from(searchTerms).slice(0, 4)) {
        const sHtml = await nativeFetchHtml(`https://hentaijk.com/buscar/${encodeURIComponent(term)}/`, {}, 3500);
        if (!sHtml) continue;
        const foundSlugs = parseHentaiJkSearchSlugs(sHtml);
        if (foundSlugs.length === 0) continue;
        const matched = pickBestSlugMatch(foundSlugs, targets, sNum, format || 'OVA');
        if (matched) {
          const out = await trySlug(matched);
          if (out.length > 0) {
            this.slugCache.set(slugKey, matched);
            return out;
          }
        }
      }
    } catch {
      // ignore
    }
    return [];
  }
}

class HentaiLASourceProvider {
  id = 'hentaila';
  name = 'HentaiLA VIP HD';
  languages = ['SUB'];
  slugCache = new Map<string, string>();

  async resolve(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    const { romaji, english, seasonTitle, season, episode, seasonId, synonyms, format, hentailaSlug } = ctx;
    const ep = Math.max(1, Number(episode || 1));
    const sNum = Math.max(1, Number(season || 1));
    const slugKey = String(seasonId || seasonTitle || romaji || english);
    const candidates = generateSlugCandidates(romaji, english, seasonTitle, sNum, synonyms).slice(0, 6);
    const targets = buildTargetTitlesForCtx(ctx);

    const trySlug = async (slug: string): Promise<NormalizedSource[]> => {
      if (!slug) return [];
      try {
        const dataUrl = `https://hentaila.com/media/${slug}/${ep}/__data.json`;
        const res = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(dataUrl)}&probe=1`, {}, 3200).catch(() => null);
        const upStatus = Number(res?.headers.get('x-upstream-status') || res?.status || 500);
        if (res && res.ok && upStatus < 400) {
          const json = await res.json().catch(() => null);
          if (json) {
            const parsed = parseHentaiLaEpisodeSources(json);
            if (parsed.length > 0) return parsed.map((s) => new NormalizedSource(s));
          }
        }
      } catch {
        // fallback to HTML /ver/{slug}-{ep} below
      }

      try {
        const verHtml = await nativeFetchHtml(`https://hentaila.com/ver/${slug}-${ep}`, {}, 3200);
        if (verHtml) {
          const parsed = parseHentaiLaEpisodeSources(verHtml);
          if (parsed.length > 0) return parsed.map((s) => new NormalizedSource(s));
        }
      } catch {
        // ignore
      }
      return [];
    };

    try {
      const initialSlug = hentailaSlug || this.slugCache.get(slugKey) || null;
      if (initialSlug) {
        const fromInitial = await trySlug(initialSlug);
        if (fromInitial.length > 0) {
          this.slugCache.set(slugKey, initialSlug);
          return fromInitial;
        }
      }

      for (const slug of candidates) {
        if (!slug || slug === initialSlug) continue;
        const out = await trySlug(slug);
        if (out.length > 0) {
          this.slugCache.set(slugKey, slug);
          return out;
        }
      }

      const rawQueries = buildSearchQueriesForCtx(romaji, english, seasonTitle, synonyms);
      const searchQueries = new Set<string>();
      for (const q of rawQueries) {
        if (q.trim().length >= 2) searchQueries.add(q.trim());
        const words = q.trim().split(/\s+/).filter((w) => w.length >= 3);
        if (words.length >= 2) {
          searchQueries.add(`${words[0]} ${words[1]}`);
        }
        if (words[0] && words[0].length >= 4) {
          searchQueries.add(words[0]);
        }
      }

      for (const q of Array.from(searchQueries).slice(0, 4)) {
        const catUrl = `https://hentaila.com/catalogo/__data.json?search=${encodeURIComponent(q)}`;
        const catRes = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(catUrl)}&probe=1`, {}, 3200).catch(() => null);
        const upStatus = Number(catRes?.headers.get('x-upstream-status') || catRes?.status || 500);
        if (!catRes || !catRes.ok || upStatus >= 400) continue;
        const catJson = await catRes.json().catch(() => null);
        if (!catJson) continue;
        const { items } = parseHentaiLaCatalogData(catJson);
        if (items.length === 0) continue;
        const foundSlugs = items.map((item) => item.slug);
        const matched = pickBestSlugMatch(foundSlugs, targets, sNum, format || 'OVA');
        if (matched) {
          const out = await trySlug(matched);
          if (out.length > 0) {
            this.slugCache.set(slugKey, matched);
            return out;
          }
        }
      }
    } catch {
      // ignore
    }
    return [];
  }
}

class InternetArchiveAnimeProvider {
  id = 'archive_org';
  name = 'Archive.org Direct Stream';
  languages = ['SUB', 'LATINO'];
  docCache = new Map<string, string[]>();

  async resolve(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    const { romaji, english, seasonTitle, synonyms, episode, season, isMovie, seasonId } = ctx;
    const ep = Math.max(1, Number(episode || 1));
    const sNum = Math.max(1, Number(season || 1));
    const targets = buildTargetTitlesForCtx(ctx);
    if (targets.length === 0) return [];

    const queries = buildSearchQueriesForCtx(romaji, english, seasonTitle, synonyms).slice(0, 3);
    const cacheKey = `${seasonId || romaji || english}::s${sNum}::ep${ep}`;

    try {
      let bestDocIds = this.docCache.get(cacheKey) || [];
      if (bestDocIds.length === 0) {
        const allDocs: Array<{ identifier?: string; title?: string | string[]; downloads?: number }> = [];
        for (const q of queries) {
          const cleanQ = sanitizeArchiveOrgQuery(q);
          if (!cleanQ) continue;
          const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`title:("${cleanQ}") AND mediatype:(movies)`)}&fl[]=identifier,title,downloads&sort[]=downloads+desc&rows=15&output=json`;
          const res = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(searchUrl)}`, {}, 7000).catch(() => null);
          if (!res || !res.ok) continue;
          const json = await res.json().catch(() => null);
          const docs = json?.response?.docs;
          if (Array.isArray(docs) && docs.length > 0) {
            allDocs.push(...docs);
            const matched = selectBestArchiveOrgDocs(allDocs, targets, ep, isMovie, sNum);
            if (matched.length > 0) {
              bestDocIds = matched;
              break;
            }
          }
        }
        if (bestDocIds.length > 0) {
          this.docCache.set(cacheKey, bestDocIds);
        }
      }

      if (bestDocIds.length === 0) return [];

      const out: NormalizedSource[] = [];
      for (const docId of bestDocIds.slice(0, 3)) {
        const metaUrl = `https://archive.org/metadata/${encodeURIComponent(docId)}`;
        const metaRes = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(metaUrl)}`, {}, 7000).catch(() => null);
        if (!metaRes || !metaRes.ok) continue;
        const metaJson = await metaRes.json().catch(() => null);
        if (!metaJson) continue;
        // Strict catalog-wide rule: never leak RAW / English / non-Spanish Archive.org items into Sub Español
        if (!isArchiveOrgSpanishMetadata(docId, metaJson)) continue;
        const extracted = extractArchiveOrgSourcesFromMetadata(
          docId,
          metaJson,
          ep,
          'Archive Español HD',
          isMovie
        );
        if (extracted.length > 0) {
          for (const item of extracted) {
            out.push(new NormalizedSource(item));
          }
          break;
        }
      }
      return out;
    } catch {
      return [];
    }
  }
}

export function ensureGuaranteedEpisodeSources(
  ctx: EpisodeResolveContext,
  existing: NormalizedSource[]
): NormalizedSource[] {
  const list = Array.isArray(existing) ? [...existing] : [];
  // Whenever any Spanish provider (JKAnime, AnimeAV1, TVAnime, HenaoJara, TioAnime, HentaiJK, Archive Español)
  // has resolved Spanish servers, return them directly without injecting English-only mirrors!
  if (list.length > 0) {
    return list;
  }

  const ep = Math.max(1, Number(ctx.episode || 1));
  const sNum = Math.max(1, Number(ctx.season || 1));
  const rawId = String(ctx.seasonId || '').replace(/^(jk_|hla_)/, '').trim();
  const numericAniId = Number.isFinite(Number(rawId)) && Number(rawId) > 0 ? Number(rawId) : 21;
  const fallbackTargetId = ctx.tmdbId || ctx.imdbId || ctx.malId || numericAniId;
  const isTmdbOrImdb = Boolean(ctx.tmdbId || ctx.imdbId);

  if (ctx.malId || numericAniId) {
    const aniOrMal = ctx.malId || numericAniId;
    list.push(
      new NormalizedSource({
        providerId: 'vidsrc_anime',
        providerName: 'VidSrc Anime (Multi HD)',
        serverName: 'VidSrc',
        url: `https://vidsrc.cc/v2/embed/anime/ani${aniOrMal}/${ep}/sub`,
        language: 'MULTI',
        quality: '1080p',
        externalOnly: true,
        score: 52
      })
    );
  }

  if (isTmdbOrImdb) {
    list.push(
      new NormalizedSource({
        providerId: 'vidsrc_multi',
        providerName: 'VidSrc Global (Multi)',
        serverName: 'VidSrc',
        url: ctx.isMovie
          ? `https://vidsrc.xyz/embed/movie/${fallbackTargetId}`
          : `https://vidsrc.xyz/embed/tv/${fallbackTargetId}/${sNum}-${ep}`,
        language: 'MULTI',
        quality: '1080p',
        score: 48
      })
    );
  }

  list.push(
    new NormalizedSource({
      providerId: 'multiembed',
      providerName: 'MultiEmbed (Multi)',
      serverName: 'MultiEmbed',
      url: ctx.isMovie
        ? `https://multiembed.mov/?video_id=${fallbackTargetId}&tmdb=1`
        : `https://multiembed.mov/?video_id=${fallbackTargetId}&tmdb=1&s=${sNum}&e=${ep}`,
      language: 'MULTI',
      quality: '1080p',
      score: 45
    })
  );

  return list;
}

interface ExtractedStream {
  type: 'mp4' | 'hls';
  streamUrl: string;
  rawDirectUrl: string;
  referer?: string;
  detectedTitle?: string;
  detectedLanguage?: 'SUB' | 'LATINO';
}

interface CachedExtractedStream {
  stream: ExtractedStream;
  expiresAt: number;
}

const STREAM_EXTRACT_TTL_MS = 90 * 1000;
const PROBE_CACHE_TTL_MS = 3 * 60 * 1000;

async function fetchFreshEmbedForExtraction(
  targetUrl: string,
  timeoutMs = 10000,
  customReferer?: string
): Promise<{ ok: boolean; status: number; html: string; xfo: string; csp: string }> {
  try {
    const headers: Record<string, string> = {};
    if (customReferer) headers['x-custom-referer'] = customReferer;
    const res = await fetchWithTimeout(
      `/api/proxy?url=${encodeURIComponent(targetUrl)}&probe=1&nocache=1`,
      { headers },
      timeoutMs
    );
    const upStatus = Number(res.headers.get('x-upstream-status') || res.status || 500);
    const xfo = res.headers.get('x-upstream-xfo') || '';
    const csp = res.headers.get('x-upstream-csp') || '';
    const html = await res.text().catch(() => '');
    return {
      ok: res.ok && upStatus >= 200 && upStatus < 400,
      status: upStatus,
      html,
      xfo,
      csp
    };
  } catch {
    return { ok: false, status: 502, html: '', xfo: '', csp: '' };
  }
}

export const StreamExtractor = {
  cache: new Map<string, CachedExtractedStream>(),
  wrapProxy(rawUrl: string, explicitReferer?: string): string {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('/api/video-proxy?')) return rawUrl;
    const refPart = explicitReferer ? `&referer=${encodeURIComponent(explicitReferer)}` : '';
    return `/api/video-proxy?url=${encodeURIComponent(rawUrl)}${refPart}`;
  },
  getCached(url: string): ExtractedStream | null {
    const entry = this.cache.get(url);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(url);
      return null;
    }
    return entry.stream;
  },
  setCached(url: string, stream: ExtractedStream, ttlMs = STREAM_EXTRACT_TTL_MS): void {
    this.cache.set(url, { stream, expiresAt: Date.now() + ttlMs });
  },
  invalidate(url: string): void {
    this.cache.delete(url);
  },
  async extract(url: string, options: { forceRefresh?: boolean; timeoutMs?: number } = {}): Promise<ExtractedStream | null> {
    if (!url) return null;
    const forceRefresh = Boolean(options.forceRefresh);
    const timeoutMs = options.timeoutMs ?? 12000;
    if (!forceRefresh) {
      const cached = this.getCached(url);
      if (cached) return cached;
    } else {
      this.cache.delete(url);
    }

    if (url.includes('dotanborito.net')) {
      const m3u8Url = resolveDotanboritoDirectM3u8(url);
      if (m3u8Url) {
        const ref = 'https://cdn.dotanborito.net/';
        const out: ExtractedStream = {
          type: 'hls',
          streamUrl: this.wrapProxy(m3u8Url, ref),
          rawDirectUrl: m3u8Url,
          referer: ref
        };
        this.setCached(url, out, 5 * 60 * 1000);
        return out;
      }
    }

    if (/\.(mp4|webm)(\?|$)/i.test(url)) {
      const out: ExtractedStream = { type: 'mp4', streamUrl: this.wrapProxy(url), rawDirectUrl: url };
      this.setCached(url, out, 5 * 60 * 1000);
      return out;
    }

    if (/\.m3u8(\?|$)/i.test(url)) {
      let needsProxy = url.includes('dotanborito.net') || url.includes('playmudos.com');
      try {
        const parsedHost = new URL(url).hostname;
        if (isDomainAllowlisted(parsedHost)) needsProxy = true;
      } catch {
        // ignore
      }
      const ref = url.includes('playmudos.com') ? 'https://jkanime.net/' : undefined;
      const out: ExtractedStream = {
        type: 'hls',
        streamUrl: needsProxy ? this.wrapProxy(url, ref) : url,
        rawDirectUrl: url,
        referer: ref
      };
      this.setCached(url, out);
      return out;
    }

    if (url.includes('mp4upload.com')) {
      try {
        const fetched = await fetchFreshEmbedForExtraction(url, timeoutMs, 'https://www.mp4upload.com/');
        if (!fetched.ok || !fetched.html) return null;
        const directUrl = nWin.NyAnimeVideoSources?.parseMp4UploadDirectUrl
          ? nWin.NyAnimeVideoSources.parseMp4UploadDirectUrl(fetched.html)
          : null;
        if (directUrl) {
          const detectedTitle = extractEmbedTitleFromHtml(fetched.html, url);
          const langCheck = detectedTitle
            ? detectAudioLanguageFromSignals({ title: detectedTitle, fallback: 'MULTI' })
            : 'MULTI';
          const ref = 'https://www.mp4upload.com/';
          const out: ExtractedStream = {
            type: 'mp4',
            streamUrl: this.wrapProxy(directUrl, ref),
            rawDirectUrl: directUrl,
            referer: ref,
            detectedTitle,
            detectedLanguage: langCheck === 'SUB' || langCheck === 'LATINO' ? langCheck : undefined
          };
          this.setCached(url, out);
          return out;
        }
      } catch {
        // ignore
      }
      return null;
    }

    if (url.includes('yourupload.com')) {
      try {
        const fetched = await fetchFreshEmbedForExtraction(url, timeoutMs, 'https://www.yourupload.com/');
        if (!fetched.ok || !fetched.html) return null;
        const directUrl = nWin.NyAnimeVideoSources?.parseYourUploadDirectUrl
          ? nWin.NyAnimeVideoSources.parseYourUploadDirectUrl(fetched.html)
          : null;
        if (directUrl) {
          const detectedTitle = extractEmbedTitleFromHtml(fetched.html, url);
          const langCheck = detectedTitle
            ? detectAudioLanguageFromSignals({ title: detectedTitle, fallback: 'MULTI' })
            : 'MULTI';
          const ref = 'https://www.yourupload.com/';
          const out: ExtractedStream = {
            type: 'mp4',
            streamUrl: this.wrapProxy(directUrl, ref),
            rawDirectUrl: directUrl,
            referer: ref,
            detectedTitle,
            detectedLanguage: langCheck === 'SUB' || langCheck === 'LATINO' ? langCheck : undefined
          };
          this.setCached(url, out);
          return out;
        }
      } catch {
        // ignore
      }
      return null;
    }

    if (url.includes('/jkplayer/um') || url.includes('/jkplayer/c')) {
      try {
        const isHentaiJk = url.includes('hentaijk.com');
        const ref = isHentaiJk ? 'https://hentaijk.com/' : 'https://jkanime.net/';
        const fetched = await fetchFreshEmbedForExtraction(url, timeoutMs, ref);
        const m3u8Url = fetched.ok && fetched.html ? parseJkPlayerDirectM3u8(fetched.html) : null;
        if (m3u8Url) {
          const out: ExtractedStream = {
            type: 'hls',
            streamUrl: this.wrapProxy(m3u8Url, ref),
            rawDirectUrl: m3u8Url,
            referer: ref
          };
          this.setCached(url, out);
          return out;
        }
      } catch {
        // ignore
      }
      return null;
    }

    if (
      url.includes('flaswish.com') ||
      url.includes('streamwish.') ||
      url.includes('sfastwish.com') ||
      url.includes('dhcplay.com') ||
      url.includes('streamhgapi.com') ||
      url.includes('ghbrisk.com') ||
      url.includes('ryderjet.com') ||
      url.includes('vidhide') ||
      url.includes('filelions') ||
      url.includes('movearnpre.com')
    ) {
      try {
        const normWish = normalizeKnownEmbedUrl(url);
        let embedOriginRef = 'https://streamwish.to/';
        try {
          embedOriginRef = new URL(normWish).origin + '/';
        } catch {
          // keep default
        }
        const fetched = await fetchFreshEmbedForExtraction(normWish, timeoutMs, embedOriginRef);
        const m3u8Url =
          fetched.ok && fetched.html && nWin.NyAnimeVideoSources?.parseStreamWishDirectUrl
            ? nWin.NyAnimeVideoSources.parseStreamWishDirectUrl(fetched.html)
            : null;
        if (m3u8Url) {
          let proxyAllowed = false;
          try {
            proxyAllowed = isDomainAllowlisted(new URL(m3u8Url).hostname);
          } catch {
            proxyAllowed = false;
          }
          const detectedTitle = extractEmbedTitleFromHtml(fetched.html, normWish);
          const langCheck = detectedTitle
            ? detectAudioLanguageFromSignals({ title: detectedTitle, fallback: 'MULTI' })
            : 'MULTI';
          const out: ExtractedStream = {
            type: 'hls',
            streamUrl: proxyAllowed ? this.wrapProxy(m3u8Url, embedOriginRef) : m3u8Url,
            rawDirectUrl: m3u8Url,
            referer: embedOriginRef,
            detectedTitle,
            detectedLanguage: langCheck === 'SUB' || langCheck === 'LATINO' ? langCheck : undefined
          };
          this.setCached(url, out);
          return out;
        }
      } catch {
        // ignore
      }
    }

    return null;
  }
};

interface CachedProbeOutcome {
  alive: boolean;
  frameBlocked?: boolean;
  verifiedDirect?: boolean;
  streamType?: 'mp4' | 'hls';
  detectedLanguage?: 'SUB' | 'LATINO';
  expiresAt: number;
}

const sourceProbeCache = new Map<string, CachedProbeOutcome>();

async function verifyDirectStreamReachable(stream: ExtractedStream, timeoutMs = 4500): Promise<boolean> {
  if (!stream?.streamUrl) return false;
  try {
    const isProxied = stream.streamUrl.startsWith('/api/video-proxy?');
    if (!isProxied) {
      // Unproxied cross-origin HLS (rare rotating CDN not in allowlist): verify manifest fetch or allow fallback
      const r = await fetchWithTimeout(stream.streamUrl, {}, Math.min(timeoutMs, 3500)).catch(() => null);
      if (!r || !r.ok) return false;
      const txt = await r.text().catch(() => '');
      return txt.includes('#EXTM3U');
    }
    const probeUrl = `${stream.streamUrl}&probe=1`;
    const headers: Record<string, string> =
      stream.type === 'mp4' ? { Range: 'bytes=0-65535' } : {};
    const res = await fetchWithTimeout(probeUrl, { headers }, timeoutMs);
    if (!res.ok) return false;
    const probeOk = res.headers.get('x-video-probe-ok');
    if (probeOk === '1') return true;
    if (probeOk === '0') return false;
    const upStatus = Number(res.headers.get('x-upstream-status') || res.status || 500);
    return upStatus === 200 || upStatus === 206;
  } catch {
    return false;
  }
}

async function probeSingleSource(src: NormalizedSource): Promise<CachedProbeOutcome> {
  const cleanUrl = normalizeKnownEmbedUrl(src.url);
  const now = Date.now();
  const cached = sourceProbeCache.get(cleanUrl);
  if (cached && now < cached.expiresAt) {
    return cached;
  }

  const saveAndReturn = (outcome: Omit<CachedProbeOutcome, 'expiresAt'>): CachedProbeOutcome => {
    const full: CachedProbeOutcome = { ...outcome, expiresAt: Date.now() + PROBE_CACHE_TTL_MS };
    sourceProbeCache.set(cleanUrl, full);
    return full;
  };

  if (src.externalOnly || isNonEmbeddableHost(cleanUrl, src.serverName)) {
    return saveAndReturn({ alive: true, frameBlocked: true });
  }

  const lower = cleanUrl.toLowerCase();

  // Real Mega API check via g.api.mega.co.nz/cs: discards deleted (-9), blocked (-16), etc. and decrypts filename to detect _LAT_ vs SUB
  if (/mega(?:\.co)?\.nz\/(?:embed|file)\//i.test(lower)) {
    const parts = parseMegaUrlFileIdAndKey(cleanUrl);
    if (!parts?.fileId) {
      return saveAndReturn({ alive: false });
    }
    try {
      const megaRes = await fetchWithTimeout(
        `/api/proxy?url=${encodeURIComponent('https://g.api.mega.co.nz/cs')}&probe=1&nocache=1`,
        {
          method: 'POST',
          headers: { 'x-custom-content-type': 'application/json' },
          body: JSON.stringify([{ a: 'g', p: parts.fileId }])
        },
        4500
      );
      const upStatus = Number(megaRes.headers.get('x-upstream-status') || megaRes.status || 502);
      if (megaRes.ok && upStatus >= 200 && upStatus < 400) {
        const json = await megaRes.json().catch(() => null);
        if (json !== null) {
          const check = await parseMegaApiCheckResult(json, parts.key);
          if (!check.alive) {
            return saveAndReturn({ alive: false });
          }
          return saveAndReturn({
            alive: true,
            frameBlocked: false,
            detectedLanguage: check.detectedLanguage
          });
        }
      }
    } catch {
      // Fall through if transient network timeout occurs
    }
    return saveAndReturn({ alive: true, frameBlocked: false });
  }

  // Direct/extractable native hosts (MP4Upload, YourUpload, Archive Direct, JKAnime Desu, Dotanborito, direct .mp4/.m3u8)
  const isStrictDirectHost =
    src.direct ||
    /\.(mp4|webm|m3u8)(\?|$)/i.test(lower) ||
    lower.includes('mp4upload.com') ||
    lower.includes('yourupload.com') ||
    lower.includes('dotanborito.net') ||
    lower.includes('/jkplayer/um') ||
    lower.includes('/jkplayer/c');

  if (isStrictDirectHost) {
    const extracted = await StreamExtractor.extract(cleanUrl, { timeoutMs: 5500 });
    if (!extracted) {
      return saveAndReturn({ alive: false });
    }
    const reachable = await verifyDirectStreamReachable(extracted, 5000);
    if (!reachable) {
      StreamExtractor.invalidate(cleanUrl);
      return saveAndReturn({ alive: false, detectedLanguage: extracted.detectedLanguage });
    }
    return saveAndReturn({
      alive: true,
      frameBlocked: false,
      verifiedDirect: true,
      streamType: extracted.type,
      detectedLanguage: extracted.detectedLanguage
    });
  }

  // Extractable HLS cyberlockers (StreamWish / Flaswish / Vidhide / Ryderjet / Filelions)
  const isExtractableCyberlocker =
    lower.includes('flaswish.com') ||
    lower.includes('streamwish.') ||
    lower.includes('sfastwish.com') ||
    lower.includes('dhcplay.com') ||
    lower.includes('ghbrisk.com') ||
    lower.includes('ryderjet.com') ||
    lower.includes('streamhgapi.com') ||
    lower.includes('vidhide') ||
    lower.includes('filelions') ||
    lower.includes('movearnpre.com');

  if (isExtractableCyberlocker) {
    const extracted = await StreamExtractor.extract(cleanUrl, { timeoutMs: 4500 });
    if (extracted) {
      const reachable = await verifyDirectStreamReachable(extracted, 4000);
      if (reachable) {
        return saveAndReturn({
          alive: true,
          frameBlocked: false,
          verifiedDirect: true,
          streamType: extracted.type,
          detectedLanguage: extracted.detectedLanguage
        });
      }
      StreamExtractor.invalidate(cleanUrl);
    }
    // Fall through to embed HTML probe to check for 404/DMCA/XFO
  }

  // Byse hosts: fast JSON API /api/videos/<code> verifies existence AND returns language title!
  const byseMatch = cleanUrl.match(/^https?:\/\/(?:www\.)?(byse[a-z0-9]*\.com)\/(?:e|d)\/([a-zA-Z0-9_-]+)/i);
  if (byseMatch?.[1] && byseMatch?.[2]) {
    const apiUrl = `https://${byseMatch[1].toLowerCase()}/api/videos/${byseMatch[2]}`;
    const fetched = await fetchFreshEmbedForExtraction(apiUrl, 4500);
    if (fetched.status === 404 || fetched.status === 410) {
      return saveAndReturn({ alive: false });
    }
    const health = detectDeadEmbedFromHtml(fetched.html, fetched.status, apiUrl, {
      xFrameOptions: fetched.xfo,
      csp: fetched.csp
    });
    return saveAndReturn({
      alive: health.alive,
      frameBlocked: health.frameBlocked,
      detectedLanguage: health.detectedLanguage
    });
  }

  // Probe allowlisted embed hosts (Okru, Filemoon, MixDrop, Uqload, LuluStream, Doodstream, Zilla, Archive Embed, StreamWish fallback)
  let canProbeViaProxy = false;
  try {
    canProbeViaProxy = isDomainAllowlisted(new URL(cleanUrl).hostname);
  } catch {
    canProbeViaProxy = false;
  }

  if (!canProbeViaProxy) {
    return saveAndReturn({ alive: true, frameBlocked: false });
  }

  const fetched = await fetchFreshEmbedForExtraction(cleanUrl, 4500);
  // Treat network/proxy timeout (502 with empty HTML) as inconclusive for embeds unless it's a known dead status
  if (fetched.status === 502 && !fetched.html) {
    return saveAndReturn({ alive: true, frameBlocked: false });
  }
  const health = detectDeadEmbedFromHtml(fetched.html, fetched.status, cleanUrl, {
    xFrameOptions: fetched.xfo,
    csp: fetched.csp
  });
  return saveAndReturn({
    alive: health.alive,
    frameBlocked: health.frameBlocked,
    detectedLanguage: health.detectedLanguage
  });
}

async function runBoundedPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return results;
}

const PROVIDER_HOST_TO_ID: ReadonlyArray<[RegExp, string]> = [
  [/hentaila\.com/i, 'hentaila'],
  [/hentaijk\.com/i, 'hentaijk'],
  [/jkanime\./i, 'jkanime'],
  [/monoschinos(?:\.st|2\.(?:com|net))/i, 'monoschinos'],
  [/animeav1\.com/i, 'animeav1'],
  [/tvanime\.tv/i, 'tvanime'],
  [/henaojara\.net/i, 'henaojara'],
  [/tioanime\.com/i, 'tioanime'],
  [/archive\.org/i, 'archive_org']
];

function inferProviderIdFromUrl(url: string): string | null {
  for (const [rx, id] of PROVIDER_HOST_TO_ID) {
    if (rx.test(url)) return id;
  }
  return null;
}

export class SmartVideoSourceManager {
  providers = [
    new HentaiLASourceProvider(),
    new JKAnimeSourceProvider(),
    new MonosChinosSourceProvider(),
    new AnimeAV1SourceProvider(),
    new TVAnimeSourceProvider(),
    new HenaoJaraSourceProvider(),
    new TioAnimeSourceProvider(),
    new HentaiJKSourceProvider(),
    new InternetArchiveAnimeProvider()
  ];
  circuitBreaker = new ProviderCircuitBreaker({
    failureThreshold: 3,
    cooldownMs: 60 * 1000
  });
  providerTimeoutMs = 15000;
  failedSourcesInSession = new Set<string>();
  rawEpisodeCache = new Map<string, NormalizedSource[]>();
  verifiedEpisodeCache = new Map<string, { sources: NormalizedSource[]; expiresAt: number }>();
  inflightMap = new Map<string, Promise<NormalizedSource[]>>();
  verifyInflightMap = new Map<string, Promise<NormalizedSource[]>>();

  constructor() {
    onProxyUpstreamEvent((url, status, timedOut) => {
      const providerId = inferProviderIdFromUrl(url);
      if (!providerId) return;
      this.circuitBreaker.recordHttpStatus(providerId, status, timedOut);
    });
  }

  getCacheKey(ctx: EpisodeResolveContext): string {
    const mode = AppPreferencesManager.isShowAdultContentEnabled() ? 'adult' : 'safe';
    return `${mode}::${ctx.seasonId || ctx.slug || 'anime'}::s${ctx.season || 1}::e${ctx.episode || 1}`;
  }

  clearRawCacheForAdultPref(): void {
    this.rawEpisodeCache.clear();
    this.verifiedEpisodeCache.clear();
  }

  async fetchRawSources(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    const showAdult = AppPreferencesManager.isShowAdultContentEnabled();
    const key = this.getCacheKey(ctx);
    const cached = this.rawEpisodeCache.get(key);
    if (cached) return cached;

    const inflight = this.inflightMap.get(key);
    if (inflight) return inflight;

    const activeProviders = this.providers.filter((p) => {
      if (!showAdult && isAdultProviderId(p.id)) {
        return false;
      }
      if (!this.circuitBreaker.canAttempt(p.id)) {
        return false;
      }
      return true;
    });

    const job = (async () => {
      const results = await Promise.all(
        activeProviders.map(async (p) => {
          const outcome = await withProviderTimeout(
            () => p.resolve(ctx),
            this.providerTimeoutMs,
            p.id
          );
          if (outcome.ok === false) {
            this.circuitBreaker.recordFailure(p.id, outcome.reason);
            return [] as NormalizedSource[];
          }
          if (Array.isArray(outcome.value) && outcome.value.length > 0) {
            this.circuitBreaker.recordSuccess(p.id);
          }
          return Array.isArray(outcome.value) ? outcome.value : [];
        })
      );
      const safeRaw = filterSafeAnimeSources(
        results.flat().filter((s) => s && s.url),
        showAdult
      );
      const flat = ensureGuaranteedEpisodeSources(ctx, safeRaw);
      if (flat.length > 0) {
        this.rawEpisodeCache.set(key, flat);
      }
      return flat;
    })();

    this.inflightMap.set(key, job);
    try {
      return await job;
    } finally {
      this.inflightMap.delete(key);
    }
  }

  async probeAndVerifySources(
    ctx: EpisodeResolveContext,
    rawSources: NormalizedSource[],
    preferredLanguage = 'SUB'
  ): Promise<NormalizedSource[]> {
    const key = this.getCacheKey(ctx);
    const cached = this.verifiedEpisodeCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.sources;
    }

    const inflight = this.verifyInflightMap.get(key);
    if (inflight) return inflight;

    const job = (async () => {
      if (!Array.isArray(rawSources) || rawSources.length === 0) return [];

      // Pre-deduplicate identical raw URLs before probing while keeping all languages and distinct same-host mirrors,
      // prioritizing the user's active audio mode so active-language MP4Upload/YourUpload/Mega links probe first!
      const preDeduped = this.rankRawSources(rawSources, preferredLanguage, {
        deduplicateByProviderHost: false,
        strictLanguageFilter: false
      });

      // Separate MP4Upload candidates so they probe sequentially (avoids MP4Upload per-IP concurrent connection drops!)
      const mp4UploadSources: NormalizedSource[] = [];
      const otherSources: NormalizedSource[] = [];
      for (const s of preDeduped) {
        if (s.url.toLowerCase().includes('mp4upload.com')) {
          mp4UploadSources.push(s);
        } else {
          otherSources.push(s);
        }
      }

      const outcomeByUrl = new Map<string, CachedProbeOutcome>();
      const safeProbeWithCap = async (s: NormalizedSource): Promise<CachedProbeOutcome> => {
        try {
          return await Promise.race([
            probeSingleSource(s),
            new Promise<CachedProbeOutcome>((resolve) =>
              setTimeout(() => resolve({ alive: true, frameBlocked: false, expiresAt: Date.now() + 20_000 }), 6500)
            )
          ]);
        } catch {
          return { alive: true, frameBlocked: false, expiresAt: Date.now() + 20_000 };
        }
      };

      const allProbesPromise = Promise.all([
        (async () => {
          for (const s of mp4UploadSources) {
            outcomeByUrl.set(s.url, await safeProbeWithCap(s));
          }
        })(),
        runBoundedPool(otherSources, 5, async (s) => {
          outcomeByUrl.set(s.url, await safeProbeWithCap(s));
        })
      ]);

      await Promise.race([
        allProbesPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 9000))
      ]);

      const verifiedList: NormalizedSource[] = [];
      for (const src of preDeduped) {
        const probe = outcomeByUrl.get(src.url);
        if (!probe) {
          verifiedList.push(src);
          continue;
        }
        if (!probe.alive) {
          // Confirmed dead (404/410/DMCA/deleted/broken stream): hide from active list!
          this.failedSourcesInSession.add(src.url);
          continue;
        }
        const nextLang = probe.detectedLanguage || src.language;
        const nextExternalOnly = Boolean(src.externalOnly) || Boolean(probe.frameBlocked);
        const nextDirect = Boolean(probe.verifiedDirect) || src.direct;
        const nextType = probe.streamType || src.type;
        verifiedList.push(
          new NormalizedSource({
            ...src,
            language: nextLang,
            externalOnly: nextExternalOnly,
            direct: nextDirect,
            type: nextType,
            verified: Boolean(probe.verifiedDirect || !probe.frameBlocked),
            status: 'AVAILABLE'
          })
        );
      }

      const finalSources =
        verifiedList.length > 0
          ? verifiedList
          : preDeduped.filter((s) => !this.failedSourcesInSession.has(s.url));

      this.verifiedEpisodeCache.set(key, {
        sources: finalSources,
        expiresAt: Date.now() + PROBE_CACHE_TTL_MS
      });
      return finalSources;
    })();

    this.verifyInflightMap.set(key, job);
    try {
      return await job;
    } finally {
      this.verifyInflightMap.delete(key);
    }
  }

  rankRawSources(
    rawList: NormalizedSource[],
    targetLanguage = 'SUB',
    options?: RankDeduplicateOptions
  ): NormalizedSource[] {
    const showAdult = AppPreferencesManager.isShowAdultContentEnabled();
    const safeList = filterSafeAnimeSources(rawList || [], showAdult);
    if (nWin.NyAnimeVideoSources?.rankAndDeduplicateSources) {
      return nWin.NyAnimeVideoSources.rankAndDeduplicateSources(
        safeList,
        targetLanguage,
        this.failedSourcesInSession,
        options
      );
    }
    return [...safeList].sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  async resolveAndRankSources(ctx: EpisodeResolveContext, targetLanguage = 'SUB'): Promise<NormalizedSource[]> {
    const rawList = await this.fetchRawSources(ctx);
    const verifiedList = await this.probeAndVerifySources(ctx, rawList, targetLanguage);
    return this.rankRawSources(verifiedList, targetLanguage);
  }

  markSourceFailed(url: string): void {
    if (url) this.failedSourcesInSession.add(url);
  }
}

export const videoSourceManager = new SmartVideoSourceManager();

let _playerWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
let _activeStartupWatchdog: NativeStartupWatchdogHandle | null = null;
let _pendingFailoverStatusPrefix = '';
let _upNextIntervalTimer: ReturnType<typeof setInterval> | null = null;
let activeVideoWatchBufferSec = 0;
let activeVideoLastTickPos: number | null = null;
let activeIframeLoadedAtMs: number | null = null;
let activeIframeLastFlushedAtMs: number | null = null;
let _playerVisibilityBound = false;

let activeAniSkipIntervals: AniSkipInterval[] = [];
let activeAniSkipSegment: AniSkipInterval | null = null;
let aniSkipDismissedIds = new Set<string>();
let aniSkipAutoSkippedIds = new Set<string>();

let watchTogetherOpen = false;
let activeRoomId: string | null = null;
let activeRoomData: WatchRoomState | null = null;
let activeRoomParticipants: Array<{ uid: string; displayName?: string }> = [];
let activeRoomMessages: Array<{ id?: string; uid: string; displayName?: string; text: string; createdAt?: number }> = [];
let roomUnsubscribe: (() => void) | null = null;
let isApplyingRemoteSync = false;
let isSwitchingLocalServer = false;
let _localServerSwitchTimer: ReturnType<typeof setTimeout> | null = null;
let isWatchTogetherBusy = false;
let lastAppliedRoomUpdatedAtMs = 0;
let _watchTogetherClockTimer: ReturnType<typeof setInterval> | null = null;
let _wtDriftCheckTick = 0;

function resetAniSkipState(): void {
  aniSkipRequestGuard.invalidate();
  activeAniSkipIntervals = [];
  activeAniSkipSegment = null;
  aniSkipDismissedIds = new Set<string>();
  aniSkipAutoSkippedIds = new Set<string>();
  document.getElementById('player-aniskip-overlay')?.remove();
}

export function syncAutoSkipButtonUI(): void {
  const btn = document.getElementById('btn-autoskip-toggle');
  if (!btn) return;
  const enabled = AppPreferencesManager.get().autoSkipIntro;
  btn.classList.toggle('active', enabled);
  btn.textContent = enabled ? 'Auto-Salto: ON' : 'Auto-Salto: OFF';
}

export function toggleAutoSkipIntro(): void {
  const next = !AppPreferencesManager.get().autoSkipIntro;
  AppPreferencesManager.setAutoSkipIntro(next);
  syncAutoSkipButtonUI();
  showToast(next ? 'Auto-Salto de Intro activado' : 'Auto-Salto desactivado');
}

export function saltarSegundosPlayer(seconds = 85): void {
  const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
  if (!vidEl) {
    showToast('Usa un servidor directo (Sin Anuncios) para adelantar +85s desde la app.');
    return;
  }
  const target = computeSafeSeekTarget(vidEl.currentTime || 0, seconds, vidEl.duration);
  vidEl.currentTime = target;
  activeVideoLastTickPos = target;
  showToast(`+${Math.round(seconds)}s (${formatPlaybackTime(target)})`);
  void broadcastWatchTogetherState();
}

function updateAniSkipOverlayUI(seg: AniSkipInterval | null): void {
  activeAniSkipSegment = seg;
  const existing = document.getElementById('player-aniskip-overlay');
  if (!seg || aniSkipDismissedIds.has(seg.skipId)) {
    existing?.remove();
    return;
  }
  const container = document.getElementById('contenedor-video');
  if (!container) return;

  if (existing && existing.dataset.skipId === seg.skipId) return;
  existing?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'player-aniskip-overlay';
  overlay.className = 'player-aniskip-overlay';
  overlay.dataset.skipId = seg.skipId;
  overlay.innerHTML = `
    <button type="button" class="aniskip-btn" onclick="saltarSegmentoAniSkipActiva()">${escHtml(seg.label)} →</button>
    <button type="button" class="aniskip-dismiss-btn" title="Ocultar" aria-label="Ocultar aviso" onclick="descartarAniSkipOverlay()">✕</button>
  `;
  container.appendChild(overlay);
}

export function saltarSegmentoAniSkipActiva(): void {
  const seg = activeAniSkipSegment;
  const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
  if (!seg || !vidEl) return;
  const target = computeSafeSeekTarget(seg.endTime, 0, vidEl.duration);
  vidEl.currentTime = target;
  activeVideoLastTickPos = target;
  aniSkipAutoSkippedIds.add(seg.skipId);
  updateAniSkipOverlayUI(null);
  showToast(seg.label);
  void broadcastWatchTogetherState();
}

export function descartarAniSkipOverlay(): void {
  if (activeAniSkipSegment) {
    aniSkipDismissedIds.add(activeAniSkipSegment.skipId);
  }
  updateAniSkipOverlayUI(null);
}

async function fetchAniSkipForEpisode(malId: number | string | undefined, ep: number): Promise<void> {
  const url = buildAniSkipUrl(malId, ep);
  if (!url) return;
  const { seq, signal } = aniSkipRequestGuard.next();
  const snapshotEp = ep;
  try {
    const res = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(url)}&probe=1`, { signal }, 4500);
    if (!res.ok || !aniSkipRequestGuard.isCurrent(seq)) return;
    const json = await res.json().catch(() => null);
    if (!aniSkipRequestGuard.isCurrent(seq) || state.epActual !== snapshotEp) return;
    activeAniSkipIntervals = parseAniSkipResponse(json);
  } catch {
    // ignore optional AniSkip lookup failure
  }
}

let homeWatchBarExpanded = false;
let homeActiveRooms: WatchRoomState[] = [];
let homeRoomsUnsubscribe: (() => void) | null = null;
let isSyncingRoomNavigation = false;

function getWatchTogetherBridge(): any {
  return nWin.NyAnime?.Core?.watchTogetherBridge || null;
}

function getMyWatchUid(): string {
  const bridge = getWatchTogetherBridge();
  if (bridge?.getCurrentUid) {
    return String(bridge.getCurrentUid() || '');
  }
  const fbUser = nWin.FirebaseAuth?.getCurrentUser ? nWin.FirebaseAuth.getCurrentUser() : null;
  return String(fbUser?.uid || '');
}

const WT_OWNED_ROOMS_KEY = 'nyanime_wt_owned_rooms_v1';
const WT_UNLOCKED_ROOMS_KEY = 'nyanime_wt_unlocked_rooms_v1';

interface OwnedRoomCreds {
  hostUid: string;
  passcode: string;
  inviteToken: string;
}

interface UnlockedRoomCreds {
  passcode?: string;
  inviteToken?: string;
}

let pendingProtectedRoomJoin: {
  roomId: string;
  animeTitle?: string;
  hostName?: string;
} | null = null;

function readRoomCredsMap<T>(storageKey: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeRoomCredsMap<T>(storageKey: string, map: Record<string, T>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

function getOwnedRoomCreds(roomId: string): OwnedRoomCreds | null {
  const norm = normalizeRoomCode(roomId);
  if (!norm) return null;
  const map = readRoomCredsMap<OwnedRoomCreds>(WT_OWNED_ROOMS_KEY);
  return map[norm] || null;
}

function saveOwnedRoomCreds(roomId: string, creds: OwnedRoomCreds): void {
  const norm = normalizeRoomCode(roomId);
  if (!norm) return;
  const map = readRoomCredsMap<OwnedRoomCreds>(WT_OWNED_ROOMS_KEY);
  map[norm] = creds;
  writeRoomCredsMap(WT_OWNED_ROOMS_KEY, map);
}

function removeOwnedRoomCreds(roomId: string): void {
  const norm = normalizeRoomCode(roomId);
  if (!norm) return;
  const map = readRoomCredsMap<OwnedRoomCreds>(WT_OWNED_ROOMS_KEY);
  delete map[norm];
  writeRoomCredsMap(WT_OWNED_ROOMS_KEY, map);
}

function getUnlockedRoomCreds(roomId: string): UnlockedRoomCreds | null {
  const norm = normalizeRoomCode(roomId);
  if (!norm) return null;
  const map = readRoomCredsMap<UnlockedRoomCreds>(WT_UNLOCKED_ROOMS_KEY);
  return map[norm] || null;
}

function saveUnlockedRoomCreds(roomId: string, creds: UnlockedRoomCreds): void {
  const norm = normalizeRoomCode(roomId);
  if (!norm) return;
  const map = readRoomCredsMap<UnlockedRoomCreds>(WT_UNLOCKED_ROOMS_KEY);
  map[norm] = { ...map[norm], ...creds };
  writeRoomCredsMap(WT_UNLOCKED_ROOMS_KEY, map);
}

function isWatchRoomOwner(roomId: string, hostUid?: string): boolean {
  const myUid = getMyWatchUid();
  if (hostUid && myUid && hostUid === myUid) return true;
  const owned = getOwnedRoomCreds(roomId);
  return Boolean(owned && (!owned.hostUid || !myUid || owned.hostUid === myUid));
}

function getMyPrivateVisibleWatchRooms(): WatchRoomState[] {
  const seen = new Set<string>();
  const result: WatchRoomState[] = [];

  if (activeRoomId && activeRoomData && activeRoomData.status === 'active') {
    seen.add(activeRoomData.roomId);
    result.push(activeRoomData);
  }

  for (const r of homeActiveRooms) {
    if (!r || r.status !== 'active' || seen.has(r.roomId)) continue;
    // PRIVACY ENFORCEMENT: Never list strangers' rooms publicly!
    // Only show rooms where the current user is the creator/owner or currently connected.
    if (activeRoomId === r.roomId || isWatchRoomOwner(r.roomId, r.hostUid)) {
      seen.add(r.roomId);
      result.push(r);
    }
  }
  return result;
}

export function getOwnedWatchRoomsList(): Array<{
  roomId: string;
  passcode: string;
  inviteToken: string;
  room: WatchRoomState | null;
}> {
  const credsMap = readRoomCredsMap<OwnedRoomCreds>(WT_OWNED_ROOMS_KEY);
  const myUid = getMyWatchUid();
  const map = new Map<
    string,
    {
      roomId: string;
      passcode: string;
      inviteToken: string;
      room: WatchRoomState | null;
    }
  >();

  for (const [rawCode, creds] of Object.entries(credsMap)) {
    const code = normalizeRoomCode(rawCode);
    if (!code) continue;
    if (creds?.hostUid && myUid && creds.hostUid !== myUid) continue;
    const liveMatch =
      (activeRoomId === code && activeRoomData ? activeRoomData : null) ||
      homeActiveRooms.find((r) => r.roomId === code) ||
      null;
    if (liveMatch && liveMatch.status === 'closed') continue;
    map.set(code, {
      roomId: code,
      passcode: String(creds?.passcode || ''),
      inviteToken: String(creds?.inviteToken || ''),
      room: liveMatch
    });
  }

  for (const r of homeActiveRooms) {
    if (!r || r.status !== 'active') continue;
    if (myUid && r.hostUid === myUid && !map.has(r.roomId)) {
      const saved = getOwnedRoomCreds(r.roomId);
      map.set(r.roomId, {
        roomId: r.roomId,
        passcode: String(saved?.passcode || ''),
        inviteToken: String(saved?.inviteToken || ''),
        room: r
      });
    }
  }

  return Array.from(map.values());
}

export function copiarInvitacionSalaPorId(roomIdArg: string): void {
  const code = normalizeRoomCode(roomIdArg);
  if (!code) return;
  const owned = getOwnedRoomCreds(code);
  const unlocked = getUnlockedRoomCreds(code);
  const inviteToken = owned?.inviteToken || unlocked?.inviteToken || '';
  const url = buildWatchRoomInviteUrl(
    window.location.origin,
    window.location.pathname,
    code,
    inviteToken
  );
  const passSuffix = owned?.passcode ? ` · Clave: ${owned.passcode}` : '';
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        showToast(`Enlace de invitación copiado (${code}${passSuffix}) ✓`);
      })
      .catch(() => {
        showToast(`Sala ${code}${passSuffix}`);
      });
  } else {
    showToast(`Sala ${code}${passSuffix}`);
  }
}

export async function eliminarTodasMisSalasWatchTogether(): Promise<void> {
  const ownedList = getOwnedWatchRoomsList();
  if (ownedList.length === 0) {
    showToast('No tienes salas creadas activas.');
    return;
  }
  const bridge = getWatchTogetherBridge();
  for (const item of ownedList) {
    try {
      if (bridge?.deleteRoom) {
        await bridge.deleteRoom(item.roomId);
      }
    } catch {
      // ignore individual room deletion error
    }
    removeOwnedRoomCreds(item.roomId);
    homeActiveRooms = homeActiveRooms.filter((r) => r.roomId !== item.roomId);
    if (activeRoomId === item.roomId) {
      await detachWatchTogetherLocal();
    }
  }
  renderHomeWatchTogetherBanner();
  renderProfileOwnedWatchRooms();
  showToast('Todas tus salas creadas fueron cerradas y eliminadas.');
}

export function renderProfileOwnedWatchRooms(): void {
  const containers = [
    document.getElementById('profile-owned-watch-rooms-body'),
    document.getElementById('profile-cuenta-owned-watch-rooms-body')
  ].filter((el): el is HTMLElement => Boolean(el));

  if (containers.length === 0) return;

  const ownedList = getOwnedWatchRoomsList();
  const countBadge = document.getElementById('profile-owned-rooms-count-badge');
  if (countBadge) {
    countBadge.textContent = `${ownedList.length} ${ownedList.length === 1 ? 'activa' : 'activas'}`;
  }

  let html = '';
  if (ownedList.length === 0) {
    html = `
      <div class="profile-wt-empty">
        <div class="profile-wt-empty-text">
          No tienes salas creadas activas en este momento. Las salas son 100% privadas: solo se puede entrar con la <strong>contraseña del creador</strong> o mediante el <strong>enlace de invitación</strong>.
        </div>
        <div class="oled-btn-row" style="margin-top:10px; flex-wrap:wrap;">
          <button type="button" class="oled-btn-secondary" onclick="cambiarTab('inicio'); toggleHomeWatchTogetherBar();">Unirse con Código o Enlace</button>
        </div>
      </div>
    `;
  } else {
    const cardsHtml = ownedList
      .map((item) => {
        const r = item.room;
        const isPlaying = r ? r.playbackState === 'playing' : false;
        const liveSec = r ? computeTargetSyncedTime(r, Date.now()) : 0;
        const isJoined = activeRoomId === item.roomId;
        const titleText = r?.animeTitle
          ? `${r.animeTitle} · T${Number(r.seasonNum || 1)} Ep ${Number(r.episodeNum || 1)} (${formatPlaybackTime(liveSec)})`
          : 'Sala privada creada por ti · Lista para continuar';
        const passText = item.passcode ? `Clave: ${escHtml(item.passcode)}` : 'Protegida por enlace';

        return `
          <div class="home-wt-live-card profile-wt-owned-card" data-owned-room="${escHtml(item.roomId)}">
            <div class="home-wt-live-info">
              <div class="home-wt-live-top" style="flex-wrap:wrap; gap:6px;">
                <span class="home-wt-live-badge">${r ? (isPlaying ? 'EN VIVO' : 'PAUSA') : 'PROPIETARIO'}</span>
                <span class="wt-room-code">${escHtml(item.roomId)}</span>
                <span class="wt-pass-badge">${passText}</span>
              </div>
              <div class="home-wt-live-title">${escHtml(titleText)}</div>
            </div>
            <div class="home-wt-actions" style="flex-wrap:wrap;">
              <button type="button" class="home-wt-join-live-btn" onclick="abrirSalaWatchTogetherDesdeCodigo('${escHtml(item.roomId)}')">
                ${isJoined ? 'En Sala (Abrir) →' : 'Continuar Sala →'}
              </button>
              <button type="button" class="wt-action-chip" title="Copiar enlace de invitación y contraseña" onclick="copiarInvitacionSalaPorId('${escHtml(item.roomId)}')">
                Invitación
              </button>
              <button type="button" class="wt-action-chip danger" title="Cerrar y eliminar esta sala para todos" onclick="eliminarSalaWatchTogether('${escHtml(item.roomId)}')">
                Cerrar Sala
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    html = `
      <div class="home-wt-live-list" style="margin-bottom:10px;">
        ${cardsHtml}
      </div>
      ${
        ownedList.length > 1
          ? `<div style="display:flex; justify-content:flex-end;">
               <button type="button" class="wt-action-chip danger" onclick="eliminarTodasMisSalasWatchTogether()">Cerrar Todas Mis Salas (${ownedList.length})</button>
             </div>`
          : ''
      }
    `;
  }

  for (const container of containers) {
    container.innerHTML = html;
  }
}

function renderHomeWatchTogetherBanner(): void {
  const banner = document.getElementById('home-watch-together-banner');
  const dot = document.getElementById('home-wt-live-dot');
  const topBtn = document.getElementById('btn-home-watch-together');
  const myVisibleRooms = getMyPrivateVisibleWatchRooms();
  const hasMyLiveRooms = myVisibleRooms.length > 0;

  if (dot) {
    dot.classList.toggle('hide', !hasMyLiveRooms);
  }
  if (topBtn) {
    topBtn.classList.toggle('active', homeWatchBarExpanded || hasMyLiveRooms || Boolean(activeRoomId));
  }
  if (!banner) return;

  const shouldShow = homeWatchBarExpanded || hasMyLiveRooms || Boolean(activeRoomId);
  banner.classList.toggle('hide', !shouldShow);
  if (!shouldShow) {
    renderProfileOwnedWatchRooms();
    return;
  }

  const liveCardsHtml = myVisibleRooms
    .slice(0, 3)
    .map((r) => {
      const liveSec = computeTargetSyncedTime(r, Date.now());
      const isPlaying = r.playbackState === 'playing';
      const isJoined = activeRoomId === r.roomId;
      const isOwner = isWatchRoomOwner(r.roomId, r.hostUid);
      const ownedCreds = getOwnedRoomCreds(r.roomId);
      return `
        <div class="home-wt-live-card">
          <div class="home-wt-live-info">
            <div class="home-wt-live-top">
              <span class="home-wt-live-badge">${isPlaying ? 'EN VIVO' : 'PAUSA'}</span>
              <span class="wt-room-code">${escHtml(r.roomId)}</span>
              ${ownedCreds?.passcode ? `<span class="wt-pass-badge">Clave: ${escHtml(ownedCreds.passcode)}</span>` : ''}
              <span class="home-wt-live-host">${isOwner ? 'Tu sala (Propietario)' : `por ${escHtml(r.hostName || 'Anfitrión')}`}</span>
            </div>
            <div class="home-wt-live-title">${escHtml(r.animeTitle || 'Anime')} · T${Number(r.seasonNum || 1)} Ep ${Number(r.episodeNum || 1)} (${formatPlaybackTime(liveSec)})</div>
          </div>
          <div class="home-wt-actions">
            <button type="button" class="home-wt-join-live-btn" onclick="abrirSalaWatchTogetherDesdeCodigo('${escHtml(r.roomId)}')">
              ${isJoined ? 'Abrir Sala →' : 'Continuar Sala →'}
            </button>
            ${
              isOwner
                ? `<button type="button" class="wt-action-chip" title="Copiar enlace de invitación" onclick="copiarInvitacionSalaPorId('${escHtml(r.roomId)}')">Invitar</button>
                   <button type="button" class="wt-action-chip danger" title="Cerrar y eliminar esta sala" onclick="eliminarSalaWatchTogether('${escHtml(r.roomId)}')">Cerrar</button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');

  banner.innerHTML = `
    <div class="home-wt-banner-inner">
      <div class="home-wt-banner-head">
        <div>
          <div class="home-wt-banner-title">Watch Together · Salas Privadas Sincronizadas</div>
          <div class="home-wt-banner-sub">Acceso exclusivo con la contraseña del creador o mediante enlace de invitación. Gestiona tus salas creadas en Mi Perfil.</div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button type="button" class="wt-action-chip" onclick="cambiarTab('perfil')">Mis Salas en Perfil →</button>
          ${
            !hasMyLiveRooms
              ? `<button type="button" class="wt-close-btn" onclick="toggleHomeWatchTogetherBar()" aria-label="Cerrar panel">✕</button>`
              : ''
          }
        </div>
      </div>
      ${liveCardsHtml ? `<div class="home-wt-live-list">${liveCardsHtml}</div>` : ''}
      <div class="home-wt-code-row">
        <input type="text"
               id="home-wt-code-input"
               class="wt-code-input"
               placeholder="Código de sala (pedirá contraseña) o pega el enlace de invitación"
               maxlength="240"
               aria-label="Código o enlace de sala Watch Together"
               onkeydown="if(event.key==='Enter'){ event.preventDefault(); unirseSalaDesdeHome(); }">
        <button type="button" class="wt-create-btn" onclick="unirseSalaDesdeHome()">Entrar a Sala</button>
      </div>
    </div>
  `;
  renderProfileOwnedWatchRooms();
}

export function toggleHomeWatchTogetherBar(): void {
  homeWatchBarExpanded = !homeWatchBarExpanded;
  renderHomeWatchTogetherBanner();
  if (homeWatchBarExpanded) {
    setTimeout(() => {
      const inp = document.getElementById('home-wt-code-input') as HTMLInputElement | null;
      inp?.focus();
    }, 60);
  }
}

export async function unirseSalaDesdeHome(codeArg?: string): Promise<void> {
  const inp = document.getElementById('home-wt-code-input') as HTMLInputElement | null;
  const rawInput = codeArg || inp?.value || '';
  const parsed = parseRoomJoinInput(rawInput);
  if (!parsed.roomId || parsed.roomId.length < 4) {
    showToast('Ingresa un código de sala o enlace de invitación válido (ej. NY-TDUNE3).');
    return;
  }
  if (inp) inp.value = '';
  await abrirSalaWatchTogetherDesdeCodigo(parsed.roomId, parsed.inviteKey);
}

export function initHomeWatchTogetherListener(): void {
  if (homeRoomsUnsubscribe) return;
  const tryBind = (attempt = 0) => {
    const bridge = getWatchTogetherBridge();
    if (!bridge?.subscribeActiveRooms) {
      if (attempt < 15) {
        setTimeout(() => tryBind(attempt + 1), 300);
      }
      return;
    }
    homeRoomsUnsubscribe = bridge.subscribeActiveRooms((rooms: WatchRoomState[]) => {
      homeActiveRooms = Array.isArray(rooms) ? rooms : [];
      renderHomeWatchTogetherBanner();
      renderProfileOwnedWatchRooms();
    });
  };
  tryBind();
}

function getEffectiveRoomTimeSeconds(): number {
  const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
  if (vidEl && Number.isFinite(vidEl.currentTime)) {
    return Math.max(0, Number(vidEl.currentTime || 0));
  }
  if (activeRoomData) {
    return computeTargetSyncedTime(activeRoomData, Date.now());
  }
  return 0;
}

function beginLocalServerSwitchGuard(): void {
  isSwitchingLocalServer = true;
  if (_localServerSwitchTimer) clearTimeout(_localServerSwitchTimer);
  _localServerSwitchTimer = setTimeout(() => {
    isSwitchingLocalServer = false;
    _localServerSwitchTimer = null;
  }, 1500);
}

async function broadcastWatchTogetherState(
  forcePlaybackState?: 'playing' | 'paused',
  overrideTimeSec?: number
): Promise<void> {
  if (!activeRoomId || isApplyingRemoteSync || isSwitchingLocalServer) return;
  const bridge = getWatchTogetherBridge();
  if (!bridge?.updatePlayback) return;

  const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
  const currentSeason = state.seasons?.[state.temporadaActualIdx] || {
    id: state.anime?.id,
    seasonNumber: 1,
    title: state.anime?.title?.english || state.anime?.title?.romaji || 'Anime'
  };
  const fallbackState = activeRoomData?.playbackState || 'playing';
  const playbackState: 'playing' | 'paused' =
    forcePlaybackState || (vidEl ? (vidEl.paused ? 'paused' : 'playing') : fallbackState);
  const playbackTime =
    typeof overrideTimeSec === 'number' && Number.isFinite(overrideTimeSec)
      ? Math.max(0, overrideTimeSec)
      : getEffectiveRoomTimeSeconds();

  lastAppliedRoomUpdatedAtMs = Date.now();
  try {
    await bridge.updatePlayback(activeRoomId, {
      animeId: Number(state.anime?.id || currentSeason.id || 0),
      seasonId: Number(currentSeason.id || state.anime?.id || 0),
      animeTitle: String(
        currentSeason.title || state.anime?.title?.english || state.anime?.title?.romaji || 'Anime'
      ),
      seasonNum: Number(currentSeason.seasonNumber || 1),
      episodeNum: Number(state.epActual || 1),
      playbackState,
      playbackTime
    });
  } catch {
    // ignore background sync hiccup
  }
}

function applyRoomSyncToNativeVideo(room: WatchRoomState, forceSeek = false): boolean {
  const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
  if (!vidEl || vidEl.readyState < 1) return false;
  const targetTime = computeTargetSyncedTime(room, Date.now(), vidEl.duration);
  const playing = isRoomPlaying(room);
  isApplyingRemoteSync = true;
  try {
    if (forceSeek || shouldSeekForDrift(vidEl.currentTime || 0, targetTime, 1.8)) {
      vidEl.currentTime = targetTime;
      activeVideoLastTickPos = targetTime;
    }
    if (playing && vidEl.paused) {
      vidEl.play().catch(() => {
        // Fallback to muted autoplay if browser blocked unmuted remote play
        vidEl.muted = true;
        void vidEl.play().catch(() => {});
        showToast('Reproducción sincronizada (activa el sonido en el reproductor)');
      });
    } else if (!playing && !vidEl.paused) {
      vidEl.pause();
    }
  } finally {
    setTimeout(() => {
      isApplyingRemoteSync = false;
    }, 550);
  }
  return true;
}

async function sincronizarNavegacionConSala(room: WatchRoomState): Promise<void> {
  if (!room || isSyncingRoomNavigation) return;
  const targetAnimeId = Number(room.seasonId || room.animeId || 0);
  const targetEp = Math.max(1, Number(room.episodeNum || 1));
  const targetSeasonNum = Math.max(1, Number(room.seasonNum || 1));
  if (!targetAnimeId) return;

  const repScreen = document.getElementById('pantalla-reproductor');
  const isPlayerVisible = Boolean(repScreen && !repScreen.classList.contains('hide'));

  const findMatchingSeasonIdx = (): number => {
    if (!Array.isArray(state.seasons) || state.seasons.length === 0) return -1;
    if (room.seasonId) {
      const byId = state.seasons.findIndex((s: any) => String(s?.id) === String(room.seasonId));
      if (byId >= 0) return byId;
    }
    const byAnimeId = state.seasons.findIndex((s: any) => String(s?.id) === String(room.animeId));
    if (byAnimeId >= 0 && state.seasons[byAnimeId]?.seasonNumber === targetSeasonNum) {
      return byAnimeId;
    }
    const bySeasonNum = state.seasons.findIndex(
      (s: any) => Number(s?.seasonNumber || 1) === targetSeasonNum
    );
    return bySeasonNum;
  };

  const currentAnimeMatches =
    Boolean(state.anime?.id) &&
    (String(state.anime?.id) === String(room.animeId) ||
      String(state.anime?.id) === String(room.seasonId) ||
      findMatchingSeasonIdx() >= 0);

  isSyncingRoomNavigation = true;
  isApplyingRemoteSync = true;
  try {
    if (!currentAnimeMatches) {
      await new Promise<void>((resolve) => {
        let resolved = false;
        const done = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };
        void uiHooks.abrirDetalle(targetAnimeId, done).finally(done);
      });
    }

    const matchedIdx = findMatchingSeasonIdx();
    if (matchedIdx >= 0 && matchedIdx !== state.temporadaActualIdx) {
      state.temporadaActualIdx = matchedIdx;
      renderDetalleEpisodios();
    }

    const currentSeason = state.seasons?.[state.temporadaActualIdx] || { seasonNumber: 1 };
    const needOpenOrSwitchEp =
      !isPlayerVisible ||
      Number(state.epActual) !== targetEp ||
      Number(currentSeason.seasonNumber || 1) !== targetSeasonNum;

    if (needOpenOrSwitchEp) {
      if (!isPlayerVisible) {
        abrirReproductor(targetEp);
      } else {
        cambiarEpisodioRep(targetEp, true);
      }
    }
  } finally {
    setTimeout(() => {
      isSyncingRoomNavigation = false;
      isApplyingRemoteSync = false;
    }, 900);
  }
}

function renderWatchTogetherMessagesAndMeta(): void {
  const msgsEl = document.getElementById('wt-chat-messages');
  const partsEl = document.getElementById('wt-participants-row');
  const syncMetaEl = document.getElementById('wt-sync-meta');
  const playToggleBtn = document.getElementById('wt-btn-play-toggle');
  const myUid = getMyWatchUid();

  if (partsEl) {
    partsEl.innerHTML =
      activeRoomParticipants.length === 0
        ? '<span class="wt-part-chip">Conectando participantes...</span>'
        : activeRoomParticipants
            .map((p) => `<span class="wt-part-chip">${escHtml(p.displayName || 'Otaku')}</span>`)
            .join('');
  }

  if (activeRoomData) {
    const isPlaying = activeRoomData.playbackState === 'playing';
    const liveTimeSec = computeTargetSyncedTime(activeRoomData, Date.now());
    const actorSuffix = activeRoomData.updatedByName
      ? ` · por ${activeRoomData.updatedByName}`
      : '';
    if (syncMetaEl) {
      const stateIcon = isPlaying ? 'En vivo' : 'En pausa';
      syncMetaEl.textContent = `${stateIcon} · Ep ${activeRoomData.episodeNum} · ${formatPlaybackTime(liveTimeSec)}${actorSuffix}`;
    }
    if (playToggleBtn) {
      playToggleBtn.textContent = isPlaying ? 'Pausar' : 'Reproducir';
      playToggleBtn.classList.toggle('is-playing', isPlaying);
    }
  }

  const delBtn = document.getElementById('wt-delete-room-btn');
  if (delBtn && activeRoomId) {
    const isOwner = isWatchRoomOwner(activeRoomId, activeRoomData?.hostUid);
    delBtn.classList.toggle('hide', !isOwner);
  }
  const passBadgeEl = document.getElementById('wt-room-pass-badge');
  if (passBadgeEl && activeRoomId) {
    const owned = getOwnedRoomCreds(activeRoomId);
    const unlocked = getUnlockedRoomCreds(activeRoomId);
    const knownPass = owned?.passcode || unlocked?.passcode || '';
    if (knownPass) {
      passBadgeEl.textContent = `Clave: ${knownPass}`;
      passBadgeEl.classList.remove('hide');
    } else {
      passBadgeEl.classList.add('hide');
    }
  }

  if (msgsEl) {
    if (activeRoomMessages.length === 0) {
      msgsEl.innerHTML = '<div class="wt-chat-empty">Saluda a tus amigos en la sala</div>';
    } else {
      msgsEl.innerHTML = activeRoomMessages
        .map((m) => {
          const isMine = Boolean(myUid && m.uid === myUid);
          return `
            <div class="wt-chat-msg ${isMine ? 'mine' : ''}">
              <span class="wt-chat-author">${escHtml(m.displayName || 'Usuario')}:</span>
              <span class="wt-chat-text">${escHtml(m.text)}</span>
            </div>
          `;
        })
        .join('');
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }
  }
}

export function renderWatchTogetherPanel(): void {
  const panel = document.getElementById('watch-together-panel');
  const btn = document.getElementById('btn-watch-together');
  if (btn) {
    btn.classList.toggle('active', watchTogetherOpen || Boolean(activeRoomId));
    btn.textContent = activeRoomId ? `Sala ${activeRoomId}` : 'Watch Together';
  }
  if (!panel) return;
  panel.classList.toggle('hide', !watchTogetherOpen);
  if (!watchTogetherOpen) return;

  if (!activeRoomId) {
    panel.dataset.roomId = '';
    panel.innerHTML = `
      <div class="wt-panel-header">
        <div>
          <div class="wt-title">Sala Compartida (Watch Together)</div>
          <div class="wt-sub">Salas protegidas con contraseña o enlace de invitación único. Sincroniza play, pausa y chat en vivo.</div>
        </div>
        <button type="button" class="wt-close-btn" onclick="toggleWatchTogetherPanel()">✕</button>
      </div>
      <div class="wt-lobby-actions">
        <div class="wt-create-row">
          <input type="text"
                 id="wt-create-pass-input"
                 class="wt-create-pass-input"
                 placeholder="Contraseña (vacío = PIN automático)"
                 maxlength="32"
                 aria-label="Contraseña de la nueva sala">
          <button type="button" class="wt-create-btn" ${isWatchTogetherBusy ? 'disabled' : ''} onclick="crearSalaWatchTogether()">Crear Sala</button>
        </div>
        <div class="wt-join-row">
          <input type="text" id="wt-join-code-input" class="wt-code-input" placeholder="Código o enlace de invitación" maxlength="240" aria-label="Código o enlace de sala" onkeydown="if(event.key==='Enter'){ event.preventDefault(); unirseSalaWatchTogether(); }">
          <button type="button" class="wt-join-btn" ${isWatchTogetherBusy ? 'disabled' : ''} onclick="unirseSalaWatchTogether()">Unirse</button>
        </div>
      </div>
    `;
    return;
  }

  // Only rebuild connected shell if not already mounted for this roomId (preserves chat input focus)
  if (panel.dataset.roomId !== activeRoomId) {
    panel.dataset.roomId = activeRoomId;
    const isOwner = isWatchRoomOwner(activeRoomId, activeRoomData?.hostUid);
    const owned = getOwnedRoomCreds(activeRoomId);
    const unlocked = getUnlockedRoomCreds(activeRoomId);
    const knownPass = owned?.passcode || unlocked?.passcode || '';
    panel.innerHTML = `
      <div class="wt-panel-header">
        <div>
          <div class="wt-title">
            Sala <span class="wt-room-code">${escHtml(activeRoomId)}</span>
            <span id="wt-room-pass-badge" class="wt-pass-badge ${knownPass ? '' : 'hide'}" title="Contraseña de la sala">${knownPass ? `Clave: ${escHtml(knownPass)}` : ''}</span>
          </div>
          <div class="wt-sub" id="wt-sync-meta">Sincronizando sala...</div>
        </div>
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          <button type="button" class="wt-action-chip" onclick="copiarEnlaceSalaWatchTogether()">Invitar</button>
          <button type="button" id="wt-delete-room-btn" class="wt-action-chip danger ${isOwner ? '' : 'hide'}" onclick="eliminarSalaWatchTogether()">Eliminar Sala</button>
          <button type="button" class="wt-action-chip" onclick="salirSalaWatchTogether()">Salir</button>
        </div>
      </div>
      <div class="wt-sync-controls-bar">
        <button type="button" id="wt-btn-play-toggle" class="wt-ctrl-btn primary" onclick="togglePlayPauseWatchTogether()">Pausar</button>
        <button type="button" class="wt-ctrl-btn" onclick="seekWatchTogether(-15)">-15s</button>
        <button type="button" class="wt-ctrl-btn" onclick="seekWatchTogether(15)">+15s</button>
        <button type="button" class="wt-ctrl-btn" onclick="seekWatchTogether(85)">+85s</button>
        <button type="button" id="wt-btn-resync" class="wt-ctrl-btn" title="Resincronizar mi reproductor con el tiempo ancla de la sala" onclick="forzarSincronizacionWatchTogether()">Resincronizar</button>
        <div class="wt-manual-time-group">
          <input type="text" id="wt-manual-time-input" class="wt-time-input" placeholder="MM:SS" maxlength="8" aria-label="Saltar a minuto exacto" onkeydown="if(event.key==='Enter'){ event.preventDefault(); aplicarTiempoManualWatchTogether(); }">
          <button type="button" class="wt-ctrl-btn" onclick="aplicarTiempoManualWatchTogether()">Ir</button>
        </div>
      </div>
      <div style="font-size:11px; color:var(--text-muted); margin-top:4px; line-height:1.35;">
        Puedes cambiar tu propio servidor de video arriba sin afectar a los demás; tu tiempo se mantendrá sincronizado.
      </div>
      <div class="wt-participants-row" id="wt-participants-row"></div>
      <div class="wt-chat-messages" id="wt-chat-messages"></div>
      <div class="wt-chat-form">
        <input type="text"
               id="wt-chat-input"
               class="wt-chat-input"
               maxlength="280"
               placeholder="Escribe un mensaje en la sala..."
               aria-label="Mensaje para la sala"
               onkeydown="if(event.key==='Enter'){ event.preventDefault(); enviarChatWatchTogether(); }">
        <button type="button" class="wt-send-btn" onclick="enviarChatWatchTogether()">Enviar</button>
      </div>
    `;
  }
  renderWatchTogetherMessagesAndMeta();
}

export function toggleWatchTogetherPanel(): void {
  watchTogetherOpen = !watchTogetherOpen;
  renderWatchTogetherPanel();
}

export async function togglePlayPauseWatchTogether(): Promise<void> {
  if (!activeRoomId || !activeRoomData) return;
  const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
  const nextState: 'playing' | 'paused' =
    activeRoomData.playbackState === 'playing' ? 'paused' : 'playing';
  const currentSec = getEffectiveRoomTimeSeconds();

  if (vidEl) {
    isApplyingRemoteSync = true;
    try {
      if (nextState === 'playing') {
        void vidEl.play().catch(() => {});
      } else {
        vidEl.pause();
      }
    } finally {
      setTimeout(() => {
        isApplyingRemoteSync = false;
      }, 350);
    }
  }
  await broadcastWatchTogetherState(nextState, currentSec);
}

export async function seekWatchTogether(deltaSeconds: number): Promise<void> {
  if (!activeRoomId || !activeRoomData) return;
  const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
  const baseSec = getEffectiveRoomTimeSeconds();
  const targetSec = computeSafeSeekTarget(baseSec, deltaSeconds, vidEl?.duration);

  if (vidEl) {
    isApplyingRemoteSync = true;
    vidEl.currentTime = targetSec;
    activeVideoLastTickPos = targetSec;
    setTimeout(() => {
      isApplyingRemoteSync = false;
    }, 350);
  }
  await broadcastWatchTogetherState(activeRoomData.playbackState, targetSec);
  showToast(`Sala sincronizada a ${formatPlaybackTime(targetSec)}`);
}

export async function aplicarTiempoManualWatchTogether(): Promise<void> {
  if (!activeRoomId || !activeRoomData) return;
  const input = document.getElementById('wt-manual-time-input') as HTMLInputElement | null;
  const parsed = parseTimecodeInput(input?.value || '');
  if (parsed === null) {
    showToast('Ingresa un tiempo válido (ej. 04:30 o 120).');
    return;
  }
  if (input) input.value = '';
  const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
  const targetSec = computeSafeSeekTarget(parsed, 0, vidEl?.duration);
  if (vidEl) {
    isApplyingRemoteSync = true;
    vidEl.currentTime = targetSec;
    activeVideoLastTickPos = targetSec;
    setTimeout(() => {
      isApplyingRemoteSync = false;
    }, 350);
  }
  await broadcastWatchTogetherState(activeRoomData.playbackState, targetSec);
  showToast(`Sala saltó a ${formatPlaybackTime(targetSec)}`);
}

export async function forzarSincronizacionWatchTogether(): Promise<void> {
  if (!activeRoomId || !activeRoomData) return;
  const targetSec = computeTargetSyncedTime(activeRoomData, Date.now());
  const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
  if (vidEl && applyRoomSyncToNativeVideo(activeRoomData, true)) {
    showToast(`Resincronizado con la sala (${formatPlaybackTime(targetSec)})`);
  } else {
    showToast(`Tiempo ancla de la sala: ${formatPlaybackTime(targetSec)} (usa un servidor directo para resincronización automática)`);
  }
}

function startWatchTogetherClockTicker(): void {
  if (_watchTogetherClockTimer) clearInterval(_watchTogetherClockTimer);
  _wtDriftCheckTick = 0;
  _watchTogetherClockTimer = setInterval(() => {
    if (!activeRoomId || !activeRoomData) return;
    const playing = isRoomPlaying(activeRoomData);
    const liveTimeSec = computeTargetSyncedTime(activeRoomData, Date.now());
    const syncMetaEl = document.getElementById('wt-sync-meta');
    if (syncMetaEl) {
      const actorSuffix = activeRoomData.updatedByName
        ? ` · por ${activeRoomData.updatedByName}`
        : '';
      syncMetaEl.textContent = `${playing ? 'En vivo' : 'En pausa'} · Ep ${activeRoomData.episodeNum} · ${formatPlaybackTime(liveTimeSec)}${actorSuffix}`;
    }
    // Client-side anchor drift check every 3s (ZERO Firestore writes) with 1.8s tolerance
    _wtDriftCheckTick = (_wtDriftCheckTick + 1) % 3;
    if (_wtDriftCheckTick === 0 && playing && !isApplyingRemoteSync && !isSwitchingLocalServer) {
      const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
      if (vidEl && vidEl.readyState >= 2 && !vidEl.seeking && !vidEl.paused) {
        const drift = computeRoomDriftSeconds(vidEl.currentTime || 0, activeRoomData, Date.now(), vidEl.duration);
        if (drift > 1.8) {
          applyRoomSyncToNativeVideo(activeRoomData, false);
        }
      }
    }
  }, 1000);
}

function stopWatchTogetherClockTicker(): void {
  if (_watchTogetherClockTimer) {
    clearInterval(_watchTogetherClockTimer);
    _watchTogetherClockTimer = null;
  }
  _wtDriftCheckTick = 0;
}

function attachWatchTogetherSubscription(roomId: string): void {
  if (roomUnsubscribe) {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }
  const bridge = getWatchTogetherBridge();
  if (!bridge?.subscribeRoom) return;

  activeRoomId = roomId;
  lastAppliedRoomUpdatedAtMs = 0;
  const panel = document.getElementById('watch-together-panel');
  if (panel) panel.dataset.roomId = '';
  renderWatchTogetherPanel();
  renderHomeWatchTogetherBanner();
  startWatchTogetherClockTicker();

  roomUnsubscribe = bridge.subscribeRoom(roomId, {
    onRoom: (room: WatchRoomState | null) => {
      if (!room || room.status === 'closed') {
        if (activeRoomId) {
          showToast('La sala Watch Together fue cerrada.');
          void detachWatchTogetherLocal();
        }
        return;
      }
      activeRoomData = room;
      renderWatchTogetherMessagesAndMeta();

      const myUid = getMyWatchUid();
      const currentSeason = state.seasons?.[state.temporadaActualIdx] || {
        id: state.anime?.id,
        seasonNumber: 1
      };
      const repScreen = document.getElementById('pantalla-reproductor');
      const isPlayerVisible = Boolean(repScreen && !repScreen.classList.contains('hide'));

      const animeMismatch =
        Number(room.animeId || room.seasonId || 0) > 0 &&
        String(state.anime?.id || '') !== String(room.animeId || '') &&
        String(currentSeason.id || '') !== String(room.seasonId || room.animeId || '');
      const seasonMismatch =
        Number(room.seasonNum || 0) > 0 &&
        Number(currentSeason.seasonNumber || 1) !== Number(room.seasonNum);
      const epMismatch =
        Number(room.episodeNum || 0) > 0 &&
        Number(state.epActual || 0) !== Number(room.episodeNum);

      if (!isPlayerVisible || animeMismatch || seasonMismatch || epMismatch) {
        lastAppliedRoomUpdatedAtMs = resolveRoomAnchorTimestampMs(room, Date.now());
        void sincronizarNavegacionConSala(room);
        return;
      }

      if (shouldApplyRemotePlaybackUpdate(room, myUid, lastAppliedRoomUpdatedAtMs)) {
        const applied = applyRoomSyncToNativeVideo(room, false);
        if (applied) {
          lastAppliedRoomUpdatedAtMs = resolveRoomAnchorTimestampMs(room, Date.now());
        }
      }
    },
    onParticipants: (participants: any[]) => {
      activeRoomParticipants = Array.isArray(participants) ? participants : [];
      renderWatchTogetherMessagesAndMeta();
    },
    onMessages: (messages: any[]) => {
      activeRoomMessages = Array.isArray(messages) ? messages : [];
      renderWatchTogetherMessagesAndMeta();
    },
    onError: () => {
      showToast('Error de conexión en la sala compartida.');
    }
  });
}

async function detachWatchTogetherLocal(): Promise<void> {
  stopWatchTogetherClockTicker();
  if (roomUnsubscribe) {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }
  activeRoomId = null;
  activeRoomData = null;
  activeRoomParticipants = [];
  activeRoomMessages = [];
  lastAppliedRoomUpdatedAtMs = 0;
  const panel = document.getElementById('watch-together-panel');
  if (panel) panel.dataset.roomId = '';
  renderWatchTogetherPanel();
  renderHomeWatchTogetherBanner();
}

export async function crearSalaWatchTogether(): Promise<void> {
  const bridge = getWatchTogetherBridge();
  if (!bridge?.createRoom) {
    showToast('Módulo de Watch Together aún inicializando.');
    return;
  }
  const passInput = document.getElementById('wt-create-pass-input') as HTMLInputElement | null;
  const customPasscode = normalizeRoomSecret(passInput?.value || '');
  isWatchTogetherBusy = true;
  renderWatchTogetherPanel();
  try {
    const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
    const currentSeason = state.seasons?.[state.temporadaActualIdx] || {
      id: state.anime?.id,
      seasonNumber: 1,
      title: state.anime?.title?.english || state.anime?.title?.romaji || 'Anime'
    };
    const created = await bridge.createRoom({
      animeId: Number(state.anime?.id || currentSeason.id || 0),
      seasonId: Number(currentSeason.id || state.anime?.id || 0),
      animeTitle: String(
        currentSeason.title || state.anime?.title?.english || state.anime?.title?.romaji || 'Anime'
      ),
      seasonNum: Number(currentSeason.seasonNumber || 1),
      episodeNum: Number(state.epActual || 1),
      playbackState: vidEl && vidEl.paused ? 'paused' : 'playing',
      playbackTime: vidEl ? Number(vidEl.currentTime || 0) : 0,
      passcode: customPasscode || undefined
    });
    const roomId = typeof created === 'string' ? created : String(created?.roomId || '');
    const passcode = typeof created === 'object' ? String(created?.passcode || customPasscode || '') : '';
    const inviteToken = typeof created === 'object' ? String(created?.inviteToken || '') : '';
    saveOwnedRoomCreds(roomId, {
      hostUid: getMyWatchUid(),
      passcode,
      inviteToken
    });
    watchTogetherOpen = true;
    attachWatchTogetherSubscription(roomId);
    renderProfileOwnedWatchRooms();
    showToast(
      passcode
        ? `Sala ${roomId} creada · Clave: ${passcode}`
        : `Sala ${roomId} creada ✓`
    );
  } catch (err: any) {
    showToast(err?.message || 'No se pudo crear la sala.');
  } finally {
    isWatchTogetherBusy = false;
    renderWatchTogetherPanel();
  }
}

function openWatchTogetherPasscodeModal(room: {
  roomId: string;
  animeTitle?: string;
  hostName?: string;
}): void {
  pendingProtectedRoomJoin = room;
  const modal = document.getElementById('modal-wt-join-pass');
  const subEl = document.getElementById('wt-join-modal-sub');
  const input = document.getElementById('wt-join-pass-input') as HTMLInputElement | null;
  const errEl = document.getElementById('wt-join-pass-error');

  if (subEl) {
    const label = room.animeTitle ? ` (${room.animeTitle})` : '';
    subEl.textContent = `La sala ${room.roomId}${label} es privada. Ingresa la contraseña del creador o pega el enlace completo de invitación.`;
  }
  if (input) input.value = '';
  if (errEl) {
    errEl.textContent = '';
    errEl.style.display = 'none';
  }
  modal?.classList.add('active');
  setTimeout(() => {
    input?.focus();
  }, 50);
}

export function cerrarModalPasscodeWatchTogether(): void {
  pendingProtectedRoomJoin = null;
  const errEl = document.getElementById('wt-join-pass-error');
  if (errEl) {
    errEl.textContent = '';
    errEl.style.display = 'none';
  }
  document.getElementById('modal-wt-join-pass')?.classList.remove('active');
}

async function completeProtectedRoomJoin(
  roomId: string,
  creds: { passcode?: string; inviteKey?: string }
): Promise<void> {
  const bridge = getWatchTogetherBridge();
  if (!bridge?.joinRoom) return;

  const owned = getOwnedRoomCreds(roomId);
  const room = await bridge.joinRoom(roomId, {
    passcode: creds.passcode,
    inviteKey: creds.inviteKey,
    rememberedPasscode: owned?.passcode || '',
    rememberedInviteToken: owned?.inviteToken || ''
  });

  if (creds.passcode || creds.inviteKey) {
    saveUnlockedRoomCreds(room.roomId, {
      ...(creds.passcode ? { passcode: creds.passcode } : {}),
      ...(creds.inviteKey ? { inviteToken: creds.inviteKey } : {})
    });
  }

  activeRoomData = room;
  watchTogetherOpen = true;
  await sincronizarNavegacionConSala(room);
  attachWatchTogetherSubscription(room.roomId);
  applyRoomSyncToNativeVideo(room, true);
  renderProfileOwnedWatchRooms();
  showToast(`Unido a sala ${room.roomId} · ${room.animeTitle} Ep ${room.episodeNum}`);
}

export async function confirmarPasscodeWatchTogether(): Promise<void> {
  if (!pendingProtectedRoomJoin) return;
  const roomId = pendingProtectedRoomJoin.roomId;
  const input = document.getElementById('wt-join-pass-input') as HTMLInputElement | null;
  const errEl = document.getElementById('wt-join-pass-error');
  const submitBtn = document.getElementById('wt-join-pass-submit') as HTMLButtonElement | null;
  const rawVal = String(input?.value || '').trim();

  if (!rawVal) {
    if (errEl) {
      errEl.textContent = 'Ingresa la contraseña del creador o pega el enlace de invitación.';
      errEl.style.display = 'block';
    }
    return;
  }

  const parsedInput = parseRoomJoinInput(rawVal);
  const extractedKey = parsedInput.inviteKey || extractInviteKeyFromSearch(rawVal);
  if (parsedInput.roomId && parsedInput.roomId !== roomId) {
    if (errEl) {
      errEl.textContent = `Ese enlace corresponde a otra sala (${parsedInput.roomId}).`;
      errEl.style.display = 'block';
    }
    return;
  }

  const creds = extractedKey
    ? { inviteKey: extractedKey }
    : { passcode: normalizeRoomSecret(rawVal) };

  if (errEl) errEl.style.display = 'none';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando...';
  }

  try {
    const bridge = getWatchTogetherBridge();
    if (bridge?.previewRoom) {
      const preview = await bridge.previewRoom(roomId);
      if (!preview || preview.status === 'closed') {
        if (errEl) {
          errEl.textContent = 'Esta sala ya no existe o fue cerrada.';
          errEl.style.display = 'block';
        }
        return;
      }
      const check = verifyRoomAccess({
        room: preview,
        currentUid: getMyWatchUid(),
        providedPasscode: creds.passcode,
        providedInviteKey: creds.inviteKey
      });
      if (!check.allowed) {
        if (errEl) {
          errEl.textContent = 'Contraseña o enlace de invitación incorrecto.';
          errEl.style.display = 'block';
        }
        return;
      }
    }

    await completeProtectedRoomJoin(roomId, creds);
    cerrarModalPasscodeWatchTogether();
  } catch (err: any) {
    if (errEl) {
      errEl.textContent = err?.message || 'Contraseña o enlace de invitación incorrecto.';
      errEl.style.display = 'block';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verificar y Entrar';
    }
  }
}

export async function unirseSalaWatchTogether(codeArg?: string, inviteKeyArg?: string): Promise<void> {
  const input = document.getElementById('wt-join-code-input') as HTMLInputElement | null;
  const parsed = parseRoomJoinInput(codeArg || input?.value || '');
  if (!parsed.roomId || parsed.roomId.length < 4) {
    showToast('Ingresa un código o enlace de sala válido (ej. NY-AB1234).');
    return;
  }
  await abrirSalaWatchTogetherDesdeCodigo(parsed.roomId, inviteKeyArg || parsed.inviteKey);
}

export async function abrirSalaWatchTogetherDesdeCodigo(codeArg: string, inviteKeyArg?: string): Promise<void> {
  const parsed = parseRoomJoinInput(codeArg);
  const code = parsed.roomId || normalizeRoomCode(codeArg);
  const inviteKey = normalizeRoomSecret(inviteKeyArg || parsed.inviteKey || '');
  if (!code) return;

  if (activeRoomId === code) {
    watchTogetherOpen = true;
    const repScreen = document.getElementById('pantalla-reproductor');
    if (repScreen && repScreen.classList.contains('hide') && activeRoomData) {
      await sincronizarNavegacionConSala(activeRoomData);
    }
    renderWatchTogetherPanel();
    return;
  }

  const waitForBridge = async (): Promise<any> => {
    for (let i = 0; i < 20; i++) {
      const b = getWatchTogetherBridge();
      if (b?.joinRoom) return b;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  };

  const bridge = await waitForBridge();
  if (!bridge?.joinRoom) {
    showToast('Servicio de Watch Together no disponible todavía.');
    return;
  }

  isWatchTogetherBusy = true;
  renderWatchTogetherPanel();
  try {
    const owned = getOwnedRoomCreds(code);
    const preview = bridge.previewRoom ? await bridge.previewRoom(code) : null;
    const isOwner = Boolean(owned || (preview && isWatchRoomOwner(code, preview.hostUid)));

    if (bridge.previewRoom) {
      if (!preview) {
        if (owned) {
          removeOwnedRoomCreds(code);
          renderProfileOwnedWatchRooms();
        }
        showToast('No se encontró esa sala o ya fue cerrada.');
        return;
      }
      if (preview.status === 'closed') {
        if (owned) {
          removeOwnedRoomCreds(code);
          renderProfileOwnedWatchRooms();
        }
        showToast('Esa sala ya fue cerrada por el propietario.');
        return;
      }

      // STRICT ACCESS GATE: Non-owners can ONLY enter if they provide a valid inviteKey (from invite link)
      // or type the room's password in the password modal.
      if (!isOwner && !inviteKey) {
        openWatchTogetherPasscodeModal({
          roomId: preview.roomId,
          animeTitle: preview.animeTitle,
          hostName: preview.hostName
        });
        return;
      }

      const access = verifyRoomAccess({
        room: preview,
        currentUid: getMyWatchUid(),
        providedInviteKey: inviteKey,
        rememberedPasscode: isOwner ? owned?.passcode || '' : '',
        rememberedInviteToken: isOwner ? owned?.inviteToken || '' : ''
      });

      if (!access.allowed) {
        openWatchTogetherPasscodeModal({
          roomId: preview.roomId,
          animeTitle: preview.animeTitle,
          hostName: preview.hostName
        });
        if (access.reason === 'wrong_credentials') {
          const errEl = document.getElementById('wt-join-pass-error');
          if (errEl) {
            errEl.textContent = 'El enlace de invitación no es válido. Ingresa la contraseña del propietario.';
            errEl.style.display = 'block';
          }
        }
        return;
      }
    } else if (!isOwner && !inviteKey) {
      openWatchTogetherPasscodeModal({ roomId: code });
      return;
    }

    showToast(`Conectando a sala ${code}...`);
    await completeProtectedRoomJoin(code, {
      passcode: isOwner ? owned?.passcode : undefined,
      inviteKey: inviteKey || (isOwner ? owned?.inviteToken : undefined)
    });
  } catch (err: any) {
    if (err?.code === 'AUTH_REQUIRED' || err?.code === 'WRONG_CREDENTIALS') {
      openWatchTogetherPasscodeModal({ roomId: code });
      return;
    }
    showToast(err?.message || 'No se pudo entrar a la sala compartida.');
  } finally {
    isWatchTogetherBusy = false;
    renderWatchTogetherPanel();
  }
}

export async function eliminarSalaWatchTogether(roomIdArg?: string): Promise<void> {
  const targetRoomId = normalizeRoomCode(roomIdArg || activeRoomId || '');
  if (!targetRoomId) return;
  const bridge = getWatchTogetherBridge();
  if (!bridge?.deleteRoom) {
    showToast('Servicio de salas no disponible.');
    return;
  }

  const matchedRoom =
    (activeRoomId === targetRoomId ? activeRoomData : null) ||
    homeActiveRooms.find((r) => r.roomId === targetRoomId) ||
    null;

  if (!isWatchRoomOwner(targetRoomId, matchedRoom?.hostUid)) {
    showToast('Solo el propietario que creó la sala puede cerrarla o eliminarla.');
    return;
  }

  isWatchTogetherBusy = true;
  renderWatchTogetherPanel();
  try {
    await bridge.deleteRoom(targetRoomId);
    removeOwnedRoomCreds(targetRoomId);
    homeActiveRooms = homeActiveRooms.filter((r) => r.roomId !== targetRoomId);
    if (activeRoomId === targetRoomId) {
      await detachWatchTogetherLocal();
    } else {
      renderHomeWatchTogetherBanner();
    }
    renderProfileOwnedWatchRooms();
    showToast(`Sala ${targetRoomId} cerrada y eliminada.`);
  } catch (err: any) {
    showToast(err?.message || 'No se pudo eliminar la sala.');
  } finally {
    isWatchTogetherBusy = false;
    renderWatchTogetherPanel();
  }
}

export async function salirSalaWatchTogether(): Promise<void> {
  const roomToLeave = activeRoomId;
  const bridge = getWatchTogetherBridge();
  const isHost = Boolean(roomToLeave && isWatchRoomOwner(roomToLeave, activeRoomData?.hostUid));
  await detachWatchTogetherLocal();
  if (roomToLeave && bridge?.leaveRoom) {
    await bridge.leaveRoom(roomToLeave, isHost).catch(() => {});
  }
  showToast('Has salido de la sala compartida');
}

export function copiarEnlaceSalaWatchTogether(): void {
  if (!activeRoomId) return;
  const owned = getOwnedRoomCreds(activeRoomId);
  const unlocked = getUnlockedRoomCreds(activeRoomId);
  const inviteToken = owned?.inviteToken || unlocked?.inviteToken || '';
  const url = buildWatchRoomInviteUrl(
    window.location.origin,
    window.location.pathname,
    activeRoomId,
    inviteToken
  );
  const passSuffix = owned?.passcode ? ` · Clave: ${owned.passcode}` : '';
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(url).then(() => {
      showToast(`Enlace de invitación copiado (${activeRoomId}${passSuffix}) ✓`);
    }).catch(() => {
      showToast(`Sala ${activeRoomId}${passSuffix}`);
    });
  } else {
    showToast(`Sala ${activeRoomId}${passSuffix}`);
  }
}

export async function enviarChatWatchTogether(): Promise<void> {
  if (!activeRoomId) return;
  const bridge = getWatchTogetherBridge();
  const input = document.getElementById('wt-chat-input') as HTMLInputElement | null;
  const text = input?.value.trim() || '';
  if (!text || !bridge?.sendChatMessage) return;
  if (input) input.value = '';
  try {
    await bridge.sendChatMessage(activeRoomId, text);
  } catch (err: any) {
    showToast(err?.message || 'No se pudo enviar el mensaje.');
  }
}

function resetWatchTimeTrackers(): void {
  activeVideoWatchBufferSec = 0;
  activeVideoLastTickPos = null;
  activeIframeLoadedAtMs = null;
  activeIframeLastFlushedAtMs = null;
}

function flushWatchTimeBuffers(forceSync = false): void {
  if (activeVideoWatchBufferSec >= 1) {
    const whole = Math.floor(activeVideoWatchBufferSec);
    activeVideoWatchBufferSec -= whole;
    UserManager.addRealWatchSeconds(whole, forceSync);
  }
  const rep = document.getElementById('pantalla-reproductor');
  const isPlayerOpen = Boolean(rep && !rep.classList.contains('hide'));
  if (activeIframeLoadedAtMs !== null && activeIframeLastFlushedAtMs !== null) {
    const now = Date.now();
    const delta = computeIframeActiveDeltaSeconds({
      elapsedMs: now - activeIframeLastFlushedAtMs,
      isVisible: document.visibilityState === 'visible',
      isPlayerOpen,
      isIframeLoaded: true,
      maxStepSeconds: 180
    });
    activeIframeLastFlushedAtMs = now;
    if (delta >= 1) {
      UserManager.addRealWatchSeconds(Math.floor(delta), forceSync);
    }
  }
}

export function cancelUpNextCountdown(): void {
  if (_upNextIntervalTimer) {
    clearInterval(_upNextIntervalTimer);
    _upNextIntervalTimer = null;
  }
  document.getElementById('player-up-next-overlay')?.remove();
}

export function flushPlayerProgress(): void {
  flushWatchTimeBuffers(true);
  const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
  if (!vidEl || !state.anime?.id) return;
  if (!Number.isFinite(vidEl.duration) || vidEl.duration <= 0) return;

  const currentSeason = state.seasons?.[state.temporadaActualIdx] || { id: state.anime.id, seasonNumber: 1 };
  HistoryManager.saveProgress(
    state.anime,
    currentSeason.seasonNumber || 1,
    state.epActual || 1,
    vidEl.currentTime || 0,
    vidEl.duration,
    { force: true, seasonId: currentSeason.id }
  );
}

function updatePipButtonUI(): void {
  const btn = document.getElementById('btn-pip-toggle');
  if (!btn) return;
  const active = Boolean(document.pictureInPictureElement);
  btn.classList.toggle('active', active);
  btn.textContent = active ? 'Salir PiP' : 'PiP';
}

export async function togglePictureInPicture(): Promise<void> {
  const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      updatePipButtonUI();
      return;
    }
    if (!vidEl) {
      showToast('Mini reproductor PiP disponible en servidores directos MP4/HLS (Sin Anuncios).');
      return;
    }
    if (!document.pictureInPictureEnabled || typeof vidEl.requestPictureInPicture !== 'function') {
      showToast('Tu navegador no permite Picture-in-Picture en este video.');
      return;
    }
    await vidEl.requestPictureInPicture();
    updatePipButtonUI();
  } catch {
    showToast('No se pudo activar el modo Picture-in-Picture.');
  }
}

function syncMediaSessionMetadata(ep: number): void {
  try {
    if (!('mediaSession' in navigator)) return;
    const currentSeason = state.seasons?.[state.temporadaActualIdx] || { title: state.anime?.title?.english || state.anime?.title?.romaji || 'NyAnime TV' };
    const epMetaTitle = state.episodeMetaMap?.[ep]?.title || '';
    const cover =
      currentSeason.coverImage ||
      state.anime?.coverImage?.extraLarge ||
      state.anime?.coverImage?.large ||
      '';
    const artwork = cover ? [{ src: cover, sizes: '512x512', type: 'image/jpeg' }] : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: epMetaTitle ? `Ep. ${ep} · ${epMetaTitle}` : `Episodio ${ep}`,
      artist: String(currentSeason.title || state.anime?.title?.english || state.anime?.title?.romaji || 'NyAnime TV'),
      album: 'NyAnime TV',
      artwork
    });

    const getVid = () => document.getElementById('video-player-native') as HTMLVideoElement | null;
    navigator.mediaSession.setActionHandler('play', () => { void getVid()?.play().catch(() => {}); });
    navigator.mediaSession.setActionHandler('pause', () => { getVid()?.pause(); });
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const v = getVid();
      if (v) v.currentTime = Math.max(0, v.currentTime - (details?.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const v = getVid();
      if (v && Number.isFinite(v.duration)) {
        v.currentTime = Math.min(v.duration, v.currentTime + (details?.seekOffset || 10));
      }
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => navegarEpisodioPlayer(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => navegarEpisodioPlayer(1));
  } catch {
    // Ignore unsupported MediaSession actions
  }
}

function showUpNextOverlay(nextEp: number): void {
  cancelUpNextCountdown();
  const container = document.getElementById('contenedor-video');
  if (!container) return;

  let secondsLeft = 5;
  const currentSeason = state.seasons?.[state.temporadaActualIdx] || {};
  const nextEpTitle = state.episodeMetaMap?.[nextEp]?.title || '';

  const overlay = document.createElement('div');
  overlay.id = 'player-up-next-overlay';
  overlay.className = 'player-up-next-overlay';
  overlay.innerHTML = `
    <div class="player-up-next-kicker">A continuación</div>
    <div class="player-up-next-title" id="player-up-next-countdown">${escHtml(buildUpNextCountdownText(nextEp, secondsLeft))}</div>
    <div class="player-up-next-sub">${escHtml(nextEpTitle || `${currentSeason.title || 'Temporada'} · Episodio ${nextEp}`)}</div>
    <div class="player-up-next-actions">
      <button type="button" class="player-up-next-play" id="btn-up-next-now">Reproducir ahora</button>
      <button type="button" class="player-up-next-cancel" id="btn-up-next-cancel">Cancelar</button>
    </div>
  `;
  container.appendChild(overlay);

  const playBtn = document.getElementById('btn-up-next-now');
  const cancelBtn = document.getElementById('btn-up-next-cancel');
  if (playBtn) {
    playBtn.onclick = () => {
      cancelUpNextCountdown();
      cambiarEpisodioRep(nextEp);
    };
  }
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      cancelUpNextCountdown();
    };
  }

  _upNextIntervalTimer = setInterval(() => {
    secondsLeft -= 1;
    const lbl = document.getElementById('player-up-next-countdown');
    if (lbl) lbl.textContent = buildUpNextCountdownText(nextEp, secondsLeft);
    if (secondsLeft <= 0) {
      cancelUpNextCountdown();
      cambiarEpisodioRep(nextEp);
    }
  }, 1000);
}

function attachNativeVideoLifecycle(vidEl: HTMLVideoElement, activeEp: number): void {
  const currentSeason = state.seasons?.[state.temporadaActualIdx] || { id: state.anime?.id, seasonNumber: 1, totalEpisodes: 1 };
  const seasonNum = currentSeason.seasonNumber || 1;
  const seasonId = currentSeason.id || state.anime?.id;
  let resumeApplied = false;
  let initialRoomSyncDone = !activeRoomId;
  resetWatchTimeTrackers();

  vidEl.addEventListener('loadedmetadata', () => {
    if (resumeApplied || !state.anime?.id) return;
    resumeApplied = true;
    if (activeRoomId && activeRoomData) {
      applyRoomSyncToNativeVideo(activeRoomData, true);
      setTimeout(() => {
        initialRoomSyncDone = true;
      }, 650);
      syncMediaSessionMetadata(activeEp);
      return;
    }
    initialRoomSyncDone = true;
    const saved = HistoryManager.getProgress(state.anime.id, seasonNum, activeEp);
    const totalDuration = Number.isFinite(vidEl.duration) && vidEl.duration > 0 ? vidEl.duration : (saved?.duration || 0);
    if (saved && shouldResumePlayback(saved.currentTime, totalDuration)) {
      const targetTime = Math.min(saved.currentTime, Math.max(0, totalDuration - 3));
      vidEl.currentTime = targetTime;
      showToast(`Reanudando desde ${formatPlaybackTime(targetTime)}`, {
        label: 'Reiniciar desde 00:00',
        onClick: () => {
          vidEl.currentTime = 0;
          activeVideoLastTickPos = 0;
          HistoryManager.saveProgress(state.anime, seasonNum, activeEp, 0, totalDuration, { force: true, seasonId });
          void vidEl.play().catch(() => {});
        }
      });
    }
    activeVideoLastTickPos = vidEl.currentTime || 0;
    syncMediaSessionMetadata(activeEp);
  });

  vidEl.addEventListener('play', () => {
    activeVideoLastTickPos = vidEl.currentTime || 0;
    if (activeRoomId && !initialRoomSyncDone) return;
    void broadcastWatchTogetherState('playing');
  });

  vidEl.addEventListener('seeked', () => {
    activeVideoLastTickPos = vidEl.currentTime || 0;
    if (activeRoomId && !initialRoomSyncDone) return;
    void broadcastWatchTogetherState();
  });

  vidEl.addEventListener('timeupdate', () => {
    if (!state.anime?.id) return;
    const curPos = Number(vidEl.currentTime || 0);
    if (activeVideoLastTickPos !== null) {
      const delta = computeRealWatchDeltaSeconds({
        prevTime: activeVideoLastTickPos,
        nextTime: curPos,
        isPaused: vidEl.paused,
        isSeeking: vidEl.seeking,
        maxTickSeconds: 5
      });
      if (delta > 0) {
        activeVideoWatchBufferSec += delta;
        if (activeVideoWatchBufferSec >= 5) {
          flushWatchTimeBuffers(false);
        }
      }
    }
    activeVideoLastTickPos = curPos;

    if (activeAniSkipIntervals.length > 0) {
      const activeSeg = findActiveAniSkipInterval(activeAniSkipIntervals, curPos);
      if (
        activeSeg &&
        AppPreferencesManager.get().autoSkipIntro &&
        isIntroSkipType(activeSeg.skipType) &&
        !aniSkipAutoSkippedIds.has(activeSeg.skipId)
      ) {
        aniSkipAutoSkippedIds.add(activeSeg.skipId);
        const jumpTo = computeSafeSeekTarget(activeSeg.endTime, 0, vidEl.duration);
        vidEl.currentTime = jumpTo;
        activeVideoLastTickPos = jumpTo;
        updateAniSkipOverlayUI(null);
        showToast(`${activeSeg.label} automático`);
        void broadcastWatchTogetherState();
        return;
      }
      updateAniSkipOverlayUI(activeSeg);
    }

    if (!Number.isFinite(vidEl.duration) || vidEl.duration <= 0) return;
    HistoryManager.saveProgress(
      state.anime,
      seasonNum,
      activeEp,
      curPos,
      vidEl.duration,
      { seasonId }
    );
  });

  vidEl.addEventListener('pause', () => {
    flushWatchTimeBuffers(true);
    activeVideoLastTickPos = vidEl.currentTime || 0;
    if (!activeRoomId || initialRoomSyncDone) {
      void broadcastWatchTogetherState('paused');
    }
    if (!state.anime?.id || !Number.isFinite(vidEl.duration) || vidEl.duration <= 0) return;
    HistoryManager.saveProgress(
      state.anime,
      seasonNum,
      activeEp,
      vidEl.currentTime,
      vidEl.duration,
      { force: true, seasonId }
    );
  });

  vidEl.addEventListener('ended', () => {
    flushWatchTimeBuffers(true);
    if (state.anime?.id && Number.isFinite(vidEl.duration) && vidEl.duration > 0) {
      HistoryManager.saveProgress(
        state.anime,
        seasonNum,
        activeEp,
        vidEl.duration,
        vidEl.duration,
        { force: true, seasonId }
      );
    }
    const total = Number(currentSeason.totalEpisodes || 1);
    if (activeEp < total) {
      showUpNextOverlay(activeEp + 1);
    }
  });

  vidEl.addEventListener('enterpictureinpicture', updatePipButtonUI);
  vidEl.addEventListener('leavepictureinpicture', updatePipButtonUI);
  syncMediaSessionMetadata(activeEp);
  updatePipButtonUI();
}

export function actualizarEstadoVistoPlayerUI(): void {
  const currentSeason = state.seasons?.[state.temporadaActualIdx] || state.anime;
  const sId = currentSeason?.id;
  const watchedBtn = document.getElementById('btn-mark-ep-watched');
  if (!watchedBtn || !sId) return;
  const isW = AnimeWatchedManager.isWatched(sId, state.epActual);
  watchedBtn.classList.toggle('is-watched', isW);
  watchedBtn.textContent = isW ? '✓ Visto' : '○ Marcar Visto';
}

export function toggleEpisodioVistoPlayer(): void {
  const currentSeason = state.seasons?.[state.temporadaActualIdx] || state.anime;
  const sId = currentSeason?.id;
  if (!sId) return;
  const nextState = !AnimeWatchedManager.isWatched(sId, state.epActual);
  AnimeWatchedManager.markWatched(sId, state.epActual, nextState, {
    totalEpisodes: Number(currentSeason.totalEpisodes || state.anime?.episodes || 0)
  });
  actualizarEstadoVistoPlayerUI();
  renderDetalleEpisodios();
  showToast(nextState ? `Episodio ${state.epActual} marcado como visto ✓` : `Episodio ${state.epActual} desmarcado`);
}

export function updatePlayerEpisodeTitlesUI(ep: number): void {
  const currentSeason = state.seasons?.[state.temporadaActualIdx] || {
    title: state.anime?.title?.romaji || 'Anime',
    seasonNumber: 1
  };
  const titleEl = document.getElementById('rep-titulo');
  if (titleEl) titleEl.innerText = `${currentSeason.title} · Ep ${ep}`;
  const indEl = document.getElementById('player-ep-indicator');
  if (indEl) indEl.innerText = `Episodio ${ep}`;
  const epMetaTitle = state.episodeMetaMap?.[ep]?.title || '';
  const subEl = document.getElementById('rep-ep-subtitle');
  if (subEl) {
    subEl.textContent = epMetaTitle
      ? epMetaTitle
      : (currentSeason.shortTag ? `${currentSeason.shortTag} · Episodio ${ep}` : '');
  }
}

export function abrirReproductor(ep: number): void {
  cancelUpNextCountdown();
  resetAniSkipState();
  syncAutoSkipButtonUI();
  renderWatchTogetherPanel();
  attachPlayerKeyboardShortcuts();
  state.epActual = ep;
  state.fuenteActualIdx = 0;

  const pantalla = document.getElementById('pantalla-reproductor');
  if (pantalla) {
    pantalla.classList.remove('hide');
    pantalla.scrollTo(0, 0);
  }

  const currentSeason = state.seasons?.[state.temporadaActualIdx] || {
    id: state.anime?.id,
    title: state.anime?.title?.romaji || 'Anime',
    seasonNumber: 1
  };
  nWin.Store?.setActiveEpisode?.(ep);
  updatePlayerEpisodeTitlesUI(ep);

  HistoryManager.save(state.anime, currentSeason.seasonNumber || 1, ep, currentSeason.id);

  updatePlayerNavButtons();
  actualizarEstadoVistoPlayerUI();
  updateAudioSelectorUI();
  renderReproductorEpisodes();
  renderDetalleEpisodios();
  void CommentsManager.render(state.anime.id, ep);
  void resolverYReproducirFuente();
}

export function updatePlayerNavButtons(): void {
  const currentSeason = state.seasons?.[state.temporadaActualIdx] || { totalEpisodes: 1 };
  const total = Number(currentSeason.totalEpisodes || 1);
  const prevBtn = document.getElementById('btn-player-prev') as HTMLButtonElement | null;
  const nextBtn = document.getElementById('btn-player-next') as HTMLButtonElement | null;
  if (prevBtn) prevBtn.disabled = state.epActual <= 1;
  if (nextBtn) nextBtn.disabled = state.epActual >= total;
}

export function navegarEpisodioPlayer(offset: number): void {
  const currentSeason = state.seasons?.[state.temporadaActualIdx] || { totalEpisodes: 1 };
  const total = Number(currentSeason.totalEpisodes || 1);
  const nuevoEp = state.epActual + offset;
  if (nuevoEp >= 1 && nuevoEp <= total) {
    cambiarEpisodioRep(nuevoEp);
  }
}

function teardownActiveMediaElement(container: HTMLElement | null): void {
  if (nWin._nyActiveHls) {
    try { nWin._nyActiveHls.destroy(); } catch { /* ignore */ }
    nWin._nyActiveHls = null;
  }
  const existingVid = (container?.querySelector('#video-player-native') || document.getElementById('video-player-native')) as HTMLVideoElement | null;
  if (existingVid) {
    try {
      existingVid.onerror = null;
      existingVid.pause();
      existingVid.removeAttribute('src');
      existingVid.load();
    } catch {
      // ignore
    }
  }
}

export function cerrarReproductor(): void {
  episodeResolveGuard.invalidate();
  sourceExecutionGuard.invalidate();
  detachPlayerKeyboardShortcuts();
  flushPlayerProgress();
  resetWatchTimeTrackers();
  resetAniSkipState();
  cancelUpNextCountdown();
  if (activeRoomId) {
    void salirSalaWatchTogether();
  }
  watchTogetherOpen = false;
  renderWatchTogetherPanel();
  if (_activeStartupWatchdog) {
    _activeStartupWatchdog.cancel();
    _activeStartupWatchdog = null;
  }
  _pendingFailoverStatusPrefix = '';
  if (_playerWatchdogTimer) {
    clearTimeout(_playerWatchdogTimer);
    _playerWatchdogTimer = null;
  }
  const vidCont = document.getElementById('contenedor-video');
  teardownActiveMediaElement(vidCont);
  document.getElementById('pantalla-reproductor')?.classList.add('hide');
  if (vidCont) vidCont.innerHTML = '';
  const detalle = document.getElementById('pantalla-detalle');
  if (detalle && state.anime) detalle.classList.remove('hide');
  nWin.NyAnimePWA?.flushDeferredUpdatePrompt?.();
}

function findFirstPlayableSourceIndex(list: NormalizedSource[], startAfterIdx = -1): number {
  if (!Array.isArray(list) || list.length === 0) return 0;
  const len = list.length;
  // Pass 1: available and embeddable/playable (never auto-select externalOnly hosts like TransferIt)
  for (let offset = 1; offset <= len; offset += 1) {
    const i = (startAfterIdx + offset + len) % len;
    const src = list[i];
    if (!src) continue;
    const isExt = Boolean(src.externalOnly) || isNonEmbeddableHost(src.url, src.serverName);
    const isFailed = videoSourceManager.failedSourcesInSession.has(src.url) || src.status === 'FAILED';
    if (!isExt && !isFailed) return i;
  }
  // Pass 2: any embeddable/playable source even if previously failed
  for (let offset = 1; offset <= len; offset += 1) {
    const i = (startAfterIdx + offset + len) % len;
    const src = list[i];
    if (!src) continue;
    const isExt = Boolean(src.externalOnly) || isNonEmbeddableHost(src.url, src.serverName);
    if (!isExt) return i;
  }
  return 0;
}

export function seleccionarAudio(modo: string): void {
  if (state.modoAudio === modo) return;
  if (activeRoomId) beginLocalServerSwitchGuard();
  flushPlayerProgress();
  state.modoAudio = modo;
  state.fuenteActualIdx = 0;
  updateAudioSelectorUI();

  if (Array.isArray(state.rawFuentesEpisodio) && state.rawFuentesEpisodio.length > 0) {
    state.fuentesRankeadas = videoSourceManager.rankRawSources(state.rawFuentesEpisodio, state.modoAudio);
    state.fuenteActualIdx = findFirstPlayableSourceIndex(state.fuentesRankeadas);
    renderPlayerServersBar();
    void ejecutarFuenteActiva();
  } else {
    void resolverYReproducirFuente();
  }
}

export function updateAudioSelectorUI(): void {
  document.getElementById('btn-audio-latino')?.classList.toggle('active', state.modoAudio === 'LATINO');
  document.getElementById('btn-audio-sub')?.classList.toggle('active', state.modoAudio === 'SUB');
  document.getElementById('btn-audio-best')?.classList.toggle('active', state.modoAudio === 'BEST');
}

export function updateAudioServerCountsUI(rawList: NormalizedSource[]): void {
  const list = Array.isArray(rawList) ? rawList : [];
  const subCount = list.filter((s) => s.language === 'SUB' || s.language === 'MULTI').length;
  const latCount = list.filter((s) => s.language === 'LATINO' || s.language === 'MULTI').length;
  const elSub = document.getElementById('count-audio-sub');
  const elLat = document.getElementById('count-audio-lat');
  if (elSub) elSub.textContent = String(subCount);
  if (elLat) elLat.textContent = String(latCount);
}

export function renderPlayerServersBar(): void {
  const wrap = document.getElementById('player-servers-wrap');
  const bar = document.getElementById('player-servers-list');
  const countLbl = document.getElementById('player-servers-count');
  if (!wrap || !bar) return;

  const list = state.fuentesRankeadas || [];
  if (list.length === 0) {
    wrap.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  wrap.style.display = 'block';
  if (countLbl) countLbl.textContent = `${list.length} ${list.length === 1 ? 'enlace' : 'enlaces'}`;
  const activeIdx = state.fuenteActualIdx % list.length;

  bar.innerHTML = list
    .map((src, i) => {
      const isActive = i === activeIdx;
      const isExternalOnly = Boolean(src.externalOnly) || isNonEmbeddableHost(src.url, src.serverName);
      const isFailed = videoSourceManager.failedSourcesInSession.has(src.url) || src.status === 'FAILED';
      const langClass = src.language === 'LATINO' ? 'lat' : (src.language === 'SUB' ? 'sub' : '');
      const langLabel = src.language === 'LATINO' ? 'LAT' : (src.language === 'MULTI' ? 'MULTI' : 'SUB');
      const badgeType = classifySourceBadgeType(src);
      let cleanBadge = '';
      if (badgeType === 'external') {
        cleanBadge =
          '<span style="font-size:9.5px; font-weight:700; color:#fbbf24; background:rgba(245,158,11,0.14); border:1px solid rgba(251,191,36,0.35); padding:1px 5px; border-radius:999px; margin-left:2px;">Externo</span>';
      } else if (!isFailed && badgeType === 'native-hls') {
        cleanBadge =
          '<span style="font-size:9.5px; font-weight:800; color:#34d399; background:rgba(16,185,129,0.14); border:1px solid rgba(52,211,153,0.35); padding:1px 5px; border-radius:999px; margin-left:2px;">HLS 1080p · Sin Anuncios</span>';
      } else if (!isFailed && badgeType === 'native-direct') {
        cleanBadge =
          '<span style="font-size:9.5px; font-weight:800; color:#34d399; background:rgba(16,185,129,0.14); border:1px solid rgba(52,211,153,0.35); padding:1px 5px; border-radius:999px; margin-left:2px;">Directo · Sin Anuncios</span>';
      } else if (!isFailed && badgeType === 'hls-cyberlocker' && (src.direct || src.type === 'hls')) {
        cleanBadge =
          '<span style="font-size:9.5px; font-weight:700; color:#38bdf8; background:rgba(56,189,248,0.14); border:1px solid rgba(56,189,248,0.35); padding:1px 5px; border-radius:999px; margin-left:2px;">HLS</span>';
      }
      const chipTitle = isExternalOnly
        ? `${src.providerName} (${langLabel}) · Abrir en ventana externa (no embebible)`
        : `${src.providerName} (${langLabel})${badgeType === 'native-hls' || badgeType === 'native-direct' ? ' · Reproductor nativo sin anuncios' : ''}`;
      return `
        <button type="button"
                class="server-chip ${isActive ? 'active' : ''} ${isFailed ? 'failed' : ''}"
                onclick="seleccionarServidorManual(${i})"
                title="${escHtml(chipTitle)}">
          <span class="server-lang-tag ${langClass}">${langLabel}</span>
          <span>${escHtml(src.providerName)}</span>
          ${cleanBadge}
          ${isFailed ? '<span>✕</span>' : ''}
        </button>
      `;
    })
    .join('');
}

export function seleccionarServidorManual(idx: number): void {
  if (!state.fuentesRankeadas || !state.fuentesRankeadas[idx]) return;
  if (activeRoomId) beginLocalServerSwitchGuard();
  flushPlayerProgress();
  state.fuenteActualIdx = idx;
  void ejecutarFuenteActiva();
}

export function renderReproductorEpisodes(): void {
  const container = document.getElementById('rep-lista-episodios');
  if (!container) return;
  container.innerHTML = '';
  const currentSeason = state.seasons?.[state.temporadaActualIdx] || {
    id: state.anime?.id,
    totalEpisodes: state.anime?.episodes || 1
  };
  const eps = Number(currentSeason.totalEpisodes || 1);
  const watchedSet = AnimeWatchedManager.getWatchedSet(currentSeason.id);

  for (let i = 1; i <= eps; i++) {
    const btn = document.createElement('button');
    const isCurrent = i === state.epActual;
    const isW = watchedSet.has(i);
    btn.className = `ep-btn ${isW && !isCurrent ? 'watched' : ''}`;
    if (isCurrent) {
      btn.style.background = 'var(--primary)';
      btn.style.borderColor = 'var(--primary)';
    }
    btn.textContent = String(i);
    btn.onclick = () => cambiarEpisodioRep(i);
    container.appendChild(btn);
  }
}

export function cambiarEpisodioRep(ep: number, skipRoomBroadcast = false): void {
  flushPlayerProgress();
  cancelUpNextCountdown();
  resetAniSkipState();
  state.epActual = ep;
  state.fuenteActualIdx = 0;
  const currentSeason = state.seasons?.[state.temporadaActualIdx] || {
    id: state.anime?.id,
    title: state.anime?.title?.romaji || 'Anime',
    seasonNumber: 1
  };
  nWin.Store?.setActiveEpisode?.(ep);
  updatePlayerEpisodeTitlesUI(ep);

  HistoryManager.save(state.anime, currentSeason.seasonNumber || 1, ep, currentSeason.id);
  updatePlayerNavButtons();
  actualizarEstadoVistoPlayerUI();
  renderReproductorEpisodes();
  renderDetalleEpisodios();
  void CommentsManager.render(state.anime.id, ep);
  if (!skipRoomBroadcast) {
    void broadcastWatchTogetherState();
  }
  void resolverYReproducirFuente();
}

export async function resolverContextoEpisodio(epNum: number): Promise<EpisodeResolveContext> {
  const currentSeason = state.seasons?.[state.temporadaActualIdx] || {
    id: state.anime?.id,
    seasonNumber: 1,
    format: state.anime?.format,
    title: state.anime?.title?.english || state.anime?.title?.romaji || '',
    romaji: state.anime?.title?.romaji || '',
    english: state.anime?.title?.english || ''
  };
  const animeId = currentSeason.id || state.anime?.id;
  const mapping = await cargarAniZipMappingAsync(animeId);
  const imdbId = mapping?.mappings?.imdb_id;
  const tmdbId = mapping?.mappings?.themoviedb_id || mapping?.mappings?.thetvdb_id;
  const malId = mapping?.mappings?.mal_id || state.anime?.idMal || undefined;
  const format = String(currentSeason.format || state.anime?.format || 'TV');
  const episodes = Number(currentSeason.totalEpisodes || state.anime?.episodes || 0) || null;
  const seasonYear = Number(currentSeason.year || currentSeason.seasonYear || state.anime?.seasonYear || 0) || null;
  const isMovie = currentSeason.totalEpisodes === 1 || format === 'MOVIE';
  const epInfo = mapping?.episodes?.[epNum] || {};
  const season = Number(currentSeason.seasonNumber || epInfo.seasonNumber || 1);
  const episode = Math.max(1, Number(epNum || 1));
  const romaji =
    currentSeason.romaji ||
    state.anime?.title?.romaji ||
    state.fullMedia?.title?.romaji ||
    currentSeason.title ||
    '';
  const english =
    currentSeason.english ||
    state.anime?.title?.english ||
    state.fullMedia?.title?.english ||
    currentSeason.title ||
    '';
  const seasonTitle = currentSeason.title || romaji || english;
  const rawSynonyms = [
    ...(Array.isArray(currentSeason.synonyms) ? currentSeason.synonyms : []),
    ...(Array.isArray(state.anime?.synonyms) ? state.anime.synonyms : []),
    ...(Array.isArray(state.fullMedia?.synonyms) ? state.fullMedia.synonyms : [])
  ];
  const synonymSeen = new Set<string>();
  const synonyms: string[] = [];
  for (const s of rawSynonyms) {
    if (typeof s !== 'string') continue;
    const trimmed = s.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!synonymSeen.has(key)) {
      synonymSeen.add(key);
      synonyms.push(trimmed);
    }
  }
  const isAdult = Boolean(
    state.anime?.isAdult ||
      (Array.isArray(state.anime?.genres) && state.anime.genres.some((g: string) => /hentai/i.test(g)))
  );
  const hentailaSlug = String(state.anime?.hentailaSlug || currentSeason.hentailaSlug || '').trim() || undefined;
  const slug = (romaji || english).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  return {
    imdbId,
    tmdbId,
    malId,
    slug,
    season,
    episode,
    episodes,
    seasonYear,
    seasonId: animeId,
    isMovie,
    format,
    isAdult,
    hentailaSlug,
    synonyms,
    romaji,
    english,
    seasonTitle
  };
}

export async function resolverYReproducirFuente(): Promise<void> {
  const container = document.getElementById('contenedor-video');
  const statusLabel = document.getElementById('source-info-label');
  const statusDot = document.getElementById('source-status-dot');
  const serversWrap = document.getElementById('player-servers-wrap');
  if (!container || !statusLabel || !statusDot) return;

  const { seq } = episodeResolveGuard.next();
  sourceExecutionGuard.invalidate();
  cancelUpNextCountdown();
  if (_activeStartupWatchdog) {
    _activeStartupWatchdog.cancel();
    _activeStartupWatchdog = null;
  }
  _pendingFailoverStatusPrefix = '';
  if (_playerWatchdogTimer) {
    clearTimeout(_playerWatchdogTimer);
    _playerWatchdogTimer = null;
  }

  statusDot.className = 'status-dot';
  statusLabel.textContent = 'Buscando servidores HD en JKAnime, AnimeAV1 y TVAnime...';
  if (serversWrap) serversWrap.style.display = 'none';
  container.innerHTML = '<div class="loader" style="height:100%"><div class="spinner"></div><span style="font-size:12px;margin-top:8px">Resolviendo múltiples servidores HD...</span></div>';

  const epActual = state.epActual;

  try {
    const context = await resolverContextoEpisodio(epActual);
    if (!episodeResolveGuard.isCurrent(seq) || state.epActual !== epActual) return;
    void fetchAniSkipForEpisode(context.malId, epActual);
    const rawSources = await videoSourceManager.fetchRawSources(context);
    if (!episodeResolveGuard.isCurrent(seq) || state.epActual !== epActual) return;

    statusLabel.textContent = 'Verificando salud de servidores y clasificando audio...';
    const verifiedSources = await videoSourceManager.probeAndVerifySources(context, rawSources, state.modoAudio);
    if (!episodeResolveGuard.isCurrent(seq) || state.epActual !== epActual) return;

    state.rawFuentesEpisodio = verifiedSources;
    updateAudioServerCountsUI(verifiedSources);

    const rankedSources = videoSourceManager.rankRawSources(verifiedSources, state.modoAudio);
    state.fuentesRankeadas = rankedSources;
    state.fuenteActualIdx = findFirstPlayableSourceIndex(rankedSources);
    renderPlayerServersBar();

    if (!rankedSources || rankedSources.length === 0) {
      throw new Error('No se encontraron servidores disponibles para este episodio.');
    }

    await ejecutarFuenteActiva();
    if (!episodeResolveGuard.isCurrent(seq)) return;

    const currentSeason = state.seasons?.[state.temporadaActualIdx] || { totalEpisodes: 1 };
    if (epActual < (currentSeason.totalEpisodes || 1)) {
      setTimeout(async () => {
        if (!episodeResolveGuard.isCurrent(seq)) return;
        try {
          const nextCtx = await resolverContextoEpisodio(epActual + 1);
          if (!episodeResolveGuard.isCurrent(seq)) return;
          void videoSourceManager.fetchRawSources(nextCtx);
        } catch {
          // ignore prefetch failure
        }
      }, 1200);
    }
  } catch (err) {
    if (!episodeResolveGuard.isCurrent(seq)) return;
    console.error('Error al resolver fuente:', err);
    statusDot.className = 'status-dot error';
    statusLabel.textContent = 'Sin servidores automáticos para este episodio.';
    container.innerHTML = `
      <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:16px; background:#090b10;">
        ${buildStateCardHtml({
          kind: 'error',
          compact: true,
          icon: '',
          title: 'Sin servidores activos',
          message: 'No encontramos fuentes reproducibles para este episodio en el idioma seleccionado.',
          retryLabel: 'Reintentar búsqueda',
          retryOnClick: 'resolverYReproducirFuente()',
          secondaryLabel: 'Probar otro idioma',
          secondaryOnClick: "seleccionarAudio(state.modoAudio === 'SUB' ? 'LATINO' : 'SUB')"
        })}
      </div>
    `;
  }
}

export function mostrarAvisoCambioServidorVideo(texto: string): void {
  const container = document.getElementById('contenedor-video');
  if (!container) return;
  document.getElementById('video-stall-banner')?.remove();
  if (!state.fuentesRankeadas || state.fuentesRankeadas.length <= 1) return;

  const banner = document.createElement('div');
  banner.id = 'video-stall-banner';
  banner.className = 'video-stall-banner';
  banner.innerHTML = `
    <span>${escHtml(texto)}</span>
    <button type="button" onclick="probarFuenteAlternativa()">Siguiente →</button>
  `;
  container.appendChild(banner);
}

export async function ejecutarFuenteActiva(): Promise<void> {
  const container = document.getElementById('contenedor-video');
  const statusLabel = document.getElementById('source-info-label');
  const statusDot = document.getElementById('source-status-dot');
  const extBtn = document.getElementById('btn-open-external-stream') as HTMLAnchorElement | null;
  if (!container || !statusLabel || !statusDot) return;

  const { seq: execSeq } = sourceExecutionGuard.next();
  cancelUpNextCountdown();
  if (_activeStartupWatchdog) {
    _activeStartupWatchdog.cancel();
    _activeStartupWatchdog = null;
  }
  if (_playerWatchdogTimer) {
    clearTimeout(_playerWatchdogTimer);
    _playerWatchdogTimer = null;
  }

  if (!state.fuentesRankeadas || state.fuentesRankeadas.length === 0) {
    statusDot.className = 'status-dot error';
    statusLabel.textContent = 'Sin fuentes.';
    if (extBtn) extBtn.style.display = 'none';
    return;
  }

  const idx = state.fuenteActualIdx % state.fuentesRankeadas.length;
  const fuente = state.fuentesRankeadas[idx];
  const isAlternative = idx > 0;
  const langBadge = fuente.language === 'LATINO' ? 'Latino' : (fuente.language === 'MULTI' ? 'Multi' : 'Sub ES');
  const failoverPrefix = _pendingFailoverStatusPrefix;
  _pendingFailoverStatusPrefix = '';

  renderPlayerServersBar();
  statusDot.className = isAlternative || failoverPrefix ? 'status-dot warning' : 'status-dot';
  statusLabel.textContent = failoverPrefix
    ? `${failoverPrefix} · ${langBadge} · ${fuente.providerName} (${idx + 1}/${state.fuentesRankeadas.length})`
    : `${langBadge} · ${fuente.providerName} (${idx + 1}/${state.fuentesRankeadas.length})`;

  const safeUrl = nWin.safeExternalUrl ? nWin.safeExternalUrl(fuente.url) : fuente.url;
  if (extBtn) {
    if (safeUrl && safeUrl !== '#') {
      extBtn.href = safeUrl;
      extBtn.style.display = 'inline-flex';
    } else {
      extBtn.style.display = 'none';
    }
  }

  teardownActiveMediaElement(container);

  if (fuente.externalOnly || isNonEmbeddableHost(fuente.url, fuente.serverName)) {
    statusDot.className = 'status-dot warning';
    statusLabel.textContent = `${langBadge} · ${fuente.providerName} · Enlace Externo (${idx + 1}/${state.fuentesRankeadas.length})`;
    const hasPlayableAlternative = state.fuentesRankeadas.some(
      (f, i) => i !== idx && !f.externalOnly && !isNonEmbeddableHost(f.url, f.serverName)
    );
    container.innerHTML = `
      <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:24px; text-align:center; background:#0b0d14; color:#e2e8f0;">
        <div style="font-size:15px; font-weight:700; color:#f8fafc;">${escHtml(fuente.providerName)} bloquea reproducción embebida</div>
        <div style="font-size:12.5px; color:#94a3b8; max-width:420px;">Este servidor solo permite abrirse directamente en una pestaña externa. Usa el botón de abajo o cambia a un servidor embebido/directo.</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
          ${safeUrl && safeUrl !== '#' ? `<a href="${escHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="chip active" style="background:var(--primary); color:#fff; text-decoration:none;">Abrir en nueva pestaña</a>` : ''}
          ${hasPlayableAlternative ? `<button type="button" class="chip" onclick="probarFuenteAlternativa()">Usar servidor directo</button>` : ''}
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#0b0d14; color:#fff;">
      <div class="spinner-border" style="width:36px; height:36px; border:3px solid rgba(255,255,255,0.1); border-top-color:#e11d48; border-radius:50%; animation:spin 0.8s linear infinite; margin-bottom:12px;"></div>
      <span style="font-size:13px; font-weight:600; color:#a0aec0;">Conectando con ${escHtml(fuente.providerName)}...</span>
    </div>
  `;

  const activeEpSnapshot = state.epActual;
  const activeIdxSnapshot = idx;
  const isDirectMp4Host =
    fuente.direct ||
    /\.(mp4|webm|m3u8)(\?|$)/i.test(fuente.url) ||
    fuente.url.includes('mp4upload.com') ||
    fuente.url.includes('yourupload.com');
  const canTryNativeExtract =
    isDirectMp4Host ||
    fuente.url.includes('dotanborito.net') ||
    fuente.url.includes('/jkplayer/um') ||
    fuente.url.includes('/jkplayer/c') ||
    fuente.url.includes('flaswish.com') ||
    fuente.url.includes('streamwish.') ||
    fuente.url.includes('sfastwish.com') ||
    fuente.url.includes('dhcplay.com') ||
    fuente.url.includes('ghbrisk.com') ||
    fuente.url.includes('ryderjet.com') ||
    fuente.url.includes('streamhgapi.com') ||
    fuente.url.includes('vidhide') ||
    fuente.url.includes('filelions') ||
    fuente.url.includes('movearnpre.com');

  const countRemainingPlayable = (excludeUrl?: string) =>
    state.fuentesRankeadas.filter(
      (f) =>
        f.url !== excludeUrl &&
        !f.externalOnly &&
        !isNonEmbeddableHost(f.url, f.serverName) &&
        !videoSourceManager.failedSourcesInSession.has(f.url)
    ).length;

  const isCurrentExecutionStillActive = () =>
    sourceExecutionGuard.isCurrent(execSeq) &&
    state.epActual === activeEpSnapshot &&
    (state.fuenteActualIdx % state.fuentesRankeadas.length) === activeIdxSnapshot;

  const hasOtherPlayableServers = () =>
    countRemainingPlayable(fuente.url) > 0 && state.fuentesRankeadas.length > 1;
  const startupSecsLabel = Math.max(1, Math.round(NATIVE_STARTUP_FAILOVER_MS / 1000));

  if (canTryNativeExtract) {
    try {
      const directStream = await StreamExtractor.extract(fuente.url, {
        timeoutMs: hasOtherPlayableServers() ? NATIVE_STARTUP_FAILOVER_MS : 12000
      });
      if (!isCurrentExecutionStillActive()) {
        return;
      }
      if (directStream && directStream.type === 'mp4' && directStream.streamUrl) {
        statusLabel.textContent = failoverPrefix
          ? `${failoverPrefix} · ${langBadge} · ${fuente.providerName} · Sin Anuncios (${idx + 1}/${state.fuentesRankeadas.length})`
          : `${langBadge} · ${fuente.providerName} · Sin Anuncios (${idx + 1}/${state.fuentesRankeadas.length})`;
        container.innerHTML = `
          <video 
            id="video-player-native" 
            src="${escHtml(directStream.streamUrl)}" 
            controls 
            autoplay 
            playsinline 
            preload="metadata"
            style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:contain; background:#000;">
          </video>
        `;
        const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
        if (vidEl) {
          attachNativeVideoLifecycle(vidEl, activeEpSnapshot);
          const watchdog = attachNativeStartupFailoverWatchdog({
            video: vidEl,
            startupTimeoutMs: NATIVE_STARTUP_FAILOVER_MS,
            fullTimeoutMs: NATIVE_BUFFER_TIMEOUT_MS,
            isStillActive: isCurrentExecutionStillActive,
            hasAlternativeServers: hasOtherPlayableServers,
            onAbortAttempt: () => {
              teardownActiveMediaElement(container);
            },
            onFastFailover: () => {
              statusDot.className = 'status-dot warning';
              statusLabel.textContent = `${fuente.providerName} sin respuesta (${startupSecsLabel}s) · saltando al siguiente servidor...`;
              videoSourceManager.markSourceFailed(fuente.url);
              probarFuenteAlternativa(`Failover desde ${fuente.providerName}`);
            },
            onFinalTimeout: (reason) => {
              videoSourceManager.markSourceFailed(fuente.url);
              mostrarAvisoCambioServidorVideo(reason);
            }
          });
          _activeStartupWatchdog = watchdog;

          let retriedFreshToken = false;
          vidEl.onerror = () => {
            if (
              !retriedFreshToken &&
              (fuente.url.includes('mp4upload.com') || fuente.url.includes('yourupload.com'))
            ) {
              retriedFreshToken = true;
              void StreamExtractor.extract(fuente.url, {
                forceRefresh: true,
                timeoutMs: hasOtherPlayableServers() ? 4000 : 10000
              }).then((fresh) => {
                if (fresh?.type === 'mp4' && fresh.streamUrl && isCurrentExecutionStillActive()) {
                  vidEl.src = fresh.streamUrl;
                  vidEl.load();
                  void vidEl.play().catch(() => {});
                  return;
                }
                watchdog.markReady();
                videoSourceManager.markSourceFailed(fuente.url);
                if (countRemainingPlayable(fuente.url) > 0 && state.fuentesRankeadas.length > 1) {
                  probarFuenteAlternativa(`Error en ${fuente.providerName}`);
                } else {
                  mostrarAvisoCambioServidorVideo('El video directo falló en origen.');
                }
              });
              return;
            }
            watchdog.markReady();
            videoSourceManager.markSourceFailed(fuente.url);
            if (countRemainingPlayable(fuente.url) > 0 && state.fuentesRankeadas.length > 1) {
              probarFuenteAlternativa(`Error en ${fuente.providerName}`);
            } else {
              mostrarAvisoCambioServidorVideo('El video directo falló en origen.');
            }
          };
        }
        return;
      }
      if (directStream && directStream.type === 'hls' && directStream.streamUrl) {
        statusLabel.textContent = failoverPrefix
          ? `${failoverPrefix} · ${langBadge} · ${fuente.providerName} · HLS Sin Anuncios (${idx + 1}/${state.fuentesRankeadas.length})`
          : `${langBadge} · ${fuente.providerName} · HLS Sin Anuncios (${idx + 1}/${state.fuentesRankeadas.length})`;
        container.innerHTML = `
          <video 
            id="video-player-native" 
            controls 
            autoplay 
            playsinline 
            preload="metadata"
            style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:contain; background:#000;">
          </video>
        `;
        const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
        if (vidEl) {
          attachNativeVideoLifecycle(vidEl, activeEpSnapshot);
          const watchdog = attachNativeStartupFailoverWatchdog({
            video: vidEl,
            startupTimeoutMs: NATIVE_STARTUP_FAILOVER_MS,
            fullTimeoutMs: NATIVE_BUFFER_TIMEOUT_MS,
            isStillActive: isCurrentExecutionStillActive,
            hasAlternativeServers: hasOtherPlayableServers,
            onAbortAttempt: () => {
              teardownActiveMediaElement(container);
            },
            onFastFailover: () => {
              statusDot.className = 'status-dot warning';
              statusLabel.textContent = `${fuente.providerName} sin respuesta (${startupSecsLabel}s) · saltando al siguiente servidor...`;
              videoSourceManager.markSourceFailed(fuente.url);
              probarFuenteAlternativa(`Failover desde ${fuente.providerName}`);
            },
            onFinalTimeout: () => {
              videoSourceManager.markSourceFailed(fuente.url);
              mostrarAvisoCambioServidorVideo('El flujo HLS no respondió a tiempo.');
            }
          });
          _activeStartupWatchdog = watchdog;

          if (nWin.Hls?.isSupported?.()) {
            const hls = new nWin.Hls({
              enableWorker: true,
              xhrSetup: (xhr: XMLHttpRequest, url: string) => {
                if (url.startsWith('/') || url.startsWith(window.location.origin)) {
                  xhr.withCredentials = true;
                }
              }
            });
            nWin._nyActiveHls = hls;
            hls.loadSource(directStream.streamUrl);
            hls.attachMedia(vidEl);
            hls.on(nWin.Hls.Events.ERROR, (_ev: any, data: any) => {
              if (data?.fatal) {
                watchdog.markReady();
                try { hls.destroy(); } catch { /* ignore */ }
                nWin._nyActiveHls = null;
                videoSourceManager.markSourceFailed(fuente.url);
                if (countRemainingPlayable(fuente.url) > 0 && state.fuentesRankeadas.length > 1) {
                  probarFuenteAlternativa(`Failover desde ${fuente.providerName}`);
                }
              }
            });
          } else if (vidEl.canPlayType('application/vnd.apple.mpegurl')) {
            vidEl.src = directStream.streamUrl;
          }
        }
        return;
      }
    } catch {
      // ignore extraction fallback
    }

    if (fuente.url.includes('mp4upload.com') || fuente.url.includes('yourupload.com')) {
      videoSourceManager.markSourceFailed(fuente.url);
      const nextAvailableIdx = state.fuentesRankeadas.findIndex(
        (f, i) =>
          i !== idx &&
          !f.externalOnly &&
          !isNonEmbeddableHost(f.url, f.serverName) &&
          !videoSourceManager.failedSourcesInSession.has(f.url)
      );
      if (nextAvailableIdx >= 0) {
        state.fuenteActualIdx = nextAvailableIdx;
        void ejecutarFuenteActiva();
        return;
      }
    }
  }

  if (state.epActual !== activeEpSnapshot || (state.fuenteActualIdx % state.fuentesRankeadas.length) !== activeIdxSnapshot) {
    return;
  }

  let embedUrl = normalizeKnownEmbedUrl(fuente.url);
  if (embedUrl.includes('sfastwish.com')) {
    embedUrl = embedUrl.replace('sfastwish.com', 'flaswish.com');
  }
  const finalEmbedSafe = nWin.safeExternalUrl ? nWin.safeExternalUrl(embedUrl) : embedUrl;
  const isMegaEmbed =
    /mega(?:\.co)?\.nz/i.test(finalEmbedSafe) || /mega/i.test(String(fuente.serverName || ''));
  const isFilemoonEmbed =
    /filemoon\./i.test(finalEmbedSafe) || /^filemoon$/i.test(String(fuente.serverName || ''));
  const isZillaEmbed = /zilla-networks\.com/i.test(finalEmbedSafe);
  // Strictly sandbox Mega and Filemoon embeds WITHOUT allow-popups or allow-top-navigation so popups/external redirects are blocked
  const iframeSandboxAttr =
    isMegaEmbed || isFilemoonEmbed
      ? 'sandbox="allow-scripts allow-same-origin allow-forms"'
      : '';
  const iframeReferrerPolicy = isZillaEmbed ? 'no-referrer' : 'strict-origin-when-cross-origin';
  const megaSwitchBanner =
    isMegaEmbed && state.fuentesRankeadas.length > 1
      ? `<div class="video-stall-banner" style="top:10px; bottom:auto;">
           <span>Mega en modo embebido (descargas externas bloqueadas)</span>
           <button type="button" onclick="probarFuenteAlternativa()">Cambiar Servidor HD →</button>
         </div>`
      : '';

  container.innerHTML = `
    <iframe 
      id="video-player-iframe"
      src="${escHtml(finalEmbedSafe)}" 
      ${iframeSandboxAttr}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture" 
      allowfullscreen 
      referrerpolicy="${iframeReferrerPolicy}"
      frameborder="0"
      style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;">
    </iframe>
    ${megaSwitchBanner}
  `;

  syncMediaSessionMetadata(activeEpSnapshot);
  updatePipButtonUI();

  resetWatchTimeTrackers();
  const iframeEl = document.getElementById('video-player-iframe') as HTMLIFrameElement | null;
  if (iframeEl) {
    let settled = false;
    iframeEl.onload = () => {
      settled = true;
      const now = Date.now();
      activeIframeLoadedAtMs = now;
      activeIframeLastFlushedAtMs = document.visibilityState === 'visible' ? now : null;
      if (_playerWatchdogTimer) {
        clearTimeout(_playerWatchdogTimer);
        _playerWatchdogTimer = null;
      }
    };
    _playerWatchdogTimer = setTimeout(() => {
      if (!settled) {
        mostrarAvisoCambioServidorVideo('Este servidor tarda en responder.');
      }
    }, 12000);
  }
  if (!_playerVisibilityBound) {
    _playerVisibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushPlayerProgress();
      } else if (activeIframeLoadedAtMs !== null) {
        activeIframeLastFlushedAtMs = Date.now();
      }
    });
  }
}

export function probarFuenteAlternativa(statusReason?: string): void {
  if (!state.fuentesRankeadas || state.fuentesRankeadas.length <= 1) {
    showToast('No hay más servidores alternativos en esta lista.');
    return;
  }

  if (activeRoomId) beginLocalServerSwitchGuard();
  flushPlayerProgress();
  const currentIdx = state.fuenteActualIdx % state.fuentesRankeadas.length;
  const fuenteActual = state.fuentesRankeadas[currentIdx];
  if (fuenteActual && !fuenteActual.externalOnly) {
    videoSourceManager.markSourceFailed(fuenteActual.url);
  }

  const nextPlayableIdx = findFirstPlayableSourceIndex(state.fuentesRankeadas, currentIdx);
  state.fuenteActualIdx =
    nextPlayableIdx !== currentIdx
      ? nextPlayableIdx
      : (currentIdx + 1) % state.fuentesRankeadas.length;
  const nextProviderName = state.fuentesRankeadas[state.fuenteActualIdx].providerName;
  _pendingFailoverStatusPrefix = typeof statusReason === 'string' ? statusReason.trim() : '';
  showToast(
    _pendingFailoverStatusPrefix
      ? `${_pendingFailoverStatusPrefix} · cambiando a ${nextProviderName}...`
      : `Cambiando a ${nextProviderName}...`
  );
  void ejecutarFuenteActiva();
}

export function detachPlayerKeyboardShortcuts(): void {
  if (playerKeydownListener) {
    document.removeEventListener('keydown', playerKeydownListener);
    playerKeydownListener = null;
  }
  nWin._nyPlayerKeyboardBound = false;
}

export function attachPlayerKeyboardShortcuts(): void {
  if (playerKeydownListener) return;
  nWin._nyPlayerKeyboardBound = true;

  playerKeydownListener = (e: KeyboardEvent) => {
    const rep = document.getElementById('pantalla-reproductor');
    const playerActive = Boolean(rep && !rep.classList.contains('hide'));
    if (!playerActive) return;

    const hasActiveAniSkip = Boolean(
      activeAniSkipSegment && !aniSkipDismissedIds.has(activeAniSkipSegment.skipId)
    );
    const action = resolvePlayerShortcutAction(
      {
        key: e.key,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        target: e.target || document.activeElement
      },
      {
        playerActive,
        hasOpenModal: hasActiveModal(),
        hasActiveAniSkip
      }
    );
    if (!action) return;

    const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;

    if (action === 'toggle-play') {
      if (!vidEl) return;
      e.preventDefault();
      if (vidEl.paused) void vidEl.play().catch(() => {});
      else vidEl.pause();
      return;
    }

    if (action === 'toggle-mute') {
      if (!vidEl) return;
      e.preventDefault();
      vidEl.muted = !vidEl.muted;
      showToast(vidEl.muted ? 'Silenciado' : 'Sonido activado');
      return;
    }

    if (action === 'toggle-fullscreen') {
      e.preventDefault();
      togglePantallaCompleta();
      return;
    }

    if (action === 'skip-intro') {
      if (!vidEl || !hasActiveAniSkip) return;
      e.preventDefault();
      saltarSegmentoAniSkipActiva();
      return;
    }

    if (action === 'seek-forward-10') {
      if (vidEl && Number.isFinite(vidEl.duration)) {
        e.preventDefault();
        vidEl.currentTime = Math.min(vidEl.duration, vidEl.currentTime + 10);
      } else if (e.key === 'ArrowRight') {
        navegarEpisodioPlayer(1);
      }
      return;
    }

    if (action === 'seek-back-10') {
      if (vidEl) {
        e.preventDefault();
        vidEl.currentTime = Math.max(0, vidEl.currentTime - 10);
      } else if (e.key === 'ArrowLeft') {
        navegarEpisodioPlayer(-1);
      }
      return;
    }

    if (action === 'next-ep') {
      e.preventDefault();
      navegarEpisodioPlayer(1);
      return;
    }

    if (action === 'prev-ep') {
      e.preventDefault();
      navegarEpisodioPlayer(-1);
    }
  };

  document.addEventListener('keydown', playerKeydownListener);
}

export function bindPlayerKeyboardShortcuts(): void {
  attachPlayerKeyboardShortcuts();
}

export function copiarEnlaceStreaming(): void {
  if (!state.fuentesRankeadas || state.fuentesRankeadas.length === 0) {
    showToast('No hay enlace activo disponible.');
    return;
  }
  const fuenteActual = state.fuentesRankeadas[state.fuenteActualIdx % state.fuentesRankeadas.length];
  if (fuenteActual && fuenteActual.url) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(fuenteActual.url).then(() => {
        showToast('Enlace de streaming copiado al portapapeles');
      }).catch(() => {
        showToast('Enlace listo: ' + fuenteActual.url);
      });
    } else {
      showToast('Enlace activo: ' + fuenteActual.url);
    }
  }
}

export function togglePantallaCompleta(): void {
  const el: any = document.getElementById('pantalla-reproductor') || document.documentElement;
  const doc: any = document;
  if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
    try {
      const orient: any = screen.orientation;
      if (orient && orient.lock) {
        orient.lock('landscape').catch(() => {});
      }
    } catch {
      // ignore
    }
    showToast('Modo Cine / Pantalla Completa');
  } else {
    if (doc.exitFullscreen) {
      doc.exitFullscreen().catch(() => {});
    } else if (doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen();
    }
    try {
      const orient: any = screen.orientation;
      if (orient && orient.unlock) {
        orient.unlock();
      }
    } catch {
      // ignore
    }
  }
}

export function insertarReaccion(emoji: string): void {
  const input = document.getElementById('comment-text-input') as HTMLTextAreaElement | null;
  if (input) {
    input.value += ` ${emoji} `;
    CommentsManager.updateCharCounter(input.value);
  }
}

export async function publicarComentario(): Promise<void> {
  const input = document.getElementById('comment-text-input') as HTMLTextAreaElement | null;
  const spoilerCb = document.getElementById('comment-spoiler-checkbox') as HTMLInputElement | null;
  const text = input ? input.value.trim() : '';
  const isSpoiler = Boolean(spoilerCb?.checked);

  if (!text) {
    showToast('Escribe algo para publicar tu comentario.');
    return;
  }
  try {
    await CommentsManager.addComment(state.anime.id, state.epActual, text, isSpoiler);
    if (input) input.value = '';
    if (spoilerCb) spoilerCb.checked = false;
    CommentsManager.updateCharCounter('');
    showToast('¡Comentario publicado en la comunidad!');
  } catch (err: any) {
    showToast(err?.message || 'Inicia sesión para publicar comentarios.');
  }
}

export async function descargarEpisodioActual(): Promise<void> {
  const currentSeason = state.seasons?.[state.temporadaActualIdx] || {
    id: state.anime?.id || 0,
    title: state.anime?.title?.english || state.anime?.title?.romaji || 'Anime',
    romaji: state.anime?.title?.romaji,
    english: state.anime?.title?.english,
    seasonNumber: 1
  };
  const seasonNum = currentSeason.seasonNumber || 1;
  const seasonId = currentSeason.id || state.anime?.id || 0;
  const animeTitle =
    currentSeason.english ||
    currentSeason.romaji ||
    currentSeason.title ||
    state.anime?.title?.english ||
    state.anime?.title?.romaji ||
    'Anime';
  const cleanSeriesTitle =
    animeTitle
      .replace(/\s*(?:Season\s*\d+|2nd\s*Season|3rd\s*Season|\d+th\s*Season|Part\s*\d+|Cour\s*\d+)\s*$/i, '')
      .trim() || animeTitle;

  let fuentes = state.fuentesRankeadas || [];
  if (fuentes.length === 0 && state.anime) {
    try {
      const ctx = await resolverContextoEpisodio(state.epActual);
      const raw = await videoSourceManager.fetchRawSources(ctx);
      fuentes = videoSourceManager.rankRawSources(raw, state.modoAudio);
    } catch {
      // ignore
    }
  }

  const fuenteActiva = fuentes[state.fuenteActualIdx % (fuentes.length || 1)];
  const fallbackUrl =
    fuenteActiva?.url ||
    `https://tioanime.com/ver/${cleanSeriesTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${state.epActual}`;

  const preferredAudio: 'SUB' | 'DUB' = state.modoAudio === 'DUB' ? 'DUB' : 'SUB';
  const mp4Candidates = [
    fuenteActiva,
    ...fuentes.filter((f) => f && f !== fuenteActiva)
  ].filter(
    (f) =>
      f &&
      f.url &&
      !videoSourceManager.failedSourcesInSession.has(f.url) &&
      !f.url.toLowerCase().includes('.m3u8') &&
      (f.url.includes('mp4upload.com') ||
        f.url.includes('yourupload.com') ||
        (f.url.includes('archive.org/download/') && /\.(mp4|webm|mkv)(\?|$)/i.test(f.url)) ||
        /\.(mp4|webm)(\?|$)/i.test(f.url))
  );

  const cleanSlugTitle = cleanSeriesTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 64) || 'Anime';
  const epPad = String(Math.max(1, Number(state.epActual || 1))).padStart(2, '0');
  const rawFilename = `${cleanSlugTitle}_T${seasonNum}_Ep${epPad}_${preferredAudio === 'DUB' ? 'LAT' : 'SUB'}.mp4`;

  if (nWin.NyAnimeOffline?.downloadAnimeEpisodeOrQueue) {
    let lastErrorMessage = '';
    for (const cand of mp4Candidates) {
      try {
        const extracted = await StreamExtractor.extract(cand.url, { forceRefresh: true });
        if (!extracted || extracted.type !== 'mp4' || !extracted.streamUrl) continue;
        if (extracted.detectedLanguage && extracted.detectedLanguage !== preferredAudio) {
          continue;
        }

        showToast(`Descargando T${seasonNum} · Ep ${state.epActual} (.MP4 por bloques)...`);
        const res = await nWin.NyAnimeOffline.downloadAnimeEpisodeOrQueue({
          animeId: seasonId,
          animeTitle: `${cleanSeriesTitle} (T${seasonNum})`,
          cover: state.anime?.coverImage?.large || state.anime?.coverImage?.extraLarge || '',
          season: seasonNum,
          episode: state.epActual,
          quality: 'auto',
          audio: preferredAudio,
          destination: 'both',
          directStreamUrl: extracted.streamUrl,
          fallbackWebUrl: cand.url || fallbackUrl,
          saveToDeviceFilename: rawFilename,
          allowWatchLaterFallback: false
        });
        await DownloadManager.updateBadge();
        if (res.kind === 'anime-video') {
          nWin.renderDetalleEpisodios?.();
          const mbSize = (Number(res.sizeBytes || 0) / (1024 * 1024)).toFixed(1);
          showToast(`✓ Ep. ${state.epActual} guardado offline (${mbSize} MB) y exportado en .MP4`);
          return;
        }
      } catch (err: any) {
        lastErrorMessage = err?.message || 'Error de red durante la descarga';
        if (err?.name === 'QuotaExceededError' || /espacio.*insuficiente/i.test(lastErrorMessage)) {
          showToast(lastErrorMessage);
          return;
        }
      }
    }

    showToast(
      lastErrorMessage
        ? `No se pudo descargar Ep. ${state.epActual}: ${lastErrorMessage}`
        : `Sin enlace .MP4 directo en ${preferredAudio === 'DUB' ? 'Audio Latino' : 'Sub Español'} para este episodio.`
    );
    return;
  }
  showToast('Motor de descargas no disponible.');
}

export async function reproducirVideoOfflineCacheado(manifest: any): Promise<void> {
  if (!manifest?.id || !nWin.NyAnimeOffline?.getOfflineAnimeVideoBlobUrl) return;
  const blobUrl = await nWin.NyAnimeOffline.getOfflineAnimeVideoBlobUrl(manifest.id);
  if (!blobUrl) {
    showToast('No se encontró el archivo de video offline en caché.');
    return;
  }

  cancelUpNextCountdown();
  const pantalla = document.getElementById('pantalla-reproductor');
  if (pantalla) {
    pantalla.classList.remove('hide');
    pantalla.scrollTo(0, 0);
  }

  state.epActual = Number(manifest.episode || 1);
  if (!state.anime || String(state.anime.id) !== String(manifest.mediaId)) {
    state.anime = {
      id: Number(manifest.mediaId) || manifest.mediaId,
      title: { romaji: manifest.title, english: manifest.title },
      coverImage: { large: manifest.cover || '', extraLarge: manifest.cover || '' },
      episodes: Number(manifest.episode || 1)
    };
  }

  const titleEl = document.getElementById('rep-titulo');
  if (titleEl) titleEl.textContent = `${manifest.title} · Ep ${manifest.episode || 1} (Offline)`;
  const indEl = document.getElementById('player-ep-indicator');
  if (indEl) indEl.textContent = `Episodio ${manifest.episode || 1}`;
  const subEl = document.getElementById('rep-ep-subtitle');
  if (subEl) subEl.textContent = `T${manifest.season || 1} · Reproducción local sin conexión`;

  const statusDot = document.getElementById('source-status-dot');
  const statusLabel = document.getElementById('source-info-label');
  if (statusDot) statusDot.className = 'status-dot';
  if (statusLabel) statusLabel.textContent = 'Archivo .MP4 Offline · Sin Anuncios';

  const container = document.getElementById('contenedor-video');
  if (container) {
    teardownActiveMediaElement(container);
    container.innerHTML = `
      <video 
        id="video-player-native" 
        src="${escHtml(blobUrl)}" 
        controls 
        autoplay 
        playsinline 
        preload="metadata"
        style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:contain; background:#000;">
      </video>
    `;
    const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
    if (vidEl) {
      attachNativeVideoLifecycle(vidEl, state.epActual);
    }
  }
}

