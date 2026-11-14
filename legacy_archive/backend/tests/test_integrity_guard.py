"""
Suite de pruebas unitarias y de integración para IntegrityGuard y CheckpointManager (Milestone 4).
Valida verificación profunda de PDFs con pypdf, cabeceras %PDF-, margen de disco y atomicidad de checkpoints.
"""

import os
import json
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from PIL import Image
import pypdf

from src.acquisition.integrity_guard import IntegrityGuard
from src.acquisition.checkpoint_manager import CheckpointManager
from src.acquisition.pdf_compiler import PDFCompiler, HierarchicalOrganizer


@pytest.fixture
def temp_work_dir():
    temp_dir = tempfile.mkdtemp(prefix="test_integrity_")
    yield Path(temp_dir)
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def sample_valid_pdf(temp_work_dir):
    """Genera un archivo PDF válido real con tamaño superior a 10 KB."""
    images = []
    for i in range(2):
        img_p = temp_work_dir / f"page_{i}.jpg"
        img = Image.new("RGB", (600, 800), color=(i * 100, 150, 200))
        img.save(img_p, "JPEG", quality=90)
        images.append(img_p)

    output_pdf = temp_work_dir / "valid_chapter.pdf"
    success = PDFCompiler.compile_chapter(images, output_pdf)
    assert success is True
    # Si el archivo es menor a 10 KB, lo inflamos con datos binarios anexados de manera válida o imagen más grande
    if output_pdf.stat().st_size < IntegrityGuard.MIN_PDF_BYTES:
        large_img = temp_work_dir / "large_page.jpg"
        img_large = Image.new("RGB", (1200, 1600), color=(200, 100, 50))
        img_large.save(large_img, "JPEG", quality=95)
        PDFCompiler.compile_chapter([large_img, images[0]], output_pdf)
    return output_pdf


# ==============================================================================
# 1. Pruebas de Verificación Estructural de PDF (IntegrityGuard)
# ==============================================================================

class TestIntegrityGuardPdfVerification:
    def test_verify_pdf_valid(self, sample_valid_pdf):
        """Verifica que un PDF real generado cumpla todos los criterios de integridad."""
        is_valid, reason = IntegrityGuard.verify_pdf(sample_valid_pdf, min_pages=1)
        assert is_valid is True
        assert "íntegro" in reason

    def test_verify_pdf_nonexistent(self, temp_work_dir):
        """Verifica que una ruta inexistente sea rechazada limpiamente."""
        nonexistent = temp_work_dir / "does_not_exist.pdf"
        is_valid, reason = IntegrityGuard.verify_pdf(nonexistent)
        assert is_valid is False
        assert "no existe" in reason

    def test_verify_pdf_too_small(self, temp_work_dir):
        """Verifica que un archivo menor a 10 KB sea rechazado."""
        small_pdf = temp_work_dir / "tiny.pdf"
        small_pdf.write_bytes(b"%PDF-1.4 tiny content")
        assert small_pdf.stat().st_size < IntegrityGuard.MIN_PDF_BYTES
        is_valid, reason = IntegrityGuard.verify_pdf(small_pdf)
        assert is_valid is False
        assert "Tamaño insuficiente" in reason

    def test_verify_pdf_corrupt_header(self, temp_work_dir):
        """Verifica que un archivo > 10 KB sin cabecera %PDF- sea rechazado."""
        corrupt_pdf = temp_work_dir / "bad_header.pdf"
        corrupt_pdf.write_bytes(b"INVALID_HEADER_" + b"0" * (12 * 1024))
        is_valid, reason = IntegrityGuard.verify_pdf(corrupt_pdf)
        assert is_valid is False
        assert "Cabecera binaria inválida" in reason

    def test_verify_pdf_corrupt_structure(self, temp_work_dir):
        """Verifica que un archivo con cabecera %PDF- pero estructura interna truncada/corrupta falle."""
        corrupt_pdf = temp_work_dir / "bad_structure.pdf"
        # Cabecera %PDF- pero bytes basura que pypdf no puede leer
        corrupt_pdf.write_bytes(b"%PDF-1.7\n%corrupt_stream\n" + b"\xff\x00\xfe\x01" * 3000)
        is_valid, reason = IntegrityGuard.verify_pdf(corrupt_pdf)
        assert is_valid is False
        assert "Corrupción estructural" in reason

    def test_verify_pdf_insufficient_pages(self, sample_valid_pdf):
        """Verifica que si el número de páginas es menor que min_pages se rechace."""
        is_valid, reason = IntegrityGuard.verify_pdf(sample_valid_pdf, min_pages=10)
        assert is_valid is False
        assert "Páginas insuficientes" in reason

    def test_verify_pdf_encrypted_rejected(self, sample_valid_pdf):
        """Verifica que un PDF marcado como encriptado sea rechazado."""
        with patch("pypdf.PdfReader") as mock_reader_cls:
            mock_reader = MagicMock()
            mock_reader.is_encrypted = True
            mock_reader_cls.return_value = mock_reader

            is_valid, reason = IntegrityGuard.verify_pdf(sample_valid_pdf)
            assert is_valid is False
            assert "encriptado" in reason.lower()

    def test_verify_pdf_iterates_all_pages_detects_corrupted_later_page(self, temp_work_dir):
        """Verifica que la iteración por todas las páginas capture errores en páginas posteriores."""
        fake_pdf = temp_work_dir / "multi_page_corrupt.pdf"
        fake_pdf.write_bytes(b"%PDF-1.4\n" + b"X" * (12 * 1024))

        with patch("pypdf.PdfReader") as mock_reader_cls:
            mock_reader = MagicMock()
            mock_reader.is_encrypted = False
            page1 = MagicMock()
            page2 = MagicMock()
            # La página 2 lanza excepción al acceder a su contenido o mediabox
            type(page2).mediabox = property(lambda self: (_ for _ in ()).throw(ValueError("Corrupt mediabox")))
            mock_reader.pages = [page1, page2]
            mock_reader_cls.return_value = mock_reader

            is_valid, reason = IntegrityGuard.verify_pdf(fake_pdf, min_pages=2)
            assert is_valid is False
            assert "Corrupción estructural" in reason


