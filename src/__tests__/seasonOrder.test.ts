import { describe, it, expect } from 'vitest';
import {
  computeAvailableEpisodes,
  organizeAnimeFranchise,
  type AniListMediaNode
} from '../utils/seasonOrder.ts';

describe('seasonOrder — Crunchyroll Franchise Ordering', () => {
  it('reconstructs full chronological seasons [T1 -> T2 -> T3 -> Part 2 -> Movie -> ONA Shorts] regardless of which season was opened', () => {
    const s1: AniListMediaNode = {
      id: 161645,
      title: { romaji: 'Kusuriya no Hitorigoto', english: 'The Apothecary Diaries' },
      format: 'TV',
      status: 'FINISHED',
      episodes: 24,
      startDate: { year: 2023, month: 10, day: 22 },
      relations: {
        edges: [
          {
            relationType: 'SEQUEL',
            node: { id: 176301, format: 'TV', title: { english: 'The Apothecary Diaries Season 2' } }
          },
          {
            relationType: 'SIDE_STORY',
            node: {
              id: 171001,
              format: 'ONA',
              status: 'FINISHED',
              episodes: 24,
              startDate: { year: 2023, month: 10, day: 23 },
              title: { romaji: 'Maomao no Hitorigoto', english: 'Maomao no Hitorigoto' }
            }
          }
        ]
      }
    };

    const s2: AniListMediaNode = {
      id: 176301,
      title: { romaji: 'Kusuriya no Hitorigoto 2nd Season', english: 'The Apothecary Diaries Season 2' },
      format: 'TV',
      status: 'FINISHED',
      episodes: 24,
      startDate: { year: 2025, month: 1, day: 10 },
      relations: {
        edges: [
          { relationType: 'PREQUEL', node: { id: 161645, format: 'TV' } },
          { relationType: 'SEQUEL', node: { id: 195516, format: 'TV' } }
        ]
      }
    };

    const s3: AniListMediaNode = {
      id: 195516,
      title: { romaji: 'Kusuriya no Hitorigoto 3rd Season', english: 'The Apothecary Diaries Season 3' },
      format: 'TV',
      status: 'RELEASING',
      episodes: 12,
      nextAiringEpisode: { episode: 7, timeUntilAiring: 100000 },
      startDate: { year: 2026, month: 10, day: 4 },
      relations: {
        edges: [
          { relationType: 'PREQUEL', node: { id: 176301, format: 'TV' } },
          {
            relationType: 'SEQUEL',
            node: {
              id: 200927,
              format: 'TV',
              status: 'NOT_YET_RELEASED',
              episodes: null,
              startDate: { year: 2027, month: 4, day: 1 },
              title: { romaji: 'Kusuriya no Hitorigoto 3rd Season Part 2' }
            }
          },
          {
            relationType: 'SIDE_STORY',
            node: {
              id: 200929,
              format: 'MOVIE',
              status: 'NOT_YET_RELEASED',
              episodes: 1,
              startDate: { year: 2026, month: 12, day: 25 },
              title: { english: "The Apothecary Diaries: The Late Lady's Treasure" }
            }
          }
        ]
      }
    };

    // Opened from Season 3 (195516) -> must still start at T1, T2, T3, T3 Part 2, then Movie & ONA
    const res = organizeAnimeFranchise([s3, s2, s1], 195516);

    expect(res.seasons.map((s) => s.id)).toEqual([
      161645, // T1
      176301, // T2
      195516, // T3
      200927, // T3 P2 (upcoming)
      171001, // ONA shorts (2023) -> extras sorted chronologically
      200929  // Movie (2026 upcoming)
    ]);

    expect(res.seasons[0].shortTag).toBe('T1');
    expect(res.seasons[0].totalEpisodes).toBe(24);
    expect(res.seasons[1].shortTag).toBe('T2');
    expect(res.seasons[1].totalEpisodes).toBe(24);
    expect(res.seasons[2].shortTag).toBe('T3');
    expect(res.seasons[2].totalEpisodes).toBe(6); // nextAiringEpisode 7 -> 6 aired
    expect(res.seasons[3].shortTag).toBe('T3 · P2');
    expect(res.seasons[3].isUpcoming).toBe(true);
    expect(res.seasons[3].totalEpisodes).toBe(0);
    expect(res.seasons[3].episodeLabel).toContain('Próximamente');
    expect(res.seasons[4].shortTag).toBe('📺 Cortos');
    expect(res.seasons[5].shortTag).toBe('🎬 Película');
    expect(res.seasons[5].isUpcoming).toBe(true);
    expect(res.seasons[5].totalEpisodes).toBe(0);

    // Pre-selects the opened season (Season 3 = index 2)
    expect(res.initialIndex).toBe(2);
  });

  it('excludes non-anime formats (MANGA/NOVEL) and ignores ALTERNATIVE/ADAPTATION noise', () => {
    const tv: AniListMediaNode = {
      id: 100,
      title: { english: 'Test Hero' },
      format: 'TV',
      status: 'FINISHED',
      episodes: 12,
      startDate: { year: 2022, month: 4, day: 1 },
      relations: {
        edges: [
          { relationType: 'ADAPTATION', node: { id: 9001, format: 'MANGA', title: { english: 'Test Hero Manga' } } },
          { relationType: 'ALTERNATIVE', node: { id: 9002, format: 'TV', status: 'FINISHED', episodes: 12, title: { english: 'Reboot' } } },
          { relationType: 'SIDE_STORY', node: { id: 101, format: 'OVA', status: 'FINISHED', episodes: 2, startDate: { year: 2023, month: 1, day: 1 }, title: { english: 'Test Hero OVA' } } }
        ]
      }
    };

    const res = organizeAnimeFranchise([tv], 100);
    expect(res.seasons.map((s) => s.id)).toEqual([100, 101]);
    expect(res.seasons[1].shortTag).toBe('🎞️ OVA');
    expect(res.initialIndex).toBe(0);
  });

  it('handles NOT_YET_RELEASED without inventing phantom episodes', () => {
    expect(
      computeAvailableEpisodes({
        id: 200929,
        format: 'MOVIE',
        status: 'NOT_YET_RELEASED',
        episodes: 1
      })
    ).toEqual({ totalEpisodes: 0, isUpcoming: true });
  });

  it('orders mixed ONA + TV main seasons chronologically (e.g. Blue Box S1 ONA 25 eps -> Blue Box S2 TV)', () => {
    const blueBoxS1: AniListMediaNode = {
      id: 170942,
      title: { romaji: 'Ao no Hako', english: 'Blue Box' },
      format: 'ONA',
      status: 'FINISHED',
      episodes: 25,
      startDate: { year: 2024, month: 10, day: 3 },
      relations: {
        edges: [
          {
            relationType: 'SEQUEL',
            node: {
              id: 189123,
              format: 'TV',
              status: 'RELEASING',
              episodes: 12,
              nextAiringEpisode: { episode: 6, timeUntilAiring: 86400 },
              startDate: { year: 2026, month: 10, day: 1 },
              title: { romaji: 'Ao no Hako Season 2', english: 'Blue Box Season 2' }
            }
          }
        ]
      }
    };

    const blueBoxS2: AniListMediaNode = {
      id: 189123,
      title: { romaji: 'Ao no Hako Season 2', english: 'Blue Box Season 2' },
      format: 'TV',
      status: 'RELEASING',
      episodes: 12,
      nextAiringEpisode: { episode: 6, timeUntilAiring: 86400 },
      startDate: { year: 2026, month: 10, day: 1 },
      relations: {
        edges: [
          {
            relationType: 'PREQUEL',
            node: {
              id: 170942,
              format: 'ONA',
              status: 'FINISHED',
              episodes: 25,
              startDate: { year: 2024, month: 10, day: 3 },
              title: { romaji: 'Ao no Hako', english: 'Blue Box' }
            }
          }
        ]
      }
    };

    // Even when opened from Blue Box Season 2 (189123), Season 1 (170942, 25 eps) MUST be T1 (seasonNumber: 1)
    // and Season 2 (189123, 5 aired eps) MUST be T2 (seasonNumber: 2)
    const fromS2 = organizeAnimeFranchise([blueBoxS2, blueBoxS1], 189123);
    expect(fromS2.seasons.map((s) => s.id)).toEqual([170942, 189123]);
    expect(fromS2.seasons[0].shortTag).toBe('T1');
    expect(fromS2.seasons[0].seasonNumber).toBe(1);
    expect(fromS2.seasons[0].totalEpisodes).toBe(25);
    expect(fromS2.seasons[0].romaji).toBe('Ao no Hako');
    expect(fromS2.seasons[0].english).toBe('Blue Box');

    expect(fromS2.seasons[1].shortTag).toBe('T2');
    expect(fromS2.seasons[1].seasonNumber).toBe(2);
    expect(fromS2.seasons[1].totalEpisodes).toBe(5);
    expect(fromS2.seasons[1].romaji).toBe('Ao no Hako Season 2');
    expect(fromS2.seasons[1].english).toBe('Blue Box Season 2');
    expect(fromS2.initialIndex).toBe(1);
  });

  it('preserves nextAiringEpisode on RELEASING sequel seasons (e.g. Black Clover Season 2) when depth-2 relation edges omit nextAiringEpisode', () => {
    const blackCloverS2Root: AniListMediaNode = {
      id: 195604,
      title: { romaji: 'Black Clover 2nd Season', english: 'Black Clover Season 2' },
      format: 'TV',
      status: 'RELEASING',
      episodes: null,
      nextAiringEpisode: { episode: 8, timeUntilAiring: 496529 },
      startDate: { year: 2026, month: 10, day: 3 },
      relations: {
        edges: [
          {
            relationType: 'PREQUEL',
            node: {
              id: 97940,
              title: { romaji: 'Black Clover', english: 'Black Clover' },
              format: 'TV',
              status: 'FINISHED',
              episodes: 170,
              startDate: { year: 2017, month: 10, day: 3 },
              relations: {
                edges: [
                  {
                    relationType: 'SEQUEL',
                    // Depth-2 relation node returned by AniList omits nextAiringEpisode (null)
                    node: {
                      id: 195604,
                      title: { romaji: 'Black Clover 2nd Season', english: 'Black Clover Season 2' },
                      format: 'TV',
                      status: 'RELEASING',
                      episodes: null,
                      nextAiringEpisode: null,
                      startDate: { year: 2026, month: 10, day: 3 }
                    }
                  }
                ]
              }
            }
          }
        ]
      }
    };

    const organized = organizeAnimeFranchise([blackCloverS2Root], 195604);
    expect(organized.seasons.map((s) => s.id)).toEqual([97940, 195604]);
    expect(organized.initialIndex).toBe(1);

    const s2 = organized.seasons[1];
    expect(s2.shortTag).toBe('T2');
    expect(s2.totalEpisodes).toBe(7);
    expect(s2.episodeLabel).toBe('7 Episodios');
    expect(s2.isUpcoming).toBe(false);
    expect(s2.nextAiringEpisode?.episode).toBe(8);
  });
});


