import { escapeHTML, safeImageUrl } from '../utils/sanitize.ts';
import { buildVideoDownloadProxyUrl, sanitizeDownloadFilename } from '../utils/proxySecurity.ts';

export const OFFLINE_MANGA_CACHE = 'nyanime-offline-manga-v1';
export const OFFLINE_ANIME_CACHE = 'nyanime-offline-anime-v1';
const DB_NAME = 'NyAnimeOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'offline_items';

export interface OfflineMangaMeta {
  id: string;
  dexId?: string;
  title: string;
  cover?: string;
  banner?: string;
  author?: string;
  desc?: string;
  genres?: string[];
  status?: string;
  year?: string | number;
  flag?: string;
  origLang?: string;
  score?: string | number;
  preferredSource?: string;
  altTitles?: string[];
}

export interface OfflineChapterManifest {
  id: string;
  kind: 'manga' | 'anime-video' | 'watch-later';
  mediaId: string;
  title: string;
  cover?: string;
  coverCacheKey?: string;
  chapterNum?: number;
  chapterLabel?: string;
  chapterTitle?: string;
  lang?: string;
  group?: string;
  mangaMeta?: OfflineMangaMeta;
  episode?: number;
  season?: number;
  quality?: string;
  url?: string;
  pageKeys?: string[];
  pageCount?: number;
  sizeBytes: number;
  status: 'completed' | 'watch-later';
  note?: string;
  createdAt: number;
}

export interface OfflineMangaSeriesSummary {
  mediaId: string;
  title: string;
  cover: string;
  chaptersCount: number;
  totalBytes: number;
  latestAt: number;
  mangaMeta?: OfflineMangaMeta;
  chapters: OfflineChapterManifest[];
}

export interface MangaDownloadProgress {
  chapterIndex: number;
  totalChapters: number;
  chapterLabel: string;
  pageIndex: number;
  totalPages: number;
  bytesDownloaded: number;
}

export interface StorageSummary {
  usageBytes: number;
  quotaBytes: number;
  offlineBytes: number;
  mangaChaptersCount: number;
  animeFilesCount: number;
  watchLaterCount: number;
  storagePersisted: boolean;
}

export async function ensurePersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return false;
  }
  try {
    if (typeof navigator.storage.persisted === 'function') {
      const already = await navigator.storage.persisted();
      if (already) return true;
    }
    if (typeof navigator.storage.persist === 'function') {
      return Boolean(await navigator.storage.persist());
    }
  } catch {
    // Ignore storage persistence errors on unsupported browsers
  }
  return false;
}

function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible en este entorno.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_kind', 'kind', { unique: false });
        store.createIndex('by_media', 'mediaId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Error abriendo IndexedDB offline'));
  });
}

export async function putOfflineManifest(item: OfflineChapterManifest): Promise<void> {
  const db = await openOfflineDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Error guardando manifiesto offline'));
  });
  db.close();
}

export async function getAllOfflineManifests(): Promise<OfflineChapterManifest[]> {
  try {
    const db = await openOfflineDB();
    const items = await new Promise<OfflineChapterManifest[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as OfflineChapterManifest[]) || []);
      req.onerror = () => reject(req.error || new Error('Error leyendo IndexedDB offline'));
    });
    db.close();
    return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch {
    return [];
  }
}

export async function getOfflineManifestById(id: string): Promise<OfflineChapterManifest | null> {
  try {
    const db = await openOfflineDB();
    const found = await new Promise<OfflineChapterManifest | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve((req.result as OfflineChapterManifest) || null);
      req.onerror = () => reject(req.error || new Error('Error buscando manifiesto offline'));
    });
    db.close();
    return found;
  } catch {
    return null;
  }
}

export async function deleteOfflineManifestById(id: string): Promise<void> {
  const existing = await getOfflineManifestById(id);
  if (existing && typeof caches !== 'undefined') {
    const cacheName = existing.kind === 'anime-video' ? OFFLINE_ANIME_CACHE : OFFLINE_MANGA_CACHE;
    try {
      const cache = await caches.open(cacheName);
      if (Array.isArray(existing.pageKeys)) {
        await Promise.all(existing.pageKeys.map((k) => cache.delete(k)));
      }
      if (existing.kind === 'anime-video' && existing.url) {
        await cache.delete(existing.url);
      }
    } catch {
      // Ignore cache delete failure if cache unavailable
    }
  }
  const db = await openOfflineDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Error eliminando registro offline'));
  });
  db.close();
}

