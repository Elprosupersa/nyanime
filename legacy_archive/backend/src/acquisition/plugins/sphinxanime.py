import re
import base64
import requests
from bs4 import BeautifulSoup
from .base import BaseScraper, EpisodeResult
from ..utils import slugify

class SphinxAnimeScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        self.name = "SphinxAnimeScraper"
        self.base_url = "https://sphinxanime.com"
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })

    def search_episode(self, search_name, episode_number):
        try:
            # 1. Búsqueda
            search_url = f"{self.base_url}/?s={requests.utils.quote(search_name)}"
            res = self.session.get(search_url, timeout=10)
            res.raise_for_status()
            
            soup = BeautifulSoup(res.text, "html.parser")
            anime_link = None
            
            # Buscar el post del anime
            for a in soup.find_all("a", href=True):
                href = a["href"]
                # Excluir links que no son de animes
                if "category" in href or "tag" in href or "page" in href or "author" in href:
                    continue
                    
                # Validar idioma
                if not self.is_valid_language(href) or not self.is_valid_language(a.text):
                    continue
                
                # Coincidencia por texto o href
                slugified = slugify(search_name)
                if slugified in href.lower() or search_name.lower() in a.text.lower():
                    # SphinxAnime agrupa por temporadas (ej: jujutsu-kaisen-24-24-bd...)
                    anime_link = href
                    break
                    
            if not anime_link:
                self.logger.warning(f"No se encontró el anime {search_name} en SphinxAnime.")
                return None
                
            self.logger.debug(f"Accediendo a {anime_link}")
            anime_res = self.session.get(anime_link, timeout=10)
            if anime_res.status_code != 200:
                return None
                
            # 2. Buscar enlaces encubiertos a box.sphinxanime.net
            # Usualmente están en /short/?anonym=base64
            short_links = re.findall(r'href="https://sphinxanime\.com/short/\?anonym=([^"]+)"', anime_res.text)
            box_url = None
            
            if short_links:
                # Tomar el primero
                encoded_url = short_links[0]
                try:
                    # SphinxAnime usa base64 para ocultar el link
                    decoded_bytes = base64.b64decode(encoded_url)
                    decoded_url = decoded_bytes.decode('utf-8')
                    if "box.sphinxanime.net" in decoded_url:
                        box_url = decoded_url
                except Exception:
                    pass
            
            if not box_url:
                self.logger.warning("No se encontró enlace al paste (box.sphinxanime.net) en el artículo.")
                return None
                
            self.logger.debug(f"Accediendo a Paste Sphinx: {box_url}")
            box_res = self.session.get(box_url, timeout=10)
            
            if box_res.status_code != 200:
                return None
                
            box_soup = BeautifulSoup(box_res.text, "html.parser")
            
            # 3. Extraer enlaces de Mega / Drive
            mega_url = None
            drive_url = None
            
            for a in box_soup.find_all("a", href=True):
                href = a["href"]
                if "mega.nz" in href:
                    mega_url = href
                    # Preferimos retornar mega
                    break
                elif "drive.google.com" in href:
                    drive_url = href
                    
            final_url = mega_url or drive_url
            
            if final_url:
                self.logger.info(f"✅ Enlace extraído de SphinxAnime -> {final_url}")
                return EpisodeResult(
                    anime_name=search_name,
                    episode_number=episode_number,
                    download_url=final_url,
                    quality="1080p",
                    source=self.name,
                    is_direct_link=False
                )
                
            self.logger.warning("No se encontró Mega/Drive dentro del paste de SphinxAnime.")
            return None

        except Exception as e:
            self.logger.error(f"Error en SphinxAnimeScraper: {e}")
            return None
