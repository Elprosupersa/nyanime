import {
  type AnimeListStatus,
  AnimeWatchedManager,
  AppPreferencesManager,
  CustomListsManager,
  DownloadManager,
  FavoritesManager,
  HistoryManager,
  MangaFavoritesManager,
  MangaHistoryManager,
  MangaReadStateManager,
  OAuthScrobbleManager,
  UserManager,
  cambiarTab,
  cerrarModales,
  escHtml,
  generarPortadaSVG,
  nWin,
  safeImg,
  setupTouchGestures,
  showToast,
  state,
  uiHooks
} from './appState.ts';
import { ensureModalsMounted, setupAvatarOptions } from './modals.ts';
import {
  ANIME_LIST_CATEGORIES,
  computeLibrarySummary,
  countWatchedForAnime,
  formatWatchDuration,
  getCategoryMeta,
  getRankProgress,
  normalizeAnimeListStatus
} from '../utils/profileStats.ts';
import {
  computeLibraryRatingsSummary,
  sanitizeCustomListIds,
  sanitizeUserScore
} from '../utils/libraryEnhancements.ts';
import { buildWeeklyDigestSummary } from '../utils/pushNotifications.ts';
import { extractRoomCodeFromSearch } from '../utils/watchTogether.ts';
import { formatRelativeTime } from '../utils/sanitize.ts';
import * as OfflineService from '../services/offline.ts';

type ProfileSectionTab = 'biblioteca' | 'actividad' | 'cuenta' | 'herramientas';
type ProfileLibraryFilter = 'all' | AnimeListStatus | 'manga' | `custom:${string}`;
type ProfileLibrarySort = 'recent' | 'score' | 'title' | 'progress';

let activeProfileTab: ProfileSectionTab = 'biblioteca';
let activeLibraryFilter: ProfileLibraryFilter = 'all';
let activeLibrarySort: ProfileLibrarySort = 'recent';
let librarySearchQuery = '';
let lastBackPressTime = 0;

let oauthProvidersStatusCache: {
  loaded: boolean;
  appUrl?: string;
  anilist?: { configured: boolean; callbackUrl?: string };
  mal?: { configured: boolean; callbackUrl?: string };
} = { loaded: false };
let oauthStatusFetching = false;

export function cambiarSubTabPerfil(tab: ProfileSectionTab): void {
  activeProfileTab = tab;
  document.querySelectorAll('#profile-section-tabs .profile-subtab-btn').forEach((btn) => {
    const el = btn as HTMLElement;
    el.classList.toggle('active', el.dataset.ptab === tab);
  });
  (['biblioteca', 'actividad', 'cuenta', 'herramientas'] as ProfileSectionTab[]).forEach((t) => {
    const panel = document.getElementById(`profile-panel-${t}`);
    if (panel) panel.classList.toggle('hide', t !== tab);
  });

  if (tab === 'herramientas') {
    void refreshProfileOfflineStats();
    renderWebPushStatusCard();
  } else if (tab === 'actividad') {
    renderProfileActivityPanel();
  } else if (tab === 'cuenta') {
    renderOAuthScrobbleCard();
  } else if (tab === 'biblioteca') {
    renderProfileLibraryPanel();
  }
}

export function setProfileLibraryFilter(filter: ProfileLibraryFilter): void {
  activeLibraryFilter = filter;
  renderProfileLibraryPanel();
}

export function onProfileLibrarySearchInput(val: string): void {
  librarySearchQuery = String(val || '').trim().toLowerCase();
  renderProfileLibraryPanel();
}

export function onProfileLibrarySortChange(val: string): void {
  if (val === 'title' || val === 'progress' || val === 'recent' || val === 'score') {
    activeLibrarySort = val;
  } else {
    activeLibrarySort = 'recent';
  }
  renderProfileLibraryPanel();
}

export function eliminarListaPersonalizada(listId: string): void {
  const listObj = CustomListsManager.getById(listId);
  if (!listObj) return;
  if (activeLibraryFilter === `custom:${listId}`) {
    activeLibraryFilter = 'all';
  }
  if (CustomListsManager.remove(listId)) {
    showToast(`Colección "${listObj.name}" eliminada`);
  }
}

export function cambiarCategoriaAnimeEnPerfil(animeId: number | string, newStatus: string): void {
  const list = FavoritesManager.getAll();
  const target = list.find((a) => String(a.id) === String(animeId));
  if (!target) return;
  FavoritesManager.setStatus(target, normalizeAnimeListStatus(newStatus, 'watching'));
  renderProfileUI();
}

export function eliminarAnimeDeBibliotecaPerfil(animeId: number | string): void {
  const list = FavoritesManager.getAll();
  const target = list.find((a) => String(a.id) === String(animeId));
  if (!target) return;
  FavoritesManager.toggle(target);
  renderProfileUI();
}

export function eliminarMangaDeBibliotecaPerfil(mangaId: number | string): void {
  const list = MangaFavoritesManager.getAll();
  const target = list.find((m) => String(m.id) === String(mangaId));
  if (!target) return;
  MangaFavoritesManager.toggle(target);
  renderProfileUI();
}

export function abrirAnimeDesdePerfil(animeId: number | string): void {
  const fav = FavoritesManager.getAll().find((a) => String(a.id) === String(animeId));
  if (fav) {
    void uiHooks.abrirDetalle(fav);
    return;
  }
  const hist = HistoryManager.getAll().find((h) => String(h.anime?.id) === String(animeId));
  if (hist?.anime) {
    void uiHooks.abrirDetalle(hist.anime);
  }
}

export function abrirMangaDesdePerfil(mangaId: number | string): void {
  const fav = MangaFavoritesManager.getAll().find((m) => String(m.id) === String(mangaId));
  if (fav) {
    void uiHooks.abrirDetalleManga(fav);
    return;
  }
  const hist = MangaHistoryManager.getAll().find((h) => String(h.manga?.id) === String(mangaId));
  if (hist?.manga) {
    void uiHooks.abrirDetalleManga(hist.manga);
  }
}

