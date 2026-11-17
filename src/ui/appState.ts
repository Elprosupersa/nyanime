import {
  shouldMarkEpisodeCompleted
} from '../utils/playerResume.ts';
import { generarPortadaSVG } from '../utils/sanitize.ts';

export { generarPortadaSVG };

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
  handleAndroidBackButton?: () => string;
  UserManager?: typeof UserManager;
  FavoritesManager?: typeof FavoritesManager;
  MangaFavoritesManager?: typeof MangaFavoritesManager;
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
  capitulosLectorList?: any[];
  mangaUiState?: any;
  refreshOfflineMangaDetailState?: (manga?: any, rerender?: boolean) => Promise<any>;
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
}

const noop = () => {};
const asyncNoop = async () => {};

export const uiHooks: UiHooks = {
  renderContinuarViendo: noop,
  renderFavoritos: noop,
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
  initSearchDirectoryFilters: noop
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
  try {
    return await fetch(url, { ...options, signal: controller.signal });
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
    const upStatus = Number(res.headers.get('x-upstream-status') || '200');
    if (res.ok && upStatus < 400) {
      const txt = await res.text();
      if (txt) return txt;
    }
  } catch {
    // fallback direct
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
    const upStatus = Number(res.headers.get('x-upstream-status') || '200');
    if (res.ok && upStatus < 400) {
      const html = await res.text();
      return html && html.trim() ? html : null;
    }
  } catch {
    // ignore
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

export function cerrarModales(event?: Event): void {
  if (event && event.target && event.target !== event.currentTarget) return;
  document.querySelectorAll('.modal-overlay, .ny-dialog').forEach(m => m.classList.remove('active', 'open'));
}

export function cambiarTab(tab: string): void {
  state.tabActual = tab;

  const detAnime = document.getElementById('pantalla-detalle');
  if (detAnime) detAnime.classList.add('hide');
  const detManga = document.getElementById('pantalla-detalle-manga');
  if (detManga) detManga.classList.add('hide');

  const rep = document.getElementById('pantalla-reproductor');
  if (rep) {
    if (!rep.classList.contains('hide')) {
      uiHooks.flushPlayerProgress();
    }
    rep.classList.add('hide');
    const vid = document.getElementById('contenedor-video');
    if (vid) vid.innerHTML = '';
  }

  const lec = document.getElementById('pantalla-lector');
  if (lec) {
    if (!lec.classList.contains('hide')) {
      uiHooks.flushMangaReaderPage();
    }
    lec.classList.add('hide');
  }

  cerrarModales();

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
      localStorage.setItem('nyanime_cache_' + key, JSON.stringify(item));
    } catch {
      // ignore storage quota errors
    }
  }
};

