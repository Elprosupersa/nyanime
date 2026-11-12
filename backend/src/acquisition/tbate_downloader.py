"""
Módulo de descarga Ultra Turbo para 'The Beginning After the End' (TBATE) en Español.
Fuente: LeerCapitulo / Manhwa CDN
Estructura: E:\\Manga\\The Beginning After the End\\Tomo XX\\Capitulo XX.pdf
"""

import os
import sys
import time
import json
import re
import logging
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Tuple, Optional

import requests
from requests.adapters import HTTPAdapter
from bs4 import BeautifulSoup
from PIL import Image

try:
    import img2pdf
    HAS_IMG2PDF = True
except ImportError:
    HAS_IMG2PDF = False

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("TBATEDownloader")

BASE_URL = "https://www.leercapitulo.co"
SERIES_URL = "https://www.leercapitulo.co/manga/mih4w1tvp1/la-vida-despues-de-la-muerte/"

class TBATEPipeline:
    def __init__(self, output_root: str = r"E:\Manga", min_chapter: float = 180.0, max_workers: int = 8):
        self.output_root = Path(output_root)
        self.min_chapter = min_chapter
        self.max_workers = max_workers
        self.manga_dir = self.output_root / "The Beginning After the End"

        self.session = requests.Session()
        adapter = HTTPAdapter(pool_connections=64, pool_maxsize=64, max_retries=3)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        })

    def get_chapters_list(self) -> List[Tuple[float, str, str]]:
        """Obtiene la lista de capítulos disponibles en LeerCapitulo ordenados ascendentemente."""
        logger.info(f"📡 Obteniendo catálogo de capítulos desde {SERIES_URL}...")
        res = self.session.get(SERIES_URL, timeout=20)
        res.raise_for_status()
        soup = BeautifulSoup(res.text, "html.parser")

        chapters = []
        for a in soup.find_all("a"):
            h = a.get("href", "")
            m = re.search(r"/leer/mih4w1tvp1/la-vida-despues-de-la-muerte/([\d\.]+)/", h)
            if m:
                c_str = m.group(1)
                try:
                    c_num = float(c_str)
                    full_link = BASE_URL + h if not h.startswith("http") else h
                    chapters.append((c_num, c_str, full_link))
                except ValueError:
                    pass

        # Quitar duplicados
        seen = set()
        unique = []
        for c_num, c_str, link in chapters:
            if c_str not in seen:
                seen.add(c_str)
                unique.append((c_num, c_str, link))

        unique.sort(key=lambda x: x[0])
        filtered = [x for x in unique if x[0] >= self.min_chapter]
        logger.info(f"📚 Capítulos totales en el sitio: {len(unique)} | A descargar (>= {self.min_chapter}): {len(filtered)}")
        return filtered

    def save_metadata_and_cover(self):
        """Descarga portada oficial y guarda metadata."""
        self.manga_dir.mkdir(parents=True, exist_ok=True)
        cover_dest = self.manga_dir / "poster.jpg"
        meta_dest = self.manga_dir / "manga_info.json"

        metadata = {
            "title": "The Beginning After the End",
            "alternative_titles": ["La Vida Después de la Muerte", "TBATE"],
            "author": "TurtleMe",
            "artist": "Fuyuki23 / MG",
            "genres": ["Acción", "Aventura", "Fantasía", "Isekai", "Reencarnación", "Magia"],
            "source": SERIES_URL
        }
        with open(meta_dest, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

        if not cover_dest.exists():
            # Buscar portada en la página de la serie
            try:
                r = self.session.get(SERIES_URL, timeout=15)
                soup = BeautifulSoup(r.text, "html.parser")
                cover_img = soup.find("img", {"alt": lambda a: a and "La Vida Después de la Muerte" in a}) or soup.find("div", class_="cover").find("img")
                if cover_img and cover_img.get("src"):
                    c_url = cover_img["src"]
                    if not c_url.startswith("http"):
                        c_url = BASE_URL + c_url
                    res_c = self.session.get(c_url, headers={"Referer": SERIES_URL}, timeout=15)
                    if res_c.status_code == 200:
                        with open(cover_dest, "wb") as f:
                            f.write(res_c.content)
                        logger.info("🖼️  Portada guardada: poster.jpg")
            except Exception as e:
                logger.warning(f"No se pudo descargar portada automática: {e}")

    def get_chapter_images(self, chapter_url: str) -> List[str]:
        """Extrae la lista de URLs de imágenes del visor del capítulo."""
        res = self.session.get(chapter_url, timeout=20)
        res.raise_for_status()
        soup = BeautifulSoup(res.text, "html.parser")

        img_urls = []
        for img in soup.find_all("img"):
            src = img.get("data-src") or img.get("src")
            if src and src.startswith("http"):
                # Evitar logos o banners de la web
                if any(x in src.lower() for x in ["logo", "banner", "icon", "advert", "anuncio"]):
                    continue
                img_urls.append(src)
        return img_urls

    def _download_single_image(self, img_url: str, dest_path: Path, referer: str) -> bool:
        """Descarga una sola imagen con reintentos."""
        headers = {"Referer": referer}
        for attempt in range(4):
            try:
                r = self.session.get(img_url, headers=headers, timeout=20)
                if r.status_code == 200 and len(r.content) > 1000:
                    with open(dest_path, "wb") as f:
                        f.write(r.content)
                    return True
                elif r.status_code == 429:
                    time.sleep(1.0 * (attempt + 1))
                else:
                    time.sleep(0.5)
            except Exception:
                time.sleep(0.5)
        return False

    def compile_to_pdf(self, image_paths: List[Path], output_pdf: Path) -> bool:
        """Compila las imágenes ordenadas a PDF."""
        if not image_paths:
            return False

        output_pdf.parent.mkdir(parents=True, exist_ok=True)
        temp_pdf = output_pdf.with_suffix(".tmp.pdf")

        success = False
        if HAS_IMG2PDF:
            try:
                with open(temp_pdf, "wb") as f:
                    f.write(img2pdf.convert([str(p) for p in image_paths]))
                success = True
            except Exception:
                success = False

        if not success:
            pil_images = []
            try:
                for img_p in image_paths:
                    img = Image.open(img_p)
                    if img.mode != "RGB":
                        img = img.convert("RGB")
                    pil_images.append(img)

                if pil_images:
                    pil_images[0].save(
                        temp_pdf,
                        "PDF",
                        resolution=100.0,
                        save_all=True,
                        append_images=pil_images[1:]
                    )
                    success = True
            except Exception as e:
                logger.error(f"Error compilando PDF con Pillow {output_pdf.name}: {e}")
                if temp_pdf.exists():
                    try:
                        temp_pdf.unlink()
                    except Exception:
                        pass
                return False
            finally:
                for im in pil_images:
                    try:
                        im.close()
                    except Exception:
                        pass

        if success and temp_pdf.exists() and temp_pdf.stat().st_size > 10000:
            for attempt in range(5):
                try:
                    if output_pdf.exists():
                        try:
                            output_pdf.unlink()
                        except Exception:
                            pass
                    temp_pdf.rename(output_pdf)
                    return True
                except PermissionError:
                    time.sleep(0.5)
                except Exception as e:
                    logger.error(f"Error renombrando {temp_pdf.name} a {output_pdf.name}: {e}")
                    time.sleep(0.5)
            # Fallback con shutil
            try:
                import shutil
                shutil.move(str(temp_pdf), str(output_pdf))
                return True
            except Exception:
                pass
        return False

    def download_chapter(self, c_num: float, c_str: str, chapter_url: str, temp_cache: Path) -> bool:
        """Descarga y compila un capítulo específico a PDF."""
        # Determinar Tomo / Temporada según numeración canónica de TBATE:
        # Temporada 6 / Tomo 06: Capítulos 176 - 212
        # Temporada 7 / Tomo 07: Capítulos 213 - en adelante
        if c_num < 213:
            vol_folder = "Tomo 06"
        else:
            vol_folder = "Tomo 07"

        # Nombre de archivo
        if c_num.is_integer():
            ch_filename = f"Capitulo {int(c_num):03d}.pdf"
        else:
            ch_filename = f"Capitulo {c_str}.pdf"

        dest_pdf = self.manga_dir / vol_folder / ch_filename

        # Si ya existe y pesa más de 500 KB, saltar
        if dest_pdf.exists() and dest_pdf.stat().st_size > 500 * 1024:
            logger.info(f"⏭️  Ya existe: {vol_folder} / {ch_filename} ({dest_pdf.stat().st_size // 1024} KB)")
            return True

        # Obtener lista de imágenes
        try:
            img_urls = self.get_chapter_images(chapter_url)
        except Exception as e:
            logger.error(f"Error obteniendo imágenes para Cap {c_str}: {e}")
            return False

        if not img_urls:
            logger.warning(f"No se encontraron imágenes en el visor para Cap {c_str}")
            return False

        ch_temp = temp_cache / f"ch_{c_str.replace('.', '_')}"
        ch_temp.mkdir(parents=True, exist_ok=True)

        download_tasks = []
        page_files = []
        for idx, u in enumerate(img_urls):
            dest_img = ch_temp / f"{idx:03d}.jpg"
            page_files.append(dest_img)
            download_tasks.append((u, dest_img))

        # Descarga concurrente con max_workers
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = [
                executor.submit(self._download_single_image, url, pth, chapter_url)
                for url, pth in download_tasks
                if not pth.exists() or pth.stat().st_size == 0
            ]
            for fut in as_completed(futures):
                fut.result()

        downloaded = [p for p in page_files if p.exists() and p.stat().st_size > 1000]
        if len(downloaded) != len(img_urls):
            logger.warning(f"⚠️ Cap {c_str} incompleto ({len(downloaded)}/{len(img_urls)} págs).")
            return False

        # Compilar a PDF
        t0 = time.time()
        ok = self.compile_to_pdf(downloaded, dest_pdf)
        elapsed = time.time() - t0

        # Limpiar temporales
        for p in downloaded:
            try:
                p.unlink()
            except Exception:
                pass
        try:
            ch_temp.rmdir()
        except Exception:
            pass

        if ok:
            logger.info(f"✅ {vol_folder} / {ch_filename} ({len(img_urls)} págs en {elapsed:.1f}s, {dest_pdf.stat().st_size // 1024} KB)")
            return True
        else:
            logger.error(f"❌ Falló compilación PDF para Cap {c_str}")
            return False

    def process(self):
        """Ejecuta la descarga completa de la cola de capítulos."""
        self.save_metadata_and_cover()
        chapters = self.get_chapters_list()
        total = len(chapters)
        if total == 0:
            logger.warning("No hay capítulos pendientes por descargar.")
            return

        temp_cache = Path(r"E:\Manga\.temp_cache_tbate")
        temp_cache.mkdir(parents=True, exist_ok=True)

        success = 0
        t_start = time.time()

        for idx, (c_num, c_str, link) in enumerate(chapters, 1):
            logger.info(f"[{idx}/{total}] Procesando Capítulo {c_str}...")
            ok = self.download_chapter(c_num, c_str, link, temp_cache)
            if ok:
                success += 1
            time.sleep(0.15)

        total_time = time.time() - t_start
        logger.info("=" * 60)
        logger.info(f"🎉 TBATE Concluido: {success}/{total} capítulos listos en PDF")
        logger.info(f"⏱️  Tiempo total: {total_time/60:.2f} minutos")
        logger.info(f"📍 Directorio: {self.manga_dir}")
        logger.info("=" * 60)

        # Limpiar temp cache si está vacía
        try:
            temp_cache.rmdir()
        except Exception:
            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TBATE Ultra Turbo Downloader")
    parser.add_argument("--min", type=float, default=180.0, help="Capítulo inicial mínimo (default: 180)")
    parser.add_argument("--dest", type=str, default=r"E:\Manga", help="Directorio raíz de salida")
    parser.add_argument("--workers", type=int, default=8, help="Hilos concurrentes")
    args = parser.parse_args()

    pipeline = TBATEPipeline(output_root=args.dest, min_chapter=args.min, max_workers=args.workers)
    pipeline.process()
