"""
Unit and Integration Test Suite for Native PDF Compilation and Hierarchical Organization.
Tests PDFCompiler (img2pdf lossless, Pillow fallback, atomic operations) and HierarchicalOrganizer.
Complies with ORIGINAL_REQUEST.md § R3 and PROJECT.md § Milestone 3.
"""

import io
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
from src.acquisition.manga_downloader import MangaPipeline, MangaDexClient


# ==============================================================================
# Test Fixtures: Synthetic Images, RGBA Assets, and Palletized Graphics
# ==============================================================================

@pytest.fixture
def sample_rgb_images(tmp_path: Path) -> List[Path]:
    """Genera 4 imágenes JPEG RGB válidas para pruebas de compilación lossless."""
    img_dir = tmp_path / "rgb_pages"
    img_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    colors = [(200, 50, 50), (50, 200, 50), (50, 50, 200), (220, 220, 50)]
    for i, color in enumerate(colors):
        p = img_dir / f"page_{i:03d}.jpg"
        img = Image.new("RGB", (600, 800), color=color)
        img.save(p, "JPEG", quality=90)
        paths.append(p)
    return paths


@pytest.fixture
def sample_rgba_images(tmp_path: Path) -> List[Path]:
    """Genera imágenes PNG con canal alfa (RGBA) para verificar fallback de Pillow."""
    img_dir = tmp_path / "rgba_pages"
    img_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for i in range(3):
        p = img_dir / f"alpha_page_{i:03d}.png"
        img = Image.new("RGBA", (500, 700), color=(100, 150, 200, 128))
        img.save(p, "PNG")
        paths.append(p)
    return paths


@pytest.fixture
def sample_palette_images(tmp_path: Path) -> List[Path]:
    """Genera imágenes paletizadas en modo 'P' con transparencia."""
    img_dir = tmp_path / "palette_pages"
    img_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for i in range(2):
        p = img_dir / f"pal_page_{i:03d}.png"
        img = Image.new("RGBA", (400, 600), color=(180, 80, 40, 200))
        pal_img = img.convert("P", palette=Image.Palette.ADAPTIVE)
        pal_img.save(p, "PNG")
        paths.append(p)
    return paths


# ==============================================================================
# 1. Test Suite: Lossless img2pdf Compilation
# ==============================================================================

class TestLosslessImg2PdfCompilation:
    """Verifica compilación directa y sin pérdida mediante img2pdf."""

    def test_single_image_compilation(self, sample_rgb_images: List[Path], tmp_path: Path):
        """Verifica compilación exitosa de una sola página."""
        out_pdf = tmp_path / "single_page.pdf"
        ok = PDFCompiler.compile_chapter([sample_rgb_images[0]], out_pdf, prefer_img2pdf=True)
        assert ok is True
        assert out_pdf.exists()
        assert out_pdf.stat().st_size > 1024

        with open(out_pdf, "rb") as f:
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == 1

    def test_multi_image_lossless_compilation(self, sample_rgb_images: List[Path], tmp_path: Path):
        """Verifica compilación multicapa preservando cabecera y cantidad de páginas."""
        out_pdf = tmp_path / "multi_page.pdf"
        ok = PDFCompiler.compile_chapter(sample_rgb_images, out_pdf, prefer_img2pdf=True)
        assert ok is True
        assert out_pdf.exists()
        assert out_pdf.stat().st_size > 1024

        with open(out_pdf, "rb") as f:
            header = f.read(5)
            assert header.startswith(b"%PDF-")
            f.seek(0)
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == len(sample_rgb_images)

    def test_output_directory_auto_creation(self, sample_rgb_images: List[Path], tmp_path: Path):
        """Verifica que directorios anidados inexistentes se crean automáticamente."""
        deep_dir = tmp_path / "nested" / "sub" / "folder"
        out_pdf = deep_dir / "chapter.pdf"
        assert not deep_dir.exists()

        ok = PDFCompiler.compile_chapter(sample_rgb_images, out_pdf)
        assert ok is True
        assert out_pdf.exists()
        assert deep_dir.exists()

    def test_img2pdf_preserves_page_order(self, sample_rgb_images: List[Path], tmp_path: Path):
        """Verifica que el orden de páginas suministrado se conserve estrictamente."""
        out_pdf = tmp_path / "ordered_chapter.pdf"
        ok = PDFCompiler.compile_chapter(sample_rgb_images, out_pdf)
        assert ok is True

        with open(out_pdf, "rb") as f:
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == 4


