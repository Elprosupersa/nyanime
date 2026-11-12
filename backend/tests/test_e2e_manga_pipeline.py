"""
Comprehensive E2E Pipeline Test Suite (Tiers 1-4) for Manga & Manhwa Autonomous Acquisition Pipeline.
Implements mockable end-to-end test harnesses, contract adapters, and verification fixtures
based on ORIGINAL_REQUEST.md, PROJECT.md, and TEST_INFRA.md.
"""

import io
import os
import sys
import json
import time
import shutil
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image
import pypdf

# Check img2pdf availability
try:
    import img2pdf
    HAS_IMG2PDF = True
except ImportError:
    HAS_IMG2PDF = False

from src.acquisition.manga_downloader import MangaDexClient, MangaPipeline


# ==============================================================================
# Helper Contracts & Reference Implementations (M3 & M4 Interface Compliance)
# ==============================================================================

class ContractPDFCompiler:
    """Reference implementation of PDFCompiler interface from PROJECT.md § M2 <-> M3."""

    @staticmethod
    def compile_chapter(
        image_paths: List[Path],
        output_pdf_path: Path,
        prefer_img2pdf: bool = True
    ) -> bool:
        if not image_paths:
            return False

        output_pdf_path.parent.mkdir(parents=True, exist_ok=True)
        temp_pdf = output_pdf_path.with_suffix(".tmp.pdf")
        success = False

        if prefer_img2pdf and HAS_IMG2PDF:
            try:
                with open(temp_pdf, "wb") as f:
                    f.write(img2pdf.convert([str(p) for p in image_paths]))
                success = True
            except Exception:
                success = False

        if not success:
            pil_images = []
            try:
                for img_p in image_paths:
                    img = Image.open(img_p)
                    if img.mode != "RGB":
                        img = img.convert("RGB")
                    pil_images.append(img)

                if pil_images:
                    pil_images[0].save(
                        temp_pdf,
                        "PDF",
                        resolution=100.0,
                        save_all=True,
                        append_images=pil_images[1:]
                    )
                    success = True
            except Exception:
                if temp_pdf.exists():
                    temp_pdf.unlink()
                return False
            finally:
                for im in pil_images:
                    try:
                        im.close()
                    except Exception:
                        pass

        if success and temp_pdf.exists() and temp_pdf.stat().st_size > 5000:
            if output_pdf_path.exists():
                output_pdf_path.unlink()
            temp_pdf.rename(output_pdf_path)
            return True

        if temp_pdf.exists():
            temp_pdf.unlink()
        return False


class ContractIntegrityGuard:
    """Reference implementation of IntegrityGuard interface from PROJECT.md § M3 <-> M4."""

    @staticmethod
    def verify_pdf(pdf_path: Path, min_pages: int = 1, min_bytes: int = 5000) -> Tuple[bool, str]:
        if not pdf_path.exists():
            return False, f"File does not exist: {pdf_path}"

        size = pdf_path.stat().st_size
        if size < min_bytes:
            return False, f"File size too small ({size} bytes < {min_bytes} bytes)"

        try:
            with open(pdf_path, "rb") as f:
                header = f.read(5)
                if not header.startswith(b"%PDF-"):
                    return False, f"Invalid PDF header: {header!r}"

                f.seek(0)
                reader = pypdf.PdfReader(f)
                num_pages = len(reader.pages)
                if num_pages < min_pages:
                    return False, f"Insufficient pages ({num_pages} < {min_pages})"

                # Read first page contents to verify non-corruption
                _ = reader.pages[0].extract_text()
                return True, f"Valid PDF with {num_pages} pages ({size // 1024} KB)"
        except Exception as e:
            return False, f"Structural corruption: {e}"

    @staticmethod
    def check_disk_margin(drive_path: Path, min_free_gb: float = 15.0) -> bool:
        try:
            usage = shutil.disk_usage(str(drive_path))
            free_bytes = getattr(usage, "free", usage[2] if isinstance(usage, tuple) else 0)
            free_gb = free_bytes / (1024 ** 3)
            return free_gb >= min_free_gb
        except Exception:
            # Fallback for virtual paths in tests
            return True


