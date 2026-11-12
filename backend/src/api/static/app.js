// ==========================================================================
// ANIME HUB CINEMA - WEB STREAMING & GESTOR DE CAPÍTULOS
// ==========================================================================

// Estado Global de la Aplicación
const state = {
    currentTab: 'streaming',
    allLocalSeries: [],
    filteredSeries: [],
    currentCategory: 'all',
    searchQuery: '',
    sortMode: 'name_asc',
    currentLocalAnime: null,
    currentLocalSeasonIdx: 0,
    currentPlaying: null,
    watchProgress: {},
    progressSaveTimer: null,
    countdownTimer: null,
    lastCollectionVersion: null,
    isUpdatingCollection: false,

    // Estado para Catálogo Online
    currentOnlineAnime: null,
    currentOnlineSeasonIdx: 0,
    currentOnlineEpisode: 1,
    currentOnlineSources: [],
    selectedSourceIdx: 0,
    searchDebounceTimer: null
};

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initLocalStreaming();
    initCatalog();
    initOnlineSearch();
    initDownloads();
    initSync();
    initStatusPolling();
    initCollectionAutoRefresh();
    initKeyboardShortcuts();
    initRouting();
});

// Toast Helper
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3500);
}

// Escapado seguro de HTML para evitar inyección y rotura de comillas
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
    return escapeHtml(str);
}

// Normalizador de búsqueda insensible a acentos
function normalizeSearchText(text) {
    if (!text) return '';
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Feedback visual On-Screen Display (OSD) para atajos del reproductor
let osdTimer = null;
function showCinemaOSD(iconClass, text) {
    const osd = document.getElementById('cinema-osd');
    if (!osd) return;
    osd.innerHTML = `<i class="${iconClass}"></i> <span>${escapeHtml(text)}</span>`;
    osd.style.display = 'flex';
    osd.style.animation = 'none';
    void osd.offsetWidth; // Forzar reflow para reiniciar animación
    osd.style.animation = 'osd-fade 0.75s ease forwards';
    if (osdTimer) clearTimeout(osdTimer);
    osdTimer = setTimeout(() => {
        osd.style.display = 'none';
    }, 750);
}

// ==========================================================================
// 1. GESTIÓN DE PESTAÑAS & HASH ROUTING
// ==========================================================================
function updateHashRoute(route) {
    if (window.location.hash !== route) {
        history.pushState(null, '', route);
    }
}

function switchTab(targetTab, updateHash = true) {
    state.currentTab = targetTab;
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navItems.forEach(i => i.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));

    const targetNav = document.querySelector(`.nav-item[data-tab="${targetTab}"]`);
    if (targetNav) targetNav.classList.add('active');

    const activePane = document.getElementById(`tab-${targetTab}`);
    if (activePane) activePane.classList.add('active');

    if (updateHash) {
        updateHashRoute(`#${targetTab}`);
    }

    if (targetTab === 'streaming') {
        fetchLocalCollection();
    } else if (targetTab === 'catalog') {
        fetchOnlineCatalog();
    }
}

function initTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.dataset.tab;
            closeCinemaPlayer(false);
            closeSeriesPage(false);
            switchTab(targetTab, true);
        });
    });
}

function initRouting() {
    window.addEventListener('popstate', handleHashRouting);
    window.addEventListener('hashchange', handleHashRouting);
    // Handle initial hash on page load
    setTimeout(() => {
        handleHashRouting();
    }, 100);
}

async function handleHashRouting() {
    const hash = window.location.hash || '#streaming';
    if (hash === '#streaming' || hash === '#catalog' || hash === '#downloads' || hash === '#sync') {
        const tab = hash.replace('#', '');
        closeCinemaPlayer(false);
        closeSeriesPage(false);
        switchTab(tab, false);
    } else if (hash.startsWith('#series/')) {
        const relPath = decodeURIComponent(hash.replace('#series/', ''));
        closeCinemaPlayer(false);
        openLocalSeriesPage(relPath, false);
    } else if (hash.startsWith('#watch/')) {
        const rest = hash.replace('#watch/', '');
        const [encodedPath, query] = rest.split('?');
        const relPath = decodeURIComponent(encodedPath);
        const params = new URLSearchParams(query || '');
        const sNum = parseInt(params.get('s') || '1');
        const epNum = parseInt(params.get('ep') || '1');
        const initialTime = parseFloat(params.get('t') || '0');
        openAndPlayEpisode(relPath, sNum, epNum, initialTime);
    }
}

async function openAndPlayEpisode(relPath, sNum, epNum, initialTime = 0) {
    await openLocalSeriesPage(relPath, false);
    if (state.currentLocalAnime && state.currentLocalAnime.seasons) {
        const season = state.currentLocalAnime.seasons.find(s => s.season_number === sNum) || state.currentLocalAnime.seasons[0];
        if (season && season.episodes && season.episodes.length > 0) {
            const ep = season.episodes.find(e => e.episode_number === epNum) || season.episodes[0];
            if (ep) {
                playLocalEpisode(ep.rel_file_path, ep.title, season.season_number, ep.episode_number, season.episodes, state.currentLocalAnime.title, relPath, false, initialTime);
            }
        }
    }
}

// ==========================================================================
// 2. MI STREAMING WEB (COLECCIÓN LOCAL HDD)
// ==========================================================================
function initLocalStreaming() {
    fetchLocalCollection();

    // Filtros por Categoría (Pills)
    const pills = document.querySelectorAll('.cat-pill');
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            pills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.currentCategory = pill.dataset.cat;
            applyLocalFilters();
        });
    });

    // Búsqueda en Vivo
    const searchInput = document.getElementById('local-search-input');
    const clearBtn = document.getElementById('local-clear-btn');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            state.searchQuery = searchInput.value.trim().toLowerCase();
            if (clearBtn) clearBtn.style.display = state.searchQuery ? 'block' : 'none';
            applyLocalFilters();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            state.searchQuery = '';
            applyLocalFilters();
            searchInput.focus();
        });
    }

    // Selector de Orden
    const sortSelect = document.getElementById('local-sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            state.sortMode = sortSelect.value;
            applyLocalFilters();
        });
    }
}

async function fetchLocalCollection(showNotification = false) {
    try {
        const [collRes, progRes, verRes] = await Promise.all([
            fetch('/api/local/collection'),
            fetch('/api/local/progress'),
            fetch('/api/local/collection/version')
        ]);

        if (collRes.ok) {
            const collData = await collRes.json();
            state.allLocalSeries = collData.series || [];

            // Actualizar estado del indicador de disco HDD
            const hddText = document.getElementById('hdd-state-text');
            const hddIndicator = document.getElementById('hdd-indicator');
            if (hddText) hddText.textContent = `Conectado (${state.allLocalSeries.length} series)`;
            if (hddIndicator) {
                hddIndicator.className = 'hdd-indicator online';
                hddIndicator.title = 'Disco E:\\ conectado y accesible';
            }

            // Actualizar conteos en badges de las pills
            updateCategoryCounts();

            // Configurar Hero Banner con serie destacada
            setupLocalHeroBanner();
        } else {
            const hddText = document.getElementById('hdd-state-text');
            const hddIndicator = document.getElementById('hdd-indicator');
            if (hddText) hddText.textContent = 'Error de conexión';
            if (hddIndicator) {
                hddIndicator.className = 'hdd-indicator offline';
                hddIndicator.title = 'No se pudo comunicar con el servidor local';
            }
        }

        if (progRes.ok) {
            state.watchProgress = await progRes.json();
            renderContinueWatchingShelf();
        }

        if (verRes && verRes.ok) {
            const verData = await verRes.json();
            if (verData.version) {
                state.lastCollectionVersion = verData.version;
            }
        }

        applyLocalFilters();

        if (showNotification) {
            showToast("🎉 ¡Biblioteca actualizada en tiempo real!", "success");
        }
    } catch (e) {
        console.error("Error al cargar colección local:", e);
        const hddText = document.getElementById('hdd-state-text');
        const hddIndicator = document.getElementById('hdd-indicator');
        if (hddText) hddText.textContent = 'Desconectado';
        if (hddIndicator) {
            hddIndicator.className = 'hdd-indicator offline';
            hddIndicator.title = 'Error al consultar biblioteca local';
        }
    }
}

