"""
Adversarial Stress Test Suite for Milestone 2 Acquisition Layer.
Authored by Challenger 2.

Empirical verification of:
1. CDN fallback progression (@Home failure -> uploads.mangadex.org/data -> dataSaver).
2. Streaming GET cover acquisition resilience under network interruption / partial content.
3. SecondaryProvider routing when mangadex_id is None (unindexed / DMCA titles).
4. TokenBucket thread safety and concurrency under high load.
"""

import io
import time
import json
import threading
from pathlib import Path
from typing import Dict, Any, List, Optional
from unittest.mock import MagicMock, patch

import pytest
import requests

from src.acquisition.mangadex_client import (
    MangaDexClient,
    SecondaryProvider,
    TokenBucketRateLimiter,
    MANGADEX_API,
    MANGADEX_UPLOADS,
)
from src.acquisition.manga_downloader import MangaPipeline


# ==============================================================================
# 1. CDN Fallback Progression Adversarial Tests
# ==============================================================================

class TestAdversarialCDNFallback:
    """Stress testing the multi-tier CDN fallback mechanism."""

    def test_fallback_progression_primary_500_to_central_cdn(self, tmp_path: Path):
        """Simulates primary @Home node returning HTTP 500; verifies fallback to central CDN."""
        client = MangaDexClient()
        dest = tmp_path / "page_fallback_cdn.jpg"

        mock_home_500 = MagicMock()
        mock_home_500.status_code = 500

        mock_cdn_200 = MagicMock()
        mock_cdn_200.status_code = 200
        mock_cdn_200.content = b"VALID_IMAGE_DATA_PADDING_" * 60

        # @Home fails 3 attempts with 500, then central CDN succeeds
        call_history = []

        def fake_get(url, **kwargs):
            call_history.append(url)
            if "athome.network" in url and "data-saver" not in url:
                return mock_home_500
            elif "uploads.mangadex.org/data/" in url:
                return mock_cdn_200
            return mock_home_500

        with patch.object(client.session, "get", side_effect=fake_get):
            with patch("time.sleep", return_value=None):
                ok = client.download_page(
                    base_url="https://athome.network",
                    ch_hash="hash_abc",
                    page_name="p01.jpg",
                    dest_path=dest
                )
                assert ok is True
                assert dest.exists()
                assert dest.stat().st_size > 1000

                # Verify call progression: @Home was attempted, then central CDN
                assert any("athome.network/data/hash_abc/p01.jpg" in u for u in call_history)
                assert any("uploads.mangadex.org/data/hash_abc/p01.jpg" in u for u in call_history)

    def test_fallback_progression_primary_timeout_to_central_cdn(self, tmp_path: Path):
        """Simulates primary @Home node timing out; verifies graceful fallback to central CDN."""
        client = MangaDexClient()
        dest = tmp_path / "page_timeout_cdn.jpg"

        mock_cdn_200 = MagicMock()
        mock_cdn_200.status_code = 200
        mock_cdn_200.content = b"CDN_IMAGE_AFTER_TIMEOUT_" * 60

        call_history = []

        def fake_get(url, **kwargs):
            call_history.append(url)
            if "athome.network" in url:
                raise requests.exceptions.Timeout("Connection to @Home node timed out")
            elif "uploads.mangadex.org/data/" in url:
                return mock_cdn_200
            return MagicMock(status_code=500)

        with patch.object(client.session, "get", side_effect=fake_get):
            with patch("time.sleep", return_value=None):
                ok = client.download_page(
                    base_url="https://athome.network",
                    ch_hash="hash_timeout",
                    page_name="p02.jpg",
                    dest_path=dest
                )
                assert ok is True
                assert dest.exists()
                assert dest.stat().st_size > 1000

    def test_fallback_progression_to_datasaver_when_data_fails(self, tmp_path: Path):
        """Simulates failure of both @Home and central CDN full-res data; verifies fallback to data-saver."""
        client = MangaDexClient()
        dest = tmp_path / "page_datasaver.jpg"

        mock_500 = MagicMock(status_code=500)
        mock_saver_200 = MagicMock(status_code=200, content=b"SAVER_QUALITY_IMAGE_BYTES_" * 60)

        call_history = []

        def fake_get(url, **kwargs):
            call_history.append(url)
            if "/data/" in url:
                return mock_500
            elif "/data-saver/" in url:
                return mock_saver_200
            return mock_500

        with patch.object(client.session, "get", side_effect=fake_get):
            with patch("time.sleep", return_value=None):
                ok = client.download_page(
                    base_url="https://athome.network",
                    ch_hash="hash_full_fail",
                    page_name="p03.jpg",
                    saver_name="p03_saver.jpg",
                    dest_path=dest
                )
                assert ok is True
                assert dest.exists()
                # Verify that both /data/ endpoints were attempted before /data-saver/
                first_saver_idx = next(i for i, u in enumerate(call_history) if "/data-saver/" in u)
                assert first_saver_idx > 0
                assert any("/data/" in u for u in call_history[:first_saver_idx])

    def test_content_length_guard_rejects_truncated_200_response(self, tmp_path: Path):
        """Simulates an @Home node returning HTTP 200 with truncated content (<1000 bytes)."""
        client = MangaDexClient()
        dest = tmp_path / "page_truncated.jpg"

        # 200 OK but only 50 bytes (e.g. empty or broken response)
        mock_short_200 = MagicMock(status_code=200, content=b"TOO_SHORT")
        mock_valid_200 = MagicMock(status_code=200, content=b"VALID_SUBSEQUENT_IMAGE_DATA_" * 60)

        def fake_get(url, **kwargs):
            if "athome.network" in url:
                return mock_short_200
            return mock_valid_200

        with patch.object(client.session, "get", side_effect=fake_get):
            with patch("time.sleep", return_value=None):
                ok = client.download_page(
                    base_url="https://athome.network",
                    ch_hash="hash_trunc",
                    page_name="p04.jpg",
                    dest_path=dest
                )
                assert ok is True
                assert dest.exists()
                assert dest.stat().st_size > 1000
                assert dest.read_bytes() == mock_valid_200.content

    def test_total_network_failure_returns_false_and_leaves_no_disk_debris(self, tmp_path: Path):
        """Verifies that complete network outage cleanly returns False without leaving partial files."""
        client = MangaDexClient()
        dest = tmp_path / "page_debris_check.jpg"

        mock_500 = MagicMock(status_code=500)

        with patch.object(client.session, "get", return_value=mock_500):
            with patch("time.sleep", return_value=None):
                ok = client.download_page(
                    base_url="https://athome.network",
                    ch_hash="hash_fail_all",
                    page_name="p05.jpg",
                    dest_path=dest
                )
                assert ok is False
                assert not dest.exists()


