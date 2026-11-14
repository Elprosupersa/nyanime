import {
  ANILIST_URL,
  AnimeWatchedManager,
  CacheManager,
  DownloadManager,
  FavoritesManager,
  cerrarModales,
  escHtml,
  fetchWithTimeout,
  nWin,
  safeImg,
  showToast,
  state
} from './appState.ts';
import { ensureModalsMounted } from './modals.ts';
import {
  StreamExtractor,
  resolverContextoEpisodio,
  videoSourceManager
} from './playerView.ts';

let seasonDownloadAbortCtrl: AbortController | null = null;

export function calcularEpisodiosReales(media: any): number {
  if (nWin.NyAnimeSeasons?.computeAvailableEpisodes) {
    return nWin.NyAnimeSeasons.computeAvailableEpisodes(media).totalEpisodes;
  }
  if (!media || media.status === 'NOT_YET_RELEASED') return 0;
  if (media.status === 'RELEASING' && media.nextAiringEpisode?.episode) {
    return Math.max(0, Number(media.nextAiringEpisode.episode) - 1);
  }
  return Math.max(0, Number(media.episodes || 0));
}

export function aplicarMetadatosTemporadaUI(seasonOrMedia: any, fallbackAnime: any): void {
  const ref = seasonOrMedia || fallbackAnime;
  if (!ref) return;
  const title =
    ref.title?.english ||
    ref.title?.romaji ||
    (typeof ref.title === 'string' ? ref.title : '') ||
    fallbackAnime?.title?.english ||
    fallbackAnime?.title?.romaji ||
    'Anime';

  const titleEl = document.getElementById('det-titulo');
  if (titleEl) titleEl.innerText = title;

  const imgUrl =
    ref.bannerImage ||
    ref.coverImage?.extraLarge ||
    ref.coverImage?.large ||
    (typeof ref.coverImage === 'string' ? ref.coverImage : '') ||
    fallbackAnime?.bannerImage ||
    fallbackAnime?.coverImage?.extraLarge ||
    '';
  const imgEl = document.getElementById('det-img') as HTMLImageElement | null;
  if (imgEl && imgUrl) imgEl.src = safeImg(imgUrl);

  const rawDesc = ref.description || fallbackAnime?.description || 'Sin descripción disponible.';
  const cleanDesc = String(rawDesc).replace(/<br\s*\/?>/gi, ' ').replace(/<\/?i>/gi, '');
  const descEl = document.getElementById('det-sinopsis');
  if (descEl) descEl.textContent = cleanDesc;

  const badgesContainer = document.getElementById('det-meta-badges');
  if (!badgesContainer) return;
  badgesContainer.innerHTML = '';

  const fmt = ref.format || fallbackAnime?.format;
  const st = ref.status || fallbackAnime?.status;
  const scoreVal = ref.averageScore || fallbackAnime?.averageScore;
  const nextAiring = ref.nextAiringEpisode || fallbackAnime?.nextAiringEpisode;

  if (fmt) badgesContainer.innerHTML += `<span class="badge-pill">${escHtml(fmt)}</span>`;
  if (scoreVal) badgesContainer.innerHTML += `<span class="badge-pill">★ ${(Number(scoreVal) / 10).toFixed(1)}</span>`;
  if (st === 'RELEASING') badgesContainer.innerHTML += '<span class="badge-pill status-releasing">🟢 En Emisión</span>';
  else if (st === 'NOT_YET_RELEASED') badgesContainer.innerHTML += '<span class="badge-pill">🗓️ Próximamente</span>';
  else if (st === 'FINISHED') badgesContainer.innerHTML += '<span class="badge-pill">Finalizado</span>';

  if (st === 'RELEASING' && nextAiring?.timeUntilAiring && nWin.NyAnimeVideoSources?.formatAiringCountdown) {
    const countdown = nWin.NyAnimeVideoSources.formatAiringCountdown(nextAiring.timeUntilAiring, nextAiring.episode);
    if (countdown) badgesContainer.innerHTML += `<span class="badge-pill status-releasing">⏱️ ${escHtml(countdown)}</span>`;
  }

  const genres: string[] =
    Array.isArray(ref.genres) && ref.genres.length > 0 ? ref.genres : (fallbackAnime?.genres || []);
  genres.slice(0, 3).forEach((g) => {
    badgesContainer.innerHTML += `<span class="badge-pill genre">${escHtml(g)}</span>`;
  });
}

