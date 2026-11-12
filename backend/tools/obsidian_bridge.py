#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/obsidian_bridge.py
Puente Integral entre Antigravity y Obsidian para el Segundo Cerebro (Second Brain).
Gestiona la estructura del Vault, configuración nativa de Obsidian (.obsidian),
sincronización de memoria/checkpoints, catalogación de skills y consulta dispersa (Sparse Retrieval).
"""

import os
import sys
import json
import time
import shutil
from pathlib import Path

DEFAULT_VAULT_PATH = Path(r"C:\Users\gonza\OneDrive\Escritorio\Antigravity_Obsidian_Brain")
WORKSPACE_ROOT = Path(r"c:\Users\gonza\OneDrive\Escritorio\Antigravity escritorio general")
CONFIG_SKILLS_DIR = Path(r"C:\Users\gonza\.gemini\config\skills")
OBSIDIAN_APPDATA = Path(os.path.expandvars(r"%APPDATA%\obsidian"))

VAULT_STRUCTURE = [
    "00_INBOX",
    "01_PROJECTS/Antigravity_System",
    "01_PROJECTS/Roblox_Development",
    "01_PROJECTS/TikTok_Automation",
    "01_PROJECTS/Universidad_Academica",
    "02_SECOND_BRAIN_MOC",
    "03_AGENT_MEMORY/Checkpoints",
    "03_AGENT_MEMORY/Decision_Records",
    "04_KNOWLEDGE_BASE",
    "05_TEMPLATES",
    ".obsidian",
]

def init_vault(vault_path: Path = DEFAULT_VAULT_PATH):
    """Crea y estructura el Vault de Obsidian con configuración nativa."""
    print(f"[*] Inicializando Obsidian Brain Vault en: {vault_path}")
    vault_path.mkdir(parents=True, exist_ok=True)
    
    # Crear carpetas base
    for folder in VAULT_STRUCTURE:
        (vault_path / folder).mkdir(parents=True, exist_ok=True)
        
    # 1. Configuración nativa .obsidian/app.json
    app_config = {
        "legacyEditor": False,
        "livePreview": True,
        "showLineNumber": True,
        "useMarkdownLinks": False, # [[Wikilinks]] nativos
        "attachmentFolderPath": "00_INBOX",
        "alwaysUpdateLinks": True,
        "foldHeading": True,
        "foldIndent": True,
        "readableLineLength": True
    }
    with open(vault_path / ".obsidian" / "app.json", "w", encoding="utf-8") as f:
        json.dump(app_config, f, indent=2)

    # 2. Configuración nativa .obsidian/appearance.json
    appearance_config = {
        "baseFontSize": 16,
        "theme": "obsidian",
        "accentColor": "#6366f1", # Índigo moderno
        "translucency": False
    }
    with open(vault_path / ".obsidian" / "appearance.json", "w", encoding="utf-8") as f:
        json.dump(appearance_config, f, indent=2)

    # 3. Configuración de Vista de Grafo .obsidian/graph.json
    graph_config = {
        "collapse-filter": False,
        "search": "",
        "showTags": True,
        "showAttachments": False,
        "hideUnresolved": False,
        "showOrphans": True,
        "collapse-color-groups": False,
        "colorGroups": [
            {"query": "path:01_PROJECTS", "color": {"a": 1, "rgb": 14761005}}, # Naranja
            {"query": "path:02_SECOND_BRAIN_MOC", "color": {"a": 1, "rgb": 5898239}}, # Azul
            {"query": "path:03_AGENT_MEMORY", "color": {"a": 1, "rgb": 4317765}}, # Verde
            {"query": "path:04_KNOWLEDGE_BASE", "color": {"a": 1, "rgb": 11352319}} # Morado
        ],
        "collapse-display": False,
        "showArrow": True,
        "textFadeMultiplier": 0,
        "nodeSizeMultiplier": 1.25,
        "lineSizeMultiplier": 1,
        "collapse-forces": False,
        "centerStrength": 0.518,
        "repelStrength": 10,
        "linkStrength": 1,
        "linkDistance": 250
    }
    with open(vault_path / ".obsidian" / "graph.json", "w", encoding="utf-8") as f:
        json.dump(graph_config, f, indent=2)

    # 4. Registrar Vault en Obsidian AppData para auto-apertura
    try:
        OBSIDIAN_APPDATA.mkdir(parents=True, exist_ok=True)
        obsidian_json = OBSIDIAN_APPDATA / "obsidian.json"
        data = {"vaults": {}}
        if obsidian_json.exists():
            try:
                with open(obsidian_json, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                data = {"vaults": {}}
        
        vault_id = hex(abs(hash(str(vault_path))))[2:18]
        data["vaults"][vault_id] = {
            "path": str(vault_path).replace("/", "\\"),
            "ts": int(time.time() * 1000),
            "open": True
        }
        with open(obsidian_json, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"[+] Vault registrado con éxito en la configuración de Obsidian ({obsidian_json})")
    except Exception as e:
        print(f"[!] Nota sobre registro en AppData: {e}")

    # 5. Generar Plantillas en 05_TEMPLATES
    create_templates(vault_path)
    
    # 6. Generar MOCs y notas centrales
    sync_all(vault_path)
    print(f"[OK] Bóveda del Segundo Cerebro lista en: {vault_path}")

def create_templates(vault_path: Path):
    """Crea plantillas estándar en 05_TEMPLATES."""
    templates = {
        "Template_Nota_Atomica.md": """# {{title}}
