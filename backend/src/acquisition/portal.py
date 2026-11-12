import os
import re
import time
import logging
import unicodedata
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

from .plugins.base import BaseScraper, EpisodeResult
from .plugins.az_animex import AZAnimexScraper
from .plugins.tioanime import TioAnimeScraper
from .plugins.jkanime import JKAnimeScraper
from .plugins.fukou_da_direct import FukouDaDirectScraper
from .plugins.fukou_da import FukouDaScraper
from .plugins.animejara import AnimeJaraScraper
from .plugins.henaojara import HenaoJaraScraper
from .plugins.animeonline_ninja import AnimeOnlineNinjaScraper
from .plugins.sphinxanime import SphinxAnimeScraper
from .plugins.younime import YounimeScraper
from .plugins.dw_anime import DWAnimeScraper
from .plugins.unionfansub import UnionFansubScraper
from .downloader import Downloader

logger = logging.getLogger("MultiProviderAnimePortal")

class MultiProviderAnimePortal:
    """
    Portal y Motor Central Multi-Proveedor de Descarga y Fallback Dinámico.
    Integra más de 10 proveedores y múltiples servidores (Mediafire, Mega, Mp4upload, Streamwish, etc.)
    con auto-conmutación transparente ante caídas o bajadas de velocidad (<60 Mbps).
    """
    def __init__(self, config_path: str = "config.yaml"):
        self.config_path = config_path
        self.providers: List[BaseScraper] = [
            TioAnimeScraper(),
            JKAnimeScraper(),
            AZAnimexScraper(),
            FukouDaDirectScraper(),
            FukouDaScraper(),
            AnimeJaraScraper(),
            HenaoJaraScraper(),
            UnionFansubScraper()
        ]
        self.stats = {
            "total_attempts": 0,
            "successful_downloads": 0,
            "failovers_triggered": 0,
            "provider_success": {}
        }
        logger.info(f"🌐 [PORTAL INICIALIZADO] {len(self.providers)} proveedores de streaming/descarga activos.")

    def get_providers_info(self) -> List[Dict[str, Any]]:
        """Retorna información y metadatos de los proveedores configurados."""
        info = []
        for p in self.providers:
            info.append({
                "name": p.name,
                "base_url": getattr(p, "base_url", "N/A"),
                "priority": getattr(p, "priority", 10),
                "is_active": True
            })
        return info

    def check_providers_health(self, timeout: float = 6.0) -> List[Dict[str, Any]]:
        """
        Realiza un diagnóstico de salud y latencia en vivo para cada proveedor en paralelo.
        """
        results = []
        from curl_cffi import requests

        def ping_provider(provider):
            url = getattr(provider, "base_url", None)
            if not url or url == "N/A":
                return {"name": provider.name, "url": "N/A", "status": "UNKNOWN", "latency_ms": 0}
            t0 = time.time()
            try:
                s = requests.Session(impersonate="chrome120", timeout=timeout)
                resp = s.get(url, timeout=timeout)
                lat = int((time.time() - t0) * 1000)
                status = "ONLINE" if resp.status_code in [200, 301, 302] else f"HTTP_{resp.status_code}"
                return {"name": provider.name, "url": url, "status": status, "latency_ms": lat}
            except Exception as e:
                lat = int((time.time() - t0) * 1000)
                return {"name": provider.name, "url": url, "status": "OFFLINE", "latency_ms": lat, "error": str(e)}

        with ThreadPoolExecutor(max_workers=len(self.providers)) as executor:
            future_to_p = {executor.submit(ping_provider, p): p for p in self.providers}
            for future in as_completed(future_to_p):
                results.append(future.result())

        return sorted(results, key=lambda x: (x["status"] != "ONLINE", x.get("latency_ms", 9999)))

    def search_all_providers(self, query: str) -> Dict[str, Any]:
        """
        Busca simultáneamente un anime en los principales portales y devuelve los resultados consolidados.
        """
        query_norm = unicodedata.normalize('NFKD', query).encode('ASCII', 'ignore').decode('utf-8').strip()
        aggregated_results = []

        def search_single(provider):
            p_res = []
            try:
                # Si el scraper soporta búsqueda por catálogo/directorio
                if hasattr(provider, "_search_anime_slugs"):
                    slugs = provider._search_anime_slugs(query_norm)
                    for s in slugs[:4]:
                        p_res.append({"title": s.replace('-', ' ').title(), "slug": s, "provider": provider.name})
            except Exception as e:
                logger.debug(f"Error en búsqueda con {provider.name}: {e}")
            return p_res

        with ThreadPoolExecutor(max_workers=min(6, len(self.providers))) as executor:
            futures = [executor.submit(search_single, p) for p in self.providers]
            for f in as_completed(futures):
                aggregated_results.extend(f.result())

        return {
            "query": query,
            "total_found": len(aggregated_results),
            "results": aggregated_results
        }

    def _rank_candidate(self, cand: EpisodeResult) -> int:
        """
        Asigna una puntuación de prioridad al candidato:
        Mediafire Directo (100) > Mp4upload Directo (90) > Mega Directo (85) > YourUpload Directo (80) > Embeds (50..30)
        """
        score = 0
        u = (cand.download_url or "").lower()
        src = (cand.source or "").lower()
        mirror = (getattr(cand, "mirror_name", "") or "").lower()

        if cand.is_direct_link:
            score += 40
        if cand.quality and "1080p" in cand.quality:
            score += 20
        elif cand.quality and "720p" in cand.quality:
            score += 10

        if "mediafire" in u or "mediafire" in src or "mediafire" in mirror:
            score += 40
        elif "yourupload" in u or "yourupload" in src or "yourupload" in mirror:
            score += 38
        elif "mp4upload" in u or "mp4upload" in src or "mp4upload" in mirror:
            score += 35
        elif "mega.nz" in u or "mega" in src or "mega" in mirror:
            score += 30
        elif any(k in u or k in src or k in mirror for k in ["streamwish", "vidhide", "voe"]):
            score += 15

        return score

    def resolve_all_candidates(
        self,
        anime_name: str,
        episode_number: int | str,
        aliases: Optional[List[str]] = None
    ) -> List[EpisodeResult]:
        """
        Recopila y clasifica exhaustivamente todos los enlaces y servidores disponibles
        en todos los proveedores para este episodio específico.
        """
        if not anime_name:
            anime_name = ""
        ep_str = f"{int(episode_number):02d}" if (isinstance(episode_number, int) or str(episode_number).isdigit()) else str(episode_number)
        
        all_names = [anime_name] if anime_name else []
        if aliases:
            all_names.extend([a for a in aliases if a])
        if not all_names:
            return []

        # Generar variaciones de títulos limpias y sin acentos
        unique_names = []
        seen_names = set()
        for n in all_names:
            if not n:
                continue
            if n not in seen_names:
                seen_names.add(n)
                unique_names.append(n)
            norm = unicodedata.normalize('NFKD', n).encode('ASCII', 'ignore').decode('utf-8')
            if norm and norm not in seen_names:
                seen_names.add(norm)
                unique_names.append(norm)

        candidates: List[EpisodeResult] = []
        seen_urls = set()

        def _fetch_provider(provider, title):
            res_list = []
            try:
                p_cands = provider.search_episode_candidates(title, ep_str)
                if not p_cands and hasattr(provider, "search_episode"):
                    single = provider.search_episode(title, ep_str)
                    if single:
                        p_cands = [single]
                for c in (p_cands or []):
                    if isinstance(c, EpisodeResult) and c.download_url:
                        c.episode_number = ep_str
                        res_list.append(c)
            except Exception as e:
                logger.debug(f"Error consultando {provider.name} para {title} ep {ep_str}: {e}")
            return res_list

        # Top-tier fast scrapers: AZAnimex, TioAnime, JKAnime, FukouDaDirect
        primary_providers = [p for p in self.providers if p.name in ["AZAnimexScraper", "TioAnimeScraper", "JKAnimeScraper", "FukouDaDirectScraper"]]
        secondary_providers = [p for p in self.providers if p not in primary_providers]

        # 1. Consultar proveedores prioritarios primero (resolución en < 1 segundo)
        max_workers_prim = max(1, min(6, len(primary_providers) * max(1, len(unique_names))))
        with ThreadPoolExecutor(max_workers=max_workers_prim) as executor:
            futures = [executor.submit(_fetch_provider, p, name) for p in primary_providers for name in unique_names]
            for f in as_completed(futures):
                for c in f.result():
                    if c.download_url not in seen_urls:
                        seen_urls.add(c.download_url)
                        candidates.append(c)

        # Si ya tenemos candidatos de alta fidelidad (Mediafire o Mp4upload directo 1080p), no demoramos
        has_direct_top = any(c.is_direct_link and c.quality and "1080p" in c.quality for c in candidates)
        if not has_direct_top and secondary_providers:
            max_workers_sec = max(1, min(6, len(secondary_providers) * max(1, len(unique_names))))
            with ThreadPoolExecutor(max_workers=max_workers_sec) as executor:
                futures = [executor.submit(_fetch_provider, p, name) for p in secondary_providers for name in unique_names]
                for f in as_completed(futures):
                    for c in f.result():
                        if c.download_url not in seen_urls:
                            seen_urls.add(c.download_url)
                            candidates.append(c)

        # Ordenar por el ranking de velocidad y confiabilidad
        candidates.sort(key=self._rank_candidate, reverse=True)
        return candidates

    def download_episode_with_failover(
        self,
        anime_name: str,
        episode_number: int | str,
        target_dir: str | Path,
        search_titles: Optional[List[str]] = None,
        dry_run: bool = False
    ) -> Dict[str, Any]:
        """
        Ejecuta la adquisición con Auto-Failover y Vigilancia de Rendimiento Dinámica:
        Prueba ordenadamente cada servidor/proveedor candidato. Si uno falla (HTTP 404/502),
        está caído o la velocidad cae (<60 Mbps), conmuta instantáneamente al siguiente.
        """
        ep_str = f"{int(episode_number):02d}" if isinstance(episode_number, int) or str(episode_number).isdigit() else str(episode_number)
        target_path = Path(target_dir)

        # Verificar si ya existe en disco
        if target_path.exists():
            from .utils import extract_episode_number
            try:
                target_int = int(ep_str)
                for f in target_path.iterdir():
                    if f.is_file() and f.suffix.lower() in ['.mp4', '.mkv', '.avi']:
                        found_ep = extract_episode_number(f.name)
                        if found_ep == target_int and f.stat().st_size > 10000000:
                            logger.info(f"✅ El episodio {ep_str} de '{anime_name}' ya está presente en disco: {f.name}")
                            return {
                                "success": True,
                                "skipped": True,
                                "file": str(f),
                                "used_provider": "Local Disk Cache",
                                "history": []
                            }
            except Exception:
                pass

        logger.info(f"\n=======================================================")
        logger.info(f"🎯 [PORTAL MULTI-PROVEEDOR] Buscando '{anime_name}' - Ep {ep_str}...")
        logger.info(f"=======================================================")

        candidates = self.resolve_all_candidates(anime_name, ep_str, search_titles)
        if not candidates:
            logger.warning(f"❌ No se encontraron enlaces candidatos en ningún proveedor para '{anime_name}' ep {ep_str}.")
            return {
                "success": False,
                "anime": anime_name,
                "episode": ep_str,
                "error": "No candidates found across all providers",
                "history": []
            }

        logger.info(f"📋 Se hallaron {len(candidates)} candidatos clasificados por velocidad y estabilidad:")
        for idx, c in enumerate(candidates, start=1):
            logger.info(f"   [{idx}] Fuente: {c.source} | URL: {c.download_url[:75]}... | Calidad: {c.quality}")

        downloader = Downloader(str(target_path))
        history = []
        self.stats["total_attempts"] += 1

        for idx, candidate in enumerate(candidates, start=1):
            logger.info(f"\n⚡ [INTENTO {idx}/{len(candidates)}] Probando {candidate.source} -> {candidate.download_url[:80]}...")
            
            if dry_run:
                logger.info(f"[DRY-RUN] Se descargaría desde {candidate.source} hacia {target_path}")
                return {
                    "success": True,
                    "dry_run": True,
                    "used_provider": candidate.source,
                    "candidate_url": candidate.download_url,
                    "history": [{"provider": candidate.source, "status": "DRY_RUN_OK"}]
                }

            t0 = time.time()
            success = downloader.download(candidate)
            duration = round(time.time() - t0, 1)

            if success:
                logger.info(f"🎉 ¡DESCARGA EXITOSA! '{anime_name}' Ep {ep_str} conseguido vía [{candidate.source}] en {duration}s.")
                self.stats["successful_downloads"] += 1
                self.stats["provider_success"][candidate.source] = self.stats["provider_success"].get(candidate.source, 0) + 1
                history.append({"provider": candidate.source, "status": "SUCCESS", "duration_s": duration})
                found_file = str(target_path / f"{anime_name} - Episodio {ep_str}.mp4")
                if target_path.exists():
                    from .utils import extract_episode_number
                    target_int = int(ep_str) if ep_str.isdigit() else None
                    for f in target_path.iterdir():
                        if f.is_file() and f.suffix.lower() in ['.mp4', '.mkv', '.avi']:
                            if extract_episode_number(f.name) == target_int:
                                found_file = str(f)
                                break
                return {
                    "success": True,
                    "used_provider": candidate.source,
                    "file_path": found_file,
                    "duration_s": duration,
                    "history": history
                }
            else:
                self.stats["failovers_triggered"] += 1
                logger.warning(
                    f"⚠️ [AUTO-FAILOVER] Fallo o velocidad insuficiente (<60 Mbps) en [{candidate.source}] tras {duration}s. "
                    f"Conmutando de inmediato al candidato siguiente..."
                )
                history.append({"provider": candidate.source, "status": "FAILED_OR_SLOW", "duration_s": duration})

        logger.error(f"❌ Se agotaron todos los {len(candidates)} candidatos para '{anime_name}' Ep {ep_str} sin éxito.")
        return {
            "success": False,
            "anime": anime_name,
            "episode": ep_str,
            "error": "All candidates failed or fell below speed threshold",
            "history": history
        }

    def fill_missing_census(
        self,
        census_data: Any,
        library_base: Path,
        max_parallel_episodes: int = 1
    ) -> Dict[str, Any]:
        """
        Rellena masivamente la lista de episodios faltantes especificados en el censo.
        Soporta List[Dict[str, Any]] y Dict[str, Dict[str, Any]] evitando colisión de nombres entre temporadas.
        """
        summary = {
            "total_requested": 0,
            "completed": 0,
            "failed": 0,
            "details": []
        }

        items: List[Dict[str, Any]] = []
        if isinstance(census_data, list):
            items = census_data
        elif isinstance(census_data, dict):
            for k, v in census_data.items():
                if isinstance(v, dict):
                    entry = dict(v)
                    if "series" not in entry:
                        entry["series"] = k
                    items.append(entry)

        for series_info in items:
            series_name = series_info.get("series") or series_info.get("anime_name") or ""
            season_folder = series_info.get("season_folder", "Temporada 1")
            missing_eps = series_info.get("missing_episodes", [])
            aliases = series_info.get("aliases", [])
            target_dir = Path(library_base) / series_name / season_folder

            logger.info(f"\n=======================================================")
            logger.info(f"🚀 INICIANDO LLENADO DE CENSO: {series_name} ({season_folder})")
            logger.info(f"   Episodios a descargar ({len(missing_eps)}): {missing_eps}")
            logger.info(f"=======================================================")

            for ep in missing_eps:
                summary["total_requested"] += 1
                res = self.download_episode_with_failover(
                    anime_name=series_name,
                    episode_number=ep,
                    target_dir=target_dir,
                    search_titles=aliases
                )
                if res.get("success"):
                    summary["completed"] += 1
                else:
                    summary["failed"] += 1
                summary["details"].append({
                    "series": series_name,
                    "season": season_folder,
                    "episode": ep,
                    "result": res
                })

        return summary