export function actualizarBotonContinuarDetalleAnime(): void {
  const season = state.seasons[state.temporadaActualIdx] || state.seasons[0];
  const btn = document.getElementById('det-btn-continue') as HTMLButtonElement | null;
  const pill = document.getElementById('det-watch-progress');
  if (!btn || !season) return;

  const total = Number(season.totalEpisodes || 0);
  const watchedSet = AnimeWatchedManager.getWatchedSet(season.id);
  const watchedCount = Array.from(watchedSet).filter((n) => n >= 1 && n <= total).length;

  if (pill) {
    pill.textContent = total > 0 ? `📺 ${watchedCount} / ${total} vistos` : 'Próximamente';
  }

  if (total === 0 || season.isUpcoming) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.textContent = '🗓️ Próximamente';
    return;
  }

  btn.disabled = false;
  btn.style.opacity = '1';

  let nextEp = 1;
  for (let i = 1; i <= total; i++) {
    if (!watchedSet.has(i)) {
      nextEp = i;
      break;
    }
  }
  if (watchedCount === 0) {
    btn.textContent = '▶ Empezar Episodio 1';
  } else if (watchedCount >= total) {
    btn.textContent = '↻ Volver a ver Episodio 1';
  } else {
    btn.textContent = `▶ Continuar · Episodio ${nextEp}`;
  }
}

export function iniciarOContinuarAnime(): void {
  const season = state.seasons[state.temporadaActualIdx] || state.seasons[0];
  if (!season || !season.totalEpisodes) return;
  const watchedSet = AnimeWatchedManager.getWatchedSet(season.id);
  let targetEp = 1;
  for (let i = 1; i <= season.totalEpisodes; i++) {
    if (!watchedSet.has(i)) {
      targetEp = i;
      break;
    }
  }
  nWin.abrirReproductor?.(targetEp);
}

export async function abrirDetalle(anime: any, onLoadedCallback?: () => void): Promise<void> {
  state.anime = anime;
  nWin.Store?.setActiveAnime?.(anime);
  state.temporadaActualIdx = 0;
  state.rangoActualIdx = 0;
  state.seasonMenuOpen = false;
  state.episodeMetaMap = {};

  const epsProvisional = calcularEpisodiosReales(anime);
  const provTitle = anime?.title?.english || anime?.title?.romaji || 'Temporada 1';
  state.seasons = [
    {
      id: anime?.id || 0,
      seasonNumber: 1,
      tier: 'MAIN_SEASON',
      shortTag: 'T1',
      title: provTitle,
      romaji: anime?.title?.romaji || provTitle,
      english: anime?.title?.english || provTitle,
      displayLabel: `T1: ${provTitle}`,
      episodeLabel: `${epsProvisional} Episodios`,
      format: anime?.format || 'TV',
      status: anime?.status || 'FINISHED',
      totalEpisodes: epsProvisional,
      isUpcoming: anime?.status === 'NOT_YET_RELEASED',
      coverImage: anime?.coverImage?.extraLarge || anime?.coverImage?.large || '',
      bannerImage: anime?.bannerImage || anime?.coverImage?.extraLarge || '',
      description: anime?.description || ''
    }
  ];

  const pantallaDetalle = document.getElementById('pantalla-detalle');
  if (pantallaDetalle) {
    pantallaDetalle.classList.remove('hide');
    pantallaDetalle.scrollTo(0, 0);
  }

  aplicarMetadatosTemporadaUI(anime, anime);
  updateFavoriteButton(anime.id);

  await resolverTemporadasAnime(anime);
  if (onLoadedCallback) onLoadedCallback();
}

