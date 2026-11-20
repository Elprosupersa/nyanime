import {
  ANILIST_URL,
  CacheManager,
  FavoritesManager,
  escHtml,
  nWin,
  safeImg,
  showToast,
  state,
  uiHooks
} from './appState.ts';
import { collectDueAiringNotifications } from '../utils/pushNotifications.ts';
import {
  buildSkeletonListHtml,
  buildStateCardHtml,
  createRequestGuard
} from '../utils/uiPolishHelpers.ts';

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_SEMANA_CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ORDEN_DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const NOTIFIED_AIRINGS_KEY = 'nyanime_notified_airings_v1';

let simulcastsCache: any[] = [];
let scheduleLoading = false;
let scheduleLoadError: string | null = null;
const scheduleRequestGuard = createRequestGuard();
const scheduleState: {
  filter: string;
  sort: string;
  view: string;
  searchQuery: string;
  tickerInterval: ReturnType<typeof setInterval> | null;
  airingCheckInterval: ReturnType<typeof setInterval> | null;
} = {
  filter: 'ALL',
  sort: 'TIME',
  view: 'TIMELINE',
  searchQuery: '',
  tickerInterval: null,
  airingCheckInterval: null
};

export const ScheduleReminderManager = {
  KEY: 'nyanime_schedule_reminders_v1',
  getAll(): number[] {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]') || []; } catch { return []; }
  },
  has(id: number | string): boolean {
    return this.getAll().includes(Number(id));
  },
  toggle(anime: any, ev?: Event): void {
    if (ev) ev.stopPropagation();
    const id = Number(anime.id);
    let list = this.getAll();
    const title = anime.title?.english || anime.title?.romaji || 'Anime';
    if (list.includes(id)) {
      list = list.filter(x => x !== id);
      showToast(`Recordatorio desactivado: ${title}`);
    } else {
      list.push(id);
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission().catch(() => {});
      }
      showToast(`Recordatorio activado para ${title}`);
      void checkAndNotifyAiringEpisodes(simulcastsCache);
    }
    localStorage.setItem(this.KEY, JSON.stringify(list));
    if (nWin.firebaseSync?.scheduleSync) {
      nWin.firebaseSync.scheduleSync('schedule_reminders');
    }
    renderEmisionDiasChips();
    renderEmisionDia(state.diaEmisionActual);
  }
};