export async function conectarOAuth(provider: 'anilist' | 'mal'): Promise<void> {
  try {
    showToast(`Abriendo autorización OAuth con ${provider === 'anilist' ? 'AniList' : 'MyAnimeList'}...`);
    const session = await OAuthScrobbleManager.connectPopup(provider);
    if (session) {
      showToast(`Conectado a ${provider === 'anilist' ? 'AniList' : 'MyAnimeList'} como ${session.username || 'usuario'} ✓`);
    }
  } catch (err: any) {
    showToast(err?.message || `No se pudo conectar ${provider.toUpperCase()}`);
  }
}

export function desconectarOAuth(provider: 'anilist' | 'mal'): void {
  OAuthScrobbleManager.disconnect(provider);
  showToast(`Cuenta de ${provider === 'anilist' ? 'AniList' : 'MyAnimeList'} desconectada`);
}

export function toggleAutoScrobblePref(enabled: boolean): void {
  AppPreferencesManager.setAutoScrobble(Boolean(enabled));
  showToast(enabled ? 'Auto-scrobble bidireccional activado ✓' : 'Auto-scrobble desactivado');
}

function renderOAuthScrobbleCard(): void {
  const container = document.getElementById('oauth-scrobble-container');
  if (!container) return;

  if (!oauthProvidersStatusCache.loaded && !oauthStatusFetching) {
    oauthStatusFetching = true;
    void OAuthScrobbleManager.fetchProvidersStatus().then((status) => {
      oauthStatusFetching = false;
      oauthProvidersStatusCache = {
        loaded: true,
        appUrl: status?.appUrl,
        anilist: status?.anilist,
        mal: status?.mal
      };
      if (activeProfileTab === 'cuenta') {
        renderOAuthScrobbleCard();
      }
    });
  }

  const prefs = AppPreferencesManager.get();
  const alSession = OAuthScrobbleManager.getSession('anilist');
  const malSession = OAuthScrobbleManager.getSession('mal');
  const alCfg = oauthProvidersStatusCache.anilist;
  const malCfg = oauthProvidersStatusCache.mal;
  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const alCallback = alCfg?.callbackUrl || `${baseOrigin}/api/auth/anilist/callback`;
  const malCallback = malCfg?.callbackUrl || `${baseOrigin}/api/auth/mal/callback`;

  container.innerHTML = `
    <label class="reader-toggle-row" style="margin-bottom:10px;">
      <input type="checkbox" ${prefs.autoScrobble ? 'checked' : ''} onchange="toggleAutoScrobblePref(this.checked)">
      <span>Auto-scrobble al completar episodios o cambiar estado en biblioteca</span>
    </label>

    <div class="oauth-provider-list">
      <div class="oauth-provider-row">
        <div class="oauth-provider-meta">
          <div class="oauth-provider-name">AniList OAuth</div>
          <div class="oauth-provider-sub">${
            alSession
              ? `Conectado como <strong>${escHtml(alSession.username || 'AniList')}</strong> ✓`
              : alCfg && !alCfg.configured
                ? `Requiere variables <code>ANILIST_CLIENT_ID</code> / <code>SECRET</code>`
                : 'Sincroniza episodios, estado y nota 1–10'
          }</div>
          <div class="oauth-provider-cb">Callback: <code>${escHtml(alCallback)}</code></div>
        </div>
        <div class="oauth-provider-actions">
          ${
            alSession
              ? `<button type="button" class="oled-btn-secondary danger-tint" onclick="desconectarOAuth('anilist')">Desconectar</button>`
              : `<button type="button" class="oled-btn-secondary" onclick="conectarOAuth('anilist')">Conectar</button>`
          }
        </div>
      </div>

      <div class="oauth-provider-row">
        <div class="oauth-provider-meta">
          <div class="oauth-provider-name">MyAnimeList OAuth 2.0</div>
          <div class="oauth-provider-sub">${
            malSession
              ? `Conectado como <strong>${escHtml(malSession.username || 'MAL')}</strong> ✓`
              : malCfg && !malCfg.configured
                ? `Requiere variables <code>MAL_CLIENT_ID</code> / <code>SECRET</code>`
                : 'Sincroniza episodios, estado y nota 1–10'
          }</div>
          <div class="oauth-provider-cb">Callback: <code>${escHtml(malCallback)}</code></div>
        </div>
        <div class="oauth-provider-actions">
          ${
            malSession
              ? `<button type="button" class="oled-btn-secondary danger-tint" onclick="desconectarOAuth('mal')">Desconectar</button>`
              : `<button type="button" class="oled-btn-secondary" onclick="conectarOAuth('mal')">Conectar</button>`
          }
        </div>
      </div>
    </div>
  `;
}

export async function activarWebPush(): Promise<void> {
  if (!nWin.NyAnimePWA?.subscribeWebPush) {
    showToast('Servicio Web Push no disponible en este navegador.');
    return;
  }
  const fbUser = nWin.FirebaseAuth?.getCurrentUser ? nWin.FirebaseAuth.getCurrentUser() : null;
  const uid = fbUser?.uid || 'local-user';
  try {
    await nWin.NyAnimePWA.subscribeWebPush(uid);
    renderWebPushStatusCard();
  } catch (err: any) {
    showToast(err?.message || 'No se pudo activar Web Push.');
  }
}

export async function desconectarWebPush(): Promise<void> {
  if (!nWin.NyAnimePWA?.unsubscribeWebPush) return;
  await nWin.NyAnimePWA.unsubscribeWebPush();
  renderWebPushStatusCard();
}

export async function enviarPruebaWebPush(): Promise<void> {
  if (!nWin.NyAnimePWA?.sendTestPush) return;
  await nWin.NyAnimePWA.sendTestPush();
}