function updateCategoryCounts() {
    const counts = {
        all: state.allLocalSeries.length,
        heavy_ecchi: state.allLocalSeries.filter(s => s.category_id === 'heavy_ecchi').length,
        erotico: state.allLocalSeries.filter(s => s.category_id === 'erotico').length,
        animefesta: state.allLocalSeries.filter(s => s.category_id === 'animefesta').length,
        hentai: state.allLocalSeries.filter(s => s.category_id === 'hentai').length,
        general: state.allLocalSeries.filter(s => s.category_id === 'general').length
    };

    const elAll = document.getElementById('cat-count-all');
    const elHeavy = document.getElementById('cat-count-heavy');
    const elErotico = document.getElementById('cat-count-erotico');
    const elFesta = document.getElementById('cat-count-festa');
    const elHentai = document.getElementById('cat-count-hentai');
    const elGen = document.getElementById('cat-count-general');

    if (elAll) elAll.textContent = counts.all;
    if (elHeavy) elHeavy.textContent = counts.heavy_ecchi;
    if (elErotico) elErotico.textContent = counts.erotico;
    if (elFesta) elFesta.textContent = counts.animefesta;
    if (elHentai) elHentai.textContent = counts.hentai;
    if (elGen) elGen.textContent = counts.general;
}

function setupLocalHeroBanner() {
    if (!state.allLocalSeries.length) return;

    // Buscar una serie emblemática con backdrop (ej. DxD, Shinmai, Reviewers, etc.)
    const candidates = ['High School DxD', 'Shinmai Maou no Testament', 'Ishuzoku Reviewers', 'Kaifuku Jutsushi no Yarinaoshi', 'To LOVE-Ru', 'Monster Musume no Iru Nichijou'];
    let featured = state.allLocalSeries.find(s => candidates.includes(s.name) && s.has_backdrop);
    if (!featured) featured = state.allLocalSeries.find(s => s.has_backdrop) || state.allLocalSeries[0];

    const heroBanner = document.getElementById('local-hero-banner');
    const heroBg = document.getElementById('local-hero-bg');
    const heroTitle = document.getElementById('local-hero-title');
    const heroPlot = document.getElementById('local-hero-plot');
    const heroCat = document.getElementById('local-hero-cat');
    const heroBtn = document.getElementById('local-hero-play-btn');

    if (heroBanner && featured) {
        heroBg.style.backgroundImage = `url(${featured.backdrop_url})`;
        heroTitle.textContent = featured.name;
        heroPlot.textContent = featured.plot || 'Disfruta de esta serie en calidad Blu-ray Master sin censura directamente desde tu colección.';
        heroCat.textContent = featured.category_label.toUpperCase();
        heroBtn.onclick = () => openLocalSeriesPage(featured.rel_path);
        heroBanner.style.display = 'flex';
    }
}

function renderContinueWatchingShelf() {
    const shelf = document.getElementById('continue-watching-section');
    const grid = document.getElementById('continue-watching-grid');
    if (!shelf || !grid) return;

    const entries = Object.entries(state.watchProgress)
        .filter(([_, v]) => v && v.percent > 0 && v.percent < 95)
        .sort((a, b) => (b[1].updated_at || 0) - (a[1].updated_at || 0))
        .slice(0, 6);

    if (entries.length === 0) {
        shelf.style.display = 'none';
        return;
    }

    shelf.style.display = 'block';
    grid.innerHTML = '';

    entries.forEach(([relPath, p]) => {
        const series = state.allLocalSeries.find(s => s.rel_path === relPath);
        const title = series ? series.name : relPath.split('/').pop();
        const posterUrl = series ? series.poster_url : `/api/local/art?path=${encodeURIComponent(relPath)}&type=poster`;
        const sNum = p.season_number || 1;
        const epNum = p.episode_number || 1;
        const pct = Math.max(0, Math.min(100, Math.round(p.percent || 0)));

        const card = document.createElement('div');
        card.className = 'continue-card';
        card.innerHTML = `
            <div class="continue-poster-box">
                <img src="${escapeAttr(posterUrl)}" alt="${escapeAttr(title)}" loading="lazy" onerror="this.onerror=null; this.src='/static/icon-512.png';">
                <div class="continue-play-overlay"><i class="fa-solid fa-play"></i></div>
            </div>
            <div class="continue-info">
                <h4 class="continue-title" title="${escapeAttr(title)}">${escapeHtml(title)}</h4>
                <span class="continue-ep">T${sNum} · Ep ${epNum}</span>
                <div class="episode-progress-bar">
                    <div class="episode-progress-fill" style="width: ${pct}%;"></div>
                </div>
            </div>
        `;
        card.onclick = () => openAndPlayEpisode(relPath, sNum, epNum);
        grid.appendChild(card);
    });
}

function applyLocalFilters() {
    let result = [...state.allLocalSeries];

    // 1. Filtro de Categoría
    if (state.currentCategory !== 'all') {
        result = result.filter(s => s.category_id === state.currentCategory);
    }

    // 2. Filtro de Búsqueda insensible a mayúsculas y acentos
    if (state.searchQuery) {
        const normQ = normalizeSearchText(state.searchQuery);
        result = result.filter(s => {
            const matchName = normalizeSearchText(s.name).includes(normQ);
            const matchOrig = s.original_title && normalizeSearchText(s.original_title).includes(normQ);
            const matchGenre = s.genres && s.genres.some(g => normalizeSearchText(g).includes(normQ));
            return matchName || matchOrig || matchGenre;
        });
    }

    // 3. Ordenación natural
    if (state.sortMode === 'name_asc') {
        result.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
    } else if (state.sortMode === 'eps_desc') {
        result.sort((a, b) => (b.total_episodes || 0) - (a.total_episodes || 0));
    } else if (state.sortMode === 'rating_desc') {
        result.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
    }

    state.filteredSeries = result;
    renderLocalSeriesGrid();
}

