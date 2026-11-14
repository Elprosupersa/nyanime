import {
  DownloadManager,
  UserManager,
  cambiarTab,
  cerrarModales,
  nWin,
  setupTouchGestures,
  showToast,
  state,
  uiHooks
} from './appState.ts';
import { ensureModalsMounted, setupAvatarOptions } from './modals.ts';

let lastBackPressTime = 0;

export function handleAndroidBackButton(): string {
  const openSheet = document.querySelector('.mihon-quick-caps-sheet.open');
  if (openSheet) {
    openSheet.classList.remove('open');
    return 'HANDLED';
  }

  const activeModal = document.querySelector('.modal-overlay.active, .modal-overlay.open, .ny-dialog.active, .ny-dialog.open');
  if (activeModal) {
    cerrarModales();
    return 'HANDLED';
  }

  const lector = document.getElementById('pantalla-lector');
  if (lector && !lector.classList.contains('hide')) {
    uiHooks.cerrarLector();
    return 'HANDLED';
  }

  const reproductor = document.getElementById('pantalla-reproductor');
  if (reproductor && !reproductor.classList.contains('hide')) {
    uiHooks.cerrarReproductor();
    return 'HANDLED';
  }

  const detalleManga = document.getElementById('pantalla-detalle-manga');
  if (detalleManga && !detalleManga.classList.contains('hide')) {
    uiHooks.cerrarDetalleManga();
    return 'HANDLED';
  }

  const detalle = document.getElementById('pantalla-detalle');
  if (detalle && !detalle.classList.contains('hide')) {
    uiHooks.cerrarDetalle();
    return 'HANDLED';
  }

  const favoritos = document.getElementById('pantalla-favoritos');
  if (favoritos && !favoritos.classList.contains('hide')) {
    cambiarTab('inicio');
    return 'HANDLED';
  }

  if (state.tabActual && state.tabActual !== 'inicio') {
    cambiarTab('inicio');
    return 'HANDLED';
  }

  const now = Date.now();
  if (now - lastBackPressTime < 2500) {
    return 'EXIT_APP';
  }
  lastBackPressTime = now;
  showToast('Presiona atrás otra vez para salir');
  return 'HANDLED';
}

export function initApp(): void {
  ensureModalsMounted();
  uiHooks.loadSavedReaderSettings();
  UserManager.renderProfile();
  void DownloadManager.updateBadge();
  void uiHooks.cargarCatalogoHome();
  uiHooks.renderCategorias();
  uiHooks.initSearchDirectoryFilters();
  uiHooks.renderContinuarViendo();
  uiHooks.renderFavoritos();
  void uiHooks.cargarEmisionCalendario();
  void uiHooks.cargarMangasYNovelas();
  setupAvatarOptions();
  setupTouchGestures();

  nWin.handleAndroidBackButton = handleAndroidBackButton;

  if (!nWin._nyLifecycleFlushesBound) {
    (nWin as any)._nyLifecycleFlushesBound = true;
    document.addEventListener('backbutton', (e) => {
      e.preventDefault();
      handleAndroidBackButton();
    }, false);
    window.addEventListener('pagehide', () => {
      uiHooks.flushPlayerProgress();
      uiHooks.flushMangaReaderPage();
    });
    window.addEventListener('beforeunload', () => {
      uiHooks.flushPlayerProgress();
      uiHooks.flushMangaReaderPage();
    });
  }
}
