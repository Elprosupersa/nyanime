import re
import requests
import cloudscraper
from bs4 import BeautifulSoup
from .base import BaseScraper, EpisodeResult
from ..utils import slugify

class AnimeOnlineNinjaScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        self.name = "AnimeOnlineNinjaScraper"
        self.base_url = "https://ver.animeonline.ninja"
        # Usamos cloudscraper para saltar protecciones de Cloudflare estándar
        self.scraper = cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'mobile': False
            }
        )

    def search_episode(self, search_name, episode_number):
        try:
            # 1. Búsqueda
            search_url = f"{self.base_url}/?s={requests.utils.quote(search_name)}"
            res = self.scraper.get(search_url, timeout=15)
            
            # Verificar si Cloudflare sigue bloqueando
            if res.status_code in [403, 503] and "Just a moment..." in res.text:
                self.logger.warning("AnimeOnline Ninja tiene activada una protección Cloudflare estricta (Under Attack Mode). No se puede acceder por ahora sin navegador real.")
                return None
                
            res.raise_for_status()
            
            soup = BeautifulSoup(res.text, "html.parser")
            anime_link = None
            
            # Buscamos el link del anime
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if "/anime/" in href or "/online/" in href:
                    slugified = slugify(search_name)
                    if slugified in href.lower() or search_name.lower() in a.text.lower():
                        anime_link = href
                        break
            
            if not anime_link:
                slugified = slugify(search_name)
                anime_link = f"{self.base_url}/online/{slugified}/"
                
            self.logger.debug(f"Accediendo a {anime_link}")
            anime_res = self.scraper.get(anime_link, timeout=15)
            if anime_res.status_code != 200:
                return None
                
            anime_soup = BeautifulSoup(anime_res.text, "html.parser")
            ep_link = None
            
            # Buscar link al episodio
            for a in anime_soup.find_all("a", href=True):
                href = a["href"]
                if f"1x{episode_number}" in href or f"episodio-{episode_number}" in href:
                    ep_link = href
                    break
                    
            if not ep_link:
                slug = anime_link.rstrip("/").split("/")[-1]
                ep_link = f"{self.base_url}/episodio/{slug}-1x{episode_number}/"
                
            self.logger.debug(f"Accediendo a episodio {ep_link}")
            ep_res = self.scraper.get(ep_link, timeout=15)
            if ep_res.status_code != 200:
                return None
                
            ep_soup = BeautifulSoup(ep_res.text, "html.parser")
            
            # Extraer iframes
            iframes = ep_soup.find_all("iframe", src=True)
            for iframe in iframes:
                src = iframe["src"]
                if "youtube" not in src and "trembed" not in src:
                    self.logger.info(f"✅ Enlace extraído de AnimeOnline Ninja -> {src}")
                    return EpisodeResult(
                        anime_name=search_name,
                        episode_number=str(episode_number),
                        download_url=src,
                        quality="1080p",
                        source=self.name,
                        is_direct_link=False
                    )
            
            self.logger.warning("No se encontró reproductor válido en AnimeOnline Ninja.")
            return None

        except Exception as e:
            self.logger.error(f"Error en AnimeOnlineNinjaScraper: {e}")
            return None
