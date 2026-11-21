import { describe, it, expect, vi } from 'vitest';

vi.mock('../firebase.ts', () => ({
  FirebaseCommentsBridge: {
    listCommentsPage: vi.fn(),
    addComment: vi.fn(),
    deleteComment: vi.fn()
  },
  FirebaseAuthBridge: {
    getCurrentUser: () => null
  }
}));

import {
  NATIVE_BUFFER_TIMEOUT_MS,
  NATIVE_STARTUP_FAILOVER_MS,
  attachNativeStartupFailoverWatchdog,
  buildUpNextCountdownText,
  computeProgressPercent,
  formatPlaybackTime,
  shouldMarkEpisodeCompleted,
  shouldResumePlayback
} from '../utils/playerResume.ts';
import {
  COMMENT_MAX_LENGTH,
  checkCommentCooldown,
  formatRemainingChars,
  renderCommentCardMarkup,
  validateCommentInput
} from '../services/comments.ts';

describe('playerResume helpers', () => {
  it('computes playback percentage safely', () => {
    expect(computeProgressPercent(0, 1200)).toBe(0);
    expect(computeProgressPercent(600, 1200)).toBe(50);
    expect(computeProgressPercent(1500, 1200)).toBe(100);
    expect(computeProgressPercent(100, 0)).toBe(0);
  });

  it('determines resume eligibility between 5% and 92%', () => {
    expect(shouldResumePlayback(30, 1000)).toBe(false);
    expect(shouldResumePlayback(60, 1000)).toBe(true);
    expect(shouldResumePlayback(910, 1000)).toBe(true);
    expect(shouldResumePlayback(950, 1000)).toBe(false);
  });

  it('marks episode completed at >= 90%', () => {
    expect(shouldMarkEpisodeCompleted(890, 1000)).toBe(false);
    expect(shouldMarkEpisodeCompleted(900, 1000)).toBe(true);
    expect(shouldMarkEpisodeCompleted(1000, 1000)).toBe(true);
  });

  it('formats playback times and up-next countdown text', () => {
    expect(formatPlaybackTime(0)).toBe('00:00');
    expect(formatPlaybackTime(125)).toBe('02:05');
    expect(formatPlaybackTime(3665)).toBe('01:01:05');
    expect(buildUpNextCountdownText(2, 5)).toBe('Siguiente: Ep. 2 en 5s...');
  });

  it('aborts and triggers fast failover at 8s when native <video> stays at readyState === 0 and alternative servers exist', () => {
    vi.useFakeTimers();
    try {
      const listeners = new Map<string, Set<() => void>>();
      const fakeVideo = {
        readyState: 0,
        addEventListener(type: string, fn: () => void) {
          if (!listeners.has(type)) listeners.set(type, new Set());
          listeners.get(type)!.add(fn);
        },
        removeEventListener(type: string, fn: () => void) {
          listeners.get(type)?.delete(fn);
        },
        emit(type: string) {
          for (const fn of Array.from(listeners.get(type) || [])) fn();
        }
      };

      const onAbortAttempt = vi.fn();
      const onFastFailover = vi.fn();
      const onFinalTimeout = vi.fn();

      attachNativeStartupFailoverWatchdog({
        video: fakeVideo,
        isStillActive: () => true,
        hasAlternativeServers: () => true,
        onAbortAttempt,
        onFastFailover,
        onFinalTimeout
      });

      vi.advanceTimersByTime(NATIVE_STARTUP_FAILOVER_MS - 1);
      expect(onAbortAttempt).not.toHaveBeenCalled();
      expect(onFastFailover).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onAbortAttempt).toHaveBeenCalledTimes(1);
      expect(onFastFailover).toHaveBeenCalledTimes(1);
      expect(onFinalTimeout).not.toHaveBeenCalled();

      // Advancing past 15s must not fire a second time once already failed over
      vi.advanceTimersByTime(NATIVE_BUFFER_TIMEOUT_MS);
      expect(onFastFailover).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels 8s fast failover once metadata arrives (readyState >= 1) and does not fail over after canplay', () => {
    vi.useFakeTimers();
    try {
      const listeners = new Map<string, Set<() => void>>();
      const fakeVideo = {
        readyState: 0,
        addEventListener(type: string, fn: () => void) {
          if (!listeners.has(type)) listeners.set(type, new Set());
          listeners.get(type)!.add(fn);
        },
        removeEventListener(type: string, fn: () => void) {
          listeners.get(type)?.delete(fn);
        },
        emit(type: string) {
          for (const fn of Array.from(listeners.get(type) || [])) fn();
        }
      };

      const onAbortAttempt = vi.fn();
      const onFastFailover = vi.fn();
      const onFinalTimeout = vi.fn();

      attachNativeStartupFailoverWatchdog({
        video: fakeVideo,
        isStillActive: () => true,
        hasAlternativeServers: () => true,
        onAbortAttempt,
        onFastFailover,
        onFinalTimeout
      });

      vi.advanceTimersByTime(4000);
      fakeVideo.readyState = 1;
      fakeVideo.emit('loadedmetadata');

      // Passing 8s must NOT abort because metadata arrived
      vi.advanceTimersByTime(5000);
      expect(onAbortAttempt).not.toHaveBeenCalled();
      expect(onFastFailover).not.toHaveBeenCalled();

      // First frame ready before 15s settles cleanly
      fakeVideo.readyState = 3;
      fakeVideo.emit('canplay');
      vi.advanceTimersByTime(NATIVE_BUFFER_TIMEOUT_MS);
      expect(onAbortAttempt).not.toHaveBeenCalled();
      expect(onFastFailover).not.toHaveBeenCalled();
      expect(onFinalTimeout).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits until full timeout and notifies user when no alternative servers are available', () => {
    vi.useFakeTimers();
    try {
      const fakeVideo = {
        readyState: 0,
        addEventListener: () => {},
        removeEventListener: () => {}
      };
      const onAbortAttempt = vi.fn();
      const onFastFailover = vi.fn();
      const onFinalTimeout = vi.fn();

      attachNativeStartupFailoverWatchdog({
        video: fakeVideo,
        isStillActive: () => true,
        hasAlternativeServers: () => false,
        onAbortAttempt,
        onFastFailover,
        onFinalTimeout
      });

      vi.advanceTimersByTime(NATIVE_STARTUP_FAILOVER_MS);
      expect(onAbortAttempt).not.toHaveBeenCalled();
      expect(onFastFailover).not.toHaveBeenCalled();
      expect(onFinalTimeout).not.toHaveBeenCalled();

      vi.advanceTimersByTime(NATIVE_BUFFER_TIMEOUT_MS - NATIVE_STARTUP_FAILOVER_MS);
      expect(onFinalTimeout).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('comments anti-spoiler & validation helpers', () => {
  it('validates comment length boundaries', () => {
    expect(validateCommentInput('a').valid).toBe(false);
    expect(validateCommentInput('Muy buen episodio').valid).toBe(true);
    expect(validateCommentInput('x'.repeat(COMMENT_MAX_LENGTH + 1)).valid).toBe(false);
  });

  it('formats remaining char counter and flags overflow', () => {
    expect(formatRemainingChars('Hola')).toEqual({ remaining: 496, label: '4/500', isOver: false });
    expect(formatRemainingChars('x'.repeat(501)).isOver).toBe(true);
  });

  it('enforces cooldown window', () => {
    expect(checkCommentCooldown(1000, 3000, 5000)).toEqual({ allowed: false, waitSeconds: 3 });
    expect(checkCommentCooldown(1000, 6500, 5000)).toEqual({ allowed: true, waitSeconds: 0 });
  });

  it('renders spoiler blur wrapper when isSpoiler is true', () => {
    const html = renderCommentCardMarkup(
      {
        id: 'c1',
        episodeKey: '1_ep_1',
        uid: 'u1',
        displayName: 'Gojo',
        avatar: '',
        text: 'El protagonista gana',
        isSpoiler: true,
        createdAt: Date.now()
      },
      { currentUid: 'u2', animeId: 1, ep: 1 }
    );
    expect(html).toContain('comment-spoiler-wrap');
    expect(html).toContain('comment-spoiler-reveal-btn');
    expect(html).toContain('Spoiler');
  });

  it('escapes HTML/XSS payloads in comment text, displayName, and unsafe avatars', () => {
    const html = renderCommentCardMarkup(
      {
        id: 'xss-1',
        episodeKey: '1_ep_1',
        uid: 'u1',
        displayName: '<script>alert(1)</script>',
        avatar: 'javascript:alert(1)',
        text: '<img src=x onerror=alert(1)>',
        isSpoiler: false,
        createdAt: Date.now()
      },
      { currentUid: 'u2', animeId: 1, ep: 1 }
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x onerror');
    expect(html).not.toContain('javascript:alert(1)');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

