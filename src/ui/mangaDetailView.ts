import {
  DownloadManager,
  MangaFavoritesManager,
  MangaReadStateManager,
  escHtml,
  generarPortadaSVG,
  getActiveManga,
  mostrarToast,
  nWin,
  setActiveManga,
  showToast,
  toFastImgUrl,
  uiHooks
} from './appState.ts';
import {
  FallbackMangaProvider,
  MangaDex,
  MangaSourceManager,
  MangaSpanishMetadata,
  mangaUiState
} from './mangaCatalogView.ts';

let mangaDownloadAbortCtrl: AbortController | null = null;

export function updateMangaFavoriteButton(mangaId: number | string): void {
  const isFav = MangaFavoritesManager.isFavorite(mangaId);
  const btnHeader = document.getElementById('manga-det-fav-btn');
  const btnGridText = document.getElementById('mihon-btn-library-text');
  const btnGrid = document.getElementById('mihon-btn-library');

  if (btnHeader) {
    btnHeader.style.color = isFav ? 'var(--primary)' : '#fff';
    btnHeader.classList.toggle('active', isFav);
  }
  if (btnGridText) btnGridText.textContent = isFav ? 'En Biblioteca' : 'Biblioteca';
  if (btnGrid) {
    btnGrid.style.color = isFav ? 'var(--primary)' : '#fff';
    btnGrid.style.borderColor = isFav ? 'rgba(255, 26, 64, 0.4)' : 'rgba(255, 255, 255, 0.08)';
  }
}

export function toggleMangaFavoritoActual(): void {
  const activeManga = getActiveManga();
  if (!activeManga) return;
  MangaFavoritesManager.toggle(activeManga);
  updateMangaFavoriteButton(activeManga.id);
}

export function toggleSynopsisExpand(): void {
  const syn = document.getElementById('manga-det-sinopsis');
  const btn = document.getElementById('mihon-synopsis-toggle');
  if (!syn || !btn) return;
  const isExpanded = syn.classList.toggle('expanded');
  btn.textContent = isExpanded ? 'Leer menos ▴' : 'Leer más ▾';
}

export function toggleMarcarTodosLeidos(): void {
  const activeManga = getActiveManga();
  if (!activeManga || !mangaUiState.mangaFullFilteredList.length) return;
  const allNums = mangaUiState.mangaFullFilteredList.map(c => c.chapterNum);
  const isAllRead = allNums.every(n => MangaReadStateManager.isRead(activeManga.id, n));

  MangaReadStateManager.markAll(activeManga.id, allNums, !isAllRead);
  mostrarToast(!isAllRead ? 'Todos los capítulos marcados como leídos ✓' : 'Capítulos marcados como no leídos', 'success');
  renderCapitulosMangaModal();
}

export function toggleMarcarCapituloLeido(chapterNum: number | string, event?: Event): void {
  if (event) event.stopPropagation();
  const activeManga = getActiveManga();
  if (!activeManga) return;
  const isRead = MangaReadStateManager.toggleRead(activeManga.id, chapterNum);
  renderCapitulosMangaModal();
  mostrarToast(isRead ? `Cap. ${chapterNum} marcado como leído ✓` : `Cap. ${chapterNum} marcado como no leído`, 'info');
}

export function mostrarModalFuentesManga(): void {
  const modal = document.getElementById('modal-selector-fuentes-mihon');
  if (!modal) return;
  MangaSourceManager.renderSourcesList();
  modal.classList.add('active', 'open');
}

export function cerrarModalFuentesManga(event?: Event): void {
  if (event && event.target && event.target !== event.currentTarget) return;
  document.getElementById('modal-selector-fuentes-mihon')?.classList.remove('active', 'open');
}

export async function seleccionarFuenteManga(sourceId: string): Promise<void> {
  cerrarModalFuentesManga();
  const activeManga = getActiveManga();
  if (!activeManga) return;

  activeManga.preferredSource = sourceId;
  const srcObj = MangaSourceManager.getSource(sourceId);
  activeManga.source = srcObj.name;
  setActiveManga(activeManga);

  const sourceNameEl = document.getElementById('mihon-active-source-name');
  if (sourceNameEl) sourceNameEl.textContent = srcObj.name;

  mostrarToast(`Cambiando a fuente ${srcObj.name}...`, 'info');
  const container = document.getElementById('manga-det-capitulos');
  if (container) container.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  mangaUiState.capitulosCache = await MangaDex.getChapters(
    activeManga.dexId,
    activeManga.title,
    sourceId,
    () => {
      actualizarConteosIdiomaTabs();
      renderCapitulosMangaModal();
    }
  );
  actualizarConteosIdiomaTabs();
  renderCapitulosMangaModal();
}