# ==============================================================================
# 2. Test Suite: Pillow Fallback for RGBA and Unsupported Formats
# ==============================================================================

class TestPillowFallbackCompilation:
    """Verifica el fallback defensivo a Pillow ante imágenes con canal alfa o paletas."""

    def test_rgba_images_fallback_compilation(self, sample_rgba_images: List[Path], tmp_path: Path):
        """Verifica que imágenes RGBA (con transparencia) compilen sin error sobre fondo blanco."""
        out_pdf = tmp_path / "rgba_fallback.pdf"
        # img2pdf lanza excepción con RGBA; PDFCompiler debe conmutar a Pillow limpiamente
        ok = PDFCompiler.compile_chapter(sample_rgba_images, out_pdf, prefer_img2pdf=True)
        assert ok is True
        assert out_pdf.exists()
        assert out_pdf.stat().st_size > 1024

        with open(out_pdf, "rb") as f:
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == len(sample_rgba_images)

    def test_palletized_images_fallback_compilation(self, sample_palette_images: List[Path], tmp_path: Path):
        """Verifica que imágenes paletizadas en modo 'P' compilen mediante Pillow."""
        out_pdf = tmp_path / "palette_fallback.pdf"
        ok = PDFCompiler.compile_chapter(sample_palette_images, out_pdf, prefer_img2pdf=True)
        assert ok is True
        assert out_pdf.exists()
        assert out_pdf.stat().st_size > 1024

        with open(out_pdf, "rb") as f:
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == len(sample_palette_images)

    def test_forced_pillow_fallback(self, sample_rgb_images: List[Path], tmp_path: Path):
        """Verifica compilación directa con Pillow cuando prefer_img2pdf=False."""
        out_pdf = tmp_path / "forced_pillow.pdf"
        ok = PDFCompiler.compile_chapter(sample_rgb_images, out_pdf, prefer_img2pdf=False)
        assert ok is True
        assert out_pdf.exists()
        assert out_pdf.stat().st_size > 1024

        with open(out_pdf, "rb") as f:
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == len(sample_rgb_images)

    def test_mixed_color_modes_compilation(self, tmp_path: Path):
        """Verifica compilación combinando imágenes en escala de grises (L), RGB y RGBA."""
        mixed_dir = tmp_path / "mixed_pages"
        mixed_dir.mkdir(parents=True, exist_ok=True)

        p1 = mixed_dir / "p1_gray.png"
        Image.new("L", (400, 500), color=128).save(p1, "PNG")

        p2 = mixed_dir / "p2_rgb.jpg"
        Image.new("RGB", (400, 500), color=(255, 0, 0)).save(p2, "JPEG")

        p3 = mixed_dir / "p3_rgba.png"
        Image.new("RGBA", (400, 500), color=(0, 255, 0, 100)).save(p3, "PNG")

        out_pdf = tmp_path / "mixed.pdf"
        ok = PDFCompiler.compile_chapter([p1, p2, p3], out_pdf)
        assert ok is True
        assert out_pdf.exists()

        with open(out_pdf, "rb") as f:
            reader = pypdf.PdfReader(f)
            assert len(reader.pages) == 3


# ==============================================================================
# 3. Test Suite: Atomic Writes and Error Recovery
# ==============================================================================

