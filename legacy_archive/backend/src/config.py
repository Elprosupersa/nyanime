import os
import yaml
from dataclasses import dataclass
from typing import List
from dotenv import load_dotenv

@dataclass
class SystemConfig:
    log_level: str
    workers: int

@dataclass
class PathsConfig:
    input: str
    library: str
    quarantine: str

@dataclass
class AnalyzerConfig:
    ai_provider: str
    api_key_env_var: str
    confidence_threshold: float
    local_model: str = "qwen2.5:7b"

@dataclass
class OrganizerConfig:
    folder_template: str
    file_template: str
    allowed_extensions: List[str]

@dataclass
class Config:
    system: SystemConfig
    paths: PathsConfig
    analyzer: AnalyzerConfig
    organizer: OrganizerConfig

def load_config(config_path: str = "config.yaml") -> Config:
    """Carga la configuración desde config.yaml y carga las variables de entorno de .env"""
    # Cargar variables de entorno obligatoriamente
    load_dotenv()
    
    with open(config_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    
    return Config(
        system=SystemConfig(**data.get("system", {})),
        paths=PathsConfig(**data.get("paths", {})),
        analyzer=AnalyzerConfig(**data.get("analyzer", {})),
        organizer=OrganizerConfig(**data.get("organizer", {}))
    )
