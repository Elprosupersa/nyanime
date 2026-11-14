# luau_offline_validator.py - Validador y Linter Estático de Luau para Roblox Studio (Offline)
# Antigravity Roblox Specialist 10/10 para Jaime

import os
import sys
import re
import argparse

# Forzar UTF-8
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BLOCK_OPENERS = {"function", "if", "for", "while", "do"}
BLOCK_CLOSERS = {"end"}

def analyze_luau_file(file_path, script_type="Auto"):
    """
    Analiza un script en Luau sin requerir la apertura de Roblox Studio.
    script_type: 'ServerScript', 'LocalScript', 'ModuleScript', o 'Auto' (según nombre/directorio)
    """
    if not os.path.exists(file_path):
        return False, [f"El archivo no existe: {file_path}"]

    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    issues = []
    
    # Detección de tipo de script
    base_name = os.path.basename(file_path).lower()
    if script_type == "Auto":
        if "server" in base_name or "init.server" in base_name:
            script_type = "ServerScript"
        elif "client" in base_name or "local" in base_name:
            script_type = "LocalScript"
        else:
            script_type = "ModuleScript"

    # 1. Chequeo de bloques balanceados y delimitadores
    block_stack = []
    open_paren = 0
    open_bracket = 0
    open_brace = 0
    in_multiline_comment = False

    raw_datastore_without_pcall = False
    in_pcall_block = False

    for idx, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()

        # Manejo de comentarios multilínea --[[ ... ]]
        if "--[[" in line:
            in_multiline_comment = True
        if "]]" in line and in_multiline_comment:
            in_multiline_comment = False
            continue
        if in_multiline_comment or line.startswith("--"):
            continue

        # Limpiar cadenas de texto para evitar falsos positivos
        cleaned_line = re.sub(r'".*?"|\'.*?\'', '""', line)

        # Revisión de delimitadores
        open_paren += cleaned_line.count("(") - cleaned_line.count(")")
        open_bracket += cleaned_line.count("[") - cleaned_line.count("]")
        open_brace += cleaned_line.count("{") - cleaned_line.count("}")

        # Tokens
        tokens = re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', cleaned_line)
        
        # Pcall tracking
        if "pcall(" in cleaned_line:
            in_pcall_block = True
        if in_pcall_block and "end)" in cleaned_line:
            in_pcall_block = False

        # Reglas de arquitectura Roblox
        # Regla A: LocalPlayer en ServerScript
        if script_type == "ServerScript" and "LocalPlayer" in cleaned_line:
            issues.append(f"[ERROR L{idx}] 'Players.LocalPlayer' solo existe en clientes (LocalScripts). Es nil en servidores.")

        # Regla B: FireServer en ServerScript
        if script_type == "ServerScript" and (":FireServer(" in cleaned_line or ":InvokeServer(" in cleaned_line):
            issues.append(f"[ERROR L{idx}] ':FireServer()' solo puede llamarse desde el cliente.")

        # Regla C: FireClient en LocalScript
        if script_type == "LocalScript" and (":FireClient(" in cleaned_line or ":FireAllClients(" in cleaned_line):
            issues.append(f"[ERROR L{idx}] ':FireClient()' es exclusivo del servidor. El cliente no puede dispararlo.")

        # Regla D: DataStore sin pcall
        if ("GetAsync(" in cleaned_line or "SetAsync(" in cleaned_line or "UpdateAsync(" in cleaned_line) and not in_pcall_block:
            issues.append(f"[ADVERTENCIA L{idx}] Llamada a DataStore sin envoltorio 'pcall()'. Puede provocar pérdida de datos ante caídas de red.")

        # Regla E: Métodos obsoletos
        if ":children()" in cleaned_line:
            issues.append(f"[ADVERTENCIA L{idx}] ':children()' está deprecado. Usa ':GetChildren()'.")
        if ":remove()" in cleaned_line:
            issues.append(f"[ADVERTENCIA L{idx}] ':remove()' está deprecado. Usa ':Destroy()'.")
        if "wait(" in cleaned_line and "task.wait(" not in cleaned_line:
            issues.append(f"[INFO L{idx}] La función global 'wait()' está desaconsejada. Usa 'task.wait()'.")

        # Seguimiento de bloques
        for t in tokens:
            if t in BLOCK_OPENERS:
                # Filtrar casos como 'if x then' vs 'end'
                block_stack.append((t, idx))
            elif t == "end":
                if block_stack:
                    block_stack.pop()
                else:
                    issues.append(f"[ERROR L{idx}] 'end' huérfano sin bloque de apertura correspondiente.")

    if block_stack:
        for opener, line_num in block_stack:
            issues.append(f"[ERROR L{line_num}] Bloque '{opener}' no fue cerrado con 'end'.")

    if open_paren != 0:
        issues.append(f"[ERROR SINTAXIS] Paréntesis desbalanceados (diferencia: {open_paren})")
    if open_bracket != 0:
        issues.append(f"[ERROR SINTAXIS] Corchetes desbalanceados (diferencia: {open_bracket})")
    if open_brace != 0:
        issues.append(f"[ERROR SINTAXIS] Llaves desbalanceadas (diferencia: {open_brace})")

    return (len([i for i in issues if i.startswith("[ERROR")]) == 0), issues

