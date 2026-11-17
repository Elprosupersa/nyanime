import {
  compactAnimeStorageEntry,
  normalizeAnimeListStatus
} from './profileStats.ts';

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const CACHE_PREFIX = 'nyanime_cache_';
const FAVORITES_KEY = 'nyanime_favorites_v2';
const HISTORY_KEY = 'nyanime_history_v2';
const EP_PROGRESS_KEY = 'nyanime_ep_progress_v1';
const MANGA_FAV_KEY = 'nyanime_manga_favorites_v1';
const MANGA_HISTORY_KEY = 'nyanime_manga_history_v1';

const BLOATED_ANIME_KEYS = new Set([
  'relations',
  'description',
  'synonyms',
  'characters',
  'recommendations',
  'streamingEpisodes',
  'stats',
  'studios',
  'tags'
]);

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // ignore
  }
  return null;
}

export function hasBloatedAnimeMetadata(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  for (const key of Object.keys(entry as Record<string, unknown>)) {
    if (BLOATED_ANIME_KEYS.has(key)) return true;
  }
  return false;
}

export function compactFavoritesArray(items: unknown[]): Record<string, any>[] {
  if (!Array.isArray(items)) return [];
  const out: Record<string, any>[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, any>;
    if (!item.id) continue;
    const compact = compactAnimeStorageEntry(item);
    compact.listStatus = normalizeAnimeListStatus(item.listStatus, 'plan_to_watch');
    compact.listUpdatedAt = Math.max(0, Math.floor(Number(item.listUpdatedAt || 0)));
    out.push(compact);
  }
  return out;
}

export function compactHistoryArray(items: unknown[]): Record<string, any>[] {
  if (!Array.isArray(items)) return [];
  const out: Record<string, any>[] = [];
  for (const raw of items.slice(0, 20)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, any>;
    if (!entry.anime || typeof entry.anime !== 'object' || !entry.anime.id) continue;
    out.push({
      anime: compactAnimeStorageEntry(entry.anime),
      seasonNum: Math.max(1, Math.floor(Number(entry.seasonNum || 1))),
      episodeNum: Math.max(1, Math.floor(Number(entry.episodeNum || 1))),
      timestamp: Math.max(0, Math.floor(Number(entry.timestamp || 0))),
      currentTime: Math.max(0, Math.floor(Number(entry.currentTime || 0))),
      duration: Math.max(0, Math.floor(Number(entry.duration || 0))),
      completed: Boolean(entry.completed)
    });
  }
  return out;
}

export function compactMangaEntry(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, any>;
  if (!m.id) return null;
  const out: Record<string, any> = {
    id: m.id,
    title: String(m.title || 'Manga').slice(0, 200),
    cover: String(m.cover || '').slice(0, 500),
    flag: String(m.flag || '').slice(0, 40),
    origLang: String(m.origLang || '').slice(0, 12),
    score: String(m.score || '').slice(0, 12),
    status: String(m.status || '').slice(0, 40),
    year: String(m.year || '').slice(0, 12)
  };
  if (typeof m.banner === 'string' && m.banner && m.banner !== out.cover && m.banner.length <= 500) {
    out.banner = m.banner;
  }
  if (typeof m.mangaDexId === 'string' && m.mangaDexId) out.mangaDexId = m.mangaDexId.slice(0, 80);
  if (typeof m.keiyoushiSourceId === 'string' && m.keiyoushiSourceId) out.keiyoushiSourceId = m.keiyoushiSourceId.slice(0, 80);
  if (typeof m.keiyoushiUrl === 'string' && m.keiyoushiUrl) out.keiyoushiUrl = m.keiyoushiUrl.slice(0, 300);
  return out;
}

export function purgeApiCaches(storage: StorageLike, onlyExpired = false, nowMs = Date.now()): number {
  const keysToInspect: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) keysToInspect.push(k);
  }
  let removed = 0;
  for (const k of keysToInspect) {
    if (!onlyExpired) {
      storage.removeItem(k);
      removed += 1;
      continue;
    }
    try {
      const parsed = JSON.parse(storage.getItem(k) || 'null');
      if (!parsed || typeof parsed.expiry !== 'number' || nowMs > parsed.expiry) {
        storage.removeItem(k);
        removed += 1;
      }
    } catch {
      storage.removeItem(k);
      removed += 1;
    }
  }
  return removed;
}