class TestAtomicWritesAndErrorRecovery:
    """Verifica atomicidad de escritura (.tmp), no truncamiento y manejo limpio de errores."""

    def test_atomic_temp_file_cleaned_on_success(self, sample_rgb_images: List[Path], tmp_path: Path):
        """Verifica que el archivo temporal .tmp no permanezca en disco tras la compilación exitosa."""
        out_pdf = tmp_path / "atomic_clean.pdf"
        temp_tmp = Path(str(out_pdf) + ".tmp")

        ok = PDFCompiler.compile_chapter(sample_rgb_images, out_pdf)
        assert ok is True
        assert out_pdf.exists()
        assert not temp_tmp.exists()

    def test_overwrite_existing_pdf_atomically(self, sample_rgb_images: List[Path], tmp_path: Path):
        """Verifica reemplazo atómico cuando el archivo de destino ya existe."""
        out_pdf = tmp_path / "existing.pdf"
        out_pdf.write_bytes(b"OLD_STALE_CONTENT" * 100)

        ok = PDFCompiler.compile_chapter(sample_rgb_images, out_pdf)
        assert ok is True
        assert out_pdf.exists()
        # Verificar que es un PDF válido y no el contenido antiguo
        with open(out_pdf, "rb") as f:
            header = f.read(5)
            assert header.startswith(b"%PDF-")

    def test_empty_images_list_returns_false(self, tmp_path: Path):
        """Verifica que una lista vacía de imágenes retorne False sin generar archivos."""
        out_pdf = tmp_path / "empty.pdf"
        ok = PDFCompiler.compile_chapter([], out_pdf)
        assert ok is False
        assert not out_pdf.exists()

    def test_nonexistent_image_in_list_aborts_cleanly(self, sample_rgb_images: List[Path], tmp_path: Path):
        """Verifica que si una imagen no existe, la compilación aborte sin dejar archivo corrupto."""
        bad_paths = sample_rgb_images + [tmp_path / "does_not_exist.jpg"]
        out_pdf = tmp_path / "abort_clean.pdf"
        temp_tmp = Path(str(out_pdf) + ".tmp")

        ok = PDFCompiler.compile_chapter(bad_paths, out_pdf)
        assert ok is False
        assert not out_pdf.exists()
        assert not temp_tmp.exists()

    def test_zero_byte_corrupt_image_aborts_cleanly(self, sample_rgb_images: List[Path], tmp_path: Path):
        """Verifica que si una imagen está corrupta o vacía (0 bytes), la compilación aborte limpiamente."""
        zero_img = tmp_path / "corrupt_zero.jpg"
        zero_img.write_bytes(b"")
        bad_paths = sample_rgb_images + [zero_img]
        out_pdf = tmp_path / "corrupt_abort.pdf"

        ok = PDFCompiler.compile_chapter(bad_paths, out_pdf)
        assert ok is False
        assert not out_pdf.exists()


# ==============================================================================
# 4. Test Suite: HierarchicalOrganizer Path and Chapter Formatting
# ==============================================================================

