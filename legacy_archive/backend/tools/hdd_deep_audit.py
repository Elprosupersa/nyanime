import os
import sys
import json
import shutil

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_ROOT = r"E:\OTAKU"
VIDEO_EXTS = ('.mp4', '.mkv', '.avi', '.ts', '.wmv')
READING_EXTS = ('.pdf', '.cbz', '.cbr')

total, used, free = shutil.disk_usage("E:/")

report = {
    "hdd_status": {
        "total_gb": round(total / (1024**3), 2),
        "used_gb": round(used / (1024**3), 2),
        "free_gb": round(free / (1024**3), 2)
    },
    "anime_general": [],
    "anime_general_missing": [],
    "anime_h": {
        "01_erotico": {"total": 0, "empty": [], "with_content": []},
        "02_festa": {"total": 0, "empty": [], "with_content": []},
        "03_ecchi": {"total": 0, "empty": [], "with_content": []},
        "04_hentai": {"total": 0, "empty_folders": [], "populated": 0}
    },
    "mangas_general": [],
    "mangas_adulto": {"total": 0, "empty": [], "populated": 0},
    "manhwas_general": {"total": 0, "empty": [], "populated": 0},
    "manhwas_adulto": {"total": 0, "empty": [], "populated": 0},
    "manhuas": []
}

print(f"Auditando E:\\OTAKU (Total: {report['hdd_status']['total_gb']} GB | Libre: {report['hdd_status']['free_gb']} GB)...", flush=True)

# 1. ANIME GENERAL
p_anime = os.path.join(BASE_ROOT, "ANIME")
if os.path.exists(p_anime):
    for entry in sorted(os.listdir(p_anime)):
        ep = os.path.join(p_anime, entry)
        if not os.path.isdir(ep) or entry.startswith('.'):
            continue
        vids = [f for r, d, files in os.walk(ep) for f in files if f.lower().endswith(VIDEO_EXTS)]
        subdirs = [d for d in os.listdir(ep) if os.path.isdir(os.path.join(ep, d)) and not d.startswith('.')]
        
        empty_subs = []
        for d in subdirs:
            dp = os.path.join(ep, d)
            dvids = [f for r, sd, files in os.walk(dp) for f in files if f.lower().endswith(VIDEO_EXTS)]
            if len(dvids) == 0:
                empty_subs.append(d)
                
        info = {
            "title": entry,
            "videos": len(vids),
            "subdirs": subdirs,
            "empty_subs": empty_subs
        }
        report["anime_general"].append(info)
        if len(vids) == 0 or empty_subs:
            report["anime_general_missing"].append(info)

# 2. ANIME H
p_anime_h = os.path.join(BASE_ROOT, "ANIME H")
if os.path.exists(p_anime_h):
    subcats = {
        "01 - Erotico (Sin Censura)": "01_erotico",
        "02 - Miniseries Adultas (AnimeFesta)": "02_festa",
        "03 - Heavy Ecchi (Sin Censura BD)": "03_ecchi",
        "04 - Hentai (Sin Censura)": "04_hentai"
    }
    for folder_name, key in subcats.items():
        cp = os.path.join(p_anime_h, folder_name)
        if not os.path.exists(cp):
            continue
        entries = [d for d in os.listdir(cp) if os.path.isdir(os.path.join(cp, d)) and not d.startswith('.')]
        report["anime_h"][key]["total"] = len(entries)
        
        if key == "04_hentai":
            # Optimized fast check
            for s in entries:
                sp = os.path.join(cp, s)
                vids = [f for r, d, files in os.walk(sp) for f in files if f.lower().endswith(VIDEO_EXTS)]
                if len(vids) == 0:
                    report["anime_h"][key]["empty_folders"].append(s)
                else:
                    report["anime_h"][key]["populated"] += 1
        else:
            for s in entries:
                sp = os.path.join(cp, s)
                vids = [f for r, d, files in os.walk(sp) for f in files if f.lower().endswith(VIDEO_EXTS)]
                if len(vids) == 0:
                    report["anime_h"][key]["empty"].append(s)
                else:
                    report["anime_h"][key]["with_content"].append({"title": s, "videos": len(vids)})

# 3. MANGAS
p_mangas = os.path.join(BASE_ROOT, "MANGAS")
if os.path.exists(p_mangas):
    mg = os.path.join(p_mangas, "General")
    if os.path.exists(mg):
        for s in sorted(os.listdir(mg)):
            sp = os.path.join(mg, s)
            if not os.path.isdir(sp): continue
            pdfs = [f for r, d, files in os.walk(sp) for f in files if f.lower().endswith(READING_EXTS)]
            report["mangas_general"].append({"title": s, "pdfs": len(pdfs)})
            
    ma = os.path.join(p_mangas, "+18 Adulto")
    if os.path.exists(ma):
        entries = [d for d in os.listdir(ma) if os.path.isdir(os.path.join(ma, d))]
        report["mangas_adulto"]["total"] = len(entries)
        for s in entries:
            sp = os.path.join(ma, s)
            pdfs = [f for r, d, files in os.walk(sp) for f in files if f.lower().endswith(READING_EXTS)]
            if len(pdfs) == 0:
                report["mangas_adulto"]["empty"].append(s)
            else:
                report["mangas_adulto"]["populated"] += 1

# 4. MANHWAS
p_manhwas = os.path.join(BASE_ROOT, "MANHWAS")
if os.path.exists(p_manhwas):
    mw_g = os.path.join(p_manhwas, "General")
    if os.path.exists(mw_g):
        entries = [d for d in os.listdir(mw_g) if os.path.isdir(os.path.join(mw_g, d))]
        report["manhwas_general"]["total"] = len(entries)
        for s in entries:
            sp = os.path.join(mw_g, s)
            pdfs = [f for r, d, files in os.walk(sp) for f in files if f.lower().endswith(READING_EXTS)]
            if len(pdfs) == 0:
                report["manhwas_general"]["empty"].append(s)
            else:
                report["manhwas_general"]["populated"] += 1
                
    mw_a = os.path.join(p_manhwas, "+18 Adulto")
    if os.path.exists(mw_a):
        entries = [d for d in os.listdir(mw_a) if os.path.isdir(os.path.join(mw_a, d))]
        report["manhwas_adulto"]["total"] = len(entries)
        for s in entries:
            sp = os.path.join(mw_a, s)
            pdfs = [f for r, d, files in os.walk(sp) for f in files if f.lower().endswith(READING_EXTS)]
            if len(pdfs) == 0:
                report["manhwas_adulto"]["empty"].append(s)
            else:
                report["manhwas_adulto"]["populated"] += 1

# 5. MANHUAS
p_manhuas = os.path.join(BASE_ROOT, "MANHUAS")
if os.path.exists(p_manhuas):
    for s in sorted(os.listdir(p_manhuas)):
        sp = os.path.join(p_manhuas, s)
        if not os.path.isdir(sp): continue
        pdfs = [f for r, d, files in os.walk(sp) for f in files if f.lower().endswith(READING_EXTS)]
        report["manhuas"].append({"title": s, "pdfs": len(pdfs)})

with open("hdd_audit_report.json", "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print("AUDITORIA COMPLETADA EXITOSAMENTE. REPORTE GUARDADO.", flush=True)
