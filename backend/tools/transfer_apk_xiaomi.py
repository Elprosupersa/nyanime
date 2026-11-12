import win32com.client
import os
import sys

def transfer_apk():
    apk_path = os.path.abspath(r"src\api\static\AnimeHub_Celular.apk")
    if not os.path.exists(apk_path):
        print(f"ERROR: No se encontró el APK en {apk_path}")
        return False
        
    apk_size = os.path.getsize(apk_path)
    print(f"APK detectada: {apk_path} ({apk_size / (1024*1024):.2f} MB)")
    
    shell = win32com.client.Dispatch("Shell.Application")
    pc = shell.NameSpace(17) # ssfDRIVES
    
    phone_item = None
    for item in pc.Items():
        if "Xiaomi" in item.Name or "14T" in item.Name:
            phone_item = item
            break
            
    if not phone_item:
        print("ERROR: No se encontró Xiaomi 14T Pro en 'Este equipo'")
        return False
        
    print(f"Dispositivo conectado: {phone_item.Name}")
    phone_folder = phone_item.GetFolder
    
    storage_item = None
    for sub in phone_folder.Items():
        print(f"Almacenamiento: {sub.Name}")
        storage_item = sub
        break
        
    if not storage_item:
        print("ERROR: No se pudo acceder al almacenamiento interno del Xiaomi.")
        return False
        
    storage_folder = storage_item.GetFolder
    
    # Buscar carpeta Download
    download_folder = None
    for sub in storage_folder.Items():
        if sub.Name.lower() == "download":
            download_folder = sub.GetFolder
            print(f"Carpeta de destino encontrada: {sub.Name}")
            break
            
    target_folder = download_folder if download_folder else storage_folder
    print("Copiando APK al Xiaomi 14T Pro...")
    # 4 = Do not display progress dialog box, 16 = Respond with Yes to All for any dialog box
    target_folder.CopyHere(apk_path, 16)
    print("¡APK transferida con éxito a la carpeta Download del Xiaomi 14T Pro!")
    return True

if __name__ == "__main__":
    transfer_apk()
