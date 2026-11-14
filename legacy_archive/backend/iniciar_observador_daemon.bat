@echo off
title AnimeOrganizerAI - Observador Automatico
cd /d "%~dp0"
echo ===================================================
echo     Iniciando Observador Automatico (Watcher)
echo     Carpeta monitorizada: Escritorio\Para_Organizar
echo ===================================================
echo.
if exist "venv\Scripts\python.exe" (
    set "PYTHON_EXE=venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

"%PYTHON_EXE%" src\main.py
pause
