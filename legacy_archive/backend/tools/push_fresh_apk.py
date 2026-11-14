import win32com.client
import os
import shutil

def main():
    src_apk = os.path.abspath(r"src\api\static\AnimeHub_Celular.apk")
    temp_apk = os.path.abspath(r"scratch\AnimeHub_Cinema_NUEVO_2026.apk")
    shutil.copy2(src_apk, temp_apk)
    
    shell = win32com.client.Dispatch("Shell.Application")
    pc = shell.NameSpace(17)
    
    phone_item = None
    for item in pc.Items():
        if "Xiaomi" in item.Name or "14T" in item.Name:
            phone_item = item
            break
            
    if not phone_item:
        print("ERROR: Xiaomi no detectado en Este Equipo.")
        return
        
    storage_folder = None
    for sub in phone_item.GetFolder.Items():
        storage_folder = sub.GetFolder
        break
        
    if not storage_folder:
        print("ERROR: No se pudo abrir almacenamiento interno.")
        return
        
    print(f"Copiando a la raíz del almacenamiento interno del Xiaomi...")
    storage_folder.CopyHere(temp_apk, 16)
    
    # Copiar a Download
    download_folder = None
    for sub in storage_folder.Items():
        if sub.Name.lower() == "download":
            download_folder = sub.GetFolder
            break
            
    if download_folder:
        print("Copiando a la carpeta Download del Xiaomi...")
        download_folder.CopyHere(temp_apk, 16)
        
    print("¡Transferencia dual completada!")

if __name__ == "__main__":
    main()