**Fecha:** {{date}}  
**Tags:** #nota #concepto  
**MOC Relacionado:** [[02_SECOND_BRAIN_MOC/MOC_Master]]

---

## 1. Núcleo de la Idea
Breve descripción directa del concepto en una o dos frases.

---

## 2. Desarrollo y Detalles
Explicación concisa, fórmulas o código asociado.

---

## 3. Conexiones y Referencias
- [[02_SECOND_BRAIN_MOC/MOC_Proyectos]]
- Enlaces a temas afines
""",
        "Template_Decision_ADR.md": """# ADR-{{id}}: {{title}}
**Fecha:** {{date}}  
**Estado:** [Propuesto | Aprobado | Reemplazado]  
**Tags:** #decision #arquitectura  

---

## Contexto y Problema
¿Cuál es la situación o cuello de botella que enfrentamos?

## Decisión Tomada
¿Qué enfoque, biblioteca o arquitectura decidimos implementar?

## Consecuencias y Beneficios
- **Ventajas:** 
- **Compromisos/Mitigaciones:** 

## Enlaces Relacionados
- [[02_SECOND_BRAIN_MOC/MOC_Master]]
- [[03_AGENT_MEMORY/System_State]]
""",
        "Template_Checkpoint.md": """# Checkpoint: {{project_name}}
**Fecha y Hora:** {{date}}  
**Estado Global:** {{status}}  
**MOC:** [[02_SECOND_BRAIN_MOC/MOC_Checkpoints]]

---

## Hito Completado
- Descripción de lo entregado y validado.

