import { describe, expect, it } from 'vitest';
import {
  buildSeasonEpisodeRanges,
  computeEpisodeSelectionByMode,
  computeStorageMeter,
  groupOfflineManifests,
  normalizeSeriesGroupTitle
} from '../utils/downloadHelpers.ts';
import type { OfflineChapterManifest } from '../services/offline.ts';

describe('downloadHelpers - Episode Picker & Ranges', () => {
  it('builds balanced episode ranges for long seasons and skips ranges for short seasons', () => {
    expect(buildSeasonEpisodeRanges(12)).toEqual([]);
    expect(buildSeasonEpisodeRanges(25)).toEqual([
      { start: 1, end: 12, label: '1–12' },
      { start: 13, end: 24, label: '13–24' },
      { start: 25, end: 25, label: 'Ep. 25' }
    ]);
    const longRanges = buildSeasonEpisodeRanges(65);
    expect(longRanges).toEqual([
      { start: 1, end: 25, label: '1–25' },
      { start: 26, end: 50, label: '26–50' },
      { start: 51, end: 65, label: '51–65' }
    ]);
  });

  it('computes episode selections accurately by mode (all, none, unwatched, not-downloaded)', () => {
    const all = computeEpisodeSelectionByMode({ totalEpisodes: 4, mode: 'all' });
    expect(Array.from(all)).toEqual([1, 2, 3, 4]);

    const none = computeEpisodeSelectionByMode({ totalEpisodes: 4, mode: 'none' });
    expect(Array.from(none)).toEqual([]);

    const unwatched = computeEpisodeSelectionByMode({
      totalEpisodes: 5,
      mode: 'unwatched',
      watchedEpisodes: new Set([1, 3])
    });
    expect(Array.from(unwatched)).toEqual([2, 4, 5]);

    const notDownloaded = computeEpisodeSelectionByMode({
      totalEpisodes: 5,
      mode: 'not-downloaded',
      offlineEpisodes: [2, 5]
    });
    expect(Array.from(notDownloaded)).toEqual([1, 3, 4]);
  });
});

describe('downloadHelpers - Series Grouping & Storage Meter', () => {
  const sampleItems: OfflineChapterManifest[] = [
    {
      id: 'anime_16498_s1_e2',
      kind: 'anime-video',
      mediaId: '16498',
      title: 'Attack on Titan (T1)',
      season: 1,
      episode: 2,
      quality: '1080p',
      sizeBytes: 120 * 1024 * 1024,
      status: 'completed',
      createdAt: 200
    },
    {
      id: 'anime_16498_s1_e1',
      kind: 'anime-video',
      mediaId: '16498',
      title: 'Attack on Titan (T1)',
      season: 1,
      episode: 1,
      quality: '1080p',
      sizeBytes: 110 * 1024 * 1024,
      status: 'completed',
      createdAt: 100
    },
    {
      id: 'anime_21_s1_e1100',
      kind: 'watch-later',
      mediaId: '21',
      title: 'One Piece',
      season: 1,
      episode: 1100,
      quality: '1080p',
      url: 'https://jkanime.net/one-piece/1100/',
      sizeBytes: 0,
      status: 'watch-later',
      createdAt: 300
    },
    {
      id: 'manga_30013_c5',
      kind: 'manga',
      mediaId: '30013',
      title: 'One Piece',
      chapterNum: 5,
      chapterLabel: '5',
      pageCount: 20,
      sizeBytes: 5 * 1024 * 1024,
      status: 'completed',
      createdAt: 150
    }
  ];

  it('normalizes season suffixes and groups anime episodes in ascending season/episode order', () => {
    expect(normalizeSeriesGroupTitle('Attack on Titan (T1)')).toBe('Attack on Titan');

    const grouped = groupOfflineManifests(sampleItems);
    expect(grouped.counts).toEqual({
      all: 4,
      anime: 2,
      watchLater: 1,
      manga: 1
    });
    expect(grouped.animeGroups).toHaveLength(1);
    expect(grouped.animeGroups[0].title).toBe('Attack on Titan');
    expect(grouped.animeGroups[0].itemCount).toBe(2);
    expect(grouped.animeGroups[0].items.map((x) => x.episode)).toEqual([1, 2]);
    expect(grouped.animeGroups[0].totalBytes).toBe(230 * 1024 * 1024);
    expect(grouped.watchLaterItems).toHaveLength(1);
    expect(grouped.mangaGroups).toHaveLength(1);
  });

  it('filters grouped downloads accurately by search query while preserving total counts', () => {
    const filtered = groupOfflineManifests(sampleItems, 'titan');
    expect(filtered.animeGroups).toHaveLength(1);
    expect(filtered.watchLaterItems).toHaveLength(0);
    expect(filtered.mangaGroups).toHaveLength(0);
    expect(filtered.counts.all).toBe(4);
  });

  it('computes safe storage meter percentages', () => {
    const meter = computeStorageMeter({
      offlineBytes: 250 * 1024 * 1024,
      usageBytes: 260 * 1024 * 1024,
      quotaBytes: 1000 * 1024 * 1024,
      animeFilesCount: 2,
      watchLaterCount: 1,
      mangaChaptersCount: 0
    });
    expect(meter.pct).toBe(26);
    expect(meter.animeFilesCount).toBe(2);
    expect(meter.watchLaterCount).toBe(1);

    const emptyMeter = computeStorageMeter({ offlineBytes: 0, usageBytes: 0, quotaBytes: 0 });
    expect(emptyMeter.pct).toBe(0);
  });
});
