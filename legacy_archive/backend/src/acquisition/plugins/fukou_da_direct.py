from typing import Optional
from curl_cffi import requests
from .base import BaseScraper, EpisodeResult

class FukouDaDirectScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        self.session = requests.Session(impersonate="chrome110", timeout=10)
        self.base_url = "https://descarga-directa.fukou-da.net/0:/"

    def search_episode(self, anime_name: str, episode_number: str) -> Optional[EpisodeResult]:
        self.logger.debug(f"Buscando en FukouDaDirect: {anime_name} ep {episode_number}")
        
        try:
            import urllib.parse
            # 1. Obtener la lista de carpetas
            res = self.session.post(self.base_url, json={"password": ""}, timeout=15)
            if res.status_code != 200:
                return None
            
            data = res.json()
            folders = data.get("data", {}).get("files", [])
            target_folder = None
            
            # Limpiar nombre para búsqueda
            def normalize(text):
                t = text.lower()
                for k, v in {'á':'a', 'é':'e', 'í':'i', 'ó':'o', 'ú':'u', 'ñ':'n'}.items():
                    t = t.replace(k, v)
                return t
                
            search_name = normalize(anime_name).replace("-", " ").strip()
            
            for f in folders:
                if f.get("mimeType") == "application/vnd.google-apps.folder":
                    folder_name = f.get("name", "")
                    if search_name in normalize(folder_name):
                        target_folder = folder_name
                        break
            
            if not target_folder:
                self.logger.debug(f"No se encontró carpeta para {anime_name} en Fukou-Da Direct")
                return None
            
            # 2. Navegar dentro de la carpeta
            folder_url = f"{self.base_url}{urllib.parse.quote(target_folder)}/"
            res_folder = self.session.post(folder_url, json={"password": ""}, timeout=15)
            if res_folder.status_code != 200:
                return None
                
            files_data = res_folder.json().get("data", {}).get("files", [])
            
            # Formatear el número de episodio para búsqueda (01, 1, Episodio 01)
            import re
            ep_num = str(int(episode_number))
            ep_num_padded = ep_num.zfill(2)
            
            target_file = None
            for f in files_data:
                fname = f.get("name", "")
                if fname.endswith(".mp4") or fname.endswith(".mkv"):
                    # Buscar el número suelto o después de un 0
                    if re.search(rf'\b0?{ep_num}\b', fname):
                        target_file = fname
                        break
            
            if target_file:
                direct_url = f"{folder_url}{urllib.parse.quote(target_file)}"
                self.logger.info(f"✅ ¡Enlace directo encontrado en Fukou-Da Direct! -> {direct_url}")
                return EpisodeResult(
                    anime_name=anime_name,
                    episode_number=episode_number,
                    download_url=direct_url,
                    quality="1080p",
                    source=self.name,
                    is_direct_link=True # URL HTTP plana
                )
            else:
                self.logger.debug(f"Carpeta encontrada, pero no el episodio {episode_number}")
                return None
                
        except Exception as e:
            self.logger.error(f"Error en FukouDaDirectScraper: {e}")
            return None
