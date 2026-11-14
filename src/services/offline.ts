import { escapeHTML, safeImageUrl } from '../utils/sanitize.ts';
import { buildVideoDownloadProxyUrl, sanitizeDownloadFilename } from '../utils/proxySecurity.ts';

export const OFFLINE_MANGA_CACHE = 'nyanime-offline-manga-v1';
export const OFFLINE_ANIME_CACHE = 'nyanime-offline-anime-v1';
const DB_NAME = 'NyAnimeOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'offline_items';

export interface OfflineChapterManifest {
  id: string;
  kind: 'manga' | 'anime-video' | 'watch-later';
  mediaId: string;
  title: string;
  cover?: string;
  chapterNum?: number;
  chapterLabel?: string;
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

export async function downloadMangaChapterOffline(params: {
  mangaId: string | number;
  mangaTitle: string;
  cover?: string;
  chapterNum: number;
  chapterLabel: string;
  pageUrls: string[];
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
    pageUrls,
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
  const pageKeys: string[] = [];
  let totalBytes = 0;

  for (let i = 0; i < pageUrls.length; i += 1) {
    if (signal?.aborted) {
      // Limpiar descargas parciales de este capítulo cancelado
      await Promise.all(pageKeys.map((k) => cache.delete(k).catch(() => false)));
      throw new DOMException('Descarga cancelada por el usuario', 'AbortError');
    }

    const proxyUrl = resolveFetchUrl(pageUrls[i]);
    const resp = await fetch(proxyUrl, { signal });
    if (!resp.ok) {
      throw new Error(`Fallo al descargar página ${i + 1} (${resp.status})`);
    }
    const blob = await resp.blob();
    if (blob.size < 100) {
      throw new Error(`Página ${i + 1} vacía o corrupta.`);
    }
    totalBytes += blob.size;

    const cacheKey = buildOfflinePageCacheKey(offlineId, i);
    const cachedResp = new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': blob.type || 'image/jpeg',
        'X-Offline-Manga': offlineId
      }
    });
    await cache.put(cacheKey, cachedResp);
    pageKeys.push(cacheKey);

    onProgress?.({
      chapterIndex,
      totalChapters,
      chapterLabel,
      pageIndex: i + 1,
      totalPages: pageUrls.length,
      bytesDownloaded: totalBytes
    });
  }

  const manifest: OfflineChapterManifest = {
    id: offlineId,
    kind: 'manga',
    mediaId: String(mangaId),
    title: mangaTitle,
    cover,
    chapterNum,
    chapterLabel,
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
  if (typeof caches === 'undefined') return null;
  const offlineId = buildMangaChapterOfflineId(mangaId, chapterNum);
  const manifest = await getOfflineManifestById(offlineId);
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
  return blobUrls;
}

export async function isMangaChapterDownloaded(
  mangaId: string | number,
  chapterNum: number | string
): Promise<boolean> {
  const m = await getOfflineManifestById(buildMangaChapterOfflineId(mangaId, chapterNum));
  return Boolean(m && m.status === 'completed');
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
