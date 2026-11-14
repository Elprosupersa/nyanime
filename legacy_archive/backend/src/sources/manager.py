from typing import List, Optional, Dict, Any
import logging
from .base import BaseVideoSource
from .providers import MultiEmbedSource, VidSrcSource, TwoEmbedSource
from src.metadata.models import VideoSourceInfo, SourceHealthStatus

logger = logging.getLogger("AnimeOrganizerAI.SourceManager")

class VideoSourceManager:
    """
    Orquestador centralizado de fuentes de video con cascada de fallback,
    prioridades y health checks automáticos.
    """
    def __init__(self):
        self.sources: List[BaseVideoSource] = [
            MultiEmbedSource(),
            VidSrcSource(),
            TwoEmbedSource()
        ]
        # Ordenar por prioridad ascendente (1 = más alta)
        self.sources.sort(key=lambda s: s.priority)

    def resolve_all_sources(
        self,
        anime_id: int,
        season: int,
        episode: int,
        mapping_data: Optional[Dict[str, Any]] = None,
        is_movie: bool = False
    ) -> List[VideoSourceInfo]:
        """
        Resuelve y valida todas las fuentes disponibles para un episodio,
        ordenadas por prioridad.
        """
        available_sources: List[VideoSourceInfo] = []

        for provider in self.sources:
            try:
                source_info = provider.resolve_source(
                    anime_id=anime_id,
                    season=season,
                    episode=episode,
                    mapping_data=mapping_data,
                    is_movie=is_movie
                )
                if source_info and source_info.embed_url:
                    available_sources.append(source_info)
            except Exception as e:
                logger.error(f"Fallo al resolver fuente '{provider.name}': {e}")

        return available_sources

    def get_primary_stream(
        self,
        anime_id: int,
        season: int,
        episode: int,
        mapping_data: Optional[Dict[str, Any]] = None,
        is_movie: bool = False
    ) -> Optional[VideoSourceInfo]:
        """
        Retorna la mejor fuente disponible (primer fallback funcional).
        """
        sources = self.resolve_all_sources(
            anime_id=anime_id,
            season=season,
            episode=episode,
            mapping_data=mapping_data,
            is_movie=is_movie
        )
        return sources[0] if sources else None