export function abrirModalDescargaManga(): void {
  const modal = document.getElementById('modal-descarga-manga-mihon');
  const optContainer = document.getElementById('mihon-download-options');
  if (!modal || !optContainer) return;

  const totalCaps = mangaUiState.mangaFullFilteredList.length;
  optContainer.innerHTML = `
    <div class="mihon-dl-option-card" onclick="iniciarDescargaCapitulos(5)">
      <div>
        <div class="mihon-dl-option-title">📥 Descargar próximos 5 capítulos</div>
        <div class="mihon-dl-option-sub">Guarda los siguientes 5 capítulos en memoria para leer sin internet.</div>
      </div>
      <button class="chip active">Descargar</button>
    </div>
    <div class="mihon-dl-option-card" onclick="iniciarDescargaCapitulos(15)">
      <div>
        <div class="mihon-dl-option-title">📥 Descargar lote de 15 capítulos</div>
        <div class="mihon-dl-option-sub">Ideal para viajes o transporte público sin cobertura.</div>
      </div>
      <button class="chip active">Descargar</button>
    </div>
    <div class="mihon-dl-option-card" onclick="iniciarDescargaCapitulos(${totalCaps})">
      <div>
        <div class="mihon-dl-option-title">⚡ Descargar todo el manga (${totalCaps} caps)</div>
        <div class="mihon-dl-option-sub">Guarda la serie completa en este idioma en tu dispositivo.</div>
      </div>
      <button class="chip active">Descargar Todo</button>
    </div>
  `;
  modal.classList.add('active', 'open');
}

export function cerrarModalDescargasManga(event?: Event): void {
  if (event && event.target && event.target !== event.currentTarget) return;
  document.getElementById('modal-descarga-manga-mihon')?.classList.remove('active', 'open');
}

export function cancelarDescargaManga(): void {
  if (mangaDownloadAbortCtrl) {
    mangaDownloadAbortCtrl.abort();
    mangaDownloadAbortCtrl = null;
  }
  document.getElementById('manga-dl-progress-box')?.classList.add('hide');
}

export async function iniciarDescargaCapitulos(count: number): Promise<void> {
  const list = mangaUiState.mangaFullFilteredList || [];
  const activeManga = getActiveManga();
  if (!activeManga || list.length === 0) {
    showToast('No hay capítulos disponibles para descargar.');
    return;
  }
  if (!nWin.NyAnimeOffline?.downloadMangaChapterOffline) {
    showToast('Motor offline no inicializado.');
    return;
  }

  const toDownload = list.slice(0, Math.min(count, list.length));
  if (mangaDownloadAbortCtrl) mangaDownloadAbortCtrl.abort();
  mangaDownloadAbortCtrl = new AbortController();

  const progressBox = document.getElementById('manga-dl-progress-box');
  const progressText = document.getElementById('manga-dl-progress-text');
  const progressBar = document.getElementById('manga-dl-progress-bar');
  progressBox?.classList.remove('hide');
  if (progressBar) progressBar.style.width = '4%';
  if (progressText) progressText.textContent = `Resolviendo páginas de ${toDownload.length} capítulo(s)...`;

  let savedCount = 0;
  try {
    for (let cIdx = 0; cIdx < toDownload.length; cIdx++) {
      if (mangaDownloadAbortCtrl.signal.aborted) break;
      const cap = toDownload[cIdx];
      if (progressText) {
        progressText.textContent = `Cap. ${cap.chapter} (${cIdx + 1}/${toDownload.length}): Resolviendo servidor...`;
      }
      const resPages = await MangaDex.getChapterPages(cap, activeManga.title, cap.chapterNum);
      const pageUrls = resPages?.pages?.length > 0 ? resPages.pages : (resPages?.saverPages || []);
      if (!pageUrls || pageUrls.length === 0) {
        throw new Error(`No se encontraron páginas descargables para Cap. ${cap.chapter}`);
      }

      await nWin.NyAnimeOffline.downloadMangaChapterOffline({
        mangaId: activeManga.id,
        mangaTitle: activeManga.title || 'Manga',
        cover: activeManga.cover || '',
        chapterNum: Number(cap.chapterNum ?? 1),
        chapterLabel: String(cap.chapter ?? cap.chapterNum ?? 1),
        pageUrls,
        chapterIndex: cIdx,
        totalChapters: toDownload.length,
        signal: mangaDownloadAbortCtrl.signal,
        onProgress: (p: any) => {
          const overallPct = Math.round(((cIdx + p.pageIndex / p.totalPages) / toDownload.length) * 100);
          if (progressBar) progressBar.style.width = `${overallPct}%`;
          if (progressText) {
            progressText.textContent = `Cap. ${p.chapterLabel} (${cIdx + 1}/${p.totalChapters}) · Página ${p.pageIndex} de ${p.totalPages} descargada`;
          }
        }
      });
      savedCount++;
    }

    if (!mangaDownloadAbortCtrl.signal.aborted) {
      await DownloadManager.updateBadge();
      cerrarModalDescargasManga();
      showToast(`✓ ${savedCount} capítulo(s) guardados en almacenamiento offline real.`);
    }
  } catch (err: any) {
    if (err && err.name === 'AbortError') showToast('Descarga cancelada.');
    else showToast(`Error descargando: ${err?.message || err}`);
  } finally {
    progressBox?.classList.add('hide');
    if (progressBar) progressBar.style.width = '0%';
    mangaDownloadAbortCtrl = null;
  }
}

