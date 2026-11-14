"""
Standalone Adversarial Verification & Stress Test Suite — Milestone 4 (Challenger 2).

Target files:
- src/acquisition/checkpoint_manager.py
- src/acquisition/manga_downloader.py
- src/acquisition/pdf_compiler.py

Harness coverage:
1. Stress-test atomic update in CheckpointManager:
   - Simulate write permission errors and disk full during temp file creation;
     verify no partial/corrupt CHECKPOINT_PROGRESO.md or status.json is written.
   - Verify concurrent or repeated updates maintain consistent metrics and valid Markdown formatting.
   - Verify resilience of Markdown table formatting with adversarial/malicious strings.
2. Stress-test pipeline cleanup in manga_downloader.py:
   - Verify that if verify_pdf fails (corrupted compiled PDF, bad header, truncated pages),
     temporary downloaded image pages and folder are NOT deleted.
   - Verify that when verify_pdf passes, temporary image pages and their folder are cleanly removed.
   - Verify multi-candidate failover cleanup behavior.
3. Adversarially verify BBCode and float hardening:
   - Fuzz clean_synopsis with nested tags, malicious query strings ([url="http://test.com?a=1&b=2#ref"]),
     unclosed brackets, mixed HTML/Markdown, and unicode/emojis.
   - Fuzz format_chapter_filename with "inf", "-inf", "nan", invalid floats, and extreme numbers.
"""

import os
import json
import shutil
import tempfile
import threading
from pathlib import Path
from typing import List, Dict, Any, Tuple
from unittest.mock import patch, MagicMock

import pytest
from PIL import Image

from src.acquisition.checkpoint_manager import CheckpointManager
from src.acquisition.manga_downloader import MangaPipeline
from src.acquisition.pdf_compiler import PDFCompiler, HierarchicalOrganizer
from src.acquisition.integrity_guard import IntegrityGuard


@pytest.fixture
def temp_workspace():
    """Isolated temporary workspace directory for adversarial testing."""
    tmp = tempfile.mkdtemp(prefix="adv_challenger_m4_")
    yield Path(tmp)
    shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture
def sample_valid_images(temp_workspace):
    """Generates two valid JPEG images for compilation tests."""
    images = []
    for i in range(2):
        img_p = temp_workspace / f"raw_page_{i}.jpg"
        img = Image.new("RGB", (300, 400), color=(50 + i * 50, 100, 150))
        img.save(img_p, "JPEG", quality=85)
        images.append(img_p)
    return images


# ==============================================================================
# Category 1: Stress-Test Atomic Update in CheckpointManager
# ==============================================================================

