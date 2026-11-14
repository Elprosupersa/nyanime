import urllib.request
import os

torrents = [
    # (name, nyaa_id)
    ("Noblesse_PDF.torrent", "1298175"),
    ("Sweet_Home.torrent", "1764585"),
    ("Lookism.torrent", "1541033"),
    ("Mount_Hua_Blossoming_Blade.torrent", "2005935"),
    ("Returners_Magic.torrent", "1894966"),
    ("Latna_Saga.torrent", "1766905"),
    ("Second_Life_Ranker.torrent", "1837470"),
    ("Perfect_Half.torrent", "1551298"),
    ("Player_Who_Cant_Level_Up.torrent", "1800569"),
    ("Landlord_Sisters.torrent", "1619941"),
    ("Trash_of_Count.torrent", "1563231"),
    ("Disaster_Class_Hero.torrent", "1674143"),
    ("What_Does_The_Fox_Say.torrent", "1591497"),
    ("Overgeared.torrent", "1560016")
]

dest_dir = "torrents_manhwa"
os.makedirs(dest_dir, exist_ok=True)

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for fname, nid in torrents:
    url = f"https://nyaa.si/download/{nid}.torrent"
    out_path = os.path.join(dest_dir, fname)
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as r, open(out_path, 'wb') as f:
            f.write(r.read())
        print(f"Descargado: {fname} ({os.path.getsize(out_path)} bytes)")
    except Exception as e:
        print(f"Error descargando {fname} (ID {nid}): {e}")
