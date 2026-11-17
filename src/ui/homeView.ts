import {
  ANILIST_URL,
  type AnimeListStatus,
  AnimeWatchedManager,
  CacheManager,
  FavoritesManager,
  HistoryManager,
  MangaFavoritesManager,
  cambiarTab,
  escHtml,
  generarPortadaSVG,
  nWin,
  safeImg,
  showToast,
  state,
  uiHooks
} from './appState.ts';
import { computeProgressPercent, formatPlaybackTime } from '../utils/playerResume.ts';
import { ANIME_LIST_CATEGORIES, countWatchedForAnime, getCategoryMeta } from '../utils/profileStats.ts';
import { rankSmartCandidates, selectSmartRecommendationSeeds } from '../utils/libraryEnhancements.ts';
import { AniListMangaService } from './mangaCatalogView.ts';
import {
  HENTAILA_GENRES,
  JKANIME_FILTER_CONFIG,
  JKANIME_GENRES,
  JKANIME_QUICK_GENRE_IDS,
  SearchDirectoryFilters,
  buildHentaiLaCatalogUrl,
  countActiveDirectoryFilters,
  createDefaultDirectoryFilters,
  filterMediaByLetter,
  getSupportedYears,
  hasActiveDirectoryFilters,
  mapDirectoryFiltersToAniListVariables
} from '../utils/directoryFilters.ts';
import {
  HentaiLaCatalogItem,
  normalizeSlugText,
  parseHentaiLaCatalogData
} from '../utils/animeSources.ts';

export async function cargarCatalogoHome(): Promise<void> {
  const cacheKey = 'home_catalog_v3';
  const cached = CacheManager.get(cacheKey);
  if (cached) {
    renderHomeContent(cached);
    return;
  }

  const query = `
    query {
      trending: Page(perPage: 10) {
        media(sort: TRENDING_DESC, type: ANIME) { ...AnimeData }
      }
      popular: Page(perPage: 12) {
        media(sort: POPULARITY_DESC, type: ANIME) { ...AnimeData }
      }
      releasing: Page(perPage: 12) {
        media(status: RELEASING, sort: POPULARITY_DESC, type: ANIME) { ...AnimeData }
      }
    }
    fragment AnimeData on Media {
      id
      idMal
      title { romaji english native }
      coverImage { extraLarge large color }
      bannerImage
      episodes
      format
      status
      averageScore
      genres
      description
      nextAiringEpisode { episode timeUntilAiring airingAt }
    }
  `;

  try {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await res.json();
    if (data?.data) {
      CacheManager.set(cacheKey, data.data);
      renderHomeContent(data.data);
    }
  } catch (err) {
    console.error('Error al cargar catálogo:', err);
    void renderSmartRecommendations();
  }
}

export function renderHomeContent(data: any): void {
  if (data.trending?.media?.length > 0) {
    renderHero(data.trending.media[0]);
    renderHScroll('lista-tendencias', data.trending.media);
  }
  if (data.popular?.media) renderHScroll('lista-populares', data.popular.media);
  if (data.releasing?.media) renderHScroll('lista-emision', data.releasing.media);
  void renderSmartRecommendations();
}

