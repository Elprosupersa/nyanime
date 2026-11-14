import os
import re
import hashlib
import logging
import yaml
from pathlib import Path
from typing import Dict, List, Set, Any, Optional, Tuple

from .utils import extract_episode_number, clean_title_for_search
from src.metadata.standardizer import NamingStandardizer

logger = logging.getLogger("AcquisitionIndexer")

class LibraryIndexer:
    """
    Escáner e indexador inteligente de la biblioteca en disco duro.
    Detecta qué episodios ya están descargados físicamente para cada parte de la franquicia,
    sin importar si están en carpetas con nombres en español ('Temporada 1'), en inglés ('Season 01'),
    en romaji ('Dungeon ni Deai...'), o con tags de resolución.
    """
    def __init__(self, library_path: Path):
        self.library_path = Path(library_path)
        self.exceptions = self._load_exceptions()

    def _load_exceptions(self) -> Dict[str, Any]:
        exceptions_path = Path("exceptions.yaml")
        if exceptions_path.exists():
            try:
                with open(exceptions_path, "r", encoding="utf-8") as f:
                    return yaml.safe_load(f) or {}
            except Exception as e:
                logger.error(f"Error cargando exceptions.yaml en indexer: {e}")
        return {}

    @staticmethod
    def get_file_quick_hash(file_path: Path) -> str:
        """Calcula un hash MD5 ultra rápido basado en los primeros 64KB + últimos 64KB + tamaño del archivo."""
        try:
            sz = file_path.stat().st_size
            with open(file_path, "rb") as f:
                head = f.read(65536)
                if sz > 65536:
                    f.seek(max(0, sz - 65536))
                    tail = f.read(65536)
                else:
                    tail = b""
            return hashlib.md5(head + tail + str(sz).encode()).hexdigest()
        except Exception as e:
            logger.debug(f"No se pudo calcular hash para {file_path}: {e}")
            return ""

    def get_standard_folder_for_node(self, node: Dict[str, Any]) -> str:
        """Determina el nombre de carpeta estandarizado para un nodo de la franquicia."""
        title = node.get("title", "")
        format_type = node.get("format")
        
        # 1. Chequear excepciones personalizadas
        if self.exceptions:
            matched_key = None
            for key, data in self.exceptions.items():
                if title.lower() == key.lower():
                    matched_key = key
                    break
                if "alias_web" in data:
                    if any(alias.lower() in title.lower() for alias in data["alias_web"]):
                        matched_key = key
                        break
            if matched_key:
                rules = self.exceptions[matched_key].get("estructura", [])
                for rule in rules:
                    if "match" in rule and rule["match"].lower() in title.lower():
                        return rule["folder"]

        # 2. Usar standardizer general
        return NamingStandardizer.parse_folder_name(title, format_type=format_type)

    def clean_internal_folder_duplicates(self, folder: Path, dry_run: bool = False) -> int:
        """Elimina archivos duplicados idénticos dentro de una misma carpeta usando hash MD5."""
        if not folder.exists() or not folder.is_dir():
            return 0
        
        seen_hashes = {}
        duplicates_removed = 0
        for f in sorted(list(folder.iterdir())):
            if f.is_file() and f.suffix.lower() in ['.mp4', '.mkv', '.avi']:
                h = self.get_file_quick_hash(f)
                if not h:
                    continue
                if h in seen_hashes:
                    logger.info(f"Eliminando duplicado interno: {f.name} (idéntico a {seen_hashes[h]})")
                    if not dry_run:
                        f.unlink()
                    duplicates_removed += 1
                else:
                    seen_hashes[h] = f.name
        return duplicates_removed

    def scan_anime_episodes(self, anime_dir: Path, franchise_nodes: List[Dict[str, Any]]) -> Dict[int, Set[int]]:
        """
        Escanea todas las carpetas y archivos dentro del directorio del anime.
        Retorna un diccionario { node_index: set(episodios_existentes) }.
        """
        results: Dict[int, Set[int]] = {i: set() for i in range(len(franchise_nodes))}
        if not anime_dir.exists() or not anime_dir.is_dir():
            return results

        # 1. Obtener todas las subcarpetas del anime
        subdirs = [d for d in anime_dir.iterdir() if d.is_dir()]
        
        # 2. Mapear cada nodo a su carpeta estándar esperada
        node_standard_folders = {}
        for idx, node in enumerate(franchise_nodes):
            node_standard_folders[idx] = self.get_standard_folder_for_node(node)

        # 3. Escaneo de las carpetas estándar y cruzadas
        for idx, std_folder in node_standard_folders.items():
            node = franchise_nodes[idx]
            fmt = node.get("format")
            
            candidate_folders = [anime_dir / std_folder]
            if fmt in ['OVA', 'SPECIAL', 'MOVIE']:
                candidate_folders.append(anime_dir / "OVAs y Especiales")
                candidate_folders.append(anime_dir / "Películas")
                
            # Si el nodo es una Parte 1 o Parte 2 (ej: Mushoku Tensei), también escanear 'Temporada 1' o 'Temporada 2'
            if " - Parte " in std_folder:
                base_season_folder = std_folder.split(" - Parte ")[0]
                candidate_folders.append(anime_dir / base_season_folder)

            for folder_cand in candidate_folders:
                if folder_cand.exists() and folder_cand.is_dir():
                    for root, _, files in os.walk(folder_cand):
                        for file in files:
                            if file.endswith(('.mp4', '.mkv', '.avi')):
                                ep = extract_episode_number(file)
                                if ep is None:
                                    continue
                                    
                                if fmt in ['OVA', 'SPECIAL', 'MOVIE']:
                                    clean_f = clean_title_for_search(file).lower()
                                    t_clean = clean_title_for_search(node.get('title', '')).lower()
                                    eng_clean = clean_title_for_search(node.get('english', '') or '').lower()
                                    
                                    # Palabras clave distintivas
                                    distinctive = [w for w in (t_clean + " " + eng_clean).split() if len(w) >= 3 and w not in ['the', 'ova', 'movie', 'special', 'part', 'season']]
                                    if not distinctive or any(w in clean_f for w in distinctive) or t_clean in clean_f:
                                        results[idx].add(ep)
                                elif " - Parte " in std_folder and folder_cand.name == base_season_folder:
                                    # Asignar rangos de episodios a Parte 1 vs Parte 2 si están juntos
                                    part_num = int(std_folder.split(" - Parte ")[1])
                                    if part_num == 1 and ep <= 11:
                                        results[idx].add(ep)
                                    elif part_num == 2 and ep >= 12:
                                        # Mapear tanto relativo (ep - 11) como absoluto
                                        results[idx].add(ep)
                                        results[idx].add(ep - 11)
                                else:
                                    results[idx].add(ep)

        # 4. Escaneo de carpetas legadas o con nombres alternativos (romaji, inglés, etc.)
        for subdir in subdirs:
            sub_name = subdir.name
            clean_sub_name = clean_title_for_search(sub_name).lower()
            
            for idx, node in enumerate(franchise_nodes):
                node_title = node.get("title", "")
                node_english = node.get("english", "") or ""
                node_synonyms = node.get("synonyms", []) or []
                std_folder = node_standard_folders[idx]
                
                if sub_name == std_folder:
                    continue
                    
                all_titles = [node_title, node_english] + node_synonyms
                is_match = False
                
                for t in all_titles:
                    clean_t = clean_title_for_search(t).lower()
                    if clean_sub_name == clean_t or (len(clean_t) > 6 and clean_t in clean_sub_name):
                        is_match = True
                        break
                        
                season_match = re.search(r'season\s*0*(\d+)', clean_sub_name)
                if season_match:
                    season_num = int(season_match.group(1))
                    if std_folder == f"Temporada {season_num}":
                        is_match = True

                if is_match:
                    for root, _, files in os.walk(subdir):
                        for file in files:
                            if file.endswith(('.mp4', '.mkv', '.avi')):
                                ep = extract_episode_number(file)
                                if ep is not None:
                                    results[idx].add(ep)

        return results

    def consolidate_anime_library(self, anime_dir: Path, franchise_nodes: List[Dict[str, Any]], dry_run: bool = False) -> Dict[str, Any]:
        """
        Consolida y unifica las carpetas y archivos de un anime:
        - Reubica archivos desubicados en su carpeta de temporada correcta según el nombre del archivo.
        - Mueve archivos de carpetas con nombres antiguos (ej: 'Season 01', 'Dungeon ni Deai...') hacia la carpeta estándar ('Temporada 1').
        - Si hay archivos duplicados idénticos, elimina el sobrante para recuperar espacio.
        - Limpia duplicados internos por hash dentro de cada subcarpeta.
        - Elimina subcarpetas viejas vacías.
        """
        report = {"moved": 0, "duplicates_removed": 0, "cleaned_dirs": 0}
        if not anime_dir.exists() or not anime_dir.is_dir():
            return report

        # 1. Limpieza de duplicados internos en todas las subcarpetas existentes
        for sub in list(anime_dir.iterdir()):
            if sub.is_dir():
                dups = self.clean_internal_folder_duplicates(sub, dry_run=dry_run)
                report["duplicates_removed"] += dups

        # 2. Redistribución precisa a nivel de archivo individual
        for sub in list(anime_dir.iterdir()):
            if not sub.is_dir():
                continue
                
            for file_item in list(sub.iterdir()):
                if not file_item.is_file() or file_item.suffix.lower() not in ['.mp4', '.mkv', '.avi']:
                    continue
                    
                # Averiguar a qué carpeta pertenece este archivo según su nombre
                proper_folder = NamingStandardizer.parse_folder_name(file_item.name)
                
                # Si el archivo está en la carpeta correcta, no mover
                if sub.name == proper_folder:
                    continue
                    
                dest_dir = anime_dir / proper_folder
                if not dry_run:
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    
                dest_file = dest_dir / file_item.name
                if dest_file.exists():
                    h1 = self.get_file_quick_hash(file_item)
                    h2 = self.get_file_quick_hash(dest_file)
                    if h1 and h2 and h1 == h2:
                        logger.info(f"Eliminando duplicado: {file_item} (idéntico a {dest_file})")
                        if not dry_run:
                            file_item.unlink()
                        report["duplicates_removed"] += 1
                    else:
                        ep1 = extract_episode_number(file_item.name)
                        ep2 = extract_episode_number(dest_file.name)
                        if ep1 is not None and ep2 is not None and ep1 == ep2:
                            if file_item.stat().st_size > dest_file.stat().st_size:
                                if not dry_run:
                                    dest_file.unlink()
                                    file_item.rename(dest_file)
                                report["moved"] += 1
                            else:
                                if not dry_run:
                                    file_item.unlink()
                                report["duplicates_removed"] += 1
                        else:
                            alt_dest = dest_dir / f"{file_item.stem}_alt{file_item.suffix}"
                            if not dry_run:
                                file_item.rename(alt_dest)
                            report["moved"] += 1
                else:
                    logger.info(f"Reubicando {file_item.name} -> {proper_folder}/")
                    if not dry_run:
                        file_item.rename(dest_file)
                    report["moved"] += 1

        # 3. Limpiar carpetas que hayan quedado vacías
        if not dry_run:
            for sub in list(anime_dir.iterdir()):
                if sub.is_dir() and not any(sub.iterdir()):
                    try:
                        sub.rmdir()
                        report["cleaned_dirs"] += 1
                    except Exception as e:
                        logger.debug(f"No se pudo borrar carpeta vacía {sub}: {e}")

        # 4. Purgar archivos temporales residuales o corruptos
        if not dry_run:
            self.cleanup_corrupted_and_temp_files(anime_dir)

        return report

    def cleanup_corrupted_and_temp_files(self, anime_dir: Path) -> int:
        """
        Escanea y elimina de forma segura archivos temporales (.part, .tmp)
        o archivos de video corruptos (< 2 MB) que hayan quedado huérfanos.
        """
        if not anime_dir.exists():
            return 0
        cleaned = 0
        now = time.time() if 'time' in globals() else 0
        import time as _t
        now = _t.time()
        for root, _, files in os.walk(anime_dir):
            for f in files:
                fp = Path(root) / f
                # Archivos .part o .tmp que tengan más de 5 minutos sin modificación
                if fp.suffix.lower() in ['.part', '.tmp', '.crdownload']:
                    try:
                        if (now - fp.stat().st_mtime) > 300:
                            fp.unlink()
                            logger.info(f"🧹 Temporal huérfano eliminado: {fp.name}")
                            cleaned += 1
                    except Exception as e:
                        logger.debug(f"No se pudo eliminar {fp}: {e}")
                # Archivos de video menores a 2 MB (posibles páginas de error HTML guardadas)
                elif fp.suffix.lower() in ['.mp4', '.mkv', '.avi']:
                    try:
                        if (now - fp.stat().st_mtime) > 300 and fp.stat().st_size < 2 * 1024 * 1024:
                            fp.unlink()
                            logger.warning(f"🧹 Video corrupto/incompleto (<2MB) eliminado: {fp.name}")
                            cleaned += 1
                    except Exception as e:
                        logger.debug(f"No se pudo eliminar {fp}: {e}")
        return cleaned
