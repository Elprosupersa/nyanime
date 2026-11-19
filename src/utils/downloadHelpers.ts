import type { OfflineChapterManifest } from '../services/offline.ts';

export type DownloadPickerFilterMode = 'all' | 'none' | 'unwatched' | 'not-downloaded';
export type DownloadManagerFilterTab = 'all' | 'active' | 'anime' | 'manga' | 'watch-later';
export type DownloadDestination = 'app' | 'device' | 'both';
export type VideoQualityPreference = 'auto' | 'saver';

export const DOWNLOAD_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB chunks safely under Cloud Run 32 MB HTTP/1.1 cap

export type ActiveDownloadItemStatus =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'error';

export interface ActiveDownloadEpisodeState {
  episode: number;
  status: ActiveDownloadItemStatus;
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  speedLabel: string;
  etaLabel: string;
  errorReason?: string;
  sizeBytes?: number;
}

export interface ActiveDownloadBatchSnapshot {
  batchId: string;
  animeId: string | number;
  animeTitle: string;
  season: number;
  cover?: string;
  audio: 'SUB' | 'DUB';
  videoPref: VideoQualityPreference;
  destination: DownloadDestination;
  isRunning: boolean;
  isPaused: boolean;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  overallPercent: number;
  activeEpisode: number | null;
  activeDetailText: string;
  items: ActiveDownloadEpisodeState[];
}

export interface EpisodeRangeBucket {
  start: number;
  end: number;
  label: string;
}

export interface OfflineSeriesGroup {
  groupKey: string;
  kind: 'anime' | 'manga';
  title: string;
  cover?: string;
  mediaId: string;
  totalBytes: number;
  itemCount: number;
  items: OfflineChapterManifest[];
  latestCreatedAt: number;
}

export interface GroupedOfflineData {
  animeGroups: OfflineSeriesGroup[];
  mangaGroups: OfflineSeriesGroup[];
  watchLaterItems: OfflineChapterManifest[];
  counts: {
    all: number;
    anime: number;
    watchLater: number;
    manga: number;
  };
}

export interface StorageMeterData {
  usedBytes: number;
  quotaBytes: number;
  offlineBytes: number;
  animeBytes: number;
  mangaBytes: number;
  freeBytes: number;
  pct: number;
  animePct: number;
  mangaPct: number;
  animeFilesCount: number;
  watchLaterCount: number;
  mangaChaptersCount: number;
}

export function buildSeasonEpisodeRanges(totalEpisodes: number, chunkSize = 12): EpisodeRangeBucket[] {
  const total = Math.max(0, Math.floor(Number(totalEpisodes) || 0));
  if (total <= chunkSize) return [];
  const step = total > 60 ? 25 : chunkSize;
  const buckets: EpisodeRangeBucket[] = [];
  for (let start = 1; start <= total; start += step) {
    const end = Math.min(total, start + step - 1);
    buckets.push({
      start,
      end,
      label: start === end ? `Ep. ${start}` : `${start}–${end}`
    });
  }
  return buckets;
}

export function computeEpisodeSelectionByMode(params: {
  totalEpisodes: number;
  mode: DownloadPickerFilterMode;
  watchedEpisodes?: Set<number> | number[];
  offlineEpisodes?: Set<number> | number[];
}): Set<number> {
  const total = Math.max(0, Math.floor(Number(params.totalEpisodes) || 0));
  const result = new Set<number>();
  if (total === 0 || params.mode === 'none') return result;

  const watched = params.watchedEpisodes instanceof Set
    ? params.watchedEpisodes
    : new Set(params.watchedEpisodes || []);
  const offline = params.offlineEpisodes instanceof Set
    ? params.offlineEpisodes
    : new Set(params.offlineEpisodes || []);

  for (let ep = 1; ep <= total; ep += 1) {
    if (params.mode === 'all') {
      result.add(ep);
    } else if (params.mode === 'unwatched' && !watched.has(ep)) {
      result.add(ep);
    } else if (params.mode === 'not-downloaded' && !offline.has(ep)) {
      result.add(ep);
    }
  }
  return result;
}

