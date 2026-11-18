export const PWA_RELOAD_GUARD_KEY = 'nyanime_pwa_reload_guard_v1';
export const PWA_RELOAD_COOLDOWN_MS = 30_000;
export const PWA_MAX_SESSION_RELOADS = 1;

export interface ReloadGuardState {
  count: number;
  lastReloadAt: number;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface SwReloadDecisionInput {
  userRequested: boolean;
  isExternal?: boolean;
  isUpdate?: boolean;
}

export interface MinimalSwRegistration {
  active?: { scriptURL?: string } | null;
  waiting?: { scriptURL?: string } | null;
  installing?: { scriptURL?: string } | null;
}

export function isDevServiceWorkerScript(scriptUrl: string | null | undefined): boolean {
  if (!scriptUrl) return false;
  return /\/dev-sw\.js(?:\?|$)/i.test(String(scriptUrl));
}

export function isProdServiceWorkerScript(scriptUrl: string | null | undefined): boolean {
  if (!scriptUrl) return false;
  return /\/sw\.js(?:\?|$)/i.test(String(scriptUrl));
}

export function shouldAllowSwTriggeredReload(input: SwReloadDecisionInput): boolean {
  // Never auto-reload on background/external SW activations (mobile resume, multi-tab, PWA launch).
  // Only allow reload when the user explicitly confirmed an update prompt.
  return input.userRequested === true;
}

export function readReloadGuardState(storage: StorageLike | null | undefined): ReloadGuardState {
  if (!storage) return { count: 0, lastReloadAt: 0 };
  try {
    const raw = storage.getItem(PWA_RELOAD_GUARD_KEY);
    if (!raw) return { count: 0, lastReloadAt: 0 };
    const parsed = JSON.parse(raw) as Partial<ReloadGuardState>;
    const count = Number.isFinite(Number(parsed.count)) ? Math.max(0, Math.floor(Number(parsed.count))) : 0;
    const lastReloadAt = Number.isFinite(Number(parsed.lastReloadAt))
      ? Math.max(0, Number(parsed.lastReloadAt))
      : 0;
    return { count, lastReloadAt };
  } catch {
    return { count: 0, lastReloadAt: 0 };
  }
}

export function trySafeReload(
  storage: StorageLike | null | undefined,
  reloadFn: () => void,
  options: {
    nowMs?: number;
    cooldownMs?: number;
    maxReloads?: number;
  } = {}
): boolean {
  const nowMs = options.nowMs ?? Date.now();
  const cooldownMs = options.cooldownMs ?? PWA_RELOAD_COOLDOWN_MS;
  const maxReloads = options.maxReloads ?? PWA_MAX_SESSION_RELOADS;

  if (!storage) {
    // Without sessionStorage we cannot guarantee loop safety; refuse unguarded auto-reloads.
    return false;
  }

  const state = readReloadGuardState(storage);
  if (state.count >= maxReloads) {
    return false;
  }
  if (state.lastReloadAt > 0 && nowMs - state.lastReloadAt < cooldownMs) {
    return false;
  }

  const nextState: ReloadGuardState = {
    count: state.count + 1,
    lastReloadAt: nowMs
  };

  try {
    storage.setItem(PWA_RELOAD_GUARD_KEY, JSON.stringify(nextState));
  } catch {
    // If sessionStorage throws (e.g. strict quota/private mode), abort reload to avoid infinite loops.
    return false;
  }

  reloadFn();
  return true;
}

export function isFirebaseMessagingServiceWorkerScript(scriptUrl: string | null | undefined): boolean {
  if (!scriptUrl) return false;
  return /\/firebase-messaging-sw\.js(?:\?|$)/i.test(String(scriptUrl));
}

export function findMismatchedServiceWorkers<T extends MinimalSwRegistration>(
  registrations: readonly T[],
  currentIsDevSw: boolean
): T[] {
  return registrations.filter((reg) => {
    const urls = [
      reg.active?.scriptURL,
      reg.waiting?.scriptURL,
      reg.installing?.scriptURL
    ].filter((u): u is string => Boolean(u));
    if (urls.length === 0) return false;
    if (urls.some((u) => isFirebaseMessagingServiceWorkerScript(u))) {
      return false;
    }
    if (currentIsDevSw) {
      return urls.some((u) => isProdServiceWorkerScript(u));
    }
    return urls.some((u) => isDevServiceWorkerScript(u));
  });
}
