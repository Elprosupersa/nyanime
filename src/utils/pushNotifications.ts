export interface AiringAlertCandidate {
  animeId: number;
  title: string;
  episode: number;
  airingAtSec: number;
  source: 'watching' | 'reminder';
}

export interface DueAiringNotification {
  dedupKey: string;
  animeId: number;
  title: string;
  episode: number;
  source: 'watching' | 'reminder';
  body: string;
}

export interface WeeklyDigestSummary {
  weekLabel: string;
  episodesWatchedCount: number;
  minutesWatched: number;
  chaptersReadCount: number;
  activeSeriesCount: number;
  watchingTitles: string[];
  headline: string;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData =
    typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function collectDueAiringNotifications(input: {
  watchingAnimes: Array<Record<string, any>>;
  reminders: Array<Record<string, any>>;
  alreadyNotifiedKeys: Set<string>;
  nowMs?: number;
  windowHours?: number;
}): DueAiringNotification[] {
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const windowSec = Math.max(60, Math.floor((input.windowHours ?? 24) * 3600));
  const seenAnimeEp = new Set<string>();
  const due: DueAiringNotification[] = [];

  const inspectCandidate = (c: AiringAlertCandidate) => {
    if (!c.animeId || !c.episode || !c.airingAtSec) return;
    if (c.airingAtSec > nowSec) return;
    if (nowSec - c.airingAtSec > windowSec) return;

    const dedupKey = `${c.animeId}_ep_${c.episode}`;
    if (seenAnimeEp.has(dedupKey) || input.alreadyNotifiedKeys.has(dedupKey)) return;
    seenAnimeEp.add(dedupKey);

    due.push({
      dedupKey,
      animeId: c.animeId,
      title: c.title,
      episode: c.episode,
      source: c.source,
      body: `¡Ya salió el Episodio ${c.episode} de ${c.title}!`
    });
  };

  for (const r of input.reminders || []) {
    if (!r) continue;
    inspectCandidate({
      animeId: Number(r.animeId || 0),
      title: String(r.title || 'Anime'),
      episode: Number(r.episode || 1),
      airingAtSec: Number(r.airingAt || 0),
      source: 'reminder'
    });
  }

  for (const a of input.watchingAnimes || []) {
    if (!a || String(a.listStatus || '') !== 'watching') continue;
    const ep = Number(a.nextAiringEpisode?.episode || 0);
    const airingAt = Number(a.nextAiringEpisode?.airingAt || 0);
    if (!ep || !airingAt) continue;
    const title = String(a.title?.english || a.title?.romaji || 'Anime');
    inspectCandidate({
      animeId: Number(a.id || 0),
      title,
      episode: ep,
      airingAtSec: airingAt,
      source: 'watching'
    });
  }

  return due;
}

export function buildWeeklyDigestSummary(input: {
  history: Array<Record<string, any>>;
  mangaHistory: Array<Record<string, any>>;
  favorites: Array<Record<string, any>>;
  nowMs?: number;
}): WeeklyDigestSummary {
  const nowMs = input.nowMs ?? Date.now();
  const weekCutoff = nowMs - 7 * 24 * 3600 * 1000;

  const recentAnime = (input.history || []).filter(
    (h) => Number(h?.timestamp || 0) >= weekCutoff
  );
  const recentManga = (input.mangaHistory || []).filter(
    (m) => Number(m?.timestamp || 0) >= weekCutoff
  );

  const uniqueSeries = new Set<string>();
  let totalSec = 0;
  for (const h of recentAnime) {
    if (h?.anime?.id) uniqueSeries.add(`a_${h.anime.id}`);
    totalSec += Math.max(0, Number(h?.currentTime || 0));
  }
  for (const m of recentManga) {
    if (m?.manga?.id) uniqueSeries.add(`m_${m.manga.id}`);
  }

  const watchingTitles = (input.favorites || [])
    .filter((f) => String(f?.listStatus || '') === 'watching')
    .slice(0, 5)
    .map((f) => String(f.title?.english || f.title?.romaji || 'Anime'));

  const minutesWatched = Math.round(totalSec / 60);
  const d = new Date(nowMs);
  const weekLabel = `Últimos 7 días · ${d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`;

  const headline =
    recentAnime.length === 0 && recentManga.length === 0
      ? 'Tu resumen semanal está listo: explora un nuevo episodio hoy.'
      : `Esta semana viste ${recentAnime.length} eps (${minutesWatched} min) y leíste ${recentManga.length} mangas.`;

  return {
    weekLabel,
    episodesWatchedCount: recentAnime.length,
    minutesWatched,
    chaptersReadCount: recentManga.length,
    activeSeriesCount: uniqueSeries.size,
    watchingTitles,
    headline
  };
}
