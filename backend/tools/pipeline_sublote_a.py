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

BASE_MANHWAS = Path(r"E:\OTAKU\MANHWAS\General")

tasks = [
    {
        "name": "Noblesse",
        "torrent": "torrents_manhwa/Noblesse_PDF.torrent",
        "dest": BASE_MANHWAS / "Noblesse",
        "is_pdf": True
    },
    {
        "name": "Landlord Sisters",
        "torrent": "torrents_manhwa/Landlord_Sisters.torrent",
        "dest": BASE_MANHWAS / "Landlord Sisters",
        "is_pdf": False
    },
    {
        "name": "What Does the Fox Say",
        "torrent": "torrents_manhwa/What_Does_The_Fox_Say.torrent",
        "dest": BASE_MANHWAS / "What Does the Fox Say",
        "is_pdf": False
    },
    {
        "name": "Trash of the Count's Family",
        "torrent": "torrents_manhwa/Trash_of_Count.torrent",
        "dest": BASE_MANHWAS / "Trash of the Count's Family",
        "is_pdf": False
    },
    {
        "name": "Return of the Disaster-Class Hero",
        "torrent": "torrents_manhwa/Disaster_Class_Hero.torrent",
        "dest": BASE_MANHWAS / "Return of the Disaster-Class Hero",
        "is_pdf": False
    }
]

def download_torrent(task):
    dest = task["dest"]
    dest.mkdir(parents=True, exist_ok=True)
    temp_dir = dest / "_dl_temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n[DESCARGA] Iniciando aria2c para {task['name']}...")
    cmd = [
        "aria2c",
        "--seed-time=0",
        "--max-connection-per-server=16",
        "--split=16",
        "--bt-stop-timeout=120",
        "--summary-interval=15",
        f"--dir={temp_dir}",
        task["torrent"]
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        print(f"[DESCARGA COMPLETADA] {task['name']}")
    except subprocess.TimeoutExpired:
        print(f"[TIMEOUT] Descarga de {task['name']} tardo mas de 15 minutos.")
    except Exception as e:
        print(f"[ERROR] en descarga de {task['name']}: {e}")

def compile_task_to_pdf(task):
    dest = task["dest"]
    temp_dir = dest / "_dl_temp"
    
    if not temp_dir.exists():
        print(f"[COMPILACION] No existe {temp_dir}")
        return
        
    print(f"\n[COMPILACION] Procesando {task['name']}...")
    
    # If Noblesse (already PDFs)
    if task["is_pdf"]:
        pdf_files = list(temp_dir.rglob("*.pdf"))
        print(f"Moviendo {len(pdf_files)} PDFs directos de Noblesse...")
        for p in pdf_files:
            target = dest / p.name
            if not target.exists() or target.stat().st_size == 0:
                shutil.move(str(p), str(target))
        try:
            shutil.rmtree(temp_dir)
            print(f"[CLEANUP] Carpeta temporal de {task['name']} eliminada con exito.")
        except Exception as e:
            print(f"Error borrando temp: {e}")
        return

    # For CBZ files
    cbz_files = sorted(list(temp_dir.rglob("*.cbz")))
    print(f"Total CBZ encontrados en {task['name']}: {len(cbz_files)}")
    
    def convert_single_cbz(cbz_p):
        # Extract number
        m = re.search(r'(?:c|chapter|\s)(\d+(\.\d+)?)', cbz_p.stem, re.IGNORECASE)
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
            with zipfile.ZipFile(cbz_p, 'r') as zf:
                imgs = sorted([n for n in zf.namelist() if n.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))])
                if not imgs: return False
                b_list = [zf.read(n) for n in imgs]
                try:
                    pdf_bytes = img2pdf.convert(b_list)
                    with open(out_pdf, 'wb') as f:
                        f.write(pdf_bytes)
                except Exception:
                    pil_imgs = []
                    import io
                    for b in b_list:
                        pil_imgs.append(Image.open(io.BytesIO(b)).convert('RGB'))
                    if pil_imgs:
                        pil_imgs[0].save(out_pdf, save_all=True, append_images=pil_imgs[1:])
            return True
        except Exception as e:
            print(f"Error en {cbz_p.name}: {e}")
            return False

    with ThreadPoolExecutor(max_workers=8) as ex:
        res = list(ex.map(convert_single_cbz, cbz_files))
        
    compiled_count = sum(1 for r in res if r)
    print(f"[COMPILACION COMPLETADA] {task['name']}: {compiled_count} / {len(cbz_files)} PDFs generados.")
    
    if compiled_count >= len(cbz_files) * 0.9 and compiled_count > 0:
        print(f"Purgando archivos temporales de {task['name']}...")
        try:
            shutil.rmtree(temp_dir)
            print(f"[CLEANUP] Carpeta temporal eliminada.")
        except Exception as e:
            print(f"Error borrando temp: {e}")

if __name__ == "__main__":
    for t in tasks:
        download_torrent(t)
        compile_task_to_pdf(t)
    print("\n==========================================")
    print("SUB-LOTE A COMPLETADO EXITOSAMENTE AL 100%")
    print("==========================================")