export async function renderSmartRecommendations(): Promise<void> {
  const secBecause = document.getElementById('section-reco-because');
  const titleBecause = document.getElementById('reco-because-title');
  const listBecause = document.getElementById('lista-reco-because');
  const secLibrary = document.getElementById('section-reco-library');
  const listLibrary = document.getElementById('lista-reco-library');
  if (!secBecause || !listBecause || !secLibrary || !listLibrary) return;

  const animes = FavoritesManager.getAll();
  const history = HistoryManager.getAll();
  const seeds = selectSmartRecommendationSeeds(animes, history);

  if (!seeds.becauseOfAnime && seeds.topGenres.length === 0) {
    secBecause.classList.add('hide');
    secLibrary.classList.add('hide');
    listBecause.innerHTML = '';
    listLibrary.innerHTML = '';
    return;
  }

  const poolMap = new Map<string, any>();
  const homeCached = CacheManager.get('home_catalog_v3') || CacheManager.get('home_catalog_v2');
  for (const lst of [homeCached?.trending?.media, homeCached?.popular?.media, homeCached?.releasing?.media]) {
    if (Array.isArray(lst)) {
      for (const m of lst) {
        if (m?.id) poolMap.set(String(m.id), m);
      }
    }
  }
  for (const m of FALLBACK_ANIME_DIRECTORY_CATALOG) {
    if (m?.id && !m.isAdult && !poolMap.has(String(m.id))) {
      poolMap.set(String(m.id), m);
    }
  }

  let becauseItems: any[] = [];
  const seed = seeds.becauseOfAnime;
  const numericSeedId = seed ? Number(seed.id) : 0;

  if (seed && Number.isFinite(numericSeedId) && numericSeedId > 0) {
    const recoCacheKey = `smart_reco_seed_v1_${numericSeedId}`;
    let cachedRecos = CacheManager.get(recoCacheKey);
    if (!Array.isArray(cachedRecos)) {
      const recoQuery = `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            recommendations(perPage: 14, sort: RATING_DESC) {
              nodes {
                mediaRecommendation {
                  id
                  idMal
                  title { romaji english native }
                  coverImage { extraLarge large color }
                  bannerImage
                  episodes
                  format
                  status
                  averageScore
                  genres
                  description
                  nextAiringEpisode { episode timeUntilAiring airingAt }
                }
              }
            }
          }
        }
      `;
      const payload = JSON.stringify({ query: recoQuery, variables: { id: numericSeedId } });
      try {
        let json: any = null;
        try {
          const pRes = await fetch(`/api/proxy?url=${encodeURIComponent(ANILIST_URL)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: payload
          });
          if (pRes.ok) json = await pRes.json();
        } catch {
          // try direct
        }
        if (!json?.data) {
          const dRes = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: payload
          });
          if (dRes.ok) json = await dRes.json();
        }
        const nodes = json?.data?.Media?.recommendations?.nodes || [];
        cachedRecos = nodes
          .map((n: any) => n?.mediaRecommendation)
          .filter((m: any) => m && m.id && !m.isAdult);
        if (cachedRecos.length > 0) {
          CacheManager.set(recoCacheKey, cachedRecos);
        }
      } catch {
        cachedRecos = [];
      }
    }

    if (Array.isArray(cachedRecos) && cachedRecos.length > 0) {
      becauseItems = cachedRecos.filter((m: any) => !seeds.excludedIds.has(String(m.id))).slice(0, 12);
    }
  }

  if (becauseItems.length === 0) {
    becauseItems = rankSmartCandidates(Array.from(poolMap.values()), seeds.topGenres, seeds.excludedIds, 10);
  }

  if (becauseItems.length > 0 && seed) {
    if (titleBecause) {
      titleBecause.textContent = `Porque viste ${seed.title}`;
    }
    secBecause.classList.remove('hide');
    renderHScroll('lista-reco-because', becauseItems);
  } else {
    secBecause.classList.add('hide');
    listBecause.innerHTML = '';
  }

  const excludedForLibrary = new Set<string>(seeds.excludedIds);
  becauseItems.forEach((m) => {
    if (m?.id) excludedForLibrary.add(String(m.id));
  });
  const libraryItems = rankSmartCandidates(
    Array.from(poolMap.values()),
    seeds.topGenres,
    excludedForLibrary,
    12
  );
  if (libraryItems.length > 0) {
    secLibrary.classList.remove('hide');
    renderHScroll('lista-reco-library', libraryItems);
  } else {
    secLibrary.classList.add('hide');
    listLibrary.innerHTML = '';
  }

  // Keep nWin reference non-tree-shaken for optional debug hooks
  if (nWin && !nWin.renderSmartRecommendations) {
    nWin.renderSmartRecommendations = renderSmartRecommendations;
  }
}

export function renderHero(anime: any): void {
  const container = document.getElementById('hero-container');
  if (!container) return;
  const title = escHtml(anime.title?.english || anime.title?.romaji);
  const img = escHtml(safeImg(anime.bannerImage || anime.coverImage?.extraLarge));
  const genre = escHtml(anime.genres?.[0] || 'Anime');
  container.innerHTML = `
    <div class="hero-card fade-in" id="hero-featured-card">
      <img src="${img}" alt="${title}">
      <div class="hero-overlay">
        <div class="hero-tag">🔥 ${genre}</div>
        <div class="hero-title">${title}</div>
      </div>
    </div>
  `;
  const heroEl = document.getElementById('hero-featured-card');
  if (heroEl) heroEl.onclick = () => { void uiHooks.abrirDetalle(anime); };
}

export function renderHScroll(containerId: string, list: any[]): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  list.forEach(anime => {
    const title = escHtml(anime.title?.english || anime.title?.romaji);
    const img = escHtml(safeImg(anime.coverImage?.large || anime.coverImage?.extraLarge));
    const totalEps = escHtml(anime.episodes || anime.nextAiringEpisode?.episode || '?');
    const card = document.createElement('div');
    card.className = 'card-h fade-in';
    card.onclick = () => { void uiHooks.abrirDetalle(anime); };
    card.innerHTML = `
      <div class="card-h-img-wrap">
        <img src="${img}" alt="${title}" loading="lazy">
        <div class="ep-badge">${totalEps} EP</div>
      </div>
      <div class="card-h-title">${title}</div>
    `;
    container.appendChild(card);
  });
}

export function renderContinuarViendo(): void {
  const section = document.getElementById('section-continuar');
  const container = document.getElementById('lista-continuar');
  if (!section || !container) return;
  const history = HistoryManager.getAll();
  if (!history || history.length === 0) {
    section.classList.add('hide');
    return;
  }
  section.classList.remove('hide');
  container.innerHTML = '';
  history.forEach(item => {
    const title = escHtml(item.anime?.title?.english || item.anime?.title?.romaji || 'Anime');
    const img = escHtml(safeImg(item.anime?.bannerImage || item.anime?.coverImage?.large || ''));
    const curSec = Number(item.currentTime || 0);
    const durSec = Number(item.duration || 0);
    const pct = computeProgressPercent(curSec, durSec);
    const hasProgress = durSec > 0 && curSec > 0;
    const subLabel = hasProgress
      ? `T${escHtml(item.seasonNum)} · Ep ${escHtml(item.episodeNum)} · ${formatPlaybackTime(curSec)} / ${formatPlaybackTime(durSec)}`
      : `T${escHtml(item.seasonNum)} · Ep ${escHtml(item.episodeNum)}`;

    const card = document.createElement('div');
    card.className = 'continue-card fade-in';
    card.onclick = () => {
      void uiHooks.abrirDetalle(item.anime, () => {
        if (Array.isArray(state.seasons) && state.seasons.length > 0 && item.seasonNum) {
          const targetIdx = state.seasons.findIndex(s => Number(s.seasonNumber) === Number(item.seasonNum));
          if (targetIdx >= 0) {
            state.temporadaActualIdx = targetIdx;
          }
        }
        (window as any).abrirReproductor?.(item.episodeNum);
      });
    };
    card.innerHTML = `
      <div class="continue-img-wrap">
        <img src="${img}" alt="${title}">
        <div class="continue-play-icon">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
        ${hasProgress ? `
          <div class="continue-progress-bar" aria-label="Progreso ${pct}%">
            <div class="continue-progress-fill" style="width:${pct}%;"></div>
          </div>
        ` : ''}
      </div>
      <div class="continue-info">
        <div class="continue-title">${title}</div>
        <div class="continue-sub">${subLabel}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

export function limpiarHistorialAnime(): void {
  HistoryManager.clear();
  showToast('Historial de anime limpiado');
}

const CATEGORIAS = ['Todos', 'Acción', 'Aventura', 'Comedia', 'Drama', 'Fantasía', 'Romance', 'Sci-Fi', 'Sobrenatural'];

export function renderCategorias(): void {
  const container = document.getElementById('lista-categorias');
  if (!container) return;
  container.innerHTML = '';
  CATEGORIAS.forEach((cat, idx) => {
    const chip = document.createElement('div');
    chip.className = `chip ${idx === 0 ? 'active' : ''}`;
    chip.textContent = cat;
    chip.onclick = () => {
      document.querySelectorAll('#lista-categorias .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      if (cat === 'Todos') void cargarCatalogoHome();
      else void filtrarPorGenero(cat);
    };
    container.appendChild(chip);
  });
}

export async function filtrarPorGenero(genero: string): Promise<void> {
  const query = `
    query ($genre: String) {
      Page(perPage: 15) {
        media(genre: $genre, sort: POPULARITY_DESC, type: ANIME) {
          id title { romaji english } coverImage { extraLarge large } bannerImage format status episodes nextAiringEpisode { episode } genres description
        }
      }
    }
  `;
  try {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { genre: genero } })
    });
    const data = await res.json();
    if (data?.data?.Page?.media) {
      renderHScroll('lista-populares', data.data.Page.media);
    }
  } catch {
    // ignore
  }
}

let searchMediaTypeFilter = 'ALL';
let searchDirectoryFilters: SearchDirectoryFilters = createDefaultDirectoryFilters();
let searchFilterDrawerOpen = false;
let searchReqSeq = 0;

interface SearchPageMeta {
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
  total: number;
}

function renderDefaultSearchPrompt(): void {
  const container = document.getElementById('resultados-busqueda');
  if (container) {
    container.innerHTML =
      '<div style="grid-column: 1/-1; text-align:center; color: var(--text-muted); margin-top:20px; font-size:13px;">Escribe un título o selecciona géneros y filtros para explorar el catálogo al instante.</div>';
  }
  const paginationBar = document.getElementById('search-pagination-bar');
  if (paginationBar) {
    paginationBar.classList.add('hide');
    paginationBar.innerHTML = '';
  }
}

function populateSelectOptions(
  selectId: string,
  options: ReadonlyArray<{ id: string; label: string }>
): void {
  const el = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!el) return;
  el.innerHTML = '';
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.id;
    option.textContent = opt.label;
    el.appendChild(option);
  });
}

function findLabelById(options: ReadonlyArray<{ id: string; label: string }>, id: string): string {
  return options.find(o => o.id === id)?.label || id;
}

