#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/generate_office_excellence_demo.py
Genera una suite de prueba de alta fidelidad para demostrar la calidad 10/10:
1. Excel Ejecutivo (.xlsx) con fórmulas vivas, formatos contables, auto-fit y freeze panes.
2. Presentación PowerPoint (.pptx + .pdf) 16:9, Card UI, paleta corporativa y cero colisiones.
"""

import os
import sys
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

OUTPUT_DIR = Path(r"c:\Users\gonza\OneDrive\Escritorio\Antigravity escritorio general\test_office_output")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def generate_excel_demo():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Resumen Financiero 2026"
    ws.views.sheetView[0].showGridLines = True

    # Paleta de colores ejecutiva
    NAVY_HEADER = "0F172A"
    WHITE = "FFFFFF"
    ZEBRA_ROW = "F8FAFC"
    BORDER_COLOR = "E2E8F0"
    GREEN_ACCENT = "10B981"
    
    font_title = Font(name="Calibri", size=16, bold=True, color="0F172A")
    font_header = Font(name="Calibri", size=11, bold=True, color=WHITE)
    font_data = Font(name="Calibri", size=11)
    font_total = Font(name="Calibri", size=11, bold=True, color="0F172A")

    fill_header = PatternFill(start_color=NAVY_HEADER, end_color=NAVY_HEADER, fill_type="solid")
    fill_zebra = PatternFill(start_color=ZEBRA_ROW, end_color=ZEBRA_ROW, fill_type="solid")
    fill_total = PatternFill(start_color="EDF2F7", end_color="EDF2F7", fill_type="solid")

    thin_border = Border(
        left=Side(style='thin', color=BORDER_COLOR),
        right=Side(style='thin', color=BORDER_COLOR),
        top=Side(style='thin', color=BORDER_COLOR),
        bottom=Side(style='thin', color=BORDER_COLOR)
    )
    total_border = Border(
        top=Side(style='thin', color="0F172A"),
        bottom=Side(style='double', color="0F172A")
    )

    # Título del reporte
    ws["A1"] = "ESTADO CONSOLIDADO DE RENDIMIENTO Y AUTOMATIZACIÓN"
    ws["A1"].font = font_title
    ws["A2"] = "Cifras auditadas en USD con fórmulas dinámicas en tiempo real"
    ws["A2"].font = Font(name="Calibri", size=10, italic=True, color="64748B")

    # Encabezados
    headers = ["ID Línea", "Departamento / Proyecto", "Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026", "Total Anual", "Margen %"]
    for col_num, h in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col_num, value=h)
        cell.font = font_header
        cell.fill = fill_header
        cell.alignment = Alignment(horizontal="center" if col_num in [1, 8] else "left", vertical="center")

    # Datos
    rows_data = [
        ("PRJ-101", "Automatización GD TikToks (NVENC)", 45000, 52000, 61000, 74000, 0.38),
        ("PRJ-102", "Desarrollo Luau Roblox Studio", 32000, 39000, 48000, 56000, 0.42),
        ("PRJ-103", "Tratados Académicos & OMML Word", 28000, 31000, 35000, 41000, 0.31),
        ("PRJ-104", "Infraestructura Obsidian Brain", 18000, 22000, 27000, 33000, 0.45),
        ("PRJ-105", "Optimización de Tokens & Telemetría", 15000, 19000, 24000, 30000, 0.50),
    ]

    for row_idx, data in enumerate(rows_data, start=5):
        ws.cell(row=row_idx, column=1, value=data[0]).alignment = Alignment(horizontal="center")
        ws.cell(row=row_idx, column=2, value=data[1])
        
        # Trimestres
        for q_idx in range(4):
            c = ws.cell(row=row_idx, column=3 + q_idx, value=data[2 + q_idx])
            c.number_format = "$#,##0.00"
            c.alignment = Alignment(horizontal="right")

        # FÓRMULA VIVA: Total Anual = SUM(Q1:Q4)
        total_cell = ws.cell(row=row_idx, column=7, value=f"=SUM(C{row_idx}:F{row_idx})")
        total_cell.number_format = "$#,##0.00"
        total_cell.alignment = Alignment(horizontal="right")

        # Margen
        m_cell = ws.cell(row=row_idx, column=8, value=data[6])
        m_cell.number_format = "0.0%"
        m_cell.alignment = Alignment(horizontal="center")

        # Bordes y zebra
        for c_idx in range(1, 9):
            cell = ws.cell(row=row_idx, column=c_idx)
            cell.font = font_data
            cell.border = thin_border
            if row_idx % 2 == 0:
                cell.fill = fill_zebra

    # Fila de Totales
    total_row_idx = 5 + len(rows_data)
    ws.cell(row=total_row_idx, column=1, value="TOTAL").alignment = Alignment(horizontal="center")
    ws.cell(row=total_row_idx, column=2, value="Consolidado General")
    for col_idx in range(3, 8):
        col_letter = get_column_letter(col_idx)
        c = ws.cell(row=total_row_idx, column=col_idx, value=f"=SUM({col_letter}5:{col_letter}{total_row_idx-1})")
        c.number_format = "$#,##0.00"
        c.alignment = Alignment(horizontal="right")

    # Margen promedio ponderado
    avg_m_cell = ws.cell(row=total_row_idx, column=8, value=f"=AVERAGE(H5:H{total_row_idx-1})")
    avg_m_cell.number_format = "0.0%"
    avg_m_cell.alignment = Alignment(horizontal="center")

    for c_idx in range(1, 9):
        cell = ws.cell(row=total_row_idx, column=c_idx)
        cell.font = font_total
        cell.fill = fill_total
        cell.border = total_border

    # Inmovilizar paneles en fila 5
    ws.freeze_panes = "A5"

    # Auto-Ajuste inteligente de anchos de columna
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val_str = str(cell.value or "")
            if len(val_str) > max_len:
                max_len = len(val_str)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    excel_path = OUTPUT_DIR / "demo_excel_ejecutivo.xlsx"
    wb.save(excel_path)
    print(f"[OK] Excel Ejecutivo generado: {excel_path} ({excel_path.stat().st_size} bytes)")
    return excel_path

def generate_pptx_demo():
    prs = Presentation()
    # 16:9 Widescreen obligatorio
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # Paleta de colores ejecutiva
    BG_DARK = RGBColor(15, 23, 42)       # Slate 900
    BG_CARD = RGBColor(248, 250, 252)    # Slate 50
    TEXT_DARK = RGBColor(15, 23, 42)
    TEXT_MUTED = RGBColor(100, 116, 139) # Slate 500
    ACCENT_INDIGO = RGBColor(99, 102, 241)# Indigo 500
    ACCENT_EMERALD = RGBColor(16, 185, 129)# Emerald 500
    WHITE = RGBColor(255, 255, 255)

    # -------------------------------------------------------------
    # SLIDE 1: Portada Ejecutiva de Alto Impacto
    # -------------------------------------------------------------
    slide1 = prs.slides.add_slide(blank_layout)
    bg1 = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    bg1.fill.solid()
    bg1.fill.fore_color.rgb = BG_DARK
    bg1.line.fill.background()

    # Badge superior
    badge = slide1.shapes.add_textbox(Inches(1.2), Inches(1.8), Inches(4), Inches(0.5))
    p_badge = badge.text_frame.paragraphs[0]
    p_badge.text = "ESTÁNDAR AGÉNTICO ANTIGRAVITY 2026"
    p_badge.font.name = "Montserrat"
    p_badge.font.size = Pt(11)
    p_badge.font.bold = True
    p_badge.font.color.rgb = ACCENT_INDIGO

    # Título
    tb_title = slide1.shapes.add_textbox(Inches(1.2), Inches(2.3), Inches(11), Inches(2.0))
    p_title = tb_title.text_frame.paragraphs[0]
    p_title.text = "Arquitectura de Documentos\nde Alta Fidelidad"
    p_title.font.name = "Montserrat"
    p_title.font.size = Pt(44)
    p_title.font.bold = True
    p_title.font.color.rgb = WHITE

    # Subtítulo
    tb_sub = slide1.shapes.add_textbox(Inches(1.2), Inches(4.5), Inches(10), Inches(1.0))
    p_sub = tb_sub.text_frame.paragraphs[0]
    p_sub.text = "Demostración de generación sin 'AI Slop': Widescreen 16:9, Card UI, Fórmulas Vivas y Cero Colisiones."
    p_sub.font.name = "Segoe UI"
    p_sub.font.size = Pt(18)
    p_sub.font.color.rgb = RGBColor(203, 213, 225)

    # -------------------------------------------------------------
    # SLIDE 2: Card UI Layout con Métricas KPI
    # -------------------------------------------------------------
    slide2 = prs.slides.add_slide(blank_layout)
    bg2 = slide2.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    bg2.fill.solid()
    bg2.fill.fore_color.rgb = WHITE
    bg2.line.fill.background()

    # Header de la diapositiva
    h2 = slide2.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.3), Inches(1.0))
    p_h2 = h2.text_frame.paragraphs[0]
    p_h2.text = "Los Tres Pilares de Excelencia Visual"
    p_h2.font.name = "Montserrat"
    p_h2.font.size = Pt(28)
    p_h2.font.bold = True
    p_h2.font.color.rgb = TEXT_DARK

    cards = [
        ("PowerPoint (.pptx)", "+500 FPS", "Maquetación matemática en 16:9, Card UI y tipografía corporativa que jamás se desborda."),
        ("Excel (.xlsx / .xlsm)", "100% Vivas", "Fórmulas nativas (=SUM, XLOOKUP), formato contable real, auto-fit sin '###' y macros VBA."),
        ("Word (.docx / .pdf)", "OMML Real", "Matemáticas en Cambria Math nativo, formato APA 7 y exportación vectorial a PDF sin distorsión.")
    ]

    card_width = Inches(3.5)
    card_height = Inches(4.5)
    start_left = Inches(1.0)
    gap = Inches(0.4)
    top_pos = Inches(2.0)

    for i, (title, kpi, desc) in enumerate(cards):
        left_pos = start_left + i * (card_width + gap)
        # Contenedor de tarjeta
        card_box = slide2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left_pos, top_pos, card_width, card_height)
        card_box.fill.solid()
        card_box.fill.fore_color.rgb = BG_CARD
        card_box.line.color.rgb = RGBColor(226, 232, 240)
        card_box.line.width = Pt(1.5)

        # Contenido de la tarjeta
        tb_c = slide2.shapes.add_textbox(left_pos + Inches(0.3), top_pos + Inches(0.4), card_width - Inches(0.6), card_height - Inches(0.8))
        tf = tb_c.text_frame
        tf.word_wrap = True

        p1 = tf.paragraphs[0]
        p1.text = title
        p1.font.name = "Montserrat"
        p1.font.size = Pt(16)
        p1.font.bold = True
        p1.font.color.rgb = TEXT_DARK
        p1.space_after = Pt(14)

        p2 = tf.add_paragraph()
        p2.text = kpi
        p2.font.name = "Montserrat"
        p2.font.size = Pt(36)
        p2.font.bold = True
        p2.font.color.rgb = ACCENT_INDIGO
        p2.space_after = Pt(14)

        p3 = tf.add_paragraph()
        p3.text = desc
        p3.font.name = "Segoe UI"
        p3.font.size = Pt(13)
        p3.font.color.rgb = TEXT_MUTED

    pptx_path = OUTPUT_DIR / "demo_presentacion_ejecutiva.pptx"
    prs.save(pptx_path)
    print(f"[OK] PowerPoint Widescreen generado: {pptx_path} ({pptx_path.stat().st_size} bytes)")

    # Intentar exportar a PDF con PowerPoint COM
    pdf_path = OUTPUT_DIR / "demo_presentacion_ejecutiva.pdf"
    try:
        import win32com.client
        import pythoncom
        pythoncom.CoInitialize()
        powerpoint = win32com.client.Dispatch("PowerPoint.Application")
        deck = powerpoint.Presentations.Open(str(pptx_path), WithWindow=False)
        deck.SaveAs(str(pdf_path), 32) # 32 = ppSaveAsPDF
        deck.Close()
        powerpoint.Quit()
        print(f"[OK] PDF Vectorial de Presentación generado: {pdf_path} ({pdf_path.stat().st_size} bytes)")
    except Exception as e:
        print(f"[!] Nota sobre exportación COM de PowerPoint: {e}")

    return pptx_path

if __name__ == "__main__":
    generate_excel_demo()
    generate_pptx_demo()
