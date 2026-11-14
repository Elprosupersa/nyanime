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
