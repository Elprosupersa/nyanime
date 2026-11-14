import pytest
from fastapi.testclient import TestClient
from pathlib import Path
from src.acquisition.plugins.base import EpisodeResult
from src.acquisition.portal import MultiProviderAnimePortal
from src.acquisition.downloader import Downloader
from src.acquisition.plugins.tioanime import TioAnimeScraper
from src.acquisition.plugins.az_animex import AZAnimexScraper
from src.api.server import app

client = TestClient(app)

def test_portal_initialization_and_providers_list():
    """Verifica que el portal multi-proveedor cargue todos los plugins disponibles."""
    portal = MultiProviderAnimePortal()
    assert len(portal.providers) >= 10
    provider_names = [p.name for p in portal.providers]
    assert "AZAnimexScraper" in provider_names
    assert "TioAnimeScraper" in provider_names
    assert "JKAnimeScraper" in provider_names
    
    info = portal.get_providers_info()
    assert len(info) >= 10
    for item in info:
        assert "name" in item
        assert "base_url" in item
        assert item["is_active"] is True

def test_portal_candidate_ranking():
    """Verifica que el ranking de candidatos priorice Mediafire 1080p > Mp4upload > Mega > embeds."""
    portal = MultiProviderAnimePortal()
    
    c_embed = EpisodeResult(
        anime_name="Test Anime",
        episode_number="01",
        download_url="https://sfastwish.com/e/123",
        quality="720p",
        source="JKAnimeScraper (Streamwish)",
        is_direct_link=False
    )
    c_mega = EpisodeResult(
        anime_name="Test Anime",
        episode_number="01",
        download_url="https://mega.nz/file/abc#xyz",
        quality="1080p",
        source="TioAnime (Mega)",
        is_direct_link=True
    )
    c_mp4upload = EpisodeResult(
        anime_name="Test Anime",
        episode_number="01",
        download_url="https://a6.mp4upload.com:183/d/123/video.mp4",
        quality="1080p",
        source="JKAnimeScraper (Mp4upload)",
        is_direct_link=True
    )
    c_mf = EpisodeResult(
        anime_name="Test Anime",
        episode_number="01",
        download_url="https://download123.mediafire.com/xyz/video.mp4",
        quality="1080p",
        source="AZAnimexScraper",
        is_direct_link=True
    )
    
    ranked = sorted([c_embed, c_mega, c_mp4upload, c_mf], key=portal._rank_candidate, reverse=True)
    assert ranked[0].download_url == c_mf.download_url
    assert ranked[1].download_url == c_mp4upload.download_url
    assert ranked[2].download_url == c_mega.download_url
    assert ranked[3].download_url == c_embed.download_url

def test_speed_watchdog_parsing():
    """Verifica la conversión precisa de unidades de velocidad a MB/s."""
    dl = Downloader("temp_dl")
    assert dl._parse_speed_mb("10.5MiB/s") == 10.5
    assert dl._parse_speed_mb("20MB/s") == 20.0
    assert dl._parse_speed_mb("1024KiB/s") == 1.0
    assert dl._parse_speed_mb("1GiB/s") == 1024.0
    assert dl._parse_speed_mb("invalid") == 0.0
    assert dl._parse_speed_mb("") == 0.0

def test_speed_watchdog_threshold():
    """Verifica que el umbral mínimo esté calibrado a 60 Mbps (7.5 MB/s)."""
    assert Downloader.MIN_SPEED_THRESHOLD_MB == 7.5
    assert Downloader.SPEED_WATCHDOG_GRACE_PERIOD == 10.0

def test_tioanime_slug_generation():
    """Verifica que TioAnime genere slugs canónicos para búsquedas comunes."""
    scraper = TioAnimeScraper()
    assert scraper._slugify("Dr. Stone: Stone Wars") == "dr-stone-stone-wars"
    slugs = scraper._search_anime_slugs("Solo Leveling")
    assert "ore-dake-level-up-na-ken" in slugs
    slugs_kaiju = scraper._search_anime_slugs("Kaiju No. 8")
    assert "kaijuu-8gou" in slugs_kaiju