const ANILIST_CORE_FIELDS = `
  id
  title { romaji english native }
  coverImage { extraLarge large }
  bannerImage
  description(asHtml: false)
  genres
  averageScore
  status
  format
  episodes
  seasonYear
  startDate { year month day }
  nextAiringEpisode { episode timeUntilAiring }
`;

const ANILIST_FRANCHISE_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      ${ANILIST_CORE_FIELDS}
      relations {
        edges {
          relationType
          node {
            ${ANILIST_CORE_FIELDS}
            relations {
              edges {
                relationType
                node {
                  ${ANILIST_CORE_FIELDS}
                }
              }
            }
          }
        }
      }
    }
  }
`;

const ANILIST_FRONTIER_BATCH_QUERY = `
  query ($ids: [Int]) {
    Page(perPage: 25) {
      media(id_in: $ids, type: ANIME) {
        ${ANILIST_CORE_FIELDS}
        relations {
          edges {
            relationType
            node {
              ${ANILIST_CORE_FIELDS}
            }
          }
        }
      }
    }
  }
`;

export async function resolverTemporadasAnime(anime: any): Promise<void> {
  const cacheKey = `anime_franchise_v3_${anime.id}`;
  let cachedOrganized = CacheManager.get(cacheKey);

  if (!cachedOrganized || !Array.isArray(cachedOrganized.seasons) || cachedOrganized.seasons.length === 0) {
    let primaryMedia = anime;
    const collectedRoots: any[] = [];

    try {
      const res = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: ANILIST_FRANCHISE_QUERY, variables: { id: anime.id } })
      });
      const data = await res.json();
      primaryMedia = data?.data?.Media || anime;
      if (primaryMedia) collectedRoots.push(primaryMedia);

      const expandedIds = new Set<number | string>();
      if (primaryMedia?.id) expandedIds.add(primaryMedia.id);

      const allowedExpandRels = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF', 'SUMMARY', 'COMPILATION']);
      const validExpandFmts = new Set(['TV', 'TV_SHORT', 'ONA', 'OVA', 'MOVIE', 'SPECIAL']);

      const collectFrontierIds = () => {
        const nextIds = new Set<number | string>();
        const walk = (node: any) => {
          const edges = node?.relations?.edges || [];
          for (const edge of edges) {
            const rel = String(edge?.relationType || '').toUpperCase();
            const t = edge?.node;
            if (!t || !t.id || !allowedExpandRels.has(rel)) continue;
            if (!validExpandFmts.has(String(t.format || '').toUpperCase())) continue;
            if (t.relations?.edges) {
              expandedIds.add(t.id);
              walk(t);
            } else if (!expandedIds.has(t.id)) {
              nextIds.add(t.id);
            }
          }
        };
        collectedRoots.forEach(walk);
        return Array.from(nextIds).slice(0, 25);
      };

      for (let hop = 0; hop < 2; hop++) {
        const frontier = collectFrontierIds();
        if (frontier.length === 0) break;
        frontier.forEach((fid) => expandedIds.add(fid));
        const batchRes = await fetch(ANILIST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: ANILIST_FRONTIER_BATCH_QUERY, variables: { ids: frontier } })
        });
        const batchJson = await batchRes.json();
        const batchMedia = batchJson?.data?.Page?.media || [];
        if (batchMedia.length === 0) break;
        collectedRoots.push(...batchMedia);
      }
    } catch {
      if (collectedRoots.length === 0) collectedRoots.push(anime);
    }

    state.fullMedia = primaryMedia;

    if (nWin.NyAnimeSeasons?.organizeAnimeFranchise) {
      cachedOrganized = nWin.NyAnimeSeasons.organizeAnimeFranchise(collectedRoots, anime.id);
    } else {
      const epsReal = calcularEpisodiosReales(primaryMedia);
      cachedOrganized = {
        seasons: [
          {
            id: primaryMedia.id,
            seasonNumber: 1,
            tier: 'MAIN_SEASON',
            shortTag: 'T1',
            title: primaryMedia.title?.english || primaryMedia.title?.romaji || 'Temporada 1',
            displayLabel: `T1: ${primaryMedia.title?.english || primaryMedia.title?.romaji || 'Temporada 1'}`,
            episodeLabel: `${epsReal} Episodios`,
            format: primaryMedia.format || 'TV',
            status: primaryMedia.status || 'FINISHED',
            totalEpisodes: epsReal,
            isUpcoming: primaryMedia.status === 'NOT_YET_RELEASED',
            coverImage: primaryMedia.coverImage?.extraLarge || primaryMedia.coverImage?.large || '',
            bannerImage: primaryMedia.bannerImage || primaryMedia.coverImage?.extraLarge || '',
            description: primaryMedia.description || ''
          }
        ],
        initialIndex: 0,
        franchiseTitle: primaryMedia.title?.english || primaryMedia.title?.romaji || ''
      };
    }

    if (cachedOrganized.seasons.length > 0) {
      CacheManager.set(cacheKey, cachedOrganized);
    }
  }

  state.seasons = cachedOrganized.seasons || [];
  state.temporadaActualIdx = Math.min(cachedOrganized.initialIndex || 0, Math.max(0, state.seasons.length - 1));
  const activeSeason = state.seasons[state.temporadaActualIdx];
  if (activeSeason) {
    aplicarMetadatosTemporadaUI(activeSeason, state.anime);
    void cargarAniZipMappingAsync(activeSeason.id);
  }

  renderTemporadasDropdown();
  renderDetalleEpisodios();
  actualizarBotonContinuarDetalleAnime();
}

export async function cargarAniZipMappingAsync(seasonAnimeId: number | string): Promise<any> {
  if (!seasonAnimeId) return null;
  const cacheKey = `anizip_mapping_${seasonAnimeId}`;
  let mapping = CacheManager.get(cacheKey);
  if (!mapping) {
    try {
      const res = await fetchWithTimeout(
        `https://api.ani.zip/mappings?anilist_id=${seasonAnimeId}`,
        { headers: { Accept: 'application/json' } },
        2500
      );
      if (res.ok) {
        mapping = await res.json();
        CacheManager.set(cacheKey, mapping);
      }
    } catch {
      // ignore network error
    }
  }
  if (mapping && nWin.NyAnimeVideoSources?.extractEpisodeDetailsMap) {
    const metaMap = nWin.NyAnimeVideoSources.extractEpisodeDetailsMap(mapping);
    state.episodeMetaMap = metaMap;

    const currentSeason = state.seasons?.[state.temporadaActualIdx];
    if (currentSeason?.id === seasonAnimeId && state.epActual) {
      const epMeta = metaMap[state.epActual];
      const subEl = document.getElementById('rep-ep-subtitle');
      if (subEl && epMeta?.title) subEl.textContent = `Ep ${state.epActual} · ${epMeta.title}`;
    }

    document.querySelectorAll('#det-episodios .ep-btn').forEach((btnEl) => {
      const btn = btnEl as HTMLElement;
      const epNum = parseInt(btn.textContent || '', 10);
      if (metaMap[epNum]?.title) btn.title = `Episodio ${epNum}: ${metaMap[epNum].title}`;
    });
  }
  return mapping;
}

