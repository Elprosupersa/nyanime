import os
import sys
import datetime
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

anime_root = Path('E:/Anime')
all_entries = []

# 1. Main anime folders
try:
    for entry in os.scandir(anime_root):
        if entry.is_dir() and not entry.name.startswith('0'):
            try:
                st = entry.stat()
                mtime = st.st_mtime
                dt = datetime.datetime.fromtimestamp(mtime)
                all_entries.append({
                    'category': 'Anime TV / General',
                    'name': entry.name,
                    'path': entry.path,
                    'date': dt
                })
            except Exception:
                pass
except Exception as e:
    print(f"Error escaneando raiz: {e}")

# 2. Categorized folders
categories = [
    ('01 - Erotico (Sin Censura)', 'Erotico'),
    ('02 - Miniseries Adultas (AnimeFesta)', 'AnimeFesta'),
    ('03 - Heavy Ecchi (Sin Censura BD)', 'Ecchi BD'),
    ('04 - Hentai (Sin Censura)', 'Coleccion Hentai')
]

for cat_folder, cat_label in categories:
    cat_dir = anime_root / cat_folder
    if cat_dir.exists():
        try:
            for entry in os.scandir(cat_dir):
                if entry.is_dir():
                    try:
                        st = entry.stat()
                        mtime = st.st_mtime
                        dt = datetime.datetime.fromtimestamp(mtime)
                        all_entries.append({
                            'category': cat_label,
                            'name': entry.name,
                            'path': entry.path,
                            'date': dt
                        })
                    except Exception:
                        pass
        except Exception as e:
            print(f"Error escaneando {cat_folder}: {e}")

all_entries.sort(key=lambda x: x['date'], reverse=True)

print(f"Total de series censadas en E:/Anime: {len(all_entries)}")
print("\nTop 25 mas recientes en el disco HDD:")
for i, item in enumerate(all_entries[:25], 1):
    d_str = item['date'].strftime('%Y-%m-%d %H:%M')
    print(f"{i:2d}. [{d_str}] [{item['category']}] {item['name']}")

out_file = anime_root / 'LISTA_COMPLETA_ANIMES_HDD.txt'
with open(out_file, 'w', encoding='utf-8') as f:
    f.write('='*85 + '\n')
    f.write('INVENTARIO COMPLETO DE ANIMES EN EL DISCO HDD E:\\Anime (ORDENADO POR FECHA)\n')
    f.write(f'Fecha del Censo: {datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}\n')
    f.write(f'Total de Series / Franquicias Registradas: {len(all_entries)}\n')
    f.write('='*85 + '\n\n')
    for i, item in enumerate(all_entries, 1):
        d_str = item['date'].strftime('%Y-%m-%d %H:%M')
        f.write(f"{i:4d}. [{d_str}] [{item['category']}] {item['name']}\n")

print(f"\nArchivo guardado con exito en: {out_file}")
