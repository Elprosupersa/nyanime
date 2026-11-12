import os
import sys
import re
import urllib.parse
from pathlib import Path
import requests

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DEST_DIR = Path(r"E:\OTAKU\MANHWAS\General\Solo Leveling")
DEST_DIR.mkdir(parents=True, exist_ok=True)

items = [
    'chapter-16_202403',
    'chapter-24_20240331',
    'chapter-51_20240331',
    'chapter-69_202404',
    'chapter-86_202404',
    'chapter-111',
    'chapter-129_202404',
    'chapter-147',
    'chapter-169.0'
]

print("Obteniendo lista de capítulos de Solo Leveling desde Archive.org...")
tasks = []

for it in items:
    url = f"https://archive.org/metadata/{it}/files"
    try:
        r = requests.get(url, timeout=15)
        files = r.json().get('result', [])
        for f in files:
            name = f.get('name', '')
            if name.endswith('.pdf') and not name.endswith('_text.pdf'):
                # Extract chapter number
                m = re.search(r'Chapter\s*(\d+(\.\d+)?)', name, re.IGNORECASE)
                if not m:
                    continue
                raw_num = m.group(1)
                if '.' in raw_num:
                    parts = raw_num.split('.')
                    if int(parts[1]) == 0:
                        ch_str = f"{int(parts[0]):03d}"
                    else:
                        ch_str = f"{int(parts[0]):03d}.{parts[1]}"
                else:
                    ch_str = f"{int(raw_num):03d}"
                
                out_name = f"Capitulo {ch_str}.pdf"
                out_path = DEST_DIR / out_name
                
                # Check if already exists and complete
                if out_path.exists() and out_path.stat().st_size > 500000:
                    continue
                    
                enc_name = urllib.parse.quote(name)
                download_url = f"https://archive.org/download/{it}/{enc_name}"
                tasks.append((download_url, out_name))
    except Exception as e:
        print(f"Error al consultar {it}: {e}")

print(f"Capítulos pendientes por descargar: {len(tasks)}")

# Write aria2c input file
input_file = Path("solo_leveling_aria2.txt")
with open(input_file, "w", encoding="utf-8") as f:
    for d_url, out_name in tasks:
        f.write(f"{d_url}\n")
        f.write(f"  dir=E:\\OTAKU\\MANHWAS\\General\\Solo Leveling\n")
        f.write(f"  out={out_name}\n")

print(f"Archivo de descargas generado: {input_file} con {len(tasks)} capítulos.")
