import { describe, it, expect, vi } from 'vitest';
import {
  LruTtlCache,
  validateProxyTargetUrl,
  isPrivateOrReservedHost,
  buildRedirectHopHeaders,
  sanitizeForwardHeaderValue,
  isValidRangeHeader
} from '../utils/proxySecurity.ts';
import { dispatchWebPush } from '../server/featureRoutes.ts';
import {
  computeTargetSyncedTime,
  computeRoomDriftSeconds,
  resolveRoomAnchorTimestampMs,
  shouldSeekForDrift,
  shouldApplyRemotePlaybackUpdate,
  verifyRoomAccess,
  hashRoomSecret
} from '../utils/watchTogether.ts';
import {
  ProviderCircuitBreaker,
  withProviderTimeout,
  isCircuitBreakerFailureStatus,
  classifyHttpFailureReason,
  filterSafeMediaList,
  filterSafeAnimeSources,
  isAdultMediaEntry,
  isAdultProviderId
} from '../utils/animeSources.ts';
import {
  getVisibleDirectoryGenres,
  mapDirectoryFiltersToAniListVariables
} from '../utils/directoryFilters.ts';

describe('Phase 1: Backend LRU Cache & Anti-SSRF Security', () => {
  it('enforces maxEntries using true LRU eviction (promotes accessed keys)', () => {
    const cache = new LruTtlCache<string>({
      maxEntries: 3,
      defaultTtlMs: 60_000,
      getSize: (v) => v.length
    });

    const t0 = 1_000_000;
    cache.set('a', 'alpha', 60_000, t0);
    cache.set('b', 'beta', 60_000, t0 + 1);
    cache.set('c', 'gamma', 60_000, t0 + 2);

    // Access 'a' so 'b' becomes least-recently-used
    expect(cache.get('a', t0 + 3)).toBe('alpha');

    // Inserting 'd' must evict 'b', keeping 'a', 'c', 'd'
    cache.set('d', 'delta', 60_000, t0 + 4);

    expect(cache.size).toBe(3);
    expect(cache.get('b', t0 + 5)).toBeUndefined();
    expect(cache.get('a', t0 + 5)).toBe('alpha');
    expect(cache.get('c', t0 + 5)).toBe('gamma');
    expect(cache.get('d', t0 + 5)).toBe('delta');
  });

  it('enforces maxTotalBytes and rejects oversized single entries', () => {
    const cache = new LruTtlCache<string>({
      maxEntries: 10,
      maxTotalBytes: 10,
      defaultTtlMs: 60_000,
      getSize: (v) => v.length
    });

    const t0 = 1_000_000;
    expect(cache.set('k1', '12345', 60_000, t0)).toBe(true);
    expect(cache.set('k2', '12345', 60_000, t0 + 1)).toBe(true);
    expect(cache.totalBytes).toBe(10);

    // Adding 4 more bytes evicts oldest entry 'k1'
    expect(cache.set('k3', '1234', 60_000, t0 + 2)).toBe(true);
    expect(cache.get('k1', t0 + 3)).toBeUndefined();
    expect(cache.get('k2', t0 + 3)).toBe('12345');
    expect(cache.get('k3', t0 + 3)).toBe('1234');
    expect(cache.totalBytes).toBe(9);

    // Single value exceeding maxTotalBytes is rejected without wiping existing cache
    expect(cache.set('huge', '12345678901', 60_000, t0 + 4)).toBe(false);
    expect(cache.size).toBe(2);
  });

  it('expires entries by TTL and reclaims memory via pruneExpired()', () => {
    const cache = new LruTtlCache<string>({
      maxEntries: 5,
      defaultTtlMs: 1_000,
      getSize: (v) => v.length
    });

    const t0 = 10_000;
    cache.set('short', 'abc', 500, t0);
    cache.set('long', 'defgh', 5_000, t0);
    expect(cache.totalBytes).toBe(8);

    // Before expiry
    expect(cache.get('short', t0 + 499)).toBe('abc');
    // After expiry
    expect(cache.pruneExpired(t0 + 600)).toBe(1);
    expect(cache.size).toBe(1);
    expect(cache.totalBytes).toBe(5);
    expect(cache.get('short', t0 + 600)).toBeUndefined();
    expect(cache.get('long', t0 + 600)).toBe('defgh');
  });

  it('blocks obfuscated private IPs, sensitive ports, and sanitizes cross-origin redirect headers', () => {
    // Obfuscated private hosts
    expect(isPrivateOrReservedHost('0177.0.0.1')).toBe(true);
    expect(isPrivateOrReservedHost('127.1')).toBe(true);
    expect(isPrivateOrReservedHost('0:0:0:0:0:ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedHost('ff02::1')).toBe(true);

    // Sensitive DB/service ports blocked even on allowlisted domains
    const blockedRedis = validateProxyTargetUrl('https://jkanime.net:6379/secret');
    expect(blockedRedis.valid).toBe(false);
    const blockedPg = validateProxyTargetUrl('https://jkanime.net:5432/db');
    expect(blockedPg.valid).toBe(false);

    // Legitimate high CDN ports on allowlisted domains remain allowed
    const allowedCdn = validateProxyTargetUrl('https://www.mp4upload.com:183/d/video.mp4');
    expect(allowedCdn.valid).toBe(true);

    // Cross-origin redirect strips sensitive headers and recomputes Referer/Origin
    const hopHeaders = buildRedirectHopHeaders(
      {
        Authorization: 'Bearer top-secret',
        Cookie: 'session=abc',
        'Proxy-Authorization': 'Basic xyz',
        Referer: 'https://jkanime.net/watch',
        Origin: 'https://jkanime.net',
        Accept: '*/*'
      },
      new URL('https://jkanime.net/watch'),
      new URL('https://cdn.mp4upload.com/video.mp4')
    );
    expect(hopHeaders.Authorization).toBeUndefined();
    expect(hopHeaders.Cookie).toBeUndefined();
    expect(hopHeaders['Proxy-Authorization']).toBeUndefined();
    expect(hopHeaders.Referer).toBe('https://cdn.mp4upload.com/');
    expect(hopHeaders.Origin).toBe('https://cdn.mp4upload.com');
    expect(hopHeaders.Accept).toBe('*/*');

    // Header CRLF & Range sanitization
    expect(sanitizeForwardHeaderValue('bytes=0-100\r\nX-Injected: evil')).toBe('bytes=0-100X-Injected: evil');
    expect(isValidRangeHeader('bytes=0-1023')).toBe(true);
    expect(isValidRangeHeader('items=0-5')).toBe(false);
  });
});

describe('Phase 1: Web Push VAPID Priority, 404/410 Purge & Legacy FCM Guard', () => {
  it('dispatches via Web Push VAPID, purges 404/410 expired subscriptions, and persists cleanup', async () => {
    const subsMap = new Map<string, any>([
      [
        'sub_ok',
        {
          id: 'sub_ok',
          uid: 'u1',
          provider: 'webpush',
          subscription: { endpoint: 'https://push.example/ok', keys: { p256dh: 'k1', auth: 'a1' } },
          createdAt: 1,
          updatedAt: 1
        }
      ],
      [
        'sub_gone',
        {
          id: 'sub_gone',
          uid: 'u2',
          provider: 'webpush',
          fcmToken: 'legacy_tok_should_not_block_purge',
          subscription: { endpoint: 'https://push.example/gone', keys: { p256dh: 'k2', auth: 'a2' } },
          createdAt: 1,
          updatedAt: 1
        }
      ],
      [
        'sub_notfound',
        {
          id: 'sub_notfound',
          uid: 'u3',
          provider: 'webpush',
          subscription: { endpoint: 'https://push.example/missing', keys: { p256dh: 'k3', auth: 'a3' } },
          createdAt: 1,
          updatedAt: 1
        }
      ]
    ]);

    const persistSpy = vi.fn();
    const sendSpy = vi.fn(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith('/gone')) {
        const err = new Error('Gone') as Error & { statusCode?: number };
        err.statusCode = 410;
        throw err;
      }
      if (sub.endpoint.endsWith('/missing')) {
        const err = new Error('Not Found') as Error & { statusCode?: number };
        err.statusCode = 404;
        throw err;
      }
      return { statusCode: 201 };
    });

    const result = await dispatchWebPush(
      Array.from(subsMap.values()),
      { title: 'Nuevo episodio', body: 'Disponible ahora' },
      {
        subsMap,
        sendWebPush: sendSpy,
        persist: persistSpy,
        fcmServerKey: ''
      }
    );

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.purged).toBe(2);
    expect(result.purgedIds.sort()).toEqual(['sub_gone', 'sub_notfound']);
    expect(result.channel).toBe('webpush');
    expect(subsMap.has('sub_ok')).toBe(true);
    expect(subsMap.has('sub_gone')).toBe(false);
    expect(subsMap.has('sub_notfound')).toBe(false);
    expect(persistSpy).toHaveBeenCalledTimes(1);
  });

  it('reports explicit legacy FCM deprecation warning without silent failures when FIREBASE_FCM_SERVER_KEY is set', async () => {
    const subsMap = new Map<string, any>([
      [
        'fcm_only',
        {
          id: 'fcm_only',
          uid: 'u1',
          provider: 'fcm',
          fcmToken: 'tok_legacy_only',
          createdAt: 1,
          updatedAt: 1
        }
      ]
    ]);

    const sendSpy = vi.fn();
    const result = await dispatchWebPush(
      Array.from(subsMap.values()),
      { title: 'Test', body: 'Body' },
      {
        subsMap,
        sendWebPush: sendSpy,
        persist: vi.fn(),
        fcmServerKey: 'LEGACY_SERVER_KEY_PLACEHOLDER'
      }
    );

    expect(sendSpy).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.fcmLegacyDeprecated).toBe(true);
    expect(result.warnings.some((w) => w.includes('FCM HTTP v1'))).toBe(true);
  });
});

