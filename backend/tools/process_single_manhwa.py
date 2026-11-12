import os
import sys
import re
import shutil
import zipfile
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import img2pdf
from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def process_manhwa(torrent_file, dest_folder, title_name):
    dest = Path(dest_folder)
    dest.mkdir(parents=True, exist_ok=True)
    temp_dir = dest / "_dl_temp"
    
    # 0. Limpiar temp previo si existiera
    if temp_dir.exists():
        try:
            shutil.rmtree(temp_dir)
        except Exception:
            pass
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n==================================================")
    print(f"🚀 INICIANDO ADQUISICION: {title_name}")
    print(f"Destino: {dest}")
    print(f"Torrent: {torrent_file}")
    print(f"==================================================")
    
    cmd = [
        "aria2c",
        "--file-allocation=none",
        "--allow-overwrite=true",
        "--seed-time=0",
        "--bt-stop-timeout=60",
        "--max-connection-per-server=16",
        "--split=16",
        "--summary-interval=10",
        f"--dir={temp_dir}",
        str(torrent_file)
    ]
    
    print(f"Ejecutando aria2c a maxima velocidad...")
    proc = subprocess.run(cmd)
    print(f"aria2c finalizo con codigo {proc.returncode}")
    
    print(f"\nVerificando archivos descargados en {temp_dir}...")
    
    # 1. Si son PDFs directos
    pdf_files = list(temp_dir.rglob("*.pdf"))
    if pdf_files:
        print(f"Moviendo {len(pdf_files)} PDFs directos...")
        for p in pdf_files:
            target = dest / p.name
            if not target.exists() or target.stat().st_size == 0:
                shutil.move(str(p), str(target))
                print(f"  + {p.name} ({target.stat().st_size / (1024*1024):.2f} MB)")
        try:
            shutil.rmtree(temp_dir)
            print("Carpeta temporal eliminada.")
        except Exception as e:
            print(f"Error borrando temp: {e}")
        print(f"✅ {title_name} COMPLETADO AL 100% EN PDF.")
        return True

    # 2. Si son CBZ / ZIP
    cbz_files = sorted(list(temp_dir.rglob("*.cbz")) + list(temp_dir.rglob("*.zip")))
    print(f"Total CBZ/ZIP encontrados: {len(cbz_files)}")
    if not cbz_files:
        print("No se encontraron archivos validos en la descarga.")
        return False
        
    def convert_cbz(cbz_p):
        m = re.search(r'(?:c|chapter|#|\s)(\d+(\.\d+)?)', cbz_p.stem, re.IGNORECASE)
        if m:
            num = m.group(1)
            if '.' in num:
                parts = num.split('.')
                ch_str = f"{int(parts[0]):03d}.{parts[1]}"
            else:
                ch_str = f"{int(num):03d}"
            out_pdf = dest / f"Capitulo {ch_str}.pdf"
        else:
            out_pdf = dest / f"{cbz_p.stem}.pdf"
            
        if out_pdf.exists() and out_pdf.stat().st_size > 200000:
            return True
            
        try:
            if not zipfile.is_zipfile(cbz_p):
                return False
            with zipfile.ZipFile(cbz_p, 'r') as zf:
                imgs = sorted([n for n in zf.namelist() if n.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))])
                if not imgs: return False
                b_list = [zf.read(n) for n in imgs]
                try:
                    pdf_bytes = img2pdf.convert(b_list)
                    with open(out_pdf, 'wb') as f:
                        f.write(pdf_bytes)
                except Exception:
                    import io
                    pil_imgs = []
                    for b in b_list:
                        pil_imgs.append(Image.open(io.BytesIO(b)).convert('RGB'))
                    if pil_imgs:
                        pil_imgs[0].save(out_pdf, save_all=True, append_images=pil_imgs[1:])
            return True
        except Exception as e:
            return False

    print("Compilando capítulos a PDF nativo con 8 workers multihilo...")
    with ThreadPoolExecutor(max_workers=8) as ex:
        res = list(ex.map(convert_cbz, cbz_files))
        
    ok_count = sum(1 for r in res if r)
    print(f"Compilados exitosamente: {ok_count} / {len(cbz_files)} PDFs.")
    
    if ok_count > 0:
        print("Eliminando carpeta temporal para liberar espacio en disco...")
        try:
            shutil.rmtree(temp_dir)
            print("Carpeta temporal purgada.")
        except Exception as e:
            print(f"Error borrando temp: {e}")
            
    print(f"✅ {title_name} COMPLETADO ({ok_count} PDFs listos).")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Uso: python process_single_manhwa.py <torrent_file> <dest_folder> <title_name>")
        sys.exit(1)
    torrent_file = sys.argv[1]
    dest_folder = sys.argv[2]
    title_name = sys.argv[3]
    process_manhwa(torrent_file, dest_folder, title_name)