## Siguiente Paso Inmediato
- Acción prioritaria para la siguiente sesión.
"""
    }
    tpl_dir = vault_path / "05_TEMPLATES"
    for name, content in templates.items():
        with open(tpl_dir / name, "w", encoding="utf-8") as f:
            f.write(content)

def sync_skills_catalog(vault_path: Path):
    """Lee las skills disponibles y genera un catálogo interactivo con Wikilinks."""
    skills = []
    if CONFIG_SKILLS_DIR.exists():
        for item in CONFIG_SKILLS_DIR.iterdir():
            skill_md = item / "SKILL.md"
            if skill_md.exists():
                desc = "Skill especializada del sistema"
                try:
                    with open(skill_md, "r", encoding="utf-8") as f:
                        lines = f.readlines()
                        for line in lines:
                            if line.strip().startswith("description:"):
                                desc = line.replace("description:", "").strip()
                                break
                except Exception:
                    pass
                skills.append({
                    "name": item.name,
                    "type": "Global Custom Skill",
                    "desc": desc,
                    "path": str(skill_md)
                })

    builtin_skills = [
        {"name": "antigravity-guide", "type": "Builtin Core", "desc": "Guía maestra del entorno Antigravity y comandos slash."},
        {"name": "agy-customizations", "type": "Builtin Core", "desc": "Gestión avanzada de skills, rules, plugins y MCP servers."},
        {"name": "obsidian-second-brain", "type": "Knowledge & Memory", "desc": "Gestión y navegación del Segundo Cerebro en Obsidian con sparse retrieval."},
        {"name": "academic-engineering", "type": "Documentation", "desc": "Tipografía matemática nativa (OMML) y formato APA 7 para ingeniería."},
        {"name": "roblox-specialist", "type": "Game Dev", "desc": "Desarrollo Luau, arquitectura cliente-servidor y Roblox Studio MCP."},
        {"name": "media-pipeline", "type": "Multimedia Automation", "desc": "Edición vertical 9:16 con NVENC y pipelines de audio con Demucs."},
        {"name": "qa-validator", "type": "Quality Assurance", "desc": "Auditoría estática ultra-rápida con flash_lite para verificación sin consumo."},
        {"name": "generative_ui", "type": "UI & Artifacts", "desc": "Renderizado interactivo de componentes visuales en tiempo real."},
        {"name": "gemini-api-dev", "type": "AI Models", "desc": "Integración avanzada con la familia de modelos Gemini y Google GenAI SDK."}
    ]
    
    seen = set()
    all_skills = []
    for s in skills + builtin_skills:
        if s["name"] not in seen:
            seen.add(s["name"])
            all_skills.append(s)

    content = f"""# Catálogo Maestro de Skills de Antigravity
**Última Actualización:** {time.strftime('%Y-%m-%d %H:%M:%S')}  
**Tags:** #skills #antigravity #segundo_cerebro #herramientas  
**MOC:** [[02_SECOND_BRAIN_MOC/MOC_Master]] | [[02_SECOND_BRAIN_MOC/MOC_Skills_Ecosistema]]

---

## ⚡ Protocolo de Auto-Activación a Criterio Técnico
> **Regla de Oro:** El agente Antigravity no espera a que el usuario escriba `/boost`, `/goal` o invoque manualmente una skill.  
> Cuando el agente identifica que una tarea técnica coincide con una skill del catálogo, **la activa autónomamente a su criterio** e informa en la respuesta con el distintivo:  
> `⚡ [Skill Activa: <nombre>] - <Motivo de activación>`

---

## Tabla de Skills Disponibles

| Skill | Categoría | Propósito Técnico Principal | Activación Autónoma Sugerida |
| :--- | :--- | :--- | :--- |
"""
    for s in all_skills:
        trigger_hint = "Proyectos que involucren su área de dominio"
        if "obsidian" in s["name"]:
            trigger_hint = "Organización de notas, memoria o mapas de contenido"
        elif "media" in s["name"]:
            trigger_hint = "Cortes de video vertical, renderizado o procesamiento de audio"
        elif "roblox" in s["name"]:
            trigger_hint = "Scripts en Luau, modelos o servicios de Roblox Studio"
        elif "academic" in s["name"]:
            trigger_hint = "Documentos Word con matemáticas densas o reportes formales"
        elif "qa" in s["name"]:
            trigger_hint = "Verificación rápida de archivos y sintaxis antes de entrega"
        
        content += f"| `[[04_KNOWLEDGE_BASE/Skill_{s['name']}|{s['name']}]]` | {s['type']} | {s['desc']} | {trigger_hint} |\n"

    content += """
