"""
Script autónomo para sincronizar y rellenar temporadas, OVAs y episodios faltantes en E:\OTAKU\ANIME
utilizando AcquisitionEngine con failover multi-proveedor (+200 Mbps).
"""

import sys
import logging
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("AnimeSyncRunner")

from src.acquisition.engine import AcquisitionEngine

def run_sync():
    engine = AcquisitionEngine()
    priority_series = [
        "Kaguya-sama wa Kokurasetai",
        "Zero no Tsukaima",
        "No Game No Life",
        "Youjo Senki"
    ]
    
    logger.info(f"🚀 Iniciando sincronización de {len(priority_series)} series prioritarias de anime...")
    for anime in priority_series:
        logger.info(f"▶️ Procesando anime: {anime}")
        try:
            engine.run(specific_anime=anime, dry_run=False)
        except Exception as e:
            logger.error(f"Error sincronizando {anime}: {e}. Continuando con el siguiente...")

if __name__ == "__main__":
    run_sync()
