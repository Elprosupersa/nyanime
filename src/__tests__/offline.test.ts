import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAllOfflineStorage,
  deleteOfflineManifestById,
  downloadAnimeEpisodeOrQueue,
  downloadMangaChapterOffline,
  getAllOfflineManifests,
  getOfflineAnimeVideoBlobUrl,
  getOfflineMangaChapterPages,
  getStorageSummary,
  isMangaChapterDownloaded,
  revokeOfflineObjectUrls
} from '../services/offline.ts';

function createMemoryCacheStorage() {
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
  };
}

describe('offline service - CacheStorage & IndexedDB', () => {
  beforeEach(async () => {
    vi.stubGlobal('caches', createMemoryCacheStorage());
    let seq = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:nyanime-test-${++seq}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await clearAllOfflineStorage();
  });

  afterEach(() => {
    revokeOfflineObjectUrls();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('downloads manga chapter pages into CacheStorage + IndexedDB and reads them back offline', async () => {
    const fakePageBytes = new Uint8Array(512).fill(7);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(fakePageBytes, { status: 200, headers: { 'Content-Type': 'image/jpeg' } }))
    );

    const progressUpdates: number[] = [];
    const manifest = await downloadMangaChapterOffline({
      mangaId: 'solo-leveling-id',
      mangaTitle: 'Solo Leveling',
      cover: 'https://uploads.mangadex.org/covers/sl.jpg',
      chapterNum: 1,
      chapterLabel: '1',
      pageUrls: ['https://cmd.mangadex.network/data/1.jpg', 'https://cmd.mangadex.network/data/2.jpg'],
      onProgress: (p) => progressUpdates.push(p.pageIndex)
    });

    expect(manifest.kind).toBe('manga');
    expect(manifest.pageCount).toBe(2);
    expect(manifest.sizeBytes).toBe(1024);
    expect(progressUpdates).toEqual([1, 2]);

    expect(await isMangaChapterDownloaded('solo-leveling-id', 1)).toBe(true);

    const offlineUrls = await getOfflineMangaChapterPages('solo-leveling-id', 1);
    expect(offlineUrls).toEqual(['blob:nyanime-test-1', 'blob:nyanime-test-2']);

    const summary = await getStorageSummary();
    expect(summary.mangaChaptersCount).toBe(1);
    expect(summary.offlineBytes).toBe(1024);

    await deleteOfflineManifestById(manifest.id);
    expect(await isMangaChapterDownloaded('solo-leveling-id', 1)).toBe(false);
    expect(await getAllOfflineManifests()).toEqual([]);
  });

  it('rolls back partial page cache and aborts cleanly when cancelled mid-download', async () => {
    const ac = new AbortController();
    const fakePageBytes = new Uint8Array(256).fill(1);
    let call = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          ac.abort();
        }
        return new Response(fakePageBytes, { status: 200, headers: { 'Content-Type': 'image/png' } });
      })
    );

    await expect(
      downloadMangaChapterOffline({
        mangaId: 'abort-test',
        mangaTitle: 'Abort Test',
        chapterNum: 5,
        chapterLabel: '5',
        pageUrls: ['https://cmd.mangadex.network/1.png', 'https://cmd.mangadex.network/2.png'],
        signal: ac.signal
      })
    ).rejects.toThrow(/cancelada/i);

    expect(await isMangaChapterDownloaded('abort-test', 5)).toBe(false);
  });

  it('queues iframe-only anime episodes honestly as watch-later instead of faking a binary video', async () => {
    const manifest = await downloadAnimeEpisodeOrQueue({
      animeId: 21,
      animeTitle: 'One Piece',
      season: 1,
      episode: 1100,
      quality: '1080p',
      directStreamUrl: 'https://jkanime.net/one-piece/1100/',
      fallbackWebUrl: 'https://jkanime.net/one-piece/1100/'
    });

    expect(manifest.kind).toBe('watch-later');
    expect(manifest.status).toBe('watch-later');
    expect(manifest.sizeBytes).toBe(0);

    const summary = await getStorageSummary();
    expect(summary.watchLaterCount).toBe(1);
    expect(summary.animeFilesCount).toBe(0);
  });

  it('caches binary .MP4 anime streams via /api/video-proxy and returns a playable Blob URL offline', async () => {
    const fakeMp4Bytes = new Uint8Array(2048).fill(42);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(fakeMp4Bytes, { status: 200, headers: { 'Content-Type': 'video/mp4' } }))
    );

    const manifest = await downloadAnimeEpisodeOrQueue({
      animeId: 16498,
      animeTitle: 'Attack on Titan',
      season: 1,
      episode: 1,
      quality: '1080p',
      directStreamUrl: '/api/video-proxy?url=https%3A%2F%2Fa4.mp4upload.com%3A183%2Fd%2Fabc%2Fvideo.mp4',
      fallbackWebUrl: 'https://www.mp4upload.com/embed-abc.html'
    });

    expect(manifest.kind).toBe('anime-video');
    expect(manifest.status).toBe('completed');
    expect(manifest.sizeBytes).toBe(2048);

    const blobUrl = await getOfflineAnimeVideoBlobUrl(manifest.id);
    expect(blobUrl).toBe('blob:nyanime-test-1');

    const summary = await getStorageSummary();
    expect(summary.animeFilesCount).toBe(1);
    expect(summary.offlineBytes).toBe(2048);
  });

  it('rejects upstream HTML error pages (e.g. 10.1 KB CDN rate-limit responses) instead of saving corrupt .MP4 files', async () => {
    const fakeHtmlError = new TextEncoder().encode('<!DOCTYPE html><html><body>Rate limited</body></html>');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(fakeHtmlError, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    );

    await expect(
      downloadAnimeEpisodeOrQueue({
        animeId: 170942,
        animeTitle: 'Blue Box (T1)',
        season: 1,
        episode: 8,
        quality: '1080p',
        directStreamUrl: '/api/video-proxy?url=https%3A%2F%2Fa4.mp4upload.com%3A183%2Fd%2Fabc%2Fvideo.mp4',
        fallbackWebUrl: 'https://www.mp4upload.com/embed-abc.html'
      })
    ).rejects.toThrow(/página HTML en lugar del flujo de video/i);

    const summary = await getStorageSummary();
    expect(summary.animeFilesCount).toBe(0);
  });
});



