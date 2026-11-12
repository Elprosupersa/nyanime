from typing import Optional
from curl_cffi import requests
from bs4 import BeautifulSoup
from .base import BaseScraper, EpisodeResult
import re

class FukouDaScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        # Usamos chrome110 para eludir Cloudflare
        self.session = requests.Session(impersonate="chrome110", timeout=15)
        self.base_url = "https://fukou-da.net"
        self.search_url = f"{self.base_url}/search"

    @staticmethod
    def normalize_text(text: str) -> str:
        replacements = {
            'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n',
            'Á': 'a', 'É': 'e', 'Í': 'i', 'Ó': 'o', 'Ú': 'u', 'Ñ': 'n'
        }
        text = text.lower()
        for k, v in replacements.items():
            text = text.replace(k, v)
        return text

    def search_episode(self, anime_name: str, episode_number: str) -> Optional[EpisodeResult]:
        """
        Scraper para Fukou-da usando curl_cffi para bypassear Cloudflare.
        """
        self.logger.debug(f"Buscando en Fukou-da: {anime_name} - Ep {episode_number}")
        
        try:
            name_norm = self.normalize_text(anime_name)
                
            # 1. Búsqueda por POST (usamos solo las 3 primeras palabras para maximizar hits)
            query_words = name_norm.split()[:3]
            query = " ".join(query_words)
            
            response = self.session.post(self.search_url, data={"search": query}, timeout=15)
            if response.status_code != 200:
                self.logger.warning(f"Error {response.status_code} al buscar en Fukou-da.")
                return None
                
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Encontrar el post correcto
            post_links = []
            
            for cont in soup.find_all('div', class_='ContApart'):
                ellipsis_div = cont.find('div', class_='ellipsis')
                catlink_div = cont.find('div', class_='catlink')
                
                if ellipsis_div and catlink_div:
                    title = ellipsis_div.text.strip()
                    title_norm = self.normalize_text(title)
                    
                    a_tag = catlink_div.find('a')
                    if a_tag:
                        href = a_tag.get('href', '')
                        if href.startswith(f"{self.base_url}/apart/"):
                            # Filtrar latinos, manga y novelas ligeras
                            if not self.is_valid_language(href) or not self.is_valid_language(title):
                                continue
                            
                            # Filtrar contenido que no sea anime
                            if any(word in title_norm for word in ['manga', 'novela', 'light novel', 'nl', 'comic', 'manhwa', 'pdf']):
                                continue
                            
                            href_norm = self.normalize_text(href)
                            query_dashed = query.lower().replace(" ", "-")
                            
                            # Validar que el query coincide con el título o el slug
                            if query.lower() in title_norm or query_dashed in href_norm:
                                post_links.append(href)
            
            # Removemos duplicados manteniendo el orden
            post_links = list(dict.fromkeys(post_links))
            
            if not post_links:
                self.logger.debug("No se encontraron posts en Fukou-da para este anime.")
                return None
                
            # 2. Seleccionar el post más adecuado
            best_post = None
            # Si el anime original no menciona explícitamente "s2", "season 2", "2nd", etc.
            is_s2 = bool(re.search(r'(s2|season 2|2nd| 2$| 2 )', anime_name.lower()))
            
            for url in post_links:
                url_lower = url.lower()
                has_s2 = bool(re.search(r'(-s2-|-2-|-season-2-|-2nd-)', url_lower))
                if is_s2 == has_s2:
                    best_post = url
                    break
                    
            if not best_post:
                best_post = post_links[0]
                
            post_url = best_post
            self.logger.debug(f"Analizando post de Fukou-da: {post_url}")
            
            post_resp = self.session.get(post_url, timeout=15)
            if post_resp.status_code != 200:
                return None
                
            post_soup = BeautifulSoup(post_resp.text, 'html.parser')
            
            # 3. Buscar enlaces de descarga
            download_links = []
            for a in post_soup.find_all('a'):
                href = a.get('href', '')
                if any(host in href for host in ['mega.nz', 'mediafire.com', 'drive.google.com']):
                    download_links.append(href)
            
            if not download_links:
                self.logger.debug("No se encontraron enlaces de descarga reconocidos dentro del post.")
                return None
                
            # Ordenamos los enlaces para priorizar MediaFire y Drive sobre Terabox/Mega
            def link_priority(url):
                if 'mediafire.com' in url or 'drive.google.com' in url: return 0
                if 'mega.nz' in url: return 1
                return 2
                
            download_links.sort(key=link_priority)
            best_link = download_links[0]
            
            # Si el enlace es una carpeta de MediaFire, intentar obtener el enlace directo al archivo
            if "mediafire.com/folder/" in best_link:
                try:
                    folder_key_match = re.search(r'/folder/([a-zA-Z0-9]+)', best_link)
                    if folder_key_match:
                        folder_key = folder_key_match.group(1)
                        api_url = f"https://www.mediafire.com/api/1.4/folder/get_content.php?content_type=files&filter=all&order_by=name&order_direction=asc&chunk=1&version=1.5&folder_key={folder_key}&response_format=json"
                        
                        api_resp = self.session.get(api_url, timeout=15)
                        data = api_resp.json()
                        
                        if data.get("response", {}).get("result") == "Success":
                            files = data["response"]["folder_content"]["files"]
                            ep_num_int = int(episode_number)
                            ep_str = f"{ep_num_int:02d}"
                            
                            target_link = None
                            for f in files:
                                filename = f.get("filename", "")
                                ep_match = re.search(r'(?:\s-\s|\s)([0-9]{1,3})(?:\s|\[|\.|\_)', filename)
                                if ep_match and int(ep_match.group(1)) == ep_num_int:
                                    target_link = f["links"]["normal_download"]
                                    break
                                    
                            if target_link:
                                target_link = target_link.replace("\\/", "/")
                                mf_resp = self.session.get(target_link, timeout=15)
                                if mf_resp.status_code == 200:
                                    html_mf = mf_resp.text
                                    dl_match = re.search(r'<a[^>]*href="([^"]+)"[^>]*id="downloadButton"', html_mf, re.IGNORECASE)
                                    if not dl_match:
                                        dl_match = re.search(r'<a[^>]*id="downloadButton"[^>]*href="([^"]+)"', html_mf, re.IGNORECASE)
                                        
                                    if dl_match:
                                        return EpisodeResult(
                                            anime_name=anime_name,
                                            episode_number=episode_number,
                                            download_url=dl_match.group(1),
                                            quality="1080p",
                                            source=self.name,
                                            is_direct_link=True
                                        )
                            
                            # Si era una carpeta de MediaFire y no encontramos el archivo, no retornamos la carpeta
                            self.logger.debug(f"Episodio {ep_str} no encontrado dentro de la carpeta MediaFire.")
                            return None
                except Exception as mf_err:
                    self.logger.error(f"Error procesando carpeta Mediafire en FukouDa: {mf_err}")
                    return None
            
            # Si no es un enlace directo comprobado (como Mediafire por API), solo devolver si el post realmente contiene el episodio individual
            if any(h in best_link for h in ['1024terabox.com', 'terabox.com']):
                # Los links de Terabox en FukouDa son carpetas completas, no episodios individuales
                self.logger.debug("Omitiendo enlace de Terabox para descarga individual.")
                return None

            # Inferir calidad
            quality = "1080p" if "1080p" in post_url else ("720p" if "720p" in post_url else "Unknown")
            
            return EpisodeResult(
                anime_name=anime_name,
                episode_number=episode_number,
                download_url=best_link,
                quality=quality,
                source=self.name,
                is_direct_link=False
            )
            
        except Exception as e:
            self.logger.error(f"Excepción en FukouDaScraper: {e}")
            return None
