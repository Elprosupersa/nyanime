import {
  ANILIST_URL,
  type AnimeListStatus,
  AnimeWatchedManager,
  CacheManager,
  DownloadManager,
  FavoritesManager,
  cerrarModales,
  escHtml,
  fetchWithTimeout,
  nWin,
  safeImg,
  showToast,
  state
} from './appState.ts';
import { ANIME_LIST_CATEGORIES, getCategoryMeta } from '../utils/profileStats.ts';
import {
  buildSeasonEpisodeRanges,
  computeEpisodeSelectionByMode,
  type DownloadPickerFilterMode
} from '../utils/downloadHelpers.ts';
import { ensureModalsMounted } from './modals.ts';
import {
  StreamExtractor,
  resolverContextoEpisodio,
  videoSourceManager
} from './playerView.ts';

let seasonDownloadAbortCtrl: AbortController | null = null;
let episodeMarkMode = false;
let libraryMenuOpen = false;
let dlModalWatchedSet = new Set<number>();
let dlModalOfflineSet = new Set<number>();
let dlModalTotalEpisodes = 0;

export function calcularEpisodiosReales(media: any): number {
  if (nWin.NyAnimeSeasons?.computeAvailableEpisodes) {
    return nWin.NyAnimeSeasons.computeAvailableEpisodes(media).totalEpisodes;
  }
  if (!media || media.status === 'NOT_YET_RELEASED') return 0;
  if (media.status === 'RELEASING' && media.nextAiringEpisode?.episode) {
    return Math.max(0, Number(media.nextAiringEpisode.episode) - 1);
  }
  return Math.max(0, Number(media.episodes || 0));
}

export function aplicarMetadatosTemporadaUI(seasonOrMedia: any, fallbackAnime: any): void {
  const ref = seasonOrMedia || fallbackAnime;
  if (!ref) return;
  const title =
    ref.title?.english ||
    ref.title?.romaji ||
    (typeof ref.title === 'string' ? ref.title : '') ||
    fallbackAnime?.title?.english ||
    fallbackAnime?.title?.romaji ||
    'Anime';

  const titleEl = document.getElementById('det-titulo');
  if (titleEl) titleEl.innerText = title;

  const imgUrl =
    ref.bannerImage ||
    ref.coverImage?.extraLarge ||
    ref.coverImage?.large ||
    (typeof ref.coverImage === 'string' ? ref.coverImage : '') ||
    fallbackAnime?.bannerImage ||
    fallbackAnime?.coverImage?.extraLarge ||
    '';
  const imgEl = document.getElementById('det-img') as HTMLImageElement | null;
  if (imgEl && imgUrl) imgEl.src = safeImg(imgUrl);

  const rawDesc = ref.description || fallbackAnime?.description || 'Sin descripción disponible.';
  const cleanDesc = String(rawDesc).replace(/<br\s*\/?>/gi, ' ').replace(/<\/?i>/gi, '');
  const descEl = document.getElementById('det-sinopsis');
  if (descEl) descEl.textContent = cleanDesc;

  const badgesContainer = document.getElementById('det-meta-badges');
  if (!badgesContainer) return;
  badgesContainer.innerHTML = '';

  const fmt = ref.format || fallbackAnime?.format;
  const st = ref.status || fallbackAnime?.status;
  const scoreVal = ref.averageScore || fallbackAnime?.averageScore;
  const nextAiring = ref.nextAiringEpisode || fallbackAnime?.nextAiringEpisode;

  if (fmt) badgesContainer.innerHTML += `<span class="badge-pill">${escHtml(fmt)}</span>`;
  if (scoreVal) badgesContainer.innerHTML += `<span class="badge-pill">★ ${(Number(scoreVal) / 10).toFixed(1)}</span>`;
  if (st === 'RELEASING') badgesContainer.innerHTML += '<span class="badge-pill status-releasing">🟢 En Emisión</span>';
  else if (st === 'NOT_YET_RELEASED') badgesContainer.innerHTML += '<span class="badge-pill">🗓️ Próximamente</span>';
  else if (st === 'FINISHED') badgesContainer.innerHTML += '<span class="badge-pill">Finalizado</span>';

  if (st === 'RELEASING' && nextAiring?.timeUntilAiring && nWin.NyAnimeVideoSources?.formatAiringCountdown) {
    const countdown = nWin.NyAnimeVideoSources.formatAiringCountdown(nextAiring.timeUntilAiring, nextAiring.episode);
    if (countdown) badgesContainer.innerHTML += `<span class="badge-pill status-releasing">⏱️ ${escHtml(countdown)}</span>`;
  }

  const genres: string[] =
    Array.isArray(ref.genres) && ref.genres.length > 0 ? ref.genres : (fallbackAnime?.genres || []);
  genres.slice(0, 3).forEach((g) => {
    badgesContainer.innerHTML += `<span class="badge-pill genre">${escHtml(g)}</span>`;
  });
}

export function actualizarBotonContinuarDetalleAnime(): void {
  const season = state.seasons[state.temporadaActualIdx] || state.seasons[0];
  const btn = document.getElementById('det-btn-continue') as HTMLButtonElement | null;
  const pill = document.getElementById('det-watch-progress');
  if (!btn || !season) return;

  const total = Number(season.totalEpisodes || 0);
  const watchedSet = AnimeWatchedManager.getWatchedSet(season.id);
  const watchedCount = Array.from(watchedSet).filter((n) => n >= 1 && n <= total).length;

  if (pill) {
    pill.textContent = total > 0 ? `📺 ${watchedCount} / ${total} vistos` : 'Próximamente';
  }

  if (total === 0 || season.isUpcoming) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.textContent = '🗓️ Próximamente';
    return;
  }

  btn.disabled = false;
  btn.style.opacity = '1';

  let nextEp = 1;
  for (let i = 1; i <= total; i++) {
    if (!watchedSet.has(i)) {
      nextEp = i;
      break;
    }
  }
  if (watchedCount === 0) {
    btn.textContent = '▶ Empezar Episodio 1';
  } else if (watchedCount >= total) {
    btn.textContent = '↻ Volver a ver Episodio 1';
  } else {
    btn.textContent = `▶ Continuar · Episodio ${nextEp}`;
  }
}

export function iniciarOContinuarAnime(): void {
  const season = state.seasons[state.temporadaActualIdx] || state.seasons[0];
  if (!season || !season.totalEpisodes) return;
  const watchedSet = AnimeWatchedManager.getWatchedSet(season.id);
  let targetEp = 1;
  for (let i = 1; i <= season.totalEpisodes; i++) {
    if (!watchedSet.has(i)) {
      targetEp = i;
      break;
    }
  }
  nWin.abrirReproductor?.(targetEp);
}

