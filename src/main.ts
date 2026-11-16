import './styles/main.css';

import {
  escapeHTML,
  safeImageUrl,
  safeExternalUrl,
  expandMangaQuery,
  computeUserRank,
  formatRelativeTime,
  generateSourceIconSvg,
  MANGA_SYNONYMS_DICT
} from './utils/sanitize.ts';
import * as OfflineService from './services/offline.ts';
import { importExternalList } from './services/importers.ts';
import { RealCommentsManager } from './services/comments.ts';
import { KeiyoushiCatalogManager } from './services/keiyoushi.ts';
import { organizeAnimeFranchise, computeAvailableEpisodes } from './utils/seasonOrder.ts';
import {
  normalizeMangaLang,
  normalizeMangaCompareTitle,
  tokenizeMangaTitle,
  scoreMangaTitleMatch,
  isStrictMangaTitleMatch,
  lookupMangaCatalogStrict,
  buildStrictLanguageBuckets,
  selectPageCandidatesForLanguage
} from './utils/mangaLanguage.ts';
import Hls from 'hls.js';
import {
  generateAnimeSlugCandidates,
  extractBestSearchQuery,
  buildAnimeSearchQueries,
  parseAnimeAv1CatalogLinks,
  parseTioAnimeDirectoryLinks,
  parseTvAnimeDirectoryLinks,
  pickBestSlugMatch,
  parseAnimeAv1EpisodeEmbeds,
  parseTioAnimeEpisodeVideos,
  parseTvAnimeEpisodePlayers,
  parseMonosChinosEpisodePlayers,
  parseMp4UploadDirectUrl,
  parseYourUploadDirectUrl,
  parseStreamWishDirectUrl,
  parseAnimePortalSearchSlugs,
  parseAnimePortalEpisodeData,
  parseHexOptServerList,
  parsePortalDownloadUrls,
  isBlockedOrUnsafeStreamHost,
  rankAndDeduplicateSources,
  formatAiringCountdown,
  extractEpisodeDetailsMap,
  selectBestArchiveOrgDocs,
  extractArchiveOrgSourcesFromMetadata,
  isArchiveOrgSpanishMetadata,
  parseHentaiJkSearchSlugs,
  parseHentaiJkEpisodeSources,
  parseJkPlayerDirectM3u8,
  resolveDotanboritoDirectM3u8,
  buildHentaiLaMediaImages,
  resolveDevalue,
  parseHentaiLaCatalogData,
  parseHentaiLaHubData,
  parseHentaiLaMediaDetail,
  parseHentaiLaEpisodeSources
} from './utils/animeSources.ts';
import {
  HENTAILA_GENRES,
  JKANIME_FILTER_CONFIG,
  JKANIME_GENRES,
  buildHentaiLaCatalogUrl,
  buildJKAnimeDirectoryUrl,
  parseJKAnimeDirectory,
  mapDirectoryFiltersToAniListVariables,
  filterMediaByLetter
} from './utils/directoryFilters.ts';

import {
  AnimeWatchedManager,
  CommentsManager,
  DownloadManager,
  FavoritesManager,
  HistoryManager,
  MangaFavoritesManager,
  MangaHistoryManager,
  MangaReadStateManager,
  UserManager,
  cambiarTab,
  cerrarModales,
  handleOpenExternal,
  mostrarToast,
  showToast,
  state,
  uiHooks
} from './ui/appState.ts';

import {
  abrirModalAuthEmail,
  abrirModalAvatar,
  abrirModalDescargas,
  abrirModalImportarMAL,
  abrirModalSugerencias,
  abrirModalVip,
  cerrarSesionUsuario,
  enviarSugerencia,
  exportarBackupJSON,
  forzarSyncFirebase,
  guardarPerfilUsuario,
  abrirImportarBackupJSON,
  importarBackupJSON,
  iniciarSesionGoogle,
  limpiarDescargasCompletadas,
  recuperarContrasena,
  reenviarVerificacionCorreo,
  setupAvatarOptions,
  sincronizarListaExterna,
  submitAuthEmail,
  toggleAuthModalMode
} from './ui/modals.ts';

import {
  cambiarPaginaBusqueda,
  cambiarSubTabFavoritos,
  cargarCatalogoHome,
  filtrarPorGenero,
  initSearchDirectoryFilters,
  limpiarHistorialAnime,
  onSearchDirectoryFilterChange,
  onSearchInput,
  quickSearch,
  realizarBusqueda,
  renderCategorias,
  renderContinuarViendo,
  renderFavoritos,
  resetSearchFilters,
  selectQuickSearchGenre,
  setSearchFilter,
  toggleSearchFilterDrawer
} from './ui/homeView.ts';

