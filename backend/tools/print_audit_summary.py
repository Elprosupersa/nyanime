import json

with open('hdd_audit_report.json', 'r', encoding='utf-8') as f:
    rep = json.load(f)

print("=== 1. ANIME GENERAL ===")
print(f"Total series: {len(rep['anime_general'])}")
print(f"Series con elementos faltantes o carpetas vacias: {len(rep['anime_general_missing'])}")
for m in rep['anime_general_missing']:
    print(f"  - {m['title']}: subcarpetas vacias -> {m['empty_subs']}, total videos: {m['videos']}")

print("\n=== 2. ANIME H ===")
for k, data in rep["anime_h"].items():
    if k == '04_hentai':
        print(f"  {k}: Total series {data['total']} | Con videos {data['populated']} | VACIAS (0 videos): {len(data['empty_folders'])}")
    else:
        print(f"  {k}: Total series {data['total']} | Con videos {len(data['with_content'])} | VACIAS (0 videos): {len(data['empty'])}")
        if data['empty']:
            print(f"     Vacías: {data['empty']}")

print("\n=== 3. MANGAS ===")
print(f"MANGAS General ({len(rep['mangas_general'])} series):")
for m in rep['mangas_general']:
    print(f"  - {m['title']}: {m['pdfs']} PDFs")
print(f"MANGAS +18 Adulto ({rep['mangas_adulto']['total']} series): Con contenido {rep['mangas_adulto']['populated']} | VACIAS: {len(rep['mangas_adulto']['empty'])}")
if rep['mangas_adulto']['empty']:
    print(f"  Muestra de vacíos (primeros 15): {rep['mangas_adulto']['empty'][:15]}")

print("\n=== 4. MANHWAS ===")
print(f"MANHWAS General ({rep['manhwas_general']['total']} series): Con contenido {rep['manhwas_general']['populated']} | VACIAS: {len(rep['manhwas_general']['empty'])}")
if rep['manhwas_general']['empty']:
    print(f"  Muestra de vacíos (primeros 15): {rep['manhwas_general']['empty'][:15]}")
print(f"MANHWAS +18 Adulto ({rep['manhwas_adulto']['total']} series): Con contenido {rep['manhwas_adulto']['populated']} | VACIAS: {len(rep['manhwas_adulto']['empty'])}")
if rep['manhwas_adulto']['empty']:
    print(f"  Muestra de vacíos (primeros 15): {rep['manhwas_adulto']['empty'][:15]}")

print("\n=== 5. MANHUAS ===")
print(f"MANHUAS ({len(rep['manhuas'])} series):")
for m in rep['manhuas']:
    print(f"  - {m['title']}: {m['pdfs']} PDFs")
