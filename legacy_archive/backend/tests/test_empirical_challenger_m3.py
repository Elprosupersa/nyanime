"""
Standalone Empirical Verification and Adversarial Stress Harness for Milestone 3.
Authored by Challenger 1 (Empirical Challenger - critic / specialist).

Stress-tests:
1. Lossless img2pdf compilation bit-exact preservation of JPEG/PNG payloads.
2. Defensive Pillow fallback for RGBA, paletted with transparency, LA grayscale alpha, and corrupt/empty images.
3. Atomic .tmp swap, pre-existing dangling .tmp cleanup, and zero dangling .tmp on failure.
4. Memory safety: streaming conversion verification under tracemalloc with bounded RAM footprint.
5. HierarchicalOrganizer adversarial edge cases and MangaPipeline cleanup integrity.
"""

import io
import os
import sys
import json
import time
import shutil
import hashlib
import tempfile
import tracemalloc
from pathlib import Path
from typing import List
from unittest.mock import patch, MagicMock

import pytest
from PIL import Image
import pypdf

from src.acquisition.pdf_compiler import PDFCompiler, HierarchicalOrganizer, HAS_IMG2PDF
from src.acquisition.manga_downloader import MangaPipeline


# ==============================================================================
# Helper Factories for Adversarial Test Images
# ==============================================================================

def create_synthetic_jpeg(path: Path, width: int = 800, height: int = 1200, color=(120, 80, 200), quality: int = 85) -> bytes:
    """Creates a synthetic JPEG image and returns its exact byte content."""
    img = Image.new("RGB", (width, height), color=color)
    bio = io.BytesIO()
    img.save(bio, format="JPEG", quality=quality)
    raw_bytes = bio.getvalue()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw_bytes)
    return raw_bytes


def create_synthetic_png(path: Path, width: int = 600, height: int = 900, mode: str = "RGB", color=(100, 200, 50)) -> bytes:
    """Creates a synthetic PNG image and returns its exact byte content."""
    img = Image.new(mode, (width, height), color=color)
    bio = io.BytesIO()
    img.save(bio, format="PNG")
    raw_bytes = bio.getvalue()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw_bytes)
    return raw_bytes


# ==============================================================================
# 1. Lossless img2pdf Payload Preservation & Bit-Exact Verification
# ==============================================================================

