import { escapeHTML, safeImageUrl } from '../utils/sanitize.ts';
import { buildVideoDownloadProxyUrl, sanitizeDownloadFilename } from '../utils/proxySecurity.ts';
import {
  DOWNLOAD_CHUNK_BYTES,
  computeStorageMeter,
  estimateAnimeBatchBytes,
  estimateMangaBatchBytes,
  evaluateStorageQuota,
  formatAnimeEpisodeFilename,
  formatBytesCompact,
  formatSpeedAndEta,
  groupOfflineManifests,
  isQuotaExceededError,
  parseContentRangeHeader,
  type ActiveDownloadBatchSnapshot,
  type DownloadDestination,
  type DownloadManagerFilterTab,
  type StorageQuotaAssessment
} from '../utils/downloadHelpers.ts';

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

export interface AnimeDownloadProgress {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  speedMbps: number;
  speedLabel: string;
  etaSeconds: number | null;
  etaLabel: string;
  chunkIndex: number;
  totalChunks: number;
}

export interface StorageSummary {
  usageBytes: number;
  quotaBytes: number;
  offlineBytes: number;
  animeBytes: number;
  mangaBytes: number;
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

export async function checkStorageSpaceForDownload(
  requiredBytes: number,
  estimateProvider?: () => Promise<{ usage?: number; quota?: number }>
): Promise<StorageQuotaAssessment> {
  try {
    const estimator =
      estimateProvider ||
      (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function'
        ? () => navigator.storage.estimate()
        : null);

    if (!estimator) {
      return evaluateStorageQuota({ requiredBytes, supported: false });
    }

    const est = await estimator();
    return evaluateStorageQuota({
      usageBytes: Number(est?.usage || 0),
      quotaBytes: Number(est?.quota || 0),
      requiredBytes,
      supported: Number(est?.quota || 0) > 0
    });
  } catch {
    return evaluateStorageQuota({ requiredBytes, supported: false });
  }
}

async function deleteOfflineRecordOnly(id: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Error eliminando registro offline'));
    });
    db.close();
  } catch {
    // Ignore secondary cleanup error if IndexedDB is unavailable
  }
}

async function cleanupOfflineDownloadArtifacts(params: {
  id: string;
  cacheName: string;
  cacheKeys: Iterable<string>;
}): Promise<void> {
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(params.cacheName);
      const uniqueKeys = Array.from(new Set(Array.from(params.cacheKeys).filter(Boolean)));
      await Promise.all(uniqueKeys.map((k) => cache.delete(k).catch(() => false)));
    } catch {
      // Ignore secondary cache cleanup error
    }
  }
  await deleteOfflineRecordOnly(params.id);
}