import {
  ScheduleReminderManager,
  cambiarFiltroEmision,
  cambiarOrdenEmision,
  cambiarVistaEmision,
  cargarEmisionCalendario,
  irAHoyEmision,
  onScheduleSearchInput,
  renderEmisionDia,
  renderEmisionDiasChips
} from './ui/scheduleView.ts';

import {
  AniListMangaService,
  InMangaProvider,
  KeiyoushiManager,
  ManhwaWebProvider,
  MangaDex,
  MangaPillProvider,
  SpanishWebtoonProvider,
  buscarMangaMultiFuente,
  mangaUiState,
  abrirMangaPorIndice,
  cambiarEstadoLectura,
  cambiarGeneroLectura,
  cambiarOrdenLectura,
  cambiarTipoLectura,
  cambiarVistaLectura,
  cargarMangasYNovelas,
  limpiarHistorialManga,
  onMangaSearchInput,
  recargarCatalogoManga,
  renderContinuarLeyendoManga,
  renderGridLectura,
  seleccionarSpotlightManga,
  toggleFavoritoMangaCard,
  toggleFavoritoMangaCardPorIndice
} from './ui/mangaCatalogView.ts';

import {
  abrirDetalleManga,
  abrirModalDescargaManga,
  cambiarIdiomaMangaModal,
  cancelarDescargaManga,
  cargarSiguienteLoteCapitulos,
  cargarTodosLosCapitulos,
  cerrarDetalleManga,
  cerrarModalDescargasManga,
  cerrarModalFuentesManga,
  filtrarCapitulosManga,
  iniciarDescargaCapitulos,
  iniciarOReanudarLecturaManga,
  mostrarModalFuentesManga,
  seleccionarFuenteManga,
  toggleFiltroLeidosManga,
  toggleMangaFavoritoActual,
  toggleMarcarCapituloLeido,
  toggleMarcarTodosLeidos,
  toggleSortCapitulosManga,
  toggleSynopsisExpand,
  updateMangaFavoriteButton
} from './ui/mangaDetailView.ts';

import {
  abrirAjustesLector,
  abrirLectorManga,
  abrirQuickCapsSheet,
  applyReaderSettingsFromCloud,
  cambiarAVersionInglesCapitulo,
  cerrarAjustesLector,
  cerrarLector,
  cerrarQuickCapsSheet,
  flushMangaReaderPage,
  getReaderSettings,
  handleMangaImgError,
  loadSavedReaderSettings,
  navegarCapituloLector,
  reintentarPaginaIndividual,
  saltarACapituloDesdeSheet,
  setReaderBg,
  setReaderMode,
  setReaderWidth,
  toggleLectorHUD
} from './ui/mangaReaderView.ts';

import {
  abrirDetalle,
  abrirModalDescargaTemporada,
  cancelarDescargaTemporada,
  cerrarDetalle,
  iniciarDescargaLote,
  iniciarOContinuarAnime,
  renderDetalleEpisodios,
  seleccionarTemporadaDetalle,
  toggleCrunchySeasonMenu,
  toggleFavoriteCurrentAnime,
  toggleTodosEpisodiosDescarga,
  updateFavoriteButton
} from './ui/animeDetailView.ts';

import {
  abrirReproductor,
  actualizarEstadoVistoPlayerUI,
  bindPlayerKeyboardShortcuts,
  cerrarReproductor,
  copiarEnlaceStreaming,
  descargarEpisodioActual,
  flushPlayerProgress,
  insertarReaccion,
  navegarEpisodioPlayer,
  probarFuenteAlternativa,
  publicarComentario,
  reproducirVideoOfflineCacheado,
  resolverContextoEpisodio,
  resolverYReproducirFuente,
  seleccionarAudio,
  seleccionarServidorManual,
  StreamExtractor,
  toggleEpisodioVistoPlayer,
  togglePantallaCompleta,
  togglePictureInPicture,
  videoSourceManager
} from './ui/playerView.ts';

import { handleAndroidBackButton, initApp } from './ui/profileView.ts';

interface MainWindow extends Window {
  [key: string]: any;
}

const mWin = window as unknown as MainWindow;

mWin.escapeHTML = escapeHTML;
mWin.safeImageUrl = safeImageUrl;
mWin.safeExternalUrl = safeExternalUrl;
mWin.NyAnimeUtils = {
  escapeHTML,
  safeImageUrl,
  safeExternalUrl,
  expandMangaQuery,
  computeUserRank,
  formatRelativeTime,
  generateSourceIconSvg,
  synonymsDict: MANGA_SYNONYMS_DICT
};