export function buildMangaChapterOfflineId(mangaId: string | number, chapterNum: number | string): string {
  const mClean = String(mangaId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const cClean = String(chapterNum).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `manga_${mClean}_cap_${cClean}`;
}

export function buildOfflinePageCacheKey(offlineId: string, pageIndex: number): string {
  return `https://nyanime.offline/cache/${encodeURIComponent(offlineId)}/page-${pageIndex}.bin`;
}

export function buildOfflineCoverCacheKey(mangaId: string | number): string {
  const mClean = String(mangaId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `https://nyanime.offline/cover/${encodeURIComponent(mClean)}.bin`;
}

export function normalizeMangaAliases(
  mangaIdOrAliases: string | number | Array<string | number | undefined | null>
): string[] {
  const rawList = Array.isArray(mangaIdOrAliases) ? mangaIdOrAliases : [mangaIdOrAliases];
  const seen = new Set<string>();
  for (const val of rawList) {
    if (val === undefined || val === null) continue;
    const str = String(val).trim();
    if (!str) continue;
    seen.add(str);
    seen.add(str.toLowerCase());
  }
  return Array.from(seen);
}

export function manifestMatchesMangaAliases(
  manifest: OfflineChapterManifest,
  aliases: string[]
): boolean {
  if (!manifest || manifest.kind !== 'manga' || aliases.length === 0) return false;
  const candidateIds = [
    manifest.mediaId,
    manifest.mangaMeta?.id,
    manifest.mangaMeta?.dexId
  ]
    .filter((v): v is string => Boolean(v && String(v).trim()))
    .flatMap((v) => [String(v).trim(), String(v).trim().toLowerCase()]);

  return candidateIds.some((cid) => aliases.includes(cid));
}

function resolveFetchUrl(rawUrl: string): string {
  if (
    rawUrl.startsWith('/api/img-proxy') ||
    rawUrl.startsWith('data:') ||
    rawUrl.startsWith('blob:')
  ) {
    return rawUrl;
  }
  return `/api/img-proxy?url=${encodeURIComponent(rawUrl)}`;
}

function buildPageCandidateUrls(primaryUrl: string, fallbackUrl?: string): string[] {
  const candidates: string[] = [];
  const pushUnique = (u?: string) => {
    if (!u || typeof u !== 'string') return;
    const trimmed = u.trim();
    if (!trimmed) return;
    if (!candidates.includes(trimmed)) candidates.push(trimmed);
  };
  pushUnique(primaryUrl);

  // ManhwaWeb mirror failover
  if (primaryUrl.includes('img1mw.xyz')) {
    pushUnique(primaryUrl.replace('img1mw.xyz', 'img2mw.xyz'));
  } else if (primaryUrl.includes('img2mw.xyz')) {
    pushUnique(primaryUrl.replace('img2mw.xyz', 'img1mw.xyz'));
  }

  // InManga / IntoManga CDN mirror failover
  if (primaryUrl.includes('identification=') || primaryUrl.includes('intomanga.com') || primaryUrl.includes('inmanga.com')) {
    const idMatch = primaryUrl.match(/identification=([^&]+)/) || primaryUrl.match(/\/o\/([^./]+)\.(?:jpg|jpeg|png|webp)/i);
    const inId = idMatch ? idMatch[1] : '';
    if (inId) {
      pushUnique(`https://pack.intomanga.com/i/m/cdn/c/cdn/o/${inId}.jpg`);
      pushUnique(`https://cdn1.intomanga.com/i/m/cdn/c/cdn/o/${inId}.jpg`);
      pushUnique(`https://cdn2.intomanga.com/i/m/cdn/c/cdn/o/${inId}.jpg`);
      pushUnique(`https://inmanga.com/page/getPageImage/?identification=${inId}`);
    }
  }

  // MangaDex fallback to saver URL then master uploads origin
  pushUnique(fallbackUrl);
  const mdPathMatch = primaryUrl.match(/\/(data|data-saver)\/([^\/]+)\/([^?]+)/);
  if (mdPathMatch && (primaryUrl.includes('mangadex') || primaryUrl.includes('cmd.') || primaryUrl.includes('.network/'))) {
    pushUnique(`https://uploads.mangadex.org/${mdPathMatch[1]}/${mdPathMatch[2]}/${mdPathMatch[3]}`);
  }
  if (fallbackUrl) {
    const fbMatch = fallbackUrl.match(/\/(data|data-saver)\/([^\/]+)\/([^?]+)/);
    if (fbMatch) {
      pushUnique(`https://uploads.mangadex.org/${fbMatch[1]}/${fbMatch[2]}/${fbMatch[3]}`);
    }
  }

  return candidates;
}

const activeObjectUrls: string[] = [];

export function revokeOfflineObjectUrls(): void {
  while (activeObjectUrls.length > 0) {
    const u = activeObjectUrls.pop();
    if (u) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        // Ignore
      }
    }
  }
}

