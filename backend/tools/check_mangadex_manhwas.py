import urllib.request
import urllib.parse
import json
import time

titles = [
    "A Returner's Magic Should Be Special",
    "Bad Thinking Diary",
    "Circles",
    "Damn Reincarnation",
    "Doom Breaker",
    "Hero Killer",
    "Landlord Sisters",
    "Latna Saga Survival of a Sword King",
    "Legend of the Northern Blade",
    "Leveling With the Gods",
    "Lookism",
    "Mercenary Enrollment",
    "Murim Login",
    "My Stepmom",
    "Nano Machine",
    "Noblesse",
    "Overgeared",
    "Perfect Half",
    "Pick Me Up, Infinite Gacha",
    "Player Who Can't Level Up",
    "Reaper of the Drifting Moon",
    "Return of the Blossoming Blade",
    "Return of the Disaster-Class Hero",
    "S-Flower",
    "Second Life Ranker",
    "Silent War",
    "SSS-Class Suicide Hunter",
    "Superhuman Era",
    "Sweet Home",
    "The Great Mage Returns After 4000 Years",
    "The Greatest Estate Developer",
    "Trash of the Count's Family",
    "Viral Hit",
    "What Does the Fox Say"
]

results = {}

for t in titles:
    # simplify query
    clean_t = t.replace("'", "").replace(",", "")
    q = urllib.parse.quote(clean_t)
    url = f"https://api.mangadex.org/manga?title={q}&limit=3"
    req = urllib.request.Request(url, headers={'User-Agent': 'AntigravityDownloader/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            mangas = data.get('data', [])
            if mangas:
                m = mangas[0]
                m_id = m.get('id')
                # get title in en or default
                title_obj = m.get('attributes', {}).get('title', {})
                m_title = list(title_obj.values())[0] if title_obj else clean_t
                
                # Check available chapters in es, es-la, en
                ch_url = f"https://api.mangadex.org/manga/{m_id}/aggregate?translatedLanguage[]=es&translatedLanguage[]=es-la&translatedLanguage[]=en"
                ch_req = urllib.request.Request(ch_url, headers={'User-Agent': 'AntigravityDownloader/1.0'})
                time.sleep(0.3)
                with urllib.request.urlopen(ch_req, timeout=10) as ch_r:
                    ch_data = json.loads(ch_r.read())
                    vols = ch_data.get('volumes', {})
                    total_ch = sum(len(v.get('chapters', {})) for v in vols.values())
                    print(f"MangaDex: {t} -> ID: {m_id} | Titulo: {m_title} | Capitulos Disp: {total_ch}")
                    results[t] = {"id": m_id, "title": m_title, "chapters": total_ch}
            else:
                print(f"MangaDex: {t} -> NO ENCONTRADO")
                results[t] = None
    except Exception as e:
        print(f"Error en {t}: {e}")
        results[t] = None
    time.sleep(0.3)

with open("mangadex_manhwas_audit.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print("AUDITORIA MANGADEX FINALIZADA")
