import requests
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger("AnimeOrganizerAI.Metadata")

class AniListClient:
    URL = "https://graphql.anilist.co"

    @classmethod
    def get_anime_metadata(cls, search_title: str) -> Optional[Dict[str, Any]]:
        """Consulta AniList GraphQL para obtener metadata del anime y sus secuelas."""
        query = '''
        query ($search: String) {
          Media(search: $search, type: ANIME) {
            id
            title {
              romaji
              english
            }
            episodes
            status
            format
            nextAiringEpisode {
              episode
            }
            relations {
              edges {
                relationType
                node {
                  id
                  title {
                    romaji
                  }
                  type
                  format
                  status
                }
              }
            }
          }
        }
        '''
        variables = {"search": search_title}
        try:
            response = requests.post(cls.URL, json={'query': query, 'variables': variables}, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if "data" in data and data["data"].get("Media"):
                    return data["data"]["Media"]
            else:
                logger.warning(f"AniList devolvió status {response.status_code} para '{search_title}'")
        except Exception as e:
            logger.error(f"Error consultando AniList para '{search_title}': {e}")
        return None

    @classmethod
    def get_sequels(cls, media_data: Dict[str, Any]) -> List[str]:
        """Extrae los nombres de las secuelas de un anime usando la data de AniList."""
        sequels = []
        if not media_data or "relations" not in media_data:
            return sequels
            
        relations = media_data.get("relations", {}).get("edges", [])
        if relations:
            for edge in relations:
                # RELATION_TYPE: SEQUEL
                if edge.get("relationType") == "SEQUEL":
                    node = edge.get("node", {})
                    if node.get("type") == "ANIME" and node.get("format") in ["TV", "TV_SHORT", "ONA"]:
                        title = node.get("title", {}).get("romaji")
                        if title:
                            sequels.append(title)
        return sequels
