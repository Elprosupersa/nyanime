"""
Adversarial Empirical Challenge Test Suite for Milestone 5.
Challenger: challenger_m5_2

Adversarially stress-tests:
1. F6 Secondary Provider Routing for titles with mangadex_id=None
   (The God of High School, Sweet Home, Landlord Sisters, My Stepmom).
2. Corrupted image input handling during PDF compilation (truncated headers,
   random noise, mid-sequence corruption, 0-byte files, and atomic cleanup).
3. Disk margin boundary conditions (exact 15 GB threshold, 1 byte below, 1 byte above,
   zero/negative space, and safety abort in MangaPipeline).
4. Queue integrity and absence of synthetic/blacklisted UUIDs in manhwa_top50_queue.json.
"""

import os
import re
import json
import logging
import tempfile
import uuid
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
from unittest.mock import patch, MagicMock

import pytest
from PIL import Image

from src.acquisition.mangadex_client import (
    MangaDexClient,
    SecondaryProvider,
    TokenBucketRateLimiter,
)
from src.acquisition.pdf_compiler import PDFCompiler, HierarchicalOrganizer
from src.acquisition.integrity_guard import IntegrityGuard
from src.acquisition.manga_downloader import MangaPipeline, MangaDownloader

PROJECT_ROOT = Path(__file__).resolve().parent.parent
QUEUE_PATH = PROJECT_ROOT / "manhwa_top50_queue.json"

UUID_REGEX = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

BLACKLISTED_FABRICATED_UUIDS = {
    "16da7d56-14e3-4696-9818-472efab53e8e",
    "0d8a59be-c956-4c4c-83b6-96a605809707",
    "0d8ef313-a442-4217-a006-258129e92d84",
    "50ae6f1c-7f52-47ef-8b70-1f9dbbb64ff8",
    "40d6d538-349f-4315-ad24-b153ff2fa68c",
    "4ebbe31d-0f5a-4aa4-8fbb-256ea880a184",
    "5b5978a9-4674-4b5d-bb80-87a32e29fc60",
    "75d0fef3-f112-4e89-a2e6-a0e28f3ea7b3",
    "898516ba-4a21-4f81-a7b2-6db6d734cf78",
    "6e262de6-cf4c-47ea-a844-aa0da736c07a",
    "b6f8bc8f-8fc6-4d1e-bb97-a5113aa1e946",
    "8c772cb6-5c5a-4b71-b6a4-44b2c140409a",
    "0d3c0fb8-1933-4f9e-9533-5c8e3100ba0d",
    "0a178ba7-c75c-4235-98a7-7d4e5f2cfc93",
    "313936a7-0624-4f2d-8622-c36199f36f32",
    "6f8be91a-c7a7-47b8-b11c-d784a9611f7c",
}

EXPECTED_UNHOSTED_DMCA_SLUGS = {
    "god-of-high-school",
    "sweet-home",
    "landlord-girls",
    "my-stepmom",
}

VERIFIED_REMEDIATED_CANONICAL_UUIDS = {
    "sss-class-suicide-hunter": "4a973243-952e-44d7-a50f-883b4b7c9cc2",
    "leveling-with-the-gods": "4a43c227-b201-4fb7-b796-924c51797d50",
    "overgeared": "3fc308c9-4b00-4dc3-943e-1f39242bc708",
    "pick-me-up-infinite-gacha": "58167656-a065-4b49-b499-bd73d00555d5",
    "damn-reincarnation": "6e769716-df1e-4d66-89cc-32f3b46e17dc",
    "bastard": "bb169078-7289-4f95-948f-9315960e6905",
    "hero-killer": "163306e6-1700-42a4-882f-26db124cbec2",
    "player-who-cant-level-up": "a796fb50-cdc9-4c15-a48d-bc1d733d89b2",
    "silent-war": "1c5f98e8-9516-468f-8b64-2bac7e257709",
    "a-perverts-daily-life": "650dbb60-013a-4b77-b0d8-a546ecdce20d",
    "s-flower": "e388cfa2-1481-4592-8e38-d6eef93d0e05",
    "what-does-the-fox-say": "658662c8-bee6-442c-91c4-cb94681810b5",
}


# ==============================================================================
# Helper Mock Secondary Providers
# ==============================================================================