export function toggleWeeklySummaryPushPref(enabled: boolean): void {
  AppPreferencesManager.setWeeklySummaryPush(Boolean(enabled));
  showToast(enabled ? 'Resumen semanal Push activado ✓' : 'Resumen semanal Push desactivado');
}

export async function enviarResumenSemanalPush(): Promise<void> {
  const digest = buildWeeklyDigestSummary({
    history: HistoryManager.getAll(),
    mangaHistory: MangaHistoryManager.getAll(),
    favorites: FavoritesManager.getAll()
  });
  if (nWin.NyAnimePWA?.sendWeeklyDigestPush) {
    await nWin.NyAnimePWA.sendWeeklyDigestPush(digest.headline);
  } else {
    showToast(digest.headline);
  }
}

function renderWebPushStatusCard(): void {
  const container = document.getElementById('web-push-status-body');
  if (!container) return;
  const isSupported = Boolean(nWin.NyAnimePWA?.isPushSupported?.());
  const endpoint = nWin.NyAnimePWA?.getPushEndpoint?.() || null;
  const prefs = AppPreferencesManager.get();

  container.innerHTML = `
    <div class="push-status-card">
      <div class="push-status-badge ${endpoint ? 'active' : ''}">
        ${
          !isSupported
            ? '⚠️ Tu navegador actual no soporta Web Push'
            : endpoint
              ? '🔔 Notificaciones Push Activas en este dispositivo ✓'
              : '🔕 Notificaciones Push inactivas'
        }
      </div>
      <label class="reader-toggle-row" style="margin:8px 0;">
        <input type="checkbox" ${prefs.weeklySummaryPush ? 'checked' : ''} onchange="toggleWeeklySummaryPushPref(this.checked)">
        <span>Incluir resumen semanal de episodios y mangas leídos</span>
      </label>
      <div class="oled-btn-row" style="flex-wrap:wrap;">
        ${
          endpoint
            ? `
              <button type="button" class="oled-btn-secondary" onclick="enviarPruebaWebPush()">📲 Probar Push</button>
              <button type="button" class="oled-btn-secondary danger-tint" onclick="desconectarWebPush()">Desactivar Push</button>
            `
            : `<button type="button" class="oled-btn-secondary" ${!isSupported ? 'disabled' : ''} style="border-color:rgba(255,26,64,0.45); color:#fff; background:rgba(255,26,64,0.16);" onclick="activarWebPush()">🔔 Activar Alertas Push</button>`
        }
        <button type="button" class="oled-btn-secondary" onclick="abrirModalResumenSemanal()">📊 Resumen Semanal</button>
      </div>
    </div>
  `;
}

async function refreshProfileOfflineStats(): Promise<void> {
  const summaryEl = document.getElementById('profile-offline-summary-text');
  const breakdownEl = document.getElementById('profile-offline-breakdown');
  const pillEl = document.getElementById('stat-manga-sub');
  try {
    const summary = await OfflineService.getStorageSummary();
    const mbUsed = (summary.offlineBytes / (1024 * 1024)).toFixed(1);
    const totalBrowserMb = summary.usageBytes > 0 ? (summary.usageBytes / (1024 * 1024)).toFixed(1) : mbUsed;
    const totalCached = summary.mangaChaptersCount + summary.animeFilesCount;
    if (pillEl) {
      const mFavCount = MangaFavoritesManager.getAll().length;
      pillEl.textContent = `${mFavCount} guardados · ${totalCached} offline`;
    }
    if (summaryEl) {
      summaryEl.textContent = totalCached > 0 || summary.watchLaterCount > 0
        ? `${mbUsed} MB en caché (${totalBrowserMb} MB navegador) · ${summary.storagePersisted ? 'Almacenamiento persistente ✓' : 'Caché estándar'}`
        : 'Sin contenido offline guardado todavía.';
    }
    if (breakdownEl) {
      breakdownEl.innerHTML = `
        <div class="profile-mini-kv"><span>Capítulos manga</span><strong>${summary.mangaChaptersCount}</strong></div>
        <div class="profile-mini-kv"><span>Episodios .MP4</span><strong>${summary.animeFilesCount}</strong></div>
        <div class="profile-mini-kv"><span>Ver luego</span><strong>${summary.watchLaterCount}</strong></div>
      `;
    }
  } catch {
    if (summaryEl) summaryEl.textContent = 'Almacenamiento local listo para uso sin conexión.';
  }
}