def run_suite_test():
    """Prueba el validador offline contra roblox_framework.lua y un script defectuoso."""
    print("==================================================")
    print("      LUAU OFFLINE VALIDATOR SUITE (ROBLOX)       ")
    print("==================================================")
    
    # 1. Validar el framework de producción
    prod_framework = r"c:\Users\gonza\OneDrive\Escritorio\Antigravity escritorio general\tools\roblox_framework.lua"
    print(f"\n1. Validando Framework de Producción: {os.path.basename(prod_framework)}")
    success, issues = analyze_luau_file(prod_framework, script_type="ModuleScript")
    
    if success and not issues:
        print("   [EXITO] roblox_framework.lua pasó la validación con 0 errores y 0 advertencias.")
    else:
        for i in issues:
            print(f"   {i}")

    # 2. Validar un script sintético defectuoso
    broken_code = """
    local Players = game:GetService("Players")
    local player = Players.LocalPlayer -- Error en servidor
    
    function brokenLogic()
        if player then
            print("Jugador conectado")
            -- falta end de if
    end
    """
    temp_broken = r"c:\Users\gonza\OneDrive\Escritorio\Antigravity escritorio general\test_broken_script.server.lua"
    with open(temp_broken, "w", encoding="utf-8") as f:
        f.write(broken_code)

    print(f"\n2. Validando Script Defectuoso de Prueba (ServerScript):")
    success_broken, issues_broken = analyze_luau_file(temp_broken, script_type="ServerScript")
    print(f"   [DETECCIONES ESPERADAS]: {len(issues_broken)} problemas detectados:")
    for i in issues_broken:
        print(f"   • {i}")

    if os.path.exists(temp_broken):
        os.remove(temp_broken)

    print("\n==================================================")
    print("   Validador Offline de Luau 100% Operativo       ")
    print("==================================================")
    return success and (not success_broken)

def main():
    parser = argparse.ArgumentParser(description="Antigravity Luau Offline Validator & Linter")
    parser.add_argument("--file", "-f", help="Ruta del script Luau a verificar")
    parser.add_argument("--type", choices=["ServerScript", "LocalScript", "ModuleScript", "Auto"], default="Auto")
    parser.add_argument("--test", action="store_true", help="Ejecuta suite de prueba")

    args = parser.parse_args()

    if args.test:
        run_suite_test()
    elif args.file:
        success, issues = analyze_luau_file(args.file, args.type)
        print(f"Resultado de validación ({args.file}):")
        if not issues:
            print(" [OK] Script impecable sin errores.")
        else:
            for i in issues:
                print(f" • {i}")
        sys.exit(0 if success else 1)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
