import os
import sys
import shutil
import time
import logging
from pathlib import Path
import psutil

# Raíz del proyecto
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.acquisition.manga_downloader import MangaPipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("TurboReplacementManhwas")

TARGET_ROOT = Path(r"E:\OTAKU\MANHWAS\+18 Adulto")

OLD_SERIES = [
    "Hard-Boiled Love",
    "Love Is an Illusion",
    "Sun's Blood",
    "Virtual Strangers"
]

NEW_SERIES = [
    {"name": "Bad Thinking Diary", "id": "3ed82c63-c018-4f6a-a5ff-d5a71a08d5dc", "langs": ["es-la", "es", "en"]},
    {"name": "Close as Neighbors", "id": "2f67234f-a3ae-40b7-934f-7d470828323a", "langs": ["es-la", "es", "en"]},
    {"name": "Is There an Empty Room", "id": "a7d5ad11-b74e-4c28-b9a0-809c40a66b62", "langs": ["es-la", "es", "en"]},
    {"name": "Circles", "id": "26bbf066-6d2f-4fc3-a11e-f056f056b628", "langs": ["es-la", "es", "en"]}
]

def purge_old_placeholders():
    logger.info("=== 1. DEPURANDO CARPETAS VACÍAS/PLACEHOLDERS PREVIOS ===")
    for s in OLD_SERIES:
        folder = TARGET_ROOT / s
        if folder.exists():
            try:
                shutil.rmtree(folder)
                logger.info(f"🗑️ Eliminada carpeta placeholder: {s}")
            except Exception as e:
                logger.warning(f"Error eliminando {s}: {e}")

def measure_network_speed(interval=1.0):
    net1 = psutil.net_io_counters()
    time.sleep(interval)
    net2 = psutil.net_io_counters()
    bytes_recv = net2.bytes_recv - net1.bytes_recv
    mbps = (bytes_recv * 8) / (1024 * 1024 * interval)
    return mbps

def run_turbo_downloads():
    purge_old_placeholders()

    logger.info("=== 2. INICIANDO DESCARGAS EN MODO ULTRA TURBO (+200 Mbps) ===")
    pipeline = MangaPipeline(output_root=str(TARGET_ROOT), max_workers=32, chapter_workers=8)

    net_start = psutil.net_io_counters().bytes_recv
    start_time = time.time()
    
    completed = []
    for idx, s in enumerate(NEW_SERIES, 1):
        name = s["name"]
        mid = s["id"]
        langs = s["langs"]
        logger.info(f"\n🚀 [{idx}/{len(NEW_SERIES)}] PROCESANDO EN PARALELO: {name} (MangaDex ID: {mid})")
        
        try:
            ok = pipeline.process_manga(
                title=name,
                custom_name=name,
                languages=langs,
                mangadex_id=mid
            )
            if ok:
                completed.append(name)
                logger.info(f"✅ Descarga y compilación completada con éxito: {name}")
            else:
                logger.warning(f"⚠️ Proceso finalizado parcialmente para: {name}")
        except Exception as e:
            logger.error(f"❌ Error procesando {name}: {e}")

    elapsed = time.time() - start_time
    net_end = psutil.net_io_counters().bytes_recv
    total_bytes = net_end - net_start
    total_mb = total_bytes / (1024 * 1024)
    avg_mbps = (total_bytes * 8) / (1024 * 1024 * elapsed) if elapsed > 0 else 0

    logger.info("\n=======================================================")
    logger.info(f"🎉 RESUMEN DE RENDIMIENTO DE DESCARGA ULTRA TURBO:")
    logger.info(f" • Series procesadas exitosamente: {len(completed)}/{len(NEW_SERIES)}")
    logger.info(f" • Datos totales transferidos: {total_mb:.2f} MB")
    logger.info(f" • Tiempo transcurrido: {elapsed:.1f} segundos")
    logger.info(f" • Velocidad promedio observada: {avg_mbps:.2f} Mbps")
    logger.info("=======================================================")

if __name__ == "__main__":
    run_turbo_downloads()
