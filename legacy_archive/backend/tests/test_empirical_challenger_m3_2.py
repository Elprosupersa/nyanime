"""
Empirical Adversarial Verification & Stress Test Suite — Milestone 3 (Challenger 2).
Target files:
- src/acquisition/pdf_compiler.py
- src/acquisition/manga_downloader.py

Harness coverage:
1. Chapter number fuzzing (integers, decimals, negatives, edge cases, special strings, inf/nan).
2. Boundary condition: Ensure no 'Tomo None' directory is EVER created under any volume=None permutation.
3. BBCode and HTML stripping fuzzing in clean_synopsis (nested, unclosed, URL params, HTML entities, unicode).
4. Temporary page cleanup in MangaPipeline: verify deletion behavior under success, compile failure, and integrity failure.
"""

import os
import json
import shutil
from pathlib import Path
from typing import List, Dict, Any
from unittest.mock import patch, MagicMock

import pytest
from PIL import Image
import pypdf

from src.acquisition.pdf_compiler import PDFCompiler, HierarchicalOrganizer, HAS_IMG2PDF
from src.acquisition.manga_downloader import MangaPipeline
from src.acquisition.integrity_guard import IntegrityGuard


# ==============================================================================
# Category 1: Fuzz Chapter Numbers
# ==============================================================================

class TestChapterNumberFuzzing:
    """Adversarial stress-testing of chapter number formatting."""

    @pytest.mark.parametrize("chapter,expected", [
        (1, "Capitulo 001.pdf"),
        (42, "Capitulo 042.pdf"),
        (100, "Capitulo 100.pdf"),
        (999, "Capitulo 999.pdf"),
        (1000, "Capitulo 1000.pdf"),
        ("1", "Capitulo 001.pdf"),
        ("042", "Capitulo 042.pdf"),
        (0, "Capitulo 000.pdf"),
        ("0", "Capitulo 000.pdf"),
        ("00", "Capitulo 000.pdf"),
    ])
    def test_integer_chapters(self, chapter, expected):
        """Verifies standard integer chapter formatting with 3-digit padding."""
        assert HierarchicalOrganizer.format_chapter_filename(chapter, pad_digits=3) == expected

    @pytest.mark.parametrize("chapter,expected", [
        (14.5, "Capitulo 014.5.pdf"),
        ("14.5", "Capitulo 014.5.pdf"),
        (0.1, "Capitulo 000.1.pdf"),
        ("0.1", "Capitulo 000.1.pdf"),
        (0.5, "Capitulo 000.5.pdf"),
        ("0.05", "Capitulo 000.05.pdf"),
        (12.5, "Capitulo 012.5.pdf"),
        (100.5, "Capitulo 100.5.pdf"),
        ("14.50", "Capitulo 014.50.pdf"),
        (0.0, "Capitulo 000.pdf"),
    ])
    def test_decimal_fractional_chapters(self, chapter, expected):
        """Verifies fractional chapters maintain padded integer part and exact decimal suffix."""
        assert HierarchicalOrganizer.format_chapter_filename(chapter, pad_digits=3) == expected

    @pytest.mark.parametrize("chapter,expected", [
        ("prologue", "Capitulo prologue.pdf"),
        ("oneshot", "Capitulo oneshot.pdf"),
        ("extra 01", "Capitulo extra 01.pdf"),
        ("14.5.1", "Capitulo 14.5.1.pdf"),
        ("epilogue", "Capitulo epilogue.pdf"),
        ("special-01", "Capitulo special-01.pdf"),
    ])
    def test_string_and_sub_fractional_chapters(self, chapter, expected):
        """Verifies non-numeric chapter labels degrade gracefully to Capitulo {label}.pdf."""
        assert HierarchicalOrganizer.format_chapter_filename(chapter, pad_digits=3) == expected

    def test_negative_chapter_numbers(self):
        """Tests negative chapter numbers (prequels/prologues)."""
        res_int = HierarchicalOrganizer.format_chapter_filename(-1, pad_digits=3)
        assert res_int == "Capitulo -01.pdf"
        res_dec = HierarchicalOrganizer.format_chapter_filename(-14.5, pad_digits=3)
        assert res_dec == "Capitulo -14.5.pdf"

    def test_nan_float_handling(self):
        """Verifies string 'nan' is handled without raising an uncaught exception."""
        res = HierarchicalOrganizer.format_chapter_filename("nan", pad_digits=3)
        assert res == "Capitulo nan.pdf"

    def test_infinite_float_adversarial_vulnerability(self):
        """
        Adversarial test: checks behavior when 'inf' or '-inf' is passed.
        Post-M4 hardening: OverflowError is caught and handled gracefully without raising.
        """
        res = HierarchicalOrganizer.format_chapter_filename("inf", pad_digits=3)
        assert res == "Capitulo inf.pdf"



