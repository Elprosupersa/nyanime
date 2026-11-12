# REGISTRO HISTÓRICO DE VERSIONES - ANIME HUB CINEMA (APK)

Este registro almacena cada versión compilada, su APK universal, código fuente respaldado y capturas de pantalla de verificación para garantizar la trazabilidad total y permitir la reversión inmediata a cualquier estado previo si algún cambio visual no es de tu agrado.

---

## 📌 Versión 2.3.0 (Deep Cinema Navigation & Persistent Shell) - 2026-11-08 21:12
* **Ubicación del APK de Respaldo:** [`build_versions/v2.3.0_deep_cinema/AnimeHub_Celular_v2.3.0.apk`](file:///E:/Respaldos/Organizador_Anime/build_versions/v2.3.0_deep_cinema/AnimeHub_Celular_v2.3.0.apk) (35.8 MB)
* **Código Fuente Respaldado:** [`build_versions/v2.3.0_deep_cinema/source/`](file:///E:/Respaldos/Organizador_Anime/build_versions/v2.3.0_deep_cinema/source/)
* **Novedades y Mejoras Implementadas tras Auditoría Visual:**
  - **Navegación Persistente por Pestañas (`IndexedStack`):** La barra inferior (`BottomNavigationBar`) permanece siempre visible. Cambiar entre la biblioteca nativa y el reproductor Cinema Web es instantáneo y retiene el estado de scroll sin destruir el árbol de widgets.
  - **Deep Linking Exacto a Series y Capítulos:**
    - Botón *"VER SERIE EN MODO CINEMA"* ahora abre directamente la vista cinemática de la serie seleccionada (`#series/<nombre>`).
    - Cada episodio de la lista cuenta con un botón directo `▶ Play` que abre el reproductor Cinema Web en el episodio exacto solicitado (`#watch/<serie>?s=<temporada>&ep=<capítulo>`).
  - **Filtro de Géneros Dinámico y Real:** Reemplazo de categorías vacías por géneros reales de la colección (`Todos`, `Romance`, `Ecchi`, `Comedia`, `Fantasía`, `Acción`, `Drama`, `Slice of Life`), con mapeo bilingüe y filtrado instantáneo.
  - **Erradicación de Trampas de Navegación (`PopScope`):** Pulsar el botón atrás en Android ahora regresa a la pestaña Biblioteca o limpia la búsqueda en vez de cerrar intempestivamente la aplicación.
  - **AppBar Contextual Dinámico:** El título y los botones de acción del AppBar se adaptan automáticamente a la pestaña activa (refrescar biblioteca o recargar webview).

---

## 📌 Versión 2.2.0 (Cinema Pro - Detalle Cinemático & Text Cleaner) - 2026-11-08 20:50
* **Ubicación del APK de Respaldo:** [`build_versions/v2.2.0_cinema_pro/AnimeHub_Celular_v2.2.0.apk`](file:///E:/Respaldos/Organizador_Anime/build_versions/v2.2.0_cinema_pro/AnimeHub_Celular_v2.2.0.apk) (37.58 MB)
* **Código Fuente Respaldado:** [`build_versions/v2.2.0_cinema_pro/source/`](file:///E:/Respaldos/Organizador_Anime/build_versions/v2.2.0_cinema_pro/source/)
* **Novedades y Mejoras Visuales:**
  - **SliverAppBar Cinemático:** Cabecera con Backdrop dinámico a pantalla completa y degradado lineal hacia el tema Dark Cinema (`#0A0D14`).
  - **Limpieza de Entidades HTML:** Motor `TextUtils` que elimina `&mdash;`, `&quot;`, `&#39;`, `&amp;` y tags de la sinopsis para lectura 100% natural.
  - **Píldoras de Géneros Dinámicas:** Chips de géneros con fondo translúcido (`#1E2638`).
  - **Botón de Acción Hero:** Botón de ancho completo "VER SERIE EN MODO CINEMA" con sombra y feedback táctil.
  - **Lista de Capítulos Estilizada:** Tarjetas individuales para cada episodio con indicador de calidad (1080p BD Master), tamaño en MB y botón circular de reproducción.
  - **Revisión Anti-AI-Slop:** Cero artefactos genéricos, espaciados consistentes y paleta de colores de alta fidelidad.

---

## 📌 Versión 2.1.0 (Línea Base Estable) - 2026-11-08 20:36
* **Ubicación del APK de Respaldo:** [`build_versions/v2.1.0_baseline/AnimeHub_Celular_v2.1.0.apk`](file:///E:/Respaldos/Organizador_Anime/build_versions/v2.1.0_baseline/AnimeHub_Celular_v2.1.0.apk) (37.3 MB)
* **Código Fuente Respaldado:** [`build_versions/v2.1.0_baseline/source/`](file:///E:/Respaldos/Organizador_Anime/build_versions/v2.1.0_baseline/source/)
* **Características Clave:**
  - Arquitectura Multi-ABI Universal (`android-arm64` + `android-x64`).
  - Motor de renderizado Impeller OpenGLES a 60 FPS.
  - Conexión dinámica con backend FastAPI (`http://10.0.2.2:8000` / `http://192.168.1.72:8000`).
  - Biblioteca nativa en tema Dark Cinema (`#0A0D14`) con Hero card, chips de categorías y buscador.
  - Modo híbrido Cinema Web Streaming con reproductor HTML5 *seekable* (HTTP Range).
  - Selector de Host interactivo en el AppBar.

---

## 🔄 Cómo Revertir a una Versión Anterior en 1 Paso:
Para restaurar cualquiera de estas versiones en caso de desearlo:
```powershell
# Ejemplo para volver a v2.2.0:
Copy-Item "build_versions\v2.2.0_cinema_pro\AnimeHub_Celular_v2.2.0.apk" "src\api\static\AnimeHub_Celular.apk" -Force
Copy-Item "build_versions\v2.2.0_cinema_pro\AnimeHub_Celular_v2.2.0.apk" "src\api\static\AnimeOrganizer.apk" -Force
```
Y para reinstalar en el emulador:
```powershell
& "C:\Users\gonza\AppData\Local\Android\Sdk\platform-tools\adb.exe" -s emulator-5554 install -r "src\api\static\AnimeHub_Celular.apk"
```