export async function checkAndNotifyAiringEpisodes(simulcasts: any[]): Promise<void> {
  if (!Array.isArray(simulcasts) || simulcasts.length === 0) return;

  const remindedIds = new Set(ScheduleReminderManager.getAll().map(Number));
  const watchingFavs = FavoritesManager.getByStatus('watching');
  if (remindedIds.size === 0 && watchingFavs.length === 0) return;

  const nowMs = Date.now();
  let notifiedMap: Record<string, number> = {};
  try {
    notifiedMap = JSON.parse(localStorage.getItem(NOTIFIED_AIRINGS_KEY) || '{}') || {};
  } catch {
    notifiedMap = {};
  }

  // Prune notifications older than 7 days
  const weekAgoMs = nowMs - 7 * 86400 * 1000;
  Object.keys(notifiedMap).forEach(k => {
    if ((notifiedMap[k] || 0) < weekAgoMs) delete notifiedMap[k];
  });

  const simulcastById = new Map<number, any>();
  for (const s of simulcasts) {
    if (s?.id) simulcastById.set(Number(s.id), s);
  }

  const reminders = Array.from(remindedIds)
    .map((id) => {
      const matched = simulcastById.get(id);
      if (!matched) return null;
      return {
        animeId: id,
        title: matched.title?.english || matched.title?.romaji || 'Anime',
        episode: Number(matched._weekEpisode || matched.nextAiringEpisode?.episode || 1),
        airingAt: Number(matched._weekAiringAt || matched.nextAiringEpisode?.airingAt || 0)
      };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const enrichedWatching = watchingFavs.map((fav) => {
    const matched = simulcastById.get(Number(fav.id));
    if (matched) {
      return {
        ...fav,
        nextAiringEpisode: {
          episode: Number(matched._weekEpisode || fav.nextAiringEpisode?.episode || 1),
          airingAt: Number(matched._weekAiringAt || fav.nextAiringEpisode?.airingAt || 0)
        }
      };
    }
    return fav;
  });

  const due = collectDueAiringNotifications({
    watchingAnimes: enrichedWatching,
    reminders,
    alreadyNotifiedKeys: new Set(Object.keys(notifiedMap)),
    nowMs,
    windowHours: 12
  });

  if (due.length === 0) return;

  for (const item of due) {
    notifiedMap[item.dedupKey] = nowMs;
  }
  try {
    localStorage.setItem(NOTIFIED_AIRINGS_KEY, JSON.stringify(notifiedMap));
  } catch {
    // ignore
  }

  if (nWin.NyAnimePWA?.dispatchAiringPush) {
    void nWin.NyAnimePWA.dispatchAiringPush(
      due.map((d) => ({
        animeId: d.animeId,
        title: d.title,
        episode: d.episode,
        body: d.body
      }))
    );
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    for (const item of due) {
      const notifTitle = `Nuevo episodio disponible: ${item.title}`;
      try {
        if (navigator.serviceWorker?.ready) {
          const reg = await navigator.serviceWorker.ready;
          if (reg && typeof reg.showNotification === 'function') {
            await reg.showNotification(notifTitle, {
              body: item.body,
              icon: '/pwa-192x192.png',
              tag: `nyanime-air-${item.dedupKey}`
            });
            continue;
          }
        }
        new Notification(notifTitle, { body: item.body, icon: '/pwa-192x192.png' });
      } catch {
        // Ignore notification sandbox restrictions
      }
    }
  }
}

function obtenerEtiquetaTemporadaActual(): string {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  let est = 'Invierno';
  if (m >= 3 && m <= 5) est = 'Primavera';
  else if (m >= 6 && m <= 8) est = 'Verano';
  else if (m >= 9 && m <= 11) est = 'Otoño';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
  return `Temporada ${est} ${y} · Zona horaria: ${tz}`;
}

export function iniciarRelojEmision(): void {
  if (scheduleState.tickerInterval) clearInterval(scheduleState.tickerInterval);
  const tick = () => {
    const clockEl = document.getElementById('emision-live-clock');
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    const pantalla = document.getElementById('pantalla-emision');
    if (pantalla && !pantalla.classList.contains('hide')) {
      const nowSec = Math.floor(now.getTime() / 1000);
      document.querySelectorAll('[data-airing-target]').forEach(el => {
        const targetSec = Number(el.getAttribute('data-airing-target'));
        if (!targetSec) return;
        const diff = targetSec - nowSec;
        el.textContent = formatLiveCountdown(diff);
        if (diff <= 0) el.classList.remove('upcoming');
      });
    }
  };
  tick();
  scheduleState.tickerInterval = setInterval(tick, 1000);
}

function obtenerFechaDelDiaSemana(targetDayIdx: number): Date {
  const today = new Date();
  const currentDayIdx = today.getDay();
  const normCurrent = currentDayIdx === 0 ? 7 : currentDayIdx;
  const normTarget = targetDayIdx === 0 ? 7 : targetDayIdx;
  const diffDays = normTarget - normCurrent;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffDays);
}

function normalizarItemCalendario(anime: any, fallbackIdx = 0): any {
  const nowSec = Math.floor(Date.now() / 1000);
  const nextAir = anime.nextAiringEpisode;
  const rawAiringAt = nextAir?.airingAt || 0;
  const rawEpisode = nextAir?.episode || anime.episodes || 1;
  const dayIdx = rawAiringAt ? new Date(rawAiringAt * 1000).getDay() : (fallbackIdx % 7);

  const dayDateThisWeek = obtenerFechaDelDiaSemana(dayIdx);
  let weekAiringAt = rawAiringAt;
  let weekEpisode = rawEpisode;

  if (rawAiringAt) {
    const rawDate = new Date(rawAiringAt * 1000);
    const adjusted = new Date(
      dayDateThisWeek.getFullYear(),
      dayDateThisWeek.getMonth(),
      dayDateThisWeek.getDate(),
      rawDate.getHours(),
      rawDate.getMinutes(),
      0
    );
    weekAiringAt = Math.floor(adjusted.getTime() / 1000);
    if (rawAiringAt - weekAiringAt > 2 * 86400 && rawEpisode > 1) {
      weekEpisode = rawEpisode - 1;
    }
  } else {
    const fakeHour = 16 + (fallbackIdx % 6);
    const adjusted = new Date(
      dayDateThisWeek.getFullYear(),
      dayDateThisWeek.getMonth(),
      dayDateThisWeek.getDate(),
      fakeHour,
      0,
      0
    );
    weekAiringAt = Math.floor(adjusted.getTime() / 1000);
  }

  const d = new Date(weekAiringAt * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const studio = anime.studios?.nodes?.[0]?.name || 'Simulcast';

  return {
    ...anime,
    _scheduleDayIdx: dayIdx,
    _weekAiringAt: weekAiringAt,
    _weekEpisode: weekEpisode,
    _localTimeStr: `${hh}:${mm}`,
    _minutesOfDay: d.getHours() * 60 + d.getMinutes(),
    _studio: studio,
    _isAiredThisWeek: weekAiringAt <= nowSec
  };
}

export async function cargarEmisionCalendario(forceRefresh = false): Promise<void> {
  const seasonLbl = document.getElementById('emision-season-label');
  if (seasonLbl) seasonLbl.textContent = obtenerEtiquetaTemporadaActual();
  iniciarRelojEmision();

  const cacheKey = 'emision_calendar_v3';
  if (!forceRefresh) {
    const cached = CacheManager.get(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      scheduleLoading = false;
      scheduleLoadError = null;
      simulcastsCache = cached.map((a, i) => normalizarItemCalendario(a, i));
      renderEmisionDiasChips();
      renderEmisionDia(state.diaEmisionActual);
      void checkAndNotifyAiringEpisodes(simulcastsCache);
      if (!scheduleState.airingCheckInterval) {
        scheduleState.airingCheckInterval = setInterval(() => {
          if (simulcastsCache.length > 0) {
            void checkAndNotifyAiringEpisodes(simulcastsCache);
          }
        }, 15 * 60 * 1000);
      }
      return;
    }
  }

  const { seq, signal } = scheduleRequestGuard.next();
  scheduleLoading = true;
  scheduleLoadError = null;

  const container = document.getElementById('schedule-cards-container');
  if (container && (forceRefresh || simulcastsCache.length === 0)) {
    container.innerHTML = buildSkeletonListHtml(5);
  }

  const query = `
    query {
      rel1: Page(page: 1, perPage: 50) {
        media(status: RELEASING, sort: POPULARITY_DESC, type: ANIME, isAdult: false) {
          ...SchedMedia
        }
      }
      rel2: Page(page: 2, perPage: 50) {
        media(status: RELEASING, sort: POPULARITY_DESC, type: ANIME, isAdult: false) {
          ...SchedMedia
        }
      }
    }
    fragment SchedMedia on Media {
      id
      title { romaji english native }
      coverImage { extraLarge large }
      bannerImage
      format
      status
      episodes
      averageScore
      popularity
      nextAiringEpisode { episode timeUntilAiring airingAt }
      studios(isMain: true) { nodes { name } }
      genres
      description
    }
  `;
  try {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!scheduleRequestGuard.isCurrent(seq)) return;
    const list1 = data?.data?.rel1?.media || [];
    const list2 = data?.data?.rel2?.media || [];
    const mergedMap = new Map<number, any>();
    [...list1, ...list2].forEach(item => {
      if (item && item.id && !mergedMap.has(item.id)) {
        mergedMap.set(item.id, item);
      }
    });
    const rawList = Array.from(mergedMap.values());
    if (rawList.length === 0) {
      throw new Error('No se recibieron animes en emisión.');
    }
    CacheManager.set(cacheKey, rawList);
    simulcastsCache = rawList.map((a, i) => normalizarItemCalendario(a, i));
    scheduleLoading = false;
    scheduleLoadError = null;
    renderEmisionDiasChips();
    renderEmisionDia(state.diaEmisionActual);
    void checkAndNotifyAiringEpisodes(simulcastsCache);
    if (!scheduleState.airingCheckInterval) {
      scheduleState.airingCheckInterval = setInterval(() => {
        if (simulcastsCache.length > 0) {
          void checkAndNotifyAiringEpisodes(simulcastsCache);
        }
      }, 15 * 60 * 1000);
    }
    if (forceRefresh) showToast('Calendario de emisiones actualizado');
  } catch (e) {
    if (!scheduleRequestGuard.isCurrent(seq)) return;
    console.warn('Error cargando calendario:', e);
    scheduleLoading = false;
    scheduleLoadError = 'No pudimos conectar con el calendario de simulcasts en este momento.';
    renderEmisionDiasChips();
    renderEmisionDia(state.diaEmisionActual);
  }
}

export function irAHoyEmision(): void {
  state.diaEmisionActual = new Date().getDay();
  if (scheduleState.filter === 'WEEK') {
    scheduleState.filter = 'ALL';
    actualizarBotonesFiltroEmision();
  }
  renderEmisionDiasChips();
  renderEmisionDia(state.diaEmisionActual);
}

export function cambiarFiltroEmision(nuevoFiltro: string): void {
  scheduleState.filter = nuevoFiltro;
  actualizarBotonesFiltroEmision();
  renderEmisionDia(state.diaEmisionActual);
}

function actualizarBotonesFiltroEmision(): void {
  document.querySelectorAll('#emision-filter-tabs .emision-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === scheduleState.filter);
  });
}

