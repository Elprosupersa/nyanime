from typing import Optional, List
from curl_cffi import requests
from bs4 import BeautifulSoup
from .base import BaseScraper, EpisodeResult
import re

class JKAnimeScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        self.session = requests.Session(impersonate="chrome110", timeout=15)
        self.base_url = "https://jkanime.net"

    def normalize_text(self, text):
        import unicodedata
        # Reemplazar e con acento específicamente para Cafe
        text = text.replace('é', 'e').replace('É', 'E')
        # Quitar otros acentos
        text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
        return text

    def search_episode(self, anime_name: str, episode_number: str) -> Optional[EpisodeResult]:
        """
        Búsqueda básica en JKAnime formateando el slug.
        """
        self.logger.debug(f"Buscando en JKAnime: {anime_name} ep {episode_number}")
        
        anime_name_norm = self.normalize_text(anime_name)
        slug = anime_name_norm.lower().replace(" ", "-")
        slug = re.sub(r'[^a-z0-9\-]', '', slug)
        slug = re.sub(r'-+', '-', slug)
        try:
            ep_num = str(int(episode_number))
        except ValueError:
            ep_num = str(episode_number).lower()
        
        # Intentaremos con el slug original y con variaciones comunes
        slugs_to_try = [slug]
        if "high-school" in slug:
            slugs_to_try.append(slug.replace("high-school", "highschool"))
        if "-oji-san" in slug or "-ojisan" in slug:
            slugs_to_try.append(slug.replace("-oji-san", "-ojisan"))
            slugs_to_try.append(slug.replace("-ojisan", "-oji-san"))
        # Variación general: quitar guiones antes de sufijos japoneses (-san, -chan, -kun, -sama)
        no_suffix_hyphens = re.sub(r'-((?:san|chan|kun|sama|ojisan|sensei))\b', r'\1', slug)
        if no_suffix_hyphens not in slugs_to_try:
            slugs_to_try.append(no_suffix_hyphens)
        if slug.startswith("-"):
            slugs_to_try.append(slug[1:])
            
        for current_slug in slugs_to_try:
            if not self.is_valid_language(current_slug):
                continue
                
            url = f"{self.base_url}/{current_slug}/{ep_num}/"
            
            try:
                response = self.session.get(url, timeout=15)
                if response.status_code == 200:
                    html = response.text
                    import json
                    import base64
                    
                    match = re.search(r'var servers = (\[.*?\]);', html)
                    if match:
                        servers_json = match.group(1)
                        try:
                            servers = json.loads(servers_json)
                            results = []
                            # Prioridad optimizada: Mediafire y Mega primero por máxima velocidad y fiabilidad
                            for pref_server in ["Mediafire", "Mega", "Mp4upload", "Streamwish", "Vidhide", "Mixdrop", "Streamtape", "Doodstream", "VOE", "Desu", "Okru"]:
                                for server in servers:
                                    if server.get("server") == pref_server:
                                        raw_b64 = server.get("remote")
                                        if not raw_b64:
                                            continue
                                        remote_url = base64.b64decode(raw_b64).decode('utf-8').strip()
                                        best_url = None
                                        
                                        if pref_server == "Mediafire":
                                            try:
                                                mf_res = self.session.get(remote_url, timeout=15)
                                                soup = BeautifulSoup(mf_res.text, "html.parser")
                                                btn = soup.find(id="downloadButton")
                                                if btn and btn.get("href"):
                                                    best_url = btn.get("href")
                                                    self.logger.info(f"✅ ¡Mediafire resuelto al mp4 directo! -> {best_url}")
                                            except Exception as e:
                                                pass
                                        elif pref_server == "Mega":
                                            # Convertir /embed/ a /file/ para compatibilidad total
                                            best_url = remote_url.replace("/embed/", "/file/")
                                            self.logger.info(f"✅ Enlace Mega normalizado -> {best_url}")
                                        elif pref_server == "Mp4upload":
                                            try:
                                                mp4_resp = self.session.get(remote_url, headers={'Referer': 'https://jkanime.net/'}, timeout=10)
                                                if "file was deleted" in mp4_resp.text.lower() or len(mp4_resp.text.strip()) < 50:
                                                    self.logger.warning(f"⚠️ Mp4upload: archivo eliminado en origen ({remote_url}). Descartando.")
                                                    best_url = None
                                                else:
                                                    m = re.findall(r'src:\s*[\'"](https?://[^\'"]+\.mp4[^\'"]*)[\'"]', mp4_resp.text)
                                                    if not m:
                                                        m = re.findall(r'player\.src\(\s*[\'"](https?://[^\'"]+\.mp4[^\'"]*)[\'"]', mp4_resp.text)
                                                    if not m:
                                                        m = re.findall(r'https?://[a-zA-Z0-9\.\-\_\:\/]+\.mp4', mp4_resp.text)
                                                    if m:
                                                        best_url = m[0]
                                                        self.logger.info(f"✅ ¡Mp4upload resuelto al mp4 directo! -> {best_url}")
                                                    else:
                                                        best_url = remote_url
                                            except Exception:
                                                best_url = remote_url
                                        else:
                                            best_url = remote_url
                                            self.logger.info(f"✅ Enlace {pref_server} extraído -> {best_url}")
                                        
                                        if best_url:
                                            u_no_domain = re.sub(r'^https?://[^/]+', '', best_url.lower())
                                            is_direct = (
                                                pref_server in ["Mediafire", "Mega"] or
                                                any(u_no_domain.endswith(ext) for ext in ['.mp4', '.mkv', '.webm']) or
                                                (".mp4?" in u_no_domain) or
                                                (".mp4#" in u_no_domain)
                                            )
                                            custom_headers = {"Referer": "https://www.mp4upload.com/"} if pref_server == "Mp4upload" else None
                                            results.append(EpisodeResult(
                                                anime_name=anime_name,
                                                episode_number=episode_number,
                                                download_url=best_url,
                                                quality="1080p",
                                                source=f"{self.name} ({pref_server})",
                                                is_direct_link=is_direct,
                                                mirror_name=pref_server,
                                                headers=custom_headers
                                            ))
                            if results:
                                return results[0]
                        except Exception as e:
                            self.logger.error(f"Error parseando servidores: {e}")
            except Exception as e:
                self.logger.error(f"Error en GET {url}: {e}")
                
        return None

    def search_episode_candidates(self, anime_name: str, episode_number: str) -> List[EpisodeResult]:
        """
        Retorna la lista completa de todos los servidores disponibles en orden de prioridad.
        """
        self.logger.debug(f"Buscando candidatos en JKAnime: {anime_name} ep {episode_number}")
        anime_name_norm = self.normalize_text(anime_name)
        slug = anime_name_norm.lower().replace(" ", "-")
        slug = re.sub(r'[^a-z0-9\-]', '', slug)
        slug = re.sub(r'-+', '-', slug)
        try:
            ep_num = str(int(episode_number))
        except ValueError:
            ep_num = str(episode_number).lower()
        
        slugs_to_try = [slug]
        if "high-school" in slug:
            slugs_to_try.append(slug.replace("high-school", "highschool"))
        if "-oji-san" in slug or "-ojisan" in slug:
            slugs_to_try.append(slug.replace("-oji-san", "-ojisan"))
            slugs_to_try.append(slug.replace("-ojisan", "-oji-san"))
        no_suffix_hyphens = re.sub(r'-((?:san|chan|kun|sama|ojisan|sensei))\b', r'\1', slug)
        if no_suffix_hyphens not in slugs_to_try:
            slugs_to_try.append(no_suffix_hyphens)
        if slug.startswith("-"):
            slugs_to_try.append(slug[1:])
            
        all_candidates = []
        for current_slug in slugs_to_try:
            if not self.is_valid_language(current_slug):
                continue
                
            url = f"{self.base_url}/{current_slug}/{ep_num}/"
            try:
                response = self.session.get(url, timeout=15)
                if response.status_code == 200:
                    html = response.text
                    import json
                    import base64
                    
                    match = re.search(r'var servers = (\[.*?\]);', html)
                    if match:
                        servers_json = match.group(1)
                        try:
                            servers = json.loads(servers_json)
                            for pref_server in ["Mediafire", "Mega", "Mp4upload", "Streamwish", "Vidhide", "Mixdrop", "Streamtape", "Doodstream", "VOE", "Desu", "Okru"]:
                                for server in servers:
                                    if server.get("server") == pref_server:
                                        raw_b64 = server.get("remote")
                                        if not raw_b64: continue
                                        remote_url = base64.b64decode(raw_b64).decode('utf-8').strip()
                                        best_url = None
                                        
                                        if pref_server == "Mediafire":
                                            try:
                                                mf_res = self.session.get(remote_url, timeout=15)
                                                soup = BeautifulSoup(mf_res.text, "html.parser")
                                                btn = soup.find(id="downloadButton")
                                                if btn and btn.get("href"):
                                                    best_url = btn.get("href")
                                            except Exception:
                                                pass
                                        elif pref_server == "Mega":
                                            best_url = remote_url.replace("/embed/", "/file/")
                                        elif pref_server == "Mp4upload":
                                            try:
                                                mp4_resp = self.session.get(remote_url, headers={'Referer': 'https://jkanime.net/'}, timeout=10)
                                                if "file was deleted" in mp4_resp.text.lower() or len(mp4_resp.text.strip()) < 50:
                                                    self.logger.warning(f"⚠️ Mp4upload: archivo eliminado en origen ({remote_url}). Descartando.")
                                                    best_url = None
                                                else:
                                                    m = re.findall(r'src:\s*[\'"](https?://[^\'"]+\.mp4[^\'"]*)[\'"]', mp4_resp.text)
                                                    if not m:
                                                        m = re.findall(r'player\.src\(\s*[\'"](https?://[^\'"]+\.mp4[^\'"]*)[\'"]', mp4_resp.text)
                                                    if not m:
                                                        m = re.findall(r'https?://[a-zA-Z0-9\.\-\_\:\/]+\.mp4', mp4_resp.text)
                                                    if m:
                                                        best_url = m[0]
                                                    else:
                                                        best_url = remote_url
                                            except Exception:
                                                best_url = remote_url
                                        else:
                                            best_url = remote_url
                                        
                                        if best_url and not any(c.download_url == best_url for c in all_candidates):
                                            u_no_domain = re.sub(r'^https?://[^/]+', '', best_url.lower())
                                            is_direct = (
                                                pref_server in ["Mediafire", "Mega"] or
                                                any(u_no_domain.endswith(ext) for ext in ['.mp4', '.mkv', '.webm']) or
                                                (".mp4?" in u_no_domain) or
                                                (".mp4#" in u_no_domain)
                                            )
                                            custom_headers = {"Referer": "https://www.mp4upload.com/"} if pref_server == "Mp4upload" else None
                                            all_candidates.append(EpisodeResult(
                                                anime_name=anime_name,
                                                episode_number=episode_number,
                                                download_url=best_url,
                                                quality="1080p",
                                                source=f"{self.name} ({pref_server})",
                                                is_direct_link=is_direct,
                                                mirror_name=pref_server,
                                                headers=custom_headers
                                            ))
                            if all_candidates:
                                return all_candidates
                        except Exception as e:
                            self.logger.error(f"Error parseando servidores: {e}")
            except Exception as e:
                self.logger.error(f"Error en GET {url}: {e}")
                
        return all_candidates
