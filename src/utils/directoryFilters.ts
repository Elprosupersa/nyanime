export interface DirectoryOption {
  id: string;
  label: string;
}

export interface GenreOption extends DirectoryOption {
  aniGenre?: string;
  aniTag?: string;
  isAdult?: boolean;
}

export interface SearchDirectoryFilters {
  page: number;
  filter: '' | 'nombre' | 'popularidad';
  order: '' | 'asc';
  genre: string;
  type: '' | 'animes' | 'peliculas' | 'ovas' | 'onas' | 'especiales';
  status: '' | 'emision' | 'finalizados' | 'estrenos';
  demography: '' | 'shounen' | 'seinen' | 'shoujo' | 'josei' | 'nios';
  category: '' | 'donghua' | 'latino';
  year: string;
  season: '' | 'invierno' | 'primavera' | 'verano' | 'otoño';
  letter: string;
}

export const JKANIME_GENRES: readonly GenreOption[] = [
  { id: 'accion', label: 'Acción', aniGenre: 'Action' },
  { id: 'aventura', label: 'Aventura', aniGenre: 'Adventure' },
  { id: 'autos', label: 'Autos', aniTag: 'Cars' },
  { id: 'comedia', label: 'Comedia', aniGenre: 'Comedy' },
  { id: 'dementia', label: 'Dementia', aniTag: 'Surreal Comedy' },
  { id: 'demonios', label: 'Demonios', aniTag: 'Demons' },
  { id: 'misterio', label: 'Misterio', aniGenre: 'Mystery' },
  { id: 'drama', label: 'Drama', aniGenre: 'Drama' },
  { id: 'ecchi', label: 'Ecchi', aniGenre: 'Ecchi' },
  { id: 'fantasia', label: 'Fantasía', aniGenre: 'Fantasy' },
  { id: 'juegos', label: 'Juegos', aniTag: 'Video Games' },
  { id: 'hentai', label: 'Hentai', aniGenre: 'Hentai', isAdult: true },
  { id: 'historico', label: 'Histórico', aniTag: 'Historical' },
  { id: 'terror', label: 'Terror', aniGenre: 'Horror' },
  { id: 'nios', label: 'Niños', aniTag: 'Kids' },
  { id: 'magia', label: 'Magia', aniTag: 'Magic' },
  { id: 'artes-marciales', label: 'Artes Marciales', aniTag: 'Martial Arts' },
  { id: 'mecha', label: 'Mecha', aniGenre: 'Mecha' },
  { id: 'musica', label: 'Música', aniGenre: 'Music' },
  { id: 'parodia', label: 'Parodia', aniTag: 'Parody' },
  { id: 'samurai', label: 'Samurái', aniTag: 'Samurai' },
  { id: 'romance', label: 'Romance', aniGenre: 'Romance' },
  { id: 'colegial', label: 'Colegial', aniTag: 'School' },
  { id: 'sci-fi', label: 'Sci-Fi', aniGenre: 'Sci-Fi' },
  { id: 'shoujo', label: 'Shoujo', aniTag: 'Shoujo' },
  { id: 'shoujo-ai', label: 'Shoujo Ai', aniTag: 'Yuri' },
  { id: 'shounen', label: 'Shounen', aniTag: 'Shounen' },
  { id: 'shounen-ai', label: 'Shounen Ai', aniTag: "Boys' Love" },
  { id: 'space', label: 'Espacio (Space)', aniTag: 'Space' },
  { id: 'deportes', label: 'Deportes', aniGenre: 'Sports' },
  { id: 'super-poderes', label: 'Superpoderes', aniTag: 'Super Power' },
  { id: 'vampiros', label: 'Vampiros', aniTag: 'Vampire' },
  { id: 'yaoi', label: 'Yaoi', aniTag: "Boys' Love" },
  { id: 'yuri', label: 'Yuri', aniTag: 'Yuri' },
  { id: 'harem', label: 'Harem', aniTag: 'Female Harem' },
  { id: 'cosas-de-la-vida', label: 'Recuentos de la Vida', aniGenre: 'Slice of Life' },
  { id: 'sobrenatural', label: 'Sobrenatural', aniGenre: 'Supernatural' },
  { id: 'militar', label: 'Militar', aniTag: 'Military' },
  { id: 'policial', label: 'Policial', aniTag: 'Police' },
  { id: 'psicologico', label: 'Psicológico', aniGenre: 'Psychological' },
  { id: 'thriller', label: 'Thriller', aniGenre: 'Thriller' },
  { id: 'seinen', label: 'Seinen', aniTag: 'Seinen' },
  { id: 'josei', label: 'Josei', aniTag: 'Josei' },
  { id: 'latino', label: 'Español Latino' },
  { id: 'isekai', label: 'Isekai', aniTag: 'Isekai' }
];

