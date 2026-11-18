import { describe, expect, it } from 'vitest';
import {
  PROFILE_WIPE_STEPS,
  collectNyAnimeStorageKeys,
  getProfileWipeStep
} from '../utils/profileReset.ts';

describe('profileReset utilities', () => {
  it('defines 3 distinct sequential confirmation warnings explaining total reset', () => {
    expect(PROFILE_WIPE_STEPS.length).toBe(3);
    expect(getProfileWipeStep(1).step).toBe(1);
    expect(getProfileWipeStep(2).step).toBe(2);
    expect(getProfileWipeStep(3).step).toBe(3);
    expect(getProfileWipeStep(3).confirmLabel).toContain('3/3');
    expect(getProfileWipeStep(3).badge.toLowerCase()).toContain('irreversible');
    expect(getProfileWipeStep(3).warning.toLowerCase()).toContain('deshacer');
  });

  it('collects only NyAnime storage keys without touching unrelated browser keys', () => {
    const keys = collectNyAnimeStorageKeys([
      'nyanime_user_profile',
      'nyanime_favorites_v2',
      'nyanime_wt_owned_rooms_v1',
      'firebase:authUser:123',
      'unrelated_setting',
      'favorites'
    ]);

    expect(keys).toEqual([
      'nyanime_user_profile',
      'nyanime_favorites_v2',
      'nyanime_wt_owned_rooms_v1',
      'favorites'
    ]);
  });
});