describe('Phase 1: Watch Together Anchor Time Calculation & Drift Tolerance', () => {
  it('computes client time from anchorTime + isPlaying + Firestore Timestamp updatedAt without per-second writes', () => {
    const anchorMs = 1_700_000_000_000;
    const room = {
      playbackState: 'playing' as const,
      playbackTime: 100,
      isPlaying: true,
      anchorTime: 120.5,
      updatedAt: { toMillis: () => anchorMs },
      updatedAtMs: anchorMs - 9999
    };

    // 14.5 seconds later
    const computed = computeTargetSyncedTime(room, anchorMs + 14_500, 1440);
    expect(computed).toBeCloseTo(135.0, 2);

    // Also supports serialized { seconds, nanoseconds } Firestore timestamp shape
    const fromSeconds = resolveRoomAnchorTimestampMs({
      updatedAt: { seconds: 1_700_000_000, nanoseconds: 500_000_000 },
      updatedAtMs: 0
    });
    expect(fromSeconds).toBe(1_700_000_000_500);
  });

  it('holds anchorTime steady when paused and clamps near video duration', () => {
    const anchorMs = 1_700_000_000_000;
    const pausedRoom = {
      playbackState: 'paused' as const,
      playbackTime: 85,
      isPlaying: false,
      anchorTime: 240,
      updatedAt: { toMillis: () => anchorMs },
      updatedAtMs: anchorMs
    };

    // 90 seconds later while paused -> must remain exactly at anchorTime (240)
    expect(computeTargetSyncedTime(pausedRoom, anchorMs + 90_000, 1440)).toBe(240);

    // Clamping near duration when playing past end
    const playingNearEnd = {
      playbackState: 'playing' as const,
      playbackTime: 1430,
      isPlaying: true,
      anchorTime: 1430,
      updatedAt: { toMillis: () => anchorMs },
      updatedAtMs: anchorMs
    };
    expect(computeTargetSyncedTime(playingNearEnd, anchorMs + 40_000, 1440)).toBe(1439.5);
  });

  it('enforces ~1.8s drift tolerance and returns matchedHash on room credential verification', () => {
    const anchorMs = 1_700_000_000_000;
    const room = {
      playbackState: 'playing' as const,
      playbackTime: 60,
      isPlaying: true,
      anchorTime: 60,
      updatedAt: { toMillis: () => anchorMs },
      updatedAtMs: anchorMs
    };

    // Target at +10s is 70s; local at 68.7s has 1.3s drift -> within 1.8s tolerance
    const smallDrift = computeRoomDriftSeconds(68.7, room, anchorMs + 10_000, 1440);
    expect(smallDrift).toBeCloseTo(1.3, 2);
    expect(shouldSeekForDrift(68.7, 70, 1.8)).toBe(false);

    // Local at 67.5s has 2.5s drift -> exceeds 1.8s tolerance -> should resync
    expect(shouldSeekForDrift(67.5, 70, 1.8)).toBe(true);

    // Self-echo suppression uses resolved anchor timestamp
    expect(
      shouldApplyRemotePlaybackUpdate(
        { updatedAt: { toMillis: () => anchorMs + 500 }, updatedAtMs: anchorMs + 500, updatedByUid: 'u1', hostUid: 'u1' },
        'u1',
        anchorMs
      )
    ).toBe(false);

    // Access verification returns matchedHash for Firestore participant rule validation
    const roomId = 'NY-ROOM42';
    const passHash = hashRoomSecret(roomId, 'SECRET1');
    const invHash = hashRoomSecret(roomId, 'inviteTokenXYZ');

    const viaPass = verifyRoomAccess({
      room: { roomId, hostUid: 'host1', hasPasscode: true, passcodeHash: passHash, inviteTokenHash: invHash },
      currentUid: 'guest_abc',
      providedPasscode: 'secret1'
    });
    expect(viaPass).toEqual({ allowed: true, via: 'passcode', matchedHash: passHash });

    const viaInvite = verifyRoomAccess({
      room: { roomId, hostUid: 'host1', hasPasscode: true, passcodeHash: passHash, inviteTokenHash: invHash },
      currentUid: 'guest_abc',
      providedInviteKey: 'inviteTokenXYZ'
    });
    expect(viaInvite).toEqual({ allowed: true, via: 'invite', matchedHash: invHash });
  });
});