export function cambiarOrdenEmision(nuevoOrden: string): void {
  scheduleState.sort = nuevoOrden;
  renderEmisionDia(state.diaEmisionActual);
}

export function cambiarVistaEmision(nuevaVista: string): void {
  scheduleState.view = nuevaVista;
  document.getElementById('btn-view-timeline')?.classList.toggle('active', nuevaVista === 'TIMELINE');
  document.getElementById('btn-view-grid')?.classList.toggle('active', nuevaVista === 'GRID');
  renderEmisionDia(state.diaEmisionActual);
}

export function onScheduleSearchInput(val: string): void {
  scheduleState.searchQuery = (val || '').trim().toLowerCase();
  renderEmisionDia(state.diaEmisionActual);
}

export function renderEmisionDiasChips(): void {
  const container = document.getElementById('schedule-day-chips');
  if (!container) return;
  container.innerHTML = '';
  const todayIdx = new Date().getDay();

  const jumpBtn = document.getElementById('btn-jump-today');
  if (jumpBtn) {
    jumpBtn.classList.toggle('hide', state.diaEmisionActual === todayIdx && scheduleState.filter !== 'WEEK');
  }

  ORDEN_DIAS_SEMANA.forEach(idx => {
    const isToday = idx === todayIdx;
    const isSelected = idx === state.diaEmisionActual && scheduleState.filter !== 'WEEK';
    const dDate = obtenerFechaDelDiaSemana(idx);
    const dayCount = simulcastsCache.filter(a => a._scheduleDayIdx === idx).length;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `schedule-day-btn ${isSelected ? 'active' : ''}`;
    btn.innerHTML = `
      ${isToday ? '<span class="schedule-today-tag">HOY</span>' : `<span class="schedule-day-name">${DIAS_SEMANA_CORTOS[idx]}</span>`}
      <span class="schedule-day-date">${dDate.getDate()} ${MESES_CORTOS[dDate.getMonth()]}</span>
      <span class="schedule-day-count">${dayCount} ep</span>
    `;
    btn.onclick = () => {
      state.diaEmisionActual = idx;
      if (scheduleState.filter === 'WEEK') {
        scheduleState.filter = 'ALL';
        actualizarBotonesFiltroEmision();
      }
      renderEmisionDiasChips();
      renderEmisionDia(idx);
    };
    container.appendChild(btn);
  });
}