export const JKANIME_QUICK_GENRE_IDS = [
  'accion',
  'isekai',
  'romance',
  'fantasia',
  'comedia',
  'aventura',
  'drama',
  'sci-fi',
  'sobrenatural',
  'terror',
  'deportes',
  'cosas-de-la-vida'
] as const;

export const JKANIME_FILTER_CONFIG = {
  GENRES: JKANIME_GENRES,
  FILTERS: [
    { id: '', label: 'Fecha (Recientes)' },
    { id: 'nombre', label: 'Nombre (A-Z)' },
    { id: 'popularidad', label: 'Popularidad' }
  ] as const,
  ORDERS: [
    { id: '', label: 'Descendente' },
    { id: 'asc', label: 'Ascendente (A-Z)' }
  ] as const,
  TYPES: [
    { id: '', label: 'Todos los Tipos' },
    { id: 'animes', label: 'Series (TV)' },
    { id: 'peliculas', label: 'Películas' },
    { id: 'ovas', label: 'OVAs' },
    { id: 'onas', label: 'ONAs' },
    { id: 'especiales', label: 'Especiales' }
  ] as const,
  STATUS: [
    { id: '', label: 'Todos los Estados' },
    { id: 'emision', label: 'En Emisión' },
    { id: 'finalizados', label: 'Finalizado' },
    { id: 'estrenos', label: 'Próximamente' }
  ] as const,
  DEMOGRAPHIES: [
    { id: '', label: 'Todas' },
    { id: 'shounen', label: 'Shounen' },
    { id: 'seinen', label: 'Seinen' },
    { id: 'shoujo', label: 'Shoujo' },
    { id: 'josei', label: 'Josei' },
    { id: 'nios', label: 'Niños' }
  ] as const,
  CATEGORIES: [
    { id: '', label: 'Todas' },
    { id: 'donghua', label: 'Donghua (China)' },
    { id: 'latino', label: 'Español Latino' }
  ] as const,
  SEASONS: [
    { id: '', label: 'Todas' },
    { id: 'invierno', label: 'Invierno (Ene-Mar)' },
    { id: 'primavera', label: 'Primavera (Abr-Jun)' },
    { id: 'verano', label: 'Verano (Jul-Sep)' },
    { id: 'otoño', label: 'Otoño (Oct-Dic)' }
  ] as const,
  LETTERS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
};

export function getSupportedYears(maxYear = new Date().getFullYear()): string[] {
  const top = Math.max(2026, maxYear);
  const years: string[] = [];
  for (let y = top; y >= 1981; y--) {
    years.push(String(y));
  }
  return years;
}

export function getVisibleDirectoryGenres(showAdultContent = false): GenreOption[] {
  if (showAdultContent) return [...JKANIME_GENRES];
  return JKANIME_GENRES.filter((g) => !g.isAdult);
}

export function createDefaultDirectoryFilters(): SearchDirectoryFilters {
  return {
    page: 1,
    filter: 'popularidad',
    order: '',
    genre: '',
    type: '',
    status: '',
    demography: '',
    category: '',
    year: '',
    season: '',
    letter: ''
  };
}

export function countActiveDirectoryFilters(f: Partial<SearchDirectoryFilters>): number {
  let count = 0;
  if (f.genre) count++;
  if (f.type) count++;
  if (f.status) count++;
  if (f.demography) count++;
  if (f.category) count++;
  if (f.year) count++;
  if (f.season) count++;
  if (f.letter) count++;
  if (f.filter && f.filter !== 'popularidad') count++;
  if (f.order === 'asc') count++;
  return count;
}