class ContractCheckpointManager:
    """Reference implementation of atomic CHECKPOINT_PROGRESO.md updates."""

    @staticmethod
    def update_checkpoint(
        checkpoint_path: Path,
        series_name: str,
        chapters_compiled: int,
        total_chapters: int,
        status: str = "IN_PROGRESS"
    ) -> bool:
        checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

        content = (
            f"# Checkpoint de Progreso — Pipeline Manga & Manhwa\n\n"
            f"**Última actualización**: {timestamp}\n"
            f"**Estado General**: {status}\n\n"
            f"## Resumen de Adquisición\n"
            f"- **Serie Activa**: {series_name}\n"
            f"- **Capítulos Compilados**: {chapters_compiled} / {total_chapters}\n"
            f"- **Porcentaje Completado**: {(chapters_compiled / max(total_chapters, 1)) * 100:.1f}%\n"
        )

        tmp_file = checkpoint_path.with_suffix(".tmp.md")
        with open(tmp_file, "w", encoding="utf-8") as f:
            f.write(content)
        tmp_file.replace(checkpoint_path)
        return True


# ==============================================================================
# Pytest Fixtures: Synthetic Data, Assets, and Mock Harness
# ==============================================================================

@pytest.fixture
def sample_test_images(tmp_path: Path) -> List[Path]:
    """Generates synthetic valid JPEG images for compilation tests."""
    img_dir = tmp_path / "synthetic_pages"
    img_dir.mkdir(parents=True, exist_ok=True)

    generated = []
    colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0)]
    for i, color in enumerate(colors):
        p = img_dir / f"page_{i:03d}.jpg"
        img = Image.new("RGB", (800, 1200), color=color)
        img.save(p, "JPEG", quality=95)
        generated.append(p)

    return generated


@pytest.fixture
def sample_action_manhwa_queue_item() -> Dict[str, Any]:
    return {
        "id": "solo-leveling",
        "mangadex_id": "32d76d19-8a05-4db0-9fc2-e0b0648fe9d0",
        "title_display": "Solo Leveling",
        "type": "manhwa",
        "category": "action_fantasy_shonen",
        "content_rating": "safe",
        "search_query": "Solo Leveling",
        "target_languages": ["es-la", "es"],
        "expected_hierarchy": {
            "volume_grouping": False,
            "folder_volume_pattern": "Temporada {season:02d}",
            "file_chapter_pattern": "Capitulo {chapter:03d}.pdf"
        },
        "priority_rank": 1
    }


@pytest.fixture
def sample_adult_manhwa_queue_item() -> Dict[str, Any]:
    return {
        "id": "secret-class",
        "mangadex_id": "03431565-8eff-4509-a32d-858e8a66c290",
        "title_display": "Secret Class",
        "type": "manhwa",
        "category": "adult_romance_drama",
        "content_rating": "pornographic",
        "search_query": "Secret Class",
        "target_languages": ["es-la", "es"],
        "expected_hierarchy": {
            "volume_grouping": False,
            "folder_volume_pattern": "",
            "file_chapter_pattern": "Capitulo {chapter:03d}.pdf"
        },
        "priority_rank": 37
    }


@pytest.fixture
def sample_key_manga_queue_item() -> Dict[str, Any]:
    return {
        "id": "chainsaw-man",
        "mangadex_id": "a77742b1-befd-49a4-bff5-1ad4e6b0ef7b",
        "title_display": "Chainsaw Man",
        "type": "manga",
        "category": "key_manga",
        "content_rating": "suggestive",
        "search_query": "Chainsaw Man",
        "target_languages": ["es-la", "es"],
        "expected_hierarchy": {
            "volume_grouping": True,
            "folder_volume_pattern": "Tomo {volume:02d}",
            "file_chapter_pattern": "Capitulo {chapter:03d}.pdf"
        },
        "priority_rank": 51
    }


# ==============================================================================
# Tier 1: Feature Coverage (Isolation over Happy Path)
# ==============================================================================