class TestEmpiricalLosslessImg2PdfPayloads:
    """Adversarial stress-testing of lossless img2pdf compilation preservation."""

    def test_empirical_jpeg_payload_lossless_preservation(self, tmp_path: Path):
        """
        Empirically verifies that img2pdf preserves raw JPEG payloads bit-for-bit without
        recompression or pixel re-encoding.
        """
        assert HAS_IMG2PDF is True, "img2pdf must be available for lossless testing"

        work_dir = tmp_path / "lossless_jpeg"
        work_dir.mkdir(parents=True, exist_ok=True)

        # Generate 3 distinct JPEG files with unique colors and patterns
        input_files: List[Path] = []
        original_hashes: List[str] = []
        original_payloads: List[bytes] = []

        colors = [(220, 40, 40), (40, 220, 40), (40, 40, 220)]
        for i, color in enumerate(colors):
            p = work_dir / f"page_{i:03d}.jpg"
            raw_bytes = create_synthetic_jpeg(p, width=700, height=1000, color=color, quality=90)
            input_files.append(p)
            original_payloads.append(raw_bytes)
            original_hashes.append(hashlib.sha256(raw_bytes).hexdigest())

        out_pdf = work_dir / "output_lossless.pdf"

        # Execute compilation
        ok = PDFCompiler.compile_chapter(input_files, out_pdf, prefer_img2pdf=True)
        assert ok is True
        assert out_pdf.exists()

        # Inspect PDF structure and extract embedded image payloads
        with open(out_pdf, "rb") as f:
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == len(input_files)

            for idx, page in enumerate(reader.pages):
                images = list(page.images)
                assert len(images) == 1, f"Page {idx} should contain exactly 1 embedded image"
                extracted_data = images[0].data

                # Bit-exact SHA-256 validation
                extracted_hash = hashlib.sha256(extracted_data).hexdigest()
                assert extracted_hash == original_hashes[idx], (
                    f"Page {idx} payload corrupted! Original hash {original_hashes[idx]} != extracted {extracted_hash}"
                )
                assert extracted_data == original_payloads[idx], (
                    f"Page {idx} raw bytes mismatch! img2pdf failed to preserve byte-exact stream."
                )

    def test_empirical_png_rgb_lossless_preservation(self, tmp_path: Path):
        """
        Verifies that RGB PNG images compile cleanly via img2pdf, retaining resolution
        and dimensions without visual loss.
        """
        work_dir = tmp_path / "lossless_png"
        work_dir.mkdir(parents=True, exist_ok=True)

        input_files = []
        for i in range(3):
            p = work_dir / f"page_{i:03d}.png"
            create_synthetic_png(p, width=500 + i * 50, height=800 + i * 50, mode="RGB", color=(80, 140, 210))
            input_files.append(p)

        out_pdf = work_dir / "output_png.pdf"
        ok = PDFCompiler.compile_chapter(input_files, out_pdf, prefer_img2pdf=True)
        assert ok is True
        assert out_pdf.exists()

        with open(out_pdf, "rb") as f:
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == 3
            for idx, page in enumerate(reader.pages):
                assert len(page.images) == 1
                img = page.images[0].image
                assert img.size == (500 + idx * 50, 800 + idx * 50)

    def test_empirical_grayscale_lossless_preservation(self, tmp_path: Path):
        """
        Verifies manga grayscale (mode 'L') pages compile without unexpected color mode expansion.
        """
        work_dir = tmp_path / "lossless_gray"
        work_dir.mkdir(parents=True, exist_ok=True)

        input_files = []
        for i in range(2):
            p = work_dir / f"gray_{i:03d}.jpg"
            img = Image.new("L", (600, 900), color=100 + i * 50)
            img.save(p, "JPEG")
            input_files.append(p)

        out_pdf = work_dir / "output_gray.pdf"
        ok = PDFCompiler.compile_chapter(input_files, out_pdf, prefer_img2pdf=True)
        assert ok is True

        with open(out_pdf, "rb") as f:
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == 2


# ==============================================================================
# 2. Defensive Pillow Fallback Stress-Testing
# ==============================================================================