export function hasActiveDirectoryFilters(f: Partial<SearchDirectoryFilters>): boolean {
  return Boolean(
    f.genre ||
      f.type ||
      f.status ||
      f.demography ||
      f.category ||
      f.year ||
      f.season ||
      f.letter
  );
}

export function buildJKAnimeDirectoryUrl(options: Partial<SearchDirectoryFilters> = {}): string {
  const params = new URLSearchParams();
  const page = Number(options.page || 1);
  if (page > 1) params.set('p', String(page));
  if (options.filter) params.set('filtro', options.filter);
  if (options.genre) params.set('genero', options.genre);
  if (options.type) params.set('tipo', options.type);
  if (options.status) params.set('estado', options.status);
  if (options.year) params.set('fecha', options.year);
  if (options.season) params.set('temporada', options.season);
  if (options.letter) params.set('letra', options.letter.toUpperCase());
  if (options.demography) params.set('demografia', options.demography);
  if (options.category) params.set('categoria', options.category);
  if (options.order === 'asc') params.set('orden', 'asc');

  const queryString = params.toString();
  return `https://jkanime.net/directorio${queryString ? `?${queryString}` : ''}`;
}

export interface JKAnimeDirectoryItem {
  id: string;
  sourceId: number | string;
  source: 'jkanime';
  slug: string;
  title: string;
  synopsis: string;
  coverUrl: string;
  format: string;
  status: 'RELEASING' | 'FINISHED';
  originalUrl: string;
  base64Id?: string;
}

