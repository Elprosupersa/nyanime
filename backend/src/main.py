import os
import sys
import time
import signal
import queue
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from src.config import load_config, Config
from src.logger import setup_logger, get_logger
from src.watcher import WatcherDaemon
from src.analyzer import AIAnalyzer, AnalyzerNetworkError
from src.organizer import OrganizerCore

# Variables globales para control de graceful shutdown
is_shutting_down: bool = False

def worker_task(file_path: str, analyzer: AIAnalyzer, organizer: OrganizerCore, event_queue: queue.Queue) -> None:
    """Tarea ejecutada por un hilo del ThreadPoolExecutor para procesar un solo archivo."""
    logger = get_logger()
    filename = os.path.basename(file_path)
    
    logger.info(f"Procesando: {filename}")
    
    try:
        existing_folders = []
        if organizer.library_path.exists():
            existing_folders = [d.name for d in organizer.library_path.iterdir() if d.is_dir()]
            
        is_confident, metadata = analyzer.analyze(filename, existing_folders)
        organizer.process_file(file_path, metadata, is_confident)
    except AnalyzerNetworkError as e:
        logger.warning(f"Error de cuota o red analizando '{filename}'. Reencolando para intentar en 10s...")
        time.sleep(10)
        event_queue.put(file_path)
    except Exception as e:
        logger.error(f"Error inesperado procesando '{filename}': {e}")

def main() -> None:
    global is_shutting_down
    
    config: Config = load_config()
    setup_logger(config.system.log_level)
    logger: logging.Logger = get_logger()
    logger.info("Iniciando AnimeOrganizerAI (Fase 1)...")
    
    event_queue: queue.Queue = queue.Queue()
    api_key = os.environ.get(config.analyzer.api_key_env_var)
    if not api_key:
        logger.error(f"Variable de entorno {config.analyzer.api_key_env_var} no configurada. Abortando.")
        sys.exit(1)
        
    analyzer = AIAnalyzer(api_key, config.analyzer.confidence_threshold, config.analyzer.local_model)
    organizer = OrganizerCore(config)
    watcher = WatcherDaemon(config, event_queue)
    
    executor = ThreadPoolExecutor(max_workers=config.system.workers, thread_name_prefix="AnimeWorker")
    
    def signal_handler(signum, frame):
        global is_shutting_down
        if is_shutting_down:
            return
        is_shutting_down = True
        logger.info(f"Señal {signal.Signals(signum).name} recibida. Iniciando Graceful Shutdown...")
        
        watcher.stop()
        logger.info("Esperando a que finalicen las tareas en progreso (esto puede tardar si hay copias grandes)...")
        executor.shutdown(wait=True, cancel_futures=True)
        logger.info("Apagado completado exitosamente.")
        sys.exit(0)
        
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    watcher.start()
    
    try:
        while not is_shutting_down:
            try:
                file_path: str = event_queue.get(timeout=1.0)
                if not is_shutting_down:
                    executor.submit(worker_task, file_path, analyzer, organizer, event_queue)
            except queue.Empty:
                pass
    except Exception as e:
        logger.error(f"Fallo crítico en bucle principal: {e}")
        signal_handler(signal.SIGTERM, None)

if __name__ == "__main__":
    main()