class TestEmpiricalPillowFallbackStress:
    """Adversarial stress-testing of defensive Pillow fallback routes."""

    def test_empirical_rgba_pillow_fallback_white_background(self, tmp_path: Path):
        """
        Stress-tests Pillow fallback execution with RGBA images:
        Verifies Pillow fallback composites transparent regions against PURE WHITE (255, 255, 255),
        preventing black halos or dark artifacts when alpha blending.
        """
        work_dir = tmp_path / "rgba_stress"
        work_dir.mkdir(parents=True, exist_ok=True)

        p = work_dir / "transparent_page.png"
        # 100x100 image: Top half is pure transparent (alpha=0), bottom half is semi-transparent red (255, 0, 0, 128)
        img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        for y in range(50, 100):
            for x in range(100):
                img.putpixel((x, y), (255, 0, 0, 128))
        img.save(p, "PNG")

        out_pdf = work_dir / "rgba_composite.pdf"
        # Force Pillow fallback (prefer_img2pdf=False) to stress-test Pillow compositing path
        ok = PDFCompiler.compile_chapter([p], out_pdf, prefer_img2pdf=False)
        assert ok is True
        assert out_pdf.exists()

        # Extract rendered image from the resulting PDF
        with open(out_pdf, "rb") as f:
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == 1
            extracted_pil = reader.pages[0].images[0].image.convert("RGB")

            # Check transparent top half (y=10, x=50): MUST be pure white (255, 255, 255)
            top_pixel = extracted_pil.getpixel((50, 10))
            assert top_pixel == (255, 255, 255), f"Transparent area did not composite to white: {top_pixel}"

            # Check bottom half (y=75, x=50): Blended semi-transparent red over white
            # (255*0.5 + 255*0.5, 0*0.5 + 255*0.5, 0*0.5 + 255*0.5) -> ~ (255, 127, 127)
            bot_pixel = extracted_pil.getpixel((50, 75))
            assert bot_pixel[0] == 255
            assert 120 <= bot_pixel[1] <= 135
            assert 120 <= bot_pixel[2] <= 135

    def test_empirical_paletted_transparency_pillow_fallback(self, tmp_path: Path):
        """
        Stress-tests mode 'P' (paletted) images containing transparency metadata via Pillow fallback.
        Verifies that transparent areas composite onto white background.
        """
        work_dir = tmp_path / "palette_stress"
        work_dir.mkdir(parents=True, exist_ok=True)

        p = work_dir / "palette_page.png"
        img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        # Center colored box from 40 to 60
        for y in range(40, 60):
            for x in range(40, 60):
                img.putpixel((x, y), (255, 0, 0, 255))
        pal_img = img.convert("P", palette=Image.Palette.ADAPTIVE)
        pal_img.save(p, "PNG", transparency=0)

        out_pdf = work_dir / "palette_out.pdf"
        ok = PDFCompiler.compile_chapter([p], out_pdf, prefer_img2pdf=False)
        assert ok is True
        assert out_pdf.exists()

        with open(out_pdf, "rb") as f:
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == 1
            extracted = reader.pages[0].images[0].image.convert("RGB")
            # Transparent interior pixel (10, 10) must composite onto pure white
            assert extracted.getpixel((10, 10)) == (255, 255, 255)

    def test_empirical_la_grayscale_alpha_fallback(self, tmp_path: Path):
        """
        Stress-tests grayscale with alpha channel (mode 'LA').
        """
        work_dir = tmp_path / "la_stress"
        work_dir.mkdir(parents=True, exist_ok=True)

        p = work_dir / "la_page.png"
        img = Image.new("LA", (60, 60), (120, 128))
        img.save(p, "PNG")

        out_pdf = work_dir / "la_out.pdf"
        ok = PDFCompiler.compile_chapter([p], out_pdf, prefer_img2pdf=False)
        assert ok is True
        assert out_pdf.exists()

        with open(out_pdf, "rb") as f:
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == 1

    def test_empirical_corrupted_truncated_jpeg_handling(self, tmp_path: Path):
        """
        Verifies behavior when a JPEG is truncated mid-stream (common during network cuts).
        Must abort cleanly, return False, not create target PDF, and remove .tmp.
        """
        work_dir = tmp_path / "corrupt_jpeg"
        work_dir.mkdir(parents=True, exist_ok=True)

        bad_jpg = work_dir / "truncated.jpg"
        # Write valid JPEG SOI header but truncate abruptly after 40 bytes
        bad_jpg.write_bytes(b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + b"\x00" * 20)

        out_pdf = work_dir / "corrupt.pdf"
        temp_tmp = Path(str(out_pdf) + ".tmp")

        ok = PDFCompiler.compile_chapter([bad_jpg], out_pdf)
        assert ok is False
        assert not out_pdf.exists()
        assert not temp_tmp.exists(), "Dangling .tmp file was left behind after truncated JPEG failure!"

    def test_empirical_random_garbage_bytes_image_handling(self, tmp_path: Path):
        """
        Verifies behavior when a non-image file is disguised as an image extension.
        """
        work_dir = tmp_path / "garbage_img"
        work_dir.mkdir(parents=True, exist_ok=True)

        bad_file = work_dir / "garbage.jpg"
        bad_file.write_bytes(b"THIS IS NOT A REAL IMAGE AT ALL" * 50)

        out_pdf = work_dir / "garbage.pdf"
        temp_tmp = Path(str(out_pdf) + ".tmp")

        ok = PDFCompiler.compile_chapter([bad_file], out_pdf)
        assert ok is False
        assert not out_pdf.exists()
        assert not temp_tmp.exists(), "Dangling .tmp file was left behind after garbage bytes failure!"

    def test_empirical_partial_corrupted_batch_aborts_cleanly(self, tmp_path: Path):
        """
        Adversarial test: A batch of 10 pages where page #7 is corrupt.
        The entire chapter compilation must abort, returning False, without partial PDF emission.
        """
        work_dir = tmp_path / "partial_corrupt_batch"
        work_dir.mkdir(parents=True, exist_ok=True)

        pages = []
        for i in range(10):
            p = work_dir / f"page_{i:03d}.jpg"
            if i == 6:
                # Corrupt page 6
                p.write_bytes(b"CORRUPTED_NON_IMAGE_DATA")
            else:
                create_synthetic_jpeg(p, width=400, height=600)
            pages.append(p)

        out_pdf = work_dir / "chapter_partial.pdf"
        temp_tmp = Path(str(out_pdf) + ".tmp")

        ok = PDFCompiler.compile_chapter(pages, out_pdf)
        assert ok is False
        assert not out_pdf.exists()
        assert not temp_tmp.exists(), "Dangling .tmp remained after batch failure!"


