#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/expand_second_brain.py
Expande y densifica la red neuronal del Segundo Cerebro en Obsidian (Antigravity_Obsidian_Brain).
Crea notas atómicas enriquecidas para todos los proyectos, componentes, decisiones de arquitectura (ADRs)
y conceptos clave de la laptop, interconectándolos con wikilinks bidireccionales y MOCs.
"""

import os
import sys
import time
from pathlib import Path

VAULT_DIR = Path(r"C:\Users\gonza\OneDrive\Escritorio\Antigravity_Obsidian_Brain")

def ensure_dirs():
    dirs = [
        "00_INBOX",
        "01_PROJECTS/Antigravity_System",
        "01_PROJECTS/Roblox_Development",
        "01_PROJECTS/TikTok_Automation",
        "01_PROJECTS/Universidad_Academica",
        "01_PROJECTS/Music_Downloader",
        "01_PROJECTS/Video_Downloader",
        "01_PROJECTS/Organizador_Archivos",
        "02_SECOND_BRAIN_MOC",
        "03_AGENT_MEMORY/Checkpoints",
        "03_AGENT_MEMORY/Decision_Records",
        "04_KNOWLEDGE_BASE/Conceptos",
        "04_KNOWLEDGE_BASE/Componentes",
        "05_TEMPLATES"
    ]
    for d in dirs:
        (VAULT_DIR / d).mkdir(parents=True, exist_ok=True)

def write_note(rel_path, title, category, tags, moc, body, links=None):
    full_path = VAULT_DIR / rel_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    
    tag_str = " ".join(t if t.startswith("#") else f"#{t}" for t in tags)
    links_str = ""
    if links:
        links_str = "\n".join(f"- [[{l}]]" for l in links)
    else:
        links_str = "- [[02_SECOND_BRAIN_MOC/MOC_Master]]"

    content = f"""# {title}
**Fecha:** {time.strftime('%Y-%m-%d %H:%M:%S')}  
**Categoría:** {category}  
**Tags:** {tag_str}  
**MOC:** [[{moc}]] | [[02_SECOND_BRAIN_MOC/MOC_Master]]

---

## Núcleo del Concepto / Módulo
{body}

---