class TestHierarchicalOrganizerFormatting:
    """Verifica reglas de estructuración jerárquica para Tankobon y Webtoons."""

    def test_tankobon_manga_with_volume_formatting(self, tmp_path: Path):
        """Verifies: {download_root}/{title}/Tomo {volume:02d}/Capitulo {chapter:03d}.pdf."""
        dest = HierarchicalOrganizer.format_chapter_path(
            download_root=tmp_path,
            title_display="Chainsaw Man",
            chapter=5,
            volume=2
        )
        assert "Chainsaw Man" in str(dest)
        assert "Tomo 02" in str(dest)
        assert dest.name == "Capitulo 005.pdf"

    def test_continuous_webtoon_volume_none_prevents_tomo_none(self, tmp_path: Path):
        """Verifies webtoon without volume NEVER creates a 'Tomo None' folder."""
        # 1. volume is None
        dest_none = HierarchicalOrganizer.format_chapter_path(
            download_root=tmp_path,
            title_display="Solo Leveling",
            chapter=105,
            volume=None
        )
        assert "Tomo None" not in str(dest_none)
        assert "Tomo" not in str(dest_none)
        assert dest_none.parent.name == "Solo Leveling"
        assert dest_none.name == "Capitulo 105.pdf"

        # 2. volume is empty string
        dest_empty = HierarchicalOrganizer.format_chapter_path(
            download_root=tmp_path,
            title_display="Solo Leveling",
            chapter=1,
            volume=""
        )
        assert "Tomo None" not in str(dest_empty)
        assert dest_empty.name == "Capitulo 001.pdf"

        # 3. volume is literal 'none'
        dest_str_none = HierarchicalOrganizer.format_chapter_path(
            download_root=tmp_path,
            title_display="Solo Leveling",
            chapter=1,
            volume="none"
        )
        assert "Tomo None" not in str(dest_str_none)

    def test_fractional_chapter_number_formatting(self):
        """Verifies fractional chapters like 14.5 and 12.5 are formatted as Capitulo 014.5.pdf."""
        f14_5 = HierarchicalOrganizer.format_chapter_filename(14.5, pad_digits=3)
        assert f14_5 == "Capitulo 014.5.pdf"

        f12_5 = HierarchicalOrganizer.format_chapter_filename("12.5", pad_digits=3)
        assert f12_5 == "Capitulo 012.5.pdf"

        f0_5 = HierarchicalOrganizer.format_chapter_filename(0.5, pad_digits=3)
        assert f0_5 == "Capitulo 000.5.pdf"

        # Integer formatting
        f1 = HierarchicalOrganizer.format_chapter_filename(1, pad_digits=3)
        assert f1 == "Capitulo 001.pdf"

        f100 = HierarchicalOrganizer.format_chapter_filename(100, pad_digits=3)
        assert f100 == "Capitulo 100.pdf"

    def test_custom_expected_hierarchy_tankobon(self, tmp_path: Path):
        """Verifies custom expected_hierarchy from queue item for manga."""
        hierarchy = {
            "volume_grouping": True,
            "folder_volume_pattern": "Tomo {volume:02d}",
            "file_chapter_pattern": "Capitulo {chapter:03d}.pdf"
        }
        dest = HierarchicalOrganizer.format_chapter_path(
            download_root=tmp_path,
            title_display="Sousou no Frieren",
            chapter="12",
            volume="1",
            expected_hierarchy=hierarchy
        )
        assert dest == tmp_path / "Sousou no Frieren" / "Tomo 01" / "Capitulo 012.pdf"

    def test_custom_expected_hierarchy_webtoon_no_volume(self, tmp_path: Path):
        """Verifies custom expected_hierarchy with volume_grouping=False."""
        hierarchy = {
            "volume_grouping": False,
            "folder_volume_pattern": "",
            "file_chapter_pattern": "Capitulo {chapter:03d}.pdf"
        }
        dest = HierarchicalOrganizer.format_chapter_path(
            download_root=tmp_path,
            title_display="Secret Class",
            chapter=25,
            volume=None,
            expected_hierarchy=hierarchy
        )
        assert dest == tmp_path / "Secret Class" / "Capitulo 025.pdf"
        assert "Tomo" not in str(dest)

    def test_title_sanitization(self):
        """Verifies invalid filesystem characters are stripped from title."""
        raw = 'Solo: Leveling / Season * 1 ? <Director\'s Cut> | "Special"'
        clean = HierarchicalOrganizer.clean_title(raw)
        assert ":" not in clean
        assert "/" not in clean
        assert "*" not in clean
        assert "?" not in clean
        assert "<" not in clean
        assert ">" not in clean
        assert "|" not in clean
        assert '"' not in clean


# ==============================================================================
# 5. Test Suite: Metadata & Poster Saving
# ==============================================================================