export const UserManager = {
  KEY: 'nyanime_user_profile',
  getUser() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          username: parsed.username || 'Invitado',
          avatar: parsed.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo',
          role: parsed.role || 'FREE',
          stats: {
            episodesWatched: Number(parsed.stats?.episodesWatched || 0),
            totalMinutes: Number(parsed.stats?.totalMinutes || 0),
            completedAnimes: Number(parsed.stats?.completedAnimes || 0)
          }
        };
      }
    } catch {
      // ignore
    }
    return {
      username: 'Invitado',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo',
      role: 'FREE',
      stats: {
        episodesWatched: 0,
        totalMinutes: 0,
        completedAnimes: 0
      }
    };
  },
  saveUser(user: any, skipSync = false): void {
    localStorage.setItem(this.KEY, JSON.stringify(user));
    this.renderProfile();
    if (!skipSync && nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('profile');
    }
  },
  addEpisodeWatch(): void {
    const user = this.getUser();
    user.stats.episodesWatched = (user.stats.episodesWatched || 0) + 1;
    user.stats.totalMinutes = (user.stats.totalMinutes || 0) + 24;
    this.saveUser(user);
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
    const user = this.getUser();
    const avatarEl = document.getElementById('user-avatar-img') as HTMLImageElement | null;
    const nameEl = document.getElementById('user-display-name');
    const roleEl = document.getElementById('user-role-badge');
    const epEl = document.getElementById('stat-episodes');
    const hrEl = document.getElementById('stat-hours');
    const favEl = document.getElementById('stat-favorites');

    const fbUser = nWin.FirebaseAuth?.getCurrentUser ? nWin.FirebaseAuth.getCurrentUser() : null;
    const isLoggedIn = Boolean(fbUser && !fbUser.isAnonymous);
    const activeUser = isLoggedIn ? fbUser : user;
    const stats = user?.stats || { episodesWatched: 0, totalMinutes: 0 };
    const epsCount = Number(stats.episodesWatched || 0);
    const chapsRead = this.getTotalChaptersRead();
    const rankInfo = nWin.NyAnimeUtils?.computeUserRank
      ? nWin.NyAnimeUtils.computeUserRank(epsCount, chapsRead, isLoggedIn ? user.role : 'FREE')
      : { tier: 'NOVATO', label: 'Novato', icon: '🌱' };
    const badgeClass = rankInfo.tier === 'VIP'
      ? 'badge-vip'
      : rankInfo.tier === 'LEYENDA'
        ? 'badge-leyenda'
        : rankInfo.tier === 'OTAKU'
          ? 'badge-otaku'
          : 'badge-free';

    if (avatarEl) {
      avatarEl.src = safeImg(user.avatar || activeUser.avatar || activeUser.photoURL, 'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo');
      avatarEl.className = `profile-avatar ${badgeClass === 'badge-vip' ? 'vip-avatar' : ''}`;
    }
    if (nameEl) nameEl.textContent = (isLoggedIn ? (fbUser.displayName || user.username) : user.username) || 'Invitado';
    if (roleEl) {
      roleEl.className = `profile-role-badge ${badgeClass}`;
      roleEl.textContent = `${rankInfo.icon} Rango: ${rankInfo.label}`;
    }
    if (epEl) epEl.textContent = String(stats.episodesWatched || 0);
    if (hrEl) hrEl.textContent = `${Math.round((stats.totalMinutes || 0) / 60)}h`;

    const totalFavs = FavoritesManager.getAll().length + MangaFavoritesManager.getAll().length;
    if (favEl) favEl.textContent = String(totalFavs);

    const commAvatar = document.getElementById('comment-user-avatar') as HTMLImageElement | null;
    if (commAvatar) commAvatar.src = safeImg(user.avatar || activeUser.avatar || activeUser.photoURL, 'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo');

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
        providerEl.textContent = fbUser.providerId === 'google.com'
          ? 'Autenticado con Google ✓'
          : (fbUser.emailVerified ? 'Autenticado con Correo ✓' : 'Cuenta de Correo · Verificación pendiente');
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
    if (syncBadge && syncText) {
      if (isLoggedIn && navigator.onLine) {
        syncBadge.className = 'sync-pill online';
        syncText.textContent = nWin.firebaseSync?.isSyncing?.() ? 'Sincronizando...' : 'En la Nube ✓';
      } else {
        syncBadge.className = 'sync-pill offline';
        syncText.textContent = isLoggedIn ? 'Sin Conexión' : 'Modo Local';
      }
    }
    if (syncLast) {
      if (nWin.firebaseSync?.getHumanTimeSinceLastSync) {
        syncLast.textContent = nWin.firebaseSync.getHumanTimeSinceLastSync();
      } else {
        syncLast.textContent = isLoggedIn ? 'Hace un momento' : 'Solo local';
      }
    }
  }
};