async function cacheMangaCoverBestEffort(
  cache: Cache,
  mangaId: string | number,
  cover?: string
): Promise<string | undefined> {
  if (!cover || cover.startsWith('data:') || cover.startsWith('blob:')) return undefined;
  const coverKey = buildOfflineCoverCacheKey(mangaId);
  try {
    const existing = await cache.match(coverKey);
    if (existing) return coverKey;
    const resp = await fetch(resolveFetchUrl(cover));
    if (!resp.ok) return undefined;
    const blob = await resp.blob();
    if (blob.size < 100) return undefined;
    await cache.put(
      coverKey,
      new Response(blob, {
        status: 200,
        headers: {
          'Content-Type': blob.type || 'image/jpeg',
          'X-Offline-Cover': String(mangaId)
        }
      })
    );
    return coverKey;
  } catch {
    return undefined;
  }
}

export async function getCachedCoverBlobUrl(coverCacheKey?: string): Promise<string | null> {
  if (!coverCacheKey || typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(OFFLINE_MANGA_CACHE);
    const match = await cache.match(coverCacheKey);
    if (!match) return null;
    const blob = await match.blob();
    const objUrl = URL.createObjectURL(blob);
    activeObjectUrls.push(objUrl);
    return objUrl;
  } catch {
    return null;
  }
}

