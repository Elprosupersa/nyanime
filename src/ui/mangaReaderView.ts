import {
  DownloadManager,
  MangaHistoryManager,
  MangaReadStateManager,
  escHtml,
  getActiveManga,
  handleOpenExternal,
  mostrarToast,
  nWin,
  nativeFetchJson,
  setActiveManga,
  showToast,
  toFastImgUrl
} from './appState.ts';
import {
  InMangaProvider,
  ManhwaWebProvider,
  MangaDex,
  mangaUiState
} from './mangaCatalogView.ts';
import {
  actualizarBotonContinuarDetalleManga,
  buildOfflineMangaMeta,
  cambiarIdiomaMangaModal,
  prefetchCapituloObjetivoManga,
  refreshOfflineMangaDetailState,
  renderCapitulosMangaModal
} from './mangaDetailView.ts';
import {
  deleteOfflineManifestById,
  downloadMangaChapterOffline,
  getOfflineMangaChapterPagesByAliases,
  getOfflineMangaChaptersForSeries
} from '../services/offline.ts';
import {
  type MangaNightFilters,
  type MangaReaderMode,
  DEFAULT_NIGHT_FILTERS,
  buildMangaSpreads,
  buildReaderFilterCss,
  clampNightFilters,
  formatSpreadLabel,
  normalizeMangaReaderMode,
  stepSpreadIndex
} from '../utils/mangaReaderHelpers.ts';

let lectorHudVisible = true;
const readerCurrentSettings: {
  mode: MangaReaderMode;
  bg: string;
  width: string;
  continuousChapter: boolean;
  filters: MangaNightFilters;
} = {
  mode: 'webtoon',
  bg: '#000000',
  width: '100%',
  continuousChapter: true,
  filters: { ...DEFAULT_NIGHT_FILTERS }
};

let readerZoomLevel = 1.0;
let readerInitialPinchDist = 0;
let readerInitialZoom = 1.0;
let readerLastTapTime = 0;
let lastTrackedReaderPage = 1;
let lastSavedPageWriteAt = 0;
let activeReaderBlobUrls: string[] = [];
let readerCurrentOfflineManifestId: string | null = null;
let isReaderCachingInFlight = false;
let activeReaderPages: string[] = [];
let activeReaderSaverPages: string[] = [];
let activeSpreadIndex = 0;
let continuousChapterArmed = false;
let isContinuousAdvancing = false;
let lastResolvedReaderPages: {
  mangaId: string | number;
  chapterNum: number;
  pages: string[];
  saverPages: string[];
  group?: string;
} | null = null;

function revokeActiveReaderBlobUrls(): void {
  while (activeReaderBlobUrls.length > 0) {
    const u = activeReaderBlobUrls.pop();
    if (u && u.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        // ignore
      }
    }
  }
}

export function updateLectorCacheButton(isCached: boolean, isSaving = false): void {
  const btn = document.getElementById('btn-lector-cache') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = isSaving;
  btn.classList.toggle('cached', isCached && !isSaving);
  if (isSaving) {
    btn.textContent = '⏳ Guardando...';
    btn.setAttribute('aria-label', 'Guardando capítulo en caché');
  } else if (isCached) {
    btn.textContent = '💾 Offline ✓';
    btn.setAttribute('aria-label', 'Capítulo guardado en caché sin conexión (toca para eliminar)');
  } else {
    btn.textContent = '💾 Guardar';
    btn.setAttribute('aria-label', 'Guardar capítulo en caché sin conexión');
  }
}

export async function toggleCacheCapituloActualLector(event?: Event): Promise<void> {
  if (event) event.stopPropagation();
  if (isReaderCachingInFlight) return;

  const capList = mangaUiState.capitulosLectorList.length
    ? mangaUiState.capitulosLectorList
    : (nWin.capitulosLectorList || []);
  const capitulo = capList[mangaUiState.capituloActualIdx];
  const activeManga = getActiveManga();
  if (!capitulo || !activeManga) {
    showToast('No hay ningún capítulo activo para guardar.');
    return;
  }

  isReaderCachingInFlight = true;
  updateLectorCacheButton(Boolean(readerCurrentOfflineManifestId), true);

  try {
    const existingList = await getOfflineMangaChaptersForSeries([activeManga.id, activeManga.dexId, capitulo.mangaId]);
    const targetNum = Number(capitulo.chapterNum ?? 1);
    const existing =
      (readerCurrentOfflineManifestId
        ? existingList.find((m) => m.id === readerCurrentOfflineManifestId)
        : undefined) ||
      existingList.find(
        (m) =>
          Math.abs(Number(m.chapterNum ?? -1) - targetNum) < 0.001 ||
          String(m.chapterLabel || '').trim() === String(capitulo.chapter ?? '').trim()
      );

    if (existing) {
      await deleteOfflineManifestById(existing.id);
      readerCurrentOfflineManifestId = null;
      updateLectorCacheButton(false, false);
      await DownloadManager.updateBadge();
      if (mangaUiState.capitulosCache) {
        await refreshOfflineMangaDetailState(activeManga);
        renderCapitulosMangaModal();
      }
      showToast(`Cap. ${capitulo.chapter} eliminado de caché sin conexión.`);
      return;
    }

    let pageUrls: string[] = [];
    let fallbackUrls: string[] = [];
    let resolvedGroup = capitulo.group || 'Offline 💾';

    if (
      lastResolvedReaderPages &&
      String(lastResolvedReaderPages.mangaId) === String(activeManga.id) &&
      Math.abs(lastResolvedReaderPages.chapterNum - targetNum) < 0.001 &&
      lastResolvedReaderPages.pages.length > 0 &&
      !lastResolvedReaderPages.pages[0].startsWith('blob:')
    ) {
      pageUrls = lastResolvedReaderPages.pages;
      fallbackUrls = lastResolvedReaderPages.saverPages;
      if (lastResolvedReaderPages.group) resolvedGroup = lastResolvedReaderPages.group;
    }

    if (pageUrls.length === 0) {
      const domUrls = Array.from(document.querySelectorAll('#lector-content img[data-raw-url]'))
        .map((el) => (el as HTMLElement).dataset.rawUrl || '')
        .filter((u) => Boolean(u) && !u.startsWith('blob:'));
      if (domUrls.length > 0) {
        pageUrls = domUrls;
      }
    }

    if (pageUrls.length === 0) {
      const resPages = await MangaDex.getChapterPages(
        capitulo,
        activeManga.title,
        capitulo.chapterNum,
        mangaUiState.idiomaMangaSeleccionado || 'es',
        activeManga.altTitles
      );
      pageUrls = resPages?.pages?.length > 0 ? resPages.pages : (resPages?.saverPages || []);
      fallbackUrls = Array.isArray(resPages?.saverPages) ? resPages.saverPages : [];
      if (resPages?.group) resolvedGroup = resPages.group;
    }

    if (pageUrls.length === 0) {
      throw new Error('No se encontraron páginas disponibles para guardar.');
    }

    const manifest = await downloadMangaChapterOffline({
      mangaId: activeManga.id,
      mangaTitle: activeManga.title || 'Manga',
      cover: activeManga.cover || '',
      chapterNum: targetNum,
      chapterLabel: String(capitulo.chapter ?? capitulo.chapterNum ?? 1),
      chapterTitle: capitulo.title || undefined,
      lang: capitulo.lang || mangaUiState.idiomaMangaSeleccionado || 'es',
      group: resolvedGroup,
      mangaMeta: buildOfflineMangaMeta(activeManga),
      pageUrls,
      fallbackPageUrls: fallbackUrls
    });

    readerCurrentOfflineManifestId = manifest.id;
    updateLectorCacheButton(true, false);
    await DownloadManager.updateBadge();
    if (mangaUiState.capitulosCache) {
      await refreshOfflineMangaDetailState(activeManga);
      renderCapitulosMangaModal();
    }
    showToast(`💾 Cap. ${capitulo.chapter} guardado en caché para leer sin conexión.`);
  } catch (err: any) {
    updateLectorCacheButton(Boolean(readerCurrentOfflineManifestId), false);
    showToast(`Error guardando capítulo: ${err?.message || err}`);
  } finally {
    isReaderCachingInFlight = false;
  }
}

