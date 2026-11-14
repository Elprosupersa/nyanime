import os
import shutil
from pathlib import Path

BASE = Path(r"E:\OTAKU\ANIME\Seishun Buta Yarou wa Bunny Girl Senpai no Yume wo Minai")
DIR_S1 = BASE / "Temporada 1"
DIR_MOVIES = BASE / "Películas"
DIR_OVAS = BASE / "OVAs y Especiales"
DIR_LN = BASE / "Novelas Ligeras"
DIR_OST = BASE / "Banda Sonora (OST)"

STAGING_S1 = Path(r"E:\_sb_s1")

def check_and_relocate():
    DIR_S1.mkdir(parents=True, exist_ok=True)
    DIR_MOVIES.mkdir(parents=True, exist_ok=True)
    DIR_OVAS.mkdir(parents=True, exist_ok=True)
    
    if STAGING_S1.exists():
        # Scan for MKV files
        for mkv in STAGING_S1.rglob("*.mkv"):
            name = mkv.name
            # If aria2 download is still actively writing (.aria2 exists with same stem)
            aria2_file = mkv.parent / (mkv.name + ".aria2")
            if aria2_file.exists():
                continue # Still downloading
            
            if "S01E" in name:
                target = DIR_S1 / name
                if not target.exists():
                    shutil.move(str(mkv), str(target))
                    print(f"  [Movido a Temporada 1] {name}")
            elif "Movie" in name or "Dreaming Girl" in name:
                target = DIR_MOVIES / name
                if not target.exists():
                    shutil.move(str(mkv), str(target))
                    print(f"  [Movido a Películas] {name}")
            elif "S00E" in name or "Picture Drama" in name:
                target = DIR_OVAS / name
                if not target.exists():
                    shutil.move(str(mkv), str(target))
                    print(f"  [Movido a OVAs] {name}")

if __name__ == "__main__":
    check_and_relocate()
