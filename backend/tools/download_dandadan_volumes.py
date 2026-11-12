import os
import sys
import subprocess
from pathlib import Path

target_dir = Path(r"E:\OTAKU\MANGAS\General\Dandadan")
target_dir.mkdir(parents=True, exist_ok=True)

base_url = "https://archive.org/download/dandadan_202604"

volumes = [
    ("Tomo 01.pdf", "Dandadan%20v01%20%282022%29.pdf"),
    ("Tomo 02.pdf", "Dandadan%20v02%20%282023%29.pdf"),
    ("Tomo 03.pdf", "Dandadan%20v03%20%282023%29.pdf"),
    ("Tomo 04.pdf", "Dandadan%20v04%20%282023%29.pdf"),
    ("Tomo 05.pdf", "Dandadan%20v05%20%282023%29.pdf"),
    ("Tomo 06.pdf", "Dandadan%20v06%20%282024%29.pdf"),
    ("Tomo 07.pdf", "Dandadan%20v07%20%282024%29.pdf"),
    ("Tomo 08.pdf", "Dandadan%20v08%20%282024%29.pdf"),
    ("Tomo 09.pdf", "Dandadan%20v09%20%282024%29.pdf"),
    ("Tomo 10.pdf", "Dandadan%20v10%20%282024%29.pdf"),
    ("Tomo 11.pdf", "Dandadan%20v11%20%282025%29.pdf"),
    ("Tomo 12.pdf", "Dandadan%20v12%20%282025%29.pdf"),
    ("Tomo 13.pdf", "Dandadan%20v13%20%282025%29.pdf"),
    ("Tomo 14.pdf", "Dandadan%20v14%282025%29.pdf"),
    ("Tomo 15.pdf", "Dandadan%20v15.pdf"),
]

# Generate aria2 input file
input_txt = target_dir / "aria2_dandadan.txt"
with open(input_txt, "w", encoding="utf-8") as f:
    for out_name, remote_name in volumes:
        dest_pdf = target_dir / out_name
        if dest_pdf.exists() and dest_pdf.stat().st_size > 5000000:
            print(f"Skipping already existing: {out_name}")
            continue
        url = f"{base_url}/{remote_name}"
        f.write(f"{url}\n")
        f.write(f"  dir={target_dir}\n")
        f.write(f"  out={out_name}\n")

print(f"Lanzando aria2c para descargar los tomos de Dandadan...")
cmd = [
    "aria2c",
    "-s", "16",
    "-x", "16",
    "-k", "1M",
    "-j", "4",
    "--file-allocation=none",
    "-i", str(input_txt)
]
subprocess.run(cmd)
print("✅ Descarga de tomos de Dandadan finalizada.")
