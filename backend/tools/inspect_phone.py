import win32com.client
import os
import sys

def main():
    print("=== INSPECCIONANDO EPISODIOS LOCALES 100 KANOJO ===")
    base = r"E:\OTAKU\ANIME\Kimi no Koto ga Dai Dai Dai Dai Daisuki na 100-nin no Kanojo"
    total_size = 0
    episodes_by_season = {}
    if os.path.exists(base):
        for root, dirs, files in os.walk(base):
            rel = os.path.relpath(root, base)
            for f in files:
                if f.lower().endswith(('.mkv', '.mp4', '.avi')):
                    fp = os.path.join(root, f)
                    sz = os.path.getsize(fp)
                    total_size += sz
                    episodes_by_season.setdefault(rel, []).append((f, sz, fp))
    
    for s, eps in sorted(episodes_by_season.items()):
        s_sz = sum(e[1] for e in eps) / (1024*1024*1024)
        print(f"Temporada / Carpeta: '{s}' -> {len(eps)} episodios ({s_sz:.2f} GB)")
        for ep_name, ep_sz, _ in eps[:3]:
            print(f"   Ejemplo: {ep_name} ({ep_sz/(1024*1024):.1f} MB)")
        if len(eps) > 3:
            print(f"   ... ({len(eps)-3} más)")

    print(f"\nTotal 100 Kanojo: {total_size / (1024*1024*1024):.2f} GB")

    print("\n=== INSPECCIONANDO XIAOMI 14T PRO ===")
    shell = win32com.client.Dispatch("Shell.Application")
    pc = shell.NameSpace(17)
    phone_item = None
    for item in pc.Items():
        if "Xiaomi" in item.Name or "14T" in item.Name:
            phone_item = item
            break
            
    if not phone_item:
        print("ERROR: No se encontró Xiaomi en 'Este equipo'")
        return

    print(f"Dispositivo encontrado: {phone_item.Name}")
    phone_folder = phone_item.GetFolder
    storage_item = None
    for sub in phone_folder.Items():
        print(f" - Almacenamiento: {sub.Name}")
        storage_item = sub
        break

    if not storage_item:
        print("ERROR: No se pudo acceder al almacenamiento interno del celular.")
        return

    storage_folder = storage_item.GetFolder
    print("\nCarpetas principales en el almacenamiento del celular:")
    for f in storage_folder.Items():
        if f.IsFolder:
            print(f"   📁 {f.Name}")

if __name__ == "__main__":
    main()
