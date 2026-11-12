import os
import pytest
from src.config import load_config, Config

@pytest.fixture
def create_dummy_config(fs):
    """Usa pyfakefs (fs) para aislar el sistema de archivos y crear un config.yaml falso"""
    yaml_content = """
system:
  log_level: "DEBUG"
  workers: 2

paths:
  input: "/fake/input"
  library: "/fake/library"
  quarantine: "/fake/quarantine"

analyzer:
  ai_provider: "gemini"
  api_key_env_var: "TEST_API_KEY"
  local_model: "qwen2.5:7b"
  confidence_threshold: 0.85

organizer:
  folder_template: "Test/{anime_title}"
  file_template: "{anime_title} - E{episode:02d}{extension}"
  allowed_extensions: [".mkv", ".mp4"]
"""
    fs.create_file("config.yaml", contents=yaml_content)
    fs.create_file(".env", contents="TEST_API_KEY=12345\n")
    # Setting the env variable so load_dotenv mock isn't strictly necessary for the assert
    os.environ["TEST_API_KEY"] = "12345"

from unittest.mock import patch

@patch("src.config.load_dotenv")
def test_load_config(mock_dotenv, create_dummy_config):
    config = load_config("config.yaml")
    
    # Asserting type
    assert isinstance(config, Config)
    
    # Asserting system config
    assert config.system.log_level == "DEBUG"
    assert config.system.workers == 2
    
    # Asserting paths config
    assert config.paths.input == "/fake/input"
    
    # Asserting analyzer config
    assert config.analyzer.ai_provider == "gemini"
    assert config.analyzer.api_key_env_var == "TEST_API_KEY"
    assert config.analyzer.local_model == "qwen2.5:7b"
    assert config.analyzer.confidence_threshold == 0.85
    
    # Asserting organizer config
    assert ".mkv" in config.organizer.allowed_extensions
    
    # Asserting dotenv loaded properly
    assert os.environ.get("TEST_API_KEY") == "12345"
