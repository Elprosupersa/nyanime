import os
import logging
from queue import Queue
from typing import List, Any
from pathlib import Path

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from src.config import Config

logger: logging.Logger = logging.getLogger("AnimeOrganizerAI")

class AnimeFileHandler(FileSystemEventHandler):
    """Manejador de eventos del sistema de archivos para la carpeta de entrada."""
    def __init__(self, allowed_extensions: List[str], event_queue: Queue) -> None:
        super().__init__()
        # Normalizamos a minúsculas
        self.allowed_extensions: List[str] = [ext.lower() for ext in allowed_extensions]
        self.event_queue: Queue = event_queue
        
    def _is_valid_file(self, path_str: str) -> bool:
        """Verifica si el archivo es válido, ignorando ocultos o extensiones temporales."""
        path = Path(path_str)
        
        if path.name.startswith("."):
            return False
            
        if path.suffix.lower() == ".part" or path.suffix.lower() == ".download":
            return False
            
        if path.suffix.lower() not in self.allowed_extensions:
            return False
            
        return True

    def on_closed(self, event: Any) -> None:
        """Disparado cuando un archivo se cierra tras escritura (IN_CLOSE_WRITE equivalent)."""
        if getattr(event, 'is_directory', False):
            return
            
        # Dependiendo del sistema operativo y backend, event puede no tener src_path
        src_path = getattr(event, 'src_path', None)
        if src_path and self._is_valid_file(src_path):
            logger.info(f"Nuevo archivo detectado y cerrado: {src_path}")
            self.event_queue.put(src_path)

    def on_created(self, event: Any) -> None:
        """Disparado cuando un archivo se crea (a veces un 'mv' desde otra partición/carpeta no vigilada emite esto)."""
        if getattr(event, 'is_directory', False):
            return
            
        src_path = getattr(event, 'src_path', None)
        if src_path and self._is_valid_file(src_path):
            logger.info(f"Nuevo archivo creado/pegado: {src_path}")
            self.event_queue.put(src_path)

    def on_moved(self, event: Any) -> None:
        """Disparado cuando un archivo se mueve a la carpeta vigilada."""
        if getattr(event, 'is_directory', False):
            return
            
        dest_path = getattr(event, 'dest_path', None)
        if dest_path and self._is_valid_file(dest_path):
            logger.info(f"Nuevo archivo movido: {dest_path}")
            self.event_queue.put(dest_path)


class WatcherDaemon:
    """Demonio encargado de inicializar y gestionar el observador de la carpeta."""
    def __init__(self, config: Config, event_queue: Queue) -> None:
        self.input_path: str = config.paths.input
        self.allowed_extensions: List[str] = config.organizer.allowed_extensions
        self.event_queue: Queue = event_queue
        self.observer: Observer = Observer()
        
    def start(self) -> None:
        """Inicia la observación del directorio especificado."""
        os.makedirs(self.input_path, exist_ok=True)
        handler = AnimeFileHandler(self.allowed_extensions, self.event_queue)
        
        # Escaneo inicial para procesar archivos que ya existían
        logger.info(f"Realizando escaneo inicial en: {self.input_path}")
        try:
            for item in os.listdir(self.input_path):
                item_path = os.path.join(self.input_path, item)
                if os.path.isfile(item_path) and handler._is_valid_file(item_path):
                    logger.info(f"Archivo existente detectado en escaneo inicial: {item_path}")
                    self.event_queue.put(item_path)
        except Exception as e:
            logger.error(f"Error durante el escaneo inicial: {e}")

        self.observer.schedule(handler, self.input_path, recursive=False)
        self.observer.start()
        logger.info(f"Iniciando Watcher en: {self.input_path}")
        
    def stop(self) -> None:
        """Detiene el observador de forma segura."""
        if self.observer.is_alive():
            self.observer.stop()
            self.observer.join()
        logger.info("Watcher detenido.")