---

## Creación y Extensión de Nuevas Skills
Para agregar una nueva habilidad al sistema de Antigravity:
1. Crear carpeta en `.agents/skills/<nombre-skill>/` o en `C:\\Users\\gonza\\.gemini\\config\\skills\\<nombre-skill>/`.
2. Crear archivo `SKILL.md` con encabezado YAML (`name`, `description`) y el manual operativo.
3. Ejecutar `python tools/obsidian_bridge.py --sync` para reflejar la nueva habilidad en la bóveda de Obsidian.
"""
    
    kb_dir = vault_path / "04_KNOWLEDGE_BASE"
    with open(kb_dir / "Skills_Catalog.md", "w", encoding="utf-8") as f:
        f.write(content)
        
    for s in all_skills:
        skill_file = kb_dir / f"Skill_{s['name']}.md"
        s_content = f"""# Skill: {s['name']}
**Categoría:** {s['type']}  
**Tags:** #skill #{s['name'].replace('-', '_')}  
**MOC:** [[02_SECOND_BRAIN_MOC/MOC_Skills_Ecosistema]] | [[04_KNOWLEDGE_BASE/Skills_Catalog]]

---

## Descripción Técnica
{s['desc']}

## Directrices de Activación Autónoma
- **Condición de Disparo:** Se activa cuando la tarea requiere experiencia específica en `{s['name']}`.
- **Transparencia:** El agente declara `⚡ [Skill Activa: {s['name']}]`.
- **Economía de Tokens:** Solo se carga el contexto operativo necesario para resolver la solicitud.
"""
        with open(skill_file, "w", encoding="utf-8") as f:
            f.write(s_content)

def sync_checkpoints_and_state(vault_path: Path):
    """Sincroniza el estado del sistema y los checkpoints hacia Obsidian."""
    chk_source = WORKSPACE_ROOT / "CHECKPOINT_PROGRESO.md"
    content_chk = "No se encontró CHECKPOINT_PROGRESO.md en el workspace raíz."
    if chk_source.exists():
        with open(chk_source, "r", encoding="utf-8") as f:
            content_chk = f.read()

    dest_chk = vault_path / "03_AGENT_MEMORY" / "Checkpoints" / "CHECKPOINT_PROGRESO_ACTUAL.md"
    with open(dest_chk, "w", encoding="utf-8") as f:
        f.write(f"**Sincronizado desde:** [[{chk_source}]]  \n**MOC:** [[02_SECOND_BRAIN_MOC/MOC_Checkpoints]]\n\n---\n\n" + content_chk)

    state_content = f"""# Estado Global del Sistema Antigravity
**Fecha de Sincronización:** {time.strftime('%Y-%m-%d %H:%M:%S')}  
**Tags:** #estado #telemetria #memoria  
**MOC:** [[02_SECOND_BRAIN_MOC/MOC_Master]]

---

## 🧭 Resumen de Conexiones Activas
- **Workspace Principal:** `c:\\Users\\gonza\\OneDrive\\Escritorio\\Antigravity escritorio general`
- **Obsidian Brain Vault:** `{vault_path}`
- **Checkpoint Maestro:** [[03_AGENT_MEMORY/Checkpoints/CHECKPOINT_PROGRESO_ACTUAL|CHECKPOINT_PROGRESO_ACTUAL]]
- **Catálogo de Habilidades:** [[04_KNOWLEDGE_BASE/Skills_Catalog|Catálogo de Skills]]

---

## 📊 Integración Multi-Proyecto
- [[01_PROJECTS/Antigravity_System/Overview|Antigravity Core & Telemetry]]
- [[01_PROJECTS/Roblox_Development/Overview|Juego Roblox]]
- [[01_PROJECTS/TikTok_Automation/Overview|Automatización de TikTok (GD)]]
- [[01_PROJECTS/Universidad_Academica/Overview|Universidad Antigravity]]