export function actualizarConteosIdiomaTabs(): void {
  const c = mangaUiState.capitulosCache;
  if (!c) return;
  const map: [string, number][] = [
    ['es', c.spanish ? c.spanish.length : 0],
    ['en', c.english ? c.english.length : 0],
    ['ja', c.japanese ? c.japanese.length : 0],
    ['ko', c.korean ? c.korean.length : 0],
    ['all', c.all ? c.all.length : 0]
  ];
  for (const [k, count] of map) {
    const el = document.getElementById(`count-lang-${k}`);
    if (el) el.textContent = String(count);
  }
}

export function prewarmMangaImages(resPages: any, maxCount = 3): void {
  if (!resPages) return;
  const list = resPages.pages?.length > 0 ? resPages.pages : (resPages.saverPages || []);
  list.slice(0, maxCount).forEach((url: string) => {
    if (!url) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = toFastImgUrl(url);
  });
}

export async function prefetchCapituloObjetivoManga(manga: any, targetChapterObj: any = null): Promise<void> {
  if (!manga) return;
  try {
    const activeTabLang = mangaUiState.idiomaMangaSeleccionado || 'es';
    let chapObj = targetChapterObj;
    let chapNum = chapObj?.chapterNum ?? 1;
    if (!chapObj) {
      const readSet = MangaReadStateManager.getReadChapters(manga.id);
      if (mangaUiState.mangaFullFilteredList.length > 0) {
        const sortedAsc = [...mangaUiState.mangaFullFilteredList].sort((a, b) => a.chapterNum - b.chapterNum);
        chapObj = sortedAsc.find(c => !readSet.has(String(c.chapterNum))) || sortedAsc[0];
        chapNum = chapObj?.chapterNum ?? 1;
      } else if (readSet.size > 0) {
        const nums = Array.from(readSet).map(n => parseFloat(n)).filter(n => !Number.isNaN(n));
        if (nums.length > 0) chapNum = Math.max(...nums) + 1;
      }
    }
    const defaultLang = activeTabLang === 'all' ? 'es' : activeTabLang;
    const res = await MangaDex.getChapterPages(
      chapObj || { chapter: String(chapNum), chapterNum: chapNum, lang: defaultLang },
      manga.title,
      chapNum,
      activeTabLang
    );
    if (res?.pages?.length > 0) prewarmMangaImages(res, 3);
  } catch {
    // ignore
  }
}

