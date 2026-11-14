import urllib.request
import urllib.parse
from bs4 import BeautifulSoup
import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def check_nyaa_movie4():
    queries = [
        "Dear Friend 1080p",
        "Dear Friend movie",
        "Seishun Buta Yarou Dear Friend",
        "Rascal Does Not Dream of a Dear Friend"
    ]
    
    found = []
    headers = {'User-Agent': 'Mozilla/5.0'}
    for q in queries:
        url = f"https://nyaa.si/?f=0&c=1_2&q={urllib.parse.quote(q)}"
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                soup = BeautifulSoup(r.read(), 'html.parser')
                for row in soup.select('table.torrent-list tbody tr'):
                    cols = row.select('td')
                    if len(cols) >= 6:
                        title = cols[1].select('a')[-1].text.strip()
                        if any(w in title.lower() for w in ['mkv', 'mp4', 'bdrip', 'web-dl', 'webrip']):
                            dl_tag = cols[2].select_one('a[href^="/download/"]')
                            if dl_tag and 'href' in dl_tag.attrs:
                                dl_url = "https://nyaa.si" + dl_tag['href']
                                found.append({'title': title, 'size': cols[3].text.strip(), 'url': dl_url})
        except Exception:
            pass
    return found

if __name__ == "__main__":
    res = check_nyaa_movie4()
    if res:
        print(f"¡ENCONTRADO RELEASE DE PELICULA 4! ({len(res)} disponibles)")
        for r in res:
            print(" ", r)
    else:
        print("Película 4 aún sin ripeo digital público (exclusiva en salas de cine de Japón desde el 16 de Octubre de 2026).")
