from typing import Optional
from curl_cffi import requests
from .base import BaseScraper, EpisodeResult
import re

class YounimeScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        self.session = requests.Session(impersonate="chrome110", timeout=10)
        self.base_url = "https://younime.net"

    def search_episode(self, anime_name: str, episode_number: str) -> Optional[EpisodeResult]:
        self.logger.debug(f"Buscando en Younime: {anime_name} ep {episode_number}")
        
        slug = anime_name.lower().replace(" ", "-")
        slug = re.sub(r'[^a-z0-9\-]', '', slug)
        slug = re.sub(r'-+', '-', slug)
        ep_num = str(int(episode_number))
        
        if not self.is_valid_language(slug):
            return None
            
        url = f"{self.base_url}/episodio/{slug}-{ep_num}/"
        
        try:
            response = self.session.get(url, timeout=15, max_redirects=5)
            if response.status_code == 200:
                return EpisodeResult(
                    anime_name=anime_name,
                    episode_number=episode_number,
                    download_url=url,
                    quality="720p",
                    source=self.name,
                    is_direct_link=False
                )
            return None
        except Exception as e:
            self.logger.error(f"Error en YounimeScraper: {e}")
            return None