export async function abrirDetalle(animeInput: any, onLoadedCallback?: () => void): Promise<void> {
  const numericCandidate = typeof animeInput === 'string' ? Number(animeInput) : NaN;
  const normalizedId =
    typeof animeInput === 'number'
      ? animeInput
      : typeof animeInput === 'string'
        ? (Number.isFinite(numericCandidate) && numericCandidate > 0 ? numericCandidate : animeInput)
        : undefined;
  const anime =
    typeof animeInput === 'number' || typeof animeInput === 'string'
      ? { id: normalizedId, title: { romaji: '', english: '' } }
      : animeInput || {};
  state.anime = anime;
  state.fullMedia = null;
  nWin.Store?.setActiveAnime?.(anime);
  state.temporadaActualIdx = 0;
  state.rangoActualIdx = 0;
  state.seasonMenuOpen = false;
  state.episodeMetaMap = {};
  episodeMarkMode = false;
  libraryMenuOpen = false;

  const epsProvisional = calcularEpisodiosReales(anime);
  const provTitle = anime?.title?.english || anime?.title?.romaji || 'Temporada 1';
  state.seasons = [
    {
      id: anime?.id || 0,
      seasonNumber: 1,
      tier: 'MAIN_SEASON',
      shortTag: 'T1',
      title: provTitle,
      romaji: anime?.title?.romaji || provTitle,
      english: anime?.title?.english || provTitle,
      displayLabel: `T1: ${provTitle}`,
      episodeLabel: `${epsProvisional} Episodios`,
      format: anime?.format || 'TV',
      status: anime?.status || 'FINISHED',
      totalEpisodes: epsProvisional,
      isUpcoming: anime?.status === 'NOT_YET_RELEASED',
      coverImage: anime?.coverImage?.extraLarge || anime?.coverImage?.large || '',
      bannerImage: anime?.bannerImage || anime?.coverImage?.extraLarge || '',
      description: anime?.description || ''
    }
  ];

  const pantallaDetalle = document.getElementById('pantalla-detalle');
  if (pantallaDetalle) {
    pantallaDetalle.classList.remove('hide');
    pantallaDetalle.scrollTo(0, 0);
  }

  aplicarMetadatosTemporadaUI(anime, anime);
  updateFavoriteButton(anime.id);

  await resolverTemporadasAnime(anime);
  if (onLoadedCallback) onLoadedCallback();
}

const ANILIST_CORE_FIELDS = `
  id
  idMal
  title { romaji english native }
  synonyms
  isAdult
  coverImage { extraLarge large }
  bannerImage
  description(asHtml: false)
  genres
  averageScore
  status
  format
  episodes
  seasonYear
  startDate { year month day }
  nextAiringEpisode { episode timeUntilAiring }
`;

const ANILIST_FRANCHISE_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      ${ANILIST_CORE_FIELDS}
      relations {
        edges {
          relationType
          node {
            ${ANILIST_CORE_FIELDS}
            relations {
              edges {
                relationType
                node {
                  ${ANILIST_CORE_FIELDS}
                }
              }
            }
          }
        }
      }
    }
  }
`;

const ANILIST_FRONTIER_BATCH_QUERY = `
  query ($ids: [Int]) {
    Page(perPage: 25) {
      media(id_in: $ids, type: ANIME) {
        ${ANILIST_CORE_FIELDS}
        relations {
          edges {
            relationType
            node {
              ${ANILIST_CORE_FIELDS}
            }
          }
        }
      }
    }
  }
`;

async function postAniListResilient(bodyObj: Record<string, any>): Promise<any> {
  const payload = JSON.stringify(bodyObj);
  try {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: payload
    });
    if (res.ok) return await res.json();
  } catch {
    // fallback to proxy below
  }
  const proxyRes = await fetch(`/api/proxy?url=${encodeURIComponent(ANILIST_URL)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: payload
  });
  if (!proxyRes.ok) throw new Error('AniList request failed');
  return await proxyRes.json();
}

