export interface WatchRoomState {
  roomId: string;
  hostUid: string;
  hostName: string;
  animeId: number;
  seasonId?: number;
  animeTitle: string;
  seasonNum: number;
  episodeNum: number;
  playbackState: 'playing' | 'paused';
  playbackTime: number;
  updatedAtMs: number;
  updatedByUid?: string;
  updatedByName?: string;
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

export function extractRoomCodeFromSearch(search: string): string {
  try {
    const rawStr = String(search || '').trim();
    if (!rawStr) return '';
    const qIdx = rawStr.indexOf('?');
    const cleanSearch =
      qIdx >= 0
        ? rawStr.slice(qIdx)
        : rawStr.startsWith('#')
          ? `?${rawStr.slice(1)}`
          : rawStr.startsWith('?')
            ? rawStr
            : `?${rawStr}`;
    const params = new URLSearchParams(cleanSearch);
    const raw = params.get('room');
    if (!raw) return '';
    const normalized = normalizeRoomCode(raw);
    return isValidRoomCode(normalized) ? normalized : '';
  } catch {
    return '';
  }
}

export function extractRoomCodeFromLocation(
  loc?: { search?: string; hash?: string; href?: string } | null,
  referrer?: string
): string {
  if (!loc && !referrer) return '';
  const fromSearch = extractRoomCodeFromSearch(loc?.search || '');
  if (fromSearch) return fromSearch;
  const fromHash = extractRoomCodeFromSearch(loc?.hash || '');
  if (fromHash) return fromHash;
  const fromHref = extractRoomCodeFromSearch(loc?.href || '');
  if (fromHref) return fromHref;
  const fromRef = extractRoomCodeFromSearch(referrer || '');
  if (fromRef) return fromRef;
  return '';
}

export function getOrCreateWatchClientIdentity(
  authUser: { uid?: string | null; displayName?: string | null; email?: string | null; photoURL?: string | null } | null,
  localUser: { username?: string | null; avatar?: string | null } | null,
  existingGuestId?: string | null
): { uid: string; displayName: string; avatar: string; isGuest: boolean } {
  const defaultAvatar = 'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo';
  if (authUser?.uid) {
    const rawName =
      authUser.displayName ||
      (localUser?.username && localUser.username !== 'Invitado' ? localUser.username : '') ||
      authUser.email?.split('@')[0] ||
      'Usuario';
    const displayName = String(rawName).trim().slice(0, 80) || 'Usuario';
    const avatar = String(localUser?.avatar || authUser.photoURL || defaultAvatar).slice(0, 40000);
    return {
      uid: String(authUser.uid).slice(0, 128),
      displayName,
      avatar,
      isGuest: false
    };
  }

  const cleanExisting = String(existingGuestId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  const uid =
    /^guest_[a-zA-Z0-9_-]{6,64}$/.test(cleanExisting)
      ? cleanExisting
      : `guest_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
  const suffix = uid.slice(-4).toUpperCase();
  const localName =
    localUser?.username && localUser.username !== 'Invitado'
      ? String(localUser.username).trim()
      : `Invitado ${suffix}`;
  const displayName = localName.slice(0, 80) || `Invitado ${suffix}`;
  const avatar = String(localUser?.avatar || defaultAvatar).slice(0, 40000);
  return {
    uid,
    displayName,
    avatar,
    isGuest: true
  };
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

export function shouldApplyRemotePlaybackUpdate(
  room: Pick<WatchRoomState, 'updatedAtMs' | 'updatedByUid' | 'hostUid'>,
  currentUid: string | null,
  lastAppliedUpdatedAtMs: number
): boolean {
  const incomingTs = Number(room.updatedAtMs || 0);
  if (lastAppliedUpdatedAtMs === 0) {
    return true;
  }
  const actorUid = room.updatedByUid || room.hostUid || '';
  if (currentUid && actorUid === currentUid && incomingTs <= lastAppliedUpdatedAtMs + 1500) {
    return false;
  }
  return incomingTs >= lastAppliedUpdatedAtMs;
}

export function parseTimecodeInput(raw: unknown): number | null {
  const str = String(raw ?? '').trim();
  if (!str) return null;
  if (/^\d+(\.\d+)?$/.test(str)) {
    const val = Number(str);
    return Number.isFinite(val) && val >= 0 ? Math.min(86400, val) : null;
  }
  const parts = str.split(':').map((p) => p.trim());
  if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    const mins = Number(parts[0]);
    const secs = Number(parts[1]);
    if (secs >= 60) return null;
    return Math.min(86400, mins * 60 + secs);
  }
  if (
    parts.length === 3 &&
    /^\d+$/.test(parts[0]) &&
    /^\d+$/.test(parts[1]) &&
    /^\d+$/.test(parts[2])
  ) {
    const hrs = Number(parts[0]);
    const mins = Number(parts[1]);
    const secs = Number(parts[2]);
    if (mins >= 60 || secs >= 60) return null;
    return Math.min(86400, hrs * 3600 + mins * 60 + secs);
  }
  return null;
}

export function sanitizeWatchChatText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}


