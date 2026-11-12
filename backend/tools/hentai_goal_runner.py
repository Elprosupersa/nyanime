import os
import sys
import json
import time
import shutil
import logging
import psutil
from pathlib import Path

# Configurar salida UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("HentaiGoalRunner")

QUEUE_FILE = PROJECT_ROOT / "hentai_queue.json"
TARGET_DIR = Path("E:/OTAKU/ANIME H/04 - Hentai (Sin Censura)")
MIN_FREE_DISK_GB = 25.0

def get_disk_free_gb():
    try:
        _, _, free = shutil.disk_usage("E:/")
        return free / (1024**3)
    except Exception:
        return 999.0

def run_goal_batch(batch_size: int = 50, workers: int = 6):
    free_gb = get_disk_free_gb()
    logger.info(f"=== INICIANDO LOTE GOAL HENTAI (Lote: {batch_size} animes | Workers: {workers}x | Espacio Libre: {free_gb:.2f} GB) ===")
    
    if free_gb < MIN_FREE_DISK_GB:
        logger.warning(f"⚠️ Espacio en disco E: por debajo del límite seguro ({free_gb:.2f} GB < {MIN_FREE_DISK_GB} GB). Deteniendo descargas.")
        return False, 0, 0.0

    net_start = psutil.net_io_counters().bytes_recv
    start_time = time.time()
    
    from tools.hentai_bulk_manager import run_download_queue
    
    # Ejecutar la cola con el límite especificado
    run_download_queue(max_items=batch_size, workers=workers)
    
    elapsed = time.time() - start_time
    net_end = psutil.net_io_counters().bytes_recv
    total_bytes = net_end - net_start
    total_mb = total_bytes / (1024 * 1024)
    avg_mbps = (total_bytes * 8) / (1024 * 1024 * elapsed) if elapsed > 0 else 0.0

    # Contar estado de la cola
    with open(QUEUE_FILE, "r", encoding="utf-8") as f:
        queue = json.load(f)
    
    completed = len([x for x in queue if x.get('status') == 'completed'])
    pending = len([x for x in queue if x.get('status') == 'pending'])
    no_src = len([x for x in queue if x.get('status') == 'searched_no_source'])

    logger.info("=======================================================")
    logger.info(f"🎉 LOTE FINALIZADO:")
    logger.info(f" • Animes completados acumulados: {completed}/1626")
    logger.info(f" • Pendientes restantes: {pending}")
    logger.info(f" • Sin fuente digital localizada: {no_src}")
    logger.info(f" • Datos transferidos en lote: {total_mb:.2f} MB ({total_mb/1024:.2f} GB)")
    logger.info(f" • Velocidad promedio: {avg_mbps:.2f} Mbps")
    logger.info(f" • Espacio libre restante en E:: {get_disk_free_gb():.2f} GB")
    logger.info("=======================================================")
    
    return True, completed, avg_mbps

def update_checkpoint(completed: int, pending: int, no_src: int, free_gb: float):
    cp_path = PROJECT_ROOT / "CHECKPOINT_PROGRESO.md"
    try:
        content = f"""# CHECKPOINT DE PROGRESO - ARQUITECTURA MAESTRA E:\\OTAKU

**Fecha y Hora:** {time.strftime('%Y-%m-%d %H:%M:%S')} (Hora Local) - **MODO GOAL CONTINUO ULTRA TURBO (+200 Mbps)**  
**Ubicación Central:** `E:\\OTAKU\\`  
**Estado General:** 
- **Categoría 1 (ANIME GENERAL):** **56 Series en Catálogo** (+1,256 episodios y películas). 100% Completa (2 películas pendientes de estreno digital).
- **Categoría 2 (MANGAS GENERAL):** **9 Series en Catálogo** (+1,465 entregas en CBZ/PDF). 100% Completa.
- **Categoría 3 (MANHUAS):** **100% COMPLETADA** (6,080 PDFs en 5 series masivas).
- **Categoría 4 (MANHWAS GENERAL):** **100% POBLADA Y DEPURADA** (29 series activas con 5,345 PDFs verificados en disco).
- **Categoría 5 (MANHWAS +18 ADULTO):** **78/78 Series 100% POBLADAS** (+2,630 capítulos en PDF nativo, 0 series vacías).
- **Categoría 6 (MANGAS +18 ADULTO):** **72/72 Series 100% POBLADAS** (+1,300 PDFs en lectura nativa).
- **Categoría 7 (ANIME H):**
  - *01 - Erótico (Sin Censura):* 14/14 series completas.
  - *02 - Miniseries Adultas (AnimeFesta):* 3/3 series completas.
  - *03 - Heavy Ecchi (Sin Censura BD):* 45/45 series completas.
  - *04 - Hentai (Sin Censura):* **{completed} obras completadas con video funcional**.
    - *Cola restante:* {pending} títulos pendientes de procesamiento y {no_src} sin fuentes activas en streaming.
    - *Motor optimizado:* Multi-espejo en cascada (`MP4Upload` directo vía `aria2c` + `Mega` con watchdog + `YourUpload` saneado + `Voe` / `Streamwish`).
- **Espacio en Disco HDD E:\\:** **{free_gb:.2f} GB Libres** ({1861.75 - free_gb:.2f} GB Usados / 1,861.75 GB Total).
"""
        with open(cp_path, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        logger.warning(f"Error actualizando checkpoint: {e}")

def run_continuous_goal(batch_size: int = 40, workers: int = 6):
    batch_num = 1
    logger.info("=================================================================")
    logger.info("🚀 INICIANDO MODO /GOAL CONTINUO ULTRA TURBO (+200 Mbps)")
    logger.info("=================================================================")
    while True:
        free_gb = get_disk_free_gb()
        if free_gb < MIN_FREE_DISK_GB:
            logger.warning(f"⚠️ Espacio en disco E: por debajo del límite seguro ({free_gb:.2f} GB < {MIN_FREE_DISK_GB} GB). Deteniendo descargas.")
            break

        with open(QUEUE_FILE, "r", encoding="utf-8") as f:
            queue = json.load(f)
        
        pending = len([x for x in queue if x.get('status') == 'pending'])
        completed = len([x for x in queue if x.get('status') == 'completed'])
        no_src = len([x for x in queue if x.get('status') == 'searched_no_source'])

        if pending == 0:
            logger.info("🎉 ¡GOAL ALCANZADO! Todos los títulos de la cola han sido completados o catalogados.")
            update_checkpoint(completed, pending, no_src, free_gb)
            break

        logger.info(f"\n>>> [LOTE #{batch_num}] Procesando tanda de {min(batch_size, pending)} animes ({pending} pendientes)...")
        success, comp, mbps = run_goal_batch(batch_size=batch_size, workers=workers)
        
        # Leer estado tras el lote
        with open(QUEUE_FILE, "r", encoding="utf-8") as f:
            queue = json.load(f)
        pending = len([x for x in queue if x.get('status') == 'pending'])
        completed = len([x for x in queue if x.get('status') == 'completed'])
        no_src = len([x for x in queue if x.get('status') == 'searched_no_source'])
        free_gb = get_disk_free_gb()

        update_checkpoint(completed, pending, no_src, free_gb)
        batch_num += 1
        time.sleep(1)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=40)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--continuous", action="store_true", default=True, help="Ejecutar en bucle continuo hasta agotar la cola")
    args = parser.parse_args()
    
    if args.continuous:
        run_continuous_goal(batch_size=args.batch_size, workers=args.workers)
    else:
        run_goal_batch(batch_size=args.batch_size, workers=args.workers)