function renderLocalSeriesGrid() {
    const grid = document.getElementById('local-series-grid');
    const countEl = document.getElementById('visible-series-count');
    if (!grid) return;

    if (countEl) countEl.textContent = state.filteredSeries.length;
    grid.innerHTML = '';

    if (state.filteredSeries.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
                <i class="fa-solid fa-film-slash" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.4;"></i>
                <h3>No se encontraron animes con este criterio</h3>
                <p style="font-size: 0.9rem;">Prueba buscando con otro término o seleccionando otra categoría.</p>
            </div>
        `;
        return;
    }

    state.filteredSeries.forEach(series => {
        const card = document.createElement('div');
        card.className = 'series-card';

        // Badge color por categoría
        let catColor = '#4facfe';
        if (series.category_id === 'hentai') catColor = '#a855f7';
        else if (series.category_id === 'heavy_ecchi') catColor = '#ff793f';
        else if (series.category_id === 'erotico') catColor = '#ff477e';
        else if (series.category_id === 'animefesta') catColor = '#e056fd';
        else if (series.category_id === 'general') catColor = '#3b82f6';

        const ratingText = series.rating ? `★ ${series.rating}` : '';
        const seasonsText = series.total_seasons === 1 ? '1 Temporada' : `${series.total_seasons} Temporadas`;
        const catLabel = (series.category_label || '').split(' ')[0];

        card.innerHTML = `
            <div class="series-card-poster-wrapper">
                <img class="series-card-poster" src="${escapeAttr(series.poster_url)}" alt="${escapeAttr(series.name)}" loading="lazy" onerror="this.onerror=null; this.src='/static/icon-512.png';">
                <span class="series-card-badge-top" style="background: ${catColor};">${escapeHtml(catLabel)}</span>
                <span class="series-card-badge-quality">BD 1080p</span>
                <div class="series-card-play-overlay">
                    <div class="series-card-play-btn"><i class="fa-solid fa-play"></i></div>
                </div>
            </div>
            <div class="series-card-info">
                <h4 class="series-card-title" title="${escapeAttr(series.name)}">${escapeHtml(series.name)}</h4>
                <div class="series-card-meta">
                    <span><i class="fa-solid fa-tv"></i> ${series.total_episodes} eps</span>
                    ${ratingText ? `<span class="series-card-rating">${escapeHtml(ratingText)}</span>` : `<span>${escapeHtml(seasonsText)}</span>`}
                </div>
            </div>
        `;

        card.onclick = () => openLocalSeriesPage(series.rel_path);
        grid.appendChild(card);
    });
}

// ==========================================================================
// 3. PÁGINA DEDICADA DE LA SERIE (SERIES DETAIL PAGE)
// ==========================================================================
async function openLocalSeriesPage(relPath, updateHash = true) {
    const modal = document.getElementById('series-page-modal');
    if (!modal) return;

    modal.onclick = (e) => {
        if (e.target === modal) closeSeriesPage();
    };

    if (updateHash) {
        updateHashRoute(`#series/${encodeURIComponent(relPath)}`);
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Estado inicial de carga
    document.getElementById('series-title').textContent = 'Cargando serie...';
    document.getElementById('series-plot').textContent = 'Consultando biblioteca...';
    document.getElementById('local-episodes-grid').innerHTML = '<p style="color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Cargando capítulos...</p>';

    try {
        const res = await fetch(`/api/local/anime/details?path=${encodeURIComponent(relPath)}`);
        if (!res.ok) throw new Error('No se pudo cargar la información del anime');
        const data = await res.json();
        state.currentLocalAnime = data;
        state.currentLocalSeasonIdx = 0;

        // Backdrop y Portada
        const backdropEl = document.getElementById('series-backdrop-img');
        const coverEl = document.getElementById('series-cover-img');
        backdropEl.style.backgroundImage = `url("${escapeAttr(data.backdrop_url)}")`;
        coverEl.src = data.poster_url;

        // Metadatos
        document.getElementById('series-title').textContent = data.title;
        document.getElementById('series-orig-title').textContent = data.original_title || '';
        document.getElementById('series-rating').innerHTML = data.rating ? `<i class="fa-solid fa-star" style="color:#ffd166;"></i> ${data.rating}` : `<i class="fa-solid fa-star" style="color:#ffd166;"></i> N/A`;
        document.getElementById('series-year').innerHTML = `<i class="fa-regular fa-calendar"></i> ${data.year || 'Emisión BD'}`;
        document.getElementById('series-studio').innerHTML = `<i class="fa-solid fa-building"></i> ${data.studio || 'Animation Studio'}`;
        document.getElementById('series-plot').textContent = data.plot || 'Esta serie cuenta con una adaptación completa en alta definición y sin censura.';

        // Géneros
        const tagsRow = document.getElementById('series-tags-row');
        tagsRow.innerHTML = '';
        if (data.genres && data.genres.length > 0) {
            data.genres.forEach(g => {
                const span = document.createElement('span');
                span.className = 'tag-genre';
                span.textContent = g;
                tagsRow.appendChild(span);
            });
        }

        // Configurar botón primario de Reproducción (Reanudar o Empezar)
        const primaryPlayBtn = document.getElementById('series-primary-play-btn');
        const btnText = document.getElementById('series-play-btn-text');
        const savedProgress = state.watchProgress[relPath];

        if (savedProgress && savedProgress.episode_number) {
            btnText.textContent = `Continuar: T${savedProgress.season_number} Ep ${savedProgress.episode_number}`;
        } else {
            btnText.textContent = 'Empezar Capítulo 1';
        }

        primaryPlayBtn.onclick = () => {
            // Empezar el primer episodio o el guardado
            let targetSeasonIdx = 0;
            if (savedProgress && data.seasons) {
                const foundIdx = data.seasons.findIndex(s => s.season_number === savedProgress.season_number);
                if (foundIdx !== -1) targetSeasonIdx = foundIdx;
            }
            const season = data.seasons[targetSeasonIdx] || data.seasons[0];
            if (season && season.episodes && season.episodes.length > 0) {
                const targetEp = savedProgress ? season.episodes.find(e => e.episode_number === savedProgress.episode_number) || season.episodes[0] : season.episodes[0];
                playLocalEpisode(targetEp.rel_file_path, targetEp.title, season.season_number, targetEp.episode_number, season.episodes, data.title, data.rel_path);
            }
        };

        // Renderizar Chips de Temporadas
        renderSeasonChips();

        // Renderizar Capítulos de la temporada activa
        renderLocalEpisodesGrid();
    } catch (e) {
        showToast('Error al abrir la serie', 'error');
        closeSeriesPage();
    }
}

function closeSeriesPage(updateHash = true) {
    const modal = document.getElementById('series-page-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    state.currentLocalAnime = null;
    if (updateHash) {
        updateHashRoute('#streaming');
    }
}

function renderSeasonChips() {
    const container = document.getElementById('seasons-tab-chips');
    if (!container || !state.currentLocalAnime) return;
    container.innerHTML = '';

    const seasons = state.currentLocalAnime.seasons || [];
    seasons.forEach((season, idx) => {
        const btn = document.createElement('button');
        btn.className = `season-chip ${idx === state.currentLocalSeasonIdx ? 'active' : ''}`;
        btn.innerHTML = `${season.season_name} <span style="opacity:0.75; font-size:0.8rem;">(${season.episodes.length} eps)</span>`;
        btn.onclick = () => {
            state.currentLocalSeasonIdx = idx;
            document.querySelectorAll('.season-chip').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            renderLocalEpisodesGrid();
        };
        container.appendChild(btn);
    });
}

function cleanDisplayFilename(filename) {
    if (!filename) return '';
    let name = filename.replace(/\.(mp4|mkv|avi)$/i, '');
    name = name.replace(/\[.*?\]|\(.*?\)/g, '');
    name = name.replace(/_/g, ' ');
    name = name.replace(/\s+/g, ' ').trim();
    return name || filename;
}

function renderLocalEpisodesGrid() {
    const grid = document.getElementById('local-episodes-grid');
    const countText = document.getElementById('episodes-count-text');
    if (!grid || !state.currentLocalAnime) return;

    const season = state.currentLocalAnime.seasons[state.currentLocalSeasonIdx];
    if (!season || !season.episodes || season.episodes.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted); padding: 2rem; text-align: center;"><i class="fa-solid fa-folder-open"></i> No hay capítulos disponibles en esta temporada.</p>';
        return;
    }

    if (countText) countText.textContent = season.episodes.length;
    grid.innerHTML = '';

    const animeRelPath = state.currentLocalAnime.rel_path;
    const animeTitle = state.currentLocalAnime.title;
    const backdropUrl = state.currentLocalAnime.backdrop_url || state.currentLocalAnime.poster_url;

    season.episodes.forEach(ep => {
        const card = document.createElement('div');
        card.className = 'episode-card';

        // Revisar si tiene progreso guardado
        const saved = state.watchProgress[animeRelPath];
        const isCurrentEp = saved && saved.season_number === season.season_number && saved.episode_number === ep.episode_number;
        const progressPct = isCurrentEp ? (saved.percent || 0) : 0;
        const isWatched = progressPct >= 90;
        const qualityLabel = ep.quality || '1080p BD Master';
        const epThumb = ep.thumb_url || backdropUrl;
        const displayFilename = cleanDisplayFilename(ep.filename);

        card.innerHTML = `
            <div class="ep-card-visual">
                <div class="ep-card-backdrop" style="background-image: url('${escapeAttr(epThumb)}');"></div>
                <div class="ep-card-overlay"></div>
                <span class="ep-card-badge-quality"><i class="fa-solid fa-shield-halved"></i> ${escapeHtml(qualityLabel)}</span>
                <span class="ep-card-badge-ep">T${season.season_number} · E${ep.episode_number}</span>
                <div class="ep-card-play-hover">
                    <i class="fa-solid fa-play"></i>
                </div>
            </div>
            <div class="ep-card-body">
                <div class="ep-card-title-row">
                    <h4 class="ep-card-title" title="${escapeAttr(ep.title)}">${escapeHtml(ep.title)}</h4>
                    ${isWatched ? '<span class="ep-status-pill pill-watched"><i class="fa-solid fa-circle-check"></i> Visto</span>' : progressPct > 0 ? `<span class="ep-status-pill pill-progress"><i class="fa-solid fa-circle-play"></i> ${progressPct}%</span>` : '<span class="ep-status-pill pill-ready"><i class="fa-solid fa-circle-dot"></i> Listo</span>'}
                </div>
                <div class="ep-card-meta-row">
                    <span><i class="fa-solid fa-hard-drive"></i> ${ep.size_mb} MB</span>
                    <span><i class="fa-solid fa-tv"></i> Sin Censura</span>
                </div>
                ${progressPct > 0 && !isWatched ? `
                    <div class="episode-progress-bar">
                        <div class="episode-progress-fill" style="width: ${progressPct}%;"></div>
                    </div>
                ` : ''}
                <div class="ep-card-actions">
                    <div class="ep-actions-left">
                        <button class="ep-btn-play" type="button"><i class="fa-solid fa-play"></i> Reproducir</button>
                        <a class="ep-btn-external" href="${escapeAttr(ep.stream_url)}" target="_blank" title="Abrir video en nueva pestaña o reproductor externo" onclick="event.stopPropagation()">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </a>
                    </div>
                    <span class="ep-file-info" title="${escapeAttr(ep.filename)}"><i class="fa-solid fa-file-video"></i> ${escapeHtml(displayFilename)}</span>
                </div>
            </div>
        `;

        card.onclick = () => {
            playLocalEpisode(ep.rel_file_path, ep.title, season.season_number, ep.episode_number, season.episodes, animeTitle, animeRelPath);
        };

        grid.appendChild(card);
    });
}

// ==========================================================================
// 4. REPRODUCTOR CINEMATOGRÁFICO NATIVO HTML5 (HTTP RANGE STREAMING)
// ==========================================================================
function playLocalEpisode(relFilePath, episodeTitle, seasonNum, epNum, seasonEpisodes, animeTitle, animeRelPath, updateHash = true, explicitResumeTime = 0) {
    const modal = document.getElementById('cinema-player-modal');
    const video = document.getElementById('cinema-video');
    if (!modal || !video) return;

    modal.onclick = (e) => {
        if (e.target === modal) closeCinemaPlayer();
    };

    // Cancelar cualquier countdown previo y ocultar errores
    cancelNextCountdown();
    const errOverlay = document.getElementById('cinema-error-overlay');
    if (errOverlay) errOverlay.style.display = 'none';

    state.currentPlaying = {
        relFilePath,
        episodeTitle,
        seasonNum,
        epNum,
        seasonEpisodes: seasonEpisodes || [],
        animeTitle,
        animeRelPath
    };

    // Sincronizar temporada activa en la interfaz si está abierta
    if (state.currentLocalAnime && state.currentLocalAnime.seasons) {
        const foundSIdx = state.currentLocalAnime.seasons.findIndex(s => s.season_number === seasonNum);
        if (foundSIdx !== -1) {
            state.currentLocalSeasonIdx = foundSIdx;
            const chips = document.querySelectorAll('.season-chip');
            chips.forEach((c, idx) => {
                c.classList.toggle('active', idx === foundSIdx);
            });
        }
    }

    if (updateHash) {
        updateHashRoute(`#watch/${encodeURIComponent(animeRelPath)}?s=${seasonNum}&ep=${epNum}`);
    }

    // Títulos en la barra superior
    document.getElementById('cinema-anime-title').textContent = animeTitle;
    document.getElementById('cinema-ep-title').textContent = `Temporada ${seasonNum} - ${episodeTitle}`;

    // Actualizar botones Siguiente / Anterior con soporte entre temporadas
    updateCinemaNavButtons();

    // Actualizar lista en cajón lateral
    renderChapterDrawer();

    // Configurar Video
    video.pause();
    const streamUrl = `/api/local/stream?file=${encodeURIComponent(relFilePath)}`;
    video.src = streamUrl;
    video.load();

    // Reanudar tiempo guardado comprobando readyState para prevenir condición de carrera HTML5
    const saved = state.watchProgress[animeRelPath];
    let resumeTime = (saved && saved.season_number === seasonNum && saved.episode_number === epNum && saved.current_time > 10 && saved.percent < 90) ? saved.current_time : 0;
    if (explicitResumeTime > 0) {
        resumeTime = explicitResumeTime;
    }

    const seekToSavedTime = () => {
        if (resumeTime > 0 && video.duration && resumeTime < video.duration) {
            video.currentTime = resumeTime;
            showToast(`Reanudando en ${formatSeconds(resumeTime)}`, 'info');
        }
    };

    if (video.readyState >= 1) {
        seekToSavedTime();
    } else {
        video.addEventListener('loadedmetadata', seekToSavedTime, { once: true });
    }

    // Interacción directa en el video: click = play/pause con OSD, doble click = fullscreen
    video.onclick = (e) => {
        e.stopPropagation();
        // Evitar secuestro de clics sobre la barra de control nativa HTML5 en los 60px inferiores
        const rect = video.getBoundingClientRect();
        if (e.clientY >= rect.bottom - 60) return;

        // Si el cajón de capítulos está abierto, cerrarlo con un toque en el video
        const drawer = document.getElementById('cinema-chapter-drawer');
        if (drawer && drawer.style.display !== 'none') {
            drawer.style.display = 'none';
            return;
        }

        if (video.paused) {
            video.play().catch(() => {});
            showCinemaOSD('fa-solid fa-play', 'Reproducir');
        } else {
            video.pause();
            showCinemaOSD('fa-solid fa-pause', 'Pausa');
        }
    };
    video.ondblclick = (e) => {
        e.stopPropagation();
        const rect = video.getBoundingClientRect();
        if (e.clientY >= rect.bottom - 60) return;
        toggleFullscreenPlayer();
    };

    video.onplay = () => resetPlayerActivity();
    video.onpause = () => resetPlayerActivity();

    // Manejo de errores de decodificación y red
    video.onerror = () => {
        const err = video.error;
        let errMsg = "Error al reproducir el archivo de video.";
        if (err) {
            if (err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                errMsg = "Formato o códec no soportado directamente por este navegador.";
            } else if (err.code === MediaError.MEDIA_ERR_NETWORK) {
                errMsg = "Error de conexión de red durante el streaming.";
            } else if (err.code === MediaError.MEDIA_ERR_DECODE) {
                errMsg = "Error en la decodificación del flujo de video.";
            }
        }
        showToast(errMsg, 'error');
        const overlay = document.getElementById('cinema-error-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const msgEl = document.getElementById('cinema-error-msg');
            if (msgEl) msgEl.textContent = errMsg;
            const directLink = document.getElementById('cinema-error-direct-link');
            if (directLink) directLink.href = streamUrl;
        }
    };

    modal.style.display = 'flex';
    modal.classList.remove('idle');
    document.body.style.overflow = 'hidden';

    video.play().catch(() => {});

    // Iniciar auto-guardado de progreso cada 5 segundos
    if (state.progressSaveTimer) clearInterval(state.progressSaveTimer);
    state.progressSaveTimer = setInterval(() => {
        saveCurrentProgress();
    }, 5000);

    // Auto-advance cuando finaliza el episodio
    video.onended = () => {
        handleEpisodeEnded();
    };

    // Auto-hide controls al estar inactivo
    resetPlayerActivity();
}

function closeCinemaPlayer(updateHash = true) {
    const modal = document.getElementById('cinema-player-modal');
    const video = document.getElementById('cinema-video');
    if (!modal || !video) return;

    cancelNextCountdown();
    saveCurrentProgress();

    video.pause();
    video.src = '';
    modal.style.display = 'none';
    modal.classList.remove('idle');

    if (state.progressSaveTimer) clearInterval(state.progressSaveTimer);
    if (state.playerControlsTimer) clearTimeout(state.playerControlsTimer);

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }

    // Si la serie está abierta de fondo, actualizar la barra de progreso
    if (state.currentLocalAnime) {
        renderLocalEpisodesGrid();
        if (updateHash) {
            updateHashRoute(`#series/${encodeURIComponent(state.currentLocalAnime.rel_path)}`);
        }
    } else {
        document.body.style.overflow = 'auto';
        if (updateHash) {
            updateHashRoute('#streaming');
        }
    }
}