describe('Phase 1: Provider Circuit Breaker & Timeouts', () => {
  it('opens circuit after repeated timeouts or 403/5xx failures and recovers after cooldown or success', () => {
    const breaker = new ProviderCircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });
    const t0 = 5_000_000;

    expect(isCircuitBreakerFailureStatus(403)).toBe(true);
    expect(isCircuitBreakerFailureStatus(502)).toBe(true);
    expect(isCircuitBreakerFailureStatus(503)).toBe(true);
    expect(isCircuitBreakerFailureStatus(404)).toBe(false);
    expect(classifyHttpFailureReason(403)).toBe('http_403');
    expect(classifyHttpFailureReason(503)).toBe('http_5xx');
    expect(classifyHttpFailureReason(200, true)).toBe('timeout');

    // First failure does not trip yet
    const f1 = breaker.recordFailure('tioanime', 'http_5xx', t0);
    expect(f1.tripped).toBe(false);
    expect(breaker.canAttempt('tioanime', t0 + 100)).toBe(true);

    // Second failure trips circuit for 60s
    const f2 = breaker.recordFailure('tioanime', 'timeout', t0 + 1_000);
    expect(f2.tripped).toBe(true);
    expect(breaker.canAttempt('tioanime', t0 + 10_000)).toBe(false);
    expect(breaker.getState('tioanime', t0 + 10_000).isOpen).toBe(true);

    // Other healthy providers are unaffected
    expect(breaker.canAttempt('jkanime', t0 + 10_000)).toBe(true);

    // After cooldown expires, provider becomes half-open/attemptable again
    expect(breaker.canAttempt('tioanime', t0 + 62_000)).toBe(true);

    // Success resets failure counter completely
    breaker.recordSuccess('tioanime');
    expect(breaker.getState('tioanime', t0 + 62_500)).toEqual({
      isOpen: false,
      failures: 0,
      remainingCooldownMs: 0
    });
  });

  it('aborts hung provider calls cleanly via withProviderTimeout', async () => {
    const neverResolves = new Promise<string>(() => {
      // intentionally hangs
    });
    const timedOut = await withProviderTimeout(neverResolves, 25, 'slowprovider');
    expect(timedOut.ok).toBe(false);
    if (!timedOut.ok) {
      expect(timedOut.reason).toBe('timeout');
    }

    const fast = await withProviderTimeout(Promise.resolve(['srv1']), 500, 'fastprovider');
    expect(fast).toEqual({ ok: true, value: ['srv1'] });
  });
});