function renderProfileLibraryPanel(): void {
  const tabsWrap = document.getElementById('profile-library-filter-tabs');
  const customListsWrap = document.getElementById('profile-custom-lists-bar');
  const gridEl = document.getElementById('profile-library-list');
  if (!tabsWrap || !gridEl) return;

  const animes = FavoritesManager.getAll();
  const mangas = MangaFavoritesManager.getAll();
  const customLists = CustomListsManager.getAll();
  const watchedMap = AnimeWatchedManager.getAll();
  const summary = computeLibrarySummary({
    animes,
    mangas,
    watchedMap,
    history: HistoryManager.getAll(),
    totalSecondsWatched: UserManager.getUser().stats.totalSecondsWatched,
    chaptersRead: UserManager.getTotalChaptersRead()
  });

  if (activeLibraryFilter.startsWith('custom:')) {
    const targetListId = activeLibraryFilter.slice('custom:'.length);
    if (!customLists.some((l) => l.id === targetListId)) {
      activeLibraryFilter = 'all';
    }
  }

  const filterDefs: Array<{ id: ProfileLibraryFilter; label: string; count: number }> = [
    { id: 'all', label: 'Todos', count: summary.totalLibraryItems },
    { id: 'watching', label: 'Viendo', count: summary.countsByStatus.watching },
    { id: 'plan_to_watch', label: 'Por Ver', count: summary.countsByStatus.plan_to_watch },
    { id: 'completed', label: 'Completados', count: summary.countsByStatus.completed },
    { id: 'on_hold', label: 'En Pausa', count: summary.countsByStatus.on_hold },
    { id: 'dropped', label: 'Abandonados', count: summary.countsByStatus.dropped },
    { id: 'manga', label: 'Mangas', count: summary.totalSavedMangas }
  ];

  tabsWrap.innerHTML = filterDefs
    .map(
      (f) => `
      <button type="button"
              class="profile-filter-chip ${activeLibraryFilter === f.id ? 'active' : ''}"
              data-lib-filter="${f.id}"
              onclick="setProfileLibraryFilter('${f.id}')">
        <span>${escHtml(f.label)}</span>
        <span class="profile-filter-count">${f.count}</span>
      </button>
    `
    )
    .join('');

  if (customListsWrap) {
    const customChips = customLists
      .map((l) => {
        const count =
          animes.filter((a) => sanitizeCustomListIds(a.customListIds).includes(l.id)).length +
          mangas.filter((m) => sanitizeCustomListIds(m.customListIds).includes(l.id)).length;
        const isActive = activeLibraryFilter === `custom:${l.id}`;
        const listIdSafe = escHtml(l.id);
        return `
          <div class="custom-list-pill ${isActive ? 'active' : ''}" style="border-color:${isActive ? escHtml(l.color) : 'rgba(255,255,255,0.12)'};">
            <button type="button" class="custom-list-pill-btn" onclick="setProfileLibraryFilter('custom:${listIdSafe}')">
              <span>${escHtml(l.icon)}</span>
              <span>${escHtml(l.name)}</span>
              <span class="profile-filter-count">${count}</span>
            </button>
            <button type="button" class="custom-list-del-btn" title="Eliminar colección" aria-label="Eliminar ${escHtml(l.name)}" onclick="eliminarListaPersonalizada('${listIdSafe}')">✕</button>
          </div>
        `;
      })
      .join('');

    customListsWrap.innerHTML = `
      <div class="custom-lists-strip">
        <button type="button" class="custom-list-new-btn" onclick="abrirModalNuevaLista()">+ Nueva colección</button>
        ${customChips}
      </div>
    `;
  }

  const q = librarySearchQuery;
  const customFilterId = activeLibraryFilter.startsWith('custom:')
    ? activeLibraryFilter.slice('custom:'.length)
    : null;

  const matchingAnimes =
    activeLibraryFilter === 'manga'
      ? []
      : animes.filter((anime) => {
          if (customFilterId) {
            if (!sanitizeCustomListIds(anime.customListIds).includes(customFilterId)) return false;
          } else {
            const st = normalizeAnimeListStatus(anime.listStatus, 'plan_to_watch');
            if (activeLibraryFilter !== 'all' && st !== activeLibraryFilter) return false;
          }
          if (!q) return true;
          const t = `${anime.title?.english || ''} ${anime.title?.romaji || ''}`.toLowerCase();
          return t.includes(q);
        });

  const matchingMangas =
    activeLibraryFilter === 'all' || activeLibraryFilter === 'manga' || Boolean(customFilterId)
      ? mangas.filter((m) => {
          if (customFilterId && !sanitizeCustomListIds(m.customListIds).includes(customFilterId)) {
            return false;
          }
          if (!q) return true;
          return String(m.title || '').toLowerCase().includes(q);
        })
      : [];

  if (activeLibrarySort === 'title') {
    matchingAnimes.sort((a, b) =>
      String(a.title?.english || a.title?.romaji || '').localeCompare(
        String(b.title?.english || b.title?.romaji || '')
      )
    );
    matchingMangas.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  } else if (activeLibrarySort === 'score') {
    matchingAnimes.sort((a, b) => (sanitizeUserScore(b.userScore) ?? 0) - (sanitizeUserScore(a.userScore) ?? 0));
    matchingMangas.sort((a, b) => (sanitizeUserScore(b.userScore) ?? 0) - (sanitizeUserScore(a.userScore) ?? 0));
  } else if (activeLibrarySort === 'progress') {
    matchingAnimes.sort((a, b) => {
      const pa = countWatchedForAnime(a, watchedMap);
      const pb = countWatchedForAnime(b, watchedMap);
      return pb.pct - pa.pct || pb.watchedCount - pa.watchedCount;
    });
  } else {
    matchingAnimes.sort((a, b) => Number(b.listUpdatedAt || 0) - Number(a.listUpdatedAt || 0));
  }

  if (matchingAnimes.length === 0 && matchingMangas.length === 0) {
    const isFilteredEmpty = q.length > 0 || activeLibraryFilter !== 'all';
    gridEl.innerHTML = `
      <div class="profile-empty-state">
        <div class="profile-empty-icon">${activeLibraryFilter === 'manga' ? '📚' : '🎬'}</div>
        <div class="profile-empty-title">${isFilteredEmpty ? 'Sin títulos en esta vista' : 'Tu biblioteca está vacía'}</div>
        <div class="profile-empty-desc">${
          isFilteredEmpty
            ? 'Prueba otra categoría, limpia la búsqueda o asigna títulos a esta colección desde su ficha.'
            : 'Guarda animes como Viendo, Por Ver o Completados desde su ficha, o importa tu lista de AniList / MyAnimeList.'
        }</div>
        <div class="profile-empty-actions">
          <button type="button" class="oled-btn-secondary" onclick="cambiarTab('${activeLibraryFilter === 'manga' ? 'lectura' : 'inicio'}')">Explorar Catálogo</button>
          <button type="button" class="oled-btn-secondary" onclick="abrirModalImportarMAL()">Importar AniList / MAL</button>
        </div>
      </div>
    `;
    return;
  }

  const animeHtml = matchingAnimes
    .map((anime) => {
      const rawTitle = anime.title?.english || anime.title?.romaji || 'Anime';
      const title = escHtml(rawTitle);
      const fallback = generarPortadaSVG(rawTitle, 'ja', 'Anime');
      const cover = escHtml(safeImg(anime.coverImage?.large || anime.coverImage?.extraLarge, fallback));
      const prog = countWatchedForAnime(anime, watchedMap);
      const status = normalizeAnimeListStatus(anime.listStatus, 'plan_to_watch');
      const meta = getCategoryMeta(status);
      const fmt = escHtml(anime.format || 'TV');
      const userScore = sanitizeUserScore(anime.userScore);
      const epText =
        prog.totalEpisodes > 0
          ? `${prog.watchedCount} / ${prog.totalEpisodes} eps`
          : `${prog.watchedCount} eps vistos`;
      const animeIdStr = escHtml(String(anime.id));

      return `
        <article class="profile-lib-card" data-anime-id="${animeIdStr}">
          <button type="button" class="profile-lib-cover-btn" onclick="abrirAnimeDesdePerfil('${animeIdStr}')" aria-label="Abrir ${title}">
            <img src="${cover}" alt="${title}" loading="lazy" onerror="this.onerror=null; this.src='${fallback}';">
            ${userScore ? `<span class="profile-lib-score-badge">★ ${userScore}</span>` : ''}
          </button>
          <div class="profile-lib-body">
            <div class="profile-lib-head">
              <button type="button" class="profile-lib-title" onclick="abrirAnimeDesdePerfil('${animeIdStr}')">${title}</button>
              <button type="button" class="profile-lib-remove" title="Quitar de biblioteca" aria-label="Quitar ${title}" onclick="eliminarAnimeDeBibliotecaPerfil('${animeIdStr}')">✕</button>
            </div>
            <div class="profile-lib-meta">
              <span>${fmt}</span>
              <span>·</span>
              <span class="profile-num">${escHtml(epText)}</span>
            </div>
            ${
              anime.userReview
                ? `<div class="profile-lib-review-snip">"${escHtml(String(anime.userReview).slice(0, 72))}"</div>`
                : ''
            }
            <div class="profile-lib-progress-track">
              <div class="profile-lib-progress-fill" style="width:${prog.pct}%; background:${meta.accentColor};"></div>
            </div>
            <div class="profile-lib-footer">
              <select class="profile-lib-select"
                      aria-label="Cambiar categoría de ${title}"
                      style="border-color:${meta.borderTint}; color:${meta.accentColor};"
                      onchange="cambiarCategoriaAnimeEnPerfil('${animeIdStr}', this.value)">
                ${ANIME_LIST_CATEGORIES.map(
                  (c) => `<option value="${c.id}" ${c.id === status ? 'selected' : ''}>${escHtml(c.label)}</option>`
                ).join('')}
              </select>
              <button type="button" class="profile-lib-note-btn" title="Calificar y anotar" onclick="abrirModalResenaPersonal('anime', '${animeIdStr}')">⭐ Nota</button>
              <button type="button" class="profile-lib-open-btn" onclick="abrirAnimeDesdePerfil('${animeIdStr}')">Abrir</button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  const mangaHtml = matchingMangas
    .map((m) => {
      const title = escHtml(m.title || 'Manga');
      const fallback = generarPortadaSVG(m.title || 'Manga', m.origLang || 'ja', 'Manga');
      const cover = escHtml(safeImg(m.cover, fallback));
      const readSet = MangaReadStateManager.getReadChapters(m.id);
      const mangaIdStr = escHtml(String(m.id));
      const userScore = sanitizeUserScore(m.userScore);
      const flag = m.origLang === 'ko' ? 'Manhwa' : m.origLang === 'zh' ? 'Manhua' : 'Manga';
      return `
        <article class="profile-lib-card" data-manga-id="${mangaIdStr}">
          <button type="button" class="profile-lib-cover-btn" onclick="abrirMangaDesdePerfil('${mangaIdStr}')" aria-label="Abrir ${title}">
            <img src="${cover}" alt="${title}" loading="lazy" onerror="this.onerror=null; this.src='${fallback}';">
            ${userScore ? `<span class="profile-lib-score-badge">★ ${userScore}</span>` : ''}
          </button>
          <div class="profile-lib-body">
            <div class="profile-lib-head">
              <button type="button" class="profile-lib-title" onclick="abrirMangaDesdePerfil('${mangaIdStr}')">${title}</button>
              <button type="button" class="profile-lib-remove" title="Quitar de mangas" aria-label="Quitar ${title}" onclick="eliminarMangaDeBibliotecaPerfil('${mangaIdStr}')">✕</button>
            </div>
            <div class="profile-lib-meta">
              <span>${escHtml(flag)}</span>
              <span>·</span>
              <span class="profile-num">${readSet.size} caps leídos</span>
            </div>
            ${
              m.userReview
                ? `<div class="profile-lib-review-snip">"${escHtml(String(m.userReview).slice(0, 72))}"</div>`
                : ''
            }
            <div class="profile-lib-footer" style="margin-top:auto;">
              <span class="profile-lib-tag-manga">Biblioteca Manga</span>
              <button type="button" class="profile-lib-note-btn" title="Calificar y anotar" onclick="abrirModalResenaPersonal('manga', '${mangaIdStr}')">⭐ Nota</button>
              <button type="button" class="profile-lib-open-btn" onclick="abrirMangaDesdePerfil('${mangaIdStr}')">Leer</button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  gridEl.innerHTML = animeHtml + mangaHtml;
}

function renderProfileActivityPanel(): void {
  const ratingsSummaryEl = document.getElementById('profile-ratings-summary');
  const distBarEl = document.getElementById('profile-dist-bar');
  const distLegendEl = document.getElementById('profile-dist-legend');
  const genresEl = document.getElementById('profile-top-genres');
  const recentAnimeEl = document.getElementById('profile-recent-anime');
  const recentMangaEl = document.getElementById('profile-recent-manga');

  const user = UserManager.getUser();
  const animes = FavoritesManager.getAll();
  const mangas = MangaFavoritesManager.getAll();
  const history = HistoryManager.getAll();
  const mangaHistory = MangaHistoryManager.getAll();
  const watchedMap = AnimeWatchedManager.getAll();

  const summary = computeLibrarySummary({
    animes,
    mangas,
    watchedMap,
    history,
    totalSecondsWatched: user.stats.totalSecondsWatched,
    chaptersRead: UserManager.getTotalChaptersRead()
  });

  if (ratingsSummaryEl) {
    const rSum = computeLibraryRatingsSummary(animes, mangas, 6);
    if (rSum.ratedCount === 0) {
      ratingsSummaryEl.innerHTML =
        '<div style="font-size:12px; color:var(--text-muted);">Aún no has puntuado ninguna serie. Usa "⭐ Nota" en tu biblioteca o en cualquier ficha para calificar del 1 al 10.</div>';
    } else {
      const topHtml = rSum.topRated
        .map((item) => {
          const idSafe = escHtml(item.id);
          const onclickFn =
            item.kind === 'anime'
              ? `abrirAnimeDesdePerfil('${idSafe}')`
              : `abrirMangaDesdePerfil('${idSafe}')`;
          return `
            <button type="button" class="profile-rated-item" onclick="${onclickFn}">
              <span class="profile-rated-score">★ ${item.userScore}</span>
              <span class="profile-rated-title">${escHtml(item.title)}</span>
              <span class="profile-rated-kind">${item.kind === 'anime' ? 'Anime' : 'Manga'}</span>
            </button>
          `;
        })
        .join('');
      ratingsSummaryEl.innerHTML = `
        <div class="profile-ratings-kpi">
          <div><strong class="profile-num" style="font-size:20px; color:#fbbf24;">★ ${rSum.averageScore.toFixed(1)}</strong> <span>promedio personal</span></div>
          <div><strong class="profile-num">${rSum.ratedCount}</strong> <span>títulos calificados</span></div>
        </div>
        <div class="profile-rated-list">${topHtml}</div>
      `;
    }
  }

  if (distBarEl && distLegendEl) {
    if (summary.totalSavedAnimes === 0) {
      distBarEl.innerHTML = '<div style="width:100%; height:100%; background:rgba(255,255,255,0.06);"></div>';
      distLegendEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted);">Guarda animes en tu biblioteca para ver la distribución por estado.</div>';
    } else {
      distBarEl.innerHTML = ANIME_LIST_CATEGORIES.map((cat) => {
        const count = summary.countsByStatus[cat.id];
        if (count <= 0) return '';
        const pct = (count / summary.totalSavedAnimes) * 100;
        return `<div style="width:${pct.toFixed(2)}%; background:${cat.accentColor}; height:100%;" title="${escHtml(cat.label)}: ${count}"></div>`;
      }).join('');

      distLegendEl.innerHTML = ANIME_LIST_CATEGORIES.map((cat) => {
        const count = summary.countsByStatus[cat.id];
        const pct = Math.round((count / summary.totalSavedAnimes) * 100);
        return `
          <div class="profile-dist-item">
            <span class="profile-dist-dot" style="background:${cat.accentColor};"></span>
            <span class="profile-dist-name">${escHtml(cat.label)}</span>
            <strong class="profile-num">${count} <span class="profile-dist-pct">(${pct}%)</span></strong>
          </div>
        `;
      }).join('');
    }
  }

  if (genresEl) {
    if (summary.topGenres.length === 0) {
      genresEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted);">Aún no hay suficientes animes con géneros registrados en tu biblioteca o historial.</div>';
    } else {
      genresEl.innerHTML = summary.topGenres
        .map(
          (g) => `
          <div class="profile-genre-row">
            <div class="profile-genre-labels">
              <span>${escHtml(g.genre)}</span>
              <span class="profile-num">${g.count} ${g.count === 1 ? 'título' : 'títulos'}</span>
            </div>
            <div class="profile-genre-track">
              <div class="profile-genre-fill" style="width:${g.pct}%;"></div>
            </div>
          </div>
        `
        )
        .join('');
    }
  }

  if (recentAnimeEl) {
    if (history.length === 0) {
      recentAnimeEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted);">Sin reproducciones recientes.</div>';
    } else {
      recentAnimeEl.innerHTML = history
        .slice(0, 6)
        .map((h) => {
          const a = h.anime || {};
          const title = escHtml(a.title?.english || a.title?.romaji || 'Anime');
          const idStr = escHtml(String(a.id || ''));
          const when = h.timestamp ? formatRelativeTime(h.timestamp) : '';
          return `
            <button type="button" class="profile-activity-row" onclick="abrirAnimeDesdePerfil('${idStr}')">
              <div class="profile-activity-main">
                <div class="profile-activity-title">${title}</div>
                <div class="profile-activity-sub">T${Number(h.seasonNum || 1)} · Episodio ${Number(h.episodeNum || 1)} ${h.completed ? '· ✓ Completado' : ''}</div>
              </div>
              <span class="profile-activity-time">${escHtml(when)}</span>
            </button>
          `;
        })
        .join('');
    }
  }

  if (recentMangaEl) {
    if (mangaHistory.length === 0) {
      recentMangaEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted);">Sin lecturas recientes de manga.</div>';
    } else {
      recentMangaEl.innerHTML = mangaHistory
        .slice(0, 6)
        .map((mh) => {
          const m = mh.manga || {};
          const title = escHtml(m.title || 'Manga');
          const idStr = escHtml(String(m.id || ''));
          const when = mh.timestamp ? formatRelativeTime(mh.timestamp) : '';
          return `
            <button type="button" class="profile-activity-row" onclick="abrirMangaDesdePerfil('${idStr}')">
              <div class="profile-activity-main">
                <div class="profile-activity-title">${title}</div>
                <div class="profile-activity-sub">Capítulo ${escHtml(mh.chapterLabel || String(mh.chapterNum || 1))}${mh.pageNumber ? ` · Pág ${mh.pageNumber}` : ''}</div>
              </div>
              <span class="profile-activity-time">${escHtml(when)}</span>
            </button>
          `;
        })
        .join('');
    }
  }
}

