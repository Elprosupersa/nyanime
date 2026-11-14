import requests
import logging
import re
import json
import time
from pathlib import Path
from typing import List, Dict, Any, Set

logger = logging.getLogger(__name__)

class AnimeChronology:
    """
    Clase encargada de consultar la API de AniList (GraphQL) para mapear
    la franquicia entera (Precuelas, Secuelas, OVAs, Especiales, Películas)
    de un anime dado, ordenándolo cronológicamente y capturando la cantidad
    exacta de episodios para cada temporada.
    """
    def __init__(self):
        self.url = 'https://graphql.anilist.co'
        self.session = requests.Session()
        
        # Sistema de Caché Local
        self.cache_dir = Path(__file__).parent.parent / "metadata"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.cache_file = self.cache_dir / "local_database.json"
        self.cache = self._load_cache()
        
    def _load_cache(self) -> Dict[str, Any]:
        if self.cache_file.exists():
            try:
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error al cargar local_database.json: {e}")
        return {}

    def _save_cache(self):
        try:
            with open(self.cache_file, "w", encoding="utf-8") as f:
                json.dump(self.cache, f, ensure_ascii=False, indent=4)
        except Exception as e:
            logger.error(f"Error al guardar local_database.json: {e}")
        
    def _query_anilist(self, query: str, variables: Dict[str, Any], max_retries: int = 3) -> Dict[str, Any]:
        for attempt in range(max_retries):
            try:
                time.sleep(0.35)
                response = self.session.post(self.url, json={'query': query, 'variables': variables}, timeout=15)
                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 429:
                    retry_after = int(response.headers.get('Retry-After', 2))
                    logger.warning(f"AniList API Rate Limit (429). Esperando {retry_after}s antes de reintentar...")
                    time.sleep(retry_after)
                else:
                    logger.error(f"AniList API Error {response.status_code}: {response.text}")
                    return {}
            except Exception as e:
                logger.error(f"AniList API Error (Exception): {e}")
                time.sleep(1)
        return {}

    def get_initial_node(self, search_term: str) -> Dict[str, Any]:
        import unicodedata
        normalized_search = unicodedata.normalize('NFKD', search_term).encode('ASCII', 'ignore').decode('utf-8')
        
        query = '''
        query ($search: String) {
          Media(search: $search, type: ANIME) {
            id
            title { romaji english }
            format
            episodes
            synonyms
            startDate { year month day }
          }
        }
        '''
        data = self._query_anilist(query, {'search': normalized_search})
        if data and 'data' in data and data['data'] and data['data'].get('Media'):
            return data['data']['Media']
            
        return {}

    def get_relations(self, media_id: int) -> List[Dict[str, Any]]:
        query = '''
        query ($id: Int) {
          Media(id: $id) {
            relations {
              edges {
                relationType
                node {
                  id
                  title { romaji english }
                  type
                  format
                  episodes
                  synonyms
                  startDate { year month day }
                }
              }
            }
          }
        }
        '''
        data = self._query_anilist(query, {'id': media_id})
        if data and 'data' in data and data['data'] and 'Media' in data['data']:
            return data['data']['Media'].get('relations', {}).get('edges', [])
        return []

    def get_franchise_chronology(self, base_name: str, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        Devuelve una lista ordenada cronológicamente de todos los títulos de la franquicia.
        """
        cache_key = base_name.strip().lower()
        if not force_refresh and cache_key in self.cache:
            cached_val = self.cache[cache_key]
            # Si el caché tiene más de 1 parte o tiene episodios definidos, es confiable
            if len(cached_val) > 1 or (len(cached_val) == 1 and cached_val[0].get('episodes') is not None):
                logger.info(f"[Caché] Cargando franquicia de '{base_name}' desde base de datos local...")
                return cached_val
            
        logger.info(f"Buscando el inicio de la franquicia en AniList para: {base_name}")
        initial_node = self.get_initial_node(base_name)
        
        if not initial_node:
            # Si falla la red pero teníamos caché previo, preservarlo
            if cache_key in self.cache and len(self.cache[cache_key]) > 0:
                logger.warning(f"No se pudo consultar AniList para '{base_name}', preservando caché local existente.")
                return self.cache[cache_key]

            logger.warning(f"No se pudo obtener información de AniList para '{base_name}'. Fallback a Jikan API (MyAnimeList)...")
            jikan_data = self._get_jikan_franchise_chronology(base_name)
            if jikan_data and len(jikan_data) > 0:
                self.cache[cache_key] = jikan_data
                self._save_cache()
                return jikan_data
            else:
                fallback = [{'title': base_name, 'english': None, 'synonyms': [], 'format': 'TV', 'episodes': None}]
                return fallback
            
        visited_ids: Set[int] = set()
        queue: List[Dict[str, Any]] = [initial_node]
        all_anime_nodes: List[Dict[str, Any]] = []
        
        # Formatos principales válidos (incluyendo ONA y TV_SHORT)
        valid_formats = ['TV', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'TV_SHORT']
        valid_relations = ['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'ALTERNATIVE', 'PARENT']
        
        # BFS para encontrar toda la franquicia conectada
        while queue:
            current = queue.pop(0)
            current_id = current['id']
            
            if current_id in visited_ids:
                continue
                
            visited_ids.add(current_id)
            
            curr_format = current.get('format')
            if curr_format in valid_formats or current_id == initial_node['id']:
                start_date = current.get('startDate', {})
                year = start_date.get('year') or 9999
                month = start_date.get('month') or 12
                day = start_date.get('day') or 31
                
                sort_val = year * 10000 + month * 100 + day
                
                title_obj = current.get('title', {})
                title = title_obj.get('romaji') or title_obj.get('english') or base_name
                
                # Omitir especiales innecesarios que rompen la búsqueda
                skip = False
                title_and_syns = [title, title_obj.get('english', '')] + (current.get('synonyms') or [])
                for syn in title_and_syns:
                    if not syn: continue
                    syn_lower = syn.lower()
                    if "mini anime" in syn_lower or "picture drama" in syn_lower or "recap" in syn_lower or "break time" in syn_lower or "petit" in syn_lower:
                        skip = True
                        break
                if skip:
                    continue
                
                # Filtrar sinónimos: quitar caracteres CJK, cirílicos, árabes
                filtered_synonyms = []
                for syn in (current.get('synonyms') or []):
                    if not re.search(r'[\u0400-\u04FF\u0600-\u06FF\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]', syn):
                        filtered_synonyms.append(syn)
                
                filtered_synonyms = filtered_synonyms[:4]
                
                all_anime_nodes.append({
                    'id': current_id,
                    'title': title,
                    'english': title_obj.get('english'),
                    'synonyms': filtered_synonyms,
                    'sort_val': sort_val,
                    'format': curr_format,
                    'episodes': current.get('episodes')
                })
                
            # Obtener relaciones para continuar el BFS
            relations = self.get_relations(current_id)
            for edge in relations:
                rel_type = edge.get('relationType')
                node = edge.get('node', {})
                
                if rel_type in valid_relations and node.get('type') == 'ANIME':
                    if (node.get('format') in valid_formats or node.get('id') == initial_node['id']) and node.get('id') not in visited_ids:
                        queue.append(node)
                        
        # Ordenar cronológicamente
        all_anime_nodes.sort(key=lambda x: x['sort_val'])
        
        franchise_data = []
        for node in all_anime_nodes:
            franchise_data.append({
                'title': node['title'],
                'english': node['english'],
                'synonyms': node['synonyms'],
                'format': node['format'],
                'episodes': node.get('episodes')
            })
            
        if not franchise_data:
            title_obj = initial_node.get('title', {})
            title = title_obj.get('romaji') or title_obj.get('english') or base_name
            franchise_data = [{
                'title': title,
                'english': title_obj.get('english'),
                'synonyms': initial_node.get('synonyms') or [],
                'format': initial_node.get('format', 'TV'),
                'episodes': initial_node.get('episodes')
            }]

        logger.info(f"Cronología extraída de AniList con {len(franchise_data)} títulos.")
        
        # Guardar en Caché Local si obtuvimos datos válidos
        if franchise_data:
            self.cache[cache_key] = franchise_data
            self._save_cache()
        
        return franchise_data

    def _get_jikan_franchise_chronology(self, base_name: str) -> List[Dict[str, Any]]:
        """ Fallback engine: extrae cronología usando MyAnimeList (Jikan API) """
        import urllib.parse
        logger.info(f"[Jikan API] Iniciando escaneo de franquicia para: {base_name}")
        search_url = f"https://api.jikan.moe/v4/anime?q={urllib.parse.quote(base_name)}&limit=1"
        try:
            time.sleep(0.5)
            res = self.session.get(search_url, timeout=10)
            if res.status_code != 200 or not res.json().get("data"):
                logger.warning("[Jikan API] No se encontró el anime.")
                return []
            initial_data = res.json()["data"][0]
        except Exception as e:
            logger.error(f"[Jikan API] Fallo en la petición inicial: {e}")
            return []
            
        visited_ids = set()
        queue = [initial_data]
        all_anime_nodes = []
        valid_formats = ['TV', 'MOVIE', 'OVA', 'SPECIAL', 'ONA', 'TV_SHORT']
        valid_relations = ['Sequel', 'Prequel', 'Side story', 'Alternative version', 'Parent story']
        
        while queue:
            current = queue.pop(0)
            current_id = current['mal_id']
            
            if current_id in visited_ids:
                continue
            visited_ids.add(current_id)
            
            fmt = current.get('type')
            if not fmt: fmt = "TV"
            fmt_upper = fmt.upper()
            if fmt_upper in valid_formats or fmt_upper == 'TV':
                if fmt_upper == "MOVIE": fmt_upper = "MOVIE"
                elif fmt_upper == "OVA": fmt_upper = "OVA"
                elif fmt_upper == "SPECIAL": fmt_upper = "SPECIAL"
                else: fmt_upper = "TV"
                
                aired = current.get('aired', {})
                prop = aired.get('prop', {}).get('from', {})
                if not prop: prop = {}
                year = prop.get('year') or 9999
                month = prop.get('month') or 12
                day = prop.get('day') or 31
                sort_val = year * 10000 + month * 100 + day
                
                title = current.get('title') or base_name
                english = current.get('title_english')
                synonyms = current.get('title_synonyms', [])
                
                skip = False
                for syn in [title, english] + synonyms:
                    if not syn: continue
                    syn_lower = syn.lower()
                    if "mini anime" in syn_lower or "picture drama" in syn_lower or "recap" in syn_lower or "break time" in syn_lower or "petit" in syn_lower:
                        skip = True
                        break
                
                if not skip:
                    filtered_synonyms = []
                    for syn in synonyms:
                        if not re.search(r'[\u0400-\u04FF\u0600-\u06FF\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]', syn):
                            filtered_synonyms.append(syn)
                    filtered_synonyms = filtered_synonyms[:4]
                    
                    all_anime_nodes.append({
                        'id': current_id,
                        'title': title,
                        'english': english,
                        'synonyms': filtered_synonyms,
                        'sort_val': sort_val,
                        'format': fmt_upper,
                        'episodes': current.get('episodes')
                    })
            
            try:
                time.sleep(0.4)
                rel_url = f"https://api.jikan.moe/v4/anime/{current_id}/relations"
                rel_res = self.session.get(rel_url, timeout=10)
                if rel_res.status_code == 200:
                    relations_data = rel_res.json().get("data", [])
                    for rel in relations_data:
                        relation_type = rel.get("relation")
                        if relation_type in valid_relations:
                            for entry in rel.get("entry", []):
                                if entry.get("type") == "anime":
                                    entry_id = entry.get("mal_id")
                                    if entry_id not in visited_ids:
                                        time.sleep(0.4)
                                        detail_url = f"https://api.jikan.moe/v4/anime/{entry_id}"
                                        det_res = self.session.get(detail_url, timeout=10)
                                        if det_res.status_code == 200:
                                            det_data = det_res.json().get("data")
                                            if det_data:
                                                queue.append(det_data)
            except Exception as e:
                logger.error(f"[Jikan API] Fallo al obtener relaciones en Jikan para id {current_id}: {e}")
                
        all_anime_nodes.sort(key=lambda x: x['sort_val'])
        franchise_data = []
        for node in all_anime_nodes:
            franchise_data.append({
                'title': node['title'],
                'english': node['english'],
                'synonyms': node['synonyms'],
                'format': node['format'],
                'episodes': node.get('episodes')
            })
        
        logger.info(f"Cronología extraída de Jikan con {len(franchise_data)} títulos.")
        return franchise_data

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    chrono = AnimeChronology()
    print("Franquicia:", chrono.get_franchise_chronology("High School DxD"))