export function flushMangaReaderPage(): void {
  const lector = document.getElementById('pantalla-lector');
  if (!lector || lector.classList.contains('hide')) return;
  const activeManga = getActiveManga();
  const capList = mangaUiState.capitulosLectorList.length ? mangaUiState.capitulosLectorList : (nWin.capitulosLectorList || []);
  const currentCap = capList[mangaUiState.capituloActualIdx];
  if (activeManga?.id && currentCap) {
    MangaHistoryManager.savePageNumber(activeManga.id, currentCap.chapterNum, lastTrackedReaderPage);
  }
}

export function reintentarPaginaIndividual(pNum: number): void {
  const wrap = document.getElementById(`page-wrap-${pNum}`);
  if (!wrap) return;
  wrap.querySelector('.webtoon-page-retry-box')?.remove();
  const skel = document.createElement('div');
  skel.className = 'webtoon-page-skeleton';
  skel.id = `skel-${pNum}`;
  skel.innerHTML = `<div class="spinner" style="width:28px; height:28px;"></div><span>Reintentando página ${pNum}...</span>`;
  wrap.appendChild(skel);
  const img = wrap.querySelector('img') as HTMLImageElement | null;
  if (img) {
    img.style.display = 'block';
    img.dataset.retries = '0';
    img.dataset.triedSaver = '';
    img.dataset.triedMasterOrigin = '';
    img.dataset.inmangaStep = '0';
    img.dataset.triedFreshNode = '';
    const baseSrc = (img.dataset.origSrc || img.dataset.saverSrc || img.src).split('&t=')[0];
    img.src = baseSrc + (baseSrc.includes('?') ? '&t=' : '?t=') + Date.now();
  }
}

export function cambiarAVersionInglesCapitulo(targetChapNum: number): void {
  const cc = mangaUiState.capitulosCache;
  if (!cc?.english?.length) return;
  const enBtn = document.querySelector("#manga-det-lang-tabs [data-lang='en']") as HTMLElement | null;
  cambiarIdiomaMangaModal('en', enBtn);
  const targetIdx = mangaUiState.mangaFullFilteredList.findIndex(
    c => Math.abs(parseFloat(c.chapterNum) - parseFloat(String(targetChapNum))) < 0.001
  );
  void abrirLectorManga(targetIdx >= 0 ? targetIdx : 0);
}

