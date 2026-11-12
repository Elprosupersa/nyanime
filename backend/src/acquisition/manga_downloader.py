"""
Módulo de adquisición y descarga automatizada de Manga en modo Ultra Turbo.
Soporta búsqueda, mapeo de tomos/capítulos en español (es, es-la),
descarga paralela de páginas a máxima velocidad con fallback a CDN oficial de MangaDex,
compilación directa a PDF nativo sin pérdidas y control estructural de integridad.
"""

import os
import sys
from pathlib import Path

# Asegurar que la raíz del proyecto esté en sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import time
import json
import logging
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional, Tuple, Any, Union

import requests
from requests.adapters import HTTPAdapter
from PIL import Image

# Importar MangaDexClient y contratos desde el módulo dedicado mangadex_client
from src.acquisition.mangadex_client import (
    MangaDexClient,
    SecondaryProvider,
    TokenBucketRateLimiter,
    MANGADEX_API,
    MANGADEX_UPLOADS,
    DEFAULT_USER_AGENT
)

# Importar compilador nativo y organizador jerárquico de Milestone 3
from src.acquisition.pdf_compiler import (
    PDFCompiler,
    HierarchicalOrganizer,
    HAS_IMG2PDF
)

# Importar guardián de integridad y gestor de checkpoint de Milestone 4
from src.acquisition.integrity_guard import IntegrityGuard
from src.acquisition.checkpoint_manager import CheckpointManager

# Configuración de Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("MangaDownloader")


