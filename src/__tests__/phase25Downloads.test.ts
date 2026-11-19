import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOWNLOAD_CHUNK_BYTES,
  computeEpisodeRangeSelection,
  computeStorageMeter,
  formatAnimeEpisodeFilename,
  formatBytesCompact,
  formatSpeedAndEta,
  isDirectMp4DownloadCandidate,
  parseContentRangeHeader
} from '../utils/downloadHelpers.ts';
import {
  OFFLINE_ANIME_CACHE,
  clearAllOfflineStorage,
  downloadAnimeEpisodeChunked,
  downloadAnimeEpisodeOrQueue,
  exportOfflineAnimeToDevice,
  getAllOfflineManifests,
  getOfflineManifestById,
  getStorageSummary,
  revokeOfflineObjectUrls,
  type AnimeDownloadProgress
} from '../services/offline.ts';

function createMemoryCacheHarness() {
  const stores = new Map<string, Map<string, Response>>();
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
    }
  };
}

function stubStorageEstimate(usage: number, quota: number) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        estimate: async () => ({ usage, quota }),
        persisted: async () => true,
        persist: async () => true
      }
    }
  });
}

describe('Phase 2.5 - Pure Helpers (Range, Filename, Speed/ETA, Breakdown)', () => {
  it('parses Content-Range headers accurately and rejects malformed headers', () => {
    expect(parseContentRangeHeader('bytes 0-4194303/150000000')).toEqual({
      start: 0,
      end: 4194303,
      total: 150000000
    });
    expect(parseContentRangeHeader('bytes 4194304-8388607/*')).toEqual({
      start: 4194304,
      end: 8388607,
      total: 0
    });
    expect(parseContentRangeHeader('invalid')).toBeNull();
    expect(parseContentRangeHeader('bytes 50-10/100')).toBeNull();
  });

  it('computes custom episode range selections cleanly even if inverted or out of bounds', () => {
    expect(Array.from(computeEpisodeRangeSelection(1, 6, 12))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Array.from(computeEpisodeRangeSelection(8, 5, 12))).toEqual([5, 6, 7, 8]);
    expect(Array.from(computeEpisodeRangeSelection(-3, 99, 4))).toEqual([1, 2, 3, 4]);
    expect(Array.from(computeEpisodeRangeSelection(1, 3, 0))).toEqual([]);
  });

  it('formats clean MP4 filenames with season, padded episode, and audio tag', () => {
    expect(formatAnimeEpisodeFilename('Solo Leveling Season 2', 2, 1, 'SUB')).toBe(
      'Solo_Leveling_T2_Ep01_SUB.mp4'
    );
    expect(formatAnimeEpisodeFilename('Black Clover (T1)', 1, 14, 'DUB')).toBe(
      'Black_Clover_T1_Ep14_LAT.mp4'
    );
  });

  it('computes speed and ETA labels accurately', () => {
    const res = formatSpeedAndEta(10 * 1024 * 1024, 50 * 1024 * 1024, 2500);
    expect(res.speedMbps).toBeCloseTo(4, 1);
    expect(res.speedLabel).toBe('4.0 MB/s');
    expect(res.etaSeconds).toBe(10);
    expect(res.etaLabel).toBe('~10s restantes');

    const longEta = formatSpeedAndEta(2 * 1024 * 1024, 182 * 1024 * 1024, 1000);
    expect(longEta.etaLabel).toBe('~1m 30s restantes');
  });

  it('classifies direct MP4 download candidates and excludes HLS playlists', () => {
    expect(isDirectMp4DownloadCandidate('https://www.mp4upload.com/embed-abc123.html')).toBe(true);
    expect(isDirectMp4DownloadCandidate('https://www.yourupload.com/embed/xyz789')).toBe(true);
    expect(isDirectMp4DownloadCandidate('https://archive.org/download/item/ep1.mp4')).toBe(true);
    expect(isDirectMp4DownloadCandidate('https://cdn.example.com/video.mp4?token=1')).toBe(true);
    expect(isDirectMp4DownloadCandidate('https://cdn.example.com/master.m3u8')).toBe(false);
    expect(isDirectMp4DownloadCandidate('https://ok.ru/videoembed/12345')).toBe(false);
  });

  it('computes segmented anime vs manga vs free storage breakdown', () => {
    const meter = computeStorageMeter({
      offlineBytes: 300 * 1024 * 1024,
      animeBytes: 240 * 1024 * 1024,
      mangaBytes: 60 * 1024 * 1024,
      usageBytes: 300 * 1024 * 1024,
      quotaBytes: 1000 * 1024 * 1024,
      animeFilesCount: 2,
      mangaChaptersCount: 5,
      watchLaterCount: 0
    });
    expect(meter.animePct).toBe(24);
    expect(meter.mangaPct).toBe(6);
    expect(meter.freeBytes).toBe(700 * 1024 * 1024);
    expect(formatBytesCompact(1.5 * 1024 * 1024 * 1024)).toBe('1.50 GB');
  });
});

