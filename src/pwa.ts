import { registerSW } from 'virtual:pwa-register';
import {
  findMismatchedServiceWorkers,
  isDevServiceWorkerScript,
  shouldAllowSwTriggeredReload,
  trySafeReload
} from './utils/pwaReloadGuard.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface ToastActionOptions {
  label: string;
  onClick: () => void;
  durationMs?: number;
}

interface PWAWindow extends Window {
  NyAnimePWA?: {
    isInstallable: () => boolean;
    isInstalled: () => boolean;
    isIOS: () => boolean;
    isOnline: () => boolean;
    hasUpdateReady: () => boolean;
    install: () => Promise<boolean>;
    applyUpdate: () => Promise<void>;
    openInstallModal: () => void;
    closeInstallModal: () => void;
    refreshUI: () => void;
  };
  showToast?: (msg: string, opts?: ToastActionOptions) => void;
}

const pwaWin = window as unknown as PWAWindow;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let isInstalledState =
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as unknown as { standalone?: boolean }).standalone === true;

const ua = window.navigator.userAgent.toLowerCase();
const isIOSDevice = /iphone|ipad|ipod/.test(ua);
let isOnlineState = typeof navigator !== 'undefined' ? navigator.onLine : true;
let updateReadyState = false;
let userRequestedUpdate = false;

async function cleanupMismatchedRegistrations(swUrl: string): Promise<void> {
  if (!('serviceWorker' in navigator) || typeof navigator.serviceWorker.getRegistrations !== 'function') {
    return;
  }
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const mismatched = findMismatchedServiceWorkers(regs, isDevServiceWorkerScript(swUrl));
    await Promise.all(mismatched.map((reg) => reg.unregister().catch(() => false)));
  } catch {
    // Ignore SW inspection errors in restricted webviews
  }
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateReadyState = true;
    pwaWin.showToast?.('Nueva versión disponible', {
      label: 'Actualizar',
      durationMs: 9000,
      onClick: () => {
        void applyPWAUpdate();
      }
    });
  },
  onNeedReload() {
    if (!shouldAllowSwTriggeredReload({ userRequested: userRequestedUpdate })) {
      return;
    }
    trySafeReload(window.sessionStorage, () => {
      window.location.reload();
    });
  },
  onOfflineReady() {
    pwaWin.showToast?.('NyAnime listo para abrirse rápido como App');
  },
  onRegisteredSW(swUrl) {
    void cleanupMismatchedRegistrations(swUrl);
  }
});

async function applyPWAUpdate(): Promise<void> {
  userRequestedUpdate = true;
  updateReadyState = false;
  try {
    await updateSW(true);
  } catch {
    userRequestedUpdate = false;
  }
}

function refreshPWAInstallUI() {
  const headerBtn = document.getElementById('btn-install-pwa-header');
  const profileCard = document.getElementById('card-install-pwa');
  const installActionBtn = document.getElementById('btn-pwa-install-action');
  const offlineBanner = document.getElementById('pwa-offline-banner');

  if (offlineBanner) {
    offlineBanner.classList.toggle('hide', isOnlineState);
  }

  if (isInstalledState) {
    if (headerBtn) headerBtn.classList.add('hide');
    if (profileCard) profileCard.classList.add('hide');
    return;
  }

  if (headerBtn) headerBtn.classList.remove('hide');
  if (profileCard) profileCard.classList.remove('hide');

  if (installActionBtn) {
    if (deferredPrompt) {
      installActionBtn.textContent = '📲 Instalar App Ahora (1 Clic)';
    } else if (isIOSDevice) {
      installActionBtn.textContent = '📱 Instalar en iPhone / iPad';
    } else {
      installActionBtn.textContent = '📲 Instalar en tu Celular';
    }
  }
}

window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  refreshPWAInstallUI();
});

window.addEventListener('appinstalled', () => {
  isInstalledState = true;
  deferredPrompt = null;
  refreshPWAInstallUI();
  pwaWin.showToast?.('¡NyAnime TV instalado en tu dispositivo ✓!');
});

window.addEventListener('online', () => {
  isOnlineState = true;
  refreshPWAInstallUI();
});

window.addEventListener('offline', () => {
  isOnlineState = false;
  refreshPWAInstallUI();
});

async function promptNativeInstall(): Promise<boolean> {
  if (!deferredPrompt) {
    openPWAInstallModal();
    return false;
  }
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    isInstalledState = true;
    deferredPrompt = null;
    refreshPWAInstallUI();
    return true;
  }
  return false;
}

function openPWAInstallModal() {
  const modal = document.getElementById('modal-pwa-install');
  const nativeBtn = document.getElementById('modal-pwa-native-btn');
  const iosSteps = document.getElementById('modal-pwa-ios-steps');
  const androidSteps = document.getElementById('modal-pwa-android-steps');

  if (nativeBtn) {
    nativeBtn.classList.toggle('hide', !deferredPrompt);
  }
  if (iosSteps && androidSteps) {
    iosSteps.classList.toggle('hide', !isIOSDevice);
    androidSteps.classList.toggle('hide', isIOSDevice);
  }
  if (modal) modal.classList.add('active');
}

function closePWAInstallModal() {
  const modal = document.getElementById('modal-pwa-install');
  if (modal) modal.classList.remove('active');
}

pwaWin.NyAnimePWA = {
  isInstallable: () => Boolean(deferredPrompt),
  isInstalled: () => isInstalledState,
  isIOS: () => isIOSDevice,
  isOnline: () => isOnlineState,
  hasUpdateReady: () => updateReadyState,
  install: promptNativeInstall,
  applyUpdate: applyPWAUpdate,
  openInstallModal: openPWAInstallModal,
  closeInstallModal: closePWAInstallModal,
  refreshUI: refreshPWAInstallUI
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refreshPWAInstallUI);
} else {
  refreshPWAInstallUI();
}
