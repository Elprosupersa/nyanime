@echo off
title AnimeOrganizerAI - Servidor Web
cd /d "%~dp0"
echo ===================================================
echo     Iniciando Servidor Web AnimeOrganizerAI
echo ===================================================
echo.
if exist "venv\Scripts\python.exe" (
    set "PYTHON_EXE=venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

echo Abriendo navegador en http://127.0.0.1:8000 ...
start "" http://127.0.0.1:8000

echo Iniciando backend...
"%PYTHON_EXE%" -m uvicorn src.api.server:app --host 0.0.0.0 --port 8000 --reload
pause
