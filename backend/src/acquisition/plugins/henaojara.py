import re
import requests
from bs4 import BeautifulSoup
import html
from .base import BaseScraper, EpisodeResult
from ..utils import slugify

class HenaoJaraScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        self.name = "HenaoJaraScraper"
        self.base_url = "https://henaojara.com"
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": self.base_url
        })

    def search_episode(self, search_name, episode_number):
        try:
            # 1. Buscar en la página usando /?s=
            search_url = f"{self.base_url}/?s={requests.utils.quote(search_name)}"
            res = self.session.get(search_url, timeout=10)
            res.raise_for_status()
            
            soup = BeautifulSoup(res.text, "html.parser")
            anime_link = None
            
            # Buscar el link del anime en los resultados (normalmente en artículos con clase TPost o links que tengan /view/)
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if "/view/" in href and "/episode/" not in href and "/category/" not in href and "/season/" not in href:
                    # Validar que no sea latino
                    if not self.is_valid_language(href) or not self.is_valid_language(a.text):
                        continue
                        
                    # Coincidencia aproximada por slug
                    slugified_search = slugify(search_name)
                    if slugified_search in href.lower() or search_name.lower() in a.text.lower():
                        anime_link = href
                        break
            
            # Si la búsqueda falló, intentamos armar el slug directamente
            if not anime_link:
                slugified_search = slugify(search_name)
                anime_link = f"{self.base_url}/view/{slugified_search}/"
            
            self.logger.debug(f"Accediendo al anime en HenaoJara: {anime_link}")
            
            # 2. Acceder a la página del anime
            anime_res = self.session.get(anime_link, timeout=10)
            if anime_res.status_code != 200:
                self.logger.warning(f"No se pudo acceder a la página del anime HenaoJara (HTTP {anime_res.status_code}).")
                return None
                
            anime_soup = BeautifulSoup(anime_res.text, "html.parser")
            
            # 3. Buscar el episodio
            ep_link = None
            for a in anime_soup.find_all("a", href=True):
                href = a["href"]
                # Buscamos algo como -1x{episode}/ o -1x{episode}
                if f"-1x{episode_number}/" in href or f"-1x{episode_number}" in href:
                    ep_link = href
                    break
                    
            if not ep_link:
                # Fallback: intentar armar la URL del episodio asumiendo el slug del anime
                slug = anime_link.rstrip("/").split("/")[-1]
                ep_link = f"{self.base_url}/view/episode/{slug}-1x{episode_number}/"
                
            self.logger.debug(f"Accediendo a episodio en HenaoJara: {ep_link}")
            ep_res = self.session.get(ep_link, timeout=10)
            if ep_res.status_code != 200:
                self.logger.warning(f"No se pudo acceder al episodio en HenaoJara (HTTP {ep_res.status_code}).")
                return None
                
            ep_soup = BeautifulSoup(ep_res.text, "html.parser")
            
            # 4. Extraer los servidores (Toroplay usa <li data-tplayernv="OptX"> y luego <div id="OptX">)
            servers_li = ep_soup.find_all("li", attrs={"data-tplayernv": True})
            
            available_servers = {}
            for li in servers_li:
                opt_id = li["data-tplayernv"]
                server_name = li.text.strip().lower()
                
                # Buscar el div correspondiente
                div = ep_soup.find("div", id=opt_id)
                if div:
                    # El div puede tener el iframe directamente o como texto escapado
                    iframe_src = None
                    iframe = div.find("iframe")
                    if iframe and iframe.get("src"):
                        iframe_src = iframe["src"]
                    else:
                        # Toroplay a veces escapa el HTML con &lt;iframe...
                        decoded_html = html.unescape(div.decode_contents())
                        match = re.search(r'<iframe[^>]+src="([^"]+)"', decoded_html)
                        if match:
                            iframe_src = match.group(1)
                    
                    if iframe_src and "?trembed=" in iframe_src:
                        # Espejamos la URL para forzar https si es necesario
                        if iframe_src.startswith("//"):
                            iframe_src = "https:" + iframe_src
                        elif iframe_src.startswith("/"):
                            iframe_src = self.base_url + iframe_src
                        available_servers[server_name] = iframe_src

            # Prioridad de servidores a extraer si están disponibles (hosts con enlaces directos/compatibles primero)
            preferred_servers = ["vidhide", "mp4upload", "voe", "streamwish", "mixdrop", "filemoon", "uqload", "filelions", "streamtape"]
            
            best_trembed_url = None
            best_server_name = None
            
            for pref in preferred_servers:
                if pref in available_servers:
                    best_trembed_url = available_servers[pref]
                    best_server_name = pref
                    break
            
            if not best_trembed_url and available_servers:
                # Filtrar 'nyuu' (servidor propio que esconde mp4 final, a menos que sea el único)
                for s_name, url in available_servers.items():
                    if s_name != "nyuu":
                        best_server_name = s_name
                        best_trembed_url = url
                        break
                
                if not best_trembed_url:
                    best_server_name = list(available_servers.keys())[0]
                    best_trembed_url = available_servers[best_server_name]

            if not best_trembed_url:
                self.logger.warning("No se encontraron servidores en HenaoJara.")
                return None
                
            self.logger.debug(f"Desencriptando embed de {best_server_name} en HenaoJara -> {best_trembed_url}")
            
            # 5. Obtener el embed real
            # Toroplay usa trembed=X
            # A veces viene codificado &amp; -> &
            best_trembed_url = html.unescape(best_trembed_url)
            
            embed_res = self.session.get(best_trembed_url, timeout=10)
            embed_res.raise_for_status()
            
            embed_soup = BeautifulSoup(embed_res.text, "html.parser")
            final_iframe = embed_soup.find("iframe")
            if final_iframe and final_iframe.get("src"):
                final_url = final_iframe.get("src")
                return EpisodeResult(
                    anime_name=search_name,
                    episode_number=episode_number,
                    download_url=final_url,
                    quality="1080p",
                    source=self.name,
                    is_direct_link=False
                )
                
            return None

        except Exception as e:
            self.logger.error(f"Error en HenaoJaraScraper: {e}")
            return None
