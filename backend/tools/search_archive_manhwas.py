import urllib.request
import urllib.parse
import json

search_titles = [
    'Legend of the Northern Blade',
    'Nano Machine',
    'The Greatest Estate Developer',
    'SSS-Class Suicide Hunter',
    'Doom Breaker',
    'Mercenary Enrollment',
    'Murim Login',
    'Superhuman Era',
    'The Great Mage Returns After 4000 Years',
    'Reaper of the Drifting Moon',
    'Leveling With the Gods',
    'Damn Reincarnation',
    'Hero Killer',
    'Silent War',
    'Bad Thinking Diary',
    'Circles',
    'My Stepmom',
    'S-Flower'
]

headers = {'User-Agent': 'Mozilla/5.0'}

for t in search_titles:
    q = urllib.parse.quote(f'{t} manhwa')
    url = f'https://archive.org/advancedsearch.php?q={q}&fl[]=identifier,title,mediatype&rows=3&output=json'
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            docs = data.get('response', {}).get('docs', [])
            if docs:
                print(f'=== Archive.org: {t} ===')
                for d in docs:
                    print(f"  [{d.get('mediatype')}] {d.get('title')} -> {d.get('identifier')}")
    except Exception as e:
        print(f'Error en {t}: {e}')
