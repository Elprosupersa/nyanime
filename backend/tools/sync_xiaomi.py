import subprocess
import os

adb = r"C:\Users\gonza\AppData\Local\Android\Sdk\platform-tools\adb.exe"

# 1. Crear carpeta en Download escapando espacios
print("1. Creando /sdcard/Download/Prison_School...")
subprocess.run([adb, "shell", "mkdir", "-p", "/sdcard/Download/Prison_School"], check=True)

# 2. Copiar los episodios MP4 a Download/Prison_School
print("2. Copiando episodios a /sdcard/Download/Prison_School...")
subprocess.run(f'"{adb}" shell "cp -r /sdcard/Movies/Anime/Prison\\ School/* /sdcard/Download/Prison_School/"', shell=True)

# 3. Forzar indexación en MediaStore para que aparezca en Galería y Videos
print("3. Indexando episodios en MediaStore...")
out = subprocess.check_output(f'"{adb}" shell "find /sdcard/Movies/Anime/Prison\\ School /sdcard/Download/Prison_School -name \\"*.mp4\\""', shell=True).decode('latin1')
for line in out.splitlines():
    p = line.strip()
    if p.endswith('.mp4'):
        print(f"Indexando: {p}")
        subprocess.run(f'"{adb}" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://{p}"', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

print("4. Comprobación final:")
check_down = subprocess.check_output(f'"{adb}" shell "ls /sdcard/Download/Prison_School"', shell=True).decode('latin1')
print("Contenido en Download/Prison_School:")
print(check_down)
print("¡COMPLETADO CON ÉXITO!")
