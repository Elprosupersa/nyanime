#!/usr/bin/env python3
import sys
import logging
from pathlib import Path
from src.acquisition.engine import AcquisitionEngine
from src.acquisition.portal import MultiProviderAnimePortal

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("AcquireCLI")

def run_fill_missing():
    portal = MultiProviderAnimePortal()
    library_base = Path("E:/Anime")
    
    census = [
        {
            "series": "One Punch Man",
            "season_folder": "Temporada 1",
            "missing_episodes": [1, 3, 4, 7, 8, 9],
            "aliases": ["One Punch Man", "One-Punch Man"]
        },
        {
            "series": "Solo Leveling",
            "season_folder": "Temporada 1",
            "missing_episodes": [1],
            "aliases": ["Ore dake Level Up na Ken", "Solo Leveling"]
        },
        {
            "series": "Solo Leveling",
            "season_folder": "Temporada 2",
            "missing_episodes": [5, 8, 11],
            "aliases": ["Ore dake Level Up na Ken: Season 2 - Arise from the Shadow", "Solo Leveling Season 2"]
        },
        {
            "series": "Blue Lock",
            "season_folder": "vs U-20 Japan",
            "missing_episodes": [2, 6, 7, 8, 9, 11],
            "aliases": ["Blue Lock vs U-20 Japan", "Blue Lock Season 2", "Blue Lock 2nd Season", "Blue Lock"]
        },
        {
            "series": "Kimetsu no Yaiba",
            "season_folder": "Yuukaku-hen",
            "missing_episodes": [8],
            "aliases": ["Kimetsu no Yaiba: Yuukaku-hen", "Demon Slayer Entertainment District", "Kimetsu no Yaiba Yuukaku-hen"]
        },
        {
            "series": "Kimetsu no Yaiba",
            "season_folder": "Hashira Geiko-hen",
            "missing_episodes": [2, 3, 4, 5, 6, 7, 8],
            "aliases": ["Kimetsu no Yaiba: Hashira Geiko-hen", "Demon Slayer Hashira Training Arc", "Kimetsu no Yaiba Hashira Geiko-hen"]
        },
        {
            "series": "Dr. Stone",
            "season_folder": "Temporada 1",
            "missing_episodes": [3, 6, 8, 10, 13, 14, 15, 18, 23],
            "aliases": ["Dr. Stone", "Dr Stone"]
        },
        {
            "series": "Kimetsu no Yaiba",
            "season_folder": "Temporada 1",
            "missing_episodes": [2, 4, 8, 9, 10, 11, 12, 14, 15, 17, 18, 19, 21, 22, 23, 24],
            "aliases": ["Kimetsu no Yaiba", "Demon Slayer"]
        }
    ]

    logger.info("🚀 [PORTAL MULTI-PROVEEDOR] Iniciando adquisición masiva de huecos en disco...")
    summary = portal.fill_missing_census(census, library_base)
    logger.info(f"📊 Resumen: {summary['completed']}/{summary['total_requested']} completados con éxito.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Módulo de Adquisición de Animes Multi-Proveedor con Auto-Failover")
    parser.add_argument("--dry-run", action="store_true", help="Probar sin descargar")
    parser.add_argument("--add", type=str, help="Añadir un nuevo anime a la lista de suscripciones")
    parser.add_argument("--download", type=str, help="Descargar un anime en específico")
    parser.add_argument("--providers", action="store_true", help="Listar proveedores y estado de salud")
    parser.add_argument("--portal-search", type=str, help="Buscar un anime en todos los portales")
    parser.add_argument("--fill-missing", action="store_true", help="Rellenar los episodios faltantes documentados en CHECKPOINT_PROGRESO.md")
    args = parser.parse_args()

    if args.add:
        with open("subscriptions.yaml", "a", encoding="utf-8") as f:
            f.write(f'  - "{args.add}"\n')
        logger.info(f"✅ Se ha añadido '{args.add}' a tus suscripciones.")
        sys.exit(0)

    if args.providers:
        portal = MultiProviderAnimePortal()
        health = portal.check_providers_health()
        print("\n=== ESTADO DE SALUD DE PROVEEDORES MULTI-PORTAL ===")
        for p in health:
            print(f"• {p['name']:<25} | Status: {p['status']:<10} | Latencia: {p['latency_ms']} ms | URL: {p['url']}")
        print("===================================================\n")
        sys.exit(0)

    if args.portal_search:
        portal = MultiProviderAnimePortal()
        res = portal.search_all_providers(args.portal_search)
        print(f"\nResultados para '{args.portal_search}' ({res['total_found']} hallados):")
        for r in res['results']:
            print(f"• [{r['provider']}] {r['title']} (slug: {r['slug']})")
        sys.exit(0)

    if args.fill_missing:
        run_fill_missing()
        sys.exit(0)

    is_dry_run = args.dry_run
    logger.info("=== Iniciando Módulo de Adquisición Multi-Proveedor (Fase 2) ===")
    if is_dry_run:
        logger.info("MODO DRY-RUN ACTIVADO: No se descargará ningún archivo.")
    
    engine = AcquisitionEngine()
    specific_anime = args.download
    engine.run(dry_run=is_dry_run, specific_anime=specific_anime)
    logger.info("=== Búsqueda de nuevos capítulos finalizada ===")