export const FavoritesManager = {
  KEY: 'nyanime_favorites_v2',
  getAll(): any[] {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || '[]') || [];
    } catch {
      return [];
    }
  },
  isFavorite(id: number | string): boolean {
    return this.getAll().some(item => String(item.id) === String(id));
  },
  toggle(anime: any): void {
    let list = this.getAll();
    const exists = list.some(item => String(item.id) === String(anime.id));
    if (exists) {
      list = list.filter(item => String(item.id) !== String(anime.id));
      showToast(`Eliminado de Favoritos: ${anime.title?.english || anime.title?.romaji}`);
    } else {
      list.unshift(anime);
      showToast(`Añadido a Favoritos: ${anime.title?.english || anime.title?.romaji}`);
    }
    localStorage.setItem(this.KEY, JSON.stringify(list));
    if (exists && nWin.firebaseSync?.deleteFavoriteAnime) {
      nWin.firebaseSync.deleteFavoriteAnime(anime.id).catch(() => {});
    } else if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('favorites');
    }
    uiHooks.updateFavoriteButton(anime.id);
    uiHooks.renderFavoritos();
    UserManager.renderProfile();
  },
  importList(animes: any[]): number {
    const list = this.getAll();
    let added = 0;
    animes.forEach(a => {
      if (!list.some(x => String(x.id) === String(a.id))) {
        list.unshift(a);
        added++;
      }
    });
    localStorage.setItem(this.KEY, JSON.stringify(list));
    if (added > 0 && nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('favorites_import');
    }
    uiHooks.renderFavoritos();
    UserManager.renderProfile();
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
  isFavorite(id: number | string): boolean {
    return this.getAll().some(item => String(item.id) === String(id));
  },
  toggle(manga: any): void {
    if (!manga) return;
    let list = this.getAll();
    const exists = list.some(item => String(item.id) === String(manga.id));
    if (exists) {
      list = list.filter(item => String(item.id) !== String(manga.id));
      showToast(`Eliminado de Mangas: ${manga.title}`);
    } else {
      list.unshift(manga);
      showToast(`Añadido a Mangas Favoritos: ${manga.title}`);
    }
    localStorage.setItem(this.KEY, JSON.stringify(list));
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
  getAll(): Record<string, number[]> {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch { return {}; }
  },
  getWatchedSet(seasonId: number | string): Set<number> {
    const all = this.getAll();
    return new Set((all[String(seasonId)] || []).map(Number));
  },
  isWatched(seasonId: number | string, ep: number): boolean {
    return this.getWatchedSet(seasonId).has(Number(ep));
  },
  markWatched(seasonId: number | string, ep: number, watched = true): void {
    if (!seasonId || !ep) return;
    const all = this.getAll();
    const key = String(seasonId);
    const set = new Set((all[key] || []).map(Number));
    if (watched) set.add(Number(ep));
    else set.delete(Number(ep));
    all[key] = Array.from(set).sort((a, b) => a - b);
    try { localStorage.setItem(this.KEY, JSON.stringify(all)); } catch { /* ignore */ }
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
  save(anime: any, seasonNum: number, episodeNum: number): void {
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
    list.unshift({
      anime,
      seasonNum,
      episodeNum,
      timestamp: Date.now(),
      currentTime: sameEpisode ? (existing?.currentTime ?? epSaved?.currentTime ?? 0) : (epSaved?.currentTime ?? 0),
      duration: sameEpisode ? (existing?.duration ?? epSaved?.duration ?? 0) : (epSaved?.duration ?? 0),
      completed: sameEpisode ? Boolean(existing?.completed ?? epSaved?.completed) : Boolean(epSaved?.completed)
    });
    if (list.length > 20) list.pop();
    localStorage.setItem(this.KEY, JSON.stringify(list));
    uiHooks.renderContinuarViendo();
    UserManager.addEpisodeWatch();
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
        anime,
        seasonNum,
        episodeNum,
        currentTime: cleanTime,
        duration: cleanDuration,
        completed,
        timestamp: now
      });
    }
    if (list.length > 20) list.pop();
    localStorage.setItem(this.KEY, JSON.stringify(list));

    if (completed) {
      const targetSeasonId = options.seasonId || anime.id;
      if (!AnimeWatchedManager.isWatched(targetSeasonId, episodeNum)) {
        AnimeWatchedManager.markWatched(targetSeasonId, episodeNum, true);
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
    localStorage.setItem(this.KEY, JSON.stringify(list));
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
      localStorage.setItem(this.KEY, JSON.stringify(list));
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
  getAll(): any[] {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]') || []; } catch { return []; }
  },
  save(downloads: any[]): void {
    localStorage.setItem(this.KEY, JSON.stringify(downloads));
    void this.updateBadge();
  },
  add(item: any): void {
    const list = this.getAll();
    list.unshift(item);
    this.save(list);
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
        } else if (m.url) {
          const safeUrl = nWin.safeExternalUrl ? nWin.safeExternalUrl(m.url) : m.url;
          if (safeUrl) handleOpenExternal(safeUrl);
        }
      };
      nWin.NyAnimeOffline.exportMp4 = async (offlineId: string) => {
        if (typeof nWin.NyAnimeOffline.exportOfflineAnimeToDevice === 'function') {
          const ok = await nWin.NyAnimeOffline.exportOfflineAnimeToDevice(offlineId);
          showToast(ok ? '📥 Guardando archivo .MP4 en tu dispositivo...' : 'No se pudo exportar el archivo .MP4.');
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
        showToast('Archivo offline eliminado del dispositivo.');
      };
      await nWin.NyAnimeOffline.renderOfflineDownloadsModal(container, summaryEl);
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
    localStorage.setItem(this.KEY, JSON.stringify(list));
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

  const tabsOrder = ['inicio', 'emision', 'lectura', 'busqueda', 'perfil'];

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
    const activeModal = document.querySelector('.modal-overlay.active, .modal-overlay.open, .ny-dialog.active, .ny-dialog.open');

    if (activeModal && dx > 80) {
      if (navigator.vibrate) navigator.vibrate(15);
      cerrarModales();
      return;
    }

    if (detalle && !detalle.classList.contains('hide') && dx > 85) {
      if (navigator.vibrate) navigator.vibrate(15);
      uiHooks.cerrarDetalle();
      return;
    }

    const lector = document.getElementById('pantalla-lector');
    const isMainScreen = (!detalle || detalle.classList.contains('hide')) &&
      (!lector || lector.classList.contains('hide')) &&
      !activeModal;

    const target = e.target as HTMLElement | null;
    const inHorizontalScroll = target?.closest?.('.scroll-h, .h-scroll, .schedule-day-chips, .lectura-type-chips, .category-chips, .avatar-grid');

    if (isMainScreen && !inHorizontalScroll) {
      const currentIdx = tabsOrder.indexOf(state.tabActual || 'inicio');
      if (currentIdx !== -1) {
        if (dx < -70 && currentIdx < tabsOrder.length - 1) {
          if (navigator.vibrate) navigator.vibrate(12);
          cambiarTab(tabsOrder[currentIdx + 1]);
        } else if (dx > 70 && currentIdx > 0) {
          if (navigator.vibrate) navigator.vibrate(12);
          cambiarTab(tabsOrder[currentIdx - 1]);
        }
      }
    }
  }, { passive: true });
}
