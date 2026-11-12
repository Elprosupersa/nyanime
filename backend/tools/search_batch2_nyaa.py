import urllib.request
import urllib.parse
from bs4 import BeautifulSoup
import json

queries = [
    ("Nano Machine", "Nano Mashin"),
    ("Nano Machine", "Nano Machine manhwa"),
    ("Legend of the Northern Blade", "Northern Blade"),
    ("The Greatest Estate Developer", "Estate Developer"),
    ("The Greatest Estate Developer", "Greatest Estate"),
    ("SSS-Class Suicide Hunter", "Suicide Hunter"),
    ("SSS-Class Suicide Hunter", "Revival Hunter"),
    ("Doom Breaker", "Suicidal Battle God"),
    ("Mercenary Enrollment", "Teenage Mercenary"),
    ("Mercenary Enrollment", "Mercenary Enrollment"),
    ("Murim Login", "Murim Login"),
    ("Viral Hit", "How to Fight"),
    ("Superhuman Era", "Superhuman Era"),
    ("The Great Mage Returns After 4000 Years", "Great Mage Returns"),
    ("Reaper of the Drifting Moon", "Drifting Moon"),
    ("Leveling With the Gods", "Leveling with the Gods"),
    ("Damn Reincarnation", "Damn Reincarnation"),
    ("Hero Killer", "Hero Killer webtoon"),
    ("Silent War", "My Kingdom"),
    ("Silent War", "Silent War manhwa"),
    ("Bad Thinking Diary", "Bad Thinking Diary"),
    ("Circles", "Circles JAXX"),
    ("Circles", "Circles manhwa"),
    ("My Stepmom", "My Stepmom manhwa"),
    ("S-Flower", "S-Flower"),
    ("Pick Me Up, Infinite Gacha", "Pick Me Up Infinite Gacha"),
    ("Pick Me Up, Infinite Gacha", "Pick Me Up Gacha")
]

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
results = {}

for target_title, q_str in queries:
    url = f"https://nyaa.si/?f=0&c=0_0&q={urllib.parse.quote(q_str)}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            soup = BeautifulSoup(r.read(), 'html.parser')
            rows = soup.select('table.torrent-list tbody tr')
            for row in rows:
                cols = row.select('td')
                if len(cols) >= 6:
                    t_text = cols[1].select('a')[-1].text.strip()
                    s_text = cols[3].text.strip()
                    dl_elem = cols[2].select_one('a[href^="/download/"]')
                    dl_url = f"https://nyaa.si{dl_elem['href']}" if dl_elem else ''
                    seeders = cols[5].text.strip()
                    
                    # Check if it looks like manga/webtoon
                    if any(w in t_text.lower() for w in ['ch', 'chapter', 'v0', 'vol', 'digital', 'webtoon', 'manhwa', 'tapas', 'tappytoon', 'cbr', 'cbz', 'pdf']):
                        if target_title not in results:
                            results[target_title] = []
                        results[target_title].append({
                            "query": q_str,
                            "title": t_text,
                            "size": s_text,
                            "seeders": seeders,
                            "url": dl_url
                        })
    except Exception as e:
        print(f"Error {q_str}: {e}")

with open("nyaa_batch2_results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f"Búsqueda finalizada. Títulos con resultados: {len(results)}")
for k, v in results.items():
    print(f"  {k}: {len(v)} torrents encontrados")