class MockLeerCapituloProvider(SecondaryProvider):
    """Simulates a secondary provider supporting unindexed/DMCA manhwa titles."""

    def __init__(self, supported_titles: Optional[Dict[str, Dict[str, Any]]] = None):
        self._titles = supported_titles or {
            "The God of High School": {"id": "lc-goh-101", "slug": "the-god-of-high-school"},
            "Sweet Home": {"id": "lc-sh-102", "slug": "sweet-home"},
            "Landlord Sisters": {"id": "lc-ls-103", "slug": "landlord-sisters"},
            "My Stepmom": {"id": "lc-ms-104", "slug": "my-stepmom"},
        }

    @property
    def provider_name(self) -> str:
        return "LeerCapitulo"

    def search_series(self, title: str) -> Optional[Dict[str, Any]]:
        if not title or not title.strip():
            return None
        for k, v in self._titles.items():
            if k.lower() in title.lower() or title.lower() in k.lower():
                return {"provider": self.provider_name, "title": k, **v}
        return None

    def get_chapters(self, series_id: str, languages: List[str] = ["es", "es-la"]) -> List[Dict[str, Any]]:
        return [
            {"chapter": "1", "volume": "1", "id": f"{series_id}-ch1", "title": "Capítulo 1"}
        ]

    def get_chapter_pages(self, chapter_id: str) -> List[str]:
        return [f"https://img.leercapitulo.com/{chapter_id}/01.jpg"]


class MockZonaTMOProvider(SecondaryProvider):
    """Simulates another secondary provider in a multi-provider fallback chain."""

    @property
    def provider_name(self) -> str:
        return "ZonaTMO"

    def search_series(self, title: str) -> Optional[Dict[str, Any]]:
        if "Landlord Sisters" in title:
            return {"provider": self.provider_name, "id": "tmo-ls-999", "title": title}
        return None

    def get_chapters(self, series_id: str, languages: List[str] = ["es", "es-la"]) -> List[Dict[str, Any]]:
        return []

    def get_chapter_pages(self, chapter_id: str) -> List[str]:
        return []


def _create_valid_jpeg(path: Path, width: int = 100, height: int = 150, color=(100, 150, 200)) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (width, height), color=color)
    img.save(path, "JPEG", quality=80)
    return path


# ==============================================================================
# 1. F6 Secondary Provider Routing Adversarial Tests
# ==============================================================================

