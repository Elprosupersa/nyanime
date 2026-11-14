import os
import re
import logging
from typing import List, Dict, Any, Optional, Set
from pathlib import Path
import yaml
from .plugins.base import BaseScraper, EpisodeResult
from .tracker import Tracker
from .indexer import LibraryIndexer
from .utils import extract_episode_number, clean_title_for_search

logger = logging.getLogger("AcquisitionEngine")

class AcquisitionEngine:
    def __init__(self, config_path: str = "config.yaml"):
        self.config_path = config_path
        self.config = self._load_config()
        from .portal import MultiProviderAnimePortal
        self.portal = MultiProviderAnimePortal(config_path=self.config_path)
        self.plugins: List[BaseScraper] = self.portal.providers
        self.tracker = Tracker()
        self.library_path = Path(self.config.get('paths', {}).get('library', self.config.get('general', {}).get('library_path', 'E:/Anime')))
        self.indexer = LibraryIndexer(self.library_path)

    def _load_config(self) -> Dict[str, Any]:
        if os.path.exists(self.config_path):
            with open(self.config_path, "r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
        return {}

    def _load_plugins(self):
        """Carga e inicializa los plugins activos según la configuración."""
        from .plugins.az_animex import AZAnimexScraper
        from .plugins.fukou_da_direct import FukouDaDirectScraper
        from .plugins.jkanime import JKAnimeScraper
        from .plugins.fukou_da import FukouDaScraper
        from .plugins.animejara import AnimeJaraScraper
        from .plugins.henaojara import HenaoJaraScraper
        from .plugins.animeonline_ninja import AnimeOnlineNinjaScraper
        from .plugins.sphinxanime import SphinxAnimeScraper
        from .plugins.younime import YounimeScraper
        from .plugins.dw_anime import DWAnimeScraper
        from .plugins.unionfansub import UnionFansubScraper

        # Prioridad estricta y ordenada de plugins
        available_plugins = [
            AZAnimexScraper(),
            FukouDaDirectScraper(),
            JKAnimeScraper(),
            FukouDaScraper(),
            AnimeJaraScraper(),
            HenaoJaraScraper(),
            AnimeOnlineNinjaScraper(),
            SphinxAnimeScraper(),
            YounimeScraper(),
            DWAnimeScraper(),
            UnionFansubScraper()
        ]
        
        self.plugins = available_plugins
        logger.info(f"Cargados {len(self.plugins)} plugins de adquisición en orden de prioridad.")

    def get_subscriptions(self) -> List[str]:
        """Obtiene la lista de animes seguidos o suscritos."""
        subs_file = "subscriptions.yaml"
        if os.path.exists(subs_file):
            try:
                with open(subs_file, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
                    return data.get("animes", [])
            except Exception as e:
                logger.error(f"Error leyendo subscriptions.yaml: {e}")
        return []

    def _find_anime_directory(self, anime_name: str, franchise_nodes: Optional[List[Dict[str, Any]]] = None) -> Optional[Path]:
        """Busca una carpeta existente en la biblioteca que coincida con el nombre del anime o sus alias/franquicia."""
        if not self.library_path.exists():
            return None

        # Cargar aliases si existen
        alias_map = {}
        alias_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "aliases.json")
        if os.path.exists(alias_file):
            try:
                import json
                with open(alias_file, "r", encoding="utf-8") as f:
                    alias_map = json.load(f)
            except Exception as e:
                logger.error(f"Error cargando aliases en _find_anime_directory: {e}")

        # Recopilar todos los nombres posibles para este anime
        candidate_names = [anime_name]
        if anime_name in alias_map:
            candidate_names.append(alias_map[anime_name])
        for k, v in alias_map.items():
            if v.lower() == anime_name.lower():
                candidate_names.append(k)

        if franchise_nodes:
            for node in franchise_nodes:
                if node.get('title'): candidate_names.append(node['title'])
                if node.get('english'): candidate_names.append(node['english'])
                if node.get('synonyms'): candidate_names.extend(node['synonyms'])

        clean_candidates = [re.sub(r'[^a-zA-Z0-9]', '', n).lower() for n in candidate_names if n]

        # 1. Coincidencia exacta limpia
        for item in self.library_path.iterdir():
            if item.is_dir() and not item.name.startswith('.'):
                clean_item = re.sub(r'[^a-zA-Z0-9]', '', item.name).lower()
                if clean_item in clean_candidates:
                    return item

        # 2. Coincidencia por contención (ej: 'rezero' dentro de 'rezerokarahajimeruisekaiseikatsu')
        for item in self.library_path.iterdir():
            if item.is_dir() and not item.name.startswith('.'):
                clean_item = re.sub(r'[^a-zA-Z0-9]', '', item.name).lower()
                if len(clean_item) >= 4:
                    for cand in clean_candidates:
                        if len(cand) >= 4 and (clean_item in cand or cand in clean_item):
                            return item

        return None

    def _try_download_episode(self, anime_name: str, search_titles: List[str], ep_num: int, target_dir: Path, dry_run: bool) -> bool:
        ep_str = f"{ep_num:02d}"
        found_result = False
        
        # --- ALIAS SYSTEM ---
        alias_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "aliases.json")
        try_titles = search_titles.copy()
        if os.path.exists(alias_file):
            try:
                import json
                with open(alias_file, "r", encoding="utf-8") as f:
                    aliases = json.load(f)
                for title in search_titles:
                    if title in aliases:
                        try_titles.append(aliases[title])
                        logger.info(f"Alias manual añadido para la búsqueda: '{title}' -> '{aliases[title]}'")
            except Exception as e:
                logger.error(f"Error leyendo aliases.json: {e}")
                
        # Eliminar duplicados manteniendo el orden y añadir versiones sin tildes
        import unicodedata
        seen = set()
        unique_try_titles = []
        for t in try_titles:
            if t and t not in seen:
                seen.add(t)
                unique_try_titles.append(t)
            
            if t:
                normalized = unicodedata.normalize('NFKD', t).encode('ASCII', 'ignore').decode('utf-8')
                if normalized and normalized not in seen:
                    seen.add(normalized)
                    unique_try_titles.append(normalized)

        res = self.portal.download_episode_with_failover(
            anime_name=anime_name,
            episode_number=ep_num,
            target_dir=target_dir,
            search_titles=unique_try_titles,
            dry_run=dry_run
        )
        if res.get("success"):
            self.tracker.mark_downloaded(anime_name, ep_str, res.get("used_provider", "MultiProvider"), "1080p")
            return True
        return False

    def run(self, specific_anime: Optional[str] = None, dry_run: bool = False):
        """Ejecuta el ciclo de búsqueda y descarga para las suscripciones configuradas o un anime específico."""
        if not self.library_path.exists():
            logger.error(f"¡El disco duro o carpeta de destino no está conectado o accesible! ({self.library_path})")
            return

        if specific_anime:
            animes = [specific_anime]
        else:
            animes = self.get_subscriptions()
            
        if not animes:
            logger.info("No hay animes para rastrear o descargar.")
            return

        if not self.plugins:
            logger.warning("No hay plugins cargados en el motor de adquisición.")
            return
            
        from .chronology import AnimeChronology
        chrono = AnimeChronology()

        for original_anime in animes:
            logger.info(f"==================================================")
            logger.info(f"🚀 INICIANDO SINCRONIZACIÓN DE: {original_anime}")
            logger.info(f"==================================================")
            
            franchise_nodes = chrono.get_franchise_chronology(original_anime)
            anime_dir = self._find_anime_directory(original_anime, franchise_nodes)
            
            if not anime_dir:
                safe_orig_name = "".join([c for c in original_anime if c.isalnum() or c in ' -_']).strip()
                anime_dir = self.library_path / safe_orig_name
                if not dry_run:
                    anime_dir.mkdir(parents=True, exist_ok=True)
            
            # 1. Consolidar carpetas antiguas o legadas automáticamente
            consolidation_report = self.indexer.consolidate_anime_library(anime_dir, franchise_nodes, dry_run=dry_run)
            if consolidation_report.get("moved", 0) > 0 or consolidation_report.get("duplicates_removed", 0) > 0:
                logger.info(f"📦 Consolidación de biblioteca: {consolidation_report['moved']} archivos organizados, {consolidation_report['duplicates_removed']} duplicados eliminados.")

            # 2. Escanear inventario físico completo de la franquicia en disco
            existing_by_node = self.indexer.scan_anime_episodes(anime_dir, franchise_nodes)
            
            total_downloads_needed = 0
            
            for index, node in enumerate(franchise_nodes):
                current_season = index + 1
                current_anime_name = node['title']
                total_episodes = node.get('episodes')
                std_folder = self.indexer.get_standard_folder_for_node(node)
                target_dir = anime_dir / std_folder
                
                existing_eps = set(existing_by_node.get(index, set()))
                
                # Sincronizar también con la carpeta destino directamente por si hubo descargas recientes
                if target_dir.exists():
                    for f in target_dir.iterdir():
                        if f.is_file() and f.suffix.lower() in ['.mp4', '.mkv', '.avi']:
                            ep_num = extract_episode_number(f.name)
                            if ep_num is not None:
                                existing_eps.add(ep_num)
                
                search_titles = [current_anime_name]
                if node.get('english'):
                    search_titles.append(node['english'])
                if node.get('synonyms'):
                    search_titles.extend(node['synonyms'])
                
                eps_str_info = f"{total_episodes} eps" if total_episodes else "en emisión"
                logger.info(f"\n--- [Parte {current_season}/{len(franchise_nodes)}] {current_anime_name} ({eps_str_info}) -> Carpeta: '{std_folder}' ---")
                
                # CASO A: Temporada con total de episodios conocido
                if total_episodes:
                    # Calcular lista exacta de episodios que faltan
                    missing_eps = [ep for ep in range(1, total_episodes + 1) if ep not in existing_eps]
                    
                    if not missing_eps:
                        logger.info(f"✅ {std_folder} está 100% COMPLETO ({len(existing_eps)}/{total_episodes} episodios en disco). Omitiendo búsqueda.")
                        continue
                        
                    logger.info(f"📥 Faltan {len(missing_eps)} episodios de {total_episodes}: {missing_eps}")
                    total_downloads_needed += len(missing_eps)
                    
                    for ep in missing_eps:
                        logger.info(f"🔍 Buscando episodio faltante: {current_anime_name} - Episodio {ep:02d}/{total_episodes:02d}...")
                        found = self._try_download_episode(current_anime_name, search_titles, ep, target_dir, dry_run)
                        if found:
                            existing_eps.add(ep)
                
                # CASO B: Anime en emisión o sin número total de episodios fijo
                else:
                    max_ep = max(existing_eps) if existing_eps else 0
                    
                    # 1. Buscar posibles huecos previos (ej: 1, 2, 4 -> falta el 3)
                    if max_ep > 1:
                        holes = [ep for ep in range(1, max_ep + 1) if ep not in existing_eps]
                        for ep in holes:
                            logger.info(f"🔍 Buscando episodio intermedio faltante: {current_anime_name} - Episodio {ep:02d}...")
                            found = self._try_download_episode(current_anime_name, search_titles, ep, target_dir, dry_run)
                            if found:
                                existing_eps.add(ep)
                    
                    # 2. Buscar nuevos episodios a partir de max_ep + 1
                    next_ep = max_ep + 1
                    consecutive_failures = 0
                    logger.info(f"📡 Verificando si hay nuevos episodios emitidos a partir del Ep {next_ep:02d}...")
                    
                    while True:
                        found = self._try_download_episode(current_anime_name, search_titles, next_ep, target_dir, dry_run)
                        if found:
                            existing_eps.add(next_ep)
                            next_ep += 1
                            consecutive_failures = 0
                            total_downloads_needed += 1
                        else:
                            consecutive_failures += 1
                            if consecutive_failures >= 3:
                                logger.info(f"No hay más episodios disponibles para {current_anime_name} (último verificado: Ep {next_ep:02d}).")
                                break
                            else:
                                next_ep += 1

            if not dry_run and anime_dir and anime_dir.exists():
                try:
                    from src.metadata.media_manager import MediaManager
                    mm = MediaManager()
                    mm.enrich_anime_directory(anime_dir, original_anime)
                except Exception as e:
                    logger.debug(f"No se pudieron generar metadatos multimedia para {original_anime}: {e}")

            if total_downloads_needed == 0:
                logger.info(f"\n🎉 ¡Franquicia '{original_anime}' ya está 100% al día en tu disco duro! No se requirió ninguna descarga.")
            else:
                logger.info(f"\n✨ Sincronización completada para '{original_anime}'.")
                
            logger.info(f"==================================================\n")