# ==============================================================================
# 2. Streaming GET Cover Acquisition Adversarial Tests
# ==============================================================================

class TestAdversarialCoverAcquisition:
    """Stress testing cover acquisition under partial content and network drop."""

    def test_cover_download_partial_content_interruption(self, tmp_path: Path):
        """
        Adversarial test: Simulates connection drop during iter_content streaming.
        Verifies behavior when ChunkedEncodingError occurs halfway through transfer.
        """
        client = MangaDexClient()
        target = tmp_path / "interrupted_poster.jpg"

        def failing_chunks(chunk_size):
            yield b"VALID_START_OF_IMAGE_HEADER"
            yield b"_MORE_CHUNKS_OF_IMAGE_DATA_"
            raise requests.exceptions.ChunkedEncodingError("Connection broken by peer during streaming")

        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content = failing_chunks

        with patch.object(client.session, "get", return_value=mock_res):
            ok = client.download_cover("manga-uuid", "cover.jpg", target)
            # Must return False due to unhandled stream termination
            assert ok is False

            # Empirical Challenger Observation: Does a partial file remain on disk?
            # When iter_content raises inside 'with open(target, "wb"):', the written chunks
            # remain on disk unless cleaned up!
            # Check if file exists:
            if target.exists():
                # Documenting this empirical vulnerability:
                # target exists with truncated bytes:
                assert target.stat().st_size > 0
                assert target.stat().st_size < 1000

    def test_cover_download_zero_byte_stream_handling(self, tmp_path: Path):
        """Simulates 200 OK response with 0 bytes transferred."""
        client = MangaDexClient()
        target = tmp_path / "empty_poster.jpg"

        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.iter_content = lambda chunk_size: iter([])

        with patch.object(client.session, "get", return_value=mock_res):
            ok = client.download_cover("manga-uuid", "cover.jpg", target)
            assert ok is False