export function normalizeSeriesGroupTitle(rawTitle: string): string {
  return String(rawTitle || 'Serie')
    .replace(/\s*\(T\d+\)\s*$/i, '')
    .trim() || 'Serie';
}

export function groupOfflineManifests(
  items: OfflineChapterManifest[],
  query = ''
): GroupedOfflineData {
  const needle = String(query || '').trim().toLowerCase();
  const matchesQuery = (item: OfflineChapterManifest): boolean => {
    if (!needle) return true;
    const haystack = [
      item.title,
      item.chapterTitle,
      item.chapterLabel,
      item.season ? `T${item.season}` : '',
      item.episode ? `Ep ${item.episode}` : '',
      item.quality
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  };

  const animeMap = new Map<string, OfflineSeriesGroup>();
  const mangaMap = new Map<string, OfflineSeriesGroup>();
  const watchLaterItems: OfflineChapterManifest[] = [];

  let totalAnime = 0;
  let totalWatchLater = 0;
  let totalManga = 0;

  for (const item of items) {
    if (item.kind === 'anime-video') totalAnime += 1;
    else if (item.kind === 'watch-later') totalWatchLater += 1;
    else if (item.kind === 'manga') totalManga += 1;

    if (!matchesQuery(item)) continue;

    if (item.kind === 'watch-later') {
      watchLaterItems.push(item);
      continue;
    }

    if (item.kind === 'anime-video') {
      const cleanTitle = normalizeSeriesGroupTitle(item.title);
      const key = `anime:${item.mediaId || cleanTitle.toLowerCase()}`;
      const existing = animeMap.get(key);
      if (existing) {
        existing.items.push(item);
        existing.totalBytes += Number(item.sizeBytes || 0);
        existing.itemCount += 1;
        existing.latestCreatedAt = Math.max(existing.latestCreatedAt, Number(item.createdAt || 0));
        if (!existing.cover && item.cover) existing.cover = item.cover;
      } else {
        animeMap.set(key, {
          groupKey: key,
          kind: 'anime',
          title: cleanTitle,
          cover: item.cover,
          mediaId: String(item.mediaId || cleanTitle),
          totalBytes: Number(item.sizeBytes || 0),
          itemCount: 1,
          items: [item],
          latestCreatedAt: Number(item.createdAt || 0)
        });
      }
      continue;
    }

    const cleanMangaTitle = normalizeSeriesGroupTitle(item.title);
    const mangaKey = `manga:${item.mediaId || cleanMangaTitle.toLowerCase()}`;
    const existingManga = mangaMap.get(mangaKey);
    if (existingManga) {
      existingManga.items.push(item);
      existingManga.totalBytes += Number(item.sizeBytes || 0);
      existingManga.itemCount += 1;
      existingManga.latestCreatedAt = Math.max(existingManga.latestCreatedAt, Number(item.createdAt || 0));
      if (!existingManga.cover && item.cover) existingManga.cover = item.cover;
    } else {
      mangaMap.set(mangaKey, {
        groupKey: mangaKey,
        kind: 'manga',
        title: cleanMangaTitle,
        cover: item.cover,
        mediaId: String(item.mediaId || cleanMangaTitle),
        totalBytes: Number(item.sizeBytes || 0),
        itemCount: 1,
        items: [item],
        latestCreatedAt: Number(item.createdAt || 0)
      });
    }
  }

  const animeGroups = Array.from(animeMap.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => {
        const sDiff = Number(a.season || 1) - Number(b.season || 1);
        if (sDiff !== 0) return sDiff;
        return Number(a.episode || 0) - Number(b.episode || 0);
      })
    }))
    .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);

  const mangaGroups = Array.from(mangaMap.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => Number(b.chapterNum || 0) - Number(a.chapterNum || 0))
    }))
    .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);

  watchLaterItems.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

  return {
    animeGroups,
    mangaGroups,
    watchLaterItems,
    counts: {
      all: totalAnime + totalWatchLater + totalManga,
      anime: totalAnime,
      watchLater: totalWatchLater,
      manga: totalManga
    }
  };
}

