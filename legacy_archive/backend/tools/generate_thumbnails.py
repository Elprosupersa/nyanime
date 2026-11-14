import os
import sys
import time
import argparse
import logging
import concurrent.futures
from pathlib import Path

# Configurar salida segura UTF-8 para Windows
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from src.metadata.thumbnail_generator import extract_thumbnails_for_series, extract_all_episodes_in_series

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("BatchThumbnailGenerator")

DEFAULT_DIRS = [
    Path(r"E:\Anime\04 - Hentai (Sin Censura)"),
    Path(r"E:\Anime\01 - Erotico (Sin Censura)"),
    Path(r"E:\Anime\02 - Miniseries Adultas (AnimeFesta)"),
    Path(r"E:\Anime\03 - Heavy Ecchi (Sin Censura BD)"),
    Path(r"E:\Anime")
]

def scan_series_directories(target_dir: Path) -> list:
    """Escanea y detecta carpetas de series que contengan videos o temporadas."""
    if not target_dir.exists():
        logger.warning(f"Directorio no existe: {target_dir}")
        return []

    series = []
    for item in sorted(target_dir.iterdir()):
        if not item.is_dir() or item.name.startswith("."):
            continue
        if item.name in ("$RECYCLE.BIN", "System Volume Information", "temp_dl", "01 - Erotico (Sin Censura)", "02 - Miniseries Adultas (AnimeFesta)", "03 - Heavy Ecchi (Sin Censura BD)", "04 - Hentai (Sin Censura)"):
            continue
        series.append(item)

    return series

def generate_all_thumbnails(target_path: Path, max_workers: int = 8, force: bool = False, episodes: bool = False):
    logger.info(f"🔍 Escaneando biblioteca en: {target_path}...")
    start_time = time.time()

    series_list = scan_series_directories(target_path)
    if not series_list and target_path == Path(r"E:\Anime"):
        for sub in [Path(r"E:\Anime\04 - Hentai (Sin Censura)"), Path(r"E:\Anime\01 - Erotico (Sin Censura)"), Path(r"E:\Anime\02 - Miniseries Adultas (AnimeFesta)"), Path(r"E:\Anime\03 - Heavy Ecchi (Sin Censura BD)")]:
            if sub.exists():
                series_list.extend(scan_series_directories(sub))

    total = len(series_list)
    logger.info(f"📦 Total de carpetas de series detectadas: {total}")

    completed_count = 0
    errors_count = 0

    def worker(anime_dir: Path):
        nonlocal completed_count, errors_count
        try:
            res = extract_thumbnails_for_series(anime_dir, force=force)
            if episodes:
                extract_all_episodes_in_series(anime_dir, force=force)
            if res.get("poster") or res.get("fanart"):
                completed_count += 1
                return True
            else:
                errors_count += 1
                return False
        except Exception as e:
            logger.error(f"Error procesando {anime_dir.name}: {e}")
            errors_count += 1
            return False

    # Filtrar pendientes
    pending = []
    for s in series_list:
        p_ok = (s / "poster.jpg").exists() and (s / "poster.jpg").stat().st_size > 2000
        f_ok = ((s / "fanart.jpg").exists() and (s / "fanart.jpg").stat().st_size > 2000) or ((s / "backdrop.jpg").exists() and (s / "backdrop.jpg").stat().st_size > 2000)
        if not (p_ok and f_ok) or force or episodes:
            pending.append(s)

    logger.info(f"⚡ Series pendientes: {len(pending)} (Completas: {total - len(pending)})")
    if not pending:
        logger.info("✅ ¡Todas las series ya cuentan con poster y fanart de alta definición!")
        return

    logger.info(f"🚀 Iniciando generación con {max_workers} hilos...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(worker, s): s for s in pending}
        for idx, fut in enumerate(concurrent.futures.as_completed(futures), 1):
            if idx % 25 == 0 or idx == len(pending):
                pct = int((idx / len(pending)) * 100)
                logger.info(f"[{idx}/{len(pending)} - {pct}%] Procesadas {completed_count} series...")

    elapsed = round(time.time() - start_time, 2)
    logger.info(f"🎉 Finalizado en {elapsed}s. Exitosas: {completed_count}, Errores: {errors_count}, Total: {len(pending)}.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generador Masivo de Miniaturas de Anime con FFmpeg")
    parser.add_argument("--dir", type=str, default=r"E:\Anime\04 - Hentai (Sin Censura)", help="Directorio a procesar")
    parser.add_argument("--workers", type=int, default=8, help="Número de hilos concurrentes (default 8)")
    parser.add_argument("--force", action="store_true", help="Regenerar miniaturas aunque ya existan")
    parser.add_argument("--episodes", action="store_true", help="Extraer también miniaturas para todos los episodios")
    args = parser.parse_args()

    target = Path(args.dir)
    generate_all_thumbnails(target, max_workers=args.workers, force=args.force, episodes=args.episodes)
