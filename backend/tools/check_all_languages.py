import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import json
from src.acquisition.mangadex_client import MangaDexClient

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

client = MangaDexClient()

with open('purged_restored_metadata.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

ratings = ["safe", "suggestive", "erotica", "pornographic"]
print(f"Checking available languages for {len(items)} items on MangaDex (with contentRatings):")
for item in items:
    title = item.get('title')
    m_id = item.get('id')
    try:
        params = [('limit', 100)]
        for r in ratings:
            params.append(('contentRating[]', r))
        res = client._request('GET', f'https://api.mangadex.org/manga/{m_id}/feed', params=params)
        if res.status_code == 200:
            data = res.json().get('data', [])
            langs = {}
            for ch in data:
                l = ch['attributes'].get('translatedLanguage')
                langs[l] = langs.get(l, 0) + 1
            print(f"- {title} ({m_id}): {langs}")
        else:
            print(f"- {title}: HTTP {res.status_code}")
    except Exception as e:
        print(f"- {title}: Error {e}")