---

## ⚡ Próximas Acciones
1. Mantener sincronizado el grafo de conocimiento al finalizar cada hito importante.
2. Utilizar sparse retrieval leyendo MOCs antes de volcar archivos completos al contexto.
"""
    with open(vault_path / "03_AGENT_MEMORY" / "System_State.md", "w", encoding="utf-8") as f:
        f.write(state_content)

def generate_mocs(vault_path: Path):
    """Crea o actualiza los Mapas de Contenido (MOC) en 02_SECOND_BRAIN_MOC."""
    mocs = {
        "MOC_Master.md": f"""# 🧠 MOC Maestro: Segundo Cerebro Antigravity
**Tags:** #moc #segundo_cerebro #indice_maestro  
**Fecha:** {time.strftime('%Y-%m-%d %H:%M:%S')}

Bienvenido al centro neurálgico del Segundo Cerebro integrado con **Antigravity**.  
Este mapa central permite recuperar contexto de forma dispersa (*Sparse Retrieval*) con un consumo mínimo de tokens.

---

## 🗺️ Mapas de Contenido Temáticos
- [[02_SECOND_BRAIN_MOC/MOC_Proyectos|🚀 MOC Proyectos Activos]]
- [[02_SECOND_BRAIN_MOC/MOC_Skills_Ecosistema|⚡ MOC Ecosistema de Skills]]
- [[02_SECOND_BRAIN_MOC/MOC_Checkpoints|📌 MOC Checkpoints e Hitos]]
- [[02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema|🏗️ MOC Arquitectura Técnica]]

---

## 📂 Accesos Rápidos
- **Memoria del Agente:** [[03_AGENT_MEMORY/System_State|Estado Actual del Sistema]]
- **Catálogo de Habilidades:** [[04_KNOWLEDGE_BASE/Skills_Catalog|Catálogo Maestro de Skills]]
- **Guía de Optimización:** [[04_KNOWLEDGE_BASE/Token_Optimization_Playbook|Token Optimization Playbook]]
- **Bandeja de Entrada:** [[00_INBOX/Inbox_QuickNotes|Bandeja de Entrada]]
""",
        "MOC_Proyectos.md": """# 🚀 MOC: Proyectos Activos
**Tags:** #moc #proyectos  
**MOC Superior:** [[02_SECOND_BRAIN_MOC/MOC_Master]]

---

## Proyectos en Curso
- [[01_PROJECTS/Antigravity_System/Overview|Antigravity System]]: Telemetría real, sincronización con Obsidian y herramientas locales.
- [[01_PROJECTS/Roblox_Development/Overview|Juego Roblox]]: Framework Luau, arquitectura cliente-servidor y assets de Roblox Studio.
- [[01_PROJECTS/TikTok_Automation/Overview|TikTok Automation]]: Pipeline FFmpeg con aceleración NVENC y sincronización musical FFT.
- [[01_PROJECTS/Universidad_Academica/Overview|Universidad Antigravity]]: Reportes formales, tratados de ingeniería y tipografía OMML en Word.
""",
        "MOC_Skills_Ecosistema.md": """# ⚡ MOC: Ecosistema de Skills y Autonomía
**Tags:** #moc #skills #autonomia  
**MOC Superior:** [[02_SECOND_BRAIN_MOC/MOC_Master]]

---

## Principio de Auto-Activación
El agente Antigravity evalúa los requerimientos de cada tarea e **invoca de manera autónoma** la skill correspondiente, informando con el distintivo:  
`⚡ [Skill Activa: <nombre>] - <Motivo técnico de activación>`

---

