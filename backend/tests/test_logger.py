import logging
import os
import pytest
from src.logger import setup_logger, get_logger

def test_logger_setup(fs):
    """Prueba que el logger se inicializa correctamente usando pyfakefs."""
    # fs is provided by pyfakefs
    log_dir = "/fake/logs"
    logger = setup_logger("DEBUG", log_dir)
    
    assert logger.name == "AnimeOrganizerAI"
    assert logger.level == logging.DEBUG
    
    # Comprobar que se crearon handlers (1 archivo, 1 consola)
    assert len(logger.handlers) == 2
    
    # Comprobar que el archivo se creó en el sistema de archivos falso
    assert os.path.exists("/fake/logs/organizer.log")
    
    # Comprobar idempotencia (no se duplican los handlers)
    logger2 = setup_logger("DEBUG", log_dir)
    assert len(logger2.handlers) == 2

def test_get_logger():
    logger = get_logger()
    assert logger.name == "AnimeOrganizerAI"