function renderEmisionDestacadoYStats(dayItems: any[], diaIdx: number): void {
  const featuredWrap = document.getElementById('emision-featured-wrap');
  const statsBar = document.getElementById('emision-stats-bar');
  const nowSec = Math.floor(Date.now() / 1000);

  if (statsBar) {
    const total = dayItems.length;
    const airedCount = dayItems.filter(a => a._weekAiringAt <= nowSec).length;
    const upcomingCount = total - airedCount;
    const followingCount = dayItems.filter(a => FavoritesManager.isFavorite(a.id) || ScheduleReminderManager.has(a.id)).length;
    const labelDia = scheduleState.filter === 'WEEK' ? 'Semana' : DIAS_SEMANA[diaIdx];

    statsBar.innerHTML = `
      <div class="emision-stat-item">
        <span class="emision-stat-val">${total}</span>
        <span class="emision-stat-lbl">Estrenos (${labelDia})</span>
      </div>
      <div class="emision-stat-item">
        <span class="emision-stat-val">${airedCount}</span>
        <span class="emision-stat-lbl">Ya Disponibles</span>
      </div>
      <div class="emision-stat-item">
        <span class="emision-stat-val">${upcomingCount}</span>
        <span class="emision-stat-lbl">Por Estrenar</span>
      </div>
      <div class="emision-stat-item">
        <span class="emision-stat-val">${followingCount}</span>
        <span class="emision-stat-lbl">En Seguimiento</span>
      </div>
    `;
  }

  if (!featuredWrap) return;
  if (!dayItems || dayItems.length === 0) {
    featuredWrap.innerHTML = '';
    return;
  }

  const upcomingSorted = dayItems
    .filter(a => a._weekAiringAt > nowSec)
    .sort((a, b) => a._weekAiringAt - b._weekAiringAt);
  const featured = upcomingSorted[0] || [...dayItems].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];

  if (!featured) {
    featuredWrap.innerHTML = '';
    return;
  }

  const title = escHtml(featured.title?.english || featured.title?.romaji);
  const banner = safeImg(featured.bannerImage || featured.coverImage?.extraLarge || featured.coverImage?.large);
  const epNum = featured._weekEpisode || 1;
  const diffSec = featured._weekAiringAt - nowSec;
  const isReminded = ScheduleReminderManager.has(featured.id);
  const scoreTxt = featured.averageScore ? `★ ${featured.averageScore}%` : 'Simulcast';
  const genresTxt = escHtml((featured.genres || []).slice(0, 3).join(' · ') || 'Anime');
  const studioTxt = escHtml(featured._studio || 'Estudio');

  featuredWrap.innerHTML = `
    <div class="emision-featured-card fade-in" id="emision-featured-hero">
      <img class="emision-featured-bg" src="${escHtml(banner)}" alt="${title}" referrerpolicy="no-referrer">
      <div class="emision-featured-scrim"></div>
      <div class="emision-featured-content">
        <div class="emision-featured-kicker">
          <span>DESTACADO DE ${DIAS_SEMANA[featured._scheduleDayIdx].toUpperCase()}</span>
          <span>·</span>
          <span>${escHtml(featured._localTimeStr)} HS</span>
          <span>·</span>
          <span data-airing-target="${featured._weekAiringAt}">${formatLiveCountdown(diffSec)}</span>
        </div>
        <div class="emision-featured-title">${title}</div>
        <div class="emision-featured-meta">
          <span>Episodio ${epNum}</span>
          <span>·</span>
          <span>${studioTxt}</span>
          <span>·</span>
          <span>${escHtml(scoreTxt)}</span>
          <span>·</span>
          <span>${genresTxt}</span>
        </div>
        <div class="emision-featured-actions">
          <button type="button" class="emision-btn-primary" id="btn-featured-watch">
            ${diffSec <= 0 ? `Ver Episodio ${epNum}` : 'Ver Ficha y Episodios'}
          </button>
          <button type="button" class="emision-btn-secondary ${isReminded ? 'reminded' : ''}" id="btn-featured-remind">
            ${isReminded ? 'Siguiendo estreno' : 'Recordar estreno'}
          </button>
        </div>
      </div>
    </div>
  `;

  const heroCard = document.getElementById('emision-featured-hero');
  const watchBtn = document.getElementById('btn-featured-watch');
  const remindBtn = document.getElementById('btn-featured-remind');

  if (heroCard) heroCard.onclick = () => { void uiHooks.abrirDetalle(featured); };
  if (watchBtn) {
    watchBtn.onclick = (e) => {
      e.stopPropagation();
      if (diffSec <= 0) {
        void uiHooks.abrirDetalle(featured, () => (window as any).abrirReproductor?.(epNum));
      } else {
        void uiHooks.abrirDetalle(featured);
      }
    };
  }
  if (remindBtn) {
    remindBtn.onclick = (e) => ScheduleReminderManager.toggle(featured, e);
  }
}