export async function abrirLectorManga(idx: number): Promise<void> {
  flushMangaReaderPage();

  const listSource = mangaUiState.capitulosLectorList.length > 0
    ? mangaUiState.capitulosLectorList
    : (nWin.capitulosLectorList || []);
  mangaUiState.capitulosLectorList = listSource;
  mangaUiState.capituloActualIdx = idx;
  const capitulo = listSource[idx];
  if (!capitulo) return;

  let activeManga = getActiveManga() || mangaUiState.mangasCache.find(m => m.id === capitulo.mangaId);
  const currentMangaTitle = activeManga?.title
    || capitulo?.mangaTitle
    || capitulo?.mangaName
    || (typeof localStorage !== 'undefined' && localStorage.getItem('nyanime_active_manga_title'))
    || 'Manga';

  if (!activeManga) {
    activeManga = { title: currentMangaTitle, id: capitulo.mangaId || capitulo.id };
  } else {
    activeManga.title = currentMangaTitle;
  }
  setActiveManga(activeManga);
  if (nWin.Store?.setActiveChapter) {
    nWin.Store.setActiveChapter(capitulo);
  }

  if (capitulo.externalUrl && (!capitulo.pages || capitulo.pages === 0)) {
    const workingVer = capitulo.otherVersions?.find((v: any) => v.pages > 0 && !v.externalUrl);
    if (workingVer) {
      capitulo.id = workingVer.id;
      capitulo.group = workingVer.group;
      capitulo.pages = workingVer.pages;
      capitulo.externalUrl = null;
    } else {
      let hasFallbackPages = false;
      try {
        const testFb = await MangaDex.getChapterPages(capitulo, activeManga?.title, capitulo.chapterNum, null, activeManga?.altTitles);
        if (testFb?.pages?.length > 0) {
          hasFallbackPages = true;
          capitulo.externalUrl = null;
          capitulo.pages = testFb.pages.length;
          if (testFb.chapterId) capitulo.id = testFb.chapterId;
          if (testFb.group) capitulo.group = testFb.group;
        }
      } catch {
        // ignore
      }
      if (!hasFallbackPages) {
        mostrarToast(`Abriendo capítulo en portal oficial (${capitulo.group || 'Oficial'})...`, 'info');
        handleOpenExternal(capitulo.externalUrl);
        return;
      }
    }
  }

  const lector = document.getElementById('pantalla-lector');
  const titulo = document.getElementById('lector-titulo');
  const content = document.getElementById('lector-content');
  const pageInd = document.getElementById('lector-page-indicator');

  if (titulo) titulo.textContent = `${activeManga?.title || 'Manga'} · Cap. ${capitulo.chapter}`;
  if (pageInd) pageInd.textContent = 'Cargando páginas HD...';
  if (content) {
    content.dataset.triedEsFallback = '';
    content.innerHTML = '<div class="loader" style="min-height:50vh;"><div class="spinner"></div></div>';
    content.style.backgroundColor = readerCurrentSettings.bg;
  }

  document.getElementById('pantalla-detalle-manga')?.classList.add('hide');
  if (lector) {
    lector.classList.remove('hide');
    lector.scrollTo(0, 0);
  }

  const savedPageBeforeSave = MangaHistoryManager.getSavedPageNumber(activeManga.id, capitulo.chapterNum);
  lastTrackedReaderPage = savedPageBeforeSave;

  if (activeManga) {
    MangaReadStateManager.markRead(activeManga.id, capitulo.chapterNum);
    MangaHistoryManager.save(activeManga, capitulo, savedPageBeforeSave);
    actualizarBotonContinuarDetalleManga();
  }

  revokeActiveReaderBlobUrls();
  readerCurrentOfflineManifestId = null;
  lastResolvedReaderPages = null;
  updateLectorCacheButton(false, false);

  let resPages: any = null;
  let isOfflineServed = false;
  try {
    const offlineMatch = await getOfflineMangaChapterPagesByAliases(
      [activeManga?.id, activeManga?.dexId, capitulo.mangaId],
      capitulo.chapterNum
    );
    if (offlineMatch && offlineMatch.pages.length > 0) {
      activeReaderBlobUrls = [...offlineMatch.pages];
      readerCurrentOfflineManifestId = offlineMatch.manifest.id;
      resPages = {
        pages: offlineMatch.pages,
        saverPages: [],
        group: 'Offline 💾',
        chapterId: capitulo.id
      };
      isOfflineServed = true;
      updateLectorCacheButton(true, false);
    }
  } catch {
    // ignore
  }

  const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!resPages && !isOfflineNow) {
    try {
      resPages = await MangaDex.getChapterPages(
        capitulo,
        activeManga?.title,
        capitulo.chapterNum,
        mangaUiState.idiomaMangaSeleccionado || 'es',
        activeManga?.altTitles
      );
    } catch (ePages) {
      console.warn('[abrirLectorManga] Error inicial en getChapterPages:', ePages);
    }
  }

  const pages: string[] = resPages?.pages?.length > 0 ? resPages.pages : (resPages?.saverPages || []);
  if (!isOfflineServed && pages.length > 0) {
    lastResolvedReaderPages = {
      mangaId: activeManga.id,
      chapterNum: Number(capitulo.chapterNum ?? 1),
      pages,
      saverPages: Array.isArray(resPages?.saverPages) ? resPages.saverPages : [],
      group: resPages?.group || capitulo.group
    };
  }

  if (resPages?.chapterId && capitulo.id !== resPages.chapterId) capitulo.id = resPages.chapterId;
  if (resPages?.group && capitulo.group !== resPages.group) capitulo.group = resPages.group;
  if (titulo) {
    const scanGroup = isOfflineServed ? 'Offline 💾' : (capitulo.group || (capitulo.source === 'InManga' ? 'InManga Scan 🇪🇸' : 'Oficial'));
    titulo.textContent = `${activeManga?.title || 'Manga'} · Cap. ${capitulo.chapter} (${scanGroup})`;
  }

  if (!pages || pages.length === 0) {
    const cc = mangaUiState.capitulosCache;
    const enFallbackCap = cc?.english
      ? (cc.english.find((c: any) => Math.abs(parseFloat(c.chapterNum) - parseFloat(capitulo.chapterNum)) < 0.001) || cc.english[0])
      : null;
    if (content) {
      content.innerHTML = `
        <div style="text-align:center; padding:50px 20px; color:#94a3b8;">
          <div style="font-size:36px; margin-bottom:12px;">📑</div>
          <div style="font-size:17px; font-weight:700; color:#fff; margin-bottom:8px;">Servidor de Lectura No Disponible</div>
          <div style="font-size:13px; line-height:1.5; color:#cbd5e1; max-width:340px; margin:0 auto 20px;">
            No se pudieron cargar páginas para este capítulo en el idioma seleccionado. Puedes reintentar, cambiar de fuente o abrir explícitamente la versión en Inglés si está disponible.
          </div>
          <div style="display:flex; flex-direction:column; gap:10px; max-width:280px; margin:0 auto;">
            <button class="chip active" style="padding:10px 16px; font-weight:600;" onclick="abrirLectorManga(${mangaUiState.capituloActualIdx})">🔄 Reintentar Carga</button>
            ${enFallbackCap ? `<button class="chip" style="padding:10px 16px; border-color:rgba(255,255,255,0.22); color:#fff;" onclick="cambiarAVersionInglesCapitulo(${enFallbackCap.chapterNum})">🇬🇧 Leer Cap. ${escHtml(enFallbackCap.chapter)} en Inglés</button>` : ''}
            <button class="chip" style="padding:10px 16px;" onclick="mostrarModalFuentesManga()">🌐 Cambiar de Fuente en Mihon</button>
            ${capitulo.externalUrl ? `<button class="chip" style="padding:10px 16px;" onclick="handleOpenExternal('${escHtml(capitulo.externalUrl)}')">📖 Abrir en Portal Oficial (${escHtml(capitulo.group || 'Oficial')})</button>` : ''}
          </div>
        </div>
      `;
    }
    if (pageInd) pageInd.textContent = 'Sin páginas';
    return;
  }

  activeReaderPages = pages;
  activeReaderSaverPages = Array.isArray(resPages?.saverPages) ? resPages.saverPages : [];
  const restorePage = Math.min(pages.length, Math.max(1, savedPageBeforeSave));
  renderActiveMangaReaderPages(restorePage);

  const nextCap = mangaUiState.capitulosLectorList[mangaUiState.capituloActualIdx + 1];
  if (nextCap && activeManga && !isOfflineServed && !isOfflineNow) {
    setTimeout(() => {
      void prefetchCapituloObjetivoManga(activeManga, nextCap);
    }, 500);
  }
}

function buildReaderPageImageHtml(url: string, pNum: number, sUrl = '', isEager = true): string {
  const fastUrl = toFastImgUrl(url);
  const fastSaver = sUrl ? toFastImgUrl(sUrl) : '';
  let inId = '';
  if (url.includes('identification=')) {
    inId = url.split('identification=')[1].split('&')[0];
  }
  return `
    <div class="webtoon-page-wrap" id="page-wrap-${pNum}" style="background:${readerCurrentSettings.bg}; min-height:220px; position:relative;">
      <div class="webtoon-page-skeleton" id="skel-${pNum}">
        <div class="spinner" style="width:28px; height:28px;"></div>
        <span>Cargando página ${pNum}...</span>
      </div>
      <img src="${fastUrl}"
           data-raw-url="${escHtml(url)}"
           data-orig-src="${escHtml(fastUrl)}"
           data-saver-src="${escHtml(fastSaver)}"
           data-inmanga-id="${escHtml(inId)}"
           data-page="${pNum}"
           class="webtoon-page-img"
           id="img-page-${pNum}"
           loading="${isEager ? 'eager' : 'lazy'}"
           ${pNum <= 2 ? 'fetchpriority="high"' : ''}
           decoding="async"
           style="max-width:${readerCurrentSettings.width};"
           onload="this.parentElement.classList.add('loaded'); document.getElementById('skel-${pNum}')?.remove()"
           onerror="handleMangaImgError(this)"/>
    </div>
  `;
}

export function renderActiveMangaReaderPages(restorePage = 1): void {
  const lector = document.getElementById('pantalla-lector');
  const content = document.getElementById('lector-content');
  const pageInd = document.getElementById('lector-page-indicator');
  const spreadControls = document.getElementById('lector-spread-controls');
  if (!content || activeReaderPages.length === 0) return;

  const mode = readerCurrentSettings.mode;
  content.classList.toggle('mode-webtoon', mode === 'webtoon');
  content.classList.toggle('mode-ltr', mode === 'ltr');
  content.classList.toggle('mode-rtl', mode === 'rtl');
  content.classList.toggle('mode-double', mode === 'double');
  content.style.filter = buildReaderFilterCss(readerCurrentSettings.filters);

  applyReaderZoom(1.0);
  initReaderGestures();
  bindReaderKeyboardNavigation();

  continuousChapterArmed = false;
  isContinuousAdvancing = false;
  setTimeout(() => {
    continuousChapterArmed = true;
  }, 750);

  if (mode === 'webtoon') {
    if (spreadControls) spreadControls.classList.add('hide');
    const targetPage = Math.min(activeReaderPages.length, Math.max(1, restorePage));
    content.innerHTML = activeReaderPages
      .map((url, i) => {
        const pNum = i + 1;
        const isEager = pNum <= 4 || Math.abs(pNum - targetPage) <= 2;
        return buildReaderPageImageHtml(url, pNum, activeReaderSaverPages[i] || '', isEager);
      })
      .join('');

    const initialPct = activeReaderPages.length > 0 ? Math.round(((targetPage - 1) / activeReaderPages.length) * 100) : 0;
    if (pageInd) pageInd.textContent = `📄 ${targetPage} / ${activeReaderPages.length} · ${initialPct}%`;
    setupLectorPageObserver(activeReaderPages.length);

    if (targetPage > 1 && lector) {
      requestAnimationFrame(() => {
        const targetWrap = document.getElementById(`page-wrap-${targetPage}`);
        if (targetWrap) {
          lector.scrollTo({ top: Math.max(0, targetWrap.offsetTop - 8), behavior: 'auto' });
          lastTrackedReaderPage = targetPage;
          progressivePreloadReaderPages(targetPage, activeReaderPages.length);
        }
      });
    }
    return;
  }

  // Paginated modes: ltr, rtl, double
  if (lector) lector.onscroll = null;
  if (spreadControls) spreadControls.classList.remove('hide');

  const spreads = buildMangaSpreads(activeReaderPages, mode);
  const targetPage = Math.min(activeReaderPages.length, Math.max(1, restorePage));
  const matchedSpreadIdx = spreads.findIndex((s) => s.pageNumbers.includes(targetPage));
  activeSpreadIndex = matchedSpreadIdx >= 0 ? matchedSpreadIdx : 0;
  renderCurrentSpread();
}

function renderCurrentSpread(): void {
  const content = document.getElementById('lector-content');
  const pageInd = document.getElementById('lector-page-indicator');
  const lector = document.getElementById('pantalla-lector');
  if (!content || activeReaderPages.length === 0) return;

  const spreads = buildMangaSpreads(activeReaderPages, readerCurrentSettings.mode);
  if (spreads.length === 0) return;
  activeSpreadIndex = Math.min(Math.max(0, activeSpreadIndex), spreads.length - 1);
  const spread = spreads[activeSpreadIndex];
  if (!spread) return;

  const isRightToLeftOrder = readerCurrentSettings.mode === 'rtl' || readerCurrentSettings.mode === 'double';
  const pageHtmlList = spread.pageNumbers.map((pNum) =>
    buildReaderPageImageHtml(activeReaderPages[pNum - 1], pNum, activeReaderSaverPages[pNum - 1] || '', true)
  );
  const orderedHtml =
    spread.pageNumbers.length === 2 && isRightToLeftOrder ? [...pageHtmlList].reverse().join('') : pageHtmlList.join('');

  content.innerHTML = `<div class="lector-double-spread ${readerCurrentSettings.mode === 'double' ? 'is-double' : 'is-single'}">${orderedHtml}</div>`;
  if (lector) lector.scrollTo({ top: 0, behavior: 'auto' });

  const currentPage = spread.pageNumbers[0] || 1;
  lastTrackedReaderPage = currentPage;
  const pct = activeReaderPages.length > 0 ? Math.round(((spread.pageNumbers[spread.pageNumbers.length - 1]) / activeReaderPages.length) * 100) : 0;
  if (pageInd) {
    pageInd.textContent = `📖 ${formatSpreadLabel(spread, activeReaderPages.length)} · ${pct}%`;
  }

  const activeManga = getActiveManga();
  const currentCap = mangaUiState.capitulosLectorList[mangaUiState.capituloActualIdx];
  if (activeManga?.id && currentCap) {
    MangaHistoryManager.savePageNumber(activeManga.id, currentCap.chapterNum, currentPage);
  }
}

export function navegarSpreadLector(
  dirKey: 'prev' | 'next' | 'ArrowLeft' | 'ArrowRight',
  event?: Event
): void {
  if (event) event.stopPropagation();
  if (readerCurrentSettings.mode === 'webtoon') return;
  const spreads = buildMangaSpreads(activeReaderPages, readerCurrentSettings.mode);
  if (spreads.length === 0) return;

  const res = stepSpreadIndex(activeSpreadIndex, spreads.length, dirKey, readerCurrentSettings.mode);
  if (res.boundary === 'end') {
    if (readerCurrentSettings.continuousChapter && mangaUiState.capituloActualIdx + 1 < mangaUiState.capitulosLectorList.length) {
      navegarCapituloLector(1);
    } else {
      mostrarToast('Has llegado al final del capítulo');
    }
    return;
  }
  if (res.boundary === 'start') {
    if (readerCurrentSettings.continuousChapter && mangaUiState.capituloActualIdx > 0) {
      navegarCapituloLector(-1);
    } else {
      mostrarToast('Estás en la primera página');
    }
    return;
  }
  activeSpreadIndex = res.nextIndex;
  renderCurrentSpread();
}

function bindReaderKeyboardNavigation(): void {
  if (nWin._nyMangaReaderKeyBound) return;
  nWin._nyMangaReaderKeyBound = true;
  document.addEventListener('keydown', (e) => {
    const lector = document.getElementById('pantalla-lector');
    if (!lector || lector.classList.contains('hide')) return;
    if (readerCurrentSettings.mode === 'webtoon') return;
    const tag = String(document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      navegarSpreadLector(e.key);
    }
  });
}