# ==============================================================================
# 2. Pruebas de Margen de Disco (IntegrityGuard)
# ==============================================================================

class TestIntegrityGuardDiskMargin:
    def test_get_free_space_gb(self, temp_work_dir):
        """Verifica cálculo de espacio libre en Gigabytes."""
        free_gb = IntegrityGuard.get_free_space_gb(temp_work_dir)
        assert isinstance(free_gb, float)
        assert free_gb > 0.0

    def test_check_disk_margin_sufficient_space(self, temp_work_dir):
        """Verifica que con espacio suficiente el chequeo retorne True."""
        with patch("shutil.disk_usage") as mock_usage:
            # Simular 50 GB libres
            mock_usage.return_value = shutil._ntuple_diskusage(100 * 1024**3, 50 * 1024**3, 50 * 1024**3)
            assert IntegrityGuard.check_disk_margin(drive="E:\\", min_free_gb=15.0) is True

    def test_check_disk_margin_low_space(self, temp_work_dir):
        """Verifica que con espacio insuficiente el chequeo retorne False."""
        with patch("shutil.disk_usage") as mock_usage:
            # Simular sólo 8 GB libres cuando se exigen 15 GB
            mock_usage.return_value = shutil._ntuple_diskusage(100 * 1024**3, 92 * 1024**3, 8 * 1024**3)
            assert IntegrityGuard.check_disk_margin(drive="E:\\", min_free_gb=15.0) is False

    def test_check_disk_margin_fallback_nonexistent_drive(self):
        """Verifica que una unidad inexistente realice fallback seguro sin lanzar excepción."""
        result = IntegrityGuard.check_disk_margin(drive="Z:\\unidad_fantasma_segura", min_free_gb=0.001)
        assert isinstance(result, bool)

    def test_is_idempotent_skip(self, sample_valid_pdf, temp_work_dir):
        """Verifica comprobación de idempotencia para omitir descargas ya completas."""
        assert IntegrityGuard.is_idempotent_skip(sample_valid_pdf) is True
        assert IntegrityGuard.is_idempotent_skip(temp_work_dir / "missing.pdf") is False


# ==============================================================================
# 3. Pruebas Atómicas y Estructura de CheckpointManager
# ==============================================================================

