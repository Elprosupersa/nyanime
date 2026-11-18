import { describe, expect, it } from 'vitest';
import {
  buildWatchRoomInviteUrl,
  computeTargetSyncedTime,
  extractInviteKeyFromLocation,
  extractRoomCodeFromLocation,
  extractRoomCodeFromSearch,
  generateInviteToken,
  generateRoomCode,
  generateRoomPasscode,
  getOrCreateWatchClientIdentity,
  hashRoomSecret,
  isValidRoomCode,
  parseRoomJoinInput,
  parseTimecodeInput,
  sanitizeWatchChatText,
  sha256Hex,
  shouldApplyRemotePlaybackUpdate,
  shouldSeekForDrift,
  verifyRoomAccess
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

  it('computes standard SHA-256 digests and verifies room access via passcode, invite token, or host', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

    const passcode = generateRoomPasscode(() => 0.25);
    const inviteToken = generateInviteToken(() => 0.5);
    expect(passcode.length).toBe(6);
    expect(inviteToken.length).toBe(16);

    const room = {
      roomId: 'NY-SECURE1',
      hostUid: 'host_uid',
      hasPasscode: true,
      passcodeHash: hashRoomSecret('NY-SECURE1', 'K7P9M2'),
      inviteTokenHash: hashRoomSecret('NY-SECURE1', 'SecretInviteTok1')
    };

    expect(verifyRoomAccess({ room, currentUid: 'host_uid' })).toEqual({ allowed: true, via: 'host' });
    expect(verifyRoomAccess({ room, currentUid: 'guest_2' })).toEqual({
      allowed: false,
      reason: 'auth_required'
    });
    expect(
      verifyRoomAccess({ room, currentUid: 'guest_2', providedPasscode: 'WRONG' })
    ).toEqual({
      allowed: false,
      reason: 'wrong_credentials'
    });
    expect(
      verifyRoomAccess({ room, currentUid: 'guest_2', providedPasscode: 'k7p9m2' })
    ).toEqual({
      allowed: true,
      via: 'passcode'
    });
    expect(
      verifyRoomAccess({ room, currentUid: 'guest_2', providedInviteKey: 'SecretInviteTok1' })
    ).toEqual({
      allowed: true,
      via: 'invite'
    });
  });

  it('builds invite URLs and extracts room IDs + invite keys from pasted links or locations', () => {
    const inviteUrl = buildWatchRoomInviteUrl('https://nyanime.app/', '/', 'NY-TDUNE3', 'InvKey99');
    expect(inviteUrl).toBe('https://nyanime.app/?room=NY-TDUNE3&k=InvKey99');

    expect(parseRoomJoinInput(inviteUrl)).toEqual({ roomId: 'NY-TDUNE3', inviteKey: 'InvKey99' });
    expect(parseRoomJoinInput('ny-tdune3')).toEqual({ roomId: 'NY-TDUNE3', inviteKey: '' });
    expect(
      extractInviteKeyFromLocation({ search: '?room=NY-TDUNE3&k=InvKey99', hash: '', href: '' })
    ).toBe('InvKey99');
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


