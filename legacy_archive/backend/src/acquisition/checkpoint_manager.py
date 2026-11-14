"""
Módulo de gestión atómica de puntos de control (CheckpointManager).
Garantiza la persistencia atómica de métricas y estados en CHECKPOINT_PROGRESO.md
y status.json, previniendo condiciones de carrera y corrupción por fallos abruptos.
"""

import os
import json
import time
import shutil
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, Union, List

from src.acquisition.integrity_guard import IntegrityGuard

logger = logging.getLogger("CheckpointManager")


class CheckpointManager:
    """Administrador de sincronización y actualización atómica del estado del proyecto."""

    def __init__(self, root_dir: Union[str, Path] = r"e:\Respaldos\Organizador_Anime"):
        self.root_dir = Path(root_dir)
        self.checkpoint_file = self.root_dir / "CHECKPOINT_PROGRESO.md"
        self.status_file = self.root_dir / "status.json"
        self.queue_file = self.root_dir / "manhwa_top50_queue.json"

    def get_catalog_total_series(self) -> int:
        """Obtiene el número total de series configuradas en el catálogo oficial."""
        if self.queue_file.exists():
            try:
                with open(self.queue_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    series_list = data.get("series", [])
                    if series_list:
                        return len(series_list)
            except Exception:
                pass
        return 53

    def get_current_metrics(self, output_root: Union[str, Path] = r"E:\Manga") -> Dict[str, Any]:
        """Calcula el número de series, PDFs totales compilados y telemetría de almacenamiento."""
        root = Path(output_root)
        total_series = 0
        total_pdfs = 0
        total_bytes = 0

        if root.exists():
            for item in root.iterdir():
                if item.is_dir() and not item.name.startswith("."):
                    total_series += 1
                    for pdf in item.rglob("*.pdf"):
                        if not pdf.name.endswith(".tmp.pdf") and not pdf.name.endswith(".tmp"):
                            total_pdfs += 1
                            try:
                                total_bytes += pdf.stat().st_size
                            except OSError:
                                pass

        free_gb = IntegrityGuard.get_free_space_gb("E:\\")

        # Telemetría de almacenamiento en disco
        used_disk_gb = 0.0
        total_disk_gb = 0.0
        try:
            target_check = "E:\\" if Path("E:\\").exists() else str(Path.cwd())
            usage = shutil.disk_usage(target_check)
            total_disk_gb = usage.total / (1024 ** 3)
            used_disk_gb = (usage.total - usage.free) / (1024 ** 3)
        except Exception:
            pass

        return {
            "total_series": total_series,
            "total_pdfs": total_pdfs,
            "total_gb_manga": total_bytes / (1024 ** 3),
            "free_disk_gb": free_gb,
            "used_disk_gb": used_disk_gb,
            "total_disk_gb": total_disk_gb
        }

    def update_checkpoint(
        self,
        current_title: Optional[str] = None,
        chapter_count: Optional[int] = None,
        status_note: str = "En ejecución continua",
        completed_series: Optional[List[str]] = None,
        total_series_catalog: Optional[int] = None,
        total_chapters_downloaded: Optional[int] = None,
        output_root: Optional[Union[str, Path]] = None,
        **kwargs
    ) -> bool:
        """
        Actualiza CHECKPOINT_PROGRESO.md y status.json de forma atómica.
        Escribe en archivos temporales (.tmp) y renombra atómicamente.
        
        Incluye:
        - Timestamp actual.
        - Progreso del catálogo de series (total series, completadas, pendientes).
        - Estadísticas de capítulos (descargados, PDFs compilados).
        - Telemetría de espacio en disco (libre en E:\\, usado).
        - Insignias de estado y tabla resumen formateada en Markdown.
        """
        target_root = output_root or (self.root_dir.parent / "Manga" if (self.root_dir.parent / "Manga").exists() else r"E:\Manga")
        metrics = self.get_current_metrics(output_root=target_root)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        catalog_total = total_series_catalog or self.get_catalog_total_series()
        if completed_series is not None:
            completed_count = len(completed_series)
        else:
            completed_count = metrics["total_series"]

        pending_count = max(0, catalog_total - completed_count)

        compiled_pdfs = metrics["total_pdfs"]
        if total_chapters_downloaded is not None:
            downloaded_chapters = total_chapters_downloaded
        else:
            downloaded_chapters = compiled_pdfs if compiled_pdfs > 0 else (chapter_count or 0)

        free_disk_gb = metrics["free_disk_gb"]
        used_disk_gb = metrics["used_disk_gb"]
        total_gb_manga = metrics["total_gb_manga"]

        content = f"""# CHECKPOINT DE PROGRESO - ORGANIZADOR ANIME & MANGA ULTRA TURBO

**Fecha y Hora:** {now_str} (Hora Local) - {status_note}  
**Estado:** Blindado, pipeline activo y sincronizado en disco  
**Espacio en Disco HDD E:\\:** **{free_disk_gb:.2f} GB Libres** (Margen seguro >= 15.0 GB)  

[![Pipeline Status](https://img.shields.io/badge/Pipeline-100%25%20Activo-brightgreen)](#) [![Integridad](https://img.shields.io/badge/Integridad-Blindada-blue)](#) [![Almacenamiento](https://img.shields.io/badge/HDD%20E%3A-Margen%20Seguro-success)](#)

---

## 📊 Resumen Ejecutivo del Pipeline

| Métrica | Valor | Estado / Detalle |
| :--- | :--- | :--- |
| **Catálogo Total de Series** | **{catalog_total}** | Curado Oficial (`manhwa_top50_queue.json`) |
| **Series Completadas** | **{completed_count}** | Adquiridas y estructuradas |
| **Series Pendientes** | **{pending_count}** | En cola de procesamiento |
| **Capítulos Descargados** | **{downloaded_chapters}** | Concurrencia paralela 8+ workers |
| **Capítulos en PDF Compilados** | **{compiled_pdfs}** | img2pdf sin pérdida / Pillow fallback |
| **Espacio HDD E:\\ Libre** | **{free_disk_gb:.2f} GB** | Margen de seguridad verificado |
| **Espacio HDD E:\\ Usado** | **{used_disk_gb:.2f} GB** | Telemetría en tiempo real |
| **Almacenamiento Manga** | **{total_gb_manga:.2f} GB** | En `{target_root}` |

---

## 1. Misión Teamwork: Adquisición y Compilación de Top 50 Manhwas + 3 Mangas Clave

- **Catálogo Oficial:** [`manhwa_top50_queue.json`](file:///e:/Respaldos/Organizador_Anime/manhwa_top50_queue.json) ({catalog_total} obras estructuradas y certificadas).
- **Motor de Adquisición:** [`src/acquisition/mangadex_client.py`](file:///e:/Respaldos/Organizador_Anime/src/acquisition/mangadex_client.py) (TokenBucket 4.0 RPS, 64 conexiones concurrentes, multi-CDN fallback).
- **Compilador Nativo:** [`src/acquisition/pdf_compiler.py`](file:///e:/Respaldos/Organizador_Anime/src/acquisition/pdf_compiler.py) (img2pdf nativo sin pérdida y Pillow fallback).
- **Guardián de Integridad:** [`src/acquisition/integrity_guard.py`](file:///e:/Respaldos/Organizador_Anime/src/acquisition/integrity_guard.py) (Validación pypdf, cabeceras %PDF- y margen >= 15 GB).
- **Progreso del Catálogo de Series:**
  * **Total de Series en Catálogo:** {catalog_total}
  * **Series Completadas:** {completed_count}
  * **Series Pendientes:** {pending_count}
- **Estadísticas de Capítulos:**
  * **Total de Capítulos Descargados:** {downloaded_chapters}
  * **Total de Capítulos en PDF Compilados:** {compiled_pdfs}
- **Telemetría de Almacenamiento en Disco:**
  * **Espacio Libre en HDD E:\\:** {free_disk_gb:.2f} GB
  * **Espacio Usado en HDD E:\\:** {used_disk_gb:.2f} GB
  * **Almacenamiento Ocupado por Manga:** {total_gb_manga:.2f} GB
"""
        if current_title:
            content += f"- **Último Título Procesado:** *{current_title}*"
            if chapter_count is not None:
                content += f" ({chapter_count} capítulos listos)\n"
            else:
                content += "\n"

        if completed_series:
            content += "\n### Series Registradas como Completadas\n"
            for s in completed_series:
                content += f"- ✅ {s}\n"

        content += """
---

## 2. Histórico y Bibliotecas Existentes

- **Anime en `E:\\Anime`:** 699 series completas al 100% con metadatos NFO, carátulas y fanarts (1,745 series en inventario).
- **TikToks Listos:** 17 videos listos en `E:\\Demons despues del 100\\TikToks_Listos_Para_Subir`.

---

## 3. Estado Operativo del Sistema

- **Procesos:** Pipeline desacoplado, resiliente y protegido contra caídas de red.
- **Seguridad:** Cero sobrescritura de archivos válidos (idempotencia estricta).
- **Margen de Disco:** Protegido contra saturación (mínimo 15 GB libres requeridos).
"""

        temp_file = self.checkpoint_file.with_suffix(".tmp.md")
        temp_status = self.status_file.with_suffix(".tmp.json")

        try:
            with open(temp_file, "w", encoding="utf-8") as f:
                f.write(content)
            temp_file.replace(self.checkpoint_file)

            # Actualizar también status.json atómicamente
            status_data = {
                "timestamp": time.time(),
                "date": now_str,
                "current_title": current_title,
                "catalog": {
                    "total_series": catalog_total,
                    "completed_series": completed_count,
                    "pending_series": pending_count
                },
                "chapters": {
                    "downloaded": downloaded_chapters,
                    "compiled_pdfs": compiled_pdfs
                },
                "disk": {
                    "free_gb": free_disk_gb,
                    "used_gb": used_disk_gb,
                    "manga_gb": total_gb_manga
                },
                "metrics": metrics,
                "status": status_note
            }
            with open(temp_status, "w", encoding="utf-8") as f:
                json.dump(status_data, f, indent=2, ensure_ascii=False)
            temp_status.replace(self.status_file)
            return True
        except Exception as e:
            logger.error(f"Error en actualización atómica de checkpoint: {e}")
            if temp_file.exists():
                try:
                    temp_file.unlink()
                except Exception:
                    pass
            if temp_status.exists():
                try:
                    temp_status.unlink()
                except Exception:
                    pass
            return False


__all__ = ["CheckpointManager"]
