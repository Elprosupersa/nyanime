import {
  shouldMarkEpisodeCompleted
} from '../utils/playerResume.ts';
import { generarPortadaSVG } from '../utils/sanitize.ts';
import {
  type AnimeListStatus,
  compactAnimeStorageEntry,
  countUniqueWatchedEpisodes,
  countWatchedForAnime,
  getCategoryMeta,
  mergeAnimeFavoriteMetadata,
  normalizeAnimeListStatus,
  resolveAutoListStatusTransition
} from '../utils/profileStats.ts';
import {
  compactFavoritesArray,
  compactMangaEntry,
  hasBloatedAnimeMetadata,
  pruneOldestApiCaches,
  safeStorageSetItem
} from '../utils/storageQuota.ts';
import {
  DEFAULT_AVATAR_URL,
  isValidStoredAvatar
} from '../utils/avatarHelpers.ts';
import {
  buildCustomList,
  type CustomList,
  sanitizeCustomListIds,
  sanitizeShortText,
  sanitizeUserScore,
  toggleItemInCustomList
} from '../utils/libraryEnhancements.ts';
import {
  type OAuthAccountSession,
  type OAuthProviderId
} from '../utils/scrobble.ts';
import {
  computeBodyScrollLock,
  resolveModalDismissBehavior
} from '../utils/uiPolishHelpers.ts';

export { generarPortadaSVG };
export type { AnimeListStatus, CustomList, OAuthAccountSession, OAuthProviderId };

export const ANILIST_URL = 'https://graphql.anilist.co';
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const EP_PROGRESS_KEY = 'nyanime_ep_progress_v1';

export interface EpisodeProgressEntry {
  currentTime: number;
  duration: number;
  completed: boolean;
  updatedAt: number;
}

export interface AnimeHistoryEntry {
  anime: any;
  seasonNum: number;
  episodeNum: number;
  timestamp: number;
  currentTime?: number;
  duration?: number;
  completed?: boolean;
}

export interface MangaHistoryEntry {
  manga: any;
  chapterNum: number;
  chapterLabel: string;
  pageNumber?: number;
  timestamp: number;
}

export interface ToastActionOptions {
  label: string;
  onClick: () => void;
  durationMs?: number;
}

export interface NyWindow extends Window {
  escapeHTML?: (val: unknown) => string;
  safeImageUrl?: (url: string, fallback?: string) => string;
  safeExternalUrl?: (url: string) => string;
  cerrarModalFuentesManga?: (event?: Event) => void;
  cerrarModalDescargasManga?: (event?: Event) => void;
  Hls?: any;
  FirebaseAuth?: any;
  firebaseSync?: any;
  NyAnime?: any;
  NyAnimeUtils?: any;
  NyAnimeSeasons?: any;
  NyAnimeMangaLang?: any;
  NyAnimeVideoSources?: any;
  NyAnimeOffline?: any;
  NyAnimeImporters?: any;
  RealCommentsManager?: any;
  KeiyoushiCatalogManager?: any;
  NyAnimePWA?: any;
  Store?: any;
  store?: any;
  showToast?: (msg: string, opts?: ToastActionOptions) => void;
  mostrarToast?: (msg: string, _type?: string, opts?: ToastActionOptions) => void;
  getReaderSettings?: () => any;
  applyReaderSettingsFromCloud?: (settings: any) => void;
  cerrarLectorManga?: () => void;
  reproducirVideoOfflineCacheado?: (manifest: any) => Promise<void>;
  cancelarDescargaTemporada?: () => void;
  abrirModalDescargas?: () => void;
  getActiveAnimeDownloadSnapshot?: () => any;
  cerrarOMinimizarModalDescargaTemporada?: (event?: Event) => void;
  handleAndroidBackButton?: () => string;
  UserManager?: typeof UserManager;
  FavoritesManager?: typeof FavoritesManager;
  MangaFavoritesManager?: typeof MangaFavoritesManager;
  CustomListsManager?: typeof CustomListsManager;
  AppPreferencesManager?: typeof AppPreferencesManager;
  OAuthScrobbleManager?: typeof OAuthScrobbleManager;
  HistoryManager?: typeof HistoryManager;
  MangaHistoryManager?: typeof MangaHistoryManager;
  MangaReadStateManager?: typeof MangaReadStateManager;
  AnimeWatchedManager?: typeof AnimeWatchedManager;
  CommentsManager?: typeof CommentsManager;
  ScheduleReminderManager?: any;
  _nyActiveHls?: any;
  _currentMangaGridList?: any[];
  _currentMangaBaseList?: any[];
  _currentMangaFilteredList?: any[];
  iniciarSesionGoogle?: () => Promise<void>;
  abrirModalAuthEmail?: (mode?: 'login' | 'register') => void;
  toggleAuthModalMode?: () => void;
  submitAuthEmail?: () => Promise<void>;
  recuperarContrasena?: () => Promise<void>;
  reenviarVerificacionCorreo?: () => Promise<void>;
  cerrarSesionUsuario?: () => Promise<void>;
  forzarSyncFirebase?: () => Promise<void>;
  exportarBackupJSON?: () => Promise<void>;
  abrirImportarBackupJSON?: () => void;
  importarBackupJSON?: (event: Event) => Promise<void>;
  reintentarPaginaIndividual?: (pNum: number) => void;
  cambiarTab?: (tab: string) => void;
  abrirReproductor?: (ep: number) => void;
  _nyLifecycleFlushesBound?: boolean;
  _crunchyOutsideClickBound?: boolean;
  _nyPlayerKeyboardBound?: boolean;
  _nyMangaReaderKeyBound?: boolean;
  capitulosLectorList?: any[];
  mangaUiState?: any;
  refreshOfflineMangaDetailState?: (manga?: any, rerender?: boolean) => Promise<any>;
  renderDetalleEpisodios?: () => void;
  renderSmartRecommendations?: () => Promise<void>;
  getActiveDetailAnimeEntry?: () => any;
  abrirSalaWatchTogetherDesdeCodigo?: (codeArg: string, inviteKeyArg?: string) => Promise<void>;
  eliminarSalaWatchTogether?: (roomIdArg?: string) => Promise<void>;
  cerrarModalPasscodeWatchTogether?: () => void;
  confirmarPasscodeWatchTogether?: () => Promise<void>;
  solicitarLimpiarPerfil?: () => void;
  avanzarLimpiarPerfil?: () => Promise<void>;
  cancelarLimpiarPerfil?: () => void;
  confirmarLimpiarPerfilFinal?: () => Promise<void>;
}

export const nWin = window as unknown as NyWindow;

export const state: {
  tabActual: string;
  anime: any;
  fullMedia: any;
  seasons: any[];
  temporadaActualIdx: number;
  rangoActualIdx: number;
  epActual: number;
  modoAudio: string;
  fuenteActualIdx: number;
  fuentesRankeadas: any[];
  rawFuentesEpisodio: any[];
  episodeMetaMap: Record<number, any>;
  seasonMenuOpen: boolean;
  searchDebounceTimer: ReturnType<typeof setTimeout> | null;
  diaEmisionActual: number;
  tipoLecturaActual: string;
  obraLecturaActual: any;
} = {
  tabActual: 'inicio',
  anime: null,
  fullMedia: null,
  seasons: [],
  temporadaActualIdx: 0,
  rangoActualIdx: 0,
  epActual: 1,
  modoAudio: 'SUB',
  fuenteActualIdx: 0,
  fuentesRankeadas: [],
  rawFuentesEpisodio: [],
  episodeMetaMap: {},
  seasonMenuOpen: false,
  searchDebounceTimer: null,
  diaEmisionActual: new Date().getDay(),
  tipoLecturaActual: 'ALL',
  obraLecturaActual: null
};

export interface UiHooks {
  renderContinuarViendo: () => void;
  renderFavoritos: () => void;
  renderProfileUI: () => void;
  renderEmisionDiasChips: () => void;
  renderEmisionDia: (diaIdx: number) => void;
  renderContinuarLeyendoManga: () => void;
  renderGridLectura: (customList?: any[] | null) => void;
  updateFavoriteButton: (id: number | string) => void;
  updateMangaFavoriteButton: (id: number | string) => void;
  renderDetalleEpisodios: () => void;
  actualizarEstadoVistoPlayerUI: () => void;
  cerrarDetalle: () => void;
  cerrarDetalleManga: () => void;
  cerrarLector: () => void;
  cerrarReproductor: () => void;
  abrirDetalle: (anime: any, onLoaded?: () => void) => Promise<void>;
  abrirDetalleManga: (manga: any) => Promise<void>;
  abrirLectorManga: (idx: number) => Promise<void>;
  cargarCatalogoHome: () => Promise<void>;
  renderCategorias: () => void;
  cargarEmisionCalendario: (forceRefresh?: boolean) => Promise<void>;
  cargarMangasYNovelas: (forceRefresh?: boolean) => Promise<void>;
  setupAvatarOptions: () => void;
  loadSavedReaderSettings: () => void;
  flushPlayerProgress: () => void;
  flushMangaReaderPage: () => void;
  abrirModalAuthEmail: (mode?: 'login' | 'register') => void;
  abrirModalDescargas: () => void;
  initSearchDirectoryFilters: () => void;
  renderSmartRecommendations: () => void;
}

const noop = () => {};
const asyncNoop = async () => {};

export const uiHooks: UiHooks = {
  renderContinuarViendo: noop,
  renderFavoritos: noop,
  renderProfileUI: noop,
  renderEmisionDiasChips: noop,
  renderEmisionDia: noop,
  renderContinuarLeyendoManga: noop,
  renderGridLectura: noop,
  updateFavoriteButton: noop,
  updateMangaFavoriteButton: noop,
  renderDetalleEpisodios: noop,
  actualizarEstadoVistoPlayerUI: noop,
  cerrarDetalle: noop,
  cerrarDetalleManga: noop,
  cerrarLector: noop,
  cerrarReproductor: noop,
  abrirDetalle: asyncNoop,
  abrirDetalleManga: asyncNoop,
  abrirLectorManga: asyncNoop,
  cargarCatalogoHome: asyncNoop,
  renderCategorias: noop,
  cargarEmisionCalendario: asyncNoop,
  cargarMangasYNovelas: asyncNoop,
  setupAvatarOptions: noop,
  loadSavedReaderSettings: noop,
  flushPlayerProgress: noop,
  flushMangaReaderPage: noop,
  abrirModalAuthEmail: noop,
  abrirModalDescargas: noop,
  initSearchDirectoryFilters: noop,
  renderSmartRecommendations: noop
};