export interface JKAnimeDirectoryResult {
  items: JKAnimeDirectoryItem[];
  pagination: {
    currentPage: number;
    lastPage: number;
    perPage: number;
    totalItems: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export function parseJKAnimeDirectory(htmlSource: string): JKAnimeDirectoryResult {
  const match = String(htmlSource || '').match(/var\s+animes\s*=\s*(\{[\s\S]*?\});\s*(?:var|\n|\$)/);
  if (!match) {
    throw new Error('No se encontró el objeto paginado `var animes` en el HTML.');
  }
  const raw = JSON.parse(match[1]) as {
    data?: Array<Record<string, unknown>>;
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
    next_page_url?: string | null;
    prev_page_url?: string | null;
  };

  const items: JKAnimeDirectoryItem[] = (raw.data || []).map((item) => ({
    id: `jk_${String(item.id || '')}`,
    sourceId: (item.id as number | string) || '',
    source: 'jkanime',
    slug: String(item.slug || ''),
    title: String(item.title || ''),
    synopsis: String(item.synopsis || ''),
    coverUrl: String(item.image || ''),
    format: String(item.type || item.tipo || 'TV'),
    status: item.status === 'currently' ? 'RELEASING' : 'FINISHED',
    originalUrl: String(item.url || ''),
    base64Id: item.base64_id ? String(item.base64_id) : undefined
  }));

  return {
    items,
    pagination: {
      currentPage: Number(raw.current_page || 1),
      lastPage: Number(raw.last_page || 1),
      perPage: Number(raw.per_page || items.length || 24),
      totalItems: Number(raw.total || items.length),
      hasNextPage: Boolean(raw.next_page_url),
      hasPrevPage: Boolean(raw.prev_page_url)
    }
  };
}

export interface AniListDirectoryVariables {
  page: number;
  perPage: number;
  search?: string;
  genre_in?: string[];
  tag_in?: string[];
  format_in?: string[];
  status?: 'RELEASING' | 'FINISHED' | 'NOT_YET_RELEASED';
  season?: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
  seasonYear?: number;
  startDate_greater?: number;
  startDate_lesser?: number;
  countryOfOrigin?: 'CN' | 'JP' | 'KR';
  isAdult?: boolean;
  sort: string[];
}

export function mapDirectoryFiltersToAniListVariables(
  filters: Partial<SearchDirectoryFilters>,
  searchTerm = '',
  mediaType: 'ANIME' | 'MANGA' = 'ANIME',
  showAdultContent = false
): AniListDirectoryVariables {
  const cleanSearch = String(searchTerm || '').trim();
  const cleanLetter = String(filters.letter || '').trim().toUpperCase().slice(0, 1);

  const vars: AniListDirectoryVariables = {
    page: Math.max(1, Number(filters.page || 1)),
    perPage: cleanLetter ? 50 : 24,
    isAdult: false,
    sort: ['POPULARITY_DESC']
  };

  if (cleanSearch) {
    vars.search = cleanSearch;
  }

  const genres: string[] = [];
  const tags: string[] = [];

  if (filters.genre) {
    const gEntry = JKANIME_GENRES.find((g) => g.id === filters.genre);
    if (gEntry && (!gEntry.isAdult || showAdultContent)) {
      if (gEntry.aniGenre) genres.push(gEntry.aniGenre);
      if (gEntry.aniTag) tags.push(gEntry.aniTag);
      if (gEntry.isAdult && showAdultContent) {
        vars.isAdult = true;
      }
    }
  }

  if (filters.demography) {
    const demoMap: Record<string, string> = {
      shounen: 'Shounen',
      seinen: 'Seinen',
      shoujo: 'Shoujo',
      josei: 'Josei',
      nios: 'Kids'
    };
    const tag = demoMap[filters.demography];
    if (tag && !tags.includes(tag)) tags.push(tag);
  }

  if (genres.length > 0) vars.genre_in = genres;
  if (tags.length > 0) vars.tag_in = tags;

  if (mediaType === 'ANIME' && filters.type) {
    const typeMap: Record<string, string[]> = {
      animes: ['TV', 'TV_SHORT'],
      peliculas: ['MOVIE'],
      ovas: ['OVA'],
      onas: ['ONA'],
      especiales: ['SPECIAL']
    };
    if (typeMap[filters.type]) vars.format_in = typeMap[filters.type];
  }

  if (filters.status) {
    const statusMap: Record<string, 'RELEASING' | 'FINISHED' | 'NOT_YET_RELEASED'> = {
      emision: 'RELEASING',
      finalizados: 'FINISHED',
      estrenos: 'NOT_YET_RELEASED'
    };
    if (statusMap[filters.status]) vars.status = statusMap[filters.status];
  }

  if (mediaType === 'ANIME' && filters.season) {
    const seasonMap: Record<string, 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'> = {
      invierno: 'WINTER',
      primavera: 'SPRING',
      verano: 'SUMMER',
      otoño: 'FALL'
    };
    if (seasonMap[filters.season]) vars.season = seasonMap[filters.season];
  }

  if (filters.year && /^\d{4}$/.test(filters.year)) {
    const y = Number(filters.year);
    if (mediaType === 'ANIME' && filters.season) {
      vars.seasonYear = y;
    } else {
      vars.startDate_greater = y * 10000;
      vars.startDate_lesser = y * 10000 + 9999;
    }
  }

  if (filters.category === 'donghua') {
    vars.countryOfOrigin = 'CN';
  }

  const isAsc = filters.order === 'asc';
  if (cleanSearch) {
    vars.sort = ['SEARCH_MATCH', 'POPULARITY_DESC'];
  } else if (filters.filter === 'nombre') {
    vars.sort = [isAsc ? 'TITLE_ROMAJI' : 'TITLE_ROMAJI_DESC'];
  } else if (filters.filter === 'popularidad') {
    vars.sort = [isAsc ? 'POPULARITY' : 'POPULARITY_DESC'];
  } else {
    vars.sort = [isAsc ? 'START_DATE' : 'START_DATE_DESC'];
  }

  return vars;
}

export function filterMediaByLetter<T extends { title?: { romaji?: string | null; english?: string | null } | string }>(
  items: T[],
  letter: string
): T[] {
  const target = String(letter || '').trim().toUpperCase().slice(0, 1);
  if (!target || !/^[A-Z]$/.test(target)) return items;
  return (items || []).filter((item) => {
    const rawRomaji = typeof item.title === 'string' ? item.title : (item.title?.romaji || '');
    const rawEnglish = typeof item.title === 'string' ? item.title : (item.title?.english || '');
    const cleanR = String(rawRomaji).replace(/^[^a-zA-Z0-9]+/, '').toUpperCase();
    const cleanE = String(rawEnglish).replace(/^[^a-zA-Z0-9]+/, '').toUpperCase();
    return cleanR.startsWith(target) || cleanE.startsWith(target);
  });
}

export interface HentaiLaGenreEntry {
  id: number;
  name: string;
  slug: string;
}

export const HENTAILA_GENRES: readonly HentaiLaGenreEntry[] = [
  { id: 1, name: '3D', slug: '3d' },
  { id: 2, name: 'Ahegao', slug: 'ahegao' },
  { id: 3, name: 'Anal', slug: 'anal' },
  { id: 4, name: 'Casadas', slug: 'casadas' },
  { id: 5, name: 'Chikan', slug: 'chikan' },
  { id: 6, name: 'Ecchi', slug: 'ecchi' },
  { id: 7, name: 'Enfermeras', slug: 'enfermeras' },
  { id: 8, name: 'Escolares', slug: 'escolares' },
  { id: 9, name: 'Futanari', slug: 'futanari' },
  { id: 10, name: 'Gore', slug: 'gore' },
  { id: 11, name: 'Hardcore', slug: 'hardcore' },
  { id: 12, name: 'Harem', slug: 'harem' },
  { id: 13, name: 'Incesto', slug: 'incesto' },
  { id: 14, name: 'Juegos Sexuales', slug: 'juegos-sexuales' },
  { id: 15, name: 'Suspenso', slug: 'suspenso' },
  { id: 16, name: 'Milfs', slug: 'milfs' },
  { id: 17, name: 'Maids', slug: 'maids' },
  { id: 18, name: 'Netorare', slug: 'netorare' },
  { id: 19, name: 'Ninfomanía', slug: 'ninfomania' },
  { id: 20, name: 'Ninjas', slug: 'ninjas' },
  { id: 21, name: 'Orgías', slug: 'orgias' },
  { id: 22, name: 'Romance', slug: 'romance' },
  { id: 23, name: 'Shota', slug: 'shota' },
  { id: 24, name: 'Softcore', slug: 'softcore' },
  { id: 25, name: 'Succubus', slug: 'succubus' },
  { id: 26, name: 'Teacher', slug: 'teacher' },
  { id: 27, name: 'Tentáculos', slug: 'tentaculos' },
  { id: 28, name: 'Tetonas', slug: 'tetonas' },
  { id: 29, name: 'Vanilla', slug: 'vanilla' },
  { id: 30, name: 'Violación', slug: 'violacion' },
  { id: 31, name: 'Vírgenes', slug: 'virgenes' },
  { id: 32, name: 'Yaoi', slug: 'yaoi' },
  { id: 33, name: 'Yuri', slug: 'yuri' },
  { id: 34, name: 'Bondage', slug: 'bondage' },
  { id: 35, name: 'Elfas', slug: 'elfas' },
  { id: 36, name: 'Petit', slug: 'petit' },
  { id: 37, name: 'Threesome', slug: 'threesome' },
  { id: 38, name: 'Paizuri', slug: 'paizuri' },
  { id: 39, name: 'Gal', slug: 'gal' },
  { id: 40, name: 'Oyakodon', slug: 'oyakodon' }
];

export interface HentaiLaCatalogQueryOptions {
  page?: number;
  search?: string;
  uncensored?: boolean;
  genreId?: number | string;
  order?: 'popular' | 'recent' | '';
  year?: number | string;
}

export function buildHentaiLaCatalogUrl(options: HentaiLaCatalogQueryOptions = {}): string {
  const params = new URLSearchParams();
  const page = Math.max(1, Number(options.page || 1));
  if (page > 1) params.set('page', String(page));
  if (options.search && options.search.trim()) params.set('search', options.search.trim());
  if (options.uncensored) params.set('uncensored', 'true');
  if (options.genreId) params.set('genres', String(options.genreId));
  if (options.order) params.set('order', options.order);
  if (options.year && /^\d{4}$/.test(String(options.year))) params.set('years', String(options.year));

  const qs = params.toString();
  return `https://hentaila.com/catalogo/__data.json${qs ? `?${qs}` : ''}`;
}

