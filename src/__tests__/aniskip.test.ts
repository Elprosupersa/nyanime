import { describe, expect, it } from 'vitest';
import {
  buildAniSkipUrl,
  computeSafeSeekTarget,
  findActiveAniSkipInterval,
  parseAniSkipResponse
} from '../utils/aniskip.ts';

describe('aniskip utilities', () => {
  it('builds valid AniSkip v2 URLs and rejects invalid inputs', () => {
    expect(buildAniSkipUrl(0, 1)).toBeNull();
    expect(buildAniSkipUrl(null, 1)).toBeNull();
    expect(buildAniSkipUrl(21, 0)).toBeNull();
    const url = buildAniSkipUrl(52991, 4, 1440);
    expect(url).toContain('https://api.aniskip.com/v2/skip-times/52991/4');
    expect(url).toContain('episodeLength=1440');
    expect(url).toContain('op');
    expect(url).toContain('ed');
  });

  it('parses AniSkip response sorted by startTime and locates active segment', () => {
    const parsed = parseAniSkipResponse({
      found: true,
      results: [
        {
          skipId: 'ed-1',
          skipType: 'ed',
          interval: { startTime: 1320, endTime: 1410 }
        },
        {
          skipId: 'op-1',
          skipType: 'op',
          interval: { startTime: 45.5, endTime: 135.5 }
        },
        {
          skipId: 'bad',
          skipType: 'unknown',
          interval: { startTime: 0, endTime: 10 }
        }
      ]
    });

    expect(parsed.length).toBe(2);
    expect(parsed[0].skipType).toBe('op');
    expect(parsed[0].label).toBe('Saltar Intro');
    expect(parsed[1].label).toBe('Saltar Outro');

    expect(findActiveAniSkipInterval(parsed, 10)).toBeNull();
    expect(findActiveAniSkipInterval(parsed, 60)?.skipId).toBe('op-1');
    expect(findActiveAniSkipInterval(parsed, 1340)?.skipId).toBe('ed-1');
  });

  it('clamps +85s seek targets cleanly within duration', () => {
    expect(computeSafeSeekTarget(10, 85, 1400)).toBe(95);
    expect(computeSafeSeekTarget(1350, 85, 1400)).toBe(1399.75);
    expect(computeSafeSeekTarget(20, -30, 100)).toBe(0);
  });
});
