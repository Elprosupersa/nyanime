"""
Test suite for MangaDexClient, TokenBucketRateLimiter, and SecondaryProvider (Milestone 2).
Covers:
- TokenBucket rate limiting (4.0 RPS maximum for api.mangadex.org)
- User-Agent headers (MangaAutonomousPipeline/1.0)
- Adult content discovery (safe, suggestive, erotica, pornographic)
- Dual Spanish language feed filtering ('es-la' and 'es')
- Filtering of external chapters (externalUrl is None and pages > 0)
- Exponential backoff with jitter on 429 and 5xx responses
- Streaming GET cover downloads
- Multi-fallback page downloading (@Home -> uploads CDN -> data-saver)
- SecondaryProvider fallback interface for DMCA / unindexed titles (F6)
- Decoupling of page downloads from metadata rate limiting
"""

import time
import threading
from pathlib import Path
from typing import Dict, Any, List, Optional
from unittest.mock import MagicMock, patch

import pytest
import requests

from src.acquisition.mangadex_client import (
    TokenBucketRateLimiter,
    SecondaryProvider,
    MangaDexClient,
    MANGADEX_API,
    MANGADEX_UPLOADS,
    DEFAULT_USER_AGENT,
    DEFAULT_MAX_RPS,
    DEFAULT_CONTENT_RATINGS,
    DEFAULT_LANGUAGES,
)


# ==============================================================================
# 1. TokenBucket Rate Limiter Tests
# ==============================================================================

