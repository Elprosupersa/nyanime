from fastapi import FastAPI, BackgroundTasks, HTTPException, WebSocket, WebSocketDisconnect, Query, Header, Response, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from contextlib import asynccontextmanager
import subprocess
import yaml
import json
import os
import sys
import time
import shutil
import threading
import asyncio
import re
import mimetypes
import urllib.parse
import xml.etree.ElementTree as ET
import xml.sax.saxutils
from pathlib import Path
from typing import List, Set, Optional, Dict, Any

from src.api.daemon import daemon_instance
from src.metadata.resolver import AnimeMetadataResolver
from src.sources.manager import VideoSourceManager

from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        daemon_instance.start()
    except Exception as e:
        print(f"Error iniciando AutoSyncDaemon: {e}")
    yield
    try:
        daemon_instance.stop()
    except Exception:
        pass

app = FastAPI(
    title="Organizador de Anime Pro API",
    description="Sistema profesional de gestión, metadatos exactos y streaming multi-fuente de anime",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type"]
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SUBSCRIPTIONS_FILE = os.path.join(BASE_DIR, "subscriptions.yaml")
STATUS_FILE = os.path.join(BASE_DIR, "status.json")

from src.acquisition.portal import MultiProviderAnimePortal

# Instancias centrales
resolver = AnimeMetadataResolver()
source_manager = VideoSourceManager()
portal_instance = MultiProviderAnimePortal()

# Sirviendo los archivos estáticos de frontend
static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

class AnimeAddRequest(BaseModel):
    name: str

class RemoveQueueRequest(BaseModel):
    name: str

download_queue = []
current_process = None
current_downloading = None
queue_lock = threading.Lock()

# Gestor de conexiones WebSocket
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.active_connections.discard(connection)

ws_manager = ConnectionManager()

def update_status(msg, pct=0, spd=""):
    status_data = {"message": msg, "percent": pct, "speed": spd, "timestamp": time.time()}
    with open(STATUS_FILE, "w", encoding="utf-8") as f:
        json.dump(status_data, f)
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(ws_manager.broadcast(status_data), loop)
    except Exception:
        pass

def worker_loop():
    global current_process, current_downloading
    while True:
        target_anime = None
        with queue_lock:
            if download_queue:
                target_anime = download_queue.pop(0)
                
        if not target_anime:
            time.sleep(2)
            continue
            
        current_downloading = target_anime
        try:
            update_status(f"Buscando y sincronizando: {target_anime}...", 0, "")
            cmd = [sys.executable, os.path.join(BASE_DIR, "acquire.py"), "--download", target_anime]
            if os.name == 'nt':
                current_process = subprocess.Popen(cmd, cwd=BASE_DIR, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
            else:
                current_process = subprocess.Popen(cmd, cwd=BASE_DIR, preexec_fn=os.setsid)
            current_process.wait()
            
            if current_process.returncode == 0:
                update_status(f"¡{target_anime} completado!", 100, "")
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.run_coroutine_threadsafe(
                            ws_manager.broadcast({
                                "type": "collection_updated",
                                "message": f"¡{target_anime} añadido a tu biblioteca!",
                                "timestamp": time.time()
                            }),
                            loop
                        )
                except Exception:
                    pass
            elif current_process.returncode == -15:
                update_status("Descarga Cancelada", 0, "")
            else:
                update_status("Hubo un error durante la descarga.", 0, "")
            time.sleep(3)
        except Exception as e:
            update_status(f"Error crítico: {e}", 0, "")
            time.sleep(3)
        finally:
            current_process = None
            current_downloading = None
            update_status("Inactivo", 0, "")

threading.Thread(target=worker_loop, daemon=True).start()

@app.websocket("/ws/status")
async def websocket_status(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        status_data = {"message": "Inactivo", "percent": 0, "speed": ""}
        if os.path.exists(STATUS_FILE):
            with open(STATUS_FILE, "r", encoding="utf-8") as f:
                status_data = json.load(f)
        await websocket.send_json(status_data)
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)

# ==================== ENDPOINTS DE LA APLICACIÓN Y CATÁLOGO ====================

@app.get("/")
def read_root():
    return FileResponse(os.path.join(static_dir, "index.html"))

@app.get("/api/catalog")
def get_catalog():
    """Retorna carruseles de tendencias, en emisión y populares."""
    data = resolver.get_trending_and_releasing()
    return JSONResponse(content=data)

@app.get("/api/search")
def search_anime(q: str = Query(..., min_length=1)):
    """Búsqueda en tiempo real de animes con metadatos completos."""
    results = resolver.search_anilist(q, limit=15)
    return JSONResponse(content={"results": results})

@app.get("/api/anime/{anime_id}/details")
def get_anime_details(anime_id: int):
    """
    Retorna los metadatos completos de un anime junto con la lista EXACTA y REAL
    de episodios emitidos (sin estimaciones ni episodios falsos).
    """
    details = resolver.resolve_anime_details(anime_id)
    if not details:
        raise HTTPException(status_code=404, detail="Anime no encontrado en el catálogo")
    return JSONResponse(content=details.model_dump())

@app.get("/api/anime/{anime_id}/stream/{season}/{episode}")
def get_anime_stream(anime_id: int, season: int, episode: int):
    """
    Resuelve y retorna las fuentes de streaming disponibles para el episodio solicitado.
    """
    details = resolver.resolve_anime_details(anime_id)
    if not details:
        raise HTTPException(status_code=404, detail="Anime no encontrado")
        
    # Validar que el episodio solicitado exista realmente en la temporada
    target_season = next((s for s in details.seasons if s.season_number == season), None)
    if not target_season:
        raise HTTPException(status_code=404, detail=f"Temporada {season} no encontrada")
        
    target_ep = next((e for e in target_season.episodes if e.episode_number == episode), None)
    if not target_ep:
        raise HTTPException(
            status_code=404, 
            detail=f"El episodio {episode} no existe en la temporada {season} (Máximo emitido: {target_season.total_episodes})"
        )

    mapping_data = resolver.fetch_anizip_mapping(anime_id)
    is_movie = (target_season.format == "MOVIE" or details.real_total_episodes == 1)

    sources = source_manager.resolve_all_sources(
        anime_id=anime_id,
        season=season,
        episode=episode,
        mapping_data=mapping_data,
        is_movie=is_movie
    )

    if not sources:
        raise HTTPException(status_code=503, detail="No hay fuentes de reproducción disponibles en este momento")

    return JSONResponse(content={
        "anime_id": anime_id,
        "season": season,
        "episode": episode,
        "title": target_ep.title or f"Episodio {episode}",
        "sources": [s.model_dump() for s in sources]
    })

# ==================== ENDPOINTS DE DESCARGA, COLA Y BIBLIOTECA LOCAL ====================

@app.get("/api/subscriptions")
def get_subscriptions():
    try:
        with open(SUBSCRIPTIONS_FILE, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
            return {"animes": data.get("animes", [])}
    except Exception:
        return {"animes": []}

@app.post("/api/add")
def add_anime(req: AnimeAddRequest):
    try:
        data = {"animes": []}
        if os.path.exists(SUBSCRIPTIONS_FILE):
            with open(SUBSCRIPTIONS_FILE, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f) or {"animes": []}
                
        if req.name not in data.get("animes", []):
            if "animes" not in data or not isinstance(data["animes"], list):
                data["animes"] = []
            data["animes"].append(req.name)
            with open(SUBSCRIPTIONS_FILE, 'w', encoding='utf-8') as f:
                yaml.dump(data, f, allow_unicode=True)
                
        return {"status": "success", "message": f"Añadido {req.name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/queue")
def get_queue():
    with queue_lock:
        return {
            "current": current_downloading,
            "queue": list(download_queue)
        }

@app.post("/api/queue/remove")
def remove_from_queue(req: RemoveQueueRequest):
    with queue_lock:
        if req.name in download_queue:
            download_queue.remove(req.name)
            return {"status": "success", "message": "Removido de la cola"}
    return {"status": "error", "message": "No se encontró en la cola"}

@app.post("/api/cancel")
def cancel_current():
    global current_process
    with queue_lock:
        download_queue.clear()
        
    if current_process:
        try:
            if os.name == 'nt':
                subprocess.call(['taskkill', '/F', '/T', '/PID', str(current_process.pid)])
            else:
                import signal
                os.killpg(os.getpgid(current_process.pid), signal.SIGTERM)
        except Exception:
            pass
        return {"status": "success", "message": "Cancelando descarga y limpiando cola..."}
    return {"status": "success", "message": "Cola limpiada. No hay descargas activas."}

@app.get("/api/daemon/status")
def get_daemon_status():
    return daemon_instance.get_status()

@app.post("/api/daemon/toggle")
def toggle_daemon():
    if daemon_instance.running:
        daemon_instance.stop()
        return {"status": "success", "message": "Daemon detenido", "running": False}
    else:
        daemon_instance.start()
        return {"status": "success", "message": "Daemon iniciado", "running": True}

@app.get("/api/library")
def get_library():
    """Devuelve las carpetas de animes disponibles en el HDD con desglose por temporada."""
    from src.config import load_config
    try:
        config_obj = load_config(os.path.join(BASE_DIR, "config.yaml"))
        lib_path = Path(config_obj.paths.library)
    except Exception:
        lib_path = Path("E:/Anime")

    if not lib_path.exists():
        return {"connected": False, "animes": []}
        
    animes = []
    try:
        for item in sorted(lib_path.iterdir()):
            if item.is_dir() and not item.name.startswith("."):
                subdirs_info = []
                total_files = 0
                for s in sorted(item.iterdir()):
                    if s.is_dir() and not s.name.startswith('.'):
                        files = [f.name for f in s.glob("*.mp4")] + [f.name for f in s.glob("*.mkv")]
                        subdirs_info.append({"name": s.name, "count": len(files)})
                        total_files += len(files)
                
                has_poster = (item / "poster.jpg").exists()
                has_nfo = (item / "tvshow.nfo").exists()
                
                animes.append({
                    "name": item.name,
                    "seasons": len(subdirs_info) if subdirs_info else 1,
                    "episodes": total_files,
                    "seasons_detail": subdirs_info,
                    "has_poster": has_poster,
                    "has_nfo": has_nfo
                })
        return {"connected": True, "path": str(lib_path), "animes": animes}
    except Exception as e:
        return {"connected": False, "error": str(e), "animes": []}

@app.post("/api/download_single")
def download_single(req: AnimeAddRequest):
    with queue_lock:
        if req.name == current_downloading or req.name in download_queue:
            return {"status": "info", "message": "Ya está en la cola o descargándose"}
        download_queue.append(req.name)
    return {"status": "success", "message": f"Añadido a la cola: {req.name}"}

@app.get("/api/status")
def get_status():
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"message": "Inactivo", "percent": 0, "speed": ""}

# ==================== PROTOCOLO DE HANDOFF LOCAL & SERVICE DISCOVERY ====================

class HandoffPayload(BaseModel):
    animeId: str
    episodeId: Optional[str] = "1"
    season: Optional[int] = 1
    currentTime: Optional[float] = 0.0
    title: Optional[str] = ""
    cover: Optional[str] = ""
    sourceUrl: Optional[str] = ""
    action: Optional[str] = "play"
    timestamp: Optional[float] = None

pending_handoff: Optional[dict] = None
handoff_lock = threading.Lock()

@app.get("/api/discovery")
def get_service_discovery():
    """Descubrimiento de servicio para NyAnime TV en la red local Wi-Fi."""
    return {
        "service": "nyanime-tv",
        "name": "NyAnime TV Living Room",
        "version": "2.0.0",
        "status": "online",
        "port": 8000,
        "handoff_url": "/api/handoff",
        "capabilities": ["handoff", "stream", "collection", "leanback_10ft"],
        "endpoints": {
            "status": "/api/status",
            "discovery": "/api/discovery",
            "handoff": "/api/handoff",
            "handoff_pending": "/api/handoff/pending",
            "collection": "/api/local/collection",
            "stream": "/api/local/stream"
        }
    }

@app.post("/api/handoff")
@app.post("/api/handoff/play")
async def receive_handoff(payload: HandoffPayload):
    """Recibe la sesión de reproducción transferida desde un dispositivo móvil o navegador."""
    global pending_handoff
    data = payload.dict()
    if not data.get("timestamp"):
        data["timestamp"] = time.time()
    
    with handoff_lock:
        pending_handoff = data

    # Notificar inmediatamente a las pantallas conectadas vía WebSocket
    try:
        await ws_manager.broadcast({
            "type": "handoff",
            "data": data,
            "message": f"Reproducción recibida: {data.get('title') or data.get('animeId')}"
        })
    except Exception as e:
        print(f"Error al retransmitir handoff vía WebSocket: {e}")

    return {
        "status": "ok",
        "message": "Sesión de reproducción recibida en NyAnime TV",
        "handoff": data
    }

@app.get("/api/handoff/pending")
def get_pending_handoff(consume: bool = False):
    """Consulta la última sesión de reproducción pendiente transferida a este TV."""
    global pending_handoff
    with handoff_lock:
        data = pending_handoff
        if consume and pending_handoff is not None:
            pending_handoff = None
    return {
        "status": "ok",
        "has_pending": data is not None,
        "handoff": data
    }

@app.post("/api/handoff/clear")
def clear_pending_handoff():
    """Limpia la sesión de handoff pendiente."""
    global pending_handoff
    with handoff_lock:
        pending_handoff = None
    return {"status": "ok", "message": "Handoff pendiente limpiado"}


class SyncFranchiseRequest(BaseModel):
    name: str

@app.post("/api/sync_franchise")
def sync_franchise(req: SyncFranchiseRequest):
    try:
        results = resolver.search_anilist(req.name, limit=1)
        if results:
            target = results[0]
            title = target.get('title_romaji') or req.name
            return {"status": "success", "message": f"Franquicia identificada y sincronizada: {title}"}
        return {"status": "success", "message": f"Sincronización procesada para {req.name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== STREAMING LOCAL & CATÁLOGO WEB DE CAPÍTULOS ====================

PROGRESS_FILE = os.path.join(BASE_DIR, "watch_progress.json")

def get_library_root() -> Path:
    from src.config import load_config
    try:
        config_obj = load_config(os.path.join(BASE_DIR, "config.yaml"))
        p = Path(config_obj.paths.library)
        if p.exists():
            return p
    except Exception:
        pass
    return Path("E:/Anime")

COLLECTION_CACHE_FILE = os.path.join(BASE_DIR, "collection_cache.json")
MARKER_FILE = os.path.join(BASE_DIR, ".collection_updated")

_collection_cache = None
_collection_cache_time = 0.0
_collection_lock = threading.Lock()
_collection_version_str = ""
_last_fingerprint = ""
_last_fingerprint_check = 0.0

# Carga inmediata de caché en arranque para responder en < 1ms desde la primera petición
if os.path.exists(COLLECTION_CACHE_FILE):
    try:
        with open(COLLECTION_CACHE_FILE, "r", encoding="utf-8") as _f_init:
            _disk_init = json.load(_f_init)
            if _disk_init and _disk_init.get("series"):
                _collection_cache = _disk_init
                _collection_cache_time = max(os.path.getmtime(COLLECTION_CACHE_FILE), time.time())
                _last_fingerprint = _disk_init.get("fingerprint", "")
                _collection_version_str = _disk_init.get("version", "")
    except Exception:
        pass

def natural_sort_key(p: Path):
    """Ordenamiento alfanumérico natural para que Episodio 2 preceda a Episodio 10."""
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', p.name)]

def get_marker_mtime() -> float:
    if os.path.exists(MARKER_FILE):
        try:
            return os.path.getmtime(MARKER_FILE)
        except Exception:
            pass
    return 0.0

def compute_library_fingerprint() -> str:
    """Calcula un hash ultrarrápido (~2ms) del estado físico de las carpetas de la biblioteca."""
    lib_path = get_library_root()
    if not lib_path.exists():
        return ""
    import hashlib
    categories = [
        "01 - Erotico (Sin Censura)",
        "02 - Miniseries Adultas (AnimeFesta)",
        "03 - Heavy Ecchi (Sin Censura BD)",
        "04 - Hentai (Sin Censura)"
    ]
    h = hashlib.md5()
    total_dirs = 0
    for cat in categories:
        cp = lib_path / cat
        if cp.exists():
            try:
                with os.scandir(cp) as it:
                    for entry in it:
                        if entry.is_dir() and not entry.name.startswith("."):
                            total_dirs += 1
                            st = entry.stat()
                            h.update(f"{cat}/{entry.name}:{int(st.st_mtime)}".encode("utf-8"))
            except Exception:
                pass
    try:
        with os.scandir(lib_path) as it:
            for entry in it:
                if entry.is_dir() and entry.name not in categories and not entry.name.startswith("."):
                    total_dirs += 1
                    st = entry.stat()
                    h.update(f"root/{entry.name}:{int(st.st_mtime)}".encode("utf-8"))
    except Exception:
        pass
    h.update(str(total_dirs).encode("utf-8"))
    return h.hexdigest()

def trigger_collection_update(msg: str = "¡Biblioteca actualizada con nuevos animes!"):
    """Toca el marcador y emite el evento en tiempo real por WebSocket."""
    try:
        marker = Path(MARKER_FILE)
        marker.touch()
        os.utime(str(marker), None)
    except Exception:
        pass
    
    # Iniciar reconstrucción en segundo plano
    threading.Thread(target=build_and_cache_collection, args=(True, msg), daemon=True).start()

def build_and_cache_collection(broadcast: bool = False, broadcast_msg: str = "") -> dict:
    global _collection_cache, _collection_cache_time, _collection_version_str, _last_fingerprint
    with _collection_lock:
        lib_path = get_library_root()
        if not lib_path.exists():
            data = {"connected": False, "total_series": 0, "total_episodes": 0, "categories": [], "series": []}
            _collection_cache = data
            _collection_cache_time = time.time()
            return data

        categories_cfg = [
            {"folder": "01 - Erotico (Sin Censura)", "id": "erotico", "label": "Erótico (Sin Censura)", "badge_color": "#ff477e"},
            {"folder": "02 - Miniseries Adultas (AnimeFesta)", "id": "animefesta", "label": "Miniseries (AnimeFesta)", "badge_color": "#e056fd"},
            {"folder": "03 - Heavy Ecchi (Sin Censura BD)", "id": "heavy_ecchi", "label": "Heavy Ecchi (Sin Censura BD)", "badge_color": "#ff793f"},
            {"folder": "04 - Hentai (Sin Censura)", "id": "hentai", "label": "Hentai (Sin Censura)", "badge_color": "#a855f7"},
        ]

        known_cat_folders = {c["folder"] for c in categories_cfg}
        all_series = []
        total_vids = 0
        missing_thumbs_dirs = []

        # 1. Escaneo ultrarrápido de carpetas por categoría
        for cat in categories_cfg:
            cat_dir = lib_path / cat["folder"]
            if not cat_dir.exists():
                continue
            try:
                with os.scandir(cat_dir) as it:
                    for entry in it:
                        if entry.is_dir() and not entry.name.startswith("."):
                            s_info = parse_local_anime_summary(Path(entry.path), cat["id"], cat["label"], cat["folder"])
                            if s_info:
                                all_series.append(s_info)
                                total_vids += s_info["total_episodes"]
                                if not s_info["has_poster"]:
                                    missing_thumbs_dirs.append(Path(entry.path))
            except Exception as e:
                print(f"Error escaneando categoría {cat['folder']}: {e}")

        # 2. Escaneo de carpetas raíz (Colección General)
        skip_root_names = known_cat_folders | {"$RECYCLE.BIN", "System Volume Information", "temp_dl"}
        try:
            with os.scandir(lib_path) as it:
                for entry in it:
                    if entry.is_dir() and entry.name not in skip_root_names and not entry.name.startswith("."):
                        s_info = parse_local_anime_summary(Path(entry.path), "general", "Colección General", "")
                        if s_info:
                            all_series.append(s_info)
                            total_vids += s_info["total_episodes"]
                            if not s_info["has_poster"]:
                                missing_thumbs_dirs.append(Path(entry.path))
        except Exception as e:
            print(f"Error escaneando raíz: {e}")

        mtime_val = int(get_marker_mtime())
        _last_fingerprint = compute_library_fingerprint()
        _collection_version_str = f"{len(all_series)}_{total_vids}_{mtime_val}_{_last_fingerprint[:8]}"

        result = {
            "connected": True,
            "library_path": str(lib_path),
            "total_series": len(all_series),
            "total_episodes": total_vids,
            "series": all_series,
            "version": _collection_version_str,
            "fingerprint": _last_fingerprint
        }

        _collection_cache = result
        _collection_cache_time = time.time()

        # Guardar caché en disco de forma atómica para arranques inmediatos
        try:
            tmp_cache = COLLECTION_CACHE_FILE + ".tmp"
            with open(tmp_cache, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False)
            try:
                if os.path.exists(COLLECTION_CACHE_FILE):
                    os.replace(tmp_cache, COLLECTION_CACHE_FILE)
                else:
                    os.rename(tmp_cache, COLLECTION_CACHE_FILE)
            except Exception:
                shutil.copy2(tmp_cache, COLLECTION_CACHE_FILE)
                try:
                    os.unlink(tmp_cache)
                except Exception:
                    pass
        except Exception as e_cw:
            print(f"Aviso guardando cache en disco: {e_cw}")

        # Generar miniaturas en segundo plano para las carpetas detectadas sin carátula
        if missing_thumbs_dirs:
            def bg_gen(dirs_to_gen):
                from src.metadata.thumbnail_generator import extract_thumbnails_for_series
                for d in dirs_to_gen:
                    try:
                        extract_thumbnails_for_series(d)
                    except Exception:
                        pass
            threading.Thread(target=bg_gen, args=(missing_thumbs_dirs,), daemon=True).start()

        if broadcast:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        ws_manager.broadcast({
                            "type": "collection_updated",
                            "message": broadcast_msg or "¡Catálogo actualizado con nuevos animes!",
                            "version": _collection_version_str,
                            "timestamp": time.time()
                        }),
                        loop
                    )
            except Exception:
                pass

        return result

def library_monitor_loop():
    """
    Monitor daemon que vigila en tiempo real la biblioteca.
    Detecta automáticamente nuevas carpetas de animes o episodios agregados
    en disco en menos de 3 segundos sin requerir recargar la página.
    """
    global _last_fingerprint, _collection_version_str
    time.sleep(2.0)
    _last_fingerprint = compute_library_fingerprint()
    last_mtime = get_marker_mtime()

    while True:
        try:
            time.sleep(3.0)
            current_fp = compute_library_fingerprint()
            current_mtime = get_marker_mtime()

            changed = False
            msg = ""
            if current_fp and _last_fingerprint and current_fp != _last_fingerprint:
                _last_fingerprint = current_fp
                changed = True
                msg = "¡Nuevas carpetas de animes detectadas en la biblioteca!"
            elif current_mtime > last_mtime:
                last_mtime = current_mtime
                changed = True
                msg = "¡Biblioteca actualizada con nuevos contenidos!"

            if changed:
                build_and_cache_collection(broadcast=True, broadcast_msg=msg)
        except Exception:
            time.sleep(5.0)

threading.Thread(target=library_monitor_loop, daemon=True, name="LibraryAutoDetectionDaemon").start()

@app.get("/api/local/collection/version")
def get_collection_version():
    """Endpoint ultrarrápido (<1ms) para consultar si la biblioteca cambió en tiempo real."""
    global _collection_version_str, _collection_cache, _last_fingerprint, _last_fingerprint_check
    now = time.time()
    m_time = int(get_marker_mtime())
    
    # Revisión ligera de huella cada 2s para responder al instante a nuevas carpetas
    if now - _last_fingerprint_check > 2.0:
        _last_fingerprint_check = now
        fp = compute_library_fingerprint()
        if fp and _last_fingerprint and fp != _last_fingerprint:
            _last_fingerprint = fp
            threading.Thread(target=build_and_cache_collection, args=(True, "¡Nuevos animes detectados!"), daemon=True).start()

    if not _collection_version_str:
        if _collection_cache:
            _collection_version_str = f"{_collection_cache['total_series']}_{_collection_cache['total_episodes']}_{m_time}_{_last_fingerprint[:8]}"
        else:
            _collection_version_str = f"init_{m_time}"
    return {
        "version": _collection_version_str,
        "marker_mtime": m_time,
        "total_series": _collection_cache["total_series"] if _collection_cache else 0
    }

@app.get("/api/local/collection")
def get_local_collection():
    """
    Retorna la colección completa de series desde caché en memoria (<1ms).
    Responde al instante y si detecta cambios o marcador, reconstruye en segundo plano
    sin bloquear nunca la petición HTTP ni congelar el navegador.
    """
    global _collection_cache, _collection_cache_time
    m_time = get_marker_mtime()

    # 1. Si tenemos caché fresca en memoria y no hay cambios posteriores, devolver de inmediato (< 1ms)
    if _collection_cache and _collection_cache_time >= m_time:
        return _collection_cache

    # 2. Si no tenemos caché en memoria pero existe en disco, cargarla de inmediato (< 5ms)
    if not _collection_cache and os.path.exists(COLLECTION_CACHE_FILE):
        try:
            with open(COLLECTION_CACHE_FILE, "r", encoding="utf-8") as f:
                disk_cache = json.load(f)
                if disk_cache and disk_cache.get("series"):
                    _collection_cache = disk_cache
                    _collection_cache_time = max(os.path.getmtime(COLLECTION_CACHE_FILE), time.time())
                    if os.path.getmtime(COLLECTION_CACHE_FILE) < m_time:
                        threading.Thread(target=build_and_cache_collection, args=(True, "¡Biblioteca actualizada!"), daemon=True).start()
                    return _collection_cache
        except Exception:
            pass

    # 3. Si tenemos caché en memoria pero el marcador cambió, servir la actual y reconstruir en background
    if _collection_cache:
        threading.Thread(target=build_and_cache_collection, args=(True, "¡Biblioteca actualizada!"), daemon=True).start()
        return _collection_cache

    # 4. Caso inicial sin caché en disco: construir síncronamente una sola vez
    return build_and_cache_collection()

@app.post("/api/local/collection/refresh")
def refresh_collection():
    """Fuerza un reescaneo completo y avisa inmediatamente a todos los clientes web."""
    trigger_collection_update("¡Reescaneo manual de la biblioteca completado!")
    return {"status": "success", "message": "Actualización de biblioteca solicitada"}

def parse_local_anime_summary(anime_path: Path, cat_id: str, cat_label: str, parent_folder: str) -> Optional[dict]:
    video_exts = (".mp4", ".mkv", ".avi", ".webm")
    video_count = 0
    seasons_list = []

    try:
        with os.scandir(anime_path) as it:
            subdirs = []
            direct_vids = 0
            for entry in it:
                if entry.is_file():
                    if entry.name.lower().endswith(video_exts):
                        direct_vids += 1
                elif entry.is_dir() and not entry.name.startswith("."):
                    subdirs.append(entry)

            if subdirs:
                for s in sorted(subdirs, key=lambda x: x.name.lower()):
                    s_vids = 0
                    try:
                        with os.scandir(s.path) as it2:
                            for entry2 in it2:
                                if entry2.is_file() and entry2.name.lower().endswith(video_exts):
                                    s_vids += 1
                    except Exception:
                        pass
                    if s_vids > 0:
                        seasons_list.append({"name": s.name, "ep_count": s_vids})
                        video_count += s_vids

            if direct_vids > 0:
                if not seasons_list:
                    seasons_list.append({"name": "Temporada 1", "ep_count": direct_vids})
                video_count += direct_vids
    except Exception:
        pass

    if video_count == 0:
        return None

    # Leer tvshow.nfo si existe
    nfo_path = anime_path / "tvshow.nfo"
    title = anime_path.name
    original_title = ""
    plot = ""
    rating = ""
    year = ""
    genres = []
    studio = ""

    if nfo_path.exists():
        try:
            tree = ET.parse(nfo_path)
            root = tree.getroot()
            title = root.findtext("title") or title
            original_title = root.findtext("originaltitle") or ""
            plot = root.findtext("plot") or ""
            rating = root.findtext("rating") or ""
            year = root.findtext("year") or ""
            studio = root.findtext("studio") or ""
            genres = [g.text for g in root.findall("genre") if g.text]
        except Exception:
            pass

    rel_path = f"{parent_folder}/{anime_path.name}".strip("/")

    # Detectar carátulas existentes
    has_poster = (anime_path / "poster.jpg").exists() and (anime_path / "poster.jpg").stat().st_size > 1000
    has_backdrop = (anime_path / "fanart.jpg").exists() or (anime_path / "backdrop.jpg").exists()

    return {
        "id": f"{cat_id}__{re.sub(r'[^a-zA-Z0-9]', '_', anime_path.name)}",
        "name": title,
        "folder_name": anime_path.name,
        "original_title": original_title,
        "category_id": cat_id,
        "category_label": cat_label,
        "rel_path": rel_path,
        "plot": plot,
        "rating": rating,
        "year": year,
        "genres": genres,
        "studio": studio,
        "total_seasons": len(seasons_list) if seasons_list else 1,
        "total_episodes": video_count,
        "seasons_summary": seasons_list,
        "has_poster": has_poster,
        "has_backdrop": has_backdrop or has_poster,
        "poster_url": f"/api/local/art?path={urllib.parse.quote(rel_path)}&type=poster",
        "backdrop_url": f"/api/local/art?path={urllib.parse.quote(rel_path)}&type=backdrop"
    }

def resolve_secure_path(base: Path, rel_path_str: str) -> Optional[Path]:
    if not rel_path_str:
        return None
    # Normalizar separadores y eliminar slashes iniciales
    clean = rel_path_str.replace("\\", "/").strip().lstrip("/")
    base_resolved = base.resolve()

    def is_safe(p: Path) -> bool:
        try:
            p.resolve().relative_to(base_resolved)
            return True
        except (ValueError, Exception):
            return False

    # 1. Probar ruta directa literal
    try:
        target = (base / clean).resolve()
        if is_safe(target) and target.exists():
            return target
    except Exception:
        pass

    # 2. Si contiene % o +, probar decodificando entidades URL
    if "%" in clean or "+" in clean:
        try:
            unquoted = urllib.parse.unquote_plus(clean)
            target = (base / unquoted).resolve()
            if is_safe(target) and target.exists():
                return target
        except Exception:
            pass
        if "%" in clean:
            try:
                unquoted_std = urllib.parse.unquote(clean)
                target = (base / unquoted_std).resolve()
                if is_safe(target) and target.exists():
                    return target
            except Exception:
                pass

    # 3. Probar buscando dentro de las subcarpetas de categorías conocidas
    category_subfolders = [
        "04 - Hentai (Sin Censura)",
        "01 - Erotico (Sin Censura)",
        "02 - Miniseries Adultas (AnimeFesta)",
        "03 - Heavy Ecchi (Sin Censura BD)"
    ]
    for cat in category_subfolders:
        try:
            target = (base / cat / clean).resolve()
            if is_safe(target) and target.exists():
                return target
        except Exception:
            pass
        if "%" in clean or "+" in clean:
            try:
                unquoted = urllib.parse.unquote_plus(clean)
                target = (base / cat / unquoted).resolve()
                if is_safe(target) and target.exists():
                    return target
            except Exception:
                pass

    # 4. Retornar si es ruta relativa segura aunque no exista en disco
    try:
        target = (base / clean).resolve()
        if is_safe(target):
            return target
    except Exception:
        pass
    return None

def extract_ep_info(filename: str, fallback_idx: int):
    # Eliminar extensiones
    name_no_ext = re.sub(r'\.(mp4|mkv|avi|webm|ts|mov)$', '', filename, flags=re.I)
    # Limpiar corchetes y paréntesis (grupos fansub, codecs, hashes CRC)
    name_clean = re.sub(r'\[.*?\]|\(.*?\)', ' ', name_no_ext)

    # Limpiar metadatos técnicos y porcentajes para evitar falsos positivos en numeración
    name_clean = re.sub(r'\b(?:2160p|1080p|720p|480p|360p|576p|4k)\b', ' ', name_clean, flags=re.I)
    name_clean = re.sub(r'\b\d+(?:fps|bit)\b', ' ', name_clean, flags=re.I)
    name_clean = re.sub(r'\b\d+%\b', ' ', name_clean)
    name_clean = re.sub(r'\b(?:5\.1|7\.1|2\.0)(?:ch)?\b', ' ', name_clean, flags=re.I)
    name_clean = re.sub(r'\b(?:x264|x265|h264|h265|hevc|hi10p|avc|flac|aac|opus)\b', ' ', name_clean, flags=re.I)

    ep_type = "Capítulo"
    if re.search(r'\bOVA\b', name_clean, re.I):
        ep_type = "OVA"
    elif re.search(r'\bEspecial\b|\bSpecial\b', name_clean, re.I):
        ep_type = "Especial"
    elif re.search(r'\bPel[ií\ufffd]cula\b|\bMovie\b', name_clean, re.I):
        ep_type = "Película"

    # 1. Full word markers
    m = re.search(r'\b(?:Episodio|Capitulo|Episode|Cap|Especial|Special|OVA)\s*[-_.]?\s*0*(\d+)\b', name_clean, re.I)
    if m:
        num = int(m.group(1))
        return num, ep_type, f"{ep_type} {num:02d}"

    # 2. Season/Episode pattern like S01E05 or S1E5 or E05 or E5
    m2 = re.search(r'\b(?:S\d+\s*)?E0*(\d+)\b', name_clean, re.I)
    if m2:
        num = int(m2.group(1))
        return num, ep_type, f"{ep_type} {num:02d}"

    # 3. Pattern 1x04 (Season x Episode)
    m_x = re.search(r'\b\d+x0*(\d+)\b', name_clean, re.I)
    if m_x:
        num = int(m_x.group(1))
        return num, ep_type, f"{ep_type} {num:02d}"

    # 4. Pattern: - 01 or #01 or _01
    m3 = re.search(r'[-#_]\s*0*(\d+)(?:\s*v\d+)?(?:\s*[-_.]|\s*$)', name_clean, re.I)
    if m3:
        num = int(m3.group(1))
        return num, ep_type, f"{ep_type} {num:02d}"

    # 5. Standalone numbers excluding resolutions/codecs (permitiendo episodio 100)
    candidates = re.findall(r'\b0*(\d{1,3})\b', name_clean)
    if candidates:
        valid = [int(c) for c in candidates if int(c) not in (1080, 720, 480, 264, 265, 360, 576, 2160)]
        if valid:
            num = valid[-1]
            return num, ep_type, f"{ep_type} {num:02d}"

    return fallback_idx, ep_type, f"{ep_type} {fallback_idx:02d}"

@app.get("/api/local/anime/details")
def get_local_anime_details(path: str = Query(..., description="Ruta relativa del anime")):
    lib_path = get_library_root()
    anime_path = resolve_secure_path(lib_path, path)
    if not anime_path or not anime_path.exists() or not anime_path.is_dir():
        raise HTTPException(status_code=404, detail="Carpeta del anime no encontrada")

    # Leer metadatos NFO
    nfo_path = anime_path / "tvshow.nfo"
    title = anime_path.name
    original_title = ""
    plot = ""
    rating = ""
    year = ""
    genres = []
    studio = ""

    if nfo_path.exists():
        try:
            tree = ET.parse(nfo_path)
            root = tree.getroot()
            title = root.findtext("title") or title
            original_title = root.findtext("originaltitle") or ""
            plot = root.findtext("plot") or ""
            rating = root.findtext("rating") or ""
            year = root.findtext("year") or ""
            studio = root.findtext("studio") or ""
            genres = [g.text for g in root.findall("genre") if g.text]
        except Exception:
            pass

    # Agrupar por temporadas
    seasons_data = []
    subdirs = [d for d in sorted(anime_path.iterdir()) if d.is_dir() and not d.name.startswith(".")]

    def build_episode_item(f: Path, fallback_idx: int) -> dict:
        ep_num, ep_type, ep_title = extract_ep_info(f.name, fallback_idx)
        size_mb = round(f.stat().st_size / (1024 * 1024), 1)
        try:
            rel_file = str(f.resolve().relative_to(lib_path.resolve())).replace("\\", "/")
        except Exception:
            rel_file = str(os.path.relpath(f, lib_path)).replace("\\", "/")

        fn_l = f.name.lower()
        quality = "1080p BD Master"
        if "2160p" in fn_l or "4k" in fn_l:
            quality = "4K Ultra HD"
        elif "1080p" in fn_l:
            quality = "1080p Full HD"
        elif "720p" in fn_l:
            quality = "720p HD"
        elif "480p" in fn_l:
            quality = "480p SD"
        if "bd" in fn_l or "bluray" in fn_l or "blu-ray" in fn_l:
            if "BD" not in quality:
                quality += " BD"

        return {
            "episode_number": ep_num,
            "episode_type": ep_type,
            "title": ep_title,
            "display_title": ep_title,
            "filename": f.name,
            "size_mb": size_mb,
            "quality": quality,
            "rel_file_path": rel_file,
            "thumb_url": f"/api/local/art?path={urllib.parse.quote(rel_file)}&type=episode",
            "stream_url": f"/api/local/stream?file={urllib.parse.quote(rel_file)}"
        }

    def season_sort_key(s_dir: Path):
        s_name = s_dir.name
        m = re.search(r'\b(?:Temporada|Season|S)\s*0*(\d+)(?:\s*[-_.]?\s*(?:Parte|Part)\s*(\d+))?', s_name, re.I)
        if m:
            s_num = int(m.group(1))
            part = int(m.group(2)) if m.group(2) else 0
            return (0, s_num, part, s_name.lower())
        if re.search(r'Pel[ií\ufffd]cula|Movie', s_name, re.I):
            return (3, 0, 0, s_name.lower())
        if re.search(r'OVA|Especial|Special|Extra', s_name, re.I):
            return (2, 0, 0, s_name.lower())
        return (1, 0, 0, s_name.lower())

    supported_video_exts = (".mp4", ".mkv", ".avi", ".webm", ".ts", ".mov")

    if subdirs:
        sorted_subdirs = sorted(subdirs, key=season_sort_key)
        for s_dir in sorted_subdirs:
            files = sorted([f for f in s_dir.glob("*") if f.suffix.lower() in supported_video_exts], key=natural_sort_key)
            if files:
                episodes = [build_episode_item(f, ep_idx) for ep_idx, f in enumerate(files, 1)]
                episodes.sort(key=lambda x: x["episode_number"])
                seasons_data.append({
                    "season_name": s_dir.name,
                    "season_number": len(seasons_data) + 1,
                    "episodes": episodes
                })

    if not seasons_data:
        files = sorted([f for f in anime_path.glob("*") if f.suffix.lower() in supported_video_exts], key=natural_sort_key)
        if files:
            episodes = [build_episode_item(f, ep_idx) for ep_idx, f in enumerate(files, 1)]
            episodes.sort(key=lambda x: x["episode_number"])
            seasons_data.append({
                "season_name": "Temporada 1",
                "season_number": 1,
                "episodes": episodes
            })

    return {
        "title": title,
        "folder_name": anime_path.name,
        "original_title": original_title,
        "plot": plot,
        "rating": rating,
        "year": year,
        "genres": genres,
        "studio": studio,
        "rel_path": path,
        "poster_url": f"/api/local/art?path={urllib.parse.quote(path)}&type=poster",
        "backdrop_url": f"/api/local/art?path={urllib.parse.quote(path)}&type=backdrop",
        "seasons": seasons_data
    }

@app.api_route("/api/local/art", methods=["GET", "HEAD"])
def get_local_art(
    request: Request,
    path: str = Query(...),
    type: str = Query("poster"),
    if_none_match: Optional[str] = Header(None, alias="if-none-match")
):
    lib_path = get_library_root()
    anime_path = resolve_secure_path(lib_path, path)

    def serve_image(p: Path):
        try:
            st = p.stat()
            etag = f'"{int(st.st_mtime)}-{st.st_size}"'
            if if_none_match:
                inm = if_none_match.strip()
                if inm.startswith("W/"):
                    inm = inm[2:]
                if inm in (etag, f'"{int(st.st_mtime)}-{st.st_size}"', "*"):
                    return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600"})
            mime_type, _ = mimetypes.guess_type(str(p))
            if not mime_type:
                ext = p.suffix.lower()
                mime_type = "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/jpeg"
            headers = {
                "ETag": etag,
                "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
                "Content-Length": str(st.st_size),
                "Content-Type": mime_type,
                "Access-Control-Allow-Origin": "*"
            }
            if request.method == "HEAD":
                return Response(status_code=200, headers=headers)
            return FileResponse(
                p,
                media_type=mime_type,
                headers=headers
            )
        except Exception:
            return None

    file_map = {
        "poster": ["poster.jpg", "folder.jpg", "cover.jpg", "poster.png", "poster.webp"],
        "backdrop": ["backdrop.jpg", "fanart.jpg", "banner.jpg", "poster.jpg"],
        "fanart": ["fanart.jpg", "backdrop.jpg", "poster.jpg"],
        "episode": ["thumb.jpg", "fanart.jpg", "backdrop.jpg", "poster.jpg"]
    }

    target_files = file_map.get(type, ["poster.jpg"])

    if anime_path and anime_path.exists():
        # 1. Si anime_path es un archivo de video (para miniaturas de episodios)
        if anime_path.is_file():
            # Buscar miniatura estándar de episodio (<nombre>-thumb.jpg)
            for thumb_candidate in [
                anime_path.parent / f"{anime_path.stem}-thumb.jpg",
                anime_path.parent / f"{anime_path.stem}-thumb.png",
                anime_path.parent / f"{anime_path.stem}.jpg"
            ]:
                if thumb_candidate.exists() and thumb_candidate.stat().st_size > 100:
                    resp = serve_image(thumb_candidate)
                    if resp:
                        return resp

            # Extraer miniatura del episodio on-the-fly con FFmpeg
            try:
                from src.metadata.thumbnail_generator import extract_episode_thumbnail
                extracted = extract_episode_thumbnail(anime_path)
                if extracted and extracted.exists() and extracted.stat().st_size > 100:
                    resp = serve_image(extracted)
                    if resp:
                        return resp
            except Exception as e_th:
                print(f"Aviso generando thumbnail de episodio para {anime_path.name}: {e_th}")

            # Fallback al fanart/poster de la serie padre
            parent_dir = anime_path.parent
            if parent_dir.name.lower().startswith(("temporada", "season")):
                parent_dir = parent_dir.parent
            for tf in ["fanart.jpg", "backdrop.jpg", "poster.jpg"]:
                p = parent_dir / tf
                if p.exists() and p.is_file() and p.stat().st_size > 100:
                    resp = serve_image(p)
                    if resp:
                        return resp

        # 2. Si anime_path es un directorio
        if anime_path.is_dir():
            # Buscar archivo de imagen existente
            for tf in target_files:
                p = anime_path / tf
                if p.exists() and p.is_file() and p.stat().st_size > 1000:
                    resp = serve_image(p)
                    if resp:
                        return resp

            # Buscar en directorio padre si anime_path es una subcarpeta de temporada
            parent_dir = anime_path.parent
            if parent_dir != lib_path and parent_dir.exists():
                for tf in target_files:
                    p = parent_dir / tf
                    if p.exists() and p.is_file() and p.stat().st_size > 1000:
                        resp = serve_image(p)
                        if resp:
                            return resp

            # Generar dinámicamente ON-THE-FLY con FFmpeg
            try:
                from src.metadata.thumbnail_generator import extract_thumbnails_for_series
                series_dir = anime_path
                if series_dir.name.lower().startswith(("temporada", "season")):
                    series_dir = series_dir.parent
                res = extract_thumbnails_for_series(series_dir)
                target_out = None
                if type in ("poster", "cover"):
                    target_out = res.get("poster") or res.get("fanart")
                else:
                    target_out = res.get("fanart") or res.get("poster")
                if target_out and target_out.exists() and target_out.stat().st_size > 1000:
                    resp = serve_image(target_out)
                    if resp:
                        return resp
            except Exception as e_dyn:
                print(f"Aviso extrayendo miniaturas dinámicas para {anime_path.name}: {e_dyn}")

    # SVG Placeholder elegante con proporción adecuada y escape XML estricto
    title_name = anime_path.name if anime_path else "Anime"
    escaped_title = xml.sax.saxutils.escape(title_name[:32])
    initial = xml.sax.saxutils.escape((title_name[0] if title_name else "A").upper())

    is_landscape = type in ("backdrop", "fanart", "episode")
    if is_landscape:
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
        <defs>
            <linearGradient id="artGradLand" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#141926"/>
                <stop offset="100%" stop-color="#090c13"/>
            </linearGradient>
        </defs>
        <rect width="640" height="360" fill="url(#artGradLand)"/>
        <circle cx="320" cy="145" r="50" fill="#ff477e" opacity="0.18"/>
        <text x="320" y="163" font-family="'Space Grotesk', Arial, sans-serif" font-size="50" font-weight="bold" fill="#ff477e" text-anchor="middle">{initial}</text>
        <text x="320" y="235" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="16" font-weight="700" fill="#e2e8f0" text-anchor="middle">{escaped_title}</text>
        <text x="320" y="260" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="12" fill="#64748b" text-anchor="middle">1080p Blu-ray Master</text>
    </svg>"""
    else:
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
        <defs>
            <linearGradient id="artGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#161b2a"/>
                <stop offset="100%" stop-color="#0a0d14"/>
            </linearGradient>
        </defs>
        <rect width="300" height="450" fill="url(#artGrad)"/>
        <circle cx="150" cy="190" r="55" fill="#ff477e" opacity="0.18"/>
        <text x="150" y="210" font-family="'Space Grotesk', Arial, sans-serif" font-size="56" font-weight="bold" fill="#ff477e" text-anchor="middle">{initial}</text>
        <text x="150" y="280" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="13" font-weight="600" fill="#94a3b8" text-anchor="middle">{escaped_title}</text>
        <text x="150" y="302" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="11" fill="#475569" text-anchor="middle">1080p Blu-ray Master</text>
    </svg>"""

    svg_bytes = svg.encode("utf-8")
    svg_headers = {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=600",
        "X-Is-Placeholder": "1",
        "Content-Length": str(len(svg_bytes)),
        "Content-Type": "image/svg+xml",
        "Access-Control-Allow-Origin": "*"
    }
    if request.method == "HEAD":
        return Response(status_code=200, headers=svg_headers)
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers=svg_headers
    )

@app.api_route("/api/local/stream", methods=["GET", "HEAD"])
async def stream_local_video(request: Request, file: str = Query(..., description="Ruta relativa al archivo de video"), range: Optional[str] = Header(None)):
    """
    Streaming HTTP 206 Partial Content con soporte completo y estricto de RFC 7233 Range requests.
    Soporta métodos GET y HEAD, rangos normales (bytes=0-1024), abiertos (bytes=100-), sufijos (bytes=-500) y de gran escala.
    Permite rebobinar, adelantar y reproducir al instante sin buffering previo ni errores 416.
    """
    lib_path = get_library_root()
    video_path = resolve_secure_path(lib_path, file)

    if not video_path or not video_path.exists() or not video_path.is_file():
        raise HTTPException(status_code=404, detail="Archivo de video no encontrado")

    file_size = video_path.stat().st_size
    mime_type, _ = mimetypes.guess_type(str(video_path))
    if not mime_type or not mime_type.startswith("video/"):
        ext = video_path.suffix.lower()
        if ext == ".mkv":
            mime_type = "video/x-matroska"
        elif ext == ".webm":
            mime_type = "video/webm"
        elif ext in (".mp4", ".m4v"):
            mime_type = "video/mp4"
        elif ext == ".ts":
            mime_type = "video/mp2t"
        elif ext == ".mov":
            mime_type = "video/quicktime"
        else:
            mime_type = "video/mp4"

    start = 0
    end = file_size - 1
    is_range = False

    if range and "bytes" in range.lower():
        range_str = range.strip()
        m_suffix = re.match(r"^bytes\s*=\s*-\s*(\d+)$", range_str, re.I)
        m_full = re.match(r"^bytes\s*=\s*(\d+)\s*-\s*(\d*)$", range_str, re.I)

        if m_suffix:
            suffix_len = int(m_suffix.group(1))
            if suffix_len > 0:
                start = max(0, file_size - suffix_len)
                end = file_size - 1
                is_range = True
        elif m_full:
            start = int(m_full.group(1))
            if m_full.group(2):
                requested_end = int(m_full.group(2))
                # RFC 7233 Section 2.1: si requested_end >= file_size, se trunca a file_size - 1
                end = min(requested_end, file_size - 1)
            else:
                end = file_size - 1
            is_range = True

    if is_range:
        if file_size == 0 or start >= file_size or start > end or start < 0:
            raise HTTPException(
                status_code=416,
                detail="Rango solicitado no satisfactorio",
                headers={
                    "Content-Range": f"bytes */{file_size}",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, Content-Type"
                }
            )

        content_length = (end - start) + 1

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": mime_type,
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, Content-Type"
        }
        if request.method == "HEAD":
            return Response(status_code=206, headers=headers)

        def iter_file():
            with open(video_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                chunk_size = 512 * 1024  # Chunks de 512 KB
                while remaining > 0:
                    read_amount = min(chunk_size, remaining)
                    data = f.read(read_amount)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(iter_file(), status_code=206, headers=headers)
    else:
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": mime_type,
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, Content-Type"
        }
        if request.method == "HEAD":
            return Response(status_code=200, headers=headers)

        def iter_full():
            with open(video_path, "rb") as f:
                chunk_size = 512 * 1024
                while True:
                    data = f.read(chunk_size)
                    if not data:
                        break
                    yield data

        return StreamingResponse(iter_full(), status_code=200, headers=headers)