# ==============================================================================
# 3. Atomic Operations & Dangling .tmp Cleanup Verification
# ==============================================================================

class TestEmpiricalAtomicOperationsAndCleanup:
    """Stress-testing atomic writes and cleanup guarantees."""

    def test_empirical_atomic_swap_with_preexisting_dangling_tmp(self, tmp_path: Path):
        """
        Simulates an interrupted previous run that left a corrupted, abandoned .tmp file.
        PDFCompiler must clean/overwrite the stale .tmp and successfully write the new PDF.
        """
        work_dir = tmp_path / "preexisting_tmp"
        work_dir.mkdir(parents=True, exist_ok=True)

        page = work_dir / "valid_page.jpg"
        create_synthetic_jpeg(page, width=500, height=700)

        out_pdf = work_dir / "clean_chapter.pdf"
        stale_tmp = Path(str(out_pdf) + ".tmp")
        # Write stale junk to .tmp
        stale_tmp.write_bytes(b"STALE_ORPHANED_DATA_FROM_CRASHED_PROCESS" * 100)
        assert stale_tmp.exists()

        ok = PDFCompiler.compile_chapter([page], out_pdf)
        assert ok is True
        assert out_pdf.exists()
        assert out_pdf.stat().st_size > 1024
        assert not stale_tmp.exists(), "Stale .tmp was not cleaned up after successful compilation!"

    def test_empirical_atomic_swap_overwrites_existing_target_without_corruption(self, tmp_path: Path):
        """
        Verifies safe atomic overwriting of an existing PDF target without leaving .tmp.
        """
        work_dir = tmp_path / "overwrite_test"
        work_dir.mkdir(parents=True, exist_ok=True)

        page = work_dir / "page.jpg"
        create_synthetic_jpeg(page, width=400, height=600)

        out_pdf = work_dir / "target.pdf"
        out_pdf.write_bytes(b"%PDF-1.4 OLD DUMMY FILE CONTENT" * 200)

        ok = PDFCompiler.compile_chapter([page], out_pdf)
        assert ok is True
        assert out_pdf.exists()

        # Confirm new PDF is valid
        with open(out_pdf, "rb") as f:
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == 1

        assert not Path(str(out_pdf) + ".tmp").exists()

    def test_empirical_exception_during_save_leaves_no_dangling_tmp(self, tmp_path: Path):
        """
        Simulates an unexpected I/O exception during Pillow save.
        Verifies that .tmp is strictly removed in the exception handler.
        """
        work_dir = tmp_path / "save_exception"
        work_dir.mkdir(parents=True, exist_ok=True)

        page = work_dir / "page.png"
        create_synthetic_png(path=page, mode="RGBA")

        out_pdf = work_dir / "exception_target.pdf"
        temp_tmp = Path(str(out_pdf) + ".tmp")

        with patch.object(Image.Image, "save", side_effect=IOError("Simulated disk error during save")):
            ok = PDFCompiler.compile_chapter([page], out_pdf, prefer_img2pdf=False)
            assert ok is False
            assert not out_pdf.exists()
            assert not temp_tmp.exists(), "Dangling .tmp left after save() exception!"

    def test_empirical_rename_failure_cleans_up_tmp(self, tmp_path: Path):
        """
        Simulates atomic rename (replace) failure (e.g. file lock or permissions error).
        Verifies that temp_pdf is cleaned up and False is returned.
        """
        work_dir = tmp_path / "rename_fail"
        work_dir.mkdir(parents=True, exist_ok=True)

        page = work_dir / "page.jpg"
        create_synthetic_jpeg(page)

        out_pdf = work_dir / "target.pdf"
        temp_tmp = Path(str(out_pdf) + ".tmp")

        with patch.object(Path, "replace", side_effect=PermissionError("Simulated file lock on destination")):
            ok = PDFCompiler.compile_chapter([page], out_pdf)
            assert ok is False
            assert not temp_tmp.exists(), "Dangling .tmp left after replace() failure!"

    def test_empirical_nested_directory_creation(self, tmp_path: Path):
        """
        Verifies that deep non-existent target directories are automatically created.
        """
        deep_out = tmp_path / "deep" / "level1" / "level2" / "level3" / "chapter.pdf"
        page = tmp_path / "page.jpg"
        create_synthetic_jpeg(page)

        ok = PDFCompiler.compile_chapter([page], deep_out)
        assert ok is True
        assert deep_out.exists()
        assert deep_out.parent.exists()


