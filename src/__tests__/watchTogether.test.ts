import { describe, expect, it } from 'vitest';
import {
  computeTargetSyncedTime,
  extractRoomCodeFromLocation,
  extractRoomCodeFromSearch,
  generateRoomCode,
  getOrCreateWatchClientIdentity,
  isValidRoomCode,
  parseTimecodeInput,
  sanitizeWatchChatText,
  shouldApplyRemotePlaybackUpdate,
  shouldSeekForDrift
} from '../utils/watchTogether.ts';

describe('watchTogether utilities', () => {
  it('generates and validates room codes & parses ?room= URL queries and referrers', () => {
    const code = generateRoomCode(() => 0.1);
    expect(code.startsWith('NY-')).toBe(true);
    expect(isValidRoomCode(code)).toBe(true);
    expect(extractRoomCodeFromSearch('?room=ny-ab12cd&foo=1')).toBe('NY-AB12CD');
    expect(extractRoomCodeFromSearch('?room=x')).toBe('');
    expect(
      extractRoomCodeFromLocation(
        { search: '', hash: '#room=ny-tdune3' },
        'https://nyanime.ai.studio/'
      )
    ).toBe('NY-TDUNE3');
    expect(
      extractRoomCodeFromLocation(
        { search: '', hash: '' },
        'https://nyanime.ai.studio/?room=NY-TDUNE3'
      )
    ).toBe('NY-TDUNE3');
  });

  it('builds deterministic client identities for both authenticated and guest sessions', () => {
    const authIdentity = getOrCreateWatchClientIdentity(
      { uid: 'firebase_123', displayName: 'Jaime' },
      null,
      null
    );
    expect(authIdentity.uid).toBe('firebase_123');
    expect(authIdentity.isGuest).toBe(false);

    const guestIdentity = getOrCreateWatchClientIdentity(null, null, 'guest_abcd1234');
    expect(guestIdentity.uid).toBe('guest_abcd1234');
    expect(guestIdentity.isGuest).toBe(true);
    expect(guestIdentity.displayName.startsWith('Invitado')).toBe(true);
  });

  it('compensates elapsed playback time and guards against seek loops', () => {
    const now = 1_000_000;
    expect(
      computeTargetSyncedTime(
        { playbackState: 'paused', playbackTime: 42, updatedAtMs: now - 10_000 },
        now
      )
    ).toBe(42);

    expect(
      computeTargetSyncedTime(
        { playbackState: 'playing', playbackTime: 40, updatedAtMs: now - 5_000 },
        now,
        1400
      )
    ).toBeCloseTo(45);

    expect(shouldSeekForDrift(44.2, 45.0, 1.8)).toBe(false);
    expect(shouldSeekForDrift(41.0, 45.0, 1.8)).toBe(true);
  });

  it('prevents self-echo while applying remote updates from any participant', () => {
    expect(
      shouldApplyRemotePlaybackUpdate(
        { updatedAtMs: 5000, updatedByUid: 'user-a', hostUid: 'user-a' },
        'user-a',
        0
      )
    ).toBe(true);

    expect(
      shouldApplyRemotePlaybackUpdate(
        { updatedAtMs: 5200, updatedByUid: 'user-a', hostUid: 'user-a' },
        'user-a',
        5000
      )
    ).toBe(false);

    expect(
      shouldApplyRemotePlaybackUpdate(
        { updatedAtMs: 5200, updatedByUid: 'user-b', hostUid: 'user-a' },
        'user-a',
        5000
      )
    ).toBe(true);
  });

  it('parses MM:SS, HH:MM:SS, and raw seconds timecodes accurately', () => {
    expect(parseTimecodeInput('04:15')).toBe(255);
    expect(parseTimecodeInput('1:02:05')).toBe(3725);
    expect(parseTimecodeInput('90')).toBe(90);
    expect(parseTimecodeInput('12:75')).toBeNull();
  });

  it('sanitizes room chat messages safely', () => {
    expect(sanitizeWatchChatText('  Hola\n\nmundo!  ')).toBe('Hola mundo!');
  });
});