function buildQuotaExceededError(message: string): DOMException {
  return new DOMException(message, 'QuotaExceededError');
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
    const resp = await fetch(resolveFetchUrl(cover), { credentials: 'same-origin' });
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

  const preflightQuota = await checkStorageSpaceForDownload(estimateMangaBatchBytes(1));
  if (preflightQuota.status === 'insufficient') {
    throw buildQuotaExceededError(preflightQuota.message);
  }

  const offlineId = buildMangaChapterOfflineId(mangaId, chapterNum);
  const cache = await caches.open(OFFLINE_MANGA_CACHE);
  const pageKeys: string[] = new Array(pageUrls.length);
  const writtenCacheKeys = new Set<string>();
  const internalAbortCtrl = new AbortController();
  const onExternalAbort = () => internalAbortCtrl.abort();
  if (signal?.aborted) {
    throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
  }
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  let totalBytes = 0;
  let completedPages = 0;
  let workers: Promise<void>[] = [];

  const fetchSinglePage = async (index: number): Promise<void> => {
    if (signal?.aborted || internalAbortCtrl.signal.aborted) {
      throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
    }

    const candidates = buildPageCandidateUrls(pageUrls[index], fallbackPageUrls[index]);
    let downloadedBlob: Blob | null = null;
    let lastStatus = 0;

    for (const candidate of candidates) {
      if (signal?.aborted || internalAbortCtrl.signal.aborted) {
        throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
      }
      try {
        const proxyUrl = resolveFetchUrl(candidate);
        const reqCtrl = new AbortController();
        const timeoutId = setTimeout(() => reqCtrl.abort(), 10000);
        const onAbort = () => reqCtrl.abort();
        internalAbortCtrl.signal.addEventListener('abort', onAbort, { once: true });
        let resp: Response;
        try {
          resp = await fetch(proxyUrl, {
            signal: reqCtrl.signal,
            credentials: 'same-origin'
          });
        } finally {
          clearTimeout(timeoutId);
          internalAbortCtrl.signal.removeEventListener('abort', onAbort);
        }
        lastStatus = resp.status;
        if (!resp.ok) continue;
        const blob = await resp.blob();
        if (blob.size < 100) continue;
        downloadedBlob = blob;
        break;
      } catch {
        if (signal?.aborted || internalAbortCtrl.signal.aborted) {
          throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
        }
      }
    }

    if (!downloadedBlob) {
      throw new Error(`Fallo al descargar página ${index + 1}${lastStatus ? ` (${lastStatus})` : ''}`);
    }

    if (signal?.aborted || internalAbortCtrl.signal.aborted) {
      throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
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
    writtenCacheKeys.add(cacheKey);
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
    workers = Array.from({ length: concurrency }, async () => {
      while (nextIdx < pageUrls.length) {
        if (signal?.aborted || internalAbortCtrl.signal.aborted) {
          throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
        }
        const myIdx = nextIdx;
        nextIdx += 1;
        await fetchSinglePage(myIdx);
      }
    });
    await Promise.all(workers);

    if (signal?.aborted || internalAbortCtrl.signal.aborted) {
      throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
    }

    const coverCacheKey = await cacheMangaCoverBestEffort(cache, mangaId, cover || mangaMeta?.cover);

    if (signal?.aborted || internalAbortCtrl.signal.aborted) {
      throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
    }

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
      group: group || 'Offline',
      mangaMeta,
      pageKeys,
      pageCount: pageKeys.length,
      sizeBytes: totalBytes,
      status: 'completed',
      createdAt: Date.now()
    };

    await putOfflineManifest(manifest);
    return manifest;
  } catch (err) {
    internalAbortCtrl.abort();
    if (workers.length > 0) {
      await Promise.allSettled(workers);
    }
    const allPotentialKeys = [
      ...writtenCacheKeys,
      ...pageKeys.filter(Boolean),
      ...Array.from({ length: pageUrls.length }, (_, idx) => buildOfflinePageCacheKey(offlineId, idx))
    ];
    await cleanupOfflineDownloadArtifacts({
      id: offlineId,
      cacheName: OFFLINE_MANGA_CACHE,
      cacheKeys: allPotentialKeys
    });
    if (isQuotaExceededError(err)) {
      throw buildQuotaExceededError(
        'Espacio de almacenamiento insuficiente en el dispositivo. Se limpiaron las páginas incompletas.'
      );
    }
    throw err;
  } finally {
    signal?.removeEventListener('abort', onExternalAbort);
  }
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
    group: 'Offline',
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

export async function getOfflineEpisodesForAnime(
  animeId: string | number,
  seasonNumber?: number
): Promise<Set<number>> {
  const items = await getAllOfflineManifests();
  const targetId = String(animeId);
  const eps = new Set<number>();
  for (const item of items) {
    if (item.kind !== 'anime-video') continue;
    if (String(item.mediaId) !== targetId) continue;
    if (seasonNumber !== undefined && Number(item.season || 1) !== Number(seasonNumber)) continue;
    const epNum = Number(item.episode || 0);
    if (epNum > 0) eps.add(epNum);
  }
  return eps;
}

export async function deleteOfflineSeriesGroup(
  kind: 'anime' | 'manga',
  mediaId: string
): Promise<number> {
  const items = await getAllOfflineManifests();
  const targetKind = kind === 'anime' ? 'anime-video' : 'manga';
  const targetId = String(mediaId);
  let removed = 0;
  for (const item of items) {
    if (item.kind === targetKind && String(item.mediaId) === targetId) {
      await deleteOfflineManifestById(item.id);
      removed += 1;
    }
  }
  return removed;
}

async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Descarga cancelada por el usuario', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface DownloadAnimeEpisodeParams {
  animeId: string | number;
  animeTitle: string;
  cover?: string;
  season: number;
  episode: number;
  quality: string;
  audio?: 'SUB' | 'DUB';
  destination?: DownloadDestination;
  directStreamUrl?: string | null;
  fallbackWebUrl: string;
  saveToDeviceFilename?: string;
  allowWatchLaterFallback?: boolean;
  chunkSizeBytes?: number;
  maxRetriesPerChunk?: number;
  retryBaseDelayMs?: number;
  waitIfPaused?: () => Promise<void>;
  onProgress?: (
    percent: number,
    loadedBytes: number,
    totalBytes: number,
    detail?: AnimeDownloadProgress
  ) => void;
  signal?: AbortSignal;
}

