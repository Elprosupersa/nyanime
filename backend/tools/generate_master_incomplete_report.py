import os
import sys
import json
import shutil
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_ROOT = Path(r"E:\OTAKU")
VIDEO_EXTS = ('.mp4', '.mkv', '.avi', '.ts', '.wmv')
READING_EXTS = ('.pdf', '.cbz', '.cbr', '.zip')

total, used, free = shutil.disk_usage("E:/")

audit = {
    "disk": {
        "total_gb": round(total / (1024**3), 2),
        "used_gb": round(used / (1024**3), 2),
        "free_gb": round(free / (1024**3), 2)
    },
    "anime_general": {
        "total_series": 0,
        "complete_series": 0,
        "incomplete_series": []
    },
    "mangas_general": {
        "total_series": 0,
        "series": []
    },
    "manhwas_general": {
        "total_series": 0,
        "populated": [],
        "empty": []
    },
    "mangas_adulto": {
        "total_series": 0,
        "populated_count": 0,
        "empty_count": 0,
        "empty_list": []
    },
    "manhwas_adulto": {
        "total_series": 0,
        "populated_count": 0,
        "empty_count": 0,
        "empty_list": []
    },
    "manhuas": {
        "total_series": 0,
        "series": []
    },
    "anime_h": {
        "01_erotico": {"total": 0, "empty": [], "with_content": []},
        "02_festa": {"total": 0, "empty": [], "with_content": []},
        "03_ecchi": {"total": 0, "empty": [], "with_content": []},
        "04_hentai": {"total": 0, "populated": 0, "empty_count": 0, "empty_sample": []}
    }
}

# 1. ANIME GENERAL
p_anime = BASE_ROOT / "ANIME"
if p_anime.exists():
    for entry in sorted(p_anime.iterdir()):
        if not entry.is_dir() or entry.name.startswith('.'):
            continue
        audit["anime_general"]["total_series"] += 1
        vids = [f for f in entry.rglob("*") if f.suffix.lower() in VIDEO_EXTS]
        
        # Check empty subfolders
        empty_subs = []
        for sub in entry.iterdir():
            if sub.is_dir() and not sub.name.startswith('.'):
                sub_vids = [f for f in sub.rglob("*") if f.suffix.lower() in VIDEO_EXTS]
                sub_docs = [f for f in sub.rglob("*") if f.suffix.lower() in READING_EXTS]
                if len(sub_vids) == 0 and len(sub_docs) == 0:
                    empty_subs.append(sub.name)
        
        if len(vids) == 0 or empty_subs:
            audit["anime_general"]["incomplete_series"].append({
                "title": entry.name,
                "video_count": len(vids),
                "empty_subfolders": empty_subs
            })
        else:
            audit["anime_general"]["complete_series"] += 1

# 2. MANGAS GENERAL
p_mg = BASE_ROOT / "MANGAS" / "General"
if p_mg.exists():
    for entry in sorted(p_mg.iterdir()):
        if not entry.is_dir() or entry.name.startswith('.'):
            continue
        audit["mangas_general"]["total_series"] += 1
        docs = [f for f in entry.rglob("*") if f.suffix.lower() in READING_EXTS]
        audit["mangas_general"]["series"].append({
            "title": entry.name,
            "docs_count": len(docs)
        })

p_wistoria = BASE_ROOT / "MANGAS" / "Wistoria"
if p_wistoria.exists() and p_wistoria.is_dir():
    audit["mangas_general"]["total_series"] += 1
    docs = [f for f in p_wistoria.rglob("*") if f.suffix.lower() in READING_EXTS]
    audit["mangas_general"]["series"].append({
        "title": "Wistoria",
        "docs_count": len(docs)
    })