class MangaPipeline:
    def __init__(
        self,
        output_root: str = r"E:\Manga",
        max_workers: int = 16,
        client: Optional[MangaDexClient] = None,
        chapter_workers: int = 4
    ):
        self.output_root = Path(output_root)
        self.max_workers = max_workers if max_workers is not None else 16
        self.chapter_workers = chapter_workers if chapter_workers is not None else 4
        self.client = client or MangaDexClient()
        self.checkpoint_manager = CheckpointManager(root_dir=Path(r"e:\Respaldos\Organizador_Anime"))

        # Sesión dedicada desacoplada para la descarga masiva paralela de imágenes (128 conexiones para saturar ancho de banda)
        self.dl_session = requests.Session()
        adapter = HTTPAdapter(pool_connections=128, pool_maxsize=128, max_retries=3)
        self.dl_session.mount("https://", adapter)
        self.dl_session.mount("http://", adapter)
        self.dl_session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })

    def _download_single_page(
        self,
        base_url: str,
        ch_hash: str,
        page_name: str,
        saver_name: Optional[str],
        dest_path: Path
    ) -> bool:
        """
        Descarga una página individual de imagen utilizando la arquitectura multi-fallback
        del cliente MangaDex pero operando sobre la sesión desacoplada de alto rendimiento.
        """
        return bool(self.client.download_page(
            base_url=base_url,
            ch_hash=ch_hash,
            page_name=page_name,
            saver_name=saver_name,
            dest_path=dest_path,
            session=self.dl_session
        ))

    def compile_images_to_pdf(self, image_paths: List[Path], output_pdf: Path) -> bool:
        """Convierte una lista de imágenes en un documento PDF de alta fidelidad vía PDFCompiler."""
        return PDFCompiler.compile_chapter(image_paths, output_pdf)

    def download_chapter_group(
        self,
        ch_info: Dict,
        manga_dir: Path,
        temp_cache: Path,
        hierarchy: Optional[Dict] = None
    ) -> bool:
        """Descarga un capítulo probando sus candidatos alternativos hasta compilarlo exitosamente."""
        # Verificar margen de seguridad en disco antes de procesar
        if not IntegrityGuard.check_disk_margin(manga_dir, min_free_gb=15.0):
            logger.error("🛑 Margen de disco insuficiente (menos de 15 GB libres). Deteniendo descarga.")
            return False

        ch_str = ch_info["chapter"]
        vol_str = ch_info.get("volume")

        # Formatear ruta jerárquica con HierarchicalOrganizer
        if hierarchy is not None:
            dest_pdf = HierarchicalOrganizer.format_chapter_path(
                download_root=manga_dir.parent,
                title_display=manga_dir.name,
                chapter=ch_str,
                volume=vol_str,
                expected_hierarchy=hierarchy
            )
        else:
            # Compatibilidad con contratos existentes de tests E2E (Capitulo XX.pdf, Tomo Especial)
            dest_pdf = HierarchicalOrganizer.format_chapter_path(
                download_root=manga_dir.parent,
                title_display=manga_dir.name,
                chapter=ch_str,
                volume=vol_str,
                pad_digits=2,
                allow_tomo_especial=True
            )

        vol_folder_name = dest_pdf.parent.name if dest_pdf.parent != manga_dir else ""
        ch_filename = dest_pdf.name

        # Idempotencia: si ya existe y pesa más de 500 KB o supera la validación de integridad
        if dest_pdf.exists() and (dest_pdf.stat().st_size > 500 * 1024 or IntegrityGuard.is_idempotent_skip(dest_pdf)):
            logger.info(f"⏭️  Ya existe y es íntegro: {vol_folder_name} / {ch_filename} ({dest_pdf.stat().st_size // 1024} KB)")
            return True

        candidates = ch_info.get("candidates", [])
        if not candidates:
            logger.warning(f"No hay candidatos disponibles para Cap {ch_str}")
            return False

        for cand_idx, cand in enumerate(candidates, 1):
            ch_id = cand["id"]
            try:
                base_url, ch_hash, pages, pages_saver = self.client.get_chapter_pages_info(ch_id)
            except Exception as e:
                logger.warning(f"Candidato {cand_idx}/{len(candidates)} falló al consultar At-Home ({ch_id}): {e}")
                continue

            if not pages:
                continue

            ch_temp = temp_cache / f"{ch_id}"
            ch_temp.mkdir(parents=True, exist_ok=True)

            download_tasks = []
            page_files = []
            for idx, page_name in enumerate(pages):
                ext = Path(page_name).suffix or ".jpg"
                dest_img = ch_temp / f"{idx:04d}{ext}"
                page_files.append(dest_img)
                saver_name = pages_saver[idx] if idx < len(pages_saver) else None
                download_tasks.append((base_url, ch_hash, page_name, saver_name, dest_img))

            # Descarga concurrente Ultra Turbo de páginas (8+ workers)
            workers = max(8, self.max_workers)
            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = [
                    executor.submit(self._download_single_page, b_url, hsh, p_name, s_name, pth)
                    for b_url, hsh, p_name, s_name, pth in download_tasks
                    if not pth.exists() or pth.stat().st_size == 0
                ]
                for fut in as_completed(futures):
                    fut.result()

            downloaded = [p for p in page_files if p.exists() and p.stat().st_size > 1000]
            if len(downloaded) != len(pages):
                logger.warning(f"⚠️ Candidato {cand_idx} incompleto ({len(downloaded)}/{len(pages)} págs). Probando siguiente...")
                for p in downloaded:
                    try:
                        p.unlink()
                    except Exception:
                        pass
                continue

            # Compilar a PDF vía PDFCompiler nativo
            t0 = time.time()
            ok = PDFCompiler.compile_chapter(downloaded, dest_pdf)
            elapsed = time.time() - t0

            if ok:
                # Verificación estructural profunda con IntegrityGuard
                is_valid, reason = IntegrityGuard.verify_pdf(dest_pdf)
                if not is_valid:
                    logger.error(f"❌ Falló verificación de integridad para {dest_pdf.name}: {reason}")
                    if dest_pdf.exists():
                        try:
                            dest_pdf.unlink()
                        except OSError:
                            pass
                    continue

                # Limpiar temporales únicamente si la compilación tuvo éxito y el PDF es íntegro
                for p in downloaded:
                    try:
                        p.unlink()
                    except Exception:
                        pass
                try:
                    ch_temp.rmdir()
                except Exception:
                    pass

                logger.info(f"✅ {vol_folder_name} / {ch_filename} ({len(pages)} págs en {elapsed:.1f}s) [Cand {cand_idx}]")
                return True

        logger.error(f"❌ Fallaron todos los candidatos para Cap {ch_str}")
        return False

    def process_manga(
        self,
        title: str,
        custom_name: Optional[str] = None,
        languages: List[str] = ["es", "es-la"],
        expected_hierarchy: Optional[Dict[str, Any]] = None,
        mangadex_id: Optional[str] = None,
        manga_override: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Descarga e integra un manga completo en E:\\Manga con metadatos y carátula estructurados."""
        if not IntegrityGuard.check_disk_margin(self.output_root, min_free_gb=15.0):
            logger.error("🛑 Espacio en disco insuficiente para iniciar descarga.")
            return False

        actual_id = (manga_override.get("mangadex_id") or manga_override.get("id")) if manga_override else mangadex_id
        if manga_override and actual_id:
            m_id = actual_id
            canonical_title = custom_name or manga_override.get("title_display") or manga_override.get("title") or title
            clean_title = HierarchicalOrganizer.clean_title(canonical_title)
            manga_dir = self.output_root / clean_title
            manga_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"📁 Directorio destino (metadatos cacheados): {manga_dir}")

            cover_file = manga_override.get("cover_file")
            if cover_file:
                poster_path = manga_dir / "poster.jpg"
                if not poster_path.exists():
                    ok_cov = self.client.download_cover(m_id, cover_file, poster_path)
                    if ok_cov:
                        logger.info("🖼️  Portada oficial guardada: poster.jpg")

            metadata = {
                "id": m_id,
                "title": clean_title,
                "original_title": manga_override.get("original_title", {}),
                "altTitles": manga_override.get("altTitles", []),
                "description": manga_override.get("description", ""),
                "status": manga_override.get("status"),
                "year": manga_override.get("year"),
                "contentRating": manga_override.get("contentRating"),
                "tags": manga_override.get("tags", []),
                "author": manga_override.get("author")
            }
            HierarchicalOrganizer.save_metadata(metadata, manga_dir)
        else:
            logger.info(f"🔍 Buscando manga: '{title}'...")
            if mangadex_id:
                manga = self.client.get_manga_by_id(mangadex_id)
            else:
                manga = self.client.search_manga(title)

            if not manga:
                logger.error(f"No se encontró el manga '{title}' en MangaDex.")
                return False

            m_id = manga["id"]
            canonical_title = custom_name or list(manga["attributes"]["title"].values())[0]
            clean_title = HierarchicalOrganizer.clean_title(canonical_title)
            manga_dir = self.output_root / clean_title
            manga_dir.mkdir(parents=True, exist_ok=True)

            logger.info(f"📁 Directorio destino: {manga_dir}")

            # Guardar portada oficial poster.jpg vía HierarchicalOrganizer
            cover_rel = next((rel for rel in manga.get("relationships", []) if rel.get("type") == "cover_art"), None)
            if cover_rel and "attributes" in cover_rel:
                cover_file = cover_rel["attributes"]["fileName"]
                poster_path = manga_dir / "poster.jpg"
                if not poster_path.exists():
                    ok_cov = self.client.download_cover(m_id, cover_file, poster_path)
                    if ok_cov:
                        logger.info("🖼️  Portada oficial guardada: poster.jpg")

            # Guardar metadatos enriquecidos en JSON vía HierarchicalOrganizer
            metadata = {
                "id": m_id,
                "title": clean_title,
                "original_title": manga["attributes"].get("title", {}),
                "altTitles": manga["attributes"].get("altTitles", []),
                "description": manga["attributes"].get("description", {}),
                "status": manga["attributes"].get("status"),
                "year": manga["attributes"].get("year"),
                "contentRating": manga["attributes"].get("contentRating"),
                "tags": [t["attributes"]["name"].get("en") for t in manga["attributes"].get("tags", []) if "attributes" in t]
            }
            author_rel = next((rel for rel in manga.get("relationships", []) if rel.get("type") == "author"), None)
            if author_rel and "attributes" in author_rel:
                metadata["author"] = author_rel["attributes"].get("name")
            artist_rel = next((rel for rel in manga.get("relationships", []) if rel.get("type") == "artist"), None)
            if artist_rel and "attributes" in artist_rel:
                metadata["artist"] = artist_rel["attributes"].get("name")

            HierarchicalOrganizer.save_metadata(metadata, manga_dir)

        # Obtener todos los capítulos agrupados con candidatos
        logger.info(f"📡 Obteniendo lista de capítulos en Español...")
        ch_map = self.client.get_all_chapters_feed(m_id, languages=languages)

        def parse_sort(c_key):
            try:
                return float(c_key)
            except ValueError:
                return 9999.0

        sorted_chapters = sorted(ch_map.values(), key=lambda x: parse_sort(x["chapter"]))
        total = len(sorted_chapters)
        logger.info(f"📚 Total de capítulos identificados: {total}")

        temp_cache = self.output_root / ".temp_cache"
        temp_cache.mkdir(parents=True, exist_ok=True)

        success_count = 0
        t_start = time.time()

        if self.chapter_workers > 1:
            logger.info(f"⚡ Modo Ultra Turbo Activo: {self.chapter_workers} capítulos en paralelo x {self.max_workers} hilos de páginas")
            with ThreadPoolExecutor(max_workers=self.chapter_workers) as executor:
                future_to_ch = {
                    executor.submit(
                        self.download_chapter_group,
                        ch_info=ch_info,
                        manga_dir=manga_dir,
                        temp_cache=temp_cache,
                        hierarchy=expected_hierarchy
                    ): ch_info
                    for ch_info in sorted_chapters
                }
                for fut in as_completed(future_to_ch):
                    try:
                        ok = fut.result()
                        if ok:
                            success_count += 1
                    except Exception as e:
                        ch = future_to_ch[fut]
                        logger.error(f"Error procesando Cap {ch.get('chapter')}: {e}")
        else:
            for idx, ch_info in enumerate(sorted_chapters, 1):
                logger.info(f"[{idx}/{total}] Procesando Vol {ch_info.get('volume')} - Cap {ch_info['chapter']}...")
                ok = self.download_chapter_group(
                    ch_info=ch_info,
                    manga_dir=manga_dir,
                    temp_cache=temp_cache,
                    hierarchy=expected_hierarchy
                )
                if ok:
                    success_count += 1
                time.sleep(0.15)

        total_time = time.time() - t_start
        logger.info("=" * 60)
        logger.info(f"🎉 Proceso Concluido: {success_count}/{total} capítulos listos en PDF")
        logger.info(f"⏱️  Tiempo total: {total_time/60:.2f} minutos")
        logger.info(f"📍 Ubicación: {manga_dir}")
        logger.info("=" * 60)

        # Actualizar checkpoint de forma atómica
        self.checkpoint_manager.update_checkpoint(
            current_title=clean_title,
            chapter_count=success_count,
            status_note=f"Procesado: {clean_title} ({success_count}/{total} caps)"
        )
        return True

    def process_queue(
        self,
        queue_path: Union[str, Path] = "manhwa_top50_queue.json",
        max_series: Optional[int] = None
    ) -> Dict[str, Any]:
        """Procesa una cola de obras estructurada en JSON de forma continua."""
        q_path = Path(queue_path)
        if not q_path.exists():
            logger.error(f"Archivo de cola no encontrado: {q_path}")
            return {"error": "Archivo no encontrado"}

        with open(q_path, "r", encoding="utf-8") as f:
            queue_data = json.load(f)

        if queue_data.get("download_root"):
            self.output_root = Path(queue_data["download_root"])
            self.output_root.mkdir(parents=True, exist_ok=True)
            logger.info(f"📂 Raíz de salida establecida desde cola: {self.output_root}")

        series_list = queue_data.get("series", [])
        if max_series:
            series_list = series_list[:max_series]

        logger.info(f"🚀 Iniciando procesamiento de cola con {len(series_list)} obras...")
        results = {"processed": 0, "successful": 0, "failed": 0}

        for item in series_list:
            title = item.get("search_query") or item.get("title_display") or item.get("title")
            custom_name = item.get("title_display") or item.get("title")
            mangadex_id = item.get("mangadex_id") or item.get("id")
            languages = item.get("spanish_priority") or ["es-la", "es"]
            hierarchy = item.get("expected_hierarchy")

            logger.info(f"▶️ Procesando obra #{results['processed']+1}: {custom_name}")
            try:
                ok = self.process_manga(
                    title=title,
                    custom_name=custom_name,
                    languages=languages,
                    expected_hierarchy=hierarchy,
                    mangadex_id=mangadex_id,
                    manga_override=item
                )
            except Exception as e:
                logger.error(f"❌ Error en obra '{custom_name}': {e}. Continuando con la siguiente...")
                ok = False
                time.sleep(1.0)

            results["processed"] += 1
            if ok:
                results["successful"] += 1
            else:
                results["failed"] += 1

        return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manga Ultra Turbo Downloader")
    parser.add_argument("--title", type=str, default=None, help="Título del manga a buscar")
    parser.add_argument("--id", type=str, default=None, help="UUID canónico de MangaDex")
    parser.add_argument("--name", type=str, default=None, help="Nombre personalizado de la carpeta")
    parser.add_argument("--queue", type=str, default=None, help="Ruta a archivo JSON de cola")
    parser.add_argument("--limit", type=int, default=None, help="Límite de obras a procesar de la cola")
    parser.add_argument("--dest", type=str, default=r"E:\Manga", help="Directorio raíz de salida")
    parser.add_argument("--workers", type=int, default=16, help="Hilos concurrentes para descarga de páginas")
    parser.add_argument("--chapter-workers", type=int, default=4, help="Capítulos concurrentes en paralelo")
    args = parser.parse_args()

    pipeline = MangaPipeline(output_root=args.dest, max_workers=args.workers, chapter_workers=args.chapter_workers)
    if args.queue:
        pipeline.process_queue(queue_path=args.queue, max_series=args.limit)
    elif args.title or args.id:
        pipeline.process_manga(title=args.title or "Manga", custom_name=args.name, mangadex_id=args.id)
    else:
        parser.print_help()

MangaDownloader = MangaPipeline

__all__ = [
    "MangaPipeline",
    "MangaDownloader",
    "MangaDexClient",
    "SecondaryProvider",
    "TokenBucketRateLimiter",
    "PDFCompiler",
    "HierarchicalOrganizer",
    "IntegrityGuard",
    "CheckpointManager"
]