function renderActiveSearchSummary(): void {
  const summaryEl = document.getElementById('search-active-summary');
  if (!summaryEl) return;

  const pills: Array<{ key: keyof SearchDirectoryFilters; text: string }> = [];
  if (searchDirectoryFilters.genre) {
    pills.push({ key: 'genre', text: `Género: ${findLabelById(JKANIME_GENRES, searchDirectoryFilters.genre)}` });
  }
  if (searchDirectoryFilters.type) {
    pills.push({ key: 'type', text: `Tipo: ${findLabelById(JKANIME_FILTER_CONFIG.TYPES, searchDirectoryFilters.type)}` });
  }
  if (searchDirectoryFilters.status) {
    pills.push({ key: 'status', text: `Estado: ${findLabelById(JKANIME_FILTER_CONFIG.STATUS, searchDirectoryFilters.status)}` });
  }
  if (searchDirectoryFilters.demography) {
    pills.push({ key: 'demography', text: `Demografía: ${findLabelById(JKANIME_FILTER_CONFIG.DEMOGRAPHIES, searchDirectoryFilters.demography)}` });
  }
  if (searchDirectoryFilters.category) {
    pills.push({ key: 'category', text: `Categoría: ${findLabelById(JKANIME_FILTER_CONFIG.CATEGORIES, searchDirectoryFilters.category)}` });
  }
  if (searchDirectoryFilters.year) {
    pills.push({ key: 'year', text: `Año: ${searchDirectoryFilters.year}` });
  }
  if (searchDirectoryFilters.season) {
    pills.push({ key: 'season', text: `Temporada: ${findLabelById(JKANIME_FILTER_CONFIG.SEASONS, searchDirectoryFilters.season)}` });
  }
  if (searchDirectoryFilters.letter) {
    pills.push({ key: 'letter', text: `Letra: ${searchDirectoryFilters.letter}` });
  }
  if (searchDirectoryFilters.filter && searchDirectoryFilters.filter !== 'popularidad') {
    pills.push({ key: 'filter', text: `Orden: ${findLabelById(JKANIME_FILTER_CONFIG.FILTERS, searchDirectoryFilters.filter)}` });
  }
  if (searchDirectoryFilters.order === 'asc') {
    pills.push({ key: 'order', text: 'Dirección: Ascendente' });
  }

  if (pills.length === 0) {
    summaryEl.classList.add('hide');
    summaryEl.innerHTML = '';
    return;
  }

  summaryEl.classList.remove('hide');
  summaryEl.innerHTML = '';

  pills.forEach(p => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-active-tag';
    btn.innerHTML = `${escHtml(p.text)} <span aria-hidden="true">✕</span>`;
    btn.onclick = () => {
      const defaults = createDefaultDirectoryFilters();
      onSearchDirectoryFilterChange(p.key, String(defaults[p.key]));
    };
    summaryEl.appendChild(btn);
  });

  if (searchDirectoryFilters.category === 'latino' || searchDirectoryFilters.genre === 'latino') {
    const note = document.createElement('span');
    note.className = 'search-active-note';
    note.textContent = 'Mostrando populares con audio latino disponible en reproductor';
    summaryEl.appendChild(note);
  }
}

function syncSearchFilterControlsUI(): void {
  const map: Array<[string, string]> = [
    ['search-filter-genre', searchDirectoryFilters.genre],
    ['search-filter-type', searchDirectoryFilters.type],
    ['search-filter-status', searchDirectoryFilters.status],
    ['search-filter-demography', searchDirectoryFilters.demography],
    ['search-filter-category', searchDirectoryFilters.category],
    ['search-filter-year', searchDirectoryFilters.year],
    ['search-filter-season', searchDirectoryFilters.season],
    ['search-filter-letter', searchDirectoryFilters.letter],
    ['search-filter-sort', searchDirectoryFilters.filter],
    ['search-filter-order', searchDirectoryFilters.order]
  ];
  for (const [id, val] of map) {
    const el = document.getElementById(id) as HTMLSelectElement | null;
    if (el) el.value = val;
  }

  document.querySelectorAll('#search-quick-genres .chip').forEach(chip => {
    const gid = (chip as HTMLElement).dataset.genreId || '';
    chip.classList.toggle('active', gid === searchDirectoryFilters.genre);
  });

  const activeCount = countActiveDirectoryFilters(searchDirectoryFilters);
  const badge = document.getElementById('search-filter-count-badge');
  if (badge) {
    badge.textContent = String(activeCount);
    badge.classList.toggle('hide', activeCount === 0);
  }

  const resetBtn = document.getElementById('btn-reset-search-filters');
  if (resetBtn) {
    resetBtn.classList.toggle('hide', activeCount === 0);
  }

  const drawer = document.getElementById('search-filter-drawer');
  if (drawer) {
    drawer.classList.toggle('hide', !searchFilterDrawerOpen);
  }
  const toggleBtn = document.getElementById('btn-toggle-search-filters');
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', searchFilterDrawerOpen || activeCount > 0);
    toggleBtn.setAttribute('aria-expanded', String(searchFilterDrawerOpen));
  }

  renderActiveSearchSummary();
}

export function initSearchDirectoryFilters(): void {
  populateSelectOptions('search-filter-genre', [
    { id: '', label: 'Todos los Géneros' },
    ...JKANIME_GENRES.map(g => ({ id: g.id, label: g.label }))
  ]);
  populateSelectOptions('search-filter-type', JKANIME_FILTER_CONFIG.TYPES);
  populateSelectOptions('search-filter-status', JKANIME_FILTER_CONFIG.STATUS);
  populateSelectOptions('search-filter-demography', JKANIME_FILTER_CONFIG.DEMOGRAPHIES);
  populateSelectOptions('search-filter-category', JKANIME_FILTER_CONFIG.CATEGORIES);
  populateSelectOptions('search-filter-year', [
    { id: '', label: 'Cualquier Año' },
    ...getSupportedYears().map(y => ({ id: y, label: y }))
  ]);
  populateSelectOptions('search-filter-season', JKANIME_FILTER_CONFIG.SEASONS);
  populateSelectOptions('search-filter-letter', [
    { id: '', label: 'Todas (A–Z)' },
    ...JKANIME_FILTER_CONFIG.LETTERS.map(l => ({ id: l, label: `Letra ${l}` }))
  ]);
  populateSelectOptions('search-filter-sort', JKANIME_FILTER_CONFIG.FILTERS);
  populateSelectOptions('search-filter-order', JKANIME_FILTER_CONFIG.ORDERS);

  const quickStrip = document.getElementById('search-quick-genres');
  if (quickStrip) {
    quickStrip.innerHTML = '';
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = 'chip active';
    allChip.dataset.genreId = '';
    allChip.textContent = '✨ Todos';
    allChip.onclick = () => selectQuickSearchGenre('');
    quickStrip.appendChild(allChip);

    JKANIME_QUICK_GENRE_IDS.forEach(gid => {
      const g = JKANIME_GENRES.find(item => item.id === gid);
      if (!g) return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.genreId = g.id;
      chip.textContent = g.label;
      chip.onclick = () => selectQuickSearchGenre(g.id);
      quickStrip.appendChild(chip);
    });
  }

  syncSearchFilterControlsUI();
}

export function toggleSearchFilterDrawer(): void {
  searchFilterDrawerOpen = !searchFilterDrawerOpen;
  syncSearchFilterControlsUI();
}

function shouldRunSearchForCurrentState(term: string): boolean {
  return (
    term.trim().length >= 2 ||
    hasActiveDirectoryFilters(searchDirectoryFilters) ||
    countActiveDirectoryFilters(searchDirectoryFilters) > 0
  );
}

