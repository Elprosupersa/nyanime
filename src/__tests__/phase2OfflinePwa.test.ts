import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ESTIMATED_ANIME_EPISODE_BYTES_1080P,
  ESTIMATED_ANIME_EPISODE_BYTES_720P,
  ESTIMATED_MANGA_CHAPTER_BYTES,
  STORAGE_SAFETY_RESERVE_BYTES,
  estimateAnimeBatchBytes,
  estimateMangaBatchBytes,
  evaluateStorageQuota,
  isQuotaExceededError
} from '../utils/downloadHelpers.ts';
import {
  OFFLINE_ANIME_CACHE,
  OFFLINE_MANGA_CACHE,
  buildMangaChapterOfflineId,
  buildOfflinePageCacheKey,
  checkStorageSpaceForDownload,
  clearAllOfflineStorage,
  downloadAnimeEpisodeOrQueue,
  downloadMangaChapterOffline,
  getAllOfflineManifests,
  getOfflineManifestById,
  revokeOfflineObjectUrls
} from '../services/offline.ts';
import {
  detectActiveMediaSession,
  evaluateSwUpdateLifecycleAction,
  shouldAllowSwTriggeredReload
} from '../utils/pwaReloadGuard.ts';

interface MemoryCacheHarness {
  storage: {
    open: (name: string) => Promise<{
      put: (req: RequestInfo | URL, resp: Response) => Promise<void>;
      match: (req: RequestInfo | URL) => Promise<Response | undefined>;
      delete: (req: RequestInfo | URL) => Promise<boolean>;
    }>;
    delete: (name: string) => Promise<boolean>;
  };
  keysIn: (name: string) => string[];
  setFailPutAt: (cacheName: string, callIndex: number, error: Error) => void;
}

function createMemoryCacheHarness(): MemoryCacheHarness {
  const stores = new Map<string, Map<string, Response>>();
  const putCounts = new Map<string, number>();
  const failRules = new Map<string, { at: number; err: Error }>();

  const getStore = (name: string) => {
    let s = stores.get(name);
    if (!s) {
      s = new Map<string, Response>();
      stores.set(name, s);
    }
    return s;
  };

  return {
    storage: {
      async open(name: string) {
        const store = getStore(name);
        return {
          async put(req: RequestInfo | URL, resp: Response) {
            const count = (putCounts.get(name) || 0) + 1;
            putCounts.set(name, count);
            const rule = failRules.get(name);
            if (rule && count === rule.at) {
              throw rule.err;
            }
            const key = typeof req === 'string' ? req : req.toString();
            store.set(key, resp.clone());
          },
          async match(req: RequestInfo | URL) {
            const key = typeof req === 'string' ? req : req.toString();
            const hit = store.get(key);
            return hit ? hit.clone() : undefined;
          },
          async delete(req: RequestInfo | URL) {
            const key = typeof req === 'string' ? req : req.toString();
            return store.delete(key);
          }
        };
      },
      async delete(name: string) {
        return stores.delete(name);
      }
    },
    keysIn(name: string) {
      return Array.from(stores.get(name)?.keys() || []);
    },
    setFailPutAt(cacheName: string, callIndex: number, error: Error) {
      failRules.set(cacheName, { at: callIndex, err: error });
    }
  };
}

function stubStorageEstimate(estimateFn: () => Promise<{ usage?: number; quota?: number }>) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        estimate: estimateFn,
        persisted: async () => true,
        persist: async () => true
      }
    }
  });
}