export async function resolverTemporadasAnime(anime: any): Promise<void> {
  const cacheKey = `anime_franchise_v4_${anime.id}`;
  let cachedOrganized = CacheManager.get(cacheKey);
  const hasStaleReleasingZero =
    Array.isArray(cachedOrganized?.seasons) &&
    cachedOrganized.seasons.some((s: any) => s && s.status === 'RELEASING' && Number(s.totalEpisodes || 0) <= 0);

  if (
    !cachedOrganized ||
    !Array.isArray(cachedOrganized.seasons) ||
    cachedOrganized.seasons.length === 0 ||
    hasStaleReleasingZero
  ) {
    let primaryMedia = anime;
    const collectedRoots: any[] = [];

    try {
      const numericId = Number(anime?.id);
      if (Number.isFinite(numericId) && numericId > 0) {
        const data = await postAniListResilient({ query: ANILIST_FRANCHISE_QUERY, variables: { id: numericId } });
        primaryMedia = data?.data?.Media || anime;
      } else if (anime?.hentailaSlug && nWin.NyAnimeVideoSources?.parseHentaiLaMediaDetail) {
        try {
          const hlaMediaUrl = `https://hentaila.com/media/${encodeURIComponent(String(anime.hentailaSlug))}/__data.json`;
          const hlaRes = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(hlaMediaUrl)}&probe=1`, {}, 3500);
          if (hlaRes.ok) {
            const hlaJson = await hlaRes.json().catch(() => null);
            const detail = nWin.NyAnimeVideoSources.parseHentaiLaMediaDetail(hlaJson);
            if (detail) {
              primaryMedia = {
                ...anime,
                episodes: detail.episodesCount || anime.episodes || 2,
                description: detail.synopsis || anime.description,
                genres: detail.genres?.length ? detail.genres : anime.genres,
                idMal: detail.malId || anime.idMal,
                status: detail.status || anime.status || 'FINISHED',
                format: detail.category || anime.format || 'OVA',
                coverImage: { extraLarge: detail.cover, large: detail.cover },
                bannerImage: detail.backdrop || detail.cover
              };
            }
          }
        } catch {
          // ignore
        }
      }
      if (primaryMedia) {
        if (anime?.hentailaSlug && !primaryMedia.hentailaSlug) {
          primaryMedia.hentailaSlug = anime.hentailaSlug;
        }
        collectedRoots.push(primaryMedia);
        if (state.anime && String(state.anime.id) === String(anime.id)) {
          if (primaryMedia.title && (!state.anime.title?.romaji && !state.anime.title?.english)) {
            state.anime.title = primaryMedia.title;
          }
          if (primaryMedia.format && !state.anime.format) state.anime.format = primaryMedia.format;
          if (primaryMedia.episodes && !state.anime.episodes) state.anime.episodes = primaryMedia.episodes;
          if (primaryMedia.nextAiringEpisode && !state.anime.nextAiringEpisode) {
            state.anime.nextAiringEpisode = primaryMedia.nextAiringEpisode;
          }
          if (primaryMedia.coverImage && !state.anime.coverImage) state.anime.coverImage = primaryMedia.coverImage;
          if (Array.isArray(primaryMedia.synonyms) && primaryMedia.synonyms.length > 0) {
            state.anime.synonyms = primaryMedia.synonyms;
          }
          if (primaryMedia.idMal) state.anime.idMal = primaryMedia.idMal;
          if (primaryMedia.isAdult !== undefined) state.anime.isAdult = primaryMedia.isAdult;
          if (primaryMedia.hentailaSlug) state.anime.hentailaSlug = primaryMedia.hentailaSlug;
          if (primaryMedia.description && (!state.anime.description || String(anime.id).startsWith('hla_'))) {
            state.anime.description = primaryMedia.description;
          }
        }
      }

      const expandedIds = new Set<number | string>();
      if (primaryMedia?.id) expandedIds.add(primaryMedia.id);

      const allowedExpandRels = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF', 'SUMMARY', 'COMPILATION']);
      const validExpandFmts = new Set(['TV', 'TV_SHORT', 'ONA', 'OVA', 'MOVIE', 'SPECIAL']);

      const collectFrontierIds = () => {
        const nextIds = new Set<number | string>();
        const walk = (node: any) => {
          const edges = node?.relations?.edges || [];
          for (const edge of edges) {
            const rel = String(edge?.relationType || '').toUpperCase();
            const t = edge?.node;
            if (!t || !t.id || !allowedExpandRels.has(rel)) continue;
            if (!validExpandFmts.has(String(t.format || '').toUpperCase())) continue;
            const needsReleasingRefresh =
              t.status === 'RELEASING' && !t.nextAiringEpisode?.episode && !expandedIds.has(t.id);
            if (t.relations?.edges && !needsReleasingRefresh) {
              expandedIds.add(t.id);
              walk(t);
            } else if (!expandedIds.has(t.id)) {
              nextIds.add(t.id);
            }
          }
        };
        collectedRoots.forEach(walk);
        return Array.from(nextIds).slice(0, 25);
      };

      for (let hop = 0; hop < 2; hop++) {
        const frontier = collectFrontierIds();
        if (frontier.length === 0) break;
        frontier.forEach((fid) => expandedIds.add(fid));
        const batchJson = await postAniListResilient({
          query: ANILIST_FRONTIER_BATCH_QUERY,
          variables: { ids: frontier }
        });
        const batchMedia = batchJson?.data?.Page?.media || [];
        if (batchMedia.length === 0) break;
        collectedRoots.push(...batchMedia);
      }
    } catch {
      if (collectedRoots.length === 0) collectedRoots.push(anime);
    }

    state.fullMedia = primaryMedia;

    if (nWin.NyAnimeSeasons?.organizeAnimeFranchise) {
      cachedOrganized = nWin.NyAnimeSeasons.organizeAnimeFranchise(collectedRoots, anime.id);
    } else {
      const epsReal = calcularEpisodiosReales(primaryMedia);
      cachedOrganized = {
        seasons: [
          {
            id: primaryMedia.id,
            seasonNumber: 1,
            tier: 'MAIN_SEASON',
            shortTag: 'T1',
            title: primaryMedia.title?.english || primaryMedia.title?.romaji || 'Temporada 1',
            displayLabel: `T1: ${primaryMedia.title?.english || primaryMedia.title?.romaji || 'Temporada 1'}`,
            episodeLabel: `${epsReal} Episodios`,
            format: primaryMedia.format || 'TV',
            status: primaryMedia.status || 'FINISHED',
            totalEpisodes: epsReal,
            isUpcoming: primaryMedia.status === 'NOT_YET_RELEASED',
            coverImage: primaryMedia.coverImage?.extraLarge || primaryMedia.coverImage?.large || '',
            bannerImage: primaryMedia.bannerImage || primaryMedia.coverImage?.extraLarge || '',
            description: primaryMedia.description || ''
          }
        ],
        initialIndex: 0,
        franchiseTitle: primaryMedia.title?.english || primaryMedia.title?.romaji || ''
      };
    }

    if (cachedOrganized.seasons.length > 0) {
      CacheManager.set(cacheKey, cachedOrganized);
    }
  }

  state.seasons = cachedOrganized.seasons || [];
  state.temporadaActualIdx = Math.min(cachedOrganized.initialIndex || 0, Math.max(0, state.seasons.length - 1));
  const activeSeason = state.seasons[state.temporadaActualIdx];
  if (activeSeason) {
    aplicarMetadatosTemporadaUI(activeSeason, state.anime);
    updateFavoriteButton(activeSeason.id || anime.id);
    void cargarAniZipMappingAsync(activeSeason.id);
  } else {
    updateFavoriteButton(anime.id);
  }

  renderTemporadasDropdown();
  renderDetalleEpisodios();
  actualizarBotonContinuarDetalleAnime();
}

export async function cargarAniZipMappingAsync(seasonAnimeId: number | string): Promise<any> {
  if (!seasonAnimeId) return null;
  const cacheKey = `anizip_mapping_${seasonAnimeId}`;
  let mapping = CacheManager.get(cacheKey);
  if (!mapping) {
    try {
      const res = await fetchWithTimeout(
        `https://api.ani.zip/mappings?anilist_id=${seasonAnimeId}`,
        { headers: { Accept: 'application/json' } },
        2500
      );
      if (res.ok) {
        mapping = await res.json();
        CacheManager.set(cacheKey, mapping);
      }
    } catch {
      // ignore network error
    }
  }
  if (mapping && nWin.NyAnimeVideoSources?.extractEpisodeDetailsMap) {
    const metaMap = nWin.NyAnimeVideoSources.extractEpisodeDetailsMap(mapping);
    state.episodeMetaMap = metaMap;

    const currentSeason = state.seasons?.[state.temporadaActualIdx];
    if (currentSeason?.id === seasonAnimeId && state.epActual) {
      const epMeta = metaMap[state.epActual];
      const subEl = document.getElementById('rep-ep-subtitle');
      if (subEl && epMeta?.title) subEl.textContent = `Ep ${state.epActual} · ${epMeta.title}`;
    }

    document.querySelectorAll('#det-episodios .ep-btn').forEach((btnEl) => {
      const btn = btnEl as HTMLElement;
      const epNum = parseInt(btn.textContent || '', 10);
      if (metaMap[epNum]?.title) btn.title = `Episodio ${epNum}: ${metaMap[epNum].title}`;
    });
  }
  return mapping;
}

export function getActiveDetailAnimeEntry(): any {
  const base = state.anime || {};
  const media = state.fullMedia || {};
  const activeSeason = state.seasons?.[state.temporadaActualIdx];
  if (!activeSeason || !activeSeason.id) {
    const rawId = base.id ?? media.id;
    if (!rawId) return null;
    const rawTitle = base.title || media.title || {};
    const coverUrl =
      base.coverImage?.extraLarge ||
      base.coverImage?.large ||
      media.coverImage?.extraLarge ||
      media.coverImage?.large ||
      '';
    const nextEp = Number(base.nextAiringEpisode?.episode || media.nextAiringEpisode?.episode || 0);
    return {
      id: rawId,
      title: {
        romaji: rawTitle.romaji || rawTitle.english || 'Anime',
        english: rawTitle.english || rawTitle.romaji || 'Anime'
      },
      coverImage: {
        extraLarge: coverUrl,
        large: base.coverImage?.large || media.coverImage?.large || coverUrl
      },
      bannerImage: base.bannerImage || media.bannerImage || '',
      format: base.format || media.format || 'TV',
      status: base.status || media.status || 'FINISHED',
      episodes: Number(base.episodes || media.episodes || 0) || null,
      genres: Array.isArray(media.genres) && media.genres.length > 0
        ? media.genres
        : Array.isArray(base.genres)
          ? base.genres
          : [],
      ...(nextEp > 0 ? { nextAiringEpisode: { episode: nextEp } } : {}),
      ...(base.hentailaSlug ? { hentailaSlug: base.hentailaSlug } : {})
    };
  }
  const sameAsBase = String(activeSeason.id) === String(base.id);
  const titleRomaji =
    activeSeason.romaji ||
    (sameAsBase ? base.title?.romaji : '') ||
    activeSeason.title ||
    base.title?.romaji ||
    'Anime';
  const titleEnglish =
    activeSeason.english ||
    (sameAsBase ? base.title?.english : '') ||
    activeSeason.title ||
    titleRomaji;
  const coverUrl =
    activeSeason.coverImage ||
    (sameAsBase ? base.coverImage?.extraLarge || base.coverImage?.large : '') ||
    media.coverImage?.extraLarge ||
    media.coverImage?.large ||
    base.coverImage?.extraLarge ||
    base.coverImage?.large ||
    '';
  const totalEps =
    Number(activeSeason.totalEpisodes || 0) > 0
      ? Number(activeSeason.totalEpisodes)
      : (sameAsBase ? Number(base.episodes || media.episodes || 0) || null : null);
  const nextEp = Number(
    (sameAsBase ? base.nextAiringEpisode?.episode || media.nextAiringEpisode?.episode : 0) || 0
  );

  return {
    id: activeSeason.id,
    title: {
      romaji: titleRomaji,
      english: titleEnglish
    },
    coverImage: {
      extraLarge: coverUrl,
      large: coverUrl
    },
    bannerImage: activeSeason.bannerImage || (sameAsBase ? base.bannerImage : '') || coverUrl,
    format: activeSeason.format || base.format || 'TV',
    status: activeSeason.status || base.status || 'FINISHED',
    episodes: totalEps,
    genres:
      Array.isArray(media.genres) && media.genres.length > 0
        ? media.genres
        : Array.isArray(base.genres)
          ? base.genres
          : [],
    ...(nextEp > 0 ? { nextAiringEpisode: { episode: nextEp } } : {}),
    ...(sameAsBase && base.hentailaSlug ? { hentailaSlug: base.hentailaSlug } : {})
  };
}