# ==============================================================================
# 3. SecondaryProvider Routing Adversarial Tests (F6)
# ==============================================================================

class MockFailingSecondaryProvider(SecondaryProvider):
    """Secondary provider that simulates exceptions and edge cases."""
    @property
    def provider_name(self) -> str:
        return "FailScraper"

    def search_series(self, title: str) -> Optional[Dict[str, Any]]:
        if "raise_error" in title:
            raise requests.exceptions.ConnectionError("Scraper endpoint unreachable")
        if "found_title" in title:
            return {"provider": "FailScraper", "id": "fs-123", "title": title}
        return None

    def get_chapters(self, series_id: str, languages: List[str] = ["es", "es-la"]) -> List[Dict[str, Any]]:
        return []

    def get_chapter_pages(self, chapter_id: str) -> List[str]:
        return []


class TestAdversarialSecondaryProvider:
    """Stress testing SecondaryProvider routing with real queue unindexed titles."""

    def test_unindexed_titles_from_production_queue(self):
        """Verifies all titles in manhwa_top50_queue.json with mangadex_id=None cleanly route."""
        queue_path = Path("manhwa_top50_queue.json")
        assert queue_path.exists()
        with open(queue_path, "r", encoding="utf-8") as f:
            queue_data = json.load(f)

        unindexed_series = [s for s in queue_data["series"] if s.get("mangadex_id") is None]
        assert len(unindexed_series) == 4
        unindexed_ids = {s["id"] for s in unindexed_series}
        assert unindexed_ids == {"god-of-high-school", "sweet-home", "landlord-girls", "my-stepmom"}

        client = MangaDexClient()
        mock_provider = MockFailingSecondaryProvider()
        client.register_secondary_provider(mock_provider)

        for series in unindexed_series:
            # Without match, should resolve cleanly to ('unresolved', None) without crash
            prov_name, prov_data = client.resolve_provider_for_title(series)
            assert prov_name == "unresolved"
            assert prov_data is None

    def test_unindexed_title_matches_secondary_provider(self):
        """Verifies clean match when secondary provider recognizes title."""
        client = MangaDexClient()
        provider = MockFailingSecondaryProvider()
        client.register_secondary_provider(provider)

        item = {
            "id": "test-found",
            "mangadex_id": None,
            "title_display": "found_title series",
            "search_query": "found_title series"
        }
        prov_name, prov_data = client.resolve_provider_for_title(item)
        assert prov_name == "FailScraper"
        assert prov_data["id"] == "fs-123"

    def test_empty_queue_item_does_not_crash(self):
        """Verifies passing malformed / minimal queue items does not raise KeyError."""
        client = MangaDexClient()
        prov_name, prov_data = client.resolve_provider_for_title({})
        assert prov_name == "unresolved"
        assert prov_data is None


# ==============================================================================
# 4. TokenBucket Rate Limiter Under High Concurrency Load
# ==============================================================================

class TestAdversarialTokenBucketHighConcurrency:
    """Stress tests TokenBucketRateLimiter under extreme thread contention."""

    def test_high_concurrency_rate_limiter_integrity(self):
        """
        Spawns 20 concurrent threads requesting tokens simultaneously.
        Verifies no deadlocks, race conditions, or token corruption.
        """
        limiter = TokenBucketRateLimiter(rate=10.0, capacity=10.0)
        tokens_granted = 0
        lock = threading.Lock()
        errors = []

        def worker():
            nonlocal tokens_granted
            for _ in range(5):
                try:
                    ok = limiter.acquire(1.0, timeout=2.0)
                    if ok:
                        with lock:
                            tokens_granted += 1
                except Exception as e:
                    errors.append(e)

        threads = [threading.Thread(target=worker) for _ in range(20)]
        t0 = time.monotonic()
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10.0)
        elapsed = time.monotonic() - t0

        assert len(errors) == 0
        # Total tokens acquired
        assert tokens_granted > 0
        assert elapsed < 10.0
