@echo off
title AnimeOrganizerAI - Descargador Masivo Hentai
cd /d "%~dp0"
echo ========================================================
echo     AnimeOrganizerAI - Descarga Masiva Hentai (0%% BL)
echo ========================================================
echo.
if exist "venv\Scripts\python.exe" (
    set "PYTHON_EXE=venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

echo Carpeta destino: E:\Anime\04 - Hentai (Sin Censura)\
echo Iniciando proceso de descarga segun la cola guardada...
echo.
"%PYTHON_EXE%" tools/hentai_bulk_manager.py --start
pause
