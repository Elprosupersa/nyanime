import os
import re
import logging
import xml.etree.ElementTree as ET
from xml.dom import minidom
from pathlib import Path
from typing import Optional, Dict, Any, List
import requests

logger = logging.getLogger("MediaManager")

class MediaManager:
    """
    Genera metadatos (.nfo) y descarga carátulas (poster.jpg, fanart.jpg)
    compatibles con Smart TVs, Plex, Jellyfin y Kodi.
    """
    ANILIST_API_URL = "https://graphql.anilist.co"

    def __init__(self, headers: Optional[Dict[str, str]] = None):
        self.headers = headers or {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    def fetch_anime_metadata(self, anime_name: str) -> Optional[Dict[str, Any]]:
        """Consulta AniList GraphQL para obtener póster, banner, sinopsis y detalles técnicos."""
        query = """
        query ($search: String) {
          Media (search: $search, type: ANIME) {
            id
            title {
              romaji
              english
              native
            }
            description(asHtml: false)
            coverImage {
              extraLarge
              large
            }
            bannerImage
            startDate {
              year
              month
              day
            }
            genres
            averageScore
            episodes
            studios(isMain: true) {
              nodes {
                name
              }
            }
          }
        }
        """
        clean_name = re.sub(r'\(.*?\)', '', anime_name).strip()
        try:
            response = requests.post(
                self.ANILIST_API_URL,
                json={"query": query, "variables": {"search": clean_name}},
                headers=self.headers,
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("data", {}).get("Media")
            else:
                logger.warning(f"AniList respondió con código {response.status_code} para '{clean_name}'")
        except Exception as e:
            logger.error(f"Error consultando metadatos para '{clean_name}': {e}")
        return None

    def _download_image(self, url: str, target_path: Path) -> bool:
        """Descarga una imagen desde una URL si el archivo de destino no existe."""
        if not url:
            return False
        if target_path.exists() and target_path.stat().st_size > 5000:
            return True
        try:
            r = requests.get(url, headers=self.headers, timeout=15)
            if r.status_code == 200 and len(r.content) > 1000:
                with open(target_path, "wb") as f:
                    f.write(r.content)
                logger.info(f"🖼️ Imagen guardada: {target_path.name}")
                return True
        except Exception as e:
            logger.error(f"Error descargando imagen {url}: {e}")
        return False

    def generate_tvshow_nfo(self, anime_dir: Path, metadata: Dict[str, Any]) -> Path:
        """Genera un archivo tvshow.nfo estándar para Kodi, Plex y Smart TVs."""
        root = ET.Element("tvshow")
        
        # Título
        title_elem = ET.SubElement(root, "title")
        title_elem.text = metadata.get("title", {}).get("romaji") or metadata.get("title", {}).get("english") or anime_dir.name
        
        # Título original en japonés
        if metadata.get("title", {}).get("native"):
            orig_title = ET.SubElement(root, "originaltitle")
            orig_title.text = metadata["title"]["native"]
            
        # Sinopsis / Argumento
        if metadata.get("description"):
            clean_desc = re.sub(r'<[^>]+>', '', metadata["description"])
            clean_desc = clean_desc.replace('&quot;', '"').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
            plot_elem = ET.SubElement(root, "plot")
            plot_elem.text = clean_desc.strip()
            
        # Puntuación / Calificación
        if metadata.get("averageScore"):
            rating_elem = ET.SubElement(root, "rating")
            rating_elem.text = f"{metadata['averageScore'] / 10.0:.1f}"
            
        # Año y Fecha de estreno
        start_date = metadata.get("startDate", {})
        if start_date.get("year"):
            year_elem = ET.SubElement(root, "year")
            year_elem.text = str(start_date["year"])
            
            if start_date.get("month") and start_date.get("day"):
                prem_elem = ET.SubElement(root, "premiered")
                prem_elem.text = f"{start_date['year']:04d}-{start_date['month']:02d}-{start_date['day']:02d}"

        # Estudio
        studios = metadata.get("studios", {}).get("nodes", [])
        if studios:
            studio_elem = ET.SubElement(root, "studio")
            studio_elem.text = studios[0].get("name", "")

        # Géneros
        for genre in metadata.get("genres", []):
            g_elem = ET.SubElement(root, "genre")
            g_elem.text = genre

        # Formatear XML bonito con indentación
        xml_str = minidom.parseString(ET.tostring(root, encoding="utf-8")).toprettyxml(indent="  ", encoding="utf-8")
        
        nfo_path = anime_dir / "tvshow.nfo"
        with open(nfo_path, "wb") as f:
            f.write(xml_str)
            
        logger.info(f"📄 Metadatos guardados: {nfo_path.name}")
        return nfo_path

    def enrich_anime_directory(self, anime_dir: Path, anime_name: Optional[str] = None) -> bool:
        """
        Enriquece completamente la carpeta de una serie con póster, banner,
        carátulas de temporadas y archivo tvshow.nfo.
        """
        if not anime_dir.exists():
            return False

        search_name = anime_name or anime_dir.name
        metadata = self.fetch_anime_metadata(search_name)
        if not metadata:
            return False

        # 1. Descargar póster principal (poster.jpg / folder.jpg)
        cover_url = metadata.get("coverImage", {}).get("extraLarge") or metadata.get("coverImage", {}).get("large")
        if cover_url:
            self._download_image(cover_url, anime_dir / "poster.jpg")
            self._download_image(cover_url, anime_dir / "folder.jpg")

        # 2. Descargar banner / fondo (fanart.jpg / backdrop.jpg)
        banner_url = metadata.get("bannerImage")
        if banner_url:
            self._download_image(banner_url, anime_dir / "fanart.jpg")
            self._download_image(banner_url, anime_dir / "backdrop.jpg")

        # 3. Generar tvshow.nfo
        self.generate_tvshow_nfo(anime_dir, metadata)

        # 4. Asignar póster a carpetas de temporada si existen
        for season_dir in anime_dir.iterdir():
            if season_dir.is_dir() and not season_dir.name.startswith('.'):
                s_lower = season_dir.name.lower()
                m = re.search(r'temporada\s*(\d+)', s_lower)
                if m:
                    s_num = int(m.group(1))
                    s_poster = anime_dir / f"season{s_num:02d}-poster.jpg"
                    if cover_url and not s_poster.exists():
                        self._download_image(cover_url, s_poster)
                    if cover_url and not (season_dir / "poster.jpg").exists():
                        self._download_image(cover_url, season_dir / "poster.jpg")

        return True