const animeDirectoryMemCache = new Map<string, { items: any[]; pageInfo: SearchPageMeta }>();
let filterChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const FALLBACK_ANIME_DIRECTORY_CATALOG: ReadonlyArray<any> = [
  {
    id: 151807,
    title: { romaji: 'Ore dake Level Up na Ken', english: 'Solo Leveling' },
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-m1gX3iwfIsLu.png', large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-m1gX3iwfIsLu.png' },
    format: 'TV',
    status: 'FINISHED',
    episodes: 12,
    startDate: { year: 2024 },
    averageScore: 83,
    genres: ['Action', 'Adventure', 'Fantasy'],
    description: 'En un mundo donde cazadores con habilidades mágicas deben luchar contra monstruos mortales para proteger a la humanidad, Sung Jinwoo descubre un programa secreto que le permite subir de nivel sin límites.'
  },
  {
    id: 171018,
    title: { romaji: 'Dandadan', english: 'DAN DA DAN' },
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171018-2ldCj6QywuOa.jpg', large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171018-2ldCj6QywuOa.jpg' },
    format: 'TV',
    status: 'FINISHED',
    episodes: 12,
    startDate: { year: 2024 },
    averageScore: 86,
    genres: ['Action', 'Comedy', 'Sci-Fi', 'Supernatural', 'Romance'],
    description: 'Momo Ayase cree en fantasmas pero no en alienígenas, mientras que su compañero Okarun cree en alienígenas pero no en fantasmas.'
  },
  {
    id: 154587,
    title: { romaji: 'Sousou no Frieren', english: "Frieren: Beyond Journey's End" },
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-gHSraOSa0nBG.jpg', large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-gHSraOSa0nBG.jpg' },
    format: 'TV',
    status: 'FINISHED',
    episodes: 28,
    startDate: { year: 2023 },
    averageScore: 91,
    genres: ['Adventure', 'Drama', 'Fantasy'],
    description: 'Tras derrotar al Rey Demonio junto al grupo de héroes, la maga elfa Frieren emprende un nuevo viaje para comprender mejor a los humanos y el paso del tiempo.'
  },
  {
    id: 21,
    title: { romaji: 'ONE PIECE', english: 'One Piece' },
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-YCDoj1EkAxFn.jpg', large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-YCDoj1EkAxFn.jpg' },
    format: 'TV',
    status: 'RELEASING',
    episodes: 1122,
    startDate: { year: 1999 },
    averageScore: 88,
    genres: ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy'],
    description: 'Monkey D. Luffy se lanza al mar en busca del legendario tesoro One Piece para convertirse en el Rey de los Piratas.'
  },
  {
    id: 113415,
    title: { romaji: 'Jujutsu Kaisen', english: 'JUJUTSU KAISEN' },
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-bbBWj4pEFseh.jpg', large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-bbBWj4pEFseh.jpg' },
    format: 'TV',
    status: 'FINISHED',
    episodes: 24,
    startDate: { year: 2020 },
    averageScore: 85,
    genres: ['Action', 'Drama', 'Supernatural'],
    description: 'Yuji Itadori traga un talismán maldito para salvar a sus amigos y pasa a compartir su cuerpo con Ryomen Sukuna, el Rey de las Maldiciones.'
  },
  {
    id: 101922,
    title: { romaji: 'Kimetsu no Yaiba', english: 'Demon Slayer: Kimetsu no Yaiba' },
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-WBsBl0ClmgYL.jpg', large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-WBsBl0ClmgYL.jpg' },
    format: 'TV',
    status: 'FINISHED',
    episodes: 26,
    startDate: { year: 2019 },
    averageScore: 83,
    genres: ['Action', 'Adventure', 'Drama', 'Fantasy', 'Supernatural'],
    description: 'Tanjiro Kamado busca una cura para su hermana Nezuko, quien fue transformada en demonio tras el ataque a su familia.'
  },
  {
    id: 127230,
    title: { romaji: 'Chainsaw Man', english: 'Chainsaw Man' },
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx127230-NuHM32a3VJsb.jpg', large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx127230-NuHM32a3VJsb.jpg' },
    format: 'TV',
    status: 'FINISHED',
    episodes: 12,
    startDate: { year: 2022 },
    averageScore: 84,
    genres: ['Action', 'Comedy', 'Drama', 'Horror', 'Supernatural'],
    description: 'Denji renace como Chainsaw Man tras fusionarse con su mascota demonio Pochita.'
  },
  {
    id: 21355,
    title: { romaji: 'Re:Zero kara Hajimeru Isekai Seikatsu', english: 'Re:ZERO -Starting Life in Another World-' },
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21355-wRVUrGxpvI1G.jpg', large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21355-wRVUrGxpvI1G.jpg' },
    format: 'TV',
    status: 'FINISHED',
    episodes: 25,
    startDate: { year: 2016 },
    averageScore: 81,
    genres: ['Action', 'Adventure', 'Drama', 'Fantasy', 'Psychological', 'Romance', 'Thriller'],
    description: 'Subaru Natsuki es transportado a otro mundo donde descubre que tiene el poder de regresar de la muerte.'
  },
  {
    id: 161645,
    title: { romaji: 'Kusuriya no Hitorigoto', english: 'The Apothecary Diaries' },
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx161645-7I8C27292t7f.jpg', large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx161645-7I8C27292t7f.jpg' },
    format: 'TV',
    status: 'FINISHED',
    episodes: 24,
    startDate: { year: 2023 },
    averageScore: 88,
    genres: ['Drama', 'Mystery', 'Romance', 'Slice of Life'],
    description: 'Maomao, una joven boticaria apasionada por los venenos y las medicinas, resuelve misterios en la corte imperial.'
  },
  {
    id: 108465,
    title: { romaji: 'Mushoku Tensei: Isekai Ittara Honki Dasu', english: 'Mushoku Tensei: Jobless Reincarnation' },
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx108465-B9S9zC68e32j.jpg', large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx108465-B9S9zC68e32j.jpg' },
    format: 'TV',
    status: 'FINISHED',
    episodes: 11,
    startDate: { year: 2021 },
    averageScore: 82,
    genres: ['Adventure', 'Drama', 'Ecchi', 'Fantasy'],
    description: 'Un hombre sin rumbo reencarna en un mundo de espada y magia como Rudeus Greyrat, decidido a vivir su nueva vida al máximo.'
  },
  {
    id: 137822,
    title: { romaji: 'Blue Lock', english: 'BLUE LOCK' },
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx137822-4dVWMSHLpGf8.jpg', large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx137822-4dVWMSHLpGf8.jpg' },
    format: 'TV',
    status: 'FINISHED',
    episodes: 24,
    startDate: { year: 2022 },
    averageScore: 81,
    genres: ['Action', 'Drama', 'Sports', 'Thriller'],
    description: 'Trescientos jóvenes delanteros compiten en el proyecto Blue Lock para crear al mejor goleador egoísta de Japón.'
  },
  {
    id: 9253,
    title: { romaji: 'Steins;Gate', english: 'Steins;Gate' },
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx9253-7pdcVzQSkKxT.jpg', large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx9253-7pdcVzQSkKxT.jpg' },
    format: 'TV',
    status: 'FINISHED',
    episodes: 24,
    startDate: { year: 2011 },
    averageScore: 89,
    genres: ['Drama', 'Psychological', 'Sci-Fi', 'Thriller'],
    description: 'Un grupo de amigos descubre accidentalmente cómo enviar mensajes de texto al pasado, alterando las líneas temporales.'
  },
  {
    id: 115138,
    title: { romaji: 'Ane wa Yanmama Junyuu-chuu', english: 'My Big Sister Is Breastfeeding' },
    synonyms: ['Gishi wa Yanmama Junyuu-chuu', 'My Big Sister Is Breastfeeding'],
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx115138-U4q5N5G5yP7r.jpg', large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx115138-U4q5N5G5yP7r.jpg' },
    format: 'OVA',
    status: 'FINISHED',
    isAdult: true,
    episodes: 2,
    startDate: { year: 2020 },
    averageScore: 71,
    genres: ['Hentai', 'Romance'],
    description: 'OVA completo disponible en servidores directos.'
  }
];

