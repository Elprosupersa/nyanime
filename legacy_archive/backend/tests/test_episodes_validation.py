import pytest
from src.metadata.resolver import AnimeMetadataResolver
from src.metadata.models import AnimeDetailsModel, SeasonModel, EpisodeModel

def test_releasing_anime_exact_aired_episodes():
    """
    Test crítico: Un anime en emisión con próximo episodio = 9
    DEBE tener exactamente 8 episodios (1 a 8) y NUNCA 9+.
    """
    resolver = AnimeMetadataResolver()
    
    mock_releasing_media = {
        "id": 12345,
        "title": {"romaji": "Anime En Emision", "english": "Airing Anime"},
        "status": "RELEASING",
        "format": "TV",
        "episodes": 24, # Total planificado pero aún no emitido
        "nextAiringEpisode": {
            "episode": 9, # El próximo en salir es el 9
            "timeUntilAiring": 86400
        }
    }
    
    real_count = resolver.calculate_real_episodes(mock_releasing_media)
    assert real_count == 8, f"Se esperaban 8 episodios reales emitidos, pero se calculó {real_count}"
    
    # Simular la generación de episodios
    episodes = [
        EpisodeModel(
            id=f"12345_s1_e{i}",
            anime_id=12345,
            season_number=1,
            episode_number=i,
            title=f"Episodio {i}",
            is_available=True
        ) for i in range(1, real_count + 1)
    ]
    
    episode_numbers = [e.episode_number for e in episodes]
    assert episode_numbers == [1, 2, 3, 4, 5, 6, 7, 8]
    assert 9 not in episode_numbers
    assert 10 not in episode_numbers

def test_finished_anime_exact_episodes():
    """
    Test: Anime finalizado de 8 episodios.
    DEBE tener exactamente 8 episodios.
    """
    resolver = AnimeMetadataResolver()
    
    mock_finished_media = {
        "id": 54321,
        "title": {"romaji": "Anime Corto Finalizado", "english": "Short Anime"},
        "status": "FINISHED",
        "format": "TV",
        "episodes": 8,
        "nextAiringEpisode": None
    }
    
    real_count = resolver.calculate_real_episodes(mock_finished_media)
    assert real_count == 8
    
    episode_numbers = list(range(1, real_count + 1))
    assert episode_numbers == [1, 2, 3, 4, 5, 6, 7, 8]
    assert len(episode_numbers) == 8

def test_unreleased_anime_zero_episodes():
    """
    Test: Anime aún no estrenado (NOT_YET_RELEASED) no debe tener episodios.
    """
    resolver = AnimeMetadataResolver()
    
    mock_unreleased = {
        "id": 99999,
        "title": {"romaji": "Anime Futuro", "english": "Future Anime"},
        "status": "NOT_YET_RELEASED",
        "format": "TV",
        "episodes": 12,
        "nextAiringEpisode": None
    }
    
    real_count = resolver.calculate_real_episodes(mock_unreleased)
    assert real_count == 0

def test_movie_format_single_episode():
    """
    Test: Película o OVA única debe mapear a 1 episodio real.
    """
    resolver = AnimeMetadataResolver()
    
    mock_movie = {
        "id": 77777,
        "title": {"romaji": "Pelicula Anime", "english": "Anime Movie"},
        "status": "FINISHED",
        "format": "MOVIE",
        "episodes": 1,
        "nextAiringEpisode": None
    }
    
    real_count = resolver.calculate_real_episodes(mock_movie)
    assert real_count == 1
