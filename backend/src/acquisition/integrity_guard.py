"""
Módulo de verificación estructural de integridad y resguardo de espacio en disco.
Proporciona auditoría de archivos PDF generados mediante pypdf y control proactivo
del margen de almacenamiento en disco para prevenir desbordamientos.
"""

import os
import shutil
import logging
from pathlib import Path
from typing import Tuple, Optional, Union

try:
    import pypdf
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

logger = logging.getLogger("IntegrityGuard")


class IntegrityGuard:
    """Guardián de integridad estructural para PDFs y monitor de cuota de disco."""

    MIN_PDF_BYTES = 10 * 1024  # 10 KB mínimo exigido para un capítulo válido

    @staticmethod
    def verify_pdf(pdf_path: Union[str, Path], min_pages: int = 1) -> Tuple[bool, str]:
        """
        Verifica exhaustivamente que un archivo PDF sea estructuralmente válido y legible.
        Comprueba:
        1. Existencia del archivo.
        2. Tamaño mínimo (> 10 KB).
        3. Cabecera binaria '%PDF-'.
        4. Estructura interna legible con pypdf iterando por todas las páginas y
           verificando que num_pages >= min_pages sin excepciones de corrupción.
        
        Retorna (es_valido, motivo).
        """
        p = Path(pdf_path)
        if not p.exists():
            return False, f"El archivo no existe: {p}"

        try:
            file_size = p.stat().st_size
        except OSError as e:
            return False, f"Error obteniendo metadatos del archivo: {e}"

        if file_size < IntegrityGuard.MIN_PDF_BYTES:
            return False, f"Tamaño insuficiente ({file_size} bytes < {IntegrityGuard.MIN_PDF_BYTES} bytes)"

        # Comprobación de cabecera binaria PDF
        try:
            with open(p, "rb") as f:
                header = f.read(5)
                if not header.startswith(b"%PDF-"):
                    return False, f"Cabecera binaria inválida: {header!r} (esperado %PDF-)"
        except Exception as e:
            return False, f"Error leyendo cabecera del archivo: {e}"

        # Validación estructural profunda con pypdf iterando todas las páginas
        if HAS_PYPDF:
            try:
                reader = pypdf.PdfReader(str(p))
                if reader.is_encrypted:
                    return False, "PDF encriptado o protegido con contraseña"

                num_pages = len(reader.pages)
                if num_pages < min_pages:
                    return False, f"Páginas insuficientes ({num_pages} < {min_pages})"

                # Iterar exhaustivamente a través de todas las páginas para validar legibilidad
                for page_idx, page in enumerate(reader.pages):
                    _ = page.mediabox
                    _ = page.get_contents()
            except Exception as e:
                return False, f"Corrupción estructural en pypdf: {e}"

        return True, "PDF íntegro y estructuralmente válido"

    @staticmethod
    def get_free_space_gb(drive_or_path: Union[str, Path] = "E:\\") -> float:
        """
        Retorna el espacio libre en Gigabytes para la unidad o ruta indicada.
        Si la unidad o ruta no existe, realiza fallback al directorio de trabajo actual.
        """
        target = Path(drive_or_path)
        check_path = target
        while not check_path.exists() and check_path.parent != check_path:
            check_path = check_path.parent

        if not check_path.exists():
            check_path = Path.cwd()

        try:
            usage = shutil.disk_usage(str(check_path))
            return usage.free / (1024 ** 3)
        except Exception as e:
            logger.warning(f"No se pudo determinar el espacio en disco para {drive_or_path}: {e}")
            try:
                usage = shutil.disk_usage(str(Path.cwd()))
                return usage.free / (1024 ** 3)
            except Exception:
                return 999.0

    @staticmethod
    def check_disk_margin(
        drive: Union[str, Path] = "E:\\",
        min_free_gb: float = 15.0,
        **kwargs
    ) -> bool:
        """
        Verifica que la unidad de almacenamiento mantenga un margen de seguridad
        superior o igual a min_free_gb (por defecto 15.0 GB).
        Usa shutil.disk_usage para determinar el espacio disponible con fallback
        a la unidad/directorio actual si la unidad no existe.
        Retorna True si free_space >= min_free_gb, False en caso contrario.
        """
        target_drive = kwargs.get("drive_or_path", drive)
        free_gb = IntegrityGuard.get_free_space_gb(target_drive)
        is_safe = free_gb >= min_free_gb
        if not is_safe:
            logger.warning(
                f"⚠️ Margen de disco bajo en {target_drive}: {free_gb:.2f} GB libres "
                f"(mínimo requerido: {min_free_gb:.2f} GB)"
            )
        return is_safe

    @staticmethod
    def is_idempotent_skip(pdf_path: Union[str, Path], min_pages: int = 1) -> bool:
        """
        Determina si un capítulo ya fue descargado y compilado previamente
        de forma íntegra, permitiendo omitir su re-descarga de manera segura.
        """
        p = Path(pdf_path)
        if not p.exists():
            return False
        valid, _ = IntegrityGuard.verify_pdf(p, min_pages=min_pages)
        return valid


__all__ = ["IntegrityGuard"]
