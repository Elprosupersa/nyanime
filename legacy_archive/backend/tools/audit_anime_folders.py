import os
import json

base_dirs = {
    'ANIME': r'E:\OTAKU\ANIME',
    'ANIME H': r'E:\OTAKU\ANIME H'
}

video_exts = ('.mp4', '.mkv', '.avi', '.ts', '.wmv')

results = {}

for cat_name, root in base_dirs.items():
    results[cat_name] = {'empty': [], 'populated': []}
    if not os.path.exists(root):
        continue
    for root_dir, dirs, files in os.walk(root):
        rel = os.path.relpath(root_dir, root)
        if rel == '.':
            continue
        vids = [f for f in files if f.lower().endswith(video_exts)]
        if vids:
            results[cat_name]['populated'].append({'path': rel, 'videos_count': len(vids)})
        elif len(dirs) == 0:
            results[cat_name]['empty'].append(rel)

print("=== AUDITORIA COMPLETA DE DIRECTORIOS ===")
for cat, data in results.items():
    print(f"\nCategoria: {cat}")
    print(f"Carpetas con videos: {len(data['populated'])}")
    print(f"Carpetas hoja sin videos (VACIAS): {len(data['empty'])}")
    if data['empty']:
        print("Muestra de vacias (primeras 30):")
        for item in data['empty'][:30]:
            print(f"  - {item}")

with open('audit_empty_folders.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print("\nGuardado exitosamente en audit_empty_folders.json")