// Unified State Bridge (single source of truth)
if (!nWin.Store) {
  nWin.Store = {
    state: {
      activeManga: null as any,
      activeChapter: null as any,
      activeAnime: null as any,
      activeEpisode: null as any,
      reader: { isOpen: false, currentManga: null as any, currentChapter: null as any },
      player: { isOpen: false, currentAnime: null as any, currentEpisode: null as any }
    },
    getState() { return this.state; },
    get activeManga() { return this.state.activeManga; },
    get activeChapter() { return this.state.activeChapter; },
    get activeAnime() { return this.state.activeAnime; },
    get activeEpisode() { return this.state.activeEpisode; },
    setActiveManga(manga: any) {
      const m = manga || null;
      this.state.activeManga = m;
      if (this.state.reader) this.state.reader.currentManga = m;
      if (nWin.store && typeof nWin.store.setActiveManga === 'function') {
        nWin.store.setActiveManga(m);
      }
    },
    setActiveChapter(chapter: any) {
      const c = chapter || null;
      this.state.activeChapter = c;
      if (this.state.reader) this.state.reader.currentChapter = c;
      if (nWin.store && typeof nWin.store.setActiveChapter === 'function') {
        nWin.store.setActiveChapter(c);
      }
    },
    setActiveAnime(anime: any) {
      const a = anime || null;
      this.state.activeAnime = a;
      if (this.state.player) this.state.player.currentAnime = a;
      if (nWin.store && typeof nWin.store.setActiveAnime === 'function') {
        nWin.store.setActiveAnime(a);
      }
    },
    setActiveEpisode(episode: any) {
      const ep = episode || null;
      this.state.activeEpisode = ep;
      if (this.state.player) this.state.player.currentEpisode = ep;
      if (nWin.store && typeof nWin.store.setActiveEpisode === 'function') {
        nWin.store.setActiveEpisode(ep);
      }
    }
  };
}

export function getActiveManga(): any {
  return nWin.Store?.state?.activeManga || state.obraLecturaActual || null;
}

export function setActiveManga(manga: any): void {
  state.obraLecturaActual = manga || null;
  if (nWin.Store?.setActiveManga) {
    nWin.Store.setActiveManga(manga);
  }
}

try {
  Object.defineProperty(window, 'mangaActualData', {
    get() { return getActiveManga(); },
    set(val) { setActiveManga(val); },
    configurable: true
  });
  Object.defineProperty(window, 'mangaLectorData', {
    get() { return getActiveManga(); },
    set(val) { setActiveManga(val); },
    configurable: true
  });
  Object.defineProperty(window, '_currentMangaTitle', {
    get() { return getActiveManga()?.title || ''; },
    set(val) {
      const m = getActiveManga();
      if (m) m.title = val;
    },
    configurable: true
  });
} catch {
  // Ignore re-define failures
}

export const escHtml = (val: unknown): string => {
  if (nWin.escapeHTML) return nWin.escapeHTML(val);
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export const safeImg = (url: string, fallback = ''): string => {
  if (nWin.safeImageUrl) return nWin.safeImageUrl(url, fallback);
  return url || fallback;
};

let activeToastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string, actionOpts?: ToastActionOptions): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  if (activeToastTimer) {
    clearTimeout(activeToastTimer);
    activeToastTimer = null;
  }

  toast.innerHTML = '';
  const textSpan = document.createElement('span');
  textSpan.textContent = String(msg ?? '');
  toast.appendChild(textSpan);

  if (actionOpts?.label && typeof actionOpts.onClick === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action-btn';
    btn.textContent = actionOpts.label;
    btn.onclick = (ev) => {
      ev.stopPropagation();
      actionOpts.onClick();
      toast.classList.remove('show');
      if (activeToastTimer) {
        clearTimeout(activeToastTimer);
        activeToastTimer = null;
      }
    };
    toast.appendChild(btn);
  }

  toast.classList.add('show');
  const duration = actionOpts?.durationMs ?? (actionOpts ? 5200 : 2600);
  activeToastTimer = setTimeout(() => {
    toast.classList.remove('show');
    activeToastTimer = null;
  }, duration);
}

export function mostrarToast(msg: string, _type?: string, opts?: ToastActionOptions): void {
  showToast(msg, opts);
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 4000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const isRelativeSameOrigin = typeof url === 'string' && url.startsWith('/');
  const mergedOptions: RequestInit = {
    ...options,
    credentials: options.credentials ?? (isRelativeSameOrigin ? 'same-origin' : undefined),
    signal: controller.signal
  };
  try {
    return await fetch(url, mergedOptions);
  } finally {
    clearTimeout(timer);
  }
}

export function toFastImgUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('/api/img-proxy') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  return `/api/img-proxy?url=${encodeURIComponent(url)}`;
}

export async function nativeFetchJson(url: string, timeoutMs = 5000): Promise<any> {
  try {
    const localUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const res = await fetchWithTimeout(localUrl, {}, timeoutMs);
    if (res.ok) return await res.json();
  } catch {
    // fallback direct
  }
  try {
    const res = await fetchWithTimeout(url, {}, timeoutMs);
    if (res.ok) return await res.json();
  } catch {
    // ignore
  }
  return null;
}

export type ProxyUpstreamEventListener = (url: string, status: number, timedOut: boolean) => void;
const proxyUpstreamListeners = new Set<ProxyUpstreamEventListener>();

export function onProxyUpstreamEvent(listener: ProxyUpstreamEventListener): () => void {
  proxyUpstreamListeners.add(listener);
  return () => {
    proxyUpstreamListeners.delete(listener);
  };
}

function emitProxyUpstreamEvent(url: string, status: number, timedOut: boolean): void {
  proxyUpstreamListeners.forEach((fn) => {
    try {
      fn(url, status, timedOut);
    } catch {
      // ignore listener errors
    }
  });
}

export async function nativeFetchText(
  url: string,
  customHeaders: Record<string, string> = {},
  method = 'GET',
  postData: BodyInit | null = null,
  timeoutMs = 4500
): Promise<string | null> {
  try {
    const proxyHeaders: Record<string, string> = {};
    if (customHeaders['Content-Type']) proxyHeaders['x-custom-content-type'] = customHeaders['Content-Type'];
    if (customHeaders['X-Requested-With']) proxyHeaders['x-custom-requested-with'] = customHeaders['X-Requested-With'];
    const fetchOpt: RequestInit = { method, headers: proxyHeaders };
    if (method === 'POST' && postData) fetchOpt.body = postData;
    const res = await fetchWithTimeout(`/api/proxy?url=${encodeURIComponent(url)}&probe=1`, fetchOpt, timeoutMs);
    const upStatus = Number(res.headers.get('x-upstream-status') || res.status || 200);
    emitProxyUpstreamEvent(url, upStatus, false);
    if (res.ok && upStatus < 400) {
      const txt = await res.text();
      if (txt) return txt;
    }
  } catch (err: any) {
    const timedOut = err?.name === 'AbortError';
    emitProxyUpstreamEvent(url, 0, timedOut);
  }
  return null;
}

export async function nativeFetchHtml(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 4500
): Promise<string | null> {
  try {
    const localProxy = `/api/proxy?url=${encodeURIComponent(url)}&probe=1`;
    const res = await fetchWithTimeout(localProxy, { headers }, timeoutMs);
    const upStatus = Number(res.headers.get('x-upstream-status') || res.status || 200);
    emitProxyUpstreamEvent(url, upStatus, false);
    if (res.ok && upStatus < 400) {
      const html = await res.text();
      return html && html.trim() ? html : null;
    }
  } catch (err: any) {
    const timedOut = err?.name === 'AbortError';
    emitProxyUpstreamEvent(url, 0, timedOut);
  }
  return null;
}

export function handleOpenExternal(url: string): void {
  const safe = nWin.safeExternalUrl ? nWin.safeExternalUrl(url) : '';
  if (!safe) {
    showToast('Enlace externo no válido o bloqueado por seguridad.');
    return;
  }
  const a = document.createElement('a');
  a.href = safe;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function generarIconoFuenteSVG(nombre: string): string {
  const palette: [string, string][] = [
    ['#4f46e5', '#818cf8'], ['#059669', '#34d399'], ['#d97706', '#fbbf24'],
    ['#dc2626', '#f87171'], ['#7c3aed', '#a78bfa'], ['#0284c7', '#38bdf8']
  ];
  let hash = 0;
  for (let i = 0; i < (nombre || '').length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) % palette.length;
  const [c1, c2] = palette[hash];
  const initials = (nombre || 'K').split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
  const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="96" height="96" rx="20" fill="url(#g)"/>
    <text x="48" y="55" font-family="sans-serif" font-size="28" font-weight="900" fill="white" text-anchor="middle">${initials}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rawSvg);
}

export function getActiveModalElements(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('.modal-overlay.active, .modal-overlay.open, .ny-dialog.active, .ny-dialog.open')
  );
}

export function hasActiveModal(): boolean {
  return getActiveModalElements().length > 0;
}

export function syncModalBodyScrollLock(): boolean {
  const activeIds = getActiveModalElements().map((el) => el.id || 'modal');
  const shouldLock = computeBodyScrollLock(activeIds);
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('ny-modal-open', shouldLock);
  }
  return shouldLock;
}

export function cerrarModales(event?: Event, options?: { forceCritical?: boolean }): void {
  if (event && event.target && event.target !== event.currentTarget) return;
  const forceCritical = options?.forceCritical === true;
  document.querySelectorAll<HTMLElement>('.modal-overlay, .ny-dialog').forEach((m) => {
    if (!forceCritical && resolveModalDismissBehavior(m.id) === 'blocked') {
      return;
    }
    m.classList.remove('active', 'open');
  });
  syncModalBodyScrollLock();
}

export function cambiarTab(tab: string): void {
  state.tabActual = tab;

  const detAnime = document.getElementById('pantalla-detalle');
  if (detAnime) detAnime.classList.add('hide');
  const detManga = document.getElementById('pantalla-detalle-manga');
  if (detManga) detManga.classList.add('hide');

  const rep = document.getElementById('pantalla-reproductor');
  if (rep && !rep.classList.contains('hide')) {
    uiHooks.cerrarReproductor();
  } else if (rep) {
    rep.classList.add('hide');
    const vid = document.getElementById('contenedor-video');
    if (vid) vid.innerHTML = '';
  }

  const lec = document.getElementById('pantalla-lector');
  if (lec && !lec.classList.contains('hide')) {
    uiHooks.cerrarLector();
  } else if (lec) {
    lec.classList.add('hide');
  }

  cerrarModales(undefined, { forceCritical: true });

  const screens = ['inicio', 'emision', 'lectura', 'busqueda', 'favoritos', 'perfil'];
  screens.forEach(s => {
    const el = document.getElementById(`pantalla-${s}`);
    const navEl = document.getElementById(`tab-${s}`);
    if (el) el.classList.toggle('hide', s !== tab);
    if (navEl) navEl.classList.toggle('active', s === tab);
  });

  window.scrollTo(0, 0);
  if (tab === 'favoritos') uiHooks.renderFavoritos();
  if (tab === 'perfil') UserManager.renderProfile();
  if (tab === 'emision') {
    uiHooks.renderEmisionDiasChips();
    uiHooks.renderEmisionDia(state.diaEmisionActual);
  }
  if (tab === 'lectura') {
    uiHooks.cargarMangasYNovelas();
  }
}

