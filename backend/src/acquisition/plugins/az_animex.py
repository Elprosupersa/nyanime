from typing import Optional
from curl_cffi import requests
from .base import BaseScraper, EpisodeResult
import re
import urllib.parse
import unicodedata
from ..utils import extract_episode_number

class AZAnimexScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        self.session = requests.Session(impersonate="chrome110", timeout=10)
        self.base_url = "https://www.az-animex.com"

    def _clean_str(self, text: str) -> str:
        text_norm = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8').lower()
        return re.sub(r'[^a-z0-9]', '', text_norm)

    def search_episode(self, anime_name: str, episode_number: str) -> Optional[EpisodeResult]:
        self.logger.debug(f"Buscando en AZ-Animex: {anime_name} ep {episode_number}")
        
        name_norm = unicodedata.normalize('NFKD', anime_name).encode('ASCII', 'ignore').decode('utf-8').lower()
        slug = name_norm.replace(" ", "-")
        slug = re.sub(r'[^a-z0-9\-]', '', slug)
        slug = re.sub(r'-+', '-', slug)
        
        try:
            ep_num_int = int(episode_number)
        except ValueError:
            ep_num_int = episode_number
            
        ep_str = f"{int(ep_num_int):02d}" if isinstance(ep_num_int, int) else str(ep_num_int)
        
        url = f"{self.base_url}/{slug}/"
        
        try:
            response = self.session.get(url, timeout=15)
            if response.status_code != 200:
                self.logger.debug(f"No se encontró la página principal: {url}")
                return None
                
            # Buscar el botón de MediaFire
            html = response.text
            match = re.search(r'href="(https?://www\.mediafire\.com/folder/[^"]+)"', html, re.IGNORECASE)
            if not match:
                self.logger.debug("No se encontró el enlace de MediaFire en la página.")
                return None
                
            mf_folder_url = match.group(1)
            self.logger.debug(f"Carpeta de MediaFire encontrada: {mf_folder_url}")
            
            folder_key_match = re.search(r'/folder/([a-zA-Z0-9]+)', mf_folder_url)
            if not folder_key_match:
                return None
            
            folder_key = folder_key_match.group(1)
            
            # Consultar la API de Mediafire
            api_url = f"https://www.mediafire.com/api/1.4/folder/get_content.php?content_type=files&filter=all&order_by=name&order_direction=asc&chunk=1&version=1.5&folder_key={folder_key}&response_format=json"
            
            api_resp = self.session.get(api_url, timeout=15)
            data = api_resp.json()
            
            if data.get("response", {}).get("result") != "Success":
                self.logger.error("Error al obtener el contenido de la carpeta MediaFire.")
                return None
                
            files = data["response"]["folder_content"]["files"]
            
            clean_target_anime = self._clean_str(anime_name)
            
            target_link = None
            for f in files:
                filename = f.get("filename", "")
                
                # 1. Extraer número de episodio del nombre de archivo de forma robusta
                file_ep_num = extract_episode_number(filename)
                if file_ep_num is None:
                    ep_match = re.search(r'(?:\s-\s|\s)([0-9]{1,3})(?:\s|\[|\.|\_)', filename)
                    if ep_match:
                        file_ep_num = int(ep_match.group(1))
                if file_ep_num is None or file_ep_num != int(ep_num_int):
                    continue
                    
                # 2. Comprobación estricta de título para no confundir con spin-offs / chibis / otras temporadas
                clean_filename = self._clean_str(filename)
                
                # Descartar archivos que contengan palabras de especiales chibis o spin-offs si el anime objetivo no las tiene
                if 'offline' in clean_filename and 'offline' not in clean_target_anime:
                    continue
                is_chibi_file = any(k in clean_filename for k in ['breaktime', 'petit', 'minianime', 'picturedrama', 'recap'])
                is_chibi_target = any(k in clean_target_anime for k in ['breaktime', 'petit', 'minianime', 'picturedrama', 'recap'])
                if is_chibi_file and not is_chibi_target:
                    continue

                # Validación estricta de temporada (evitar que Season 2 responda a búsquedas de Season 1 o viceversa)
                def _extract_s_tag(text: str) -> int:
                    t = text.lower()
                    if any(k in t for k in ['part 2', 'part2', 'parte 2', 'parte2', '2nd part']):
                        return 22
                    if any(k in t for k in ['4th season', 'season 4', 'temporada 4', ' s4', '_s4', ' iv']):
                        return 4
                    if any(k in t for k in ['3rd season', 'season 3', 'temporada 3', ' s3', '_s3', ' iii']):
                        return 3
                    if any(k in t for k in ['2nd season', 'season 2', 'temporada 2', ' s2', '_s2', ' ii']):
                        return 2
                    return 1

                if _extract_s_tag(anime_name) != _extract_s_tag(filename):
                    continue
                    
                target_link = f["links"]["normal_download"]
                break
                    
            if not target_link:
                self.logger.debug(f"No se encontró el episodio {ep_num_int} en la carpeta de MediaFire.")
                return None
                
            target_link = target_link.replace("\\/", "/")
            
            # Obtener el enlace directo desde la página de descarga de MediaFire
            mf_resp = self.session.get(target_link, timeout=15)
            if mf_resp.status_code == 200:
                html_mf = mf_resp.text
                dl_match = re.search(r'<a[^>]*href="([^"]+)"[^>]*id="downloadButton"', html_mf, re.IGNORECASE)
                if not dl_match:
                    dl_match = re.search(r'<a[^>]*id="downloadButton"[^>]*href="([^"]+)"', html_mf, re.IGNORECASE)
                    
                if dl_match:
                    target_link = dl_match.group(1)
                    self.logger.info(f"Enlace DIRECTO de episodio encontrado en AZ-Animex: {target_link}")
                    return EpisodeResult(
                        anime_name=anime_name,
                        episode_number=episode_number,
                        download_url=target_link,
                        quality="1080p",
                        source=f"{self.name} (Mediafire)",
                        is_direct_link=True,
                        mirror_name="Mediafire"
                    )
            
            return EpisodeResult(
                anime_name=anime_name,
                episode_number=episode_number,
                download_url=target_link,
                quality="1080p",
                source=f"{self.name} (Mediafire)",
                is_direct_link=False,
                mirror_name="Mediafire"
            )
            
        except Exception as e:
            self.logger.error(f"Error en AZAnimexScraper: {e}")
            return None