export async function downloadMangaChapterOffline(params: {
  mangaId: string | number;
  mangaTitle: string;
  cover?: string;
  chapterNum: number;
  chapterLabel: string;
  chapterTitle?: string;
  lang?: string;
  group?: string;
  mangaMeta?: OfflineMangaMeta;
  pageUrls: string[];
  fallbackPageUrls?: string[];
  chapterIndex?: number;
  totalChapters?: number;
  onProgress?: (p: MangaDownloadProgress) => void;
  signal?: AbortSignal;
}): Promise<OfflineChapterManifest> {
  if (typeof caches === 'undefined') {
    throw new Error('CacheStorage no disponible en este navegador.');
  }
  const {
    mangaId,
    mangaTitle,
    cover,
    chapterNum,
    chapterLabel,
    chapterTitle,
    lang,
    group,
    mangaMeta,
    pageUrls,
    fallbackPageUrls = [],
    chapterIndex = 0,
    totalChapters = 1,
    onProgress,
    signal
  } = params;

  if (!Array.isArray(pageUrls) || pageUrls.length === 0) {
    throw new Error(`El capítulo ${chapterLabel} no devolvió páginas descargables.`);
  }

  await ensurePersistentStorage();

  const offlineId = buildMangaChapterOfflineId(mangaId, chapterNum);
  const cache = await caches.open(OFFLINE_MANGA_CACHE);
  const pageKeys: string[] = new Array(pageUrls.length);
  let totalBytes = 0;
  let completedPages = 0;

  const fetchSinglePage = async (index: number): Promise<void> => {
    if (signal?.aborted) {
      throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
    }

    const candidates = buildPageCandidateUrls(pageUrls[index], fallbackPageUrls[index]);
    let downloadedBlob: Blob | null = null;
    let lastStatus = 0;

    for (const candidate of candidates) {
      if (signal?.aborted) {
        throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
      }
      try {
        const proxyUrl = resolveFetchUrl(candidate);
        const reqCtrl = new AbortController();
        const timeoutId = setTimeout(() => reqCtrl.abort(), 10000);
        const onUserAbort = () => reqCtrl.abort();
        signal?.addEventListener('abort', onUserAbort, { once: true });
        let resp: Response;
        try {
          resp = await fetch(proxyUrl, { signal: reqCtrl.signal });
        } finally {
          clearTimeout(timeoutId);
          signal?.removeEventListener('abort', onUserAbort);
        }
        lastStatus = resp.status;
        if (!resp.ok) continue;
        const blob = await resp.blob();
        if (blob.size < 100) continue;
        downloadedBlob = blob;
        break;
      } catch (err: any) {
        if (signal?.aborted) {
          throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
        }
      }
    }

    if (!downloadedBlob) {
      throw new Error(`Fallo al descargar página ${index + 1}${lastStatus ? ` (${lastStatus})` : ''}`);
    }

    totalBytes += downloadedBlob.size;
    const cacheKey = buildOfflinePageCacheKey(offlineId, index);
    const cachedResp = new Response(downloadedBlob, {
      status: 200,
      headers: {
        'Content-Type': downloadedBlob.type || 'image/jpeg',
        'X-Offline-Manga': offlineId
      }
    });
    await cache.put(cacheKey, cachedResp);
    pageKeys[index] = cacheKey;
    completedPages += 1;

    onProgress?.({
      chapterIndex,
      totalChapters,
      chapterLabel,
      pageIndex: completedPages,
      totalPages: pageUrls.length,
      bytesDownloaded: totalBytes
    });
  };

  try {
    const concurrency = Math.min(3, pageUrls.length);
    let nextIdx = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (nextIdx < pageUrls.length) {
        const myIdx = nextIdx;
        nextIdx += 1;
        await fetchSinglePage(myIdx);
      }
    });
    await Promise.all(workers);
  } catch (err) {
    // Limpiar descargas parciales de este capítulo cancelado o fallido
    await Promise.all(
      pageKeys.filter(Boolean).map((k) => cache.delete(k).catch(() => false))
    );
    throw err;
  }

  const coverCacheKey = await cacheMangaCoverBestEffort(cache, mangaId, cover || mangaMeta?.cover);

  const manifest: OfflineChapterManifest = {
    id: offlineId,
    kind: 'manga',
    mediaId: String(mangaId),
    title: mangaTitle,
    cover: cover || mangaMeta?.cover,
    coverCacheKey,
    chapterNum,
    chapterLabel,
    chapterTitle: chapterTitle || `Capítulo ${chapterLabel}`,
    lang: lang || 'es',
    group: group || 'Offline 💾',
    mangaMeta,
    pageKeys,
    pageCount: pageKeys.length,
    sizeBytes: totalBytes,
    status: 'completed',
    createdAt: Date.now()
  };

  await putOfflineManifest(manifest);
  return manifest;
}

export async function getOfflineMangaChapterPages(
  mangaId: string | number,
  chapterNum: number | string
): Promise<string[] | null> {
  const res = await getOfflineMangaChapterPagesByAliases([mangaId], chapterNum);
  return res ? res.pages : null;
}

