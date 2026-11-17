export interface WatchRoomState {
  roomId: string;
  hostUid: string;
  hostName: string;
  animeId: number;
  animeTitle: string;
  seasonNum: number;
  episodeNum: number;
  playbackState: 'playing' | 'paused';
  playbackTime: number;
  updatedAtMs: number;
  status: 'active' | 'closed';
}

export function normalizeRoomCode(raw: unknown): string {
  const clean = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .trim();
  return clean.slice(0, 16);
}

export function isValidRoomCode(raw: unknown): boolean {
  const clean = normalizeRoomCode(raw);
  return /^[A-Z0-9_-]{4,16}$/.test(clean);
}

export function generateRoomCode(randSource?: () => number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rnd = randSource || Math.random;
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(rnd() * alphabet.length) % alphabet.length];
  }
  return `NY-${code}`;
}

export function extractRoomCodeFromSearch(search: string): string | null {
  try {
    const cleanSearch = String(search || '').startsWith('?')
      ? String(search || '')
      : `?${String(search || '')}`;
    const params = new URLSearchParams(cleanSearch);
    const raw = params.get('room');
    if (!raw) return null;
    const normalized = normalizeRoomCode(raw);
    return isValidRoomCode(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function computeTargetSyncedTime(
  room: Pick<WatchRoomState, 'playbackState' | 'playbackTime' | 'updatedAtMs'>,
  nowMs = Date.now(),
  durationSec?: number | null
): number {
  const base = Math.max(0, Number(room.playbackTime || 0));
  if (room.playbackState !== 'playing') {
    return base;
  }
  const elapsedSec = Math.max(0, (nowMs - Number(room.updatedAtMs || nowMs)) / 1000);
  const projected = base + Math.min(elapsedSec, 600);
  if (durationSec && Number.isFinite(durationSec) && durationSec > 0) {
    return Math.min(projected, Math.max(0, durationSec - 0.5));
  }
  return projected;
}

export function shouldSeekForDrift(
  localTimeSec: number,
  targetTimeSec: number,
  thresholdSec = 1.8
): boolean {
  if (!Number.isFinite(localTimeSec) || !Number.isFinite(targetTimeSec)) return false;
  return Math.abs(localTimeSec - targetTimeSec) > thresholdSec;
}

export function sanitizeWatchChatText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}