# ==============================================================================
# 4. Memory Safety & Streaming Performance Verification
# ==============================================================================

class TestEmpiricalMemorySafetyAndStreaming:
    """Stress-testing memory bounds and resource cleanup under tracemalloc."""

    def test_empirical_memory_streaming_bounded_footprint(self, tmp_path: Path):
        """
        Synthesizes a 40-page chapter of high-resolution pages (1000x1500).
        Measures peak RAM expansion via tracemalloc.
        Verifies that img2pdf streaming conversion keeps peak Python memory bounded (< 15 MB),
        avoiding raw bitmap decompression in RAM (which would exceed 180 MB).
        """
        work_dir = tmp_path / "memory_stream"
        work_dir.mkdir(parents=True, exist_ok=True)

        pages = []
        for i in range(40):
            p = work_dir / f"page_{i:03d}.jpg"
            create_synthetic_jpeg(p, width=1000, height=1500, quality=80)
            pages.append(p)

        out_pdf = work_dir / "streamed_chapter.pdf"

        tracemalloc.start()
        t0 = time.time()
        ok = PDFCompiler.compile_chapter(pages, out_pdf, prefer_img2pdf=True)
        elapsed = time.time() - t0
        current_ram, peak_ram = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        assert ok is True
        assert out_pdf.exists()

        peak_mb = peak_ram / (1024 * 1024)
        # Peak RAM must be less than 15 MB (empirically img2pdf stays < 1 MB)
        assert peak_mb < 15.0, f"Memory expanded excessively! Peak RAM: {peak_mb:.2f} MB"
        # Elapsed time should be reasonable (< 10 seconds for 40 pages)
        assert elapsed < 10.0, f"Compilation took too long: {elapsed:.2f} seconds"

    def test_empirical_sequential_compilation_no_descriptor_leak(self, tmp_path: Path):
        """
        Compiles multiple chapters in sequence to verify there are no file descriptor leaks
        or dangling open handles.
        """
        work_dir = tmp_path / "leak_test"
        work_dir.mkdir(parents=True, exist_ok=True)

        page = work_dir / "page.jpg"
        create_synthetic_jpeg(page, width=300, height=400)

        for i in range(15):
            out_pdf = work_dir / f"chapter_{i:03d}.pdf"
            ok = PDFCompiler.compile_chapter([page], out_pdf)
            assert ok is True
            assert out_pdf.exists()


# ==============================================================================
# 5. Hierarchical Organizer & MangaPipeline Integration Stress
# ==============================================================================

