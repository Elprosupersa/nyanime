import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

with open('catalog_h_top150.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

series = data.get('series', [])

targets = [
    'Dangerous Convenience Store', 'Dirty', "Don't Be Like This",
    'Gwisingwa Haneun Namja', 'Hard-Boiled Love', 'Him', 'Love Is an Illusion',
    'Marie and Alex', 'Odd Love', 'Palace of Bardo', 'Pervert Club', "Sun's Blood",
    'The Lord of the Harem', 'True Colors', 'Virtual Strangers',
    'Ase to Sekken', 'Onozuka', 'Sasete kureru Gimai', 'Sousou no Frieren - Chinchin'
]

found = []
for s in series:
    t = s.get('title', '')
    for tgt in targets:
        if tgt.lower() in t.lower():
            found.append(s)
            break

print(f"Found {len(found)} entries in catalog_h_top150.json:")
for item in found:
    print(f"- {item.get('title')} (ID: {item.get('id')})")

with open('purged_restored_metadata.json', 'w', encoding='utf-8') as out:
    json.dump(found, out, indent=2, ensure_ascii=False)

print("Saved to purged_restored_metadata.json")
