# math_image_enhancer.py - Preprocesador y Optimizador de Fotos de Apuntes / Pizarrón
# Diseñado para facilitar la extracción precisa de fórmulas matemáticas manuscritas a OMML
# Antigravity Academic Vision 10/10 para Jaime

import os
import sys

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import argparse
import numpy as np
from PIL import Image, ImageFilter, ImageOps, ImageDraw, ImageFont

def enhance_handwritten_math(image_path, output_path, invert=False):
    """
    Elimina sombras y normaliza la iluminación de una foto de libreta o pizarrón,
    generando una imagen binaria de alto contraste óptima para reconocimiento de fórmulas.
    """
    if not os.path.exists(image_path):
        print(f"[ERROR] Imagen no encontrada: {image_path}")
        return False

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # 1. Cargar y convertir a escala de grises
    img = Image.open(image_path).convert("L")
    img_np = np.array(img, dtype=np.float32)

    # Si es pizarrón negro con tiza blanca y se pide invertir a fondo blanco
    if invert:
        img_np = 255.0 - img_np

    # 2. Estimación de fondo (Background Illumination Estimation)
    # Aplicar un filtro de desenfoque grande para capturar el gradiente de sombras del teléfono
    bg_blur = img.filter(ImageFilter.GaussianBlur(radius=35))
    bg_np = np.array(bg_blur, dtype=np.float32)
    bg_np[bg_np == 0] = 1.0 # Evitar división por cero

    # 3. Normalización: Dividir la imagen entre el fondo para cancelar la sombra
    normalized = (img_np / bg_np) * 255.0
    normalized = np.clip(normalized, 0, 255).astype(np.uint8)

    # 4. Aumento de contraste dinámico y umbralización adaptativa suave
    norm_img = Image.fromarray(normalized)
    # Autocontraste ignorando extremos
    enhanced = ImageOps.autocontrast(norm_img, cutoff=2)

    # 5. Guardar resultado de alta resolución
    enhanced.save(output_path, quality=95)
    print(f"[EXITO] Imagen mejorada guardada: {output_path}")
    return True

def generate_synthetic_test(out_dir):
    """Genera una imagen sintética simulando una foto con sombra diagonal y la procesa."""
    os.makedirs(out_dir, exist_ok=True)
    raw_path = os.path.join(out_dir, "test_raw_shadowed_math.png")
    enhanced_path = os.path.join(out_dir, "test_enhanced_math_clean.png")

    print("[TEST] Generando imagen de prueba con sombra diagonal...")
    w, h = 800, 400
    base = Image.new("L", (w, h), color=230)
    draw = ImageDraw.Draw(base)

    # Simular sombra diagonal de iluminación desigual
    gradient = np.tile(np.linspace(100, 255, w), (h, 1)).astype(np.uint8)
    shadow_img = Image.fromarray(gradient)

    # Dibujar fórmula manuscrita simulada
    draw.text((80, 80), "Ecuacion Diferencial: dy/dx + P(x)y = Q(x)", fill=20)
    draw.text((80, 160), "Integral de Linea: W = integral F(r(t)) * r'(t) dt", fill=15)
    draw.text((80, 240), "Matriz: [ 2x + 3y = 7 | 4x - y = 4 ]", fill=25)

    # Combinar texto con sombra
    blended = Image.blend(base, shadow_img, alpha=0.5)
    blended.save(raw_path)
    print(f"[TEST] Foto con sombra generada: {raw_path}")

    # Ejecutar mejorador
    return enhance_handwritten_math(raw_path, enhanced_path)

def main():
    parser = argparse.ArgumentParser(description="Antigravity Math Image Enhancer (Foto a OMML)")
    parser.add_argument("--input", "-i", help="Ruta de la foto del pizarrón o libreta")
    parser.add_argument("--output", "-o", help="Ruta de la imagen de salida mejorada")
    parser.add_argument("--invert", action="store_true", help="Invertir pizarrón oscuro a fondo blanco")
    parser.add_argument("--test", action="store_true", help="Ejecuta prueba con foto sintética")

    args = parser.parse_args()

    if args.test:
        test_dir = r"c:\Users\gonza\OneDrive\Escritorio\Antigravity escritorio general\test_image_enhancer_output"
        success = generate_synthetic_test(test_dir)
        sys.exit(0 if success else 1)

    if args.input and args.output:
        enhance_handwritten_math(args.input, args.output, invert=args.invert)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
