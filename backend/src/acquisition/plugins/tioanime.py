import re
import json
import logging
from typing import Optional, List
from curl_cffi import requests
from bs4 import BeautifulSoup
from .base import BaseScraper, EpisodeResult
import unicodedata

class TioAnimeScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        self.session = requests.Session(impersonate="chrome120", timeout=12)
        self.base_url = "https://tioanime.com"

    @staticmethod
    def normalize_text(text: str) -> str:
        text = text.replace('é', 'e').replace('É', 'E')
        text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
        return text

    def _slugify(self, text: str) -> str:
        norm = self.normalize_text(text).lower()
        slug = re.sub(r'[^a-z0-9]+', '-', norm).strip('-')
        return slug

    def _search_anime_slugs(self, anime_name: str) -> List[str]:
        slugs = []
        # Direct slug candidates
        base_slug = self._slugify(anime_name)
        slugs.append(base_slug)

        # Common romanization and naming adjustments
        if "solo-leveling" in base_slug:
            slugs.append("ore-dake-level-up-na-ken")
            slugs.append("ore-dake-level-up-na-ken-season-2-arise-from-the-shadow")
        if "kaiju-no-8" in base_slug or "kaiju-8" in base_slug:
            slugs.append("kaijuu-8gou")
        if "kimetsu-no-yaiba" in base_slug:
            if "yuukaku" in base_slug:
                slugs.append("kimetsu-no-yaiba-yuukakuhen")
            elif "hashira" in base_slug:
                slugs.append("kimetsu-no-yaiba-hashira-geikohen")
            elif "mugen" in base_slug:
                slugs.append("kimetsu-no-yaiba-mugen-ressha-hen")
        if "mushoku-tensei" in base_slug:
            slugs.append("mushoku-tensei-isekai-ittara-honki-dasu")
            slugs.append("mushoku-tensei-ii-isekai-ittara-honki-dasu")
            slugs.append("mushoku-tensei-ii-isekai-ittara-honki-dasu-part-2")
        if "dr-stone" in base_slug:
            if "stone-wars" in base_slug or "season-2" in base_slug or "2nd" in base_slug:
                slugs.append("dr-stone-stone-wars")
            elif "new-world" in base_slug:
                slugs.append("dr-stone-new-world")

        # Try directory search
        try:
            search_query = "+".join(anime_name.split()[:4])
            search_url = f"{self.base_url}/directorio?q={search_query}"
            resp = self.session.get(search_url, timeout=8)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                for a in soup.select('article.anime a'):
                    href = a.get('href', '')
                    if href.startswith('/anime/'):
                        s = href.replace('/anime/', '').strip('/')
                        if s not in slugs:
                            slugs.append(s)
        except Exception as e:
            self.logger.debug(f"Error buscando en directorio de TioAnime: {e}")

        return slugs

    def search_episode_candidates(self, anime_name: str, episode_number: str) -> List[EpisodeResult]:
        candidates: List[EpisodeResult] = []
        try:
            ep_num = str(int(episode_number))
        except ValueError:
            ep_num = str(episode_number).lower()

        slugs = self._search_anime_slugs(anime_name)
        seen_urls = set()

        for slug in slugs:
            if not self.is_valid_language(slug):
                continue

            ep_url = f"{self.base_url}/ver/{slug}-{ep_num}"
            try:
                resp = self.session.get(ep_url, timeout=10)
                if resp.status_code != 200:
                    continue

                html = resp.text
                soup = BeautifulSoup(html, 'html.parser')

                # 1. Download Table (Mediafire, Mega, etc.)
                for tr in soup.select('table tr'):
                    tds = tr.find_all('td')
                    if len(tds) >= 3:
                        server_type = tds[0].text.strip() if len(tds) > 0 else ""
                        a_tag = tds[2].find('a')
                        if a_tag and a_tag.get('href'):
                            raw_url = a_tag.get('href')
                            # Mediafire resolution
                            if 'mediafire.com' in raw_url:
                                try:
                                    mf_res = self.session.get(raw_url, timeout=8)
                                    if mf_res.status_code == 200:
                                        mf_soup = BeautifulSoup(mf_res.text, 'html.parser')
                                        btn = mf_soup.find(id='downloadButton')
                                        if btn and btn.get('href'):
                                            direct_url = btn.get('href')
                                            if direct_url not in seen_urls:
                                                seen_urls.add(direct_url)
                                                candidates.append(EpisodeResult(
                                                    anime_name=anime_name,
                                                    episode_number=episode_number,
                                                    download_url=direct_url,
                                                    quality="1080p",
                                                    source="TioAnime (Mediafire)",
                                                    is_direct_link=True
                                                ))
                                except Exception:
                                    pass
                            elif 'mega.nz' in raw_url:
                                norm_mega = raw_url.replace('/embed/', '/file/').replace('/#!', '/file/').replace('!', '#')
                                if norm_mega not in seen_urls:
                                    seen_urls.add(norm_mega)
                                    candidates.append(EpisodeResult(
                                        anime_name=anime_name,
                                        episode_number=episode_number,
                                        download_url=norm_mega,
                                        quality="1080p",
                                        source="TioAnime (Mega)",
                                        is_direct_link=True
                                    ))

                # 2. JavaScript Embedded Videos
                m = re.search(r'var videos = (\[.*?\]);', html)
                if m:
                    try:
                        videos = json.loads(m.group(1))
                        for v in videos:
                            if not isinstance(v, list) or len(v) < 2:
                                continue
                            srv_name, embed_url = v[0], v[1]
                            if not embed_url:
                                continue

                            if srv_name.lower() == 'mega' or 'mega.nz' in embed_url:
                                norm_mega = embed_url.replace('/embed/', '/file/').replace('/#!', '/file/').replace('!', '#')
                                if norm_mega not in seen_urls:
                                    seen_urls.add(norm_mega)
                                    candidates.append(EpisodeResult(
                                        anime_name=anime_name,
                                        episode_number=episode_number,
                                        download_url=norm_mega,
                                        quality="1080p",
                                        source=f"TioAnime ({srv_name})",
                                        is_direct_link=True
                                    ))
                            elif srv_name.lower() == 'yourupload' or 'yourupload.com' in embed_url:
                                try:
                                    yu_res = self.session.get(embed_url, headers={'Referer': self.base_url}, timeout=8)
                                    if yu_res.status_code == 200:
                                        yu_soup = BeautifulSoup(yu_res.text, 'html.parser')
                                        og = yu_soup.find('meta', property='og:video')
                                        if og and og.get('content'):
                                            mp4 = og.get('content')
                                            if mp4 not in seen_urls:
                                                seen_urls.add(mp4)
                                                candidates.append(EpisodeResult(
                                                    anime_name=anime_name,
                                                    episode_number=episode_number,
                                                    download_url=mp4,
                                                    quality="720p",
                                                    source=f"TioAnime (YourUpload)",
                                                    is_direct_link=True,
                                                    mirror_name="YourUpload",
                                                    headers={"Referer": "https://www.yourupload.com/"}
                                                ))
                                except Exception:
                                    pass
                            elif any(k in srv_name.lower() for k in ['streamsb', 'mp4upload', 'vidguard', 'mixdrop', 'okru', 'voe']):
                                if embed_url not in seen_urls:
                                    seen_urls.add(embed_url)
                                    candidates.append(EpisodeResult(
                                        anime_name=anime_name,
                                        episode_number=episode_number,
                                        download_url=embed_url,
                                        quality="720p",
                                        source=f"TioAnime ({srv_name})",
                                        is_direct_link=False
                                    ))
                    except Exception as e:
                        self.logger.debug(f"Error parseando videos de TioAnime: {e}")

                if candidates:
                    return candidates

            except Exception as e:
                self.logger.debug(f"Error en GET {ep_url}: {e}")

        return candidates

    def search_episode(self, anime_name: str, episode_number: str) -> Optional[EpisodeResult]:
        candidates = self.search_episode_candidates(anime_name, episode_number)
        return candidates[0] if candidates else None