export function updateFavoriteButton(id: number | string): void {
  const btn = document.getElementById('det-fav-btn');
  if (!btn) return;
  const isFav = FavoritesManager.isFavorite(id);
  btn.classList.toggle('favorited', isFav);
}

export function toggleFavoriteCurrentAnime(): void {
  if (state.anime) {
    FavoritesManager.toggle(state.anime);
  }
}

if (!nWin._crunchyOutsideClickBound) {
  nWin._crunchyOutsideClickBound = true;
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('det-temporadas');
    const target = e.target as Node | null;
    if (wrap && wrap.classList.contains('open') && (!target || !wrap.contains(target))) {
      state.seasonMenuOpen = false;
      wrap.classList.remove('open');
    }
  });
}

export function toggleCrunchySeasonMenu(event?: Event): void {
  if (event) event.stopPropagation();
  const wrap = document.getElementById('det-temporadas');
  if (!wrap) return;
  state.seasonMenuOpen = !state.seasonMenuOpen;
  wrap.classList.toggle('open', state.seasonMenuOpen);
  if (state.seasonMenuOpen) {
    const activeOpt = wrap.querySelector('.crunchy-season-option.active');
    if (activeOpt) activeOpt.scrollIntoView({ block: 'nearest' });
  }
}

export function seleccionarTemporadaDetalle(idx: number): void {
  if (!state.seasons || !state.seasons[idx]) return;
  state.temporadaActualIdx = idx;
  state.rangoActualIdx = 0;
  state.seasonMenuOpen = false;
  state.episodeMetaMap = {};
  const selected = state.seasons[idx];
  aplicarMetadatosTemporadaUI(selected, state.anime);
  renderTemporadasDropdown();
  renderDetalleEpisodios();
  actualizarBotonContinuarDetalleAnime();
  void cargarAniZipMappingAsync(selected.id);
}