// Navegación inteligente de episodios (incluso cruzando temporadas)
function getAdjacentEpisodeInfo() {
    if (!state.currentPlaying) return { hasPrev: false, hasNext: false, prev: null, next: null };
    const { epNum, seasonNum, seasonEpisodes } = state.currentPlaying;
    const currentIdx = seasonEpisodes.findIndex(e => e.episode_number === epNum);

    let prev = null;
    let next = null;

    if (currentIdx > 0) {
        prev = { ep: seasonEpisodes[currentIdx - 1], seasonNum: seasonNum, episodes: seasonEpisodes };
    } else if (state.currentLocalAnime && state.currentLocalAnime.seasons) {
        const sIdx = state.currentLocalAnime.seasons.findIndex(s => s.season_number === seasonNum);
        if (sIdx > 0) {
            const prevSeason = state.currentLocalAnime.seasons[sIdx - 1];
            if (prevSeason && prevSeason.episodes && prevSeason.episodes.length > 0) {
                prev = { ep: prevSeason.episodes[prevSeason.episodes.length - 1], seasonNum: prevSeason.season_number, episodes: prevSeason.episodes };
            }
        }
    }

    if (currentIdx >= 0 && currentIdx < seasonEpisodes.length - 1) {
        next = { ep: seasonEpisodes[currentIdx + 1], seasonNum: seasonNum, episodes: seasonEpisodes };
    } else if (state.currentLocalAnime && state.currentLocalAnime.seasons) {
        const sIdx = state.currentLocalAnime.seasons.findIndex(s => s.season_number === seasonNum);
        if (sIdx >= 0 && sIdx < state.currentLocalAnime.seasons.length - 1) {
            const nextSeason = state.currentLocalAnime.seasons[sIdx + 1];
            if (nextSeason && nextSeason.episodes && nextSeason.episodes.length > 0) {
                next = { ep: nextSeason.episodes[0], seasonNum: nextSeason.season_number, episodes: nextSeason.episodes };
            }
        }
    }

    return {
        hasPrev: !!prev,
        hasNext: !!next,
        prev,
        next
    };
}