export function computeStorageMeter(summary: {
  offlineBytes: number;
  animeBytes?: number;
  mangaBytes?: number;
  usageBytes?: number;
  quotaBytes?: number;
  animeFilesCount?: number;
  watchLaterCount?: number;
  mangaChaptersCount?: number;
}): StorageMeterData {
  const offlineBytes = Math.max(0, Number(summary.offlineBytes || 0));
  const animeBytes = Math.max(0, Number(summary.animeBytes || 0));
  const mangaBytes = Math.max(0, Number(summary.mangaBytes || 0));
  const usedBytes = Math.max(offlineBytes, Number(summary.usageBytes || 0));
  const quotaBytes = Math.max(0, Number(summary.quotaBytes || 0));
  const freeBytes = quotaBytes > 0 ? Math.max(0, quotaBytes - usedBytes) : 0;
  const rawPct = quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : (offlineBytes > 0 ? 12 : 0);
  const pct = offlineBytes > 0 ? Math.max(3, Math.min(100, Math.round(rawPct))) : Math.min(100, Math.round(rawPct));

  const denom = quotaBytes > 0 ? quotaBytes : Math.max(offlineBytes, 1);
  const rawAnimePct = animeBytes > 0 ? Math.max(2, Math.round((animeBytes / denom) * 100)) : 0;
  const rawMangaPct = mangaBytes > 0 ? Math.max(2, Math.round((mangaBytes / denom) * 100)) : 0;
  const totalSeg = rawAnimePct + rawMangaPct;
  const scale = totalSeg > 100 ? 100 / totalSeg : 1;

  return {
    usedBytes,
    quotaBytes,
    offlineBytes,
    animeBytes,
    mangaBytes,
    freeBytes,
    pct,
    animePct: Math.round(rawAnimePct * scale),
    mangaPct: Math.round(rawMangaPct * scale),
    animeFilesCount: Number(summary.animeFilesCount || 0),
    watchLaterCount: Number(summary.watchLaterCount || 0),
    mangaChaptersCount: Number(summary.mangaChaptersCount || 0)
  };
}

export const ESTIMATED_ANIME_EPISODE_BYTES_1080P = 120 * 1024 * 1024;
export const ESTIMATED_ANIME_EPISODE_BYTES_720P = 70 * 1024 * 1024;
export const ESTIMATED_MANGA_CHAPTER_BYTES = 12 * 1024 * 1024;
export const STORAGE_SAFETY_RESERVE_BYTES = 25 * 1024 * 1024;
export const STORAGE_LOW_WARNING_BYTES = 150 * 1024 * 1024;

export type StorageQuotaStatus = 'ok' | 'low' | 'insufficient' | 'unknown';

export interface StorageQuotaAssessment {
  supported: boolean;
  status: StorageQuotaStatus;
  usageBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  requiredBytes: number;
  usageRatio: number;
  canProceed: boolean;
  message: string;
}

