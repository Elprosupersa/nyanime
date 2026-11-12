"""
Empirical Adversarial Test Suite for Milestone 5 (Final Consolidation & E2E Verification).
Challenger: challenger_m5_1

Exhaustively verifies:
1. Queue lookup in manhwa_top50_queue.json (schema, categories, UUIDs, dual Spanish mapping).
2. Token bucket rate limiting (<= 4.0 RPS sustained and concurrent multi-threaded execution).
3. Native lossless PDF compilation (checking size >= 10 KB, binary header b"%PDF-", zero RAM pixel bloat).
4. IntegrityGuard structural verification (valid PDFs, sub-10KB rejection, corrupt header, truncated streams).
5. Disk space margin guard (E: drive telemetry, threshold boundaries, unmounted drive fallback).
6. Atomic CheckpointManager operations (atomic rename, markdown structure, telemetry synchronization).
7. Full E2E autonomous pipeline lifecycle execution.
"""

import os
import io
import sys
import json
import time
import shutil
import tempfile
import threading
from pathlib import Path
from typing import List, Dict, Any
from unittest.mock import patch, MagicMock

import pytest
from PIL import Image
import pypdf

from src.acquisition.mangadex_client import (
    TokenBucketRateLimiter,
    MangaDexClient,
    SecondaryProvider,
    DEFAULT_MAX_RPS
)
from src.acquisition.pdf_compiler import (
    PDFCompiler,
    HierarchicalOrganizer,
    HAS_IMG2PDF
)
from src.acquisition.integrity_guard import IntegrityGuard
from src.acquisition.checkpoint_manager import CheckpointManager
from src.acquisition.manga_downloader import MangaPipeline, MangaDownloader

PROJECT_ROOT = Path(__file__).resolve().parent.parent
QUEUE_PATH = PROJECT_ROOT / "manhwa_top50_queue.json"


def _create_synthetic_jpeg(path: Path, width: int = 800, height: int = 1200, color: tuple = (200, 50, 50)) -> Path:
    """Creates a genuine, valid JPEG image file on disk."""
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (width, height), color=color)
    img.save(path, "JPEG", quality=85)
    return path


