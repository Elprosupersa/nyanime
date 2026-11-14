import urllib.request
import urllib.parse
import json

titles = [
    'Nano Machine',
    'Northern Blade',
    'Estate Developer',
    'Doom Breaker',
    'Mercenary Enrollment',
    'Murim Login',
    'Superhuman Era',
    'Great Mage Returns',
    'Drifting Moon',
    'Leveling With the Gods',
    'Damn Reincarnation',
    'Pick Me Up',
    'Hero Killer',
    'Silent War',
    'Bad Thinking Diary',
    'Circles',
    'My Stepmom',
    'S-Flower'
]

headers = {'User-Agent': 'Mozilla/5.0'}

for t in titles:
    q = urllib.parse.quote(f'{t} AND (mediatype:texts OR mediatype:data)')
    url = f'https://archive.org/advancedsearch.php?q={q}&fl[]=identifier,title,mediatype,publicdate&sort[]=downloads+desc&rows=2&output=json'
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            docs = json.loads(r.read()).get('response', {}).get('docs', [])
            if docs:
                print(f'=== {t} ===')
                for d in docs:
                    print(f"  [{d.get('identifier')}] {d.get('title')}")
    except Exception as e:
        pass
