import json, os, sys, glob, re, time, psutil
sys.stdout.reconfigure(encoding='utf-8')

def sanitize_filename(name):
    # remove invalid chars without raw angle brackets in bash/powershell strings
    for ch in r'\/*?:"<>|':
        name = name.replace(ch, '_')
    return re.sub(r'\s+', ' ', name).strip(' .')

with open('catalog_h_top150.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
catalog = data['series']

processed = []
pending = []
for i, item in enumerate(catalog):
    t = sanitize_filename(item['title'])
    target_dir = os.path.join(r'E:\Manga_H', t)
    if os.path.isdir(target_dir):
        pdfs = glob.glob(os.path.join(target_dir, '**/*.pdf'), recursive=True)
        processed.append((i+1, t, len(pdfs)))
    else:
        pending.append((i+1, t))

print(f"Total en catalogo: {len(catalog)}")
print(f"Series procesadas en E:\\Manga_H: {len(processed)} / {len(catalog)}")
total_pdfs = sum(p[2] for p in processed)
total_bytes = sum(os.path.getsize(p) for p in glob.glob(r'E:\Manga_H\**\*.pdf', recursive=True))
print(f"Total PDFs generados en E:\\Manga_H: {total_pdfs} ({total_bytes / (1024**3):.2f} GB)")

print("\nUltimas 5 series procesadas:")
for idx, title, count in processed[-5:]:
    print(f"  #{idx} {title}: {count} PDFs")

if pending:
    print(f"\nSiguiente serie pendiente en cola: #{pending[0][0]} {pending[0][1]}")
    print(f"Total series pendientes: {len(pending)}")
else:
    print("\n¡Todas las 150 series han sido procesadas!")

# Network speed test
t0 = time.time()
net0 = psutil.net_io_counters().bytes_recv
time.sleep(2)
t1 = time.time()
net1 = psutil.net_io_counters().bytes_recv
mbps = (net1 - net0) * 8 / (t1 - t0) / 1_000_000
print(f"\nVelocidad de red instantanea: {mbps:.2f} Mbps")

# Check disk space
usage = psutil.disk_usage('E:\\')
print(f"Espacio libre en E:\\: {usage.free / (1024**3):.2f} GB libre ({usage.percent}% usado)")
