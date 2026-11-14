"""
Standalone Empirical Verification & Stress Test Harness — Milestone 4 (Challenger 1).

Adversarial stress-testing suite for:
- src/acquisition/integrity_guard.py (IntegrityGuard)

Harness dimensions:
1. Truncated & corrupted PDF bytes:
   - Sliced PDFs at 10%, 25%, 50%, 75%, 90% byte length.
   - Corrupted xref tables, broken trailer offsets, missing %%EOF.
   - Catalog tree corruption and random noise payloads.
2. Multi-page PDFs stress (35-page documents):
   - Multi-page document where page 1 is valid but page 30 contains corrupted object/mediabox.
   - Corrupted image stream on page 30 in real compiled manga PDF.
   - Boundary tests for min_pages parameter.
3. Zero-byte and sub-10KB boundary sizes:
   - 0 bytes, 1 byte, 4 bytes, 5 bytes, 512 bytes, 10239 bytes.
   - Exact 10240 bytes threshold boundary (valid padded vs corrupt).
   - 10241 bytes boundary.
4. Non-PDF binary files & path edge cases:
   - Non-existent paths and directory paths.
   - Real JPEG, PNG, and plaintext files (> 10 KB) renamed to .pdf.
   - Crafted binary with valid %PDF- header but corrupt binary payload.
5. Password-protected / encrypted PDFs:
   - Real encrypted PDF generated with pypdf.PdfWriter.encrypt().
   - Idempotency rejection for encrypted files.
6. Disk margin evaluation & exact byte boundary:
   - Exactly 15.0 GB (15 * 1024**3 bytes) -> True.
   - Exactly 15.0 GB - 1 byte -> False.
   - Exactly 15.0 GB + 1 byte -> True.
   - 0 bytes, near-zero, large values, custom min_free_gb thresholds.
   - Keyword argument compatibility (drive vs drive_or_path).
7. Disk margin fallback robustness:
   - Phantom drive letters (Z:\\...), UNC network paths, empty strings.
   - Total OSError failure fallback to 999.0 GB.
8. Idempotent skip truth table:
   - Valid, truncated, corrupt, tiny, non-existent, encrypted, insufficient pages.
"""

import os
import shutil
import tempfile
from pathlib import Path
from typing import List
from unittest.mock import patch, MagicMock

import pytest
from PIL import Image
import pypdf

from src.acquisition.integrity_guard import IntegrityGuard
from src.acquisition.pdf_compiler import PDFCompiler


@pytest.fixture
def temp_harness_dir():
    """Isolated temporary directory for empirical tests."""
    temp_dir = tempfile.mkdtemp(prefix="empirical_m4_")
    yield Path(temp_dir)
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def valid_sample_pdf(temp_harness_dir):
    """Generates a verified valid multi-page PDF exceeding 10 KB."""
    images = []
    for i in range(3):
        img_p = temp_harness_dir / f"harness_page_{i}.jpg"
        img = Image.new("RGB", (600, 800), color=(50 * i, 120, 180))
        img.save(img_p, "JPEG", quality=90)
        images.append(img_p)

    out_pdf = temp_harness_dir / "valid_chapter_harness.pdf"
    success = PDFCompiler.compile_chapter(images, out_pdf)
    assert success is True
    # Ensure file exceeds 10 KB minimum threshold
    if out_pdf.stat().st_size < IntegrityGuard.MIN_PDF_BYTES:
        with open(out_pdf, "ab") as f:
            f.write(b"%\n" + b"X" * (IntegrityGuard.MIN_PDF_BYTES))
    return out_pdf


# ==============================================================================
# 1. Truncated & Corrupted PDF Bytes
# ==============================================================================

