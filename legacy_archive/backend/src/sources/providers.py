from typing import Optional, Dict, Any
import urllib.parse
from .base import BaseVideoSource
from src.metadata.models import VideoSourceInfo, SourceHealthStatus

class MultiEmbedSource(BaseVideoSource):
    """
    Servidor 1: Multi-fuente con selector interno de streams, idiomas (Latino/Sub) y alta definición.
    """
    def __init__(self):
        super().__init__(
            source_id="multiembed",
            name="Servidor 1 (Multi / Latino / HD)",
            priority=1,
            timeout=4
        )

    def resolve_source(
        self,
        anime_id: int,
        season: int,
        episode: int,
        mapping_data: Optional[Dict[str, Any]] = None,
        is_movie: bool = False
    ) -> Optional[VideoSourceInfo]:
        mappings = mapping_data.get("mappings", {}) if mapping_data else {}
        imdb_id = mappings.get("imdb_id")
        tmdb_id = mappings.get("themoviedb_id") or mappings.get("thetvdb_id")

        if is_movie:
            if imdb_id:
                url = f"https://multiembed.mov/?video_id={imdb_id}"
            elif tmdb_id:
                url = f"https://multiembed.mov/?video_id={tmdb_id}&tmdb=1"
            else:
                return None
        else:
            if imdb_id:
                url = f"https://multiembed.mov/?video_id={imdb_id}&s={season}&e={episode}"
            elif tmdb_id:
                url = f"https://multiembed.mov/?video_id={tmdb_id}&tmdb=1&s={season}&e={episode}"
            else:
                return None

        return VideoSourceInfo(
            source_id=self.source_id,
            name=self.name,
            priority=self.priority,
            embed_url=url,
            is_direct=False,
            language="Multi-Audio (Latino / Sub / Castellano)",
            status=SourceHealthStatus.AVAILABLE
        )


class VidSrcSource(BaseVideoSource):
    """
    Servidor 2: VidSrc - Streaming de carga rápida y alta estabilidad.
    """
    def __init__(self):
        super().__init__(
            source_id="vidsrc",
            name="Servidor 2 (VidSrc Rápido)",
            priority=2,
            timeout=4
        )

    def resolve_source(
        self,
        anime_id: int,
        season: int,
        episode: int,
        mapping_data: Optional[Dict[str, Any]] = None,
        is_movie: bool = False
    ) -> Optional[VideoSourceInfo]:
        mappings = mapping_data.get("mappings", {}) if mapping_data else {}
        imdb_id = mappings.get("imdb_id")
        tmdb_id = mappings.get("themoviedb_id")

        if is_movie:
            if imdb_id:
                url = f"https://vidsrcme.ru/embed/movie?imdb={imdb_id}"
            elif tmdb_id:
                url = f"https://vidsrcme.ru/embed/movie?tmdb={tmdb_id}"
            else:
                return None
        else:
            if imdb_id:
                url = f"https://vidsrcme.ru/embed/tv?imdb={imdb_id}&season={season}&episode={episode}"
            elif tmdb_id:
                url = f"https://vidsrcme.ru/embed/tv?tmdb={tmdb_id}&season={season}&episode={episode}"
            else:
                return None

        return VideoSourceInfo(
            source_id=self.source_id,
            name=self.name,
            priority=self.priority,
            embed_url=url,
            is_direct=False,
            language="Original / Subtitulado",
            status=SourceHealthStatus.AVAILABLE
        )


class TwoEmbedSource(BaseVideoSource):
    """
    Servidor 3: 2Embed - Respaldo global con alta tasa de disponibilidad.
    """
    def __init__(self):
        super().__init__(
            source_id="2embed",
            name="Servidor 3 (2Embed Respaldo)",
            priority=3,
            timeout=4
        )

    def resolve_source(
        self,
        anime_id: int,
        season: int,
        episode: int,
        mapping_data: Optional[Dict[str, Any]] = None,
        is_movie: bool = False
    ) -> Optional[VideoSourceInfo]:
        mappings = mapping_data.get("mappings", {}) if mapping_data else {}
        target_id = mappings.get("imdb_id") or mappings.get("themoviedb_id")
        if not target_id:
            return None

        if is_movie:
            url = f"https://www.2embed.cc/embed/{target_id}"
        else:
            url = f"https://www.2embed.cc/embedtv/{target_id}&s={season}&e={episode}"

        return VideoSourceInfo(
            source_id=self.source_id,
            name=self.name,
            priority=self.priority,
            embed_url=url,
            is_direct=False,
            language="Subtitulado / HD",
            status=SourceHealthStatus.AVAILABLE
        )