function ordenarListaEmision(lista: any[]): any[] {
  const copy = [...lista];
  if (scheduleState.sort === 'POPULARITY') {
    return copy.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  }
  if (scheduleState.sort === 'SCORE') {
    return copy.sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0));
  }
  return copy.sort((a, b) => a._minutesOfDay - b._minutesOfDay);
}

function crearTarjetaTimelineEmision(anime: any): HTMLElement {
  const nowSec = Math.floor(Date.now() / 1000);
  const title = escHtml(anime.title?.english || anime.title?.romaji);
  const img = safeImg(anime.coverImage?.large || anime.coverImage?.extraLarge);
  const nextEp = anime._weekEpisode || '?';
  const totalEps = anime.episodes ? ` / ${anime.episodes}` : '';
  const diffSec = anime._weekAiringAt - nowSec;
  const isAired = diffSec <= 0;
  const isFav = FavoritesManager.isFavorite(anime.id);
  const isReminded = ScheduleReminderManager.has(anime.id);
  const genres = escHtml((anime.genres || []).slice(0, 2).join(' · ') || 'Anime');
  const studioTxt = escHtml(anime._studio || 'Estudio');
  const score = escHtml(anime.averageScore ? `★ ${anime.averageScore}%` : (anime.format || 'TV'));

  const card = document.createElement('div');
  card.className = `schedule-card fade-in ${isAired ? 'aired-card' : ''}`;
  card.onclick = () => { void uiHooks.abrirDetalle(anime); };

  card.innerHTML = `
    <div class="schedule-thumb">
      <img src="${escHtml(img)}" alt="${title}" loading="lazy" referrerpolicy="no-referrer">
      <div class="schedule-thumb-time">${escHtml(anime._localTimeStr)}</div>
    </div>
    <div class="schedule-info">
      <div>
        <div class="schedule-top-row">
          <span>EPISODIO ${escHtml(nextEp)}${escHtml(totalEps)}</span>
          <span>${score}</span>
        </div>
        <div class="schedule-title">${title}</div>
        <div class="schedule-submeta">${studioTxt} · ${genres}</div>
      </div>
      <div class="schedule-bottom-row">
        <div class="schedule-countdown ${isAired ? '' : 'upcoming'}" data-airing-target="${anime._weekAiringAt}">
          ${formatLiveCountdown(diffSec)}
        </div>
        <div class="schedule-card-actions">
          <button type="button" class="schedule-watch-btn" data-action="watch" title="Ir al episodio">
            ${isAired ? `Ep. ${nextEp}` : 'Ficha'}
          </button>
          <button type="button" class="schedule-action-btn ${isReminded ? 'active' : ''}" data-action="remind" title="Recordatorio de emisión" aria-label="Recordar estreno">
            <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
          </button>
          <button type="button" class="schedule-action-btn ${isFav ? 'active' : ''}" data-action="fav" title="Añadir a Favoritos" aria-label="Favorito">
            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  const watchBtn = card.querySelector('[data-action="watch"]') as HTMLElement | null;
  const remindBtn = card.querySelector('[data-action="remind"]') as HTMLElement | null;
  const favBtn = card.querySelector('[data-action="fav"]') as HTMLElement | null;

  if (watchBtn) {
    watchBtn.onclick = (e) => {
      e.stopPropagation();
      if (isAired && typeof nextEp === 'number') {
        void uiHooks.abrirDetalle(anime, () => (window as any).abrirReproductor?.(nextEp));
      } else {
        void uiHooks.abrirDetalle(anime);
      }
    };
  }
  if (remindBtn) {
    remindBtn.onclick = (e) => ScheduleReminderManager.toggle(anime, e);
  }
  if (favBtn) {
    favBtn.onclick = (e) => {
      e.stopPropagation();
      FavoritesManager.toggle(anime);
      renderEmisionDia(state.diaEmisionActual);
    };
  }

  return card;
}

function crearTarjetaGridEmision(anime: any): HTMLElement {
  const title = escHtml(anime.title?.english || anime.title?.romaji);
  const img = escHtml(safeImg(anime.coverImage?.large || anime.coverImage?.extraLarge));
  const nextEp = anime._weekEpisode || '?';
  const nowSec = Math.floor(Date.now() / 1000);
  const isAired = anime._weekAiringAt <= nowSec;

  const card = document.createElement('div');
  card.className = 'card-h fade-in';
  card.style.width = '100%';
  card.onclick = () => { void uiHooks.abrirDetalle(anime); };
  card.innerHTML = `
    <div class="card-h-img-wrap">
      <img src="${img}" alt="${title}" loading="lazy" referrerpolicy="no-referrer">
      <div class="ep-badge">${escHtml(anime._localTimeStr)} · EP ${escHtml(nextEp)}</div>
    </div>
    <div class="card-h-title">${title}</div>
    <div style="font-size:10px; color:${isAired ? '#34d399' : '#fbbf24'}; font-weight:700; margin-top:2px;">
      ${isAired ? 'Disponible' : 'Próximo'}
    </div>
  `;
  return card;
}

export function renderEmisionDia(diaIdx: number): void {
  const container = document.getElementById('schedule-cards-container');
  if (!container) return;
  container.innerHTML = '';

  if (!simulcastsCache || simulcastsCache.length === 0) {
    if (scheduleLoading) {
      container.innerHTML = buildSkeletonListHtml(5);
      return;
    }
    container.innerHTML = buildStateCardHtml({
      kind: 'error',
      icon: '',
      title: 'Calendario no disponible',
      message: scheduleLoadError || 'No se pudieron cargar los estrenos de esta semana.',
      retryLabel: 'Reintentar',
      retryOnClick: 'cargarEmisionCalendario(true)'
    });
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const isWeekMode = scheduleState.filter === 'WEEK';

  let baseList = isWeekMode
    ? [...simulcastsCache]
    : simulcastsCache.filter(anime => anime._scheduleDayIdx === diaIdx);

  renderEmisionDestacadoYStats(baseList, diaIdx);

  if (scheduleState.filter === 'UPCOMING') {
    baseList = baseList.filter(a => a._weekAiringAt > nowSec);
  } else if (scheduleState.filter === 'AIRED') {
    baseList = baseList.filter(a => a._weekAiringAt <= nowSec);
  } else if (scheduleState.filter === 'FOLLOWING') {
    baseList = baseList.filter(a => FavoritesManager.isFavorite(a.id) || ScheduleReminderManager.has(a.id));
  }

  if (scheduleState.searchQuery) {
    const q = scheduleState.searchQuery;
    baseList = baseList.filter(a => {
      const tRomaji = (a.title?.romaji || '').toLowerCase();
      const tEng = (a.title?.english || '').toLowerCase();
      const studio = (a._studio || '').toLowerCase();
      const genres = (a.genres || []).join(' ').toLowerCase();
      return tRomaji.includes(q) || tEng.includes(q) || studio.includes(q) || genres.includes(q);
    });
  }

  if (baseList.length === 0) {
    container.innerHTML = buildStateCardHtml({
      kind: 'empty',
      icon: '',
      title: 'Sin resultados en este filtro',
      message: 'Prueba cambiando el filtro activo o seleccionando otro día de la semana.',
      retryLabel: scheduleState.filter !== 'ALL' ? 'Ver todo el día' : undefined,
      retryOnClick: scheduleState.filter !== 'ALL' ? "cambiarFiltroEmision('ALL')" : undefined
    });
    return;
  }

  if (scheduleState.view === 'GRID') {
    const gridEl = document.createElement('div');
    gridEl.className = 'grid';
    ordenarListaEmision(baseList).forEach(anime => {
      gridEl.appendChild(crearTarjetaGridEmision(anime));
    });
    container.appendChild(gridEl);
    return;
  }

  const timelineWrap = document.createElement('div');
  timelineWrap.className = 'schedule-timeline-grid';

  if (isWeekMode) {
    ORDEN_DIAS_SEMANA.forEach(dIdx => {
      const dayGroup = ordenarListaEmision(baseList.filter(a => a._scheduleDayIdx === dIdx));
      if (dayGroup.length === 0) return;
      const dDate = obtenerFechaDelDiaSemana(dIdx);
      const header = document.createElement('div');
      header.className = 'schedule-day-group-header';
      header.innerHTML = `
        <span>${DIAS_SEMANA[dIdx]} ${dDate.getDate()} de ${MESES_CORTOS[dDate.getMonth()]}</span>
        <span style="font-size:12px; color:var(--text-muted); font-weight:600;">${dayGroup.length} emisiones</span>
      `;
      timelineWrap.appendChild(header);
      dayGroup.forEach(anime => timelineWrap.appendChild(crearTarjetaTimelineEmision(anime)));
    });
  } else {
    ordenarListaEmision(baseList).forEach(anime => {
      timelineWrap.appendChild(crearTarjetaTimelineEmision(anime));
    });
  }

  container.appendChild(timelineWrap);
}

export function formatLiveCountdown(diffSeconds?: number | null): string {
  if (diffSeconds === undefined || diffSeconds === null) return 'Disponible ahora';
  if (diffSeconds <= 0) {
    const agoHours = Math.floor(Math.abs(diffSeconds) / 3600);
    if (agoHours === 0) return 'Emitido hace unos minutos · Disponible';
    if (agoHours < 24) return `Emitido hace ${agoHours}h · Disponible`;
    return 'Disponible ahora';
  }
  const d = Math.floor(diffSeconds / 86400);
  const h = Math.floor((diffSeconds % 86400) / 3600);
  const m = Math.floor((diffSeconds % 3600) / 60);
  const s = Math.floor(diffSeconds % 60);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (d > 0) {
    return `Estreno en ${d}d ${hh}h ${mm}m`;
  }
  return `Estreno en ${hh}:${mm}:${ss}`;
}

export function formatTimeLeft(seconds?: number | null): string {
  return formatLiveCountdown(seconds);
}
