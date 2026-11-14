import os
import sys
from pathlib import Path
from mega import Mega

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

target_dir = Path(r"E:\OTAKU\ANIME\Youjo Senki\Películas")
target_dir.mkdir(parents=True, exist_ok=True)

# URL localizada de TioAnime
url = "https://mega.nz/file/zx0RACZC#5fX84Wn9pLgcEIA3_Gy-N2NSsvRBSHupvdZMyyneGKs"

print(f"=== Iniciando descarga de Youjo Senki Movie hacia {target_dir} ===", flush=True)

try:
    mega = Mega()
    m = mega.login()
    print("Conexión anónima a Mega establecida con éxito.", flush=True)
    downloaded_file = m.download_url(url, dest_path=str(target_dir))
    print(f"✅ ¡Descarga completada exitosamente! Archivo: {downloaded_file}", flush=True)
except Exception as e:
    print(f"❌ Error al descargar desde Mega: {e}", flush=True)
    # Intentar con el segundo enlace de JKAnime
    url2 = "https://mega.nz/file/arh10KSJ#ZXk2aB8_ooMFlJPsHuNphUmkDquUvIULAh7cHBURF_E"
    try:
        print(f"Reintentando con enlace alternativo JKAnime: {url2}", flush=True)
        downloaded_file = m.download_url(url2, dest_path=str(target_dir))
        print(f"✅ ¡Descarga completada exitosamente con enlace alternativo! Archivo: {downloaded_file}", flush=True)
    except Exception as e2:
        print(f"❌ Falló enlace alternativo: {e2}", flush=True)
