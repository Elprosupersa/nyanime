from typing import Optional
from curl_cffi import requests
from .base import BaseScraper, EpisodeResult
import re

class UnionFansubScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        self.session = requests.Session(impersonate="chrome110", timeout=10)
        self.base_url = "https://torrent.unionfansub.com"

    def search_episode(self, anime_name: str, episode_number: str) -> Optional[EpisodeResult]:
        """
        UnionFansub es un tracker de Torrents. 
        El usuario especificó que esto es la ÚLTIMA prioridad y que desconfía un poco de los torrents.
        Si la cascada llega hasta aquí, significa que fallaron 6 sitios web de streaming directo.
        """
        self.logger.debug(f"Buscando en UnionFansub (Torrent): {anime_name} ep {episode_number}")
        
        # Skeleton: en un futuro si se requiere, se implementa la búsqueda en tracker.
        return None
