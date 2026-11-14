from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, List
import logging

@dataclass
class EpisodeResult:
    anime_name: str
    episode_number: str
    download_url: str
    quality: str  # e.g., '1080p', '720p'
    source: str   # Plugin name
    is_direct_link: bool # True for direct .mp4/.mkv, False if it needs yt-dlp processing
    is_torrent: bool = False # True if it's a torrent/magnet
    mirror_name: str = "" # Specific server name (e.g., Mediafire, Mega, Mp4upload)
    headers: Optional[dict] = None # Custom HTTP headers (Referer, User-Agent) if required by server

class BaseScraper(ABC):
    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)
        self.name = self.__class__.__name__

    @abstractmethod
    def search_episode(self, anime_name: str, episode_number: str) -> Optional[EpisodeResult]:
        """
        Busca un episodio específico de un anime.
        Debe retornar el mejor EpisodeResult (priorizando 1080p -> 720p, e idioma JP+Sub).
        """
        pass

    def search_episode_candidates(self, anime_name: str, episode_number: str) -> List[EpisodeResult]:
        """
        Retorna una lista ordenada de todos los candidatos / servidores disponibles para este episodio.
        Permite que el motor pruebe espejos alternativos si el primero falla al descargar.
        """
        single_res = self.search_episode(anime_name, episode_number)
        return [single_res] if single_res else []

    def evaluate_quality(self, text: str) -> int:
        """
        Método auxiliar para calificar la calidad basada en el texto (ej. título del link).
        Retorna un score donde mayor es mejor.
        """
        text = text.lower()
        if '1080p' in text or 'fhd' in text:
            return 1080
        elif '720p' in text or 'hd' in text:
            return 720
        elif '480p' in text or 'sd' in text:
            return 480
        return 0

    def is_valid_language(self, text: str) -> bool:
        """
        Método auxiliar para descartar audios latinos o doblajes, 
        ya que el usuario prioriza Japonés con subtítulos en Español.
        """
        text = text.lower()
        # Si menciona explícitamente "latino" o "dub", lo rechazamos.
        if 'latino' in text or 'audio latino' in text or 'español latino' in text or 'castellano' in text or 'audio-español' in text or 'audio español' in text:
            return False
        if 'dub' in text and 'sub' not in text:
            return False
        return True
