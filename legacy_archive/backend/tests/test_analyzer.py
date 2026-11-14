import pytest
from unittest.mock import patch, MagicMock
from src.analyzer import AIAnalyzer, AnalyzerNetworkError

def test_regex_cleaner():
    analyzer = AIAnalyzer("dummy_key")
    assert analyzer.clean_filename("[SubsPlease] Boku no Hero Academia - 114 (1080p) [A3B1C].mkv") == "Boku no Hero Academia - 114"
    assert analyzer.clean_filename("[Erai-raws] One Piece 1072 [1080p].mkv") == "One Piece 1072"
    assert analyzer.clean_filename("Naruto_01_FHD.mp4") == "Naruto 01 FHD"
    assert analyzer.clean_filename("[SubsPlease] One Piece - 1072 (1080p) [F23A4A].mkv") == "One Piece - 1072"

@patch("src.analyzer.genai.GenerativeModel")
def test_analyzer_success(mock_model_class):
    mock_model_instance = MagicMock()
    mock_model_class.return_value = mock_model_instance
    
    analyzer = AIAnalyzer("dummy_key", confidence_threshold=0.9)
    
    mock_response = MagicMock()
    mock_response.text = '{"anime_title": "Otonari no Tenshi-sama", "season": 2, "episode": 5, "confidence": 0.95}'
    mock_model_instance.generate_content.return_value = mock_response
    
    result = analyzer.infer_metadata("otonari_no_tenshi_sama_2_05.mkv")
    
    assert result["anime_title"] == "Otonari no Tenshi-sama"
    assert result["season"] == 2
    assert result["episode"] == 5

@patch("src.analyzer.genai.GenerativeModel")
@patch("src.analyzer.urllib.request.urlopen")
def test_analyzer_network_error(mock_urlopen, mock_model_class):
    mock_model_instance = MagicMock()
    mock_model_class.return_value = mock_model_instance
    
    analyzer = AIAnalyzer("dummy_key")
    
    mock_model_instance.generate_content.side_effect = Exception("API offline")
    mock_urlopen.side_effect = Exception("Ollama offline")
    
    with pytest.raises(AnalyzerNetworkError):
        analyzer.analyze("fake_file.mkv")
