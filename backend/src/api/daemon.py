import os
import sys
import time
import yaml
import logging
import threading
from typing import Optional
from pathlib import Path

logger = logging.getLogger("AutoSyncDaemon")

class AutoSyncDaemon:
    """
    Servicio en segundo plano que revisa periódicamente nuevos episodios
    de las series suscritas sin requerir acción manual del usuario.
    """
    def __init__(self, interval_hours: float = 6.0):
        self.interval_seconds = int(interval_hours * 3600)
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self.last_sync_time: Optional[float] = None

    def _sync_worker(self):
        logger.info(f"🚀 Daemon de auto-sincronización iniciado (Intervalo: {self.interval_seconds / 3600:.1f} horas)")
        while not self._stop_event.is_set():
            try:
                logger.info("📡 [Daemon] Iniciando revisión programada de nuevos episodios...")
                from src.acquisition.engine import AcquisitionEngine
                engine = AcquisitionEngine()
                engine.run(dry_run=False)
                self.last_sync_time = time.time()
                logger.info("✅ [Daemon] Revisión programada completada con éxito.")
            except Exception as e:
                logger.error(f"❌ [Daemon] Error durante la sincronización periódica: {e}")

            # Esperar el intervalo respetando la señal de parada
            self._stop_event.wait(timeout=self.interval_seconds)

    def start(self):
        """Inicia el demonio en un hilo independiente."""
        if self.running:
            logger.warning("El Daemon de auto-sincronización ya está en ejecución.")
            return
        self.running = True
        self._stop_event.clear()
        self.thread = threading.Thread(target=self._sync_worker, daemon=True, name="AnimeAutoSyncDaemon")
        self.thread.start()
        logger.info("Daemon de auto-sincronización activado en segundo plano.")

    def stop(self):
        """Detiene el demonio limpiamente."""
        if not self.running:
            return
        self.running = False
        self._stop_event.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=3)
        logger.info("Daemon de auto-sincronización detenido.")

    def get_status(self) -> dict:
        """Retorna el estado actual del daemon."""
        return {
            "running": self.running,
            "interval_hours": self.interval_seconds / 3600,
            "last_sync_time": self.last_sync_time,
            "last_sync_formatted": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.last_sync_time)) if self.last_sync_time else "Nunca"
        }

# Instancia global del daemon
daemon_instance = AutoSyncDaemon(interval_hours=6.0)