class TestEmpiricalPdfTruncationAndCorruption:
    """Empirical verification of truncated and corrupted byte streams."""

    @pytest.mark.parametrize("fraction", [0.10, 0.25, 0.50, 0.75, 0.90])
    def test_truncated_pdf_at_incremental_offsets(self, valid_sample_pdf, temp_harness_dir, fraction):
        """
        Takes a real valid PDF and truncates it at fractional lengths.
        Verifies that truncated files are rejected regardless of truncation point.
        """
        raw_bytes = valid_sample_pdf.read_bytes()
        cutoff = max(6, int(len(raw_bytes) * fraction))
        truncated_bytes = raw_bytes[:cutoff]

        trunc_file = temp_harness_dir / f"truncated_{int(fraction * 100)}.pdf"
        trunc_file.write_bytes(truncated_bytes)

        is_valid, reason = IntegrityGuard.verify_pdf(trunc_file)
        assert is_valid is False
        assert (
            "Tamaño insuficiente" in reason
            or "Corrupción estructural" in reason
            or "Cabecera binaria inválida" in reason
        )

    def test_corrupted_xref_table(self, valid_sample_pdf, temp_harness_dir):
        """
        Corrupts the xref table of a valid PDF > 10 KB.
        Verifies rejection due to unparseable object references.
        """
        raw = bytearray(valid_sample_pdf.read_bytes())
        xref_pos = raw.find(b"xref")
        if xref_pos != -1:
            # Overwrite xref keyword and following lines with garbage
            raw[xref_pos:xref_pos + 20] = b"xxxx_corrupt_xref___"
        else:
            # If cross-reference stream, corrupt startxref offset
            sx_pos = raw.find(b"startxref")
            assert sx_pos != -1
            raw[sx_pos:sx_pos + 25] = b"startxref\n999999999\n%%EOF"

        corrupt_pdf = temp_harness_dir / "corrupt_xref.pdf"
        corrupt_pdf.write_bytes(raw)

        is_valid, reason = IntegrityGuard.verify_pdf(corrupt_pdf)
        assert is_valid is False
        assert "Corrupción estructural" in reason

    def test_missing_eof_and_trailer(self, temp_harness_dir):
        """
        Removes the %%EOF marker and trailer from a valid PDF while keeping size > 10 KB.
        Verifies that missing file termination is caught.
        """
        images = []
        for i in range(5):
            img_p = temp_harness_dir / f"eof_page_{i}.jpg"
            img = Image.new("RGB", (600, 800), color=(i * 20, 50, 50))
            img.save(img_p, "JPEG")
            images.append(img_p)

        # Compile via Pillow to produce a standard non-linearized PDF
        out_pdf = temp_harness_dir / "sample_for_eof.pdf"
        PDFCompiler.compile_chapter(images, out_pdf, prefer_img2pdf=False)
        raw = out_pdf.read_bytes()
        assert len(raw) > IntegrityGuard.MIN_PDF_BYTES

        eof_pos = raw.rfind(b"%%EOF")
        assert eof_pos != -1
        # Truncate before %%EOF
        truncated = raw[:eof_pos - 50]
        assert len(truncated) > IntegrityGuard.MIN_PDF_BYTES

        missing_eof_pdf = temp_harness_dir / "missing_eof.pdf"
        missing_eof_pdf.write_bytes(truncated)

        is_valid, reason = IntegrityGuard.verify_pdf(missing_eof_pdf)
        assert is_valid is False
        assert "Corrupción estructural" in reason

    def test_valid_header_with_random_noise_payload(self, temp_harness_dir):
        """
        Crafts a file with valid '%PDF-1.7' header followed by 20 KB of binary noise.
        Verifies that passing header check does not bypass deep structural parsing.
        """
        noise_file = temp_harness_dir / "noise_payload.pdf"
        noise_payload = b"%PDF-1.7\n" + bytes([i % 256 for i in range(25000)])
        noise_file.write_bytes(noise_payload)

        is_valid, reason = IntegrityGuard.verify_pdf(noise_file)
        assert is_valid is False
        assert "Corrupción estructural" in reason


# ==============================================================================
# 2. Multi-Page Stress (35-Page Documents)
# ==============================================================================