export function renderTemporadasDropdown(): void {
  const container = document.getElementById('det-temporadas');
  if (!container) return;
  container.innerHTML = '';
  container.classList.toggle('open', Boolean(state.seasonMenuOpen));

  if (!state.seasons || state.seasons.length <= 1) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  const current = state.seasons[state.temporadaActualIdx] || state.seasons[0];

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'crunchy-season-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', state.seasonMenuOpen ? 'true' : 'false');
  trigger.onclick = toggleCrunchySeasonMenu;
  trigger.innerHTML = `
    <span class="crunchy-season-trigger-left">
      <span class="crunchy-season-caret">▼</span>
      <span class="crunchy-season-badge">${escHtml(current.shortTag || `T${current.seasonNumber || 1}`)}</span>
      <span class="crunchy-season-trigger-title">${escHtml(current.title)}</span>
    </span>
    <span class="crunchy-season-epcount">${escHtml(current.episodeLabel || `${current.totalEpisodes} Episodios`)}</span>
  `;
  container.appendChild(trigger);

  const menu = document.createElement('div');
  menu.className = 'crunchy-season-menu';
  menu.setAttribute('role', 'listbox');

  const mainSeasons: { s: any; idx: number }[] = [];
  const extraEntries: { s: any; idx: number }[] = [];
  state.seasons.forEach((s, idx) => {
    if (!s.tier || s.tier === 'MAIN_SEASON') mainSeasons.push({ s, idx });
    else extraEntries.push({ s, idx });
  });

  const appendGroupHeader = (labelText: string) => {
    const hdr = document.createElement('div');
    hdr.className = 'crunchy-season-group-label';
    hdr.textContent = labelText;
    menu.appendChild(hdr);
  };

  const appendOption = (s: any, idx: number) => {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = `crunchy-season-option ${idx === state.temporadaActualIdx ? 'active' : ''}`;
    opt.setAttribute('role', 'option');
    opt.setAttribute('aria-selected', idx === state.temporadaActualIdx ? 'true' : 'false');
    opt.onclick = (ev) => {
      ev.stopPropagation();
      seleccionarTemporadaDetalle(idx);
    };
    opt.innerHTML = `
      <span class="crunchy-season-option-left">
        <span class="crunchy-season-badge">${escHtml(s.shortTag || `T${s.seasonNumber || 1}`)}</span>
        <span class="crunchy-season-option-title">${escHtml(s.title)}</span>
      </span>
      <span class="crunchy-season-epcount">${escHtml(s.episodeLabel || `${s.totalEpisodes} Episodios`)}</span>
    `;
    menu.appendChild(opt);
  };

  if (mainSeasons.length > 0 && extraEntries.length > 0) {
    appendGroupHeader('Temporadas');
  }
  mainSeasons.forEach(({ s, idx }) => appendOption(s, idx));

  if (extraEntries.length > 0) {
    appendGroupHeader('Películas, OVAs y Especiales');
    extraEntries.forEach(({ s, idx }) => appendOption(s, idx));
  }

  container.appendChild(menu);
}

export function renderTemporadasChips(): void {
  renderTemporadasDropdown();
}

