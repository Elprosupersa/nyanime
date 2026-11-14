import pytest
import os
from pathlib import Path
from src.config import Config, SystemConfig, PathsConfig, AnalyzerConfig, OrganizerConfig
from src.organizer import OrganizerCore

@pytest.fixture
def mock_config():
    return Config(
        system=SystemConfig(log_level="INFO", workers=1),
        paths=PathsConfig(
            input="/fake/input",
            library="/fake/library",
            quarantine="/fake/quarantine"
        ),
        analyzer=AnalyzerConfig(
            ai_provider="gemini",
            api_key_env_var="DUMMY",
            confidence_threshold=0.9
        ),
        organizer=OrganizerConfig(
            folder_template="{anime_title}/Season {season:02d}",
            file_template="{anime_title} - Episodio {episode:04d}{extension}",
            allowed_extensions=[".mkv"]
        )
    )

def test_build_destination_path(mock_config):
    organizer = OrganizerCore(mock_config)
    metadata = {"anime_title": "One Piece", "season": 1, "episode": 1072}
    dest = organizer._build_destination_path(metadata, ".mkv", source_filename="One Piece - 1072.mkv")
    expected = Path("/fake/library/One Piece/Temporada 1/One Piece - Episodio 1072.mkv")
    assert dest == expected

def test_process_file_success(mock_config, fs):
    """Test standard atomic move to destination."""
    organizer = OrganizerCore(mock_config)
    source = "/fake/input/anime.mkv"
    fs.create_file(source)
    
    metadata = {"anime_title": "One Piece", "season": 1, "episode": 1072}
    organizer.process_file(source, metadata, is_confident=True)
    
    assert not os.path.exists(source)
    assert os.path.exists("/fake/library/One Piece/Temporada 1/One Piece - Episodio 1072.mkv")

def test_process_file_duplicated(mock_config, fs):
    """Test collision: dest already exists."""
    organizer = OrganizerCore(mock_config)
    source = "/fake/input/anime.mkv"
    dest = "/fake/library/One Piece/Temporada 1/One Piece - Episodio 1072.mkv"
    fs.create_file(source)
    fs.create_file(dest) # Existing destination file
    
    metadata = {"anime_title": "One Piece", "season": 1, "episode": 1072}
    organizer.process_file(source, metadata, is_confident=True)
    
    # Source shouldn't be in input
    assert not os.path.exists(source)
    # It should be moved to quarantine with _DUPLICADO
    assert os.path.exists("/fake/quarantine/anime_DUPLICADO.mkv")

def test_process_file_low_confidence(mock_config, fs):
    """Test handling of low confidence metadata."""
    organizer = OrganizerCore(mock_config)
    source = "/fake/input/weird_anime.mkv"
    fs.create_file(source)
    
    metadata = {"anime_title": "Unknown", "season": 1, "episode": 0}
    organizer.process_file(source, metadata, is_confident=False)
    
    assert not os.path.exists(source)
    assert os.path.exists("/fake/quarantine/weird_anime.mkv")
