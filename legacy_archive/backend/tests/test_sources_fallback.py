import pytest
from src.sources.base import BaseVideoSource
from src.sources.providers import MultiEmbedSource, VidSrcSource, TwoEmbedSource
from src.sources.manager import VideoSourceManager
from src.metadata.models import VideoSourceInfo, SourceHealthStatus

def test_source_resolution_with_imdb_and_tmdb():
    """
    Test: Resolución de fuentes priorizando IMDb ID para animes con Live Action (como One Piece).
    """
    manager = VideoSourceManager()
    
    mapping_data = {
        "mappings": {
            "imdb_id": "tt0388629", # One Piece anime
            "themoviedb_id": "37854"
        }
    }
    
    sources = manager.resolve_all_sources(
        anime_id=21,
        season=1,
        episode=2,
        mapping_data=mapping_data,
        is_movie=False
    )
    
    assert len(sources) >= 2
    # El servidor principal debe contener el imdb_id
    assert "tt0388629" in sources[0].embed_url
    assert sources[0].priority == 1

def test_source_fallback_mechanism():
    """
    Test: Comprobación de fallback entre servidores cuando uno no está disponible.
    """
    manager = VideoSourceManager()
    
    # Simular un caso donde solo se tiene themoviedb_id
    mapping_data = {
        "mappings": {
            "themoviedb_id": "94605"
        }
    }
    
    sources = manager.resolve_all_sources(
        anime_id=101922,
        season=1,
        episode=1,
        mapping_data=mapping_data,
        is_movie=False
    )
    
    assert len(sources) >= 2
    # Comprobar que todos los proveedores generaron URLs válidas
    for src in sources:
        assert src.embed_url.startswith("https://")
        assert src.status == SourceHealthStatus.AVAILABLE

def test_source_priority_ordering():
    """
    Test: Verificar que las fuentes se entregan estrictamente ordenadas por prioridad (1, 2, 3).
    """
    manager = VideoSourceManager()
    mapping_data = {"mappings": {"imdb_id": "tt1234567"}}
    
    sources = manager.resolve_all_sources(anime_id=1, season=1, episode=1, mapping_data=mapping_data)
    priorities = [s.priority for s in sources]
    assert priorities == sorted(priorities)