function getLibraryCategoryIconSvg(kind: AnimeListStatus | 'add' | 'remove'): string {
  switch (kind) {
    case 'watching':
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    case 'plan_to_watch':
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
    case 'completed':
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m9 12 2 2 4-4"/></svg>';
    case 'on_hold':
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><line x1="10" y1="9" x2="10" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="9" x2="14" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    case 'dropped':
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    case 'remove':
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 6h14M3 12h10M3 18h7m5-2 5 5m0-5-5 5"/></svg>';
    default:
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><line x1="12" y1="8" x2="12" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="11" x2="15" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }
}

export function updateFavoriteButton(id?: number | string): void {
  const targetId = id ?? getActiveDetailAnimeEntry()?.id ?? state.anime?.id;
  if (!targetId) return;
  const btn = document.getElementById('det-fav-btn');
  const isFav = FavoritesManager.isFavorite(targetId);
  if (btn) btn.classList.toggle('favorited', isFav);

  const statusBar = document.getElementById('det-library-status-bar');
  if (!statusBar) return;
  const currentStatus = FavoritesManager.getStatus(targetId);
  const activeMeta = currentStatus ? getCategoryMeta(currentStatus) : null;
  statusBar.classList.toggle('open', libraryMenuOpen);

  const triggerStyle = activeMeta
    ? `background:${activeMeta.bgTint}; border-color:${activeMeta.borderTint}; color:${activeMeta.accentColor};`
    : '';

  statusBar.innerHTML = `
    <button type="button"
            class="det-lib-trigger ${activeMeta ? 'has-status' : ''}"
            id="det-lib-trigger"
            aria-haspopup="menu"
            aria-expanded="${libraryMenuOpen ? 'true' : 'false'}"
            style="${triggerStyle}"
            onclick="toggleDetalleLibraryMenu(event)">
      <span class="det-lib-trigger-left">
        <span class="det-lib-icon">${getLibraryCategoryIconSvg(activeMeta ? activeMeta.id : 'add')}</span>
        <span class="det-lib-trigger-text">${activeMeta ? escHtml(activeMeta.label) : 'Guardar en lista'}</span>
      </span>
      <span class="det-lib-caret" aria-hidden="true">▼</span>
    </button>
    <div class="det-lib-menu" id="det-lib-menu" role="menu" aria-label="Guardar en lista">
      ${
        currentStatus
          ? `
            <button type="button"
                    role="menuitem"
                    class="det-lib-option det-lib-option-remove"
                    onclick="quitarAnimeDetalleDeBiblioteca()">
              <span class="det-lib-icon">${getLibraryCategoryIconSvg('remove')}</span>
              <span class="det-lib-option-label">Quitar</span>
            </button>
            <div class="det-lib-menu-divider" role="separator"></div>
          `
          : ''
      }
      ${ANIME_LIST_CATEGORIES.map((cat) => {
        const active = currentStatus === cat.id;
        return `
          <button type="button"
                  role="menuitemradio"
                  aria-checked="${active ? 'true' : 'false'}"
                  class="det-lib-option ${active ? 'active' : ''}"
                  data-status="${cat.id}"
                  style="${active ? `background:${cat.bgTint};` : ''}"
                  onclick="cambiarCategoriaDetalleAnime('${cat.id}')">
            <span class="det-lib-icon" style="color:${cat.accentColor};">${getLibraryCategoryIconSvg(cat.id)}</span>
            <span class="det-lib-option-label" style="${active ? `color:${cat.accentColor};` : ''}">${escHtml(cat.label)}</span>
            ${active ? `<span class="det-lib-option-check" style="color:${cat.accentColor};" aria-hidden="true">✓</span>` : ''}
          </button>
        `;
      }).join('')}
    </div>
  `;
}

export function toggleDetalleLibraryMenu(event?: Event): void {
  if (event) event.stopPropagation();
  const statusBar = document.getElementById('det-library-status-bar');
  if (!statusBar) return;
  libraryMenuOpen = !libraryMenuOpen;
  if (libraryMenuOpen && state.seasonMenuOpen) {
    state.seasonMenuOpen = false;
    document.getElementById('det-temporadas')?.classList.remove('open');
  }
  statusBar.classList.toggle('open', libraryMenuOpen);
  const trigger = document.getElementById('det-lib-trigger');
  if (trigger) trigger.setAttribute('aria-expanded', libraryMenuOpen ? 'true' : 'false');
}

export function cambiarCategoriaDetalleAnime(status: AnimeListStatus): void {
  const entry = getActiveDetailAnimeEntry();
  libraryMenuOpen = false;
  if (!entry?.id) return;
  const existing = FavoritesManager.getStatus(entry.id);
  if (existing === status) {
    const meta = getCategoryMeta(status);
    showToast(`Ya está en ${meta.label}`);
    updateFavoriteButton(entry.id);
    return;
  }
  FavoritesManager.setStatus(entry, status);
}

export function quitarAnimeDetalleDeBiblioteca(): void {
  const entry = getActiveDetailAnimeEntry();
  libraryMenuOpen = false;
  if (!entry?.id) return;
  FavoritesManager.remove(entry.id);
}

export function toggleFavoriteCurrentAnime(): void {
  const entry = getActiveDetailAnimeEntry();
  if (entry?.id) {
    FavoritesManager.toggle(entry, 'watching');
  }
}

export function toggleEpisodeMarkMode(): void {
  episodeMarkMode = !episodeMarkMode;
  renderDetalleEpisodios();
}

