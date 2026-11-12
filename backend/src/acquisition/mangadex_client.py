"""
MangaDex API v5 Client con TokenBucket Rate Limiter, Streaming GET y Multi-Fallback CDN.
Implementa:
- TokenBucketRateLimiter (4.0 RPS máximo para api.mangadex.org)
- Cabecera User-Agent formal (MangaAutonomousPipeline/1.0)
- Reintentos exponenciales con jitter en 429 y 5xx
- Filtrado dual de idioma español ('es-la' y 'es' consultados simultáneamente)
- Descubrimiento de contenido adulto (safe, suggestive, erotica, pornographic)
- Descarga de carátulas vía streaming GET (uploads.mangadex.org/covers/{manga_id}/{cover_file})
- Filtrado de capítulos externos (externalUrl is None y pages > 0)
- Consulta de At-Home server y descarga de páginas con triple fallback:
  1. Primary: MangaDex@Home baseUrl/data/{hash}/{file}
  2. Fallback: uploads.mangadex.org/data/{hash}/{file}
  3. Data-saver fallback: baseUrl/data-saver/{hash}/{file} o uploads.mangadex.org/data-saver/{hash}/{file}
- Interfaz extensible SecondaryProvider para títulos sin indexar / bloqueados por DMCA (F6)
"""

import os
import time
import random
import logging
import threading
from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any, Union

import requests
from requests.adapters import HTTPAdapter
import subprocess

logger = logging.getLogger("MangaDexClient")

MANGADEX_API = "https://api.mangadex.org"
MANGADEX_UPLOADS = "https://uploads.mangadex.org"
DEFAULT_USER_AGENT = "MangaAutonomousPipeline/1.0"
DEFAULT_MAX_RPS = 3.0
DEFAULT_CONTENT_RATINGS = ["safe", "suggestive", "erotica", "pornographic"]
DEFAULT_LANGUAGES = ["es-la", "es"]


class TokenBucketRateLimiter:
    """
    Token Bucket rate limiter thread-safe para limitar peticiones por segundo (RPS).
    Por defecto configurado a 4.0 RPS con capacidad máxima de 4.0 tokens para api.mangadex.org.
    """
    def __init__(self, rate: float = DEFAULT_MAX_RPS, capacity: float = DEFAULT_MAX_RPS):
        if rate <= 0:
            raise ValueError("Rate must be greater than 0")
        if capacity <= 0:
            raise ValueError("Capacity must be greater than 0")
        self.rate = float(rate)
        self.capacity = float(capacity)
        self.tokens = float(capacity)
        self.last_refill = time.monotonic()
        self._lock = threading.Lock()

    def acquire(self, tokens: float = 1.0, timeout: Optional[float] = None) -> bool:
        """
        Adquiere 'tokens' del bucket. Si no hay suficientes, espera el tiempo necesario.
        Retorna True si adquiere los tokens, o False si se excede el timeout.
        """
        start_time = time.monotonic()
        while True:
            with self._lock:
                now = time.monotonic()
                elapsed = now - self.last_refill
                self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
                self.last_refill = now

                if self.tokens >= tokens:
                    self.tokens -= tokens
                    return True

                needed = tokens - self.tokens
                wait_time = needed / self.rate

            if timeout is not None:
                elapsed_total = time.monotonic() - start_time
                if elapsed_total + wait_time > timeout:
                    return False

            time.sleep(min(wait_time, 0.05))

    @property
    def available_tokens(self) -> float:
        with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_refill
            return min(self.capacity, self.tokens + elapsed * self.rate)