class TestEmpiricalMultiPageStress:
    """Stress-tests multi-page PDF verification, specifically targeting page 30."""

    @pytest.fixture
    def real_35_page_pdf(self, temp_harness_dir):
        """Generates a real 35-page PDF compiled from 35 real JPEG images."""
        images = []
        for i in range(35):
            img_p = temp_harness_dir / f"page_{i:02d}.jpg"
            img = Image.new("RGB", (200, 300), color=((i * 7) % 256, (i * 13) % 256, (i * 19) % 256))
            img.save(img_p, "JPEG", quality=80)
            images.append(img_p)

        out_pdf = temp_harness_dir / "manga_35_pages.pdf"
        ok = PDFCompiler.compile_chapter(images, out_pdf)
        assert ok is True
        assert out_pdf.stat().st_size > IntegrityGuard.MIN_PDF_BYTES
        return out_pdf

    def test_multipage_35_pages_real_pdf_verifies_cleanly(self, real_35_page_pdf):
        """Verifies that an uncorrupted 35-page PDF passes with min_pages=35."""
        is_valid, reason = IntegrityGuard.verify_pdf(real_35_page_pdf, min_pages=35)
        assert is_valid is True
        assert "íntegro" in reason

    def test_multipage_35_pages_page_30_corrupted_object(self, real_35_page_pdf, temp_harness_dir):
        """
        Corrupts an object belonging to page 30 in the real 35-page PDF.
        Verifies that deep iteration across all pages surfaces the corruption.
        """
        raw = bytearray(real_35_page_pdf.read_bytes())
        # Find all 'endobj' positions
        endobj_offsets = []
        pos = 0
        while True:
            idx = raw.find(b"endobj", pos)
            if idx == -1:
                break
            endobj_offsets.append(idx)
            pos = idx + 6

        assert len(endobj_offsets) >= 30, "Document must contain at least 30 objects"
        # Corrupt object at index 29 (30th object)
        target_pos = max(0, endobj_offsets[29] - 25)
        raw[target_pos:target_pos + 25] = b"CORRUPT_OBJ_BYTES_XYZ!!"

        corrupt_pdf = temp_harness_dir / "corrupted_page_30.pdf"
        corrupt_pdf.write_bytes(raw)

        is_valid, reason = IntegrityGuard.verify_pdf(corrupt_pdf, min_pages=35)
        assert is_valid is False
        assert "Corrupción estructural" in reason

    def test_multipage_35_pages_page_30_malformed_mediabox(self, temp_harness_dir):
        """
        Constructs a 35-page PDF using pypdf where page 30 has a malformed MediaBox.
        Verifies that page.mediabox evaluation catches the corruption on page 30.
        """
        writer = pypdf.PdfWriter()
        for i in range(35):
            p = writer.add_blank_page(width=200, height=300)
            if i == 29:  # 30th page (0-indexed 29)
                p[pypdf.generic.NameObject("/MediaBox")] = pypdf.generic.NumberObject(99999)

        target_file = temp_harness_dir / "page_30_bad_mediabox.pdf"
        with open(target_file, "wb") as f:
            writer.write(f)

        # Pad to > 10 KB
        with open(target_file, "ab") as f:
            f.write(b"%\n" + b"X" * IntegrityGuard.MIN_PDF_BYTES)

        is_valid, reason = IntegrityGuard.verify_pdf(target_file, min_pages=35)
        assert is_valid is False
        assert "Corrupción estructural" in reason

    def test_multipage_min_pages_exact_boundaries(self, real_35_page_pdf):
        """
        Verifies exact boundary enforcement for min_pages:
        - min_pages=1: True
        - min_pages=35: True
        - min_pages=36: False ("Páginas insuficientes (35 < 36)")
        - min_pages=100: False ("Páginas insuficientes (35 < 100)")
        """
        valid_1, _ = IntegrityGuard.verify_pdf(real_35_page_pdf, min_pages=1)
        assert valid_1 is True

        valid_35, _ = IntegrityGuard.verify_pdf(real_35_page_pdf, min_pages=35)
        assert valid_35 is True

        valid_36, reason_36 = IntegrityGuard.verify_pdf(real_35_page_pdf, min_pages=36)
        assert valid_36 is False
        assert "Páginas insuficientes (35 < 36)" in reason_36

        valid_100, reason_100 = IntegrityGuard.verify_pdf(real_35_page_pdf, min_pages=100)
        assert valid_100 is False
        assert "Páginas insuficientes (35 < 100)" in reason_100


