import urllib.request
import urllib.parse
from bs4 import BeautifulSoup

queries = [
    ('Doom Breaker', 'Suicidal Battle God'),
    ('Mercenary Enrollment', 'Teenage Mercenary'),
    ('Viral Hit', 'Viral Hit'),
    ('Viral Hit', 'How to Fight'),
    ('Nano Machine', 'Nano Machine'),
    ('Legend of the Northern Blade', 'Northern Blade'),
    ('The Greatest Estate Developer', 'Estate Developer'),
    ('Murim Login', 'Murim Login'),
    ('Superhuman Era', 'Superhuman Era'),
    ('The Great Mage Returns', 'Great Mage Returns'),
    ('Reaper of the Drifting Moon', 'Drifting Moon'),
    ('Leveling With the Gods', 'Leveling With the Gods'),
    ('Damn Reincarnation', 'Damn Reincarnation'),
    ('Hero Killer', 'Hero Killer'),
    ('Pick Me Up, Infinite Gacha', 'Pick Me Up'),
    ('Silent War', 'Silent War'),
    ('Bad Thinking Diary', 'Bad Thinking Diary'),
    ('Circles', 'Circles'),
    ('Sweet Home', 'Sweet Home'),
    ('Return of the Blossoming Blade', 'Blossoming Blade'),
    ('Return of the Blossoming Blade', 'Mount Hua')
]

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for title, q in queries:
    url = f"https://nyaa.si/?f=0&c=3_1&q={urllib.parse.quote(q)}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            soup = BeautifulSoup(r.read(), 'html.parser')
            rows = soup.select('table.torrent-list tbody tr')
            if rows:
                print(f"=== {title} (q='{q}') -> {len(rows)} torrents ===")
                for row in rows[:3]:
                    cols = row.select('td')
                    if len(cols) >= 6:
                        t_text = cols[1].select('a')[-1].text.strip()
                        s_text = cols[3].text.strip()
                        dl_elem = cols[2].select_one('a[href^="/download/"]')
                        dl_url = f"https://nyaa.si{dl_elem['href']}" if dl_elem else ''
                        seeds = cols[5].text.strip()
                        print(f"  [{s_text} | Seeds: {seeds}] {t_text} -> {dl_url}")
    except Exception as e:
        print(f"Error {q}: {e}")