function updateCinemaNavButtons() {
    const prevBtn = document.getElementById('cinema-btn-prev');
    const nextBtn = document.getElementById('cinema-btn-next');
    const { hasPrev, hasNext } = getAdjacentEpisodeInfo();

    if (prevBtn) prevBtn.disabled = !hasPrev;
    if (nextBtn) nextBtn.disabled = !hasNext;
}

function playPreviousEpisode() {
    const { prev } = getAdjacentEpisodeInfo();
    if (prev && state.currentPlaying) {
        const { animeTitle, animeRelPath } = state.currentPlaying;
        playLocalEpisode(prev.ep.rel_file_path, prev.ep.title, prev.seasonNum, prev.ep.episode_number, prev.episodes, animeTitle, animeRelPath);
    }
}

function playNextEpisode() {
    const { next } = getAdjacentEpisodeInfo();
    if (next && state.currentPlaying) {
        const { animeTitle, animeRelPath } = state.currentPlaying;
        playLocalEpisode(next.ep.rel_file_path, next.ep.title, next.seasonNum, next.ep.episode_number, next.episodes, animeTitle, animeRelPath);
    }
}

function handleEpisodeEnded() {
    const { next } = getAdjacentEpisodeInfo();
    if (next) {
        showNextEpisodeOverlay(next.ep);
    } else {
        showToast('¡Has terminado todos los capítulos disponibles!', 'success');
    }
}

function showNextEpisodeOverlay(nextEp) {
    const overlay = document.getElementById('cinema-next-overlay');
    const titleEl = document.getElementById('next-overlay-title');
    const secEl = document.getElementById('next-timer-seconds');
    if (!overlay || !nextEp) return;

    resetPlayerActivity();
    if (titleEl) titleEl.textContent = nextEp.title;
    let secondsLeft = 5;
    if (secEl) secEl.textContent = secondsLeft;

    overlay.style.display = 'flex';

    if (state.countdownTimer) clearInterval(state.countdownTimer);
    state.countdownTimer = setInterval(() => {
        secondsLeft--;
        if (secEl) secEl.textContent = secondsLeft;
        if (secondsLeft <= 0) {
            cancelNextCountdown();
            playNextEpisode();
        }
    }, 1000);
}

function cancelNextCountdown() {
    if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
    }
    const overlay = document.getElementById('cinema-next-overlay');
    if (overlay) overlay.style.display = 'none';
}

function playNextEpisodeImmediately() {
    cancelNextCountdown();
    playNextEpisode();
}