class TestAdversarialF6SecondaryProviderRouting:
    """Rigorous stress-testing of F6 routing for titles with mangadex_id=None."""

    @pytest.fixture(scope="class")
    @classmethod
    def queue_data(cls) -> Dict[str, Any]:
        with open(QUEUE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    @pytest.fixture(scope="class")
    @classmethod
    def unindexed_titles(cls, queue_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        return [s for s in queue_data["series"] if s.get("mangadex_id") is None]

    def test_unindexed_titles_match_exactly_expected_dmca_set(self, unindexed_titles: List[Dict[str, Any]]):
        """Verify that exactly 4 titles in the queue have mangadex_id=None."""
        assert len(unindexed_titles) == 4
        unindexed_slugs = {s["id"] for s in unindexed_titles}
        assert unindexed_slugs == EXPECTED_UNHOSTED_DMCA_SLUGS

    def test_routing_resolution_without_secondary_providers_returns_unresolved(
        self, unindexed_titles: List[Dict[str, Any]]
    ):
        """When no secondary providers are registered, unindexed titles cleanly return ('unresolved', None)."""
        client = MangaDexClient()
        assert len(client.secondary_providers) == 0

        for series in unindexed_titles:
            prov_name, prov_data = client.resolve_provider_for_title(series)
            assert prov_name == "unresolved"
            assert prov_data is None

    def test_routing_resolution_with_registered_secondary_provider(
        self, unindexed_titles: List[Dict[str, Any]]
    ):
        """Verify that each unindexed title correctly routes to the registered secondary provider."""
        client = MangaDexClient()
        provider = MockLeerCapituloProvider()
        client.register_secondary_provider(provider)

        for series in unindexed_titles:
            prov_name, prov_data = client.resolve_provider_for_title(series)
            assert prov_name == "LeerCapitulo"
            assert prov_data is not None
            assert prov_data["provider"] == "LeerCapitulo"
            assert "id" in prov_data
            assert prov_data["id"].startswith("lc-")

    def test_secondary_provider_registration_idempotence(self):
        """Registering the same provider multiple times does not create duplicates."""
        client = MangaDexClient()
        provider = MockLeerCapituloProvider()
        client.register_secondary_provider(provider)
        client.register_secondary_provider(provider)
        assert len(client.secondary_providers) == 1

    def test_multi_provider_priority_chain(self):
        """Verify that the secondary providers are evaluated in registration priority order."""
        client = MangaDexClient()
        # Provider 1 supports only "Sweet Home"
        prov1 = MockLeerCapituloProvider(supported_titles={
            "Sweet Home": {"id": "lc-sh-1", "slug": "sweet-home"}
        })
        # Provider 2 supports "Landlord Sisters"
        prov2 = MockZonaTMOProvider()

        client.register_secondary_provider(prov1)
        client.register_secondary_provider(prov2)

        # Sweet Home matches prov1
        sh_item = {"id": "sweet-home", "mangadex_id": None, "search_query": "Sweet Home"}
        prov_name, prov_data = client.resolve_provider_for_title(sh_item)
        assert prov_name == "LeerCapitulo"
        assert prov_data["id"] == "lc-sh-1"

        # Landlord Sisters skips prov1 and matches prov2
        ls_item = {"id": "landlord-girls", "mangadex_id": None, "search_query": "Landlord Sisters"}
        prov_name, prov_data = client.resolve_provider_for_title(ls_item)
        assert prov_name == "ZonaTMO"
        assert prov_data["id"] == "tmo-ls-999"

        # God of High School matches neither -> unresolved
        goh_item = {"id": "god-of-high-school", "mangadex_id": None, "search_query": "The God of High School"}
        prov_name, prov_data = client.resolve_provider_for_title(goh_item)
        assert prov_name == "unresolved"
        assert prov_data is None

    def test_titles_with_mangadex_id_never_route_to_secondary_provider(self):
        """Even if secondary providers match the title query, mangadex_id takes absolute precedence."""
        client = MangaDexClient()
        client.register_secondary_provider(MockLeerCapituloProvider())

        solo_leveling = {
            "id": "solo-leveling",
            "mangadex_id": "32d76d19-8a05-4db0-9fc2-e0b0648fe9d0",
            "title_display": "Solo Leveling",
            "search_query": "Solo Leveling"
        }
        prov_name, prov_data = client.resolve_provider_for_title(solo_leveling)
        assert prov_name == "mangadex"
        assert prov_data == "32d76d19-8a05-4db0-9fc2-e0b0648fe9d0"

    def test_malformed_queue_item_resolution_safety(self):
        """Passing items with missing keys or None does not raise unhandled exceptions."""
        client = MangaDexClient()
        client.register_secondary_provider(MockLeerCapituloProvider())

        assert client.resolve_provider_for_title({}) == ("unresolved", None)
        assert client.resolve_provider_for_title({"mangadex_id": None}) == ("unresolved", None)
        assert client.resolve_provider_for_title({"search_query": None, "title_display": None}) == ("unresolved", None)


# ==============================================================================
# 2. Corrupted Image Input Handling During PDF Compilation
# ==============================================================================

class TestAdversarialCorruptedImageHandling:
    """Stress testing PDFCompiler with corrupted, truncated, and malicious image inputs."""

    @pytest.fixture
    def work_dir(self, tmp_path: Path) -> Path:
        return tmp_path

    def test_empty_image_list_returns_false(self, work_dir: Path):
        dest_pdf = work_dir / "empty.pdf"
        assert PDFCompiler.compile_chapter([], dest_pdf) is False
        assert not dest_pdf.exists()

    def test_nonexistent_image_path_returns_false(self, work_dir: Path):
        dest_pdf = work_dir / "nonexistent.pdf"
        fake_path = work_dir / "does_not_exist.jpg"
        assert PDFCompiler.compile_chapter([fake_path], dest_pdf) is False
        assert not dest_pdf.exists()

    def test_zero_byte_image_file_returns_false(self, work_dir: Path):
        zero_file = work_dir / "zero.jpg"
        zero_file.write_bytes(b"")
        dest_pdf = work_dir / "zero.pdf"

        assert PDFCompiler.compile_chapter([zero_file], dest_pdf) is False
        assert not dest_pdf.exists()

    def test_truncated_jpeg_header_returns_false(self, work_dir: Path):
        """File has JPEG SOI marker (0xFFD8) but only 6 truncated bytes."""
        bad_jpg = work_dir / "truncated.jpg"
        bad_jpg.write_bytes(b"\xFF\xD8\xFF\xE0\x00\x10")
        dest_pdf = work_dir / "truncated.pdf"

        assert PDFCompiler.compile_chapter([bad_jpg], dest_pdf) is False
        assert not dest_pdf.exists()
        assert not Path(str(dest_pdf) + ".tmp").exists()

    def test_random_noise_bytes_disguised_as_jpg_returns_false(self, work_dir: Path):
        """File with 2048 bytes of pseudorandom non-image data."""
        noise_file = work_dir / "noise.jpg"
        noise_file.write_bytes(os.urandom(2048))
        dest_pdf = work_dir / "noise.pdf"

        assert PDFCompiler.compile_chapter([noise_file], dest_pdf) is False
        assert not dest_pdf.exists()
        assert not Path(str(dest_pdf) + ".tmp").exists()

    def test_corrupted_png_signature_with_invalid_chunks_returns_false(self, work_dir: Path):
        """Valid PNG 8-byte signature followed by garbage chunk data."""
        png_sig = b"\x89PNG\r\n\x1a\n"
        bad_png = work_dir / "bad_chunk.png"
        bad_png.write_bytes(png_sig + b"CORRUPTED_IHDR_CHUNK_DATA_NOT_VALID")
        dest_pdf = work_dir / "bad_png.pdf"

        assert PDFCompiler.compile_chapter([bad_png], dest_pdf) is False
        assert not dest_pdf.exists()

    def test_corrupted_image_in_middle_of_valid_sequence(self, work_dir: Path):
        """A sequence of 5 pages where page 3 is corrupted. Must fail and produce no PDF."""
        p1 = _create_valid_jpeg(work_dir / "p1.jpg")
        p2 = _create_valid_jpeg(work_dir / "p2.jpg")
        p3_corrupt = work_dir / "p3.jpg"
        p3_corrupt.write_bytes(b"NOT_A_VALID_IMAGE_BYTES_1234567890")
        p4 = _create_valid_jpeg(work_dir / "p4.jpg")
        p5 = _create_valid_jpeg(work_dir / "p5.jpg")

        dest_pdf = work_dir / "chapter_corrupt_mid.pdf"
        assert PDFCompiler.compile_chapter([p1, p2, p3_corrupt, p4, p5], dest_pdf) is False
        assert not dest_pdf.exists()
        # Verify temporary file was deleted cleanly
        assert not Path(str(dest_pdf) + ".tmp").exists()

    def test_zero_byte_file_in_middle_of_valid_sequence(self, work_dir: Path):
        """A sequence where page 2 has 0 bytes."""
        p1 = _create_valid_jpeg(work_dir / "p1.jpg")
        p2_zero = work_dir / "p2_zero.jpg"
        p2_zero.write_bytes(b"")
        p3 = _create_valid_jpeg(work_dir / "p3.jpg")

        dest_pdf = work_dir / "chapter_zero_mid.pdf"
        assert PDFCompiler.compile_chapter([p1, p2_zero, p3], dest_pdf) is False
        assert not dest_pdf.exists()

    def test_valid_images_compile_successfully_and_verify_with_integrity_guard(self, work_dir: Path):
        """Control test: genuine valid images compile cleanly and pass structural integrity."""
        p1 = _create_valid_jpeg(work_dir / "v1.jpg", width=800, height=1200)
        p2 = _create_valid_jpeg(work_dir / "v2.jpg", width=800, height=1200)
        dest_pdf = work_dir / "valid_chapter.pdf"

        assert PDFCompiler.compile_chapter([p1, p2], dest_pdf) is True
        assert dest_pdf.exists()
        assert dest_pdf.stat().st_size > 10 * 1024

        is_valid, reason = IntegrityGuard.verify_pdf(dest_pdf, min_pages=2)
        assert is_valid is True, f"Integrity check failed: {reason}"

    def test_atomic_temp_replacement_cleans_up_on_failure(self, work_dir: Path):
        """Verifies that temporary files (.tmp) never linger on disk when compilation fails."""
        corrupt = work_dir / "bad.jpg"
        corrupt.write_bytes(b"gibberish")
        dest_pdf = work_dir / "target.pdf"
        temp_pdf = Path(str(dest_pdf) + ".tmp")

        PDFCompiler.compile_chapter([corrupt], dest_pdf)
        assert not dest_pdf.exists()
        assert not temp_pdf.exists()


# ==============================================================================
# 3. Disk Margin Boundary Conditions (<15 GB Safety Check)
# ==============================================================================

class TestAdversarialDiskMarginBoundaryConditions:
    """Stress testing disk margin boundary conditions and safety warnings."""

    def test_disk_margin_exact_boundary_15_gb(self):
        """Exactly 15.000000 GB free: condition is >= 15.0, so returns True."""
        with patch.object(IntegrityGuard, "get_free_space_gb", return_value=15.0):
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=15.0) is True

    def test_disk_margin_one_byte_below_15_gb_emits_warning(self, caplog):
        """14.999999 GB free (< 15.0 GB): returns False and logs safety warning."""
        caplog.set_level(logging.WARNING, logger="IntegrityGuard")
        with patch.object(IntegrityGuard, "get_free_space_gb", return_value=14.999999):
            res = IntegrityGuard.check_disk_margin("E:\\", min_free_gb=15.0)
            assert res is False
            assert any("Margen de disco bajo" in rec.message for rec in caplog.records)
            assert any("15.00 GB" in rec.message for rec in caplog.records)

    def test_disk_margin_one_byte_above_15_gb(self):
        """15.000001 GB free (> 15.0 GB): returns True."""
        with patch.object(IntegrityGuard, "get_free_space_gb", return_value=15.000001):
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=15.0) is True

    def test_disk_margin_critical_zero_and_negative(self, caplog):
        """Zero and negative values must return False and emit warning."""
        caplog.set_level(logging.WARNING, logger="IntegrityGuard")
        with patch.object(IntegrityGuard, "get_free_space_gb", return_value=0.0):
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=15.0) is False

        with patch.object(IntegrityGuard, "get_free_space_gb", return_value=-5.0):
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=15.0) is False

    def test_disk_margin_generous_space(self):
        """Abundant free space (250 GB) returns True."""
        with patch.object(IntegrityGuard, "get_free_space_gb", return_value=250.0):
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=15.0) is True

    def test_custom_threshold_boundaries(self):
        """Verifies custom threshold parameters."""
        with patch.object(IntegrityGuard, "get_free_space_gb", return_value=9.99):
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=10.0) is False
        with patch.object(IntegrityGuard, "get_free_space_gb", return_value=10.01):
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=10.0) is True

    def test_pipeline_download_chapter_group_halts_on_low_disk(self, tmp_path: Path, caplog):
        """MangaPipeline.download_chapter_group halts immediately if disk margin < 15 GB."""
        caplog.set_level(logging.ERROR, logger="MangaDownloader")
        pipeline = MangaPipeline(output_root=str(tmp_path))

        with patch.object(IntegrityGuard, "check_disk_margin", return_value=False):
            ch_info = {"chapter": "1", "volume": "1", "candidates": [{"id": "c1"}]}
            manga_dir = tmp_path / "Solo Leveling"
            temp_cache = tmp_path / ".temp"

            result = pipeline.download_chapter_group(
                ch_info=ch_info,
                manga_dir=manga_dir,
                temp_cache=temp_cache
            )

            assert result is False
            assert any("Margen de disco insuficiente" in r.message for r in caplog.records)
            # Ensure no network requests or temp dirs were created
            assert not (temp_cache / "c1").exists()

    def test_pipeline_process_manga_halts_on_low_disk(self, tmp_path: Path, caplog):
        """MangaPipeline.process_manga halts before search/fetch if disk margin < 15 GB."""
        caplog.set_level(logging.ERROR, logger="MangaDownloader")
        pipeline = MangaPipeline(output_root=str(tmp_path))

        with patch.object(IntegrityGuard, "check_disk_margin", return_value=False):
            result = pipeline.process_manga(title="Solo Leveling")
            assert result is False
            assert any("Espacio en disco insuficiente" in r.message for r in caplog.records)


