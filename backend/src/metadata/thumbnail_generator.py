import os
import re
import sys
import time
import shutil
import logging
import subprocess
import threading
import requests
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional, Dict, Any, List

# Reconfigurar stdout y stderr para soporte UTF-8 seguro en Windows
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

logger = logging.getLogger("ThumbnailGenerator")

# Locks por directorio para evitar colisiones y race conditions entre hilos
_dir_locks: Dict[str, threading.Lock] = {}
_global_lock = threading.Lock()

def _get_lock(key: str) -> threading.Lock:
    with _global_lock:
        if key not in _dir_locks:
            _dir_locks[key] = threading.Lock()
        return _dir_locks[key]

def safe_replace(src: Path, dst: Path, attempts: int = 6, delay: float = 0.25) -> bool:
    """Reemplazo de archivo seguro para Windows con reintentos para evitar WinError 32."""
    for _ in range(attempts):
        try:
            if dst.exists():
                try:
                    dst.unlink()
                except Exception:
                    pass
            src.replace(dst)
            return True
        except Exception:
            time.sleep(delay)
    # Fallback seguro mediante copy2
    try:
        shutil.copy2(src, dst)
        try:
            src.unlink()
        except Exception:
            pass
        return True
    except Exception as e:
        logger.warning(f"No se pudo reemplazar {src.name} a {dst.name}: {e}")
        return False

def get_video_duration(video_path: Path) -> Optional[float]:
    """Obtiene la duración en segundos de un archivo de video mediante ffprobe."""
    ffprobe_bin = shutil.which("ffprobe") or "ffprobe"
    try:
        cmd = [
            ffprobe_bin,
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(video_path)
        ]
        res = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        )
        if res.returncode == 0 and res.stdout.strip():
            return float(res.stdout.strip())
    except Exception as e:
        logger.debug(f"ffprobe falló al obtener duración para {video_path.name}: {e}")
    return None

def find_best_video(anime_dir: Path) -> Optional[Path]:
    """
    Busca el mejor archivo de video dentro de una carpeta de anime (preferentemente Ep 1 o primer video).
    Ignora archivos temporales (.part, .tmp).
    """
    if not anime_dir.exists() or not anime_dir.is_dir():
        return None

    video_exts = {".mp4", ".mkv", ".avi", ".webm"}
    all_videos: List[Path] = []
    
    try:
        for root, _, files in os.walk(anime_dir):
            for f in files:
                p = Path(root) / f
                if p.suffix.lower() in video_exts and not p.name.startswith(".") and ".part" not in p.name:
                    all_videos.append(p)
    except Exception as e:
        logger.warning(f"Error explorando videos en {anime_dir}: {e}")
        return None

    if not all_videos:
        return None

    # Ordenar priorizando Episodio 1 / Cap 1
    def video_rank(v: Path):
        name_lower = v.name.lower()
        # Buscar patrones de ep 1
        if re.search(r'\b(?:ep|episodio|cap|capitulo|e|0*1)\s*[-_.]?\s*0*1\b', name_lower):
            return (0, v.name.lower())
        # Extraer primer número
        nums = re.findall(r'\d+', name_lower)
        num_val = int(nums[0]) if nums else 999
        return (1, num_val, v.name.lower())

    all_videos.sort(key=video_rank)
    return all_videos[0]