class TestEmpiricalQueueLookup:
    """Adversarial and structural verification of manhwa_top50_queue.json."""

    def test_queue_file_exists_and_parses(self):
        assert QUEUE_PATH.exists(), f"Queue file missing at {QUEUE_PATH}"
        with open(QUEUE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        assert data.get("total_series") == 53
        series_list = data.get("series", [])
        assert len(series_list) == 53

    def test_queue_contains_required_flagship_and_adult_titles(self):
        with open(QUEUE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        series = {s["id"]: s for s in data["series"]}

        # Action/Fantasy flagships
        for expected_id in ["solo-leveling", "omniscient-reader", "the-beginning-after-the-end", "tower-of-god"]:
            assert expected_id in series, f"Expected flagship '{expected_id}' not found in queue"
            item = series[expected_id]
            assert item.get("mangadex_id") is not None
            assert "es-la" in item.get("target_languages", [])
            assert "es" in item.get("target_languages", [])

        # Adult/Romance manhwas
        adult_count = sum(1 for s in data["series"] if s.get("content_rating") in ["erotica", "pornographic", "suggestive"])
        assert adult_count >= 15, f"Expected at least 15 adult/mature series, found {adult_count}"

        # Key Mangas (Tankobon hierarchy)
        for manga_id in ["chainsaw-man", "sousou-no-frieren", "dandadan"]:
            assert manga_id in series, f"Key manga '{manga_id}' not found in queue"
            manga_item = series[manga_id]
            assert manga_item.get("type") == "manga"
            assert manga_item.get("expected_hierarchy", {}).get("volume_grouping") is True


class TestEmpiricalTokenBucketRateLimiting:
    """Empirical rate limit verification: strictly enforcing <= 4.0 RPS."""

    def test_token_bucket_sustained_rate_limit(self):
        """Verifies that sustained acquisition after bucket drainage does not exceed 4.0 RPS."""
        limiter = TokenBucketRateLimiter(rate=4.0, capacity=4.0)

        # Drain the bucket completely
        assert limiter.acquire(4.0) is True

        # Now acquire 8 consecutive tokens. With rate=4.0 tokens/s, 8 tokens must take ~2.0s
        tokens_to_acquire = 8
        start_time = time.monotonic()
        for _ in range(tokens_to_acquire):
            acquired = limiter.acquire(1.0, timeout=5.0)
            assert acquired is True
        elapsed = time.monotonic() - start_time

        measured_rps = tokens_to_acquire / elapsed
        # Must strictly be <= 4.1 RPS (allowing tiny system timer granularity)
        assert elapsed >= 1.85, f"Acquisition was too fast: elapsed {elapsed:.3f}s for 8 tokens"
        assert measured_rps <= 4.10, f"Measured RPS {measured_rps:.2f} exceeded max rate 4.0"

    def test_token_bucket_concurrent_multithreaded_enforcement(self):
        """Verifies that concurrent requests from multiple worker threads never exceed rate limit."""
        limiter = TokenBucketRateLimiter(rate=4.0, capacity=4.0)
        # Drain initial tokens
        limiter.acquire(4.0)

        results = []
        num_threads = 6
        tokens_per_thread = 2  # Total 12 tokens -> ~3.0s

        def worker():
            for _ in range(tokens_per_thread):
                t_start = time.monotonic()
                success = limiter.acquire(1.0, timeout=10.0)
                t_end = time.monotonic()
                results.append((success, t_end - t_start))

        threads = [threading.Thread(target=worker) for _ in range(num_threads)]
        overall_start = time.monotonic()
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        overall_elapsed = time.monotonic() - overall_start

        assert len(results) == num_threads * tokens_per_thread
        assert all(success for success, _ in results)

        total_tokens = num_threads * tokens_per_thread
        measured_rps = total_tokens / overall_elapsed
        assert overall_elapsed >= 2.7, f"Concurrent acquisition too fast: {overall_elapsed:.3f}s for {total_tokens} tokens"
        assert measured_rps <= 4.15, f"Concurrent RPS {measured_rps:.2f} exceeded allowed boundary"


class TestEmpiricalPdfCompilationAndZeroRamBloat:
    """Empirical verification of native PDF compilation, file size >= 10 KB, and zero RAM pixel bloat."""

    def test_lossless_pdf_compilation_size_and_header(self, tmp_path):
        """Verifies compilation of multi-page chapter with genuine JPEG pages."""
        image_paths = []
        for i in range(5):
            img_file = tmp_path / f"page_{i+1:03d}.jpg"
            _create_synthetic_jpeg(img_file, width=900, height=1300, color=(10 * i, 40, 80 + 20 * i))
            image_paths.append(img_file)

        out_pdf = tmp_path / "Capitulo 001.pdf"
        success = PDFCompiler.compile_chapter(image_paths, out_pdf, prefer_img2pdf=True)
        assert success is True
        assert out_pdf.exists()

        file_size = out_pdf.stat().st_size
        # Must be >= 10 KB (10240 bytes)
        assert file_size >= 10 * 1024, f"Compiled PDF size {file_size} is below 10 KB minimum"

        # Binary header inspection
        with open(out_pdf, "rb") as f:
            header = f.read(5)
            assert header == b"%PDF-", f"Expected header b'%PDF-', got {header!r}"

    def test_zero_ram_pixel_bloat_architecture(self, tmp_path):
        """
        Empirically verifies that img2pdf embeds the raw JPEG DCT stream without decompression.
        If img2pdf is available, inspects that the page image filter is /DCTDecode (direct pass-through).
        """
        if not HAS_IMG2PDF:
            pytest.skip("img2pdf not installed in current environment")

        img_file = tmp_path / "page_001.jpg"
        _create_synthetic_jpeg(img_file, width=1000, height=1500)

        out_pdf = tmp_path / "Capitulo 001.pdf"
        success = PDFCompiler.compile_chapter([img_file], out_pdf, prefer_img2pdf=True)
        assert success is True

        reader = pypdf.PdfReader(str(out_pdf))
        page = reader.pages[0]
        # Inspect raw XObject dictionaries: img2pdf embeds JPEG streams with /DCTDecode
        x_objects = page.get("/Resources", {}).get("/XObject", {})
        found_dct = False
        for obj_name, obj_ref in x_objects.items():
            resolved = obj_ref.get_object()
            if resolved.get("/Subtype") == "/Image":
                filters = resolved.get("/Filter")
                if filters == "/DCTDecode" or (isinstance(filters, list) and "/DCTDecode" in filters):
                    found_dct = True
                    break
        assert found_dct is True, "Image XObject did not preserve direct /DCTDecode stream pass-through"

    def test_pillow_fallback_with_rgba_transparency(self, tmp_path):
        """Verifies that RGBA images with transparency trigger Pillow fallback cleanly onto a solid background."""
        rgba_pages = []
        for i in range(2):
            p = tmp_path / f"page_rgba_{i}.png"
            img = Image.new("RGBA", (900, 1200), (100 * (i + 1), 50 * i, 200, 128))
            img.save(p, "PNG")
            rgba_pages.append(p)

        out_pdf = tmp_path / "Capitulo 002.pdf"
        success = PDFCompiler.compile_chapter(rgba_pages, out_pdf, prefer_img2pdf=True)
        assert success is True
        assert out_pdf.exists()
        assert out_pdf.stat().st_size >= 10 * 1024

        with open(out_pdf, "rb") as f:
            assert f.read(5) == b"%PDF-"


class TestEmpiricalIntegrityGuard:
    """Empirical verification of structural integrity checks, boundary conditions, and corrupt file rejection."""

    def test_verify_pdf_on_valid_compiled_pdf(self, tmp_path):
        img_paths = [_create_synthetic_jpeg(tmp_path / f"p_{i}.jpg", 800, 1200) for i in range(3)]
        out_pdf = tmp_path / "Valid_Capitulo.pdf"
        PDFCompiler.compile_chapter(img_paths, out_pdf)

        valid, reason = IntegrityGuard.verify_pdf(out_pdf, min_pages=1)
        assert valid is True
        assert "válido" in reason.lower()

    def test_verify_pdf_rejects_sub_10kb_file(self, tmp_path):
        tiny_pdf = tmp_path / "tiny.pdf"
        # 5 KB of valid-looking dummy bytes
        tiny_pdf.write_bytes(b"%PDF-1.4\n" + b"0" * 5000)

        valid, reason = IntegrityGuard.verify_pdf(tiny_pdf)
        assert valid is False
        assert "insuficiente" in reason.lower() or "bytes" in reason.lower()

    def test_verify_pdf_rejects_invalid_header(self, tmp_path):
        fake_pdf = tmp_path / "fake.pdf"
        fake_pdf.write_bytes(b"NOT_A_PDF_HEADER" + b"0" * 15000)

        valid, reason = IntegrityGuard.verify_pdf(fake_pdf)
        assert valid is False
        assert "cabecera" in reason.lower()

    def test_verify_pdf_rejects_truncated_structural_body(self, tmp_path):
        corrupt_pdf = tmp_path / "corrupt.pdf"
        # Starts with %PDF- and is > 10 KB, but contains invalid internal cross-references
        corrupt_pdf.write_bytes(b"%PDF-1.4\n%junk\n" + b"\x00\xFF\xAA\x55" * 4000)

        valid, reason = IntegrityGuard.verify_pdf(corrupt_pdf)
        assert valid is False
        assert "corrupción" in reason.lower() or "pypdf" in reason.lower()

    def test_idempotent_skip_behavior(self, tmp_path):
        img_path = _create_synthetic_jpeg(tmp_path / "img.jpg", 800, 1200)
        pdf_path = tmp_path / "Idempotent.pdf"
        PDFCompiler.compile_chapter([img_path], pdf_path)

        assert IntegrityGuard.is_idempotent_skip(pdf_path) is True
        assert IntegrityGuard.is_idempotent_skip(tmp_path / "Nonexistent.pdf") is False


class TestEmpiricalDiskMarginEvaluation:
    """Empirical verification of disk space monitoring and safety thresholds."""

    def test_check_disk_margin_live_drive_e(self):
        free_gb = IntegrityGuard.get_free_space_gb("E:\\")
        assert free_gb > 0.0, f"Free space on E:\\ returned unexpected {free_gb}"

        # Production requirement: safety margin >= 15.0 GB
        margin_ok = IntegrityGuard.check_disk_margin("E:\\", min_free_gb=15.0)
        assert margin_ok is True, f"Disk margin check failed on E:\\ with {free_gb:.2f} GB free"

    def test_check_disk_margin_safety_boundary_halts(self):
        # Setting an impossible threshold should return False
        assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=999999.0) is False

    def test_check_disk_margin_unmounted_drive_fallback(self):
        # Non-existent drive should fallback to CWD free space gracefully
        free_gb = IntegrityGuard.get_free_space_gb("Z:\\NonExistentVolume_12345")
        assert free_gb > 0.0


class TestEmpiricalCheckpointManager:
    """Empirical verification of atomic updates, markdown structure, and telemetry synchronization."""

    def test_atomic_checkpoint_update_and_file_generation(self, tmp_path):
        mgr = CheckpointManager(root_dir=tmp_path)
        # Create dummy queue file in tmp_path
        tmp_queue = tmp_path / "manhwa_top50_queue.json"
        tmp_queue.write_text(json.dumps({"total_series": 53, "series": [{"id": f"s_{i}"} for i in range(53)]}), encoding="utf-8")

        success = mgr.update_checkpoint(
            current_title="Solo Leveling",
            chapter_count=160,
            status_note="Verificación Empírica Challenger M5",
            completed_series=["Solo Leveling", "The Beginning After The End"],
            total_chapters_downloaded=160
        )
        assert success is True

        checkpoint_md = tmp_path / "CHECKPOINT_PROGRESO.md"
        status_json = tmp_path / "status.json"

        assert checkpoint_md.exists()
        assert status_json.exists()

        # Verify no temp files leaked
        assert not (tmp_path / "CHECKPOINT_PROGRESO.tmp.md").exists()
        assert not (tmp_path / "status.tmp.json").exists()

        # Verify markdown contents
        md_text = checkpoint_md.read_text(encoding="utf-8")
        assert "CHECKPOINT DE PROGRESO" in md_text
        assert "Solo Leveling" in md_text
        assert "53" in md_text
        assert "Margen seguro" in md_text

        # Verify status.json
        with open(status_json, "r", encoding="utf-8") as f:
            st = json.load(f)
        assert st["current_title"] == "Solo Leveling"
        assert st["catalog"]["total_series"] == 53
        assert st["catalog"]["completed_series"] == 2
        assert st["chapters"]["downloaded"] == 160
        assert "free_gb" in st["disk"]


class TestEmpiricalFullPipelineLifecycle:
    """End-to-end empirical simulation of a series and chapter lifecycle."""

    def test_complete_chapter_lifecycle_simulation(self, tmp_path):
        """
        Simulates the full autonomous acquisition flow:
        1. Queue lookup
        2. Rate limiter acquisition (<= 4.0 RPS)
        3. Hierarchy formatting
        4. Image acquisition & PDF compilation
        5. Integrity verification
        6. Disk margin guard
        7. Checkpoint persistence
        """
        # 1. Queue lookup
        with open(QUEUE_PATH, "r", encoding="utf-8") as f:
            catalog = json.load(f)
        series_item = next(s for s in catalog["series"] if s["id"] == "solo-leveling")
        assert series_item["title_display"] == "Solo Leveling"

        # 2. Rate limiting check
        rate_limiter = TokenBucketRateLimiter(rate=4.0, capacity=4.0)
        t0 = time.monotonic()
        assert rate_limiter.acquire(1.0) is True
        t1 = time.monotonic()
        assert t1 - t0 < 0.1  # Initial burst is immediate

        # 3. Path formatting
        download_root = tmp_path / "Manga"
        pdf_path = HierarchicalOrganizer.format_chapter_path(
            download_root=download_root,
            title_display=series_item["title_display"],
            chapter=1,
            volume=None,
            expected_hierarchy=series_item.get("expected_hierarchy"),
            is_webtoon=True
        )
        assert pdf_path.name == "Capitulo 001.pdf"
        assert "Tomo None" not in str(pdf_path)

        # 4. Simulate page acquisition & PDF compilation
        temp_pages_dir = tmp_path / "temp_pages"
        temp_pages = [
            _create_synthetic_jpeg(temp_pages_dir / f"p_{idx:03d}.jpg", 800, 1200)
            for idx in range(4)
        ]
        compiled_ok = PDFCompiler.compile_chapter(temp_pages, pdf_path, prefer_img2pdf=True)
        assert compiled_ok is True
        assert pdf_path.exists()

        # 5. Integrity verification
        integrity_ok, reason = IntegrityGuard.verify_pdf(pdf_path, min_pages=1)
        assert integrity_ok is True, f"Integrity check failed: {reason}"
        assert pdf_path.stat().st_size >= 10 * 1024

        # 6. Disk margin evaluation
        disk_ok = IntegrityGuard.check_disk_margin(drive="E:\\", min_free_gb=15.0)
        assert disk_ok is True

        # 7. Checkpoint update
        mgr = CheckpointManager(root_dir=tmp_path)
        updated = mgr.update_checkpoint(
            current_title=series_item["title_display"],
            chapter_count=1,
            status_note="Ciclo Completo Verificado Empíricamente",
            output_root=download_root
        )
        assert updated is True
        assert (tmp_path / "CHECKPOINT_PROGRESO.md").exists()
        assert (tmp_path / "status.json").exists()


if __name__ == "__main__":
    pytest.main(["-v", __file__])
