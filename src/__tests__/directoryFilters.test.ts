import { describe, it, expect } from 'vitest';
import {
  JKANIME_FILTER_CONFIG,
  JKANIME_GENRES,
  JKANIME_QUICK_GENRE_IDS,
  buildJKAnimeDirectoryUrl,
  countActiveDirectoryFilters,
  createDefaultDirectoryFilters,
  filterMediaByLetter,
  getSupportedYears,
  hasActiveDirectoryFilters,
  mapDirectoryFiltersToAniListVariables,
  parseJKAnimeDirectory
} from '../utils/directoryFilters.ts';

describe('JKAnime Directory Filters & Search Mapping', () => {
  it('contains all 45 official genre slugs without duplicates', () => {
    expect(JKANIME_GENRES).toHaveLength(45);
    const ids = new Set(JKANIME_GENRES.map((g) => g.id));
    expect(ids.size).toBe(45);
    expect(ids.has('accion')).toBe(true);
    expect(ids.has('isekai')).toBe(true);
    expect(ids.has('cosas-de-la-vida')).toBe(true);
    expect(ids.has('latino')).toBe(true);
    expect(JKANIME_QUICK_GENRE_IDS.every((id) => ids.has(id))).toBe(true);
  });

  it('exposes complete JKAnime filter options dictionary', () => {
    expect(JKANIME_FILTER_CONFIG.TYPES.map((t) => t.id)).toEqual([
      '',
      'animes',
      'peliculas',
      'ovas',
      'onas',
      'especiales'
    ]);
    expect(JKANIME_FILTER_CONFIG.STATUS.map((s) => s.id)).toEqual([
      '',
      'emision',
      'finalizados',
      'estrenos'
    ]);
    expect(JKANIME_FILTER_CONFIG.DEMOGRAPHIES.map((d) => d.id)).toEqual([
      '',
      'shounen',
      'seinen',
      'shoujo',
      'josei',
      'nios'
    ]);
    expect(JKANIME_FILTER_CONFIG.CATEGORIES.map((c) => c.id)).toEqual([
      '',
      'donghua',
      'latino'
    ]);
    expect(JKANIME_FILTER_CONFIG.SEASONS.map((s) => s.id)).toEqual([
      '',
      'invierno',
      'primavera',
      'verano',
      'otoño'
    ]);
    expect(JKANIME_FILTER_CONFIG.LETTERS).toHaveLength(26);
    const years = getSupportedYears(2026);
    expect(years[0]).toBe('2026');
    expect(years[years.length - 1]).toBe('1981');
  });

  it('builds valid JKAnime directory GET URLs with p pagination and multi-filters', () => {
    expect(buildJKAnimeDirectoryUrl({})).toBe('https://jkanime.net/directorio');

    const url = buildJKAnimeDirectoryUrl({
      page: 2,
      filter: 'popularidad',
      genre: 'isekai',
      type: 'animes',
      status: 'finalizados',
      demography: 'shounen',
      category: 'donghua',
      year: '2024',
      season: 'otoño',
      letter: 's',
      order: 'asc'
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://jkanime.net/directorio');
    expect(parsed.searchParams.get('p')).toBe('2');
    expect(parsed.searchParams.get('filtro')).toBe('popularidad');
    expect(parsed.searchParams.get('genero')).toBe('isekai');
    expect(parsed.searchParams.get('tipo')).toBe('animes');
    expect(parsed.searchParams.get('estado')).toBe('finalizados');
    expect(parsed.searchParams.get('demografia')).toBe('shounen');
    expect(parsed.searchParams.get('categoria')).toBe('donghua');
    expect(parsed.searchParams.get('fecha')).toBe('2024');
    expect(parsed.searchParams.get('temporada')).toBe('otoño');
    expect(parsed.searchParams.get('letra')).toBe('S');
    expect(parsed.searchParams.get('orden')).toBe('asc');
  });

  it('parses Laravel `var animes = {...};` directory payload cleanly', () => {
    const fakeHtml = `
      <script>
        var animes = {
          "current_page": 2,
          "last_page": 14,
          "per_page": 24,
          "total": 330,
          "next_page_url": "https://jkanime.net/directorio?p=3",
          "prev_page_url": "https://jkanime.net/directorio?p=1",
          "data": [
            {
              "id": 999,
              "slug": "solo-leveling",
              "title": "Solo Leveling",
              "synopsis": "Cazadores de mazmorras.",
              "image": "https://cdn.jkanime.net/assets/images/animes/image/solo-leveling.jpg",
              "type": "TV",
              "status": "currently",
              "url": "https://jkanime.net/solo-leveling/",
              "base64_id": "OTk5"
            }
          ]
        };
        var extra = 1;
      </script>
    `;
    const result = parseJKAnimeDirectory(fakeHtml);
    expect(result.pagination).toEqual({
      currentPage: 2,
      lastPage: 14,
      perPage: 24,
      totalItems: 330,
      hasNextPage: true,
      hasPrevPage: true
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'jk_999',
      slug: 'solo-leveling',
      title: 'Solo Leveling',
      status: 'RELEASING',
      format: 'TV',
      base64Id: 'OTk5'
    });
  });

  it('tracks active filter counts and resets cleanly', () => {
    const defaults = createDefaultDirectoryFilters();
    expect(countActiveDirectoryFilters(defaults)).toBe(0);
    expect(hasActiveDirectoryFilters(defaults)).toBe(false);

    const active = { ...defaults, genre: 'accion', year: '2024', order: 'asc' as const };
    expect(countActiveDirectoryFilters(active)).toBe(3);
    expect(hasActiveDirectoryFilters(active)).toBe(true);
  });

  it('maps combined JKAnime filters to AniList GraphQL variables for ANIME and MANGA', () => {
    const animeVars = mapDirectoryFiltersToAniListVariables(
      {
        page: 2,
        genre: 'isekai',
        type: 'peliculas',
        status: 'finalizados',
        demography: 'seinen',
        category: 'donghua',
        year: '2024',
        season: 'invierno',
        filter: 'nombre',
        order: 'asc'
      },
      '',
      'ANIME'
    );
    expect(animeVars).toEqual({
      page: 2,
      perPage: 24,
      isAdult: false,
      tag_in: ['Isekai', 'Seinen'],
      format_in: ['MOVIE'],
      status: 'FINISHED',
      season: 'WINTER',
      seasonYear: 2024,
      countryOfOrigin: 'CN',
      sort: ['TITLE_ROMAJI']
    });

    const animeYearNoSeason = mapDirectoryFiltersToAniListVariables(
      { year: '2023', genre: 'accion', filter: '' },
      '',
      'ANIME'
    );
    expect(animeYearNoSeason.startDate_greater).toBe(20230000);
    expect(animeYearNoSeason.startDate_lesser).toBe(20239999);
    expect(animeYearNoSeason.seasonYear).toBeUndefined();
    expect(animeYearNoSeason.genre_in).toEqual(['Action']);
    expect(animeYearNoSeason.sort).toEqual(['START_DATE_DESC']);

    const mangaVars = mapDirectoryFiltersToAniListVariables(
      { genre: 'fantasia', type: 'peliculas', season: 'otoño', year: '2022', demography: 'shounen' },
      'Frieren',
      'MANGA'
    );
    expect(mangaVars.search).toBe('Frieren');
    expect(mangaVars.format_in).toBeUndefined();
    expect(mangaVars.season).toBeUndefined();
    expect(mangaVars.seasonYear).toBeUndefined();
    expect(mangaVars.startDate_greater).toBe(20220000);
    expect(mangaVars.startDate_lesser).toBe(20229999);
    expect(mangaVars.genre_in).toEqual(['Fantasy']);
    expect(mangaVars.tag_in).toEqual(['Shounen']);
    expect(mangaVars.sort).toEqual(['SEARCH_MATCH', 'POPULARITY_DESC']);
  });

  it('filters media lists accurately by initial letter A–Z ignoring leading punctuation', () => {
    const sample = [
      { title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan' } },
      { title: { romaji: '"Oshi no Ko"', english: 'Oshi no Ko' } },
      { title: { romaji: 'Bleach', english: 'Bleach' } },
      { title: { romaji: 'Sousou no Frieren', english: 'Frieren: Beyond Journey’s End' } }
    ];
    expect(filterMediaByLetter(sample, 'S').map((m) => m.title.romaji)).toEqual([
      'Shingeki no Kyojin',
      'Sousou no Frieren'
    ]);
    expect(filterMediaByLetter(sample, 'O').map((m) => m.title.romaji)).toEqual([
      '"Oshi no Ko"'
    ]);
    expect(filterMediaByLetter(sample, 'F').map((m) => m.title.english)).toEqual([
      'Frieren: Beyond Journey’s End'
    ]);
  });
});