describe('Phase 2 - Storage Quota Validation & Estimation', () => {
  it('estimates anime and manga batch byte sizes accurately', () => {
    expect(estimateAnimeBatchBytes(2, '1080p')).toBe(2 * ESTIMATED_ANIME_EPISODE_BYTES_1080P);
    expect(estimateAnimeBatchBytes(3, '720p')).toBe(3 * ESTIMATED_ANIME_EPISODE_BYTES_720P);
    expect(estimateMangaBatchBytes(5)).toBe(5 * ESTIMATED_MANGA_CHAPTER_BYTES);
  });

  it('evaluates unknown, ok, low, and insufficient storage quotas safely', () => {
    const unknown = evaluateStorageQuota({ requiredBytes: 50 * 1024 * 1024, supported: false });
    expect(unknown.status).toBe('unknown');
    expect(unknown.canProceed).toBe(true);

    const ok = evaluateStorageQuota({
      usageBytes: 100 * 1024 * 1024,
      quotaBytes: 2 * 1024 * 1024 * 1024,
      requiredBytes: 120 * 1024 * 1024
    });
    expect(ok.status).toBe('ok');
    expect(ok.canProceed).toBe(true);
    expect(ok.message).toBe('');

    const low = evaluateStorageQuota({
      usageBytes: 860 * 1024 * 1024,
      quotaBytes: 1000 * 1024 * 1024,
      requiredBytes: 60 * 1024 * 1024
    });
    expect(low.status).toBe('low');
    expect(low.canProceed).toBe(true);
    expect(low.message).toMatch(/espacio offline bajo/i);

    const insufficient = evaluateStorageQuota({
      usageBytes: 950 * 1024 * 1024,
      quotaBytes: 1000 * 1024 * 1024,
      requiredBytes: 40 * 1024 * 1024
    });
    expect(insufficient.status).toBe('insufficient');
    expect(insufficient.canProceed).toBe(false);
    expect(insufficient.message).toMatch(/espacio insuficiente/i);
  });

  it('detects QuotaExceededError across DOMException, legacy codes, and localized messages', () => {
    expect(isQuotaExceededError(new DOMException('Quota exceeded', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError(new Error('Espacio insuficiente en el dispositivo'))).toBe(true);
    expect(isQuotaExceededError(new DOMException('Aborted', 'AbortError'))).toBe(false);
    expect(isQuotaExceededError(new Error('Network timeout'))).toBe(false);
  });

  it('falls back safely when storage.estimate() is unsupported or rejects', async () => {
    const unsupported = await checkStorageSpaceForDownload(
      10 * 1024 * 1024,
      async () => ({ usage: 0, quota: 0 })
    );
    expect(unsupported.status).toBe('unknown');
    expect(unsupported.canProceed).toBe(true);

    const throwing = await checkStorageSpaceForDownload(10 * 1024 * 1024, async () => {
      throw new Error('StorageManager blocked');
    });
    expect(throwing.status).toBe('unknown');
    expect(throwing.canProceed).toBe(true);
  });
});

describe('Phase 2 - Offline Download Cleanup (Abort, Network, QuotaExceededError)', () => {
  let cacheHarness: MemoryCacheHarness;
  const originalNavigator = globalThis.navigator;

  beforeEach(async () => {
    cacheHarness = createMemoryCacheHarness();
    vi.stubGlobal('caches', cacheHarness.storage);
    let seq = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:phase2-${++seq}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    stubStorageEstimate(async () => ({
      usage: 50 * 1024 * 1024,
      quota: 4 * 1024 * 1024 * 1024
    }));
    await clearAllOfflineStorage();
  });

  afterEach(() => {
    revokeOfflineObjectUrls();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator
    });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses &download=1 and credentials: same-origin for direct anime .MP4 downloads', async () => {
    const fetchSpy = vi.fn(async () => {
      return new Response(new Uint8Array(4096).fill(11), {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': '4096'
        }
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const manifest = await downloadAnimeEpisodeOrQueue({
      animeId: 999,
      animeTitle: 'Frieren',
      season: 1,
      episode: 1,
      quality: '1080p',
      directStreamUrl: '/api/video-proxy?url=https%3A%2F%2Fcdn.example.com%2Fep1.mp4',
      fallbackWebUrl: 'https://example.com/embed/1'
    });

    expect(manifest.kind).toBe('anime-video');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toContain('/api/video-proxy?');
    expect(calledUrl).toContain('download=1');
    expect(calledInit?.credentials).toBe('same-origin');
  });

  it('blocks anime download before fetching when pre-flight quota is insufficient', async () => {
    stubStorageEstimate(async () => ({
      usage: 950 * 1024 * 1024,
      quota: 1000 * 1024 * 1024
    }));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      downloadAnimeEpisodeOrQueue({
        animeId: 101,
        animeTitle: 'Low Disk Test',
        season: 1,
        episode: 1,
        quality: '1080p',
        directStreamUrl: '/api/video-proxy?url=https%3A%2F%2Fcdn.example.com%2Fep1.mp4',
        fallbackWebUrl: 'https://example.com/embed/1'
      })
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cacheHarness.keysIn(OFFLINE_ANIME_CACHE)).toEqual([]);
    expect(await getAllOfflineManifests()).toEqual([]);
  });

  it('rejects anime download when response Content-Length exceeds remaining quota and leaves no artifacts', async () => {
    // 250 MB free passes 120 MB + 25 MB pre-flight, but a 300 MB Content-Length must abort before reading
    stubStorageEstimate(async () => ({
      usage: 750 * 1024 * 1024,
      quota: 1000 * 1024 * 1024
    }));

    const cancelSpy = vi.fn(async () => {});
    const fakeStream = new ReadableStream<Uint8Array>({
      cancel: cancelSpy
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(fakeStream, {
          status: 200,
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': String(300 * 1024 * 1024)
          }
        });
      })
    );

    await expect(
      downloadAnimeEpisodeOrQueue({
        animeId: 202,
        animeTitle: 'Oversized Ep',
        season: 1,
        episode: 2,
        quality: '1080p',
        directStreamUrl: '/api/video-proxy?url=https%3A%2F%2Fcdn.example.com%2Fep2.mp4',
        fallbackWebUrl: 'https://example.com/embed/2'
      })
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });

    expect(cancelSpy).toHaveBeenCalled();
    expect(cacheHarness.keysIn(OFFLINE_ANIME_CACHE)).toEqual([]);
    expect(await getAllOfflineManifests()).toEqual([]);
  });

  it('purges CacheStorage & IndexedDB cleanly when anime download is aborted mid-stream or hits QuotaExceededError', async () => {
    // Case A: Abort mid-stream
    const ac = new AbortController();
    let reads = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1;
        if (reads === 1) {
          controller.enqueue(new Uint8Array(1024).fill(3));
          ac.abort();
        } else {
          controller.close();
        }
      }
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream, { status: 200, headers: { 'Content-Type': 'video/mp4' } }))
    );

    await expect(
      downloadAnimeEpisodeOrQueue({
        animeId: 303,
        animeTitle: 'Abort Stream',
        season: 1,
        episode: 3,
        quality: '720p',
        directStreamUrl: '/api/video-proxy?url=https%3A%2F%2Fcdn.example.com%2Fep3.mp4',
        fallbackWebUrl: 'https://example.com/embed/3',
        signal: ac.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(cacheHarness.keysIn(OFFLINE_ANIME_CACHE)).toEqual([]);
    expect(await getOfflineManifestById('anime_303_s1_e3')).toBeNull();

    // Case B: QuotaExceededError during cache.put
    cacheHarness.setFailPutAt(
      OFFLINE_ANIME_CACHE,
      1,
      new DOMException('Quota exceeded on put', 'QuotaExceededError')
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(2048).fill(7), { status: 200, headers: { 'Content-Type': 'video/mp4' } }))
    );

    await expect(
      downloadAnimeEpisodeOrQueue({
        animeId: 304,
        animeTitle: 'Quota On Put',
        season: 1,
        episode: 4,
        quality: '720p',
        directStreamUrl: '/api/video-proxy?url=https%3A%2F%2Fcdn.example.com%2Fep4.mp4',
        fallbackWebUrl: 'https://example.com/embed/4'
      })
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });

    expect(cacheHarness.keysIn(OFFLINE_ANIME_CACHE)).toEqual([]);
    expect(await getOfflineManifestById('anime_304_s1_e4')).toBeNull();
  });

  it('purges ALL cached manga pages and IndexedDB records when QuotaExceededError happens mid-chapter', async () => {
    // Allow page 1 to write, fail page 2 with QuotaExceededError
    cacheHarness.setFailPutAt(
      OFFLINE_MANGA_CACHE,
      2,
      new DOMException('Storage full', 'QuotaExceededError')
    );

    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(new Uint8Array(512).fill(9), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' }
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const offlineId = buildMangaChapterOfflineId('quota-manga', 12);
    await expect(
      downloadMangaChapterOffline({
        mangaId: 'quota-manga',
        mangaTitle: 'Quota Manga',
        chapterNum: 12,
        chapterLabel: '12',
        pageUrls: [
          'https://cdn.example.com/p1.jpg',
          'https://cdn.example.com/p2.jpg',
          'https://cdn.example.com/p3.jpg'
        ]
      })
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });

    // Verify credentials: 'same-origin' was sent on page fetches
    const firstInit = fetchSpy.mock.calls[0]?.[1];
    expect(firstInit?.credentials).toBe('same-origin');

    // Verify zero orphan page entries remain in CacheStorage and zero manifest in IndexedDB
    expect(cacheHarness.keysIn(OFFLINE_MANGA_CACHE)).toEqual([]);
    const page0Key = buildOfflinePageCacheKey(offlineId, 0);
    const cache = await cacheHarness.storage.open(OFFLINE_MANGA_CACHE);
    expect(await cache.match(page0Key)).toBeUndefined();
    expect(await getOfflineManifestById(offlineId)).toBeNull();
  });

  it('blocks manga chapter download pre-flight when remaining space is below chapter estimate + safety reserve', async () => {
    const quotaBytes = 500 * 1024 * 1024;
    const usageBytes = quotaBytes - (STORAGE_SAFETY_RESERVE_BYTES + 1024 * 1024); // only ~26MB left (< 12MB + 25MB)
    stubStorageEstimate(async () => ({ usage: usageBytes, quota: quotaBytes }));

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      downloadMangaChapterOffline({
        mangaId: 'tiny-disk',
        mangaTitle: 'Tiny Disk',
        chapterNum: 1,
        chapterLabel: '1',
        pageUrls: ['https://cdn.example.com/p1.jpg']
      })
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Phase 2 - Anti-Reload PWA Guard During Playback, Reading & Downloads', () => {
  it('blocks reloads during video playback, manga reading, or active downloads unless explicitly forced by user action', () => {
    // Background / automatic reload is always blocked
    expect(shouldAllowSwTriggeredReload({ userRequested: false, isUpdate: true })).toBe(false);
    expect(
      shouldAllowSwTriggeredReload({ userRequested: false, isPlayingVideo: true, allowDuringMedia: true })
    ).toBe(false);

    // User-requested reload without allowDuringMedia is deferred while media/download is active
    expect(shouldAllowSwTriggeredReload({ userRequested: true, isPlayingVideo: true })).toBe(false);
    expect(shouldAllowSwTriggeredReload({ userRequested: true, isReadingManga: true })).toBe(false);
    expect(shouldAllowSwTriggeredReload({ userRequested: true, isDownloading: true })).toBe(false);

    // Explicitly confirmed user click (allowDuringMedia: true) or idle state is permitted
    expect(
      shouldAllowSwTriggeredReload({ userRequested: true, isPlayingVideo: true, allowDuringMedia: true })
    ).toBe(true);
    expect(
      shouldAllowSwTriggeredReload({
        userRequested: true,
        isPlayingVideo: false,
        isReadingManga: false,
        isDownloading: false
      })
    ).toBe(true);
  });

  it('defers SW update toast while user is watching video, reading manga, or downloading', () => {
    expect(evaluateSwUpdateLifecycleAction({ isPlayingVideo: true })).toBe('defer');
    expect(evaluateSwUpdateLifecycleAction({ isReadingManga: true })).toBe('defer');
    expect(evaluateSwUpdateLifecycleAction({ isDownloading: true })).toBe('defer');
    expect(
      evaluateSwUpdateLifecycleAction({
        isPlayingVideo: false,
        isReadingManga: false,
        isDownloading: false,
        alreadyPrompted: false
      })
    ).toBe('prompt');
    expect(
      evaluateSwUpdateLifecycleAction({
        isPlayingVideo: false,
        isReadingManga: false,
        isDownloading: false,
        alreadyPrompted: true
      })
    ).toBe('noop');
  });

  it('detects active media and download sessions from DOM state accurately', () => {
    const makeFakeDoc = (activeIds: string[], playingVideo = false): Document => {
      const idSet = new Set(activeIds);
      return {
        getElementById(id: string) {
          return {
            classList: {
              contains: (cls: string) => cls === 'hide' && !idSet.has(id)
            }
          } as unknown as HTMLElement;
        },
        querySelectorAll(selector: string) {
          if (selector === 'video' && playingVideo) {
            return [{ paused: false, ended: false, readyState: 3 }] as unknown as NodeListOf<HTMLVideoElement>;
          }
          return [] as unknown as NodeListOf<Element>;
        }
      } as unknown as Document;
    };

    expect(detectActiveMediaSession(null)).toEqual({
      isPlayingVideo: false,
      isReadingManga: false,
      isDownloading: false,
      isBusy: false
    });

    expect(detectActiveMediaSession(makeFakeDoc([]))).toEqual({
      isPlayingVideo: false,
      isReadingManga: false,
      isDownloading: false,
      isBusy: false
    });

    expect(detectActiveMediaSession(makeFakeDoc(['pantalla-reproductor']))).toMatchObject({
      isPlayingVideo: true,
      isBusy: true
    });

    expect(detectActiveMediaSession(makeFakeDoc([], true))).toMatchObject({
      isPlayingVideo: true,
      isBusy: true
    });

    expect(detectActiveMediaSession(makeFakeDoc(['pantalla-lector']))).toMatchObject({
      isReadingManga: true,
      isBusy: true
    });

    expect(detectActiveMediaSession(makeFakeDoc(['season-dl-progress-box']))).toMatchObject({
      isDownloading: true,
      isBusy: true
    });

    expect(detectActiveMediaSession(makeFakeDoc(['manga-dl-progress-box']))).toMatchObject({
      isDownloading: true,
      isBusy: true
    });
  });
});

describe('Phase 2 - CSS 1:1 Modularization Integrity', () => {
  it('imports all 9 modular stylesheets in deterministic cascade order from src/styles/main.css', () => {
    const stylesDir = path.resolve(process.cwd(), 'src/styles');
    const mainCss = fs.readFileSync(path.join(stylesDir, 'main.css'), 'utf8');
    const expectedOrder = [
      './tokens.css',
      './base.css',
      './layout.css',
      './home-schedule.css',
      './detail.css',
      './player.css',
      './manga.css',
      './profile.css',
      './modals.css'
    ];

    const imports = Array.from(mainCss.matchAll(/@import\s+"([^"]+)";/g)).map((m) => m[1]);
    expect(imports).toEqual(expectedOrder);

    for (const rel of expectedOrder) {
      const absPath = path.join(stylesDir, rel.replace(/^\.\//, ''));
      expect(fs.existsSync(absPath)).toBe(true);
      const content = fs.readFileSync(absPath, 'utf8');
      expect(content.trim().length).toBeGreaterThan(200);
    }
  });
});
