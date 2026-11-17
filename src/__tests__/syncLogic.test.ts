import { describe, expect, it } from 'vitest';
import {
  filterZombieHistoryEntries,
  resolveAnimeWatchedMerge,
  resolveFavoriteStatusSync,
  resolveFavoritesMerge,
  resolveMangaReadChapters,
  resolveUserProfileSync
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

  it('resolves favorite listStatus using newest listUpdatedAt timestamp', () => {
    const localNewer = resolveFavoriteStatusSync({
      localStatus: 'completed',
      localUpdatedAt: 9000,
      cloudStatus: 'watching',
      cloudUpdatedAt: 5000
    });
    expect(localNewer).toEqual({ listStatus: 'completed', listUpdatedAt: 9000, winner: 'cloud' });

    const cloudNewer = resolveFavoriteStatusSync({
      localStatus: 'plan_to_watch',
      localUpdatedAt: 1000,
      cloudStatus: 'on_hold',
      cloudUpdatedAt: 8000
    });
    expect(cloudNewer).toEqual({ listStatus: 'on_hold', listUpdatedAt: 8000, winner: 'local' });
  });

  it('respects explicit local unmarking / overwrite of anime watched episodes', () => {
    const unmarked = resolveAnimeWatchedMerge({
      localEpisodes: [1, 3],
      cloudEpisodes: [1, 2, 3],
      localUpdatedAt: 5000,
      cloudUpdatedAt: 5000,
      explicitLocalWrite: true
    });
    expect(unmarked).toEqual([1, 3]);

    const cloudNewer = resolveAnimeWatchedMerge({
      localEpisodes: [1],
      cloudEpisodes: [1, 2, 3, 4],
      localUpdatedAt: 1000,
      cloudUpdatedAt: 6000,
      explicitLocalWrite: false
    });
    expect(cloudNewer).toEqual([1, 2, 3, 4]);
  });

  it('resolves profile displayName and custom avatar using newest profileUpdatedAt timestamp', () => {
    const localNewer = resolveUserProfileSync({
      localName: 'SatoruCustom',
      localAvatar: 'data:image/jpeg;base64,/9j/LOCAL==',
      localProfileUpdatedAt: 9000,
      cloudName: 'OldCloudName',
      cloudAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo',
      cloudProfileUpdatedAt: 4000
    });
    expect(localNewer).toEqual({
      displayName: 'SatoruCustom',
      avatar: 'data:image/jpeg;base64,/9j/LOCAL==',
      profileUpdatedAt: 9000,
      source: 'local'
    });

    const cloudNewer = resolveUserProfileSync({
      localName: 'Invitado',
      localAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo',
      localProfileUpdatedAt: 1000,
      cloudName: 'CloudOtaku',
      cloudAvatar: 'data:image/jpeg;base64,/9j/CLOUD==',
      cloudProfileUpdatedAt: 8000
    });
    expect(cloudNewer).toEqual({
      displayName: 'CloudOtaku',
      avatar: 'data:image/jpeg;base64,/9j/CLOUD==',
      profileUpdatedAt: 8000,
      source: 'cloud'
    });
  });
});