class TestCheckpointManagerAtomicOperations:
    def test_checkpoint_metrics_calculation(self, temp_work_dir, sample_valid_pdf):
        """Verifica cálculo de métricas agregadas de series y capítulos en PDF."""
        manga_root = temp_work_dir / "Manga"
        serie_dir = manga_root / "TestManga" / "Tomo 01"
        serie_dir.mkdir(parents=True, exist_ok=True)
        dest_pdf = serie_dir / "Capitulo 001.pdf"
        shutil.copy(sample_valid_pdf, dest_pdf)

        mgr = CheckpointManager(root_dir=temp_work_dir)
        metrics = mgr.get_current_metrics(output_root=manga_root)

        assert metrics["total_series"] == 1
        assert metrics["total_pdfs"] == 1
        assert metrics["total_gb_manga"] > 0
        assert metrics["free_disk_gb"] > 0

    def test_update_checkpoint_atomic_creation(self, temp_work_dir):
        """Verifica escritura atómica sin dejar archivos temporales .tmp."""
        mgr = CheckpointManager(root_dir=temp_work_dir)
        ok = mgr.update_checkpoint(
            current_title="Solo Leveling",
            chapter_count=179,
            status_note="Prueba de sincronización atómica"
        )
        assert ok is True
        assert mgr.checkpoint_file.exists()
        assert mgr.status_file.exists()

        content = mgr.checkpoint_file.read_text(encoding="utf-8")
        assert "Solo Leveling" in content
        assert "179 capítulos" in content
        assert "Prueba de sincronización atómica" in content

        # Verificar que no quedaron archivos temporales residuales
        assert not (temp_work_dir / "CHECKPOINT_PROGRESO.tmp.md").exists()
        assert not (temp_work_dir / "status.tmp.json").exists()

    def test_update_checkpoint_markdown_structure_and_telemetry(self, temp_work_dir):
        """
        Verifica que el Markdown generado contenga:
        - Timestamp actual.
        - Progreso del catálogo (total series, completadas, pendientes).
        - Estadísticas de capítulos (descargados, PDFs compilados).
        - Telemetría de espacio en disco (libre en E:\\, usado).
        - Insignias de estado y tabla resumen.
        """
        mgr = CheckpointManager(root_dir=temp_work_dir)
        ok = mgr.update_checkpoint(
            current_title="Chainsaw Man",
            chapter_count=150,
            status_note="Sincronización completa",
            completed_series=["Solo Leveling", "Dandadan"],
            total_series_catalog=53,
            total_chapters_downloaded=350
        )
        assert ok is True

        md = mgr.checkpoint_file.read_text(encoding="utf-8")

        # 1. Timestamp
        assert "Fecha y Hora:" in md

        # 2. Series catalog progress
        assert "Catálogo Total de Series" in md
        assert "53" in md
        assert "Series Completadas" in md
        assert "2" in md
        assert "Series Pendientes" in md
        assert "51" in md

        # 3. Chapters statistics
        assert "Capítulos Descargados" in md
        assert "350" in md
        assert "Capítulos en PDF Compilados" in md

        # 4. Disk space telemetry
        assert "Espacio en Disco HDD E:\\:" in md
        assert "GB Libres" in md
        assert "Espacio Usado" in md

        # 5. Badges y tabla resumen
        assert "[![Pipeline Status]" in md
        assert "| Métrica | Valor | Estado / Detalle |" in md

        # 6. JSON de estado consistente
        status_data = json.loads(mgr.status_file.read_text(encoding="utf-8"))
        assert status_data["catalog"]["total_series"] == 53
        assert status_data["catalog"]["completed_series"] == 2
        assert status_data["catalog"]["pending_series"] == 51
        assert status_data["chapters"]["downloaded"] == 350

    def test_update_checkpoint_error_cleanup(self, temp_work_dir):
        """Verifica que ante un fallo de E/S los temporales se limpien y retorne False."""
        mgr = CheckpointManager(root_dir=temp_work_dir)

        # Provocar error simulando fallo en apertura o reemplazo
        with patch("builtins.open", side_effect=PermissionError("Simulated write lock")):
            ok = mgr.update_checkpoint(current_title="Failed Manga")
            assert ok is False
            assert not (temp_work_dir / "CHECKPOINT_PROGRESO.tmp.md").exists()


# ==============================================================================
# 4. Pruebas de Endurecimiento Challenger M3 (BBCode y Chapter Filenames)
# ==============================================================================

class TestChallengerHardeningRegression:
    def test_clean_synopsis_strips_bbcode_with_query_params_and_quotes(self):
        """Verifica que etiquetas BBCode complejas con ?, &, #, comillas sean eliminadas."""
        raw = (
            "[url=https://mangadex.org/title/123?page=1&ref=test]Enlace[/url] "
            "[color=#ff0000]Texto Rojo[/color] [font=\"Arial\"]Fuente[/font] "
            "Sinopsis [b]oficial[/b] limpia."
        )
        cleaned = HierarchicalOrganizer.clean_synopsis(raw)
        assert "[url=" not in cleaned
        assert "[/url]" not in cleaned
        assert "[color=" not in cleaned
        assert "[/color]" not in cleaned
        assert "[font=" not in cleaned
        assert "[/font]" not in cleaned
        assert "[b]" not in cleaned
        assert "[/b]" not in cleaned
        assert "Enlace" in cleaned
        assert "Texto Rojo" in cleaned
        assert "Sinopsis oficial limpia." in cleaned

    def test_format_chapter_filename_handles_inf_nan_gracefully(self):
        """Verifica que valores especiales como inf, -inf o nan no causen OverflowError ni crash."""
        assert HierarchicalOrganizer.format_chapter_filename("inf") == "Capitulo inf.pdf"
        assert HierarchicalOrganizer.format_chapter_filename("-inf") == "Capitulo -inf.pdf"
        assert HierarchicalOrganizer.format_chapter_filename("nan") == "Capitulo nan.pdf"
        assert HierarchicalOrganizer.format_chapter_filename(float("inf")) == "Capitulo inf.pdf"
        assert HierarchicalOrganizer.format_chapter_filename(float("-inf")) == "Capitulo -inf.pdf"
