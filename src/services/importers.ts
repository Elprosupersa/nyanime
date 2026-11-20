import { type AnimeListStatus, mapExternalStatusToListStatus } from '../utils/profileStats.ts';

export interface ImportedAnimeItem {
  id: number;
  title: { romaji: string; english: string };
  coverImage: { extraLarge: string; large: string };
  bannerImage?: string;
  format?: string;
  status?: string;
  episodes?: number | null;
  genres?: string[];
  description?: string;
  listStatus?: AnimeListStatus;
  watchedProgress?: number;
}

export interface ImportedMangaItem {
  id: number | string;
  title: string;
  cover: string;
  banner: string;
  flag: string;
  origLang: string;
  score: string;
  status: string;
  year: string;
}

export interface ExternalImportResult {
  service: 'anilist' | 'mal';
  username: string;
  animes: ImportedAnimeItem[];
  mangas: ImportedMangaItem[];
}

async function fetchJsonViaProxyOrDirect(url: string, init?: RequestInit): Promise<Response> {
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
  try {
    const resp = await fetch(proxyUrl, init);
    if (resp.status !== 403 && resp.status !== 404) {
      return resp;
    }
    return resp;
  } catch {
    return fetch(url, init);
  }
}

export async function importFromAniList(username: string): Promise<ExternalImportResult> {
  const cleanUser = username.trim();
  if (!cleanUser) {
    throw new Error('Ingresa un nombre de usuario público de AniList.');
  }

  const query = `
    query ($userName: String) {
      animeList: MediaListCollection(userName: $userName, type: ANIME) {
        lists {
          status
          entries {
            status
            progress
            media {
              id
              title { romaji english }
              coverImage { extraLarge large }
              bannerImage
              format
              status
              episodes
              nextAiringEpisode { episode }
              genres
              description
            }
          }
        }
      }
      mangaList: MediaListCollection(userName: $userName, type: MANGA) {
        lists {
          entries {
            media {
              id
              title { romaji english }
              coverImage { extraLarge large }
              bannerImage
              countryOfOrigin
              averageScore
              status
              startDate { year }
            }
          }
        }
      }
    }
  `;

  const resp = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { userName: cleanUser } })
  });

  const json = (await resp.json()) as {
    errors?: Array<{ message?: string; status?: number }>;
    data?: {
      animeList?: {
        lists?: Array<{
          status?: string;
          entries?: Array<{ status?: string; progress?: number; media: ImportedAnimeItem }>;
        }>;
      };
      mangaList?: {
        lists?: Array<{
          entries?: Array<{
            media: {
              id: number;
              title?: { romaji?: string; english?: string };
              coverImage?: { extraLarge?: string; large?: string };
              bannerImage?: string;
              countryOfOrigin?: string;
              averageScore?: number;
              status?: string;
              startDate?: { year?: number };
            };
          }>;
        }>;
      };
    };
  };

  if (!resp.ok || (Array.isArray(json.errors) && json.errors.length > 0 && !json.data?.animeList)) {
    const firstErr = json.errors?.[0]?.message || `HTTP ${resp.status}`;
    if (firstErr.toLowerCase().includes('not found')) {
      throw new Error(`No se encontró el usuario "${cleanUser}" en AniList.`);
    }
    throw new Error(`AniList respondió: ${firstErr}`);
  }

  const rawAnimes =
    json.data?.animeList?.lists?.flatMap((l) =>
      (l.entries || []).map((e) => ({
        ...e.media,
        listStatus: mapExternalStatusToListStatus(e.status || l.status),
        watchedProgress: Math.max(0, Math.floor(Number(e.progress || 0)))
      }))
    ) || [];
  const rawMangas =
    json.data?.mangaList?.lists?.flatMap((l) => (l.entries || []).map((e) => e.media)) || [];

  const animes: ImportedAnimeItem[] = [];
  const seenAnime = new Set<number>();
  for (const a of rawAnimes) {
    if (!a || !a.id || seenAnime.has(a.id)) continue;
    seenAnime.add(a.id);
    animes.push(a);
  }

  const mangas: ImportedMangaItem[] = [];
  const seenManga = new Set<number>();
  for (const m of rawMangas) {
    if (!m || !m.id || seenManga.has(m.id)) continue;
    seenManga.add(m.id);
    const title = m.title?.english || m.title?.romaji || 'Manga';
    const cover = m.coverImage?.extraLarge || m.coverImage?.large || '';
    const origLang = (m.countryOfOrigin || 'JP').toLowerCase();
    const flag =
      m.countryOfOrigin === 'KR' ? 'Manhwa' : m.countryOfOrigin === 'CN' ? 'Manhua' : 'Manga';
    mangas.push({
      id: m.id,
      title,
      cover,
      banner: m.bannerImage || cover,
      flag,
      origLang,
      score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.5',
      status: m.status === 'FINISHED' ? 'Finalizado' : 'En Emisión',
      year: String(m.startDate?.year || '2024')
    });
  }

  if (animes.length === 0 && mangas.length === 0) {
    throw new Error(`La lista pública de "${cleanUser}" en AniList está vacía o configurada como privada.`);
  }

  return { service: 'anilist', username: cleanUser, animes, mangas };
}

