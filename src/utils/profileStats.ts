export type AnimeListStatus =
  | 'watching'
  | 'plan_to_watch'
  | 'completed'
  | 'on_hold'
  | 'dropped';

export interface AnimeListCategoryMeta {
  id: AnimeListStatus;
  label: string;
  shortLabel: string;
  accentColor: string;
  bgTint: string;
  borderTint: string;
}

export const ANIME_LIST_CATEGORIES: readonly AnimeListCategoryMeta[] = [
  {
    id: 'watching',
    label: 'Viendo',
    shortLabel: 'Viendo',
    accentColor: '#38bdf8',
    bgTint: 'rgba(56, 189, 248, 0.14)',
    borderTint: 'rgba(56, 189, 248, 0.38)'
  },
  {
    id: 'plan_to_watch',
    label: 'Por Ver',
    shortLabel: 'Por Ver',
    accentColor: '#a78bfa',
    bgTint: 'rgba(167, 139, 250, 0.14)',
    borderTint: 'rgba(167, 139, 250, 0.38)'
  },
  {
    id: 'completed',
    label: 'Completados',
    shortLabel: 'Completados',
    accentColor: '#34d399',
    bgTint: 'rgba(52, 211, 153, 0.14)',
    borderTint: 'rgba(52, 211, 153, 0.38)'
  },
  {
    id: 'on_hold',
    label: 'En Pausa',
    shortLabel: 'En Pausa',
    accentColor: '#fbbf24',
    bgTint: 'rgba(251, 191, 36, 0.14)',
    borderTint: 'rgba(251, 191, 36, 0.38)'
  },
  {
    id: 'dropped',
    label: 'Abandonados',
    shortLabel: 'Abandonados',
    accentColor: '#f87171',
    bgTint: 'rgba(248, 113, 113, 0.14)',
    borderTint: 'rgba(248, 113, 113, 0.38)'
  }
] as const;

export const VALID_ANIME_LIST_STATUSES = new Set<AnimeListStatus>([
  'watching',
  'plan_to_watch',
  'completed',
  'on_hold',
  'dropped'
]);

export function getCategoryMeta(status: AnimeListStatus): AnimeListCategoryMeta {
  return (
    ANIME_LIST_CATEGORIES.find((c) => c.id === status) || ANIME_LIST_CATEGORIES[1]
  );
}

export function normalizeAnimeListStatus(
  raw: unknown,
  fallback: AnimeListStatus = 'plan_to_watch'
): AnimeListStatus {
  if (typeof raw === 'number') {
    if (raw === 1) return 'watching';
    if (raw === 2) return 'completed';
    if (raw === 3) return 'on_hold';
    if (raw === 4) return 'dropped';
    if (raw === 6) return 'plan_to_watch';
  }
  const str = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!str) return fallback;
  if (VALID_ANIME_LIST_STATUSES.has(str as AnimeListStatus)) {
    return str as AnimeListStatus;
  }
  switch (str) {
    case 'current':
    case 'repeating':
    case 'viendo':
    case '1':
      return 'watching';
    case 'planning':
    case 'plan to watch':
    case 'por ver':
    case '6':
      return 'plan_to_watch';
    case 'completado':
    case 'completados':
    case 'finished':
    case '2':
      return 'completed';
    case 'paused':
    case 'on hold':
    case 'on-hold':
    case 'en pausa':
    case '3':
      return 'on_hold';
    case 'abandone':
    case 'abandonado':
    case 'abandonados':
    case '4':
      return 'dropped';
    default:
      return fallback;
  }
}

export function mapExternalStatusToListStatus(raw: unknown): AnimeListStatus {
  return normalizeAnimeListStatus(raw, 'plan_to_watch');
}

export interface RealWatchDeltaInput {
  prevTime: number;
  nextTime: number;
  isPaused: boolean;
  isSeeking: boolean;
  maxTickSeconds?: number;
}

/**
 * Calcula únicamente los segundos reales reproducidos entre dos ticks consecutivos.
 * Descarta retrocesos, pausas, seeks o saltos bruscos (ej. reanudación inicial).
 */
