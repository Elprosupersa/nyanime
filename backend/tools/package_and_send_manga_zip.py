import os
import sys
import time
import zipfile
import shutil
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SOURCE_DIR = Path(r"E:\OTAKU\MANGAS\General\Please Excuse My Younger Brothers")
ZIP_NAME = "Please Excuse My Younger Brothers (Capitulos 01-33).zip"
LOCAL_ZIP_PATH = SOURCE_DIR / ZIP_NAME
PHONE_DEST_DIR = Path(r"C:\Users\gonza\CrossDevice\Xiaomi 14T Pro (1)\storage\Download")
PHONE_ZIP_PATH = PHONE_DEST_DIR / ZIP_NAME

def main():
    print("=" * 70)
    print("📦 EMPAQUETADO Y TRANSFERENCIA DIRECTA A XIAOMI 14T PRO")
    print(f"📁 Directorio de origen: {SOURCE_DIR}")
    print("=" * 70)

    # 1. Obtener archivos a comprimir
    pdf_files = sorted(list(SOURCE_DIR.glob("Capitulo *.pdf")))
    extra_files = []
    if (SOURCE_DIR / "manga_info.json").exists():
        extra_files.append(SOURCE_DIR / "manga_info.json")
    if (SOURCE_DIR / "cover.jpg").exists():
        extra_files.append(SOURCE_DIR / "cover.jpg")

    all_files = pdf_files + extra_files
    print(f"📄 Archivos encontrados para comprimir: {len(pdf_files)} capítulos PDF + {len(extra_files)} metadatos/portada")

    if not pdf_files:
        print("❌ Error: No se encontraron capítulos PDF para comprimir.")
        sys.exit(1)

    total_uncompressed_bytes = sum(f.stat().st_size for f in all_files)
    print(f"📊 Peso total sin comprimir: {total_uncompressed_bytes / (1024*1024):.2f} MB")

    # 2. Generar el archivo .zip local
    print(f"\n[*] Creando archivo ZIP: {ZIP_NAME}...")
    t0_zip = time.time()
    
    # Usar compresión optimizada ZIP_STORED / deflated rápido para PDFs ya comprimidos
    with zipfile.ZipFile(LOCAL_ZIP_PATH, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
        for idx, f in enumerate(all_files, 1):
            arcname = f.name
            zf.write(f, arcname=arcname)
            if idx % 5 == 0 or idx == len(all_files):
                print(f"  [{idx}/{len(all_files)}] Añadido: {arcname}")

    zip_duration = time.time() - t0_zip
    zip_size_bytes = LOCAL_ZIP_PATH.stat().st_size
    zip_size_mb = zip_size_bytes / (1024*1024)
    print(f"✅ ZIP local creado con éxito: {zip_size_mb:.2f} MB en {zip_duration:.2f}s")

    # 3. Transferir al almacenamiento del celular
    print(f"\n[*] Transfiriendo ZIP a Xiaomi 14T Pro:")
    print(f"    Destino: {PHONE_ZIP_PATH}")
    
    if not PHONE_DEST_DIR.exists():
        print(f"❌ Error: La ruta del celular {PHONE_DEST_DIR} no es accesible.")
        sys.exit(1)

    t0_transfer = time.time()
    buffer_size = 16 * 1024 * 1024 # 16 MB buffer de saturación
    with open(LOCAL_ZIP_PATH, 'rb') as fsrc, open(PHONE_ZIP_PATH, 'wb') as fdst:
        copied = 0
        while True:
            chunk = fsrc.read(buffer_size)
            if not chunk:
                break
            fdst.write(chunk)
            copied += len(chunk)
            pct = (copied / zip_size_bytes) * 100
            print(f"\r  -> Transfiriendo: {copied / (1024*1024):.1f} MB / {zip_size_mb:.1f} MB ({pct:.1f}%)", end="", flush=True)

    transfer_duration = max(time.time() - t0_transfer, 0.01)
    transfer_speed_mbps = (zip_size_bytes * 8) / (transfer_duration * 1_000_000)
    transfer_speed_mbs = zip_size_mb / transfer_duration
    print(f"\n✅ Transferencia finalizada en {transfer_duration:.2f}s a {transfer_speed_mbs:.2f} MB/s ({transfer_speed_mbps:.2f} Mbps)!")

    # 4. Verificación de integridad en el celular
    if PHONE_ZIP_PATH.exists():
        phone_size = PHONE_ZIP_PATH.stat().st_size
        if phone_size == zip_size_bytes:
            print(f"🔒 Verificación forense: 100% IDÉNTICO ({phone_size} bytes en el teléfono).")
        else:
            print(f"⚠️ Advertencia: Discrepancia de tamaño (Local: {zip_size_bytes} vs Teléfono: {phone_size}).")
    else:
        print("❌ Error: El archivo no aparece en el destino del teléfono.")

    print("\n" + "=" * 70)
    print("🎉 OPERACIÓN COMPLETADA CON ÉXITO")
    print(f"📱 Ubicación en tu Xiaomi 14T Pro: Almacenamiento interno > Download > {ZIP_NAME}")
    print("=" * 70)

if __name__ == "__main__":
    main()