# ==============================================================================
# Category 2: Boundary Conditions — No 'Tomo None' for Continuous Webtoons
# ==============================================================================

class TestTomoNoneBoundaryConditions:
    """Verifies that no 'Tomo None' folder is ever produced under any permutation."""

    @pytest.mark.parametrize("vol_val", [
        None,
        "None",
        "none",
        "NONE",
        "null",
        "Null",
        "NULL",
        "",
        "   ",
        "\t\n",
    ])
    def test_format_volume_folder_returns_none_for_empty_values(self, vol_val):
        """format_volume_folder must return None (or fallback) and NEVER 'Tomo None'."""
        folder = HierarchicalOrganizer.format_volume_folder(vol_val, volume_grouping=True)
        assert folder is None, f"Expected None for volume={repr(vol_val)}, got {repr(folder)}"

    @pytest.mark.parametrize("vol_val", [
        None,
        "None",
        "none",
        "null",
        "",
        "   ",
    ])
    def test_format_chapter_path_never_contains_tomo_none(self, vol_val, tmp_path):
        """format_chapter_path must never contain 'Tomo None' in path string."""
        path = HierarchicalOrganizer.format_chapter_path(
            download_root=tmp_path,
            title_display="Solo Leveling",
            chapter=105,
            volume=vol_val,
            is_webtoon=True
        )
        path_str = str(path)
        assert "Tomo None" not in path_str, f"Found 'Tomo None' in {path_str}"
        assert "Tomo" not in path_str, f"Found unexpected 'Tomo' folder in webtoon path: {path_str}"
        assert path.name == "Capitulo 105.pdf"

    def test_format_chapter_path_with_custom_hierarchy_no_volume(self, tmp_path):
        """Tests custom expected_hierarchy from queue items when volume is None."""
        hierarchy = {
            "volume_grouping": False,
            "folder_volume_pattern": "",
            "file_chapter_pattern": "Capitulo {chapter:03d}.pdf"
        }
        for vol in [None, "None", "none", "", "null"]:
            path = HierarchicalOrganizer.format_chapter_path(
                download_root=tmp_path,
                title_display="The Beginning After The End",
                chapter=175,
                volume=vol,
                expected_hierarchy=hierarchy
            )
            assert "Tomo None" not in str(path)
            assert path.parent == tmp_path / "The Beginning After The End"
            assert path.name == "Capitulo 175.pdf"

    def test_volume_zero_is_preserved_as_tomo_00(self, tmp_path):
        """Volume 0 is a legitimate Tankobon prequel volume (e.g. Jujutsu Kaisen 0) and must not be discarded."""
        folder_int = HierarchicalOrganizer.format_volume_folder(0, volume_grouping=True)
        assert folder_int == "Tomo 00"

        folder_str = HierarchicalOrganizer.format_volume_folder("0", volume_grouping=True)
        assert folder_str == "Tomo 00"

        path = HierarchicalOrganizer.format_chapter_path(
            download_root=tmp_path,
            title_display="Jujutsu Kaisen",
            chapter=1,
            volume=0
        )
        assert "Tomo 00" in str(path)


# ==============================================================================
# Category 3: Adversarial Fuzzing of BBCode and HTML in clean_synopsis
# ==============================================================================