# 3. MANHWAS GENERAL
p_mwg = BASE_ROOT / "MANHWAS" / "General"
if p_mwg.exists():
    for entry in sorted(p_mwg.iterdir()):
        if not entry.is_dir() or entry.name.startswith('.'):
            continue
        audit["manhwas_general"]["total_series"] += 1
        docs = [f for f in entry.rglob("*") if f.suffix.lower() in READING_EXTS]
        if len(docs) == 0:
            audit["manhwas_general"]["empty"].append(entry.name)
        else:
            audit["manhwas_general"]["populated"].append({
                "title": entry.name,
                "docs_count": len(docs)
            })

# 4. MANGAS +18 Adulto
p_ma = BASE_ROOT / "MANGAS" / "+18 Adulto"
if p_ma.exists():
    for entry in sorted(p_ma.iterdir()):
        if not entry.is_dir() or entry.name.startswith('.'):
            continue
        audit["mangas_adulto"]["total_series"] += 1
        docs = [f for f in entry.rglob("*") if f.suffix.lower() in READING_EXTS]
        if len(docs) == 0:
            audit["mangas_adulto"]["empty_count"] += 1
            audit["mangas_adulto"]["empty_list"].append(entry.name)
        else:
            audit["mangas_adulto"]["populated_count"] += 1

# 5. MANHWAS +18 Adulto
p_mwa = BASE_ROOT / "MANHWAS" / "+18 Adulto"
if p_mwa.exists():
    for entry in sorted(p_mwa.iterdir()):
        if not entry.is_dir() or entry.name.startswith('.'):
            continue
        audit["manhwas_adulto"]["total_series"] += 1
        docs = [f for f in entry.rglob("*") if f.suffix.lower() in READING_EXTS]
        if len(docs) == 0:
            audit["manhwas_adulto"]["empty_count"] += 1
            audit["manhwas_adulto"]["empty_list"].append(entry.name)
        else:
            audit["manhwas_adulto"]["populated_count"] += 1

# 6. MANHUAS
p_mh = BASE_ROOT / "MANHUAS"
if p_mh.exists():
    for entry in sorted(p_mh.iterdir()):
        if not entry.is_dir() or entry.name.startswith('.'):
            continue
        audit["manhuas"]["total_series"] += 1
        docs = [f for f in entry.rglob("*") if f.suffix.lower() in READING_EXTS]
        audit["manhuas"]["series"].append({
            "title": entry.name,
            "docs_count": len(docs)
        })

# 7. ANIME H
p_ah = BASE_ROOT / "ANIME H"
if p_ah.exists():
    cats = {
        "01 - Erotico (Sin Censura)": "01_erotico",
        "02 - Miniseries Adultas (AnimeFesta)": "02_festa",
        "03 - Heavy Ecchi (Sin Censura BD)": "03_ecchi",
        "04 - Hentai (Sin Censura)": "04_hentai"
    }
    for folder_name, k in cats.items():
        cp = p_ah / folder_name
        if not cp.exists(): continue
        for entry in sorted(cp.iterdir()):
            if not entry.is_dir() or entry.name.startswith('.'):
                continue
            audit["anime_h"][k]["total"] += 1
            vids = [f for f in entry.rglob("*") if f.suffix.lower() in VIDEO_EXTS]
            if k == "04_hentai":
                if len(vids) == 0:
                    audit["anime_h"][k]["empty_count"] += 1
                    if len(audit["anime_h"][k]["empty_sample"]) < 10:
                        audit["anime_h"][k]["empty_sample"].append(entry.name)
                else:
                    audit["anime_h"][k]["populated"] += 1
            else:
                if len(vids) == 0:
                    audit["anime_h"][k]["empty"].append(entry.name)
                else:
                    audit["anime_h"][k]["with_content"].append({
                        "title": entry.name,
                        "video_count": len(vids)
                    })

with open("master_incomplete_audit.json", "w", encoding="utf-8") as f:
    json.dump(audit, f, ensure_ascii=False, indent=2)

print("AUDITORIA MAESTRA COMPLETADA EXITOSAMENTE.")