def _fetch_online_cover(anime_dir: Path) -> Dict[str, Optional[Path]]:
    """Busca y descarga carátula oficial en AniList si la carpeta no contiene videos locales."""
    poster_path = anime_dir / "poster.jpg"
    fanart_path = anime_dir / "fanart.jpg"
    backdrop_path = anime_dir / "backdrop.jpg"

    if poster_path.exists() and poster_path.stat().st_size > 2000:
        return {
            "poster": poster_path,
            "fanart": fanart_path if fanart_path.exists() else backdrop_path if backdrop_path.exists() else None
        }

    title_query = anime_dir.name
    nfo_path = anime_dir / "tvshow.nfo"
    if nfo_path.exists():
        try:
            tree = ET.parse(nfo_path)
            root = tree.getroot()
            title_query = root.findtext("title") or root.findtext("originaltitle") or title_query
        except Exception:
            pass

    # Limpiar título para búsqueda efectiva
    clean_query = re.sub(r'\[.*?\]|\(.*?\)', ' ', title_query)
    clean_query = re.sub(r'[★☆→♡♥♪◆◇■□▲△▼▽#]', ' ', clean_query)
    clean_query = re.sub(r'\b(?:The Animation|OVA|BD|Sin Censura|1080p|720p)\b', ' ', clean_query, flags=re.I)
    clean_query = re.sub(r'\s+', ' ', clean_query).strip()
    if not clean_query:
        clean_query = anime_dir.name

    try:
        from src.metadata.resolver import AnimeMetadataResolver
        resolver = AnimeMetadataResolver()
        results = resolver.search_anilist(clean_query, limit=3)
        if not results:
            words = clean_query.split()[:3]
            if len(words) >= 1:
                results = resolver.search_anilist(" ".join(words), limit=3)

        if results:
            target = results[0]
            cover_data = target.get("coverImage") or {}
            cover_url = cover_data.get("extraLarge") or cover_data.get("large")
            banner_url = target.get("bannerImage")

            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            if cover_url and not poster_path.exists():
                tmp_p = anime_dir / "poster.tmp.jpg"
                r = requests.get(cover_url, headers=headers, timeout=12)
                if r.status_code == 200 and len(r.content) > 1000:
                    with open(tmp_p, "wb") as f:
                        f.write(r.content)
                    safe_replace(tmp_p, poster_path)
                    logger.info(f"🌐 Poster oficial descargado para '{anime_dir.name}' desde AniList")

            if banner_url and not fanart_path.exists() and not backdrop_path.exists():
                tmp_f = anime_dir / "fanart.tmp.jpg"
                r_b = requests.get(banner_url, headers=headers, timeout=12)
                if r_b.status_code == 200 and len(r_b.content) > 1000:
                    with open(tmp_f, "wb") as f:
                        f.write(r_b.content)
                    safe_replace(tmp_f, fanart_path)
                    logger.info(f"🌐 Fanart oficial descargado para '{anime_dir.name}' desde AniList")
    except Exception as e:
        logger.debug(f"Aviso en búsqueda online de arte para {anime_dir.name}: {e}")

    # Si se obtuvo poster pero no fanart, sincronizar fanart desde poster
    if poster_path.exists() and not fanart_path.exists() and not backdrop_path.exists():
        try:
            shutil.copy2(poster_path, fanart_path)
        except Exception:
            pass

    # Si no se pudo obtener portada online y no existe poster local, generar carátula estilizada PIL
    if not poster_path.exists() or poster_path.stat().st_size <= 1000:
        try:
            from PIL import Image, ImageDraw, ImageFont
            img = Image.new('RGB', (600, 900), color=(18, 22, 34))
            draw = ImageDraw.Draw(img)
            for y in range(900):
                r_c = int(18 + (35 - 18) * (y / 900))
                g_c = int(22 + (15 - 22) * (y / 900))
                b_c = int(34 + (45 - 34) * (y / 900))
                draw.line([(0, y), (600, y)], fill=(r_c, g_c, b_c))
            draw.rounded_rectangle([40, 40, 560, 860], radius=16, outline=(168, 85, 247, 80), width=2)
            draw.ellipse([230, 280, 370, 420], fill=(168, 85, 247, 40))
            initial = (title_query[0] if title_query else 'A').upper()
            try:
                font_large = ImageFont.truetype('arial.ttf', 72)
                font_title = ImageFont.truetype('arial.ttf', 24)
                font_sub = ImageFont.truetype('arial.ttf', 16)
            except Exception:
                font_large = font_title = font_sub = ImageFont.load_default()
            draw.text((300, 350), initial, fill=(168, 85, 247), font=font_large, anchor='mm')
            words = title_query.split()
            lines = []
            cur = ''
            for w in words:
                if len(cur + ' ' + w) < 28:
                    cur = (cur + ' ' + w).strip()
                else:
                    lines.append(cur)
                    cur = w
            if cur: lines.append(cur)
            start_y = 520
            for l in lines[:4]:
                draw.text((300, start_y), l, fill=(241, 245, 249), font=font_title, anchor='mm')
                start_y += 32
            draw.text((300, start_y + 30), 'ANIME • UNCENSORED MASTER', fill=(148, 163, 184), font=font_sub, anchor='mm')
            img.save(poster_path, 'JPEG', quality=90)
            if not fanart_path.exists() and not backdrop_path.exists():
                shutil.copy2(poster_path, fanart_path)
            logger.info(f"🎨 Portada estilizada generada para '{anime_dir.name}'")
        except Exception as e_pil:
            logger.debug(f"Aviso generando carátula estilizada PIL: {e_pil}")

    return {
        "poster": poster_path if poster_path.exists() and poster_path.stat().st_size > 1000 else None,
        "fanart": fanart_path if fanart_path.exists() and fanart_path.stat().st_size > 1000 else backdrop_path if backdrop_path.exists() and backdrop_path.stat().st_size > 1000 else None
    }