export function renderProfileUI(): void {
  const user = UserManager.getUser();
  const animes = FavoritesManager.getAll();
  const mangas = MangaFavoritesManager.getAll();
  const watchedMap = AnimeWatchedManager.getAll();
  const chapsRead = UserManager.getTotalChaptersRead();

  const summary = computeLibrarySummary({
    animes,
    mangas,
    watchedMap,
    history: HistoryManager.getAll(),
    totalSecondsWatched: user.stats.totalSecondsWatched,
    chaptersRead: chapsRead
  });

  const fbUser = nWin.FirebaseAuth?.getCurrentUser ? nWin.FirebaseAuth.getCurrentUser() : null;
  const isLoggedIn = Boolean(fbUser && !fbUser.isAnonymous);
  const activeUser = isLoggedIn ? fbUser : user;
  const rank = getRankProgress(
    summary.uniqueEpisodesWatched,
    chapsRead,
    isLoggedIn ? user.role : 'FREE'
  );

  const badgeClass =
    rank.tier === 'VIP'
      ? 'badge-vip'
      : rank.tier === 'LEYENDA'
        ? 'badge-leyenda'
        : rank.tier === 'OTAKU'
          ? 'badge-otaku'
          : 'badge-free';

  const avatarEl = document.getElementById('user-avatar-img') as HTMLImageElement | null;
  const nameEl = document.getElementById('user-display-name');
  const subtitleEl = document.getElementById('profile-account-sub');
  const roleEl = document.getElementById('user-role-badge');
  const rankFillEl = document.getElementById('user-rank-progress-fill') as HTMLElement | null;
  const rankTextEl = document.getElementById('user-rank-progress-text');

  if (avatarEl) {
    avatarEl.src = safeImg(
      user.avatar || activeUser.avatar || activeUser.photoURL,
      'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo'
    );
    avatarEl.className = `profile-avatar ${badgeClass === 'badge-vip' ? 'vip-avatar' : ''}`;
  }
  if (nameEl) {
    nameEl.textContent = (user.username && user.username !== 'Invitado' ? user.username : (isLoggedIn ? (fbUser.displayName || user.username) : user.username)) || 'Invitado';
  }
  if (subtitleEl) {
    subtitleEl.textContent = isLoggedIn
      ? `Sincronizado · ${fbUser.email || 'Cuenta conectada'}`
      : 'Modo Local · Conecta tu cuenta para respaldo en la nube';
  }
  if (roleEl) {
    roleEl.className = `profile-role-badge ${badgeClass}`;
    roleEl.textContent = `${rank.icon} ${rank.label}`;
  }
  if (rankFillEl) {
    rankFillEl.style.width = `${rank.progressPct}%`;
  }
  if (rankTextEl) {
    rankTextEl.textContent = rank.nextLabel
      ? `${rank.points} / ${rank.nextThreshold} pts hacia ${rank.nextLabel}`
      : `${rank.points} pts · Rango máximo alcanzado`;
  }

  // Real metrics strip
  const watchTimeEl = document.getElementById('stat-watch-time');
  const watchSubEl = document.getElementById('stat-watch-sub');
  const epEl = document.getElementById('stat-episodes');
  const epSubEl = document.getElementById('stat-episodes-sub');
  const mangaEl = document.getElementById('stat-manga');
  const mangaSubEl = document.getElementById('stat-manga-sub');
  const libEl = document.getElementById('stat-library');
  const libSubEl = document.getElementById('stat-library-sub');

  if (watchTimeEl) watchTimeEl.textContent = formatWatchDuration(summary.totalSecondsWatched);
  if (watchSubEl) {
    watchSubEl.textContent =
      summary.totalSecondsWatched > 0
        ? 'Tiempo real verificado'
        : 'Sin reproducción aún';
  }
  if (epEl) epEl.textContent = String(summary.uniqueEpisodesWatched);
  if (epSubEl) {
    epSubEl.textContent = `${summary.completedSeriesCount} ${summary.completedSeriesCount === 1 ? 'serie completada' : 'series completadas'}`;
  }
  if (mangaEl) mangaEl.textContent = String(chapsRead);
  if (mangaSubEl) {
    mangaSubEl.textContent = `${summary.totalSavedMangas} ${summary.totalSavedMangas === 1 ? 'manga guardado' : 'mangas guardados'}`;
  }
  if (libEl) libEl.textContent = String(summary.totalLibraryItems);
  if (libSubEl) {
    libSubEl.textContent = `${summary.countsByStatus.watching} Viendo · ${summary.countsByStatus.plan_to_watch} Por Ver`;
  }

  const commAvatar = document.getElementById('comment-user-avatar') as HTMLImageElement | null;
  if (commAvatar) {
    commAvatar.src = safeImg(
      user.avatar || activeUser.avatar || activeUser.photoURL,
      'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo'
    );
  }

  // Firebase Auth & Sync cards
  const guestView = document.getElementById('auth-guest-view');
  const loggedView = document.getElementById('auth-logged-view');
  const emailEl = document.getElementById('auth-user-email');
  const providerEl = document.getElementById('auth-provider-label');
  const verifyBanner = document.getElementById('auth-verify-banner');

  if (isLoggedIn && fbUser.email) {
    if (guestView) guestView.classList.add('hide');
    if (loggedView) loggedView.classList.remove('hide');
    if (emailEl) emailEl.textContent = fbUser.email;
    if (providerEl) {
      providerEl.textContent =
        fbUser.providerId === 'google.com'
          ? 'Autenticado con Google ✓'
          : fbUser.emailVerified
            ? 'Autenticado con Correo ✓'
            : 'Cuenta de Correo · Verificación pendiente';
    }
    if (verifyBanner) {
      verifyBanner.classList.toggle('hide', fbUser.providerId === 'google.com' || Boolean(fbUser.emailVerified));
    }
  } else {
    if (guestView) guestView.classList.remove('hide');
    if (loggedView) loggedView.classList.add('hide');
    if (verifyBanner) verifyBanner.classList.add('hide');
  }

  const syncBadge = document.getElementById('sync-status-badge');
  const syncText = document.getElementById('sync-status-text');
  const syncLast = document.getElementById('sync-last-time');
  const topSyncPill = document.getElementById('profile-top-sync-pill');
  if (syncBadge && syncText) {
    if (isLoggedIn && navigator.onLine) {
      syncBadge.className = 'sync-pill online';
      syncText.textContent = nWin.firebaseSync?.isSyncing?.() ? 'Sincronizando...' : 'En la Nube ✓';
    } else {
      syncBadge.className = 'sync-pill offline';
      syncText.textContent = isLoggedIn ? 'Sin Conexión' : 'Modo Local';
    }
  }
  if (topSyncPill) {
    topSyncPill.className = `sync-pill ${isLoggedIn && navigator.onLine ? (nWin.firebaseSync?.isSyncing?.() ? 'syncing' : 'online') : 'offline'}`;
    topSyncPill.textContent =
      isLoggedIn && navigator.onLine
        ? nWin.firebaseSync?.isSyncing?.()
          ? 'Sincronizando...'
          : 'Nube activa'
        : isLoggedIn
          ? 'Sin conexión'
          : 'Local';
  }
  if (syncLast) {
    if (nWin.firebaseSync?.getHumanTimeSinceLastSync) {
      syncLast.textContent = nWin.firebaseSync.getHumanTimeSinceLastSync();
    } else {
      syncLast.textContent = isLoggedIn ? 'Hace un momento' : 'Solo local';
    }
  }

  renderProfileLibraryPanel();
  renderOAuthScrobbleCard();
  renderWebPushStatusCard();
  if (activeProfileTab === 'actividad') {
    renderProfileActivityPanel();
  }
  if (activeProfileTab === 'herramientas') {
    void refreshProfileOfflineStats();
  }
}

