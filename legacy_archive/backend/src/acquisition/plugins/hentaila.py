import re
import requests
from bs4 import BeautifulSoup
from .base import BaseScraper, EpisodeResult
from ..utils import clean_title_for_search

class HentaiLAScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        self.name = "HentaiLAScraper"
        self.base_url = "https://hentaila.com"
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": self.base_url
        })

    def search_episode(self, search_name: str, episode_number: int):
        try:
            # Limpiar nombre para la búsqueda de alta precisión
            clean_name = re.sub(r'The Animation|OVA|Specials?|BD|Season \d+|Temporada \d+', '', search_name, flags=re.I).strip()
            clean_name = re.sub(r'[^a-zA-Z0-9\s]', ' ', clean_name).strip()
            stopwords = {'the', 'a', 'an', 'no', 'wa', 'ha', 'wo', 'o', 'de', 'to', 'ni', 'ga', 'mo', 'na', 'and', 'part'}
            sig_words = [w.lower() for w in clean_name.split() if len(w) >= 2 and w.lower() not in stopwords]
            if not sig_words:
                return None

            queries = [" ".join(sig_words[:4])]
            if len(sig_words) >= 2:
                queries.append(f"{sig_words[0]} {sig_words[1]}")
            if len(sig_words[0]) >= 3:
                queries.append(sig_words[0])

            all_links = set()
            for q in queries:
                try:
                    search_url = f"{self.base_url}/catalogo?search={requests.utils.quote(q)}"
                    r = self.session.get(search_url, timeout=10)
                    if r.status_code == 200:
                        soup = BeautifulSoup(r.text, 'html.parser')
                        for a in soup.find_all('a', href=True):
                            href = a['href']
                            if href.startswith('/media/'):
                                all_links.add(href)
                    if len(all_links) >= 1:
                        # Si ya tenemos un match con score fuerte, no saturamos más queries
                        for link in all_links:
                            l_words = set(re.sub(r'[^a-zA-Z0-9\s]', ' ', link.replace('/media/', '').replace('-', ' ')).lower().split())
                            if len(set(sig_words) & l_words) >= min(2, len(sig_words)):
                                break
                except Exception:
                    pass

            if not all_links:
                return None

            best_link = None
            best_score = -1.0
            for link in all_links:
                slug_raw = link.replace('/media/', '').replace('-', ' ')
                l_words = set(re.sub(r'[^a-zA-Z0-9\s]', ' ', slug_raw).lower().split()) - stopwords
                overlap = len(set(sig_words) & l_words)
                if overlap == 0:
                    continue
                score = overlap / max(1, len(sig_words))
                if score > best_score:
                    best_score = score
                    best_link = link

            if not best_link or (best_score < 0.3 and len(sig_words) > 1):
                return None

            anime_slug = best_link.rstrip('/')
            ep_url = f"{self.base_url}{anime_slug}/{episode_number}"
            
            self.logger.debug(f"Accediendo a episodio HentaiLA: {ep_url}")
            r_ep = self.session.get(ep_url, timeout=10)
            if r_ep.status_code != 200:
                return None

            soup_ep = BeautifulSoup(r_ep.text, 'html.parser')
            
            preferred_hosts = ['mp4upload', 'mega', 'yourupload', 'streamwish', 'voe', 'ghbrisk', 'mixdrop']
            candidates = []
            
            # 1. Búsqueda directa en el estado SvelteKit del HTML
            for host in preferred_hosts:
                matches = re.findall(rf'(https?://[^\s\"\'<>]*(?:{host})[^\s\"\'<>]*)', r_ep.text, re.I)
                for candidate in matches:
                    clean_cand = candidate.replace('\\"', '').replace('\\u0026', '&').rstrip('\\').rstrip('"').rstrip("'")
                    if 'undef' not in clean_cand.lower() and ('/embed/' in clean_cand or '/e/' in clean_cand or '/file/' in clean_cand or '/watch/' in clean_cand or 'mp4upload.com' in clean_cand or 'mega.nz' in clean_cand):
                        if not any(c.download_url == clean_cand for c in candidates):
                            candidates.append(EpisodeResult(
                                anime_name=search_name,
                                episode_number=str(episode_number),
                                download_url=clean_cand,
                                quality="1080p",
                                source=self.name,
                                mirror_name=host,
                                is_direct_link=False
                            ))

            # 2. Fallback tradicional en iframes
            for iframe in soup_ep.find_all('iframe'):
                src = iframe.get('src', '')
                for host in preferred_hosts:
                    if host in src.lower():
                        if not any(c.download_url == src for c in candidates):
                            candidates.append(EpisodeResult(
                                anime_name=search_name,
                                episode_number=str(episode_number),
                                download_url=src,
                                quality="1080p",
                                source=self.name,
                                mirror_name=host,
                                is_direct_link=False
                            ))

            return candidates[0] if candidates else None
        except Exception as e:
            self.logger.error(f"Error en HentaiLAScraper para {search_name}: {e}")
            return None

    def search_episode_candidates(self, search_name: str, episode_number: int):
        try:
            # Limpiar nombre para la búsqueda de alta precisión
            clean_name = re.sub(r'The Animation|OVA|Specials?|BD|Season \d+|Temporada \d+', '', search_name, flags=re.I).strip()
            clean_name = re.sub(r'[^a-zA-Z0-9\s]', ' ', clean_name).strip()
            stopwords = {'the', 'a', 'an', 'no', 'wa', 'ha', 'wo', 'o', 'de', 'to', 'ni', 'ga', 'mo', 'na', 'and', 'part'}
            sig_words = [w.lower() for w in clean_name.split() if len(w) >= 2 and w.lower() not in stopwords]
            if not sig_words:
                return []

            queries = [" ".join(sig_words[:4])]
            if len(sig_words) >= 2:
                queries.append(f"{sig_words[0]} {sig_words[1]}")
            if len(sig_words[0]) >= 3:
                queries.append(sig_words[0])

            all_links = set()
            for q in queries:
                try:
                    search_url = f"{self.base_url}/catalogo?search={requests.utils.quote(q)}"
                    r = self.session.get(search_url, timeout=10)
                    if r.status_code == 200:
                        soup = BeautifulSoup(r.text, 'html.parser')
                        for a in soup.find_all('a', href=True):
                            href = a['href']
                            if href.startswith('/media/'):
                                all_links.add(href)
                    if len(all_links) >= 1:
                        for link in all_links:
                            l_words = set(re.sub(r'[^a-zA-Z0-9\s]', ' ', link.replace('/media/', '').replace('-', ' ')).lower().split())
                            if len(set(sig_words) & l_words) >= min(2, len(sig_words)):
                                break
                except Exception:
                    pass

            if not all_links:
                return []

            best_link = None
            best_score = -1.0
            for link in all_links:
                slug_raw = link.replace('/media/', '').replace('-', ' ')
                l_words = set(re.sub(r'[^a-zA-Z0-9\s]', ' ', slug_raw).lower().split()) - stopwords
                overlap = len(set(sig_words) & l_words)
                if overlap == 0:
                    continue
                score = overlap / max(1, len(sig_words))
                if score > best_score:
                    best_score = score
                    best_link = link

            if not best_link or (best_score < 0.3 and len(sig_words) > 1):
                return []

            anime_slug = best_link.rstrip('/')
            ep_url = f"{self.base_url}{anime_slug}/{episode_number}"
            
            r_ep = self.session.get(ep_url, timeout=10)
            if r_ep.status_code != 200:
                return []

            soup_ep = BeautifulSoup(r_ep.text, 'html.parser')
            
            preferred_hosts = ['mp4upload', 'mega', 'yourupload', 'streamwish', 'voe', 'ghbrisk', 'mixdrop']
            candidates = []
            
            for host in preferred_hosts:
                matches = re.findall(rf'(https?://[^\s\"\'<>]*(?:{host})[^\s\"\'<>]*)', r_ep.text, re.I)
                for candidate in matches:
                    clean_cand = candidate.replace('\\"', '').replace('\\u0026', '&').rstrip('\\').rstrip('"').rstrip("'")
                    if 'undef' not in clean_cand.lower() and ('/embed/' in clean_cand or '/e/' in clean_cand or '/file/' in clean_cand or '/watch/' in clean_cand or 'mp4upload.com' in clean_cand or 'mega.nz' in clean_cand):
                        if not any(c.download_url == clean_cand for c in candidates):
                            candidates.append(EpisodeResult(
                                anime_name=search_name,
                                episode_number=str(episode_number),
                                download_url=clean_cand,
                                quality="1080p",
                                source=self.name,
                                mirror_name=host,
                                is_direct_link=False
                            ))

            for iframe in soup_ep.find_all('iframe'):
                src = iframe.get('src', '')
                for host in preferred_hosts:
                    if host in src.lower():
                        if not any(c.download_url == src for c in candidates):
                            candidates.append(EpisodeResult(
                                anime_name=search_name,
                                episode_number=str(episode_number),
                                download_url=src,
                                quality="1080p",
                                source=self.name,
                                mirror_name=host,
                                is_direct_link=False
                            ))

            return candidates
        except Exception as e:
            self.logger.error(f"Error obteniendo candidatos en HentaiLAScraper para {search_name}: {e}")
            return []