export async function downloadAnimeEpisodeOrQueue(
  params: DownloadAnimeEpisodeParams
): Promise<OfflineChapterManifest> {
  const id = `anime_${params.animeId}_s${params.season}_e${params.episode}`;
  const directStr = String(params.directStreamUrl || '');
  const isDirectVideo =
    Boolean(directStr) &&
    (directStr.startsWith('/api/video-proxy?') || /\.(mp4|webm|mkv)(\?|$)/i.test(directStr));

  const destination: DownloadDestination =
    params.destination || (params.saveToDeviceFilename ? 'both' : 'app');
  const saveToApp = destination === 'app' || destination === 'both';
  const saveToDevice = destination === 'device' || destination === 'both';
  const audioTag: 'SUB' | 'DUB' = params.audio === 'DUB' ? 'DUB' : 'SUB';
  const allowWatchLaterFallback = params.allowWatchLaterFallback !== false;

  if (isDirectVideo && params.directStreamUrl && (!saveToApp || typeof caches !== 'undefined')) {
    if (params.signal?.aborted) {
      throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
    }

    if (saveToApp) {
      await ensurePersistentStorage();
      const estimatedBytes = estimateAnimeBatchBytes(1, params.quality);
      const preflightQuota = await checkStorageSpaceForDownload(estimatedBytes);
      if (preflightQuota.status === 'insufficient') {
        throw buildQuotaExceededError(preflightQuota.message);
      }
    }

    const downloadFilename =
      params.saveToDeviceFilename ||
      formatAnimeEpisodeFilename(params.animeTitle, params.season, params.episode, audioTag);

    const fetchUrl = directStr.includes('download=1')
      ? directStr
      : buildVideoDownloadProxyUrl(directStr, downloadFilename);

    const cacheKey = `https://nyanime.offline/anime/${encodeURIComponent(id)}.mp4`;
    const chunkSize = Math.max(64 * 1024, Math.floor(params.chunkSizeBytes || DOWNLOAD_CHUNK_BYTES));
    const maxRetries = Math.max(0, Math.floor(params.maxRetriesPerChunk ?? 2));
    const retryBaseDelayMs = Math.max(50, Math.floor(params.retryBaseDelayMs ?? 600));
    let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    const startedAt = Date.now();
    let pausedMs = 0;

    const awaitPauseGate = async (): Promise<void> => {
      if (params.signal?.aborted) {
        throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
      }
      if (!params.waitIfPaused) return;
      const pauseStart = Date.now();
      await params.waitIfPaused();
      pausedMs += Math.max(0, Date.now() - pauseStart);
      if (params.signal?.aborted) {
        throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
      }
    };

    const emitProgress = (
      loadedBytes: number,
      totalBytes: number,
      chunkIndex: number,
      totalChunks: number
    ) => {
      const elapsedMs = Math.max(150, Date.now() - startedAt - pausedMs);
      const pct =
        totalBytes > 0
          ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
          : loadedBytes > 0
            ? 50
            : 0;
      const stats = formatSpeedAndEta(loadedBytes, totalBytes, elapsedMs);
      params.onProgress?.(pct, loadedBytes, totalBytes, {
        percent: pct,
        loadedBytes,
        totalBytes,
        speedMbps: stats.speedMbps,
        speedLabel: stats.speedLabel,
        etaSeconds: stats.etaSeconds,
        etaLabel: stats.etaLabel,
        chunkIndex,
        totalChunks
      });
    };

    const fetchRangeChunkWithRetry = async (
      start: number,
      end: number
    ): Promise<Response> => {
      let lastErr: unknown = null;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        await awaitPauseGate();
        try {
          const resp = await fetch(fetchUrl, {
            signal: params.signal,
            credentials: 'same-origin',
            headers: {
              Range: `bytes=${start}-${end}`
            }
          });
          if (!resp.ok) {
            // Do not retry 4xx permanent errors (403, 404, 410, 416)
            if (resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429) {
              throw new Error(`No se pudo descargar el video (${resp.status})`);
            }
            throw new Error(`Error temporal del servidor (${resp.status})`);
          }
          const respCt = (resp.headers.get('content-type') || '').toLowerCase();
          if (respCt.includes('text/html') || respCt.includes('application/xhtml')) {
            throw new Error('El servidor devolvió una página HTML en lugar del flujo de video .MP4');
          }
          return resp;
        } catch (err: any) {
          if (err?.name === 'AbortError' || params.signal?.aborted) {
            throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
          }
          lastErr = err;
          if (
            err instanceof Error &&
            (/HTML|403|404|410|416/i.test(err.message) || attempt >= maxRetries)
          ) {
            throw err;
          }
          await sleepWithAbort(retryBaseDelayMs * (attempt + 1), params.signal);
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('Error de red al descargar bloque de video');
    };

    const readResponseBodyChunks = async (
      resp: Response,
      targetChunks: Uint8Array[],
      onBytes: (delta: number) => void
    ): Promise<number> => {
      let chunkBytes = 0;
      const reader = resp.body?.getReader();
      if (reader) {
        activeReader = reader;
        try {
          while (true) {
            if (params.signal?.aborted) {
              throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
            }
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.byteLength > 0) {
              targetChunks.push(value);
              chunkBytes += value.byteLength;
              onBytes(value.byteLength);
            }
          }
        } finally {
          if (activeReader === reader) activeReader = undefined;
        }
        return chunkBytes;
      }

      const buf = new Uint8Array(await resp.arrayBuffer());
      if (buf.byteLength > 0) {
        targetChunks.push(buf);
        chunkBytes = buf.byteLength;
        onBytes(buf.byteLength);
      }
      return chunkBytes;
    };

    try {
      const assembledChunks: Uint8Array[] = [];
      let loadedBytes = 0;
      let totalBytes = 0;
      let detectedMime = 'video/mp4';

      // Chunk 0: bytes=0-(chunkSize-1) reveals exact total file size via Content-Range
      const firstEnd = chunkSize - 1;
      const firstResp = await fetchRangeChunkWithRetry(0, firstEnd);
      const firstCt = (firstResp.headers.get('content-type') || '').toLowerCase();
      if (firstCt.includes('video/')) {
        detectedMime = firstCt.split(';')[0].trim() || 'video/mp4';
      }

      const contentRange = parseContentRangeHeader(firstResp.headers.get('content-range'));
      const contentLengthHeader = Number(firstResp.headers.get('content-length') || '0');

      if (firstResp.status === 206 && contentRange && contentRange.total > 0) {
        totalBytes = contentRange.total;
        if (saveToApp) {
          const exactQuota = await checkStorageSpaceForDownload(totalBytes);
          if (exactQuota.status === 'insufficient') {
            await firstResp.body?.cancel().catch(() => {});
            throw buildQuotaExceededError(exactQuota.message);
          }
        }

        const totalChunks = Math.max(1, Math.ceil(totalBytes / chunkSize));
        const firstChunkBytes = await readResponseBodyChunks(firstResp, assembledChunks, (delta) => {
          loadedBytes += delta;
          emitProgress(loadedBytes, totalBytes, 1, totalChunks);
        });

        if (firstChunkBytes === 0) {
          throw new Error('El servidor devolvió un bloque inicial vacío');
        }

        let nextStart = Math.max(contentRange.end + 1, loadedBytes);
        let chunkIdx = 2;

        while (nextStart < totalBytes) {
          await awaitPauseGate();
          const rangeEnd = Math.min(totalBytes - 1, nextStart + chunkSize - 1);
          const expectedLen = rangeEnd - nextStart + 1;

          let chunkSucceeded = false;
          let lastChunkErr: unknown = null;

          for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            await awaitPauseGate();
            const chunkLocalBuffers: Uint8Array[] = [];
            let chunkReceived = 0;
            try {
              const resp = await fetchRangeChunkWithRetry(nextStart, rangeEnd);
              if (resp.status !== 206) {
                await resp.body?.cancel().catch(() => {});
                throw new Error(`El servidor no respetó la descarga por bloques (${resp.status})`);
              }
              await readResponseBodyChunks(resp, chunkLocalBuffers, (delta) => {
                chunkReceived += delta;
                emitProgress(loadedBytes + chunkReceived, totalBytes, chunkIdx, totalChunks);
              });
              if (chunkReceived === 0) {
                throw new Error('Bloque de video vacío recibido del servidor');
              }
              // Verify chunk wasn't silently cut off far short of requested bytes
              if (expectedLen > 65536 && chunkReceived < Math.floor(expectedLen * 0.9)) {
                throw new Error('Bloque de video cortado a mitad de transferencia');
              }
              for (const part of chunkLocalBuffers) {
                assembledChunks.push(part);
              }
              loadedBytes += chunkReceived;
              emitProgress(loadedBytes, totalBytes, chunkIdx, totalChunks);
              chunkSucceeded = true;
              break;
            } catch (err: any) {
              if (err?.name === 'AbortError' || params.signal?.aborted) {
                throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
              }
              lastChunkErr = err;
              if (attempt >= maxRetries) {
                throw err;
              }
              await sleepWithAbort(retryBaseDelayMs * (attempt + 1), params.signal);
            }
          }

          if (!chunkSucceeded) {
            throw lastChunkErr instanceof Error
              ? lastChunkErr
              : new Error('Error de red durante la descarga por bloques');
          }

          nextStart = rangeEnd + 1;
          chunkIdx += 1;
        }
      } else {
        // Fallback for small files or origins returning 200 OK instead of 206 Partial Content
        totalBytes = contentLengthHeader > 0 ? contentLengthHeader : 0;
        if (saveToApp && totalBytes > 0) {
          const exactQuota = await checkStorageSpaceForDownload(totalBytes);
          if (exactQuota.status === 'insufficient') {
            await firstResp.body?.cancel().catch(() => {});
            throw buildQuotaExceededError(exactQuota.message);
          }
        }
        await readResponseBodyChunks(firstResp, assembledChunks, (delta) => {
          loadedBytes += delta;
          emitProgress(loadedBytes, totalBytes, 1, 1);
        });
      }

      if (params.signal?.aborted) {
        throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
      }

      const blob = new Blob(assembledChunks as BlobPart[], { type: detectedMime });
      if (blob.size === 0 || (totalBytes > 65536 && blob.size < Math.floor(totalBytes * 0.98))) {
        throw new Error('El flujo de video descargado está incompleto o vacío');
      }

      emitProgress(blob.size, totalBytes || blob.size, Math.max(1, Math.ceil(blob.size / chunkSize)), Math.max(1, Math.ceil(blob.size / chunkSize)));

      const manifest: OfflineChapterManifest = {
        id,
        kind: 'anime-video',
        mediaId: String(params.animeId),
        title: params.animeTitle,
        cover: params.cover,
        season: params.season,
        episode: params.episode,
        quality: params.quality,
        lang: audioTag,
        url: saveToApp ? cacheKey : undefined,
        sizeBytes: blob.size,
        status: 'completed',
        createdAt: Date.now()
      };

      if (saveToApp) {
        const cache = await caches.open(OFFLINE_ANIME_CACHE);
        await cache.put(
          cacheKey,
          new Response(blob, {
            status: 200,
            headers: {
              'Content-Type': blob.type || 'video/mp4',
              'Content-Length': String(blob.size)
            }
          })
        );

        if (params.signal?.aborted) {
          throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
        }

        await putOfflineManifest(manifest);
      }

      if (saveToDevice) {
        const objUrl = URL.createObjectURL(blob);
        activeObjectUrls.push(objUrl);
        triggerBrowserFileDownload(objUrl, downloadFilename);
      }

      return manifest;
    } catch (err) {
      if (activeReader) {
        await activeReader.cancel().catch(() => {});
      }
      if (saveToApp) {
        await cleanupOfflineDownloadArtifacts({
          id,
          cacheName: OFFLINE_ANIME_CACHE,
          cacheKeys: [cacheKey]
        });
      }
      if (isQuotaExceededError(err)) {
        throw buildQuotaExceededError(
          err instanceof Error && err.message && /espacio|insuficiente/i.test(err.message)
            ? err.message
            : 'Espacio insuficiente en el dispositivo para guardar este episodio .MP4. Se limpiaron los archivos incompletos.'
        );
      }
      throw err;
    }
  }

  if (!allowWatchLaterFallback) {
    throw new Error('Sin enlace .MP4 directo disponible en este idioma');
  }

  // Legacy watch-later fallback only when explicitly permitted
  const manifest: OfflineChapterManifest = {
    id,
    kind: 'watch-later',
    mediaId: String(params.animeId),
    title: params.animeTitle,
    cover: params.cover,
    season: params.season,
    episode: params.episode,
    quality: params.quality,
    lang: audioTag,
    url: params.fallbackWebUrl,
    sizeBytes: 0,
    status: 'watch-later',
    note: 'Guardado para ver con conexión dentro de NyAnime TV.',
    createdAt: Date.now()
  };
  await putOfflineManifest(manifest);
  return manifest;
}

