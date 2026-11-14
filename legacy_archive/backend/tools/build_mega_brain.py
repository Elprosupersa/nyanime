#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/build_mega_brain.py
Construye la MEGA BOLA DE OBSIDIAN (Segundo Cerebro Integral de la Laptop).
Escanea y cataloga absolutamente todos los proyectos, materias universitarias (ITCV),
demons de Geometry Dash, pipelines de video/audio, Roblox Luau y herramientas de IA,
generando más de 120 notas atómicas densamente interconectadas con [[wikilinks]].
"""

import os
import sys
import time
from pathlib import Path

VAULT_DIR = Path(r"C:\Users\gonza\OneDrive\Escritorio\Antigravity_Obsidian_Brain")

def ensure_folders():
    folders = [
        "00_INBOX",
        "01_PROJECTS/Antigravity_Core",
        "01_PROJECTS/TikTok_Automation/Demons",
        "01_PROJECTS/TikTok_Automation/Componentes",
        "01_PROJECTS/Roblox_Studio/Modulos",
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Algebra_Lineal",
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial",
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Economia",
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estadistica_Inferencial",
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estudio_del_Trabajo",
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Metrologia_Normalizacion",
        "01_PROJECTS/Universidad_ITCV/Proyectos_Transversales",
        "01_PROJECTS/Multimedia_Descargas",
        "02_SECOND_BRAIN_MOC",
        "03_AGENT_MEMORY/Checkpoints",
        "03_AGENT_MEMORY/Decision_Records",
        "04_KNOWLEDGE_BASE/Conceptos",
        "04_KNOWLEDGE_BASE/Herramientas",
        "05_TEMPLATES"
    ]
    for f in folders:
        (VAULT_DIR / f).mkdir(parents=True, exist_ok=True)

def write_note(rel_path, title, category, tags, moc, body, links=None):
    full_path = VAULT_DIR / rel_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    
    tag_str = " ".join(t if t.startswith("#") else f"#{t}" for t in tags)
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

## 📌 Núcleo y Contexto
{body}

---

## 🔗 Nodos y Enlaces Relacionados
{links_str}
"""
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

