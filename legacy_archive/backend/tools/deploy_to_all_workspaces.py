# deploy_to_all_workspaces.py - Instalador Universal de Reglas, Telemetría y Herramientas
import os, sys, shutil
from datetime import datetime

source_dir = r"c:\Users\gonza\OneDrive\Escritorio\Antigravity escritorio general"
source_agents = os.path.join(source_dir, "AGENTS.md")
source_rules = os.path.join(source_dir, ".agents", "rules")
source_tools = os.path.join(source_dir, "tools")

target_workspaces = [
    r"c:\Users\gonza\Music",
    r"c:\Users\gonza\Music\spoti_downloader_app",
    r"c:\Users\gonza\Music\spotify_downloader",
    r"c:\Users\gonza\OneDrive\Escritorio\Juego roblox",
    r"c:\Users\gonza\OneDrive\Escritorio\Universidad Antigravity",
    r"c:\Users\gonza\Videos\video_downloader",
    r"E:\GD_TikTok_Automation",
    r"E:\Respaldos\Organizador_Anime",
    r"c:\Users\gonza\OneDrive\Escritorio\Escritorio",
    r"c:\Users\gonza\OneDrive\Escritorio\Para_Organizar"
]

print("=== INSTALACION UNIVERSAL DE PROTOCOLOS ANTIGRAVITY ===")

for ws in target_workspaces:
    if not os.path.isdir(ws):
        print(f"[OMITIDO - No existe] {ws}")
        continue
        
    print(f"\n[PROCESANDO] {ws}")
    
    # 1. Copiar o actualizar .agents/rules
    target_agents_dir = os.path.join(ws, ".agents")
    target_rules_dir = os.path.join(target_agents_dir, "rules")
    os.makedirs(target_rules_dir, exist_ok=True)
    
    for rfile in os.listdir(source_rules):
        if rfile.endswith(".md"):
            # Si es Universidad, no pisar student-academic-style-profile si existe
            if "Universidad" in ws and "student-academic" in rfile:
                continue
            src_f = os.path.join(source_rules, rfile)
            dst_f = os.path.join(target_rules_dir, rfile)
            shutil.copy2(src_f, dst_f)
    print(f"  • Reglas (.agents/rules/) sincronizadas.")

    # 2. Copiar tools/
    target_tools_dir = os.path.join(ws, "tools")
    os.makedirs(target_tools_dir, exist_ok=True)
    for tfile in os.listdir(source_tools):
        if tfile.endswith(".py") or tfile.endswith(".lua"):
            src_t = os.path.join(source_tools, tfile)
            dst_t = os.path.join(target_tools_dir, tfile)
            shutil.copy2(src_t, dst_t)
    print(f"  • Suite de herramientas (tools/) sincronizada.")

    # 3. AGENTS.md
    target_agents_file = os.path.join(ws, "AGENTS.md")
    if "Universidad" in ws:
        # Para Universidad, preservar encabezado institucional pero añadir las reglas
        with open(source_agents, "r", encoding="utf-8") as sf:
            rules_content = sf.read()
        univ_header = """# Guía Específica de Universidad Antigravity

Bienvenido al espacio de trabajo académico oficial de **Jaime Ángel González Garza** (Ingeniería Industrial, TecNM Unidad San Fernando).

## Identidad Académica Exclusiva
- **Alumno:** Jaime Ángel González Garza
- **No. Control:** 25383032
- **Carrera:** Ingeniería Industrial (Educación a Distancia)
- **Institución:** Instituto Tecnológico de Ciudad Victoria (ITCV / TecNM Unidad San Fernando)
- **Directrices:** En este espacio aplican al 100% el perfil institucional, portadas oficiales, asignaturas y docentes de 3.er semestre.

---
"""
        with open(target_agents_file, "w", encoding="utf-8") as tf:
            tf.write(univ_header + rules_content)
        print(f"  • AGENTS.md configurado con identidad académica + reglas.")
    else:
        shutil.copy2(source_agents, target_agents_file)
        print(f"  • AGENTS.md sincronizado.")

    # 4. CHECKPOINT_PROGRESO.md inicial
    target_chk = os.path.join(ws, "CHECKPOINT_PROGRESO.md")
    if not os.path.exists(target_chk):
        proj_name = os.path.basename(ws)
        chk_content = f"""# CHECKPOINT DE PROGRESO ({proj_name.upper()})

> **Estado:** Inicializado y listo para trabajar  
> **Fecha y Hora:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}  
> **Avance Global:** 100%

---

## 1. Tarea en Curso y Resumen de Avance
Proyecto '{proj_name}' equipado con arquitectura multi-agente, telemetría de tokens y herramientas locales en tools/.

---

## 2. Siguiente Paso Exacto al Iniciar Sesión
Continuar con el desarrollo activo del proyecto '{proj_name}' según las instrucciones de Jaime.

---

## 3. Instrucción para el Agente al Reanudar
Leer este archivo automáticamente en el turno 1 y proceder con consumo de tokens en cero.
"""
        with open(target_chk, "w", encoding="utf-8") as f:
            f.write(chk_content)
        print(f"  • CHECKPOINT_PROGRESO.md creado.")
    else:
        print(f"  • CHECKPOINT_PROGRESO.md existente preservado.")

print("\n=== INSTALACION UNIVERSAL COMPLETADA CON EXITO ===")