export function handleAndroidBackButton(): string {
  const openSheet = document.querySelector('.mihon-quick-caps-sheet.open');
  if (openSheet) {
    openSheet.classList.remove('open');
    return 'HANDLED';
  }

  const activeModal = document.querySelector('.modal-overlay.active, .modal-overlay.open, .ny-dialog.active, .ny-dialog.open');
  if (activeModal) {
    cerrarModales();
    return 'HANDLED';
  }

  const lector = document.getElementById('pantalla-lector');
  if (lector && !lector.classList.contains('hide')) {
    uiHooks.cerrarLector();
    return 'HANDLED';
  }

  const reproductor = document.getElementById('pantalla-reproductor');
  if (reproductor && !reproductor.classList.contains('hide')) {
    uiHooks.cerrarReproductor();
    return 'HANDLED';
  }

  const detalleManga = document.getElementById('pantalla-detalle-manga');
  if (detalleManga && !detalleManga.classList.contains('hide')) {
    uiHooks.cerrarDetalleManga();
    return 'HANDLED';
  }

  const detalle = document.getElementById('pantalla-detalle');
  if (detalle && !detalle.classList.contains('hide')) {
    uiHooks.cerrarDetalle();
    return 'HANDLED';
  }

  const favoritos = document.getElementById('pantalla-favoritos');
  if (favoritos && !favoritos.classList.contains('hide')) {
    cambiarTab('inicio');
    return 'HANDLED';
  }

  if (state.tabActual && state.tabActual !== 'inicio') {
    cambiarTab('inicio');
    return 'HANDLED';
  }

  const now = Date.now();
  if (now - lastBackPressTime < 2500) {
    return 'EXIT_APP';
  }
  lastBackPressTime = now;
  showToast('Presiona atrás otra vez para salir');
  return 'HANDLED';
}