# ==============================================================================
# 4. Queue Integrity & Synthetic/Blacklisted UUID Verification
# ==============================================================================

class TestAdversarialQueueIntegrityAndBlacklistExclusion:
    """Rigorous verification that no synthetic, blacklisted, or malformed UUIDs exist in production queue."""

    @pytest.fixture(scope="class")
    @classmethod
    def queue_json(cls) -> Dict[str, Any]:
        with open(QUEUE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    @pytest.fixture(scope="class")
    @classmethod
    def series_list(cls, queue_json: Dict[str, Any]) -> List[Dict[str, Any]]:
        return queue_json["series"]

    def test_total_series_count_is_strictly_53(self, queue_json: Dict[str, Any], series_list: List[Dict[str, Any]]):
        assert queue_json.get("total_series") == 53
        assert len(series_list) == 53

    def test_zero_blacklisted_fabricated_uuids_in_queue(self, series_list: List[Dict[str, Any]]):
        """Verify that NONE of the 16 blacklisted fabricated UUIDs from earlier iterations are present."""
        found_blacklisted = []
        for s in series_list:
            mid = s.get("mangadex_id")
            if mid and mid in BLACKLISTED_FABRICATED_UUIDS:
                found_blacklisted.append((s["id"], mid))

        assert len(found_blacklisted) == 0, f"Found blacklisted fabricated UUIDs: {found_blacklisted}"

    def test_exactly_49_valid_rfc4122_v4_uuids(self, series_list: List[Dict[str, Any]]):
        """Verify that exactly 49 series have valid, standard RFC 4122 UUIDs."""
        non_null_uuids = [s["mangadex_id"] for s in series_list if s.get("mangadex_id") is not None]
        assert len(non_null_uuids) == 49

        for uid in non_null_uuids:
            assert UUID_REGEX.match(uid), f"UUID does not match canonical regex: {uid}"
            parsed = uuid.UUID(uid)
            assert str(parsed) == uid.lower()
            assert parsed.version == 4, f"UUID {uid} is not RFC 4122 v4 (version={parsed.version})"

    def test_all_mangadex_ids_are_globally_unique(self, series_list: List[Dict[str, Any]]):
        """No duplicate MangaDex IDs among all entries."""
        non_null_uuids = [s["mangadex_id"] for s in series_list if s.get("mangadex_id") is not None]
        unique_uuids = set(non_null_uuids)
        assert len(unique_uuids) == len(non_null_uuids) == 49

    def test_no_dummy_trivial_or_placeholder_uuids(self, series_list: List[Dict[str, Any]]):
        """Reject trivial patterns like 00000000-..., 11111111-..., 12345678-..., or dummy text."""
        trivial_prefixes = ("00000000-", "11111111-", "12345678-", "ffffffff-", "deadbeef-")
        for s in series_list:
            mid = s.get("mangadex_id")
            if mid:
                for prefix in trivial_prefixes:
                    assert not mid.startswith(prefix), f"Series '{s['id']}' has trivial UUID: {mid}"

    def test_verified_remediated_canonical_uuids_match_exact_values(self, series_list: List[Dict[str, Any]]):
        """Verify all 12 known remediated series have their exact verified canonical UUIDs."""
        lookup = {s["id"]: s.get("mangadex_id") for s in series_list}
        for slug, expected_uuid in VERIFIED_REMEDIATED_CANONICAL_UUIDS.items():
            assert slug in lookup, f"Remediated series '{slug}' missing from queue"
            actual_uuid = lookup[slug]
            assert actual_uuid == expected_uuid, (
                f"Series '{slug}' has mismatching UUID: expected {expected_uuid}, got {actual_uuid}"
            )

    def test_unindexed_titles_are_strictly_restricted_to_allowed_dmca_set(self, series_list: List[Dict[str, Any]]):
        """Only the 4 authorized DMCA titles may have mangadex_id=None."""
        null_series = [s["id"] for s in series_list if s.get("mangadex_id") is None]
        assert set(null_series) == EXPECTED_UNHOSTED_DMCA_SLUGS