## Skills Registradas
- [[04_KNOWLEDGE_BASE/Skill_obsidian-second-brain|obsidian-second-brain]]: Integración y navegación de la bóveda de Obsidian.
- [[04_KNOWLEDGE_BASE/Skill_academic-engineering|academic-engineering]]: Tipografía matemática OMML y estilo formal.
- [[04_KNOWLEDGE_BASE/Skill_roblox-specialist|roblox-specialist]]: Programación Luau y Roblox Studio.
- [[04_KNOWLEDGE_BASE/Skill_media-pipeline|media-pipeline]]: Automatización FFmpeg vertical y audio con Demucs.
- [[04_KNOWLEDGE_BASE/Skill_qa-validator|qa-validator]]: Auditoría de sintaxis y calidad con flash_lite.
- [[04_KNOWLEDGE_BASE/Skill_antigravity-guide|antigravity-guide]]: Guía general de Antigravity.
- [[04_KNOWLEDGE_BASE/Skill_agy-customizations|agy-customizations]]: Creación de skills, plugins y servidores MCP.

---

## Enlace Maestro
- [[04_KNOWLEDGE_BASE/Skills_Catalog|Ver Tabla Completa en Catálogo Maestro]]
""",
        "MOC_Checkpoints.md": """# 📌 MOC: Checkpoints e Historial de Avance
**Tags:** #moc #checkpoints #blindaje  
**MOC Superior:** [[02_SECOND_BRAIN_MOC/MOC_Master]]

---

## Estado Actual
- [[03_AGENT_MEMORY/Checkpoints/CHECKPOINT_PROGRESO_ACTUAL|Checkpoint de Progreso Actual]]: Estado vivo del workspace principal.
- [[03_AGENT_MEMORY/System_State|Estado Global del Sistema]]: Resumen de salud y telemetría.

## Filosofía de Checkpoint
- Permite reiniciar conversaciones largas reduciendo el consumo de tokens de ~90k a ~3k por turno.
- Garantiza que cualquier nueva sesión herede el 100% del contexto sin fricción.
""",
        "MOC_Arquitectura_Sistema.md": """# 🏗️ MOC: Arquitectura del Sistema
**Tags:** #moc #arquitectura  
**MOC Superior:** [[02_SECOND_BRAIN_MOC/MOC_Master]]

---

## Componentes Clave
1. **Lector de Cuota en Vivo:** `tools/antigravity_live_quota.py` (Connect-RPC sobre localhost).
2. **Motor de Telemetría Real:** `tools/telemetry_engine.py` (Estilo Claude Code / Codex).
3. **Puente de Obsidian:** `tools/obsidian_bridge.py` (Vault y Sparse Retrieval).
4. **Validador Luau Offline:** `tools/luau_offline_validator.py`.
5. **Motor OMML Nativo:** `tools/omml_engine.py`.
6. **Acelerador Multimedia:** `tools/media_clipper.py` (NVIDIA NVENC).
"""
    }
    moc_dir = vault_path / "02_SECOND_BRAIN_MOC"
    for name, content in mocs.items():
        with open(moc_dir / name, "w", encoding="utf-8") as f:
            f.write(content)

def generate_project_overviews(vault_path: Path):
    """Genera notas Overview para cada proyecto en 01_PROJECTS."""
    projects = {
        "01_PROJECTS/Antigravity_System/Overview.md": """# Proyecto: Antigravity System
**Tags:** #proyecto #antigravity #core  
**MOC:** [[02_SECOND_BRAIN_MOC/MOC_Proyectos]]

Sistema base de copiloto técnico con telemetría en tiempo real, integración con Obsidian, blindaje de cuota y enjambre de subagentes asíncronos.
""",
        "01_PROJECTS/Roblox_Development/Overview.md": """# Proyecto: Juego Roblox
**Tags:** #proyecto #roblox #luau  
**MOC:** [[02_SECOND_BRAIN_MOC/MOC_Proyectos]]

Desarrollo y mantenimiento de experiencias en Roblox Studio utilizando Luau, arquitectura modular cliente-servidor y validación estática offline.
""",
        "01_PROJECTS/TikTok_Automation/Overview.md": """# Proyecto: TikTok Automation (GD)