# ==============================================================================
# 3. Zero-Byte & Size Boundary Values (< 10 KB, = 10 KB, > 10 KB)
# ==============================================================================

class TestEmpiricalZeroByteAndSizeBoundaries:
    """Boundary testing around the 10 KB (10240 bytes) requirement."""

    def test_zero_byte_file(self, temp_harness_dir):
        """Verifies that an empty (0 byte) file is rejected."""
        empty_pdf = temp_harness_dir / "zero_bytes.pdf"
        empty_pdf.touch()
        assert empty_pdf.stat().st_size == 0

        is_valid, reason = IntegrityGuard.verify_pdf(empty_pdf)
        assert is_valid is False
        assert "Tamaño insuficiente (0 bytes < 10240 bytes)" in reason

    @pytest.mark.parametrize("size_bytes", [1, 4, 5, 512, 1024, 5000, 10239])
    def test_sub_10kb_boundary_sizes(self, temp_harness_dir, size_bytes):
        """
        Parameterizes files strictly under 10 KB (10240 bytes), including 10239 bytes.
        Verifies that size check rejects all of them immediately.
        """
        sub_file = temp_harness_dir / f"size_{size_bytes}.pdf"
        header = b"%PDF-" if size_bytes >= 5 else b"%PDF"[:size_bytes]
        payload = header + b"X" * max(0, size_bytes - len(header))
        sub_file.write_bytes(payload)

        assert sub_file.stat().st_size == size_bytes
        is_valid, reason = IntegrityGuard.verify_pdf(sub_file)
        assert is_valid is False
        assert f"Tamaño insuficiente ({size_bytes} bytes < 10240 bytes)" in reason

    def test_exact_10240_bytes_threshold_boundary_corrupt(self, temp_harness_dir):
        """
        File of exactly 10240 bytes (10 * 1024) with corrupted body.
        Verifies that size check passes (file_size >= 10240), but pypdf structural check rejects it.
        """
        exact_file = temp_harness_dir / "exact_10240_corrupt.pdf"
        payload = b"%PDF-1.4\n" + b"X" * (10240 - 9)
        exact_file.write_bytes(payload)
        assert exact_file.stat().st_size == 10240

        is_valid, reason = IntegrityGuard.verify_pdf(exact_file)
        assert is_valid is False
        assert "Tamaño insuficiente" not in reason
        assert "Corrupción estructural" in reason

    def test_exact_10240_bytes_threshold_boundary_valid(self, temp_harness_dir):
        """
        Valid PDF padded to exactly 10240 bytes.
        Verifies that exact boundary value passes all checks.
        """
        writer = pypdf.PdfWriter()
        writer.add_blank_page(width=100, height=100)
        base_file = temp_harness_dir / "base.pdf"
        with open(base_file, "wb") as f:
            writer.write(f)

        base_bytes = base_file.read_bytes()
        assert len(base_bytes) < 10240
        padding_needed = 10240 - len(base_bytes)
        padded_bytes = base_bytes + b"%\n" + b"P" * (padding_needed - 2)
        assert len(padded_bytes) == 10240

        exact_valid = temp_harness_dir / "exact_10240_valid.pdf"
        exact_valid.write_bytes(padded_bytes)
        assert exact_valid.stat().st_size == 10240

        is_valid, reason = IntegrityGuard.verify_pdf(exact_valid, min_pages=1)
        assert is_valid is True
        assert "íntegro" in reason


# ==============================================================================
# 4. Non-PDF Binary Files & Path Edge Cases
# ==============================================================================

