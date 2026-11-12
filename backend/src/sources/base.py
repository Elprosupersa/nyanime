from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
import requests
import logging
from src.metadata.models import VideoSourceInfo, SourceHealthStatus

logger = logging.getLogger("AnimeOrganizerAI.VideoSources")

class BaseVideoSource(ABC):
    """
    Clase base abstracta para todos los proveedores de video.
    Define el contrato de resolución de fuentes, health checks, timeouts y prioridades.
    """
    def __init__(self, source_id: str, name: str, priority: int, timeout: int = 5):
        self.source_id = source_id
        self.name = name
        self.priority = priority
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        })

    @abstractmethod
    def resolve_source(
        self,
        anime_id: int,
        season: int,
        episode: int,
        mapping_data: Optional[Dict[str, Any]] = None,
        is_movie: bool = False
    ) -> Optional[VideoSourceInfo]:
        """Resuelve y construye la información del stream para el episodio dado."""
        pass

    def check_health(self, url: str) -> SourceHealthStatus:
        """Realiza un health check sobre el endpoint para validar si responde adecuadamente."""
        try:
            res = self.session.head(url, timeout=self.timeout, allow_redirects=True)
            if res.status_code == 200:
                return SourceHealthStatus.AVAILABLE
            elif res.status_code == 429:
                return SourceHealthStatus.RATE_LIMITED
            elif res.status_code in [404, 410, 502, 503]:
                return SourceHealthStatus.UNAVAILABLE
            else:
                return SourceHealthStatus.AVAILABLE
        except requests.Timeout:
            return SourceHealthStatus.TIMEOUT
        except requests.RequestException:
            return SourceHealthStatus.UNAVAILABLE
        except Exception:
            return SourceHealthStatus.UNKNOWN_ERROR
