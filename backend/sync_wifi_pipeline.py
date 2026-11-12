import os
import sys
import time
import shutil
import urllib.request
import json
from threading import Thread
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.stdout.reconfigure(encoding='utf-8')

print("====================================================================")
print("  PIPELINE DE TRANSFERENCIA WI-FI AUTOMÁTICA (SYNCTHING + LAN HTTP)")
print("====================================================================")

TARGET_DIR = r"E:\Anime\Para_Celular"
os.makedirs(TARGET_DIR, exist_ok=True)

# List of folders to copy into TARGET_DIR
ITEMS_TO_SYNC = [
    # (source_path, target_subpath)
    (
        r"E:\Anime\03 - Heavy Ecchi (Sin Censura BD)\Mahou Shoujo ni Akogarete",
        os.path.join(TARGET_DIR, "Mahou Shoujo ni Akogarete")
    ),
    (
        r"E:\Anime\03 - Heavy Ecchi (Sin Censura BD)\Prison School",
        os.path.join(TARGET_DIR, "Prison School")
    ),
    (
        r"E:\Anime\03 - Heavy Ecchi (Sin Censura BD)\Mato Seihei no Slave",
        os.path.join(TARGET_DIR, "Mato Seihei no Slave")
    ),
    (
        r"E:\Anime\03 - Heavy Ecchi (Sin Censura BD)\High School DxD",
        os.path.join(TARGET_DIR, "High School DxD")
    ),
    (
        r"E:\Anime\04 - Hentai (Sin Censura)\Mankitsu Happening",
        os.path.join(TARGET_DIR, "04 - Hentai", "Mankitsu Happening")
    ),
    (
        r"E:\Anime\04 - Hentai (Sin Censura)\Eroge! H mo Game mo Kaihatsu Zanmai",
        os.path.join(TARGET_DIR, "04 - Hentai", "Eroge! H mo Game mo Kaihatsu Zanmai")
    ),
    (
        r"E:\Anime\04 - Hentai (Sin Censura)\Rance 01 Hikari wo Motomete The Animation",
        os.path.join(TARGET_DIR, "04 - Hentai", "Rance 01 Hikari wo Motomete The Animation")
    ),
    (
        r"E:\Anime\04 - Hentai (Sin Censura)\Oni Chichi",
        os.path.join(TARGET_DIR, "04 - Hentai", "Oni Chichi")
    )
]

def copy_file_buffered(src, dst, buffer_size=16 * 1024 * 1024):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst) and os.path.getsize(dst) == os.path.getsize(src):
        return False # already exists
    with open(src, 'rb') as fsrc, open(dst, 'wb') as fdst:
        while True:
            buf = fsrc.read(buffer_size)
            if not buf:
                break
            fdst.write(buf)
    try:
        shutil.copystat(src, dst)
    except Exception:
        pass
    return True

print("[*] Iniciando preparación de archivos en carpeta de enlace Wi-Fi (E:\\Anime\\Para_Celular)...")

total_copied = 0
total_skipped = 0
start_time = time.time()

for src_dir, dst_dir in ITEMS_TO_SYNC:
    item_name = os.path.basename(dst_dir)
    print(f"\n--- Procesando: {item_name} ---")
    if not os.path.exists(src_dir):
        print(f"  [!] No existe ruta origen: {src_dir}")
        continue
    
    files_in_dir = []
    for root, _, files in os.walk(src_dir):
        for f in files:
            files_in_dir.append(os.path.join(root, f))
            
    print(f"  Archivos totales en serie: {len(files_in_dir)}")
    for sf in files_in_dir:
        rel = os.path.relpath(sf, src_dir)
        df = os.path.join(dst_dir, rel)
        sz_mb = os.path.getsize(sf) / (1024 * 1024)
        
        t0 = time.time()
        was_copied = copy_file_buffered(sf, df)
        dt = time.time() - t0
        
        if was_copied:
            total_copied += 1
            speed = sz_mb / max(0.01, dt)
            print(f"  [+] Copiado: {rel} ({sz_mb:.1f} MB) en {dt:.1f}s @ {speed:.1f} MB/s")
        else:
            total_skipped += 1

print(f"\n[OK] Preparación de biblioteca Wi-Fi completada en {time.time() - start_time:.1f}s")
print(f"  Archivos copiados: {total_copied} | Ya existentes: {total_skipped}")

# 2. TRIGGER SYNCTHING RESCAN
print("\n[*] Notificando a Syncthing para iniciar sincronización Wi-Fi con Xiaomi 14T Pro...")
SYNCTHING_API_KEY = "yw9APDvXDAQqNn4syPdxwHPrhHeHe5rr"
try:
    req = urllib.request.Request(
        "http://127.0.0.1:8384/rest/db/scan?folder=anime-celular",
        headers={"X-API-Key": SYNCTHING_API_KEY},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        print(f"  [+] Syncthing scan iniciado con código HTTP {resp.status} (Sincronización P2P Wi-Fi activa).")
except Exception as e:
    print(f"  [!] Error llamando Syncthing API: {e}")

# 3. LEVANTAR SERVIDOR WEB LAN HTTP
print("\n[*] Levantando Servidor HTTP LAN en segundo plano (puerto 8000)...")
class AnimeHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=TARGET_DIR, **kwargs)

def run_server():
    server = ThreadingHTTPServer(('0.0.0.0', 8000), AnimeHTTPHandler)
    server.serve_forever()

server_thread = Thread(target=run_server, daemon=True)
server_thread.start()

print("[+] Servidor HTTP LAN listo en http://192.168.1.71:8000")
print("[+] Acceso directo desde el celular Xiaomi 14T Pro disponible para descarga directa o reproducción.")
print("\n====================================================================")
print("  PROCESO WI-FI COMPLETADO Y TRANSMITIENDO EN SEGUNDO PLANO")
print("====================================================================")

# Mantener vivo el servidor para transmisión
while True:
    time.sleep(60)