export async function handleMangaImgError(imgEl: HTMLImageElement): Promise<void> {
  if (!imgEl) return;
  const p = parseInt(imgEl.dataset.page || '1', 10) || 1;
  const currentCap = mangaUiState.capitulosLectorList[mangaUiState.capituloActualIdx] || null;
  const activeManga = getActiveManga();
  const title = activeManga?.title || '';
  const chap = (currentCap?.chapterNum !== undefined && currentCap?.chapterNum !== null)
    ? (parseFloat(currentCap.chapterNum) || 0)
    : 1;
  const rawUrl = imgEl.dataset.rawUrl || imgEl.src;

  if (!imgEl.dataset.inmangaId && rawUrl.includes('identification=')) {
    imgEl.dataset.inmangaId = rawUrl.split('identification=')[1].split('&')[0];
  }
  const inmangaId = imgEl.dataset.inmangaId;

  // ManhwaWeb CDN mirror failover (img1mw.xyz <-> img2mw.xyz)
  if ((rawUrl.includes('img1mw.xyz') || rawUrl.includes('img2mw.xyz')) && !imgEl.dataset.triedMwMirror) {
    imgEl.dataset.triedMwMirror = '1';
    const altMirrorUrl = rawUrl.includes('img1mw.xyz')
      ? rawUrl.replace('img1mw.xyz', 'img2mw.xyz')
      : rawUrl.replace('img2mw.xyz', 'img1mw.xyz');
    imgEl.src = toFastImgUrl(altMirrorUrl);
    return;
  }

  if (inmangaId || rawUrl.includes('intomanga.com') || rawUrl.includes('inmanga.com')) {
    const mirrorStep = parseInt(imgEl.dataset.inmangaStep || '0', 10);
    if (inmangaId && mirrorStep < 4) {
      imgEl.dataset.inmangaStep = String(mirrorStep + 1);
      if (mirrorStep === 0) {
        imgEl.src = toFastImgUrl(`https://pack.intomanga.com/i/m/cdn/c/cdn/o/${inmangaId}.jpg`);
        return;
      } else if (mirrorStep === 1) {
        imgEl.src = toFastImgUrl(`https://cdn1.intomanga.com/i/m/cdn/c/cdn/o/${inmangaId}.jpg`);
        return;
      } else if (mirrorStep === 2) {
        imgEl.src = toFastImgUrl(`https://cdn2.intomanga.com/i/m/cdn/c/cdn/o/${inmangaId}.jpg`);
        return;
      } else if (mirrorStep === 3) {
        imgEl.src = toFastImgUrl(`https://inmanga.com/page/getPageImage/?identification=${inmangaId}&t=${Date.now()}`);
        return;
      }
    }
  }

  if (rawUrl.includes('mangadex') || rawUrl.includes('mangadex.network') || imgEl.dataset.saverSrc) {
    if (imgEl.dataset.saverSrc && !imgEl.dataset.triedSaver && imgEl.dataset.saverSrc !== imgEl.src) {
      imgEl.dataset.triedSaver = '1';
      imgEl.src = imgEl.dataset.saverSrc;
      return;
    }
    if (!imgEl.dataset.triedMasterOrigin) {
      imgEl.dataset.triedMasterOrigin = '1';
      const pathMatch = rawUrl.match(/\/(data|data-saver)\/([^\/]+)\/(.+)$/);
      if (pathMatch) {
        const masterUrl = `https://uploads.mangadex.org/${pathMatch[1]}/${pathMatch[2]}/${pathMatch[3].split('?')[0]}`;
        imgEl.src = toFastImgUrl(masterUrl);
        return;
      }
    }
    if (!imgEl.dataset.triedDirectNoRef && rawUrl.startsWith('http')) {
      imgEl.dataset.triedDirectNoRef = '1';
      imgEl.referrerPolicy = 'no-referrer';
      imgEl.src = rawUrl;
      return;
    }
    if (!imgEl.dataset.triedFreshNode && currentCap?.id && String(currentCap.id).includes('-') && !String(currentCap.id).startsWith('inmanga_') && !String(currentCap.id).startsWith('mweb_')) {
      imgEl.dataset.triedFreshNode = '1';
      try {
        const freshServer = await nativeFetchJson(`https://api.mangadex.org/at-home/server/${currentCap.id}?forcePort443=true`);
        if (freshServer?.baseUrl) {
          const urlPathMatch = rawUrl.match(/\/(data|data-saver)\/[^\/]+\/.+$/);
          if (urlPathMatch) {
            imgEl.src = toFastImgUrl(freshServer.baseUrl + urlPathMatch[0]);
            return;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  const retries = parseInt(imgEl.dataset.retries || '0', 10);
  if (retries < 1) {
    imgEl.dataset.retries = String(retries + 1);
    setTimeout(() => {
      if (imgEl?.isConnected) {
        const baseSrc = (imgEl.dataset.origSrc || imgEl.src).split('&t=')[0];
        imgEl.src = baseSrc + (baseSrc.includes('?') ? '&t=' : '?t=') + Date.now();
      }
    }, 450);
    return;
  }

  const contentEl = document.getElementById('lector-content');
  if (p === 1 && contentEl && contentEl.dataset.triedEsFallback !== '1') {
    contentEl.dataset.triedEsFallback = '1';
    const normLangFn = nWin.NyAnimeMangaLang?.normalizeMangaLang || ((l: string) => {
      const s = String(l || '').trim().toLowerCase();
      if (s === 'es' || s === 'es-la' || s === 'es-es' || s === 'es-419') return 'es';
      if (s === 'en' || s.startsWith('en-')) return 'en';
      return s || 'es';
    });
    const activeTabLang = mangaUiState.idiomaMangaSeleccionado || 'es';
    const capLang = currentCap?.lang ? normLangFn(currentCap.lang) : (activeTabLang === 'all' ? 'all' : normLangFn(activeTabLang));
    const sameLangOnly = (v: any) => {
      if (!v || !v.id || v.externalUrl) return false;
      if (!(v.pages > 0 || v.pages === undefined)) return false;
      if (activeTabLang === 'all') return true;
      return normLangFn(v.lang) === capLang;
    };

    if (currentCap && Array.isArray(currentCap.otherVersions) && currentCap.otherVersions.length > 0) {
      const nextVerIdx = currentCap.otherVersions.findIndex(sameLangOnly);
      if (nextVerIdx >= 0) {
        const nextVer = currentCap.otherVersions.splice(nextVerIdx, 1)[0];
        currentCap.id = nextVer.id;
        currentCap.group = nextVer.group || 'Alternativo';
        currentCap.pages = nextVer.pages;
        currentCap.lang = nextVer.lang || currentCap.lang;
        currentCap.externalUrl = nextVer.externalUrl;
        if (nextVer.group) mostrarToast(`Cambiando a versión de ${nextVer.group}...`, 'info');
        void abrirLectorManga(mangaUiState.capituloActualIdx);
        return;
      }
    }

    if (capLang === 'es' || activeTabLang === 'all') {
      const alreadyManhwaWeb = String(currentCap?.id || '').startsWith('mweb_') || String(currentCap?.group || '').includes('ManhwaWeb');
      const alreadyInManga = String(currentCap?.id || '').startsWith('inmanga_') || String(currentCap?.group || '').includes('InManga');
      try {
        let esPages: string[] = [];
        let esGroupLabel = '';
        if (!alreadyManhwaWeb) {
          esPages = await ManhwaWebProvider.getPagesForChapter(title, chap, activeManga?.altTitles);
          esGroupLabel = 'ManhwaWeb ES 🇪🇸';
        }
        if ((!esPages || esPages.length === 0) && !alreadyInManga) {
          esPages = await InMangaProvider.getPagesForChapter(title, chap, activeManga?.altTitles);
          esGroupLabel = 'InManga Scan 🇪🇸';
        }
        if (esPages?.length > 0) {
          mostrarToast(`Cargando capítulo desde ${esGroupLabel}...`, 'info');
          if (currentCap) {
            currentCap.group = esGroupLabel;
            currentCap.lang = 'es';
          }
          if (activeManga?.id) {
            lastResolvedReaderPages = {
              mangaId: activeManga.id,
              chapterNum: Number(currentCap?.chapterNum ?? chap ?? 1),
              pages: esPages,
              saverPages: [],
              group: esGroupLabel
            };
          }
          activeReaderPages = esPages;
          activeReaderSaverPages = [];
          renderActiveMangaReaderPages(1);
          return;
        }
      } catch {
        // ignore
      }
    }
  }

  document.getElementById(`skel-${p}`)?.remove();
  const wrap = imgEl.closest('.webtoon-page-wrap') as HTMLElement | null;
  if (wrap) {
    wrap.style.display = 'none';
    const visibleWraps = Array.from(document.querySelectorAll('.webtoon-page-wrap')).filter(
      w => (w as HTMLElement).style.display !== 'none'
    );
    const pageInd = document.getElementById('lector-page-indicator');
    if (pageInd && visibleWraps.length > 0) {
      pageInd.textContent = `📄 1 / ${visibleWraps.length} · 0%`;
    } else if (visibleWraps.length === 0 && contentEl) {
      contentEl.innerHTML = `
        <div style="text-align:center; padding:50px 20px; color:#94a3b8;">
          <div style="font-size:36px; margin-bottom:12px;">📑</div>
          <div style="font-size:17px; font-weight:700; color:#fff; margin-bottom:8px;">No se pudieron cargar las imágenes</div>
          <div style="font-size:13px; line-height:1.5; color:#cbd5e1; max-width:340px; margin:0 auto 20px;">
            El servidor de imágenes está ocupado o temporalmente inaccesible. Reintenta o cambia de servidor.
          </div>
          <div style="display:flex; flex-direction:column; gap:10px; max-width:260px; margin:0 auto;">
            <button class="chip active" style="padding:10px 16px; font-weight:600;" onclick="abrirLectorManga(${mangaUiState.capituloActualIdx})">🔄 Reintentar Capítulo</button>
            <button class="chip" style="padding:10px 16px;" onclick="mostrarModalFuentesManga()">🌐 Cambiar Fuente</button>
          </div>
        </div>
      `;
    }
  }
}

export function toggleLectorHUD(event?: Event): void {
  const target = event?.target as HTMLElement | null;
  if (target && (target.closest('button') || target.closest('.mihon-quick-caps-sheet') || target.closest('.chip'))) {
    return;
  }
  if (readerZoomLevel > 1.05) {
    applyReaderZoom(1.0);
    return;
  }
  lectorHudVisible = !lectorHudVisible;
  const topBar = document.getElementById('lector-header-bar');
  const bottomHud = document.getElementById('lector-floating-hud');
  if (topBar) {
    topBar.classList.toggle('hidden', !lectorHudVisible);
    topBar.classList.toggle('hud-hidden', !lectorHudVisible);
  }
  if (bottomHud) {
    bottomHud.classList.toggle('hidden', !lectorHudVisible);
    bottomHud.classList.toggle('hud-hidden', !lectorHudVisible);
  }
}

export function initReaderGestures(): void {
  const lector = document.getElementById('pantalla-lector');
  const content = document.getElementById('lector-content');
  if (!lector || !content || lector.dataset.gesturesInit) return;
  lector.dataset.gesturesInit = '1';

  lector.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      readerInitialPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      readerInitialZoom = readerZoomLevel;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - readerLastTapTime < 300) {
        e.preventDefault();
        toggleReaderDoubleTapZoom(e.touches[0].clientX, e.touches[0].clientY);
        readerLastTapTime = 0;
        return;
      }
      readerLastTapTime = now;
    }
  }, { passive: false });

  lector.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && readerInitialPinchDist > 0) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const newZoom = Math.max(1.0, Math.min(3.0, readerInitialZoom * (dist / readerInitialPinchDist)));
      applyReaderZoom(newZoom);
    }
  }, { passive: false });

  lector.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) readerInitialPinchDist = 0;
  });
}

