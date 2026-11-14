import re
import unicodedata
from pathlib import Path
from typing import Optional, Tuple

def slugify(text: str) -> str:
    """Convierte texto en un slug URL limpio."""
    text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')

def clean_title_for_search(text: str) -> str:
    """Limpia caracteres especiales conservando palabras para búsqueda."""
    text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
    return re.sub(r'[^a-zA-Z0-9\s]', ' ', text).strip()

def extract_episode_number(filename_or_path: str) -> Optional[int]:
    """
    Extrae de forma robusta e inteligente el número de episodio de un nombre de archivo,
    eliminando resoluciones (1080p, 720p, 4k), códecs (x264, 10bit, hevc), años (2020),
    tags de fansub ([A-GX], [Mashiro]), etc.
    
    Ejemplos soportados:
    - 'ReZero kara Hajimeru Isekai Seikatsu - Episodio 01.mp4' -> 1
    - 'ReZero kara Hajimeru Isekai Seikatsu - Episodio 25 [1080p] [BD].mp4' -> 25
    - '[Mashiro] Mushoku Tensei 2nd Season - 05 (1080p x264 10bit).mkv' -> 5
    - 'Danmachi S04E12 [720p].mp4' -> 12
    - 'KonoSuba 2 - 08.mp4' -> 8
    - 'Shingeki no Kyojin - 25.mp4' -> 25
    - 'Mushoku Tensei - Episodio 00 (Guardian Fitz).mp4' -> 0
    - '01.mp4' -> 1
    """
    stem = Path(filename_or_path).stem.replace('_', ' ')
    
    # 1. Quitar tags de resolución comunes
    cleaned = re.sub(r'(?i)\b(?:2160p|1080p|720p|480p|360p|4k|2k|hd|fhd|uhd)\b', ' ', stem)
    
    # 2. Quitar tags de códec, audio y profundidad de color
    cleaned = re.sub(r'(?i)\b(?:x264|x265|h264|h265|hevc|avc|10bit|8bit|12bit|aac|flac|mp3|dts|ac3|dual|sub|subbed|dub|dubbed|raw)\b', ' ', cleaned)
    
    # 3. Quitar tags de fuente y calidad
    cleaned = re.sub(r'(?i)\b(?:bluray|blu-ray|bd|dvd|web-dl|webrip|web|hdtv|tv|repack|v\d+)\b', ' ', cleaned)
    
    # 4. Quitar hashes y corchetes de fansubs comunes como [A-GX], [1A2B3C4D], [Mashiro]
    cleaned = re.sub(r'\[[a-fA-F0-9]{8}\]', ' ', cleaned)
    cleaned = re.sub(r'\[[^\]]*\]', ' ', cleaned)
    
    # 5. Quitar años entre paréntesis o aislados (ej. (2020), (2024), 2021)
    cleaned = re.sub(r'\b(19\d\d|20\d\d)\b', ' ', cleaned)
    
    # 6. Intentar patrones explícitos de episodio
    
    # Patrón A: "Episodio 01", "Capitulo 12", "Episode 5", "Cap. 03", "Ep 04"
    match = re.search(r'(?i)\b(?:episodio|capitulo|episode|capitulo|cap|ep)[\s_.-]*0*(\d{1,4})\b', cleaned)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            pass
            
    # Patrón B: "S01E05", "S2E12", "E08", "E1"
    match = re.search(r'(?i)\b(?:s\d+)?e0*(\d{1,4})\b', cleaned)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            pass
            
    # Patrón C: Separador guion " - 01 ", " - 25."
    match = re.search(r'\s+-\s+0*(\d{1,4})(?:[\s_.-]|$)', cleaned)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            pass
            
    # Patrón D: Standalone o números aislados después de temporada (ej. "KonoSuba 2 - 08" o "Danmachi IV 10")
    # Buscar todos los números restantes
    nums = re.findall(r'\b0*(\d{1,3})\b', cleaned)
    if nums:
        try:
            # Tomar el último número encontrado como episodio
            return int(nums[-1])
        except ValueError:
            pass
            
    return None