**Tags:** #proyecto #tiktok #multimedia  
**MOC:** [[02_SECOND_BRAIN_MOC/MOC_Proyectos]]

Pipeline de edición automatizada de video vertical 9:16 para Geometry Dash con aceleración por hardware NVIDIA NVENC, separación de pistas con Demucs y sincronización rítmica por correlación cruzada FFT.
""",
        "01_PROJECTS/Universidad_Academica/Overview.md": """# Proyecto: Universidad Académica
**Tags:** #proyecto #universidad #ingenieria  
**MOC:** [[02_SECOND_BRAIN_MOC/MOC_Proyectos]]

Documentación técnica de alto rigor, tratados de cálculo y física con tipografía matemática nativa (OMML Cambria Math) y formato formal APA 7.
"""
    }
    for rel_path, content in projects.items():
        full_path = vault_path / rel_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)

def generate_token_playbook(vault_path: Path):
    """Genera el manual de optimización de tokens en 04_KNOWLEDGE_BASE."""
    content = """# Manual de Optimización de Tokens y Recuperación Dispersa
**Tags:** #tokens #eficiencia #playbook  
**MOC:** [[02_SECOND_BRAIN_MOC/MOC_Master]]

---

## 1. El Costo Oculto de los Chats Largos
- Cada mensaje en un chat largo retransmite todo el historial previo.
- En un chat de más de 20 turnos, **más del 95% del consumo corresponde a la lectura de turnos antiguos**.
- **Solución:** Cerrar el chat, guardar el estado en [[03_AGENT_MEMORY/Checkpoints/CHECKPOINT_PROGRESO_ACTUAL|CHECKPOINT]] e iniciar un chat limpio.

## 2. Sparse Retrieval con Obsidian MOCs
- En lugar de pedirle al agente que lea carpetas enteras de código o documentación, indícale consultar el MOC específico:
  - Ejemplo: `Consulta [[02_SECOND_BRAIN_MOC/MOC_Proyectos]] y dame el avance de Roblox`.
- El agente lee solo el MOC (~150 tokens) y la nota destino (~300 tokens), evitando consumir 50,000 tokens innecesarios.

## 3. Filosofía de Salida Concisa
- Respuestas directas, telegráficas y sin saludos redundantes.
- Uso de herramientas locales de Python para procesar datos pesados sin pasar por el LLM.
"""
    with open(vault_path / "04_KNOWLEDGE_BASE" / "Token_Optimization_Playbook.md", "w", encoding="utf-8") as f:
        f.write(content)

def sync_all(vault_path: Path = DEFAULT_VAULT_PATH):
    """Ejecuta sincronización completa del ecosistema con Obsidian."""
    print("[*] Sincronizando catálogo de skills...")
    sync_skills_catalog(vault_path)
    print("[*] Sincronizando MOCs...")
    generate_mocs(vault_path)
    print("[*] Sincronizando proyectos...")
    generate_project_overviews(vault_path)
    print("[*] Sincronizando manual de tokens...")
    generate_token_playbook(vault_path)
    print("[*] Sincronizando checkpoints y memoria del agente...")
    sync_checkpoints_and_state(vault_path)
    print("[OK] Sincronización completa con Obsidian finalizada.")

def query_vault(keyword: str, vault_path: Path = DEFAULT_VAULT_PATH):
    """Búsqueda local rápida y con costo 0 de tokens dentro de la bóveda."""
    results = []
    for root, _, files in os.walk(vault_path):
        if ".obsidian" in root:
            continue
        for file in files:
            if file.endswith(".md"):
                file_path = Path(root) / file
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                        if keyword.lower() in content.lower():
                            rel = file_path.relative_to(vault_path)
                            results.append(str(rel))
                except Exception:
                    pass
    return results

def add_knowledge_note(title: str, content: str, category: str = "research", tags: list = None, vault_path: Path = DEFAULT_VAULT_PATH):
    """Guarda un hallazgo de investigación, decisión técnica o nueva idea en la bóveda."""
    if tags is None:
        tags = ["#aprendizaje", "#investigacion"]
    
    clean_title = "".join(c for c in title if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")
    
    if category.lower() in ("decision", "adr"):
        target_dir = vault_path / "03_AGENT_MEMORY" / "Decision_Records"
        moc_ref = "[[02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema]]"
        prefix = "ADR"
    elif category.lower() in ("inbox", "idea", "quick"):
        target_dir = vault_path / "00_INBOX"
        moc_ref = "[[02_SECOND_BRAIN_MOC/MOC_Master]]"
        prefix = "Idea"
    else:
        target_dir = vault_path / "04_KNOWLEDGE_BASE"
        moc_ref = "[[02_SECOND_BRAIN_MOC/MOC_Master]]"
        prefix = "Research"

    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{prefix}_{clean_title}.md"
    file_path = target_dir / filename

    tag_str = " ".join(t if t.startswith("#") else f"#{t}" for t in tags)
    full_content = f"""# {title}