## 🔗 Nodos y Conexiones Relacionadas
{links_str}
"""
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

def build_dense_brain():
    print("[*] Asegurando estructura de carpetas...")
    ensure_dirs()

    print("[*] Generando notas atómicas para proyectos y módulos de la laptop...")

    # -------------------------------------------------------------
    # 1. TIKTOK AUTOMATION (GEOMETRY DASH)
    # -------------------------------------------------------------
    write_note(
        "01_PROJECTS/TikTok_Automation/Pipeline_TikTok_NVENC.md",
        "Pipeline de Video Vertical 9:16 con NVENC",
        "Proyecto / Video",
        ["tiktok", "geometrydash", "nvenc", "ffmpeg"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Pipeline de aceleración por hardware NVIDIA para renderizar videos de Geometry Dash a 1080x1920 60 FPS a más de 500 FPS sin consumo de CPU. Aplica filtros de recorte, escala y maquetación visual.",
        [
            "04_KNOWLEDGE_BASE/Conceptos/Concepto_NVENC_Hardware_Encoding",
            "01_PROJECTS/TikTok_Automation/Sincronizacion_FFT_Audio",
            "03_AGENT_MEMORY/Decision_Records/ADR_Aceleracion_NVENC_GPU"
        ]
    )

    write_note(
        "01_PROJECTS/TikTok_Automation/Sincronizacion_FFT_Audio.md",
        "Sincronización Rítmica de Audio por FFT",
        "Algoritmo / Audio",
        ["audio", "librosa", "fft", "cross_correlation"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Algoritmo de correlación cruzada rápida utilizando la transformada rápida de Fourier (`signal.correlate(..., method='fft')`). Encuentra el offset exacto al milisegundo entre la canción original de Newgrounds y el gameplay grabado.",
        [
            "04_KNOWLEDGE_BASE/Conceptos/Concepto_Correlacion_FFT_Signal",
            "03_AGENT_MEMORY/Decision_Records/ADR_Optimizacion_Seek_FFmpeg_MP3_VBR",
            "01_PROJECTS/TikTok_Automation/Decodificacion_Boomlings_GD"
        ]
    )

    write_note(
        "01_PROJECTS/TikTok_Automation/Aislamiento_Demucs_Voces.md",
        "Aislamiento de Clics y Reacciones con Demucs",
        "Inteligencia Artificial / Audio",
        ["demucs", "audio_separation", "stems"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Separación de pistas mediante el modelo neuronal Demucs. Permite aislar los clics del mouse y la voz del jugador a partir del 90% del nivel, mezclándolos limpiamente con la música en alta fidelidad.",
        [
            "01_PROJECTS/TikTok_Automation/Pipeline_TikTok_NVENC",
            "04_KNOWLEDGE_BASE/Skill_media-pipeline"
        ]
    )

    write_note(
        "01_PROJECTS/TikTok_Automation/Decodificacion_Boomlings_GD.md",
        "Ingeniería Inversa de Servidores Boomlings",
        "Protocolo / APIs",
        ["boomlings", "geometrydash", "xor", "zlib"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Cliente de consulta para la base de datos de Geometry Dash (`downloadGJLevel22.php`). Descomprime los datos con Base64 y Zlib para extraer metadatos oficiales como `kA13` (song offset) y `songID`.",
        [
            "01_PROJECTS/TikTok_Automation/Sincronizacion_FFT_Audio",
            "01_PROJECTS/TikTok_Automation/Gestor_Datos_JSON_Demons"
        ]
    )

    write_note(
        "01_PROJECTS/TikTok_Automation/Gestor_Datos_JSON_Demons.md",
        "Gestor de Metadatos de Demons (datos.json)",
        "Datos / Base",
        ["json", "metadata", "demons"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Base de datos local que almacena timestamps de inicio, offsets calibrados de música, dificultad, ID de nivel y flags de render para los 15 demons superados (N.100 a N.114).",
        [
            "01_PROJECTS/TikTok_Automation/Pipeline_TikTok_NVENC",
            "01_PROJECTS/TikTok_Automation/Subida_Automatizada_TikTok"
        ]
    )

    write_note(
        "01_PROJECTS/TikTok_Automation/Subida_Automatizada_TikTok.md",
        "Automatización de Publicación en TikTok",
        "Automatización / Web",
        ["tiktok_upload", "selenium", "playwright"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Script `upload_to_tiktok.py` para subir videos terminados desde `TikToks_V4` a TikTok con descripciones, etiquetas `#geometrydash #demon` y portada generada automáticamente.",
        [
            "01_PROJECTS/TikTok_Automation/Pipeline_TikTok_NVENC"
        ]
    )

    # -------------------------------------------------------------
    # 2. JUEGO ROBLOX STUDIO
    # -------------------------------------------------------------
    write_note(
        "01_PROJECTS/Roblox_Development/Framework_Luau_Modular.md",
        "Framework Modular Luau en Roblox Studio",
        "Desarrollo / Luau",
        ["roblox", "luau", "arquitectura"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Estructura modular en Luau que desacopla la lógica del servidor (`ServerScriptService`), servicios compartidos (`ReplicatedStorage`) y controladores de cliente (`StarterPlayerScripts`).",
        [
            "01_PROJECTS/Roblox_Development/Arquitectura_Cliente_Servidor",
            "01_PROJECTS/Roblox_Development/Validador_Luau_Offline",
            "04_KNOWLEDGE_BASE/Skill_roblox-specialist"
        ]
    )

    write_note(
        "01_PROJECTS/Roblox_Development/Arquitectura_Cliente_Servidor.md",
        "Gestión de Red con RemoteEvents y RemoteFunctions",
        "Red / Multijugador",
        ["roblox", "remote_events", "seguridad"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Patrón de validación server-authoritative. El cliente solicita acciones y el servidor valida cooldowns, posición y atributos antes de aplicar cambios para evitar vulnerabilidades.",
        [
            "01_PROJECTS/Roblox_Development/Framework_Luau_Modular",
            "01_PROJECTS/Roblox_Development/TweenService_Animaciones"
        ]
    )

    write_note(
        "01_PROJECTS/Roblox_Development/Validador_Luau_Offline.md",
        "Validador Estático Luau Offline",
        "Herramienta / QA",
        ["luau", "linter", "ast"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Herramienta `tools/luau_offline_validator.py` que comprueba balance de bloques (`do..end`, `then..end`), llamadas remotas y sintaxis de Luau sin necesidad de abrir Roblox Studio.",
        [
            "01_PROJECTS/Roblox_Development/Framework_Luau_Modular",
            "04_KNOWLEDGE_BASE/Skill_qa-validator"
        ]
    )

    write_note(
        "01_PROJECTS/Roblox_Development/TweenService_Animaciones.md",
        "Animación y UI Fluida con TweenService",
        "Gráficos / UI",
        ["roblox", "tween", "ui"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Manejo de interpolaciones suaves para interfaces de usuario, aperturas de puertas, barras de vida y retroalimentación táctil de botones en Roblox.",
        [
            "01_PROJECTS/Roblox_Development/Framework_Luau_Modular"
        ]
    )

    # -------------------------------------------------------------
    # 3. UNIVERSIDAD ANTIGRAVITY (ACADÉMICO)
    # -------------------------------------------------------------
    write_note(
        "01_PROJECTS/Universidad_Academica/Materia_Metrologia_Normalizacion.md",
        "Materia: Metrología y Normalización",
        "Académico / Asignatura",
        ["itcv", "metrologia", "normalizacion", "iso"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Cátedra impartida por la Ing. Angélica Muñoz Chávez en el ITCV. Abarca normas ISO (9000, 14000, 45001), NOMs mexicanas, tolerancias dimensionales e instrumentos de medición.",
        [
            "01_PROJECTS/Universidad_Academica/Actividad_S1_T1_Normas_ISO",
            "01_PROJECTS/Universidad_Academica/Plantilla_Oficial_ITCV"
        ]
    )

    write_note(
        "01_PROJECTS/Universidad_Academica/Materia_Algebra_Lineal.md",
        "Materia: Álgebra Lineal",
        "Académico / Asignatura",
        ["itcv", "algebra_lineal", "vectores", "omml"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Estudio de números complejos (forma binómica, polar, exponencial), matrices, determinantes, espacios vectoriales y transformaciones lineales con deducciones matemáticas rigurosas.",
        [
            "01_PROJECTS/Universidad_Academica/Actividad_1_4_Forma_Polar",
            "01_PROJECTS/Universidad_Academica/Motor_OMML_Cambria_Math"
        ]
    )

    write_note(
        "01_PROJECTS/Universidad_Academica/Actividad_S1_T1_Normas_ISO.md",
        "Actividad S1-T1: Síntesis ISO y Cuestionario",
        "Académico / Tarea",
        ["s1_t1", "iso", "tarea_entregada"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Documento oficial de 1 cuartilla exacta con portada ITCV. Incluye síntesis del video de Procem Consultores y matriz comparativa entre Ley, Reglamento y Norma.",
        [
            "01_PROJECTS/Universidad_Academica/Materia_Metrologia_Normalizacion",
            "01_PROJECTS/Universidad_Academica/Plantilla_Oficial_ITCV"
        ]
    )

    write_note(
        "01_PROJECTS/Universidad_Academica/Actividad_1_4_Forma_Polar.md",
        "Actividad 1.4: Forma Polar y Exponencial",
        "Académico / Tarea",
        ["complejos", "euler", "omml", "tarea_entregada"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Tratado de números complejos con fórmulas en OMML nativo, cálculo de módulos, argumentos principales y gráficas del plano de Argand en alta resolución.",
        [
            "01_PROJECTS/Universidad_Academica/Materia_Algebra_Lineal",
            "01_PROJECTS/Universidad_Academica/Motor_OMML_Cambria_Math"
        ]
    )

    write_note(
        "01_PROJECTS/Universidad_Academica/Motor_OMML_Cambria_Math.md",
        "Motor Matemático OMML Nativo (Cambria Math)",
        "Herramienta / Tipografía",
        ["omml", "cambria_math", "docx", "word"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Módulo `tools/omml_engine.py` que genera XML matemático nativo (`<m:oMath>`) de Microsoft Word para fracciones con barra horizontal, integrales, matrices y raíces idénticas a libros de texto.",
        [
            "04_KNOWLEDGE_BASE/Conceptos/Concepto_OMML_Word",
            "04_KNOWLEDGE_BASE/Skill_academic-engineering",
            "03_AGENT_MEMORY/Decision_Records/ADR_OMML_Nativo_vs_LaTeX_Word"
        ]
    )

    write_note(
        "01_PROJECTS/Universidad_Academica/Plantilla_Oficial_ITCV.md",
        "Plantilla Institucional y Portada ITCV",
        "Estándar / Formato",
        ["itcv", "portada", "docx", "apa7"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Script `crear_documento_itcv.py` con logos oficiales del TecNM e ITCV, tipografía institucional, márgenes de 2.54 cm y metadatos del estudiante.",
        [
            "01_PROJECTS/Universidad_Academica/Materia_Metrologia_Normalizacion"
        ]
    )

    # -------------------------------------------------------------
    # 4. MULTIMEDIA & DESCARGAS (MUSIC, VIDEO, ANIME)
    # -------------------------------------------------------------
    write_note(
        "01_PROJECTS/Music_Downloader/Pipeline_Spotdl_YtDlp.md",
        "Pipeline de Audio: Spotdl y Yt-Dlp",
        "Multimedia / Audio",
        ["spotify", "spotdl", "yt_dlp", "flac", "mp3"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Pipeline de descarga en máxima fidelidad musical. Conecta consultas de Spotify con audio de YouTube en 320 kbps o FLAC con incrustación de carátulas ID3.",
        [
            "01_PROJECTS/Music_Downloader/Metadatos_ID3_Caratulas",
            "04_KNOWLEDGE_BASE/Skill_media-pipeline"
        ]
    )

    write_note(
        "01_PROJECTS/Music_Downloader/Metadatos_ID3_Caratulas.md",
        "Incrustación de Metadatos ID3 y Carátulas",
        "Audio / Metadatos",
        ["mutagen", "id3", "album_art"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Uso de `mutagen` para escribir etiquetas limpias de artista, álbum, año, número de pista y carátula en alta definición directamente en el contenedor del archivo de audio.",
        [
            "01_PROJECTS/Music_Downloader/Pipeline_Spotdl_YtDlp"
        ]
    )

    write_note(
        "01_PROJECTS/Video_Downloader/Extractor_Youtube_YtDlp.md",
        "Extractor Universal de Video y Audio Yt-Dlp",
        "Multimedia / Video",
        ["yt_dlp", "youtube", "ffmpeg"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Utilidad de línea de comandos para extraer videos en 1080p/4K, transcripciones subtituladas completas o fragmentos de tiempo específicos para análisis agéntico.",
        [
            "04_KNOWLEDGE_BASE/Skill_media-pipeline"
        ]
    )

    write_note(
        "01_PROJECTS/Organizador_Archivos/Clasificador_Archivos_Anime.md",
        "Organizador y Clasificador Masivo de Archivos",
        "Utilidad / Sistema",
        ["organizador", "clasificacion", "regex"],
        "02_SECOND_BRAIN_MOC/MOC_Proyectos",
        "Script en `E:\\Respaldos\\Organizador_Anime` y `Para_Organizar` que analiza nombres de archivos mediante expresiones regulares, resolviendo temporadas, capítulos y resoluciones.",
        [
            "02_SECOND_BRAIN_MOC/MOC_Proyectos"
        ]
    )

    # -------------------------------------------------------------
    # 5. ANTIGRAVITY CORE SYSTEM & HERRAMIENTAS
    # -------------------------------------------------------------
    write_note(
        "01_PROJECTS/Antigravity_System/Lector_Cuota_Live_RPC.md",
        "Lector de Cuota Nativa en Vivo (Connect-RPC)",
        "Core / Telemetría",
        ["connect_rpc", "grpc", "cuota", "language_server"],
        "02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema",
        "Módulo `tools/antigravity_live_quota.py`. Se comunica con el puerto local dinámico de `language_server.exe` mediante Connect-RPC HTTPS con token CSRF, extrayendo el % exacto de 5h y cuota semanal sin consumir tokens de IA.",
        [
            "01_PROJECTS/Antigravity_System/Motor_Telemetria_Claude_Code",
            "04_KNOWLEDGE_BASE/Conceptos/Concepto_Model_Tiering"
        ]
    )

    write_note(
        "01_PROJECTS/Antigravity_System/Motor_Telemetria_Claude_Code.md",
        "Motor de Telemetría Real Estilo Claude Code",
        "Core / Telemetría",
        ["telemetria", "claude_code", "tokens", "cuota"],
        "02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema",
        "Motor `tools/telemetry_engine.py` (v4). Lee el historial acumulado en `transcript.jsonl`, calcula tokens de Entrada, Razonamiento y Salida, y descuenta el impacto calibrado en cuota semanal y ventana de 5h.",
        [
            "01_PROJECTS/Antigravity_System/Lector_Cuota_Live_RPC",
            "03_AGENT_MEMORY/Decision_Records/ADR_Protocolo_Telemetria_Obligatoria"
        ]
    )

    write_note(
        "01_PROJECTS/Antigravity_System/Guardian_Archivos_Surgical_Patcher.md",
        "Guardián Quirúrgico de Archivos Masivos",
        "Herramienta / Optimización",
        ["surgical_patcher", "tokens", "rendimiento"],
        "02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema",
        "Módulo `tools/surgical_patcher.py`. Evita cargar archivos >100 KB al contexto de chat. Permite inspección, regex y parcheo de archivos pesados en memoria local con 0 tokens.",
        [
            "04_KNOWLEDGE_BASE/Conceptos/Concepto_Sparse_Retrieval",
            "04_KNOWLEDGE_BASE/Token_Optimization_Playbook"
        ]
    )

    write_note(
        "01_PROJECTS/Antigravity_System/Despliegue_Universal_Workspaces.md",
        "Despliegue Universal de Reglas y Protocolos",
        "Automatización / Dev",
        ["deploy", "workspaces", "sincronizacion"],
        "02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema",
        "Módulo `tools/deploy_to_all_workspaces.py`. Sincroniza en lote las reglas (`.agents/rules/`), la suite de herramientas (`tools/`) y `AGENTS.md` a través de los 11 espacios de trabajo.",
        [
            "03_AGENT_MEMORY/Decision_Records/ADR_Bootstrap_Silencioso_Checkpoints"
        ]
    )

    # -------------------------------------------------------------
    # 6. CONCEPTOS CLAVE DEL SEGUNDO CEREBRO
    # -------------------------------------------------------------
    write_note(
        "04_KNOWLEDGE_BASE/Conceptos/Concepto_Sparse_Retrieval.md",
        "Recuperación Dispersa (Sparse Retrieval)",
        "Arquitectura / IA",
        ["sparse_retrieval", "tokens", "eficiencia", "mocs"],
        "02_SECOND_BRAIN_MOC/MOC_Master",
        "Técnica de ingeniería de contexto que sustituye el volcado masivo de documentos por la consulta selectiva de índices (MOCs). Reduce el costo de tokens en más del 90% en flujos multi-paso.",
        [
            "02_SECOND_BRAIN_MOC/MOC_Master",
            "04_KNOWLEDGE_BASE/Token_Optimization_Playbook",
            "03_AGENT_MEMORY/Decision_Records/ADR_MOC_Sparse_Retrieval_Obsidian"
        ]
    )

    write_note(
        "04_KNOWLEDGE_BASE/Conceptos/Concepto_NVENC_Hardware_Encoding.md",
        "Codificación Acelerada por Hardware NVIDIA NVENC",
        "Hardware / Video",
        ["nvenc", "gpu", "ffmpeg", "h264", "hevc"],
        "02_SECOND_BRAIN_MOC/MOC_Master",
        "Uso del chip dedicado NVENC en GPUs GeForce para transcodificar video H.264/HEVC sin consumir recursos de CPU, logrando velocidades de render superiores a 500 cuadros por segundo.",
        [
            "01_PROJECTS/TikTok_Automation/Pipeline_TikTok_NVENC",
            "03_AGENT_MEMORY/Decision_Records/ADR_Aceleracion_NVENC_GPU"
        ]
    )

    write_note(
        "04_KNOWLEDGE_BASE/Conceptos/Concepto_Correlacion_FFT_Signal.md",
        "Correlación Cruzada por Transformada Rápida de Fourier",
        "Matemáticas / Señales",
        ["fft", "convolucion", "dsp", "scipy"],
        "02_SECOND_BRAIN_MOC/MOC_Master",
        "Aplicación del Teorema de Convolución: la correlación en el dominio del tiempo se transforma en una multiplicación simple en el dominio frecuencial, reduciendo la complejidad de O(N*M) a O(N log N).",
        [
            "01_PROJECTS/TikTok_Automation/Sincronizacion_FFT_Audio"
        ]
    )

    write_note(
        "04_KNOWLEDGE_BASE/Conceptos/Concepto_Card_UI_Layout.md",
        "Diseño de Diapositivas en Tarjetas (Card UI Layout)",
        "Diseño / Presentaciones",
        ["pptx", "card_ui", "ux", "visual"],
        "02_SECOND_BRAIN_MOC/MOC_Master",
        "Patrón de diseño para PowerPoint que sustituye las viñetas por contenedores rectangulares con fondo sutil, números KPI de 36-48pt y jerarquía cromática 60-30-10 para eliminar el 'AI Slop'.",
        [
            "04_KNOWLEDGE_BASE/Skill_office-pptx-master"
        ]
    )

    write_note(
        "04_KNOWLEDGE_BASE/Conceptos/Concepto_Formulas_Vivas_Excel.md",
        "Fórmulas Dinámicas Vivas en Hojas de Cálculo",
        "Finanzas / Excel",
        ["openpyxl", "excel", "formulas_vivas"],
        "02_SECOND_BRAIN_MOC/MOC_Master",
        "Principio de construcción de hojas de cálculo donde ningún total o métrica es un valor plano quemado a mano; todos se calculan reactivamente mediante fórmulas nativas de Excel.",
        [
            "04_KNOWLEDGE_BASE/Skill_office-excel-master"
        ]
    )

    write_note(
        "04_KNOWLEDGE_BASE/Conceptos/Concepto_Macros_VBA.md",
        "Automatización Interactiva con Macros VBA (.xlsm)",
        "Automatización / Office",
        ["vba", "macros", "excel", "com"],
        "02_SECOND_BRAIN_MOC/MOC_Master",
        "Integración de scripts Visual Basic for Applications dentro de libros de Excel para habilitar botones de acción rápida, filtros automatizados y exportación a PDF con un solo clic.",
        [
            "04_KNOWLEDGE_BASE/Skill_office-excel-master"
        ]
    )

    write_note(
        "04_KNOWLEDGE_BASE/Conceptos/Concepto_Sequential_Thinking.md",
        "Razonamiento Secuencial Dinámico (Sequential Thinking)",
        "Metodología / Razonamiento",
        ["sequential_thinking", "mcp", "arquitectura"],
        "02_SECOND_BRAIN_MOC/MOC_Master",
        "Metodología de descomposición paso a paso para resolver problemas matemáticos densos, físicas complejas o fallas crípticas de software mediante evaluación continua de hipótesis antes de actuar.",
        [
            "02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema"
        ]
    )

    # -------------------------------------------------------------
    # 7. REGISTRO DE DECISIONES DE ARQUITECTURA (ADRS)
    # -------------------------------------------------------------
    write_note(
        "03_AGENT_MEMORY/Decision_Records/ADR_Protocolo_Telemetria_Obligatoria.md",
        "ADR: Telemetría Real Obligatoria al Final de Cada Turno",
        "Decisión de Arquitectura",
        ["adr", "telemetria", "cuota"],
        "02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema",
        "Decisión de implementar un reporte en 4 viñetas verticales en cada respuesta con cálculo de tokens por llamadas y consulta al language server oficial para dar visibilidad total al usuario sobre el uso de cuota.",
        [
            "01_PROJECTS/Antigravity_System/Motor_Telemetria_Claude_Code",
            "01_PROJECTS/Antigravity_System/Lector_Cuota_Live_RPC"
        ]
    )

    write_note(
        "03_AGENT_MEMORY/Decision_Records/ADR_Bootstrap_Silencioso_Checkpoints.md",
        "ADR: Bootstrap Silencioso de Checkpoints en Turno 1",
        "Decisión de Arquitectura",
        ["adr", "checkpoint", "relevo_pro"],
        "02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema",
        "Decisión de leer automáticamente `CHECKPOINT_PROGRESO.md` en el primer mensaje de cualquier sesión nueva. Permite al usuario alternar entre cuentas Pro sin tener que re-explicar en qué se quedó el proyecto.",
        [
            "01_PROJECTS/Antigravity_System/Despliegue_Universal_Workspaces",
            "02_SECOND_BRAIN_MOC/MOC_Checkpoints"
        ]
    )

    write_note(
        "03_AGENT_MEMORY/Decision_Records/ADR_Aceleracion_NVENC_GPU.md",
        "ADR: Uso Exclusivo de NVENC en Pipelines de Video",
        "Decisión de Arquitectura",
        ["adr", "nvenc", "ffmpeg", "gpu"],
        "02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema",
        "Decisión de prohibir la codificación por software (`libx264`) en tareas masivas de video y forzar el uso del acelerador por hardware `h264_nvenc` / `hevc_nvenc` para evitar congelamiento de CPU y lograr renders instantáneos.",
        [
            "01_PROJECTS/TikTok_Automation/Pipeline_TikTok_NVENC",
            "04_KNOWLEDGE_BASE/Conceptos/Concepto_NVENC_Hardware_Encoding"
        ]
    )

    write_note(
        "03_AGENT_MEMORY/Decision_Records/ADR_OMML_Nativo_vs_LaTeX_Word.md",
        "ADR: Tipografía OMML Nativa frente a Texto Plano en Word",
        "Decisión de Arquitectura",
        ["adr", "omml", "cambria_math", "word"],
        "02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema",
        "Decisión de generar XML matemático nativo en formato OMML (Office Math Markup Language) en lugar de insertar imágenes estáticas o texto plano, garantizando calidad de imprenta profesional.",
        [
            "01_PROJECTS/Universidad_Academica/Motor_OMML_Cambria_Math",
            "04_KNOWLEDGE_BASE/Skill_academic-engineering"
        ]
    )

    write_note(
        "03_AGENT_MEMORY/Decision_Records/ADR_MOC_Sparse_Retrieval_Obsidian.md",
        "ADR: Navegación por Mapas de Contenido (MOCs) en Obsidian",
        "Decisión de Arquitectura",
        ["adr", "obsidian", "segundo_cerebro", "tokens"],
        "02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema",
        "Decisión de adoptar la estructura de MOCs como índice maestro para el agente. El agente consulta primero el MOC antes de escanear archivos del disco, reduciendo el consumo de tokens en un 90%.",
        [
            "04_KNOWLEDGE_BASE/Conceptos/Concepto_Sparse_Retrieval",
            "02_SECOND_BRAIN_MOC/MOC_Master"
        ]
    )

    print("[*] Sincronizando con el puente de Obsidian...")
    from obsidian_bridge import sync_all
    sync_all(VAULT_DIR)
    print("[OK] Expansión del Segundo Cerebro completada con éxito.")

if __name__ == "__main__":
    build_dense_brain()
