# media_clipper.py - Pipeline de Video Vertical 9:16 con Aceleración por GPU (NVIDIA NVENC)
# Versión 2.0 (10/10) - Antigravity Media Automation para Jaime

import os
import sys

# Forzar codificación UTF-8 en consola de Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import subprocess
import time
import argparse
import glob

FFMPEG = r"C:\Users\gonza\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe"

def run_ffmpeg(cmd_args):
    """Ejecuta FFmpeg de forma segura en Windows sin bloqueos interactivos."""
    full_cmd = [FFMPEG, "-y", "-nostdin"] + cmd_args
    proc = subprocess.run(full_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        return False, proc.stderr
    return True, proc.stdout

def is_nvenc_available():
    """Comprueba si el codificador NVIDIA NVENC está disponible en hardware."""
    test_cmd = ["-f", "lavfi", "-i", "testsrc=duration=1:size=640x360", "-c:v", "h264_nvenc", "-f", "null", "-"]
    success, _ = run_ffmpeg(test_cmd)
    return success

def convert_to_vertical_9_16(input_path, output_path, mode="blur_bg", use_gpu=True):
    """
    Convierte un video horizontal a vertical 9:16 (1080x1920) utilizando GPU NVIDIA NVENC
    con fallback transparente a CPU (libx264).
    """
    if not os.path.exists(input_path):
        print(f"[ERROR] Archivo no encontrado: {input_path}")
        return False

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    
    if mode == "blur_bg":
        filter_complex = (
            "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
            "boxblur=20:5[bg];"
            "[0:v]scale=1080:-1[fg];"
            "[bg][fg]overlay=(W-w)/2:(H-h)/2[v]"
        )
    else:
        filter_complex = "[0:v]scale=-1:1920,crop=1080:1920[v]"

    # Determinar encoder (GPU NVENC vs CPU libx264)
    encoder = "libx264"
    encoder_args = ["-preset", "fast", "-crf", "22"]
    
    if use_gpu and is_nvenc_available():
        encoder = "h264_nvenc"
        encoder_args = ["-preset", "p4", "-cq", "23", "-b:v", "5M"]
        print("[GPU ACCELERATION] Acelerador NVIDIA NVENC detectado y activo")
    else:
        print("[CPU ENCODER] Usando codificador por software libx264")

    args = [
        "-i", input_path,
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-map", "0:a?",
        "-c:v", encoder
    ] + encoder_args + [
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output_path
    ]

    start_time = time.time()
    print(f"[PROCESANDO] {os.path.basename(input_path)} -> {os.path.basename(output_path)} (Modo: {mode})")
    
    success, err = run_ffmpeg(args)
    if not success and encoder == "h264_nvenc":
        print("[FALLBACK] Error con NVENC, reintentando con CPU libx264...")
        args[args.index("h264_nvenc")] = "libx264"
        success, err = run_ffmpeg(args)

    elapsed = round(time.time() - start_time, 2)
    
    if success and os.path.exists(output_path):
        size_mb = round(os.path.getsize(output_path) / (1024 * 1024), 2)
        print(f"[EXITO] Video vertical generado en {elapsed}s: {output_path} ({size_mb} MB)")
        return True
    else:
        print(f"[ERROR FFmpeg]: {err[-400:]}")
        return False

def generate_synthetic_test(out_dir):
    """Genera video sintético y ejecuta test con aceleración GPU NVENC."""
    os.makedirs(out_dir, exist_ok=True)
    raw_test = os.path.join(out_dir, "raw_16_9_gpu_test.mp4")
    out_vertical = os.path.join(out_dir, "vertical_tiktok_nvenc_test.mp4")
    
    print("[TEST] Generando clip sintético de prueba...")
    gen_args = [
        "-f", "lavfi", "-i", "testsrc=duration=5:size=1920x1080:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=5",
        "-c:v", "h264_nvenc", "-c:a", "aac", raw_test
    ]
    success, _ = run_ffmpeg(gen_args)
    if not success:
        gen_args[gen_args.index("h264_nvenc")] = "libx264"
        run_ffmpeg(gen_args)
        
    return convert_to_vertical_9_16(raw_test, out_vertical, mode="blur_bg", use_gpu=True)

def watch_folder(watch_dir, out_dir, use_gpu=True):
    """Monitorea una carpeta y convierte clips nuevos a vertical 9:16 automáticamente."""
    print(f"[WATCHDOG GPU] Monitoreando carpeta: {watch_dir}")
    print(f"[WATCHDOG GPU] Exportación vertical en: {out_dir}")
    os.makedirs(watch_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    
    processed = set()
    try:
        while True:
            files = glob.glob(os.path.join(watch_dir, "*.mp4")) + glob.glob(os.path.join(watch_dir, "*.mkv"))
            for f in files:
                if f not in processed:
                    base_name = os.path.splitext(os.path.basename(f))[0]
                    target = os.path.join(out_dir, f"{base_name}_tiktok_916.mp4")
                    if not os.path.exists(target):
                        convert_to_vertical_9_16(f, target, mode="blur_bg", use_gpu=use_gpu)
                    processed.add(f)
            time.sleep(2)
    except KeyboardInterrupt:
        print("[WATCHDOG] Detenido por el usuario.")

def main():
    parser = argparse.ArgumentParser(description="Antigravity Media Clipper 9:16 con NVIDIA NVENC")
    parser.add_argument("--input", "-i", help="Video a procesar")
    parser.add_argument("--output", "-o", help="Ruta de salida")
    parser.add_argument("--mode", choices=["blur_bg", "crop"], default="blur_bg", help="Modo de encuadre")
    parser.add_argument("--no-gpu", action="store_true", help="Fuerza uso de CPU en lugar de GPU")
    parser.add_argument("--watch", help="Carpeta a vigilar para auto-conversión")
    parser.add_argument("--out-dir", default="clips_tiktok_916", help="Carpeta de destino para watch")
    parser.add_argument("--test", action="store_true", help="Ejecuta prueba con benchmark GPU")
    
    args = parser.parse_args()
    use_gpu = not args.no_gpu
    
    if args.test:
        test_dir = r"c:\Users\gonza\OneDrive\Escritorio\Antigravity escritorio general\test_media_output"
        success = generate_synthetic_test(test_dir)
        sys.exit(0 if success else 1)
        
    if args.watch:
        watch_folder(args.watch, args.out_dir, use_gpu=use_gpu)
        sys.exit(0)
        
    if args.input and args.output:
        convert_to_vertical_9_16(args.input, args.output, args.mode, use_gpu=use_gpu)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