describe('Phase 1: Safe Mode +18 Filtering (showAdultContent=false by default)', () => {
  it('excludes HentaiLA, HentaiJK, and +18 catalog entries when showAdultContent is false', () => {
    expect(isAdultProviderId('hentaila')).toBe(true);
    expect(isAdultProviderId('HentaiJK')).toBe(true);
    expect(isAdultProviderId('jkanime')).toBe(false);

    const mixedCatalog = [
      { id: 1, title: 'Frieren', isAdult: false, genres: ['Adventure', 'Fantasy'], source: 'AniList' },
      { id: 2, title: 'Adult Flagged', isAdult: true, genres: ['Drama'] },
      { id: 'hla_99', title: 'HentaiLA Entry', hentailaSlug: 'sample-h', genres: ['Romance'] },
      { id: 4, title: 'Genre Tagged', genres: ['Hentai', 'Comedy'] },
      { id: 5, title: 'MangaDex Erotica', contentRating: 'erotica', source: 'MangaDex' },
      { id: 6, title: 'MangaDex Safe', contentRating: 'safe', source: 'MangaDex' }
    ];

    expect(isAdultMediaEntry(mixedCatalog[0])).toBe(false);
    expect(isAdultMediaEntry(mixedCatalog[1])).toBe(true);
    expect(isAdultMediaEntry(mixedCatalog[2])).toBe(true);
    expect(isAdultMediaEntry(mixedCatalog[3])).toBe(true);
    expect(isAdultMediaEntry(mixedCatalog[4])).toBe(true);

    const safeOnly = filterSafeMediaList(mixedCatalog, false);
    expect(safeOnly.map((x) => x.title)).toEqual(['Frieren', 'MangaDex Safe']);

    const withAdult = filterSafeMediaList(mixedCatalog, true);
    expect(withAdult).toHaveLength(6);

    const mixedSources = [
      { providerId: 'jkanime', providerName: 'JKAnime', url: 'https://jkanime.net/e/1' },
      { providerId: 'hentaila', providerName: 'HentaiLA', url: 'https://hentaila.com/ver/x' },
      { providerId: 'hentaijk', providerName: 'HentaiJK', url: 'https://hentaijk.com/v/y' },
      { providerId: 'custom', providerName: 'Mirror', url: 'https://cdn.hentaila.com/video.mp4' }
    ];
    expect(filterSafeAnimeSources(mixedSources, false).map((s) => s.providerId)).toEqual(['jkanime']);
    expect(filterSafeAnimeSources(mixedSources, true)).toHaveLength(4);
  });

  it('hides Hentai genre and forces isAdult: false in AniList directory filters when Safe Mode is active', () => {
    const safeGenres = getVisibleDirectoryGenres(false);
    expect(safeGenres.some((g) => g.id === 'hentai' || g.isAdult)).toBe(false);

    const allGenres = getVisibleDirectoryGenres(true);
    expect(allGenres.some((g) => g.id === 'hentai')).toBe(true);

    // Attempt to query hentai genre with showAdultContent=false -> blocked & isAdult forced false
    const safeVars = mapDirectoryFiltersToAniListVariables({ genre: 'hentai' }, '', 'ANIME', false);
    expect(safeVars.isAdult).toBe(false);
    expect(safeVars.genre_in).toBeUndefined();

    // Allowed explicitly when showAdultContent=true
    const adultVars = mapDirectoryFiltersToAniListVariables({ genre: 'hentai' }, '', 'ANIME', true);
    expect(adultVars.isAdult).toBe(true);
    expect(adultVars.genre_in).toEqual(['Hentai']);
  });
});