export function initApp(): void {
  ensureModalsMounted();
  uiHooks.loadSavedReaderSettings();
  UserManager.syncWatchedStatsFromLedger(true);
  renderProfileUI();
  void DownloadManager.updateBadge();
  void uiHooks.cargarCatalogoHome();
  uiHooks.renderCategorias();
  uiHooks.initSearchDirectoryFilters();
  uiHooks.renderContinuarViendo();
  uiHooks.renderFavoritos();
  void uiHooks.cargarEmisionCalendario();
  void uiHooks.cargarMangasYNovelas();
  setupAvatarOptions();
  setupTouchGestures();

  nWin.handleAndroidBackButton = handleAndroidBackButton;

  const inviteRoomCode = extractRoomCodeFromSearch(window.location.search);
  if (inviteRoomCode) {
    setTimeout(() => {
      showToast(`Invitación a Sala Compartida ${inviteRoomCode}`, {
        label: 'Unirse ahora',
        onClick: () => {
          void nWin.abrirSalaWatchTogetherDesdeCodigo?.(inviteRoomCode);
        }
      });
    }, 650);
  }

  if (!nWin._nyLifecycleFlushesBound) {
    (nWin as any)._nyLifecycleFlushesBound = true;
    document.addEventListener('backbutton', (e) => {
      e.preventDefault();
      handleAndroidBackButton();
    }, false);
    window.addEventListener('pagehide', () => {
      uiHooks.flushPlayerProgress();
      uiHooks.flushMangaReaderPage();
    });
    window.addEventListener('beforeunload', () => {
      uiHooks.flushPlayerProgress();
      uiHooks.flushMangaReaderPage();
    });
  }
}
