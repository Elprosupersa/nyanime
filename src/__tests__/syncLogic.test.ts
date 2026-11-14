import { describe, expect, it } from 'vitest';
import {
  filterZombieHistoryEntries,
  resolveFavoritesMerge,
  resolveMangaReadChapters
} from '../utils/syncLogic.ts';

describe('syncLogic - Tombstone & Conflict Resolution', () => {
  it('prevents locally deleted favorites from resurrecting on cloud sync', () => {
    const res = resolveFavoritesMerge({
      localIds: ['101', '202'],
      cloudIds: ['101', '999'],
      deletedIds: ['999']
    });

    expect(res.toDeleteCloud).toEqual(['999']);
    expect(res.toUpload).toEqual(['202']);
    expect(res.toKeepLocal.sort()).toEqual(['101', '202']);
  });

  it('re-uploads favorite if user deleted it before and re-added it locally afterwards', () => {
    const res = resolveFavoritesMerge({
      localIds: ['999'],
      cloudIds: [],
      deletedIds: ['999']
    });

    expect(res.toDeleteCloud).toEqual([]);
    expect(res.toUpload).toEqual(['999']);
    expect(res.toKeepLocal).toEqual(['999']);
  });

  it('respects explicit local unmarking / overwrite of manga read chapters', () => {
    // User unmarked chapter 2 locally (explicitLocalWrite = true, newer or equal timestamp)
    const afterUnmark = resolveMangaReadChapters({
      localChapters: ['1', '3'],
      cloudChapters: ['1', '2', '3'],
      localUpdatedAt: 2000,
      cloudUpdatedAt: 1500,
      explicitLocalWrite: true
    });
    expect(afterUnmark).toEqual(['1', '3']);

    // User cleared all chapters locally ([])
    const afterMarkAllUnread = resolveMangaReadChapters({
      localChapters: [],
      cloudChapters: ['1', '2'],
      localUpdatedAt: 3000,
      cloudUpdatedAt: 3000,
      explicitLocalWrite: true
    });
    expect(afterMarkAllUnread).toEqual([]);

    // Strictly newer cloud state wins when local has no newer explicit write
    const cloudWins = resolveMangaReadChapters({
      localChapters: ['1'],
      cloudChapters: ['1', '2', '3', '4'],
      localUpdatedAt: 1000,
      cloudUpdatedAt: 5000,
      explicitLocalWrite: false
    });
    expect(cloudWins).toEqual(['1', '2', '3', '4']);
  });

  it('filters zombie cloud history entries created before an explicit history clear cutoff', () => {
    const { validCloudEntries, zombieCloudIds } = filterZombieHistoryEntries({
      clearedAtTimestamp: 5000,
      cloudEntries: [
        { id: 'old_anime', timestamp: 4200 },
        { id: 'exact_cutoff', timestamp: 5000 },
        { id: 'new_anime', timestamp: 5100 }
      ]
    });

    expect(zombieCloudIds).toEqual(['old_anime', 'exact_cutoff']);
    expect(validCloudEntries).toEqual([{ id: 'new_anime', timestamp: 5100 }]);
  });
});
