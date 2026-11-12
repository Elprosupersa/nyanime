import os
import sys

# Configurar salida segura UTF-8 para Windows (evitar charmap UnicodeEncodeError)
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

import json
import re
import time
import logging
import threading
import concurrent.futures
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("HentaiBulkManager")

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
OUTPUT_DIR = Path("E:/OTAKU/ANIME H/04 - Hentai (Sin Censura)")
QUEUE_FILE = BASE_DIR / "hentai_queue.json"
STATUS_FILE = BASE_DIR / "status.json"

queue_lock = threading.Lock()
status_lock = threading.Lock()
stop_event = threading.Event()

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

# 38 Valid Genres from User's Screenshot (Strictly Anti-BL / No Yaoi / No Shota)
ALLOWED_GENRES = [
    'escolares', 'harem', 'casadas', 'romance', 'vanilla', 'milfs',
    'enfermeras', 'tetonas', 'maids', 'chikan', 'virgenes', 'petit',
    'yuri', 'ninfomania', 'ecchi', 'elfas', 'gal', 'succubus',
    'suspenso', 'softcore', 'ninjas', 'netorare', 'gore', 'threesome',
    'hardcore', 'futanari', 'tentaculos', 'bondage', 'ahegao', 'anal',
    'orgias', 'paizuri', 'oyakodon', '3d', 'teacher', 'incesto', 'juegos-sexuales'
]

FORBIDDEN_KEYWORDS = ['boys love', 'yaoi', 'shounen ai', 'shota', 'bl']

def update_status(message: str, percent: int = 0, speed: str = ""):
    with status_lock:
        try:
            data = {
                "message": message,
                "percent": percent,
                "speed": speed,
                "timestamp": time.time()
            }
            with open(STATUS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"Error actualizando status.json: {e}")

def is_forbidden(text: str) -> bool:
    t = text.lower()
    return any(re.search(rf'\b{re.escape(kw)}\b', t) for kw in FORBIDDEN_KEYWORDS)

def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "", name).strip()
    cleaned = cleaned.rstrip('. ')
    return cleaned if cleaned else "Anime_Untitled"