export function toggleReaderDoubleTapZoom(tapX: number, tapY: number): void {
  if (readerZoomLevel > 1.1) applyReaderZoom(1.0);
  else applyReaderZoom(1.8, tapX, tapY);
}

export function applyReaderZoom(zoom: number, originX?: number, originY?: number): void {
  readerZoomLevel = Math.round(zoom * 100) / 100;
  const content = document.getElementById('lector-content');
  if (!content) return;
  if (readerZoomLevel <= 1.02) {
    readerZoomLevel = 1.0;
    content.style.transform = '';
    content.style.transformOrigin = '50% 50%';
  } else {
    if (originX !== undefined && originY !== undefined) {
      const rect = content.getBoundingClientRect();
      const relX = ((originX - rect.left) / rect.width) * 100;
      const relY = ((originY - rect.top) / rect.height) * 100;
      content.style.transformOrigin = `${Math.max(10, Math.min(90, relX))}% ${Math.max(10, Math.min(90, relY))}%`;
    }
    content.style.transform = `scale(${readerZoomLevel})`;
  }
}

export function setupLectorPageObserver(totalPages: number): void {
  const lector = document.getElementById('pantalla-lector');
  const pageInd = document.getElementById('lector-page-indicator');
  if (!lector || !pageInd) return;

  lector.onscroll = () => {
    const scrollTop = lector.scrollTop;
    const scrollHeight = lector.scrollHeight - lector.clientHeight;
    const progress = scrollHeight > 0 ? Math.min(100, Math.round((scrollTop / scrollHeight) * 100)) : 0;

    const pageWraps = lector.querySelectorAll('.webtoon-page-wrap');
    let currentPage = 1;
    for (let i = 0; i < pageWraps.length; i++) {
      const rect = pageWraps[i].getBoundingClientRect();
      if (rect.top <= window.innerHeight * 0.45 && rect.bottom >= window.innerHeight * 0.1) {
        currentPage = i + 1;
        break;
      }
    }

    lastTrackedReaderPage = currentPage;
    const currentTotal = pageWraps.length;
    pageInd.textContent = `📄 ${currentPage} / ${currentTotal} · ${progress}%`;

    const now = Date.now();
    if (now - lastSavedPageWriteAt >= 800) {
      lastSavedPageWriteAt = now;
      const activeManga = getActiveManga();
      const currentCap = mangaUiState.capitulosLectorList[mangaUiState.capituloActualIdx];
      if (activeManga?.id && currentCap) {
        MangaHistoryManager.savePageNumber(activeManga.id, currentCap.chapterNum, currentPage);
      }
    }

    progressivePreloadReaderPages(currentPage, currentTotal);

    if (
      readerCurrentSettings.mode === 'webtoon' &&
      readerCurrentSettings.continuousChapter &&
      continuousChapterArmed &&
      !isContinuousAdvancing &&
      scrollHeight > 120 &&
      scrollTop >= scrollHeight - 24 &&
      mangaUiState.capituloActualIdx + 1 < mangaUiState.capitulosLectorList.length
    ) {
      isContinuousAdvancing = true;
      const nextIdx = mangaUiState.capituloActualIdx + 1;
      const nextCap = mangaUiState.capitulosLectorList[nextIdx];
      mostrarToast(`📖 Cargando siguiente capítulo (Cap. ${nextCap?.chapter || nextIdx + 1})...`, 'info');
      setTimeout(() => {
        void abrirLectorManga(nextIdx);
      }, 320);
    }
  };

  progressivePreloadReaderPages(1, totalPages);
}