export const CacheManager = {
  get(key: string): any {
    try {
      const itemStr = localStorage.getItem('nyanime_cache_' + key);
      if (!itemStr) return null;
      const item = JSON.parse(itemStr);
      if (Date.now() > item.expiry) {
        localStorage.removeItem('nyanime_cache_' + key);
        return null;
      }
      return item.value;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown, ttl = CACHE_TTL_MS): void {
    try {
      const item = { value, expiry: Date.now() + ttl };
      const serialized = JSON.stringify(item);
      if (serialized.length > 180_000) return;
      pruneOldestApiCaches(localStorage, 18);
      localStorage.setItem('nyanime_cache_' + key, serialized);
    } catch {
      // ignore storage quota errors for disposable API caches
    }
  }
};

let lastWatchTimeSyncAt = 0;

export const UserManager = {
  KEY: 'nyanime_user_profile',
  getUser() {
    const ledgerCount = countUniqueWatchedEpisodes(AnimeWatchedManager.getAll());
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const realSeconds =
          typeof parsed.stats?.totalSecondsWatched === 'number'
            ? Math.max(0, Math.floor(parsed.stats.totalSecondsWatched))
            : 0;
        const episodesWatched = Math.max(ledgerCount, Math.max(0, Math.floor(Number(parsed.stats?.episodesWatched || 0))));
        const cleanAvatar = isValidStoredAvatar(parsed.avatar) ? String(parsed.avatar) : DEFAULT_AVATAR_URL;
        return {
          username: parsed.username || 'Invitado',
          avatar: cleanAvatar,
          profileUpdatedAt: Math.max(0, Math.floor(Number(parsed.profileUpdatedAt || 0))),
          role: parsed.role || 'FREE',
          stats: {
            episodesWatched: ledgerCount > 0 || parsed.stats?.totalSecondsWatched !== undefined ? ledgerCount : episodesWatched,
            totalMinutes: Math.floor(realSeconds / 60),
            totalSecondsWatched: realSeconds,
            completedAnimes: Math.max(0, Math.floor(Number(parsed.stats?.completedAnimes || 0)))
          }
        };
      }
    } catch {
      // ignore
    }
    return {
      username: 'Invitado',
      avatar: DEFAULT_AVATAR_URL,
      profileUpdatedAt: 0,
      role: 'FREE',
      stats: {
        episodesWatched: ledgerCount,
        totalMinutes: 0,
        totalSecondsWatched: 0,
        completedAnimes: 0
      }
    };
  },
  saveUser(user: any, skipSync = false): void {
    const safeSeconds =
      typeof user?.stats?.totalSecondsWatched === 'number'
        ? Math.max(0, Math.floor(user.stats.totalSecondsWatched))
        : Math.max(0, Math.floor(Number(user?.stats?.totalMinutes || 0) * 60));
    const safeAvatar = isValidStoredAvatar(user?.avatar) ? String(user.avatar) : DEFAULT_AVATAR_URL;
    const normalized = {
      ...user,
      username: String(user?.username || 'Invitado').trim().slice(0, 80) || 'Invitado',
      avatar: safeAvatar,
      profileUpdatedAt: Math.max(0, Math.floor(Number(user?.profileUpdatedAt || 0))),
      stats: {
        ...(user?.stats || {}),
        episodesWatched: Math.max(0, Math.floor(Number(user?.stats?.episodesWatched || 0))),
        totalSecondsWatched: safeSeconds,
        totalMinutes: Math.floor(safeSeconds / 60),
        completedAnimes: Math.max(0, Math.floor(Number(user?.stats?.completedAnimes || 0)))
      }
    };
    if (!safeStorageSetItem(this.KEY, JSON.stringify(normalized))) {
      showToast('Espacio local lleno · No se pudo guardar tu perfil localmente.');
    }
    this.renderProfile();
    if (!skipSync && nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('profile');
    }
  },
  addRealWatchSeconds(deltaSeconds: number, forceSync = false): void {
    const cleanDelta = Number(deltaSeconds);
    if (!Number.isFinite(cleanDelta) || cleanDelta <= 0) return;
    const rounded = Math.max(1, Math.round(cleanDelta));
    const user = this.getUser();
    const nextSeconds = Math.max(0, Math.floor(user.stats.totalSecondsWatched || 0)) + rounded;
    user.stats.totalSecondsWatched = nextSeconds;
    user.stats.totalMinutes = Math.floor(nextSeconds / 60);

    const now = Date.now();
    const shouldSync = forceSync || now - lastWatchTimeSyncAt >= 20000;
    if (shouldSync) lastWatchTimeSyncAt = now;
    this.saveUser(user, !shouldSync);
  },
  syncWatchedStatsFromLedger(skipSync = false): void {
    const watchedMap = AnimeWatchedManager.getAll();
    const uniqueEps = countUniqueWatchedEpisodes(watchedMap);
    const favs = FavoritesManager.getAll();
    let completedCount = 0;
    for (const f of favs) {
      const prog = countWatchedForAnime(f, watchedMap);
      if (f.listStatus === 'completed' || (prog.totalEpisodes > 0 && prog.watchedCount >= prog.totalEpisodes)) {
        completedCount += 1;
      }
    }
    const user = this.getUser();
    const changed =
      user.stats.episodesWatched !== uniqueEps ||
      user.stats.completedAnimes !== completedCount;
    user.stats.episodesWatched = uniqueEps;
    user.stats.completedAnimes = completedCount;
    if (changed) {
      this.saveUser(user, skipSync);
    } else {
      this.renderProfile();
    }
  },
  addEpisodeWatch(): void {
    // Reemplazado por seguimiento deduplicado de episodios y tiempo real de reproducción.
    this.syncWatchedStatsFromLedger();
  },
  getTotalChaptersRead(): number {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('nyanime_read_manga_')) {
          const arr = JSON.parse(localStorage.getItem(k) || '[]');
          if (Array.isArray(arr)) total += arr.length;
        }
      }
    } catch {
      // ignore
    }
    return total;
  },
  renderProfile(): void {
    if (uiHooks.renderProfileUI !== noop) {
      uiHooks.renderProfileUI();
      return;
    }
    const user = this.getUser();
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) nameEl.textContent = user.username || 'Invitado';
  }
};

export interface AppPreferences {
  autoSkipIntro: boolean;
  autoSkipOutro: boolean;
  autoScrobble: boolean;
  weeklySummaryPush: boolean;
  showAdultContent: boolean;
}

const DEFAULT_APP_PREFS: AppPreferences = {
  autoSkipIntro: false,
  autoSkipOutro: false,
  autoScrobble: true,
  weeklySummaryPush: true,
  showAdultContent: false
};

export const AppPreferencesManager = {
  KEY: 'nyanime_app_prefs_v1',
  get(): AppPreferences {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) || 'null');
      if (raw && typeof raw === 'object') {
        return {
          autoSkipIntro: Boolean(raw.autoSkipIntro),
          autoSkipOutro: Boolean(raw.autoSkipOutro),
          autoScrobble: raw.autoScrobble !== false,
          weeklySummaryPush: raw.weeklySummaryPush !== false,
          showAdultContent: raw.showAdultContent === true
        };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_APP_PREFS };
  },
  isShowAdultContentEnabled(): boolean {
    return this.get().showAdultContent === true;
  },
  save(patch: Partial<AppPreferences>, skipSync = false): AppPreferences {
    const next = { ...this.get(), ...(patch || {}) };
    safeStorageSetItem(this.KEY, JSON.stringify(next));
    if (!skipSync && nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('app_prefs');
    }
    return next;
  },
  setAutoSkipIntro(enabled: boolean): void {
    this.save({ autoSkipIntro: Boolean(enabled) });
  },
  setAutoSkipOutro(enabled: boolean): void {
    this.save({ autoSkipOutro: Boolean(enabled) });
  },
  setAutoScrobble(enabled: boolean): void {
    this.save({ autoScrobble: Boolean(enabled) });
  },
  setWeeklySummaryPush(enabled: boolean): void {
    this.save({ weeklySummaryPush: Boolean(enabled) });
  },
  setShowAdultContent(enabled: boolean): void {
    this.save({ showAdultContent: Boolean(enabled) });
  }
};

export const CustomListsManager = {
  KEY: 'nyanime_custom_lists_v1',
  getAll(): CustomList[] {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string');
    } catch {
      return [];
    }
  },
  getById(id: string): CustomList | null {
    return this.getAll().find((l) => l.id === id) || null;
  },
  create(nameRaw: string, opts?: { color?: string; icon?: string }): CustomList | null {
    const built = buildCustomList(nameRaw, opts);
    if (!built) return null;
    const all = this.getAll();
    const next = [built, ...all.filter((l) => l.id !== built.id)].slice(0, 30);
    if (!safeStorageSetItem(this.KEY, JSON.stringify(next))) {
      showToast('Espacio local lleno · No se pudo crear la lista personalizada.');
      return null;
    }
    if (nWin.firebaseSync?.saveCustomList) {
      nWin.firebaseSync.saveCustomList(built).catch(() => {});
    } else if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('custom_lists');
    }
    uiHooks.renderFavoritos();
    uiHooks.renderProfileUI();
    return built;
  },
  remove(listId: string): boolean {
    if (!listId) return false;
    const all = this.getAll();
    if (!all.some((l) => l.id === listId)) return false;
    const next = all.filter((l) => l.id !== listId);
    safeStorageSetItem(this.KEY, JSON.stringify(next));

    // Clean listId from saved anime & manga entries
    try {
      const favs = FavoritesManager.getAll();
      let changedAnime = false;
      const cleanFavs = favs.map((a) => {
        if (Array.isArray(a.customListIds) && a.customListIds.includes(listId)) {
          changedAnime = true;
          return { ...a, customListIds: a.customListIds.filter((id: string) => id !== listId) };
        }
        return a;
      });
      if (changedAnime) safeStorageSetItem(FavoritesManager.KEY, JSON.stringify(cleanFavs));

      const mangaFavs = MangaFavoritesManager.getAll();
      let changedManga = false;
      const cleanMangas = mangaFavs.map((m) => {
        if (Array.isArray(m.customListIds) && m.customListIds.includes(listId)) {
          changedManga = true;
          return { ...m, customListIds: m.customListIds.filter((id: string) => id !== listId) };
        }
        return m;
      });
      if (changedManga) safeStorageSetItem(MangaFavoritesManager.KEY, JSON.stringify(cleanMangas));
    } catch {
      // ignore
    }

    if (nWin.firebaseSync?.deleteCustomList) {
      nWin.firebaseSync.deleteCustomList(listId).catch(() => {});
    } else if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('custom_lists');
    }
    uiHooks.renderFavoritos();
    uiHooks.renderProfileUI();
    return true;
  }
};