def extract_thumbnails_for_series(anime_dir: Path, force: bool = False) -> Dict[str, Optional[Path]]:
    """
    Genera poster.jpg (retrato 2:3) y fanart.jpg (16:9 cinemático) para una franquicia o serie completa.
    Retorna diccionario con las rutas de las imágenes generadas o existentes.
    """
    if not anime_dir.exists():
        return {"poster": None, "fanart": None}

    poster_path = anime_dir / "poster.jpg"
    fanart_path = anime_dir / "fanart.jpg"
    backdrop_path = anime_dir / "backdrop.jpg"

    has_poster = poster_path.exists() and poster_path.stat().st_size > 2000
    has_fanart = (fanart_path.exists() and fanart_path.stat().st_size > 2000) or (backdrop_path.exists() and backdrop_path.stat().st_size > 2000)

    if has_poster and has_fanart and not force:
        # Asegurar que el video principal tenga miniatura de episodio
        video_chk = find_best_video(anime_dir)
        if video_chk:
            th_chk = video_chk.parent / f"{video_chk.stem}-thumb.jpg"
            if not th_chk.exists() or th_chk.stat().st_size < 1000:
                try:
                    extract_episode_thumbnail(video_chk)
                except Exception:
                    pass
        return {
            "poster": poster_path,
            "fanart": fanart_path if fanart_path.exists() else backdrop_path
        }

    lock = _get_lock(str(anime_dir.resolve()))
    with lock:
        # Doble verificación dentro del lock
        has_poster = poster_path.exists() and poster_path.stat().st_size > 2000
        has_fanart = (fanart_path.exists() and fanart_path.stat().st_size > 2000) or (backdrop_path.exists() and backdrop_path.stat().st_size > 2000)
        if has_poster and has_fanart and not force:
            video_chk = find_best_video(anime_dir)
            if video_chk:
                th_chk = video_chk.parent / f"{video_chk.stem}-thumb.jpg"
                if not th_chk.exists() or th_chk.stat().st_size < 1000:
                    try:
                        extract_episode_thumbnail(video_chk)
                    except Exception:
                        pass
            return {
                "poster": poster_path,
                "fanart": fanart_path if fanart_path.exists() else backdrop_path
            }

        video = find_best_video(anime_dir)
        if not video:
            # Fallback inteligente online para carpetas sin videos locales
            online_res = _fetch_online_cover(anime_dir)
            if online_res.get("poster") or online_res.get("fanart"):
                notify_collection_updated()
                return online_res
            logger.debug(f"No se encontraron videos ni carátula online en {anime_dir.name} para generar miniaturas.")
            return {"poster": None, "fanart": None}

        ffmpeg_bin = shutil.which("ffmpeg") or "ffmpeg"
        
        # Calcular marca de tiempo óptima (~15% del metraje para evitar intros en negro o logos)
        duration = get_video_duration(video)
        if duration and duration > 10:
            target_time = max(2.0, min(duration * 0.15, 240.0))
        elif duration and duration > 0:
            target_time = max(1.0, duration * 0.5)
        else:
            target_time = 60.0  # 1 minuto por defecto

        time_str = f"{int(target_time // 3600):02d}:{int((target_time % 3600) // 60):02d}:{int(target_time % 60):02d}"

        # 1. Generar fanart.jpg (16:9 completo)
        if not has_fanart or force:
            tmp_fanart = anime_dir / "fanart.tmp.jpg"
            cmd_fanart = [
                ffmpeg_bin, "-y",
                "-ss", time_str,
                "-i", str(video),
                "-frames:v", "1",
                "-q:v", "2",
                str(tmp_fanart)
            ]
            try:
                res = subprocess.run(
                    cmd_fanart,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=15,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
                )
                if res.returncode != 0 or not tmp_fanart.exists() or tmp_fanart.stat().st_size < 1000:
                    # Fallback robusto a 2 segundos si el tiempo previo superó la duración
                    cmd_fallback = [
                        ffmpeg_bin, "-y",
                        "-ss", "00:00:02",
                        "-i", str(video),
                        "-frames:v", "1",
                        "-q:v", "2",
                        str(tmp_fanart)
                    ]
                    subprocess.run(
                        cmd_fallback,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        timeout=15,
                        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
                    )
                
                if tmp_fanart.exists() and tmp_fanart.stat().st_size > 1000:
                    if safe_replace(tmp_fanart, fanart_path):
                        logger.info(f"✨ Fanart generado para '{anime_dir.name}': {fanart_path.name}")
            except Exception as e:
                logger.warning(f"Error generando fanart para {anime_dir.name}: {e}")
                if tmp_fanart.exists():
                    try:
                        tmp_fanart.unlink()
                    except Exception:
                        pass

        # 2. Generar poster.jpg (retrato 2:3 vertical nítido y matemáticamente seguro)
        crop_filter = "crop=w='trunc(min(iw,ih*2/3)/2)*2':h='trunc(min(ih,iw*3/2)/2)*2':x='(iw-out_w)/2':y='(ih-out_h)/2'"
        if not has_poster or force:
            tmp_poster = anime_dir / "poster.tmp.jpg"
            cmd_poster = [
                ffmpeg_bin, "-y",
                "-ss", time_str,
                "-i", str(video),
                "-vf", crop_filter,
                "-frames:v", "1",
                "-q:v", "2",
                str(tmp_poster)
            ]
            try:
                res = subprocess.run(
                    cmd_poster,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=15,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
                )
                if res.returncode != 0 or not tmp_poster.exists() or tmp_poster.stat().st_size < 1000:
                    # Reintento con fallback a 2s
                    cmd_fallback = [
                        ffmpeg_bin, "-y",
                        "-ss", "00:00:02",
                        "-i", str(video),
                        "-vf", crop_filter,
                        "-frames:v", "1",
                        "-q:v", "2",
                        str(tmp_poster)
                    ]
                    subprocess.run(
                        cmd_fallback,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        timeout=15,
                        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
                    )

                if tmp_poster.exists() and tmp_poster.stat().st_size > 1000:
                    if safe_replace(tmp_poster, poster_path):
                        logger.info(f"🎨 Poster generado para '{anime_dir.name}': {poster_path.name}")
                elif fanart_path.exists() and fanart_path.stat().st_size > 1000:
                    # Si el crop falló, copiar fanart como poster para que nunca falte carátula
                    shutil.copy2(fanart_path, poster_path)
                    logger.info(f"🎨 Poster asignado desde fanart para '{anime_dir.name}'")
            except Exception as e:
                logger.warning(f"Error generando poster para {anime_dir.name}: {e}")
                if tmp_poster.exists():
                    try:
                        tmp_poster.unlink()
                    except Exception:
                        pass

        # 3. Generar también la miniatura dedicada para el video encontrado (Episodio 1)
        try:
            extract_episode_thumbnail(video, force=force)
        except Exception:
            pass

        notify_collection_updated()

        return {
            "poster": poster_path if poster_path.exists() else None,
            "fanart": fanart_path if fanart_path.exists() else backdrop_path if backdrop_path.exists() else None
        }

