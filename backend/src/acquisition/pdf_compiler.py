"""
Módulo de compilación nativa a PDF y estructuración jerárquica para Manga & Manhwa.
Implementa PDFCompiler (img2pdf lossless con fallback defensivo Pillow) y HierarchicalOrganizer.
Cumple con las especificaciones de ORIGINAL_REQUEST.md y PROJECT.md § Milestone 3.
"""

import os
import re
import sys
import json
import shutil
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple, Any, Union

from PIL import Image

try:
    import img2pdf
    HAS_IMG2PDF = True
except ImportError:
    HAS_IMG2PDF = False

logger = logging.getLogger("PDFCompiler")


class PDFCompiler:
    """
    Compilador de capítulos de manga y manhwa a formato PDF nativo de alta fidelidad.
    Prioriza img2pdf para compilación sin pérdida y sin descompresión de píxeles en memoria RAM,
    con fallback defensivo a Pillow para canales alfa (RGBA), paletas con transparencia y modos no estándar.
    """

    @staticmethod
    def compile_chapter(
        image_paths: List[Path],
        output_pdf_path: Path,
        prefer_img2pdf: bool = True
    ) -> bool:
        """
        Compila una lista secuencial de imágenes en un documento PDF atómico y validado.

        Parámetros:
            image_paths: Lista ordenada de rutas a las imágenes de las páginas.
            output_pdf_path: Ruta destino del archivo PDF resultante.
            prefer_img2pdf: Si es True, intenta img2pdf antes de recurrir a Pillow.

        Retorna:
            True si el PDF se compiló exitosamente y supera 1024 bytes; False en caso contrario.
        """
        if not image_paths:
            logger.warning("Lista de imágenes vacía. No se puede compilar PDF.")
            return False

        # Validar existencia e integridad física mínima de cada imagen
        normalized_paths: List[Path] = []
        for p in image_paths:
            p_obj = Path(p) if not isinstance(p, Path) else p
            if not p_obj.exists() or p_obj.stat().st_size == 0:
                logger.error(f"Imagen inválida o inexistente: {p_obj}")
                return False
            normalized_paths.append(p_obj)

        output_pdf_path = Path(output_pdf_path)
        output_pdf_path.parent.mkdir(parents=True, exist_ok=True)

        # Archivo temporal atómico: {output_pdf_path}.tmp
        temp_pdf = Path(str(output_pdf_path) + ".tmp")
        if temp_pdf.exists():
            try:
                temp_pdf.unlink()
            except Exception:
                pass

        success = False

        # 1. Intento primario: img2pdf (sin descompresión de mapa de bits en RAM)
        if prefer_img2pdf and HAS_IMG2PDF:
            try:
                with open(temp_pdf, "wb") as f_out:
                    img2pdf.convert([str(p) for p in normalized_paths], outputstream=f_out)
                if temp_pdf.exists() and temp_pdf.stat().st_size > 1024:
                    success = True
            except Exception as e:
                logger.debug(f"img2pdf falló o encontró modo no soportado ({e}). Conmutando a Pillow fallback...")
                success = False
                if temp_pdf.exists():
                    try:
                        temp_pdf.unlink()
                    except Exception:
                        pass

        # 2. Fallback defensivo: Pillow (manejo de RGBA, paletas, colores incompatibles)
        if not success:
            pil_images: List[Image.Image] = []
            try:
                for img_p in normalized_paths:
                    img = Image.open(img_p)
                    # Manejo de canales alfa (RGBA, LA) o paletizado (P con transparencia)
                    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                        # Fondo blanco limpio sin artefactos
                        rgb_bg = Image.new("RGB", img.size, (255, 255, 255))
                        if img.mode != "RGBA":
                            img_rgba = img.convert("RGBA")
                        else:
                            img_rgba = img
                        rgb_bg.paste(img_rgba, mask=img_rgba.split()[3])
                        pil_images.append(rgb_bg)
                        img.close()
                    elif img.mode != "RGB":
                        rgb_converted = img.convert("RGB")
                        pil_images.append(rgb_converted)
                        img.close()
                    else:
                        pil_images.append(img)

                if pil_images:
                    pil_images[0].save(
                        temp_pdf,
                        "PDF",
                        resolution=100.0,
                        save_all=True,
                        append_images=pil_images[1:]
                    )
                    if temp_pdf.exists() and temp_pdf.stat().st_size > 1024:
                        success = True
            except Exception as err:
                logger.error(f"Error en Pillow fallback para {output_pdf_path.name}: {err}")
                success = False
                if temp_pdf.exists():
                    try:
                        temp_pdf.unlink()
                    except Exception:
                        pass
            finally:
                for im in pil_images:
                    try:
                        im.close()
                    except Exception:
                        pass

        # 3. Validación y renombrado atómico
        if success and temp_pdf.exists() and temp_pdf.stat().st_size > 1024:
            try:
                if output_pdf_path.exists():
                    try:
                        output_pdf_path.unlink()
                    except Exception:
                        pass
                temp_pdf.replace(output_pdf_path)
                return output_pdf_path.exists() and output_pdf_path.stat().st_size > 1024
            except Exception as rename_err:
                logger.error(f"Error en renombramiento atómico a {output_pdf_path}: {rename_err}")
                if temp_pdf.exists():
                    try:
                        temp_pdf.unlink()
                    except Exception:
                        pass
                return False

        if temp_pdf.exists():
            try:
                temp_pdf.unlink()
            except Exception:
                pass
        return False


