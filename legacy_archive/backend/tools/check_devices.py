import win32com.client
import os

def check_portable_devices():
    shell = win32com.client.Dispatch("Shell.Application")
    # 17 is ssfDRIVES / This PC
    pc = shell.NameSpace(17)
    print("=== ELEMENTOS EN ESTE EQUIPO ===")
    for item in pc.Items():
        print(f"Nombre: {item.Name} | Tipo: {item.Type} | Path: {item.Path}")
        # If it's a portable device or folder, inspect children
        try:
            folder = item.GetFolder
            if folder:
                for sub in folder.Items():
                    print(f"   -> Sub: {sub.Name} | Tipo: {sub.Type} | Path: {sub.Path}")
        except Exception as e:
            pass

if __name__ == "__main__":
    check_portable_devices()
