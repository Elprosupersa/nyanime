from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class SourceHealthStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    UNAVAILABLE = "UNAVAILABLE"
    TIMEOUT = "TIMEOUT"
    INVALID_RESPONSE = "INVALID_RESPONSE"
    NO_VIDEO = "NO_VIDEO"
    RATE_LIMITED = "RATE_LIMITED"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"

class VideoSourceInfo(BaseModel):
    source_id: str
    name: str
    priority: int = 1
    embed_url: str
    is_direct: bool = False
    language: str = "Subtitulado / Multi"
    status: SourceHealthStatus = SourceHealthStatus.AVAILABLE
    headers: Optional[Dict[str, str]] = None

class EpisodeModel(BaseModel):
    id: str
    anime_id: int
    season_number: int
    episode_number: int
    title: Optional[str] = None
    thumbnail: Optional[str] = None
    is_available: bool = True
    air_date: Optional[str] = None
    sources: List[VideoSourceInfo] = Field(default_factory=list)

class SeasonModel(BaseModel):
    season_number: int
    title: str
    format: str = "TV" # TV, MOVIE, OVA, SPECIAL
    total_episodes: int
    episodes: List[EpisodeModel] = Field(default_factory=list)

class AnimeDetailsModel(BaseModel):
    id: int
    title_romaji: str
    title_english: Optional[str] = None
    cover_image: Optional[str] = None
    banner_image: Optional[str] = None
    description: Optional[str] = None
    genres: List[str] = Field(default_factory=list)
    year: Optional[int] = None
    status: str = "FINISHED" # FINISHED, RELEASING, NOT_YET_RELEASED, CANCELLED
    total_seasons: int = 1
    seasons: List[SeasonModel] = Field(default_factory=list)
    real_total_episodes: int = 0