class TestCleanSynopsisFuzzing:
    """Adversarial challenge for clean_synopsis text sanitation."""

    def test_nested_bbcode_tags(self):
        """Nested formatting tags must be completely stripped."""
        raw = "[b][i][u][s]Texto fuertemente estilizado[/s][/u][/i][/b]"
        cleaned = HierarchicalOrganizer.clean_synopsis(raw)
        assert cleaned == "Texto fuertemente estilizado"

    def test_unclosed_bbcode_and_html_tags(self):
        """Unclosed tags should not cause regex catastrophic backtracking or text loss."""
        raw = "[b]Texto en negrita sin cerrar <p>parrafo sin cerrar <i>cursiva"
        cleaned = HierarchicalOrganizer.clean_synopsis(raw)
        assert "Texto en negrita sin cerrar" in cleaned
        assert "parrafo sin cerrar" in cleaned
        assert "<p>" not in cleaned

    def test_url_with_query_params_and_entities_in_bbcode(self):
        """
        Adversarial test: BBCode tags with ?, &, quotes, or percent-encoding.
        Pattern r'\\[/?[a-zA-Z0-9_*=:\\-\\.\\/\\s]+\\]' in pdf_compiler.py line 205
        does not match ?, &, %, or quotes. This empirically reveals that opening tags
        like [url=...?page=1&ref=test] leak into the cleaned synopsis.
        """
        raw = "[url=https://mangadex.org/title/123?page=1&ref=test]Ver en MangaDex[/url]"
        cleaned = HierarchicalOrganizer.clean_synopsis(raw)
        assert "[url=" not in cleaned
        assert "[/url]" not in cleaned
        assert "Ver en MangaDex" in cleaned

    def test_quote_and_spoiler_with_attributes(self):
        """Quotes and spoilers with string titles: [quote=Autor] and [spoiler]."""
        raw = "[quote=Autor]Cita importante[/quote] y [spoiler]Secreto revelado[/spoiler]"
        cleaned = HierarchicalOrganizer.clean_synopsis(raw)
        assert "[quote" not in cleaned
        assert "[/quote]" not in cleaned
        assert "[spoiler]" not in cleaned
        assert "[/spoiler]" not in cleaned
        assert "Cita importante" in cleaned
        assert "Secreto revelado" in cleaned

    def test_malicious_script_and_iframe_tags(self):
        """HTML injection tags must be stripped."""
        raw = "Historia de accion.<script>alert('xss')</script><iframe src='evil.com'></iframe>Fin."
        cleaned = HierarchicalOrganizer.clean_synopsis(raw)
        assert "<script>" not in cleaned
        assert "</script>" not in cleaned
        assert "<iframe" not in cleaned
        assert "Historia de accion." in cleaned

    def test_html_entities(self):
        """Check behavior with common HTML entities."""
        raw = "Solo Leveling &amp; Omniscient Reader &lt;3 &quot;Especial&#39;"
        cleaned = HierarchicalOrganizer.clean_synopsis(raw)
        assert "Solo Leveling" in cleaned
        assert "Omniscient Reader" in cleaned

    def test_unicode_and_multilingual_data(self):
        """Unicode characters (Korean hangul, Japanese kanji, emojis, Spanish punctuation) must survive intact."""
        raw = "⚔️ Solo Leveling (나 혼자만 레벨업) — ¡Una obra épica! 葬送のフリーレン 100% en español."
        cleaned = HierarchicalOrganizer.clean_synopsis(raw)
        assert "⚔️" in cleaned
        assert "나 혼자만 레벨업" in cleaned
        assert "¡Una obra épica!" in cleaned
        assert "葬送のフリーレン" in cleaned
        assert "100% en español." in cleaned

    def test_dictionary_language_priority(self):
        """Tests fallback order: 'es' -> 'es-la' -> 'en' -> first available."""
        d_es = {"en": "English synopsis", "es": "Sinopsis en castellano"}
        assert HierarchicalOrganizer.clean_synopsis(d_es) == "Sinopsis en castellano"

        d_esla = {"en": "English synopsis", "es-la": "Sinopsis latino"}
        assert HierarchicalOrganizer.clean_synopsis(d_esla) == "Sinopsis latino"

        d_en = {"en": "English synopsis", "ja": "日本語"}
        assert HierarchicalOrganizer.clean_synopsis(d_en) == "English synopsis"

        d_other = {"fr": "Synopsis en francais"}
        assert HierarchicalOrganizer.clean_synopsis(d_other) == "Synopsis en francais"

    def test_empty_and_none_synopsis(self):
        """Tests None, empty string, empty dict."""
        assert HierarchicalOrganizer.clean_synopsis(None) == ""
        assert HierarchicalOrganizer.clean_synopsis("") == ""
        assert HierarchicalOrganizer.clean_synopsis({}) == ""


# ==============================================================================
# Category 4: Temporary Page Cleanup in MangaPipeline
# ==============================================================================