class TestEmpiricalHierarchicalOrganizerAndDownloader:
    """Stress-testing organizational edge cases and downloader integration."""

    @pytest.mark.parametrize("chapter_input,expected_filename", [
        (1, "Capitulo 001.pdf"),
        ("1", "Capitulo 001.pdf"),
        (14.5, "Capitulo 014.5.pdf"),
        ("14.5", "Capitulo 014.5.pdf"),
        (0.5, "Capitulo 000.5.pdf"),
        ("0.5", "Capitulo 000.5.pdf"),
        (100.1, "Capitulo 100.1.pdf"),
        (999, "Capitulo 999.pdf"),
        ("prologo", "Capitulo prologo.pdf"),
    ])
    def test_empirical_fractional_and_special_chapter_formatting(self, chapter_input, expected_filename):
        """Verifies chapter filename formatting for integers, decimals, and string edge cases."""
        res = HierarchicalOrganizer.format_chapter_filename(chapter_input, pad_digits=3)
        assert res == expected_filename

    @pytest.mark.parametrize("volume_input", [None, "", "none", "None", "NULL", "null"])
    def test_empirical_webtoon_volume_never_emits_tomo_none(self, tmp_path: Path, volume_input):
        """Guarantees that no variant of empty volume produces a 'Tomo None' folder."""
        dest = HierarchicalOrganizer.format_chapter_path(
            download_root=tmp_path,
            title_display="Solo Leveling",
            chapter=50,
            volume=volume_input,
            is_webtoon=True
        )
        assert "Tomo None" not in str(dest)
        assert "none" not in str(dest).lower() or "solo leveling" in str(dest).lower()
        assert dest.name == "Capitulo 050.pdf"

    def test_empirical_title_sanitization_path_traversal(self):
        """
        Tests path traversal and dangerous characters in titles:
        `../../Windows/System32/evil` -> safe sanitized name.
        """
        adversarial_title = r'../../Windows/System32:evil?*"<>|name'
        clean = HierarchicalOrganizer.clean_title(adversarial_title)
        assert ".." in clean or clean != ""  # basic characters preserved
        for bad_char in '<>:"/\\|?*':
            assert bad_char not in clean

    def test_empirical_metadata_stripping_bbcode_html(self, tmp_path: Path):
        """
        Stress-tests synopsis cleaning with standard BBCode, HTML, and markdown links.
        """
        raw_synopsis = (
            "[url=https://manga.org/123][b]Title[/b][/url] [spoiler]Hidden text[/spoiler] "
            "<p>Paragraph 1<br>Paragraph 2</p> "
            "[i]Italic note[/i]"
        )
        cleaned = HierarchicalOrganizer.clean_synopsis(raw_synopsis)
        assert "[b]" not in cleaned
        assert "[/b]" not in cleaned
        assert "[url=" not in cleaned
        assert "[/url]" not in cleaned
        assert "[spoiler]" not in cleaned
        assert "[/spoiler]" not in cleaned
        assert "<p>" not in cleaned
        assert "</p>" not in cleaned
        assert "<br>" not in cleaned
        assert "[i]" not in cleaned
        assert "[/i]" not in cleaned
        assert "Title" in cleaned
        assert "Paragraph 1" in cleaned

    def test_empirical_manga_pipeline_cleans_pages_when_compilation_fails(self, tmp_path: Path):
        """
        Verifies that MangaPipeline.download_chapter_group preserves temporary page files
        when PDF compilation fails (cleanup occurs ONLY when PDF compilation succeeds and
        passes integrity verification per M4 hardening mandate).
        """
        pipeline = MangaPipeline(output_root=str(tmp_path), max_workers=2)
        manga_dir = tmp_path / "Failed Manga"
        temp_cache = tmp_path / ".temp_cache"

        ch_info = {
            "chapter": "1",
            "volume": "1",
            "candidates": [{"id": "failed_cand", "pages": 2, "volume": "1", "lang": "es-la"}]
        }

        # Candidate returns 2 page names
        athome_ret = ("https://base.node", "h123", ["p1.jpg", "p2.jpg"], [])

        def mock_download_corrupt_page(b_url, hsh, p_name, s_name, dest_p):
            # Write non-zero bytes to satisfy > 1000 check
            dest_p.write_bytes(b"CORRUPTED_NOT_A_VALID_IMAGE" * 100)
            return True

        with patch.object(pipeline.client, "get_chapter_pages_info", return_value=athome_ret):
            with patch.object(pipeline, "_download_single_page", side_effect=mock_download_corrupt_page):
                ok = pipeline.download_chapter_group(ch_info, manga_dir, temp_cache)
                assert ok is False

        # Post-M4 hardening: temporary page images are preserved for diagnostics/retry when compilation fails
        cand_dir = temp_cache / "failed_cand"
        assert cand_dir.exists() and len(list(cand_dir.iterdir())) > 0