export async function abrirDetalleManga(manga: any): Promise<void> {
  if (!manga) return;
  MangaSpanishMetadata.enrich(manga);
  setActiveManga(manga);
  mangaUiState.idiomaMangaSeleccionado = 'es';
  mangaUiState.mangaSortOrder = 'ASC';
  mangaUiState.mangaChapterFilterQuery = '';
  mangaUiState.mangaFiltroSoloNoLeidos = false;
  mangaUiState.mangaRenderedBatchCount = 50;

  const pantalla = document.getElementById('pantalla-detalle-manga');
  if (pantalla) {
    pantalla.classList.remove('hide');
    pantalla.scrollTo(0, 0);
  }

  const fallbackModalCover = generarPortadaSVG(manga.title, manga.origLang, manga.flag?.split(' ')[1] || 'Manga');
  const coverUrl = manga.cover || fallbackModalCover;

  const heroBlur = document.getElementById('mihon-hero-blur');
  if (heroBlur) heroBlur.style.backgroundImage = `url("${coverUrl}")`;

  const headerTitle = document.getElementById('mihon-header-title');
  if (headerTitle) {
    headerTitle.textContent = manga.title || 'Manga';
    headerTitle.classList.remove('visible');
  }

  const posterEl = document.getElementById('manga-det-poster') as HTMLImageElement | null;
  const tituloEl = document.getElementById('manga-det-titulo');
  const authorEl = document.getElementById('manga-det-author');
  const sinopsisEl = document.getElementById('manga-det-sinopsis');
  const badgesEl = document.getElementById('manga-det-badges');
  const genresEl = document.getElementById('manga-det-genres');
  const sourceNameEl = document.getElementById('mihon-active-source-name');

  if (posterEl) {
    posterEl.onerror = () => { posterEl.onerror = null; posterEl.src = fallbackModalCover; };
    posterEl.src = coverUrl;
  }
  if (tituloEl) tituloEl.textContent = manga.title || 'Manga';
  if (authorEl) authorEl.textContent = `✍️ ${manga.author || 'Autor Oficial'}`;
  if (sinopsisEl) {
    sinopsisEl.textContent = manga.desc || 'Disfruta de los capítulos oficiales y traducciones de la comunidad.';
    sinopsisEl.classList.remove('expanded');
  }
  const synToggle = document.getElementById('mihon-synopsis-toggle');
  if (synToggle) synToggle.textContent = 'Leer más ▾';

  if (sourceNameEl) {
    const isManhwa = (manga.title || '').toLowerCase().includes('solo leveling');
    const activeSrc = manga.preferredSource ? MangaSourceManager.getSource(manga.preferredSource).name : (isManhwa ? 'Webtoon' : 'MangaDex');
    sourceNameEl.textContent = activeSrc;
  }

  if (badgesEl) {
    badgesEl.innerHTML = `
      <span class="mihon-badge ${manga.status === 'Finalizado' ? 'completed' : 'releasing'}">
        ${manga.status === 'Finalizado' ? '⚪ Finalizado' : '🟢 En Emisión'}
      </span>
      <span class="mihon-badge">★ ${escHtml(manga.score || '8.7')}</span>
      <span class="mihon-badge">📅 ${escHtml(manga.year || '2024')}</span>
      <span class="mihon-badge">${escHtml(manga.flag || '🇯🇵 Manga')}</span>
    `;
  }

  if (genresEl) {
    const genres = manga.genres?.length > 0 ? manga.genres : ['Acción', 'Fantasía', 'Aventura'];
    genresEl.innerHTML = genres.map((g: string) => `<span class="mihon-genre-chip">${escHtml(g)}</span>`).join('');
  }

  updateMangaFavoriteButton(manga.id);

  let dexId = manga.dexId;
  if (!dexId && manga.title) {
    const cleanT = FallbackMangaProvider.cleanTitle(manga.title);
    dexId = MangaDex.knownDexMap[cleanT] || null;
    if (dexId) manga.dexId = dexId;
  }

  const activeSource = manga.preferredSource || MangaSourceManager.getActiveSourceId();
  const memCacheKey = `${dexId || FallbackMangaProvider.cleanTitle(manga.title)}_${activeSource}`;
  const cachedChaps = MangaDex.chaptersMemCache.get(memCacheKey);

  const container = document.getElementById('manga-det-capitulos');
  if (cachedChaps) {
    mangaUiState.capitulosCache = cachedChaps;
  } else {
    mangaUiState.capitulosCache = null;
    mangaUiState.mangaFullFilteredList = [];
    mangaUiState.capitulosLectorList = [];
    ['es', 'en', 'ja', 'ko', 'all'].forEach(k => {
      const el = document.getElementById(`count-lang-${k}`);
      if (el) el.textContent = '…';
    });
    const countEl = document.getElementById('manga-det-count');
    if (countEl) countEl.textContent = 'Cargando...';
    const btnResume = document.getElementById('mihon-btn-start-resume');
    const readSet = MangaReadStateManager.getReadChapters(manga.id);
    let nextChapGuess = 1;
    if (readSet.size > 0) {
      const nums = Array.from(readSet).map(n => parseFloat(n)).filter(n => !Number.isNaN(n));
      if (nums.length > 0) nextChapGuess = Math.max(...nums) + 1;
    }
    if (btnResume) {
      btnResume.innerHTML = readSet.size > 0
        ? `<span>▶ Continuar Leyendo · Cap. ${nextChapGuess}</span>`
        : '<span>▶ Empezar a Leer · Cap. 1</span>';
    }
    if (container) container.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

    void prefetchCapituloObjetivoManga(manga, { chapter: String(nextChapGuess), chapterNum: nextChapGuess });

    if (!dexId) {
      dexId = await MangaDex.resolveMangaDexId(manga.title, manga.altTitles);
      manga.dexId = dexId;
    }
    mangaUiState.capitulosCache = await MangaDex.getChapters(
      dexId,
      manga.title,
      manga.preferredSource,
      () => {
        actualizarConteosIdiomaTabs();
        renderCapitulosMangaModal();
      }
    );
  }

  actualizarConteosIdiomaTabs();

  const cc = mangaUiState.capitulosCache || {};
  const countEs = cc.spanish ? cc.spanish.length : 0;
  const countEn = cc.english ? cc.english.length : 0;
  const countKo = cc.korean ? cc.korean.length : 0;
  const countJa = cc.japanese ? cc.japanese.length : 0;

  if (countEs > 0) mangaUiState.idiomaMangaSeleccionado = 'es';
  else if (countEn > 0) mangaUiState.idiomaMangaSeleccionado = 'en';
  else if (countKo > 0) mangaUiState.idiomaMangaSeleccionado = 'ko';
  else if (countJa > 0) mangaUiState.idiomaMangaSeleccionado = 'ja';
  else mangaUiState.idiomaMangaSeleccionado = 'all';

  document.querySelectorAll('#manga-det-lang-tabs .mihon-lang-chip').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-lang') === mangaUiState.idiomaMangaSeleccionado);
  });

  renderCapitulosMangaModal();
  setupMangaScrollListener();
  void prefetchCapituloObjetivoManga(manga);
}

