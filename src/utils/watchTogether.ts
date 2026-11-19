export interface FirestoreTimestampLike {
  toMillis?: () => number;
  seconds?: number;
  nanoseconds?: number;
}

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
  /** Anchor-based sync fields (preferred over per-second writes) */
  isPlaying?: boolean;
  anchorTime?: number;
  updatedAt?: FirestoreTimestampLike | number | null;
  updatedAtMs: number;
  updatedByUid?: string;
  updatedByName?: string;
  status: 'active' | 'closed';
  hasPasscode?: boolean;
  passcodeHash?: string;
  inviteTokenHash?: string;
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

export function sha256Hex(raw: string): string {
  const bytes = new TextEncoder().encode(String(raw ?? ''));
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, highBits, false);
  view.setUint32(paddedLen - 4, lowBits, false);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const W = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      W[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return Array.from(H)
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
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

export function generateRoomPasscode(randSource?: () => number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rnd = randSource || Math.random;
  let pin = '';
  for (let i = 0; i < 6; i += 1) {
    pin += alphabet[Math.floor(rnd() * alphabet.length) % alphabet.length];
  }
  return pin;
}

export function generateInviteToken(randSource?: () => number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rnd = randSource || Math.random;
  let token = '';
  for (let i = 0; i < 16; i += 1) {
    token += alphabet[Math.floor(rnd() * alphabet.length) % alphabet.length];
  }
  return token;
}

export function normalizeRoomSecret(raw: unknown): string {
  return String(raw ?? '').trim().slice(0, 64);
}

export function hashRoomSecret(roomId: string, secret: string): string {
  const normRoom = normalizeRoomCode(roomId);
  const cleanSecret = normalizeRoomSecret(secret);
  if (!normRoom || !cleanSecret) return '';
  return sha256Hex(`${normRoom}:${cleanSecret}`);
}

export function buildWatchRoomInviteUrl(
  origin: string,
  pathname: string,
  roomId: string,
  inviteToken?: string | null
): string {
  const normRoom = normalizeRoomCode(roomId);
  const cleanOrigin = String(origin || '').replace(/\/+$/, '');
  const cleanPath = String(pathname || '/').startsWith('/') ? String(pathname || '/') : `/${pathname}`;
  const params = new URLSearchParams();
  params.set('room', normRoom);
  const token = normalizeRoomSecret(inviteToken || '');
  if (token) {
    params.set('k', token);
  }
  return `${cleanOrigin}${cleanPath}?${params.toString()}`;
}

function parseParamsFromSearch(search: string): URLSearchParams | null {
  try {
    const rawStr = String(search || '').trim();
    if (!rawStr) return null;
    const qIdx = rawStr.indexOf('?');
    const cleanSearch =
      qIdx >= 0
        ? rawStr.slice(qIdx)
        : rawStr.startsWith('#')
          ? `?${rawStr.slice(1)}`
          : rawStr.startsWith('?')
            ? rawStr
            : rawStr.includes('=')
              ? `?${rawStr}`
              : '';
    if (!cleanSearch) return null;
    return new URLSearchParams(cleanSearch);
  } catch {
    return null;
  }
}

export function extractRoomCodeFromSearch(search: string): string {
  const params = parseParamsFromSearch(search);
  if (!params) return '';
  const raw = params.get('room');
  if (!raw) return '';
  const normalized = normalizeRoomCode(raw);
  return isValidRoomCode(normalized) ? normalized : '';
}

export function extractInviteKeyFromSearch(search: string): string {
  const params = parseParamsFromSearch(search);
  if (!params) return '';
  const key = params.get('k') || params.get('key') || params.get('invite') || params.get('pass') || '';
  return normalizeRoomSecret(key);
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

export function extractInviteKeyFromLocation(
  loc?: { search?: string; hash?: string; href?: string } | null,
  referrer?: string
): string {
  if (!loc && !referrer) return '';
  const fromSearch = extractInviteKeyFromSearch(loc?.search || '');
  if (fromSearch) return fromSearch;
  const fromHash = extractInviteKeyFromSearch(loc?.hash || '');
  if (fromHash) return fromHash;
  const fromHref = extractInviteKeyFromSearch(loc?.href || '');
  if (fromHref) return fromHref;
  const fromRef = extractInviteKeyFromSearch(referrer || '');
  if (fromRef) return fromRef;
  return '';
}

export function parseRoomJoinInput(raw: unknown): { roomId: string; inviteKey: string } {
  const str = String(raw ?? '').trim();
  if (!str) return { roomId: '', inviteKey: '' };
  if (/room=/i.test(str) || str.startsWith('http://') || str.startsWith('https://')) {
    const roomFromUrl = extractRoomCodeFromSearch(str);
    const keyFromUrl = extractInviteKeyFromSearch(str);
    if (roomFromUrl) {
      return { roomId: roomFromUrl, inviteKey: keyFromUrl };
    }
  }
  const normalized = normalizeRoomCode(str);
  return {
    roomId: isValidRoomCode(normalized) ? normalized : '',
    inviteKey: ''
  };
}

export function verifyRoomAccess(input: {
  room: Pick<WatchRoomState, 'roomId' | 'hostUid' | 'hasPasscode' | 'passcodeHash' | 'inviteTokenHash'>;
  currentUid: string;
  providedPasscode?: string;
  providedInviteKey?: string;
  rememberedPasscode?: string;
  rememberedInviteToken?: string;
}): {
  allowed: boolean;
  via?: 'host' | 'invite' | 'passcode' | 'open';
  matchedHash?: string;
  reason?: 'auth_required' | 'wrong_credentials';
} {
  const { room, currentUid } = input;
  if (room.hostUid && currentUid && room.hostUid === currentUid) {
    return {
      allowed: true,
      via: 'host',
      matchedHash: room.inviteTokenHash || room.passcodeHash || undefined
    };
  }

  const requiresSecret = Boolean(room.hasPasscode || room.passcodeHash || room.inviteTokenHash);
  if (!requiresSecret) {
    return { allowed: true, via: 'open' };
  }

  const inviteCandidates = [input.providedInviteKey, input.rememberedInviteToken]
    .map((v) => normalizeRoomSecret(v || ''))
    .filter(Boolean);
  if (room.inviteTokenHash) {
    for (const token of inviteCandidates) {
      if (hashRoomSecret(room.roomId, token) === room.inviteTokenHash) {
        return { allowed: true, via: 'invite', matchedHash: room.inviteTokenHash };
      }
    }
  }

  const passCandidates = [input.providedPasscode, input.rememberedPasscode]
    .map((v) => normalizeRoomSecret(v || ''))
    .filter(Boolean);
  if (room.passcodeHash) {
    for (const pass of passCandidates) {
      if (
        hashRoomSecret(room.roomId, pass) === room.passcodeHash ||
        hashRoomSecret(room.roomId, pass.toUpperCase()) === room.passcodeHash
      ) {
        return { allowed: true, via: 'passcode', matchedHash: room.passcodeHash };
      }
    }
  }

  const attempted = Boolean(
    normalizeRoomSecret(input.providedPasscode || '') || normalizeRoomSecret(input.providedInviteKey || '')
  );
  return {
    allowed: false,
    reason: attempted ? 'wrong_credentials' : 'auth_required'
  };
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

export function resolveRoomAnchorTimestampMs(
  room: Pick<WatchRoomState, 'updatedAt' | 'updatedAtMs'>,
  fallbackNowMs = Date.now()
): number {
  const raw = room.updatedAt;
  if (raw && typeof raw === 'object') {
    if (typeof raw.toMillis === 'function') {
      const ms = Number(raw.toMillis());
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
    if (typeof raw.seconds === 'number' && Number.isFinite(raw.seconds) && raw.seconds > 0) {
      const nanos = typeof raw.nanoseconds === 'number' && Number.isFinite(raw.nanoseconds) ? raw.nanoseconds : 0;
      return raw.seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
  } else if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw;
  }

  const legacyMs = Number(room.updatedAtMs || 0);
  if (Number.isFinite(legacyMs) && legacyMs > 0) {
    return legacyMs;
  }
  return fallbackNowMs;
}

export function isRoomPlaying(
  room: Pick<WatchRoomState, 'isPlaying' | 'playbackState'>
): boolean {
  if (typeof room.isPlaying === 'boolean') return room.isPlaying;
  return room.playbackState === 'playing';
}

export function computeTargetSyncedTime(
  room: Pick<WatchRoomState, 'playbackState' | 'playbackTime' | 'updatedAtMs' | 'isPlaying' | 'anchorTime' | 'updatedAt'>,
  nowMs = Date.now(),
  durationSec?: number | null,
  serverClockOffsetMs = 0
): number {
  const rawAnchor =
    typeof room.anchorTime === 'number' && Number.isFinite(room.anchorTime)
      ? room.anchorTime
      : Number(room.playbackTime || 0);
  const base = Math.max(0, rawAnchor);
  const clampToDuration = (val: number): number => {
    if (durationSec && Number.isFinite(durationSec) && durationSec > 0) {
      return Math.min(val, Math.max(0, durationSec - 0.5));
    }
    return val;
  };
  if (!isRoomPlaying(room)) {
    return clampToDuration(base);
  }
  const anchorMs = resolveRoomAnchorTimestampMs(room, nowMs);
  const adjustedNow = nowMs + (Number.isFinite(serverClockOffsetMs) ? serverClockOffsetMs : 0);
  const elapsedSec = Math.max(0, (adjustedNow - anchorMs) / 1000);
  const projected = base + Math.min(elapsedSec, 600);
  return clampToDuration(projected);
}

export function computeRoomDriftSeconds(
  localTimeSec: number,
  room: Pick<WatchRoomState, 'playbackState' | 'playbackTime' | 'updatedAtMs' | 'isPlaying' | 'anchorTime' | 'updatedAt'>,
  nowMs = Date.now(),
  durationSec?: number | null,
  serverClockOffsetMs = 0
): number {
  if (!Number.isFinite(localTimeSec)) return 0;
  const target = computeTargetSyncedTime(room, nowMs, durationSec, serverClockOffsetMs);
  return Math.abs(localTimeSec - target);
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
  room: Pick<WatchRoomState, 'updatedAt' | 'updatedAtMs' | 'updatedByUid' | 'hostUid'>,
  currentUid: string | null,
  lastAppliedUpdatedAtMs: number
): boolean {
  const incomingTs = resolveRoomAnchorTimestampMs(room, 0);
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