export function compactStoredCollections(storage: StorageLike, skipKey?: string): void {
  if (skipKey !== FAVORITES_KEY) {
    try {
      const rawFav = storage.getItem(FAVORITES_KEY);
      if (rawFav) {
        const parsed = JSON.parse(rawFav);
        if (Array.isArray(parsed)) {
          const compacted = compactFavoritesArray(parsed);
          const nextStr = JSON.stringify(compacted);
          if (nextStr.length < rawFav.length) {
            storage.setItem(FAVORITES_KEY, nextStr);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (skipKey !== HISTORY_KEY) {
    try {
      const rawHist = storage.getItem(HISTORY_KEY);
      if (rawHist) {
        const parsed = JSON.parse(rawHist);
        if (Array.isArray(parsed)) {
          const compacted = compactHistoryArray(parsed);
          const nextStr = JSON.stringify(compacted);
          if (nextStr.length < rawHist.length) {
            storage.setItem(HISTORY_KEY, nextStr);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (skipKey !== EP_PROGRESS_KEY) {
    try {
      const rawEp = storage.getItem(EP_PROGRESS_KEY);
      if (rawEp && rawEp.length > 16000) {
        const epMap = JSON.parse(rawEp) as Record<string, { updatedAt?: number }>;
        if (epMap && typeof epMap === 'object') {
          const keys = Object.keys(epMap);
          if (keys.length > 60) {
            keys
              .sort((a, b) => (epMap[b]?.updatedAt || 0) - (epMap[a]?.updatedAt || 0))
              .slice(60)
              .forEach((k) => delete epMap[k]);
            storage.setItem(EP_PROGRESS_KEY, JSON.stringify(epMap));
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (skipKey !== MANGA_FAV_KEY) {
    try {
      const rawMf = storage.getItem(MANGA_FAV_KEY);
      if (rawMf && rawMf.length > 8000) {
        const parsed = JSON.parse(rawMf);
        if (Array.isArray(parsed)) {
          const compacted = parsed.map(compactMangaEntry).filter(Boolean);
          const nextStr = JSON.stringify(compacted);
          if (nextStr.length < rawMf.length) {
            storage.setItem(MANGA_FAV_KEY, nextStr);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (skipKey !== MANGA_HISTORY_KEY) {
    try {
      const rawMh = storage.getItem(MANGA_HISTORY_KEY);
      if (rawMh && rawMh.length > 8000) {
        const parsed = JSON.parse(rawMh);
        if (Array.isArray(parsed)) {
          const compacted = parsed.slice(0, 20).map((entry: any) => ({
            ...entry,
            manga: compactMangaEntry(entry?.manga) || entry?.manga
          }));
          const nextStr = JSON.stringify(compacted);
          if (nextStr.length < rawMh.length) {
            storage.setItem(MANGA_HISTORY_KEY, nextStr);
          }
        }
      }
    } catch {
      // ignore
    }
  }
}

export function safeStorageSetItem(
  key: string,
  value: string,
  storageArg?: StorageLike | null
): boolean {
  const storage = storageArg ?? getDefaultStorage();
  if (!storage) return false;

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    // Recover from QuotaExceededError by purging disposable API caches & compacting bloated legacy collections
    purgeApiCaches(storage, false);
    try {
      storage.setItem(key, value);
      return true;
    } catch {
      compactStoredCollections(storage, key);
      try {
        storage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
  }
}

export function pruneOldestApiCaches(storageArg?: StorageLike | null, maxCacheEntries = 20): void {
  const storage = storageArg ?? getDefaultStorage();
  if (!storage) return;
  purgeApiCaches(storage, true);

  const cacheEntries: Array<{ key: string; expiry: number; size: number }> = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (!k || !k.startsWith(CACHE_PREFIX)) continue;
    const raw = storage.getItem(k) || '';
    let expiry = 0;
    try {
      expiry = Number(JSON.parse(raw)?.expiry || 0);
    } catch {
      expiry = 0;
    }
    cacheEntries.push({ key: k, expiry, size: raw.length });
  }

  if (cacheEntries.length > maxCacheEntries) {
    cacheEntries.sort((a, b) => a.expiry - b.expiry);
    const excess = cacheEntries.length - maxCacheEntries;
    for (let i = 0; i < excess; i++) {
      storage.removeItem(cacheEntries[i].key);
    }
  }
}
