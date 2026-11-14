import os
import json

base_anime = r'E:\OTAKU\ANIME'
video_exts = ('.mp4', '.mkv', '.avi', '.ts', '.wmv')

anime_stats = []

for entry in sorted(os.listdir(base_anime)):
    ep = os.path.join(base_anime, entry)
    if not os.path.isdir(ep):
        continue
    vids = [f for r, d, files in os.walk(ep) for f in files if f.lower().endswith(video_exts)]
    subdirs = [d for d in os.listdir(ep) if os.path.isdir(os.path.join(ep, d))]
    anime_stats.append({
        'title': entry,
        'videos': len(vids),
        'subdirs': subdirs
    })

print(f"Total series en {base_anime}: {len(anime_stats)}")
empty_anime = [a for a in anime_stats if a['videos'] == 0]
few_vids = [a for a in anime_stats if 0 < a['videos'] < 12]
good_vids = [a for a in anime_stats if a['videos'] >= 12]

print(f"\nSeries con 0 videos: {len(empty_anime)}")
for a in empty_anime:
    print(f"  - {a['title']}")

print(f"\nSeries con pocos videos (<12 eps): {len(few_vids)}")
for a in few_vids:
    print(f"  - {a['title']}: {a['videos']} videos | subcarpetas: {a['subdirs']}")

print(f"\nSeries con 12 o mas videos: {len(good_vids)}")

with open('audit_general_anime.json', 'w', encoding='utf-8') as f:
    json.dump(anime_stats, f, ensure_ascii=False, indent=2)