class TestEmpiricalNonPdfAndPathEdgeCases:
    """Verification against non-PDF binary files, directories, and non-existent paths."""

    def test_nonexistent_file(self, temp_harness_dir):
        """Verifies clean rejection of non-existent file."""
        nonexistent = temp_harness_dir / "ghost_file.pdf"
        is_valid, reason = IntegrityGuard.verify_pdf(nonexistent)
        assert is_valid is False
        assert "El archivo no existe" in reason

    def test_directory_path_instead_of_file(self, temp_harness_dir):
        """Verifies safe rejection when a directory path is passed."""
        sub_dir = temp_harness_dir / "fake_pdf_folder.pdf"
        sub_dir.mkdir(parents=True, exist_ok=True)

        is_valid, reason = IntegrityGuard.verify_pdf(sub_dir)
        assert is_valid is False

    def test_large_jpeg_renamed_to_pdf(self, temp_harness_dir):
        """
        Real JPEG image (> 25 KB) saved with .pdf extension.
        Verifies that binary header check catches the JPEG magic bytes b'\xff\xd8\xff'.
        """
        jpeg_file = temp_harness_dir / "photo.pdf"
        img = Image.new("RGB", (1200, 1600), color=(100, 150, 200))
        img.save(jpeg_file, "JPEG", quality=95)
        assert jpeg_file.stat().st_size > IntegrityGuard.MIN_PDF_BYTES

        is_valid, reason = IntegrityGuard.verify_pdf(jpeg_file)
        assert is_valid is False
        assert "Cabecera binaria inválida" in reason
        assert "b'\\xff\\xd8\\xff" in reason

    def test_large_png_renamed_to_pdf(self, temp_harness_dir):
        """
        Real PNG image (> 25 KB) saved with .pdf extension.
        Verifies that binary header check catches the PNG magic bytes b'\\x89PNG'.
        """
        png_file = temp_harness_dir / "graphic.pdf"
        img = Image.frombytes("RGB", (200, 200), os.urandom(200 * 200 * 3))
        img.save(png_file, "PNG")
        assert png_file.stat().st_size > IntegrityGuard.MIN_PDF_BYTES

        is_valid, reason = IntegrityGuard.verify_pdf(png_file)
        assert is_valid is False
        assert "Cabecera binaria inválida" in reason
        assert "b'\\x89PNG" in reason

    def test_plaintext_renamed_to_pdf(self, temp_harness_dir):
        """
        Plain text file (> 15 KB) renamed to .pdf.
        Verifies that binary header check catches it.
        """
        txt_file = temp_harness_dir / "document.pdf"
        txt_file.write_text("Hello world! " * 2000, encoding="utf-8")
        assert txt_file.stat().st_size > IntegrityGuard.MIN_PDF_BYTES

        is_valid, reason = IntegrityGuard.verify_pdf(txt_file)
        assert is_valid is False
        assert "Cabecera binaria inválida" in reason

    def test_fake_header_prepended_to_jpeg(self, temp_harness_dir):
        """
        Prepend '%PDF-1.4\n' to a valid JPEG > 25 KB.
        Header check passes, but pypdf structural check must catch it.
        """
        raw_jpeg = temp_harness_dir / "temp.jpg"
        img = Image.new("RGB", (1000, 1000), color=(80, 80, 180))
        img.save(raw_jpeg, "JPEG", quality=95)
        jpeg_bytes = raw_jpeg.read_bytes()

        crafted_file = temp_harness_dir / "crafted_fake_pdf.pdf"
        crafted_file.write_bytes(b"%PDF-1.4\n" + jpeg_bytes)
        assert crafted_file.stat().st_size > IntegrityGuard.MIN_PDF_BYTES

        is_valid, reason = IntegrityGuard.verify_pdf(crafted_file)
        assert is_valid is False
        assert "Corrupción estructural" in reason


# ==============================================================================
# 5. Password-Protected / Encrypted PDFs
# ==============================================================================

