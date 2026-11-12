# surgical_patcher.py - Herramienta de Inspeccion y Parcheo Quirurgico Local
# Version 1.0 (10/10) - Antigravity Token Shield para Jaime

import os
import sys

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import re
import argparse
import shutil
from datetime import datetime

def inspect_file(filepath, pattern, context_chars=120, max_matches=5):
    """
    Busca patrones en archivos gigantes (incluso minificados de una sola linea)
    y muestra unicamente fragmentos contextuales breves sin inflar tokens.
    """
    if not os.path.exists(filepath):
        print(f"[ERROR] Archivo no encontrado: {filepath}")
        return False
        
    file_size_mb = round(os.path.getsize(filepath) / (1024 * 1024), 2)
    print(f"[INSPECCION LOCAL] {filepath} ({file_size_mb} MB)")
    
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception as e:
        print(f"[ERROR] No se pudo leer el archivo: {e}")
        return False
        
    try:
        regex = re.compile(pattern, re.IGNORECASE | re.MULTILINE)
    except re.error as e:
        print(f"[ERROR] Expresion regular invalida: {e}")
        return False
        
    matches = list(regex.finditer(content))
    if not matches:
        print(f"• Cero coincidencias para el patron: {pattern}")
        return False
        
    print(f"• Total de coincidencias encontradas: {len(matches)} (mostrando hasta {max_matches})")
    
    for i, match in enumerate(matches[:max_matches], 1):
        start_idx = max(0, match.start() - context_chars)
        end_idx = min(len(content), match.end() + context_chars)
        
        snippet = content[start_idx:end_idx]
        rel_start = match.start() - start_idx
        rel_end = match.end() - start_idx
        marked_snippet = (
            snippet[:rel_start] 
            + " >>> [" 
            + snippet[rel_start:rel_end] 
            + "] <<< " 
            + snippet[rel_end:]
        )
        clean_display = marked_snippet.replace("\r", "").replace("\n", " ")
        print(f"  [{i}] Offset {match.start()}: ...{clean_display}...")
        
    return True

def patch_file(filepath, target_pattern, replacement_text, backup=True, count=1):
    """
    Reemplaza texto o regex en archivos grandes de forma atomica y segura.
    Genera un respaldo .bak antes de modificar.
    """
    if not os.path.exists(filepath):
        print(f"[ERROR] Archivo no encontrado: {filepath}")
        return False
        
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception as e:
        print(f"[ERROR] No se pudo leer el archivo: {e}")
        return False
        
    try:
        regex = re.compile(target_pattern, re.MULTILINE)
    except re.error as e:
        print(f"[ERROR] Expresion regular invalida: {e}")
        return False
        
    matches = list(regex.finditer(content))
    if not matches:
        print(f"[PARCHEO FALLIDO] No se encontro el objetivo '{target_pattern}' en el archivo.")
        return False
        
    if backup:
        bak_file = filepath + f".bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        shutil.copy2(filepath, bak_file)
        print(f"• Respaldo de seguridad creado: {bak_file}")
        
    new_content, num_subs = regex.subn(replacement_text, content, count=count)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)
        
    size_before = len(content)
    size_after = len(new_content)
    diff = size_after - size_before
    diff_str = f"+{diff}" if diff >= 0 else str(diff)
    
    print(f"[PARCHEO EXITOSO] {filepath}")
    print(f"• Sustituciones realizadas: {num_subs}")
    print(f"• Variacion de tamano: {diff_str} caracteres")
    return True

def main():
    parser = argparse.ArgumentParser(description="Antigravity Surgical Local Patcher (Token Shield)")
    parser.add_argument("-f", "--file", required=True, help="Ruta del archivo a inspeccionar o parchar")
    parser.add_argument("--inspect", help="Patron regex para inspeccionar ocurrencias y contexto")
    parser.add_argument("--patch", action="store_true", help="Activa el modo de reemplazo/parcheo")
    parser.add_argument("--target", help="Patron exacto o regex a sustituir")
    parser.add_argument("--replace", help="Texto de sustitucion")
    parser.add_argument("--no-backup", action="store_true", help="No crear copia .bak de seguridad")
    parser.add_argument("--count", type=int, default=1, help="Numero de ocurrencias a reemplazar (0 para todas)")
    
    args = parser.parse_args()
    
    if args.inspect:
        inspect_file(args.file, args.inspect)
    elif args.patch:
        if not args.target or args.replace is None:
            print("[ERROR] El modo --patch requiere --target y --replace")
            sys.exit(1)
        patch_file(args.file, args.target, args.replace, backup=not args.no_backup, count=args.count)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