export async function importFromMyAnimeList(username: string): Promise<ExternalImportResult> {
  const cleanUser = username.trim();
  if (!cleanUser) {
    throw new Error('Ingresa un nombre de usuario público de MyAnimeList.');
  }

  // 1. Verificar perfil real y lista en Jikan v4 (API oficial comunitaria de MAL)
  const jikanUserResp = await fetchJsonViaProxyOrDirect(
    `https://api.jikan.moe/v4/users/${encodeURIComponent(cleanUser)}/full`
  );
  if (jikanUserResp.status === 404) {
    throw new Error(`El usuario "${cleanUser}" no existe en MyAnimeList.`);
  }

  const animeMap = new Map<number, ImportedAnimeItem>();
  const mangaMap = new Map<number, ImportedMangaItem>();

  // 2. Consultar animelist de Jikan v4 si sigue activa o MAL load.json público
  const malListUrl = `https://myanimelist.net/animelist/${encodeURIComponent(cleanUser)}/load.json?status=7&offset=0`;
  try {
    const jikanAnimelistResp = await fetchJsonViaProxyOrDirect(
      `https://api.jikan.moe/v4/users/${encodeURIComponent(cleanUser)}/animelist?status=all`
    );
    if (jikanAnimelistResp.ok) {
      const payload = (await jikanAnimelistResp.json()) as {
        data?: Array<{
          watching_status?: number;
          episodes_watched?: number;
          anime?: {
            mal_id?: number;
            title?: string;
            title_english?: string;
            images?: { jpg?: { large_image_url?: string; image_url?: string } };
            type?: string;
            episodes?: number;
          };
        }>;
      };
      for (const entry of payload.data || []) {
        const a = entry.anime;
        if (!a?.mal_id) continue;
        animeMap.set(a.mal_id, {
          id: a.mal_id,
          title: { romaji: a.title || 'Anime', english: a.title_english || a.title || 'Anime' },
          coverImage: {
            extraLarge: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '',
            large: a.images?.jpg?.image_url || a.images?.jpg?.large_image_url || ''
          },
          format: a.type || 'TV',
          status: 'FINISHED',
          episodes: a.episodes || null,
          genres: [],
          listStatus: mapExternalStatusToListStatus(entry.watching_status),
          watchedProgress: Math.max(0, Math.floor(Number(entry.episodes_watched || 0)))
        });
      }
    }
  } catch {
    // Continue to MAL load.json
  }

  if (animeMap.size === 0) {
    try {
      const malResp = await fetchJsonViaProxyOrDirect(malListUrl);
      if (malResp.status === 400 || malResp.status === 403) {
        throw new Error(`La lista de MyAnimeList de "${cleanUser}" es privada.`);
      }
      if (malResp.ok) {
        const rows = (await malResp.json()) as Array<{
          anime_id?: number;
          anime_title?: string;
          anime_title_eng?: string;
          anime_image_path?: string;
          anime_media_type_string?: string;
          anime_num_episodes?: number;
          status?: number;
          num_watched_episodes?: number;
        }>;
        if (Array.isArray(rows)) {
          for (const row of rows.slice(0, 150)) {
            if (!row?.anime_id) continue;
            const img = (row.anime_image_path || '').replace(/\/r\/\d+x\d+/, '');
            animeMap.set(row.anime_id, {
              id: row.anime_id,
              title: {
                romaji: String(row.anime_title || 'Anime'),
                english: String(row.anime_title_eng || row.anime_title || 'Anime')
              },
              coverImage: { extraLarge: img, large: img },
              format: row.anime_media_type_string || 'TV',
              status: 'FINISHED',
              episodes: row.anime_num_episodes || null,
              genres: [],
              listStatus: mapExternalStatusToListStatus(row.status),
              watchedProgress: Math.max(0, Math.floor(Number(row.num_watched_episodes || 0)))
            });
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('privada')) {
        throw err;
      }
    }
  }

  // 3. Combinar favoritos e historial público de Jikan v4 si aplica
  if (jikanUserResp.ok) {
    try {
      const fullJson = (await jikanUserResp.json()) as {
        data?: {
          favorites?: {
            anime?: Array<{
              mal_id?: number;
              title?: string;
              images?: { jpg?: { large_image_url?: string; image_url?: string } };
              type?: string;
            }>;
            manga?: Array<{
              mal_id?: number;
              title?: string;
              images?: { jpg?: { large_image_url?: string; image_url?: string } };
            }>;
          };
        };
      };
      const favAnimes = fullJson.data?.favorites?.anime || [];
      for (const fa of favAnimes) {
        if (!fa.mal_id || animeMap.has(fa.mal_id)) continue;
        const img = fa.images?.jpg?.large_image_url || fa.images?.jpg?.image_url || '';
        animeMap.set(fa.mal_id, {
          id: fa.mal_id,
          title: { romaji: fa.title || 'Anime', english: fa.title || 'Anime' },
          coverImage: { extraLarge: img, large: img },
          format: fa.type || 'TV',
          status: 'FINISHED',
          episodes: null,
          genres: []
        });
      }
      const favMangas = fullJson.data?.favorites?.manga || [];
      for (const fm of favMangas) {
        if (!fm.mal_id || mangaMap.has(fm.mal_id)) continue;
        const img = fm.images?.jpg?.large_image_url || fm.images?.jpg?.image_url || '';
        mangaMap.set(fm.mal_id, {
          id: fm.mal_id,
          title: fm.title || 'Manga',
          cover: img,
          banner: img,
          flag: 'Manga',
          origLang: 'jp',
          score: '8.7',
          status: 'Finalizado',
          year: '2024'
        });
      }
    } catch {
      // Non-fatal
    }
  }

  const animes = Array.from(animeMap.values());
  const mangas = Array.from(mangaMap.values());

  if (animes.length === 0 && mangas.length === 0) {
    throw new Error(
      `No se encontraron animes públicos para "${cleanUser}" en MyAnimeList (puede ser una lista vacía o privada).`
    );
  }

  return { service: 'mal', username: cleanUser, animes, mangas };
}

export async function importExternalList(
  service: 'anilist' | 'mal',
  username: string
): Promise<ExternalImportResult> {
  if (service === 'mal') {
    return importFromMyAnimeList(username);
  }
  return importFromAniList(username);
}
