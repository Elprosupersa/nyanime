import sqlite3
import os
import logging

logger = logging.getLogger("AcquisitionTracker")

class Tracker:
    def __init__(self, db_path="tracker.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS downloads (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        anime_name TEXT NOT NULL,
                        episode_number TEXT NOT NULL,
                        source TEXT NOT NULL,
                        quality TEXT,
                        download_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(anime_name, episode_number)
                    )
                ''')
                conn.commit()
        except sqlite3.Error as e:
            logger.error(f"Error inicializando la base de datos del tracker: {e}")

    def is_downloaded(self, anime_name: str, episode_number: str) -> bool:
        """Verifica si un episodio ya fue descargado previamente."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT 1 FROM downloads 
                    WHERE anime_name = ? AND episode_number = ?
                ''', (anime_name, str(episode_number)))
                return cursor.fetchone() is not None
        except sqlite3.Error as e:
            logger.error(f"Error consultando el tracker para {anime_name} ep {episode_number}: {e}")
            return False

    def mark_downloaded(self, anime_name: str, episode_number: str, source: str, quality: str = "Unknown"):
        """Registra un episodio como descargado exitosamente."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT OR IGNORE INTO downloads (anime_name, episode_number, source, quality)
                    VALUES (?, ?, ?, ?)
                ''', (anime_name, str(episode_number), source, quality))
                conn.commit()
                logger.info(f"Registrado en tracker: {anime_name} - Episodio {episode_number} (Fuente: {source})")
        except sqlite3.Error as e:
            logger.error(f"Error registrando en el tracker para {anime_name} ep {episode_number}: {e}")