export const OAuthScrobbleManager = {
  KEY: 'nyanime_oauth_sessions_v1',
  getSessions(): Partial<Record<OAuthProviderId, OAuthAccountSession>> {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  },
  getSession(provider: OAuthProviderId): OAuthAccountSession | null {
    const s = this.getSessions()[provider];
    return s && s.accessToken ? s : null;
  },
  saveSession(session: OAuthAccountSession): void {
    const all = this.getSessions();
    all[session.provider] = session;
    safeStorageSetItem(this.KEY, JSON.stringify(all));
    uiHooks.renderProfileUI();
  },
  disconnect(provider: OAuthProviderId): void {
    const all = this.getSessions();
    delete all[provider];
    safeStorageSetItem(this.KEY, JSON.stringify(all));
    uiHooks.renderProfileUI();
  },
  async fetchProvidersStatus(): Promise<{
    appUrl?: string;
    anilist?: { configured: boolean; callbackUrl?: string };
    mal?: { configured: boolean; callbackUrl?: string };
  } | null> {
    try {
      const res = await fetchWithTimeout('/api/auth/providers/status', {}, 4500);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },
  async connectPopup(provider: OAuthProviderId): Promise<OAuthAccountSession | null> {
    const urlRes = await fetchWithTimeout(`/api/auth/${provider}/url`, {}, 6000);
    const data = await urlRes.json().catch(() => ({}));
    if (!urlRes.ok || !data?.url) {
      const reason = data?.error || `Faltan credenciales OAuth de ${provider.toUpperCase()} en el servidor.`;
      throw new Error(reason);
    }

    return await new Promise<OAuthAccountSession | null>((resolve, reject) => {
      const w = 540;
      const h = 680;
      const left = Math.max(0, Math.round((window.screen.width - w) / 2));
      const top = Math.max(0, Math.round((window.screen.height - h) / 2));
      const popup = window.open(
        data.url,
        `nyanime_oauth_${provider}`,
        `width=${w},height=${h},left=${left},top=${top},noopener=no`
      );
      if (!popup) {
        reject(new Error('El navegador bloqueó la ventana emergente. Permite popups para continuar.'));
        return;
      }

      let settled = false;
      const cleanup = () => {
        window.removeEventListener('message', onMsg);
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
      };

      const onMsg = (ev: MessageEvent) => {
        const msg = ev.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.provider !== provider) return;
        if (msg.type === 'OAUTH_AUTH_SUCCESS' && msg.accessToken) {
          settled = true;
          cleanup();
          const session: OAuthAccountSession = {
            provider,
            accessToken: String(msg.accessToken),
            refreshToken: msg.refreshToken ? String(msg.refreshToken) : undefined,
            expiresAtMs: typeof msg.expiresAtMs === 'number' ? msg.expiresAtMs : undefined,
            username: msg.username ? String(msg.username) : provider.toUpperCase(),
            userId: msg.userId,
            connectedAt: Date.now()
          };
          this.saveSession(session);
          resolve(session);
        } else if (msg.type === 'OAUTH_AUTH_ERROR') {
          settled = true;
          cleanup();
          reject(new Error(String(msg.error || `Error al autorizar con ${provider}`)));
        }
      };

      window.addEventListener('message', onMsg);

      const pollTimer = setInterval(() => {
        if (!settled && popup.closed) {
          settled = true;
          cleanup();
          resolve(null);
        }
      }, 500);

      const timeoutTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          try { popup.close(); } catch { /* ignore */ }
          reject(new Error('Tiempo de espera agotado para autorizar OAuth.'));
        }
      }, 180_000);
    });
  },
  async refreshMalToken(session: OAuthAccountSession): Promise<OAuthAccountSession | null> {
    if (!session.refreshToken) return null;
    try {
      const res = await fetchWithTimeout(
        '/api/auth/mal/refresh',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken })
        },
        6000
      );
      if (!res.ok) return null;
      const refreshed = await res.json();
      if (!refreshed?.accessToken) return null;
      const nextSession: OAuthAccountSession = {
        ...session,
        accessToken: String(refreshed.accessToken),
        refreshToken: refreshed.refreshToken ? String(refreshed.refreshToken) : session.refreshToken,
        expiresAtMs: typeof refreshed.expiresAtMs === 'number' ? refreshed.expiresAtMs : session.expiresAtMs
      };
      this.saveSession(nextSession);
      return nextSession;
    } catch {
      return null;
    }
  },
  async scrobbleAnime(
    animeOrId: any,
    overrides: { status?: AnimeListStatus; progress?: number; score?: number | null; silent?: boolean } = {}
  ): Promise<void> {
    if (!AppPreferencesManager.get().autoScrobble) return;
    const alSession = this.getSession('anilist');
    const malSession = this.getSession('mal');
    if (!alSession && !malSession) return;

    const animeId = typeof animeOrId === 'object' ? animeOrId?.id : animeOrId;
    if (!animeId) return;

    const savedEntry = FavoritesManager.getEntry(animeId);
    const animeObj = typeof animeOrId === 'object' ? { ...savedEntry, ...animeOrId } : savedEntry;
    const status: AnimeListStatus = overrides.status || FavoritesManager.getStatus(animeId) || 'watching';
    const watchedCount = AnimeWatchedManager.getWatchedSet(animeId).size;
    const progress = overrides.progress !== undefined ? Math.max(0, Math.floor(overrides.progress)) : watchedCount;
    const rawScore = overrides.score !== undefined ? overrides.score : savedEntry?.userScore ?? animeObj?.userScore;
    const score = sanitizeUserScore(rawScore);
    const malId = Number(animeObj?.idMal || savedEntry?.idMal || 0);

    const tasks: Promise<void>[] = [];

    if (alSession && Number(animeId) > 0) {
      tasks.push(
        (async () => {
          const res = await fetchWithTimeout(
            '/api/auth/anilist/scrobble',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${alSession.accessToken}`
              },
              body: JSON.stringify({
                mediaId: Math.floor(Number(animeId)),
                status,
                progress,
                score
              })
            },
            6500
          );
          if (res.ok && !overrides.silent) {
            showToast('Sincronizado con AniList ✓');
          }
        })().catch(() => {})
      );
    }

    if (malSession && Number.isFinite(malId) && malId > 0) {
      tasks.push(
        (async () => {
          const sendMal = (token: string) =>
            fetchWithTimeout(
              '/api/auth/mal/scrobble',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  malId: Math.floor(malId),
                  status,
                  progress,
                  score
                })
              },
              6500
            );
          let res = await sendMal(malSession.accessToken);
          if (res.status === 401 && malSession.refreshToken) {
            const refreshed = await this.refreshMalToken(malSession);
            if (refreshed?.accessToken) {
              res = await sendMal(refreshed.accessToken);
            }
          }
          if (res.ok && !overrides.silent) {
            showToast('Sincronizado con MyAnimeList ✓');
          }
        })().catch(() => {})
      );
    }

    await Promise.allSettled(tasks);
  }
};

export const FavoritesManager = {
  KEY: 'nyanime_favorites_v2',
  getAll(): any[] {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) || '[]') || [];
      if (!Array.isArray(raw)) return [];
      const hadBloat = raw.some((item) => hasBloatedAnimeMetadata(item));
      const normalized = compactFavoritesArray(raw);
      if (hadBloat && normalized.length > 0) {
        safeStorageSetItem(this.KEY, JSON.stringify(normalized));
      }
      return normalized;
    } catch {
      return [];
    }
  },
  getEntry(id: number | string): any | null {
    if (!id) return null;
    return this.getAll().find(item => String(item.id) === String(id)) || null;
  },
  isFavorite(id: number | string): boolean {
    return this.getAll().some(item => String(item.id) === String(id));
  },
  getStatus(id: number | string): AnimeListStatus | null {
    const found = this.getAll().find(item => String(item.id) === String(id));
    if (!found) return null;
    return normalizeAnimeListStatus(found.listStatus, 'plan_to_watch');
  },
  getByStatus(status: AnimeListStatus | 'all'): any[] {
    const all = this.getAll();
    if (status === 'all') return all;
    return all.filter(item => normalizeAnimeListStatus(item.listStatus, 'plan_to_watch') === status);
  },
  getCounts(): Record<AnimeListStatus | 'all', number> {
    const counts: Record<AnimeListStatus | 'all', number> = {
      all: 0,
      watching: 0,
      plan_to_watch: 0,
      completed: 0,
      on_hold: 0,
      dropped: 0
    };
    const all = this.getAll();
    counts.all = all.length;
    for (const item of all) {
      const s = normalizeAnimeListStatus(item.listStatus, 'plan_to_watch');
      counts[s] += 1;
    }
    return counts;
  },
  setRatingAndNotes(
    animeOrId: any,
    patch: { userScore?: number | null; userReview?: string; userNotes?: string }
  ): boolean {
    const targetId = typeof animeOrId === 'object' ? animeOrId?.id : animeOrId;
    if (!targetId) return false;
    const list = this.getAll();
    let idx = list.findIndex(item => String(item.id) === String(targetId));
    const now = Date.now();

    if (idx < 0) {
      if (typeof animeOrId !== 'object' || !animeOrId?.id) return false;
      list.unshift(mergeAnimeFavoriteMetadata(null, animeOrId, 'plan_to_watch', now));
      idx = 0;
    }

    const cur = { ...list[idx] };
    if (patch.userScore !== undefined) {
      const cleanScore = sanitizeUserScore(patch.userScore);
      if (cleanScore === null) delete cur.userScore;
      else cur.userScore = cleanScore;
      cur.scoreUpdatedAt = now;
    }
    if (patch.userReview !== undefined) {
      const cleanRev = sanitizeShortText(patch.userReview, 280);
      if (!cleanRev) delete cur.userReview;
      else cur.userReview = cleanRev;
      cur.scoreUpdatedAt = now;
    }
    if (patch.userNotes !== undefined) {
      const cleanNotes = sanitizeShortText(patch.userNotes, 500);
      if (!cleanNotes) delete cur.userNotes;
      else cur.userNotes = cleanNotes;
    }

    list[idx] = compactAnimeStorageEntry(cur);
    list[idx].listStatus = normalizeAnimeListStatus(cur.listStatus, 'plan_to_watch');
    list[idx].listUpdatedAt = cur.listUpdatedAt || now;

    if (!safeStorageSetItem(this.KEY, JSON.stringify(list))) {
      showToast('No hay espacio local suficiente para guardar tu reseña.');
      return false;
    }
    if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('favorites_rating');
    }
    uiHooks.updateFavoriteButton(targetId);
    uiHooks.renderFavoritos();
    UserManager.renderProfile();
    uiHooks.renderSmartRecommendations();
    void OAuthScrobbleManager.scrobbleAnime(list[idx], { silent: true });
    return true;
  },
  toggleCustomList(animeOrId: any, listId: string): boolean {
    const targetId = typeof animeOrId === 'object' ? animeOrId?.id : animeOrId;
    if (!targetId || !listId) return false;
    const list = this.getAll();
    let idx = list.findIndex(item => String(item.id) === String(targetId));
    const now = Date.now();

    if (idx < 0) {
      if (typeof animeOrId !== 'object' || !animeOrId?.id) return false;
      list.unshift(mergeAnimeFavoriteMetadata(null, animeOrId, 'plan_to_watch', now));
      idx = 0;
    }

    const cur = { ...list[idx] };
    const { nextIds, added } = toggleItemInCustomList(cur.customListIds, listId);
    cur.customListIds = sanitizeCustomListIds(nextIds);
    list[idx] = compactAnimeStorageEntry(cur);
    list[idx].listStatus = normalizeAnimeListStatus(cur.listStatus, 'plan_to_watch');
    list[idx].listUpdatedAt = cur.listUpdatedAt || now;

    if (!safeStorageSetItem(this.KEY, JSON.stringify(list))) {
      showToast('No hay espacio local suficiente.');
      return false;
    }
    if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('favorites_custom_list');
    }
    uiHooks.updateFavoriteButton(targetId);
    uiHooks.renderFavoritos();
    UserManager.renderProfile();
    return added;
  },
  setStatus(anime: any, nextStatus: AnimeListStatus, options: { silent?: boolean; skipSync?: boolean } = {}): void {
    if (!anime?.id) return;
    const cleanStatus = normalizeAnimeListStatus(nextStatus, 'watching');
    const now = Date.now();
    const list = this.getAll();
    const idx = list.findIndex(item => String(item.id) === String(anime.id));
    if (idx >= 0) {
      list[idx] = mergeAnimeFavoriteMetadata(list[idx], anime, cleanStatus, now);
    } else {
      list.unshift(mergeAnimeFavoriteMetadata(null, anime, cleanStatus, now));
    }
    const saved = safeStorageSetItem(this.KEY, JSON.stringify(list));
    if (!saved) {
      showToast('No hay espacio local suficiente. Libera descargas o caché e inténtalo de nuevo.');
      return;
    }
    const savedEntry = list[idx >= 0 ? idx : 0];
    if (!options.silent) {
      const meta = getCategoryMeta(cleanStatus);
      const title = savedEntry?.title?.english || savedEntry?.title?.romaji || 'Anime';
      showToast(`${title} → ${meta.label}`);
    }
    if (!options.skipSync && nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('favorites_status');
    }
    uiHooks.updateFavoriteButton(anime.id);
    uiHooks.renderFavoritos();
    UserManager.syncWatchedStatsFromLedger(true);
    uiHooks.renderSmartRecommendations();
    if (!options.skipSync) {
      void OAuthScrobbleManager.scrobbleAnime(savedEntry, { status: cleanStatus, silent: options.silent });
    }
  },
  remove(id: number | string, options: { silent?: boolean } = {}): boolean {
    if (!id) return false;
    const list = this.getAll();
    const target = list.find(item => String(item.id) === String(id));
    if (!target) return false;
    const nextList = list.filter(item => String(item.id) !== String(id));
    if (!safeStorageSetItem(this.KEY, JSON.stringify(nextList))) {
      showToast('No hay espacio local suficiente para actualizar tu lista.');
      return false;
    }
    if (!options.silent) {
      const title = target.title?.english || target.title?.romaji || 'Anime';
      showToast(`Eliminado de tu Biblioteca: ${title}`);
    }
    if (nWin.firebaseSync?.deleteFavoriteAnime) {
      nWin.firebaseSync.deleteFavoriteAnime(id).catch(() => {});
    } else if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('favorites');
    }
    uiHooks.updateFavoriteButton(id);
    uiHooks.renderFavoritos();
    UserManager.syncWatchedStatsFromLedger(true);
    uiHooks.renderSmartRecommendations();
    return true;
  },
  autoUpdateStatusOnWatch(seasonOrAnimeId: number | string, totalEpisodes = 0): void {
    if (!seasonOrAnimeId) return;
    const list = this.getAll();
    const idx = list.findIndex(item => String(item.id) === String(seasonOrAnimeId));
    if (idx < 0) return;
    const item = list[idx];
    const currentStatus = normalizeAnimeListStatus(item.listStatus, 'plan_to_watch');
    const prog = countWatchedForAnime(
      { ...item, episodes: totalEpisodes > 0 ? totalEpisodes : item.episodes },
      AnimeWatchedManager.getAll()
    );
    const nextStatus = resolveAutoListStatusTransition(currentStatus, prog.watchedCount, prog.totalEpisodes);
    if (nextStatus !== currentStatus) {
      list[idx] = {
        ...item,
        listStatus: nextStatus,
        listUpdatedAt: Date.now()
      };
      safeStorageSetItem(this.KEY, JSON.stringify(list));
      uiHooks.updateFavoriteButton(item.id);
      uiHooks.renderFavoritos();
      UserManager.renderProfile();
      uiHooks.renderSmartRecommendations();
      if (nWin.firebaseSync?.scheduleSync) {
        nWin.firebaseSync.scheduleSync('favorites_auto_status');
      }
      void OAuthScrobbleManager.scrobbleAnime(list[idx], { status: nextStatus, silent: true });
    }
  },
  toggle(anime: any, defaultStatus: AnimeListStatus = 'watching'): void {
    if (!anime?.id) return;
    const list = this.getAll();
    const exists = list.some(item => String(item.id) === String(anime.id));
    if (exists) {
      this.remove(anime.id);
    } else {
      const cleanStatus = normalizeAnimeListStatus(anime.listStatus || defaultStatus, 'watching');
      const entry = mergeAnimeFavoriteMetadata(null, anime, cleanStatus, Date.now());
      list.unshift(entry);
      if (!safeStorageSetItem(this.KEY, JSON.stringify(list))) {
        showToast('No hay espacio local suficiente para guardar este anime.');
        return;
      }
      const meta = getCategoryMeta(cleanStatus);
      const title = entry.title?.english || entry.title?.romaji || 'Anime';
      showToast(`Guardado en ${meta.label}: ${title}`);
      if (nWin.firebaseSync?.scheduleSync) {
        nWin.firebaseSync.scheduleSync('favorites');
      }
      uiHooks.updateFavoriteButton(anime.id);
      uiHooks.renderFavoritos();
      UserManager.syncWatchedStatsFromLedger(true);
      uiHooks.renderSmartRecommendations();
      void OAuthScrobbleManager.scrobbleAnime(entry, { status: cleanStatus, silent: true });
    }
  },
  importList(animes: any[]): number {
    const list = this.getAll();
    let added = 0;
    let updated = 0;
    const now = Date.now();
    animes.forEach(a => {
      if (!a?.id) return;
      const importedStatus = normalizeAnimeListStatus(a.listStatus, 'plan_to_watch');
      const idx = list.findIndex(x => String(x.id) === String(a.id));
      if (idx < 0) {
        list.unshift(mergeAnimeFavoriteMetadata(null, a, importedStatus, now));
        added++;
      } else if (a.listStatus && list[idx].listStatus !== importedStatus) {
        list[idx] = mergeAnimeFavoriteMetadata(list[idx], a, importedStatus, now);
        updated++;
      }
      const prog = Math.floor(Number(a.watchedProgress || 0));
      if (prog > 0) {
        AnimeWatchedManager.markUpTo(a.id, prog, { silentSync: true, totalEpisodes: Number(a.episodes || prog) });
      }
    });
    safeStorageSetItem(this.KEY, JSON.stringify(list));
    if ((added > 0 || updated > 0) && nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('favorites_import');
    }
    uiHooks.renderFavoritos();
    UserManager.syncWatchedStatsFromLedger(true);
    return added;
  }
};

export const MangaFavoritesManager = {
  KEY: 'nyanime_manga_favorites_v1',
  getAll(): any[] {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || '[]') || [];
    } catch {
      return [];
    }
  },
  getEntry(id: number | string): any | null {
    if (!id) return null;
    return this.getAll().find(item => String(item.id) === String(id)) || null;
  },
  isFavorite(id: number | string): boolean {
    return this.getAll().some(item => String(item.id) === String(id));
  },
  setRatingAndNotes(
    mangaOrId: any,
    patch: { userScore?: number | null; userReview?: string; userNotes?: string }
  ): boolean {
    const targetId = typeof mangaOrId === 'object' ? mangaOrId?.id : mangaOrId;
    if (!targetId) return false;
    const list = this.getAll();
    let idx = list.findIndex(item => String(item.id) === String(targetId));
    const now = Date.now();

    if (idx < 0) {
      if (typeof mangaOrId !== 'object' || !mangaOrId?.id) return false;
      const compact = compactMangaEntry(mangaOrId) || mangaOrId;
      list.unshift(compact);
      idx = 0;
    }

    const cur = { ...list[idx] };
    if (patch.userScore !== undefined) {
      const cleanScore = sanitizeUserScore(patch.userScore);
      if (cleanScore === null) delete cur.userScore;
      else cur.userScore = cleanScore;
      cur.scoreUpdatedAt = now;
    }
    if (patch.userReview !== undefined) {
      const cleanRev = sanitizeShortText(patch.userReview, 280);
      if (!cleanRev) delete cur.userReview;
      else cur.userReview = cleanRev;
      cur.scoreUpdatedAt = now;
    }
    if (patch.userNotes !== undefined) {
      const cleanNotes = sanitizeShortText(patch.userNotes, 500);
      if (!cleanNotes) delete cur.userNotes;
      else cur.userNotes = cleanNotes;
    }

    list[idx] = compactMangaEntry(cur) || cur;
    if (!safeStorageSetItem(this.KEY, JSON.stringify(list))) {
      showToast('No hay espacio local suficiente.');
      return false;
    }
    if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('manga_rating');
    }
    uiHooks.updateMangaFavoriteButton(targetId);
    UserManager.renderProfile();
    if (state.tabActual === 'favoritos') uiHooks.renderFavoritos();
    return true;
  },
  toggleCustomList(mangaOrId: any, listId: string): boolean {
    const targetId = typeof mangaOrId === 'object' ? mangaOrId?.id : mangaOrId;
    if (!targetId || !listId) return false;
    const list = this.getAll();
    let idx = list.findIndex(item => String(item.id) === String(targetId));
    if (idx < 0) {
      if (typeof mangaOrId !== 'object' || !mangaOrId?.id) return false;
      const compact = compactMangaEntry(mangaOrId) || mangaOrId;
      list.unshift(compact);
      idx = 0;
    }

    const cur = { ...list[idx] };
    const { nextIds, added } = toggleItemInCustomList(cur.customListIds, listId);
    cur.customListIds = sanitizeCustomListIds(nextIds);
    list[idx] = compactMangaEntry(cur) || cur;
    if (!safeStorageSetItem(this.KEY, JSON.stringify(list))) {
      showToast('No hay espacio local suficiente.');
      return false;
    }
    if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('manga_custom_list');
    }
    uiHooks.updateMangaFavoriteButton(targetId);
    UserManager.renderProfile();
    if (state.tabActual === 'favoritos') uiHooks.renderFavoritos();
    return added;
  },
  toggle(manga: any): void {
    if (!manga) return;
    let list = this.getAll();
    const exists = list.some(item => String(item.id) === String(manga.id));
    if (exists) {
      list = list.filter(item => String(item.id) !== String(manga.id));
      showToast(`Eliminado de Mangas: ${manga.title}`);
    } else {
      const compact = compactMangaEntry(manga) || manga;
      list.unshift(compact);
      showToast(`Añadido a Mangas Favoritos: ${manga.title}`);
    }
    safeStorageSetItem(this.KEY, JSON.stringify(list));
    if (exists && nWin.firebaseSync?.deleteFavoriteManga) {
      nWin.firebaseSync.deleteFavoriteManga(manga.id).catch(() => {});
    } else if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('manga_favorites');
    }
    uiHooks.updateMangaFavoriteButton(manga.id);
    UserManager.renderProfile();
    if (state.tabActual === 'favoritos') uiHooks.renderFavoritos();
  }
};

export const AnimeWatchedManager = {
  KEY: 'nyanime_anime_watched_v1',
  TS_KEY: 'nyanime_anime_watched_ts_v1',
  getAll(): Record<string, number[]> {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch { return {}; }
  },
  getTimestamps(): Record<string, number> {
    try { return JSON.parse(localStorage.getItem(this.TS_KEY) || '{}') || {}; } catch { return {}; }
  },
  getWatchedSet(seasonId: number | string): Set<number> {
    const all = this.getAll();
    return new Set((all[String(seasonId)] || []).map(Number).filter(n => Number.isFinite(n) && n >= 1));
  },
  isWatched(seasonId: number | string, ep: number): boolean {
    return this.getWatchedSet(seasonId).has(Number(ep));
  },
  markWatched(
    seasonId: number | string,
    ep: number,
    watched = true,
    options: { totalEpisodes?: number; silentSync?: boolean } = {}
  ): void {
    if (!seasonId || !ep) return;
    const all = this.getAll();
    const tsMap = this.getTimestamps();
    const key = String(seasonId);
    const set = new Set((all[key] || []).map(Number).filter(n => Number.isFinite(n) && n >= 1));
    if (watched) set.add(Math.floor(Number(ep)));
    else set.delete(Math.floor(Number(ep)));
    const nextArr = Array.from(set).sort((a, b) => a - b);
    all[key] = nextArr;
    tsMap[key] = Date.now();
    try {
      localStorage.setItem(this.KEY, JSON.stringify(all));
      localStorage.setItem(this.TS_KEY, JSON.stringify(tsMap));
    } catch { /* ignore */ }

    FavoritesManager.autoUpdateStatusOnWatch(seasonId, options.totalEpisodes || 0);
    UserManager.syncWatchedStatsFromLedger(true);

    if (!options.silentSync) {
      if (nWin.firebaseSync?.updateCloudAnimeWatchedOverwrite) {
        nWin.firebaseSync.updateCloudAnimeWatchedOverwrite(seasonId, nextArr).catch(() => {});
      } else if (nWin.firebaseSync?.scheduleSync) {
        nWin.firebaseSync.scheduleSync('anime_watched');
      }
      const targetAnime = FavoritesManager.getEntry(seasonId) || (String(state.anime?.id) === String(seasonId) ? state.anime : null);
      if (targetAnime) {
        void OAuthScrobbleManager.scrobbleAnime(targetAnime, {
          progress: nextArr.length,
          silent: true
        });
      }
    }
  },
  markUpTo(
    seasonId: number | string,
    upToEp: number,
    options: { totalEpisodes?: number; silentSync?: boolean } = {}
  ): void {
    const cap = Math.min(2000, Math.max(0, Math.floor(Number(upToEp || 0))));
    if (!seasonId || cap <= 0) return;
    const all = this.getAll();
    const tsMap = this.getTimestamps();
    const key = String(seasonId);
    const set = new Set((all[key] || []).map(Number).filter(n => Number.isFinite(n) && n >= 1));
    for (let i = 1; i <= cap; i++) set.add(i);
    const nextArr = Array.from(set).sort((a, b) => a - b);
    all[key] = nextArr;
    tsMap[key] = Date.now();
    try {
      localStorage.setItem(this.KEY, JSON.stringify(all));
      localStorage.setItem(this.TS_KEY, JSON.stringify(tsMap));
    } catch { /* ignore */ }

    FavoritesManager.autoUpdateStatusOnWatch(seasonId, options.totalEpisodes || cap);
    if (!options.silentSync) {
      UserManager.syncWatchedStatsFromLedger(true);
      if (nWin.firebaseSync?.updateCloudAnimeWatchedOverwrite) {
        nWin.firebaseSync.updateCloudAnimeWatchedOverwrite(seasonId, nextArr).catch(() => {});
      } else if (nWin.firebaseSync?.scheduleSync) {
        nWin.firebaseSync.scheduleSync('anime_watched');
      }
      const targetAnime = FavoritesManager.getEntry(seasonId) || (String(state.anime?.id) === String(seasonId) ? state.anime : null);
      if (targetAnime) {
        void OAuthScrobbleManager.scrobbleAnime(targetAnime, {
          progress: nextArr.length,
          silent: true
        });
      }
    }
  },
  markAll(
    seasonId: number | string,
    totalEpisodes: number,
    watched = true
  ): void {
    if (!seasonId || totalEpisodes <= 0) return;
    const all = this.getAll();
    const tsMap = this.getTimestamps();
    const key = String(seasonId);
    const cap = Math.min(2000, Math.floor(totalEpisodes));
    const nextArr = watched ? Array.from({ length: cap }, (_, i) => i + 1) : [];
    all[key] = nextArr;
    tsMap[key] = Date.now();
    try {
      localStorage.setItem(this.KEY, JSON.stringify(all));
      localStorage.setItem(this.TS_KEY, JSON.stringify(tsMap));
    } catch { /* ignore */ }

    FavoritesManager.autoUpdateStatusOnWatch(seasonId, totalEpisodes);
    UserManager.syncWatchedStatsFromLedger(true);
    if (nWin.firebaseSync?.updateCloudAnimeWatchedOverwrite) {
      nWin.firebaseSync.updateCloudAnimeWatchedOverwrite(seasonId, nextArr).catch(() => {});
    } else if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('anime_watched');
    }
    const targetAnime = FavoritesManager.getEntry(seasonId) || (String(state.anime?.id) === String(seasonId) ? state.anime : null);
    if (targetAnime) {
      void OAuthScrobbleManager.scrobbleAnime(targetAnime, {
        progress: nextArr.length,
        silent: true
      });
    }
  }
};

let lastSavedPlaybackWriteAt = 0;

function getEpProgressMap(): Record<string, EpisodeProgressEntry> {
  try {
    return JSON.parse(localStorage.getItem(EP_PROGRESS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function buildEpProgressKey(animeId: number | string, seasonNum: number, epNum: number): string {
  return `${String(animeId)}_s${Number(seasonNum || 1)}_ep${Number(epNum || 1)}`;
}

export const HistoryManager = {
  KEY: 'nyanime_history_v2',
  getAll(): AnimeHistoryEntry[] {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]') || []; } catch { return []; }
  },
  save(anime: any, seasonNum: number, episodeNum: number, seasonId?: number | string): void {
    if (!anime) return;
    const prevList = this.getAll();
    const existing = prevList.find(item => String(item.anime?.id) === String(anime.id));
    const sameEpisode = Boolean(
      existing &&
      Number(existing.seasonNum || 1) === Number(seasonNum || 1) &&
      Number(existing.episodeNum || 1) === Number(episodeNum || 1)
    );
    const epSaved = this.getProgress(anime.id, seasonNum, episodeNum);

    const list = prevList.filter(item => String(item.anime?.id) !== String(anime.id));
    const compactAnime = compactAnimeStorageEntry(anime);
    list.unshift({
      anime: compactAnime,
      seasonNum,
      episodeNum,
      timestamp: Date.now(),
      currentTime: sameEpisode ? (existing?.currentTime ?? epSaved?.currentTime ?? 0) : (epSaved?.currentTime ?? 0),
      duration: sameEpisode ? (existing?.duration ?? epSaved?.duration ?? 0) : (epSaved?.duration ?? 0),
      completed: sameEpisode ? Boolean(existing?.completed ?? epSaved?.completed) : Boolean(epSaved?.completed)
    });
    if (list.length > 20) list.pop();
    safeStorageSetItem(this.KEY, JSON.stringify(list));
    uiHooks.renderContinuarViendo();

    if (FavoritesManager.getStatus(anime.id) === 'plan_to_watch') {
      FavoritesManager.setStatus(anime, 'watching', { silent: true, skipSync: true });
    }
    if (seasonId && String(seasonId) !== String(anime.id) && FavoritesManager.getStatus(seasonId) === 'plan_to_watch') {
      const seasonItem = FavoritesManager.getAll().find(item => String(item.id) === String(seasonId));
      if (seasonItem) {
        FavoritesManager.setStatus(seasonItem, 'watching', { silent: true, skipSync: true });
      }
    }
    if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('history');
    }
  },
  getProgress(
    animeId: number | string,
    seasonNum: number,
    episodeNum: number
  ): { currentTime: number; duration: number; completed: boolean } | null {
    if (!animeId) return null;
    const list = this.getAll();
    const topMatch = list.find(
      item =>
        String(item.anime?.id) === String(animeId) &&
        Number(item.seasonNum || 1) === Number(seasonNum || 1) &&
        Number(item.episodeNum || 1) === Number(episodeNum || 1)
    );
    if (topMatch && Number(topMatch.duration || 0) > 0) {
      return {
        currentTime: Number(topMatch.currentTime || 0),
        duration: Number(topMatch.duration || 0),
        completed: Boolean(topMatch.completed)
      };
    }
    const epMap = getEpProgressMap();
    const found = epMap[buildEpProgressKey(animeId, seasonNum, episodeNum)];
    if (found && Number(found.duration || 0) > 0) {
      return {
        currentTime: Number(found.currentTime || 0),
        duration: Number(found.duration || 0),
        completed: Boolean(found.completed)
      };
    }
    return null;
  },
  saveProgress(
    anime: any,
    seasonNum: number,
    episodeNum: number,
    currentTime: number,
    duration: number,
    options: { force?: boolean; seasonId?: number | string } = {}
  ): void {
    if (!anime?.id || !Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return;

    const now = Date.now();
    if (!options.force && now - lastSavedPlaybackWriteAt < 4800) {
      return;
    }
    lastSavedPlaybackWriteAt = now;

    const cleanTime = Math.max(0, Math.round(currentTime));
    const cleanDuration = Math.max(1, Math.round(duration));
    const completed = shouldMarkEpisodeCompleted(cleanTime, cleanDuration);

    const epMap = getEpProgressMap();
    const pKey = buildEpProgressKey(anime.id, seasonNum, episodeNum);
    epMap[pKey] = {
      currentTime: cleanTime,
      duration: cleanDuration,
      completed,
      updatedAt: now
    };
    try {
      const keys = Object.keys(epMap);
      if (keys.length > 150) {
        keys
          .sort((a, b) => (epMap[a]?.updatedAt || 0) - (epMap[b]?.updatedAt || 0))
          .slice(0, keys.length - 150)
          .forEach(k => delete epMap[k]);
      }
      localStorage.setItem(EP_PROGRESS_KEY, JSON.stringify(epMap));
    } catch {
      // ignore
    }

    const list = this.getAll();
    const idx = list.findIndex(item => String(item.anime?.id) === String(anime.id));
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        seasonNum,
        episodeNum,
        currentTime: cleanTime,
        duration: cleanDuration,
        completed,
        timestamp: now
      };
    } else {
      list.unshift({
        anime: compactAnimeStorageEntry(anime),
        seasonNum,
        episodeNum,
        currentTime: cleanTime,
        duration: cleanDuration,
        completed,
        timestamp: now
      });
    }
    if (list.length > 20) list.pop();
    safeStorageSetItem(this.KEY, JSON.stringify(list));

    if (completed) {
      const targetSeasonId = options.seasonId || anime.id;
      if (!AnimeWatchedManager.isWatched(targetSeasonId, episodeNum)) {
        AnimeWatchedManager.markWatched(targetSeasonId, episodeNum, true, {
          totalEpisodes: Number(anime.episodes || 0)
        });
        uiHooks.actualizarEstadoVistoPlayerUI();
        uiHooks.renderDetalleEpisodios();
      }
    }

    uiHooks.renderContinuarViendo();
    if (options.force && nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('playback_progress');
    }
  },
  clear(): void {
    localStorage.removeItem(this.KEY);
    localStorage.removeItem(EP_PROGRESS_KEY);
    uiHooks.renderContinuarViendo();
    if (nWin.firebaseSync?.deleteCloudHistory) {
      nWin.firebaseSync.deleteCloudHistory('anime').catch(() => {});
    }
  }
};

export const MangaReadStateManager = {
  getKey(mangaId: number | string): string {
    return `nyanime_read_manga_${mangaId}`;
  },
  getReadChapters(mangaId: number | string): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(this.getKey(mangaId)) || '[]'));
    } catch {
      return new Set();
    }
  },
  isRead(mangaId: number | string, chapterNum: number | string): boolean {
    return this.getReadChapters(mangaId).has(String(chapterNum));
  },
  markRead(mangaId: number | string, chapterNum: number | string): boolean {
    const set = this.getReadChapters(mangaId);
    set.add(String(chapterNum));
    localStorage.setItem(this.getKey(mangaId), JSON.stringify(Array.from(set)));
    UserManager.renderProfile();
    if (nWin.firebaseSync?.scheduleSync) nWin.firebaseSync.scheduleSync('manga_read');
    return true;
  },
  toggleRead(mangaId: number | string, chapterNum: number | string): boolean {
    const set = this.getReadChapters(mangaId);
    const strNum = String(chapterNum);
    if (set.has(strNum)) set.delete(strNum);
    else set.add(strNum);
    const arr = Array.from(set);
    localStorage.setItem(this.getKey(mangaId), JSON.stringify(arr));
    UserManager.renderProfile();
    if (nWin.firebaseSync?.updateCloudMangaProgressOverwrite) {
      const active = getActiveManga();
      nWin.firebaseSync.updateCloudMangaProgressOverwrite(mangaId, arr, active || undefined).catch(() => {});
    } else if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('manga_read');
    }
    return set.has(strNum);
  },
  markAll(mangaId: number | string, chapterNums: (number | string)[], read = true): void {
    const set = read ? new Set((chapterNums || []).map(String)) : new Set<string>();
    const arr = Array.from(set);
    localStorage.setItem(this.getKey(mangaId), JSON.stringify(arr));
    UserManager.renderProfile();
    if (nWin.firebaseSync?.updateCloudMangaProgressOverwrite) {
      const active = getActiveManga();
      nWin.firebaseSync.updateCloudMangaProgressOverwrite(mangaId, arr, active || undefined).catch(() => {});
    } else if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('manga_read');
    }
  }
};

export const MangaHistoryManager = {
  KEY: 'nyanime_manga_history_v1',
  getAll(): MangaHistoryEntry[] {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]') || []; } catch { return []; }
  },
  getEntry(mangaId: number | string): MangaHistoryEntry | null {
    return this.getAll().find(x => String(x.manga?.id) === String(mangaId)) || null;
  },
  getSavedPageNumber(mangaId: number | string, chapterNum: number | string): number {
    const entry = this.getEntry(mangaId);
    if (!entry) return 1;
    if (Math.abs(Number(entry.chapterNum) - Number(chapterNum)) < 0.001) {
      return Math.max(1, Number(entry.pageNumber || 1));
    }
    return 1;
  },
  save(manga: any, chapterObj: any, pageNumber?: number): void {
    if (!manga || !manga.id || !chapterObj) return;
    const prev = this.getEntry(manga.id);
    const chapNum = chapterObj.chapterNum ?? 1;
    const sameChap = Boolean(prev && Math.abs(Number(prev.chapterNum) - Number(chapNum)) < 0.001);
    const preservedPage = typeof pageNumber === 'number' && pageNumber >= 1
      ? Math.floor(pageNumber)
      : (sameChap ? Math.max(1, Number(prev?.pageNumber || 1)) : 1);

    let list = this.getAll().filter(x => String(x.manga?.id) !== String(manga.id));
    list.unshift({
      manga: {
        id: manga.id,
        dexId: manga.dexId || null,
        title: manga.title,
        altTitles: manga.altTitles || [],
        cover: manga.cover,
        banner: manga.banner || manga.cover,
        desc: manga.desc || '',
        score: manga.score || '8.7',
        status: manga.status || 'En Emisión',
        year: manga.year || '2024',
        origLang: manga.origLang || 'jp',
        flag: manga.flag || '🇯🇵 Manga',
        genres: manga.genres || [],
        chaptersCount: manga.chaptersCount || 0,
        preferredSource: manga.preferredSource || null
      },
      chapterNum: chapNum,
      chapterLabel: chapterObj.chapter || String(chapNum || 1),
      pageNumber: preservedPage,
      timestamp: Date.now()
    });
    if (list.length > 20) list = list.slice(0, 20);
    safeStorageSetItem(this.KEY, JSON.stringify(list));
    uiHooks.renderContinuarLeyendoManga();
    if (nWin.firebaseSync?.scheduleSync) nWin.firebaseSync.scheduleSync('manga_history');
  },
  savePageNumber(mangaId: number | string, chapterNum: number | string, pageNumber: number): void {
    if (!mangaId || !Number.isFinite(pageNumber) || pageNumber < 1) return;
    const list = this.getAll();
    const idx = list.findIndex(x => String(x.manga?.id) === String(mangaId));
    if (idx < 0) return;
    if (Math.abs(Number(list[idx].chapterNum) - Number(chapterNum)) < 0.001) {
      const cleanPage = Math.max(1, Math.floor(pageNumber));
      if (list[idx].pageNumber === cleanPage) return;
      list[idx] = {
        ...list[idx],
        pageNumber: cleanPage,
        timestamp: Date.now()
      };
      safeStorageSetItem(this.KEY, JSON.stringify(list));
      uiHooks.renderContinuarLeyendoManga();
    }
  },
  clear(): void {
    localStorage.removeItem(this.KEY);
    uiHooks.renderContinuarLeyendoManga();
    if (nWin.firebaseSync?.deleteCloudHistory) {
      nWin.firebaseSync.deleteCloudHistory('manga').catch(() => {});
    }
  }
};

export const DownloadManager = {
  KEY: 'nyanime_downloads_v1',
  activeTab: 'all' as 'all' | 'active' | 'anime' | 'watch-later' | 'manga',
  searchQuery: '',
  getAll(): any[] {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]') || []; } catch { return []; }
  },
  save(downloads: any[]): void {
    safeStorageSetItem(this.KEY, JSON.stringify(downloads));
    void this.updateBadge();
  },
  add(item: any): void {
    const list = this.getAll();
    list.unshift(item);
    this.save(list);
    void this.renderDownloadsModal();
  },
  setTab(tab: 'all' | 'active' | 'anime' | 'watch-later' | 'manga'): void {
    this.activeTab = tab;
    void this.renderDownloadsModal();
  },
  setSearch(query: string): void {
    this.searchQuery = String(query || '');
    void this.renderDownloadsModal();
  },
  async updateBadge(): Promise<void> {
    let count = 0;
    if (nWin.NyAnimeOffline?.getAllOfflineManifests) {
      const manifests = await nWin.NyAnimeOffline.getAllOfflineManifests();
      count = manifests.length;
    } else {
      count = this.getAll().length;
    }
    const badge = document.getElementById('downloads-badge');
    const countText = document.getElementById('profile-downloads-count');
    if (badge) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.classList.toggle('hide', count <= 0);
    }
    if (countText) {
      countText.textContent = `${count} ${count === 1 ? 'elemento guardado' : 'elementos guardados'}`;
    }
  },
  async renderDownloadsModal(): Promise<void> {
    const container = document.getElementById('gestor-downloads-list');
    const summaryEl = document.getElementById('gestor-storage-summary');
    const tabsEl = document.getElementById('gestor-filter-tabs');
    if (!container) return;

    if (nWin.NyAnimeOffline?.renderOfflineDownloadsModal) {
      nWin.NyAnimeOffline.openItem = async (offlineId: string) => {
        const m = await nWin.NyAnimeOffline.getOfflineManifestById(offlineId);
        if (!m) return;
        if (m.kind === 'manga') {
          cerrarModales();
          const restoredManga = m.mangaMeta
            ? { ...m.mangaMeta }
            : { id: m.mediaId, title: m.title, cover: m.cover || '' };
          setActiveManga(restoredManga);

          let capList: any[] = [];
          if (
            nWin.NyAnimeOffline?.getOfflineMangaChaptersForSeries &&
            nWin.NyAnimeOffline?.buildOfflineChapterBucketsFromManifests
          ) {
            const seriesManifests = await nWin.NyAnimeOffline.getOfflineMangaChaptersForSeries([
              restoredManga.id,
              restoredManga.dexId,
              m.mediaId
            ]);
            if (Array.isArray(seriesManifests) && seriesManifests.length > 0) {
              capList = nWin.NyAnimeOffline.buildOfflineChapterBucketsFromManifests(seriesManifests).all || [];
            }
          }

          if (capList.length === 0) {
            capList = [{
              id: m.id,
              chapter: String(m.chapterLabel || m.chapterNum || 1),
              chapterNum: Number(m.chapterNum || 1),
              title: m.chapterTitle || `Cap. ${m.chapterLabel || m.chapterNum || 1}`,
              pages: m.pageCount || 0,
              group: 'Offline 💾',
              lang: m.lang || 'es',
              source: 'Offline',
              isOfflineCached: true
            }];
          }

          const targetIdx = capList.findIndex(
            (c) => c.id === m.id || Math.abs(Number(c.chapterNum) - Number(m.chapterNum ?? -1)) < 0.001
          );
          const resolvedIdx = targetIdx >= 0 ? targetIdx : 0;

          if (nWin.mangaUiState) {
            nWin.mangaUiState.capitulosLectorList = capList;
          }
          if (nWin.Store?.state) {
            nWin.Store.state.activeChapter = capList[resolvedIdx];
          }
          (nWin as any).capitulosLectorList = capList;
          await uiHooks.abrirLectorManga(resolvedIdx);
        } else if (m.kind === 'anime-video') {
          cerrarModales();
          if (typeof nWin.reproducirVideoOfflineCacheado === 'function') {
            await nWin.reproducirVideoOfflineCacheado(m);
          }
        } else {
          // Legacy watch-later item: ALWAYS open inside NyAnime TV's internal player, NEVER an external embed tab
          cerrarModales();
          const cleanTitle = String(m.title || 'Anime').replace(/\s*\(T\d+\)\s*$/i, '').trim();
          const numericId = Number(m.mediaId);
          const epNum = Math.max(1, Number(m.episode || 1));
          const targetAnime =
            FavoritesManager.getEntry(m.mediaId) ||
            (Number.isFinite(numericId) && numericId > 0
              ? {
                  id: numericId,
                  title: { english: cleanTitle, romaji: cleanTitle },
                  coverImage: { large: m.cover || '', extraLarge: m.cover || '' },
                  episodes: epNum
                }
              : {
                  id: m.mediaId || Date.now(),
                  title: { english: cleanTitle, romaji: cleanTitle },
                  coverImage: { large: m.cover || '', extraLarge: m.cover || '' },
                  episodes: epNum
                });
          if (typeof uiHooks.abrirDetalle === 'function') {
            await uiHooks.abrirDetalle(targetAnime);
          }
          if (typeof nWin.abrirReproductor === 'function') {
            await nWin.abrirReproductor(epNum);
          }
        }
      };
      nWin.NyAnimeOffline.exportMp4 = async (offlineId: string) => {
        if (typeof nWin.NyAnimeOffline.exportOfflineAnimeToDevice === 'function') {
          const ok = await nWin.NyAnimeOffline.exportOfflineAnimeToDevice(offlineId);
          showToast(ok ? 'Exportando archivo .MP4 desde caché local...' : 'No se pudo exportar el archivo .MP4.');
        }
      };
      nWin.NyAnimeOffline.deleteItem = async (offlineId: string) => {
        await nWin.NyAnimeOffline.deleteOfflineManifestById(offlineId);
        await this.renderDownloadsModal();
        await this.updateBadge();
        if (state.tipoLecturaActual === 'OFFLINE') {
          void uiHooks.cargarMangasYNovelas();
        }
        if (typeof nWin.refreshOfflineMangaDetailState === 'function') {
          await nWin.refreshOfflineMangaDetailState(undefined, true);
        }
        if (typeof nWin.renderDetalleEpisodios === 'function') {
          nWin.renderDetalleEpisodios();
        }
        showToast('Elemento eliminado del almacenamiento offline.');
      };
      const activeBatch =
        typeof nWin.getActiveAnimeDownloadSnapshot === 'function'
          ? nWin.getActiveAnimeDownloadSnapshot()
          : null;
      await nWin.NyAnimeOffline.renderOfflineDownloadsModal(container, summaryEl, {
        activeTab: this.activeTab,
        query: this.searchQuery,
        tabsContainerEl: tabsEl,
        activeBatch
      });
      await this.updateBadge();
      return;
    }

    const list = this.getAll();
    if (list.length === 0) {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:12px; padding:20px;">No hay descargas registradas.</div>';
      return;
    }
    container.innerHTML = list.map((item) => `
      <div class="download-ep-row">
        <div>
          <div style="font-weight:700; color:white;">${escHtml(item.animeTitle)} - Ep ${escHtml(item.episode)}</div>
          <div style="font-size:10px; color:#f59e0b;">Guardado en cola · ${escHtml(item.quality || 'HD')}</div>
        </div>
      </div>
    `).join('');
  }
};

export const CommentsManager = {
  async render(animeId: number | string, ep: number | string): Promise<void> {
    if (nWin.RealCommentsManager?.render) {
      await nWin.RealCommentsManager.render(animeId, ep);
    }
  },
  async addComment(animeId: number | string, ep: number | string, text: string, isSpoiler = false): Promise<void> {
    if (!nWin.RealCommentsManager?.addComment) {
      throw new Error('Servicio de comentarios no inicializado.');
    }
    await nWin.RealCommentsManager.addComment(animeId, ep, text, Boolean(isSpoiler));
  },
  async deleteComment(animeId: number | string, ep: number | string, commentId: string): Promise<void> {
    if (nWin.RealCommentsManager?.deleteComment) {
      await nWin.RealCommentsManager.deleteComment(animeId, ep, commentId);
      showToast('Comentario eliminado');
    }
  },
  async loadMore(animeId: number | string, ep: number | string): Promise<void> {
    if (nWin.RealCommentsManager?.loadMore) {
      await nWin.RealCommentsManager.loadMore(animeId, ep);
    }
  },
  revealSpoiler(triggerEl: HTMLElement | null): void {
    if (nWin.RealCommentsManager?.revealSpoiler) {
      nWin.RealCommentsManager.revealSpoiler(triggerEl);
    }
  },
  updateCharCounter(text?: string): void {
    if (nWin.RealCommentsManager?.updateCharCounter) {
      nWin.RealCommentsManager.updateCharCounter(text);
    }
  }
};

export const SuggestionsManager = {
  KEY: 'nyanime_suggestions_v1',
  getAll(): any[] {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]') || []; } catch { return []; }
  },
  add(tipo: string, texto: string): void {
    const list = this.getAll();
    list.unshift({
      tipo,
      texto,
      fecha: new Date().toISOString()
    });
    safeStorageSetItem(this.KEY, JSON.stringify(list.slice(0, 50)));
    if (nWin.firebaseSync?.saveSuggestion) {
      nWin.firebaseSync.saveSuggestion(tipo, texto).catch(() => {});
    }
  }
};

export function setupTouchGestures(): void {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isHorizontalSwipe = false;
  let isEdgeSwipe = false;

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    isHorizontalSwipe = false;
    isEdgeSwipe = touchStartX < 45;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      isHorizontalSwipe = true;
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!isHorizontalSwipe) return;
    const duration = Date.now() - touchStartTime;
    if (duration > 480) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    if (Math.abs(dx) < 65 || Math.abs(dy) > Math.abs(dx) * 0.75) return;

    if (isEdgeSwipe && dx > 60) {
      if (navigator.vibrate) navigator.vibrate(15);
      nWin.handleAndroidBackButton?.();
      return;
    }

    const detalle = document.getElementById('pantalla-detalle');
    const activeModal = document.querySelector<HTMLElement>('.modal-overlay.active, .modal-overlay.open, .ny-dialog.active, .ny-dialog.open');

    if (activeModal && dx > 80) {
      const behavior = resolveModalDismissBehavior(activeModal.id, {
        isBatchDownloadRunning: isAnimeBatchDownloadRunning()
      });
      if (behavior === 'blocked') return;
      if (navigator.vibrate) navigator.vibrate(15);
      if (behavior === 'minimize' && typeof nWin.cerrarOMinimizarModalDescargaTemporada === 'function') {
        nWin.cerrarOMinimizarModalDescargaTemporada();
      } else {
        cerrarModales();
      }
      return;
    }

    if (detalle && !detalle.classList.contains('hide') && dx > 85) {
      if (navigator.vibrate) navigator.vibrate(15);
      uiHooks.cerrarDetalle();
      return;
    }
  }, { passive: true });
}

export function isAnimeBatchDownloadRunning(): boolean {
  const snap = nWin.getActiveAnimeDownloadSnapshot?.();
  return Boolean(snap && (snap.status === 'running' || snap.status === 'paused'));
}