function toggleFullscreenPlayer() {
    const playerModal = document.getElementById('cinema-player-modal');
    const video = document.getElementById('cinema-video');
    if (!playerModal) return;

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (playerModal.requestFullscreen) {
            playerModal.requestFullscreen().catch(() => {
                if (video && video.webkitEnterFullscreen) video.webkitEnterFullscreen();
            });
        } else if (playerModal.webkitRequestFullscreen) {
            playerModal.webkitRequestFullscreen();
        } else if (video && video.webkitEnterFullscreen) {
            video.webkitEnterFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}

function resetPlayerActivity() {
    const playerModal = document.getElementById('cinema-player-modal');
    if (!playerModal || playerModal.style.display === 'none') return;

    playerModal.classList.remove('idle');
    if (state.playerControlsTimer) clearTimeout(state.playerControlsTimer);

    const video = document.getElementById('cinema-video');
    if (video && !video.paused) {
        state.playerControlsTimer = setTimeout(() => {
            playerModal.classList.add('idle');
        }, 3000);
    }
}

function toggleChapterDrawer() {
    const drawer = document.getElementById('cinema-chapter-drawer');
    if (!drawer) return;
    drawer.style.display = drawer.style.display === 'none' ? 'flex' : 'none';
}

function renderChapterDrawer() {
    const list = document.getElementById('drawer-episodes-list');
    if (!list || !state.currentPlaying) return;
    list.innerHTML = '';

    const { seasonEpisodes, epNum, seasonNum, animeTitle, animeRelPath } = state.currentPlaying;
    seasonEpisodes.forEach(ep => {
        const item = document.createElement('div');
        const isActive = ep.episode_number === epNum;
        item.className = `drawer-ep-item ${isActive ? 'active' : ''}`;
        item.innerHTML = `
            <span>${ep.title}</span>
            <span style="font-size:0.75rem; opacity:0.8;">${isActive ? 'Reproduciendo' : `${ep.size_mb} MB`}</span>
        `;
        item.onclick = () => {
            toggleChapterDrawer();
            playLocalEpisode(ep.rel_file_path, ep.title, seasonNum, ep.episode_number, seasonEpisodes, animeTitle, animeRelPath);
        };
        list.appendChild(item);
    });
}

function saveCurrentProgress(useBeacon = false) {
    const video = document.getElementById('cinema-video');
    if (!video || !state.currentPlaying || !video.duration || isNaN(video.duration)) return;

    const payload = {
        anime_rel_path: state.currentPlaying.animeRelPath,
        season_number: state.currentPlaying.seasonNum,
        episode_number: state.currentPlaying.epNum,
        current_time: video.currentTime,
        duration: video.duration,
        episode_title: state.currentPlaying.episodeTitle
    };

    // Actualizar estado local en memoria
    state.watchProgress[payload.anime_rel_path] = {
        ...payload,
        percent: Math.round((payload.current_time / payload.duration) * 100),
        updated_at: Date.now() / 1000
    };

    const payloadStr = JSON.stringify(payload);
    if (useBeacon && navigator.sendBeacon) {
        try {
            const blob = new Blob([payloadStr], { type: 'application/json' });
            const sent = navigator.sendBeacon('/api/local/progress', blob);
            if (!sent) {
                navigator.sendBeacon('/api/local/progress', payloadStr);
            }
            return;
        } catch (e) {
            // fallback
        }
    }

    // Enviar asíncronamente al backend con keepalive
    fetch('/api/local/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr,
        keepalive: true
    }).catch(() => {});
}

function retryCinemaPlayback() {
    const overlay = document.getElementById('cinema-error-overlay');
    if (overlay) overlay.style.display = 'none';
    const video = document.getElementById('cinema-video');
    if (video && state.currentPlaying) {
        video.load();
        video.play().catch(() => {});
    }
}

function initKeyboardShortcuts() {
    // Escucha de actividad del puntero para restaurar controles si estaban idle
    const playerModal = document.getElementById('cinema-player-modal');
    if (playerModal) {
        ['mousemove', 'pointermove', 'click', 'touchstart'].forEach(evt => {
            playerModal.addEventListener(evt, resetPlayerActivity);
        });
    }

    // Guardado resiliente al cerrar o cambiar de pestaña (API Beacon)
    window.addEventListener('pagehide', () => saveCurrentProgress(true));
    window.addEventListener('beforeunload', () => saveCurrentProgress(true));

    window.addEventListener('keydown', (e) => {
        // No interceptar si el usuario está escribiendo en algún input o textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

        // No interceptar si hay modificadores activos (Ctrl, Alt, Meta) para permitir atajos del navegador
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // Escape global: cierra modales abiertos en orden de prioridad
        if (e.key === 'Escape') {
            const playerModal = document.getElementById('cinema-player-modal');
            if (playerModal && playerModal.style.display !== 'none') {
                closeCinemaPlayer();
                return;
            }
            const onlineModal = document.getElementById('online-anime-modal');
            if (onlineModal && onlineModal.style.display !== 'none') {
                closeOnlineAnimeModal();
                return;
            }
            const seriesModal = document.getElementById('series-page-modal');
            if (seriesModal && seriesModal.style.display !== 'none') {
                closeSeriesPage();
                return;
            }
        }

        const playerModal = document.getElementById('cinema-player-modal');
        const video = document.getElementById('cinema-video');
        if (!playerModal || playerModal.style.display === 'none' || !video) return;

        // Mantener controles visibles en cualquier interacción de teclado
        resetPlayerActivity();

        switch (e.key) {
            case ' ':
            case 'k':
            case 'K':
                e.preventDefault();
                if (video.paused) {
                    video.play().catch(() => {});
                    showCinemaOSD('fa-solid fa-play', 'Reproducir');
                } else {
                    video.pause();
                    showCinemaOSD('fa-solid fa-pause', 'Pausa');
                }
                break;
            case 'j':
            case 'J':
                e.preventDefault();
                video.currentTime = Math.max(0, video.currentTime - 10);
                showCinemaOSD('fa-solid fa-backward', '-10s');
                break;
            case 'l':
            case 'L':
                e.preventDefault();
                if (video.duration && !isNaN(video.duration)) {
                    video.currentTime = Math.min(video.duration, video.currentTime + 10);
                    showCinemaOSD('fa-solid fa-forward', '+10s');
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (video.duration && !isNaN(video.duration)) {
                    video.currentTime = Math.min(video.duration, video.currentTime + 10);
                    showCinemaOSD('fa-solid fa-forward', '+10s');
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                video.currentTime = Math.max(0, video.currentTime - 10);
                showCinemaOSD('fa-solid fa-backward', '-10s');
                break;
            case 'ArrowUp':
                e.preventDefault();
                video.volume = Math.min(1.0, Math.round((video.volume + 0.1) * 10) / 10);
                showCinemaOSD('fa-solid fa-volume-high', `${Math.round(video.volume * 100)}%`);
                break;
            case 'ArrowDown':
                e.preventDefault();
                video.volume = Math.max(0.0, Math.round((video.volume - 0.1) * 10) / 10);
                showCinemaOSD(video.volume === 0 ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-low', `${Math.round(video.volume * 100)}%`);
                break;
            case 'f':
            case 'F':
                e.preventDefault();
                toggleFullscreenPlayer();
                showCinemaOSD('fa-solid fa-expand', document.fullscreenElement ? 'Ventana' : 'Pantalla Completa');
                break;
            case 'm':
            case 'M':
                e.preventDefault();
                video.muted = !video.muted;
                showCinemaOSD(video.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high', video.muted ? 'Silencio' : 'Sonido');
                break;
            case 'n':
            case 'N':
                e.preventDefault();
                showCinemaOSD('fa-solid fa-forward-step', 'Siguiente');
                playNextEpisode();
                break;
            case 'p':
            case 'P':
                e.preventDefault();
                showCinemaOSD('fa-solid fa-backward-step', 'Anterior');
                playPreviousEpisode();
                break;
        }
    });
}

function formatSeconds(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// ==========================================================================
// 5. CATÁLOGO ONLINE & EXTERNO (COMPATIBILIDAD CON SERVICIOS ORIGINALES)
// ==========================================================================
function initCatalog() {
    // Inicializado si se cambia a la pestaña
}

async function fetchOnlineCatalog() {
    try {
        const res = await fetch('/api/catalog');
        if (!res.ok) throw new Error('Error al obtener catálogo online');
        const data = await res.json();
        renderOnlineCarousel('carousel-trending', data.trending || []);
        renderOnlineCarousel('carousel-releasing', data.releasing || []);
    } catch (e) {
        console.error("Error catálogo online:", e);
    }
}

function renderOnlineCarousel(containerId, animeList) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!animeList || animeList.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">No hay títulos disponibles.</p>';
        return;
    }

    animeList.forEach(anime => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        const title = anime.title?.romaji || anime.title?.english || anime.title_romaji || anime.title?.native || 'Sin título';
        const poster = anime.coverImage?.large || anime.coverImage?.extraLarge || anime.cover_image || '/static/icon-512.png';

        card.innerHTML = `
            <img class="card-poster" src="${escapeAttr(poster)}" alt="${escapeAttr(title)}" loading="lazy" onerror="this.onerror=null; this.src='/static/icon-512.png';">
            <div class="card-info">
                <h4 class="card-title" title="${escapeAttr(title)}">${escapeHtml(title)}</h4>
            </div>
        `;
        card.onclick = () => openOnlineAnimeModal(anime);
        container.appendChild(card);
    });
}

function initOnlineSearch() {
    const input = document.getElementById('catalog-search-input');
    const clearBtn = document.getElementById('catalog-clear-btn');
    const resultsSection = document.getElementById('search-results-section');
    const resultsGrid = document.getElementById('search-results-grid');

    if (!input) return;

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.style.display = 'none';
            if (resultsSection) resultsSection.style.display = 'none';
            input.focus();
        });
    }

    input.addEventListener('input', () => {
        const q = input.value.trim();
        if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

        if (state.searchDebounceTimer) clearTimeout(state.searchDebounceTimer);

        if (!q) {
            if (resultsSection) resultsSection.style.display = 'none';
            return;
        }

        state.searchDebounceTimer = setTimeout(async () => {
            try {
                if (resultsSection) resultsSection.style.display = 'block';
                if (resultsGrid) resultsGrid.innerHTML = '<p style="color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Buscando...</p>';
                const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                const data = await res.json();
                renderOnlineSearchResults(data.results || []);
            } catch (e) {}
        }, 350);
    });
}

