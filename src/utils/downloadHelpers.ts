import type { OfflineChapterManifest } from '../services/offline.ts';

export type DownloadPickerFilterMode = 'all' | 'none' | 'unwatched' | 'not-downloaded';
export type DownloadManagerFilterTab = 'all' | 'anime' | 'watch-later' | 'manga';

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
  pct: number;
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
  usageBytes?: number;
  quotaBytes?: number;
  animeFilesCount?: number;
  watchLaterCount?: number;
  mangaChaptersCount?: number;
}): StorageMeterData {
  const offlineBytes = Math.max(0, Number(summary.offlineBytes || 0));
  const usedBytes = Math.max(offlineBytes, Number(summary.usageBytes || 0));
  const quotaBytes = Math.max(0, Number(summary.quotaBytes || 0));
  const rawPct = quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : (offlineBytes > 0 ? 12 : 0);
  const pct = offlineBytes > 0 ? Math.max(3, Math.min(100, Math.round(rawPct))) : Math.min(100, Math.round(rawPct));

  return {
    usedBytes,
    quotaBytes,
    offlineBytes,
    pct,
    animeFilesCount: Number(summary.animeFilesCount || 0),
    watchLaterCount: Number(summary.watchLaterCount || 0),
    mangaChaptersCount: Number(summary.mangaChaptersCount || 0)
  };
}