function scheduleDirectorySearch(term: string, page = 1, immediate = false): void {
  if (filterChangeDebounceTimer) {
    clearTimeout(filterChangeDebounceTimer);
    filterChangeDebounceTimer = null;
  }
  if (immediate) {
    void realizarBusqueda(term, page);
    return;
  }
  filterChangeDebounceTimer = setTimeout(() => {
    filterChangeDebounceTimer = null;
    void realizarBusqueda(term, page);
  }, 110);
}

export function onSearchDirectoryFilterChange(key: keyof SearchDirectoryFilters, value: string): void {
  (searchDirectoryFilters as any)[key] = value;
  searchDirectoryFilters.page = 1;
  syncSearchFilterControlsUI();

  const input = document.getElementById('input-busqueda') as HTMLInputElement | null;
  const term = input?.value?.trim() || '';
  if (shouldRunSearchForCurrentState(term)) {
    scheduleDirectorySearch(term, 1);
  } else {
    renderDefaultSearchPrompt();
  }
}

export function selectQuickSearchGenre(genreId: string): void {
  const next = genreId && searchDirectoryFilters.genre === genreId ? '' : genreId;
  searchDirectoryFilters.genre = next;
  searchDirectoryFilters.page = 1;
  syncSearchFilterControlsUI();

  const input = document.getElementById('input-busqueda') as HTMLInputElement | null;
  const term = input?.value?.trim() || '';
  if (shouldRunSearchForCurrentState(term)) {
    scheduleDirectorySearch(term, 1);
  } else {
    renderDefaultSearchPrompt();
  }
}

export function resetSearchFilters(): void {
  if (filterChangeDebounceTimer) {
    clearTimeout(filterChangeDebounceTimer);
    filterChangeDebounceTimer = null;
  }
  searchDirectoryFilters = createDefaultDirectoryFilters();
  syncSearchFilterControlsUI();

  const input = document.getElementById('input-busqueda') as HTMLInputElement | null;
  const term = input?.value?.trim() || '';
  if (term.length >= 2) {
    void realizarBusqueda(term, 1);
  } else {
    renderDefaultSearchPrompt();
  }
}

export function cambiarPaginaBusqueda(page: number): void {
  const targetPage = Math.max(1, Number(page || 1));
  searchDirectoryFilters.page = targetPage;
  const input = document.getElementById('input-busqueda') as HTMLInputElement | null;
  const term = input?.value?.trim() || '';
  scheduleDirectorySearch(term, targetPage, true);
  const screen = document.getElementById('pantalla-busqueda');
  if (screen) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

export function setSearchFilter(type: string, el: HTMLElement | null): void {
  searchMediaTypeFilter = String(type || 'ALL').toUpperCase();
  document.querySelectorAll('#search-filter-chips .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  searchDirectoryFilters.page = 1;

  const input = document.getElementById('input-busqueda') as HTMLInputElement | null;
  const term = input?.value?.trim() || '';
  if (shouldRunSearchForCurrentState(term)) {
    scheduleDirectorySearch(term, 1);
  } else {
    renderDefaultSearchPrompt();
  }
}

export function quickSearch(query: string): void {
  const input = document.getElementById('input-busqueda') as HTMLInputElement | null;
  if (input) {
    input.value = query;
    searchDirectoryFilters.page = 1;
    if (state.searchDebounceTimer) clearTimeout(state.searchDebounceTimer);
    scheduleDirectorySearch(query, 1, true);
  }
}

export function onSearchInput(val: string): void {
  if (state.searchDebounceTimer) clearTimeout(state.searchDebounceTimer);
  const clean = (val || '').trim();
  if (clean.length < 2 && !hasActiveDirectoryFilters(searchDirectoryFilters) && countActiveDirectoryFilters(searchDirectoryFilters) === 0) {
    renderDefaultSearchPrompt();
    return;
  }
  state.searchDebounceTimer = setTimeout(() => {
    searchDirectoryFilters.page = 1;
    void realizarBusqueda(clean, 1);
  }, 300);
}

function buildFallbackAnimeDirectoryResults(
  cleanVars: Record<string, any>,
  letter = '',
  effectiveSearch = ''
): { items: any[]; pageInfo: SearchPageMeta } {
  const poolMap = new Map<number | string, any>();
  const homeCached = CacheManager.get('home_catalog_v3') || CacheManager.get('home_catalog_v2');
  for (const list of [homeCached?.trending?.media, homeCached?.popular?.media, homeCached?.releasing?.media]) {
    if (Array.isArray(list)) {
      for (const item of list) {
        if (item?.id) poolMap.set(item.id, item);
      }
    }
  }
  for (const cachedVal of animeDirectoryMemCache.values()) {
    for (const item of cachedVal.items || []) {
      if (item?.id && !poolMap.has(item.id)) poolMap.set(item.id, item);
    }
  }
  for (const item of FALLBACK_ANIME_DIRECTORY_CATALOG) {
    if (item?.id && !poolMap.has(item.id)) poolMap.set(item.id, item);
  }

  let allPool = Array.from(poolMap.values());

  if (cleanVars.isAdult === true) {
    const adultItems = allPool.filter(
      (m) => m.isAdult === true || (Array.isArray(m.genres) && m.genres.some((g: string) => /hentai|ecchi/i.test(g)))
    );
    if (adultItems.length > 0) allPool = adultItems;
  } else {
    allPool = allPool.filter((m) => !m.isAdult);
  }

  if (effectiveSearch) {
    const q = effectiveSearch.toLowerCase();
    const bySearch = allPool.filter((m) => {
      const r = String(m.title?.romaji || '').toLowerCase();
      const e = String(m.title?.english || '').toLowerCase();
      return r.includes(q) || e.includes(q);
    });
    if (bySearch.length > 0) allPool = bySearch;
  }

  if (Array.isArray(cleanVars.genre_in) && cleanVars.genre_in.length > 0) {
    const targetGenre = String(cleanVars.genre_in[0]).toLowerCase();
    const byGenre = allPool.filter(
      (m) => Array.isArray(m.genres) && m.genres.some((g: string) => String(g).toLowerCase() === targetGenre)
    );
    if (byGenre.length > 0) allPool = byGenre;
  }

  if (Array.isArray(cleanVars.format_in) && cleanVars.format_in.length > 0) {
    const fmts = new Set(cleanVars.format_in.map((f: string) => String(f).toUpperCase()));
    const byFmt = allPool.filter((m) => fmts.has(String(m.format || 'TV').toUpperCase()));
    if (byFmt.length > 0) allPool = byFmt;
  }

  if (cleanVars.status) {
    const byStatus = allPool.filter((m) => String(m.status || '').toUpperCase() === String(cleanVars.status).toUpperCase());
    if (byStatus.length > 0) allPool = byStatus;
  }

  if (letter) {
    const byLetter = filterMediaByLetter(allPool, letter);
    if (byLetter.length > 0) allPool = byLetter;
  }

  if (allPool.length === 0) {
    allPool = FALLBACK_ANIME_DIRECTORY_CATALOG.filter((m) => !m.isAdult);
  }

  return {
    items: allPool,
    pageInfo: {
      currentPage: 1,
      lastPage: 1,
      hasNextPage: false,
      total: allPool.length
    }
  };
}

async function fetchAniListAnimeDirectory(
  variables: Record<string, any>,
  letter = '',
  effectiveSearch = ''
): Promise<{ items: any[]; pageInfo: SearchPageMeta }> {
  const gql = `
    query(
      $page: Int
      $perPage: Int
      $search: String
      $genre_in: [String]
      $tag_in: [String]
      $format_in: [MediaFormat]
      $status: MediaStatus
      $season: MediaSeason
      $seasonYear: Int
      $startDate_greater: FuzzyDateInt
      $startDate_lesser: FuzzyDateInt
      $countryOfOrigin: CountryCode
      $isAdult: Boolean
      $sort: [MediaSort]
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          currentPage
          lastPage
          hasNextPage
          total
        }
        media(
          type: ANIME
          search: $search
          genre_in: $genre_in
          tag_in: $tag_in
          format_in: $format_in
          status: $status
          season: $season
          seasonYear: $seasonYear
          startDate_greater: $startDate_greater
          startDate_lesser: $startDate_lesser
          countryOfOrigin: $countryOfOrigin
          isAdult: $isAdult
          sort: $sort
        ) {
          id
          idMal
          title { romaji english native }
          synonyms
          isAdult
          coverImage { extraLarge large color }
          bannerImage
          format
          status
          episodes
          nextAiringEpisode { episode timeUntilAiring airingAt }
          startDate { year month day }
          averageScore
          genres
          description
        }
      }
    }
  `;

  const cleanVars: Record<string, any> = {};
  for (const [k, v] of Object.entries(variables)) {
    if (v !== undefined && v !== null && v !== '') {
      cleanVars[k] = v;
    }
  }

  const cacheKey = `dir_anime_v4_${JSON.stringify(cleanVars)}_${letter}`;
  const memHit = animeDirectoryMemCache.get(cacheKey);
  if (memHit && memHit.items.length > 0) return memHit;
  const storageHit = CacheManager.get(cacheKey);
  if (storageHit && Array.isArray(storageHit.items) && storageHit.items.length > 0) {
    animeDirectoryMemCache.set(cacheKey, storageHit);
    return storageHit;
  }

  const runQuery = async (vars: Record<string, any>) => {
    const bodyPayload = JSON.stringify({ query: gql, variables: vars });
    // Try server proxy first (benefits from server-side 5-min cache and avoids client CORS/429)
    try {
      const proxyRes = await fetch(`/api/proxy?url=${encodeURIComponent(ANILIST_URL)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: bodyPayload
      });
      if (proxyRes.ok) {
        const pj = await proxyRes.json();
        if (pj?.data?.Page) return pj.data.Page;
      }
    } catch {
      // try direct below
    }

    try {
      const r = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: bodyPayload
      });
      if (!r.ok) return null;
      const j = await r.json();
      return j?.data?.Page || null;
    } catch {
      return null;
    }
  };

  let pageData = await runQuery(cleanVars);
  let rawMedia: any[] = pageData?.media || [];

  // Progressive filter relaxation if multiple strict filters yielded 0 items on AniList
  if (rawMedia.length === 0 && !effectiveSearch) {
    const hasSecondaryConstraints = Boolean(
      cleanVars.season ||
        cleanVars.seasonYear ||
        cleanVars.startDate_greater ||
        cleanVars.status ||
        (cleanVars.tag_in && cleanVars.genre_in) ||
        (Array.isArray(cleanVars.tag_in) && cleanVars.tag_in.length > 1)
    );
    if (hasSecondaryConstraints) {
      const relaxedVars: Record<string, any> = {
        page: 1,
        perPage: cleanVars.perPage || 24,
        isAdult: Boolean(cleanVars.isAdult),
        sort: cleanVars.sort || ['POPULARITY_DESC']
      };
      if (cleanVars.genre_in) relaxedVars.genre_in = cleanVars.genre_in;
      else if (Array.isArray(cleanVars.tag_in) && cleanVars.tag_in.length > 0) {
        relaxedVars.tag_in = [cleanVars.tag_in[0]];
      }
      if (cleanVars.format_in) relaxedVars.format_in = cleanVars.format_in;
      if (cleanVars.countryOfOrigin) relaxedVars.countryOfOrigin = cleanVars.countryOfOrigin;

      const relaxedPage = await runQuery(relaxedVars);
      if (relaxedPage?.media?.length > 0) {
        pageData = relaxedPage;
        rawMedia = relaxedPage.media;
      }
    }
  }

  let filtered = letter ? filterMediaByLetter(rawMedia, letter) : rawMedia;

  if (letter && !effectiveSearch && filtered.length < 6 && (cleanVars.page || 1) === 1) {
    const alphaVars = { ...cleanVars, sort: ['TITLE_ROMAJI'], page: 1, perPage: 50 };
    const extraPage = await runQuery(alphaVars);
    const extraMatches = filterMediaByLetter<any>(extraPage?.media || [], letter);
    const seen = new Set(filtered.map((m: any) => m.id));
    for (const item of extraMatches) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        filtered.push(item);
      }
    }
    if (filtered.length === 0 && rawMedia.length > 0) {
      filtered = rawMedia;
    }
  }

  if (effectiveSearch || cleanVars.isAdult === true) {
    try {
      const hlaUrl = buildHentaiLaCatalogUrl({
        page: Number(cleanVars.page || 1),
        search: effectiveSearch,
        order: 'popular'
      });
      const hlaRes = await fetch(`/api/proxy?url=${encodeURIComponent(hlaUrl)}&probe=1`);
      if (hlaRes.ok) {
        const hlaJson = await hlaRes.json().catch(() => null);
        const { items: hlaItems } = parseHentaiLaCatalogData(hlaJson);
        if (hlaItems.length > 0) {
          const compactTitle = (s: string) => normalizeSlugText(s).replace(/-/g, '');
          for (const hla of hlaItems) {
            const hlaCompact = compactTitle(hla.title);
            const existing = filtered.find((m: any) => {
              if (m.idMal && hla.malId && Number(m.idMal) === Number(hla.malId)) return true;
              const rComp = compactTitle(m.title?.romaji || '');
              const eComp = compactTitle(m.title?.english || '');
              return Boolean(hlaCompact && (rComp === hlaCompact || eComp === hlaCompact));
            });
            if (existing) {
              existing.hentailaSlug = hla.slug;
              existing.hentailaId = hla.mediaId;
              if (hla.synopsis) {
                existing.description = hla.synopsis;
              }
            } else if (cleanVars.isAdult === true || effectiveSearch.length >= 3) {
              filtered.push({
                id: hla.id,
                idMal: hla.malId || undefined,
                hentailaId: hla.mediaId,
                hentailaSlug: hla.slug,
                title: { romaji: hla.title, english: hla.title },
                isAdult: true,
                coverImage: { extraLarge: hla.cover, large: hla.cover },
                bannerImage: hla.backdrop || hla.cover,
                format: hla.category || 'OVA',
                status: hla.status,
                episodes: hla.episodesCount,
                genres: hla.genres,
                description: hla.synopsis || 'Disponible en HentaiLA VIP HD (Sub Español).'
              });
            }
          }
        }
      }
    } catch {
      // ignore optional HentaiLA catalog enrichment error
    }
  }

  if (filtered.length === 0 && !effectiveSearch) {
    return buildFallbackAnimeDirectoryResults(cleanVars, letter, effectiveSearch);
  }

  const pInfo = pageData?.pageInfo || {};
  const result = {
    items: filtered,
    pageInfo: {
      currentPage: Number(pInfo.currentPage || cleanVars.page || 1),
      lastPage: Number(pInfo.lastPage || 1),
      hasNextPage: Boolean(pInfo.hasNextPage),
      total: Math.max(Number(pInfo.total || 0), filtered.length)
    }
  };

  if (filtered.length > 0) {
    animeDirectoryMemCache.set(cacheKey, result);
    CacheManager.set(cacheKey, result);
  }

  return result;
}

export { HENTAILA_GENRES, type HentaiLaCatalogItem };

function renderSearchPagination(pageInfo: SearchPageMeta | null): void {
  const bar = document.getElementById('search-pagination-bar');
  if (!bar) return;

  if (!pageInfo || (pageInfo.currentPage <= 1 && !pageInfo.hasNextPage)) {
    bar.classList.add('hide');
    bar.innerHTML = '';
    return;
  }

  const cur = pageInfo.currentPage;
  const last = Math.max(cur, pageInfo.lastPage || cur);
  bar.classList.remove('hide');
  bar.innerHTML = `
    <button type="button" class="search-page-btn" ${cur <= 1 ? 'disabled' : ''} onclick="cambiarPaginaBusqueda(${cur - 1})">← Anterior</button>
    <span class="search-page-info">Página ${cur}${last > 1 ? ` de ${last}` : ''}</span>
    <button type="button" class="search-page-btn" ${!pageInfo.hasNextPage ? 'disabled' : ''} onclick="cambiarPaginaBusqueda(${cur + 1})">Siguiente →</button>
  `;
}

export async function realizarBusqueda(termArg?: string, pageArg?: number): Promise<void> {
  const input = document.getElementById('input-busqueda') as HTMLInputElement | null;
  const term = (typeof termArg === 'string' ? termArg : (input?.value || '')).trim();
  const page = Math.max(1, Number(pageArg ?? searchDirectoryFilters.page ?? 1));
  searchDirectoryFilters.page = page;

  if (!shouldRunSearchForCurrentState(term)) {
    renderDefaultSearchPrompt();
    return;
  }

  const reqId = ++searchReqSeq;
  const container = document.getElementById('resultados-busqueda');
  if (!container) return;
  container.innerHTML = '<div class="loader" style="grid-column: 1/-1;"><div class="spinner"></div></div>';

  const effectiveSearch = term.length >= 2 ? term : '';
  const filtersForQuery: SearchDirectoryFilters = {
    ...searchDirectoryFilters,
    page
  };
  const hasAnimeOnlyFilter = Boolean(
    filtersForQuery.type ||
    filtersForQuery.season ||
    filtersForQuery.category === 'latino' ||
    filtersForQuery.genre === 'latino'
  );

  const includeAnime = searchMediaTypeFilter === 'ALL' || searchMediaTypeFilter === 'ANIME';
  const includeManga =
    searchMediaTypeFilter === 'MANGA' ||
    (searchMediaTypeFilter === 'ALL' && !hasAnimeOnlyFilter);

  try {
    const animeVars = mapDirectoryFiltersToAniListVariables(filtersForQuery, effectiveSearch, 'ANIME');
    const animePromise = includeAnime
      ? fetchAniListAnimeDirectory(
          animeVars,
          filtersForQuery.letter,
          effectiveSearch
        ).catch(() => buildFallbackAnimeDirectoryResults(animeVars, filtersForQuery.letter, effectiveSearch))
      : Promise.resolve({ items: [], pageInfo: { currentPage: page, lastPage: 1, hasNextPage: false, total: 0 } });

    const mangaPromise = includeManga
      ? (effectiveSearch && !hasActiveDirectoryFilters(filtersForQuery) && page === 1
          ? AniListMangaService.search(effectiveSearch, 18).then(items => ({
              items,
              pageInfo: { currentPage: 1, lastPage: 1, hasNextPage: false, total: items.length }
            }))
          : AniListMangaService.searchDirectory(
              mapDirectoryFiltersToAniListVariables(filtersForQuery, effectiveSearch, 'MANGA'),
              filtersForQuery.letter
            )
        ).catch(() => ({ items: [], pageInfo: { currentPage: page, lastPage: 1, hasNextPage: false, total: 0 } }))
      : Promise.resolve({ items: [], pageInfo: { currentPage: page, lastPage: 1, hasNextPage: false, total: 0 } });

    const [animeRes, mangaRes] = await Promise.all([animePromise, mangaPromise]);
    if (reqId !== searchReqSeq) return;

    renderDualSearchResults(animeRes.items, mangaRes.items, term);

    const activePageInfo: SearchPageMeta =
      searchMediaTypeFilter === 'MANGA'
        ? mangaRes.pageInfo
        : searchMediaTypeFilter === 'ANIME'
          ? animeRes.pageInfo
          : {
              currentPage: page,
              lastPage: Math.max(animeRes.pageInfo.lastPage, mangaRes.pageInfo.lastPage),
              hasNextPage: Boolean(animeRes.pageInfo.hasNextPage || mangaRes.pageInfo.hasNextPage),
              total: animeRes.pageInfo.total + mangaRes.pageInfo.total
            };
    renderSearchPagination(activePageInfo);
  } catch (e) {
    if (reqId !== searchReqSeq) return;
    console.error('Error al buscar:', e);
    container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color: var(--text-muted); margin-top:20px;">Error al conectar con la búsqueda.</div>';
    renderSearchPagination(null);
  }
}

export function renderDualSearchResults(animes: any[] = [], mangas: any[] = [], term = ''): void {
  const container = document.getElementById('resultados-busqueda');
  if (!container) return;
  container.innerHTML = '';

  const animeList = Array.isArray(animes) ? animes : [];
  const mangaList = Array.isArray(mangas) ? mangas : [];

  if (animeList.length === 0 && mangaList.length === 0) {
    const emptyTitle = term
      ? `Sin resultados para "${escHtml(term)}"`
      : 'Sin resultados para esta combinación de filtros';
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:42px 20px; color:var(--text-muted);">
        <div style="font-size:32px; margin-bottom:10px;">🔎</div>
        <div style="font-size:15px; font-weight:700; color:#fff; margin-bottom:6px;">${emptyTitle}</div>
        <div style="font-size:12px;">Prueba cambiando el género, año o quitando alguno de los filtros activos.</div>
      </div>
    `;
    return;
  }

  if (animeList.length > 0 && (searchMediaTypeFilter === 'ALL' || searchMediaTypeFilter === 'ANIME')) {
    const animeHdr = document.createElement('div');
    animeHdr.style.cssText = 'grid-column: 1/-1; display:flex; align-items:center; justify-content:space-between; padding:6px 2px 2px; font-size:14px; font-weight:800; color:#fff;';
    animeHdr.innerHTML = `<span>🎬 Animes (${animeList.length})</span>`;
    container.appendChild(animeHdr);

    animeList.forEach(anime => {
      const rawTitle = anime.title?.english || anime.title?.romaji || 'Anime';
      const safeTitle = escHtml(rawTitle);
      const fallback = generarPortadaSVG(rawTitle, 'ja', 'Anime');
      const img = escHtml(safeImg(anime.coverImage?.large || anime.coverImage?.extraLarge, fallback));
      const totalEps = escHtml(anime.episodes || anime.nextAiringEpisode?.episode || '?');

      const card = document.createElement('div');
      card.className = 'card-h fade-in';
      card.style.width = '100%';
      card.onclick = () => { void uiHooks.abrirDetalle(anime); };
      card.innerHTML = `
        <div class="card-h-img-wrap">
          <img src="${img}" alt="${safeTitle}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='${fallback}';">
          <div class="ep-badge">${totalEps} EP</div>
        </div>
        <div class="card-h-title">${safeTitle}</div>
      `;
      container.appendChild(card);
    });
  }

  if (mangaList.length > 0 && (searchMediaTypeFilter === 'ALL' || searchMediaTypeFilter === 'MANGA')) {
    const mangaHdr = document.createElement('div');
    mangaHdr.style.cssText = 'grid-column: 1/-1; display:flex; align-items:center; justify-content:space-between; padding:14px 2px 2px; font-size:14px; font-weight:800; color:#fff;';
    mangaHdr.innerHTML = `<span>📖 Mangas y Manhwas (${mangaList.length})</span>`;
    container.appendChild(mangaHdr);

    mangaList.forEach(manga => {
      const rawTitle = manga.title || 'Manga';
      const safeTitle = escHtml(rawTitle);
      const fallback = generarPortadaSVG(rawTitle, manga.origLang || 'ja', 'Manga');
      const img = escHtml(safeImg(manga.cover, fallback));
      const flag = escHtml(manga.flag || '📖 Manga');

      const card = document.createElement('div');
      card.className = 'card-h fade-in';
      card.style.width = '100%';
      card.onclick = () => { void uiHooks.abrirDetalleManga(manga); };
      card.innerHTML = `
        <div class="card-h-img-wrap">
          <img src="${img}" alt="${safeTitle}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='${fallback}';">
          <div class="ep-badge">${flag}</div>
        </div>
        <div class="card-h-title">${safeTitle}</div>
      `;
      container.appendChild(card);
    });
  }
}

let subTabFavoritos: 'anime' | 'manga' = 'anime';
let favAnimeCategoryFilter: AnimeListStatus | 'all' = 'all';

export function cambiarSubTabFavoritos(tipo: 'anime' | 'manga', el: HTMLElement | null = null): void {
  subTabFavoritos = tipo;
  document.querySelectorAll('#favoritos-tabs .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderFavoritos();
}

export function renderFavoritos(): void {
  const container = document.getElementById('resultados-favoritos');
  const statusBar = document.getElementById('favoritos-anime-status-tabs');
  if (!container) return;
  container.innerHTML = '';

  if (subTabFavoritos === 'anime') {
    const counts = FavoritesManager.getCounts();
    if (statusBar) {
      statusBar.classList.remove('hide');
      statusBar.innerHTML = '';
      const allChip = document.createElement('button');
      allChip.type = 'button';
      allChip.className = `chip ${favAnimeCategoryFilter === 'all' ? 'active' : ''}`;
      allChip.textContent = `Todos (${counts.all})`;
      allChip.onclick = () => {
        favAnimeCategoryFilter = 'all';
        renderFavoritos();
      };
      statusBar.appendChild(allChip);

      ANIME_LIST_CATEGORIES.forEach((cat) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `chip ${favAnimeCategoryFilter === cat.id ? 'active' : ''}`;
        chip.textContent = `${cat.label} (${counts[cat.id]})`;
        chip.onclick = () => {
          favAnimeCategoryFilter = cat.id;
          renderFavoritos();
        };
        statusBar.appendChild(chip);
      });
    }

    const list = FavoritesManager.getByStatus(favAnimeCategoryFilter);
    if (list.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding:50px 20px;">
          <div style="font-size:44px; margin-bottom:12px;">🎬</div>
          <div style="font-weight:700; font-size:16px; color:white; margin-bottom:6px;">${favAnimeCategoryFilter === 'all' ? 'No tienes animes guardados' : 'No hay animes en esta categoría'}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:18px;">Guarda tus animes preferidos y organízalos como Viendo, Por Ver o Completados.</div>
          <button type="button" class="chip active" style="padding:10px 24px; font-weight:700;" onclick="cambiarTab('inicio')">✨ Explorar Animes</button>
        </div>
      `;
      return;
    }
    const watchedMap = AnimeWatchedManager.getAll();
    list.forEach(anime => {
      const title = escHtml(anime.title?.english || anime.title?.romaji || 'Anime');
      const fallback = generarPortadaSVG(anime.title?.english || anime.title?.romaji || 'Anime', 'ja', 'Anime');
      const img = escHtml(safeImg(anime.coverImage?.large || anime.coverImage?.extraLarge, fallback));
      const prog = countWatchedForAnime(anime, watchedMap);
      const totalLabel = prog.totalEpisodes > 0 ? `${prog.watchedCount}/${prog.totalEpisodes} EP` : `${prog.watchedCount > 0 ? prog.watchedCount : '?'} EP`;
      const catMeta = getCategoryMeta(anime.listStatus || 'plan_to_watch');
      const card = document.createElement('div');
      card.className = 'card-h fade-in';
      card.onclick = () => { void uiHooks.abrirDetalle(anime); };
      card.innerHTML = `
        <div class="card-h-img-wrap">
          <img src="${img}" alt="${title}" loading="lazy" onerror="this.onerror=null; this.src='${fallback}';">
          <div class="ep-badge">${escHtml(totalLabel)}</div>
          <div class="card-cat-strip" style="color:${catMeta.accentColor}; border-color:${catMeta.borderTint};">${escHtml(catMeta.shortLabel)}</div>
        </div>
        <div class="card-h-title">${title}</div>
      `;
      container.appendChild(card);
    });
  } else {
    if (statusBar) statusBar.classList.add('hide');
    const list = MangaFavoritesManager.getAll();
    if (list.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding:50px 20px;">
          <div style="font-size:44px; margin-bottom:12px;">📖</div>
          <div style="font-weight:700; font-size:16px; color:white; margin-bottom:6px;">No tienes mangas guardados</div>
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:18px;">Guarda tus mangas y manhwas favoritos para acceder a sus capítulos.</div>
          <button type="button" class="chip active" style="padding:10px 24px; font-weight:700;" onclick="cambiarTab('lectura')">✨ Explorar Catálogo de Mangas</button>
        </div>
      `;
      return;
    }
    list.forEach(manga => {
      let flag = '🇯🇵 Manga';
      if (manga.origLang === 'ko') flag = '🇰🇷 Manhwa';
      else if (manga.origLang === 'zh') flag = '🇨🇳 Manhua';

      const fallback = generarPortadaSVG(manga.title || 'Manga', manga.origLang || 'ja', 'Manga');
      const safeTitle = escHtml(manga.title || 'Manga');
      const card = document.createElement('div');
      card.className = 'card-h fade-in';
      card.onclick = () => { void uiHooks.abrirDetalleManga(manga); };
      card.innerHTML = `
        <div class="card-h-img-wrap">
          <div class="manga-flag-badge">${escHtml(flag)}</div>
          <img src="${escHtml(safeImg(manga.cover, fallback))}" alt="${safeTitle}" loading="lazy" onerror="this.onerror=null; this.src='${fallback}';">
          <div class="manga-status-badge">${escHtml(manga.status || 'En Emisión')}</div>
        </div>
        <div class="card-h-title">${safeTitle}</div>
      `;
      container.appendChild(card);
    });
  }
}

export { cambiarTab };