class TestEmpiricalEncryptedPdf:
    """Empirical verification of password-protected and encrypted PDF handling."""

    def test_real_encrypted_pdf_is_rejected(self, temp_harness_dir):
        """
        Generates an authentic encrypted PDF using pypdf.PdfWriter.encrypt().
        Verifies that IntegrityGuard rejects encrypted files with the explicit reason.
        """
        writer = pypdf.PdfWriter()
        writer.add_blank_page(width=200, height=200)
        writer.encrypt("adversarial_password_42")

        enc_file = temp_harness_dir / "encrypted.pdf"
        with open(enc_file, "wb") as f:
            writer.write(f)

        # Pad to > 10 KB
        with open(enc_file, "ab") as f:
            f.write(b"%\n" + b"X" * IntegrityGuard.MIN_PDF_BYTES)

        is_valid, reason = IntegrityGuard.verify_pdf(enc_file)
        assert is_valid is False
        assert "PDF encriptado o protegido con contraseña" in reason

    def test_encrypted_pdf_rejected_by_is_idempotent_skip(self, temp_harness_dir):
        """Verifies that an encrypted PDF is NOT skipped by is_idempotent_skip."""
        writer = pypdf.PdfWriter()
        writer.add_blank_page(width=200, height=200)
        writer.encrypt("lock_key")

        enc_file = temp_harness_dir / "encrypted_skip.pdf"
        with open(enc_file, "wb") as f:
            writer.write(f)
        with open(enc_file, "ab") as f:
            f.write(b"%\n" + b"X" * IntegrityGuard.MIN_PDF_BYTES)

        assert IntegrityGuard.is_idempotent_skip(enc_file) is False


# ==============================================================================
# 6. Disk Margin Evaluation & Exact Boundary Values
# ==============================================================================

class TestEmpiricalDiskMarginEvaluation:
    """Stress-testing exact byte boundaries of the 15.0 GB threshold."""

    def test_disk_margin_exact_15gb_threshold(self):
        """
        Free space is exactly 15.0 GB (15.0 * 1024**3 bytes).
        Condition free_gb >= 15.0 must evaluate to True.
        """
        exact_bytes = int(15.0 * (1024 ** 3))
        with patch("shutil.disk_usage") as mock_usage:
            mock_usage.return_value = shutil._ntuple_diskusage(100 * 1024**3, 85 * 1024**3, exact_bytes)
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=15.0) is True

    def test_disk_margin_one_byte_below_15gb(self):
        """
        Free space is 15.0 GB - 1 byte.
        Condition free_gb >= 15.0 must evaluate to False.
        """
        below_bytes = int(15.0 * (1024 ** 3)) - 1
        with patch("shutil.disk_usage") as mock_usage:
            mock_usage.return_value = shutil._ntuple_diskusage(100 * 1024**3, 85 * 1024**3 + 1, below_bytes)
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=15.0) is False

    def test_disk_margin_one_byte_above_15gb(self):
        """
        Free space is 15.0 GB + 1 byte.
        Condition free_gb >= 15.0 must evaluate to True.
        """
        above_bytes = int(15.0 * (1024 ** 3)) + 1
        with patch("shutil.disk_usage") as mock_usage:
            mock_usage.return_value = shutil._ntuple_diskusage(100 * 1024**3, 85 * 1024**3 - 1, above_bytes)
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=15.0) is True

    def test_disk_margin_zero_and_near_zero(self):
        """Verifies that 0 bytes and tiny free space return False."""
        with patch("shutil.disk_usage") as mock_usage:
            mock_usage.return_value = shutil._ntuple_diskusage(100 * 1024**3, 100 * 1024**3, 0)
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=15.0) is False

            # 1 MB free space
            mock_usage.return_value = shutil._ntuple_diskusage(100 * 1024**3, 99 * 1024**3, 1024 * 1024)
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=15.0) is False

    def test_disk_margin_high_free_space(self):
        """Verifies that 500 GB free returns True."""
        with patch("shutil.disk_usage") as mock_usage:
            mock_usage.return_value = shutil._ntuple_diskusage(1000 * 1024**3, 500 * 1024**3, 500 * 1024**3)
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=15.0) is True

    @pytest.mark.parametrize("custom_min, simulated_free, expected", [
        (0.0, 0.001, True),
        (5.0, 4.999, False),
        (5.0, 5.001, True),
        (50.0, 45.0, False),
        (50.0, 55.0, True),
    ])
    def test_disk_margin_custom_thresholds(self, custom_min, simulated_free, expected):
        """Verifies variable min_free_gb threshold evaluation."""
        with patch("shutil.disk_usage") as mock_usage:
            free_b = int(simulated_free * (1024 ** 3))
            mock_usage.return_value = shutil._ntuple_diskusage(200 * 1024**3, 100 * 1024**3, free_b)
            assert IntegrityGuard.check_disk_margin("E:\\", min_free_gb=custom_min) is expected

    def test_disk_margin_drive_or_path_kwarg(self):
        """Verifies backward compatibility with drive_or_path keyword argument."""
        with patch("shutil.disk_usage") as mock_usage:
            mock_usage.return_value = shutil._ntuple_diskusage(100 * 1024**3, 50 * 1024**3, 50 * 1024**3)
            assert IntegrityGuard.check_disk_margin(drive_or_path="D:\\", min_free_gb=15.0) is True