mWin.NyAnimeSeasons = {
  organizeAnimeFranchise,
  computeAvailableEpisodes
};

mWin.NyAnimeMangaLang = {
  normalizeMangaLang,
  normalizeMangaCompareTitle,
  tokenizeMangaTitle,
  scoreMangaTitleMatch,
  isStrictMangaTitleMatch,
  lookupMangaCatalogStrict,
  buildStrictLanguageBuckets,
  selectPageCandidatesForLanguage
};
mWin.ManhwaWebProvider = ManhwaWebProvider;
mWin.MangaDex = MangaDex;
mWin.mangaUiState = mangaUiState;
mWin.AniListMangaService = AniListMangaService;

mWin.Hls = Hls;

mWin.NyAnimeVideoSources = {
  generateAnimeSlugCandidates,
  extractBestSearchQuery,
  buildAnimeSearchQueries,
  parseAnimeAv1CatalogLinks,
  parseTioAnimeDirectoryLinks,
  parseTvAnimeDirectoryLinks,
  pickBestSlugMatch,
  parseAnimeAv1EpisodeEmbeds,
  parseTioAnimeEpisodeVideos,
  parseTvAnimeEpisodePlayers,
  parseMonosChinosEpisodePlayers,
  parseMp4UploadDirectUrl,
  parseYourUploadDirectUrl,
  parseStreamWishDirectUrl,
  parseAnimePortalSearchSlugs,
  parseAnimePortalEpisodeData,
  parseHexOptServerList,
  parsePortalDownloadUrls,
  isBlockedOrUnsafeStreamHost,
  rankAndDeduplicateSources,
  formatAiringCountdown,
  extractEpisodeDetailsMap,
  selectBestArchiveOrgDocs,
  extractArchiveOrgSourcesFromMetadata,
  isArchiveOrgSpanishMetadata,
  parseHentaiJkSearchSlugs,
  parseHentaiJkEpisodeSources,
  parseJkPlayerDirectM3u8,
  resolveDotanboritoDirectM3u8,
  buildHentaiLaMediaImages,
  resolveDevalue,
  parseHentaiLaCatalogData,
  parseHentaiLaHubData,
  parseHentaiLaMediaDetail,
  parseHentaiLaEpisodeSources
};

mWin.NyAnimeOffline = {
  ...OfflineService
};

mWin.NyAnimeImporters = {
  importExternalList
};

mWin.RealCommentsManager = RealCommentsManager;
mWin.KeiyoushiCatalogManager = KeiyoushiCatalogManager;
mWin.KeiyoushiManager = KeiyoushiManager;
mWin.NyAnimeDirectoryFilters = {
  HENTAILA_GENRES,
  JKANIME_FILTER_CONFIG,
  JKANIME_GENRES,
  buildHentaiLaCatalogUrl,
  buildJKAnimeDirectoryUrl,
  parseJKAnimeDirectory,
  mapDirectoryFiltersToAniListVariables,
  filterMediaByLetter
};

// Register UI hooks for cross-module callbacks without circular imports
Object.assign(uiHooks, {
  renderContinuarViendo,
  renderFavoritos,
  renderEmisionDiasChips,
  renderEmisionDia,
  renderContinuarLeyendoManga,
  renderGridLectura,
  updateFavoriteButton,
  updateMangaFavoriteButton,
  renderDetalleEpisodios,
  actualizarEstadoVistoPlayerUI,
  cerrarDetalle,
  cerrarDetalleManga,
  cerrarLector,
  cerrarReproductor,
  abrirDetalle,
  abrirDetalleManga,
  abrirLectorManga,
  cargarCatalogoHome,
  renderCategorias,
  cargarEmisionCalendario,
  cargarMangasYNovelas,
  setupAvatarOptions,
  loadSavedReaderSettings,
  flushPlayerProgress,
  flushMangaReaderPage,
  abrirModalAuthEmail,
  abrirModalDescargas,
  initSearchDirectoryFilters
});

