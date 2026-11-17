import { describe, expect, it } from 'vitest';
import {
  computeIframeActiveDeltaSeconds,
  computeLibrarySummary,
  computeRealWatchDeltaSeconds,
  countUniqueWatchedEpisodes,
  countWatchedForAnime,
  formatWatchDuration,
  getRankProgress,
  mapExternalStatusToListStatus,
  mergeAnimeFavoriteMetadata,
  normalizeAnimeListStatus,
  resolveAutoListStatusTransition
} from '../utils/profileStats.ts';

describe('profileStats - Real Watch Time & Formatting', () => {
  it('accumulates strictly forward native video ticks and rejects seeks, pauses, and rewinds', () => {
    expect(
      computeRealWatchDeltaSeconds({ prevTime: 10, nextTime: 12.5, isPaused: false, isSeeking: false })
    ).toBeCloseTo(2.5);

    expect(
      computeRealWatchDeltaSeconds({ prevTime: 10, nextTime: 12.5, isPaused: true, isSeeking: false })
    ).toBe(0);

    expect(
      computeRealWatchDeltaSeconds({ prevTime: 10, nextTime: 12.5, isPaused: false, isSeeking: true })
    ).toBe(0);

    // Seeking forward > maxTickSeconds (e.g. skip intro +90s)
    expect(
      computeRealWatchDeltaSeconds({ prevTime: 30, nextTime: 120, isPaused: false, isSeeking: false })
    ).toBe(0);

    // Rewind
    expect(
      computeRealWatchDeltaSeconds({ prevTime: 40, nextTime: 30, isPaused: false, isSeeking: false })
    ).toBe(0);
  });

  it('tracks foreground iframe active time only when player is open, visible, and loaded', () => {
    expect(
      computeIframeActiveDeltaSeconds({
        elapsedMs: 10_000,
        isVisible: true,
        isPlayerOpen: true,
        isIframeLoaded: true
      })
    ).toBe(10);

    // Caps huge background jump
    expect(
      computeIframeActiveDeltaSeconds({
        elapsedMs: 600_000,
        isVisible: true,
        isPlayerOpen: true,
        isIframeLoaded: true,
        maxStepSeconds: 30
      })
    ).toBe(30);

    expect(
      computeIframeActiveDeltaSeconds({
        elapsedMs: 10_000,
        isVisible: false,
        isPlayerOpen: true,
        isIframeLoaded: true
      })
    ).toBe(0);

    expect(
      computeIframeActiveDeltaSeconds({
        elapsedMs: 10_000,
        isVisible: true,
        isPlayerOpen: false,
        isIframeLoaded: true
      })
    ).toBe(0);

    expect(
      computeIframeActiveDeltaSeconds({
        elapsedMs: 10_000,
        isVisible: true,
        isPlayerOpen: true,
        isIframeLoaded: false
      })
    ).toBe(0);
  });

  it('formats real durations accurately without fake padding or rounding down to 0h', () => {
    expect(formatWatchDuration(0)).toBe('0m');
    expect(formatWatchDuration(45)).toBe('45s');
    expect(formatWatchDuration(60)).toBe('1m');
    expect(formatWatchDuration(18 * 60 + 20)).toBe('18m');
    expect(formatWatchDuration(134 * 60)).toBe('2h 14m');
    expect(formatWatchDuration(3 * 3600)).toBe('3h');
    expect(formatWatchDuration(27 * 3600)).toBe('1d 3h');
  });
});

