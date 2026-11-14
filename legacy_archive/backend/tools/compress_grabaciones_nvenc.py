import os
import sys
import subprocess
import json
import time

FOLDER = r"E:\grabaciones clase"
TARGET_WIDTH = 1920
TARGET_HEIGHT = 1200
TARGET_FPS = 60

def get_video_info(file_path):
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,r_frame_rate,width,height:format=duration,size",
        "-of", "json",
        file_path
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if res.returncode != 0:
            return None
        data = json.loads(res.stdout)
        streams = data.get("streams", [])
        if not streams:
            return None
        stream = streams[0]
        fmt = data.get("format", {})
        codec = stream.get("codec_name", "")
        fps_str = stream.get("r_frame_rate", "0/1")
        try:
            num, den = map(int, fps_str.split('/'))
            fps = num / den if den != 0 else 0
        except Exception:
            fps = 0
        dur = float(fmt.get("duration", 0))
        sz = int(fmt.get("size", os.path.getsize(file_path)))
        width = int(stream.get("width", 0))
        height = int(stream.get("height", 0))
        if width == 0 or height == 0:
            return None
        return {
            "codec": codec,
            "fps": fps,
            "duration": dur,
            "size": sz,
            "width": width,
            "height": height
        }
    except Exception:
        return None

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Optimizador de grabaciones OBS por GPU NVENC a 1080p @ 60 FPS")
    parser.add_argument("--test", action="store_true", help="Procesa solo el primer archivo para verificacion")
    parser.add_argument("--limit", type=int, default=0, help="Limita el numero de videos a procesar (0 = todos)")
    args = parser.parse_args()

    if not os.path.exists(FOLDER):
        print(f"Error: La carpeta {FOLDER} no existe.")
        return

    all_files = [
        f for f in os.listdir(FOLDER)
        if f.lower().endswith((".mp4", ".mkv")) and not f.startswith("_") and not ".temp_hevc" in f
    ]

    print("=" * 78)
    print("   MOTOR DE COMPRESION TURBO NVENC RTX 5060 (1080p @ 60 FPS)")
    print(f"   Destino: {FOLDER}")
    print("=" * 78)
    print(f"Total de archivos detectados en carpeta: {len(all_files)}")

    queue = []
    skipped = 0
    corrupted = []

    print("\n[+] Analizando metadatos y codecs existentes...")
    for f in all_files:
        fp = os.path.join(FOLDER, f)
        info = get_video_info(fp)
        if not info:
            corrupted.append(f)
            continue
        
        # Si ya esta en HEVC, con ancho <= 1920 y fps <= 62, ya esta optimizado
        if info["codec"] == "hevc" and info["width"] <= TARGET_WIDTH and info["fps"] <= (TARGET_FPS + 2):
            skipped += 1
        else:
            queue.append((f, fp, info))

    print(f"  • Videos ya optimizados (omitidos): {skipped}")
    print(f"  • Videos no legibles / corruptos en disco: {len(corrupted)}")
    print(f"  • Videos pendientes de optimizacion: {len(queue)}")
    print(f"  • Peso total de la cola pendiente: {sum(x[2]['size'] for x in queue) / (1024**3):.2f} GB")

    if corrupted:
        print("\n  [AVISO] Archivos no legibles en disco que se omitiran de forma segura:")
        for cf in corrupted:
            print(f"    - {cf}")

    if not queue:
        print("\n[OK] Todos los videos ya estan optimizados en 1080p @ 60 FPS.")
        return

    if args.test:
        queue = queue[:1]
        print("\n[MODO TEST ACTIVO]: Solo se procesara 1 video.")
    elif args.limit > 0:
        queue = queue[:args.limit]
        print(f"\n[LIMITE ACTIVO]: Solo se procesaran los primeros {args.limit} videos.")

    saved_bytes_total = 0
    processed_count = 0
    failed_count = 0
    start_time_all = time.time()

    for idx, (fname, fpath, info) in enumerate(queue, 1):
        temp_out = os.path.splitext(fpath)[0] + ".temp_hevc.mp4"
        orig_gb = info["size"] / (1024**3)
        orig_mb = info["size"] / (1024**2)

        print("\n" + "-" * 78)
        print(f"[{idx}/{len(queue)}] PROCESANDO: {fname}")
        print(f"  • Tamano original: {orig_gb:.2f} GB ({orig_mb:.1f} MB)")
        print(f"  • Origen: {info['codec']} @ {info['fps']:.1f} FPS ({info['width']}x{info['height']})")
        print(f"  • Salida: HEVC @ 60 FPS (1920x1200 Bilinear CUDA)")
        print(f"  • Duracion: {info['duration']/60:.1f} minutos ({info['duration']:.0f} s)")

        cmd = [
            "ffmpeg", "-y",
            "-hide_banner",
            "-stats",
            "-hwaccel", "cuda",
            "-hwaccel_output_format", "cuda",
            "-i", fpath,
            "-vf", f"scale_cuda={TARGET_WIDTH}:{TARGET_HEIGHT}:interp_algo=bilinear",
            "-c:v", "hevc_nvenc",
            "-preset", "p4",
            "-cq", "26",
            "-r", str(TARGET_FPS),
            "-c:a", "copy",
            "-movflags", "+faststart",
            temp_out
        ]

        t0 = time.time()
        res = subprocess.run(cmd)
        elapsed = time.time() - t0

        if res.returncode == 0 and os.path.exists(temp_out):
            out_info = get_video_info(temp_out)
            if out_info and out_info["size"] > 1024 * 1024:
                dur_ratio = out_info["duration"] / info["duration"] if info["duration"] > 0 else 1
                if 0.95 <= dur_ratio <= 1.05:
                    new_sz = out_info["size"]
                    new_gb = new_sz / (1024**3)
                    saved = info["size"] - new_sz
                    saved_gb = saved / (1024**3)
                    pct = (saved / info["size"]) * 100

                    try:
                        os.remove(fpath)
                        final_path = os.path.splitext(fpath)[0] + ".mp4"
                        os.rename(temp_out, final_path)

                        saved_bytes_total += saved
                        processed_count += 1
                        speed_factor = info["duration"] / elapsed if elapsed > 0 else 0

                        print(f"  [EXITO] Optimizado en {elapsed:.1f}s ({speed_factor:.2f}x velocidad real)")
                        print(f"  • Nuevo tamano: {new_gb:.2f} GB ({new_sz / (1024**2):.1f} MB)")
                        print(f"  • Espacio liberado en este archivo: {saved_gb:.2f} GB (-{pct:.1f}%)")
                        print(f"  • Espacio total recuperado en disco E:\\: {saved_bytes_total / (1024**3):.2f} GB")
                        continue
                    except Exception as e:
                        print(f"  [ERROR] Fallo al reemplazar archivo: {e}")
                else:
                    print(f"  [ERROR] Verificacion de duracion fallida: entrada={info['duration']}s vs salida={out_info['duration']}s")
            else:
                print("  [ERROR] Archivo resultante invalido.")
        else:
            print("  [ERROR] FFmpeg retorno codigo de error.")

        failed_count += 1
        if os.path.exists(temp_out):
            try:
                os.remove(temp_out)
            except Exception:
                pass
        print("  [ATENCION] Original mantenido intacto.")

    total_time = time.time() - start_time_all
    print("\n" + "=" * 78)
    print("   RESUMEN FINAL DE LA SESION DE COMPRESION")
    print("=" * 78)
    print(f"Videos optimizados exitosamente: {processed_count}")
    print(f"Videos con fallos / omitidos: {failed_count}")
    print(f"Espacio total liberado en E:\\: {saved_bytes_total / (1024**3):.2f} GB")
    print(f"Tiempo total transcurrido: {total_time/60:.1f} minutos ({total_time:.0f} s)")

if __name__ == "__main__":
    main()
