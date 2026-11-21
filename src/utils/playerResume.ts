export interface ProgressResumeInput {
  currentTime: number;
  duration: number;
}

export const RESUME_MIN_RATIO = 0.05;
export const RESUME_MAX_RATIO = 0.92;
export const COMPLETION_THRESHOLD_RATIO = 0.90;

export function computeProgressPercent(currentTime: number, duration: number): number {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0 || currentTime <= 0) {
    return 0;
  }
  const ratio = Math.min(1, Math.max(0, currentTime / duration));
  return Math.round(ratio * 100);
}

export function shouldResumePlayback(currentTime: number, duration: number): boolean {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0 || currentTime <= 0) {
    return false;
  }
  const ratio = currentTime / duration;
  return ratio >= RESUME_MIN_RATIO && ratio <= RESUME_MAX_RATIO;
}

export function shouldMarkEpisodeCompleted(currentTime: number, duration: number): boolean {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0 || currentTime <= 0) {
    return false;
  }
  return currentTime / duration >= COMPLETION_THRESHOLD_RATIO;
}

export function formatPlaybackTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '00:00';
  }
  const whole = Math.floor(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function buildUpNextCountdownText(nextEpisodeNum: number, secondsLeft: number): string {
  const ep = Math.max(1, Math.floor(nextEpisodeNum));
  const secs = Math.max(0, Math.ceil(secondsLeft));
  return `Siguiente: Ep. ${ep} en ${secs}s...`;
}

export const NATIVE_STARTUP_FAILOVER_MS = 5000;
export const NATIVE_BUFFER_TIMEOUT_MS = 15000;

export interface WatchdogVideoLike {
  readonly readyState: number;
  addEventListener: (type: string, listener: () => void, options?: { once?: boolean }) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export interface NativeStartupWatchdogOptions {
  video: WatchdogVideoLike;
  startupTimeoutMs?: number;
  fullTimeoutMs?: number;
  isStillActive: () => boolean;
  hasAlternativeServers: () => boolean;
  onAbortAttempt: () => void;
  onFastFailover: (reason: string) => void;
  onFinalTimeout: (reason: string) => void;
}

export interface NativeStartupWatchdogHandle {
  markReady: () => void;
  cancel: () => void;
}

/**
 * Watches a native <video> element during startup:
 * - If readyState remains 0 (no metadata / no first frame) for 5s and alternative servers exist,
 *   aborts the stalled attempt immediately and triggers automatic failover to the next server.
 * - If metadata arrives (readyState >= 1) or no alternative servers exist, allows up to 15s
 *   for first-frame buffering before falling back or showing a timeout notice.
 */
export function attachNativeStartupFailoverWatchdog(
  options: NativeStartupWatchdogOptions
): NativeStartupWatchdogHandle {
  const startupMs = Math.max(100, Number(options.startupTimeoutMs ?? NATIVE_STARTUP_FAILOVER_MS));
  const fullMs = Math.max(startupMs, Number(options.fullTimeoutMs ?? NATIVE_BUFFER_TIMEOUT_MS));

  let settled = false;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  let fullTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (startupTimer !== null) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
    if (fullTimer !== null) {
      clearTimeout(fullTimer);
      fullTimer = null;
    }
  };

  const onMetadata = () => {
    if (startupTimer !== null) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
  };

  const detachListeners = () => {
    options.video.removeEventListener?.('loadedmetadata', onMetadata);
    options.video.removeEventListener?.('loadeddata', onReady);
    options.video.removeEventListener?.('canplay', onReady);
    options.video.removeEventListener?.('playing', onReady);
  };

  const onReady = () => {
    if (settled) return;
    settled = true;
    clearTimers();
    detachListeners();
  };

  options.video.addEventListener('loadedmetadata', onMetadata, { once: true });
  options.video.addEventListener('loadeddata', onReady, { once: true });
  options.video.addEventListener('canplay', onReady, { once: true });
  options.video.addEventListener('playing', onReady, { once: true });

  startupTimer = setTimeout(() => {
    startupTimer = null;
    if (settled || !options.isStillActive()) return;
    if (Number(options.video.readyState || 0) === 0 && options.hasAlternativeServers()) {
      settled = true;
      clearTimers();
      detachListeners();
      options.onAbortAttempt();
      const secs = Math.max(1, Math.round(startupMs / 1000));
      options.onFastFailover(`Sin respuesta inicial en ${secs}s · saltando al siguiente servidor...`);
    }
  }, startupMs);

  fullTimer = setTimeout(() => {
    fullTimer = null;
    if (settled || !options.isStillActive()) return;
    settled = true;
    clearTimers();
    detachListeners();
    if (options.hasAlternativeServers()) {
      options.onAbortAttempt();
      options.onFastFailover('El servidor tardó demasiado en cargar · cambiando al siguiente servidor...');
    } else {
      options.onFinalTimeout('El servidor tardó demasiado en cargar.');
    }
  }, fullMs);

  return {
    markReady: onReady,
    cancel: () => {
      if (settled) return;
      settled = true;
      clearTimers();
      detachListeners();
    }
  };
}

