import os
import sys
import shutil
import time
import subprocess
import urllib.request
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_ANIME = Path(r"E:\OTAKU\ANIME\Seishun Buta Yarou wa Bunny Girl Senpai no Yume wo Minai")
DIR_S1 = BASE_ANIME / "Temporada 1"
DIR_MOVIES = BASE_ANIME / "Películas"
DIR_OVAS = BASE_ANIME / "OVAs y Especiales"
DIR_OST = BASE_ANIME / "Banda Sonora (OST)"
DIR_LN = BASE_ANIME / "Novelas Ligeras"

BASE_MANGA = Path(r"E:\OTAKU\MANGAS\General\Seishun Buta Yarou wa Bunny Girl Senpai no Yume wo Minai")
DIR_MANGA_OMNIBUS = BASE_MANGA / "Tomos Omnibus"
DIR_MANGA_CAPS = BASE_MANGA / "Capitulos (PDF)"

def setup_directories():
    print("▶️ Creando estructura maestra de carpetas en E:\\OTAKU...")
    for d in [DIR_S1, DIR_MOVIES, DIR_OVAS, DIR_OST, DIR_LN, DIR_MANGA_OMNIBUS, DIR_MANGA_CAPS]:
        d.mkdir(parents=True, exist_ok=True)
    print("  [OK] Estructura creada con éxito.")

def deploy_light_novels():
    print("\n▶️ Desplegando 15 Volúmenes de Novelas Ligeras (Light Novels)...")
    src_dir = Path("scratch/test_ln/[Synthworks] Rascal Does Not Dream English Light Novels 1-15")
    if src_dir.exists():
        files = list(src_dir.glob("*.epub"))
        for f in files:
            dest = DIR_LN / f.name
            if not dest.exists():
                shutil.copy2(f, dest)
                print(f"  [LN Copiada] {f.name}")
            else:
                print(f"  [LN Existe] {f.name}")
        print(f"  [OK] {len(files)} volúmenes de Novela Ligera desplegados en {DIR_LN}")
    else:
        print("  [WARN] Carpeta de LN descargada no encontrada en scratch.")

def download_archive_manga_pdfs():
    print("\n▶️ Descargando capítulos de Manga en PDF desde Internet Archive...")
    base_url = "https://archive.org/download/manga_Seishun_Buta_Yarou_wa_Bunny_Girl_Senpai_no_Yume_o_Minai/"
    
    # 15 capítulos en PDF
    pdf_files = [
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c001 (mag) [cheesyscans].pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c002 (mag) [cheesyscans].pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c003 (mag) [cheesyscans].pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c004 (mag) [cheesyscans].pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c005 (mag) [cheesyscans] {v2}.pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c006 (mag) [cheesyscans].pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c007 (mag) [cheesyscans].pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c008 (mag) [cheesyscans].pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c009 (mag) [cheesyscans].pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c010 (mag) [cheesyscans].pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c011 (mag) [cheesyscans].pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c012 (mag) [cheesyscans].pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c013 (NA) [mag] [Champion Scans].pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c014 (NA) [mag] [Champion Scans].pdf",
        "Seishun Buta Yarou wa Bunny Girl Senpai no Yume o Minai - c015 (NA) [mag] [Champion Scans].pdf"
    ]

    def dl_file(filename):
        dest = DIR_MANGA_CAPS / filename
        if dest.exists() and dest.stat().st_size > 10000:
            return f"  [Existe] {filename}"
        
        encoded = urllib.parse.quote(filename)
        url = base_url + encoded
        headers = {'User-Agent': 'Mozilla/5.0'}
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as r, open(dest, 'wb') as f:
                f.write(r.read())
            return f"  [Descargado] {filename} ({dest.stat().st_size // 1024} KB)"
        except Exception as e:
            return f"  [Error] {filename}: {e}"

    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(dl_file, pdf_files))
        for res in results:
            print(res)
    print("  [OK] Descarga de capítulos de manga finalizada.")

if __name__ == "__main__":
    setup_directories()
    deploy_light_novels()
    download_archive_manga_pdfs()
