import os
import sys
import time
import subprocess
from pathlib import Path

# Ensure UTF-8 output on Windows terminal
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ADB_BIN = r"C:\Users\gonza\AppData\Local\Android\Sdk\platform-tools\adb.exe"
LOCAL_BASE = r"E:\OTAKU\ANIME\Kimi no Koto ga Dai Dai Dai Dai Daisuki na 100-nin no Kanojo"
REMOTE_BASE = "/sdcard/Anime/Kimi no Koto ga Dai Dai Dai Dai Daisuki na 100-nin no Kanojo"

def run_adb(args):
    cmd = [ADB_BIN] + args
    return subprocess.run(cmd, capture_output=True, text=True, errors="replace")

def get_remote_files(remote_dir):
    res = run_adb(["shell", f"find '{remote_dir}' -type f"])
    if res.returncode != 0:
        return set()
    files = set()
    for line in res.stdout.splitlines():
        line = line.strip()
        if line:
            files.add(line)
    return files

def main():
    print("=" * 65)
    print("[*] PROTOCOLO TURBO ADB - TRANSFERENCIA DE ANIME A XIAOMI 14T PRO")
    print("=" * 65)

    # 1. Verificar conexión ADB
    dev_res = run_adb(["devices"])
    print(f"Estado de dispositivos:\n{dev_res.stdout.strip()}")
    if "device" not in dev_res.stdout:
        print("[!] Error: Dispositivo no autorizado o desconectado en ADB.")
        sys.exit(1)

    # 2. Censo de archivos locales
    local_files = []
    total_bytes = 0
    for root, dirs, files in os.walk(LOCAL_BASE):
        for f in files:
            lp = os.path.join(root, f)
            rel = os.path.relpath(lp, LOCAL_BASE).replace("\\", "/")
            sz = os.path.getsize(lp)
            total_bytes += sz
            local_files.append((lp, rel, sz))

    total_gb = total_bytes / (1024 ** 3)
    print(f"\n[+] Serie detectada: Las 100 Novias (Kimi no Koto ga Dai Dai Dai Dai Daisuki na 100-nin no Kanojo)")
    print(f"[+] Total archivos: {len(local_files)} | Peso total: {total_gb:.2f} GB")

    # 3. Obtener archivos remotos para evitar re-transferencias
    print("\n[*] Verificando estado en el celular...")
    remote_existing = get_remote_files(REMOTE_BASE)
    print(f"[+] Archivos ya presentes en el celular: {len(remote_existing)}")

    # 4. Iniciar transferencia
    transferred_count = 0
    skipped_count = 0
    transferred_bytes = 0
    start_time = time.time()

    for idx, (lp, rel, sz) in enumerate(local_files, 1):
        remote_path = f"{REMOTE_BASE}/{rel}"
        remote_dir = "/".join(remote_path.split("/")[:-1])

        if remote_path in remote_existing:
            skipped_count += 1
            print(f"[{idx}/{len(local_files)}] [SKIP] Ya existe: {rel}")
            continue

        # Asegurar directorio remoto
        run_adb(["shell", f"mkdir -p '{remote_dir}'"])

        # Transferencia directa con adb push
        file_sz_mb = sz / (1024 * 1024)
        print(f"[{idx}/{len(local_files)}] [>>] Transfiriendo ({file_sz_mb:.1f} MB): {rel}...", end="", flush=True)
        t0 = time.time()
        push_res = run_adb(["push", lp, remote_path])
        elapsed = time.time() - t0

        if push_res.returncode == 0:
            speed = (file_sz_mb / max(0.01, elapsed))
            transferred_bytes += sz
            transferred_count += 1
            print(f" [OK] ({elapsed:.1f}s @ {speed:.1f} MB/s)")

            # Indexar en la galería / media store de Android
            if lp.lower().endswith(('.mp4', '.mkv')):
                run_adb(["shell", f"am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d 'file://{remote_path}'"])
        else:
            print(f" [ERROR]: {push_res.stderr.strip()[:100]}")

    total_elapsed = time.time() - start_time
    avg_speed = (transferred_bytes / (1024 * 1024)) / max(0.1, total_elapsed)
    print("\n" + "=" * 65)
    print("[*] TRANSFERENCIA COMPLETADA CON EXITO")
    print(f" • Archivos transferidos: {transferred_count}")
    print(f" • Archivos omitidos (preexistentes): {skipped_count}")
    print(f" • Datos transferidos: {transferred_bytes / (1024**3):.2f} GB")
    print(f" • Tiempo total: {total_elapsed:.1f} segundos")
    print(f" • Velocidad promedio USB: {avg_speed:.1f} MB/s")
    print(f" • Ubicacion en tu Xiaomi: {REMOTE_BASE}")
    print("=" * 65)

if __name__ == "__main__":
    main()
