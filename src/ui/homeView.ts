import {
  ANILIST_URL,
  CacheManager,
  FavoritesManager,
  HistoryManager,
  MangaFavoritesManager,
  cambiarTab,
  escHtml,
  generarPortadaSVG,
  safeImg,
  showToast,
  state,
  uiHooks
} from './appState.ts';
import { computeProgressPercent, formatPlaybackTime } from '../utils/playerResume.ts';
import { AniListMangaService } from './mangaCatalogView.ts';
import {
  JKANIME_FILTER_CONFIG,
  JKANIME_GENRES,
  JKANIME_QUICK_GENRE_IDS,
  SearchDirectoryFilters,
  countActiveDirectoryFilters,
  createDefaultDirectoryFilters,
  filterMediaByLetter,
  getSupportedYears,
  hasActiveDirectoryFilters,
  mapDirectoryFiltersToAniListVariables
} from '../utils/directoryFilters.ts';

export async function cargarCatalogoHome(): Promise<void> {
  const cacheKey = 'home_catalog_v2';
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
      title { romaji english native }
      coverImage { extraLarge large color }
      bannerImage
      episodes
      format
      status
      genres
      description
      nextAiringEpisode { episode timeUntilAiring }
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
  }
}

export function renderHomeContent(data: any): void {
  if (data.trending?.media?.length > 0) {
    renderHero(data.trending.media[0]);
    renderHScroll('lista-tendencias', data.trending.media);
  }
  if (data.popular?.media) renderHScroll('lista-populares', data.popular.media);
  if (data.releasing?.media) renderHScroll('lista-emision', data.releasing.media);
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

export function onSearchDirectoryFilterChange(key: keyof SearchDirectoryFilters, value: string): void {
  (searchDirectoryFilters as any)[key] = value;
  searchDirectoryFilters.page = 1;
  syncSearchFilterControlsUI();

  const input = document.getElementById('input-busqueda') as HTMLInputElement | null;
  const term = input?.value?.trim() || '';
  if (shouldRunSearchForCurrentState(term)) {
    void realizarBusqueda(term, 1);
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
    void realizarBusqueda(term, 1);
  } else {
    renderDefaultSearchPrompt();
  }
}

export function resetSearchFilters(): void {
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
  void realizarBusqueda(term, targetPage);
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
    void realizarBusqueda(term, 1);
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
    void realizarBusqueda(query, 1);
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
  }, 350);
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
          title { romaji english native }
          coverImage { extraLarge large color }
          bannerImage
          format
          status
          episodes
          nextAiringEpisode { episode timeUntilAiring }
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

  const runQuery = async (vars: Record<string, any>) => {
    const r = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: gql, variables: vars })
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data?.Page || null;
  };

  const pageData = await runQuery(cleanVars);
  let rawMedia: any[] = pageData?.media || [];
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
  }

  const pInfo = pageData?.pageInfo || {};
  return {
    items: filtered,
    pageInfo: {
      currentPage: Number(pInfo.currentPage || cleanVars.page || 1),
      lastPage: Number(pInfo.lastPage || 1),
      hasNextPage: Boolean(pInfo.hasNextPage),
      total: Number(pInfo.total || filtered.length)
    }
  };
}

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
    const animePromise = includeAnime
      ? fetchAniListAnimeDirectory(
          mapDirectoryFiltersToAniListVariables(filtersForQuery, effectiveSearch, 'ANIME'),
          filtersForQuery.letter,
          effectiveSearch
        ).catch(() => ({ items: [], pageInfo: { currentPage: page, lastPage: 1, hasNextPage: false, total: 0 } }))
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

export function cambiarSubTabFavoritos(tipo: 'anime' | 'manga', el: HTMLElement | null = null): void {
  subTabFavoritos = tipo;
  document.querySelectorAll('#favoritos-tabs .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderFavoritos();
}

export function renderFavoritos(): void {
  const container = document.getElementById('resultados-favoritos');
  if (!container) return;
  container.innerHTML = '';

  if (subTabFavoritos === 'anime') {
    const list = FavoritesManager.getAll();
    if (list.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding:50px 20px;">
          <div style="font-size:44px; margin-bottom:12px;">🎬</div>
          <div style="font-weight:700; font-size:16px; color:white; margin-bottom:6px;">No tienes animes guardados</div>
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:18px;">Guarda tus animes preferidos para verlos cuando quieras.</div>
          <button class="chip active" style="padding:10px 24px; font-weight:700;" onclick="cambiarTab('inicio')">✨ Explorar Animes</button>
        </div>
      `;
      return;
    }
    list.forEach(anime => {
      const title = escHtml(anime.title?.english || anime.title?.romaji || 'Anime');
      const fallback = generarPortadaSVG(anime.title?.english || anime.title?.romaji || 'Anime', 'ja', 'Anime');
      const img = escHtml(safeImg(anime.coverImage?.large || anime.coverImage?.extraLarge, fallback));
      const totalEps = escHtml(anime.episodes || anime.nextAiringEpisode?.episode || '?');
      const card = document.createElement('div');
      card.className = 'card-h fade-in';
      card.onclick = () => { void uiHooks.abrirDetalle(anime); };
      card.innerHTML = `
        <div class="card-h-img-wrap">
          <img src="${img}" alt="${title}" loading="lazy" onerror="this.onerror=null; this.src='${fallback}';">
          <div class="ep-badge">${totalEps} EP</div>
        </div>
        <div class="card-h-title">${title}</div>
      `;
      container.appendChild(card);
    });
  } else {
    const list = MangaFavoritesManager.getAll();
    if (list.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding:50px 20px;">
          <div style="font-size:44px; margin-bottom:12px;">📖</div>
          <div style="font-weight:700; font-size:16px; color:white; margin-bottom:6px;">No tienes mangas guardados</div>
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:18px;">Guarda tus mangas y manhwas favoritos para acceder a sus capítulos.</div>
          <button class="chip active" style="padding:10px 24px; font-weight:700;" onclick="cambiarTab('lectura')">✨ Explorar Catálogo de Mangas</button>
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