export function setupMangaScrollListener(): void {
  const pantalla = document.getElementById('pantalla-detalle-manga');
  const headerTitle = document.getElementById('mihon-header-title');
  if (!pantalla) return;

  const onScrollHandler = () => {
    if (headerTitle) headerTitle.classList.toggle('visible', pantalla.scrollTop > 180);
    if (pantalla.scrollTop + pantalla.clientHeight >= pantalla.scrollHeight - 750) {
      if (mangaUiState.mangaRenderedBatchCount < mangaUiState.mangaFullFilteredList.length) {
        cargarSiguienteLoteCapitulos();
      }
    }
  };

  pantalla.onscroll = onScrollHandler;
}

export function cargarSiguienteLoteCapitulos(): void {
  if (mangaUiState.mangaRenderedBatchCount < mangaUiState.mangaFullFilteredList.length) {
    mangaUiState.mangaRenderedBatchCount += 50;
    appendNextBatchChapters();
  }
}

export function cargarTodosLosCapitulos(): void {
  mangaUiState.mangaRenderedBatchCount = mangaUiState.mangaFullFilteredList.length;
  renderCapitulosMangaModal();
  mostrarToast(`Cargados todos los ${mangaUiState.mangaFullFilteredList.length} capítulos ✓`, 'success');
}

export function cerrarDetalleManga(): void {
  document.getElementById('pantalla-detalle-manga')?.classList.add('hide');
}

export function toggleSortCapitulosManga(): void {
  mangaUiState.mangaSortOrder = mangaUiState.mangaSortOrder === 'ASC' ? 'DESC' : 'ASC';
  const btn = document.getElementById('btn-sort-manga');
  if (btn) btn.innerHTML = mangaUiState.mangaSortOrder === 'ASC' ? '⬇️ Ascendente' : '⬆️ Descendente';
  renderCapitulosMangaModal();
}

export function toggleFiltroLeidosManga(): void {
  mangaUiState.mangaFiltroSoloNoLeidos = !mangaUiState.mangaFiltroSoloNoLeidos;
  const btn = document.getElementById('btn-filter-read-manga');
  if (btn) btn.innerHTML = mangaUiState.mangaFiltroSoloNoLeidos ? '👁️ No Leídos' : '👁️ Todos';
  renderCapitulosMangaModal();
}