class TestCheckpointManagerAdversarial:
    """Stress tests and fault injection for atomic progress checkpointing."""

    def test_atomic_update_simulated_disk_full_on_tmp_md(self, temp_workspace):
        """
        Simulate disk full (OSError ENOSPC) during temp .tmp.md creation.
        Verify that existing CHECKPOINT_PROGRESO.md and status.json are NOT corrupted
        and no partial .tmp files remain on disk.
        """
        mgr = CheckpointManager(root_dir=temp_workspace)

        # Pre-seed initial valid checkpoint
        original_md_content = "# Original Uncorrupted Checkpoint\nEstado: OK"
        original_json_content = {"status": "original_valid", "catalog": {"total_series": 53}}
        mgr.checkpoint_file.write_text(original_md_content, encoding="utf-8")
        mgr.status_file.write_text(json.dumps(original_json_content), encoding="utf-8")

        # Mock open to raise OSError when attempting to write .tmp.md
        orig_open = open

        def faulty_open(file, *args, **kwargs):
            if str(file).endswith(".tmp.md"):
                raise OSError(28, "No space left on device")
            return orig_open(file, *args, **kwargs)

        with patch("builtins.open", side_effect=faulty_open):
            success = mgr.update_checkpoint(
                current_title="Solo Leveling",
                chapter_count=100,
                status_note="Intento fallido por disco lleno"
            )

        assert success is False, "update_checkpoint must return False on write failure"

        # Verify original files are untouched and uncorrupted
        assert mgr.checkpoint_file.read_text(encoding="utf-8") == original_md_content
        assert json.loads(mgr.status_file.read_text(encoding="utf-8")) == original_json_content

        # Verify no .tmp files were leaked
        assert not (temp_workspace / "CHECKPOINT_PROGRESO.tmp.md").exists()
        assert not (temp_workspace / "status.tmp.json").exists()

    def test_atomic_update_simulated_permission_denied_on_tmp_md(self, temp_workspace):
        """
        Simulate PermissionError when writing temp file.
        Verify that original files remain intact and failure is handled gracefully.
        """
        mgr = CheckpointManager(root_dir=temp_workspace)
        original_md = "# Initial Checkpoint"
        mgr.checkpoint_file.write_text(original_md, encoding="utf-8")

        orig_open = open

        def access_denied_open(file, *args, **kwargs):
            if str(file).endswith(".tmp.md"):
                raise PermissionError("Access is denied")
            return orig_open(file, *args, **kwargs)

        with patch("builtins.open", side_effect=access_denied_open):
            result = mgr.update_checkpoint(current_title="Test Manga")

        assert result is False
        assert mgr.checkpoint_file.read_text(encoding="utf-8") == original_md
        assert not (temp_workspace / "CHECKPOINT_PROGRESO.tmp.md").exists()

    def test_atomic_update_simulated_error_on_status_json_cleans_up_tmp(self, temp_workspace):
        """
        Simulate failure during status.json temp creation after markdown was written.
        Verify that no .tmp.json file is left dangling.
        """
        mgr = CheckpointManager(root_dir=temp_workspace)

        orig_open = open

        def json_fail_open(file, *args, **kwargs):
            if str(file).endswith(".tmp.json"):
                raise OSError("Disk write error on json")
            return orig_open(file, *args, **kwargs)

        with patch("builtins.open", side_effect=json_fail_open):
            ok = mgr.update_checkpoint(current_title="Omniscient Reader")

        assert ok is False
        assert not (temp_workspace / "status.tmp.json").exists()

    def test_concurrent_checkpoint_updates_maintain_consistency(self, temp_workspace):
        """
        Stress-test concurrent calls to update_checkpoint across multiple worker threads.
        Verify that the final state produces valid, parseable JSON and valid Markdown formatting
        without deadlocks, exceptions, or corrupt partial lines.
        """
        mgr = CheckpointManager(root_dir=temp_workspace)
        # Pre-seed initial checkpoint state
        init_ok = mgr.update_checkpoint(current_title="Initial Setup", chapter_count=0)
        assert init_ok is True
        assert mgr.checkpoint_file.exists()
        assert mgr.status_file.exists()

        thread_count = 15
        errors = []

        def worker_task(thread_id: int):
            try:
                # Retry with backoff if another thread is currently replacing files
                for attempt in range(5):
                    success = mgr.update_checkpoint(
                        current_title=f"Manga Concurrent {thread_id}",
                        chapter_count=10 * thread_id,
                        status_note=f"Worker {thread_id} active",
                        total_chapters_downloaded=100 + thread_id,
                        completed_series=[f"Series {i}" for i in range(thread_id % 5)]
                    )
                    if success:
                        break
                    import time
                    time.sleep(0.01 * ((thread_id % 3) + 1))
            except Exception as e:
                errors.append(f"Thread {thread_id} failed: {e}")

        threads = [threading.Thread(target=worker_task, args=(i,)) for i in range(thread_count)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Concurrent updates threw unhandled errors: {errors}"

        # Verify that CHECKPOINT_PROGRESO.md exists, is readable, and contains valid markdown structure
        assert mgr.checkpoint_file.exists()
        md_text = mgr.checkpoint_file.read_text(encoding="utf-8")
        assert "# CHECKPOINT DE PROGRESO" in md_text
        assert "| Métrica | Valor | Estado / Detalle |" in md_text
        assert "Catálogo Total de Series" in md_text
        assert "Espacio en Disco HDD E:\\:" in md_text

        # Verify status.json is 100% valid parseable JSON
        assert mgr.status_file.exists()
        status_data = json.loads(mgr.status_file.read_text(encoding="utf-8"))
        assert "catalog" in status_data
        assert "chapters" in status_data
        assert "disk" in status_data
        assert status_data["catalog"]["total_series"] == 53
        assert isinstance(status_data["chapters"]["downloaded"], int)

        # Verify no .tmp files exist
        assert not (temp_workspace / "CHECKPOINT_PROGRESO.tmp.md").exists()
        assert not (temp_workspace / "status.tmp.json").exists()

    def test_repeated_sequential_updates_consistency(self, temp_workspace):
        """
        Perform 30 sequential updates rapidly with varying metrics.
        Verify formatting stability and zero leaked temporary files.
        """
        mgr = CheckpointManager(root_dir=temp_workspace)
        for i in range(30):
            res = mgr.update_checkpoint(
                current_title=f"Series {i}",
                chapter_count=i,
                status_note=f"Paso {i}/30",
                total_chapters_downloaded=i * 2,
                completed_series=[f"S_{k}" for k in range(i % 10)]
            )
            assert res is True

            # Every 10 iterations, verify Markdown table line integrity
            if i % 10 == 0:
                md_content = mgr.checkpoint_file.read_text(encoding="utf-8")
                table_lines = [
                    line.strip() for line in md_content.splitlines()
                    if line.strip().startswith("|") and line.strip().endswith("|")
                ]
                assert len(table_lines) >= 9, "Markdown summary table must have all rows"
                for line in table_lines:
                    # Each row must have 3 columns -> 4 pipe characters
                    assert line.count("|") == 4, f"Malformed table row: {line}"

        assert not (temp_workspace / "CHECKPOINT_PROGRESO.tmp.md").exists()
        assert not (temp_workspace / "status.tmp.json").exists()

    def test_checkpoint_markdown_formatting_with_adversarial_strings(self, temp_workspace):
        """
        Adversarially pass titles with pipes, markdown formatting, HTML tags, and unicode
        to ensure checkpoint formatting does not break.
        """
        mgr = CheckpointManager(root_dir=temp_workspace)
        adversarial_title = "Manga | Special [Ed.] **Bold** <script>alert(1)</script> 🚀 呪術廻戦"
        adversarial_note = "Status with | pipes | and \n newlines and [links](http://test.com)"

        ok = mgr.update_checkpoint(
            current_title=adversarial_title,
            chapter_count=99,
            status_note=adversarial_note,
            completed_series=["Obra 1 | Con Barras", "Obra 2 [BBCode]"]
        )
        assert ok is True

        md_text = mgr.checkpoint_file.read_text(encoding="utf-8")
        assert "Manga | Special [Ed.] **Bold** <script>alert(1)</script> 🚀 呪術廻戦" in md_text
        assert "# CHECKPOINT DE PROGRESO" in md_text
        assert "| Métrica | Valor | Estado / Detalle |" in md_text

        # Verify JSON remains valid with UTF-8
        status_json = json.loads(mgr.status_file.read_text(encoding="utf-8"))
        assert status_json["current_title"] == adversarial_title


# ==============================================================================
# Category 2: Stress-Test Pipeline Cleanup in manga_downloader.py
# ==============================================================================

class TestMangaPipelineCleanupAdversarial:
    """
    Stress-tests temporary downloaded image page and folder cleanup in MangaPipeline.
    Core contracts under test:
    - If verify_pdf FAILS, downloaded images in temp_cache/ch_id must NOT be deleted.
    - If verify_pdf PASSES, downloaded images and temp_cache/ch_id must be CLEANLY DELETED.
    """

    def test_cleanup_preserves_images_when_verify_pdf_fails_corrupted_pdf(self, temp_workspace, sample_valid_images):
        """
        Verify that when verify_pdf fails (e.g. corrupted PDF generated),
        the temporary downloaded image pages and their folder are NOT deleted.
        """
        output_manga = temp_workspace / "Manga"
        output_manga.mkdir(parents=True, exist_ok=True)
        temp_cache = output_manga / ".temp_cache"
        temp_cache.mkdir(parents=True, exist_ok=True)

        pipeline = MangaPipeline(output_root=str(output_manga))

        # Setup fake chapter info
        ch_id = "test-ch-corrupt-uuid"
        ch_info = {
            "chapter": "1",
            "volume": "1",
            "candidates": [{"id": ch_id}]
        }
        manga_dir = output_manga / "Test_Manga"
        manga_dir.mkdir(parents=True, exist_ok=True)

        # Mock MangaDexClient At-Home endpoint
        pipeline.client.get_chapter_pages_info = MagicMock(return_value=(
            "https://fake.cdn",
            "hash123",
            ["0000.jpg", "0001.jpg"],
            ["saver0.jpg", "saver1.jpg"]
        ))

        # Mock page downloader to copy sample valid images into the destination
        def mock_download_page(*args, **kwargs):
            dest_path = kwargs.get("dest_path")
            if dest_path:
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(sample_valid_images[0], dest_path)
            return True

        pipeline.client.download_page = MagicMock(side_effect=mock_download_page)

        # Force disk margin check to pass
        with patch.object(IntegrityGuard, "check_disk_margin", return_value=True):
            # Force PDFCompiler to create a PDF file, but force IntegrityGuard.verify_pdf to FAIL
            def fake_compile(images, out_pdf):
                out_pdf.parent.mkdir(parents=True, exist_ok=True)
                out_pdf.write_bytes(b"%PDF-1.4\ncorrupted_content")
                return True

            with patch.object(PDFCompiler, "compile_chapter", side_effect=fake_compile):
                with patch.object(IntegrityGuard, "verify_pdf", return_value=(False, "Simulated corruption in pypdf")):
                    result = pipeline.download_chapter_group(
                        ch_info=ch_info,
                        manga_dir=manga_dir,
                        temp_cache=temp_cache
                    )

        # The download must fail because the PDF failed verification
        assert result is False, "download_chapter_group must fail when verify_pdf fails"

        ch_temp = temp_cache / ch_id
        # CRITICAL ASSERTION: Downloaded image pages must NOT be deleted on verification failure!
        assert ch_temp.exists(), "Temporary folder must NOT be deleted when verify_pdf fails"
        downloaded_images = list(ch_temp.glob("*.jpg"))
        assert len(downloaded_images) == 2, (
            f"Temporary downloaded images must be preserved for debugging when verify_pdf fails, "
            f"found {len(downloaded_images)}"
        )
        for img in downloaded_images:
            assert img.exists()
            assert img.stat().st_size > 0

    def test_cleanup_preserves_images_when_verify_pdf_fails_insufficient_pages(self, temp_workspace, sample_valid_images):
        """
        Verify that when verify_pdf fails due to page count, images are preserved.
        """
        output_manga = temp_workspace / "Manga"
        output_manga.mkdir(parents=True, exist_ok=True)
        temp_cache = output_manga / ".temp_cache"
        temp_cache.mkdir(parents=True, exist_ok=True)

        pipeline = MangaPipeline(output_root=str(output_manga))
        ch_id = "test-ch-pages-uuid"
        ch_info = {
            "chapter": "2",
            "volume": "1",
            "candidates": [{"id": ch_id}]
        }
        manga_dir = output_manga / "Test_Manga_Pages"
        manga_dir.mkdir(parents=True, exist_ok=True)

        pipeline.client.get_chapter_pages_info = MagicMock(return_value=(
            "https://fake.cdn", "hash456", ["0000.jpg"], ["saver0.jpg"]
        ))

        def mock_download_page(*args, **kwargs):
            dest_path = kwargs.get("dest_path")
            if dest_path:
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(sample_valid_images[0], dest_path)
            return True

        pipeline.client.download_page = MagicMock(side_effect=mock_download_page)

        with patch.object(IntegrityGuard, "check_disk_margin", return_value=True):
            with patch.object(PDFCompiler, "compile_chapter", return_value=True):
                with patch.object(IntegrityGuard, "verify_pdf", return_value=(False, "Páginas insuficientes (0 < 1)")):
                    result = pipeline.download_chapter_group(
                        ch_info=ch_info,
                        manga_dir=manga_dir,
                        temp_cache=temp_cache
                    )

        assert result is False
        ch_temp = temp_cache / ch_id
        assert ch_temp.exists()
        assert len(list(ch_temp.glob("*.jpg"))) == 1

    def test_cleanup_removes_images_and_folder_when_verify_pdf_passes(self, temp_workspace, sample_valid_images):
        """
        Verify that when verify_pdf PASSES, temporary image pages and their containing
        ch_temp folder are cleanly unlinked and removed.
        """
        output_manga = temp_workspace / "Manga"
        output_manga.mkdir(parents=True, exist_ok=True)
        temp_cache = output_manga / ".temp_cache"
        temp_cache.mkdir(parents=True, exist_ok=True)

        pipeline = MangaPipeline(output_root=str(output_manga))
        ch_id = "test-ch-clean-uuid"
        ch_info = {
            "chapter": "3",
            "volume": "1",
            "candidates": [{"id": ch_id}]
        }
        manga_dir = output_manga / "Test_Manga_Clean"
        manga_dir.mkdir(parents=True, exist_ok=True)

        pipeline.client.get_chapter_pages_info = MagicMock(return_value=(
            "https://fake.cdn", "hash789", ["0000.jpg", "0001.jpg"], ["saver0.jpg", "saver1.jpg"]
        ))

        def mock_download_page(*args, **kwargs):
            dest_path = kwargs.get("dest_path")
            if dest_path:
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(sample_valid_images[0], dest_path)
            return True

        pipeline.client.download_page = MagicMock(side_effect=mock_download_page)

        with patch.object(IntegrityGuard, "check_disk_margin", return_value=True):
            with patch.object(IntegrityGuard, "verify_pdf", return_value=(True, "PDF íntegro y estructuralmente válido")):
                result = pipeline.download_chapter_group(
                    ch_info=ch_info,
                    manga_dir=manga_dir,
                    temp_cache=temp_cache
                )

        assert result is True, "download_chapter_group must succeed when compilation and verify_pdf pass"

        # CRITICAL ASSERTION: ch_temp folder and all temporary images must be cleanly removed!
        ch_temp = temp_cache / ch_id
        assert not ch_temp.exists(), (
            f"Temporary folder {ch_temp} should have been cleanly removed upon successful verification"
        )
        assert len(list(ch_temp.glob("*.jpg"))) == 0

    def test_pipeline_candidate_fallback_first_fails_integrity_second_succeeds(self, temp_workspace, sample_valid_images):
        """
        Verify multi-candidate fallback:
        - Candidate 1 fails verify_pdf -> temporary images preserved, continues to candidate 2.
        - Candidate 2 passes verify_pdf -> temporary images cleaned, chapter completed successfully.
        """
        output_manga = temp_workspace / "Manga"
        output_manga.mkdir(parents=True, exist_ok=True)
        temp_cache = output_manga / ".temp_cache"
        temp_cache.mkdir(parents=True, exist_ok=True)

        pipeline = MangaPipeline(output_root=str(output_manga))
        cand1_id = "cand-1-bad"
        cand2_id = "cand-2-good"

        ch_info = {
            "chapter": "4",
            "volume": "1",
            "candidates": [{"id": cand1_id}, {"id": cand2_id}]
        }
        manga_dir = output_manga / "Test_Manga_Fallback"
        manga_dir.mkdir(parents=True, exist_ok=True)

        def mock_pages_info(cid):
            return ("https://cdn", f"hash_{cid}", ["0000.jpg"], ["saver.jpg"])

        pipeline.client.get_chapter_pages_info = MagicMock(side_effect=mock_pages_info)

        def mock_dl(*args, **kwargs):
            dest_path = kwargs.get("dest_path")
            if dest_path:
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(sample_valid_images[0], dest_path)
            return True

        pipeline.client.download_page = MagicMock(side_effect=mock_dl)

        def mock_verify_pdf(path, **kw):
            # Candidate 1 fails, Candidate 2 passes
            if cand1_id in str(path) or "cand-1" in getattr(mock_verify_pdf, "last_cand", ""):
                return (False, "Candidate 1 Corrupted")
            return (True, "PDF íntegro")

        call_count = [0]

        def dynamic_verify(path, **kw):
            call_count[0] += 1
            if call_count[0] == 1:
                return (False, "Candidate 1 Corrupted")
            return (True, "Candidate 2 Íntegro")

        with patch.object(IntegrityGuard, "check_disk_margin", return_value=True):
            with patch.object(PDFCompiler, "compile_chapter", return_value=True):
                with patch.object(IntegrityGuard, "verify_pdf", side_effect=dynamic_verify):
                    res = pipeline.download_chapter_group(
                        ch_info=ch_info,
                        manga_dir=manga_dir,
                        temp_cache=temp_cache
                    )

        assert res is True
        # Candidate 1 folder was preserved when it failed
        assert (temp_cache / cand1_id).exists()
        # Candidate 2 folder was cleaned up on success
        assert not (temp_cache / cand2_id).exists()


# ==============================================================================
# Category 3: Adversarial Fuzzing of clean_synopsis (BBCode, HTML, Markdown, Unicode)
# ==============================================================================

class TestBBCodeFuzzingAdversarial:
    """Stress tests and fuzzing for HierarchicalOrganizer.clean_synopsis."""

    def test_clean_synopsis_nested_bbcode_tags(self):
        """Verify deeply nested tags are completely stripped."""
        nested = (
            "[b][i][u][s][spoiler]Deeply nested secret message[/spoiler][/s][/u][/i][/b] "
            "[quote][b]A quote with bold[/b][/quote]"
        )
        cleaned = HierarchicalOrganizer.clean_synopsis(nested)
        assert cleaned == "Deeply nested secret message A quote with bold"
        assert "[" not in cleaned and "]" not in cleaned

    def test_clean_synopsis_malicious_query_strings_and_anchors(self):
        """
        Verify that URLs with query parameters, anchors, and quotes inside tags
        are properly stripped without ReDoS or regex failures.
        """
        cases = [
            '[url="http://test.com?a=1&b=2#ref"]Link With Quotes[/url]',
            "[url='https://example.com/search?q=test%20query&page=2#section']Single Quoted[/url]",
            "[url=https://site.org/path?k1=v1&k2=v2#frag]Unquoted Param[/url]",
            "[url=ftp://files.example.com/archive.tar.gz?token=abc123xyz#file]FTP Param[/url]",
            "[color=#ff0000][font=\"Times New Roman\"]Colored Font[/font][/color]",
        ]
        for c in cases:
            cleaned = HierarchicalOrganizer.clean_synopsis(c)
            assert "[url=" not in cleaned
            assert "[/url]" not in cleaned
            assert "[color=" not in cleaned
            assert "[font=" not in cleaned
            assert "Link With Quotes" in cleaned or "Single Quoted" in cleaned or \
                   "Unquoted Param" in cleaned or "FTP Param" in cleaned or "Colored Font" in cleaned

    def test_clean_synopsis_unclosed_and_malformed_brackets(self):
        """
        Verify unclosed brackets and mathematical expressions with brackets
        do not crash or hang.
        """
        malformed = "Notice: [b unclosed bold tag and [url=http://incomplete tag"
        cleaned = HierarchicalOrganizer.clean_synopsis(malformed)
        assert "Notice:" in cleaned
        assert isinstance(cleaned, str)

        math_brackets = "Equation: [x, y] in R^2 where [a] is matrix"
        cleaned_math = HierarchicalOrganizer.clean_synopsis(math_brackets)
        # Non-BBCode brackets like [a] are stripped by BBCode regex [/?^\]+], but no exception occurs
        assert "Equation:" in cleaned_math

    def test_clean_synopsis_unicode_and_emojis(self):
        """
        Verify unicode strings across multiple scripts (Hangul, Kanji, Hanzi, Arabic, Cyrillic)
        and modern emojis are preserved without encoding corruption.
        """
        multilingual = (
            "🔥 [b]Solo Leveling[/b] (나 혼자만 레벨업) - 葬送のフリーレン 🚀\n"
            "[i]Sousou no Frieren[/i] [url=http://link.com]العربية[/url] Поднятие уровня"
        )
        cleaned = HierarchicalOrganizer.clean_synopsis(multilingual)
        assert "🔥" in cleaned
        assert "Solo Leveling" in cleaned
        assert "나 혼자만 레벨업" in cleaned
        assert "葬送のフリーレン" in cleaned
        assert "Sousou no Frieren" in cleaned
        assert "العربية" in cleaned
        assert "Поднятие уровня" in cleaned
        assert "[b]" not in cleaned and "[/b]" not in cleaned
        assert "[i]" not in cleaned and "[/i]" not in cleaned
        assert "[url=" not in cleaned

    def test_clean_synopsis_mixed_html_and_markdown(self):
        """Verify HTML tags and Markdown links are normalized."""
        mixed = (
            "<p>Official synopsis paragraph.<br/>"
            "Visit <a href='https://example.com'>Website</a> or check "
            "[Original Novel](https://novel.example.com?id=123&chap=1) for details.</p>"
        )
        cleaned = HierarchicalOrganizer.clean_synopsis(mixed)
        assert "<p>" not in cleaned
        assert "<br/>" not in cleaned
        assert "<a href=" not in cleaned
        assert "Official synopsis paragraph." in cleaned
        assert "Original Novel" in cleaned
        assert "https://novel.example.com" not in cleaned

    def test_clean_synopsis_multilingual_dict_priority(self):
        """Verify language dictionary resolution prioritizes Spanish over English."""
        # 1. 'es' present
        d_es = {"en": "English description", "es": "Descripción en español", "ja": "Japanese"}
        assert HierarchicalOrganizer.clean_synopsis(d_es) == "Descripción en español"

        # 2. 'es-la' present
        d_la = {"en": "English description", "es-la": "Descripción en español latino"}
        assert HierarchicalOrganizer.clean_synopsis(d_la) == "Descripción en español latino"

        # 3. Only 'en' present
        d_en = {"en": "English description only"}
        assert HierarchicalOrganizer.clean_synopsis(d_en) == "English description only"

        # 4. Fallback to first available
        d_other = {"ko": "한국어 설명"}
        assert HierarchicalOrganizer.clean_synopsis(d_other) == "한국어 설명"

    def test_clean_synopsis_edge_cases_and_type_safety(self):
        """Verify edge cases like None, empty strings, numbers, and booleans."""
        assert HierarchicalOrganizer.clean_synopsis(None) == ""
        assert HierarchicalOrganizer.clean_synopsis("") == ""
        assert HierarchicalOrganizer.clean_synopsis({}) == ""
        assert HierarchicalOrganizer.clean_synopsis(12345) == "12345"
        assert HierarchicalOrganizer.clean_synopsis(True) == "True"


# ==============================================================================
# Category 4: Adversarial Fuzzing of format_chapter_filename (Floats, Inf, NaN)
# ==============================================================================

class TestFloatFormattingFuzzingAdversarial:
    """Stress tests and fuzzing for HierarchicalOrganizer.format_chapter_filename."""

    @pytest.mark.parametrize("special_val", [
        "inf",
        "-inf",
        "+inf",
        "INF",
        "Infinity",
        "-Infinity",
        "nan",
        "NaN",
        "NAN",
        float("inf"),
        float("-inf"),
        float("nan"),
    ])
    def test_format_chapter_filename_inf_and_nan_variants(self, special_val):
        """
        Verify that special float values (inf, -inf, nan in string and float types)
        do not trigger OverflowError, ValueError, or unhandled crashes.
        """
        res = HierarchicalOrganizer.format_chapter_filename(special_val)
        assert isinstance(res, str)
        assert res.startswith("Capitulo ")
        assert res.endswith(".pdf")
        # Check that str(special_val) is cleanly incorporated
        expected_stem = str(special_val).strip()
        assert expected_stem in res

    @pytest.mark.parametrize("invalid_input,expected_output", [
        ("1.2.3", "Capitulo 1.2.3.pdf"),
        ("abc", "Capitulo abc.pdf"),
        ("ch-01", "Capitulo ch-01.pdf"),
        ("None", "Capitulo None.pdf"),
        ("null", "Capitulo null.pdf"),
        ("", "Capitulo .pdf"),
        ("   ", "Capitulo .pdf"),
        ("1/2", "Capitulo 1/2.pdf"),
        ("100b", "Capitulo 100b.pdf"),
    ])
    def test_format_chapter_filename_malformed_and_non_numeric_strings(self, invalid_input, expected_output):
        """Verify that completely non-numeric or malformed strings fall back safely."""
        assert HierarchicalOrganizer.format_chapter_filename(invalid_input) == expected_output

    @pytest.mark.parametrize("ch_in,pad,expected", [
        (1, 3, "Capitulo 001.pdf"),
        ("1", 3, "Capitulo 001.pdf"),
        (42, 3, "Capitulo 042.pdf"),
        (100, 3, "Capitulo 100.pdf"),
        (999, 3, "Capitulo 999.pdf"),
        (1000, 3, "Capitulo 1000.pdf"),
        (1, 2, "Capitulo 01.pdf"),
        ("5", 2, "Capitulo 05.pdf"),
        (1, 4, "Capitulo 0001.pdf"),
        (14.5, 3, "Capitulo 014.5.pdf"),
        ("14.5", 3, "Capitulo 014.5.pdf"),
        ("0.5", 3, "Capitulo 000.5.pdf"),
        ("0.05", 3, "Capitulo 000.05.pdf"),
        ("100.25", 3, "Capitulo 100.25.pdf"),
        ("14.5", 2, "Capitulo 14.5.pdf"),
        ("0.5", 2, "Capitulo 00.5.pdf"),
    ])
    def test_format_chapter_filename_valid_integers_and_fractions(self, ch_in, pad, expected):
        """Verify standard formatting with different pad_digits and fractional precision."""
        assert HierarchicalOrganizer.format_chapter_filename(ch_in, pad_digits=pad) == expected

    def test_format_chapter_filename_extreme_large_and_small_numbers(self):
        """
        Verify extreme numbers (e.g. 1e20, 1e-10, large integers) do not raise unhandled exceptions.
        """
        # Large integer within IEEE 754 precision
        large_int = 9007199254740991  # 2^53 - 1
        res = HierarchicalOrganizer.format_chapter_filename(large_int)
        assert res == f"Capitulo {large_int:03d}.pdf"

        # Extreme integer beyond IEEE 754 precision (should not crash)
        huge_int = 999999999999999999
        res_huge = HierarchicalOrganizer.format_chapter_filename(huge_int)
        assert res_huge.startswith("Capitulo ") and res_huge.endswith(".pdf")

        # Scientific notation string
        res_sci = HierarchicalOrganizer.format_chapter_filename("1e10")
        assert res_sci.startswith("Capitulo ")
        assert res_sci.endswith(".pdf")

        # Negative number
        res_neg = HierarchicalOrganizer.format_chapter_filename("-5")
        assert res_neg.startswith("Capitulo ")
        assert res_neg.endswith(".pdf")
