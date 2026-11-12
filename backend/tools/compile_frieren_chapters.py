import os
import sys
import re
import shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import img2pdf
from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

frieren_root = Path(r"E:\OTAKU\MANGAS\General\Sousou no Frieren")
extracted_dir = frieren_root / "Sousou no Frieren"

def process_chapter(folder):
    if not folder.is_dir():
        return None
    
    m = re.search(r'Ch\.(\d+(\.\d+)?)', folder.name)
    if not m:
        m = re.search(r'(\d+(\.\d+)?)', folder.name)
    if not m:
        return None
    
    raw_num = m.group(1)
    if '.' in raw_num:
        parts = raw_num.split('.')
        ch_str = f"{int(parts[0]):03d}.{parts[1]}"
    else:
        ch_str = f"{int(raw_num):03d}"
        
    out_pdf = frieren_root / f"Capitulo {ch_str}.pdf"
    
    if out_pdf.exists() and out_pdf.stat().st_size > 500000:
        return (ch_str, "cached", out_pdf.stat().st_size)
    
    images = []
    for f in sorted(folder.iterdir()):
        if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']:
            images.append(f)
            
    if not images:
        return None
        
    try:
        image_bytes_list = []
        for img_path in images:
            with open(img_path, 'rb') as img_f:
                image_bytes_list.append(img_f.read())
        
        pdf_bytes = img2pdf.convert(image_bytes_list)
        with open(out_pdf, 'wb') as f:
            f.write(pdf_bytes)
            
        return (ch_str, "img2pdf", out_pdf.stat().st_size)
    except Exception as e:
        try:
            pil_images = []
            for img_path in images:
                im = Image.open(img_path).convert('RGB')
                pil_images.append(im)
            if pil_images:
                pil_images[0].save(out_pdf, save_all=True, append_images=pil_images[1:])
                return (ch_str, "pil", out_pdf.stat().st_size)
        except Exception as e2:
            return (ch_str, f"error: {e2}", 0)

folders = [f for f in sorted(extracted_dir.iterdir()) if f.is_dir()]
print(f"Procesando {len(folders)} carpetas de capítulos concurrentemente...")

compiled_count = 0
with ThreadPoolExecutor(max_workers=8) as executor:
    futures = {executor.submit(process_chapter, f): f for f in folders}
    for future in as_completed(futures):
        res = future.result()
        if res:
            ch_str, mode, size = res
            if "error" in mode:
                print(f"❌ Error en Cap {ch_str}: {mode}")
            else:
                compiled_count += 1
                if mode != "cached":
                    print(f"✅ Compilado: Capitulo {ch_str}.pdf ({size / (1024*1024):.2f} MB)")

print(f"\n🎉 Total capítulos compilados a PDF: {compiled_count}")

# 3. Clean up RAR and raw images to preserve disk space
rar_file = frieren_root / "Sousou no Frieren CH001-140 Mangadex-RIP.rar"
if rar_file.exists() and compiled_count >= 130:
    print(f"Limpiando archivo temporal RAR ({rar_file.stat().st_size / (1024*1024):.2f} MB)...")
    try:
        rar_file.unlink()
        print("RAR temporal eliminado con éxito.")
    except Exception as e:
        print(f"No se pudo eliminar RAR: {e}")

if extracted_dir.exists() and compiled_count >= 130:
    print("Limpiando carpeta de imágenes sueltas...")
    try:
        shutil.rmtree(extracted_dir)
        print("Carpeta temporal eliminada con éxito.")
    except Exception as e:
        print(f"No se pudo eliminar carpeta: {e}")

print("Proceso de Sousou no Frieren 100% finalizado.")