export async function getOfflineMangaChapterPagesByAliases(
  mangaIdOrAliases: string | number | Array<string | number | undefined | null>,
  chapterNum: number | string
): Promise<{ pages: string[]; manifest: OfflineChapterManifest } | null> {
  if (typeof caches === 'undefined') return null;
  const aliases = normalizeMangaAliases(mangaIdOrAliases);
  if (aliases.length === 0) return null;

  let manifest: OfflineChapterManifest | null = null;
  for (const alias of aliases) {
    const candidate = await getOfflineManifestById(buildMangaChapterOfflineId(alias, chapterNum));
    if (candidate && candidate.kind === 'manga' && candidate.pageKeys?.length) {
      manifest = candidate;
      break;
    }
  }

  if (!manifest) {
    const all = await getAllOfflineManifests();
    const targetNum = Number(chapterNum);
    manifest =
      all.find(
        (m) =>
          manifestMatchesMangaAliases(m, aliases) &&
          m.status === 'completed' &&
          Boolean(m.pageKeys?.length) &&
          (Math.abs(Number(m.chapterNum ?? -1) - targetNum) < 0.001 ||
            String(m.chapterLabel || '').trim() === String(chapterNum).trim())
      ) || null;
  }

  if (!manifest || manifest.kind !== 'manga' || !manifest.pageKeys?.length) {
    return null;
  }

  const cache = await caches.open(OFFLINE_MANGA_CACHE);
  const blobUrls: string[] = [];
  for (const key of manifest.pageKeys) {
    const match = await cache.match(key);
    if (!match) {
      return null;
    }
    const blob = await match.blob();
    const objUrl = URL.createObjectURL(blob);
    activeObjectUrls.push(objUrl);
    blobUrls.push(objUrl);
  }
  return { pages: blobUrls, manifest };
}

export async function getOfflineMangaChaptersForSeries(
  mangaIdOrAliases: string | number | Array<string | number | undefined | null>
): Promise<OfflineChapterManifest[]> {
  const aliases = normalizeMangaAliases(mangaIdOrAliases);
  if (aliases.length === 0) return [];
  const all = await getAllOfflineManifests();
  return all
    .filter((m) => m.status === 'completed' && manifestMatchesMangaAliases(m, aliases))
    .sort((a, b) => Number(a.chapterNum ?? 0) - Number(b.chapterNum ?? 0));
}

export async function getOfflineMangaLibrary(): Promise<OfflineMangaSeriesSummary[]> {
  const all = await getAllOfflineManifests();
  const mangaItems = all.filter((m) => m.kind === 'manga' && m.status === 'completed');
  const groups = new Map<string, OfflineMangaSeriesSummary>();

  for (const item of mangaItems) {
    const groupKey = String(item.mangaMeta?.id || item.mediaId).trim();
    let entry = groups.get(groupKey);
    if (!entry) {
      let resolvedCover = item.cover || item.mangaMeta?.cover || '';
      if (item.coverCacheKey) {
        const cachedCover = await getCachedCoverBlobUrl(item.coverCacheKey);
        if (cachedCover) resolvedCover = cachedCover;
      }
      entry = {
        mediaId: groupKey,
        title: item.mangaMeta?.title || item.title,
        cover: resolvedCover,
        chaptersCount: 0,
        totalBytes: 0,
        latestAt: 0,
        mangaMeta: item.mangaMeta,
        chapters: []
      };
      groups.set(groupKey, entry);
    }
    entry.chapters.push(item);
    entry.chaptersCount += 1;
    entry.totalBytes += Number(item.sizeBytes || 0);
    if ((item.createdAt || 0) > entry.latestAt) {
      entry.latestAt = item.createdAt || 0;
    }
    if (!entry.mangaMeta && item.mangaMeta) {
      entry.mangaMeta = item.mangaMeta;
    }
  }

  return Array.from(groups.values())
    .map((entry) => {
      entry.chapters.sort((a, b) => Number(a.chapterNum ?? 0) - Number(b.chapterNum ?? 0));
      return entry;
    })
    .sort((a, b) => b.latestAt - a.latestAt);
}

export async function deleteOfflineMangaSeries(
  mangaIdOrAliases: string | number | Array<string | number | undefined | null>
): Promise<number> {
  const chapters = await getOfflineMangaChaptersForSeries(mangaIdOrAliases);
  for (const cap of chapters) {
    await deleteOfflineManifestById(cap.id);
  }
  return chapters.length;
}

