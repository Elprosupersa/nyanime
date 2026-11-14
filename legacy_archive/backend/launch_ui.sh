#!/bin/bash
# Asegurarse de que los servicios están corriendo
systemctl --user start animegui.service
systemctl --user start animedownloader.timer

# Esperar 2 segundos por si apenas se levantó
sleep 2

# Abrir en el navegador predeterminado
xdg-open http://127.0.0.1:8000
