import { registerSW } from 'virtual:pwa-register';
import {
  findMismatchedServiceWorkers,
  isDevServiceWorkerScript,
  shouldAllowSwTriggeredReload,
  trySafeReload
} from './utils/pwaReloadGuard.ts';
import { urlBase64ToUint8Array } from './utils/pushNotifications.ts';

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
    isPushSupported: () => boolean;
    getPushEndpoint: () => Promise<string | null>;
    getFcmToken: () => string | null;
    getPushStatus: () => Promise<{ active: boolean; provider: 'fcm' | 'webpush' | null; endpoint: string | null; fcmToken: string | null }>;
    subscribeWebPush: (uid?: string) => Promise<{ ok: boolean; endpoint?: string; fcmToken?: string; provider?: string; reason?: string }>;
    unsubscribeWebPush: () => Promise<boolean>;
    sendTestPush: () => Promise<boolean>;
    dispatchAiringPush: (items: Array<{ animeId: number; title: string; episode: number; body: string }>) => Promise<boolean>;
    sendWeeklyDigestPush: (headline: string) => Promise<boolean>;
  };
  FirebaseMessaging?: {
    getCachedToken?: () => string | null;
    requestToken?: () => Promise<{ ok: boolean; token?: string; reason?: string }>;
    revokeToken?: () => Promise<boolean>;
    syncSubscriptionToCloud?: (input: { endpoint?: string; fcmToken?: string; provider: 'fcm' | 'webpush' }) => Promise<void>;
    removeCloudSubscriptions?: () => Promise<void>;
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

if (import.meta.env.DEV) {
  void cleanupMismatchedRegistrations('/dev-sw.js');
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

function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function getActiveSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw-push.js').catch(() => null);
  } catch {
    return null;
  }
}

function getCachedFcmToken(): string | null {
  try {
    return pwaWin.FirebaseMessaging?.getCachedToken?.() || localStorage.getItem('nyanime_fcm_token_v1');
  } catch {
    return null;
  }
}

async function getPushEndpoint(): Promise<string | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await getActiveSwRegistration();
    if (!reg) return null;
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint || null;
  } catch {
    return null;
  }
}

async function getPushStatus(): Promise<{
  active: boolean;
  provider: 'fcm' | 'webpush' | null;
  endpoint: string | null;
  fcmToken: string | null;
}> {
  const fcmToken = getCachedFcmToken();
  const reg = await getActiveSwRegistration();
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  const endpoint = sub?.endpoint || null;
  const enabledFlag = localStorage.getItem('nyanime_push_enabled') === '1';
  const active = Boolean(endpoint || fcmToken || (enabledFlag && typeof Notification !== 'undefined' && Notification.permission === 'granted'));
  const provider = endpoint ? 'webpush' : fcmToken ? 'fcm' : null;
  return { active, provider, endpoint, fcmToken };
}

async function subscribeWebPush(
  uid = 'local'
): Promise<{ ok: boolean; endpoint?: string; fcmToken?: string; provider?: string; reason?: string }> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'Tu navegador no soporta Web Push.' };
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    return { ok: false, reason: 'Permiso de notificaciones denegado en el navegador.' };
  }

  let webPushEndpoint: string | undefined;
  let webPushSubJson: PushSubscriptionJSON | undefined;
  let fcmToken: string | undefined;

  // 1. Primary reliable channel: standard Web Push VAPID via PushManager
  const reg = await getActiveSwRegistration();
  if (reg) {
    try {
      const keyResp = await fetch('/api/push/vapid-public-key');
      if (keyResp.ok) {
        const { publicKey } = (await keyResp.json()) as { publicKey?: string };
        if (publicKey) {
          let sub = await reg.pushManager.getSubscription();
          if (!sub) {
            const appServerKey = urlBase64ToUint8Array(publicKey);
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: appServerKey.buffer as ArrayBuffer
            });
          }
          webPushEndpoint = sub.endpoint;
          webPushSubJson = sub.toJSON();
        }
      }
    } catch {
      // Continue to optional FCM token attempt below
    }
  }

  // 2. Optional secondary registration: Firebase Cloud Messaging token (requires FCM HTTP v1 service account for server-side dispatch)
  if (pwaWin.FirebaseMessaging?.requestToken) {
    try {
      const fcmRes = await pwaWin.FirebaseMessaging.requestToken();
      if (fcmRes?.ok && fcmRes.token) {
        fcmToken = fcmRes.token;
      }
    } catch {
      // Non-fatal; Web Push VAPID is primary
    }
  }

  if (!webPushSubJson && !fcmToken) {
    return { ok: false, reason: 'No se pudo obtener suscripción Web Push VAPID en este navegador.' };
  }

  try {
    const saveResp = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid,
        ...(webPushSubJson ? { subscription: webPushSubJson } : {}),
        ...(fcmToken ? { fcmToken } : {})
      })
    });
    if (!saveResp.ok) {
      return { ok: false, reason: 'Error registrando la suscripción Push en el servidor.' };
    }
  } catch {
    return { ok: false, reason: 'Error de red registrando la suscripción Push.' };
  }

  const primaryProvider: 'webpush' | 'fcm' = webPushSubJson ? 'webpush' : 'fcm';
  if (webPushEndpoint && pwaWin.FirebaseMessaging?.syncSubscriptionToCloud) {
    await pwaWin.FirebaseMessaging.syncSubscriptionToCloud({
      endpoint: webPushEndpoint,
      ...(fcmToken ? { fcmToken } : {}),
      provider: primaryProvider
    }).catch(() => {});
  }

  localStorage.setItem('nyanime_push_enabled', '1');
  return {
    ok: true,
    endpoint: webPushEndpoint,
    fcmToken,
    provider: primaryProvider
  };
}

async function unsubscribeWebPush(): Promise<boolean> {
  try {
    const fcmToken = getCachedFcmToken();
    const reg = await getActiveSwRegistration();
    const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
    if (sub || fcmToken) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(sub?.endpoint ? { endpoint: sub.endpoint } : {}),
          ...(fcmToken ? { fcmToken } : {})
        })
      }).catch(() => {});
      if (sub) {
        await sub.unsubscribe().catch(() => {});
      }
    }
    if (pwaWin.FirebaseMessaging?.revokeToken) {
      await pwaWin.FirebaseMessaging.revokeToken().catch(() => {});
    }
    localStorage.removeItem('nyanime_push_enabled');
    localStorage.removeItem('nyanime_fcm_token_v1');
    return true;
  } catch {
    return false;
  }
}

async function handlePushDispatchResponse(resp: Response): Promise<boolean> {
  const data = (await resp.json().catch(() => null)) as
    | { sent?: number; purged?: number; warnings?: string[]; error?: string }
    | null;
  if (data && Number(data.purged || 0) > 0) {
    localStorage.removeItem('nyanime_push_enabled');
    pwaWin.showToast?.('Tu suscripción Push expiró y fue limpiada. Reactívala en Perfil.');
  }
  if (!resp.ok) {
    if (data?.warnings?.[0]) {
      console.warn('[NyAnime Push]', data.warnings[0]);
    }
    return false;
  }
  return Boolean(data && Number(data.sent || 0) > 0);
}

async function sendTestPush(): Promise<boolean> {
  try {
    const endpoint = await getPushEndpoint();
    const fcmToken = getCachedFcmToken();
    const resp = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(endpoint ? { endpoint } : {}),
        ...(fcmToken ? { fcmToken } : {})
      })
    });
    return await handlePushDispatchResponse(resp);
  } catch {
    return false;
  }
}

async function dispatchAiringPush(
  items: Array<{ animeId: number; title: string; episode: number; body: string }>
): Promise<boolean> {
  if (!items || items.length === 0) return false;
  try {
    const endpoint = await getPushEndpoint();
    const fcmToken = getCachedFcmToken();
    const resp = await fetch('/api/push/check-airing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(endpoint ? { endpoint } : {}),
        ...(fcmToken ? { fcmToken } : {}),
        items
      })
    });
    return await handlePushDispatchResponse(resp);
  } catch {
    return false;
  }
}

async function sendWeeklyDigestPush(headline: string): Promise<boolean> {
  try {
    const endpoint = await getPushEndpoint();
    const fcmToken = getCachedFcmToken();
    const resp = await fetch('/api/push/send-weekly-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(endpoint ? { endpoint } : {}),
        ...(fcmToken ? { fcmToken } : {}),
        headline
      })
    });
    return await handlePushDispatchResponse(resp);
  } catch {
    return false;
  }
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
  refreshUI: refreshPWAInstallUI,
  isPushSupported,
  getPushEndpoint,
  getFcmToken: getCachedFcmToken,
  getPushStatus,
  subscribeWebPush,
  unsubscribeWebPush,
  sendTestPush,
  dispatchAiringPush,
  sendWeeklyDigestPush
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refreshPWAInstallUI);
} else {
  refreshPWAInstallUI();
}