if (!nWin._crunchyOutsideClickBound) {
  nWin._crunchyOutsideClickBound = true;
  document.addEventListener('click', (e) => {
    const target = e.target as Node | null;
    const wrap = document.getElementById('det-temporadas');
    if (wrap && wrap.classList.contains('open') && (!target || !wrap.contains(target))) {
      state.seasonMenuOpen = false;
      wrap.classList.remove('open');
    }
    const libBar = document.getElementById('det-library-status-bar');
    if (libBar && libBar.classList.contains('open') && (!target || !libBar.contains(target))) {
      libraryMenuOpen = false;
      libBar.classList.remove('open');
      document.getElementById('det-lib-trigger')?.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && libraryMenuOpen) {
      libraryMenuOpen = false;
      document.getElementById('det-library-status-bar')?.classList.remove('open');
      document.getElementById('det-lib-trigger')?.setAttribute('aria-expanded', 'false');
    }
  });
}

export function toggleCrunchySeasonMenu(event?: Event): void {
  if (event) event.stopPropagation();
  const wrap = document.getElementById('det-temporadas');
  if (!wrap) return;
  state.seasonMenuOpen = !state.seasonMenuOpen;
  if (state.seasonMenuOpen && libraryMenuOpen) {
    libraryMenuOpen = false;
    document.getElementById('det-library-status-bar')?.classList.remove('open');
    document.getElementById('det-lib-trigger')?.setAttribute('aria-expanded', 'false');
  }
  wrap.classList.toggle('open', state.seasonMenuOpen);
  if (state.seasonMenuOpen) {
    const activeOpt = wrap.querySelector('.crunchy-season-option.active');
    if (activeOpt) activeOpt.scrollIntoView({ block: 'nearest' });
  }
}

export function seleccionarTemporadaDetalle(idx: number): void {
  if (!state.seasons || !state.seasons[idx]) return;
  state.temporadaActualIdx = idx;
  state.rangoActualIdx = 0;
  state.seasonMenuOpen = false;
  libraryMenuOpen = false;
  state.episodeMetaMap = {};
  const selected = state.seasons[idx];
  aplicarMetadatosTemporadaUI(selected, state.anime);
  updateFavoriteButton(selected.id || state.anime?.id);
  renderTemporadasDropdown();
  renderDetalleEpisodios();
  actualizarBotonContinuarDetalleAnime();
  void cargarAniZipMappingAsync(selected.id);
}

export function renderTemporadasDropdown(): void {
  const container = document.getElementById('det-temporadas');
  if (!container) return;
  container.innerHTML = '';
  container.classList.toggle('open', Boolean(state.seasonMenuOpen));

  if (!state.seasons || state.seasons.length <= 1) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  const current = state.seasons[state.temporadaActualIdx] || state.seasons[0];

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'crunchy-season-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', state.seasonMenuOpen ? 'true' : 'false');
  trigger.onclick = toggleCrunchySeasonMenu;
  trigger.innerHTML = `
    <span class="crunchy-season-trigger-left">
      <span class="crunchy-season-caret">▼</span>
      <span class="crunchy-season-badge">${escHtml(current.shortTag || `T${current.seasonNumber || 1}`)}</span>
      <span class="crunchy-season-trigger-title">${escHtml(current.title)}</span>
    </span>
    <span class="crunchy-season-epcount">${escHtml(current.episodeLabel || `${current.totalEpisodes} Episodios`)}</span>
  `;
  container.appendChild(trigger);

  const menu = document.createElement('div');
  menu.className = 'crunchy-season-menu';
  menu.setAttribute('role', 'listbox');

  const mainSeasons: { s: any; idx: number }[] = [];
  const extraEntries: { s: any; idx: number }[] = [];
  state.seasons.forEach((s, idx) => {
    if (!s.tier || s.tier === 'MAIN_SEASON') mainSeasons.push({ s, idx });
    else extraEntries.push({ s, idx });
  });

  const appendGroupHeader = (labelText: string) => {
    const hdr = document.createElement('div');
    hdr.className = 'crunchy-season-group-label';
    hdr.textContent = labelText;
    menu.appendChild(hdr);
  };

  const appendOption = (s: any, idx: number) => {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = `crunchy-season-option ${idx === state.temporadaActualIdx ? 'active' : ''}`;
    opt.setAttribute('role', 'option');
    opt.setAttribute('aria-selected', idx === state.temporadaActualIdx ? 'true' : 'false');
    opt.onclick = (ev) => {
      ev.stopPropagation();
      seleccionarTemporadaDetalle(idx);
    };
    opt.innerHTML = `
      <span class="crunchy-season-option-left">
        <span class="crunchy-season-badge">${escHtml(s.shortTag || `T${s.seasonNumber || 1}`)}</span>
        <span class="crunchy-season-option-title">${escHtml(s.title)}</span>
      </span>
      <span class="crunchy-season-epcount">${escHtml(s.episodeLabel || `${s.totalEpisodes} Episodios`)}</span>
    `;
    menu.appendChild(opt);
  };

  if (mainSeasons.length > 0 && extraEntries.length > 0) {
    appendGroupHeader('Temporadas');
  }
  mainSeasons.forEach(({ s, idx }) => appendOption(s, idx));

  if (extraEntries.length > 0) {
    appendGroupHeader('Películas, OVAs y Especiales');
    extraEntries.forEach(({ s, idx }) => appendOption(s, idx));
  }

  container.appendChild(menu);
}

export function renderTemporadasChips(): void {
  renderTemporadasDropdown();
}

