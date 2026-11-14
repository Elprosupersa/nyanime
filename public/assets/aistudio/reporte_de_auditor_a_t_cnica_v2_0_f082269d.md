# 🔍 Auditoría Punto por Punto y Plan de Mejora: NyAnime TV (Web / PWA + Firebase v13)

## 1. Opinión General sobre el Nuevo Reporte

Este nuevo documento (`REPORTE_COMPLETO_APP_NYANIME.md`) es **por fin una radiografía 100% honesta y transparente** del código real que tienes en tu repositorio. Dejó atrás la confusión de reportes viejos y destapó la realidad técnica del proyecto:

* **Lo muy positivo:** Tienes una **PWA en Vite 5.4 + TypeScript + Firebase v13** con una interfaz *Red & Black OLED* muy completa (10 pantallas y 11 modales), reglas de seguridad `firestore.rules` de nivel profesional (validadas con ESLint y esquema estricto), proxy integrado para saltar bloqueos CORS/Referer de MangaDex/InManga y un motor de resiliencia de imágenes de 5 niveles muy bien pensado.
* **Lo alarmante (El "Efecto Escaparate"):** El propio reporte confiesa que **5 funciones clave están simuladas (mockeadas) o rotas**, que existen **vulnerabilidades críticas de seguridad (SSRF y XSS)** si despliegas esto en un servidor público, y que **el sincronizador de Firebase resucita datos borrados**.

---

## 2. Análisis Punto por Punto del Reporte

### Punto 1: Estructura del Repositorio y Coexistencia de 3 Proyectos
* **Diagnóstico:** En el mismo repositorio conviven la Web/PWA principal (`/`), una app en Flutter (`/frontend` apuntando a una IP local fija `192.168.1.72:8000`) y un daemon en Python (`/backend`). Además, `index.html` concentra **10,598 líneas (~479 KB)**.
* **Qué falta mejorar:**
  1. `tsc --noEmit` solo revisa `src/firebase.ts` y `src/pwa.ts`, dejando **~7,400 líneas de JavaScript dentro de `index.html` completamente a ciegas** ante errores de tipos o variables indefinidas.
  2. El peso de `index.html` obligó a subir el límite de caché de Workbox a **5 MB** (`maximumFileSizeToCacheInBytes`), lo cual ralentiza la primera carga e instalación de la PWA en redes móviles.

### Punto 2: Infraestructura Web, Proxy Server y PWA
* **Diagnóstico:** El plugin `nyanimeServerProxyPlugin` en `vite.config.js` resuelve de forma inteligente las cabeceras `Referer` y `User-Agent` para MangaDex, MangaPill e InManga.
* **Qué falta mejorar (Crítico):**
  1. **Vulnerabilidad SSRF (Server-Side Request Forgery):** `/api/proxy?url=` y `/api/img-proxy?url=` aceptan cualquier URL del mundo sin filtro. Un atacante puede usar tu servidor como proxy abierto para atacar terceros o leer metadatos internos de la nube (`http://169.254.169.254` o `http://127.0.0.1`).
  2. **Dependencia de `vite preview` en producción:** `vite preview` es una herramienta de prueba local, no un servidor de producción. Necesitas un servidor ligero dedicado (`server.ts` con Express o Node HTTP nativo + compresión + Rate Limiting + Allowlist de dominios).

### Punto 3 y 4: Diseño UI/UX, 10 Pantallas y 11 Modales
* **Diagnóstico:** El diseño *Red & Black OLED*, el calendario de emisión con reloj en vivo y cuenta regresiva, y la ficha de manga estilo Mihon están muy bien logrados a nivel visual.
* **Qué falta mejorar (Engaños al Usuario / Mocks detectados):**
  1. **Pestaña "🧩 Extensiones Keiyoushi" muerta (404):** Llama a `fetch('keiyoushi_sources.json')`, pero el archivo no existe en `/public/`. La vista queda vacía.
  2. **Descargas Offline Falsas (Anime y Manga):** En Manga, `iniciarDescargaCapitulos` es literalmente un `setTimeout(..., 1500)` que lanza un aviso falso de "¡Descarga completada!" sin guardar ni una sola imagen en `IndexedDB` ni `CacheStorage`. Si el usuario activa el modo avión, no tiene nada descargado. En Anime ocurre lo mismo: solo guarda el link web en `localStorage`.
  3. **Importador de MyAnimeList / AniList Mentiroso:** Ignora por completo a MyAnimeList y, si falla o la lista está vacía, **mete a escondidas 5 animes al azar del caché de simulcasts** y dice *"✅ Lista sincronizada con éxito"*. Eso destruye la confianza del usuario.
  4. **Perfil "Jaime" Hardcodeado y Códigos VIP expuestos:** Todo usuario nuevo aparece llamándose `"Jaime"` con `42 episodios vistos (1050 min)` y rol `VIP`. Además, los códigos VIP (`LESTER10`, `JAIME`, `NYAPASS`) están visibles en texto plano en el código cliente y no se guardan en Firestore.
  5. **Comentarios Ficticios:** `CommentsManager` inventa comentarios falsos de usuarios inexistentes (`GojoFan`, `AnimeOtaku99`) y solo guarda en `localStorage`.