export function filtrarCapitulosManga(query: string): void {
  mangaUiState.mangaChapterFilterQuery = (query || '').trim().toLowerCase();
  renderCapitulosMangaModal();
}

export function cambiarIdiomaMangaModal(lang: string, el: HTMLElement | null): void {
  mangaUiState.idiomaMangaSeleccionado = lang;
  document.querySelectorAll('#manga-det-lang-tabs .mihon-lang-chip').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderCapitulosMangaModal();
  void prefetchCapituloObjetivoManga(getActiveManga());
}

export function renderCapitulosMangaModal(): void {
  const container = document.getElementById('manga-det-capitulos');
  const countEl = document.getElementById('manga-det-count');
  const cc = mangaUiState.capitulosCache;
  if (!container || !cc) return;

  let list: any[] = [];
  if (mangaUiState.idiomaMangaSeleccionado === 'es') list = cc.spanish || [];
  else if (mangaUiState.idiomaMangaSeleccionado === 'en') list = cc.english || [];
  else if (mangaUiState.idiomaMangaSeleccionado === 'ja') list = cc.japanese || [];
  else if (mangaUiState.idiomaMangaSeleccionado === 'ko') list = cc.korean || [];
  else list = cc.all || [];

  if (mangaUiState.mangaChapterFilterQuery) {
    const q = mangaUiState.mangaChapterFilterQuery;
    list = list.filter(c =>
      String(c.chapter).toLowerCase().includes(q) ||
      String(c.title).toLowerCase().includes(q)
    );
  }

  const activeManga = getActiveManga();
  if (mangaUiState.mangaFiltroSoloNoLeidos && activeManga) {
    list = list.filter(c => !MangaReadStateManager.isRead(activeManga.id, c.chapterNum));
  }

  const sortedList = [...list].sort((a, b) =>
    mangaUiState.mangaSortOrder === 'ASC' ? a.chapterNum - b.chapterNum : b.chapterNum - a.chapterNum
  );

  mangaUiState.mangaFullFilteredList = sortedList;
  mangaUiState.capitulosLectorList = sortedList;
  nWin.capitulosLectorList = sortedList;

  if (countEl) countEl.textContent = `${sortedList.length} caps`;

  const enList = cc.english || [];
  const allList = cc.all || [];

  if (sortedList.length === 0) {
    const hasEnAlternative =
      mangaUiState.idiomaMangaSeleccionado === 'es' &&
      enList.length > 0 &&
      !mangaUiState.mangaChapterFilterQuery &&
      !mangaUiState.mangaFiltroSoloNoLeidos;

    container.innerHTML = `
      <div style="text-align:center; color:var(--text-muted); padding:32px 20px; font-size:13px; background:rgba(255,255,255,0.03); border-radius:12px; border:1px solid rgba(255,255,255,0.08);">
        <div style="font-size:24px; margin-bottom:8px;">📖</div>
        <div style="font-weight:700; color:#fff; margin-bottom:6px;">
          ${hasEnAlternative ? 'Sin capítulos en Español por ahora' : 'No se encontraron capítulos disponibles'}
        </div>
        <div style="font-size:12px; color:#94a3b8; max-width:340px; margin:0 auto 14px;">
          ${hasEnAlternative
            ? `Este manga aún no tiene capítulos subidos en Español, pero hay ${enList.length} capítulos listos en Inglés.`
            : 'Prueba seleccionando otra pestaña de idioma (English, Todos) o limpiando el filtro.'}
        </div>
        ${hasEnAlternative ? `
          <div style="display:flex; justify-content:center; gap:8px; flex-wrap:wrap;">
            <button class="mihon-lang-notice-btn" onclick="cambiarIdiomaMangaModal('en', document.querySelector('#manga-det-lang-tabs [data-lang=\\'en\\']'))">🇬🇧 Ver ${enList.length} caps en Inglés</button>
            <button class="mihon-lang-notice-btn" style="background:rgba(255,255,255,0.07); border-color:rgba(255,255,255,0.16);" onclick="cambiarIdiomaMangaModal('all', document.querySelector('#manga-det-lang-tabs [data-lang=\\'all\\']'))">🌐 Ver Todos (${allList.length})</button>
          </div>
        ` : ''}
      </div>
    `;
    actualizarBotonContinuarDetalleManga();
    return;
  }

  container.innerHTML = '';

  if (mangaUiState.idiomaMangaSeleccionado === 'es' && enList.length > 0 && sortedList.length < enList.length * 0.5 && !mangaUiState.mangaChapterFilterQuery) {
    const notice = document.createElement('div');
    notice.className = 'mihon-lang-notice';
    notice.innerHTML = `
      <span>🇪🇸 Mostrando solo <strong>${sortedList.length}</strong> ${sortedList.length === 1 ? 'capítulo' : 'capítulos'} reales en Español (disponibles <strong>${enList.length}</strong> en Inglés).</span>
      <button class="mihon-lang-notice-btn" onclick="cambiarIdiomaMangaModal('en', document.querySelector('#manga-det-lang-tabs [data-lang=\\'en\\']'))">🇬🇧 Ver ${enList.length} caps en Inglés</button>
    `;
    container.appendChild(notice);
  }

  appendNextBatchChapters();
  actualizarBotonContinuarDetalleManga();
}