describe('profileStats - Deduplicated Episodes & Library Categories', () => {
  it('deduplicates watched episodes across seasons and clamps invalid numbers', () => {
    const count = countUniqueWatchedEpisodes({
      '101': [1, 1, 2, 3, '3', 0, -2, 'abc'],
      '202': [1, 2]
    });
    expect(count).toBe(5);
    expect(countUniqueWatchedEpisodes(null)).toBe(0);
  });

  it('computes per-anime progress bounded by known totalEpisodes', () => {
    const prog = countWatchedForAnime(
      { id: 101, episodes: 12 },
      { '101': [1, 2, 3, 15, 2] }
    );
    expect(prog).toEqual({ watchedCount: 3, totalEpisodes: 12, pct: 25 });
  });

  it('normalizes internal, AniList, and MyAnimeList list statuses cleanly', () => {
    expect(normalizeAnimeListStatus('CURRENT')).toBe('watching');
    expect(normalizeAnimeListStatus('PLANNING')).toBe('plan_to_watch');
    expect(normalizeAnimeListStatus('PAUSED')).toBe('on_hold');
    expect(normalizeAnimeListStatus(1)).toBe('watching');
    expect(normalizeAnimeListStatus(2)).toBe('completed');
    expect(normalizeAnimeListStatus(3)).toBe('on_hold');
    expect(normalizeAnimeListStatus(4)).toBe('dropped');
    expect(normalizeAnimeListStatus(6)).toBe('plan_to_watch');
    expect(mapExternalStatusToListStatus('COMPLETED')).toBe('completed');
  });

  it('resolves automatic status transitions when episodes are watched', () => {
    expect(resolveAutoListStatusTransition('plan_to_watch', 1, 12)).toBe('watching');
    expect(resolveAutoListStatusTransition('watching', 12, 12)).toBe('completed');
    expect(resolveAutoListStatusTransition('dropped', 12, 12)).toBe('dropped');
  });

  it('calculates rank thresholds and full library summary deterministically', () => {
    expect(getRankProgress(5, 4).tier).toBe('NOVATO');
    expect(getRankProgress(12, 8).tier).toBe('OTAKU');
    expect(getRankProgress(80, 25).tier).toBe('LEYENDA');
    expect(getRankProgress(0, 0, 'VIP').tier).toBe('VIP');

    const summary = computeLibrarySummary({
      animes: [
        { id: 1, listStatus: 'watching', episodes: 12, genres: ['Action', 'Drama'] },
        { id: 2, listStatus: 'completed', episodes: 24, genres: ['Action'] },
        { id: 3, listStatus: 'plan_to_watch', episodes: 12, genres: ['Sci-Fi'] }
      ],
      mangas: [{ id: 'm1', title: 'Manga 1' }],
      watchedMap: { '1': [1, 2], '2': Array.from({ length: 24 }, (_, i) => i + 1) },
      totalSecondsWatched: 3720,
      chaptersRead: 9
    });

    expect(summary.totalSavedAnimes).toBe(3);
    expect(summary.totalSavedMangas).toBe(1);
    expect(summary.totalLibraryItems).toBe(4);
    expect(summary.countsByStatus).toEqual({
      watching: 1,
      plan_to_watch: 1,
      completed: 1,
      on_hold: 0,
      dropped: 0
    });
    expect(summary.uniqueEpisodesWatched).toBe(26);
    expect(summary.completedSeriesCount).toBe(1);
  expect(summary.formattedWatchTime).toBe('1h 2m');
    expect(summary.topGenres[0]).toEqual({ genre: 'Action', count: 2, pct: 100 });
  });

  it('merges favorite anime metadata safely without clobbering richer existing fields or retaining bloat', () => {
    const merged = mergeAnimeFavoriteMetadata(
      {
        id: 21,
        title: { romaji: 'One Piece', english: 'One Piece' },
        coverImage: { extraLarge: 'https://cdn/xl.jpg', large: 'https://cdn/l.jpg' },
        episodes: 1100,
        genres: ['Action', 'Adventure'],
        format: 'TV',
        relations: { edges: [{ node: { id: 999 } }] },
        description: 'Very long description',
        listStatus: 'plan_to_watch',
        listUpdatedAt: 100
      },
      {
        id: 21,
        title: { romaji: 'One Piece' },
        episodes: undefined,
        genres: [],
        relations: { edges: [{ node: { id: 888 } }] },
        synonyms: ['OP']
      },
      'watching',
      9999
    );

    expect(merged.listStatus).toBe('watching');
    expect(merged.listUpdatedAt).toBe(9999);
    expect(merged.episodes).toBe(1100);
    expect(merged.genres).toEqual(['Action', 'Adventure']);
    expect(merged.coverImage.extraLarge).toBe('https://cdn/xl.jpg');
    expect(merged.relations).toBeUndefined();
    expect(merged.description).toBeUndefined();
    expect(merged.synonyms).toBeUndefined();
  });
});
