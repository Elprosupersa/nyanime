import { describe, expect, it } from 'vitest';
import {
  computeTargetSyncedTime,
  extractRoomCodeFromSearch,
  generateRoomCode,
  isValidRoomCode,
  sanitizeWatchChatText,
  shouldSeekForDrift
} from '../utils/watchTogether.ts';

describe('watchTogether utilities', () => {
  it('generates and validates room codes & parses ?room= URL queries', () => {
    const code = generateRoomCode(() => 0.1);
    expect(code.startsWith('NY-')).toBe(true);
    expect(isValidRoomCode(code)).toBe(true);
    expect(extractRoomCodeFromSearch('?room=ny-ab12cd&foo=1')).toBe('NY-AB12CD');
    expect(extractRoomCodeFromSearch('?room=x')).toBeNull();
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

  it('sanitizes room chat messages safely', () => {
    expect(sanitizeWatchChatText('  Hola\n\nmundo!  ')).toBe('Hola mundo!');
  });
});