def notify_collection_updated():
    """Toca el marcador .collection_updated para alertar inmediatamente al servidor web y frontend."""
    try:
        marker = Path(__file__).resolve().parent.parent.parent / ".collection_updated"
        marker.touch()
        os.utime(str(marker), None)
    except Exception:
        pass

def extract_episode_thumbnail(video_path: Path, force: bool = False) -> Optional[Path]:
    """
    Genera una miniatura para un episodio individual compatible con estándares de Kodi / Plex (<video>-thumb.jpg).
    Escala a 640px de ancho para máxima nitidez y carga web ultrarrápida (~35KB).
    """
    if not video_path.exists() or not video_path.is_file():
        return None

    thumb_path = video_path.parent / f"{video_path.stem}-thumb.jpg"
    if thumb_path.exists() and thumb_path.stat().st_size > 1000 and not force:
        return thumb_path

    lock = _get_lock(str(video_path.resolve()))
    with lock:
        if thumb_path.exists() and thumb_path.stat().st_size > 1000 and not force:
            return thumb_path

        ffmpeg_bin = shutil.which("ffmpeg") or "ffmpeg"
        duration = get_video_duration(video_path)
        if duration and duration > 10:
            target_time = max(2.0, min(duration * 0.15, 180.0))
        elif duration and duration > 0:
            target_time = max(1.0, duration * 0.5)
        else:
            target_time = 45.0

        time_str = f"{int(target_time // 3600):02d}:{int((target_time % 3600) // 60):02d}:{int(target_time % 60):02d}"
        tmp_thumb = video_path.parent / f"{video_path.stem}.tmp.thumb.jpg"

        scale_filter = "scale='trunc(min(640,iw)/2)*2':-2"
        cmd = [
            ffmpeg_bin, "-y",
            "-ss", time_str,
            "-i", str(video_path),
            "-vf", scale_filter,
            "-frames:v", "1",
            "-q:v", "3",
            str(tmp_thumb)
        ]

        try:
            res = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=15,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            )
            if res.returncode != 0 or not tmp_thumb.exists() or tmp_thumb.stat().st_size < 1000:
                cmd_fb = [
                    ffmpeg_bin, "-y",
                    "-ss", "00:00:02",
                    "-i", str(video_path),
                    "-vf", scale_filter,
                    "-frames:v", "1",
                    "-q:v", "3",
                    str(tmp_thumb)
                ]
                subprocess.run(
                    cmd_fb,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=15,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
                )

            if tmp_thumb.exists() and tmp_thumb.stat().st_size > 1000:
                if safe_replace(tmp_thumb, thumb_path):
                    notify_collection_updated()
                    return thumb_path
        except Exception as e:
            logger.warning(f"Error generando thumbnail para {video_path.name}: {e}")
            if tmp_thumb.exists():
                try:
                    tmp_thumb.unlink()
                except Exception:
                    pass

    return None

def extract_all_episodes_in_series(anime_dir: Path, force: bool = False) -> int:
    """
    Extrae miniaturas de alta definición para todos los episodios dentro de una serie.
    Retorna el número de miniaturas generadas o existentes.
    """
    if not anime_dir.exists() or not anime_dir.is_dir():
        return 0

    video_exts = {".mp4", ".mkv", ".avi", ".webm"}
    videos = []
    for root, _, files in os.walk(anime_dir):
        for f in files:
            p = Path(root) / f
            if p.suffix.lower() in video_exts and not p.name.startswith(".") and ".part" not in p.name:
                videos.append(p)

    count = 0
    for v in videos:
        try:
            th = extract_episode_thumbnail(v, force=force)
            if th and th.exists() and th.stat().st_size > 1000:
                count += 1
        except Exception:
            pass
    return count