### Punto 5: Motores de Proveedores, APIs y Scraping
* **Diagnóstico:** Excelente uso de `ani.zip` para mapear IDs de AniList a TMDB/IMDB y muy buen pipeline de 5 niveles para recuperar imágenes caídas en el lector de manga.
* **Qué falta mejorar:**
  1. **Bloqueo global de `window.open = () => null` (Línea 3075):** Lo pusieron para evitar popups de publicidad de los iframes de video (`MultiEmbed`, `VidSrc`), pero **sobrescribir `window.open` globalmente rompe los popups legítimos como `signInWithPopup` de Firebase Google Auth** en muchos navegadores. La forma correcta de bloquear anuncios en iframes de video es usar el atributo nativo `<iframe sandbox="allow-scripts allow-same-origin allow-forms">` sin destruir `window.open` ni `Node.prototype.removeChild` en toda la app.
  2. **Conflicto de `<meta name="referrer" content="no-referrer">`:** Tener esta etiqueta global en el `<head>` de `index.html` boicotea a los reproductores embebidos que exigen verificar el dominio de origen. Debe manejarse por elemento (`referrerpolicy` individual), no globalmente.

### Punto 6 y 7: Firebase Auth, Firestore y Deuda de Sincronización
* **Diagnóstico:** El esquema de 7 entidades en Firestore y las reglas `firestore.rules` están muy bien blindados.
* **Qué falta mejorar:**
  1. **Bug de "Borrados Zombi" en Firestore:** Cuando el usuario limpia su historial o desmarca capítulos leídos, se borran en `localStorage`, pero al ejecutarse `FirebaseSyncBridge` hace una unión `new Set([...local, ...cloud])` y **la nube vuelve a revivir todo lo que el usuario acaba de borrar**.
  2. **Sincronización incompleta de ajustes del lector:** `readerBg` y `readerWidth` están declarados en `firestore.rules`, pero `syncSettingsBidirectional()` en `src/firebase.ts` olvidó incluirlos.
  3. **Vulnerabilidad XSS (Cross-Site Scripting):** Se inyectan títulos, comentarios y nombres de usuario mediante `innerHTML` sin sanitizar. Si alguien escribe `<img src=x onerror="...">` en su nombre o comentario, ejecuta código malicioso.

---

## 3. ¿Qué más falta agregar para que sea una App Nivel Top?

Además de corregir los 15 puntos del reporte, te recomiendo incluir en esta iteración **4 mejoras de alto impacto**:

1. **Descargas Offline Reales en `IndexedDB` / `CacheStorage` con Lector Offline:** Que cuando el usuario descargue un capítulo de manga, se descarguen los blobs de las imágenes en un caché dedicado (`nyanime-offline-manga-v1`), permitiendo leer en modo avión real con barra de progreso verdadera.
2. **Integración Real con Jikan API v4 para MyAnimeList:** Para que el importador de MAL funcione de verdad consultando `https://api.jikan.moe/v4/users/{username}/animelist` además de AniList GraphQL.
3. **Sistema de Comentarios en Tiempo Real en Firestore:** Añadir la colección `/episode_comments/{commentId}` en Firestore para que los usuarios autenticados comenten episodios reales en comunidad (con moderación y sanitización anti-XSS).
4. **Auto-Next y Historial con Segundo Exacto / Página Exacta:** Guardar la página exacta y porcentaje del scroll en manga, y ofrecer paso automático al siguiente capítulo al llegar al final de la tira Webtoon.

En el archivo adjunto `PROMPT_MAESTRO_NYANIME_V2.md` tienes el prompt completo y estructurado para que tu agente ejecute absolutamente todas estas correcciones de principio a fin.