export function buildOfflineChapterBucketsFromManifests(manifests: OfflineChapterManifest[]): {
  spanish: any[];
  english: any[];
  japanese: any[];
  korean: any[];
  all: any[];
} {
  const toCapObj = (m: OfflineChapterManifest) => ({
    id: m.id,
    chapter: String(m.chapterLabel || m.chapterNum || 1),
    chapterNum: Number(m.chapterNum ?? 1),
    title: m.chapterTitle || `Capítulo ${m.chapterLabel || m.chapterNum || 1}`,
    pages: m.pageCount || 0,
    group: 'Offline 💾',
    lang: (m.lang || 'es').toLowerCase(),
    source: 'Offline',
    isOfflineCached: true,
    offlineSizeBytes: m.sizeBytes || 0
  });

  const all = manifests
    .map(toCapObj)
    .sort((a, b) => Number(a.chapterNum) - Number(b.chapterNum));

  return {
    spanish: all.filter((c) => c.lang === 'es' || c.lang === 'es-la' || c.lang === 'es-es'),
    english: all.filter((c) => c.lang.startsWith('en')),
    japanese: all.filter((c) => c.lang === 'ja' || c.lang === 'jp'),
    korean: all.filter((c) => c.lang === 'ko' || c.lang === 'kr'),
    all
  };
}

export async function isMangaChapterDownloaded(
  mangaId: string | number,
  chapterNum: number | string
): Promise<boolean> {
  const m = await getOfflineManifestById(buildMangaChapterOfflineId(mangaId, chapterNum));
  if (m && m.status === 'completed') return true;
  const chapters = await getOfflineMangaChaptersForSeries([mangaId]);
  const targetNum = Number(chapterNum);
  return chapters.some(
    (c) =>
      Math.abs(Number(c.chapterNum ?? -1) - targetNum) < 0.001 ||
      String(c.chapterLabel || '').trim() === String(chapterNum).trim()
  );
}

export async function downloadAnimeEpisodeOrQueue(params: {
  animeId: string | number;
  animeTitle: string;
  cover?: string;
  season: number;
  episode: number;
  quality: string;
  directStreamUrl?: string | null;
  fallbackWebUrl: string;
  saveToDeviceFilename?: string;
  onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
}): Promise<OfflineChapterManifest> {
  const id = `anime_${params.animeId}_s${params.season}_e${params.episode}`;
  const directStr = String(params.directStreamUrl || '');
  const isDirectVideo =
    Boolean(directStr) &&
    (directStr.startsWith('/api/video-proxy?') || /\.(mp4|webm|mkv)(\?|$)/i.test(directStr));

  if (isDirectVideo && params.directStreamUrl && typeof caches !== 'undefined') {
    await ensurePersistentStorage();
    const resp = await fetch(params.directStreamUrl, { signal: params.signal });
    if (!resp.ok) {
      throw new Error(`No se pudo descargar el video (${resp.status})`);
    }
    const respCt = (resp.headers.get('content-type') || '').toLowerCase();
    if (respCt.includes('text/html') || respCt.includes('application/xhtml')) {
      throw new Error('El servidor devolvió una página HTML en lugar del flujo de video .MP4');
    }

    const total = Number(resp.headers.get('content-length') || '0');
    const reader = resp.body?.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.byteLength;
          const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 50;
          params.onProgress?.(pct, loaded, total);
        }
      }
    }

    const blob = new Blob(chunks as BlobPart[], { type: respCt.includes('video/') ? respCt : 'video/mp4' });
    if (blob.size === 0 || (total > 65536 && blob.size < 32768)) {
      throw new Error('El flujo de video descargado está incompleto o vacío');
    }

    const cacheKey = `https://nyanime.offline/anime/${encodeURIComponent(id)}.mp4`;
    const cache = await caches.open(OFFLINE_ANIME_CACHE);
    await cache.put(
      cacheKey,
      new Response(blob, {
        status: 200,
        headers: { 'Content-Type': blob.type }
      })
    );

    if (params.saveToDeviceFilename) {
      const objUrl = URL.createObjectURL(blob);
      activeObjectUrls.push(objUrl);
      triggerBrowserFileDownload(objUrl, params.saveToDeviceFilename);
    }

    const manifest: OfflineChapterManifest = {
      id,
      kind: 'anime-video',
      mediaId: String(params.animeId),
      title: params.animeTitle,
      cover: params.cover,
      season: params.season,
      episode: params.episode,
      quality: params.quality,
      url: cacheKey,
      sizeBytes: blob.size,
      status: 'completed',
      createdAt: Date.now()
    };
    await putOfflineManifest(manifest);
    return manifest;
  }

  // Honest watch-later saving when provider only offers third-party embed iframe
  const manifest: OfflineChapterManifest = {
    id,
    kind: 'watch-later',
    mediaId: String(params.animeId),
    title: params.animeTitle,
    cover: params.cover,
    season: params.season,
    episode: params.episode,
    quality: params.quality,
    url: params.fallbackWebUrl,
    sizeBytes: 0,
    status: 'watch-later',
    note: 'El servidor usa un reproductor iframe externo no descargable. Guardado en Ver Luego.',
    createdAt: Date.now()
  };
  await putOfflineManifest(manifest);
  return manifest;
}