describe('Phase 2.5 - 4MB Chunked Range Downloader, Pause/Resume, Cleanup & Export', () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = (globalThis as any).caches;
  const originalNavigator = globalThis.navigator;
  const originalCreateObjectURL = URL.createObjectURL;
  let cacheHarness: ReturnType<typeof createMemoryCacheHarness>;

  beforeEach(async () => {
    cacheHarness = createMemoryCacheHarness();
    (globalThis as any).caches = cacheHarness.storage;
    stubStorageEstimate(50 * 1024 * 1024, 5 * 1024 * 1024 * 1024);
    (URL as any).createObjectURL = vi.fn(() => 'blob:nyanime-phase25-test');
    await clearAllOfflineStorage();
  });

  afterEach(async () => {
    await clearAllOfflineStorage();
    revokeOfflineObjectUrls();
    globalThis.fetch = originalFetch;
    (globalThis as any).caches = originalCaches;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator
    });
    (URL as any).createObjectURL = originalCreateObjectURL;
    vi.restoreAllMocks();
  });

  it('downloads multi-chunk Range 206 stream, retries transient 502, assembles exact Blob, and reports speed/ETA', async () => {
    const chunkSize = 64 * 1024; // 64 KB chunks for fast deterministic test
    const totalSize = 160 * 1024; // 3 chunks: 64KB + 64KB + 32KB
    const masterPayload = new Uint8Array(totalSize);
    for (let i = 0; i < totalSize; i += 1) {
      masterPayload[i] = i % 251;
    }

    const receivedRanges: string[] = [];
    let chunk2Attempts = 0;

    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe('same-origin');
      const headers = (init?.headers || {}) as Record<string, string>;
      const rangeHeader = headers.Range || headers.range || '';
      receivedRanges.push(rangeHeader);

      const m = rangeHeader.match(/^bytes=(\d+)-(\d+)$/);
      expect(m).not.toBeNull();
      const start = Number(m![1]);
      const end = Math.min(totalSize - 1, Number(m![2]));

      // Simulate transient 502 on first attempt of chunk 2
      if (start === chunkSize && chunk2Attempts === 0) {
        chunk2Attempts += 1;
        return new Response('Bad Gateway', { status: 502 });
      }

      const slice = masterPayload.slice(start, end + 1);
      return new Response(slice, {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(slice.byteLength),
          'Content-Range': `bytes ${start}-${end}/${totalSize}`
        }
      });
    }) as any;

    const progressEvents: AnimeDownloadProgress[] = [];
    const manifest = await downloadAnimeEpisodeChunked({
      animeId: 151807,
      animeTitle: 'Solo Leveling',
      season: 1,
      episode: 1,
      quality: 'auto',
      audio: 'SUB',
      destination: 'app',
      chunkSizeBytes: chunkSize,
      retryBaseDelayMs: 50,
      directStreamUrl: '/api/video-proxy?url=https%3A%2F%2Fa4.mp4upload.com%2Fd%2Fvideo.mp4',
      fallbackWebUrl: 'https://www.mp4upload.com/embed-abc.html',
      onProgress: (_pct, _loaded, _total, detail) => {
        if (detail) progressEvents.push(detail);
      }
    });

    expect(DOWNLOAD_CHUNK_BYTES).toBe(4 * 1024 * 1024);
    expect(receivedRanges).toEqual([
      'bytes=0-65535',
      'bytes=65536-131071', // failed 502
      'bytes=65536-131071', // retried OK
      'bytes=131072-163839'
    ]);
    expect(manifest.kind).toBe('anime-video');
    expect(manifest.sizeBytes).toBe(totalSize);
    expect(manifest.lang).toBe('SUB');
    expect(progressEvents.length).toBeGreaterThanOrEqual(3);
    expect(progressEvents[progressEvents.length - 1].percent).toBe(100);
    expect(progressEvents[progressEvents.length - 1].speedLabel).toMatch(/(KB\/s|MB\/s)/);

    // Verify assembled bytes in CacheStorage match masterPayload byte-for-byte
    const cache = await caches.open(OFFLINE_ANIME_CACHE);
    const cachedResp = await cache.match(manifest.url!);
    expect(cachedResp).toBeDefined();
    const cachedBytes = new Uint8Array(await cachedResp!.arrayBuffer());
    expect(cachedBytes.byteLength).toBe(totalSize);
    expect(cachedBytes[0]).toBe(masterPayload[0]);
    expect(cachedBytes[chunkSize]).toBe(masterPayload[chunkSize]);
    expect(cachedBytes[totalSize - 1]).toBe(masterPayload[totalSize - 1]);

    // Verify getStorageSummary accounts animeBytes cleanly
    const summary = await getStorageSummary();
    expect(summary.animeFilesCount).toBe(1);
    expect(summary.animeBytes).toBe(totalSize);
  });

  it('supports pause and resume gate between chunks without aborting', async () => {
    const chunkSize = 64 * 1024;
    const totalSize = 128 * 1024;
    let paused = false;
    let resumeFn: (() => void) | null = null;
    let fetchCalls = 0;

    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls += 1;
      const rangeHeader = ((init?.headers || {}) as Record<string, string>).Range || '';
      const m = rangeHeader.match(/^bytes=(\d+)-(\d+)$/)!;
      const start = Number(m[1]);
      const end = Math.min(totalSize - 1, Number(m[2]));
      if (fetchCalls === 1) {
        paused = true;
      }
      const slice = new Uint8Array(end - start + 1).fill(7);
      return new Response(slice, {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(slice.byteLength),
          'Content-Range': `bytes ${start}-${end}/${totalSize}`
        }
      });
    }) as any;

    const dlPromise = downloadAnimeEpisodeChunked({
      animeId: 100,
      animeTitle: 'Black Clover',
      season: 1,
      episode: 1,
      quality: 'auto',
      destination: 'app',
      chunkSizeBytes: chunkSize,
      directStreamUrl: '/api/video-proxy?url=https%3A%2F%2Fa4.mp4upload.com%2Fd%2Fbc.mp4',
      fallbackWebUrl: 'https://www.mp4upload.com/embed-bc.html',
      waitIfPaused: async () => {
        if (!paused) return;
        await new Promise<void>((resolve) => {
          resumeFn = resolve;
        });
      }
    });

    // Wait briefly so chunk 1 finishes and downloader hits pause gate before chunk 2
    await new Promise((r) => setTimeout(r, 40));
    expect(fetchCalls).toBe(1);
    expect(resumeFn).not.toBeNull();

    paused = false;
    resumeFn!();

    const manifest = await dlPromise;
    expect(fetchCalls).toBe(2);
    expect(manifest.sizeBytes).toBe(totalSize);
  });

  it('aborts and cleans up partial artifacts atomically when cancelled mid-download', async () => {
    const chunkSize = 64 * 1024;
    const totalSize = 192 * 1024;
    const abortCtrl = new AbortController();

    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const rangeHeader = ((init?.headers || {}) as Record<string, string>).Range || '';
      const m = rangeHeader.match(/^bytes=(\d+)-(\d+)$/)!;
      const start = Number(m[1]);
      const end = Math.min(totalSize - 1, Number(m[2]));
      if (start > 0) {
        abortCtrl.abort();
        throw new DOMException('Aborted', 'AbortError');
      }
      const slice = new Uint8Array(end - start + 1).fill(1);
      return new Response(slice, {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(slice.byteLength),
          'Content-Range': `bytes ${start}-${end}/${totalSize}`
        }
      });
    }) as any;

    await expect(
      downloadAnimeEpisodeChunked({
        animeId: 200,
        animeTitle: 'Cancel Test',
        season: 1,
        episode: 3,
        quality: 'auto',
        destination: 'app',
        chunkSizeBytes: chunkSize,
        directStreamUrl: '/api/video-proxy?url=https%3A%2F%2Fa4.mp4upload.com%2Fd%2Fc.mp4',
        fallbackWebUrl: 'https://example.com',
        signal: abortCtrl.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(cacheHarness.keysIn(OFFLINE_ANIME_CACHE)).toEqual([]);
    expect(await getOfflineManifestById('anime_200_s1_e3')).toBeNull();
  });

  it('aborts cleanly if Content-Range total exceeds available quota after Chunk 0', async () => {
    // Allow preflight (120MB + 25MB reserve = 145MB) by giving 200MB free,
    // but Chunk 0 reports real file size = 350MB!
    stubStorageEstimate(100 * 1024 * 1024, 300 * 1024 * 1024);

    let fetchCount = 0;
    globalThis.fetch = vi.fn(async () => {
      fetchCount += 1;
      return new Response(new Uint8Array(64 * 1024), {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(64 * 1024),
          'Content-Range': `bytes 0-65535/${350 * 1024 * 1024}`
        }
      });
    }) as any;

    await expect(
      downloadAnimeEpisodeChunked({
        animeId: 201,
        animeTitle: 'Huge Episode',
        season: 1,
        episode: 1,
        quality: 'auto',
        destination: 'app',
        chunkSizeBytes: 64 * 1024,
        directStreamUrl: '/api/video-proxy?url=https%3A%2F%2Fa4.mp4upload.com%2Fd%2Fhuge.mp4',
        fallbackWebUrl: 'https://example.com'
      })
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });

    expect(fetchCount).toBe(1);
    expect(cacheHarness.keysIn(OFFLINE_ANIME_CACHE)).toEqual([]);
    expect(await getAllOfflineManifests()).toEqual([]);
  });

  it('NEVER silently degrades to watch-later when allowWatchLaterFallback is false', async () => {
    await expect(
      downloadAnimeEpisodeOrQueue({
        animeId: 300,
        animeTitle: 'Solo Leveling',
        season: 1,
        episode: 2,
        quality: 'auto',
        destination: 'app',
        directStreamUrl: null,
        fallbackWebUrl: 'https://www.mp4upload.com/embed-raw.html',
        allowWatchLaterFallback: false
      })
    ).rejects.toThrow(/Sin enlace \.MP4 directo/i);

    expect(await getAllOfflineManifests()).toEqual([]);
  });

  it('exports cached offline .MP4 from CacheStorage without calling fetch again', async () => {
    const chunkSize = 64 * 1024;
    const totalSize = 64 * 1024;
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array(totalSize).fill(9), {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(totalSize),
          'Content-Range': `bytes 0-65535/${totalSize}`
        }
      })
    );
    globalThis.fetch = fetchMock as any;

    const manifest = await downloadAnimeEpisodeChunked({
      animeId: 400,
      animeTitle: 'Solo Leveling',
      season: 1,
      episode: 1,
      quality: 'auto',
      audio: 'SUB',
      destination: 'app',
      chunkSizeBytes: chunkSize,
      directStreamUrl: '/api/video-proxy?url=https%3A%2F%2Fa4.mp4upload.com%2Fd%2Fsl.mp4',
      fallbackWebUrl: 'https://www.mp4upload.com/embed-sl.html'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const exported = await exportOfflineAnimeToDevice(manifest.id);
    expect(exported).toBe(true);
    // Crucial: export must read directly from CacheStorage and NOT invoke fetch again
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('enforces no external ad-embed opening in Gestor de Descargas (source guard)', () => {
    const appStateSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/appState.ts'), 'utf8');
    const openItemBlock = appStateSrc.slice(
      appStateSrc.indexOf('nWin.NyAnimeOffline.openItem = async'),
      appStateSrc.indexOf('nWin.NyAnimeOffline.exportMp4 = async')
    );
    expect(openItemBlock).not.toContain('handleOpenExternal');
    expect(openItemBlock).not.toContain('window.open');
    expect(openItemBlock).toContain('abrirReproductor');

    const animeDetailSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/animeDetailView.ts'), 'utf8');
    expect(animeDetailSrc).not.toContain('directStreamUrl: null');
    expect(animeDetailSrc).toContain('allowWatchLaterFallback: false');

    const playerSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/playerView.ts'), 'utf8');
    expect(playerSrc).not.toContain('Guardando enlace real en Ver Luego');
    expect(playerSrc).toContain('allowWatchLaterFallback: false');
  });
});
