import os
import sys
import time
import logging
from pathlib import Path

# Configurar salida UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("MissingSeasonsDownloader")

from src.acquisition.plugins.tioanime import TioAnimeScraper
from src.acquisition.plugins.jkanime import JKAnimeScraper
from src.acquisition.downloader import Downloader

SEASONS_QUEUE = [
    {
        "series": "Zero no Tsukaima",
        "season_label": "Temporada 2",
        "search_titles": ["Zero no Tsukaima: Futatsuki no Kishi", "Zero no Tsukaima Season 2"],
        "total_eps": 12,
        "target_dir": r"E:\OTAKU\ANIME\Zero no Tsukaima\Temporada 2"
    },
    {
        "series": "Zero no Tsukaima",
        "season_label": "Temporada 3",
        "search_titles": ["Zero no Tsukaima: Princesses no Rondo", "Zero no Tsukaima Season 3"],
        "total_eps": 12,
        "target_dir": r"E:\OTAKU\ANIME\Zero no Tsukaima\Temporada 3"
    },
    {
        "series": "Zero no Tsukaima",
        "season_label": "Temporada 4",
        "search_titles": ["Zero no Tsukaima F", "Zero no Tsukaima Final"],
        "total_eps": 12,
        "target_dir": r"E:\OTAKU\ANIME\Zero no Tsukaima\Temporada 4"
    },
    {
        "series": "Kaguya-sama wa Kokurasetai",
        "season_label": "Temporada 2",
        "search_titles": ["Kaguya-sama wa Kokurasetai? Tensai-tachi no Renai Zunousen", "Kaguya-sama wa Kokurasetai 2"],
        "total_eps": 12,
        "target_dir": r"E:\OTAKU\ANIME\Kaguya-sama wa Kokurasetai\Temporada 2"
    },
    {
        "series": "Kaguya-sama wa Kokurasetai",
        "season_label": "Temporada 3",
        "search_titles": ["Kaguya-sama wa Kokurasetai: Ultra Romantic", "Kaguya-sama wa Kokurasetai Season 3"],
        "total_eps": 13,
        "target_dir": r"E:\OTAKU\ANIME\Kaguya-sama wa Kokurasetai\Temporada 3"
    }
]

def run_missing_seasons():
    tio = TioAnimeScraper()
    jk = JKAnimeScraper()
    scrapers = [jk, tio]

    total_downloaded = 0
    total_skipped = 0

    for item in SEASONS_QUEUE:
        series_name = item["series"]
        season_label = item["season_label"]
        target_dir = Path(item["target_dir"])
        target_dir.mkdir(parents=True, exist_ok=True)
        downloader = Downloader(str(target_dir))

        logger.info(f"\n==========================================")
        logger.info(f"▶️ Procesando {series_name} - {season_label} (Meta: {item['total_eps']} eps)")
        logger.info(f"Destino: {target_dir}")
        logger.info(f"==========================================")

        for ep in range(1, item["total_eps"] + 1):
            # Verificar si ya existe en destino
            existing = [f for f in os.listdir(target_dir) if f.lower().endswith(('.mp4', '.mkv', '.avi'))]
            already_done = any(f"episodio {ep:02d}" in f.lower() or f"episodio {ep}" in f.lower() or f" - {ep:02d}" in f.lower() for f in existing)
            if already_done:
                logger.info(f"  [OK] Ep {ep:02d} ya existe en disco. Omitiendo.")
                total_skipped += 1
                continue

            found_res = None
            for title in item["search_titles"]:
                for scraper in scrapers:
                    try:
                        res = scraper.search_episode(title, ep)
                        if res and res.download_url:
                            found_res = res
                            break
                    except Exception as err:
                        logger.debug(f"Error scraper {scraper.name}: {err}")
                if found_res:
                    break

            if found_res:
                logger.info(f"  [ENCONTRADO] Ep {ep:02d} en [{found_res.source}] -> {found_res.download_url[:60]}...")
                try:
                    success = downloader.download(found_res)
                    if success:
                        logger.info(f"  ✅ Descarga exitosa de Ep {ep:02d}!")
                        total_downloaded += 1
                    else:
                        logger.warning(f"  ⚠️ Falló la descarga de Ep {ep:02d}.")
                except Exception as down_e:
                    logger.error(f"  ❌ Error descargando Ep {ep:02d}: {down_e}")
            else:
                logger.warning(f"  ❌ No se encontró fuente para Ep {ep:02d} de {item['search_titles'][0]}")

    logger.info(f"\n=== FIN DE CICLO DE RELLENO DE TEMPORADAS ===")
    logger.info(f"Descargados nuevos: {total_downloaded} | Omitidos ya existentes: {total_skipped}")

if __name__ == "__main__":
    run_missing_seasons()