export async function getOfflineAnimeVideoBlobUrl(offlineId: string): Promise<string | null> {
  if (typeof caches === 'undefined') return null;
  const manifest = await getOfflineManifestById(offlineId);
  if (!manifest || manifest.kind !== 'anime-video' || !manifest.url) return null;
  try {
    const cache = await caches.open(OFFLINE_ANIME_CACHE);
    const match = await cache.match(manifest.url);
    if (!match) return null;
    const blob = await match.blob();
    const objUrl = URL.createObjectURL(blob);
    activeObjectUrls.push(objUrl);
    return objUrl;
  } catch {
    return null;
  }
}

export function triggerBrowserFileDownload(streamOrProxyUrl: string, rawFilename: string): string {
  const safeFile = sanitizeDownloadFilename(rawFilename);
  const href = streamOrProxyUrl.startsWith('blob:')
    ? streamOrProxyUrl
    : buildVideoDownloadProxyUrl(streamOrProxyUrl, safeFile);
  if (typeof document !== 'undefined' && href) {
    const a = document.createElement('a');
    a.href = href;
    a.download = safeFile;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        a.remove();
      } catch {
        // ignore
      }
    }, 1000);
  }
  return safeFile;
}

export async function exportOfflineAnimeToDevice(offlineId: string): Promise<boolean> {
  const manifest = await getOfflineManifestById(offlineId);
  if (!manifest) return false;
  const baseName = `${manifest.title}_T${manifest.season || 1}_Ep_${manifest.episode || 1}.mp4`;
  if (manifest.kind === 'anime-video') {
    const blobUrl = await getOfflineAnimeVideoBlobUrl(offlineId);
    if (!blobUrl) return false;
    triggerBrowserFileDownload(blobUrl, baseName);
    return true;
  }
  return false;
}

export async function getStorageSummary(): Promise<StorageSummary> {
  const items = await getAllOfflineManifests();
  let offlineBytes = 0;
  let mangaChaptersCount = 0;
  let animeFilesCount = 0;
  let watchLaterCount = 0;

  for (const item of items) {
    offlineBytes += Number(item.sizeBytes || 0);
    if (item.kind === 'manga') mangaChaptersCount += 1;
    else if (item.kind === 'anime-video') animeFilesCount += 1;
    else watchLaterCount += 1;
  }

  let usageBytes = offlineBytes;
  let quotaBytes = 0;
  let storagePersisted = false;
  if (typeof navigator !== 'undefined' && navigator.storage) {
    if (navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        usageBytes = Number(est.usage || offlineBytes);
        quotaBytes = Number(est.quota || 0);
      } catch {
        // Ignore storage estimate unavailability
      }
    }
    if (navigator.storage.persisted) {
      try {
        storagePersisted = Boolean(await navigator.storage.persisted());
      } catch {
        // Ignore
      }
    }
  }

  return {
    usageBytes,
    quotaBytes,
    offlineBytes,
    mangaChaptersCount,
    animeFilesCount,
    watchLaterCount,
    storagePersisted
  };
}