// Expose global managers & handlers for Firebase bridge and inline HTML events
Object.assign(mWin, {
  state,
  UserManager,
  FavoritesManager,
  MangaFavoritesManager,
  HistoryManager,
  MangaHistoryManager,
  MangaReadStateManager,
  AnimeWatchedManager,
  CommentsManager,
  DownloadManager,
  ScheduleReminderManager,
  showToast,
  mostrarToast,
  cerrarModales,
  cambiarTab,
  handleOpenExternal,
  handleAndroidBackButton,
  getReaderSettings,
  applyReaderSettingsFromCloud,
  cerrarLectorManga: cerrarLector,
  // Modals & Profile
  iniciarSesionGoogle,
  abrirModalAuthEmail,
  toggleAuthModalMode,
  submitAuthEmail,
  recuperarContrasena,
  reenviarVerificacionCorreo,
  cerrarSesionUsuario,
  forzarSyncFirebase,
  exportarBackupJSON,
  abrirImportarBackupJSON,
  importarBackupJSON,
  abrirModalDescargas,
  limpiarDescargasCompletadas,
  abrirModalAvatar,
  guardarPerfilUsuario,
  abrirModalVip,
  abrirModalImportarMAL,
  sincronizarListaExterna,
  abrirModalSugerencias,
  enviarSugerencia,
  // Home, Search & Favorites
  limpiarHistorialAnime,
  filtrarPorGenero,
  setSearchFilter,
  quickSearch,
  onSearchInput,
  realizarBusqueda,
  toggleSearchFilterDrawer,
  onSearchDirectoryFilterChange,
  selectQuickSearchGenre,
  resetSearchFilters,
  cambiarPaginaBusqueda,
  cambiarSubTabFavoritos,
  // Schedule
  cargarEmisionCalendario,
  irAHoyEmision,
  cambiarFiltroEmision,
  cambiarOrdenEmision,
  cambiarVistaEmision,
  onScheduleSearchInput,
  // Manga Catalog
  ManhwaWebProvider,
  InMangaProvider,
  MangaPillProvider,
  SpanishWebtoonProvider,
  MangaDex,
  AniListMangaService,
  buscarMangaMultiFuente,
  cargarMangasYNovelas,
  recargarCatalogoManga,
  limpiarHistorialManga,
  onMangaSearchInput,
  cambiarTipoLectura,
  cambiarGeneroLectura,
  cambiarEstadoLectura,
  cambiarOrdenLectura,
  cambiarVistaLectura,
  seleccionarSpotlightManga,
  abrirMangaPorIndice,
  toggleFavoritoMangaCardPorIndice,
  toggleFavoritoMangaCard,
  // Manga Detail
  abrirDetalleManga,
  cerrarDetalleManga,
  toggleMangaFavoritoActual,
  mostrarModalFuentesManga,
  cerrarModalFuentesManga,
  seleccionarFuenteManga,
  abrirModalDescargaManga,
  cerrarModalDescargasManga,
  cancelarDescargaManga,
  iniciarDescargaCapitulos,
  toggleSynopsisExpand,
  iniciarOReanudarLecturaManga,
  toggleMarcarTodosLeidos,
  toggleMarcarCapituloLeido,
  cambiarIdiomaMangaModal,
  toggleSortCapitulosManga,
  toggleFiltroLeidosManga,
  filtrarCapitulosManga,
  cargarSiguienteLoteCapitulos,
  cargarTodosLosCapitulos,
  // Manga Reader
  abrirLectorManga,
  cerrarLector,
  toggleLectorHUD,
  navegarCapituloLector,
  abrirQuickCapsSheet,
  cerrarQuickCapsSheet,
  saltarACapituloDesdeSheet,
  abrirAjustesLector,
  cerrarAjustesLector,
  setReaderMode,
  setReaderBg,
  setReaderWidth,
  handleMangaImgError,
  reintentarPaginaIndividual,
  cambiarAVersionInglesCapitulo,
  // Anime Detail
  abrirDetalle,
  cerrarDetalle,
  toggleFavoriteCurrentAnime,
  iniciarOContinuarAnime,
  toggleCrunchySeasonMenu,
  seleccionarTemporadaDetalle,
  abrirModalDescargaTemporada,
  cancelarDescargaTemporada,
  toggleTodosEpisodiosDescarga,
  iniciarDescargaLote,
  // Video Player
  abrirReproductor,
  cerrarReproductor,
  navegarEpisodioPlayer,
  toggleEpisodioVistoPlayer,
  seleccionarAudio,
  seleccionarServidorManual,
  resolverYReproducirFuente,
  probarFuenteAlternativa,
  copiarEnlaceStreaming,
  togglePantallaCompleta,
  togglePictureInPicture,
  insertarReaccion,
  publicarComentario,
  descargarEpisodioActual,
  reproducirVideoOfflineCacheado,
  resolverContextoEpisodio,
  videoSourceManager,
  StreamExtractor
});

bindPlayerKeyboardShortcuts();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initApp(), { once: true });
} else {
  initApp();
}