export function renderDetalleEpisodios(): void {
  const season = state.seasons[state.temporadaActualIdx] || state.seasons[0];
  const epContainer = document.getElementById('det-episodios');
  const countEl = document.getElementById('det-count');
  const headerTitle = document.getElementById('det-header-title');
  const rangosContainer = document.getElementById('det-rangos');
  const dlBtn = document.querySelector('#pantalla-detalle .btn-download-season') as HTMLElement | null;

  if (!epContainer || !rangosContainer) return;
  epContainer.innerHTML = '';
  rangosContainer.innerHTML = '';
  if (!season) return;

  if (countEl) countEl.innerText = season.episodeLabel || `${season.totalEpisodes} Episodios`;
  if (headerTitle) headerTitle.innerText = season.title || 'Episodios';
  if (dlBtn) dlBtn.style.display = season.totalEpisodes > 0 ? 'flex' : 'none';

  if (season.isUpcoming || season.totalEpisodes === 0) {
    epContainer.innerHTML = season.isUpcoming
      ? '<div style="grid-column: 1/-1; text-align:center; color:#cbd5e1; padding:18px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px;">🗓️ Estreno programado · Próximamente disponible para ver.</div>'
      : '<div style="grid-column: 1/-1; text-align:center; color:var(--text-muted); padding:15px;">Aún no se han emitido episodios para este título.</div>';
    return;
  }

  const total = Number(season.totalEpisodes || 0);
  if (total > 60) {
    rangosContainer.style.display = 'flex';
    const numRangos = Math.ceil(total / 50);
    for (let r = 0; r < numRangos; r++) {
      const rStart = r * 50 + 1;
      const rEnd = Math.min((r + 1) * 50, total);
      const rChip = document.createElement('div');
      rChip.className = `range-chip ${r === state.rangoActualIdx ? 'active' : ''}`;
      rChip.textContent = `${rStart} - ${rEnd}`;
      rChip.onclick = () => {
        state.rangoActualIdx = r;
        renderDetalleEpisodios();
      };
      rangosContainer.appendChild(rChip);
    }
  } else {
    rangosContainer.style.display = 'none';
  }

  const startEp = total > 60 ? state.rangoActualIdx * 50 + 1 : 1;
  const endEp = total > 60 ? Math.min((state.rangoActualIdx + 1) * 50, total) : total;
  const watchedSet = AnimeWatchedManager.getWatchedSet(season.id);

  for (let i = startEp; i <= endEp; i++) {
    const btn = document.createElement('button');
    btn.className = `ep-btn ${watchedSet.has(i) ? 'watched' : ''}`;
    btn.innerText = String(i);
    if (state.episodeMetaMap?.[i]?.title) {
      btn.title = `Episodio ${i}: ${state.episodeMetaMap[i].title}`;
    }
    btn.onclick = () => nWin.abrirReproductor?.(i);
    epContainer.appendChild(btn);
  }
  actualizarBotonContinuarDetalleAnime();
}

export function cerrarDetalle(): void {
  state.seasonMenuOpen = false;
  document.getElementById('det-temporadas')?.classList.remove('open');
  document.getElementById('pantalla-detalle')?.classList.add('hide');
}

