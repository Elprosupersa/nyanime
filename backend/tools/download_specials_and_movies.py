import os
import sys
from pathlib import Path

# Configurar salida UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.acquisition.plugins.jkanime import JKAnimeScraper
from src.acquisition.downloader import Downloader

def download_specials():
    jk = JKAnimeScraper()
    
    tasks = [
        {
            "series": "Dr. Stone",
            "title_slug": "dr-stone-ryuusui",
            "ep": 1,
            "target_dir": r"E:\OTAKU\ANIME\Dr. Stone\Ryusui"
        },
        {
            "series": "Kaguya-sama wa Kokurasetai",
            "title_slug": "kaguya-sama-wa-kokurasetai-first-kiss-wa-owaranai",
            "ep": 1,
            "target_dir": r"E:\OTAKU\ANIME\Kaguya-sama wa Kokurasetai\Películas"
        }
    ]
    
    for t in tasks:
        td = Path(t["target_dir"])
        td.mkdir(parents=True, exist_ok=True)
        print(f"=== Procesando: {t['series']} -> {td} ===", flush=True)
        
        res = jk.search_episode(t["title_slug"], t["ep"])
        if res:
            print(f"  Encontrado: {res.download_url}", flush=True)
            downloader = Downloader(str(td))
            success = downloader.download(res)
            if success:
                print(f"  ✅ Descarga exitosa de {t['series']}!", flush=True)
            else:
                print(f"  ❌ Falló la descarga de {t['series']}.", flush=True)
        else:
            print(f"  ❌ No se encontró fuente para {t['title_slug']}", flush=True)

if __name__ == "__main__":
    download_specials()
