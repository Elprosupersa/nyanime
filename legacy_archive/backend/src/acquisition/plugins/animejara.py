import re
import requests
from bs4 import BeautifulSoup
from .base import BaseScraper

class AnimeJaraScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        self.name = "AnimeJaraScraper"
        self.base_url = "https://animejara.com"
        self.ajax_url = f"{self.base_url}/wp-admin/admin-ajax.php"
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": self.base_url
        })

    def search_episode(self, search_name, episode_number):
        try:
            # 1. Buscar el anime usando AJAX
            search_data = {
                "action": "live_search",
                "s": search_name
            }
            res = self.session.post(self.ajax_url, data=search_data, timeout=10)
            res.raise_for_status()
            data = res.json()
            
            if not data.get("success") or not data.get("data", {}).get("animes"):
                self.logger.warning(f"No se encontró '{search_name}' en AnimeJara.")
                return None
            
            # Tomar el primer resultado
            anime = data["data"]["animes"][0]
            slug = anime.get("slug")
            if not slug:
                return None
            
            # 2. Formar la URL del episodio (asumimos temporada 1 por defecto)
            episode_url = f"{self.base_url}/episode/{slug}-1x{episode_number}/"
            self.logger.debug(f"Accediendo a episodio en AnimeJara: {episode_url}")
            
            ep_res = self.session.get(episode_url, timeout=10)
            ep_res.raise_for_status()
            
            # 3. Buscar el iframe del reproductor
            soup = BeautifulSoup(ep_res.text, "html.parser")
            iframe = soup.find("iframe", id="iframe-video")
            if not iframe or not iframe.get("src"):
                self.logger.warning("No se encontró el iframe del reproductor en AnimeJara.")
                return None
                
            embed_url = iframe.get("src")
            self.logger.debug(f"URL de embed de AnimeJara: {embed_url}")
            
            # 4. Extraer los servidores del embed
            embed_res = self.session.get(embed_url, timeout=10)
            embed_res.raise_for_status()
            
            embed_soup = BeautifulSoup(embed_res.text, "html.parser")
            servers_li = embed_soup.find_all("li", onclick=True)
            
            best_url = None
            
            # Prioridad de servidores a extraer si están disponibles
            preferred_servers = ["vidhide", "mp4upload", "streamtape", "mixdrop", "voe", "filemoon", "uqload", "streamhg"]
            
            available_servers = {}
            for li in servers_li:
                onclick_text = li.get("onclick", "")
                server_name_span = li.find("span", class_="nombre-server")
                if server_name_span and "playVideo(" in onclick_text:
                    s_name = server_name_span.text.strip().lower()
                    
                    # Extraer URL del onclick: playVideo(" URL ")
                    match = re.search(r'playVideo\(&quot;\s*([^&]+?)&quot;\)', onclick_text)
                    if not match:
                        match = re.search(r'playVideo\("([^"]+)"\)', onclick_text)
                        
                    if match:
                        url = match.group(1).strip()
                        available_servers[s_name] = url
            
            for pref in preferred_servers:
                if pref in available_servers:
                    best_url = available_servers[pref]
                    self.logger.info(f"✅ Enlace {pref} extraído de AnimeJara -> {best_url}")
                    break
            
            if not best_url and available_servers:
                # Si no hay preferidos, tomar el primero
                first_server = list(available_servers.keys())[0]
                best_url = available_servers[first_server]
                self.logger.info(f"✅ Enlace fallback {first_server} extraído de AnimeJara -> {best_url}")
            
            return best_url
            
        except Exception as e:
            self.logger.error(f"Error en AnimeJaraScraper: {e}")
            return None
