import re
import logging

logger = logging.getLogger(__name__)

class NamingStandardizer:
    """
    Analiza un título oficial de anime (usualmente provisto por AniList/MyAnimeList)
    o el nombre de un archivo de video y lo convierte al formato de carpetas estándar en español:
    'Temporada X', 'Temporada X - Parte Y', 'OVAs y Especiales', o 'Películas'.
    """
    
    @staticmethod
    def parse_folder_name(title: str, format_type: str = None) -> str:
        """
        Retorna el nombre estandarizado de la carpeta basándose en el título y el formato.
        format_type puede ser 'TV', 'MOVIE', 'OVA', 'SPECIAL', etc.
        """
        title_lower = title.lower()
        
        # 1. Chequeos directos por format_type de AniList
        if format_type:
            fmt = format_type.upper()
            if fmt == 'MOVIE':
                return "Películas"
            elif fmt in ['OVA', 'OAD', 'SPECIAL']:
                return "OVAs y Especiales"
                
        # 2. Heurísticas basadas en palabras clave en el título
        is_ova = False
        is_movie = False
        is_spinoff = False
        
        # Detección de Spin-offs y series Gaiden
        if any(k in title_lower for k in ["sword oratoria", "bakuen wo", "chuugakkou", "junior high", "slime nikki", "tensura nikki", " gaiden", ": gaiden", "spin-off", "spinoff"]):
            is_spinoff = True

        if any(k in title_lower for k in [" ova", ": ova", "ova ", "(ova)", " oad", "special", "specials", "bonus stage"]):
            is_ova = True
            
        # Detección estricta de películas (evitando falsos positivos con 'rezero' y 'zero no tsukaima')
        if "re:zero" in title_lower or "rezero" in title_lower:
            if "memory snow" in title_lower or "hyouketsu no kizuna" in title_lower or "movie" in title_lower or "pelicula" in title_lower:
                is_movie = True
        elif "zero no tsukaima" in title_lower:
            if "movie" in title_lower or "pelicula" in title_lower or "film" in title_lower:
                is_movie = True
        else:
            if re.search(r'\b(movie|pelicula|film|kurenai densetsu)\b', title_lower) or re.search(r'\bzero\b', title_lower):
                if "season" not in title_lower and "temporada" not in title_lower:
                    is_movie = True
            
        if is_movie:
            return "Películas"
        if is_spinoff:
            return "Spin-offs y Especiales"
        if is_ova:
            return "OVAs y Especiales"

        # 3. Detectar Temporada (Season)
        season = 1
        
        # Caso especial Final Season (ej: Shingeki no Kyojin The Final Season)
        if "final season" in title_lower:
            season = 4
        else:
            # Ej: "Season 2", "Temporada 3", "S4"
            season_match = re.search(r'(?:season|temporada|s)\s*(\d+)', title_lower)
            if season_match:
                season = int(season_match.group(1))
            else:
                # Ej: "2nd Season", "3rd Season", "4th Season"
                season_match_ord = re.search(r'(\d+)(?:st|nd|rd|th)\s*season', title_lower)
                if season_match_ord:
                    season = int(season_match_ord.group(1))
                else:
                    # Ej: "Mushoku Tensei II", "Danmachi IV", "Overlord III"
                    # Buscar números romanos aislados
                    roman_match = re.search(r'(?:\s+|^)(ii|iii|iv|v|vi|vii|viii|ix|x)(?:\s+|$|:|-)', title, re.IGNORECASE)
                    if roman_match:
                        roman_numerals = {'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10}
                        season = roman_numerals.get(roman_match.group(1).lower(), 1)
                    else:
                        # Ej: "Kono Subarashii Sekai ni Shukufuku wo! 2", "Anime 3"
                        digit_match = re.search(r'(?:\s+|^)(\d+)(?:\s+|$|:|-)', title)
                        if digit_match and int(digit_match.group(1)) < 20:
                            season = int(digit_match.group(1))

        # 4. Detectar Parte (Part / Cour)
        part = 1
        # Ej: "Part 2", "Parte 2", "Cour 2", "Shin Shou Yakusai-hen" (Parte 2 de Danmachi IV), "Kanketsu-hen"
        part_match = re.search(r'(?:part|parte|cour)\s*(\d+)', title_lower)
        if part_match:
            part = int(part_match.group(1))
        elif "shin shou yakusai-hen" in title_lower or "part 2" in title_lower or "parte 2" in title_lower:
            part = 2

        # 5. Formatear la salida final
        if part > 1:
            return f"Temporada {season} - Parte {part}"
        elif season > 1:
            return f"Temporada {season}"
        else:
            return "Temporada 1"