function renderOnlineSearchResults(results) {
    const grid = document.getElementById('search-results-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!results || results.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                <i class="fa-solid fa-magnifying-glass" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 0.75rem;"></i>
                <p>No se encontraron animes con ese nombre.</p>
            </div>
        `;
        return;
    }

    results.forEach(anime => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        const title = anime.title?.romaji || anime.title?.english || anime.title_romaji || anime.title?.native || 'Sin título';
        const poster = anime.coverImage?.large || anime.coverImage?.extraLarge || anime.cover_image || '/static/icon-512.png';

        card.innerHTML = `
            <img class="card-poster" src="${escapeAttr(poster)}" alt="${escapeAttr(title)}" loading="lazy" onerror="this.onerror=null; this.src='/static/icon-512.png';">
            <div class="card-info">
                <h4 class="card-title" title="${escapeAttr(title)}">${escapeHtml(title)}</h4>
            </div>
        `;
        card.onclick = () => openOnlineAnimeModal(anime);
        grid.appendChild(card);
    });
}

function openOnlineAnimeModal(anime) {
    const modal = document.getElementById('online-anime-modal');
    if (!modal || !anime) return;

    const titleRomaji = anime.title?.romaji || anime.title_romaji || anime.title?.english || 'Anime';
    const titleEng = anime.title?.english || anime.title?.native || '';
    const poster = anime.coverImage?.extraLarge || anime.coverImage?.large || anime.cover_image || '/static/icon-512.png';
    const desc = anime.description ? anime.description.replace(/<[^>]*>?/gm, '').trim() : 'Sin sinopsis disponible.';

    const coverEl = document.getElementById('online-modal-cover');
    const titleEl = document.getElementById('online-modal-title');
    const subEl = document.getElementById('online-modal-sub');
    const descEl = document.getElementById('online-modal-desc');
    const badgesEl = document.getElementById('online-modal-badges');

    if (coverEl) coverEl.src = poster;
    if (titleEl) titleEl.textContent = titleRomaji;
    if (subEl) subEl.textContent = titleEng;
    if (descEl) descEl.textContent = desc;

    if (badgesEl) {
        badgesEl.innerHTML = '';
        if (anime.format) {
            const b = document.createElement('span');
            b.className = 'modal-badge';
            b.textContent = anime.format;
            badgesEl.appendChild(b);
        }
        if (anime.episodes) {
            const b = document.createElement('span');
            b.className = 'modal-badge';
            b.textContent = `${anime.episodes} eps`;
            badgesEl.appendChild(b);
        }
        if (anime.status) {
            const b = document.createElement('span');
            b.className = 'modal-badge';
            b.textContent = anime.status;
            badgesEl.appendChild(b);
        }
        if (anime.averageScore) {
            const b = document.createElement('span');
            b.className = 'modal-badge';
            b.innerHTML = `★ ${(anime.averageScore / 10).toFixed(1)}`;
            badgesEl.appendChild(b);
        }
    }

    const dlBtn = document.getElementById('online-modal-download-btn');
    if (dlBtn) {
        dlBtn.onclick = async () => {
            try {
                showToast(`Añadiendo a cola: ${titleRomaji}`, 'info');
                await fetch('/api/download_single', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: titleRomaji })
                });
                showToast(`¡Añadido a cola de descargas!: ${titleRomaji}`, 'success');
                closeOnlineAnimeModal();
                switchTab('downloads', true);
            } catch (e) {
                showToast('Error al programar descarga', 'error');
            }
        };
    }

    const searchLocalBtn = document.getElementById('online-modal-search-local-btn');
    if (searchLocalBtn) {
        searchLocalBtn.onclick = () => {
            closeOnlineAnimeModal();
            switchTab('streaming', true);
            const searchInput = document.getElementById('local-search-input');
            const clearBtn = document.getElementById('local-clear-btn');
            if (searchInput) {
                searchInput.value = titleRomaji;
                if (clearBtn) clearBtn.style.display = 'block';
                state.searchQuery = titleRomaji.toLowerCase();
                applyLocalFilters();
            }
        };
    }

    modal.onclick = (e) => {
        if (e.target === modal) closeOnlineAnimeModal();
    };

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeOnlineAnimeModal() {
    const modal = document.getElementById('online-anime-modal');
    if (modal) modal.style.display = 'none';
    if (!state.currentLocalAnime && (!state.currentPlaying || document.getElementById('cinema-player-modal').style.display === 'none')) {
        document.body.style.overflow = 'auto';
    }
}

// ==========================================================================
// 6. DESCARGAS Y COLA
// ==========================================================================
function initDownloads() {
    const form = document.getElementById('download-form');
    const input = document.getElementById('anime-name');
    const clearBtn = document.getElementById('clear-input-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    if (clearBtn && input) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            input.focus();
        });
    }

    if (form && input) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = input.value.trim();
            if (name) {
                try {
                    await fetch('/api/download_single', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name })
                    });
                    showToast(`Añadido a la cola: ${name}`, 'success');
                    input.value = '';
                    fetchQueue();
                } catch (e) {
                    showToast('Error al añadir a la cola', 'error');
                }
            }
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
            try {
                await fetch('/api/cancel', { method: 'POST' });
                showToast('Descarga detenida', 'error');
            } catch (e) {}
        });
    }
}

function initStatusPolling() {
    setInterval(() => {
        fetchStatus();
        fetchQueue();
    }, 2500);
}

function initCollectionAutoRefresh() {
    // 1. Conexión WebSocket para sincronización push en tiempo real
    initWebSocketSync();

    // 2. Polling ultra-ligero de respaldo cada 4 segundos para comprobar versión
    setInterval(checkCollectionVersion, 4000);

    // 3. Botón manual de Sincronizar en la barra de búsqueda
    initManualRefresh();
}

function initManualRefresh() {
    const btn = document.getElementById('btn-refresh-library');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const icon = btn.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
        btn.disabled = true;
        try {
            showToast('🔄 Sincronizando biblioteca con el disco...', 'info');
            const res = await fetch('/api/local/collection/refresh', { method: 'POST' });
            if (res.ok) {
                await fetchLocalCollection(false);
                showToast('✨ ¡Biblioteca actualizada y sincronizada!', 'success');
            } else {
                await fetchLocalCollection(false);
            }
        } catch (e) {
            await fetchLocalCollection(false);
        } finally {
            if (icon) icon.classList.remove('fa-spin');
            btn.disabled = false;
        }
    });
}

let activeWebSocket = null;
let wsReconnectTimer = null;

function initWebSocketSync() {
    if (activeWebSocket && (activeWebSocket.readyState === WebSocket.OPEN || activeWebSocket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/status`;
        activeWebSocket = new WebSocket(wsUrl);

        activeWebSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'collection_updated') {
                    handleLiveCollectionUpdate(data.message);
                } else if (data.type === 'handoff' && data.data) {
                    handleIncomingHandoff(data.data);
                } else if (data.message && data.message.includes('completado!')) {
                    setTimeout(checkCollectionVersion, 1200);
                }
            } catch (e) {}
        };

        activeWebSocket.onclose = () => {
            activeWebSocket = null;
            if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
            wsReconnectTimer = setTimeout(initWebSocketSync, 5000);
        };

        activeWebSocket.onerror = () => {
            try {
                if (activeWebSocket) activeWebSocket.close();
            } catch (e) {}
        };
    } catch (e) {}
}

