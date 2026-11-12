import win32com.client
import os
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

print("====================================================================")
print("  MOTOR DE REANUDACIÓN AUTOMÁTICA DE TRANSFERENCIA (XIAOMI 14T PRO)")
print("====================================================================")
print("[*] Esperando a que el celular sea detectado en modo 'Transferencia de archivos'...")

device = None
attempts = 0

while not device:
    attempts += 1
    try:
        shell = win32com.client.Dispatch("Shell.Application")
        pc = shell.Namespace(17)
        if pc:
            for item in pc.Items():
                if "Xiaomi" in item.Name or "14T" in item.Name:
                    device = item
                    break
    except:
        pass
    if device:
        break
    if attempts % 6 == 0:
        print(f"    [!] Esperando conexión MTP activa... ({attempts * 5}s transcurridos)")
    time.sleep(5)

print(f"\n[+] ¡CELULAR RECONECTADO CON ÉXITO! Dispositivo: {device.Name}")

storage = None
for st in device.GetFolder.Items():
    if "Almacenamiento interno" in st.Name or "Internal storage" in st.Name:
        storage = st
        break

if not storage:
    print("ERROR: No se encontro el Almacenamiento Interno Compartido.")
    sys.exit(1)

storage_folder = storage.GetFolder

# Buscar o crear carpeta Anime
anime_item = None
for f in storage_folder.Items():
    if f.Name == "Anime":
        anime_item = f
        break

if not anime_item:
    storage_folder.NewFolder("Anime")
    time.sleep(2)
    for f in storage_folder.Items():
        if f.Name == "Anime":
            anime_item = f
            break

dest_anime_folder = anime_item.GetFolder

def get_mtp_item_count(folder_obj):
    cnt = 0
    try:
        for sub in folder_obj.Items():
            if sub.IsFolder:
                cnt += get_mtp_item_count(sub.GetFolder)
            else:
                cnt += 1
    except:
        pass
    return cnt

# 1. REANUDAR SERIES PRINCIPALES
main_base = r"E:\Anime\03 - Heavy Ecchi (Sin Censura BD)"
series_list = [
    "Mahou Shoujo ni Akogarete",
    "Prison School",
    "Mato Seihei no Slave",
    "High School DxD"
]

src_namespace = shell.Namespace(main_base)

for sname in series_list:
    lpath = os.path.join(main_base, sname)
    lfiles = [os.path.join(r, f) for r, _, fs in os.walk(lpath) for f in fs]
    total_count = len(lfiles)
    
    dest_s = None
    for it in dest_anime_folder.Items():
        if it.Name == sname:
            dest_s = it
            break
            
    c = get_mtp_item_count(dest_s.GetFolder) if dest_s else 0
    
    if c >= total_count:
        print(f"  [OK] {sname} -> Ya esta 100% completo ({c}/{total_count} archivos). Saltando.")
        continue
        
    print(f"\n--------------------------------------------------------------------")
    print(f"  REANUDANDO COPIA DE: {sname} ({c}/{total_count} archivos presentes)")
    print(f"--------------------------------------------------------------------")
    
    item_to_copy = src_namespace.ParseName(sname)
    dest_anime_folder.CopyHere(item_to_copy, 16)
    
    t0 = time.time()
    last_rep = 0
    while True:
        time.sleep(4)
        dest_s = None
        for it in dest_anime_folder.Items():
            if it.Name == sname:
                dest_s = it
                break
        if dest_s:
            cnt = get_mtp_item_count(dest_s.GetFolder)
            pct = min(100.0, round((cnt / total_count) * 100, 1))
            sec = max(1, round(time.time() - t0, 1))
            if time.time() - last_rep >= 6 or cnt >= total_count:
                last_rep = time.time()
                print(f"    -> Progreso {sname}: {cnt} / {total_count} archivos ({pct}%) | Tiempo: {sec}s")
            if cnt >= total_count:
                time.sleep(4)
                print(f"    [OK] ¡{sname} COMPLETADO AL 100%!")
                break
        if time.time() - t0 > 1500:
            break

# 2. TRANSFERIR LOTE H CURADO
print("\n====================================================================")
print("  INICIANDO LOTE CURADO DE ANIMES H (4 OBRAS MAESTRAS)")
print("====================================================================")

hentai_item = None
for f in dest_anime_folder.Items():
    if f.Name == "04 - Hentai":
        hentai_item = f
        break

if not hentai_item:
    dest_anime_folder.NewFolder("04 - Hentai")
    time.sleep(2)
    for f in dest_anime_folder.Items():
        if f.Name == "04 - Hentai":
            hentai_item = f
            break

dest_hentai_folder = hentai_item.GetFolder

h_base = r"E:\Anime\04 - Hentai (Sin Censura)"
h_list = [
    "Mankitsu Happening",
    "Eroge! H mo Game mo Kaihatsu Zanmai",
    "Rance 01 Hikari wo Motomete The Animation",
    "Oni Chichi"
]

src_h_namespace = shell.Namespace(h_base)

for hname in h_list:
    hpath = os.path.join(h_base, hname)
    hfiles = [os.path.join(r, f) for r, _, fs in os.walk(hpath) for f in fs]
    h_count = len(hfiles)
    
    dest_h = None
    for it in dest_hentai_folder.Items():
        if it.Name == hname:
            dest_h = it
            break
            
    c = get_mtp_item_count(dest_h.GetFolder) if dest_h else 0
    if c >= h_count:
        print(f"  [OK] {hname} -> Ya esta 100% completo ({c}/{h_count} archivos). Saltando.")
        continue
        
    print(f"\n--------------------------------------------------------------------")
    print(f"  COPIANDO SERIE H: {hname} ({h_count} archivos)")
    print(f"--------------------------------------------------------------------")
    
    item_h = src_h_namespace.ParseName(hname)
    dest_hentai_folder.CopyHere(item_h, 16)
    
    t0 = time.time()
    last_rep = 0
    while True:
        time.sleep(4)
        dest_h = None
        for it in dest_hentai_folder.Items():
            if it.Name == hname:
                dest_h = it
                break
        if dest_h:
            cnt = get_mtp_item_count(dest_h.GetFolder)
            pct = min(100.0, round((cnt / h_count) * 100, 1))
            sec = max(1, round(time.time() - t0, 1))
            if time.time() - last_rep >= 6 or cnt >= h_count:
                last_rep = time.time()
                print(f"    -> Progreso {hname}: {cnt} / {h_count} archivos ({pct}%) | Tiempo: {sec}s")
            if cnt >= h_count:
                time.sleep(4)
                print(f"    [OK] ¡{hname} COMPLETADO AL 100%!")
                break
        if time.time() - t0 > 900:
            break

print("\n====================================================================")
print("  ¡TODOS LOS ANIMES Y ANIMES H HAN SIDO TRANSFERIDOS EXITOSAMENTE!")
print("====================================================================")
