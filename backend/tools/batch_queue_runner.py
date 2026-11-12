import os
import sys
import subprocess
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_MANHWAS = Path(r"E:\OTAKU\MANHWAS\General")

queue = [
    ("Trash_of_Count.torrent", BASE_MANHWAS / "Trash of the Count's Family", "Trash of the Count's Family"),
    ("Latna_Saga.torrent", BASE_MANHWAS / "Latna Saga Survival of a Sword King", "Latna Saga Survival of a Sword King"),
    ("Returners_Magic.torrent", BASE_MANHWAS / "A Returner's Magic Should Be Special", "A Returner's Magic Should Be Special"),
    ("Mount_Hua_Blossoming_Blade.torrent", BASE_MANHWAS / "Return of the Blossoming Blade", "Return of the Blossoming Blade"),
    ("Sweet_Home.torrent", BASE_MANHWAS / "Sweet Home", "Sweet Home"),
    ("Lookism.torrent", BASE_MANHWAS / "Lookism", "Lookism"),
    ("SSS_Suicide_Hunter.torrent", BASE_MANHWAS / "SSS-Class Suicide Hunter", "SSS-Class Suicide Hunter")
]

script_processor = Path(__file__).parent / "process_single_manhwa.py"

for torrent_name, dest_dir, title in queue:
    torrent_file = Path("torrents_manhwa") / torrent_name
    if not torrent_file.exists():
        print(f"Torrent no encontrado: {torrent_file}")
        continue
        
    existing_pdfs = list(dest_dir.glob("*.pdf"))
    if len(existing_pdfs) >= 30:
        print(f"⏩ {title} ya tiene {len(existing_pdfs)} PDFs en disco. Omitiendo...")
        continue
        
    print(f"\n=======================================================")
    print(f"▶️ INICIANDO COLA: {title}")
    print(f"=======================================================")
    cmd = [
        sys.executable,
        str(script_processor),
        str(torrent_file),
        str(dest_dir),
        title
    ]
    res = subprocess.run(cmd)
    print(f"Resultado {title}: Codigo {res.returncode}")

print("\n🎉 COLA DE MANHWAS COMPLETADA AL 100% 🎉")