def build_queue_from_catalog():
    """
    Construye o actualiza la cola de descargas combinando el catálogo sin BL
    y asegurando que todos los animes válidos queden registrados.
    """
    logger.info("Verificando y construyendo cola de animes autorizados (0% BL)...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    existing_queue = {}
    if QUEUE_FILE.exists():
        try:
            with open(QUEUE_FILE, "r", encoding="utf-8") as f:
                items = json.load(f)
                existing_queue = {item['title']: item for item in items}
                logger.info(f"Cargados {len(existing_queue)} animes existentes en cola.")
        except Exception as e:
            logger.warning(f"No se pudo leer la cola previa: {e}")

    # Cargar base de datos local de MAL
    mal_cache = BASE_DIR / "scratch" / "mal_hentai_all_1646.json"
    if not mal_cache.exists():
        brain_scratch = Path("C:/Users/gonza/.gemini/antigravity/brain/4f263807-a5fe-4329-ae16-0c5e733b8394/scratch/mal_hentai_all_1646.json")
        if brain_scratch.exists():
            mal_cache = brain_scratch

    all_titles = []
    if mal_cache.exists():
        with open(mal_cache, "r", encoding="utf-8") as f:
            data = json.load(f)
            logger.info(f"Leídos {len(data)} animes de la base de datos de referencia.")
            for anime in data:
                # Filtro estricto anti-BL
                all_text = f"{anime.get('title', '')} {' '.join(anime.get('genres', []))} {anime.get('synopsis', '')}"
                if is_forbidden(all_text):
                    continue

                title = anime.get('title')
                if not title:
                    continue

                if title in existing_queue:
                    all_titles.append(existing_queue[title])
                else:
                    try:
                        score = float(anime.get('score', 0))
                    except Exception:
                        score = 0.0

                    clean_title = sanitize_filename(title)
                    all_titles.append({
                        "title": title,
                        "url": anime.get("url", ""),
                        "score": score,
                        "members": anime.get("members", "0"),
                        "genres": anime.get("genres", []),
                        "status": "pending",
                        "downloaded_episodes": 0,
                        "total_episodes": 0,
                        "target_dir": str(OUTPUT_DIR / clean_title)
                    })

    all_titles.sort(key=lambda x: (x.get('score', 0), x.get('members', '')), reverse=True)

    with open(QUEUE_FILE, "w", encoding="utf-8") as f:
        json.dump(all_titles, f, ensure_ascii=False, indent=2)

    logger.info(f"Cola blindada y lista con {len(all_titles)} animes (100% libres de BL).")
    return all_titles

def generate_nfo(anime_dir: Path, title: str, synopsis: str = "", score: float = 0.0, genres: list = None):
    """Genera archivo tvshow.nfo compatible con Kodi, Plex, Jellyfin y la Web local."""
    nfo_path = anime_dir / "tvshow.nfo"
    genres = genres or ["Hentai", "Adult"]
    genres_xml = "\n".join([f"    <genre>{g}</genre>" for g in genres])
    content = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<tvshow>
    <title>{title}</title>
    <originaltitle>{title}</originaltitle>
    <plot>{synopsis}</plot>
    <rating>{score}</rating>
{genres_xml}
</tvshow>
"""
    try:
        with open(nfo_path, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        logger.warning(f"Error creando NFO en {anime_dir}: {e}")

def run_download_queue(max_items: int = None, max_completed: int = 2500, workers: int = 4):
    """
    Ejecuta el procesamiento de la cola de descargas con concurrencia paralela
    y tope acotado de animes completados.
    """
    if not QUEUE_FILE.exists():
        build_queue_from_catalog()

    with open(QUEUE_FILE, "r", encoding="utf-8") as f:
        queue = json.load(f)

    current_completed = len([x for x in queue if x.get('status') == 'completed'])
    if max_completed and current_completed >= max_completed:
        logger.info(f"Meta de {max_completed} animes completados ya alcanzada ({current_completed}/{max_completed}).")
        update_status(f"Meta alcanzada: {current_completed}/{max_completed} animes.", 100)
        return

    pending = [item for item in queue if item.get('status') == 'pending']
    total_to_process = len(pending) if not max_items else min(len(pending), max_items)
    pending_to_run = pending[:total_to_process]
    
    logger.info(f"⚡ ALTA VELOCIDAD CONCURRENTE ACTIVADA: {workers} descargas en paralelo simultáneas.")
    logger.info(f"Iniciando procesamiento (Completados: {current_completed}/{max_completed} | Pendientes en tanda: {len(pending_to_run)})...")
    update_status(f"Descarga masiva de alta velocidad ({workers}x): {current_completed}/{max_completed} animes.", int((current_completed / max_completed) * 100) if max_completed else 0)

    from src.acquisition.plugins.hentaila import HentaiLAScraper
    from src.acquisition.plugins.henaojara import HenaoJaraScraper
    from src.acquisition.downloader import Downloader

    def process_anime_worker(item, idx):
        if stop_event.is_set():
            return

        with queue_lock:
            comp = len([x for x in queue if x.get('status') == 'completed'])
            if max_completed and comp >= max_completed:
                stop_event.set()
                return

        scrapers = [HentaiLAScraper(), HenaoJaraScraper()]
        title = item['title']
        clean_title = sanitize_filename(title)
        target_path = OUTPUT_DIR / clean_title
        season_dir = target_path / "Temporada 1"
        for attempt in range(3):
            try:
                season_dir.mkdir(parents=True, exist_ok=True)
                break
            except Exception as e:
                if attempt == 2:
                    logger.warning(f"Ruta con caracteres especiales, normalizando para {title}: {e}")
                    safe_ascii = re.sub(r'[^a-zA-Z0-9_\- ]', '', clean_title).strip().rstrip('. ')
                    if not safe_ascii:
                        safe_ascii = f"Anime_{idx+1}"
                    target_path = OUTPUT_DIR / safe_ascii
                    season_dir = target_path / "Temporada 1"
                    try:
                        season_dir.mkdir(parents=True, exist_ok=True)
                    except Exception as e2:
                        logger.error(f"No se pudo crear carpeta de temporada para {title}: {e2}")
                        with queue_lock:
                            item['status'] = 'error'
                        return
                else:
                    time.sleep(1.5)

        logger.info(f"[Worker-{threading.current_thread().name}] Procesando: {title}")

        try:
            generate_nfo(target_path, title, score=item.get('score', 0), genres=item.get('genres', []))
            downloader = Downloader(str(season_dir))
            
            ep_num = 1
            found_any = False
            while ep_num <= 12:
                if stop_event.is_set():
                    break
                
                candidates = []
                for scraper in scrapers:
                    try:
                        cands = scraper.search_episode_candidates(title, ep_num)
                        if cands:
                            candidates.extend(cands)
                    except Exception:
                        pass
                
                if not candidates:
                    for scraper in scrapers:
                        try:
                            single = scraper.search_episode(title, ep_num)
                            if single:
                                candidates.append(single)
                        except Exception:
                            pass

                if candidates:
                    download_success = False
                    for res in candidates:
                        mirror_info = f" ({res.mirror_name})" if getattr(res, 'mirror_name', None) else ""
                        logger.info(f"[{title}] Probando Ep {ep_num} en {res.source}{mirror_info} -> {res.download_url}")
                        try:
                            if downloader.download(res):
                                download_success = True
                                break
                        except Exception as down_err:
                            logger.warning(f"Error descargando {title} Ep {ep_num}{mirror_info}: {down_err}")
                    
                    if download_success:
                        found_any = True
                        item['downloaded_episodes'] = ep_num
                        ep_num += 1
                    else:
                        logger.info(f"[{title}] Ningún servidor disponible concretó Ep {ep_num}, finalizando serie.")
                        break
                else:
                    break

            with queue_lock:
                if found_any:
                    item['status'] = 'completed'
                    logger.info(f"✅ [Worker] Completado {title} con éxito.")
                    try:
                        from src.metadata.thumbnail_generator import extract_thumbnails_for_series
                        extract_thumbnails_for_series(target_path)
                    except Exception as e_th:
                        logger.debug(f"Aviso generando carátula para {title}: {e_th}")
                else:
                    item['status'] = 'searched_no_source'
                    logger.info(f"ℹ️ [Worker] No se localizaron fuentes para {title}.")

                comp = len([x for x in queue if x.get('status') == 'completed'])
                if max_completed and comp >= max_completed:
                    stop_event.set()
                    logger.info(f"¡Meta de {max_completed} animes completados alcanzada! Deteniendo descargas.")

                # Guardar progreso en disco de forma atómica
                tmp_file = QUEUE_FILE.with_suffix(".tmp")
                with open(tmp_file, "w", encoding="utf-8") as f:
                    json.dump(queue, f, ensure_ascii=False, indent=2)
                os.replace(tmp_file, QUEUE_FILE)

        except Exception as anime_err:
            logger.error(f"Error inesperado procesando {title}: {anime_err}")
            with queue_lock:
                item['status'] = 'error'

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(process_anime_worker, item, idx) for idx, item in enumerate(pending_to_run)]
        for f in concurrent.futures.as_completed(futures):
            if stop_event.is_set():
                break

    final_completed = len([x for x in queue if x.get('status') == 'completed'])
    update_status(f"Descargas concluidas. Total animes completados: {final_completed}/{max_completed}", 100)
    logger.info(f"Fin de ciclo de descarga. Animes completados: {final_completed}/{max_completed}.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Hentai Bulk Manager")
    parser.add_argument("--build-queue", action="store_true", help="Construir o refrescar cola de animes")
    parser.add_argument("--start", action="store_true", help="Iniciar descarga de la cola")
    parser.add_argument("--limit", type=int, default=None, help="Límite de animes a procesar en esta tanda")
    parser.add_argument("--max-completed", type=int, default=2500, help="Tope máximo de animes completados (default 2500)")
    parser.add_argument("--workers", type=int, default=4, help="Número de descargas concurrentes en paralelo (default 4)")

    args = parser.parse_args()

    if args.build_queue or not QUEUE_FILE.exists():
        build_queue_from_catalog()

    if args.start:
        run_download_queue(max_items=args.limit, max_completed=args.max_completed, workers=args.workers)
    else:
        logger.info("Sistema blindado y en espera. Ejecuta con --start cuando decidas comenzar.")
