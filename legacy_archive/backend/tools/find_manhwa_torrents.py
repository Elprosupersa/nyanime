import urllib.request
import urllib.parse
from bs4 import BeautifulSoup

search_list = [
    'Nano Machine',
    'Northern Blade',
    'Estate Developer',
    'Suicide Hunter',
    'Doom Breaker',
    'Teenage Mercenary',
    'Murim Login',
    'Viral Hit',
    'Superhuman Era',
    'Great Mage Returns',
    'Drifting Moon',
    'Leveling With the Gods',
    'Player Who Can',
    'Damn Reincarnation',
    'Hero Killer',
    'Silent War',
    'Bad Thinking Diary',
    'Circles',
    'Landlord Sisters',
    'My Stepmom',
    'S-Flower'
]

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for s in search_list:
    url = f'https://nyaa.si/?f=0&c=0_0&q={urllib.parse.quote(s)}'
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            soup = BeautifulSoup(r.read(), 'html.parser')
            rows = soup.select('table.torrent-list tbody tr')
            found = []
            for row in rows:
                cols = row.select('td')
                if len(cols) >= 6:
                    title_elem = cols[1].select('a')[-1]
                    title = title_elem.text.strip()
                    size = cols[3].text.strip()
                    dl_elem = cols[2].select_one('a[href^="/download/"]')
                    dl_url = f'https://nyaa.si{dl_elem["href"]}' if dl_elem else ''
                    seeders = cols[5].text.strip()
                    found.append((title, size, seeders, dl_url))
            if found:
                print(f'=== {s} ({len(found)} resultados) ===')
                for f_t, f_s, f_seed, f_u in found[:3]:
                    print(f'  [{f_s} | Seeds: {f_seed}] {f_t} -> {f_u}')
    except Exception as e:
        print(f'Error en {s}: {e}')