**Fecha:** {time.strftime('%Y-%m-%d %H:%M:%S')}  
**Categoría:** {category.capitalize()}  
**Tags:** {tag_str}  
**MOC Relacionado:** {moc_ref} | [[02_SECOND_BRAIN_MOC/MOC_Master]]

---

## Síntesis del Hallazgo / Decisión
{content}

---

## Conexiones y Referencias
- [[03_AGENT_MEMORY/System_State]]
- [[04_KNOWLEDGE_BASE/Skills_Catalog]]
"""
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(full_content)
    
    print(f"[+] Nota guardada exitosamente en el Segundo Cerebro: [[{file_path.relative_to(vault_path)}]]")
    return file_path

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Puente Antigravity <-> Obsidian Second Brain")
    parser.add_argument("--init", action="store_true", help="Inicializa el Vault y su configuración nativa")
    parser.add_argument("--sync", action="store_true", help="Sincroniza el catálogo de skills, checkpoints y MOCs")
    parser.add_argument("--status", action="store_true", help="Muestra el estado de la bóveda y conteo de notas")
    parser.add_argument("--query", type=str, help="Búsqueda rápida en la bóveda sin consumo de tokens")
    parser.add_argument("--vault", type=str, default=str(DEFAULT_VAULT_PATH), help="Ruta personalizada de la bóveda")
    parser.add_argument("--add-note", type=str, help="Título de la nueva nota a registrar")
    parser.add_argument("--content", type=str, help="Contenido detallado de la nota")
    parser.add_argument("--category", type=str, default="research", help="Categoría: research, decision, inbox")
    parser.add_argument("--tags", type=str, default="", help="Tags separados por coma")

    args = parser.parse_args()
    v_path = Path(args.vault)

    if args.init:
        init_vault(v_path)
    elif args.sync:
        sync_all(v_path)
    elif args.add_note:
        c = args.content if args.content else "Nota registrada por Antigravity."
        t_list = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else None
        add_knowledge_note(args.add_note, c, args.category, t_list, v_path)
    elif args.query:
        matches = query_vault(args.query, v_path)
        print(f"Resultados para '{args.query}': ({len(matches)} encontrados)")
        for m in matches:
            print(f" - [[{m}]]")
    elif args.status:
        if not v_path.exists():
            print(f"[!] La bóveda en {v_path} no existe aún. Ejecuta --init")
        else:
            md_files = list(v_path.rglob("*.md"))
            print(f"Estado de la Bóveda de Obsidian:")
            print(f" - Ruta: {v_path}")
            print(f" - Total Notas Markdown: {len(md_files)}")
            print(f" - Configuración .obsidian presente: {(v_path / '.obsidian').exists()}")
    else:
        init_vault(v_path)

