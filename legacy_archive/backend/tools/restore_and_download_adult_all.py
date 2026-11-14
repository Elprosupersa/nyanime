import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import json
import time
import logging
from src.acquisition.manga_downloader import MangaPipeline
from src.acquisition.mangadex_client import MangaDexClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("AdultRestorer")

RATINGS = ["safe", "suggestive", "erotica", "pornographic"]

MANGAS_4 = [
    {"title": "Ase to Sekken Kodomo Tsukuru Hon", "id": "3b1e8a5f-39f5-45e2-8315-1f84a5217b28"},
    {"title": "Onozuka-senpai wa Warui Hito", "id": "44b50c0c-8f1e-4b49-988d-a4a30428e94e"},
    {"title": "Sasete kureru Gimai to no 3-gatsu 3-nichi", "id": "94ebc600-3b51-45cf-9513-d4473ddff125"},
    {"title": "Sousou no Frieren - Chinchin ga Ookiku Naru Mahou (Doujinshi)", "id": "48e38031-2e40-43ad-9766-09fe9864e388"}
]

MANHWAS_15 = [
    {"title": "Dirty ♥ Vibration", "id": "d90380ad-cb4f-450f-b621-17b4d6b6cb9c"},
    {"title": "Him & Him & Him", "id": "e5a1aede-0d04-44af-86fd-47d91739156b"},
    {"title": "Gwisingwa Haneun Namja", "id": "049c6714-40a7-404b-9dac-ec86126bc242"},
    {"title": "Palace of Bardo", "id": "2e7d7dea-5f0c-4306-9f5c-6b3e048b825d"},
    {"title": "True Colors", "id": "5aa7c006-105d-442b-9904-5c034642945a"},
    {"title": "Pervert Club", "id": "42fc32af-b0b6-4633-9c2d-944990513456"},
    {"title": "The Lord of the Harem", "id": "f1778e3e-e5dd-445f-b32d-7b7ad5ca2b4a"},
    {"title": "Don't Be Like This! Son-in-Law", "id": "f4b9afaa-cdd8-4c53-b6b2-8e928934ef14"},
    {"title": "Marie and Alex", "id": "f52a62e8-411b-4a76-b3e5-1de4b67e9e4b"},
    {"title": "Dangerous Convenience Store", "id": "a30885ec-a0d8-45fc-aa24-e200cb20a12d"},
    {"title": "Odd Love", "id": "45ab80dd-6dc1-4ad4-ad5c-c1ad0d527586"},
    {"title": "Love Is an Illusion", "id": "07eadf44-b1be-45df-9e7f-4262bfabcd2b"},
    {"title": "Virtual Strangers", "id": "28f5775f-e932-4799-9b52-b6e0471a3adc"},
    {"title": "Hard-Boiled Love", "id": "16679621-cd0a-414d-8403-e5a542c40fb5"},
    {"title": "Sun's Blood", "id": "eae40d4c-fa03-489b-9e9b-686f02b3153a"}
]

def process_batch(items, target_root, category_name):
    pipeline = MangaPipeline(output_root=target_root, max_workers=16, chapter_workers=4)
    client = pipeline.client
    
    logger.info(f"=== INICIANDO RESTAURACIÓN Y ADQUISICIÓN: {category_name} ({len(items)} series) ===")
    success = 0
    for idx, item in enumerate(items, 1):
        name = item["title"]
        m_id = item["id"]
        logger.info(f"[{idx}/{len(items)}] Evaluando: {name} ({m_id})")
        
        # 1. Probar español ('es', 'es-la')
        ch_es = client.get_all_chapters_feed(m_id, languages=["es", "es-la"], content_ratings=RATINGS)
        target_langs = ["es", "es-la"]
        
        if not ch_es:
            # 2. Probar inglés ('en')
            ch_en = client.get_all_chapters_feed(m_id, languages=["en"], content_ratings=RATINGS)
            if ch_en:
                logger.info(f"   -> {len(ch_en)} capítulos encontrados en Inglés.")
                target_langs = ["en"]
            else:
                # 3. Fallback a cualquier idioma disponible
                res = client._request('GET', f'https://api.mangadex.org/manga/{m_id}/feed', params=[('limit', 100)] + [('contentRating[]', r) for r in RATINGS])
                avail_langs = list(set(ch['attributes'].get('translatedLanguage') for ch in res.json().get('data', []) if ch['attributes'].get('translatedLanguage')))
                if avail_langs:
                    logger.info(f"   -> Fallback multilingüe disponible: {avail_langs}")
                    target_langs = avail_langs
                else:
                    logger.warning(f"   -> Sin capítulos digitales en ningún idioma en MangaDex para '{name}'. Creando ficha estructurada.")
                    manga_dir = Path(target_root) / name
                    manga_dir.mkdir(parents=True, exist_ok=True)
                    m_data = client.get_manga_by_id(m_id)
                    if m_data:
                        cov_rel = next((r for r in m_data.get('relationships', []) if r.get('type') == 'cover_art'), None)
                        if cov_rel and 'attributes' in cov_rel:
                            client.download_cover(m_id, cov_rel['attributes']['fileName'], manga_dir / 'poster.jpg')
                    continue
        else:
            logger.info(f"   -> {len(ch_es)} capítulos encontrados en Español.")
            
        try:
            ok = pipeline.process_manga(
                title=name,
                custom_name=name,
                languages=target_langs,
                mangadex_id=m_id
            )
            if ok:
                success += 1
                logger.info(f"✅ Obra '{name}' restaurada y poblada con éxito.")
        except Exception as e:
            logger.error(f"❌ Error en '{name}': {e}")
            
        time.sleep(0.5)
        
    logger.info(f"=== FIN DE LOTE {category_name}: {success}/{len(items)} series pobladas con éxito ===")

def main():
    # 1. Procesar 4 Mangas +18
    process_batch(MANGAS_4, r"E:\OTAKU\MANGAS\+18 Adulto", "MANGAS +18 ADULTO")
    
    # 2. Procesar 15 Manhwas +18
    process_batch(MANHWAS_15, r"E:\OTAKU\MANHWAS\+18 Adulto", "MANHWAS +18 ADULTO")
    
    # 3. Regenerar reporte maestro de auditoría
    logger.info("Regenerando auditoría maestra...")
    os.system(f"python {PROJECT_ROOT}/tools/generate_master_incomplete_report.py")

if __name__ == "__main__":
    main()