class ProgressPayload(BaseModel):
    anime_rel_path: str
    season_number: int
    episode_number: int
    current_time: float
    duration: float
    episode_title: Optional[str] = ""

_progress_lock = threading.Lock()

@app.get("/api/local/progress")
def get_watch_progress():
    with _progress_lock:
        if os.path.exists(PROGRESS_FILE):
            try:
                with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

@app.post("/api/local/progress")
async def save_watch_progress(request: Request):
    try:
        body = await request.body()
        if not body:
            return {"status": "ignored", "detail": "Empty body"}
        payload_dict = json.loads(body.decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid payload format: {e}")

    anime_rel_path = str(payload_dict.get("anime_rel_path") or "").strip()
    if not anime_rel_path:
        raise HTTPException(status_code=422, detail="anime_rel_path is required")

    try:
        season_number = int(payload_dict.get("season_number", 1))
        episode_number = int(payload_dict.get("episode_number", 1))
        current_time = float(payload_dict.get("current_time", 0.0))
        duration = float(payload_dict.get("duration", 0.0))
        episode_title = str(payload_dict.get("episode_title") or "")
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid field types: {e}")

    with _progress_lock:
        data = {}
        if os.path.exists(PROGRESS_FILE):
            try:
                with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                data = {}

        key = anime_rel_path.replace("\\", "/").strip().lstrip("/")
        data[key] = {
            "season_number": season_number,
            "episode_number": episode_number,
            "current_time": current_time,
            "duration": duration,
            "percent": round((current_time / max(1.0, duration)) * 100, 1),
            "episode_title": episode_title,
            "updated_at": time.time()
        }

        try:
            tmp_prog = PROGRESS_FILE + ".tmp"
            with open(tmp_prog, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            try:
                if os.path.exists(PROGRESS_FILE):
                    os.replace(tmp_prog, PROGRESS_FILE)
                else:
                    os.rename(tmp_prog, PROGRESS_FILE)
            except Exception:
                shutil.copy2(tmp_prog, PROGRESS_FILE)
                try:
                    os.unlink(tmp_prog)
                except Exception:
                    pass
            return {"status": "success"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

# ==================== ENDPOINTS DEL PORTAL MULTI-PROVEEDOR ====================

class PortalDownloadRequest(BaseModel):
    anime_name: str
    episode_number: str
    season_folder: Optional[str] = "Temporada 1"
    aliases: Optional[List[str]] = None

@app.get("/api/portal/providers")
def get_portal_providers(check_health: bool = Query(False)):
    """Lista todos los proveedores de descarga disponibles y su salud/latencia."""
    if check_health:
        health = portal_instance.check_providers_health()
        return JSONResponse(content={"providers": health})
    return JSONResponse(content={"providers": portal_instance.get_providers_info()})

@app.get("/api/portal/search")
def search_portal(q: str = Query(..., min_length=1)):
    """Búsqueda concurrente en todos los portales de anime."""
    results = portal_instance.search_all_providers(q)
    return JSONResponse(content=results)

@app.get("/api/portal/candidates")
def get_episode_candidates(anime: str = Query(...), episode: str = Query(...)):
    """Retorna todos los enlaces y servidores disponibles ordenados por velocidad y estabilidad."""
    candidates = portal_instance.resolve_all_candidates(anime, episode)
    cands_data = [
        {
            "source": c.source,
            "download_url": c.download_url,
            "quality": c.quality,
            "is_direct_link": c.is_direct_link,
            "mirror_name": getattr(c, "mirror_name", "")
        }
        for c in candidates
    ]
    return JSONResponse(content={"anime": anime, "episode": episode, "total": len(candidates), "candidates": cands_data})

@app.post("/api/portal/download")
def download_portal_episode(req: PortalDownloadRequest, background_tasks: BackgroundTasks):
    """Inicia la descarga de un episodio con auto-failover y vigilancia de velocidad."""
    library_path = Path("E:/Anime")
    target_dir = library_path / req.anime_name / (req.season_folder or "Temporada 1")

    def _task():
        portal_instance.download_episode_with_failover(
            anime_name=req.anime_name,
            episode_number=req.episode_number,
            target_dir=target_dir,
            search_titles=req.aliases
        )

    background_tasks.add_task(_task)
    return JSONResponse(content={"status": "started", "anime": req.anime_name, "episode": req.episode_number, "target_dir": str(target_dir)})

@app.post("/api/portal/fill-missing")
def fill_missing_census_endpoint(background_tasks: BackgroundTasks):
    """Inicia en segundo plano la descarga de los episodios faltantes documentados."""
    from acquire import run_fill_missing
    background_tasks.add_task(run_fill_missing)
    return JSONResponse(content={"status": "started", "message": "Proceso de llenado de huecos iniciado en segundo plano."})

@app.get("/api/portal/stats")
def get_portal_stats():
    """Retorna estadísticas operativas de intentos, éxitos y conmutaciones por failover."""
    return JSONResponse(content=portal_instance.stats)

# ==================== ENTREGA Y DESCARGA DIRECTA DE APK A DISPOSITIVOS ====================

@app.get("/descargar")
@app.get("/apk")
@app.get("/descargar/apk")
def download_app_apk():
    """Endpoint de entrega directa del instalador APK para móviles y Smart TVs Android."""
    candidate_paths = [
        Path(static_dir) / "NyAnime_TV.apk",
        Path(BASE_DIR) / "backend" / "build_versions" / "v2.4.0" / "NyAnime_TV_v2.4.0.apk",
        Path("C:/Users/gonza/OneDrive/Escritorio/NyAnime_TV_v2.4.0.apk"),
        Path(BASE_DIR) / "backend" / "build_versions" / "v2.3.0_deep_cinema" / "NyAnime_TV_v2.3.0.apk",
        Path("C:/Users/gonza/OneDrive/Escritorio/NyAnime_TV_v2.3.0.apk"),
    ]
    for p in candidate_paths:
        if p.exists() and p.is_file() and p.stat().st_size > 1000000:
            return FileResponse(
                path=str(p),
                filename="NyAnime_TV_v2.4.0.apk",
                media_type="application/vnd.android.package-archive",
                headers={
                    "Content-Disposition": "attachment; filename=\"NyAnime_TV_v2.4.0.apk\"",
                    "Cache-Control": "no-cache"
                }
            )
    raise HTTPException(status_code=404, detail="El paquete APK no está disponible actualmente en el servidor.")


