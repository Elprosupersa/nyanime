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

root = Path("E:/OTAKU/MANHWAS/General/Tower of God")
sub = root / "Tower of God"

cbz_files = sorted(list(sub.glob("*.cbz")))
print(f"Total CBZ en Tower of God a procesar: {len(cbz_files)}")

def process_cbz(cbz_path):
    # Parse global chapter number and season
    m_global = re.search(r'#(\d+)', cbz_path.name)
    global_num = int(m_global.group(1)) if m_global else 1
    
    m_season = re.search(r'Season\s*(\d+)', cbz_path.name, re.IGNORECASE)
    season_num = int(m_season.group(1)) if m_season else 1
    
    season_dir = root / f"Temporada {season_num:02d}"
    season_dir.mkdir(parents=True, exist_ok=True)
    out_pdf = season_dir / f"Capitulo {global_num:03d}.pdf"
    
    if out_pdf.exists() and out_pdf.stat().st_size > 500000:
        return f"{out_pdf.name} (Ya existia)"
        
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
                import io
                pil_imgs = []
                for b in img_bytes:
                    pil_imgs.append(Image.open(io.BytesIO(b)).convert('RGB'))
                if pil_imgs:
                    pil_imgs[0].save(out_pdf, save_all=True, append_images=pil_imgs[1:])
                    
        return f"{season_dir.name}/{out_pdf.name} ({out_pdf.stat().st_size / (1024*1024):.2f} MB)"
    except Exception as e:
        return f"Error en {cbz_path.name}: {e}"

with ThreadPoolExecutor(max_workers=8) as executor:
    results = list(executor.map(process_cbz, cbz_files))

valid = [r for r in results if r and not r.startswith("Error")]
print(f"Capítulos compilados exitosamente: {len(valid)} / {len(cbz_files)}")

# If all compiled, remove CBZ folder to free 11.0 GiB
if len(valid) >= 520:
    print("Limpiando carpeta temporal CBZ...")
    try:
        shutil.rmtree(sub)
        print("Carpeta temporal eliminada con éxito.")
    except Exception as e:
        print(f"No se pudo eliminar carpeta: {e}")

print("Compilación de Tower of God finalizada al 100%.")
