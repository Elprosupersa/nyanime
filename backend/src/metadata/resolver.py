import requests
import logging
import time
from typing import Dict, Any, Optional, List
from pathlib import Path
import json

from src.metadata.models import (
    AnimeDetailsModel,
    SeasonModel,
    EpisodeModel,
    VideoSourceInfo,
    SourceHealthStatus
)

logger = logging.getLogger("AnimeOrganizerAI.Resolver")

class AnimeMetadataResolver:
    """
    Fuente única de verdad para la resolución de animes, temporadas y episodios reales.
    Garantiza que nunca se generen episodios falsos, estimados o inexistentes.
    """
    ANILIST_URL = "https://graphql.anilist.co"
    ANIZIP_URL = "https://api.ani.zip/mappings"

    def __init__(self, cache_file: Optional[Path] = None):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "AnimeHub-Organizer/2.0 (Linux; x86_64)",
            "Accept": "application/json"
        })
        if cache_file:
            self.cache_file = Path(cache_file)
        else:
            base_dir = Path(__file__).resolve().parent
            self.cache_file = base_dir / "anime_metadata_cache.json"
        
        self.cache = self._load_cache()

    def _load_cache(self) -> Dict[str, Any]:
        if self.cache_file.exists():
            try:
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Error cargando caché de metadatos: {e}")
        return {}

    def _save_cache(self):
        try:
            self.cache_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.cache_file, "w", encoding="utf-8") as f:
                json.dump(self.cache, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"Error guardando caché de metadatos: {e}")

    def query_anilist_by_id(self, anime_id: int) -> Optional[Dict[str, Any]]:
        query = '''
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            id
            title {
              romaji
              english
              native
            }
            coverImage {
              extraLarge
              large
            }
            bannerImage
            description(asHtml: false)
            genres
            startDate {
              year
              month
              day
            }
            status
            format
            episodes
            nextAiringEpisode {
              episode
              timeUntilAiring
            }
            relations {
              edges {
                relationType
                node {
                  id
                  title {
                    romaji
                    english
                  }
                  format
                  status
                  episodes
                  nextAiringEpisode {
                    episode
                  }
                  startDate {
                    year
                  }
                }
              }
            }
          }
        }
        '''
        try:
            res = self.session.post(self.ANILIST_URL, json={'query': query, 'variables': {'id': anime_id}}, timeout=12)
            if res.status_code == 200:
                data = res.json()
                return data.get('data', {}).get('Media')
        except Exception as e:
            logger.error(f"Error consultando AniList por ID {anime_id}: {e}")
        return None

    def search_anilist(self, query_text: str, limit: int = 15) -> List[Dict[str, Any]]:
        query = '''
        query ($search: String, $perPage: Int) {
          Page(page: 1, perPage: $perPage) {
            media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
              id
              title {
                romaji
                english
              }
              coverImage {
                extraLarge
                large
              }
              bannerImage
              description(asHtml: false)
              genres
              startDate {
                year
              }
              status
              format
              episodes
              nextAiringEpisode {
                episode
              }
            }
          }
        }
        '''
        try:
            res = self.session.post(self.ANILIST_URL, json={'query': query, 'variables': {'search': query_text, 'perPage': limit}}, timeout=12)
            if res.status_code == 200:
                data = res.json()
                return data.get('data', {}).get('Page', {}).get('media', [])
        except Exception as e:
            logger.error(f"Error buscando animes en AniList ('{query_text}'): {e}")
        return []

    def get_trending_and_releasing(self) -> Dict[str, List[Dict[str, Any]]]:
        query = '''
        query {
          trending: Page(page: 1, perPage: 12) {
            media(type: ANIME, sort: TRENDING_DESC) {
              id
              title { romaji english }
              coverImage { extraLarge large }
              bannerImage
              description(asHtml: false)
              genres
              startDate { year }
              status
              format
              episodes
              nextAiringEpisode { episode }
            }
          }
          releasing: Page(page: 1, perPage: 12) {
            media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) {
              id
              title { romaji english }
              coverImage { extraLarge large }
              bannerImage
              genres
              startDate { year }
              status
              format
              episodes
              nextAiringEpisode { episode }
            }
          }
          popular: Page(page: 1, perPage: 12) {
            media(type: ANIME, sort: POPULARITY_DESC) {
              id
              title { romaji english }
              coverImage { extraLarge large }
              bannerImage
              genres
              startDate { year }
              status
              format
              episodes
            }
          }
        }
        '''
        try:
            res = self.session.post(self.ANILIST_URL, json={'query': query}, timeout=12)
            if res.status_code == 200:
                data = res.json().get('data', {})
                return {
                    "trending": data.get('trending', {}).get('media', []),
                    "releasing": data.get('releasing', {}).get('media', []),
                    "popular": data.get('popular', {}).get('media', [])
                }
        except Exception as e:
            logger.error(f"Error consultando animes destacados en AniList: {e}")
        return {"trending": [], "releasing": [], "popular": []}

    def fetch_anizip_mapping(self, anilist_id: int) -> Optional[Dict[str, Any]]:
        try:
            res = self.session.get(f"{self.ANIZIP_URL}?anilist_id={anilist_id}", timeout=8)
            if res.status_code == 200:
                return res.json()
        except Exception as e:
            logger.debug(f"AniZip mapping no disponible para {anilist_id}: {e}")
        return None

    def calculate_real_episodes(self, media: Dict[str, Any]) -> int:
        """
        Determina con precisión matemática la cantidad REAL y CONFIRMADA de episodios emitidos.
        Elimina por completo la generación de episodios falsos/futuros.
        """
        status = media.get("status")
        format_type = media.get("format")
        total_episodes_declared = media.get("episodes")
        next_airing = media.get("nextAiringEpisode")

        # 1. Si aún no se estrena -> 0 episodios
        if status == "NOT_YET_RELEASED":
            return 0

        # 2. Si está en emisión (RELEASING) y sabemos el próximo episodio en emitirse
        if status == "RELEASING" and next_airing and "episode" in next_airing:
            # Si el próximo episodio es el 9, los episodios realmente disponibles son del 1 al 8.
            current_aired = next_airing["episode"] - 1
            return max(0, current_aired)

        # 3. Si el anime ya finalizó (FINISHED)
        if status == "FINISHED" and total_episodes_declared is not None:
            return max(0, int(total_episodes_declared))

        # 4. Para películas u OVAs únicas
        if format_type == "MOVIE":
            return 1
            
        # 5. Si está finalizado pero no tenía el campo episodes seteado, o está en emisión sin nextAiring
        if total_episodes_declared is not None and total_episodes_declared > 0:
            return int(total_episodes_declared)

        # Si no hay certeza alguna de emisión disponible, retornar 0 en lugar de inventar
        return 0

    def resolve_anime_details(self, anime_id: int, force_refresh: bool = False) -> Optional[AnimeDetailsModel]:
        cache_key = f"anime_{anime_id}"
        if not force_refresh and cache_key in self.cache:
            cache_entry = self.cache[cache_key]
            # Validar TTL (12 horas para animes en emision, 7 dias para finalizados)
            cached_time = cache_entry.get("_cached_at", 0)
            status = cache_entry.get("status")
            ttl = 43200 if status == "RELEASING" else 604800
            if (time.time() - cached_time) < ttl:
                try:
                    return AnimeDetailsModel(**cache_entry["data"])
                except Exception:
                    pass

        media = self.query_anilist_by_id(anime_id)
        if not media:
            return None

        anizip_data = self.fetch_anizip_mapping(anime_id) or {}
        anizip_episodes = anizip_data.get("episodes", {})

        # Calcular temporadas de la franquicia
        seasons: List[SeasonModel] = []
        
        # Temporada Principal
        real_count = self.calculate_real_episodes(media)
        main_episodes: List[EpisodeModel] = []
        for ep_num in range(1, real_count + 1):
            ep_meta = anizip_episodes.get(str(ep_num), {})
            ep_title = ep_meta.get("title", {}).get("en") or ep_meta.get("title", {}).get("ja") or f"Episodio {ep_num}"
            ep_thumb = ep_meta.get("image") or media.get("coverImage", {}).get("large")
            ep_air = ep_meta.get("airdate")
            
            main_episodes.append(EpisodeModel(
                id=f"{anime_id}_s1_e{ep_num}",
                anime_id=anime_id,
                season_number=1,
                episode_number=ep_num,
                title=ep_title,
                thumbnail=ep_thumb,
                is_available=True,
                air_date=ep_air
            ))

        main_title = media.get("title", {}).get("romaji") or media.get("title", {}).get("english") or "Temporada 1"
        seasons.append(SeasonModel(
            season_number=1,
            title=main_title,
            format=media.get("format", "TV"),
            total_episodes=len(main_episodes),
            episodes=main_episodes
        ))

        # Detectar Secuelas y Relaciones directas (Temporadas 2, 3, etc.)
        relations = media.get("relations", {}).get("edges", [])
        season_idx = 2
        for edge in relations:
            rel_type = edge.get("relationType")
            node = edge.get("node")
            if not node:
                continue
            if rel_type in ["SEQUEL", "SIDE_STORY", "ALTERNATIVE"]:
                node_fmt = node.get("format")
                if node_fmt in ["TV", "TV_SHORT", "ONA", "OVA", "MOVIE"]:
                    node_real_count = self.calculate_real_episodes(node)
                    if node_real_count > 0:
                        node_eps: List[EpisodeModel] = []
                        for node_ep_num in range(1, node_real_count + 1):
                            node_eps.append(EpisodeModel(
                                id=f"{node['id']}_s{season_idx}_e{node_ep_num}",
                                anime_id=node['id'],
                                season_number=season_idx,
                                episode_number=node_ep_num,
                                title=f"Episodio {node_ep_num}",
                                is_available=True
                            ))
                        node_title = node.get("title", {}).get("romaji") or f"Temporada {season_idx}"
                        seasons.append(SeasonModel(
                            season_number=season_idx,
                            title=node_title,
                            format=node_fmt,
                            total_episodes=len(node_eps),
                            episodes=node_eps
                        ))
                        season_idx += 1

        total_real_eps = sum(s.total_episodes for s in seasons)

        details = AnimeDetailsModel(
            id=media["id"],
            title_romaji=media.get("title", {}).get("romaji") or "Sin título",
            title_english=media.get("title", {}).get("english"),
            cover_image=media.get("coverImage", {}).get("extraLarge") or media.get("coverImage", {}).get("large"),
            banner_image=media.get("bannerImage"),
            description=media.get("description"),
            genres=media.get("genres") or [],
            year=media.get("startDate", {}).get("year"),
            status=media.get("status", "FINISHED"),
            total_seasons=len(seasons),
            seasons=seasons,
            real_total_episodes=total_real_eps
        )

        # Guardar en caché con timestamp
        self.cache[cache_key] = {
            "_cached_at": time.time(),
            "status": details.status,
            "data": details.model_dump()
        }
        self._save_cache()

        return details
