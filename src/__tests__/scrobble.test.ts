import { describe, expect, it } from 'vitest';
import {
  buildAniListScrobblePayload,
  buildMalScrobbleFormBody,
  mapListStatusToAniList,
  mapListStatusToMal,
  normalizeScrobbleScore
} from '../utils/scrobble.ts';

describe('scrobble utilities', () => {
  it('maps NyAnime statuses bidirectionally to AniList and MAL', () => {
    expect(mapListStatusToAniList('watching')).toBe('CURRENT');
    expect(mapListStatusToAniList('plan_to_watch')).toBe('PLANNING');
    expect(mapListStatusToAniList('on_hold')).toBe('PAUSED');
    expect(mapListStatusToMal('on_hold')).toBe('on_hold');
    expect(mapListStatusToMal('completed')).toBe('completed');
  });

  it('builds valid AniList GraphQL and MAL form scrobble payloads', () => {
    expect(normalizeScrobbleScore(11)).toBeUndefined();
    expect(normalizeScrobbleScore(9)).toBe(9);

    const alPayload = buildAniListScrobblePayload({
      mediaId: 154587,
      status: 'watching',
      progress: 8,
      score: 9
    });
    expect(alPayload.variables).toEqual({
      mediaId: 154587,
      status: 'CURRENT',
      progress: 8,
      scoreRaw: 90
    });

    const malBody = buildMalScrobbleFormBody({
      status: 'completed',
      progress: 28,
      score: 10
    });
    expect(malBody.get('status')).toBe('completed');
    expect(malBody.get('num_watched_episodes')).toBe('28');
    expect(malBody.get('score')).toBe('10');
  });
});