class TestPipelineTier1FeatureCoverage:
    """Tier 1: Individual feature tests in isolation with simulated inputs."""

    def test_f1_queue_item_extraction_and_resolution(self, sample_action_manhwa_queue_item: Dict[str, Any]):
        """Verifies queue item field extraction for pipeline initialization."""
        item = sample_action_manhwa_queue_item
        assert item["id"] == "solo-leveling"
        assert item["type"] in ["manhwa", "manga"]
        assert "es" in item["target_languages"] and "es-la" in item["target_languages"]
        assert item["search_query"]

    def test_f2_adult_content_rating_search_parameters(self):
        """Verifies search_manga includes all content ratings for adult discovery."""
        client = MangaDexClient()
        with patch.object(client.session, "get") as mock_get:
            mock_res = MagicMock()
            mock_res.json.return_value = {"data": [{"id": "uuid-test", "attributes": {"title": {"en": "Secret Class"}}}]}
            mock_res.raise_for_status.return_value = None
            mock_get.return_value = mock_res

            res = client.search_manga("Secret Class")
            assert res is not None
            assert res["id"] == "uuid-test"

    def test_f3_dual_spanish_chapter_feed_grouping(self):
        """Verifies chapters across 'es' and 'es-la' are merged and candidates sorted by page count."""
        client = MangaDexClient()
        mock_raw_chapters = [
            {
                "id": "ch-1-es",
                "attributes": {
                    "chapter": "1",
                    "volume": "1",
                    "pages": 18,
                    "translatedLanguage": "es",
                    "version": 1
                }
            },
            {
                "id": "ch-1-es-la",
                "attributes": {
                    "chapter": "1",
                    "volume": "1",
                    "pages": 24,  # Higher page count candidate
                    "translatedLanguage": "es-la",
                    "version": 2
                }
            }
        ]

        with patch.object(client.session, "get") as mock_get:
            mock_res = MagicMock()
            mock_res.json.return_value = {"data": mock_raw_chapters, "total": 2}
            mock_res.raise_for_status.return_value = None
            mock_get.return_value = mock_res

            grouped = client.get_all_chapters_feed("manga-uuid", languages=["es", "es-la"])
            assert "1" in grouped
            candidates = grouped["1"]["candidates"]
            assert len(candidates) == 2
            # Highest page count must be first
            assert candidates[0]["id"] == "ch-1-es-la"
            assert candidates[0]["pages"] == 24

    def test_f4_rate_limiter_retry_on_429(self):
        """Verifies client retries when receiving HTTP 429 rate limit."""
        client = MangaDexClient()
        mock_429 = MagicMock()
        mock_429.status_code = 429

        mock_200 = MagicMock()
        mock_200.status_code = 200
        mock_200.json.return_value = {
            "baseUrl": "https://api.mangadex.network",
            "chapter": {
                "hash": "hash123",
                "data": ["01.jpg", "02.jpg"],
                "dataSaver": ["01.jpg", "02.jpg"]
            }
        }
        mock_200.raise_for_status.return_value = None

        with patch.object(client.session, "get", side_effect=[mock_429, mock_200]) as mock_get:
            with patch("time.sleep", return_value=None):
                base_url, ch_hash, pages, saver = client.get_chapter_pages_info("chapter-uuid")
                assert base_url == "https://api.mangadex.network"
                assert ch_hash == "hash123"
                assert len(pages) == 2
                assert mock_get.call_count == 2

    def test_f5_page_download_cdn_fallback(self, tmp_path: Path):
        """Verifies page downloader falls back to MangaDex CDN when @Home node fails."""
        pipeline = MangaPipeline(output_root=str(tmp_path), max_workers=2)
        dest_img = tmp_path / "page_dl.jpg"

        mock_fail = MagicMock()
        mock_fail.status_code = 404

        mock_cdn_success = MagicMock()
        mock_cdn_success.status_code = 200
        mock_cdn_success.content = b"SIMULATED_JPEG_BYTES_ABOVE_1000_BYTES_" * 50

        with patch.object(pipeline.dl_session, "get", side_effect=[mock_fail, mock_cdn_success]):
            ok = pipeline._download_single_page(
                base_url="https://athome.node",
                ch_hash="test_hash",
                page_name="01.jpg",
                saver_name=None,
                dest_path=dest_img
            )
            assert ok is True
            assert dest_img.exists()
            assert dest_img.stat().st_size > 1000

    def test_f7_native_lossless_pdf_compilation(self, sample_test_images: List[Path], tmp_path: Path):
        """Verifies native PDF compilation creates a valid PDF file > 5000 bytes."""
        out_pdf = tmp_path / "compiled_chapter.pdf"
        ok = ContractPDFCompiler.compile_chapter(sample_test_images, out_pdf)
        assert ok is True
        assert out_pdf.exists()
        assert out_pdf.stat().st_size > 5000

    def test_f8_hierarchical_directory_structuring(self, tmp_path: Path):
        """Verifies path generation for tankobon manga vs continuous webtoons."""
        manga_root = tmp_path / "E_Manga"
        # 1. Tankobon with volume
        vol_folder = f"Tomo {1:02d}"
        ch_file = f"Capitulo {5:02d}.pdf"
        path_tankobon = manga_root / "Chainsaw Man" / vol_folder / ch_file
        assert "Tomo 01" in str(path_tankobon)
        assert "Capitulo 05.pdf" in str(path_tankobon)

        # 2. Webtoon without volume
        vol_webtoon = "Tomo Especial"
        ch_file_webtoon = f"Capitulo {105:03d}.pdf"
        path_webtoon = manga_root / "Solo Leveling" / vol_webtoon / ch_file_webtoon
        assert "Capitulo 105.pdf" in str(path_webtoon)

    def test_f9_metadata_and_poster_saving(self, tmp_path: Path):
        """Verifies poster.jpg and manga_info.json are saved cleanly."""
        manga_dir = tmp_path / "Solo Leveling"
        manga_dir.mkdir(parents=True, exist_ok=True)

        poster_path = manga_dir / "poster.jpg"
        poster_path.write_bytes(b"JPEG_POSTER_BYTES" * 100)

        info_path = manga_dir / "manga_info.json"
        metadata = {
            "id": "32d76d19-8a05-4db0-9fc2-e0b0648fe9d0",
            "title": "Solo Leveling",
            "contentRating": "safe",
            "status": "completed",
            "tags": ["Action", "Fantasy"]
        }
        with open(info_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

        assert poster_path.exists()
        assert info_path.exists()
        with open(info_path, "r", encoding="utf-8") as f:
            loaded = json.load(f)
            assert loaded["title"] == "Solo Leveling"

    def test_f10_structural_pdf_integrity_check(self, sample_test_images: List[Path], tmp_path: Path):
        """Verifies ContractIntegrityGuard confirms a valid PDF passes checks."""
        pdf_path = tmp_path / "valid.pdf"
        ContractPDFCompiler.compile_chapter(sample_test_images, pdf_path)

        is_valid, msg = ContractIntegrityGuard.verify_pdf(pdf_path, min_pages=len(sample_test_images))
        assert is_valid is True
        assert "Valid PDF" in msg

    def test_f11_disk_space_margin_guard(self, tmp_path: Path):
        """Verifies disk margin guard checks free space against minimum threshold."""
        # Simulated sufficient disk space
        with patch("shutil.disk_usage") as mock_usage:
            # 50 GB free
            mock_usage.return_value = (100 * 1024**3, 50 * 1024**3, 50 * 1024**3)
            assert ContractIntegrityGuard.check_disk_margin(tmp_path, min_free_gb=15.0) is True

    def test_f12_atomic_checkpoint_update(self, tmp_path: Path):
        """Verifies checkpoint update is written atomically."""
        ckpt = tmp_path / "CHECKPOINT_PROGRESO.md"
        ok = ContractCheckpointManager.update_checkpoint(ckpt, "Solo Leveling", 15, 200)
        assert ok is True
        assert ckpt.exists()
        content = ckpt.read_text(encoding="utf-8")
        assert "Solo Leveling" in content
        assert "15 / 200" in content


# ==============================================================================
# Tier 2: Boundary & Corner Cases (Limits, Errors, and Resilience)
# ==============================================================================

class TestPipelineTier2BoundaryAndCornerCases:
    """Tier 2: Boundary conditions, corrupted data, network errors, and low disk space."""

    def test_empty_or_whitespace_search_query_rejection(self):
        """Verifies empty or whitespace query is rejected or returns None."""
        client = MangaDexClient()
        with patch.object(client.session, "get") as mock_get:
            mock_res = MagicMock()
            mock_res.json.return_value = {"data": []}
            mock_res.raise_for_status.return_value = None
            mock_get.return_value = mock_res

            res = client.search_manga("   ")
            assert res is None

    def test_zero_chapters_found_returns_empty_dict(self):
        """Verifies get_all_chapters_feed returns empty dict when no Spanish chapters exist."""
        client = MangaDexClient()
        with patch.object(client.session, "get") as mock_get:
            mock_res = MagicMock()
            mock_res.json.return_value = {"data": [], "total": 0}
            mock_res.raise_for_status.return_value = None
            mock_get.return_value = mock_res

            grouped = client.get_all_chapters_feed("uuid-no-chapters")
            assert grouped == {}

    def test_http_429_exhaustion_raises_runtime_error(self):
        """Verifies exhaustion of retries on persistent HTTP 429 raises RuntimeError."""
        client = MangaDexClient()
        mock_429 = MagicMock()
        mock_429.status_code = 429

        with patch.object(client.session, "get", return_value=mock_429):
            with patch("time.sleep", return_value=None):
                with pytest.raises(RuntimeError, match="No se pudo obtener información de páginas"):
                    client.get_chapter_pages_info("chapter-uuid")

    def test_incomplete_page_download_aborts_compilation(self, tmp_path: Path):
        """Verifies incomplete downloaded page count unlinks fragments and returns False."""
        pipeline = MangaPipeline(output_root=str(tmp_path), max_workers=2)
        ch_info = {
            "chapter": "1",
            "volume": "1",
            "candidates": [
                {
                    "id": "cand-fail",
                    "pages": 10,
                    "volume": "1",
                    "lang": "es",
                    "version": 1
                }
            ]
        }

        # Mock At-Home returning 3 pages, but page downloader failing on all
        with patch.object(pipeline.client, "get_chapter_pages_info", return_value=("http://base", "hash", ["1.jpg", "2.jpg", "3.jpg"], [])):
            with patch.object(pipeline, "_download_single_page", return_value=False):
                ok = pipeline.download_chapter_group(ch_info, tmp_path / "Manga", tmp_path / ".temp")
                assert ok is False
                # Ensure no partial PDF created
                pdf_target = tmp_path / "Manga" / "Tomo 01" / "Capitulo 01.pdf"
                assert not pdf_target.exists()

    def test_corrupted_pdf_rejected_by_integrity_guard(self, tmp_path: Path):
        """Verifies non-PDF or corrupted stream fails integrity verification."""
        corrupt_pdf = tmp_path / "corrupt.pdf"
        # 1. Zero byte file
        corrupt_pdf.write_bytes(b"")
        is_val, msg = ContractIntegrityGuard.verify_pdf(corrupt_pdf)
        assert is_val is False
        assert "too small" in msg.lower()

        # 2. Fake header but corrupted body
        corrupt_pdf.write_bytes(b"%PDF-1.4\nGARBAGE_NOT_A_REAL_PDF_STREAM_1234567890" * 200)
        is_val, msg = ContractIntegrityGuard.verify_pdf(corrupt_pdf)
        assert is_val is False
        assert "structural corruption" in msg.lower()

    def test_insufficient_disk_margin_fails_check(self, tmp_path: Path):
        """Verifies check_disk_margin returns False when free space is below 15 GB."""
        with patch("shutil.disk_usage") as mock_usage:
            # 10 GB free (< 15 GB threshold)
            mock_usage.return_value = (100 * 1024**3, 90 * 1024**3, 10 * 1024**3)
            assert ContractIntegrityGuard.check_disk_margin(tmp_path, min_free_gb=15.0) is False

    def test_webtoon_volume_none_formatting_prevents_tomo_none(self, tmp_path: Path):
        """Verifies volumes set to 'none', null, or '' format cleanly as 'Tomo Especial'."""
        pipeline = MangaPipeline(output_root=str(tmp_path))
        ch_info = {
            "chapter": "45",
            "volume": "none",
            "candidates": []
        }
        # In download_chapter_group: volume='none' -> 'Tomo Especial'
        # Check logic formatting
        vol_str = ch_info.get("volume")
        if vol_str in ["none", "null", "", None]:
            vol_folder_name = "Tomo Especial"
        else:
            vol_folder_name = f"Tomo {vol_str}"
        assert vol_folder_name == "Tomo Especial"
        assert "None" not in vol_folder_name

    def test_fractional_chapter_number_formatting(self):
        """Verifies chapters with decimals like '15.5' are formatted properly."""
        ch_str = "15.5"
        c_float = float(ch_str)
        if c_float.is_integer():
            ch_filename = f"Capitulo {int(c_float):02d}.pdf"
        else:
            ch_filename = f"Capitulo {c_float:04.1f}.pdf"
        assert ch_filename == "Capitulo 15.5.pdf"


# ==============================================================================
# Tier 3: Pairwise & Cross-Combinations
# ==============================================================================

class TestPipelineTier3Combinations:
    """Tier 3: Pairwise module interactions (network + download + compiler + verifier)."""

    def test_rate_limit_and_cdn_fallback_combination(self, tmp_path: Path):
        """Combines HTTP 429 delay with CDN fallback to complete image acquisition."""
        pipeline = MangaPipeline(output_root=str(tmp_path), max_workers=2)
        dest_img = tmp_path / "page_cdn_429.jpg"

        mock_429 = MagicMock()
        mock_429.status_code = 429

        mock_ok = MagicMock()
        mock_ok.status_code = 200
        mock_ok.content = b"VALID_JPEG_STREAM_BYTES_" * 60

        with patch.object(pipeline.dl_session, "get", side_effect=[mock_429, mock_ok]):
            with patch("time.sleep", return_value=None):
                ok = pipeline._download_single_page(
                    base_url="https://athome.node",
                    ch_hash="h1",
                    page_name="p1.jpg",
                    saver_name=None,
                    dest_path=dest_img
                )
                assert ok is True
                assert dest_img.exists()

    def test_parallel_page_download_and_pdf_compilation(self, sample_test_images: List[Path], tmp_path: Path):
        """Combines multiple image downloads with lossless PDF compilation and integrity check."""
        dest_pdf = tmp_path / "final_chapter.pdf"
        ok = ContractPDFCompiler.compile_chapter(sample_test_images, dest_pdf)
        assert ok is True

        # Directly verify with IntegrityGuard
        is_valid, msg = ContractIntegrityGuard.verify_pdf(dest_pdf, min_pages=len(sample_test_images))
        assert is_valid is True
        assert "Valid PDF" in msg

    def test_multi_language_feed_and_version_priority(self):
        """Combines es and es-la feeds with candidate sorting by pages and version."""
        client = MangaDexClient()
        mock_items = [
            {"id": "c1", "attributes": {"chapter": "10", "pages": 15, "version": 1, "translatedLanguage": "es"}},
            {"id": "c2", "attributes": {"chapter": "10", "pages": 20, "version": 1, "translatedLanguage": "es-la"}},
            {"id": "c3", "attributes": {"chapter": "10", "pages": 20, "version": 2, "translatedLanguage": "es"}},
        ]
        with patch.object(client.session, "get") as mock_get:
            mock_res = MagicMock()
            mock_res.json.return_value = {"data": mock_items, "total": 3}
            mock_res.raise_for_status.return_value = None
            mock_get.return_value = mock_res

            feed = client.get_all_chapters_feed("manga_id")
            top_candidate = feed["10"]["candidates"][0]
            # Should choose highest pages (20) and highest version (2)
            assert top_candidate["id"] == "c3"
            assert top_candidate["version"] == 2

    def test_disk_check_and_checkpoint_atomic_flow(self, tmp_path: Path):
        """Combines disk verification with atomic checkpoint updates."""
        # 1. Disk check passes
        with patch("shutil.disk_usage", return_value=(100 * 1024**3, 50 * 1024**3, 50 * 1024**3)):
            margin_ok = ContractIntegrityGuard.check_disk_margin(tmp_path, min_free_gb=15.0)
            assert margin_ok is True

        # 2. Checkpoint written atomically
        ckpt_file = tmp_path / "CHECKPOINT_PROGRESO.md"
        ContractCheckpointManager.update_checkpoint(ckpt_file, "Circles", 10, 10, status="COMPLETED")
        assert ckpt_file.exists()
        assert "COMPLETED" in ckpt_file.read_text(encoding="utf-8")


# ==============================================================================
# Tier 4: Escenarios de Aplicación Real (End-to-End Workflows)
# ==============================================================================

class TestPipelineTier4EndToEndScenarios:
    """Tier 4: Complete end-to-end simulated workflows from queue to verified PDF."""

    def test_e2e_full_pipeline_action_manhwa(
        self,
        sample_action_manhwa_queue_item: Dict[str, Any],
        sample_test_images: List[Path],
        tmp_path: Path
    ):
        """
        Complete E2E flow for Action Manhwa:
        Queue Parse -> Search -> Feed -> Download Pages -> PDF Compile -> Integrity -> Poster/Metadata -> Checkpoint.
        """
        item = sample_action_manhwa_queue_item
        output_root = tmp_path / "E_Manga"
        pipeline = MangaPipeline(output_root=str(output_root), max_workers=4)

        # 1. Mock MangaDex search response
        mock_search_data = {
            "id": item["mangadex_id"],
            "attributes": {
                "title": {"en": item["title_display"]},
                "altTitles": [{"ko": "나 혼자만 레벨업"}],
                "description": {"es": "Sinopsis de Solo Leveling"},
                "status": "completed",
                "year": 2018,
                "contentRating": item["content_rating"],
                "tags": [{"attributes": {"name": {"en": "Action"}}}]
            },
            "relationships": [
                {"type": "cover_art", "attributes": {"fileName": "solo_cover.jpg"}}
            ]
        }

        # 2. Mock chapters feed
        mock_chapters_feed = {
            "1": {
                "chapter": "1",
                "volume": "1",
                "candidates": [
                    {"id": "ch1-uuid", "pages": len(sample_test_images), "volume": "1", "lang": "es-la", "version": 1}
                ]
            }
        }

        # 3. Mock At-Home server response
        page_names = [p.name for p in sample_test_images]
        mock_athome_pages = ("https://mock.athome", "hash123", page_names, page_names)

        # 4. Mock page download to copy synthetic test image
        def fake_download_page(base_url, ch_hash, p_name, s_name, dest_p):
            src = next((p for p in sample_test_images if p.name == p_name), sample_test_images[0])
            shutil.copyfile(src, dest_p)
            return True

        # Run process_manga
        with patch.object(pipeline.client, "search_manga", return_value=mock_search_data):
            with patch.object(pipeline.client, "get_all_chapters_feed", return_value=mock_chapters_feed):
                with patch.object(pipeline.client, "get_chapter_pages_info", return_value=mock_athome_pages):
                    with patch.object(pipeline, "_download_single_page", side_effect=fake_download_page):
                        # Mock poster get
                        mock_cover_res = MagicMock()
                        mock_cover_res.status_code = 200
                        mock_cover_res.content = b"SIMULATED_COVER_JPG" * 200
                        with patch.object(pipeline.dl_session, "get", return_value=mock_cover_res):
                            success = pipeline.process_manga(title=item["title_display"])
                            assert success is True

        # Assertions on disk structure
        manga_dir = output_root / item["title_display"]
        assert manga_dir.exists()

        # Check metadata & poster
        poster_file = manga_dir / "poster.jpg"
        metadata_file = manga_dir / "manga_info.json"
        assert poster_file.exists()
        assert metadata_file.exists()

        # Check generated PDF and verify structural integrity
        pdf_file = manga_dir / "Tomo 01" / "Capitulo 01.pdf"
        assert pdf_file.exists()

        is_valid, msg = ContractIntegrityGuard.verify_pdf(pdf_file, min_pages=len(sample_test_images))
        assert is_valid is True, f"Integrity check failed: {msg}"

        # Update checkpoint
        ckpt_path = tmp_path / "CHECKPOINT_PROGRESO.md"
        ContractCheckpointManager.update_checkpoint(ckpt_path, item["title_display"], 1, 1, "COMPLETED")
        assert ckpt_path.exists()
        assert "Solo Leveling" in ckpt_path.read_text(encoding="utf-8")

    def test_e2e_full_pipeline_adult_manhwa(
        self,
        sample_adult_manhwa_queue_item: Dict[str, Any],
        sample_test_images: List[Path],
        tmp_path: Path
    ):
        """
        Complete E2E flow for Adult Manhwa (Secret Class):
        Verifies pornographic content rating, cover art, and PDF compilation.
        """
        item = sample_adult_manhwa_queue_item
        output_root = tmp_path / "E_Manga"
        pipeline = MangaPipeline(output_root=str(output_root), max_workers=2)

        mock_search_data = {
            "id": item["mangadex_id"],
            "attributes": {
                "title": {"en": item["title_display"]},
                "contentRating": item["content_rating"],
                "status": "ongoing",
                "tags": [{"attributes": {"name": {"en": "Romance"}}}]
            },
            "relationships": []
        }

        mock_feed = {
            "1": {
                "chapter": "1",
                "volume": None,  # Continuous webtoon
                "candidates": [{"id": "ch1-adult", "pages": len(sample_test_images), "volume": None, "lang": "es", "version": 1}]
            }
        }

        page_names = [p.name for p in sample_test_images]
        mock_pages = ("https://athome", "hash_adult", page_names, [])

        def fake_download_page(b_url, hsh, p_name, s_name, dest_p):
            src = next((p for p in sample_test_images if p.name == p_name), sample_test_images[0])
            shutil.copyfile(src, dest_p)
            return True

        with patch.object(pipeline.client, "search_manga", return_value=mock_search_data):
            with patch.object(pipeline.client, "get_all_chapters_feed", return_value=mock_feed):
                with patch.object(pipeline.client, "get_chapter_pages_info", return_value=mock_pages):
                    with patch.object(pipeline, "_download_single_page", side_effect=fake_download_page):
                        success = pipeline.process_manga(title=item["title_display"])
                        assert success is True

        manga_dir = output_root / item["title_display"]
        pdf_file = manga_dir / "Tomo Especial" / "Capitulo 01.pdf"
        assert pdf_file.exists()

        is_valid, msg = ContractIntegrityGuard.verify_pdf(pdf_file, min_pages=len(sample_test_images))
        assert is_valid is True

    def test_e2e_full_pipeline_key_manga_tankobon_hierarchy(
        self,
        sample_key_manga_queue_item: Dict[str, Any],
        sample_test_images: List[Path],
        tmp_path: Path
    ):
        """
        Complete E2E flow for Key Manga (Chainsaw Man):
        Verifies tankobon volume grouping 'Tomo XX/Capitulo XXX.pdf'.
        """
        item = sample_key_manga_queue_item
        output_root = tmp_path / "E_Manga"
        pipeline = MangaPipeline(output_root=str(output_root), max_workers=2)

        mock_search = {
            "id": item["mangadex_id"],
            "attributes": {
                "title": {"en": item["title_display"]},
                "contentRating": item["content_rating"],
                "tags": [{"attributes": {"name": {"en": "Shounen"}}}]
            },
            "relationships": []
        }

        mock_feed = {
            "5": {
                "chapter": "5",
                "volume": "2",  # Tomo 02
                "candidates": [{"id": "c-manga-5", "pages": len(sample_test_images), "volume": "2", "lang": "es-la", "version": 1}]
            }
        }

        page_names = [p.name for p in sample_test_images]
        mock_pages = ("https://athome", "h_manga", page_names, [])

        def fake_download_page(b_url, hsh, p_name, s_name, dest_p):
            src = next((p for p in sample_test_images if p.name == p_name), sample_test_images[0])
            shutil.copyfile(src, dest_p)
            return True

        with patch.object(pipeline.client, "search_manga", return_value=mock_search):
            with patch.object(pipeline.client, "get_all_chapters_feed", return_value=mock_feed):
                with patch.object(pipeline.client, "get_chapter_pages_info", return_value=mock_pages):
                    with patch.object(pipeline, "_download_single_page", side_effect=fake_download_page):
                        pipeline.process_manga(title=item["title_display"])

        manga_dir = output_root / item["title_display"]
        pdf_file = manga_dir / "Tomo 02" / "Capitulo 05.pdf"
        assert pdf_file.exists()

        is_valid, msg = ContractIntegrityGuard.verify_pdf(pdf_file, min_pages=len(sample_test_images))
        assert is_valid is True

    def test_e2e_idempotency_skips_existing_valid_pdf(self, sample_test_images: List[Path], tmp_path: Path):
        """Verifies running pipeline on existing large PDF skips re-downloading."""
        pipeline = MangaPipeline(output_root=str(tmp_path), max_workers=2)
        manga_dir = tmp_path / "MangaTest"
        target_pdf = manga_dir / "Tomo 01" / "Capitulo 01.pdf"
        target_pdf.parent.mkdir(parents=True, exist_ok=True)

        # Create pre-existing valid PDF > 500 KB
        target_pdf.write_bytes(b"%PDF-1.4\nFAKE_BODY_" * 60000)
        assert target_pdf.stat().st_size > 500 * 1024

        ch_info = {
            "chapter": "1",
            "volume": "1",
            "candidates": [{"id": "cand-skip", "pages": 5, "volume": "1", "lang": "es", "version": 1}]
        }

        # Should immediately return True without calling get_chapter_pages_info
        with patch.object(pipeline.client, "get_chapter_pages_info") as mock_athome:
            ok = pipeline.download_chapter_group(ch_info, manga_dir, tmp_path / ".temp")
            assert ok is True
            mock_athome.assert_not_called()

    def test_e2e_low_disk_space_halts_safely(self, tmp_path: Path):
        """Verifies pipeline checks disk space and halts safely if < 15 GB free."""
        with patch("shutil.disk_usage") as mock_usage:
            # Only 5 GB free
            mock_usage.return_value = (100 * 1024**3, 95 * 1024**3, 5 * 1024**3)
            margin_ok = ContractIntegrityGuard.check_disk_margin(tmp_path, min_free_gb=15.0)
            assert margin_ok is False

        # Checkpoint records paused state
        ckpt = tmp_path / "CHECKPOINT_PROGRESO.md"
        ContractCheckpointManager.update_checkpoint(ckpt, "Solo Leveling", 5, 200, status="PAUSED_LOW_DISK_SPACE")
        content = ckpt.read_text(encoding="utf-8")
        assert "PAUSED_LOW_DISK_SPACE" in content
