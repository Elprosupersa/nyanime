import { describe, it, expect, vi } from 'vitest';
import {
  PWA_RELOAD_COOLDOWN_MS,
  PWA_RELOAD_GUARD_KEY,
  findMismatchedServiceWorkers,
  isDevServiceWorkerScript,
  isProdServiceWorkerScript,
  readReloadGuardState,
  shouldAllowSwTriggeredReload,
  trySafeReload,
  type StorageLike
} from '../utils/pwaReloadGuard.ts';

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    }
  };
}

describe('pwaReloadGuard', () => {
  it('blocks all automatic or external SW reload triggers unless explicitly user-requested', () => {
    expect(shouldAllowSwTriggeredReload({ userRequested: false, isExternal: true, isUpdate: true })).toBe(false);
    expect(shouldAllowSwTriggeredReload({ userRequested: false, isExternal: false, isUpdate: true })).toBe(false);
    expect(shouldAllowSwTriggeredReload({ userRequested: false })).toBe(false);
    expect(shouldAllowSwTriggeredReload({ userRequested: true, isExternal: false, isUpdate: true })).toBe(true);
  });

  it('allows at most maxReloads per session and enforces cooldown', () => {
    const storage = createMemoryStorage();
    const reloadFn = vi.fn();

    expect(trySafeReload(storage, reloadFn, { nowMs: 100_000 })).toBe(true);
    expect(reloadFn).toHaveBeenCalledTimes(1);

    // Second attempt immediately after must be blocked by maxReloads=1 and cooldown
    expect(trySafeReload(storage, reloadFn, { nowMs: 100_500 })).toBe(false);
    expect(trySafeReload(storage, reloadFn, { nowMs: 100_000 + PWA_RELOAD_COOLDOWN_MS + 1000 })).toBe(false);
    expect(reloadFn).toHaveBeenCalledTimes(1);

    expect(readReloadGuardState(storage)).toEqual({ count: 1, lastReloadAt: 100_000 });
  });

  it('blocks rapid reload within cooldown even when maxReloads allows > 1', () => {
    const storage = createMemoryStorage();
    const reloadFn = vi.fn();

    expect(trySafeReload(storage, reloadFn, { nowMs: 50_000, maxReloads: 3 })).toBe(true);
    expect(trySafeReload(storage, reloadFn, { nowMs: 60_000, maxReloads: 3 })).toBe(false);
    expect(
      trySafeReload(storage, reloadFn, { nowMs: 50_000 + PWA_RELOAD_COOLDOWN_MS + 1, maxReloads: 3 })
    ).toBe(true);
    expect(reloadFn).toHaveBeenCalledTimes(2);
  });

  it('refuses to reload if storage is missing or throws on write (prevents infinite reload loop in private mode)', () => {
    const reloadFn = vi.fn();
    expect(trySafeReload(null, reloadFn, { nowMs: 10_000 })).toBe(false);

    const throwingStorage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      }
    };
    expect(trySafeReload(throwingStorage, reloadFn, { nowMs: 10_000 })).toBe(false);
    expect(reloadFn).not.toHaveBeenCalled();
  });

  it('handles corrupted guard payload safely without throwing', () => {
    const storage = createMemoryStorage({ [PWA_RELOAD_GUARD_KEY]: '{invalid-json' });
    expect(readReloadGuardState(storage)).toEqual({ count: 0, lastReloadAt: 0 });
  });

  it('detects dev vs prod service worker scripts and finds mismatched registrations', () => {
    expect(isDevServiceWorkerScript('https://example.com/dev-sw.js?dev-sw')).toBe(true);
    expect(isDevServiceWorkerScript('https://example.com/sw.js')).toBe(false);
    expect(isProdServiceWorkerScript('https://example.com/sw.js')).toBe(true);
    expect(isProdServiceWorkerScript('https://example.com/dev-sw.js?dev-sw')).toBe(false);

    const regs = [
      { active: { scriptURL: 'https://example.com/dev-sw.js?dev-sw' } },
      { active: { scriptURL: 'https://example.com/sw.js' } }
    ];
    const mismatchedInProd = findMismatchedServiceWorkers(regs, false);
    expect(mismatchedInProd).toHaveLength(1);
    expect(mismatchedInProd[0].active?.scriptURL).toContain('/dev-sw.js');

    const mismatchedInDev = findMismatchedServiceWorkers(regs, true);
    expect(mismatchedInDev).toHaveLength(1);
    expect(mismatchedInDev[0].active?.scriptURL).toContain('/sw.js');
  });
});
