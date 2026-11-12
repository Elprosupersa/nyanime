import re
import os
import json
import logging
from typing import Dict, Any, Tuple
import google.generativeai as genai
import urllib.request
import urllib.error

logger: logging.Logger = logging.getLogger("AnimeOrganizerAI")

class AnalyzerNetworkError(Exception):
    pass

class AIAnalyzer:
    """Motor de análisis de nombres de archivo usando Gemini con fallback a Ollama."""
    def __init__(self, api_key: str, confidence_threshold: float = 0.90, local_model: str = "qwen2.5:7b") -> None:
        self.confidence_threshold: float = confidence_threshold
        self.local_model: str = local_model
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.0-flash')
        
    def clean_filename(self, filename: str) -> str:
        """Pre-procesamiento: Elimina tags de release groups, resoluciones y hashes."""
        name_part, _ = os.path.splitext(filename)
        clean_name = re.sub(r'\[.*?\]|\(.*?\)', '', name_part).strip()
        clean_name = re.sub(r"[._]", " ", clean_name).strip()
        
        # Filtro Anti-Ofuscación: Reduce letras repetidas 3 o más veces consecutivas a una sola.
        # Ej: "oootaaakuuu" -> "otaku", "yoooowaaaa" -> "yowa"
        clean_name = re.sub(r'([a-zA-Z])\1{2,}', r'\1', clean_name)
        
        return clean_name

    _last_gemini_request = 0.0

    def infer_metadata(self, filename: str, existing_folders: list[str] = None) -> Dict[str, Any]:
        """Usa Gemini para inferir metadatos estructurados."""
        clean_name = self.clean_filename(filename)
        
        # Rate Limiting: 15 peticiones por minuto = 1 petición cada 4 segundos.
        # Esperamos 4.1 segundos desde la última petición exitosa para evitar el error 429.
        import time
        elapsed = time.time() - AIAnalyzer._last_gemini_request
        if elapsed < 4.2:
            time.sleep(4.2 - elapsed)
            
        library_context = ""
        if existing_folders:
            library_context = f"\n\nCONTEXTO DE LA BIBLIOTECA:\nActualmente ya existen las siguientes carpetas de anime en el disco: {existing_folders}\n¡MUY IMPORTANTE! Si el archivo parece ser una versión ofuscada, abreviada o mal escrita de alguno de estos animes existentes, DEBES devolver EXACTAMENTE el nombre de la carpeta existente en 'anime_title'."

        prompt = f"""Eres un experto catalogador de anime.
Analiza el siguiente nombre de archivo original: "{filename}" (Nombre limpio: "{clean_name}"){library_context}

Ejemplos de ofuscación comunes para guiarte:
- "otakuniyasaashigallwaiinaisiews-08" -> {{"anime_title": "Otaku ni Yasashii Gal wa Inai", "season": 1, "episode": 8, "confidence": 0.95}}
- "yowayowasenseinimesws-02" -> {{"anime_title": "Yowa Yowa Sensei", "season": 1, "episode": 2, "confidence": 0.95}}
- "matoseiheiinoslaveseasonss2-12" -> {{"anime_title": "Mato Seihei no Slave", "season": 2, "episode": 12, "confidence": 0.95}}

REGLA DE TEMPORADAS: Si el título incluye un número de secuela suelto antes de la palabra "Episodio" (por ejemplo, "Anime 2 - Episodio 02", "Anime 3rd Season"), DEBES extraer ese número como la temporada y REMOVERLO del 'anime_title'. 
- "KonoSuba 2 - Episodio 05" -> {{"anime_title": "KonoSuba", "season": 2, "episode": 5, "confidence": 0.95}}
- "Iya na Kao sare nagara Opantsu Misete Moraitai 2 - Episodio 02" -> {{"anime_title": "Iya na Kao sare nagara Opantsu Misete Moraitai", "season": 2, "episode": 2, "confidence": 0.99}}

Devuelve ÚNICAMENTE un JSON con el siguiente esquema y sin markdown:
{{
  "anime_title": "Nombre oficial en Romaji o Inglés limpio",
  "season": Número de temporada (entero, por defecto 1),
  "episode": Número de episodio (entero),
  "confidence": Valor de 0.0 a 1.0 indicando tu seguridad
}}"""
        
        try:
            response = self.model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.0
                ),
                request_options={"timeout": 15}
            )
            
            AIAnalyzer._last_gemini_request = time.time()
            data = json.loads(response.text)
            return data
        except Exception as e:
            logger.warning(f"Error comunicándose con Gemini ({e}). Intentando con Ollama local ({self.local_model})...")
            try:
                return self.infer_metadata_ollama(prompt)
            except Exception as ollama_err:
                logger.error(f"Fallback a Ollama falló: {ollama_err}")
                raise AnalyzerNetworkError(f"Ambos modelos fallaron. Gemini: {e}. Ollama: {ollama_err}")

    def infer_metadata_ollama(self, prompt: str) -> Dict[str, Any]:
        """Inferencia de respaldo usando Ollama localmente."""
        url = "http://localhost:11434/api/generate"
        schema = {
            "type": "object",
            "properties": {
                "anime_title": {"type": "string"},
                "season": {"type": "integer"},
                "episode": {"type": "integer"},
                "confidence": {"type": "number"}
            },
            "required": ["anime_title", "season", "episode", "confidence"]
        }
        
        payload = {
            "model": self.local_model,
            "prompt": prompt,
            "format": schema,
            "stream": False,
            "keep_alive": "30s",
            "options": {
                "temperature": 0.0
            }
        }
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        
        logger.info("Enviando petición a Ollama local...")
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                logger.info("Respuesta recibida de Ollama. Parseando JSON...")
                raw_response = response.read().decode('utf-8')
                result = json.loads(raw_response)
                response_text = result.get("response", "{}")
                # Algunas veces Ollama devuelve markdown dentro del string json
                response_text = response_text.replace("```json", "").replace("```", "").strip()
                return json.loads(response_text)
        except Exception as e:
            logger.error(f"Error interno en infer_metadata_ollama: {e}")
            raise

    def analyze(self, filename: str, existing_folders: list[str] = None) -> Tuple[bool, Dict[str, Any]]:
        """Devuelve si es válido (confianza >= threshold) y los metadatos."""
        try:
            metadata = self.infer_metadata(filename, existing_folders)
            confidence = float(metadata.get("confidence", 0.0))
            
            if confidence >= self.confidence_threshold:
                return True, metadata
            else:
                logger.warning(f"Confianza baja ({confidence}) para el archivo: {filename}")
                return False, metadata
        except AnalyzerNetworkError:
            raise
        except Exception as e:
            logger.error(f"Error parseando JSON de Ollama para '{filename}': {e}")
            return False, {"anime_title": "Unknown", "season": 1, "episode": 0, "confidence": 0.0}