class TestTemporaryPageCleanupBehavior:
    """
    Adversarial verification of temporary page cleanup in MangaPipeline.download_chapter_group:
    Requirement: Verify that temporary images are deleted ONLY when the PDF is successfully
    created and valid (> 1024 bytes).
    """

    @pytest.fixture
    def synthetic_chapter_setup(self, tmp_path):
        """Creates 3 synthetic valid 600x800 JPEG images (~27 KB PDF) and mock metadata."""
        img_dir = tmp_path / "raw_pages"
        img_dir.mkdir(parents=True, exist_ok=True)
        img_paths = []
        for i in range(3):
            p = img_dir / f"page_{i:02d}.jpg"
            img = Image.new("RGB", (600, 800), color=(100 + i * 40, 50, 50))
            img.save(p, "JPEG", quality=90)
            img_paths.append(p)

        ch_info = {
            "chapter": "1",
            "volume": "1",
            "candidates": [
                {"id": "cand_1", "pages": len(img_paths), "volume": "1", "lang": "es-la", "version": 1}
            ]
        }
        return img_paths, ch_info

    def test_temp_pages_cleaned_when_pdf_successfully_created(self, synthetic_chapter_setup, tmp_path):
        """When PDF creation succeeds and passes integrity check (> 10 KB), temporary files are cleaned."""
        img_paths, ch_info = synthetic_chapter_setup
        pipeline = MangaPipeline(output_root=str(tmp_path / "out"), max_workers=2)
        manga_dir = tmp_path / "out" / "Solo Leveling"
        temp_cache = tmp_path / ".temp_cache"

        page_names = [p.name for p in img_paths]
        athome_ret = ("https://base.mock", "hash1", page_names, [])

        def mock_download_page(b_url, hsh, p_name, s_name, dest_p):
            src = next((p for p in img_paths if p.name == p_name), img_paths[0])
            shutil.copyfile(src, dest_p)
            return True

        with patch.object(pipeline.client, "get_chapter_pages_info", return_value=athome_ret):
            with patch.object(pipeline, "_download_single_page", side_effect=mock_download_page):
                ok = pipeline.download_chapter_group(ch_info, manga_dir, temp_cache)
                assert ok is True

        # PDF must exist and be valid
        dest_pdf = manga_dir / "Tomo 01" / "Capitulo 01.pdf"
        assert dest_pdf.exists()
        assert dest_pdf.stat().st_size > 1024

        # Temporary files must be cleaned
        ch_temp = temp_cache / "cand_1"
        assert not ch_temp.exists() or len(list(ch_temp.iterdir())) == 0

    def test_temp_pages_cleanup_behavior_on_pdfcompiler_failure(self, synthetic_chapter_setup, tmp_path):
        """
        Adversarial challenge:
        When PDFCompiler.compile_chapter FAILS (returns False):
        manga_downloader.py lines 197-205 deletes temporary files prematurely
        BEFORE checking `if ok:`. This empirically proves the flaw where images
        are NOT deleted ONLY when the PDF is successfully created!
        """
        img_paths, ch_info = synthetic_chapter_setup
        pipeline = MangaPipeline(output_root=str(tmp_path / "out"), max_workers=2)
        manga_dir = tmp_path / "out" / "Solo Leveling"
        temp_cache = tmp_path / ".temp_cache"

        page_names = [p.name for p in img_paths]
        athome_ret = ("https://base.mock", "hash1", page_names, [])

        recorded_temp_files = []

        def mock_download_page(b_url, hsh, p_name, s_name, dest_p):
            src = next((p for p in img_paths if p.name == p_name), img_paths[0])
            shutil.copyfile(src, dest_p)
            recorded_temp_files.append(dest_p)
            return True

        with patch.object(pipeline.client, "get_chapter_pages_info", return_value=athome_ret):
            with patch.object(pipeline, "_download_single_page", side_effect=mock_download_page):
                with patch.object(PDFCompiler, "compile_chapter", return_value=False):
                    ok = pipeline.download_chapter_group(ch_info, manga_dir, temp_cache)
                    assert ok is False

        # Target PDF must NOT exist
        dest_pdf = manga_dir / "Tomo 01" / "Capitulo 01.pdf"
        assert not dest_pdf.exists()

        # Hardened behavior per M4: temporary files are preserved when compile_chapter fails!
        surviving_files = [p for p in recorded_temp_files if p.exists()]
        assert len(surviving_files) == len(recorded_temp_files)

    def test_temp_pages_cleanup_behavior_on_integrity_guard_failure(self, synthetic_chapter_setup, tmp_path):
        """
        Adversarial challenge:
        When PDFCompiler succeeds, but IntegrityGuard.verify_pdf FAILS (PDF corrupt/too small):
        Temporary images were already unlinked on line 199 prior to line 209's integrity verification!
        """
        img_paths, ch_info = synthetic_chapter_setup
        pipeline = MangaPipeline(output_root=str(tmp_path / "out"), max_workers=2)
        manga_dir = tmp_path / "out" / "Solo Leveling"
        temp_cache = tmp_path / ".temp_cache"

        page_names = [p.name for p in img_paths]
        athome_ret = ("https://base.mock", "hash1", page_names, [])

        recorded_temp_files = []

        def mock_download_page(b_url, hsh, p_name, s_name, dest_p):
            src = next((p for p in img_paths if p.name == p_name), img_paths[0])
            shutil.copyfile(src, dest_p)
            recorded_temp_files.append(dest_p)
            return True

        with patch.object(pipeline.client, "get_chapter_pages_info", return_value=athome_ret):
            with patch.object(pipeline, "_download_single_page", side_effect=mock_download_page):
                with patch.object(IntegrityGuard, "verify_pdf", return_value=(False, "Corrupted structural test")):
                    ok = pipeline.download_chapter_group(ch_info, manga_dir, temp_cache)
                    assert ok is False

        # Since integrity check failed, dest_pdf should have been unlinked
        dest_pdf = manga_dir / "Tomo 01" / "Capitulo 01.pdf"
        assert not dest_pdf.exists()

        # Verify that temp files are preserved when verify_pdf fails per M4 hardening
        surviving_files = [p for p in recorded_temp_files if p.exists()]
        assert len(surviving_files) == len(recorded_temp_files)