function getCleanBaseTitleForFilename(rawTitle: string): string {
  return String(rawTitle || 'Anime')
    .replace(/\b(?:2nd|3rd|4th|5th|\d+th)\s+season\b/gi, '')
    .replace(/\bseason\s+\d+\b/gi, '')
    .replace(/\btemporada\s+\d+\b/gi, '')
    .replace(/[:\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function abrirModalDescargaTemporada(): void {
  ensureModalsMounted();
  const season = state.seasons?.[state.temporadaActualIdx] || {
    seasonNumber: 1,
    shortTag: 'T1',
    title: state.anime?.title?.english || state.anime?.title?.romaji || 'Temporada 1',
    totalEpisodes: calcularEpisodiosReales(state.anime) || 1
  };
  const seasonTitle =
    season.title ||
    season.english ||
    season.romaji ||
    state.anime?.title?.english ||
    state.anime?.title?.romaji ||
    'Anime';
  const shortTag = season.shortTag || `T${season.seasonNumber || 1}`;

  const infoEl = document.getElementById('descarga-temporada-info');
  if (infoEl) {
    infoEl.textContent = `${shortTag} · ${seasonTitle} (${season.totalEpisodes} episodios)`;
  }
  const progBox = document.getElementById('season-dl-progress-box');
  if (progBox) progBox.classList.add('hide');
  const startBtn = document.getElementById('btn-start-season-dl') as HTMLButtonElement | null;
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = '🚀 Descargar Episodios Seleccionados (.MP4)';
  }

  const listContainer = document.getElementById('descarga-ep-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  const total = Number(season.totalEpisodes || 1);
  for (let i = 1; i <= total; i++) {
    listContainer.innerHTML += `
      <label class="download-ep-row" style="cursor:pointer;">
        <span>Episodio ${i}</span>
        <input type="checkbox" class="cb-dl-ep" value="${i}" checked style="accent-color:var(--primary); transform:scale(1.2)">
      </label>
    `;
  }

  document.getElementById('modal-descarga-temporada')?.classList.add('active');
}

export function cancelarDescargaTemporada(): void {
  if (seasonDownloadAbortCtrl) {
    seasonDownloadAbortCtrl.abort();
    seasonDownloadAbortCtrl = null;
  }
  const progBox = document.getElementById('season-dl-progress-box');
  if (progBox) progBox.classList.add('hide');
  const startBtn = document.getElementById('btn-start-season-dl') as HTMLButtonElement | null;
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = '🚀 Descargar Episodios Seleccionados (.MP4)';
  }
  showToast('Descarga de episodios cancelada.');
}

export function toggleTodosEpisodiosDescarga(check: boolean): void {
  document.querySelectorAll('.cb-dl-ep').forEach((el) => {
    (el as HTMLInputElement).checked = check;
  });
}

export async function iniciarDescargaLote(): Promise<void> {
  const selected = Array.from(document.querySelectorAll('.cb-dl-ep:checked')).map((el) =>
    parseInt((el as HTMLInputElement).value, 10)
  );
  if (selected.length === 0) {
    showToast('Selecciona al menos un episodio.');
    return;
  }

  const season = state.seasons?.[state.temporadaActualIdx] || {
    id: state.anime?.id || 0,
    seasonNumber: 1,
    title: state.anime?.title?.english || state.anime?.title?.romaji || 'Anime',
    coverImage: state.anime?.coverImage?.large || state.anime?.coverImage?.extraLarge || ''
  };
  const seasonNum = Number(season.seasonNumber || 1);
  const seasonTitle =
    season.title ||
    season.english ||
    season.romaji ||
    state.anime?.title?.english ||
    state.anime?.title?.romaji ||
    'Anime';
  const cleanSeriesTitle = getCleanBaseTitleForFilename(seasonTitle);
  const seasonId = season.id || state.anime?.id || 0;
  const coverUrl =
    season.coverImage ||
    state.anime?.coverImage?.large ||
    state.anime?.coverImage?.extraLarge ||
    '';

  const qualityEl = document.getElementById('select-calidad-descarga') as HTMLSelectElement | null;
  const quality = qualityEl?.value || '1080p';
  const baseSlug = seasonTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const progBox = document.getElementById('season-dl-progress-box');
  const progText = document.getElementById('season-dl-progress-text');
  const progBar = document.getElementById('season-dl-progress-bar') as HTMLElement | null;
  const startBtn = document.getElementById('btn-start-season-dl') as HTMLButtonElement | null;

  if (seasonDownloadAbortCtrl) {
    seasonDownloadAbortCtrl.abort();
  }
  seasonDownloadAbortCtrl = new AbortController();
  const signal = seasonDownloadAbortCtrl.signal;

  if (progBox) progBox.classList.remove('hide');
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = 'Descargando episodios .MP4...';
  }

  let mp4Count = 0;
  let queuedCount = 0;

  try {
    for (let idx = 0; idx < selected.length; idx += 1) {
      if (signal.aborted) break;
      const ep = selected[idx];
      const basePct = Math.round((idx / selected.length) * 100);
      if (progText) {
        progText.textContent = `Resolviendo servidor .MP4 para T${seasonNum} · Ep. ${ep} (${idx + 1}/${selected.length})...`;
      }
      if (progBar) progBar.style.width = `${basePct}%`;

      let fallbackUrl = `https://animeav1.com/media/${baseSlug}/${ep}`;
      let mp4Candidates: any[] = [];

      try {
        const ctx = await resolverContextoEpisodio(ep);
        const raw = await videoSourceManager.fetchRawSources(ctx);
        const ranked = videoSourceManager.rankRawSources(raw, state.modoAudio);
        if (ranked[0]?.url) fallbackUrl = ranked[0].url;

        mp4Candidates = ranked.filter(
          (f) =>
            f &&
            f.url &&
            (f.url.includes('mp4upload.com') || f.url.includes('yourupload.com') || /\.(mp4|webm)(\?|$)/i.test(f.url))
        );
      } catch {
        // fallback to queue if resolution fails
      }

      if (signal.aborted) break;

      const rawFilename = `${cleanSeriesTitle}_T${seasonNum}_Ep_${ep}.mp4`;
      let downloadedMp4 = false;

      if (nWin.NyAnimeOffline?.downloadAnimeEpisodeOrQueue) {
        for (const cand of mp4Candidates) {
          if (signal.aborted) break;
          try {
            const extracted = await StreamExtractor.extract(cand.url);
            if (!extracted || extracted.type !== 'mp4' || !extracted.streamUrl) continue;

            const res = await nWin.NyAnimeOffline.downloadAnimeEpisodeOrQueue({
              animeId: seasonId,
              animeTitle: seasonTitle,
              cover: coverUrl,
              season: seasonNum,
              episode: ep,
              quality,
              directStreamUrl: extracted.streamUrl,
              fallbackWebUrl: fallbackUrl,
              saveToDeviceFilename: rawFilename,
              signal,
              onProgress: (pct: number, loadedBytes: number) => {
                const overall = Math.min(100, Math.round(((idx + pct / 100) / selected.length) * 100));
                const mb = (loadedBytes / (1024 * 1024)).toFixed(1);
                if (progText) {
                  progText.textContent = `Descargando T${seasonNum} · Ep. ${ep} (${idx + 1}/${selected.length}) · ${pct}% (${mb} MB)...`;
                }
                if (progBar) progBar.style.width = `${overall}%`;
              }
            });
            if (res.kind === 'anime-video') {
              mp4Count += 1;
              downloadedMp4 = true;
              break;
            }
          } catch (candErr: any) {
            if (candErr?.name === 'AbortError' || signal.aborted) throw candErr;
            // Try next MP4 mirror candidate if this server failed or returned HTML
          }
        }

        if (!downloadedMp4 && !signal.aborted) {
          const res = await nWin.NyAnimeOffline.downloadAnimeEpisodeOrQueue({
            animeId: seasonId,
            animeTitle: seasonTitle,
            cover: coverUrl,
            season: seasonNum,
            episode: ep,
            quality,
            directStreamUrl: null,
            fallbackWebUrl: fallbackUrl,
            signal
          });
          if (res.kind === 'anime-video') mp4Count += 1;
          else queuedCount += 1;
        }
      }
    }

    if (!signal.aborted) {
      if (progBar) progBar.style.width = '100%';
      await DownloadManager.updateBadge();
      cerrarModales();
      if (mp4Count > 0) {
        showToast(
          `✅ ${mp4Count} episodio(s) .MP4 descargados al dispositivo y en modo offline${queuedCount > 0 ? ` (+${queuedCount} en Ver Luego)` : ''}.`
        );
      } else {
        showToast(`🔖 ${queuedCount} episodio(s) guardados en "Ver Luego".`);
      }
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      showToast(`Error en descarga por lote: ${err?.message || err}`);
    }
  } finally {
    seasonDownloadAbortCtrl = null;
    if (progBox) progBox.classList.add('hide');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = '🚀 Descargar Episodios Seleccionados (.MP4)';
    }
  }
}