export function progressivePreloadReaderPages(currentIndex: number, totalPages: number): void {
  for (let i = 1; i <= 4; i++) {
    const targetPage = currentIndex + i;
    if (targetPage > totalPages) break;
    const img = document.getElementById(`img-page-${targetPage}`) as HTMLImageElement | null;
    if (img) {
      if (img.getAttribute('loading') === 'lazy') img.setAttribute('loading', 'eager');
      if (img.src && !img.complete && !img.dataset.preloaded) {
        img.dataset.preloaded = '1';
        const warmer = new Image();
        warmer.src = img.src;
      }
    }
  }
}

export function navegarCapituloLector(dir: number, event?: Event): void {
  if (event) event.stopPropagation();
  const nextIdx = mangaUiState.capituloActualIdx + dir;
  if (nextIdx >= 0 && nextIdx < mangaUiState.capitulosLectorList.length) {
    void abrirLectorManga(nextIdx);
  } else {
    mostrarToast(dir > 0 ? 'Has llegado al último capítulo disponible' : 'Estás en el primer capítulo', 'info');
  }
}

export function abrirQuickCapsSheet(event?: Event): void {
  if (event) event.stopPropagation();
  const sheet = document.getElementById('mihon-quick-caps-sheet');
  if (sheet) {
    populateQuickCapsSheet();
    sheet.classList.add('open');
  }
}

export function cerrarQuickCapsSheet(): void {
  document.getElementById('mihon-quick-caps-sheet')?.classList.remove('open');
}

export function populateQuickCapsSheet(): void {
  const list = document.getElementById('mihon-quick-caps-list');
  const title = document.getElementById('quick-caps-sheet-title');
  if (!list) return;
  if (title) title.textContent = `Capítulos (${mangaUiState.capitulosLectorList.length})`;

  const renderRows = (cachedSet: Set<string>) => {
    list.innerHTML = mangaUiState.capitulosLectorList.map((c, i) => {
      const isActive = i === mangaUiState.capituloActualIdx;
      const isCached = cachedSet.has(String(Number(c.chapterNum ?? 0)));
      return `
        <div class="mihon-quick-cap-item ${isActive ? 'active' : ''}" onclick="saltarACapituloDesdeSheet(${i})">
          <span>${isCached ? '💾 ' : ''}Capítulo ${escHtml(c.chapter)} ${c.title ? `· ${escHtml(c.title)}` : ''}</span>
          <span>${isActive ? 'Leyendo ▶' : (isCached ? 'Offline ✓' : (c.pages ? `${c.pages}p` : ''))}</span>
        </div>
      `;
    }).join('');
  };

  renderRows(new Set());
  const activeManga = getActiveManga();
  if (activeManga) {
    void getOfflineMangaChaptersForSeries([activeManga.id, activeManga.dexId]).then((manifests) => {
      if (!list.isConnected) return;
      const cachedSet = new Set(manifests.map((m) => String(Number(m.chapterNum ?? 0))));
      renderRows(cachedSet);
    });
  }
}

export function saltarACapituloDesdeSheet(idx: number): void {
  cerrarQuickCapsSheet();
  void abrirLectorManga(idx);
}

export function abrirAjustesLector(event?: Event): void {
  if (event) event.stopPropagation();
  document.getElementById('mihon-reader-settings-sheet')?.classList.add('open');
}

export function cerrarAjustesLector(): void {
  document.getElementById('mihon-reader-settings-sheet')?.classList.remove('open');
}

export function persistReaderSettings(skipCloud = false): void {
  try {
    localStorage.setItem('nyanime_reader_settings_v1', JSON.stringify(readerCurrentSettings));
  } catch {
    // ignore
  }
  if (!skipCloud && nWin.firebaseSync?.saveReaderSettings) {
    nWin.firebaseSync.saveReaderSettings(readerCurrentSettings).catch(() => {});
  }
}

export function applyReaderSettingsFromCloud(settings: any): void {
  if (!settings) return;
  if (settings.mode) setReaderMode(settings.mode, true);
  if (settings.bg) setReaderBg(settings.bg, true);
  if (settings.width) setReaderWidth(settings.width, true);
  if (typeof settings.continuousChapter === 'boolean') {
    setReaderContinuousChapter(settings.continuousChapter, true);
  }
  if (settings.filters && typeof settings.filters === 'object') {
    readerCurrentSettings.filters = clampNightFilters(settings.filters);
    syncReaderFilterControlsUI();
  }
  persistReaderSettings(true);
}

export function loadSavedReaderSettings(): void {
  try {
    const raw = localStorage.getItem('nyanime_reader_settings_v1');
    if (raw) {
      applyReaderSettingsFromCloud(JSON.parse(raw));
    } else {
      syncReaderFilterControlsUI();
    }
  } catch {
    syncReaderFilterControlsUI();
  }
}

