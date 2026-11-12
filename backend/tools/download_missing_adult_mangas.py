import os
import sys
import json
import time
import logging
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.acquisition.manga_downloader import MangaPipeline
from src.acquisition.mangadex_client import MangaDexClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("AdultMangaRunner")

TARGET_ROOT = r"E:\OTAKU\MANGAS\+18 Adulto"

def main():
    pipeline = MangaPipeline(output_root=TARGET_ROOT, max_workers=16, chapter_workers=4)
    client = pipeline.client
    
    with open("master_incomplete_audit.json", "r", encoding="utf-8") as f:
        audit = json.load(f)
    
    empty_list = audit.get("mangas_adulto", {}).get("empty_list", [])
    logger.info(f"Iniciando adquisición para {len(empty_list)} series de Mangas +18 Adulto...")
    
    success_count = 0
    for idx, name in enumerate(empty_list, 1):
        meta_path = os.path.join(TARGET_ROOT, name, "manga_info.json")
        if not os.path.exists(meta_path):
            logger.warning(f"[{idx}/{len(empty_list)}] No se encontró manga_info.json para '{name}'.")
            continue
        
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        
        m_id = meta.get("id")
        logger.info(f"[{idx}/{len(empty_list)}] Procesando: {name} (UUID: {m_id})")
        
        # 1. Probar en español primero ('es', 'es-la')
        ch_es = client.get_all_chapters_feed(m_id, languages=["es", "es-la"])
        target_langs = ["es", "es-la"]
        
        # 2. Si no hay en español, probar en inglés ('en')
        if not ch_es:
            ch_en = client.get_all_chapters_feed(m_id, languages=["en"])
            if ch_en:
                logger.info(f"   -> No hay caps en español, pero hay {len(ch_en)} en inglés. Adquiriendo en inglés...")
                target_langs = ["en"]
            else:
                logger.warning(f"   -> Sin capítulos en español ni inglés en MangaDex para '{name}'.")
                continue
        else:
            logger.info(f"   -> Encontrados {len(ch_es)} capítulos en Español.")
        
        try:
            ok = pipeline.process_manga(
                title=name,
                custom_name=name,
                languages=target_langs,
                mangadex_id=m_id,
                manga_override=meta
            )
            if ok:
                success_count += 1
                logger.info(f"✅ Obra '{name}' procesada con éxito.")
        except Exception as e:
            logger.error(f"❌ Error procesando '{name}': {e}")
        
        time.sleep(0.5)

    logger.info("=" * 60)
    logger.info(f"🏁 Proceso concluido. Series exitosas: {success_count}/{len(empty_list)}")
    logger.info("=" * 60)

if __name__ == "__main__":
    main()
