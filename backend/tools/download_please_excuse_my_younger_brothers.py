import os
import sys
import time
import json
import re
import urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import img2pdf
from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

TARGET_DIR = Path(r"E:\OTAKU\MANGAS\General\Please Excuse My Younger Brothers")
TARGET_DIR.mkdir(parents=True, exist_ok=True)

USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
INDEX_URL = "https://mangapill.com/manga/10085/uchi-no-otouto-domo-ga-sumimasen"

def get_chapter_list():
    req = urllib.request.Request(INDEX_URL, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as r:
        html = r.read().decode('utf-8', errors='ignore')
        raw_chapters = re.findall(r'href="(/chapters/10085-[^"]+)"[^>]*>([^<]+)<', html)

    chapters = []
    for ch_url, ch_title in raw_chapters:
        full_url = f"https://mangapill.com{ch_url.strip()}"
        m = re.search(r'Chapter\s*([\d\.]+)', ch_title)
        ch_num = float(m.group(1)) if m else 0.0
        chapters.append((ch_num, ch_title.strip(), full_url))

    chapters.sort(key=lambda x: x[0])
    return chapters

def download_page_bytes(idx_url):
    idx, img_url = idx_url
    req = urllib.request.Request(img_url, headers={
        'User-Agent': USER_AGENT,
        'Referer': 'https://mangapill.com/'
    })
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = resp.read()
                if len(data) > 1000:
                    return (idx, data)
        except Exception:
            time.sleep(0.5 + attempt * 0.5)
    return (idx, None)

def process_single_chapter(ch_tuple):
    ch_num, ch_title, ch_url = ch_tuple
    
    if ch_num.is_integer():
        ch_str = f"{int(ch_num):03d}"
    else:
        parts = str(ch_num).split('.')
        ch_str = f"{int(parts[0]):03d}.{parts[1]}"
        
    out_pdf = TARGET_DIR / f"Capitulo {ch_str}.pdf"
    
    # Check cache
    if out_pdf.exists() and out_pdf.stat().st_size > 500_000:
        return (ch_str, "cached", out_pdf.stat().st_size, 0, 0.0)
    
    # Fetch chapter page HTML to extract image links
    req = urllib.request.Request(ch_url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode('utf-8', errors='ignore')
            raw_imgs = re.findall(r'<img[^>]+(?:data-src|src)="([^"]+)"', html)
            chapter_imgs = [img for img in raw_imgs if 'cdn.readdetectiveconan.com' in img]
    except Exception as e:
        return (ch_str, f"error_fetch_html: {e}", 0, 0, 0.0)
        
    if not chapter_imgs:
        return (ch_str, "error_no_images", 0, 0, 0.0)
        
    # Download images concurrently in memory
    t0 = time.time()
    page_tasks = list(enumerate(chapter_imgs, 1))
    downloaded_pages = {}
    
    with ThreadPoolExecutor(max_workers=14) as page_exec:
        futures = [page_exec.submit(download_page_bytes, p) for p in page_tasks]
        for fut in as_completed(futures):
            idx, data = fut.result()
            if data:
                downloaded_pages[idx] = data

    t_dl = max(time.time() - t0, 0.001)
    
    if len(downloaded_pages) < len(chapter_imgs):
        missing = len(chapter_imgs) - len(downloaded_pages)
        return (ch_str, f"error_missing_{missing}_pages", 0, 0, 0.0)
        
    # Order bytes sequentially
    sorted_bytes = [downloaded_pages[i] for i in sorted(downloaded_pages.keys())]
    total_bytes = sum(len(b) for b in sorted_bytes)
    mbps = (total_bytes * 8) / (t_dl * 1_000_000)
    
    # Compile directly to PDF via img2pdf (lossless in RAM)
    try:
        pdf_data = img2pdf.convert(sorted_bytes)
        with open(out_pdf, "wb") as f:
            f.write(pdf_data)
        return (ch_str, "img2pdf", out_pdf.stat().st_size, total_bytes, mbps)
    except Exception as e_pdf:
        # Fallback to PIL in case of exotic image format
        try:
            import io
            pil_images = [Image.open(io.BytesIO(b)).convert('RGB') for b in sorted_bytes]
            pil_images[0].save(out_pdf, save_all=True, append_images=pil_images[1:])
            return (ch_str, "pil_fallback", out_pdf.stat().st_size, total_bytes, mbps)
        except Exception as e_pil:
            return (ch_str, f"error_pdf_conversion: {e_pil}", 0, 0, 0.0)

def main():
    print("=" * 70)
    print("⚡ PIPELINE ULTRA TURBO: Uchi no Otouto-domo ga Sumimasen")
    print("   (Please Excuse My Younger Brothers - Akira Ozaki)")
    print(f"📁 Directorio destino: {TARGET_DIR}")
    print("=" * 70)
    
    chapters = get_chapter_list()
    print(f"📖 Capítulos detectados en el repositorio: {len(chapters)}")
    
    # Download 4 chapters concurrently with massive RAM-to-disk pipelining
    t_start = time.time()
    total_downloaded_bytes = 0
    successful_count = 0
    speed_samples = []
    
    with ThreadPoolExecutor(max_workers=4) as ch_exec:
        futures = {ch_exec.submit(process_single_chapter, ch): ch for ch in chapters}
        for future in as_completed(futures):
            ch_str, mode, size, raw_bytes, mbps = future.result()
            if mode == "cached":
                successful_count += 1
                print(f"⏩ [Capítulo {ch_str}] Ya existía en caché ({size / (1024*1024):.2f} MB)")
            elif "error" in mode:
                print(f"❌ [Capítulo {ch_str}] ERROR: {mode}")
            else:
                successful_count += 1
                total_downloaded_bytes += raw_bytes
                speed_samples.append(mbps)
                print(f"✅ [Capítulo {ch_str}] Compilado ({size / (1024*1024):.2f} MB) | Red: {mbps:.2f} Mbps [{mode}]")

    t_total = max(time.time() - t_start, 0.001)
    avg_speed = (total_downloaded_bytes * 8) / (t_total * 1_000_000)
    
    print("-" * 70)
    print(f"🎉 Descarga Finalizada: {successful_count}/{len(chapters)} Capítulos listos en PDF.")
    print(f"📦 Total descargado: {total_downloaded_bytes / (1024*1024):.2f} MB")
    print(f"⏱️ Tiempo total: {t_total:.2f} segundos")
    print(f"🚀 Velocidad promedio de transferencia: {avg_speed:.2f} Mbps")
    if speed_samples:
        print(f"⚡ Pico máximo de red registrado: {max(speed_samples):.2f} Mbps")

    # Generate metadata file manga_info.json
    manga_info = {
        "id": "uchi-no-otouto-domo-ga-sumimasen",
        "title": "Please Excuse My Younger Brothers",
        "japanese_title": "うちの弟どもがすみません",
        "romaji_title": "Uchi no Otouto-domo ga Sumimasen",
        "alternative_titles": [
            "Pardon My Little Brothers",
            "Sorry About My Brothers",
            "Disculpen a mis hermanos menores"
        ],
        "author": "Akira Ozaki (オザキアキラ)",
        "magazine": "Bessatsu Margaret (Shueisha)",
        "demographic": "Shoujo",
        "genres": ["Comedy", "Romance", "School Life", "Family", "Slice of Life"],
        "status": "ongoing",
        "chapters_downloaded": successful_count,
        "format": "PDF (lossless img2pdf / 100% Native Quality)",
        "source": "Mangapill / Blueberryscans",
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    
    info_path = TARGET_DIR / "manga_info.json"
    with open(info_path, "w", encoding="utf-8") as f:
        json.dump(manga_info, f, ensure_ascii=False, indent=2)
    print(f"📋 Ficha técnica generada: {info_path.name}")
    
    # Save cover poster from the user's uploaded image or cover art if available
    user_cover = Path(r"C:\Users\gonza\.gemini\antigravity\brain\52d3448e-f4d4-46f8-9362-e84e7d248972\.user_uploaded\media_1793759799952_7b062359.jpg")
    dest_cover = TARGET_DIR / "cover.jpg"
    if user_cover.exists():
        import shutil
        shutil.copy2(user_cover, dest_cover)
        print("🖼️ Portada oficial guardada: cover.jpg")

if __name__ == "__main__":
    main()
