import {
  AnimeWatchedManager,
  CommentsManager,
  DownloadManager,
  HistoryManager,
  UserManager,
  escHtml,
  fetchWithTimeout,
  nativeFetchHtml,
  nWin,
  showToast,
  state
} from './appState.ts';
import {
  buildUpNextCountdownText,
  formatPlaybackTime,
  shouldResumePlayback
} from '../utils/playerResume.ts';
import {
  computeIframeActiveDeltaSeconds,
  computeRealWatchDeltaSeconds
} from '../utils/profileStats.ts';
import {
  cargarAniZipMappingAsync,
  renderDetalleEpisodios
} from './animeDetailView.ts';
import {
  extractArchiveOrgSourcesFromMetadata,
  isArchiveOrgSpanishMetadata,
  parseHentaiJkEpisodeSources,
  parseHentaiJkSearchSlugs,
  parseHentaiLaCatalogData,
  parseHentaiLaEpisodeSources,
  parseJkPlayerDirectM3u8,
  pickBestSlugMatch,
  resolveDotanboritoDirectM3u8,
  selectBestArchiveOrgDocs
} from '../utils/animeSources.ts';

export interface NormalizedSourceInput {
  providerId: string;
  providerName: string;
  serverName?: string;
  url: string;
  language: string;
  quality?: string;
  type?: string;
  direct?: boolean;
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
  seasonNum: number
): string[] {
  if (nWin.NyAnimeVideoSources?.generateAnimeSlugCandidates) {
    return nWin.NyAnimeVideoSources.generateAnimeSlugCandidates(titleRomaji, titleEnglish, seasonTitle, seasonNum);
  }
  const candidates = new Set<string>();
  const clean = (str: string) =>
    (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, '-');
  [seasonTitle, titleRomaji, titleEnglish].filter(Boolean).forEach((t) => {
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
  return [ctx.seasonTitle, ctx.romaji, ctx.english, ...(ctx.synonyms || [])].filter(
    (t): t is string => Boolean(t && t.trim())
  );
}

class AnimeAV1SourceProvider {
  id = 'animeav1';
  name = 'AnimeAV1 HD';
  languages = ['SUB', 'LATINO'];
  slugCache = new Map<string, string>();

  async resolve(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    const { romaji, english, seasonTitle, season, episode, seasonId, synonyms, format } = ctx;
    const ep = episode || 1;
    const sNum = season || 1;
    const slugKey = String(seasonId || seasonTitle || romaji || english);

    try {
      let matchedSlug = this.slugCache.get(slugKey) || null;
      if (!matchedSlug) {
        const queries = buildSearchQueriesForCtx(romaji, english, seasonTitle, synonyms);
        const targets = buildTargetTitlesForCtx(ctx);
        for (const q of queries) {
          const catHtml = await nativeFetchHtml(`https://animeav1.com/catalogo?search=${encodeURIComponent(q)}`, {}, 4500);
          if (catHtml && nWin.NyAnimeVideoSources?.parseAnimeAv1CatalogLinks) {
            const foundSlugs = nWin.NyAnimeVideoSources.parseAnimeAv1CatalogLinks(catHtml);
            if (foundSlugs.length > 0) {
              matchedSlug = nWin.NyAnimeVideoSources.pickBestSlugMatch(
                foundSlugs,
                targets,
                sNum,
                format || ''
              );
              if (matchedSlug) {
                this.slugCache.set(slugKey, matchedSlug);
                break;
              }
            }
          }
        }
      }

      if (!matchedSlug) return [];
      const epHtml = await nativeFetchHtml(`https://animeav1.com/media/${matchedSlug}/${ep}`, {}, 4500);
      if (!epHtml || !nWin.NyAnimeVideoSources?.parseAnimeAv1EpisodeEmbeds) return [];
      return nWin.NyAnimeVideoSources.parseAnimeAv1EpisodeEmbeds(epHtml).map((s: NormalizedSourceInput) => new NormalizedSource(s));
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
    const { romaji, english, seasonTitle, season, episode, seasonId, synonyms, format } = ctx;
    const ep = episode || 1;
    const sNum = season || 1;
    const slugKey = String(seasonId || seasonTitle || romaji || english);

    try {
      let matchedSlug = this.slugCache.get(slugKey) || null;
      if (!matchedSlug) {
        const queries = buildSearchQueriesForCtx(romaji, english, seasonTitle, synonyms);
        const targets = buildTargetTitlesForCtx(ctx);
        for (const q of queries) {
          const dirHtml = await nativeFetchHtml(`https://tioanime.com/directorio?q=${encodeURIComponent(q)}`, {}, 4500);
          if (dirHtml && nWin.NyAnimeVideoSources?.parseTioAnimeDirectoryLinks) {
            const foundSlugs = nWin.NyAnimeVideoSources.parseTioAnimeDirectoryLinks(dirHtml);
            if (foundSlugs.length > 0) {
              matchedSlug = nWin.NyAnimeVideoSources.pickBestSlugMatch(
                foundSlugs,
                targets,
                sNum,
                format || ''
              );
              if (matchedSlug) {
                this.slugCache.set(slugKey, matchedSlug);
                break;
              }
            }
          }
        }
      }

      if (!matchedSlug) return [];
      const epHtml = await nativeFetchHtml(`https://tioanime.com/ver/${matchedSlug}-${ep}`, {}, 4500);
      if (!epHtml || !nWin.NyAnimeVideoSources?.parseTioAnimeEpisodeVideos) return [];
      return nWin.NyAnimeVideoSources.parseTioAnimeEpisodeVideos(epHtml, 'SUB').map((s: NormalizedSourceInput) => new NormalizedSource(s));
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
    const { romaji, english, seasonTitle, season, episode, seasonId, synonyms, format } = ctx;
    const ep = episode || 1;
    const sNum = season || 1;
    const slugKey = String(seasonId || seasonTitle || romaji || english);

    try {
      let matchedSlug = this.slugCache.get(slugKey) || null;
      if (!matchedSlug) {
        const queries = buildSearchQueriesForCtx(romaji, english, seasonTitle, synonyms);
        const targets = buildTargetTitlesForCtx(ctx);
        for (const q of queries) {
          const dirHtml = await nativeFetchHtml(`https://tvanime.tv/directorio?q=${encodeURIComponent(q)}`, {}, 4500);
          if (dirHtml && nWin.NyAnimeVideoSources?.parseTvAnimeDirectoryLinks) {
            const foundSlugs = nWin.NyAnimeVideoSources.parseTvAnimeDirectoryLinks(dirHtml);
            if (foundSlugs.length > 0) {
              matchedSlug = nWin.NyAnimeVideoSources.pickBestSlugMatch(
                foundSlugs,
                targets,
                sNum,
                format || ''
              );
              if (matchedSlug) {
                this.slugCache.set(slugKey, matchedSlug);
                break;
              }
            }
          }
        }
      }

      if (!matchedSlug) {
        matchedSlug = generateSlugCandidates(romaji, english, seasonTitle, sNum)[0] || null;
      }
      if (!matchedSlug) return [];
      const epHtml = await nativeFetchHtml(`https://tvanime.tv/anime/${matchedSlug}/episodio/episodio-${ep}`, {}, 4500);
      if (!epHtml || !nWin.NyAnimeVideoSources?.parseTvAnimeEpisodePlayers) return [];
      return nWin.NyAnimeVideoSources.parseTvAnimeEpisodePlayers(epHtml).map((s: NormalizedSourceInput) => new NormalizedSource(s));
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
  timeoutMs = 3200
): Promise<NormalizedSource[]> {
  try {
    const res = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(episodeUrl)}&probe=1`, {}, timeoutMs).catch(() => null);
    const upStatus = Number(res?.headers.get('x-upstream-status') || res?.status || 500);
    if (!res || !res.ok || upStatus >= 400) return [];
    const epHtml = await res.text();
    if (!epHtml || epHtml.includes('Just a moment') || epHtml.includes('cf-chl')) return [];

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
            'x-custom-requested-with': 'XMLHttpRequest'
          },
          body: `acc=opt&i=${encodeURIComponent(data.encryptId)}`
        },
        timeoutMs
      ).catch(() => null);
      const optUpStatus = Number(optRes?.headers.get('x-upstream-status') || optRes?.status || 500);
      if (optRes && optRes.ok && optUpStatus < 400) {
        const optHtml = await optRes.text();
        if (nWin.NyAnimeVideoSources?.parseHexOptServerList) {
          sources = nWin.NyAnimeVideoSources.parseHexOptServerList(optHtml, providerId, providerLabel, 'SUB');
        }
      }
    }

    if (data.downloadUrls && data.downloadUrls.length > 0 && nWin.NyAnimeVideoSources?.parsePortalDownloadUrls) {
      const dlSources = nWin.NyAnimeVideoSources.parsePortalDownloadUrls(data.downloadUrls, providerId, providerLabel, 'SUB');
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

  async resolveViaJkOne(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    const { romaji, english, seasonTitle, season, episode, seasonId } = ctx;
    const ep = episode || 1;
    const sNum = season || 1;
    const slugKey = String(seasonId || seasonTitle || romaji || english);
    const candidates = generateSlugCandidates(romaji, english, seasonTitle, sNum).slice(0, 3);

    try {
      let matchedSlug = this.oneSlugCache.get(slugKey) || null;
      if (!matchedSlug) {
        const queries = buildSearchQueriesForCtx(romaji, english, seasonTitle);

        for (const q of queries) {
          const sHtml = await nativeFetchHtml(`https://jkanime.one/anime-online?buscar=${encodeURIComponent(q)}`, {}, 3000);
          if (sHtml && nWin.NyAnimeVideoSources?.parseAnimePortalSearchSlugs) {
            const found = nWin.NyAnimeVideoSources.parseAnimePortalSearchSlugs(sHtml);
            if (found.length > 0) {
              matchedSlug = nWin.NyAnimeVideoSources.pickBestSlugMatch(
                found,
                [seasonTitle, romaji, english].filter(Boolean),
                sNum
              );
              if (matchedSlug) {
                const out = await fetchPortalOptSources(
                  `https://jkanime.one/ver/${matchedSlug}/${ep}`,
                  'https://jkanime.one/jk',
                  this.id,
                  'JKAnime',
                  3000
                );
                if (out.length > 0) {
                  this.oneSlugCache.set(slugKey, matchedSlug);
                  return out;
                }
              }
            }
          }
        }
      } else {
        const out = await fetchPortalOptSources(
          `https://jkanime.one/ver/${matchedSlug}/${ep}`,
          'https://jkanime.one/jk',
          this.id,
          'JKAnime',
          3000
        );
        if (out.length > 0) return out;
      }

      for (const slug of candidates) {
        if (!slug || slug === matchedSlug) continue;
        const out = await fetchPortalOptSources(
          `https://jkanime.one/ver/${slug}/${ep}`,
          'https://jkanime.one/jk',
          this.id,
          'JKAnime',
          2800
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
    const { romaji, english, seasonTitle, season, episode } = ctx;
    const candidates = generateSlugCandidates(romaji, english, seasonTitle, season).slice(0, 2);
    const ep = episode || 1;
    const isBlocked = nWin.NyAnimeVideoSources?.isBlockedOrUnsafeStreamHost;

    try {
      for (const slug of candidates) {
        if (Date.now() < this.cfBlockedUntil) return [];
        const targetUrl = `https://jkanime.net/${slug}/${ep}/`;
        const res = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(targetUrl)}&probe=1`, {}, 2200).catch(() => null);
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

        const list: NormalizedSource[] = [];
        const desuMatch = html.match(/video\[0\]\s*=\s*.*?src=["']([^"']+)["']/i);
        const desuvMatch = html.match(/video\[1\]\s*=\s*.*?src=["']([^"']+)["']/i);
        const desukaMatch = html.match(/video\[2\]\s*=\s*.*?src=["']([^"']+)["']/i);

        if (desuMatch?.[1] && (!isBlocked || !isBlocked(desuMatch[1], 'Desu'))) {
          list.push(new NormalizedSource({ providerId: this.id, providerName: 'JKAnime (Desu)', serverName: 'Desu', url: desuMatch[1], language: 'SUB', quality: '1080p', score: 128 }));
        }
        if (desuvMatch?.[1] && (!isBlocked || !isBlocked(desuvMatch[1], 'Desuv'))) {
          list.push(new NormalizedSource({ providerId: this.id, providerName: 'JKAnime (Desuv)', serverName: 'Desuv', url: desuvMatch[1], language: 'SUB', quality: '1080p', score: 126 }));
        }
        if (desukaMatch?.[1] && (!isBlocked || !isBlocked(desukaMatch[1], 'Desuka'))) {
          list.push(new NormalizedSource({ providerId: this.id, providerName: 'JKAnime (Desuka)', serverName: 'Desuka', url: desukaMatch[1], language: 'SUB', quality: '1080p', score: 125 }));
        }

        const match = html.match(/var servers = (\[.*?\]);/);
        if (match) {
          const servers = JSON.parse(match[1]);
          for (const s of servers) {
            if (!s.remote || s.server === 'Mediafire') continue;
            let decoded = '';
            try { decoded = atob(s.remote).trim(); } catch { decoded = String(s.remote || '').trim(); }
            if (!decoded) continue;
            if (isBlocked && isBlocked(decoded, s.server)) continue;
            list.push(new NormalizedSource({
              providerId: this.id,
              providerName: `JKAnime (${s.server})`,
              serverName: s.server,
              url: decoded,
              language: 'SUB',
              quality: '1080p',
              score: 102
            }));
          }
        }
        if (list.length > 0) return list;
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

  async resolve(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    const { romaji, english, seasonTitle, season, episode, seasonId } = ctx;
    const ep = episode || 1;
    const sNum = season || 1;
    const slugKey = String(seasonId || seasonTitle || romaji || english);
    const candidates = generateSlugCandidates(romaji, english, seasonTitle, sNum).slice(0, 3);

    try {
      let matchedSlug = this.slugCache.get(slugKey) || null;
      if (!matchedSlug) {
        const queries = buildSearchQueriesForCtx(romaji, english, seasonTitle);
        for (const q of queries) {
          const sHtml = await nativeFetchHtml(`https://ww1.henaojara.net/animes?buscar=${encodeURIComponent(q)}`, {}, 3000);
          if (sHtml && nWin.NyAnimeVideoSources?.parseAnimePortalSearchSlugs) {
            const found = nWin.NyAnimeVideoSources.parseAnimePortalSearchSlugs(sHtml);
            if (found.length > 0) {
              const candidate = nWin.NyAnimeVideoSources.pickBestSlugMatch(
                found,
                [seasonTitle, romaji, english].filter(Boolean),
                sNum
              );
              if (candidate) {
                const out = await fetchPortalOptSources(
                  `https://ww1.henaojara.net/ver/${candidate}-${ep}`,
                  'https://ww1.henaojara.net/hj',
                  this.id,
                  'HenaoJara',
                  3000
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
          3000
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
          2800
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
    const candidates = generateSlugCandidates(romaji, english, seasonTitle, sNum).slice(0, 4);
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
    const candidates = generateSlugCandidates(romaji, english, seasonTitle, sNum).slice(0, 3);
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
    const { romaji, english, seasonTitle, synonyms, episode, isMovie, seasonId } = ctx;
    const ep = Math.max(1, Number(episode || 1));
    const targets = buildTargetTitlesForCtx(ctx);
    if (targets.length === 0) return [];

    const queries = buildSearchQueriesForCtx(romaji, english, seasonTitle, synonyms).slice(0, 3);
    const cacheKey = `${seasonId || romaji || english}::ep${ep}`;

    try {
      let bestDocIds = this.docCache.get(cacheKey) || [];
      if (bestDocIds.length === 0) {
        const allDocs: Array<{ identifier?: string; title?: string | string[]; downloads?: number }> = [];
        for (const q of queries) {
          const cleanQ = q.replace(/[()"']/g, ' ').replace(/\s+/g, ' ').trim();
          if (!cleanQ) continue;
          const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`title:(${cleanQ}) AND mediatype:(movies)`)}&fl[]=identifier,title,downloads&sort[]=downloads+desc&rows=15&output=json`;
          const res = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(searchUrl)}`, {}, 3800).catch(() => null);
          if (!res || !res.ok) continue;
          const json = await res.json().catch(() => null);
          const docs = json?.response?.docs;
          if (Array.isArray(docs) && docs.length > 0) {
            allDocs.push(...docs);
            const matched = selectBestArchiveOrgDocs(allDocs, targets, ep, isMovie);
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
        const metaRes = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(metaUrl)}`, {}, 3800).catch(() => null);
        if (!metaRes || !metaRes.ok) continue;
        const metaJson = await metaRes.json().catch(() => null);
        if (!metaJson) continue;
        // Strictly enforce Spanish metadata on Archive.org items so English-only releases never masquerade as Sub Español
        if (!isArchiveOrgSpanishMetadata(docId, metaJson)) continue;
        const extracted = extractArchiveOrgSourcesFromMetadata(docId, metaJson, ep, 'Archive Español HD');
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
  const rawId = String(ctx.seasonId || '').replace(/^jk_/, '').trim();
  const numericAniId = Number.isFinite(Number(rawId)) && Number(rawId) > 0 ? Number(rawId) : 21;
  const fallbackTargetId = ctx.tmdbId || ctx.imdbId || ctx.malId || numericAniId;

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
}

export const StreamExtractor = {
  cache: new Map<string, ExtractedStream>(),
  wrapProxy(rawMp4Url: string): string {
    if (!rawMp4Url) return '';
    if (rawMp4Url.startsWith('/api/video-proxy?')) return rawMp4Url;
    return `/api/video-proxy?url=${encodeURIComponent(rawMp4Url)}`;
  },
  async extract(url: string): Promise<ExtractedStream | null> {
    if (!url) return null;
    if (this.cache.has(url)) return this.cache.get(url) || null;

    if (url.includes('dotanborito.net')) {
      const m3u8Url = resolveDotanboritoDirectM3u8(url);
      if (m3u8Url) {
        const out: ExtractedStream = {
          type: 'hls',
          streamUrl: this.wrapProxy(m3u8Url),
          rawDirectUrl: m3u8Url
        };
        this.cache.set(url, out);
        return out;
      }
    }

    if (/\.(mp4|webm)(\?|$)/i.test(url)) {
      const out: ExtractedStream = { type: 'mp4', streamUrl: this.wrapProxy(url), rawDirectUrl: url };
      this.cache.set(url, out);
      return out;
    }

    if (/\.m3u8(\?|$)/i.test(url)) {
      const needsProxy = url.includes('dotanborito.net') || url.includes('playmudos.com');
      const out: ExtractedStream = {
        type: 'hls',
        streamUrl: needsProxy ? this.wrapProxy(url) : url,
        rawDirectUrl: url
      };
      this.cache.set(url, out);
      return out;
    }

    if (url.includes('mp4upload.com')) {
      try {
        const html = await nativeFetchHtml(url, {}, 9000);
        const directUrl = html && nWin.NyAnimeVideoSources?.parseMp4UploadDirectUrl
          ? nWin.NyAnimeVideoSources.parseMp4UploadDirectUrl(html)
          : null;
        if (directUrl) {
          const out: ExtractedStream = { type: 'mp4', streamUrl: this.wrapProxy(directUrl), rawDirectUrl: directUrl };
          this.cache.set(url, out);
          return out;
        }
      } catch {
        // ignore
      }
      return null;
    }

    if (url.includes('yourupload.com')) {
      try {
        const html = await nativeFetchHtml(url, {}, 9000);
        const directUrl = html && nWin.NyAnimeVideoSources?.parseYourUploadDirectUrl
          ? nWin.NyAnimeVideoSources.parseYourUploadDirectUrl(html)
          : null;
        if (directUrl) {
          const out: ExtractedStream = { type: 'mp4', streamUrl: this.wrapProxy(directUrl), rawDirectUrl: directUrl };
          this.cache.set(url, out);
          return out;
        }
      } catch {
        // ignore
      }
      return null;
    }

    if (url.includes('/jkplayer/um')) {
      try {
        const html = await nativeFetchHtml(url, {}, 6500);
        const m3u8Url = html ? parseJkPlayerDirectM3u8(html) : null;
        if (m3u8Url) {
          const out: ExtractedStream = {
            type: 'hls',
            streamUrl: m3u8Url.includes('playmudos.com') ? this.wrapProxy(m3u8Url) : m3u8Url,
            rawDirectUrl: m3u8Url
          };
          this.cache.set(url, out);
          return out;
        }
      } catch {
        // ignore
      }
    }

    if (
      url.includes('flaswish.com') ||
      url.includes('streamwish.') ||
      url.includes('sfastwish.com') ||
      url.includes('streamhgapi.com') ||
      url.includes('ghbrisk.com') ||
      url.includes('ryderjet.com') ||
      url.includes('vidhidevip.com')
    ) {
      try {
        const normWish = url.replace('sfastwish.com', 'flaswish.com');
        const html = await nativeFetchHtml(normWish, {}, 6500);
        const m3u8Url = html && nWin.NyAnimeVideoSources?.parseStreamWishDirectUrl
          ? nWin.NyAnimeVideoSources.parseStreamWishDirectUrl(html)
          : null;
        if (m3u8Url) {
          const out: ExtractedStream = { type: 'hls', streamUrl: m3u8Url, rawDirectUrl: m3u8Url };
          this.cache.set(url, out);
          return out;
        }
      } catch {
        // ignore
      }
    }

    return null;
  }
};

export class SmartVideoSourceManager {
  providers = [
    new HentaiLASourceProvider(),
    new JKAnimeSourceProvider(),
    new AnimeAV1SourceProvider(),
    new TVAnimeSourceProvider(),
    new HenaoJaraSourceProvider(),
    new TioAnimeSourceProvider(),
    new HentaiJKSourceProvider(),
    new InternetArchiveAnimeProvider()
  ];
  failedSourcesInSession = new Set<string>();
  rawEpisodeCache = new Map<string, NormalizedSource[]>();
  inflightMap = new Map<string, Promise<NormalizedSource[]>>();

  getCacheKey(ctx: EpisodeResolveContext): string {
    return `${ctx.seasonId || ctx.slug || 'anime'}::s${ctx.season || 1}::e${ctx.episode || 1}`;
  }

  async fetchRawSources(ctx: EpisodeResolveContext): Promise<NormalizedSource[]> {
    const key = this.getCacheKey(ctx);
    const cached = this.rawEpisodeCache.get(key);
    if (cached) return cached;

    const inflight = this.inflightMap.get(key);
    if (inflight) return inflight;

    const job = (async () => {
      const results = await Promise.all(
        this.providers.map((p) =>
          Promise.race([
            p.resolve(ctx).catch(() => []),
            new Promise<NormalizedSource[]>((resolve) => setTimeout(() => resolve([]), 6500))
          ])
        )
      );
      const flat = ensureGuaranteedEpisodeSources(
        ctx,
        results.flat().filter((s) => s && s.url)
      );
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

  rankRawSources(rawList: NormalizedSource[], targetLanguage = 'SUB'): NormalizedSource[] {
    if (nWin.NyAnimeVideoSources?.rankAndDeduplicateSources) {
      return nWin.NyAnimeVideoSources.rankAndDeduplicateSources(
        rawList,
        targetLanguage,
        this.failedSourcesInSession
      );
    }
    return [...(rawList || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  async resolveAndRankSources(ctx: EpisodeResolveContext, targetLanguage = 'SUB'): Promise<NormalizedSource[]> {
    const rawList = await this.fetchRawSources(ctx);
    return this.rankRawSources(rawList, targetLanguage);
  }

  markSourceFailed(url: string): void {
    if (url) this.failedSourcesInSession.add(url);
  }
}

export const videoSourceManager = new SmartVideoSourceManager();

let _playerWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
let _upNextIntervalTimer: ReturnType<typeof setInterval> | null = null;
let activeVideoWatchBufferSec = 0;
let activeVideoLastTickPos: number | null = null;
let activeIframeLoadedAtMs: number | null = null;
let activeIframeLastFlushedAtMs: number | null = null;
let _playerVisibilityBound = false;

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
  resetWatchTimeTrackers();

  vidEl.addEventListener('loadedmetadata', () => {
    if (resumeApplied || !state.anime?.id) return;
    resumeApplied = true;
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
  });

  vidEl.addEventListener('seeked', () => {
    activeVideoLastTickPos = vidEl.currentTime || 0;
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

export function cerrarReproductor(): void {
  flushPlayerProgress();
  resetWatchTimeTrackers();
  cancelUpNextCountdown();
  if (_playerWatchdogTimer) {
    clearTimeout(_playerWatchdogTimer);
    _playerWatchdogTimer = null;
  }
  if (nWin._nyActiveHls) {
    try { nWin._nyActiveHls.destroy(); } catch { /* ignore */ }
    nWin._nyActiveHls = null;
  }
  document.getElementById('pantalla-reproductor')?.classList.add('hide');
  const vidCont = document.getElementById('contenedor-video');
  if (vidCont) vidCont.innerHTML = '';
  const detalle = document.getElementById('pantalla-detalle');
  if (detalle && state.anime) detalle.classList.remove('hide');
}

export function seleccionarAudio(modo: string): void {
  if (state.modoAudio === modo) return;
  flushPlayerProgress();
  state.modoAudio = modo;
  state.fuenteActualIdx = 0;
  updateAudioSelectorUI();

  if (Array.isArray(state.rawFuentesEpisodio) && state.rawFuentesEpisodio.length > 0) {
    state.fuentesRankeadas = videoSourceManager.rankRawSources(state.rawFuentesEpisodio, state.modoAudio);
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
      const isFailed = videoSourceManager.failedSourcesInSession.has(src.url) || src.status === 'FAILED';
      const langClass = src.language === 'LATINO' ? 'lat' : (src.language === 'SUB' ? 'sub' : '');
      const langLabel = src.language === 'LATINO' ? 'LAT' : (src.language === 'MULTI' ? 'MULTI' : 'SUB');
      const uLower = String(src.url || '').toLowerCase();
      const sLower = String(src.serverName || src.providerName || '').toLowerCase();
      const isNativeClean =
        src.direct ||
        uLower.includes('dotanborito.net') ||
        uLower.includes('mp4upload.com') ||
        uLower.includes('yourupload.com') ||
        uLower.includes('flaswish.com') ||
        uLower.includes('streamwish.') ||
        uLower.includes('sfastwish.com') ||
        uLower.includes('ghbrisk.com') ||
        uLower.includes('ryderjet.com') ||
        uLower.includes('streamhgapi.com') ||
        /\.(mp4|webm|m3u8)(\?|$)/i.test(uLower) ||
        sLower.includes('desu') ||
        sLower.includes('vip');
      const cleanBadge = isNativeClean && !isFailed
        ? '<span style="font-size:9.5px; font-weight:800; color:#34d399; background:rgba(16,185,129,0.14); border:1px solid rgba(52,211,153,0.35); padding:1px 5px; border-radius:999px; margin-left:2px;">🟢 Sin Anuncios</span>'
        : '';
      return `
        <button type="button"
                class="server-chip ${isActive ? 'active' : ''} ${isFailed ? 'failed' : ''}"
                onclick="seleccionarServidorManual(${i})"
                title="${escHtml(src.providerName)} (${langLabel})${isNativeClean ? ' · Reproductor nativo sin anuncios' : ''}">
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

export function cambiarEpisodioRep(ep: number): void {
  flushPlayerProgress();
  cancelUpNextCountdown();
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
  const isMovie = currentSeason.totalEpisodes === 1 || format === 'MOVIE';
  const epInfo = mapping?.episodes?.[epNum] || {};
  const season = Number(currentSeason.seasonNumber || epInfo.seasonNumber || 1);
  const episode = Math.max(1, Number(epNum || 1));
  const romaji = currentSeason.romaji || currentSeason.title || state.anime?.title?.romaji || '';
  const english = currentSeason.english || currentSeason.title || state.anime?.title?.english || '';
  const seasonTitle = currentSeason.title || romaji || english;
  const synonyms = Array.isArray(state.anime?.synonyms)
    ? state.anime.synonyms.filter((s: unknown): s is string => typeof s === 'string' && Boolean(s.trim()))
    : [];
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

  cancelUpNextCountdown();
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
    const rawSources = await videoSourceManager.fetchRawSources(context);
    if (state.epActual !== epActual) return;

    state.rawFuentesEpisodio = rawSources;
    updateAudioServerCountsUI(rawSources);

    const rankedSources = videoSourceManager.rankRawSources(rawSources, state.modoAudio);
    state.fuentesRankeadas = rankedSources;
    renderPlayerServersBar();

    if (!rankedSources || rankedSources.length === 0) {
      throw new Error('No se encontraron servidores disponibles para este episodio.');
    }

    await ejecutarFuenteActiva();

    const currentSeason = state.seasons?.[state.temporadaActualIdx] || { totalEpisodes: 1 };
    if (epActual < (currentSeason.totalEpisodes || 1)) {
      setTimeout(async () => {
        try {
          const nextCtx = await resolverContextoEpisodio(epActual + 1);
          void videoSourceManager.fetchRawSources(nextCtx);
        } catch {
          // ignore prefetch failure
        }
      }, 1200);
    }
  } catch (err) {
    console.error('Error al resolver fuente:', err);
    statusDot.className = 'status-dot error';
    statusLabel.textContent = 'Sin servidores automáticos para este episodio.';
    container.innerHTML = `
      <div class="loader" style="height:100%; padding:20px; text-align:center;">
        <span style="color:#ef4444; font-weight:700; margin-bottom:10px;">❌ No se encontraron servidores activos.</span>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
          <button class="chip active" style="background:var(--primary); color:white;" onclick="resolverYReproducirFuente()">🔄 Reintentar búsqueda</button>
          <button class="chip" onclick="seleccionarAudio(state.modoAudio === 'SUB' ? 'LATINO' : 'SUB')">🌐 Probar otro idioma</button>
        </div>
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
    <button type="button" onclick="probarFuenteAlternativa()">Siguiente ⏭</button>
  `;
  container.appendChild(banner);
}

export async function ejecutarFuenteActiva(): Promise<void> {
  const container = document.getElementById('contenedor-video');
  const statusLabel = document.getElementById('source-info-label');
  const statusDot = document.getElementById('source-status-dot');
  const extBtn = document.getElementById('btn-open-external-stream') as HTMLAnchorElement | null;
  if (!container || !statusLabel || !statusDot) return;

  cancelUpNextCountdown();
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
  const langBadge = fuente.language === 'LATINO' ? '🇲🇽 Latino' : (fuente.language === 'MULTI' ? '🌐 Multi' : '🇯🇵 Sub ES');

  renderPlayerServersBar();
  statusDot.className = isAlternative ? 'status-dot warning' : 'status-dot';
  statusLabel.textContent = `${langBadge} · ${fuente.providerName} (${idx + 1}/${state.fuentesRankeadas.length})`;

  const safeUrl = nWin.safeExternalUrl ? nWin.safeExternalUrl(fuente.url) : fuente.url;
  if (extBtn) {
    if (safeUrl && safeUrl !== '#') {
      extBtn.href = safeUrl;
      extBtn.style.display = 'inline-flex';
    } else {
      extBtn.style.display = 'none';
    }
  }

  container.innerHTML = `
    <div style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#0b0d14; color:#fff;">
      <div class="spinner-border" style="width:36px; height:36px; border:3px solid rgba(255,255,255,0.1); border-top-color:#e11d48; border-radius:50%; animation:spin 0.8s linear infinite; margin-bottom:12px;"></div>
      <span style="font-size:13px; font-weight:600; color:#a0aec0;">Conectando con ${escHtml(fuente.providerName)}...</span>
    </div>
  `;

  if (nWin._nyActiveHls) {
    try { nWin._nyActiveHls.destroy(); } catch { /* ignore */ }
    nWin._nyActiveHls = null;
  }

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
    fuente.url.includes('flaswish.com') ||
    fuente.url.includes('streamwish.') ||
    fuente.url.includes('sfastwish.com') ||
    fuente.url.includes('ghbrisk.com') ||
    fuente.url.includes('ryderjet.com') ||
    fuente.url.includes('streamhgapi.com') ||
    fuente.url.includes('vidhidevip.com');

  if (canTryNativeExtract) {
    try {
      const directStream = await StreamExtractor.extract(fuente.url);
      if (state.epActual !== activeEpSnapshot || (state.fuenteActualIdx % state.fuentesRankeadas.length) !== activeIdxSnapshot) {
        return;
      }
      if (directStream && directStream.type === 'mp4' && directStream.streamUrl) {
        statusLabel.textContent = `${langBadge} · ${fuente.providerName} · Sin Anuncios (${idx + 1}/${state.fuentesRankeadas.length})`;
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
          vidEl.onerror = () => {
            videoSourceManager.markSourceFailed(fuente.url);
            const availCount = state.fuentesRankeadas.filter((f) => !videoSourceManager.failedSourcesInSession.has(f.url)).length;
            if (availCount > 0 && state.fuentesRankeadas.length > 1) {
              probarFuenteAlternativa();
            } else {
              mostrarAvisoCambioServidorVideo('El video directo falló en origen.');
            }
          };
        }
        return;
      }
      if (directStream && directStream.type === 'hls' && directStream.streamUrl) {
        statusLabel.textContent = `${langBadge} · ${fuente.providerName} · HLS Sin Anuncios (${idx + 1}/${state.fuentesRankeadas.length})`;
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
          if (nWin.Hls?.isSupported?.()) {
            const hls = new nWin.Hls({ enableWorker: true });
            nWin._nyActiveHls = hls;
            hls.loadSource(directStream.streamUrl);
            hls.attachMedia(vidEl);
            hls.on(nWin.Hls.Events.ERROR, (_ev: any, data: any) => {
              if (data?.fatal) {
                try { hls.destroy(); } catch { /* ignore */ }
                nWin._nyActiveHls = null;
                videoSourceManager.markSourceFailed(fuente.url);
                if (state.fuentesRankeadas.length > 1) probarFuenteAlternativa();
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
        (f, i) => i !== idx && !videoSourceManager.failedSourcesInSession.has(f.url)
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

  let embedUrl = fuente.url;
  if (embedUrl.includes('sfastwish.com')) {
    embedUrl = embedUrl.replace('sfastwish.com', 'flaswish.com');
  }
  const finalEmbedSafe = nWin.safeExternalUrl ? nWin.safeExternalUrl(embedUrl) : embedUrl;

  // Sin atributo sandbox para evitar errores "Sandboxed our player is not allowed" en UPNShare / Mega / Desu
  container.innerHTML = `
    <iframe 
      id="video-player-iframe"
      src="${escHtml(finalEmbedSafe)}" 
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture" 
      allowfullscreen 
      referrerpolicy="strict-origin-when-cross-origin"
      frameborder="0"
      style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;">
    </iframe>
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
    }, 7000);
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

export function probarFuenteAlternativa(): void {
  if (!state.fuentesRankeadas || state.fuentesRankeadas.length <= 1) {
    showToast('No hay más servidores alternativos en esta lista.');
    return;
  }

  flushPlayerProgress();
  const fuenteActual = state.fuentesRankeadas[state.fuenteActualIdx % state.fuentesRankeadas.length];
  if (fuenteActual) {
    videoSourceManager.markSourceFailed(fuenteActual.url);
  }

  state.fuenteActualIdx = (state.fuenteActualIdx + 1) % state.fuentesRankeadas.length;
  showToast(`Cambiando a ${state.fuentesRankeadas[state.fuenteActualIdx].providerName}...`);
  void ejecutarFuenteActiva();
}

export function bindPlayerKeyboardShortcuts(): void {
  if (nWin._nyPlayerKeyboardBound) return;
  nWin._nyPlayerKeyboardBound = true;

  document.addEventListener('keydown', (e) => {
    const rep = document.getElementById('pantalla-reproductor');
    if (!rep || rep.classList.contains('hide')) return;
    const tag = String(document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    const vidEl = document.getElementById('video-player-native') as HTMLVideoElement | null;
    const lower = e.key.toLowerCase();

    if ((e.key === ' ' || lower === 'k') && vidEl) {
      e.preventDefault();
      if (vidEl.paused) void vidEl.play().catch(() => {});
      else vidEl.pause();
      return;
    }

    if (lower === 'm' && vidEl) {
      e.preventDefault();
      vidEl.muted = !vidEl.muted;
      showToast(vidEl.muted ? '🔇 Silenciado' : '🔊 Sonido activado');
      return;
    }

    if (lower === 'f') {
      e.preventDefault();
      togglePantallaCompleta();
      return;
    }

    if (e.key === 'ArrowRight') {
      if (vidEl && !e.shiftKey && Number.isFinite(vidEl.duration)) {
        e.preventDefault();
        vidEl.currentTime = Math.min(vidEl.duration, vidEl.currentTime + 10);
      } else {
        navegarEpisodioPlayer(1);
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      if (vidEl && !e.shiftKey) {
        e.preventDefault();
        vidEl.currentTime = Math.max(0, vidEl.currentTime - 10);
      } else {
        navegarEpisodioPlayer(-1);
      }
    }
  });
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

  const mp4Candidates = [
    fuenteActiva,
    ...fuentes.filter((f) => f && f !== fuenteActiva)
  ].filter(
    (f) =>
      f &&
      f.url &&
      !videoSourceManager.failedSourcesInSession.has(f.url) &&
      (f.url.includes('mp4upload.com') || f.url.includes('yourupload.com') || /\.(mp4|webm)(\?|$)/i.test(f.url))
  );

  const rawFilename = `${cleanSeriesTitle}_T${seasonNum}_Ep_${state.epActual}.mp4`;

  if (nWin.NyAnimeOffline?.downloadAnimeEpisodeOrQueue) {
    for (const cand of mp4Candidates) {
      try {
        const extracted = await StreamExtractor.extract(cand.url);
        if (extracted?.type === 'mp4' && extracted.streamUrl) {
          showToast(`📥 Descargando T${seasonNum} · Ep ${state.epActual} (.MP4)...`);
          const res = await nWin.NyAnimeOffline.downloadAnimeEpisodeOrQueue({
            animeId: seasonId,
            animeTitle: `${cleanSeriesTitle} (T${seasonNum})`,
            cover: state.anime?.coverImage?.large || state.anime?.coverImage?.extraLarge || '',
            season: seasonNum,
            episode: state.epActual,
            quality: '1080p',
            directStreamUrl: extracted.streamUrl,
            fallbackWebUrl: cand.url || fallbackUrl,
            saveToDeviceFilename: rawFilename
          });
          await DownloadManager.updateBadge();
          if (res.kind === 'anime-video') {
            nWin.renderDetalleEpisodios?.();
            showToast(`Archivo .MP4 descargado: ${cleanSeriesTitle} T${seasonNum} Ep ${state.epActual}`);
            return;
          }
        }
      } catch {
        // try next MP4 candidate if rate-limited or broken
      }
    }

    try {
      showToast('Guardando enlace real en Ver Luego...');
      await nWin.NyAnimeOffline.downloadAnimeEpisodeOrQueue({
        animeId: seasonId,
        animeTitle: `${cleanSeriesTitle} (T${seasonNum})`,
        cover: state.anime?.coverImage?.large || state.anime?.coverImage?.extraLarge || '',
        season: seasonNum,
        episode: state.epActual,
        quality: '1080p',
        directStreamUrl: null,
        fallbackWebUrl: fallbackUrl
      });
      await DownloadManager.updateBadge();
      showToast('🔖 Guardado en "Ver Luego" con enlace real');
      return;
    } catch (err: any) {
      showToast(`No se pudo descargar: ${err?.message || err}`);
      return;
    }
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
  if (titleEl) titleEl.textContent = `${manifest.title} · Ep ${manifest.episode || 1} (Offline 💾)`;
  const indEl = document.getElementById('player-ep-indicator');
  if (indEl) indEl.textContent = `Episodio ${manifest.episode || 1}`;
  const subEl = document.getElementById('rep-ep-subtitle');
  if (subEl) subEl.textContent = `T${manifest.season || 1} · Reproducción local sin conexión`;

  const statusDot = document.getElementById('source-status-dot');
  const statusLabel = document.getElementById('source-info-label');
  if (statusDot) statusDot.className = 'status-dot';
  if (statusLabel) statusLabel.textContent = `💾 Archivo .MP4 Offline · Sin Anuncios`;

  const container = document.getElementById('contenedor-video');
  if (container) {
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