export function formatBytesCompact(bytes: number): string {
  const safe = Math.max(0, Number(bytes || 0));
  if (safe === 0) return '0 MB';
  if (safe >= 1024 * 1024 * 1024) {
    return `${(safe / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (safe >= 1024 * 1024) {
    return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(safe / 1024))} KB`;
}

function formatQuotaMb(bytes: number): string {
  const safe = Math.max(0, Number(bytes || 0));
  if (safe >= 1024 * 1024 * 1024) {
    return `${(safe / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${Math.max(1, Math.round(safe / (1024 * 1024)))} MB`;
}

export function estimateAnimeBatchBytes(episodeCount: number, qualityOrPref = 'auto'): number {
  const count = Math.max(1, Math.floor(Number(episodeCount) || 1));
  const norm = String(qualityOrPref || '').toLowerCase();
  const isSaver = norm.includes('720') || norm === 'saver' || norm.includes('ahorro');
  const perEpisode = isSaver ? ESTIMATED_ANIME_EPISODE_BYTES_720P : ESTIMATED_ANIME_EPISODE_BYTES_1080P;
  return count * perEpisode;
}

export function estimateMangaBatchBytes(chapterCount: number): number {
  const count = Math.max(1, Math.floor(Number(chapterCount) || 1));
  return count * ESTIMATED_MANGA_CHAPTER_BYTES;
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    if (typeof err === 'string') {
      return /quota|espacio.*insuficiente|storage.*full/i.test(err);
    }
    return false;
  }
  const e = err as { name?: string; code?: number; message?: string };
  if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return true;
  }
  if (e.code === 22 || e.code === 1014) {
    return true;
  }
  if (typeof e.message === 'string' && /quota\s*exceeded|ns_error_dom_quota|espacio.*insuficiente/i.test(e.message)) {
    return true;
  }
  return false;
}

export function evaluateStorageQuota(input: {
  usageBytes?: number;
  quotaBytes?: number;
  requiredBytes: number;
  supported?: boolean;
  safetyReserveBytes?: number;
  lowWarningBytes?: number;
}): StorageQuotaAssessment {
  const requiredBytes = Math.max(0, Math.floor(Number(input.requiredBytes || 0)));
  const usageBytes = Math.max(0, Math.floor(Number(input.usageBytes || 0)));
  const quotaBytes = Math.max(0, Math.floor(Number(input.quotaBytes || 0)));
  const supported = input.supported !== false && quotaBytes > 0;

  if (!supported) {
    return {
      supported: false,
      status: 'unknown',
      usageBytes,
      quotaBytes: 0,
      remainingBytes: 0,
      requiredBytes,
      usageRatio: 0,
      canProceed: true,
      message: ''
    };
  }

  const remainingBytes = Math.max(0, quotaBytes - usageBytes);
  const usageRatio = Math.min(1, usageBytes / quotaBytes);
  const safetyReserve = Math.max(0, Math.floor(input.safetyReserveBytes ?? STORAGE_SAFETY_RESERVE_BYTES));
  const lowWarning = Math.max(safetyReserve, Math.floor(input.lowWarningBytes ?? STORAGE_LOW_WARNING_BYTES));

  if (remainingBytes < requiredBytes + safetyReserve) {
    return {
      supported: true,
      status: 'insufficient',
      usageBytes,
      quotaBytes,
      remainingBytes,
      requiredBytes,
      usageRatio,
      canProceed: false,
      message: `Espacio insuficiente: quedan ${formatQuotaMb(remainingBytes)} libres y se estiman ~${formatQuotaMb(requiredBytes)}. Libera descargas en el Gestor Offline.`
    };
  }

  if (remainingBytes < Math.max(lowWarning, Math.round(requiredBytes * 1.5)) || usageRatio >= 0.85) {
    return {
      supported: true,
      status: 'low',
      usageBytes,
      quotaBytes,
      remainingBytes,
      requiredBytes,
      usageRatio,
      canProceed: true,
      message: `Espacio offline bajo: quedan ${formatQuotaMb(remainingBytes)} disponibles (${Math.round(usageRatio * 100)}% usado).`
    };
  }

  return {
    supported: true,
    status: 'ok',
    usageBytes,
    quotaBytes,
    remainingBytes,
    requiredBytes,
    usageRatio,
    canProceed: true,
    message: ''
  };
}

export interface ParsedContentRange {
  start: number;
  end: number;
  total: number;
}

