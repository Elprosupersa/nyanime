import { describe, expect, it } from 'vitest';
import {
  compactFavoritesArray,
  compactHistoryArray,
  hasBloatedAnimeMetadata,
  pruneOldestApiCaches,
  safeStorageSetItem,
  type StorageLike
} from '../utils/storageQuota.ts';

function createQuotaStorage(maxChars: number): StorageLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  const totalSize = () => {
    let bytes = 0;
    for (const [k, v] of store.entries()) bytes += k.length + v.length;
    return bytes;
  };
  return {
    store,
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      const prevLen = store.has(key) ? key.length + (store.get(key)?.length || 0) : 0;
      const nextTotal = totalSize() - prevLen + key.length + value.length;
      if (nextTotal > maxChars) {
        const err = new Error('QuotaExceededError: storage limit exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    }
  };
}

describe('storageQuota - Compaction & QuotaExceededError Recovery', () => {
  it('detects and strips bloated AniList relations/description payloads from favorites and history', () => {
    const bloatedFav = {
      id: 16498,
      title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan' },
      coverImage: { extraLarge: 'https://cdn/xl.jpg', large: 'https://cdn/l.jpg' },
      format: 'TV',
      status: 'FINISHED',
      episodes: 25,
      genres: ['Action', 'Drama'],
      description: 'X'.repeat(5000),
      synonyms: ['AoT', 'SnK'],
      relations: { edges: Array.from({ length: 30 }, (_, i) => ({ node: { id: i, description: 'Y'.repeat(500) } })) },
      listStatus: 'watching',
      listUpdatedAt: 123456
    };

    expect(hasBloatedAnimeMetadata(bloatedFav)).toBe(true);
    const compactedFavs = compactFavoritesArray([bloatedFav]);
    expect(compactedFavs).toHaveLength(1);
    expect(hasBloatedAnimeMetadata(compactedFavs[0])).toBe(false);
    expect(compactedFavs[0].relations).toBeUndefined();
    expect(compactedFavs[0].description).toBeUndefined();
    expect(compactedFavs[0].listStatus).toBe('watching');
    expect(compactedFavs[0].episodes).toBe(25);

    const compactedHistory = compactHistoryArray([
      { anime: bloatedFav, seasonNum: 1, episodeNum: 3, timestamp: 500, currentTime: 40, duration: 1400, completed: false }
    ]);
    expect(compactedHistory).toHaveLength(1);
    expect(compactedHistory[0].anime.relations).toBeUndefined();
    expect(compactedHistory[0].anime.description).toBeUndefined();
  });

  it('recovers from QuotaExceededError by purging disposable API caches and compacting legacy collections', () => {
    const storage = createQuotaStorage(2600);

    // Simulate bloated legacy favorites + history + disposable API cache filling quota
    const legacyFav = {
      id: 1,
      title: { romaji: 'Bleach', english: 'Bleach' },
      coverImage: { extraLarge: 'https://cdn/b.jpg', large: 'https://cdn/b.jpg' },
      description: 'D'.repeat(1000),
      relations: { edges: [{ node: { id: 2, note: 'R'.repeat(400) } }] },
      listStatus: 'plan_to_watch',
      listUpdatedAt: 100
    };
    storage.store.set('nyanime_favorites_v2', JSON.stringify([legacyFav]));
    storage.store.set('nyanime_history_v2', JSON.stringify([{ anime: legacyFav, seasonNum: 1, episodeNum: 1, timestamp: 50 }]));
    storage.store.set('nyanime_cache_home', JSON.stringify({ expiry: Date.now() + 50000, value: 'C'.repeat(2100) }));

    // New compacted favorites would push cache+favorites over 2600 chars, triggering QuotaExceededError
    const nextFavs = compactFavoritesArray([
      { id: 2, title: { romaji: 'One Piece', english: 'One Piece' }, listStatus: 'watching', listUpdatedAt: 200 },
      { id: 3, title: { romaji: 'Naruto', english: 'Naruto' }, listStatus: 'completed', listUpdatedAt: 300 },
      legacyFav
    ]);
    const ok = safeStorageSetItem('nyanime_favorites_v2', JSON.stringify(nextFavs), storage);

    expect(ok).toBe(true);
    expect(storage.getItem('nyanime_cache_home')).toBeNull();
    expect(JSON.parse(storage.getItem('nyanime_favorites_v2') || '[]')).toHaveLength(3);
  });

  it('prunes expired and oldest API cache entries to cap cache footprint', () => {
    const storage = createQuotaStorage(50000);
    const now = Date.now();
    storage.store.set('nyanime_cache_expired', JSON.stringify({ expiry: now - 1000, value: 1 }));
    storage.store.set('nyanime_cache_old1', JSON.stringify({ expiry: now + 1000, value: 2 }));
    storage.store.set('nyanime_cache_old2', JSON.stringify({ expiry: now + 2000, value: 3 }));
    storage.store.set('nyanime_cache_new', JSON.stringify({ expiry: now + 9000, value: 4 }));

    pruneOldestApiCaches(storage, 2);

    expect(storage.getItem('nyanime_cache_expired')).toBeNull();
    expect(storage.getItem('nyanime_cache_old1')).toBeNull();
    expect(storage.getItem('nyanime_cache_old2')).not.toBeNull();
    expect(storage.getItem('nyanime_cache_new')).not.toBeNull();
  });
});
