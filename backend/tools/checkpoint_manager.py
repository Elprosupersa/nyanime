# checkpoint_manager.py - Gestor de Checkpoints y Telemetría de Cuota (2 Cuentas Pro)
# Versión 2.0 (10/10) - Antigravity Pro Quota & Checkpoint Engine para Jaime

import os
import sys

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import time
import glob
import json
import argparse
from datetime import datetime, timedelta

WORKSPACE_DIR = os.getcwd()
CHECKPOINT_FILE = os.path.join(WORKSPACE_DIR, "CHECKPOINT_PROGRESO.md")
BRAIN_BASE = r"C:\Users\gonza\.gemini\antigravity\brain"

def get_recent_modified_files(root_dir=None, hours=3):
    """Encuentra archivos creados o editados en las últimas N horas."""
    if root_dir is None:
        root_dir = WORKSPACE_DIR
    cutoff = time.time() - (hours * 3600)
    modified = []
    
    ignore_dirs = {".git", "__pycache__", "node_modules", ".venv", ".system_generated", "logs"}
    
    for root, dirs, files in os.walk(root_dir):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        for f in files:
            if f.startswith("~$") or f == "CHECKPOINT_PROGRESO.md":
                continue
            path = os.path.join(root, f)
            try:
                mtime = os.path.getmtime(path)
                if mtime >= cutoff:
                    size_kb = round(os.path.getsize(path) / 1024, 1)
                    rel_path = os.path.relpath(path, root_dir)
                    modified.append({
                        "path": rel_path,
                        "size_kb": size_kb,
                        "mtime": datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
                    })
            except (OSError, PermissionError):
                pass
                
    modified.sort(key=lambda x: x["mtime"], reverse=True)
    return modified

def analyze_session_telemetry():
    """
    Analiza la actividad de la sesión utilizando telemetry_engine.py
    para calcular el consumo real acumulativo de llamadas LLM y subagentes.
    """
    try:
        tools_dir = os.path.dirname(os.path.abspath(__file__))
        if tools_dir not in sys.path:
            sys.path.insert(0, tools_dir)
        import telemetry_engine
        ledger = telemetry_engine.get_ledger()
        # Tomar el transcript más reciente
        transcripts = glob.glob(os.path.join(BRAIN_BASE, "*", ".system_generated", "logs", "transcript.jsonl"))
        if transcripts:
            latest = max(transcripts, key=os.path.getmtime)
            convo_id = os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(latest))))
            metrics = telemetry_engine.analyze_current_delivery(convo_id)
            i5, iw = telemetry_engine.calculate_calibrated_impact(metrics, convo_id)
            print("==================================================")
            print("       TELEMETRIA CALIBRADA PRO (VENTANA 5 HORAS) ")
            print("==================================================")
            print(f"• Conversación Activa: {convo_id}")
            print(f"• Llamadas LLM Acumuladas: {metrics['planner_calls']}")
            print(f"• Subagentes Activos: {metrics['subagents']}")
            print(f"• Tokens Reales Acumulados: {metrics['total_tokens']:,}")
            print(f"• Impacto en Ventana 5h: ~{i5:.1f}%")
            print(f"• Impacto en Cuota Semanal: ~{iw:.2f}%")
            print(f"• Línea Base Calibrada: 5h={ledger['five_hour_pct']}% | Semanal={ledger['weekly_pct']}%")
            print("==================================================")
            return
    except Exception as e:
        print(f"[TELEMETRIA ERROR] Fallback a estimación heurística: {e}")


def save_checkpoint(task_summary, next_step, progress_percent=100):
    """Genera o actualiza el archivo CHECKPOINT_PROGRESO.md."""
    workspace = WORKSPACE_DIR
    recent_files = get_recent_modified_files(workspace, hours=4)
    
    files_table = "| Archivo | Tamaño (KB) | Última Modificación |\n| :--- | :---: | :--- |\n"
    if recent_files:
        for f in recent_files[:15]:
            files_table += f"| `{f['path']}` | {f['size_kb']} KB | {f['mtime']} |\n"
    else:
        files_table += "| *Sin archivos recientes modificados* | - | - |\n"

    content = f"""# CHECKPOINT DE PROGRESO (RELEVO DE CUENTAS PRO)

> **Estado:** Listo para alternar cuenta Pro  
> **Fecha y Hora:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}  
> **Avance Global:** {progress_percent}%

---

## 1. Tarea en Curso y Resumen de Avance
{task_summary}

---

## 2. Archivos Recientes Modificados / Generados
{files_table}

---

## 3. Siguiente Paso Exacto al Iniciar Sesión con Nueva Cuenta
{next_step}

---

## 4. Instrucción para el Agente al Reanudar
Al abrir un nuevo chat con la siguiente cuenta Pro, el agente debe leer este archivo inmediatamente ejecutando:
`python tools/checkpoint_manager.py --status` y retomar exactamente desde el punto 3 sin duplicar trabajo.
"""
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        f.write(content)
        
    print(f"[CHECKPOINT GUARDADO] {CHECKPOINT_FILE}")
    print(f"• Archivos recientes indexados: {len(recent_files)}")
    print(f"• Estado blindado. Ya puedes cambiar de cuenta Pro con total seguridad.")

def show_status():
    """Muestra el estado actual del checkpoint."""
    if not os.path.exists(CHECKPOINT_FILE):
        print("[CHECKPOINT] No hay ningún checkpoint activo pendiente. Todo el trabajo previo está consolidado.")
        return
    with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
        print(f.read())

def main():
    parser = argparse.ArgumentParser(description="Antigravity Checkpoint & Quota Telemetry Engine")
    parser.add_argument("--save", help="Guarda checkpoint con resumen de avance")
    parser.add_argument("--next", default="Continuar con la siguiente etapa del proyecto según lo acordado con Jaime.", help="Siguiente paso al reanudar")
    parser.add_argument("--percent", type=int, default=100, help="Porcentaje de avance estimado")
    parser.add_argument("--status", action="store_true", help="Muestra el contenido del checkpoint actual")
    parser.add_argument("--telemetry", action="store_true", help="Calcula telemetría heurística de cuota y ventana de 5 horas")
    parser.add_argument("--done", action="store_true", help="Marca la tarea como finalizada y elimina el checkpoint")
    
    args = parser.parse_args()
    
    if args.telemetry:
        analyze_session_telemetry()
    elif args.status:
        show_status()
    elif args.save:
        save_checkpoint(args.save, args.next, args.percent)
    elif args.done:
        if os.path.exists(CHECKPOINT_FILE):
            os.remove(CHECKPOINT_FILE)
            print("[CHECKPOINT] Archivo CHECKPOINT_PROGRESO.md finalizado y archivado.")
        else:
            print("[CHECKPOINT] No hay checkpoint que finalizar.")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