export function renderDetalleEpisodios(): void {
  const season = state.seasons[state.temporadaActualIdx] || state.seasons[0];
  const epContainer = document.getElementById('det-episodios');
  const countEl = document.getElementById('det-count');
  const headerTitle = document.getElementById('det-header-title');
  const rangosContainer = document.getElementById('det-rangos');
  const dlBtn = document.querySelector('#pantalla-detalle .btn-download-season') as HTMLElement | null;
  const markModeBtn = document.getElementById('det-mark-mode-btn') as HTMLButtonElement | null;
  const markHint = document.getElementById('det-mark-hint') as HTMLElement | null;

  if (!epContainer || !rangosContainer) return;
  epContainer.innerHTML = '';
  rangosContainer.innerHTML = '';
  if (!season) return;

  if (countEl) countEl.innerText = season.episodeLabel || `${season.totalEpisodes} Episodios`;
  if (headerTitle) headerTitle.innerText = season.title || 'Episodios';
  if (dlBtn) dlBtn.style.display = season.totalEpisodes > 0 ? 'flex' : 'none';
  if (markModeBtn) {
    markModeBtn.style.display = season.totalEpisodes > 0 ? 'inline-flex' : 'none';
    markModeBtn.classList.toggle('active', episodeMarkMode);
    markModeBtn.textContent = episodeMarkMode ? '✓ Listo' : '✓ Marcar vistos';
  }
  if (markHint) {
    markHint.classList.toggle('hide', !episodeMarkMode || season.totalEpisodes <= 0);
  }

  if (season.isUpcoming || season.totalEpisodes === 0) {
    epContainer.innerHTML = season.isUpcoming
      ? '<div style="grid-column: 1/-1; text-align:center; color:#cbd5e1; padding:18px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px;">🗓️ Estreno programado · Próximamente disponible para ver.</div>'
      : '<div style="grid-column: 1/-1; text-align:center; color:var(--text-muted); padding:15px;">Aún no se han emitido episodios para este título.</div>';
    return;
  }

  const total = Number(season.totalEpisodes || 0);
  if (total > 60) {
    rangosContainer.style.display = 'flex';
    const numRangos = Math.ceil(total / 50);
    for (let r = 0; r < numRangos; r++) {
      const rStart = r * 50 + 1;
      const rEnd = Math.min((r + 1) * 50, total);
      const rChip = document.createElement('div');
      rChip.className = `range-chip ${r === state.rangoActualIdx ? 'active' : ''}`;
      rChip.textContent = `${rStart} - ${rEnd}`;
      rChip.onclick = () => {
        state.rangoActualIdx = r;
        renderDetalleEpisodios();
      };
      rangosContainer.appendChild(rChip);
    }
  } else {
    rangosContainer.style.display = 'none';
  }

  const startEp = total > 60 ? state.rangoActualIdx * 50 + 1 : 1;
  const endEp = total > 60 ? Math.min((state.rangoActualIdx + 1) * 50, total) : total;
  const watchedSet = AnimeWatchedManager.getWatchedSet(season.id);

  for (let i = startEp; i <= endEp; i++) {
    const isWatched = watchedSet.has(i);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ep-btn ${isWatched ? 'watched' : ''} ${episodeMarkMode ? 'mark-mode' : ''}`;
    btn.dataset.ep = String(i);
    btn.innerText = String(i);
    if (state.episodeMetaMap?.[i]?.title) {
      btn.title = `Episodio ${i}: ${state.episodeMetaMap[i].title}`;
    }
    btn.onclick = () => {
      if (episodeMarkMode) {
        AnimeWatchedManager.markWatched(season.id, i, !isWatched, {
          totalEpisodes: Number(season.totalEpisodes || state.anime?.episodes || 0)
        });
        renderDetalleEpisodios();
      } else {
        nWin.abrirReproductor?.(i);
      }
    };
    epContainer.appendChild(btn);
  }
  actualizarBotonContinuarDetalleAnime();

  if (nWin.NyAnimeOffline?.getOfflineEpisodesForAnime) {
    const targetSeasonId = season.id;
    const targetSeasonNum = Number(season.seasonNumber || 1);
    void nWin.NyAnimeOffline.getOfflineEpisodesForAnime(targetSeasonId, targetSeasonNum).then((offlineEps: Set<number>) => {
      if (!offlineEps || offlineEps.size === 0) return;
      document.querySelectorAll('#det-episodios .ep-btn').forEach((btnEl) => {
        const epNum = Number((btnEl as HTMLElement).dataset.ep || '0');
        if (offlineEps.has(epNum)) {
          btnEl.classList.add('offline-cached');
          const curTitle = (btnEl as HTMLElement).title;
          if (!curTitle.includes('Disponible offline')) {
            (btnEl as HTMLElement).title = curTitle ? `${curTitle} · Disponible offline` : `Episodio ${epNum} · Disponible offline`;
          }
        }
      });
    }).catch(() => {});
  }
}

export function cerrarDetalle(): void {
  state.seasonMenuOpen = false;
  libraryMenuOpen = false;
  document.getElementById('det-temporadas')?.classList.remove('open');
  document.getElementById('det-library-status-bar')?.classList.remove('open');
  document.getElementById('pantalla-detalle')?.classList.add('hide');
}

function getCleanBaseTitleForFilename(rawTitle: string): string {
  return String(rawTitle || 'Anime')
    .replace(/\b(?:2nd|3rd|4th|5th|\d+th)\s+season\b/gi, '')
    .replace(/\bseason\s+\d+\b/gi, '')
    .replace(/\btemporada\s+\d+\b/gi, '')
    .replace(/[:\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function actualizarResumenSeleccionDescarga(): void {
  const checkedBoxes = document.querySelectorAll('#descarga-ep-list .cb-dl-ep:checked');
  const count = checkedBoxes.length;
  const total = dlModalTotalEpisodes || document.querySelectorAll('#descarga-ep-list .cb-dl-ep').length;

  const badgeEl = document.getElementById('dl-selection-summary');
  if (badgeEl) {
    badgeEl.textContent = `${count} de ${total} seleccionados`;
  }

  const audioEl = document.getElementById('select-audio-descarga') as HTMLSelectElement | null;
  const qualityEl = document.getElementById('select-calidad-descarga') as HTMLSelectElement | null;
  const destEl = document.getElementById('select-destino-descarga') as HTMLSelectElement | null;
  const audioLabel = audioEl?.value === 'DUB' ? 'Audio Latino' : 'Sub Español';
  const qualityLabel = qualityEl?.value === '720p' ? '720p' : '1080p';
  const destLabel = destEl?.value === 'cache' ? 'Solo app' : 'Offline + .MP4';

  const footerSum = document.getElementById('dl-footer-summary');
  if (footerSum) {
    footerSum.textContent = count > 0
      ? `${count} ${count === 1 ? 'episodio' : 'episodios'} · ${qualityLabel} · ${audioLabel} · ${destLabel}`
      : 'Ningún episodio seleccionado';
  }

  const startBtn = document.getElementById('btn-start-season-dl') as HTMLButtonElement | null;
  if (startBtn && !seasonDownloadAbortCtrl) {
    startBtn.disabled = count === 0;
    startBtn.textContent = count > 0
      ? `Descargar ${count} ${count === 1 ? 'episodio' : 'episodios'}`
      : 'Selecciona episodios';
  }

  document.querySelectorAll('#descarga-ep-list .dl-ep-card').forEach((card) => {
    const cb = card.querySelector('.cb-dl-ep') as HTMLInputElement | null;
    card.classList.toggle('selected', Boolean(cb?.checked));
  });
}

function setEpisodeCardDownloadState(ep: number, text: string, tone: 'idle' | 'active' | 'done' | 'warn' | 'error'): void {
  const card = document.querySelector(`#descarga-ep-list .dl-ep-card[data-ep="${ep}"]`) as HTMLElement | null;
  const stateEl = card?.querySelector('.dl-ep-live-state') as HTMLElement | null;
  if (!card || !stateEl) return;
  stateEl.textContent = text;
  stateEl.className = `dl-ep-live-state ${tone}`;
}

export async function abrirModalDescargaTemporada(): Promise<void> {
  ensureModalsMounted();
  const season = state.seasons?.[state.temporadaActualIdx] || {
    id: state.anime?.id || 0,
    seasonNumber: 1,
    shortTag: 'T1',
    title: state.anime?.title?.english || state.anime?.title?.romaji || 'Temporada 1',
    coverImage: state.anime?.coverImage?.large || state.anime?.coverImage?.extraLarge || '',
    totalEpisodes: calcularEpisodiosReales(state.anime) || 1
  };
  const seasonTitle =
    season.title ||
    season.english ||
    season.romaji ||
    state.anime?.title?.english ||
    state.anime?.title?.romaji ||
    'Anime';
  const shortTag = season.shortTag || `T${season.seasonNumber || 1}`;
  const total = Math.max(1, Number(season.totalEpisodes || 1));
  dlModalTotalEpisodes = total;

  dlModalWatchedSet = AnimeWatchedManager.getWatchedSet(season.id || state.anime?.id || 0);
  dlModalOfflineSet = nWin.NyAnimeOffline?.getOfflineEpisodesForAnime
    ? await nWin.NyAnimeOffline.getOfflineEpisodesForAnime(season.id || state.anime?.id || 0, Number(season.seasonNumber || 1))
    : new Set<number>();

  const coverUrl =
    season.coverImage ||
    state.anime?.coverImage?.large ||
    state.anime?.coverImage?.extraLarge ||
    '';
  const coverEl = document.getElementById('dl-series-cover') as HTMLImageElement | null;
  if (coverEl) {
    if (coverUrl) {
      coverEl.src = coverUrl;
      coverEl.alt = seasonTitle;
      coverEl.classList.remove('hide');
    } else {
      coverEl.classList.add('hide');
    }
  }

  const titleEl = document.getElementById('descarga-temporada-title');
  if (titleEl) titleEl.textContent = seasonTitle;

  const infoEl = document.getElementById('descarga-temporada-info');
  if (infoEl) {
    const watchedCount = dlModalWatchedSet.size;
    const offlineCount = dlModalOfflineSet.size;
    infoEl.textContent = `${shortTag} · ${total} ${total === 1 ? 'episodio' : 'episodios'} · ${watchedCount} vistos · ${offlineCount} offline`;
  }

  const audioEl = document.getElementById('select-audio-descarga') as HTMLSelectElement | null;
  if (audioEl) audioEl.value = state.modoAudio === 'DUB' ? 'DUB' : 'SUB';

  const filterInput = document.getElementById('dl-ep-filter-input') as HTMLInputElement | null;
  if (filterInput) filterInput.value = '';

  const progBox = document.getElementById('season-dl-progress-box');
  if (progBox) progBox.classList.add('hide');

  const rangesContainer = document.getElementById('dl-range-chips');
  if (rangesContainer) {
    const ranges = buildSeasonEpisodeRanges(total);
    if (ranges.length > 0) {
      rangesContainer.classList.remove('hide');
      rangesContainer.innerHTML = ranges
        .map(
          (r) =>
            `<button type="button" class="dl-range-btn" onclick="seleccionarRangoDescarga(${r.start}, ${r.end})">${escHtml(r.label)}</button>`
        )
        .join('');
    } else {
      rangesContainer.classList.add('hide');
      rangesContainer.innerHTML = '';
    }
  }

  const defaultSelected =
    dlModalOfflineSet.size > 0 && dlModalOfflineSet.size < total
      ? computeEpisodeSelectionByMode({
          totalEpisodes: total,
          mode: 'not-downloaded',
          watchedEpisodes: dlModalWatchedSet,
          offlineEpisodes: dlModalOfflineSet
        })
      : computeEpisodeSelectionByMode({
          totalEpisodes: total,
          mode: 'all',
          watchedEpisodes: dlModalWatchedSet,
          offlineEpisodes: dlModalOfflineSet
        });

  document.querySelectorAll('#modal-descarga-temporada .dl-tool-btn').forEach((btn) => {
    const mode = (btn as HTMLElement).dataset.dlMode;
    btn.classList.toggle(
      'active',
      dlModalOfflineSet.size > 0 && dlModalOfflineSet.size < total ? mode === 'not-downloaded' : mode === 'all'
    );
  });

  const listContainer = document.getElementById('descarga-ep-list');
  if (!listContainer) return;

  const cardsHtml: string[] = [];
  for (let i = 1; i <= total; i++) {
    const isChecked = defaultSelected.has(i);
    const isWatched = dlModalWatchedSet.has(i);
    const isOffline = dlModalOfflineSet.has(i);
    const statusParts: string[] = [];
    if (isOffline) statusParts.push('Offline');
    if (isWatched) statusParts.push('Visto');
    const subText = statusParts.length > 0 ? statusParts.join(' · ') : 'Disponible';
    const epMetaTitle = state.episodeMetaMap?.[i]?.title ? ` title="${escHtml(state.episodeMetaMap[i].title)}"` : '';

    cardsHtml.push(`
      <label class="dl-ep-card ${isChecked ? 'selected' : ''} ${isOffline ? 'is-offline' : ''}" data-ep="${i}"${epMetaTitle}>
        <div class="dl-ep-card-top">
          <span class="dl-ep-num tabular-nums">Ep. ${i}</span>
          <input type="checkbox" class="cb-dl-ep" value="${i}" ${isChecked ? 'checked' : ''} onchange="actualizarResumenSeleccionDescarga()">
        </div>
        <div class="dl-ep-live-state ${isOffline ? 'done' : 'idle'}">${subText}</div>
      </label>
    `);
  }
  listContainer.innerHTML = cardsHtml.join('');

  actualizarResumenSeleccionDescarga();
  document.getElementById('modal-descarga-temporada')?.classList.add('active');
}

export function cancelarDescargaTemporada(): void {
  if (seasonDownloadAbortCtrl) {
    seasonDownloadAbortCtrl.abort();
    seasonDownloadAbortCtrl = null;
  }
  const progBox = document.getElementById('season-dl-progress-box');
  if (progBox) progBox.classList.add('hide');
  actualizarResumenSeleccionDescarga();
  showToast('Descarga de episodios cancelada.');
}

export function toggleTodosEpisodiosDescarga(check: boolean): void {
  aplicarFiltroDescargaEpisodios(check ? 'all' : 'none');
}

export function aplicarFiltroDescargaEpisodios(mode: DownloadPickerFilterMode): void {
  const selection = computeEpisodeSelectionByMode({
    totalEpisodes: dlModalTotalEpisodes || document.querySelectorAll('#descarga-ep-list .cb-dl-ep').length,
    mode,
    watchedEpisodes: dlModalWatchedSet,
    offlineEpisodes: dlModalOfflineSet
  });

  document.querySelectorAll('#descarga-ep-list .cb-dl-ep').forEach((el) => {
    const cb = el as HTMLInputElement;
    const epNum = parseInt(cb.value, 10);
    cb.checked = selection.has(epNum);
  });

  document.querySelectorAll('#modal-descarga-temporada .dl-tool-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.dlMode === mode);
  });
  document.querySelectorAll('#dl-range-chips .dl-range-btn').forEach((btn) => btn.classList.remove('active'));

  actualizarResumenSeleccionDescarga();
}