export function computeRealWatchDeltaSeconds(input: RealWatchDeltaInput): number {
  if (input.isPaused || input.isSeeking) return 0;
  const prev = Number(input.prevTime);
  const next = Number(input.nextTime);
  if (!Number.isFinite(prev) || !Number.isFinite(next) || prev < 0 || next < 0) {
    return 0;
  }
  const delta = next - prev;
  const cap = Number.isFinite(input.maxTickSeconds) ? Number(input.maxTickSeconds) : 5;
  if (delta <= 0 || delta > cap) {
    return 0;
  }
  return delta;
}

export interface IframeActiveDeltaInput {
  elapsedMs: number;
  isVisible: boolean;
  isPlayerOpen: boolean;
  isIframeLoaded: boolean;
  maxStepSeconds?: number;
}

/**
 * Para reproductores iframe externos (cross-origin) donde no se puede leer video.currentTime,
 * registra únicamente tiempo real en primer plano mientras el reproductor está abierto y visible.
 */
export function computeIframeActiveDeltaSeconds(input: IframeActiveDeltaInput): number {
  if (!input.isVisible || !input.isPlayerOpen || !input.isIframeLoaded) return 0;
  const ms = Number(input.elapsedMs);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const maxStep = Number.isFinite(input.maxStepSeconds) ? Number(input.maxStepSeconds) : 60;
  return Math.min(maxStep, ms / 1000);
}

/**
 * Formatea segundos reales acumulados sin redondear a 0h ni inventar minutos.
 */
