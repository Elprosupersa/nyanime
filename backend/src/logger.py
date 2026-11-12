import logging
import os
from logging.handlers import RotatingFileHandler
from typing import Optional

def setup_logger(log_level: str, log_dir: str = "~/.local/share/AnimeOrganizerAI/") -> logging.Logger:
    """Configura y devuelve el logger rotativo principal."""
    expanded_log_dir = os.path.expanduser(log_dir)
    os.makedirs(expanded_log_dir, exist_ok=True)
    
    logger: logging.Logger = logging.getLogger("AnimeOrganizerAI")
    level: int = getattr(logging, log_level.upper(), logging.INFO)
    logger.setLevel(level)
    
    if not logger.handlers:
        file_handler = RotatingFileHandler(
            os.path.join(expanded_log_dir, "organizer.log"),
            maxBytes=10*1024*1024,
            backupCount=5,
            encoding="utf-8"
        )
        console_handler = logging.StreamHandler()
        
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)
        
        logger.addHandler(file_handler)
        logger.addHandler(console_handler)
        
    return logger

def get_logger() -> logging.Logger:
    """Obtiene la instancia global del logger."""
    return logging.getLogger("AnimeOrganizerAI")
