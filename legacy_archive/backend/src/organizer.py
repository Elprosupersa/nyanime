import os
import shutil
import logging
from pathlib import Path
from typing import Dict, Any

from src.config import Config

logger: logging.Logger = logging.getLogger("AnimeOrganizerAI")

class OrganizerCore:
    """Motor central para la organización, renombrado y movimiento de archivos."""
    def __init__(self, config: Config) -> None:
        self.config: Config = config
        self.library_path: Path = Path(config.paths.library)
        self.quarantine_path: Path = Path(config.paths.quarantine)
        
    def _load_exceptions(self) -> Dict[str, Any]:
        import yaml
        exceptions_path = Path("exceptions.yaml")
        if exceptions_path.exists():
            try:
                with open(exceptions_path, "r", encoding="utf-8") as f:
                    return yaml.safe_load(f) or {}
            except Exception as e:
                logger.error(f"Error cargando exceptions.yaml: {e}")
        return {}

    def _build_destination_path(self, metadata: Dict[str, Any], original_ext: str, source_filename: str = "") -> Path:
        """Construye la ruta destino usando templates configurados o excepciones, consolidando nombres similares."""
        proposed_title = metadata.get("anime_title", "Unknown")
        exceptions = self._load_exceptions()
        
        # 0. Revisar si hay excepciones que fuercen el título (por alias_web)
        matched_exception_key = None
        for key, data in exceptions.items():
            if proposed_title.lower() == key.lower():
                matched_exception_key = key
                break
            if "alias_web" in data:
                if any(alias.lower() in proposed_title.lower() for alias in data["alias_web"]):
                    matched_exception_key = key
                    break
                    
        custom_folder = None
        if matched_exception_key:
            proposed_title = matched_exception_key # Normalizar título al de la excepción
            rules = exceptions[matched_exception_key].get("estructura", [])
            for rule in rules:
                if "match" in rule and rule["match"].lower() in source_filename.lower():
                    custom_folder = rule["folder"]
                    break
        
        # 1. Escanear la biblioteca para encontrar nombres similares (Fuzzy Matching y Substrings)
        if not matched_exception_key and self.library_path.exists():
            existing_folders = [d.name for d in self.library_path.iterdir() if d.is_dir()]
            lower_folders = {f.lower(): f for f in existing_folders}
            
            if proposed_title.lower() in lower_folders:
                proposed_title = lower_folders[proposed_title.lower()]
            else:
                import difflib
                matches = difflib.get_close_matches(proposed_title, existing_folders, n=1, cutoff=0.75)
                if matches:
                    proposed_title = matches[0]
                else:
                    # Búsqueda por subcadena cruzada
                    for folder in existing_folders:
                        if len(proposed_title) > 4 and (proposed_title.lower() in folder.lower() or folder.lower() in proposed_title.lower()):
                            proposed_title = folder
                            break
                            
        # Actualizamos la metadata con el título consolidado
        metadata["anime_title"] = proposed_title

        if custom_folder:
            folder = f"{proposed_title}/{custom_folder}"
        else:
            from src.metadata.standardizer import NamingStandardizer
            std_folder = NamingStandardizer.parse_folder_name(source_filename)
            folder = f"{proposed_title}/{std_folder}"
        
        file_name = self.config.organizer.file_template.format(
            anime_title=proposed_title,
            episode=metadata.get("episode", 0),
            extension=original_ext
        )
        
        return self.library_path / folder / file_name

    def process_file(self, source_path_str: str, metadata: Dict[str, Any], is_confident: bool) -> None:
        """Procesa y mueve un archivo a su destino final o a cuarentena."""
        source = Path(source_path_str)
        
        if not source.exists():
            logger.error(f"El archivo origen no existe: {source}")
            return

        if not is_confident:
            self._move_to_quarantine(source)
            return

        try:
            dest = self._build_destination_path(metadata, source.suffix, source_filename=source.name)
            
            if dest.exists():
                logger.error(f"El archivo destino ya existe: {dest}. Se moverá a cuarentena.")
                self._move_to_quarantine(source, duplicated=True)
                return
            
            dest.parent.mkdir(parents=True, exist_ok=True)
            self._atomic_move(source, dest)
            logger.info(f"Archivo '{source.name}' movido exitosamente a '{dest}'")
            
            # Generación automática de miniaturas y notificación inmediata a la biblioteca
            try:
                from src.metadata.thumbnail_generator import extract_thumbnails_for_series, extract_episode_thumbnail, notify_collection_updated
                series_dir = dest.parent
                if series_dir.name.lower().startswith(('temporada', 'season')):
                    series_dir = series_dir.parent
                extract_thumbnails_for_series(series_dir)
                extract_episode_thumbnail(dest)
                notify_collection_updated()
            except Exception as e_th:
                logger.debug(f"Aviso generando miniaturas para '{dest.name}': {e_th}")
            
        except Exception as e:
            logger.error(f"Error moviendo el archivo '{source.name}': {e}")
            self._move_to_quarantine(source)

    def _move_to_quarantine(self, source: Path, duplicated: bool = False) -> None:
        """Mueve un archivo problemático a la cuarentena de forma atómica."""
        self.quarantine_path.mkdir(parents=True, exist_ok=True)
        dest_name = source.name
        if duplicated:
            dest_name = f"{source.stem}_DUPLICADO{source.suffix}"
            
        dest = self.quarantine_path / dest_name
        
        # Evitar sobrescribir en cuarentena si ya se movió algo igual antes
        counter = 1
        original_dest = dest
        while dest.exists():
            dest = self.quarantine_path / f"{original_dest.stem}_{counter}{original_dest.suffix}"
            counter += 1
            
        try:
            self._atomic_move(source, dest)
            logger.info(f"Archivo movido a cuarentena: '{dest}'")
        except Exception as e:
            logger.error(f"Error fatal moviendo a cuarentena '{source.name}': {e}")

    def _atomic_move(self, source: Path, dest: Path) -> None:
        """Mueve un archivo atómicamente. Si hay error cross-device, copia a temp, renombra y borra origen."""
        try:
            # Intento de rename rápido (mismo sistema de archivos)
            os.rename(source, dest)
        except OSError:
            # Capturamos Cross-device link error u otros
            logger.debug(f"Cross-device link detectado o error en os.rename para {source}. Usando copy2.")
            temp_dest = dest.with_name(f"{dest.name}.tmp")
            
            try:
                # 1. Copia con metadatos preservados
                shutil.copy2(source, temp_dest)
                # 2. Renombrado atómico local en el destino
                os.rename(temp_dest, dest)
                # 3. Eliminar original
                os.remove(source)
            except Exception as inner_e:
                # Si fallamos a medias, intentar limpiar archivo temporal
                if temp_dest.exists():
                    try:
                        os.remove(temp_dest)
                    except OSError:
                        pass
                raise inner_e