export function seleccionarRangoDescarga(start: number, end: number): void {
  document.querySelectorAll('#descarga-ep-list .cb-dl-ep').forEach((el) => {
    const cb = el as HTMLInputElement;
    const epNum = parseInt(cb.value, 10);
    cb.checked = epNum >= start && epNum <= end;
  });

  document.querySelectorAll('#modal-descarga-temporada .dl-tool-btn').forEach((btn) => btn.classList.remove('active'));
  document.querySelectorAll('#dl-range-chips .dl-range-btn').forEach((btn) => {
    const label = start === end ? `Ep. ${start}` : `${start}–${end}`;
    btn.classList.toggle('active', btn.textContent?.trim() === label);
  });

  const firstCard = document.querySelector(`#descarga-ep-list .dl-ep-card[data-ep="${start}"]`);
  firstCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  actualizarResumenSeleccionDescarga();
}

export function filtrarListaEpisodiosDescarga(rawQuery: string): void {
  const needle = String(rawQuery || '').trim().toLowerCase();
  document.querySelectorAll('#descarga-ep-list .dl-ep-card').forEach((card) => {
    const el = card as HTMLElement;
    const ep = el.dataset.ep || '';
    const title = (el.title || '').toLowerCase();
    const visible = !needle || ep.includes(needle) || title.includes(needle);
    el.classList.toggle('hide', !visible);
  });
}

