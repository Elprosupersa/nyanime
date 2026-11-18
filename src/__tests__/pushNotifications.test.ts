import { describe, expect, it } from 'vitest';
import {
  buildWeeklyDigestSummary,
  collectDueAiringNotifications,
  normalizeFcmAiringPayload,
  urlBase64ToUint8Array
} from '../utils/pushNotifications.ts';

describe('pushNotifications utilities', () => {
  it('converts VAPID base64url strings into Uint8Array', () => {
    const bytes = urlBase64ToUint8Array('SGVsbG8');
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
  });

  it('deduplicates due airing notifications across reminders and watching lists', () => {
    const nowMs = 1_700_000_000_000;
    const nowSec = Math.floor(nowMs / 1000);
    const due = collectDueAiringNotifications({
      nowMs,
      alreadyNotifiedKeys: new Set(['999_ep_3']),
      reminders: [
        { animeId: 101, title: 'Dandadan', episode: 5, airingAt: nowSec - 120 },
        { animeId: 999, title: 'Already Sent', episode: 3, airingAt: nowSec - 60 }
      ],
      watchingAnimes: [
        { id: 101, listStatus: 'watching', title: { english: 'Dandadan' }, nextAiringEpisode: { episode: 5, airingAt: nowSec - 120 } },
        { id: 202, listStatus: 'watching', title: { romaji: 'Blue Lock' }, nextAiringEpisode: { episode: 12, airingAt: nowSec - 300 } },
        { id: 303, listStatus: 'watching', title: { romaji: 'Future Show' }, nextAiringEpisode: { episode: 2, airingAt: nowSec + 3600 } }
      ]
    });

    expect(due.length).toBe(2);
    expect(due.map((d) => d.animeId)).toEqual([101, 202]);
  });

  it('aggregates weekly activity digest cleanly', () => {
    const nowMs = 1_700_000_000_000;
    const digest = buildWeeklyDigestSummary({
      nowMs,
      history: [
        { anime: { id: 1 }, currentTime: 1200, timestamp: nowMs - 1000 },
        { anime: { id: 2 }, currentTime: 600, timestamp: nowMs - 2000 },
        { anime: { id: 3 }, currentTime: 9999, timestamp: nowMs - 10 * 24 * 3600 * 1000 }
      ],
      mangaHistory: [{ manga: { id: 'm1' }, timestamp: nowMs - 5000 }],
      favorites: [{ listStatus: 'watching', title: { english: 'Solo Leveling' } }]
    });

    expect(digest.episodesWatchedCount).toBe(2);
    expect(digest.minutesWatched).toBe(30);
    expect(digest.chaptersReadCount).toBe(1);
    expect(digest.activeSeriesCount).toBe(3);
    expect(digest.watchingTitles).toEqual(['Solo Leveling']);
  });

  it('normalizes FCM notification and data-only airing payloads safely', () => {
    const normalized = normalizeFcmAiringPayload({
      data: { animeId: '154587', episode: '14', body: 'Ya disponible Frieren Ep 14', url: '/?tab=schedule' }
    });
    expect(normalized.title).toBe('Nuevo episodio disponible · Ep 14');
    expect(normalized.body).toBe('Ya disponible Frieren Ep 14');
    expect(normalized.tag).toBe('nyanime-fcm-154587-14');
    expect(normalized.url).toBe('/?tab=schedule');

    const unsafe = normalizeFcmAiringPayload({
      notification: { title: 'Test', body: 'Hello' },
      data: { url: 'https://evil.example.com' }
    });
    expect(unsafe.url).toBe('/');
  });
});