export function getReaderSettings() {
  return {
    ...readerCurrentSettings,
    filters: { ...readerCurrentSettings.filters }
  };
}

function syncReaderFilterControlsUI(): void {
  const f = clampNightFilters(readerCurrentSettings.filters);
  const content = document.getElementById('lector-content');
  if (content) content.style.filter = buildReaderFilterCss(f);

  const bSlider = document.getElementById('reader-brightness-slider') as HTMLInputElement | null;
  const cSlider = document.getElementById('reader-contrast-slider') as HTMLInputElement | null;
  const sSlider = document.getElementById('reader-sepia-slider') as HTMLInputElement | null;
  const bVal = document.getElementById('reader-brightness-val');
  const cVal = document.getElementById('reader-contrast-val');
  const sVal = document.getElementById('reader-sepia-val');
  const contToggle = document.getElementById('reader-continuous-toggle') as HTMLInputElement | null;

  if (bSlider) bSlider.value = String(f.brightness);
  if (cSlider) cSlider.value = String(f.contrast);
  if (sSlider) sSlider.value = String(f.sepia);
  if (bVal) bVal.textContent = `${f.brightness}%`;
  if (cVal) cVal.textContent = `${f.contrast}%`;
  if (sVal) sVal.textContent = `${f.sepia}%`;
  if (contToggle) contToggle.checked = Boolean(readerCurrentSettings.continuousChapter);
}

export function setReaderMode(mode: string, skipCloud = false): void {
  const cleanMode = normalizeMangaReaderMode(mode);
  const prevMode = readerCurrentSettings.mode;
  readerCurrentSettings.mode = cleanMode;
  const content = document.getElementById('lector-content');
  if (content) {
    content.classList.toggle('mode-webtoon', cleanMode === 'webtoon');
    content.classList.toggle('mode-ltr', cleanMode === 'ltr');
    content.classList.toggle('mode-rtl', cleanMode === 'rtl');
    content.classList.toggle('mode-double', cleanMode === 'double');
  }
  document.querySelectorAll('#mode-webtoon-btn, #mode-ltr-btn, #mode-rtl-btn, #mode-double-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`mode-${cleanMode}-btn`)?.classList.add('active');

  const lector = document.getElementById('pantalla-lector');
  const isReaderOpen = Boolean(lector && !lector.classList.contains('hide'));
  if (isReaderOpen && activeReaderPages.length > 0 && prevMode !== cleanMode) {
    renderActiveMangaReaderPages(lastTrackedReaderPage || 1);
  }

  persistReaderSettings(skipCloud);
  if (!skipCloud) {
    const labelMap: Record<MangaReaderMode, string> = {
      webtoon: '📜 Modo Webtoon Continuo Activado',
      ltr: '📖 Paginado Izquierda → Derecha',
      rtl: '🇯🇵 Manga Tradicional Derecha → Izquierda',
      double: '📖 Lectura Doble Página (Manga)'
    };
    mostrarToast(labelMap[cleanMode], 'success');
  }
}

export function setReaderContinuousChapter(enabled: boolean, skipCloud = false): void {
  readerCurrentSettings.continuousChapter = Boolean(enabled);
  const toggle = document.getElementById('reader-continuous-toggle') as HTMLInputElement | null;
  if (toggle) toggle.checked = readerCurrentSettings.continuousChapter;
  persistReaderSettings(skipCloud);
  if (!skipCloud) {
    mostrarToast(
      readerCurrentSettings.continuousChapter
        ? 'Lectura continua entre capítulos activada ✓'
        : 'Lectura continua desactivada',
      'info'
    );
  }
}

export function setReaderFilter(key: 'brightness' | 'contrast' | 'sepia', value: number | string, skipCloud = false): void {
  const num = Number(value);
  readerCurrentSettings.filters = clampNightFilters({
    ...readerCurrentSettings.filters,
    [key]: Number.isFinite(num) ? num : 100
  });
  syncReaderFilterControlsUI();
  persistReaderSettings(skipCloud);
}

export function resetReaderFilters(skipCloud = false): void {
  readerCurrentSettings.filters = { ...DEFAULT_NIGHT_FILTERS };
  syncReaderFilterControlsUI();
  persistReaderSettings(skipCloud);
  if (!skipCloud) mostrarToast('Filtros nocturnos restablecidos', 'info');
}

export function setReaderBg(color: string, skipCloud = false): void {
  readerCurrentSettings.bg = color;
  const lector = document.getElementById('pantalla-lector');
  const content = document.getElementById('lector-content');
  if (lector) lector.style.backgroundColor = color;
  if (content) content.style.backgroundColor = color;
  document.querySelectorAll('#bg-oled-btn, #bg-dark-btn, #bg-light-btn').forEach(b => b.classList.remove('active'));
  if (color === '#000000') document.getElementById('bg-oled-btn')?.classList.add('active');
  else if (color === '#0d1117') document.getElementById('bg-dark-btn')?.classList.add('active');
  else if (color === '#ffffff') document.getElementById('bg-light-btn')?.classList.add('active');
  persistReaderSettings(skipCloud);
}

export function setReaderWidth(w: string, skipCloud = false): void {
  readerCurrentSettings.width = w;
  const content = document.getElementById('lector-content');
  if (content) content.style.maxWidth = w === '100%' ? '100%' : '800px';
  document.querySelectorAll('.webtoon-page-img').forEach(img => {
    (img as HTMLElement).style.maxWidth = w === '100%' ? '100%' : '800px';
  });
  document.querySelectorAll('#width-full-btn, #width-800-btn').forEach(b => b.classList.remove('active'));
  if (w === '100%') document.getElementById('width-full-btn')?.classList.add('active');
  else document.getElementById('width-800-btn')?.classList.add('active');
  persistReaderSettings(skipCloud);
}

export function cerrarLector(): void {
  flushMangaReaderPage();
  applyReaderZoom(1.0);
  const content = document.getElementById('lector-content');
  if (content) content.innerHTML = '';
  activeReaderPages = [];
  activeReaderSaverPages = [];
  continuousChapterArmed = false;
  document.getElementById('lector-spread-controls')?.classList.add('hide');
  revokeActiveReaderBlobUrls();
  readerCurrentOfflineManifestId = null;
  document.getElementById('pantalla-lector')?.classList.add('hide');
  const pantalla = document.getElementById('pantalla-detalle-manga');
  const activeManga = getActiveManga();
  if (pantalla && activeManga) {
    pantalla.classList.remove('hide');
    if (mangaUiState.capitulosCache) {
      void refreshOfflineMangaDetailState(activeManga).then(() => {
        renderCapitulosMangaModal();
      });
    }
  }
  if (nWin.Store?.setActiveChapter) nWin.Store.setActiveChapter(null);
}