class HierarchicalOrganizer:
    """
    Gestor de estructuración jerárquica de carpetas, nombrado estándar de capítulos,
    limpieza de sinopsis y persistencia de carátulas (poster.jpg) y metadatos (manga_info.json).
    """

    @staticmethod
    def clean_title(title: str) -> str:
        """Sanitiza el título de la obra eliminando caracteres no válidos para el sistema de archivos."""
        sanitized = "".join(c for c in str(title) if c not in '<>:"/\\|?*').strip()
        return sanitized or "Manga"

    @staticmethod
    def clean_synopsis(synopsis_raw: Union[str, Dict[str, str], None]) -> str:
        """
        Limpia la sinopsis eliminando códigos BBCode ([b], [url], etc.), etiquetas HTML (<br>, <p>)
        y enlaces Markdown, preservando texto legible en UTF-8.
        """
        if not synopsis_raw:
            return ""

        if isinstance(synopsis_raw, dict):
            # Priorizar español (es, es-la), luego inglés (en)
            synopsis = (
                synopsis_raw.get("es")
                or synopsis_raw.get("es-la")
                or synopsis_raw.get("en")
                or ""
            )
            if not synopsis and synopsis_raw:
                synopsis = next(iter(synopsis_raw.values()), "")
        else:
            synopsis = str(synopsis_raw)

        # Normalizar enlaces markdown [texto](url) -> texto
        synopsis = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", synopsis)
        # Eliminar etiquetas BBCode: [b], [/b], [url=...], [/url], [spoiler], etc.
        synopsis = re.sub(r"\[/?[^\]]+\]", "", synopsis)
        # Eliminar etiquetas HTML: <br>, </p>, <i>, etc.
        synopsis = re.sub(r"<[^>]+>", "", synopsis)
        # Normalizar espacios y saltos de línea repetidos
        synopsis = re.sub(r"\r\n|\r", "\n", synopsis)
        synopsis = re.sub(r"\n{3,}", "\n\n", synopsis).strip()
        return synopsis

    @classmethod
    def format_chapter_filename(
        cls,
        chapter: Union[str, float, int],
        pad_digits: int = 3
    ) -> str:
        """
        Formatea el nombre del archivo de capítulo (ej. 'Capitulo 001.pdf', 'Capitulo 014.5.pdf').
        Soporta enteros, floats y capítulos fraccionarios con decimales.
        """
        ch_str = str(chapter).strip()
        try:
            c_float = float(ch_str)
            if c_float.is_integer():
                c_int = int(c_float)
                return f"Capitulo {c_int:0{pad_digits}d}.pdf"
            else:
                # Fraccionario: formatear parte entera padded y parte decimal
                int_part = int(c_float)
                if "." in ch_str:
                    decimal_part = ch_str.split(".", 1)[1]
                else:
                    decimal_part = str(c_float).split(".", 1)[1]
                return f"Capitulo {int_part:0{pad_digits}d}.{decimal_part}.pdf"
        except (ValueError, OverflowError):
            return f"Capitulo {ch_str}.pdf"

    @classmethod
    def format_volume_folder(
        cls,
        volume: Optional[Union[str, float, int]],
        volume_grouping: bool = True,
        pattern: str = "Tomo {volume:02d}",
        fallback_folder: Optional[str] = None
    ) -> Optional[str]:
        """
        Formatea la carpeta del tomo/volumen.
        Si volume_grouping es False o el volumen es nulo/vacío, retorna None (o fallback_folder).
        NUNCA retorna 'Tomo None'.
        """
        if not volume_grouping:
            return None

        if volume is None or str(volume).strip().lower() in ["none", "null", ""]:
            return fallback_folder

        vol_str = str(volume).strip()
        try:
            v_float = float(vol_str)
            if v_float.is_integer():
                v_num = int(v_float)
                if "{volume" in pattern:
                    return pattern.format(volume=v_num)
                return f"Tomo {v_num:02d}"
            else:
                return f"Tomo {v_float}"
        except ValueError:
            return f"Tomo {vol_str}"

    @classmethod
    def format_chapter_path(
        cls,
        download_root: Union[Path, str],
        title_display: str,
        chapter: Union[str, float, int],
        volume: Optional[Union[str, float, int]] = None,
        expected_hierarchy: Optional[Dict[str, Any]] = None,
        is_webtoon: bool = False,
        pad_digits: Optional[int] = None,
        allow_tomo_especial: bool = False
    ) -> Path:
        """
        Genera la ruta jerárquica limpia para un capítulo en disco:
        - Tankobon / Mangas con tomos: `{download_root}/{title_display}/Tomo {volume:02d}/Capitulo {chapter:03d}.pdf`
        - Webtoons continuos / Manhwas: `{download_root}/{title_display}/Capitulo {chapter:03d}.pdf` (padded a 3 dígitos)
        - Cuando volume es None/vacío en webtoons: NUNCA crea 'Tomo None'.
        - Capítulos fraccionarios: 'Capitulo 014.5.pdf'.
        """
        root = Path(download_root)
        clean_name = cls.clean_title(title_display)
        manga_dir = root / clean_name

        vol_empty = volume is None or str(volume).strip().lower() in ["none", "null", ""]

        if expected_hierarchy is not None:
            vol_grouping = expected_hierarchy.get("volume_grouping", True)
            folder_pattern = expected_hierarchy.get("folder_volume_pattern", "Tomo {volume:02d}")
            file_pattern = expected_hierarchy.get("file_chapter_pattern", "Capitulo {chapter:03d}.pdf")

            digits = pad_digits
            if digits is None:
                if "{chapter:02d}" in file_pattern:
                    digits = 2
                elif "{chapter:03d}" in file_pattern:
                    digits = 3
                else:
                    digits = 3

            fallback = "Tomo Especial" if allow_tomo_especial else None
            vol_folder = cls.format_volume_folder(
                volume=volume,
                volume_grouping=vol_grouping,
                pattern=folder_pattern or "Tomo {volume:02d}",
                fallback_folder=fallback
            )
            ch_filename = cls.format_chapter_filename(chapter, pad_digits=digits)
        else:
            digits = pad_digits if pad_digits is not None else 3
            ch_filename = cls.format_chapter_filename(chapter, pad_digits=digits)

            if is_webtoon or vol_empty:
                if allow_tomo_especial and vol_empty:
                    vol_folder = "Tomo Especial"
                else:
                    vol_folder = None
            else:
                vol_folder = cls.format_volume_folder(
                    volume=volume,
                    volume_grouping=True,
                    pattern="Tomo {volume:02d}"
                )

        if vol_folder:
            return manga_dir / vol_folder / ch_filename
        return manga_dir / ch_filename

    @classmethod
    def save_metadata(cls, metadata: Dict[str, Any], manga_dir: Path) -> Path:
        """
        Guarda `manga_info.json` en manga_dir con UTF-8 limpio, sinopsis despojada de bbcode/html,
        autor, artista, géneros, clasificación de contenido y timestamp UTC.
        """
        manga_dir = Path(manga_dir)
        manga_dir.mkdir(parents=True, exist_ok=True)
        info_file = manga_dir / "manga_info.json"

        # Extraer y limpiar sinopsis
        raw_desc = metadata.get("description") or metadata.get("synopsis") or ""
        clean_desc = cls.clean_synopsis(raw_desc)

        # Extraer géneros
        genres = metadata.get("genres") or metadata.get("tags") or []
        genres_clean = []
        if isinstance(genres, list):
            for g in genres:
                if isinstance(g, dict):
                    name = g.get("attributes", {}).get("name", {}).get("en") or g.get("name")
                    if name:
                        genres_clean.append(name)
                elif isinstance(g, str):
                    genres_clean.append(g)
        elif isinstance(genres, str):
            genres_clean.append(genres)

        timestamp = datetime.now(timezone.utc).isoformat()

        structured: Dict[str, Any] = {
            "id": metadata.get("id"),
            "title": metadata.get("title") or manga_dir.name,
            "original_title": metadata.get("original_title", {}),
            "altTitles": metadata.get("altTitles", []),
            "author": metadata.get("author"),
            "artist": metadata.get("artist"),
            "synopsis": clean_desc,
            "genres": genres_clean,
            "tags": genres_clean,
            "status": metadata.get("status"),
            "year": metadata.get("year"),
            "content_rating": metadata.get("content_rating") or metadata.get("contentRating"),
            "contentRating": metadata.get("contentRating") or metadata.get("content_rating"),
            "timestamp": timestamp
        }

        # Conservar claves adicionales que no estén en el esquema base
        for k, v in metadata.items():
            if k not in structured:
                structured[k] = v

        with open(info_file, "w", encoding="utf-8") as f:
            json.dump(structured, f, indent=2, ensure_ascii=False)

        return info_file

    @classmethod
    def save_poster(cls, poster_data: Union[bytes, Path, str, Image.Image], dest: Path) -> Path:
        """
        Guarda la portada oficial 'poster.jpg' en dest (si es directorio, en dest / 'poster.jpg').
        Valida que el archivo exista y no esté vacío.
        """
        dest_path = Path(dest)
        if dest_path.is_dir() or (not dest_path.suffix and not dest_path.exists()):
            poster_file = dest_path / "poster.jpg"
        else:
            poster_file = dest_path

        poster_file.parent.mkdir(parents=True, exist_ok=True)

        if isinstance(poster_data, bytes):
            with open(poster_file, "wb") as f:
                f.write(poster_data)
        elif isinstance(poster_data, (Path, str)):
            src_path = Path(poster_data)
            if src_path.resolve() != poster_file.resolve():
                shutil.copyfile(src_path, poster_file)
        elif isinstance(poster_data, Image.Image):
            rgb_img = poster_data.convert("RGB") if poster_data.mode != "RGB" else poster_data
            rgb_img.save(poster_file, "JPEG", quality=95)
        else:
            raise ValueError(f"Formato de poster_data no soportado: {type(poster_data)}")

        if not poster_file.exists() or poster_file.stat().st_size == 0:
            raise IOError(f"No se pudo guardar el archivo de portada en {poster_file}")

        return poster_file


__all__ = ["PDFCompiler", "HierarchicalOrganizer", "HAS_IMG2PDF"]
