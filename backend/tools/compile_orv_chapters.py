import os
import sys
import re
import shutil
import zipfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import img2pdf
from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

root = Path("E:/OTAKU/MANHWAS/General/Omniscient Reader's Viewpoint")
sub = root / "[fr3akyphantom] Omniscient Reader (2020) (Digital) (LINE Webtoon)"

cbz_files = sorted(list(sub.glob("*.cbz")))
print(f"Total CBZ files a compilar: {len(cbz_files)}")

def process_cbz(cbz_path):
    m = re.search(r'Episode\s*(\d+)', cbz_path.name, re.IGNORECASE)
    if not m:
        return None
    ep_num = int(m.group(1))
    out_pdf = root / f"Capitulo {ep_num:03d}.pdf"
    
    if out_pdf.exists() and out_pdf.stat().st_size > 500000:
        return f"Capitulo {ep_num:03d}.pdf (Ya existia)"
    
    try:
        with zipfile.ZipFile(cbz_path, 'r') as zf:
            img_names = sorted([n for n in zf.namelist() if n.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))])
            if not img_names:
                return None
            img_bytes = [zf.read(n) for n in img_names]
            
            try:
                pdf_bytes = img2pdf.convert(img_bytes)
                with open(out_pdf, 'wb') as f:
                    f.write(pdf_bytes)
            except Exception:
                # PIL fallback
                import io
                pil_imgs = []
                for b in img_bytes:
                    pil_imgs.append(Image.open(io.BytesIO(b)).convert('RGB'))
                if pil_imgs:
                    pil_imgs[0].save(out_pdf, save_all=True, append_images=pil_imgs[1:])
                    
        return f"Capitulo {ep_num:03d}.pdf ({out_pdf.stat().st_size / (1024*1024):.2f} MB)"
    except Exception as e:
        return f"Error en {cbz_path.name}: {e}"

with ThreadPoolExecutor(max_workers=8) as executor:
    results = list(executor.map(process_cbz, cbz_files))

valid = [r for r in results if r and not r.startswith("Error")]
print(f"Capítulos compilados exitosamente: {len(valid)} / {len(cbz_files)}")

# If all compiled, remove CBZ folder to free 2.7 GiB
if len(valid) >= 200:
    print("Limpiando carpeta temporal CBZ...")
    try:
        shutil.rmtree(sub)
        print("Carpeta temporal eliminada con éxito.")
    except Exception as e:
        print(f"No se pudo eliminar carpeta: {e}")

print("Compilación de Omniscient Reader finalizada al 100%.")