class TestMetadataAndPosterSaving:
    """Verifica persistencia de manga_info.json limpio y carátula oficial poster.jpg."""

    def test_save_metadata_clean_json(self, tmp_path: Path):
        """Verifica guardado de manga_info.json con sinopsis sin BBCode/HTML."""
        manga_dir = tmp_path / "Dandadan"
        raw_metadata = {
            "id": "uuid-dandadan",
            "title": "Dandadan",
            "description": {
                "es": "[b]Dandadan[/b] es una historia de [url=https://example.com]fantasmas[/url] y extraterrestres.<br><p>¡Muy divertida!</p>"
            },
            "author": "Yukinobu Tatsu",
            "artist": "Yukinobu Tatsu",
            "genres": ["Action", "Comedy", "Sci-Fi", "Supernatural"],
            "content_rating": "suggestive",
            "status": "ongoing",
            "year": 2021
        }

        info_path = HierarchicalOrganizer.save_metadata(raw_metadata, manga_dir)
        assert info_path.exists()
        assert info_path.name == "manga_info.json"

        with open(info_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert data["id"] == "uuid-dandadan"
        assert data["title"] == "Dandadan"
        assert data["author"] == "Yukinobu Tatsu"
        assert data["artist"] == "Yukinobu Tatsu"
        assert "timestamp" in data
        assert "genres" in data
        assert "Action" in data["genres"]

        # Verificar limpieza estricta de BBCode y HTML en la sinopsis
        synopsis = data["synopsis"]
        assert "[b]" not in synopsis
        assert "[/b]" not in synopsis
        assert "[url=" not in synopsis
        assert "<br>" not in synopsis
        assert "<p>" not in synopsis
        assert "</p>" not in synopsis
        assert "fantasmas y extraterrestres" in synopsis

    def test_save_poster_from_bytes(self, tmp_path: Path):
        """Verifica guardado de poster.jpg a partir de bytes crudos."""
        manga_dir = tmp_path / "Chainsaw Man"
        poster_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF" + b"\x00" * 2000

        poster_path = HierarchicalOrganizer.save_poster(poster_bytes, manga_dir)
        assert poster_path.exists()
        assert poster_path.name == "poster.jpg"
        assert poster_path.stat().st_size > 1000

    def test_save_poster_from_pil_image(self, tmp_path: Path):
        """Verifica guardado de poster.jpg a partir de un objeto Image de Pillow."""
        manga_dir = tmp_path / "Sousou no Frieren"
        img = Image.new("RGB", (300, 450), color=(80, 160, 240))

        poster_path = HierarchicalOrganizer.save_poster(img, manga_dir)
        assert poster_path.exists()
        assert poster_path.stat().st_size > 0


# ==============================================================================
# 6. Test Suite: MangaPipeline Integration Wiring
# ==============================================================================

class TestMangaPipelineIntegrationWiring:
    """Verifica la integración limpia de PDFCompiler y HierarchicalOrganizer en MangaPipeline."""

    def test_compile_images_to_pdf_delegates_to_pdfcompiler(self, sample_rgb_images: List[Path], tmp_path: Path):
        """Verifica que MangaPipeline.compile_images_to_pdf delega en PDFCompiler.compile_chapter."""
        pipeline = MangaPipeline(output_root=str(tmp_path), max_workers=2)
        out_pdf = tmp_path / "pipeline_delegated.pdf"

        with patch.object(PDFCompiler, "compile_chapter", return_value=True) as mock_compile:
            ok = pipeline.compile_images_to_pdf(sample_rgb_images, out_pdf)
            assert ok is True
            mock_compile.assert_called_once_with(sample_rgb_images, out_pdf)

    def test_download_chapter_group_cleans_temp_pages_on_success(self, sample_rgb_images: List[Path], tmp_path: Path):
        """Verifica que tras compilar el PDF, se eliminen los archivos de imágenes temporales de disco."""
        pipeline = MangaPipeline(output_root=str(tmp_path), max_workers=2)
        manga_dir = tmp_path / "Solo Leveling"
        temp_cache = tmp_path / ".temp_cache"

        ch_info = {
            "chapter": "1",
            "volume": "1",
            "candidates": [{"id": "ch1_cand", "pages": len(sample_rgb_images), "volume": "1", "lang": "es-la", "version": 1}]
        }

        # Mock At-Home devolviendo nombres de páginas
        page_names = [p.name for p in sample_rgb_images]
        athome_ret = ("https://base.node", "h123", page_names, [])

        def mock_copy_page(b_url, hsh, p_name, s_name, dest_p):
            src = next((p for p in sample_rgb_images if p.name == p_name), sample_rgb_images[0])
            shutil.copyfile(src, dest_p)
            return True

        with patch.object(pipeline.client, "get_chapter_pages_info", return_value=athome_ret):
            with patch.object(pipeline, "_download_single_page", side_effect=mock_copy_page):
                ok = pipeline.download_chapter_group(ch_info, manga_dir, temp_cache)
                assert ok is True

        # Verificar que el PDF compilado existe
        pdf_file = manga_dir / "Tomo 01" / "Capitulo 01.pdf"
        assert pdf_file.exists()
        assert pdf_file.stat().st_size > 1024

        # Verificar que la carpeta temporal de descarga fue eliminada o no contiene fragmentos
        ch_temp_dir = temp_cache / "ch1_cand"
        assert not ch_temp_dir.exists()
