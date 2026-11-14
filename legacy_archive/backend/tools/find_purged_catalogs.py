import json, os, sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

manhwa_15 = [
    'Dangerous Convenience Store', 'Dirty', "Don't Be Like This",
    'Gwisingwa Haneun Namja', 'Hard-Boiled Love', 'Him', 'Love Is an Illusion',
    'Marie and Alex', 'Odd Love', 'Palace of Bardo', 'Pervert Club', "Sun's Blood",
    'The Lord of the Harem', 'True Colors', 'Virtual Strangers'
]
manga_4 = [
    'Ase to Sekken', 'Onozuka',
    'Sasete kureru Gimai',
    'Sousou no Frieren - Chinchin'
]

for root, _, files in os.walk('.'):
    for f in files:
        if f.endswith('.json'):
            path = os.path.join(root, f)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as jf:
                    content = jf.read()
                    found_m = [t for t in manhwa_15 if t in content]
                    found_mg = [t for t in manga_4 if t in content]
                    if found_m or found_mg:
                        print(f'Found in {path}: Manhwas {len(found_m)}, Mangas {len(found_mg)}')
            except Exception:
                pass