export function formatWatchDuration(totalSecondsInput: number): string {
  const totalSec = Math.max(0, Math.floor(Number(totalSecondsInput || 0)));
  if (totalSec === 0) return '0m';
  if (totalSec < 60) return `${totalSec}s`;

  const totalMins = Math.floor(totalSec / 60);
  if (totalMins < 60) return `${totalMins}m`;

  const totalHours = Math.floor(totalMins / 60);
  const remMins = totalMins % 60;
  if (totalHours < 24) {
    return remMins > 0 ? `${totalHours}h ${remMins}m` : `${totalHours}h`;
  }

  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

/**
 * Cuenta episodios únicos vistos a través de todas las temporadas registradas.
 */
export function countUniqueWatchedEpisodes(
  watchedMap: Record<string, Array<number | string>> | null | undefined
): number {
  if (!watchedMap || typeof watchedMap !== 'object') return 0;
  let total = 0;
  for (const seasonKey of Object.keys(watchedMap)) {
    const rawList = watchedMap[seasonKey];
    if (!Array.isArray(rawList)) continue;
    const uniqueEps = new Set<number>();
    for (const ep of rawList) {
      const n = Math.floor(Number(ep));
      if (Number.isFinite(n) && n >= 1) {
        uniqueEps.add(n);
      }
    }
    total += uniqueEps.size;
  }
  return total;
}

export function countWatchedForAnime(
  anime: { id?: number | string; episodes?: number | null; nextAiringEpisode?: { episode?: number } },
  watchedMap: Record<string, Array<number | string>> | null | undefined
): { watchedCount: number; totalEpisodes: number; pct: number } {
  const rawTotal = Number(
    anime?.episodes ||
      (anime?.nextAiringEpisode?.episode ? Math.max(0, anime.nextAiringEpisode.episode - 1) : 0) ||
      0
  );
  const totalEpisodes = Number.isFinite(rawTotal) && rawTotal > 0 ? Math.floor(rawTotal) : 0;
  const seasonList = watchedMap?.[String(anime?.id ?? '')];
  const uniqueEps = new Set<number>();
  if (Array.isArray(seasonList)) {
    for (const ep of seasonList) {
      const n = Math.floor(Number(ep));
      if (Number.isFinite(n) && n >= 1) {
        if (totalEpisodes === 0 || n <= totalEpisodes) {
          uniqueEps.add(n);
        }
      }
    }
  }
  const watchedCount = uniqueEps.size;
  const pct =
    totalEpisodes > 0
      ? Math.min(100, Math.round((watchedCount / totalEpisodes) * 100))
      : watchedCount > 0
        ? 100
        : 0;
  return { watchedCount, totalEpisodes, pct };
}

export function resolveAutoListStatusTransition(
  currentStatus: AnimeListStatus,
  watchedCount: number,
  totalEpisodes: number
): AnimeListStatus {
  if (currentStatus === 'dropped') return 'dropped';
  if (totalEpisodes > 0 && watchedCount >= totalEpisodes) {
    return 'completed';
  }
  if (watchedCount > 0 && currentStatus === 'plan_to_watch') {
    return 'watching';
  }
  return currentStatus;
}

export function compactAnimeStorageEntry(
  raw: Record<string, any> | null | undefined
): Record<string, any> {
  const src = raw && typeof raw === 'object' ? raw : {};
  const titleObj = src.title && typeof src.title === 'object' ? src.title : {};
  const romaji = String(titleObj.romaji || (typeof src.title === 'string' ? src.title : '') || '').trim();
  const english = String(titleObj.english || romaji || '').trim();

  const coverObj = src.coverImage && typeof src.coverImage === 'object' ? src.coverImage : {};
  const extraLarge = String(coverObj.extraLarge || coverObj.large || '').trim();
  const large = String(coverObj.large || extraLarge).trim();

  const rawBanner = typeof src.bannerImage === 'string' ? src.bannerImage.trim() : '';
  const bannerImage = rawBanner && rawBanner.length <= 400 && rawBanner !== extraLarge ? rawBanner : '';

  const rawEps = src.episodes ?? src.totalEpisodes;
  const episodes =
    typeof rawEps === 'number' && Number.isFinite(rawEps) && rawEps > 0
      ? Math.floor(rawEps)
      : null;

  const genres = Array.isArray(src.genres)
    ? src.genres
        .filter((g: unknown): g is string => typeof g === 'string' && g.trim().length > 0)
        .map((g) => g.trim().slice(0, 40))
        .slice(0, 12)
    : [];

  const nextEpNum = Number(src.nextAiringEpisode?.episode || 0);
  const nextEpAiringAt = Number(src.nextAiringEpisode?.airingAt || 0);
  const idMal = Number(src.idMal || 0);
  const averageScore = Number(src.averageScore || 0);
  const rawUserScore = src.userScore !== undefined && src.userScore !== null ? Math.round(Number(src.userScore)) : null;

  const compact: Record<string, any> = {
    id: src.id,
    title: {
      romaji: romaji || 'Anime',
      english: english || romaji || 'Anime'
    },
    coverImage: {
      extraLarge,
      large
    },
    format: String(src.format || 'TV').slice(0, 24),
    status: String(src.status || 'FINISHED').slice(0, 32),
    episodes,
    genres
  };

  if (Number.isFinite(idMal) && idMal > 0) {
    compact.idMal = Math.floor(idMal);
  }
  if (Number.isFinite(averageScore) && averageScore > 0) {
    compact.averageScore = Math.round(averageScore);
  }
  if (bannerImage) {
    compact.bannerImage = bannerImage;
  }
  if (Number.isFinite(nextEpNum) && nextEpNum > 0) {
    compact.nextAiringEpisode =
      Number.isFinite(nextEpAiringAt) && nextEpAiringAt > 0
        ? { episode: Math.floor(nextEpNum), airingAt: Math.floor(nextEpAiringAt) }
        : { episode: Math.floor(nextEpNum) };
  }
  if (typeof src.hentailaSlug === 'string' && src.hentailaSlug.trim()) {
    compact.hentailaSlug = src.hentailaSlug.trim().slice(0, 200);
  }
  if (rawUserScore !== null && Number.isFinite(rawUserScore) && rawUserScore >= 1 && rawUserScore <= 10) {
    compact.userScore = rawUserScore;
  }
  if (typeof src.userReview === 'string' && src.userReview.trim()) {
    compact.userReview = src.userReview.trim().slice(0, 280);
  }
  if (typeof src.userNotes === 'string' && src.userNotes.trim()) {
    compact.userNotes = src.userNotes.trim().slice(0, 500);
  }
  if (Number.isFinite(Number(src.scoreUpdatedAt)) && Number(src.scoreUpdatedAt) > 0) {
    compact.scoreUpdatedAt = Math.floor(Number(src.scoreUpdatedAt));
  }
  if (Array.isArray(src.customListIds) && src.customListIds.length > 0) {
    compact.customListIds = Array.from(
      new Set(
        src.customListIds
          .map((x: unknown) => String(x || '').trim().slice(0, 64))
          .filter((x: string) => /^[a-zA-Z0-9_-]+$/.test(x))
      )
    ).slice(0, 25);
  }
  return compact;
}

export function mergeAnimeFavoriteMetadata(
  existing: Record<string, any> | null | undefined,
  incoming: Record<string, any> | null | undefined,
  nextStatus: AnimeListStatus,
  nowMs = Date.now()
): Record<string, any> {
  const prev = compactAnimeStorageEntry(existing);
  const next = compactAnimeStorageEntry(incoming);
  const rawPrev = existing && typeof existing === 'object' ? existing : {};
  const rawNext = incoming && typeof incoming === 'object' ? incoming : {};

  const hasIncomingTitle = Boolean(
    (typeof rawNext.title === 'string' && rawNext.title.trim()) ||
      rawNext.title?.romaji ||
      rawNext.title?.english
  );
  const mergedTitle = {
    romaji: hasIncomingTitle ? next.title.romaji : prev.title.romaji || next.title.romaji || 'Anime',
    english:
      (rawNext.title?.english && next.title.english) ||
      (rawPrev.title?.english && prev.title.english) ||
      (hasIncomingTitle ? next.title.english : prev.title.english) ||
      'Anime'
  };

  const mergedCover = {
    extraLarge: next.coverImage.extraLarge || prev.coverImage.extraLarge || next.coverImage.large || prev.coverImage.large || '',
    large: next.coverImage.large || prev.coverImage.large || next.coverImage.extraLarge || prev.coverImage.extraLarge || ''
  };

  const mergedBanner = next.bannerImage || prev.bannerImage || '';
  const mergedEps = next.episodes ?? prev.episodes ?? null;
  const mergedGenres = (next.genres.length > 0 ? next.genres : prev.genres).slice(0, 12);
  const mergedSlug = next.hentailaSlug || prev.hentailaSlug;
  const mergedNextEp = next.nextAiringEpisode || prev.nextAiringEpisode || null;
  const mergedIdMal = next.idMal || prev.idMal;
  const mergedAvgScore = next.averageScore || prev.averageScore;

  const result: Record<string, any> = {
    id: rawNext.id ?? rawPrev.id,
    title: mergedTitle,
    coverImage: mergedCover,
    format: rawNext.format || prev.format || 'TV',
    status: rawNext.status || prev.status || 'FINISHED',
    episodes: mergedEps,
    genres: mergedGenres,
    listStatus: nextStatus,
    listUpdatedAt: Math.max(0, Math.floor(Number(nowMs || Date.now())))
  };

  if (mergedIdMal) {
    result.idMal = mergedIdMal;
  }
  if (mergedAvgScore) {
    result.averageScore = mergedAvgScore;
  }
  if (mergedBanner) {
    result.bannerImage = mergedBanner;
  }
  if (mergedNextEp) {
    result.nextAiringEpisode = mergedNextEp;
  }
  if (mergedSlug) {
    result.hentailaSlug = mergedSlug;
  }

  const finalScore = next.userScore ?? prev.userScore;
  if (finalScore !== undefined) {
    result.userScore = finalScore;
  }
  const finalReview = next.userReview ?? prev.userReview;
  if (finalReview) {
    result.userReview = finalReview;
  }
  const finalNotes = next.userNotes ?? prev.userNotes;
  if (finalNotes) {
    result.userNotes = finalNotes;
  }
  const finalScoreTs = Math.max(Number(next.scoreUpdatedAt || 0), Number(prev.scoreUpdatedAt || 0));
  if (finalScoreTs > 0) {
    result.scoreUpdatedAt = finalScoreTs;
  }
  const finalLists = Array.isArray(rawNext.customListIds)
    ? next.customListIds || []
    : prev.customListIds || [];
  if (finalLists && finalLists.length > 0) {
    result.customListIds = finalLists;
  }

  return result;
}

export interface RankProgressInfo {
  points: number;
  tier: 'NOVATO' | 'OTAKU' | 'LEYENDA' | 'VIP';
  label: string;
  icon: string;
  nextLabel: string | null;
  nextThreshold: number | null;
  remaining: number;
  progressPct: number;
}

export function getRankProgress(
  episodesWatched: number,
  chaptersRead: number,
  verifiedRole?: string
): RankProgressInfo {
  const points =
    Math.max(0, Math.floor(Number(episodesWatched || 0))) +
    Math.max(0, Math.floor(Number(chaptersRead || 0)));

  if (verifiedRole === 'CREATOR' || verifiedRole === 'VIP') {
    return {
      points,
      tier: 'VIP',
      label: 'VIP Verificado',
      icon: '',
      nextLabel: null,
      nextThreshold: null,
      remaining: 0,
      progressPct: 100
    };
  }
  if (points >= 100) {
    return {
      points,
      tier: 'LEYENDA',
      label: 'Leyenda Anime',
      icon: '',
      nextLabel: null,
      nextThreshold: null,
      remaining: 0,
      progressPct: 100
    };
  }
  if (points >= 20) {
    const progressPct = Math.min(100, Math.round(((points - 20) / 80) * 100));
    return {
      points,
      tier: 'OTAKU',
      label: 'Otaku Activo',
      icon: '',
      nextLabel: 'Leyenda Anime',
      nextThreshold: 100,
      remaining: 100 - points,
      progressPct
    };
  }
  const progressPct = Math.min(100, Math.round((points / 20) * 100));
  return {
    points,
    tier: 'NOVATO',
    label: 'Explorador Novato',
    icon: '',
    nextLabel: 'Otaku Activo',
    nextThreshold: 20,
    remaining: 20 - points,
    progressPct
  };
}

export interface LibrarySummaryResult {
  countsByStatus: Record<AnimeListStatus, number>;
  totalSavedAnimes: number;
  totalSavedMangas: number;
  totalLibraryItems: number;
  completedSeriesCount: number;
  uniqueEpisodesWatched: number;
  chaptersRead: number;
  totalSecondsWatched: number;
  formattedWatchTime: string;
  topGenres: Array<{ genre: string; count: number; pct: number }>;
}

export function computeLibrarySummary(input: {
  animes: Array<Record<string, any>>;
  mangas: Array<Record<string, any>>;
  watchedMap: Record<string, Array<number | string>>;
  history?: Array<Record<string, any>>;
  totalSecondsWatched: number;
  chaptersRead: number;
}): LibrarySummaryResult {
  const countsByStatus: Record<AnimeListStatus, number> = {
    watching: 0,
    plan_to_watch: 0,
    completed: 0,
    on_hold: 0,
    dropped: 0
  };

  const genreCounts = new Map<string, number>();
  const countedAnimeIds = new Set<string>();
  let completedSeriesCount = 0;

  for (const anime of input.animes || []) {
    if (!anime) continue;
    const status = normalizeAnimeListStatus(anime.listStatus, 'plan_to_watch');
    countsByStatus[status] += 1;
    const prog = countWatchedForAnime(anime, input.watchedMap);
    if (status === 'completed' || (prog.totalEpisodes > 0 && prog.watchedCount >= prog.totalEpisodes)) {
      completedSeriesCount += 1;
    }
    const aid = String(anime.id ?? '');
    if (aid) countedAnimeIds.add(aid);
    if (Array.isArray(anime.genres)) {
      for (const g of anime.genres) {
        const clean = String(g || '').trim();
        if (clean) genreCounts.set(clean, (genreCounts.get(clean) || 0) + 1);
      }
    }
  }

  for (const h of input.history || []) {
    const a = h?.anime;
    if (!a) continue;
    const aid = String(a.id ?? '');
    if (aid && countedAnimeIds.has(aid)) continue;
    if (aid) countedAnimeIds.add(aid);
    if (Array.isArray(a.genres)) {
      for (const g of a.genres) {
        const clean = String(g || '').trim();
        if (clean) genreCounts.set(clean, (genreCounts.get(clean) || 0) + 1);
      }
    }
  }

  const sortedGenres = Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxGenreCount = sortedGenres[0]?.[1] || 1;
  const topGenres = sortedGenres.map(([genre, count]) => ({
    genre,
    count,
    pct: Math.round((count / maxGenreCount) * 100)
  }));

  const uniqueEpisodesWatched = countUniqueWatchedEpisodes(input.watchedMap);
  const totalSavedAnimes = (input.animes || []).length;
  const totalSavedMangas = (input.mangas || []).length;
  const cleanSeconds = Math.max(0, Math.floor(Number(input.totalSecondsWatched || 0)));

  return {
    countsByStatus,
    totalSavedAnimes,
    totalSavedMangas,
    totalLibraryItems: totalSavedAnimes + totalSavedMangas,
    completedSeriesCount,
    uniqueEpisodesWatched,
    chaptersRead: Math.max(0, Math.floor(Number(input.chaptersRead || 0))),
    totalSecondsWatched: cleanSeconds,
    formattedWatchTime: formatWatchDuration(cleanSeconds),
    topGenres
  };
}