export function actualizarBotonContinuarDetalleManga(): void {
  const btn = document.getElementById('mihon-btn-start-resume');
  const pill = document.getElementById('mihon-read-progress-pill');
  const activeManga = getActiveManga();
  if (!btn || !activeManga) return;

  const list = mangaUiState.mangaFullFilteredList || [];
  const sortedAsc = [...list].sort((a, b) => a.chapterNum - b.chapterNum);
  const readSet = MangaReadStateManager.getReadChapters(activeManga.id);
  const readCount = readSet.size;

  if (pill) pill.textContent = list.length > 0 ? `${readCount} / ${list.length} leídos` : `${readCount} leídos`;

  if (sortedAsc.length === 0) {
    btn.innerHTML = '<span>▶ Empezar a Leer · Cap. 1</span>';
    return;
  }

  const nextUnread = sortedAsc.find(c => !readSet.has(String(c.chapterNum))) || sortedAsc[0];
  if (readCount > 0 && nextUnread) {
    btn.innerHTML = `<span>▶ Continuar Leyendo · Cap. ${escHtml(nextUnread.chapter)}</span>`;
  } else {
    btn.innerHTML = `<span>▶ Empezar a Leer · Cap. ${escHtml(sortedAsc[0].chapter)}</span>`;
  }
}

export function iniciarOReanudarLecturaManga(): void {
  const activeManga = getActiveManga();
  if (!activeManga) return;
  const readSet = MangaReadStateManager.getReadChapters(activeManga.id);

  if (!mangaUiState.mangaFullFilteredList.length) {
    let nextChapNum = 1;
    if (readSet.size > 0) {
      const nums = Array.from(readSet).map(n => parseFloat(n)).filter(n => !Number.isNaN(n));
      if (nums.length > 0) nextChapNum = Math.max(...nums) + 1;
    }
    const activeTabLang = mangaUiState.idiomaMangaSeleccionado || 'es';
    const onDemandList = [{
      id: `ondemand_${activeManga.id || 'manga'}_${nextChapNum}`,
      chapter: String(nextChapNum),
      chapterNum: nextChapNum,
      title: `Capítulo ${nextChapNum}`,
      pages: 20,
      group: activeTabLang === 'en' ? 'MangaPill HD 🇬🇧' : 'MangaDex Scan',
      lang: activeTabLang === 'all' ? 'es' : activeTabLang,
      source: 'MangaDex'
    }];
    mangaUiState.capitulosLectorList = onDemandList;
    nWin.capitulosLectorList = onDemandList;
    void uiHooks.abrirLectorManga(0);
    return;
  }

  const sortedAsc = [...mangaUiState.mangaFullFilteredList].sort((a, b) => a.chapterNum - b.chapterNum);
  const targetChap = sortedAsc.find(c => !readSet.has(String(c.chapterNum))) || sortedAsc[0];
  if (!targetChap) return;
  const idxInCurrentList = mangaUiState.mangaFullFilteredList.findIndex(
    c => c.id === targetChap.id || c.chapterNum === targetChap.chapterNum
  );
  void uiHooks.abrirLectorManga(idxInCurrentList >= 0 ? idxInCurrentList : 0);
}