async function checkCollectionVersion() {
    if (state.isUpdatingCollection) return;
    try {
        const res = await fetch('/api/local/collection/version');
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.version) return;

        if (state.lastCollectionVersion === null) {
            state.lastCollectionVersion = data.version;
            return;
        }

        if (data.version !== state.lastCollectionVersion) {
            state.lastCollectionVersion = data.version;
            await handleLiveCollectionUpdate("🎉 ¡Nuevos animes detectados en tu biblioteca!");
        }
    } catch (e) {}
}

async function handleLiveCollectionUpdate(msg) {
    if (state.isUpdatingCollection) return;
    state.isUpdatingCollection = true;
    try {
        await fetchLocalCollection(false);

        showToast(msg || "🎉 ¡Catálogo actualizado con nuevos animes!", "success");

        if (state.currentLocalAnime && state.currentLocalAnime.rel_path) {
            const rel = state.currentLocalAnime.rel_path;
            const res = await fetch(`/api/local/anime/details?path=${encodeURIComponent(rel)}`);
            if (res.ok) {
                const updated = await res.json();
                state.currentLocalAnime = updated;
                renderSeasonChips();
                renderLocalEpisodesGrid();
            }
        }
    } catch (e) {
        console.error("Error en auto-actualización en vivo:", e);
    } finally {
        state.isUpdatingCollection = false;
    }
}

async function fetchStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        const monitor = document.getElementById('download-monitor');
        const msgEl = document.getElementById('status-message');
        const pctEl = document.getElementById('status-percent');
        const fillEl = document.getElementById('progress-bar-fill');
        const spdEl = document.getElementById('status-speed');

        if (!monitor) return;
        if (!data.message || data.message === "Inactivo") {
            monitor.style.display = 'none';
        } else {
            monitor.style.display = 'block';
            msgEl.textContent = data.message;
            spdEl.innerHTML = data.speed ? `<i class="fa-solid fa-gauge-high"></i> ${data.speed}` : `<i class="fa-solid fa-gauge-high"></i> Activo`;
            if (data.percent > 0) {
                pctEl.textContent = data.percent.toFixed(1) + '%';
                fillEl.style.width = data.percent + '%';
            } else {
                pctEl.textContent = '0%';
                fillEl.style.width = '0%';
            }
        }
    } catch (e) {}
}

async function fetchQueue() {
    try {
        const response = await fetch('/api/queue');
        const data = await response.json();
        const container = document.getElementById('queue-container');
        const list = document.getElementById('queue-list');
        const countEl = document.getElementById('queue-count');

        if (!container || !list) return;
        const total = (data.current ? 1 : 0) + (data.queue ? data.queue.length : 0);
        if (total === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        if (countEl) countEl.textContent = total;
        list.innerHTML = '';

        if (data.current) {
            const li = document.createElement('li');
            li.className = 'queue-item active-queue-item';
            li.innerHTML = `<span><i class="fa-solid fa-spinner fa-spin" style="color:var(--primary);"></i> ${data.current}</span>`;
            list.appendChild(li);
        }

        if (data.queue) {
            data.queue.forEach(item => {
                const li = document.createElement('li');
                li.className = 'queue-item';
                li.innerHTML = `<span>${item}</span>`;
                list.appendChild(li);
            });
        }
    } catch (e) {}
}

// ==========================================================================
// 7. SINCRONIZADOR
// ==========================================================================
function initSync() {
    const form = document.getElementById('sync-form');
    const input = document.getElementById('sync-anime-name');
    const resultBox = document.getElementById('sync-result');

    if (form && input) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = input.value.trim();
            if (!name) return;

            resultBox.style.display = 'block';
            resultBox.innerHTML = '<p style="color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Sincronizando con AniList y MyAnimeList...</p>';

            try {
                const response = await fetch('/api/sync_franchise', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
                const data = await response.json();
                if (response.ok) {
                    showToast(`Franquicia sincronizada: ${name}`, 'success');
                    resultBox.innerHTML = `<p style="color:#34d399;"><i class="fa-solid fa-check"></i> ${data.message || 'Sincronizado correctamente'}</p>`;
                } else {
                    resultBox.innerHTML = `<p style="color:#ef4444;"><i class="fa-solid fa-circle-exclamation"></i> ${data.detail || 'Error en la sincronización'}</p>`;
                }
            } catch (e) {
                resultBox.innerHTML = `<p style="color:#ef4444;">Error de conexión con el servidor.</p>`;
            }
        });
    }
}

// Guardado de progreso al descargar/cerrar ventana
window.addEventListener('beforeunload', () => {
    const video = document.getElementById('cinema-video');
    if (!video || !state.currentPlaying || !video.duration || isNaN(video.duration)) return;
    const payload = JSON.stringify({
        anime_rel_path: state.currentPlaying.animeRelPath,
        season_number: state.currentPlaying.seasonNum,
        episode_number: state.currentPlaying.epNum,
        current_time: video.currentTime,
        duration: video.duration,
        episode_title: state.currentPlaying.episodeTitle
    });
    if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/local/progress', blob);
    }
});

// Exponer funciones globales para eventos inline del DOM
window.closeSeriesPage = closeSeriesPage;
window.openLocalSeriesPage = openLocalSeriesPage;
window.closeCinemaPlayer = closeCinemaPlayer;
window.playLocalEpisode = playLocalEpisode;
window.playPreviousEpisode = playPreviousEpisode;
window.playNextEpisode = playNextEpisode;
window.toggleChapterDrawer = toggleChapterDrawer;
window.toggleFullscreenPlayer = toggleFullscreenPlayer;
window.playNextEpisodeImmediately = playNextEpisodeImmediately;
window.cancelNextCountdown = cancelNextCountdown;
window.switchTab = switchTab;
window.openOnlineAnimeModal = openOnlineAnimeModal;
window.closeOnlineAnimeModal = closeOnlineAnimeModal;