export function formatBytesHuman(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export async function renderOfflineDownloadsModal(
  containerEl: HTMLElement | null,
  storageInfoEl?: HTMLElement | null
): Promise<void> {
  if (!containerEl) return;
  await ensurePersistentStorage();
  const [items, summary] = await Promise.all([getAllOfflineManifests(), getStorageSummary()]);

  if (storageInfoEl) {
    const quotaPart = summary.quotaBytes > 0 ? ` / ${formatBytesHuman(summary.quotaBytes)} disponibles` : '';
    const statusBadge = summary.storagePersisted
      ? '<span class="storage-status-pill protected">Protegido contra limpieza automática ✓</span>'
      : '<span class="storage-status-pill standard">Estándar</span>';
    storageInfoEl.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
        <span style="font-weight:700; color:#fff;">Estado del dispositivo:</span>
        ${statusBadge}
      </div>
      <div>💾 Offline: ${formatBytesHuman(summary.offlineBytes)} (${summary.mangaChaptersCount} caps manga, ${summary.animeFilesCount} vídeos, ${summary.watchLaterCount} ver luego) · Uso navegador: ${formatBytesHuman(summary.usageBytes)}${quotaPart}</div>
    `;
  }

  if (items.length === 0) {
    containerEl.innerHTML =
      '<div style="text-align:center; color:var(--text-muted); font-size:12px; padding:20px;">No hay capítulos offline ni episodios guardados aún.</div>';
    return;
  }

  containerEl.innerHTML = items
    .map((item) => {
      const safeId = escapeHTML(item.id);
      const safeTitle = escapeHTML(item.title);
      const isManga = item.kind === 'manga';
      const isWatchLater = item.kind === 'watch-later';
      const sub = isManga
        ? `Cap. ${escapeHTML(item.chapterLabel || item.chapterNum)} · ${item.pageCount || 0} págs · ${formatBytesHuman(item.sizeBytes)} (Offline ✓)`
        : isWatchLater
          ? `T${item.season || 1} Ep.${item.episode || 1} · Guardado para ver luego (enlace externo)`
          : `T${item.season || 1} Ep.${item.episode || 1} · ${escapeHTML(item.quality || 'HD')} · ${formatBytesHuman(item.sizeBytes)} (Offline ✓)`;

      const coverThumb = safeImageUrl(item.cover);
      return `
        <div class="download-ep-row" data-offline-id="${safeId}" style="gap:10px;">
          <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
            ${coverThumb ? `<img src="${escapeHTML(coverThumb)}" alt="" style="width:36px; height:50px; object-fit:cover; border-radius:6px; flex-shrink:0;">` : ''}
            <div style="min-width:0;">
              <div style="font-weight:700; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeTitle}</div>
              <div style="font-size:11px; color:${isWatchLater ? '#f59e0b' : '#34d399'};">${sub}</div>
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            ${
              isManga
                ? `<button type="button" class="chip active" style="padding:5px 10px; font-size:11px;" onclick="window.NyAnimeOffline.openItem('${safeId}')">Leer</button>`
                : item.kind === 'anime-video'
                  ? `<button type="button" class="chip active" style="padding:5px 10px; font-size:11px;" onclick="window.NyAnimeOffline.openItem('${safeId}')">▶ Ver Offline</button>
                     <button type="button" class="chip" style="padding:5px 10px; font-size:11px; border-color:rgba(52,211,153,0.4); color:#34d399;" onclick="window.NyAnimeOffline.exportMp4('${safeId}')" title="Guardar archivo .MP4 en tu dispositivo">📥 .MP4</button>`
                  : item.url
                    ? `<button type="button" class="chip" style="padding:5px 10px; font-size:11px;" onclick="window.NyAnimeOffline.openItem('${safeId}')">Abrir</button>`
                    : ''
            }
            <button type="button" class="chip" style="padding:5px 9px; font-size:11px; border-color:rgba(255,26,64,0.35); color:#ff4d6d;" onclick="window.NyAnimeOffline.deleteItem('${safeId}')" title="Eliminar de dispositivo">🗑️</button>
          </div>
        </div>
      `;
    })
    .join('');
}

export async function clearAllOfflineStorage(): Promise<void> {
  const items = await getAllOfflineManifests();
  for (const item of items) {
    await deleteOfflineManifestById(item.id);
  }
  if (typeof caches !== 'undefined') {
    await caches.delete(OFFLINE_MANGA_CACHE).catch(() => false);
    await caches.delete(OFFLINE_ANIME_CACHE).catch(() => false);
  }
}