# ==============================================================================
# 7. Disk Margin Fallback Robustness
# ==============================================================================

class TestEmpiricalDiskMarginFallbackRobustness:
    """Verifies safe fallback when querying non-existent, virtual, or failing paths."""

    def test_fallback_nonexistent_drive_letter(self):
        """
        Querying a non-existent drive letter (e.g. Z:\\) falls back to Path.cwd()
        without raising an unhandled exception.
        """
        free_gb = IntegrityGuard.get_free_space_gb("Z:\\phantom_nonexistent_drive\\sub\\folder")
        assert isinstance(free_gb, float)
        assert free_gb >= 0.0

    def test_fallback_unc_network_path(self):
        """
        Querying a non-existent UNC network share falls back gracefully.
        """
        free_gb = IntegrityGuard.get_free_space_gb(r"\\nonexistent_srv\share\volume")
        assert isinstance(free_gb, float)
        assert free_gb >= 0.0

    def test_fallback_empty_string_path(self):
        """
        Querying an empty string path falls back gracefully.
        """
        free_gb = IntegrityGuard.get_free_space_gb("")
        assert isinstance(free_gb, float)
        assert free_gb >= 0.0

    def test_fallback_when_shutil_raises_oserror_everywhere(self):
        """
        When shutil.disk_usage raises OSError on both target and cwd fallback,
        get_free_space_gb returns the safe default 999.0 without crashing.
        """
        with patch("shutil.disk_usage", side_effect=OSError("Drive hardware failure")):
            free_gb = IntegrityGuard.get_free_space_gb("X:\\bad_drive")
            assert free_gb == 999.0


# ==============================================================================
# 8. Idempotent Skip Truth Table
# ==============================================================================

class TestEmpiricalIdempotentSkipStress:
    """Stress-tests IntegrityGuard.is_idempotent_skip across all failure modes."""

    def test_idempotent_skip_on_valid_pdf(self, valid_sample_pdf):
        """Valid PDF returns True for idempotent skipping."""
        assert IntegrityGuard.is_idempotent_skip(valid_sample_pdf, min_pages=1) is True

    def test_idempotent_skip_on_corrupt_pdf(self, temp_harness_dir):
        """Corrupt PDF returns False (triggers re-download)."""
        bad_pdf = temp_harness_dir / "bad.pdf"
        bad_pdf.write_bytes(b"%PDF-1.4\n" + b"\x00\xff" * 6000)
        assert IntegrityGuard.is_idempotent_skip(bad_pdf) is False

    def test_idempotent_skip_on_tiny_pdf(self, temp_harness_dir):
        """Sub-10KB PDF returns False."""
        tiny_pdf = temp_harness_dir / "tiny.pdf"
        tiny_pdf.write_bytes(b"%PDF-1.4 tiny")
        assert IntegrityGuard.is_idempotent_skip(tiny_pdf) is False

    def test_idempotent_skip_on_nonexistent_pdf(self, temp_harness_dir):
        """Missing file returns False."""
        missing = temp_harness_dir / "absent.pdf"
        assert IntegrityGuard.is_idempotent_skip(missing) is False

    def test_idempotent_skip_on_insufficient_pages(self, valid_sample_pdf):
        """File with fewer than min_pages returns False."""
        assert IntegrityGuard.is_idempotent_skip(valid_sample_pdf, min_pages=100) is False