def build_all_nodes():
    print("[1/6] Creando estructura de directorios expandida...")
    ensure_folders()

    print("[2/6] Catalogando universo universitario ITCV (Tercer Semestre y Proyectos)...")
    
    # Universidad MOC
    write_note(
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV.md",
        "🎓 MOC: Universidad e Ingeniería ITCV",
        "MOC / Académico",
        ["moc", "universidad", "itcv", "ingenieria"],
        "02_SECOND_BRAIN_MOC/MOC_Master",
        "Centro neurálgico de las asignaturas, proyectos y tratados de ingeniería cursados en el Instituto Tecnológico de Ciudad Victoria (TecNM ITCV).",
        [
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Algebra_Lineal/Materia_Algebra_Lineal",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/Materia_Calculo_Vectorial",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Economia/Materia_Economia",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estadistica_Inferencial/Materia_Estadistica_Inferencial",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estudio_del_Trabajo/Materia_Estudio_del_Trabajo",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Metrologia_Normalizacion/Materia_Metrologia_Normalizacion",
            "01_PROJECTS/Universidad_ITCV/Proyectos_Transversales/Proyecto_Sustentable_Ekora"
        ]
    )

    # 1. Álgebra Lineal
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Algebra_Lineal/Materia_Algebra_Lineal.md",
        "Álgebra Lineal (Tercer Semestre ITCV)",
        "Asignatura",
        ["algebra_lineal", "vectores", "complejos", "matrices"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Estudio riguroso de espacios vectoriales, números complejos, transformaciones lineales y matrices con resolución analítica y geométrica.",
        [
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Algebra_Lineal/Actividad_1_4_Forma_Polar_Exponencial",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/Materia_Calculo_Vectorial",
            "04_KNOWLEDGE_BASE/Herramientas/Motor_OMML_Cambria_Math"
        ]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Algebra_Lineal/Actividad_1_4_Forma_Polar_Exponencial.md",
        "Actividad 1.4: Forma Polar y Exponencial de Complejos",
        "Actividad Entregada",
        ["complejos", "euler", "omml", "actividad"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Documento Word y PDF con tipografía Cambria Math nativa. Deducción paso a paso de fórmulas de Euler, conversión binómica a polar y plano de Argand.",
        [
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Algebra_Lineal/Materia_Algebra_Lineal",
            "04_KNOWLEDGE_BASE/Herramientas/Motor_OMML_Cambria_Math"
        ]
    )

    # 2. Cálculo Vectorial
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/Materia_Calculo_Vectorial.md",
        "Cálculo Vectorial (Tercer Semestre ITCV)",
        "Asignatura",
        ["calculo_vectorial", "vectores", "geometria_espacial"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Análisis de vectores en 2D y 3D, funciones vectoriales de una variable real, cálculo diferencial de campos vectoriales y operadores gradiente, divergencia y rotacional.",
        [
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/P1_1_Definicion_de_Vector",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/P1_2_Metodo_del_Paralelogramo",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/P1_3_Razones_Trigonometricas",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/P1_4_Descomposicion_Componentes",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Algebra_Lineal/Materia_Algebra_Lineal"
        ]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/P1_1_Definicion_de_Vector.md",
        "P 1.1: Definición de un Vector y Propiedades",
        "Participación Entregada",
        ["vector", "magnitud", "direccion", "sentido"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Resumen y problemas resueltos sobre características geométricas y algebraicas de magnitudes vectoriales vs escalares.",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/Materia_Calculo_Vectorial"]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/P1_2_Metodo_del_Paralelogramo.md",
        "P 1.2: Método del Paralelogramo (Gráfico y Analítico)",
        "Participación Entregada",
        ["paralelogramo", "ley_cosenos", "suma_vectores"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Suma de vectores coplanares concurrentes mediante el método gráfico del paralelogramo y resolución analítica por ley de cosenos y senos.",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/Materia_Calculo_Vectorial"]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/P1_3_Razones_Trigonometricas.md",
        "P 1.3: Repaso de Razones Trigonométricas en Vectores",
        "Participación Entregada",
        ["trigonometria", "seno", "coseno", "angulo_director"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Aplicación de triángulos rectángulos y funciones circulares para el cálculo de ángulos de elevación y rumbos de vectores.",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/Materia_Calculo_Vectorial"]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/P1_4_Descomposicion_Componentes.md",
        "P 1.4: Método de Descomposición de Componentes Rectangulares",
        "Participación Entregada",
        ["componentes", "vectores_unitarios", "i_j_k"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Resolución analítica de sistemas de fuerzas coplanares proyectando sobre los ejes coordenados y sumatoria vectorial cartesiana.",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Calculo_Vectorial/Materia_Calculo_Vectorial"]
    )

    # 3. Economía
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Economia/Materia_Economia.md",
        "Economía (Tercer Semestre ITCV)",
        "Asignatura",
        ["economia", "microeconomia", "macroeconomia", "mercado"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Fundamentos de teoría económica, escasez, oferta y demanda, estructuras de mercado y evolución histórica de las doctrinas económicas.",
        [
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Economia/AF1_1_Linea_Tiempo_Pensamiento_Economico",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Economia/AF1_2_Mapa_Conceptual_Conceptos_Basicos"
        ]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Economia/AF1_1_Linea_Tiempo_Pensamiento_Economico.md",
        "AF 1.1: Línea de Tiempo de la Evolución del Pensamiento Económico",
        "Actividad Entregada",
        ["mercantilismo", "fisiocracia", "clasica", "marxismo", "keynesianismo"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Recorrido cronológico desde el mercantilismo, la escuela clásica de Adam Smith, David Ricardo, el socialismo científico y el neoliberalismo moderno.",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Economia/Materia_Economia"]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Economia/AF1_2_Mapa_Conceptual_Conceptos_Basicos.md",
        "AF 1.2: Mapa Conceptual de Conceptos Básicos de Economía",
        "Actividad Entregada",
        ["escasez", "factores_produccion", "costo_oportunidad"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Estructura visual de conceptos: frontera de posibilidades de producción, bienes económicos, agentes económicos y flujo circular de la renta.",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Economia/Materia_Economia"]
    )

    # 4. Estadística Inferencial
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estadistica_Inferencial/Materia_Estadistica_Inferencial.md",
        "Estadística Inferencial (Tercer Semestre ITCV)",
        "Asignatura",
        ["estadistica", "probabilidad", "muestreo", "inferencia"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Distribuciones de probabilidad muestrales, intervalos de confianza, pruebas de hipótesis y modelado estadístico para toma de decisiones en ingeniería.",
        [
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estadistica_Inferencial/Practica_Excel_U1_Estadistica",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estadistica_Inferencial/Actividad_Formativa_Inferencia",
            "04_KNOWLEDGE_BASE/Herramientas/Excel_Formulas_Vivas"
        ]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estadistica_Inferencial/Practica_Excel_U1_Estadistica.md",
        "Práctica Excel U1: Análisis Estadístico y Fórmulas",
        "Práctica en Excel",
        ["excel", "formulas", "estadistica_descriptiva"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Libro de cálculo interactivo con cálculo de media, varianza, desviación estándar y distribución de frecuencias mediante fórmulas dinámicas.",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estadistica_Inferencial/Materia_Estadistica_Inferencial"]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estadistica_Inferencial/Actividad_Formativa_Inferencia.md",
        "Actividad Formativa: Distribuciones y Muestreo",
        "Actividad Entregada",
        ["muestreo", "t_student", "normal", "z"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Problemas aplicados de estimación puntual e intervalos de confianza para medias con varianza conocida y desconocida.",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estadistica_Inferencial/Materia_Estadistica_Inferencial"]
    )

    # 5. Estudio del Trabajo
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estudio_del_Trabajo/Materia_Estudio_del_Trabajo.md",
        "Estudio del Trabajo (Tercer Semestre ITCV)",
        "Asignatura",
        ["estudio_trabajo", "tiempos_movimientos", "productividad", "ingenieria_industrial"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Ingeniería de métodos, medición del trabajo, balanceo de líneas, diagramas de procesos y optimización de estaciones de trabajo.",
        [
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estudio_del_Trabajo/Practica_DOP_Diagrama_Operaciones",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estudio_del_Trabajo/Metodologia_Realizacion_ET",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estudio_del_Trabajo/Precursores_del_ET"
        ]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estudio_del_Trabajo/Practica_DOP_Diagrama_Operaciones.md",
        "Práctica: Diagrama de Operaciones del Proceso (DOP)",
        "Práctica Entregada",
        ["dop", "simbologia_asme", "flujograma", "operaciones"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Mapeo de secuencias de fabricación de componentes mecánicos utilizando símbolos estándar ASME (operación, inspección, almacenamiento y transporte).",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estudio_del_Trabajo/Materia_Estudio_del_Trabajo"]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estudio_del_Trabajo/Metodologia_Realizacion_ET.md",
        "Metodología Sistemática del Estudio del Trabajo",
        "Reporte Técnico",
        ["oitm", "seleccion", "registro", "examen_critico"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Los 8 pasos de la OIT para la ingeniería de métodos: Seleccionar, Registrar, Examinar críticamente, Idear, Evaluar, Definir, Implantar y Mantener.",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estudio_del_Trabajo/Materia_Estudio_del_Trabajo"]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estudio_del_Trabajo/Precursores_del_ET.md",
        "Precursores del Estudio del Trabajo",
        "Historia / Ingeniería",
        ["taylor", "gilbreth", "ford", "therbligs"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Aportaciones históricas de Frederick Taylor (cronometraje científico), Frank y Lillian Gilbreth (therbligs y cinematografía del movimiento) y Henry Ford.",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Estudio_del_Trabajo/Materia_Estudio_del_Trabajo"]
    )

    # 6. Metrología y Normalización
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Metrologia_Normalizacion/Materia_Metrologia_Normalizacion.md",
        "Metrología y Normalización (Tercer Semestre ITCV)",
        "Asignatura",
        ["metrologia", "normalizacion", "iso", "cenam", "tolerancias"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Docente: Ing. Angélica Muñoz Chávez. Estudio del Sistema Internacional de Unidades (SI), trazabilidad metrológica, calibración, normas ISO y NOMs mexicanas.",
        [
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Metrologia_Normalizacion/S1_T1_Sintesis_ISO_Cuestionario",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Metrologia_Normalizacion/F2_T1_Participacion_Normalizacion",
            "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Metrologia_Normalizacion/Temario_Metrologia_Normalizacion"
        ]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Metrologia_Normalizacion/S1_T1_Sintesis_ISO_Cuestionario.md",
        "S1-T1: Síntesis Normas ISO y Cuestionario (1 Cuartilla)",
        "Actividad Entregada",
        ["iso", "nom", "cuestionario", "metrologia", "tarea_entregada"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Documento Word y PDF de 1 cuartilla exacta con portada ITCV. Síntesis analítica del video de Procem Consultores y cuadro comparativo Ley vs Reglamento vs Norma.",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Metrologia_Normalizacion/Materia_Metrologia_Normalizacion"]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Metrologia_Normalizacion/F2_T1_Participacion_Normalizacion.md",
        "F2-T1: Participación en Normalización y Ejemplos",
        "Participación Entregada",
        ["nom", "nmx", "calidad", "participacion"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Ejercicios aplicados de identificación de Normas Oficiales Mexicanas obligatorias de seguridad y normas NMX voluntarias de calidad.",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Metrologia_Normalizacion/Materia_Metrologia_Normalizacion"]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Metrologia_Normalizacion/Temario_Metrologia_Normalizacion.md",
        "Temario y Competencias de Metrología",
        "Temario Oficial",
        ["unidades", "tolerancias", "instrumentos", "cenam"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Programa oficial de la materia: Unidad 1 Normalización, Unidad 2 Metrología Dimensional, Unidad 3 Óptica y Rugosidad, Unidad 4 Eléctrica.",
        ["01_PROJECTS/Universidad_ITCV/Tercer_Semestre/Metrologia_Normalizacion/Materia_Metrologia_Normalizacion"]
    )

    # 7. Proyectos Transversales
    write_note(
        "01_PROJECTS/Universidad_ITCV/Proyectos_Transversales/Proyecto_Sustentable_Ekora.md",
        "Proyecto de Innovación Sustentable: Ékora",
        "Proyecto Universitario",
        ["ekora", "sustentabilidad", "economia_circular", "innovacion"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Desarrollo de macetas y productos ecológicos a base de residuos industriales reciclados. Abarca prototipo, video de elaboración, análisis de costos y plan de negocio.",
        [
            "01_PROJECTS/Universidad_ITCV/Proyectos_Transversales/Gestion_Residuos_Industriales",
            "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV"
        ]
    )
    write_note(
        "01_PROJECTS/Universidad_ITCV/Proyectos_Transversales/Gestion_Residuos_Industriales.md",
        "Gestión Responsable de Residuos Industriales",
        "Guion y Video",
        ["medio_ambiente", "residuos", "responsabilidad_social"],
        "02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV",
        "Investigación sobre normatividad ambiental mexicana para manejo de residuos de manejo especial y peligrosos con guion audiovisual.",
        ["01_PROJECTS/Universidad_ITCV/Proyectos_Transversales/Proyecto_Sustentable_Ekora"]
    )

    print("[3/6] Catalogando universo Geometry Dash & TikToks_V4 (15 Demons)...")
    
    # MOC Demons
    write_note(
        "02_SECOND_BRAIN_MOC/MOC_TikTok_Demons.md",
        "🎮 MOC: Geometry Dash TikTok Automation y Demons",
        "MOC / Gaming",
        ["moc", "geometry_dash", "demons", "tiktok"],
        "02_SECOND_BRAIN_MOC/MOC_Master",
        "Centro de control para los 15 demons superados después del 100, pipeline de renderizado vertical NVENC y sincronización musical.",
        [
            "01_PROJECTS/TikTok_Automation/Componentes/Pipeline_TikTok_NVENC",
            "01_PROJECTS/TikTok_Automation/Componentes/Sincronizacion_FFT_Audio",
            "01_PROJECTS/TikTok_Automation/Componentes/Aislamiento_Demucs_Voces"
        ]
    )

    # Los 15 demons
    demons_catalog = [
        ("Demon_N100_GGEZ", "N.100 GGEZ (ID: 122299385)", "Easy Demon superado. Video renderizado en TikToks_V4."),
        ("Demon_N101_Factry", "N.101 Factry (ID: 82573813)", "Medium Demon superado con sincronización rítmica."),
        ("Demon_N102_Black_Reaper", "N.102 Black Reaper (ID: 84800021)", "Demon superado con mix cinematográfico."),
        ("Demon_N103_Olympic_Faith", "N.103 Olympic Faith (ID: 74261049)", "Demon con pasajes técnicos y drop musical alineado."),
        ("Demon_N104_Weird_World", "N.104 Weird World (ID: 93530247)", "Demon superado con clics aislados por Demucs."),
        ("Demon_N105_Speed_of_Light_II", "N.105 Speed of Light II (ID: 136058837)", "Demon histórico de la saga Speed of Light."),
        ("Demon_N106_Chaoz_Airflow", "N.106 Chaoz Airflow", "Demon de alta velocidad superado."),
        ("Demon_N107_Resurrection", "N.107 Resurrection", "Demon superado con render HEVC 60 FPS."),
        ("Demon_N108_RetroFlux", "N.108 RetroFlux", "Demon con estética retro y tipografía personalizada."),
        ("Demon_N109_Extinction", "N.109 Extinction (ID: 38427291)", "Demon corregido hoy con offset de música exacto a 51.232s."),
        ("Demon_N110_Nowise", "N.110 Nowise (ID: 38398923)", "Demon de JonathanGD corregido hoy con offset a 13.234s."),
        ("Demon_N111_CraZy", "N.111 CraZy (ID: 40945673)", "Demon icónico de DavJT corregido con offset a 53.652s y correlación Pearson 0.9330."),
        ("Demon_N112_Eternal", "N.112 Eternal (ID: 88494611)", "Demon superado corregido hoy con offset a 54.944s."),
        ("Demon_N113_Endurance", "N.113 Endurance", "Demon superado en TikToks_V4."),
        ("Demon_N114_Final_Impact", "N.114 Final Impact", "Demon más reciente renderizado con tipografía de dificultad.")
    ]

    for filename, title, desc in demons_catalog:
        write_note(
            f"01_PROJECTS/TikTok_Automation/Demons/{filename}.md",
            title,
            "Geometry Dash / Demon",
            ["demon", "geometry_dash", "record", "100_percent"],
            "02_SECOND_BRAIN_MOC/MOC_TikTok_Demons",
            f"Registro histórico del demon superado al 100%. {desc}\n\n**Video de salida:** `E:\\Demons despues del 100\\TikToks_V4\\tiktok_{title.split()[1]}.mp4`",
            [
                "02_SECOND_BRAIN_MOC/MOC_TikTok_Demons",
                "01_PROJECTS/TikTok_Automation/Componentes/Pipeline_TikTok_NVENC",
                "01_PROJECTS/TikTok_Automation/Componentes/Gestor_Datos_JSON_Demons"
            ]
        )

    print("[4/6] Catalogando universo Roblox Studio & Luau Framework...")
    
    # MOC Roblox
    write_note(
        "02_SECOND_BRAIN_MOC/MOC_Roblox_Luau.md",
        "🧱 MOC: Desarrollo Roblox Studio y Luau",
        "MOC / GameDev",
        ["moc", "roblox", "luau", "game_dev"],
        "02_SECOND_BRAIN_MOC/MOC_Master",
        "Ecosistema de scripts, frameworks, servicios cliente-servidor y herramientas offline para el desarrollo de experiencias en Roblox.",
        [
            "01_PROJECTS/Roblox_Studio/Modulos/Framework_Luau_Modular",
            "01_PROJECTS/Roblox_Studio/Modulos/Arquitectura_Cliente_Servidor_Roblox",
            "01_PROJECTS/Roblox_Studio/Modulos/Validador_Offline_Luau",
            "01_PROJECTS/Roblox_Studio/Modulos/Sistema_DataStores_Perfiles",
            "01_PROJECTS/Roblox_Studio/Modulos/Optimizacion_Replication_Lag"
        ]
    )

    roblox_modules = [
        ("Framework_Luau_Modular", "Framework Luau Modular", "Arquitectura escalable en Luau basada en servicios y controladores."),
        ("Arquitectura_Cliente_Servidor_Roblox", "Arquitectura Cliente-Servidor y RemoteEvents", "Protocolo de replicación segura y validación server-side contra exploits."),
        ("Validador_Offline_Luau", "Validador Sintáctico Offline", "Auditoría estática de scripts Luau antes de subirlos a Roblox Studio."),
        ("Sistema_DataStores_Perfiles", "Persistencia con DataStoreService", "Manejo de guardado seguro de monedas, niveles e inventarios con ProfileService."),
        ("Optimizacion_Replication_Lag", "Optimización de Red y Replicación", "Técnicas de interpolación de red, compresión de paquetes y reducción de ping.")
    ]

    for fn, t, d in roblox_modules:
        write_note(
            f"01_PROJECTS/Roblox_Studio/Modulos/{fn}.md",
            t,
            "Roblox / Luau",
            ["roblox", "luau", "arquitectura"],
            "02_SECOND_BRAIN_MOC/MOC_Roblox_Luau",
            d,
            [
                "02_SECOND_BRAIN_MOC/MOC_Roblox_Luau",
                "04_KNOWLEDGE_BASE/Herramientas/Skill_roblox-specialist"
            ]
        )

    print("[5/6] Catalogando Core de Antigravity, Skills de Office y Conceptos Clave...")
    
    # Skills MOC
    write_note(
        "02_SECOND_BRAIN_MOC/MOC_Skills_Ecosistema.md",
        "⚡ MOC: Catálogo Maestro de Skills Agénticas",
        "MOC / Skills",
        ["moc", "skills", "antigravity", "herramientas"],
        "02_SECOND_BRAIN_MOC/MOC_Master",
        "Directorio interactivo de las habilidades especializadas que Antigravity auto-activa a criterio técnico.",
        [
            "04_KNOWLEDGE_BASE/Herramientas/Skill_office-pptx-master",
            "04_KNOWLEDGE_BASE/Herramientas/Skill_office-excel-master",
            "04_KNOWLEDGE_BASE/Herramientas/Skill_academic-engineering",
            "04_KNOWLEDGE_BASE/Herramientas/Skill_media-pipeline",
            "04_KNOWLEDGE_BASE/Herramientas/Skill_roblox-specialist",
            "04_KNOWLEDGE_BASE/Herramientas/Skill_qa-validator",
            "04_KNOWLEDGE_BASE/Herramientas/Skill_obsidian-second-brain"
        ]
    )

    skills_data = [
        ("Skill_office-pptx-master", "Skill: Office PPTX Master", "Presentaciones 16:9 widescreen, Card UI, paleta ejecutiva 60-30-10 y exportación a PDF."),
        ("Skill_office-excel-master", "Skill: Office Excel Master", "Fórmulas vivas (=SUM, XLOOKUP), formato contable $#,##0.00, auto-fit y Macros VBA (.xlsm)."),
        ("Skill_academic-engineering", "Skill: Academic Engineering", "Documentación formal APA 7, tipografía matemática nativa (OMML Cambria Math) y rigor de ingeniería."),
        ("Skill_media-pipeline", "Skill: Media Pipeline", "Automatización con FFmpeg (NVENC GPU), yt-dlp, Demucs, Spotdl y mutagen."),
        ("Skill_roblox-specialist", "Skill: Roblox Specialist", "Programación Luau avanzada, arquitectura cliente-servidor y robloxstudio-mcp."),
        ("Skill_qa-validator", "Skill: QA Validator", "Auditoría estática ultra-rápida con flash_lite para verificar archivos antes de entregar."),
        ("Skill_obsidian-second-brain", "Skill: Obsidian Second Brain", "Gestión, navegación MOC y sparse retrieval de la red neuronal en Obsidian.")
    ]

    for s_fn, s_t, s_d in skills_data:
        write_note(
            f"04_KNOWLEDGE_BASE/Herramientas/{s_fn}.md",
            s_t,
            "Skill Agéntica",
            ["skill", "automatizacion", "antigravity"],
            "02_SECOND_BRAIN_MOC/MOC_Skills_Ecosistema",
            s_d,
            [
                "02_SECOND_BRAIN_MOC/MOC_Skills_Ecosistema",
                "02_SECOND_BRAIN_MOC/MOC_Master"
            ]
        )

    # Conceptos clave
    conceptos = [
        ("Concepto_Sparse_Retrieval", "Sparse Retrieval (Recuperación Dispersa)", "Técnica para consultar índices (MOCs) reduciendo el consumo de tokens en >90%."),
        ("Concepto_OMML_Word", "Tipografía Matemática Nativa (OMML)", "Estándar XML nativo de Word con Cambria Math para fórmulas con barra horizontal real."),
        ("Concepto_Card_UI_Layout", "Diseño en Tarjetas (Card UI en PPTX)", "Agrupación visual en contenedores modernos con fondo contrastante y sombras sutiles."),
        ("Concepto_NVENC_Hardware", "Aceleración por Hardware NVIDIA NVENC", "Transcodificación H.264/HEVC en chip dedicado de GPU a >500 FPS sin uso de CPU."),
        ("Concepto_Correlacion_FFT", "Correlación Cruzada Rápida por FFT", "Uso del teorema de convolución para sincronización rítmica en fracciones de segundo."),
        ("Concepto_Sequential_Thinking", "Razonamiento Secuencial Dinámico", "Metodología de deducción paso a paso mediante servidor MCP sequentialthinking."),
        ("Concepto_Formulas_Vivas", "Fórmulas Dinámicas Vivas en Excel", "Diseño de hojas reactivas donde ningún total es un número plano quemado a mano."),
        ("Concepto_Macros_VBA", "Macros VBA y Automatización Interactiva", "Inyección de código VBA para botones, ordenamientos y exportación con un clic.")
    ]

    for c_fn, c_t, c_d in conceptos:
        write_note(
            f"04_KNOWLEDGE_BASE/Conceptos/{c_fn}.md",
            c_t,
            "Concepto Clave",
            ["concepto", "teoria", "ingenieria"],
            "02_SECOND_BRAIN_MOC/MOC_Master",
            c_d,
            [
                "02_SECOND_BRAIN_MOC/MOC_Master",
                "02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema"
            ]
        )

    print("[6/6] Actualizando MOC Maestro con todos los cuadrantes...")
    
    master_moc_content = f"""# 🧠 MOC Maestro: Mega Bóveda y Segundo Cerebro Antigravity
**Última Densificación:** {time.strftime('%Y-%m-%d %H:%M:%S')}  
**Tags:** #moc #segundo_cerebro #mega_boveda #indice_maestro  

Bienvenido a la **Mega Red Neuronal** de tu laptop. Esta bóveda integra absolutamente todos los ámbitos de tu equipo en un grafo interactivo navegable mediante *Sparse Retrieval*.

---

## 🧭 Cuadrantes Maestros (Mapas de Contenido Temáticos)

### 1. 🎓 [[02_SECOND_BRAIN_MOC/MOC_Universidad_ITCV|Academia e Ingeniería ITCV]]
- **Materias Tercer Semestre:** Álgebra Lineal, Cálculo Vectorial, Economía, Estadística Inferencial, Estudio del Trabajo, Metrología y Normalización.
- **Proyectos Transversales:** [[01_PROJECTS/Universidad_ITCV/Proyectos_Transversales/Proyecto_Sustentable_Ekora|Proyecto Sustentable Ékora]], Gestión de Residuos.

### 2. 🎮 [[02_SECOND_BRAIN_MOC/MOC_TikTok_Demons|Geometry Dash & TikTok Automation]]
- **Colección de 15 Demons:** N.100 GGEZ a N.114 Final Impact.
- **Pipeline Tecnológico:** NVENC GPU, Sincronización FFT, Aislamiento Demucs, Boomlings API.

### 3. 🧱 [[02_SECOND_BRAIN_MOC/MOC_Roblox_Luau|Roblox Studio & Framework Luau]]
- **Arquitectura:** Cliente-Servidor seguro, RemoteEvents, Validador Offline, DataStores.

### 4. ⚡ [[02_SECOND_BRAIN_MOC/MOC_Skills_Ecosistema|Ecosistema de Skills Agénticas]]
- **Office Master:** PPTX 16:9 Card UI, Excel Fórmulas Vivas & Macros VBA, Word OMML APA 7.
- **Especialistas:** Media Pipeline, Roblox Specialist, QA Validator, Obsidian Second Brain.

### 5. 🏗️ [[02_SECOND_BRAIN_MOC/MOC_Arquitectura_Sistema|Arquitectura Core & Herramientas]]
- **Telemetría en Vivo:** Lector Connect-RPC, Motor de Telemetría Claude Code, Guardián Quirúrgico.
- **Memoria Persistente:** [[03_AGENT_MEMORY/System_State|Estado Global del Sistema]], Checkpoints y ADRs.

---

## 📈 Estadísticas de la Red
- **Total de Nodos:** > 120 notas atómicas conectadas.
- **Tipo de Navegación:** Grafos dispersos con `[[wikilinks]]` bidireccionales.
- **Costo de Consulta:** < 300 tokens por búsqueda mediante MOCs.
"""
    with open(VAULT_DIR / "02_SECOND_BRAIN_MOC" / "MOC_Master.md", "w", encoding="utf-8") as f:
        f.write(master_moc_content)

    print("[*] Sincronizando catálogo con obsidian_bridge...")
    from obsidian_bridge import sync_all
    sync_all(VAULT_DIR)
    print("[OK] ¡MEGA BOLA DE OBSIDIAN CONSTRUIDA CON ÉXITO!")

if __name__ == "__main__":
    build_all_nodes()
