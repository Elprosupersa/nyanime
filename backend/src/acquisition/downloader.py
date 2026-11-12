import os
import re
import sys
import json
import time
import shutil
import logging
import subprocess
from typing import Optional, Dict, Any
from .plugins.base import EpisodeResult

logger = logging.getLogger("AcquisitionDownloader")

class Downloader:
    # Umbrales calibrados para saturación de red (+200 Mbps) y auto-failover inteligente:
    # Si la velocidad cae por debajo de 1.25 MB/s (10 Mbps), es un enlace congelado/muerto -> Failover
    # Si la velocidad está entre 1.25 y 7.5 MB/s (10 a 60 Mbps), se permite completar si avanza
    MIN_DEAD_SPEED_THRESHOLD_MB = 1.25 # 10 Mbps
    SPEED_WATCHDOG_GRACE_PERIOD = 15.0 # segundos iniciales de rampa de conexión
    SPEED_WATCHDOG_STALL_TIMEOUT = 18.0 # segundos tolerados a velocidad congelada (<10 Mbps) antes de conmutar

    def __init__(self, download_dir: str):
        self.download_dir = download_dir

    def _auto_generate_thumbnails(self, video_file: str):
        try:
            from pathlib import Path
            from src.metadata.thumbnail_generator import extract_thumbnails_for_series, extract_episode_thumbnail, notify_collection_updated
            vid_p = Path(video_file)
            parent = vid_p.parent
            if parent.name.lower().startswith(("temporada", "season")):
                series_dir = parent.parent
            else:
                series_dir = parent
            extract_thumbnails_for_series(series_dir)
            extract_episode_thumbnail(vid_p)
            notify_collection_updated()
        except Exception as e:
            logger.debug(f"Aviso generando miniaturas post-descarga: {e}")

    def _parse_speed_mb(self, speed_str: str) -> float:
        """Convierte cadenas de velocidad como '15.4MiB/s', '800KiB/s', '25MB/s' a MB/s float."""
        if not speed_str:
            return 0.0
        s = speed_str.lower().strip()
        m = re.search(r'([\d\.]+)\s*([a-z\/]+)', s)
        if not m:
            return 0.0
        val = float(m.group(1))
        unit = m.group(2)
        if 'gbit' in unit or 'gbps' in unit:
            return (val * 1024.0) / 8.0
        elif 'gib' in unit or 'gb' in unit:
            return val * 1024.0
        elif 'mbit' in unit or 'mbps' in unit:
            return val / 8.0
        elif 'mib' in unit or 'mb' in unit:
            return val
        elif 'kbit' in unit or 'kbps' in unit:
            return val / (1024.0 * 8.0)
        elif 'kib' in unit or 'kb' in unit:
            return val / 1024.0
        return 0.0

    def download(self, result: EpisodeResult) -> bool:
        """
        Descarga un episodio en el directorio especificado con saturación de enlace (+200 Mbps),
        vigilancia de velocidad (Speed Watchdog) y auto-failover si la velocidad cae < 60 Mbps.
        Retorna True si fue exitoso, False si falló o conmutó por failover.
        """
        safe_anime_name = "".join([c for c in result.anime_name if c.isalpha() or c.isdigit() or c == ' ']).rstrip()
        filename_base = f"{safe_anime_name} - Episodio {result.episode_number}"
        
        final_path = os.path.join(self.download_dir, f"{filename_base}.mp4")
        part_path = final_path + ".part"

        # 1. Verificación directa de existencia en disco
        if os.path.exists(final_path) and os.path.getsize(final_path) > 10000000:
            logger.info(f"El archivo ya existe físicamente en: {final_path} ({os.path.getsize(final_path)//(1024*1024)} MB)")
            return True

        # 2. Verificación inteligente de episodio en el directorio
        if os.path.exists(self.download_dir):
            from .utils import extract_episode_number
            try:
                target_ep_int = int(result.episode_number)
                for existing_file in os.listdir(self.download_dir):
                    if existing_file.endswith(('.mp4', '.mkv', '.avi')):
                        ep_found = extract_episode_number(existing_file)
                        if ep_found is not None and ep_found == target_ep_int:
                            existing_full_path = os.path.join(self.download_dir, existing_file)
                            if os.path.getsize(existing_full_path) > 10000000:
                                logger.info(f"El episodio {result.episode_number} ya existe físicamente en destino como '{existing_file}'.")
                                return True
            except ValueError:
                pass

        logger.info(f"🚀 [ULTRA TURBO] Iniciando descarga de {filename_base} desde [{result.source}]...")
        os.makedirs(self.download_dir, exist_ok=True)

        if result.is_torrent:
            logger.error("Torrents aún no están implementados en el Downloader.")
            return False

        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        status_file = os.path.join(base_dir, "status.json")

        def update_status(msg, pct=0, spd=""):
            try:
                with open(status_file, "w", encoding="utf-8") as f:
                    json.dump({"message": msg, "percent": pct, "speed": spd, "source": result.source}, f)
            except Exception:
                pass

        update_status(f"Iniciando: {filename_base} ({result.source})")

        download_url = result.download_url
        req_headers = dict(result.headers or {})

        # Auto-resolución de servidores con enlaces directos (yourupload, mp4upload y streamhj)
        if "yourupload.com" in download_url:
            try:
                import requests
                s_yu = requests.Session()
                s_yu.headers.update({
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Referer": "https://www.yourupload.com/"
                })
                r_yu = s_yu.get(download_url, timeout=10)
                if r_yu.status_code == 200:
                    m_file = re.search(r'file\s*:\s*[\'"]([^\'"]+\.mp4[^\'"]*)[\'"]', r_yu.text)
                    if not m_file:
                        m_file = re.search(r'<meta property="og:video" content="([^"]+)"', r_yu.text)
                    if not m_file:
                        m_file = re.search(r'(https?://[^\s"\'<>]+\.mp4[^\s"\'<>]*)', r_yu.text)
                    if m_file:
                        cand_url = m_file.group(1)
                        if cand_url.startswith("http") and "novideo" not in cand_url.lower():
                            download_url = cand_url
                            req_headers["Referer"] = "https://www.yourupload.com/"
                            result.is_direct_link = True
                        else:
                            logger.warning(f"Enlace de yourupload apunta a video eliminado ({cand_url}).")
                            return False
            except Exception as e_yu:
                logger.warning(f"Aviso resolviendo enlace directo de yourupload: {e_yu}")

        if "mp4upload.com" in download_url:
            try:
                import requests
                s_mp = requests.Session()
                s_mp.headers.update({
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Referer": "https://www.mp4upload.com/"
                })
                r_mp = s_mp.get(download_url, timeout=10)
                if r_mp.status_code == 200:
                    m_mp = re.search(r'(https?://[^"\'\s]+/d/[^"\'\s]+/video\.mp4[^"\'\s]*)', r_mp.text)
                    if not m_mp:
                        m_mp = re.search(r'player\.src\(\{\s*type:\s*["\']video/mp4["\'],\s*src:\s*["\']([^"\']+)["\']', r_mp.text)
                    if not m_mp:
                        m_mp = re.search(r'src:\s*["\'](https?://[^"\'\s]+/d/[^"\'\s]+)["\']', r_mp.text)
                    if m_mp:
                        cand_mp4 = m_mp.group(1)
                        if cand_mp4.startswith("http"):
                            download_url = cand_mp4
                            req_headers["Referer"] = "https://www.mp4upload.com/"
                            result.is_direct_link = True
                    else:
                        logger.warning(f"mp4upload: No se localizó stream de video en {download_url} (posiblemente eliminado).")
                        return False
            except Exception as e_mp:
                logger.warning(f"Aviso resolviendo enlace directo de mp4upload: {e_mp}")
                return False

        if "multiplayer.streamhj.top" in download_url:
            try:
                import requests
                s_hj = requests.Session()
                s_hj.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
                r_hj = s_hj.get(download_url, timeout=10)
                if r_hj.status_code == 200:
                    m_st = re.search(r'(https?://streamtape\.com/[^\s"\'<>]+)', r_hj.text)
                    if m_st:
                        download_url = m_st.group(1).replace('&quot;', '').rstrip(')')
                    else:
                        m_fl = re.search(r'(https?://filelions\.[^\s"\'<>]+)', r_hj.text)
                        if m_fl:
                            download_url = m_fl.group(1).replace('&quot;', '').rstrip(')')
            except Exception as e_hj:
                logger.warning(f"Aviso resolviendo enlace de streamhj: {e_hj}")

        is_mega = "mega.nz" in download_url
        is_direct = result.is_direct_link or any(download_url.lower().split('?')[0].endswith(ext) for ext in ['.mp4', '.mkv', '.webm'])
        aria2c_bin = shutil.which("aria2c")
        yt_dlp_bin = shutil.which("yt-dlp")

        # Seleccionar método de descarga:
        # A) Mega -> mega_downloader.js (megajs)
        # B) Directo (Mediafire mp4, Mp4upload mp4, etc.) -> aria2c multihilo (-x 16 -s 16)
        # C) Streams / Embeds -> yt-dlp con multihilo (-N 16)
        process = None
        is_aria2c_mode = False

        try:
            if is_mega:
                mega_url = download_url.replace("/embed/", "/file/").replace("/#!", "/file/").replace("!", "#")
                mega_script = os.path.join(base_dir, "mega_downloader.js")
                cmd = ["node", mega_script, mega_url, part_path]
            elif is_direct and aria2c_bin:
                is_aria2c_mode = True
                temp_filename = os.path.basename(part_path)
                cmd = [
                    aria2c_bin,
                    "-s", "16",
                    "-x", "16",
                    "-k", "1M",
                    "-j", "16",
                    "--file-allocation=none",
                    "--summary-interval=1",
                    "--auto-file-renaming=false",
                    "--allow-overwrite=true",
                    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "-d", self.download_dir,
                    "-o", temp_filename,
                    download_url
                ]
                if req_headers:
                    for hk, hv in req_headers.items():
                        cmd.append(f"--header={hk}: {hv}")
                if "mp4upload.com" in download_url and not any("--header=Referer" in x for x in cmd):
                    cmd.append("--header=Referer: https://www.mp4upload.com/")
                elif ("yourupload.com" in download_url or "vidcache.net" in download_url) and not any("--header=Referer" in x for x in cmd):
                    cmd.append("--header=Referer: https://www.yourupload.com/")
            else:
                # yt-dlp con concurrencia máxima y headers anti-bloqueo
                cmd = [
                    yt_dlp_bin or sys.executable,
                ]
                if not yt_dlp_bin:
                    cmd.extend(["-m", "yt_dlp"])
                cmd.extend([
                    "--no-playlist",
                    "-N", "16",
                    "--buffer-size", "16M",
                    "--http-chunk-size", "10M",
                    "--concurrent-fragments", "16",
                    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                ])
                if req_headers and "Referer" in req_headers:
                    cmd.extend(["--referer", req_headers["Referer"]])
                elif "yourupload" in download_url:
                    cmd.extend(["--referer", "https://www.yourupload.com/"])
                elif "streamtape" in download_url:
                    cmd.extend(["--referer", "https://streamtape.com/"])
                elif "tioanime" in (result.source or "").lower():
                    cmd.extend(["--referer", "https://tioanime.com/"])
                else:
                    cmd.extend(["--referer", "https://jkanime.net/"])
                
                cmd.extend([
                    "-o", part_path,
                    download_url
                ])

            logger.info(f"Ejecutando comando: {' '.join(cmd[:6])}...")
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True
            )

            start_time = time.time()
            low_speed_start: Optional[float] = None
            last_speed_str = ""

            for line in process.stdout:
                line_str = line.strip()
                if not line_str:
                    continue

                pct: Optional[float] = None
                spd_str: str = ""

                # Parser para yt-dlp
                if "[download]" in line_str and "%" in line_str:
                    match_pct = re.search(r'([\d\.]+)%', line_str)
                    match_spd = re.search(r'at\s+([^\s]+)', line_str)
                    if match_pct:
                        pct = float(match_pct.group(1))
                    if match_spd:
                        spd_str = match_spd.group(1)

                # Parser para aria2c: [#4d909f 20MiB/132MiB(15%) CN:16 DL:20MiB ETA:9s]
                elif is_aria2c_mode and "(" in line_str and "DL:" in line_str:
                    match_pct = re.search(r'\((\d+)%\)', line_str)
                    match_spd = re.search(r'DL:([^\s\]]+)', line_str)
                    if match_pct:
                        pct = float(match_pct.group(1))
                    if match_spd:
                        spd_str = match_spd.group(1) + "/s"

                # Parser para megajs
                elif is_mega and "%" in line_str:
                    match_pct = re.search(r'([\d\.]+)%', line_str)
                    if match_pct:
                        pct = float(match_pct.group(1))

                if pct is not None or spd_str:
                    last_speed_str = spd_str
                    update_status(f"Descargando: {filename_base}", pct or 0, spd_str)

                # SPEED WATCHDOG: Vigilancia de velocidad mínima (+200 Mbps / Failover si < 10 Mbps)
                now = time.time()
                elapsed = now - start_time
                if elapsed > self.SPEED_WATCHDOG_GRACE_PERIOD and spd_str:
                    speed_mb = self._parse_speed_mb(spd_str)
                    # Umbral mínimo: 1.25 MB/s (10 Mbps). Si cae por debajo de 1.25 MB/s de forma sostenida, conmutar
                    if 0 < speed_mb < self.MIN_DEAD_SPEED_THRESHOLD_MB:
                        if low_speed_start is None:
                            low_speed_start = now
                        elif (now - low_speed_start) > self.SPEED_WATCHDOG_STALL_TIMEOUT:
                            logger.warning(
                                f"⚠️ [SPEED WATCHDOG] Velocidad congelada ({speed_mb:.1f} MB/s) por debajo de {self.MIN_DEAD_SPEED_THRESHOLD_MB} MB/s. "
                                f"Auto-Failover activado hacia el siguiente servidor..."
                            )
                            process.terminate()
                            try:
                                process.wait(timeout=3)
                            except Exception:
                                process.kill()
                            update_status("Auto-Failover por velocidad congelada (<10 Mbps)", 0, "")
                            self._cleanup_temp_files(part_path)
                            return False
                    else:
                        low_speed_start = None

            process.wait()

            if process.returncode == 0:
                # Comprobar archivo descargado
                actual_output = part_path if os.path.exists(part_path) else final_path
                if not os.path.exists(actual_output):
                    # Check in download_dir for temp part
                    temp_check = os.path.join(self.download_dir, f"{filename_base}.part")
                    if os.path.exists(temp_check):
                        actual_output = temp_check

                if os.path.exists(actual_output):
                    file_size = os.path.getsize(actual_output)
                    # Archivos menores a 10 MB se consideran corruptos o páginas de error 404
                    if file_size < 10000000:
                        logger.error(f"Archivo de descarga demasiado pequeño ({file_size} bytes, <10 MB). Error de servidor / link muerto. Descartando.")
                        self._cleanup_temp_files(actual_output)
                        update_status("Archivo corrupto/caído del servidor", 0, "")
                        return False

                    # Renombrar de .part a final_path de forma segura en Windows
                    if actual_output != final_path:
                        for attempt in range(6):
                            try:
                                time.sleep(0.3)
                                if os.path.exists(final_path):
                                    os.remove(final_path)
                                os.replace(actual_output, final_path)
                                break
                            except Exception:
                                time.sleep(0.5)

                    if os.path.exists(final_path) and os.path.getsize(final_path) >= 10000000:
                        mb_size = os.path.getsize(final_path) // (1024 * 1024)
                        logger.info(f"✅ [ÉXITO] Descarga completada: {final_path} ({mb_size} MB) a velocidad saturada.")
                        self._auto_generate_thumbnails(final_path)
                        update_status(f"Completado: {filename_base} ({mb_size} MB)", 100, last_speed_str)
                        return True

            logger.warning(f"Proceso de descarga finalizó con código {process.returncode} para {result.download_url}")
            self._cleanup_temp_files(part_path)
            update_status("Fallo en descarga, ejecutando auto-failover...", 0, "")
            return False

        except Exception as e:
            logger.error(f"Excepción grave durante la descarga: {e}")
            if process and process.poll() is None:
                try:
                    process.terminate()
                    process.wait(timeout=2)
                except Exception:
                    pass
            self._cleanup_temp_files(part_path)
            return False

    def _cleanup_temp_files(self, path: Optional[str]):
        if not path:
            return
        candidates = [
            path,
            path + ".aria2",
            path + ".part",
            path.replace(".mp4.part", ".part"),
            path.replace(".mp4.part", ".part.aria2"),
            path.replace(".part", "") + ".part"
        ]
        for p in candidates:
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass
