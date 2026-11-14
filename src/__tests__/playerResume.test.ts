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