export async function iniciarDescargaLote(): Promise<void> {
  const selected = Array.from(document.querySelectorAll('#descarga-ep-list .cb-dl-ep:checked')).map((el) =>
    parseInt((el as HTMLInputElement).value, 10)
  );
  if (selected.length === 0) {
    showToast('Selecciona al menos un episodio.');
    return;
  }

  const season = state.seasons?.[state.temporadaActualIdx] || {
    id: state.anime?.id || 0,
    seasonNumber: 1,
    title: state.anime?.title?.english || state.anime?.title?.romaji || 'Anime',
    coverImage: state.anime?.coverImage?.large || state.anime?.coverImage?.extraLarge || ''
  };
  const seasonNum = Number(season.seasonNumber || 1);
  const seasonTitle =
    season.title ||
    season.english ||
    season.romaji ||
    state.anime?.title?.english ||
    state.anime?.title?.romaji ||
    'Anime';
  const cleanSeriesTitle = getCleanBaseTitleForFilename(seasonTitle);
  const seasonId = season.id || state.anime?.id || 0;
  const coverUrl =
    season.coverImage ||
    state.anime?.coverImage?.large ||
    state.anime?.coverImage?.extraLarge ||
    '';

  const qualityEl = document.getElementById('select-calidad-descarga') as HTMLSelectElement | null;
  const audioEl = document.getElementById('select-audio-descarga') as HTMLSelectElement | null;
  const destEl = document.getElementById('select-destino-descarga') as HTMLSelectElement | null;

  const quality = qualityEl?.value || '1080p';
  const preferredAudio = (audioEl?.value === 'DUB' ? 'DUB' : 'SUB') as 'SUB' | 'DUB';
  const saveFileToDisk = destEl?.value !== 'cache';

  const baseSlug = seasonTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const progBox = document.getElementById('season-dl-progress-box');
  const progText = document.getElementById('season-dl-progress-text');
  const progPctEl = document.getElementById('season-dl-progress-pct');
  const progBar = document.getElementById('season-dl-progress-bar') as HTMLElement | null;
  const startBtn = document.getElementById('btn-start-season-dl') as HTMLButtonElement | null;

  if (seasonDownloadAbortCtrl) {
    seasonDownloadAbortCtrl.abort();
  }
  seasonDownloadAbortCtrl = new AbortController();
  const signal = seasonDownloadAbortCtrl.signal;

  selected.forEach((ep) => setEpisodeCardDownloadState(ep, 'En cola', 'idle'));
  if (progBox) progBox.classList.remove('hide');
  if (progPctEl) progPctEl.textContent = '0%';
  if (progBar) progBar.style.width = '0%';
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = `Descargando (${selected.length})...`;
  }

  let mp4Count = 0;
  let queuedCount = 0;

  try {
    for (let idx = 0; idx < selected.length; idx += 1) {
      if (signal.aborted) break;
      const ep = selected[idx];
      const basePct = Math.round((idx / selected.length) * 100);
      setEpisodeCardDownloadState(ep, 'Resolviendo...', 'active');
      if (progText) {
        progText.textContent = `Resolviendo T${seasonNum} · Ep. ${ep} (${idx + 1}/${selected.length})...`;
      }
      if (progPctEl) progPctEl.textContent = `${basePct}%`;
      if (progBar) progBar.style.width = `${basePct}%`;

      let fallbackUrl = `https://animeav1.com/media/${baseSlug}/${ep}`;
      let mp4Candidates: any[] = [];

      try {
        const ctx = await resolverContextoEpisodio(ep);
        const raw = await videoSourceManager.fetchRawSources(ctx);
        const ranked = videoSourceManager.rankRawSources(raw, preferredAudio);
        if (ranked[0]?.url) fallbackUrl = ranked[0].url;

        mp4Candidates = ranked.filter(
          (f) =>
            f &&
            f.url &&
            (f.url.includes('mp4upload.com') || f.url.includes('yourupload.com') || /\.(mp4|webm)(\?|$)/i.test(f.url))
        );
      } catch {
        // fallback to queue if resolution fails
      }

      if (signal.aborted) break;

      const rawFilename = `${cleanSeriesTitle}_T${seasonNum}_Ep_${ep}.mp4`;
      let downloadedMp4 = false;

      if (nWin.NyAnimeOffline?.downloadAnimeEpisodeOrQueue) {
        for (const cand of mp4Candidates) {
          if (signal.aborted) break;
          try {
            const extracted = await StreamExtractor.extract(cand.url);
            if (!extracted || extracted.type !== 'mp4' || !extracted.streamUrl) continue;

            const res = await nWin.NyAnimeOffline.downloadAnimeEpisodeOrQueue({
              animeId: seasonId,
              animeTitle: seasonTitle,
              cover: coverUrl,
              season: seasonNum,
              episode: ep,
              quality,
              directStreamUrl: extracted.streamUrl,
              fallbackWebUrl: fallbackUrl,
              saveToDeviceFilename: saveFileToDisk ? rawFilename : undefined,
              signal,
              onProgress: (pct: number, loadedBytes: number) => {
                const overall = Math.min(100, Math.round(((idx + pct / 100) / selected.length) * 100));
                const mb = (loadedBytes / (1024 * 1024)).toFixed(1);
                setEpisodeCardDownloadState(ep, `${pct}% · ${mb} MB`, 'active');
                if (progText) {
                  progText.textContent = `Descargando T${seasonNum} · Ep. ${ep} (${idx + 1}/${selected.length}) · ${mb} MB`;
                }
                if (progPctEl) progPctEl.textContent = `${overall}%`;
                if (progBar) progBar.style.width = `${overall}%`;
              }
            });
            if (res.kind === 'anime-video') {
              mp4Count += 1;
              downloadedMp4 = true;
              dlModalOfflineSet.add(ep);
              setEpisodeCardDownloadState(ep, 'Offline .MP4', 'done');
              break;
            }
          } catch (candErr: any) {
            if (candErr?.name === 'AbortError' || signal.aborted) throw candErr;
            // Try next MP4 mirror candidate if this server failed or returned HTML
          }
        }

        if (!downloadedMp4 && !signal.aborted) {
          const res = await nWin.NyAnimeOffline.downloadAnimeEpisodeOrQueue({
            animeId: seasonId,
            animeTitle: seasonTitle,
            cover: coverUrl,
            season: seasonNum,
            episode: ep,
            quality,
            directStreamUrl: null,
            fallbackWebUrl: fallbackUrl,
            signal
          });
          if (res.kind === 'anime-video') {
            mp4Count += 1;
            dlModalOfflineSet.add(ep);
            setEpisodeCardDownloadState(ep, 'Offline .MP4', 'done');
          } else {
            queuedCount += 1;
            setEpisodeCardDownloadState(ep, 'Ver luego', 'warn');
          }
        }
      }
    }

    if (!signal.aborted) {
      if (progBar) progBar.style.width = '100%';
      if (progPctEl) progPctEl.textContent = '100%';
      await DownloadManager.updateBadge();
      renderDetalleEpisodios();
      cerrarModales();
      if (mp4Count > 0) {
        showToast(
          `${mp4Count} episodio(s) guardados en modo offline${saveFileToDisk ? ' y descargados (.MP4)' : ''}${queuedCount > 0 ? ` (+${queuedCount} en Ver Luego)` : ''}.`
        );
      } else {
        showToast(`${queuedCount} episodio(s) guardados en "Ver Luego".`);
      }
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      showToast(`Error en descarga por lote: ${err?.message || err}`);
    }
  } finally {
    seasonDownloadAbortCtrl = null;
    if (progBox) progBox.classList.add('hide');
    actualizarResumenSeleccionDescarga();
  }
}