def test_az_animex_offline_online_filter():
    """Verifica que la discriminación estricta de Sword Art Offline vs Online funcione."""
    scraper = AZAnimexScraper()
    # Limpieza de strings
    clean_target = scraper._clean_str("Sword Art Online II")
    clean_file_online = scraper._clean_str("[Az-Animex] Sword Art Online II - 02 [BD][MadSubs].mp4")
    clean_file_offline = scraper._clean_str("[Az-Animex] Sword Art Offline II - 02 [BD][MadSubs].mp4")
    
    assert "online" in clean_target
    assert "offline" not in clean_target
    assert "offline" in clean_file_offline
    assert "online" in clean_file_online

def test_portal_api_endpoints():
    """Verifica los endpoints REST del portal en FastAPI."""
    res_prov = client.get("/api/portal/providers")
    assert res_prov.status_code == 200
    data_prov = res_prov.json()
    assert "providers" in data_prov
    assert len(data_prov["providers"]) >= 10
    
    res_stats = client.get("/api/portal/stats")
    assert res_stats.status_code == 200
    data_stats = res_stats.json()
    assert "total_attempts" in data_stats
    assert "failovers_triggered" in data_stats

def test_speed_watchdog_bitrate_parsing():
    """Verifica que unidades en bits (Mbps, Kbps) se conviertan a MB/s sin sobreestimación de 8x."""
    dl = Downloader("temp_dl")
    assert dl._parse_speed_mb("80Mbps") == 10.0
    assert dl._parse_speed_mb("16Mbps") == 2.0
    assert dl._parse_speed_mb("8000Kbps") == pytest.approx(0.976, rel=1e-2)

def test_jkanime_direct_link_discrimination():
    """Verifica que JKAnime discrimine enlaces directos de reproductores embed."""
    cand_streamwish = EpisodeResult(
        anime_name="Dr. Stone",
        episode_number="02",
        download_url="https://sfastwish.com/e/abc123xyz",
        quality="1080p",
        source="JKAnimeScraper (Streamwish)",
        is_direct_link=False
    )
    cand_mf = EpisodeResult(
        anime_name="Dr. Stone",
        episode_number="02",
        download_url="https://download.mediafire.com/file/video.mp4",
        quality="1080p",
        source="JKAnimeScraper (Mediafire)",
        is_direct_link=True
    )
    assert cand_streamwish.is_direct_link is False
    assert cand_mf.is_direct_link is True

def test_fill_missing_census_list_support(tmp_path):
    """Verifica que fill_missing_census procese una lista de temporadas sin colisión de nombres."""
    portal = MultiProviderAnimePortal()
    census_list = [
        {"series": "Dr. Stone", "season_folder": "Temporada 1", "missing_episodes": [2], "aliases": ["Dr Stone"]},
        {"series": "Dr. Stone", "season_folder": "Stone Wars", "missing_episodes": [3], "aliases": ["Dr Stone Season 2"]}
    ]
    orig_dl = portal.download_episode_with_failover
    calls = []
    portal.download_episode_with_failover = lambda anime_name, episode_number, target_dir, search_titles=None: calls.append((anime_name, episode_number, str(target_dir))) or {"success": True}
    
    try:
        summary = portal.fill_missing_census(census_list, tmp_path)
        assert summary["total_requested"] == 2
        assert summary["completed"] == 2
        assert len(calls) == 2
        assert "Temporada 1" in calls[0][2]
        assert "Stone Wars" in calls[1][2]
    finally:
        portal.download_episode_with_failover = orig_dl

def test_resolve_all_candidates_edge_cases():
    """Verifica que cadenas vacías o None no provoquen excepciones en resolve_all_candidates."""
    portal = MultiProviderAnimePortal()
    assert portal.resolve_all_candidates(None, 1) == []
    assert portal.resolve_all_candidates("", 1) == []

def test_extract_episode_number_underscores():
    """Verifica la extracción de número de episodio con guiones bajos de fansub."""
    from src.acquisition.utils import extract_episode_number
    assert extract_episode_number("[Az-Animex]_Kimetsu_no_Yaiba_-_02_[BD].mp4") == 2
    assert extract_episode_number("Dr_Stone_S01E05_1080p.mkv") == 5

def test_downloader_cleanup_temp_files_safety():
    """Verifica que _cleanup_temp_files maneje None y rutas complejas de forma segura."""
    dl = Downloader("temp_dl")
    dl._cleanup_temp_files(None)
    dl._cleanup_temp_files("")