export async function downloadAnimeEpisodeChunked(
  params: Omit<DownloadAnimeEpisodeParams, 'allowWatchLaterFallback'>
): Promise<OfflineChapterManifest> {
  return downloadAnimeEpisodeOrQueue({
    ...params,
    allowWatchLaterFallback: false
  });
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
  if (!manifest || manifest.kind !== 'anime-video') return false;
  const audioTag = manifest.lang === 'DUB' || manifest.lang === 'LAT' ? 'LAT' : 'SUB';
  const baseName = formatAnimeEpisodeFilename(
    manifest.title,
    Number(manifest.season || 1),
    Number(manifest.episode || 1),
    audioTag
  );
  const blobUrl = await getOfflineAnimeVideoBlobUrl(offlineId);
  if (!blobUrl) return false;
  triggerBrowserFileDownload(blobUrl, baseName);
  return true;
}

export async function getStorageSummary(): Promise<StorageSummary> {
  const items = await getAllOfflineManifests();
  let offlineBytes = 0;
  let animeBytes = 0;
  let mangaBytes = 0;
  let mangaChaptersCount = 0;
  let animeFilesCount = 0;
  let watchLaterCount = 0;

  for (const item of items) {
    const sz = Number(item.sizeBytes || 0);
    offlineBytes += sz;
    if (item.kind === 'manga') {
      mangaChaptersCount += 1;
      mangaBytes += sz;
    } else if (item.kind === 'anime-video') {
      animeFilesCount += 1;
      animeBytes += sz;
    } else {
      watchLaterCount += 1;
    }
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
    animeBytes,
    mangaBytes,
    mangaChaptersCount,
    animeFilesCount,
    watchLaterCount,
    storagePersisted
  };
}

