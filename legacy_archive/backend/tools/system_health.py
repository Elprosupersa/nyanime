# system_health.py - Monitor de Salud del Entorno y Limpieza de Bloqueos en Windows
# Antigravity Power Utility para Jaime Ángel González Garza

import os
import sys
import psutil
import glob
import argparse

def scan_locks(root_dir):
    """Busca archivos temporales de bloqueo de Office (~$*)."""
    patterns = [
        os.path.join(root_dir, "~$*.docx"),
        os.path.join(root_dir, "~$*.xlsx"),
        os.path.join(root_dir, "~$*.pptx")
    ]
    locks = []
    for pattern in patterns:
        locks.extend(glob.glob(pattern))
    return locks

def check_system():
    """Obtiene métricas rápidas de RAM, CPU y Almacenamiento."""
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage('C:')
    
    # Buscar procesos activos de Word, Excel, Python
    proc_counts = {"WINWORD.EXE": 0, "EXCEL.EXE": 0, "python.exe": 0}
    for p in psutil.process_iter(['name']):
        try:
            name = p.info['name']
            if name in proc_counts:
                proc_counts[name] += 1
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
            
    return {
        "ram_percent": mem.percent,
        "ram_available_gb": round(mem.available / (1024**3), 2),
        "disk_free_gb": round(disk.free / (1024**3), 2),
        "active_processes": proc_counts
    }

def main():
    parser = argparse.ArgumentParser(description="Antigravity Workspace Health Check")
    parser.add_argument("--clean-locks", action="store_true", help="Elimina archivos temporales de bloqueo (~$*)")
    args = parser.parse_args()

    workspace = r"c:\Users\gonza\OneDrive\Escritorio\Antigravity escritorio general"
    locks = scan_locks(workspace)
    sys_info = check_system()

    print("==================================================")
    print("      ANTIGRAVITY SYSTEM HEALTH & WORKSPACE       ")
    print("==================================================")
    print(f"• RAM Disponible: {sys_info['ram_available_gb']} GB (Uso: {sys_info['ram_percent']}%)")
    print(f"• Espacio Libre en C: {sys_info['disk_free_gb']} GB")
    print(f"• Procesos Detectados: Word: {sys_info['active_processes']['WINWORD.EXE']} | Excel: {sys_info['active_processes']['EXCEL.EXE']} | Python: {sys_info['active_processes']['python.exe']}")
    print(f"• Archivos de Bloqueo (~$*): {len(locks)}")

    for l in locks:
        print(f"   [LOCK] {os.path.basename(l)}")

    if args.clean_locks and locks:
        print("\nLimpiando archivos de bloqueo...")
        cleaned = 0
        for l in locks:
            try:
                os.remove(l)
                print(f"   [ELIMINADO] {os.path.basename(l)}")
                cleaned += 1
            except Exception as e:
                print(f"   [ERROR] No se pudo eliminar {os.path.basename(l)}: {e}")
        print(f"Completado. {cleaned}/{len(locks)} archivos eliminados.")
    print("==================================================")

if __name__ == "__main__":
    main()