class SecondaryProvider(ABC):
    """
    Interfaz abstracta para proveedores secundarios de manga/manhwa (F6).
    Permite integrar scrapers o fuentes alternativas para títulos con mangadex_id = None
    o bloqueos por DMCA.
    """
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Nombre identificador del proveedor (ej. 'LeerCapitulo', 'ZonaTMO')."""
        pass

    @abstractmethod
    def search_series(self, title: str) -> Optional[Dict[str, Any]]:
        """Busca una serie y retorna sus metadatos básicos."""
        pass

    @abstractmethod
    def get_chapters(self, series_id: str, languages: List[str] = ["es", "es-la"]) -> List[Dict[str, Any]]:
        """Retorna lista de capítulos disponibles en los idiomas indicados."""
        pass

    @abstractmethod
    def get_chapter_pages(self, chapter_id: str) -> List[str]:
        """Retorna lista de URLs de imágenes para el capítulo."""
        pass


class MangaDexClient:
    """
    Cliente de alto rendimiento y resiliente para la API v5 de MangaDex.
    Controla rate limits con TokenBucket (4.0 RPS), cabeceras oficiales,
    reintentos exponenciales con jitter y streaming de carátulas.
    """
    def __init__(
        self,
        user_agent: str = DEFAULT_USER_AGENT,
        max_rps: float = DEFAULT_MAX_RPS,
        session: Optional[requests.Session] = None
    ):
        self.user_agent = user_agent
        self.rate_limiter = TokenBucketRateLimiter(rate=max_rps, capacity=max_rps)
        self.session = session or requests.Session()

        # Configurar connection pooling
        adapter = HTTPAdapter(pool_connections=64, pool_maxsize=64, max_retries=1)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
        self.session.headers.update({
            "User-Agent": self.user_agent
        })

        # Detección automática de WarpProxy local para bypass de rate-limits/firewall
        self.proxy: Optional[str] = None
        warp_proxy = "socks5h://127.0.0.1:40000"
        try:
            test_res = requests.get(
                "https://api.mangadex.org/ping",
                proxies={"http": warp_proxy, "https": warp_proxy},
                timeout=3
            )
            if test_res.status_code == 200:
                self.proxy = warp_proxy
                self.session.proxies.update({"http": warp_proxy, "https": warp_proxy})
                logger.info("🛡️ WarpProxy activo (127.0.0.1:40000) - Bypaseando bloqueos de IP en MangaDex.")
        except Exception:
            pass

        # Proveedores secundarios para DMCA / unindexed titles (F6)
        self.secondary_providers: List[SecondaryProvider] = []

    def register_secondary_provider(self, provider: SecondaryProvider) -> None:
        """Registra un proveedor secundario para resolución extensible F6."""
        if provider not in self.secondary_providers:
            self.secondary_providers.append(provider)

    def resolve_provider_for_title(self, queue_item: Dict[str, Any]) -> Tuple[str, Any]:
        """
        Resuelve si una obra debe adquirirse desde MangaDex o desde un proveedor secundario.
        Si mangadex_id no es nulo, prioriza MangaDex. Si es nulo, consulta proveedores secundarios.
        """
        mangadex_id = queue_item.get("mangadex_id")
        if mangadex_id:
            return ("mangadex", mangadex_id)

        query = queue_item.get("search_query") or queue_item.get("title_display", "")
        for provider in self.secondary_providers:
            res = provider.search_series(query)
            if res:
                return (provider.provider_name, res)

        return ("unresolved", None)

    def _request(
        self,
        method: str,
        url: str,
        max_retries: int = 4,
        backoff_factor: float = 1.5,
        jitter: float = 0.5,
        **kwargs
    ) -> requests.Response:
        """
        Ejecuta una petición HTTP a la API gobernada por TokenBucket y reintentos con backoff.
        """
        method_upper = method.upper()

        def _do_call() -> requests.Response:
            if method_upper == "GET":
                return self.session.get(url, **kwargs)
            elif method_upper == "POST":
                return self.session.post(url, **kwargs)
            return self.session.request(method, url, **kwargs)

        for attempt in range(max_retries):
            # Throttle mediante TokenBucket
            self.rate_limiter.acquire(1.0)

            try:
                res = _do_call()
                if res.status_code == 429 or res.status_code in (500, 502, 503, 504):
                    retry_after = res.headers.get("Retry-After")
                    if retry_after and retry_after.strip().isdigit():
                        sleep_time = float(retry_after) + random.uniform(0.0, jitter)
                    else:
                        sleep_time = (backoff_factor * (2 ** attempt)) + random.uniform(0.0, jitter)

                    logger.warning(
                        f"HTTP {res.status_code} en {url}. Reintentando en {sleep_time:.2f}s "
                        f"(intento {attempt + 1}/{max_retries})..."
                    )
                    time.sleep(sleep_time)
                    continue

                return res
            except (requests.ConnectionError, requests.Timeout) as e:
                logger.warning(
                    f"Fallo de red ({e}) en {url}. Intentando fallback inmediato con curl.exe schannel..."
                )
                try:
                    res = self._curl_request(method, url, kwargs.get("params"), kwargs.get("timeout", 20))
                    if res.status_code == 200:
                        return res
                except Exception as curl_err:
                    logger.warning(f"Fallback curl.exe falló: {curl_err}")

                sleep_time = (2.0 * (attempt + 1)) + random.uniform(0.5, 1.0)
                try:
                    self.session.close()
                except Exception:
                    pass
                time.sleep(sleep_time)

        # Último intento seguro con curl.exe
        try:
            return self._curl_request(method, url, kwargs.get("params"), kwargs.get("timeout", 20))
        except Exception:
            self.rate_limiter.acquire(1.0)
            return _do_call()

    def _curl_request(
        self,
        method: str,
        url: str,
        params: Optional[Any] = None,
        timeout: int = 20
    ) -> requests.Response:
        """
        Ejecuta una petición HTTP utilizando curl.exe con schannel nativo de Windows 11.
        Bypasea por completo el bloqueo de huella TLS de OpenSSL/Cloudflare.
        """
        import subprocess
        import urllib.parse
        full_url = url
        if params:
            if isinstance(params, list):
                query_str = urllib.parse.urlencode(params)
            elif isinstance(params, dict):
                query_str = urllib.parse.urlencode(params)
            else:
                query_str = str(params)
            sep = "&" if "?" in url else "?"
            full_url = f"{url}{sep}{query_str}"

        cmd = ["curl.exe", "-s", "-g", "--ssl-no-revoke", "-A", self.user_agent]
        if self.proxy:
            cmd.extend(["--proxy", self.proxy])
        cmd.extend(["-w", "\n%{http_code}", full_url])
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        parts = p.stdout.rsplit("\n", 1)
        body = parts[0] if len(parts) > 1 else p.stdout
        status_code = int(parts[1].strip()) if len(parts) > 1 and parts[1].strip().isdigit() else 200

        fake_res = requests.Response()
        fake_res.status_code = status_code
        fake_res._content = body.encode("utf-8")
        fake_res.url = full_url
        return fake_res

    def search_manga(
        self,
        title: str,
        limit: int = 5,
        content_ratings: Optional[List[str]] = None,
        includes: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Busca un manga por título en MangaDex API v5.
        Soporta descubrimiento adulto explícito y relaciones completas (cover_art, author, artist).
        """
        if not title or not title.strip():
            return None

        url = f"{MANGADEX_API}/manga"
        ratings = content_ratings or DEFAULT_CONTENT_RATINGS
        inc_list = includes or ["cover_art", "author", "artist"]

        params: List[Tuple[str, Any]] = [
            ("title", title.strip()),
            ("limit", limit)
        ]
        for r in ratings:
            params.append(("contentRating[]", r))
        for inc in inc_list:
            params.append(("includes[]", inc))

        res = self._request("GET", url, params=params, timeout=15)
        res.raise_for_status()
        data = res.json().get("data", [])
        if not data:
            return None
        return data[0]

    def get_manga_by_id(
        self,
        manga_id: str,
        includes: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        """Obtiene los metadatos completos de un manga por su UUID canónico."""
        url = f"{MANGADEX_API}/manga/{manga_id}"
        inc_list = includes or ["cover_art", "author", "artist"]
        params = [("includes[]", inc) for inc in inc_list]

        res = self._request("GET", url, params=params, timeout=15)
        res.raise_for_status()
        return res.json().get("data")

    def download_cover(
        self,
        manga_id: str,
        cover_filename: str,
        target_path: Union[str, Path],
        variant: str = ""
    ) -> bool:
        """
        Descarga la carátula oficial mediante streaming GET desde uploads.mangadex.org.
        No usa HEAD ya que uploads.mangadex.org responde 405 Method Not Allowed.
        Soporta variantes como '.512.jpg' o carátula original de alta resolución.
        """
        target = Path(target_path)
        target.parent.mkdir(parents=True, exist_ok=True)

        fn = cover_filename
        if variant and not fn.endswith(variant):
            fn = f"{fn}{variant}"

        url = f"{MANGADEX_UPLOADS}/covers/{manga_id}/{fn}"
        cmd = [
            "curl.exe",
            "-s",
            "--connect-timeout", "10",
            "--max-time", "30",
            "-A", self.user_agent,
            "-o", str(target),
            url
        ]
        try:
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if target.exists() and target.stat().st_size > 0:
                return True
            return False
        except Exception as e:
            logger.warning(f"Error descargando carátula {url}: {e}")
            return False

    def get_all_chapters_feed(
        self,
        manga_id: str,
        languages: Optional[List[str]] = None,
        content_ratings: Optional[List[str]] = None,
        limit_per_page: int = 100
    ) -> Dict[str, Dict]:
        """
        Obtiene TODOS los capítulos disponibles en los idiomas especificados (ej. 'es-la' y 'es'),
        filtrando capítulos externos (externalUrl is None y pages > 0),
        y agrupándolos ordenados por capítulo con candidatos ordenados por número de páginas y versión.
        """
        target_langs = languages if languages is not None else DEFAULT_LANGUAGES
        ratings = content_ratings or DEFAULT_CONTENT_RATINGS

        url = f"{MANGADEX_API}/chapter"
        all_raw = []
        offset = 0

        while True:
            params: List[Tuple[str, Any]] = [
                ("manga", manga_id),
                ("limit", limit_per_page),
                ("offset", offset),
                ("order[chapter]", "asc")
            ]
            for lang in target_langs:
                params.append(("translatedLanguage[]", lang))
            for cr in ratings:
                params.append(("contentRating[]", cr))

            res = self._request("GET", url, params=params, timeout=20)
            res.raise_for_status()
            data = res.json()
            items = data.get("data", [])
            if not items:
                break
            all_raw.extend(items)
            offset += len(items)
            if offset >= data.get("total", 0):
                break

        grouped: Dict[str, Dict] = {}
        for ch in all_raw:
            attrs = ch.get("attributes", {})

            # Filtro Mandatorio: Excluir capítulos externos (MangaPlus, etc.)
            if attrs.get("externalUrl"):
                continue

            # Filtro Mandatorio: Excluir capítulos sin páginas
            pages_count = attrs.get("pages", 0) or 0
            if pages_count <= 0:
                continue

            ch_num = attrs.get("chapter") or "01"

            vol_num = attrs.get("volume")
            ch_id = ch.get("id")

            if ch_num not in grouped:
                grouped[ch_num] = {
                    "chapter": ch_num,
                    "volume": vol_num,
                    "candidates": []
                }

            if not grouped[ch_num]["volume"] and vol_num:
                grouped[ch_num]["volume"] = vol_num

            grouped[ch_num]["candidates"].append({
                "id": ch_id,
                "pages": pages_count,
                "volume": vol_num,
                "lang": attrs.get("translatedLanguage"),
                "version": attrs.get("version", 1),
                "updatedAt": attrs.get("updatedAt", "")
            })

        for ch_num, ch_data in grouped.items():
            ch_data["candidates"].sort(key=lambda c: (c["pages"], c["version"]), reverse=True)

        return grouped

    def get_chapter_pages_info(
        self,
        chapter_id: str,
        max_retries: int = 4
    ) -> Tuple[str, str, List[str], List[str]]:
        """
        Consulta el At-Home server para obtener base_url, hash, páginas data y páginas dataSaver.
        Aplica reintentos exponenciales con jitter ante 429 y 5xx.
        """
        url = f"{MANGADEX_API}/at-home/server/{chapter_id}"
        for attempt in range(max_retries):
            self.rate_limiter.acquire(1.0)
            try:
                res = self.session.get(url, timeout=15)
                if res.status_code == 429 or res.status_code in (500, 502, 503, 504):
                    retry_after = res.headers.get("Retry-After")
                    if retry_after and retry_after.strip().isdigit():
                        wait_t = float(retry_after) + random.uniform(0.0, 0.5)
                    else:
                        wait_t = (2.0 * (attempt + 1)) + random.uniform(0.0, 0.5)

                    logger.warning(f"Rate limit / error {res.status_code} en MangaDex API. Esperando {wait_t:.2f}s...")
                    time.sleep(wait_t)
                    continue

                res.raise_for_status()
                data = res.json()
                base_url = data["baseUrl"]
                ch_hash = data["chapter"]["hash"]
                pages = data["chapter"]["data"]
                pages_saver = data["chapter"].get("dataSaver", [])
                return base_url, ch_hash, pages, pages_saver
            except (requests.ConnectionError, requests.Timeout) as e:
                logger.warning(f"Error de red en At-Home ({e}). Probando fallback curl.exe...")
                try:
                    c_res = self._curl_request("GET", url, timeout=15)
                    if c_res.status_code == 200:
                        data = c_res.json()
                        base_url = data["baseUrl"]
                        ch_hash = data["chapter"]["hash"]
                        pages = data["chapter"]["data"]
                        pages_saver = data["chapter"].get("dataSaver", [])
                        return base_url, ch_hash, pages, pages_saver
                except Exception:
                    pass
                wait_t = (2.0 * (attempt + 1)) + random.uniform(0.2, 0.8)
                try:
                    self.session.close()
                except Exception:
                    pass
                time.sleep(wait_t)

        raise RuntimeError(f"No se pudo obtener información de páginas para el capítulo {chapter_id}")

    def download_page(
        self,
        base_url: str,
        ch_hash: str,
        page_name: str,
        saver_name: Optional[str] = None,
        use_data_saver: bool = False,
        dest_path: Optional[Union[str, Path]] = None,
        session: Optional[requests.Session] = None
    ) -> Union[bytes, bool]:
        """
        Descarga una página de imagen con arquitectura multi-fallback:
        1. Primary: MangaDex@Home baseUrl/data/{hash}/{file}
        2. Fallback: uploads.mangadex.org/data/{hash}/{file}
        3. Data-saver fallback: baseUrl/data-saver/{hash}/{file} o uploads.mangadex.org/data-saver/{hash}/{file}
        
        Si dest_path está especificado, guarda en disco y retorna bool.
        Si dest_path es None, retorna los bytes descargados.
        """
        sess = session or self.session

        # Formar la lista ordenada de URLs candidatas según prioridad
        candidate_urls: List[str] = []
        if not use_data_saver:
            # 1. Primaria @Home
            candidate_urls.append(f"{base_url}/data/{ch_hash}/{page_name}")
            # 2. Fallback CDN central
            candidate_urls.append(f"{MANGADEX_UPLOADS}/data/{ch_hash}/{page_name}")

        # 3. Data-saver candidates
        s_name = saver_name or page_name
        candidate_urls.append(f"{base_url}/data-saver/{ch_hash}/{s_name}")
        candidate_urls.append(f"{MANGADEX_UPLOADS}/data-saver/{ch_hash}/{s_name}")

        if dest_path:
            import subprocess
            dest = Path(dest_path)
            dest.parent.mkdir(parents=True, exist_ok=True)
            for url in candidate_urls:
                try:
                    cmd = ["curl.exe", "-s", "--connect-timeout", "8", "--max-time", "25", "-o", str(dest), "-w", "%{http_code}", url]
                    p = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                    if p.stdout.strip() == "200" and dest.exists() and dest.stat().st_size > 1000:
                        return True
                except Exception:
                    continue
            return False

        for url in candidate_urls:
            for attempt in range(2):
                try:
                    r = sess.get(url, timeout=10)
                    if r.status_code == 200 and len(r.content) > 1000:
                        return r.content
                except Exception:
                    time.sleep(0.2)

        raise RuntimeError(f"Error descargando página {page_name} en todos los servidores y fallbacks.")