export function formatBytesHuman(bytes: number): string {
  return formatBytesCompact(bytes);
}

function renderActiveQueueSection(batch: ActiveDownloadBatchSnapshot): string {
  const safeTitle = escapeHTML(batch.animeTitle || 'Anime');
  const statusBadge = batch.isPaused
    ? 'En pausa'
    : batch.isRunning
      ? 'Descargando'
      : batch.failedCount > 0
        ? `${batch.failedCount} con error`
        : 'Completado';
  const rows = batch.items
    .map((it) => {
      let tone = 'idle';
      let label = 'En cola';
      if (it.status === 'resolving') {
        tone = 'active';
        label = 'Resolviendo fuente...';
      } else if (it.status === 'downloading') {
        tone = 'active';
        const mbLoaded = formatBytesCompact(it.loadedBytes);
        const mbTotal = it.totalBytes > 0 ? ` / ${formatBytesCompact(it.totalBytes)}` : '';
        const speedPart = it.speedLabel ? ` · ${it.speedLabel}` : '';
        label = `Descargando ${it.percent}% · ${mbLoaded}${mbTotal}${speedPart}`;
      } else if (it.status === 'paused') {
        tone = 'warn';
        label = `Pausado (${it.percent}%)`;
      } else if (it.status === 'completed') {
        tone = 'done';
        label = `✓ Descargado${it.sizeBytes ? ` (${formatBytesCompact(it.sizeBytes)})` : ''}`;
      } else if (it.status === 'error') {
        tone = 'error';
        label = `✕ ${it.errorReason || 'Error al descargar'}`;
      }
      return `
        <div class="dl-item-row dl-queue-row" data-queue-ep="${it.episode}">
          <div class="dl-item-info-col">
            <div class="dl-item-ep tabular-nums">T${batch.season} · Ep. ${it.episode}</div>
            <div class="dl-ep-live-state ${tone} tabular-nums">${escapeHTML(label)}</div>
          </div>
          ${
            it.status === 'error'
              ? `<button type="button" class="dl-action-btn primary" onclick="reintentarEpisodioDescarga(${it.episode})">Reintentar</button>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  return `
    <div class="dl-section-label">Descarga en curso</div>
    <section class="dl-group-card dl-active-queue-card">
      <div class="dl-active-queue-head">
        <div class="dl-group-title-wrap">
          <div class="dl-group-title">${safeTitle} · T${batch.season}</div>
          <div class="dl-item-meta tabular-nums">${escapeHTML(statusBadge)} · ${batch.completedCount} de ${batch.totalCount} completados (${batch.overallPercent}%)</div>
          ${
            batch.activeDetailText
              ? `<div class="dl-active-detail tabular-nums">${escapeHTML(batch.activeDetailText)}</div>`
              : ''
          }
        </div>
        <div class="dl-item-actions">
          ${
            batch.isRunning
              ? `<button type="button" class="dl-action-btn" onclick="togglePausaDescargaTemporada()">${batch.isPaused ? 'Reanudar' : 'Pausar'}</button>
                 <button type="button" class="dl-action-btn danger" onclick="cancelarDescargaTemporada()">Cancelar</button>`
              : ''
          }
          ${
            batch.failedCount > 0 && !batch.isRunning
              ? `<button type="button" class="dl-action-btn primary" onclick="reintentarEpisodiosFallidos()">Reintentar fallidos</button>`
              : ''
          }
        </div>
      </div>
      <div class="dl-progress-track dl-active-queue-track">
        <div class="dl-progress-fill" style="width:${batch.overallPercent}%;"></div>
      </div>
      <div class="dl-group-items">${rows}</div>
    </section>
  `;
}

export async function renderOfflineDownloadsModal(
  containerEl: HTMLElement | null,
  storageInfoEl?: HTMLElement | null,
  options?: {
    activeTab?: DownloadManagerFilterTab;
    query?: string;
    tabsContainerEl?: HTMLElement | null;
    activeBatch?: ActiveDownloadBatchSnapshot | null;
  }
): Promise<void> {
  if (!containerEl) return;
  await ensurePersistentStorage();
  const [items, summary] = await Promise.all([getAllOfflineManifests(), getStorageSummary()]);
  const activeTab: DownloadManagerFilterTab = options?.activeTab || 'all';
  const query = String(options?.query || '');
  const grouped = groupOfflineManifests(items, query);
  const meter = computeStorageMeter(summary);
  const activeBatch = options?.activeBatch || null;
  const activeQueueCount =
    activeBatch && (activeBatch.isRunning || activeBatch.failedCount > 0)
      ? activeBatch.items.filter((i) => i.status !== 'completed').length || activeBatch.totalCount
      : 0;

  if (storageInfoEl) {
    const freePart =
      meter.quotaBytes > 0 ? `${formatBytesCompact(meter.freeBytes)} disponibles` : 'Cuota estándar';
    const statusLabel = summary.storagePersisted ? 'Almacenamiento protegido' : 'Almacenamiento estándar';
    storageInfoEl.innerHTML = `
      <div class="dl-storage-head">
        <div>
          <div class="dl-storage-title">Espacio Offline en Dispositivo</div>
          <div class="dl-storage-meta tabular-nums">${formatBytesCompact(meter.offlineBytes)} usados en la app · ${freePart}</div>
        </div>
        <span class="dl-storage-state ${summary.storagePersisted ? 'protected' : 'standard'}">${statusLabel}</span>
      </div>
      <div class="dl-storage-track dl-storage-track-segmented" role="progressbar" aria-valuenow="${meter.pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="dl-storage-seg-anime" style="width:${meter.animePct}%;" title="Animes Offline (.MP4)"></div>
        <div class="dl-storage-seg-manga" style="width:${meter.mangaPct}%;" title="Mangas Offline"></div>
      </div>
      <div class="dl-storage-breakdown tabular-nums">
        <span class="dl-legend-item"><i class="dl-legend-dot anime"></i>Animes: ${formatBytesCompact(meter.animeBytes)} (${meter.animeFilesCount})</span>
        <span class="dl-legend-item"><i class="dl-legend-dot manga"></i>Mangas: ${formatBytesCompact(meter.mangaBytes)} (${meter.mangaChaptersCount})</span>
        ${
          meter.quotaBytes > 0
            ? `<span class="dl-legend-item"><i class="dl-legend-dot free"></i>Libre: ${formatBytesCompact(meter.freeBytes)}</span>`
            : ''
        }
      </div>
    `;
  }

  if (options?.tabsContainerEl) {
    const tabs: Array<{ id: DownloadManagerFilterTab; label: string; count: number }> = [
      { id: 'all', label: 'Todos', count: grouped.counts.all + (activeBatch?.isRunning ? 1 : 0) },
      { id: 'active', label: 'En curso', count: activeQueueCount },
      { id: 'anime', label: 'Animes Offline (.MP4)', count: grouped.counts.anime },
      { id: 'manga', label: 'Mangas Offline', count: grouped.counts.manga }
    ];
    if (grouped.counts.watchLater > 0) {
      tabs.push({ id: 'watch-later', label: 'Ver Luego', count: grouped.counts.watchLater });
    }
    options.tabsContainerEl.innerHTML = tabs
      .map(
        (t) => `
          <button type="button" class="dl-filter-tab ${activeTab === t.id ? 'active' : ''}" data-dl-tab="${t.id}" onclick="setDownloadManagerTab('${t.id}')">
            <span>${t.label}</span>
            <span class="dl-tab-count tabular-nums">${t.count}</span>
          </button>
        `
      )
      .join('');
  }

  if (activeTab === 'active') {
    if (activeBatch && (activeBatch.isRunning || activeBatch.items.length > 0)) {
      containerEl.innerHTML = renderActiveQueueSection(activeBatch);
    } else {
      containerEl.innerHTML = `
        <div class="dl-empty-state">
          <div class="dl-empty-title">Sin descargas en curso</div>
          <div class="dl-empty-desc">Cuando inicies una descarga de episodios podrás ver aquí la velocidad, pausar, reanudar o reintentar fallidos.</div>
        </div>
      `;
    }
    return;
  }

  if (items.length === 0 && !(activeBatch && (activeBatch.isRunning || activeBatch.failedCount > 0))) {
    containerEl.innerHTML = `
      <div class="dl-empty-state">
        <div class="dl-empty-title">Sin descargas almacenadas</div>
        <div class="dl-empty-desc">Abre cualquier anime y pulsa <strong>Descargar</strong> para guardar episodios reales en .MP4 y verlos sin internet.</div>
      </div>
    `;
    return;
  }

  const showAnime = activeTab === 'all' || activeTab === 'anime';
  const showWatchLater = activeTab === 'all' || activeTab === 'watch-later';
  const showManga = activeTab === 'all' || activeTab === 'manga';

  const sectionsHtml: string[] = [];

  if (activeTab === 'all' && activeBatch && (activeBatch.isRunning || activeBatch.failedCount > 0)) {
    sectionsHtml.push(renderActiveQueueSection(activeBatch));
  }

  if (showAnime && grouped.animeGroups.length > 0) {
    const animeCards = grouped.animeGroups
      .map((group) => {
        const safeMediaId = escapeHTML(group.mediaId);
        const safeTitle = escapeHTML(group.title);
        const coverThumb = safeImageUrl(group.cover);
        const rowsHtml = group.items
          .map((item) => {
            const safeId = escapeHTML(item.id);
            const epLabel = `T${item.season || 1} · Ep. ${item.episode || 1}`;
            const langLabel = item.lang === 'DUB' || item.lang === 'LAT' ? 'Latino' : 'Sub Esp';
            const metaText = `${langLabel} · .MP4 Offline · ${formatBytesCompact(item.sizeBytes)}`;
            return `
              <div class="dl-item-row" data-offline-id="${safeId}">
                <div class="dl-item-info">
                  <span class="dl-item-ep tabular-nums">${epLabel}</span>
                  <span class="dl-item-meta tabular-nums">${metaText}</span>
                </div>
                <div class="dl-item-actions">
                  <button type="button" class="dl-action-btn primary" onclick="window.NyAnimeOffline.openItem('${safeId}')">Reproducir offline</button>
                  <button type="button" class="dl-action-btn" onclick="window.NyAnimeOffline.exportMp4('${safeId}')" title="Exportar archivo .MP4 a tu dispositivo sin volver a descargar">Exportar .MP4</button>
                  <button type="button" class="dl-action-btn danger" onclick="window.NyAnimeOffline.deleteItem('${safeId}')" aria-label="Eliminar ${escapeHTML(epLabel)}">Eliminar</button>
                </div>
              </div>
            `;
          })
          .join('');

        return `
          <section class="dl-group-card" data-group-kind="anime" data-media-id="${safeMediaId}">
            <div class="dl-group-head">
              ${
                coverThumb
                  ? `<img src="${escapeHTML(coverThumb)}" alt="${safeTitle}" class="dl-group-cover" referrerpolicy="no-referrer">`
                  : `<div class="dl-group-cover dl-group-cover-fallback" aria-hidden="true">TV</div>`
              }
              <div class="dl-group-title-wrap">
                <div class="dl-group-title">${safeTitle}</div>
                <div class="dl-group-meta tabular-nums">${group.itemCount} ${group.itemCount === 1 ? 'episodio' : 'episodios'} · ${formatBytesCompact(group.totalBytes)}</div>
              </div>
              <button type="button" class="dl-group-delete-btn" onclick="eliminarGrupoOffline('anime', '${safeMediaId}')">Eliminar serie</button>
            </div>
            <div class="dl-group-items">${rowsHtml}</div>
          </section>
        `;
      })
      .join('');
    sectionsHtml.push(`<div class="dl-section-label">Animes Offline (.MP4)</div>${animeCards}`);
  }

  if (showManga && grouped.mangaGroups.length > 0) {
    const mangaCards = grouped.mangaGroups
      .map((group) => {
        const safeMediaId = escapeHTML(group.mediaId);
        const safeTitle = escapeHTML(group.title);
        const coverThumb = safeImageUrl(group.cover);
        const rowsHtml = group.items
          .map((item) => {
            const safeId = escapeHTML(item.id);
            const capLabel = `Cap. ${escapeHTML(item.chapterLabel || item.chapterNum || 1)}`;
            const metaText = `${item.pageCount || 0} págs · ${formatBytesCompact(item.sizeBytes)}`;
            return `
              <div class="dl-item-row" data-offline-id="${safeId}">
                <div class="dl-item-info">
                  <span class="dl-item-ep tabular-nums">${capLabel}</span>
                  <span class="dl-item-meta tabular-nums">${metaText}</span>
                </div>
                <div class="dl-item-actions">
                  <button type="button" class="dl-action-btn primary" onclick="window.NyAnimeOffline.openItem('${safeId}')">Leer offline</button>
                  <button type="button" class="dl-action-btn danger" onclick="window.NyAnimeOffline.deleteItem('${safeId}')" aria-label="Eliminar ${capLabel}">Eliminar</button>
                </div>
              </div>
            `;
          })
          .join('');

        return `
          <section class="dl-group-card" data-group-kind="manga" data-media-id="${safeMediaId}">
            <div class="dl-group-head">
              ${
                coverThumb
                  ? `<img src="${escapeHTML(coverThumb)}" alt="${safeTitle}" class="dl-group-cover" referrerpolicy="no-referrer">`
                  : `<div class="dl-group-cover dl-group-cover-fallback" aria-hidden="true">MG</div>`
              }
              <div class="dl-group-title-wrap">
                <div class="dl-group-title">${safeTitle}</div>
                <div class="dl-group-meta tabular-nums">${group.itemCount} ${group.itemCount === 1 ? 'capítulo' : 'capítulos'} · ${formatBytesCompact(group.totalBytes)}</div>
              </div>
              <button type="button" class="dl-group-delete-btn" onclick="eliminarGrupoOffline('manga', '${safeMediaId}')">Eliminar serie</button>
            </div>
            <div class="dl-group-items">${rowsHtml}</div>
          </section>
        `;
      })
      .join('');
    sectionsHtml.push(`<div class="dl-section-label">Mangas Offline</div>${mangaCards}`);
  }

  if (showWatchLater && grouped.watchLaterItems.length > 0) {
    const wlRows = grouped.watchLaterItems
      .map((item) => {
        const safeId = escapeHTML(item.id);
        const safeTitle = escapeHTML(normalizeSeriesGroupTitle(item.title));
        const coverThumb = safeImageUrl(item.cover);
        return `
          <div class="dl-item-row dl-item-row-card" data-offline-id="${safeId}">
            <div class="dl-item-left">
              ${
                coverThumb
                  ? `<img src="${escapeHTML(coverThumb)}" alt="${safeTitle}" class="dl-mini-cover" referrerpolicy="no-referrer">`
                  : `<div class="dl-mini-cover dl-group-cover-fallback" aria-hidden="true">WL</div>`
              }
              <div class="dl-item-info-col">
                <div class="dl-item-title">${safeTitle}</div>
                <div class="dl-item-meta tabular-nums">T${item.season || 1} · Ep. ${item.episode || 1} · Requiere conexión (sin archivo .MP4 offline)</div>
              </div>
            </div>
            <div class="dl-item-actions">
              <button type="button" class="dl-action-btn primary" onclick="window.NyAnimeOffline.openItem('${safeId}')">Ver en NyAnime</button>
              <button type="button" class="dl-action-btn danger" onclick="window.NyAnimeOffline.deleteItem('${safeId}')" aria-label="Eliminar ${safeTitle}">Eliminar</button>
            </div>
          </div>
        `;
      })
      .join('');
    sectionsHtml.push(`<div class="dl-section-label">Guardados en Ver Luego (requiere conexión)</div><div class="dl-flat-stack">${wlRows}</div>`);
  }

  if (sectionsHtml.length === 0) {
    containerEl.innerHTML = `
      <div class="dl-empty-state">
        <div class="dl-empty-title">Sin coincidencias</div>
        <div class="dl-empty-desc">No se encontraron elementos en esta categoría con el filtro actual.</div>
      </div>
    `;
    return;
  }

  containerEl.innerHTML = sectionsHtml.join('');
}

function normalizeSeriesGroupTitle(rawTitle: string): string {
  return String(rawTitle || 'Serie')
    .replace(/\s*\(T\d+\)\s*$/i, '')
    .trim() || 'Serie';
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