export function parseContentRangeHeader(headerValue: string | null | undefined): ParsedContentRange | null {
  if (!headerValue) return null;
  const match = String(headerValue).trim().match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = match[3] === '*' ? 0 : Number(match[3]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  if (!Number.isFinite(total) || total < 0) return null;
  return { start, end, total };
}

export function computeEpisodeRangeSelection(
  startEp: number,
  endEp: number,
  totalEpisodes: number
): Set<number> {
  const total = Math.max(0, Math.floor(Number(totalEpisodes) || 0));
  const result = new Set<number>();
  if (total === 0) return result;
  const rawStart = Math.floor(Number(startEp) || 1);
  const rawEnd = Math.floor(Number(endEp) || total);
  const lo = Math.max(1, Math.min(total, Math.min(rawStart, rawEnd)));
  const hi = Math.max(1, Math.min(total, Math.max(rawStart, rawEnd)));
  for (let ep = lo; ep <= hi; ep += 1) {
    result.add(ep);
  }
  return result;
}

export function formatAnimeEpisodeFilename(
  rawTitle: string,
  season: number,
  episode: number,
  audio: 'SUB' | 'DUB' | 'LAT' = 'SUB'
): string {
  const cleanTitle = String(rawTitle || 'Anime')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:2nd|3rd|4th|5th|\d+th)\s+season\b/gi, '')
    .replace(/\bseason\s+\d+\b/gi, '')
    .replace(/\btemporada\s+\d+\b/gi, '')
    .replace(/\s*\(T\d+\)\s*$/i, '')
    .replace(/[^a-zA-Z0-9\s_-]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 64) || 'Anime';

  const sNum = Math.max(1, Math.floor(Number(season) || 1));
  const eNum = Math.max(1, Math.floor(Number(episode) || 1));
  const epPad = String(eNum).padStart(2, '0');
  const langTag = audio === 'DUB' || audio === 'LAT' ? 'LAT' : 'SUB';
  return `${cleanTitle}_T${sNum}_Ep${epPad}_${langTag}.mp4`;
}

export function formatSpeedAndEta(
  bytesDownloaded: number,
  totalBytes: number,
  elapsedMs: number
): {
  speedMbps: number;
  speedLabel: string;
  etaSeconds: number | null;
  etaLabel: string;
} {
  const safeLoaded = Math.max(0, Number(bytesDownloaded || 0));
  const safeTotal = Math.max(0, Number(totalBytes || 0));
  const safeSec = Math.max(0.15, Number(elapsedMs || 0) / 1000);
  const bytesPerSec = safeLoaded / safeSec;
  const speedMbps = bytesPerSec / (1024 * 1024);
  const speedLabel = speedMbps >= 0.1 ? `${speedMbps.toFixed(1)} MB/s` : `${Math.max(1, Math.round(bytesPerSec / 1024))} KB/s`;

  if (safeTotal <= 0 || safeLoaded >= safeTotal || bytesPerSec <= 1024) {
    return {
      speedMbps,
      speedLabel,
      etaSeconds: safeTotal > 0 && safeLoaded >= safeTotal ? 0 : null,
      etaLabel: safeTotal > 0 && safeLoaded >= safeTotal ? '0s' : ''
    };
  }

  const remainingBytes = Math.max(0, safeTotal - safeLoaded);
  const etaSeconds = Math.max(1, Math.round(remainingBytes / bytesPerSec));
  let etaLabel = '';
  if (etaSeconds < 60) {
    etaLabel = `~${etaSeconds}s restantes`;
  } else {
    const mins = Math.floor(etaSeconds / 60);
    const secs = etaSeconds % 60;
    etaLabel = secs > 0 ? `~${mins}m ${secs}s restantes` : `~${mins}m restantes`;
  }

  return {
    speedMbps,
    speedLabel,
    etaSeconds,
    etaLabel
  };
}

export function isDirectMp4DownloadCandidate(rawUrl: string): boolean {
  const u = String(rawUrl || '').trim().toLowerCase();
  if (!u) return false;
  if (u.includes('.m3u8')) return false;
  if (u.includes('mp4upload.com') || u.includes('yourupload.com')) return true;
  if (u.includes('archive.org/download/') && /\.(mp4|webm|mkv)(\?|$)/i.test(u)) return true;
  if (/\.(mp4|webm)(\?|$)/i.test(u)) return true;
  return false;
}