export function appendNextBatchChapters(): void {
  const container = document.getElementById('manga-det-capitulos');
  if (!container || !mangaUiState.mangaFullFilteredList) return;

  document.getElementById('manga-det-load-more')?.remove();
  document.getElementById('manga-det-load-all-done')?.remove();

  const currentRendered = container.querySelectorAll('.mihon-chapter-card').length;
  const targetCount = Math.min(mangaUiState.mangaRenderedBatchCount, mangaUiState.mangaFullFilteredList.length);
  const nextBatch = mangaUiState.mangaFullFilteredList.slice(currentRendered, targetCount);

  const frag = document.createDocumentFragment();
  const activeManga = getActiveManga();
  nextBatch.forEach((c, batchIdx) => {
    const globalIdx = currentRendered + batchIdx;
    const isRead = activeManga ? MangaReadStateManager.isRead(activeManga.id, c.chapterNum) : false;
    const langBadge = c.lang === 'es' || c.lang === 'es-la' ? '🇪🇸' : (c.lang === 'en' ? '🇬🇧' : (c.lang === 'ja' ? '🇯🇵' : (c.lang === 'ko' ? '🇰🇷' : '🌐')));
    const isExternal = c.externalUrl && (!c.pages || c.pages === 0);
    const modeBadge = isExternal ? '🌐 Externo' : (c.pages ? `📖 ${c.pages}p` : '📖 Webtoon');
    const rawCleanTitle = (c.title || '').replace(/[<>&"]/g, '').trim();
    const chapStr = String(c.chapter ?? '0').toLowerCase();
    const isRedundantTitle = !rawCleanTitle ||
      rawCleanTitle.toLowerCase() === `capítulo ${chapStr}` ||
      rawCleanTitle.toLowerCase() === `capitulo ${chapStr}` ||
      rawCleanTitle.toLowerCase() === `chapter ${chapStr}`;
    const chapTitle = !isRedundantTitle ? ` · ${rawCleanTitle}` : '';
    const altCount = c.altGroups?.length > 1 ? `<span class="mihon-chap-alt-badge">+${c.altGroups.length - 1} scanlator</span>` : '';

    const card = document.createElement('div');
    card.className = `mihon-chapter-card fade-in ${isRead ? 'is-read' : ''}`;
    card.onclick = () => { void uiHooks.abrirLectorManga(globalIdx); };

    card.innerHTML = `
      <div style="flex:1; overflow:hidden;">
        <div class="mihon-chap-num">Capítulo ${escHtml(c.chapter)} <span style="font-weight:400; color:#94a3b8; font-size:12px;">${escHtml(chapTitle)}</span></div>
        <div class="mihon-chap-meta">
          <span>${langBadge}</span>
          <span class="mihon-group-badge">${escHtml((c.group || 'Comunidad').replace(/[<>&"]/g, ''))}</span>
          ${altCount}
          <span class="mihon-pages-badge">${modeBadge}</span>
          ${c.publishAt ? `<span>· ${escHtml(c.publishAt)}</span>` : ''}
        </div>
      </div>
      <div class="mihon-read-check ${isRead ? 'active' : ''}" onclick="toggleMarcarCapituloLeido('${c.chapterNum}', event)" title="Marcar como leído">
        ${isRead ? '✓' : '○'}
      </div>
    `;
    frag.appendChild(card);
  });

  container.appendChild(frag);

  const totalRendered = container.querySelectorAll('.mihon-chapter-card').length;
  const totalAll = mangaUiState.mangaFullFilteredList.length;

  if (totalRendered < totalAll) {
    const loadMoreBar = document.createElement('div');
    loadMoreBar.id = 'manga-det-load-more';
    loadMoreBar.className = 'mihon-load-more-bar';
    loadMoreBar.innerHTML = `
      <div class="mihon-load-more-info">Mostrando ${totalRendered} de ${totalAll} capítulos disponibles</div>
      <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
        <button class="chip active" onclick="cargarSiguienteLoteCapitulos()">⬇️ Cargar 50 más</button>
        <button class="chip" onclick="cargarTodosLosCapitulos()">⚡ Cargar todos (${totalAll} caps)</button>
      </div>
    `;
    container.appendChild(loadMoreBar);
  } else if (totalAll > 30) {
    const doneBanner = document.createElement('div');
    doneBanner.id = 'manga-det-load-all-done';
    doneBanner.className = 'mihon-load-all-done';
    doneBanner.textContent = `✓ Todos los ${totalAll} capítulos cargados`;
    container.appendChild(doneBanner);
  }
}
