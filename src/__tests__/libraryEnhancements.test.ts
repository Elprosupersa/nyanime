import { describe, expect, it } from 'vitest';
import {
  buildCustomList,
  computeLibraryRatingsSummary,
  rankSmartCandidates,
  sanitizeUserScore,
  selectSmartRecommendationSeeds,
  toggleItemInCustomList
} from '../utils/libraryEnhancements.ts';

describe('libraryEnhancements', () => {
  it('sanitizes 1-10 scores and computes combined anime + manga ratings summary', () => {
    expect(sanitizeUserScore(10)).toBe(10);
    expect(sanitizeUserScore(0)).toBeNull();
    expect(sanitizeUserScore(15)).toBeNull();
    expect(sanitizeUserScore('')).toBeNull();

    const summary = computeLibraryRatingsSummary(
      [
        { id: 1, title: { english: 'Frieren' }, coverImage: { large: 'a.jpg' }, userScore: 10, userReview: 'Obra maestra', scoreUpdatedAt: 200 },
        { id: 2, title: { romaji: 'Bleach' }, coverImage: { large: 'b.jpg' }, userScore: 8, scoreUpdatedAt: 100 }
      ],
      [{ id: 'm1', title: 'Berserk', cover: 'c.jpg', userScore: 9, scoreUpdatedAt: 150 }]
    );

    expect(summary.ratedCount).toBe(3);
    expect(summary.averageScore).toBe(9);
    expect(summary.topRated[0].title).toBe('Frieren');
    expect(summary.topRated[1].title).toBe('Berserk');
  });

  it('creates custom lists and toggles membership cleanly', () => {
    const list = buildCustomList('Top Isekai 2026', { icon: '🔥', nowMs: 1000 });
    expect(list).not.toBeNull();
    expect(list?.name).toBe('Top Isekai 2026');

    const added = toggleItemInCustomList([], list!.id);
    expect(added.added).toBe(true);
    expect(added.nextIds).toEqual([list!.id]);

    const removed = toggleItemInCustomList(added.nextIds, list!.id);
    expect(removed.added).toBe(false);
    expect(removed.nextIds).toEqual([]);
  });

  it('selects best recommendation seed and ranks smart candidates excluding owned IDs', () => {
    const seeds = selectSmartRecommendationSeeds(
      [
        { id: 10, title: { english: 'Steins;Gate' }, listStatus: 'completed', userScore: 10, genres: ['Sci-Fi', 'Thriller'] },
        { id: 11, title: { english: 'Dropped Show' }, listStatus: 'dropped', genres: ['Ecchi'] }
      ],
      []
    );
    expect(seeds.becauseOfAnime?.id).toBe(10);
    expect(seeds.topGenres).toEqual(['Sci-Fi', 'Thriller']);

    const ranked = rankSmartCandidates(
      [
        { id: 10, genres: ['Sci-Fi', 'Thriller'], averageScore: 95 },
        { id: 20, genres: ['Comedy'], averageScore: 70 },
        { id: 30, genres: ['Sci-Fi', 'Thriller'], averageScore: 85 }
      ],
      seeds.topGenres,
      seeds.excludedIds,
      5
    );
    expect(ranked.map((x) => x.id)).toEqual([30, 20]);
  });
});