class TestTokenBucketRateLimiter:
    """Tests for the TokenBucketRateLimiter enforcing 4.0 RPS maximum for api.mangadex.org."""

    def test_rate_limiter_initialization(self):
        limiter = TokenBucketRateLimiter(rate=4.0, capacity=4.0)
        assert limiter.rate == 4.0
        assert limiter.capacity == 4.0
        assert limiter.available_tokens <= 4.0

    def test_rate_limiter_invalid_parameters_raise_error(self):
        with pytest.raises(ValueError, match="Rate must be greater than 0"):
            TokenBucketRateLimiter(rate=0)
        with pytest.raises(ValueError, match="Capacity must be greater than 0"):
            TokenBucketRateLimiter(rate=4.0, capacity=-1.0)

    def test_rate_limiter_burst_consumption(self):
        limiter = TokenBucketRateLimiter(rate=4.0, capacity=4.0)
        # Immediate burst of up to 4 tokens must succeed without waiting
        t0 = time.monotonic()
        for _ in range(4):
            assert limiter.acquire(1.0) is True
        elapsed = time.monotonic() - t0
        assert elapsed < 0.15  # Negligible delay for capacity burst

    def test_rate_limiter_throttles_excess_requests(self):
        # 4 RPS means 0.25s per token
        limiter = TokenBucketRateLimiter(rate=4.0, capacity=1.0)
        assert limiter.acquire(1.0) is True

        t0 = time.monotonic()
        # Consuming the second token must wait ~0.25s
        assert limiter.acquire(1.0) is True
        elapsed = time.monotonic() - t0
        assert elapsed >= 0.20

    def test_rate_limiter_timeout_exceeded(self):
        limiter = TokenBucketRateLimiter(rate=2.0, capacity=1.0)
        assert limiter.acquire(1.0) is True
        # Requesting another token with 0.01s timeout must fail (needs 0.5s)
        assert limiter.acquire(1.0, timeout=0.01) is False

    def test_rate_limiter_refill_caps_at_capacity(self):
        limiter = TokenBucketRateLimiter(rate=4.0, capacity=4.0)
        time.sleep(0.05)
        assert limiter.available_tokens <= 4.0

    def test_rate_limiter_thread_safety(self):
        limiter = TokenBucketRateLimiter(rate=20.0, capacity=10.0)
        acquired_count = 0
        lock = threading.Lock()

        def worker():
            nonlocal acquired_count
            for _ in range(5):
                if limiter.acquire(1.0, timeout=1.0):
                    with lock:
                        acquired_count += 1

        threads = [threading.Thread(target=worker) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert acquired_count == 20


# ==============================================================================
# 2. MangaDexClient Headers and Configuration Tests
# ==============================================================================

class TestMangaDexClientHeadersAndConfig:
    """Tests for MangaDexClient User-Agent and connection configuration."""

    def test_default_user_agent_header(self):
        client = MangaDexClient()
        assert client.session.headers.get("User-Agent") == "MangaAutonomousPipeline/1.0"
        assert client.user_agent == "MangaAutonomousPipeline/1.0"

    def test_custom_user_agent_header(self):
        custom_ua = "CustomMangaBot/2.5 (contact: test@example.com)"
        client = MangaDexClient(user_agent=custom_ua)
        assert client.session.headers.get("User-Agent") == custom_ua
        assert client.user_agent == custom_ua

    def test_session_connection_pool_configuration(self):
        client = MangaDexClient()
        adapter = client.session.get_adapter("https://api.mangadex.org")
        assert adapter._pool_connections == 64
        assert adapter._pool_maxsize == 64


# ==============================================================================
# 3. Adult Content Discovery & Search Tests
# ==============================================================================

class TestAdultContentDiscovery:
    """Tests ensuring explicit adult discovery (safe, suggestive, erotica, pornographic)."""

    def test_search_manga_includes_all_content_ratings(self):
        client = MangaDexClient()
        with patch.object(client.session, "get") as mock_get:
            mock_res = MagicMock()
            mock_res.json.return_value = {
                "data": [
                    {
                        "id": "adult-uuid-1",
                        "attributes": {"title": {"en": "Secret Class"}},
                        "relationships": []
                    }
                ]
            }
            mock_res.raise_for_status.return_value = None
            mock_get.return_value = mock_res

            res = client.search_manga("Secret Class")
            assert res is not None
            assert res["id"] == "adult-uuid-1"

            # Verify content ratings passed in query parameters
            mock_get.assert_called_once()
            _, kwargs = mock_get.call_args
            params = kwargs.get("params", [])
            param_dict = dict(params) if isinstance(params, dict) else dict(params)
            # Find all contentRating[] params
            cr_values = [v for k, v in params if k == "contentRating[]"]
            assert set(cr_values) == {"safe", "suggestive", "erotica", "pornographic"}

    def test_search_manga_includes_relationships(self):
        client = MangaDexClient()
        with patch.object(client.session, "get") as mock_get:
            mock_res = MagicMock()
            mock_res.json.return_value = {"data": [{"id": "m1", "attributes": {"title": {"en": "Title"}}}]}
            mock_res.raise_for_status.return_value = None
            mock_get.return_value = mock_res

            client.search_manga("Dandadan")
            _, kwargs = mock_get.call_args
            params = kwargs.get("params", [])
            inc_values = [v for k, v in params if k == "includes[]"]
            assert "cover_art" in inc_values
            assert "author" in inc_values
            assert "artist" in inc_values

    def test_search_manga_empty_and_whitespace_rejection(self):
        client = MangaDexClient()
        assert client.search_manga("") is None
        assert client.search_manga("   ") is None
        assert client.search_manga(None) is None

    def test_get_manga_by_id(self):
        client = MangaDexClient()
        with patch.object(client.session, "get") as mock_get:
            mock_res = MagicMock()
            mock_res.json.return_value = {
                "data": {
                    "id": "uuid-1234",
                    "attributes": {"title": {"en": "Solo Leveling"}}
                }
            }
            mock_res.raise_for_status.return_value = None
            mock_get.return_value = mock_res

            data = client.get_manga_by_id("uuid-1234")
            assert data is not None
            assert data["id"] == "uuid-1234"
            assert "uuid-1234" in mock_get.call_args[0][0]


# ==============================================================================
# 4. Dual Spanish Language & Chapter Filtering Tests
# ==============================================================================

class TestDualSpanishChapterFeed:
    """Tests for querying 'es-la' and 'es' simultaneously and filtering external chapters."""

    def test_chapter_feed_queries_both_spanish_languages(self):
        client = MangaDexClient()
        with patch.object(client.session, "get") as mock_get:
            mock_res = MagicMock()
            mock_res.json.return_value = {"data": [], "total": 0}
            mock_res.raise_for_status.return_value = None
            mock_get.return_value = mock_res

            client.get_all_chapters_feed("manga-uuid", languages=["es-la", "es"])
            _, kwargs = mock_get.call_args
            params = kwargs.get("params", [])
            langs = [v for k, v in params if k == "translatedLanguage[]"]
            assert "es-la" in langs
            assert "es" in langs

    def test_chapter_feed_excludes_external_chapters(self):
        client = MangaDexClient()
        mock_raw = [
            # External MangaPlus chapter (has externalUrl)
            {
                "id": "mangaplus-ch-1",
                "attributes": {
                    "chapter": "1",
                    "volume": "1",
                    "pages": 0,
                    "externalUrl": "https://mangaplus.shueisha.co.jp/viewer/1000",
                    "translatedLanguage": "es"
                }
            },
            # Valid internal chapter
            {
                "id": "internal-ch-1",
                "attributes": {
                    "chapter": "1",
                    "volume": "1",
                    "pages": 20,
                    "externalUrl": None,
                    "translatedLanguage": "es-la",
                    "version": 1
                }
            }
        ]

        with patch.object(client.session, "get") as mock_get:
            mock_res = MagicMock()
            mock_res.json.return_value = {"data": mock_raw, "total": 2}
            mock_res.raise_for_status.return_value = None
            mock_get.return_value = mock_res

            feed = client.get_all_chapters_feed("uuid-test")
            assert "1" in feed
            candidates = feed["1"]["candidates"]
            # Only internal chapter must be present
            assert len(candidates) == 1
            assert candidates[0]["id"] == "internal-ch-1"
            assert candidates[0]["pages"] == 20

    def test_chapter_feed_excludes_zero_page_chapters(self):
        client = MangaDexClient()
        mock_raw = [
            {
                "id": "zero-page-ch",
                "attributes": {
                    "chapter": "2",
                    "pages": 0,
                    "externalUrl": None,
                    "translatedLanguage": "es"
                }
            }
        ]

        with patch.object(client.session, "get") as mock_get:
            mock_res = MagicMock()
            mock_res.json.return_value = {"data": mock_raw, "total": 1}
            mock_res.raise_for_status.return_value = None
            mock_get.return_value = mock_res

            feed = client.get_all_chapters_feed("uuid-test")
            assert "2" not in feed

    def test_chapter_feed_candidate_sorting_by_pages_and_version(self):
        client = MangaDexClient()
        mock_raw = [
            {"id": "cand-low", "attributes": {"chapter": "5", "pages": 15, "version": 1, "translatedLanguage": "es"}},
            {"id": "cand-high", "attributes": {"chapter": "5", "pages": 25, "version": 1, "translatedLanguage": "es-la"}},
            {"id": "cand-v2", "attributes": {"chapter": "5", "pages": 25, "version": 2, "translatedLanguage": "es"}},
        ]

        with patch.object(client.session, "get") as mock_get:
            mock_res = MagicMock()
            mock_res.json.return_value = {"data": mock_raw, "total": 3}
            mock_res.raise_for_status.return_value = None
            mock_get.return_value = mock_res

            feed = client.get_all_chapters_feed("uuid-test")
            assert "5" in feed
            candidates = feed["5"]["candidates"]
            assert len(candidates) == 3
            # Top candidate has 25 pages and version 2
            assert candidates[0]["id"] == "cand-v2"
            assert candidates[0]["pages"] == 25
            assert candidates[0]["version"] == 2

    def test_chapter_feed_pagination_handling(self):
        client = MangaDexClient()
        batch_1 = [
            {"id": f"c-{i}", "attributes": {"chapter": str(i), "pages": 10, "translatedLanguage": "es"}}
            for i in range(1, 3)
        ]
        batch_2 = [
            {"id": f"c-{i}", "attributes": {"chapter": str(i), "pages": 10, "translatedLanguage": "es"}}
            for i in range(3, 5)
        ]

        res_1 = MagicMock()
        res_1.json.return_value = {"data": batch_1, "total": 4}
        res_1.raise_for_status.return_value = None

        res_2 = MagicMock()
        res_2.json.return_value = {"data": batch_2, "total": 4}
        res_2.raise_for_status.return_value = None

        with patch.object(client.session, "get", side_effect=[res_1, res_2]) as mock_get:
            feed = client.get_all_chapters_feed("uuid-paginated", limit_per_page=2)
            assert len(feed) == 4
            assert set(feed.keys()) == {"1", "2", "3", "4"}
            assert mock_get.call_count == 2


# ==============================================================================
# 5. HTTP 429 & 5xx Exponential Backoff Tests
# ==============================================================================

class TestHttp429AndExponentialBackoff:
    """Tests for exponential backoff with jitter on 429 and 5xx responses."""

    def test_exponential_backoff_on_429(self):
        client = MangaDexClient()
        mock_429 = MagicMock()
        mock_429.status_code = 429
        mock_429.headers = {}

        mock_200 = MagicMock()
        mock_200.status_code = 200
        mock_200.json.return_value = {"data": [{"id": "recovered"}]}
        mock_200.raise_for_status.return_value = None

        with patch.object(client.session, "get", side_effect=[mock_429, mock_200]) as mock_get:
            with patch("time.sleep") as mock_sleep:
                res = client._request("GET", "https://api.mangadex.org/test")
                assert res.status_code == 200
                assert mock_get.call_count == 2
                mock_sleep.assert_called_once()
                # Default backoff factor 1.5 * 2^0 = 1.5s plus jitter
                slept = mock_sleep.call_args[0][0]
                assert 1.4 <= slept <= 2.2

    def test_exponential_backoff_respects_retry_after_header(self):
        client = MangaDexClient()
        mock_429 = MagicMock()
        mock_429.status_code = 429
        mock_429.headers = {"Retry-After": "3"}

        mock_200 = MagicMock()
        mock_200.status_code = 200
        mock_200.json.return_value = {"data": []}
        mock_200.raise_for_status.return_value = None

        with patch.object(client.session, "get", side_effect=[mock_429, mock_200]):
            with patch("time.sleep") as mock_sleep:
                client._request("GET", "https://api.mangadex.org/test")
                mock_sleep.assert_called_once()
                slept = mock_sleep.call_args[0][0]
                assert 3.0 <= slept <= 3.6  # 3.0 + jitter up to 0.5

    def test_exponential_backoff_on_5xx_server_errors(self):
        client = MangaDexClient()
        mock_502 = MagicMock()
        mock_502.status_code = 502
        mock_502.headers = {}

        mock_200 = MagicMock()
        mock_200.status_code = 200
        mock_200.json.return_value = {"data": []}
        mock_200.raise_for_status.return_value = None

        with patch.object(client.session, "get", side_effect=[mock_502, mock_200]) as mock_get:
            with patch("time.sleep"):
                res = client._request("GET", "https://api.mangadex.org/test")
                assert res.status_code == 200
                assert mock_get.call_count == 2

    def test_get_chapter_pages_info_exhaustion_raises_runtime_error(self):
        client = MangaDexClient()
        mock_429 = MagicMock()
        mock_429.status_code = 429
        mock_429.headers = {}

        with patch.object(client.session, "get", return_value=mock_429):
            with patch("time.sleep"):
                with pytest.raises(RuntimeError, match="No se pudo obtener información de páginas"):
                    client.get_chapter_pages_info("chapter-uuid-dead")


# ==============================================================================
# 6. Streaming GET Cover Download Tests
# ==============================================================================

class TestCoverDownloadStreamingGet:
    """Tests for streaming GET cover downloads without HEAD methods."""

    def test_cover_download_streaming_get_success(self, tmp_path: Path):
        client = MangaDexClient()
        target = tmp_path / "covers" / "poster.jpg"

        mock_res = MagicMock()
        mock_res.status_code = 200
        # Simulated streaming chunks
        mock_res.iter_content.return_value = [b"CHUNK_1_", b"CHUNK_2_", b"CHUNK_3_END"]

        with patch.object(client.session, "get", return_value=mock_res) as mock_get:
            ok = client.download_cover("manga-123", "cover.jpg", target)
            assert ok is True
            assert target.exists()
            assert target.read_bytes() == b"CHUNK_1_CHUNK_2_CHUNK_3_END"

            # Must use stream=True on GET
            mock_get.assert_called_once()
            _, kwargs = mock_get.call_args
            assert kwargs.get("stream") is True

    def test_cover_download_with_variant_suffix(self, tmp_path: Path):
        client = MangaDexClient()
        target = tmp_path / "thumb.jpg"

        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content.return_value = [b"THUMB_DATA"]

        with patch.object(client.session, "get", return_value=mock_res) as mock_get:
            ok = client.download_cover("manga-123", "cover.jpg", target, variant=".512.jpg")
            assert ok is True
            called_url = mock_get.call_args[0][0]
            assert called_url.endswith("cover.jpg.512.jpg")

    def test_cover_download_failure_returns_false(self, tmp_path: Path):
        client = MangaDexClient()
        target = tmp_path / "fail.jpg"

        mock_res = MagicMock()
        mock_res.status_code = 404

        with patch.object(client.session, "get", return_value=mock_res):
            ok = client.download_cover("manga-123", "missing.jpg", target)
            assert ok is False
            assert not target.exists()


# ==============================================================================
# 7. Multi-Fallback Page Downloading Tests
# ==============================================================================

class TestMultiFallbackPageDownloading:
    """
    Tests for page downloading with triple fallback:
    1. Primary: @Home node baseUrl/data/{hash}/{file}
    2. Fallback: uploads.mangadex.org/data/{hash}/{file}
    3. Data-saver fallback: baseUrl/data-saver/{hash}/{file} or uploads.mangadex.org/data-saver/{hash}/{file}
    """

    def test_page_download_primary_athome_node(self, tmp_path: Path):
        client = MangaDexClient()
        dest = tmp_path / "page_primary.jpg"

        mock_200 = MagicMock()
        mock_200.status_code = 200
        mock_200.content = b"VALID_IMAGE_DATA_PADDING_" * 50

        with patch.object(client.session, "get", return_value=mock_200) as mock_get:
            ok = client.download_page(
                base_url="https://athome.node",
                ch_hash="hash1",
                page_name="p01.jpg",
                dest_path=dest
            )
            assert ok is True
            assert dest.exists()
            assert dest.stat().st_size > 1000
            called_url = mock_get.call_args[0][0]
            assert called_url == "https://athome.node/data/hash1/p01.jpg"

    def test_page_download_fallback_to_central_cdn(self, tmp_path: Path):
        client = MangaDexClient()
        dest = tmp_path / "page_cdn.jpg"

        mock_athome_fail = MagicMock()
        mock_athome_fail.status_code = 502

        mock_cdn_success = MagicMock()
        mock_cdn_success.status_code = 200
        mock_cdn_success.content = b"CDN_IMAGE_DATA_PADDING_" * 50

        with patch.object(client.session, "get", side_effect=[mock_athome_fail, mock_cdn_success]):
            with patch("time.sleep"):
                ok = client.download_page(
                    base_url="https://athome.node",
                    ch_hash="hash1",
                    page_name="p01.jpg",
                    dest_path=dest
                )
                assert ok is True
                assert dest.exists()

    def test_page_download_fallback_to_data_saver(self, tmp_path: Path):
        client = MangaDexClient()
        dest = tmp_path / "page_saver.jpg"

        mock_fail = MagicMock()
        mock_fail.status_code = 404

        mock_saver_ok = MagicMock()
        mock_saver_ok.status_code = 200
        mock_saver_ok.content = b"SAVER_IMAGE_DATA_PADDING_" * 50

        # Fails @Home data, fails CDN data, succeeds on @Home data-saver
        with patch.object(client.session, "get", side_effect=[mock_fail, mock_fail, mock_saver_ok]):
            ok = client.download_page(
                base_url="https://athome.node",
                ch_hash="hash1",
                page_name="p01.jpg",
                saver_name="p01.jpg",
                dest_path=dest
            )
            assert ok is True
            assert dest.exists()

    def test_page_download_all_fallbacks_fail(self, tmp_path: Path):
        client = MangaDexClient()
        dest = tmp_path / "page_fail.jpg"

        mock_fail = MagicMock()
        mock_fail.status_code = 404

        with patch.object(client.session, "get", return_value=mock_fail):
            ok = client.download_page(
                base_url="https://athome.node",
                ch_hash="hash1",
                page_name="p01.jpg",
                dest_path=dest
            )
            assert ok is False
            assert not dest.exists()

    def test_page_download_returns_bytes_when_dest_path_none(self):
        client = MangaDexClient()
        mock_ok = MagicMock()
        mock_ok.status_code = 200
        mock_ok.content = b"DIRECT_RAW_BYTES_" * 70

        with patch.object(client.session, "get", return_value=mock_ok):
            raw = client.download_page(
                base_url="https://athome.node",
                ch_hash="h",
                page_name="p.jpg"
            )
            assert isinstance(raw, bytes)
            assert len(raw) > 1000


# ==============================================================================
# 8. SecondaryProvider Interface & DMCA Fallback Hook Tests (F6)
# ==============================================================================

class MockLeerCapituloProvider(SecondaryProvider):
    """Concrete mock provider simulating F6 secondary provider for DMCA titles."""

    @property
    def provider_name(self) -> str:
        return "LeerCapitulo"

    def search_series(self, title: str) -> Optional[Dict[str, Any]]:
        if "Solo Leveling" in title:
            return {"provider": "LeerCapitulo", "slug": "solo-leveling", "id": "lc-solo"}
        return None

    def get_chapters(self, series_id: str, languages: List[str] = ["es", "es-la"]) -> List[Dict[str, Any]]:
        return [{"chapter": "1", "id": "lc-ch-1"}]

    def get_chapter_pages(self, chapter_id: str) -> List[str]:
        return ["https://leercapitulo.co/img/1.jpg"]


class TestSecondaryProviderFallbackHook:
    """Tests for SecondaryProvider ABC interface and fallback resolution (F6)."""

    def test_secondary_provider_registration(self):
        client = MangaDexClient()
        assert len(client.secondary_providers) == 0

        provider = MockLeerCapituloProvider()
        client.register_secondary_provider(provider)
        assert len(client.secondary_providers) == 1
        assert client.secondary_providers[0].provider_name == "LeerCapitulo"

    def test_resolve_provider_when_mangadex_id_present(self):
        client = MangaDexClient()
        provider = MockLeerCapituloProvider()
        client.register_secondary_provider(provider)

        item = {
            "title_display": "Chainsaw Man",
            "mangadex_id": "a77742b1-befd-49a4-bff5-1ad4e6b0ef7b",
            "search_query": "Chainsaw Man"
        }
        prov_name, prov_id = client.resolve_provider_for_title(item)
        assert prov_name == "mangadex"
        assert prov_id == "a77742b1-befd-49a4-bff5-1ad4e6b0ef7b"

    def test_resolve_provider_fallback_when_mangadex_id_none(self):
        client = MangaDexClient()
        provider = MockLeerCapituloProvider()
        client.register_secondary_provider(provider)

        item = {
            "title_display": "Solo Leveling",
            "mangadex_id": None,  # DMCA title unindexed on MangaDex
            "search_query": "Solo Leveling"
        }
        prov_name, prov_data = client.resolve_provider_for_title(item)
        assert prov_name == "LeerCapitulo"
        assert prov_data["slug"] == "solo-leveling"

    def test_resolve_provider_unresolved_when_no_match(self):
        client = MangaDexClient()
        provider = MockLeerCapituloProvider()
        client.register_secondary_provider(provider)

        item = {
            "title_display": "Obscure Unindexed Manhwa",
            "mangadex_id": None,
            "search_query": "Obscure Unindexed Manhwa"
        }
        prov_name, prov_data = client.resolve_provider_for_title(item)
        assert prov_name == "unresolved"
        assert prov_data is None


# ==============================================================================
# 9. Parallel Acquisition Decoupling Tests
# ==============================================================================

class TestDecouplingAndConcurrency:
    """Verifies image downloads do not consume metadata TokenBucket tokens."""

    def test_page_downloads_decoupled_from_api_token_bucket(self, tmp_path: Path):
        client = MangaDexClient()
        initial_tokens = client.rate_limiter.available_tokens

        mock_ok = MagicMock()
        mock_ok.status_code = 200
        mock_ok.content = b"VALID_IMAGE_DATA_PADDING_" * 50

        # Downloading pages via download_page
        with patch.object(client.session, "get", return_value=mock_ok):
            for i in range(10):
                dest = tmp_path / f"p_{i}.jpg"
                client.download_page(
                    base_url="https://athome.node",
                    ch_hash="h",
                    page_name=f"p_{i}.jpg",
                    dest_path=dest
                )

        # TokenBucket for metadata should NOT have been throttled or depleted
        # because download_page uses direct session.get, not _request with acquire()
        assert client.rate_limiter.available_tokens >= initial_tokens - 0.5
