# Reporte Técnico y Funcional Completo — NyAnime TV

> **Propósito de este documento:** Referencia técnica canónica, verificada y actualizada del proyecto **NyAnime TV** (Fases 1, 1.5, 1.6, 1.7, 2, 2.5 y 3 Final completadas). Cubre la arquitectura modular Vite + TypeScript + CSS OLED (9 módulos), el backend proxy anti-SSRF con `LruTtlCache` y compatibilidad Cloud Run / Preview, el motor de streaming de Anime HD multi-servidor sin anuncios, descargas reales `.MP4` por bloques de 4 MB, Watch Together 100% privado en tiempo real con Firebase Firestore, Web Push VAPID, OAuth Scrobbling con AniList y MyAnimeList, lector avanzado de Manga/Manhwa/Manhua, guardias de concurrencia/accesibilidad y la suite automatizada de **28 archivos / 190 pruebas**.

---

## 1. Resumen Ejecutivo y Topología del Repositorio

**NyAnime TV** es una aplicación web progresiva (PWA) full-stack construida con **Vite 5.4, TypeScript Vanilla, CSS OLED modular y un servidor HTTP Node.js (`server.ts`)**, diseñada para ofrecer máximo rendimiento en móvil y escritorio sin sobrecarga de frameworks SPA pesados.

| Ruta | Tipo | Stack Principal | Estado |
| :--- | :--- | :--- | :--- |
| **`/` (Raíz + `src/`)** | **Aplicación Principal (Web + PWA + Backend Proxy/OAuth/Push)** | Vite 5.4, TypeScript, CSS OLED modular (`src/styles/*.css`, 9 módulos), `hls.js`, Firebase v13 (Auth, Firestore, FCM), `web-push`, `vite-plugin-pwa` | **Producción (Fase 3 Final verificada).** Puerto `3000`, build con `npm run build`, servidor `node server.ts`, **28 suites / 190 tests** Vitest (`npm test`), `tsc --noEmit && eslint firestore.rules` con **0 errores**. |
| **`/legacy_archive/`** | Archivo histórico | Subproyectos heredados de etapas anteriores | **Archivado** para referencia histórica; fuera del bundle activo. |

### Topología Actual del Proyecto
```text
/
├── index.html                        # Shell HTML semántico de la SPA + navegación inferior fija + #ny-modals-root
├── server.ts                         # Servidor HTTP Node.js producción (gzip, MIME estricto, SPA fallback, proxies anti-SSRF, OAuth, Push)
├── vite.config.js                    # Config Vite + middleware proxy dev/preview unificado (nyanimeServerProxyPlugin) + Workbox PWA (NetworkFirst)
├── package.json                      # Scripts dev/build/preview/start/test/lint + dependencias runtime y de pruebas
├── tsconfig.json                     # Configuración TypeScript estricta sobre src/ y server.ts
├── metadata.json                     # Metadatos de la aplicación ("NyAnime TV")
├── .env.example                      # Plantilla pública de variables de entorno (OAuth AniList/MAL, VAPID, APP_URL; sin secretos)
├── .gitignore                        # Incluye .aistudio/, .playwright-cli/, dist/, dev-dist/ y archivos sensibles
├── firebase-applet-config.json       # Configuración pública de Firebase (proyecto + Database ID)
├── firebase-blueprint.json           # Esquema formal JSON de las 14 entidades / rutas en Firestore
├── firestore.rules                   # Reglas de seguridad Firestore (default-deny, RBAC, validación estricta de esquemas)
├── firestore.indexes.json            # Índices compuestos de Firestore
├── eslint.config.mjs                 # ESLint con @firebase/eslint-plugin-security-rules
├── public/
│   ├── keiyoushi_sources.json        # Catálogo de fuentes externas Keiyoushi / Mihon
│   ├── sw-push.js                    # Service Worker auxiliar para notificaciones Web Push
│   ├── firebase-messaging-sw.js      # Service Worker de Firebase Cloud Messaging (FCM)
│   └── icon.svg, apple-touch-icon.png, pwa-*.png
└── src/
    ├── main.ts                       # Punto de entrada: inicialización de módulos, estilos, eventos y puente global
    ├── firebase.ts                   # Auth (Google + Email/Password), Sync Firestore con tombstones, Comentarios, Watch Together y FCM
    ├── pwa.ts                        # Ciclo de vida PWA, instalación, guardia anti-recarga y suscripción Web Push / FCM
    ├── styles/                       # Sistema de diseño Red & Black OLED modular (~6,229 líneas en cascada determinista)
    │   ├── main.css                  # Punto de entrada con orden exacto de importación (10 líneas)
    │   ├── tokens.css                # Variables de color OLED (#050507, #e11d48, #ff4d6d), radios y sombras
    │   ├── base.css                  # Reset, tipografía, overflow-x: clip, :focus-visible, skeletons OLED y .ny-state-card
    │   ├── layout.css                # Topbar, navegación inferior con safe-area insets y grillas responsivas
    │   ├── home-schedule.css         # Hero Spotlight, carruseles, filtros y calendario semanal de emisión
    │   ├── detail.css                # Ficha de anime estilo Crunchyroll, temporadas, lista de episodios y colecciones
    │   ├── player.css                # Reproductor nativo/embed, barra móvil simétrica, AniSkip, comentarios y Watch Together
    │   ├── manga.css                 # Catálogo multi-fuente, ficha Mihon y lector Webtoon/Página/Doble
    │   ├── profile.css               # Perfil, rango Otaku, métricas, Mis Salas privadas y sub-pestañas
    │   └── modals.css                # Modales OLED, Gestor de Descargas, Descargar Episodios y bloqueo body.ny-modal-open
    ├── server/
    │   └── featureRoutes.ts          # Rutas backend de OAuth 2.0 / PKCE (AniList y MAL), Scrobbling y Web Push VAPID (con purga 404/410)
    ├── ui/                           # 10 módulos de interfaz y estado en TypeScript
    │   ├── appState.ts               # Estado global, stores con protección de cuota, snapshot de descargas y navegación segura
    │   ├── homeView.ts               # Inicio: Hero Spotlight, Continuar Viendo, filtros, búsqueda, Favoritos y guardias de petición
    │   ├── scheduleView.ts           # Calendario semanal de simulcasts, reloj en vivo, skeletons y manejo resiliente de errores
    │   ├── animeDetailView.ts        # Ficha de anime: temporadas cronológicas, AniZip, biblioteca, listas y descarga por lotes .MP4
    │   ├── playerView.ts             # Reproductor multi-servidor, MP4/HLS nativo same-origin, Mega sandbox, AniSkip, atajos y Watch Together
    │   ├── mangaCatalogView.ts       # Catálogo multi-fuente (AniList, MangaDex, ManhwaWeb, InManga, MangaPill, Keiyoushi) con escape XSS
    │   ├── mangaDetailView.ts        # Ficha estilo Mihon: pestañas estrictas por idioma, selector de fuente, descarga offline y sanitización
    │   ├── mangaReaderView.ts        # Lector Webtoon / Página Única / Doble Página / RTL-LTR, atajos con cleanup y revocación de blobs
    │   ├── profileView.ts            # Perfil, rango Otaku, métricas reales, Mis Salas Watch Together (Propietario) y botón Atrás seguro
    │   └── modals.ts                 # Modales centralizados, Escape/backdrop, MutationObserver scroll-lock y guardia de modales críticos
    ├── services/                     # 4 servicios de dominio
    │   ├── offline.ts                # Motor offline IndexedDB + CacheStorage + Chunked Range Downloader .MP4 (4 MB) + cuota segura
    │   ├── importers.ts              # Importador de listas públicas AniList (GraphQL) y MyAnimeList (Jikan)
    │   ├── comments.ts               # Comentarios comunitarios por episodio en Firestore con anti-spoilers, guardias y escape XSS
    │   └── keiyoushi.ts              # Gestor del catálogo de extensiones Keiyoushi
    ├── utils/                        # 21 módulos puros desacoplados (unit-tested)
    │   ├── animeSources.ts           # Parsers multi-proveedor, P.A.C.K.E.R., separación Sub/Latino, filtro Mega/Archive muertos y ranking
    │   ├── aniskip.ts                # Integración AniSkip para detección y salto de Opening / Ending
    │   ├── avatarHelpers.ts          # Procesamiento, recorte y compresión de avatares personalizados
    │   ├── directoryFilters.ts       # Filtrado avanzado de catálogo por género, estado, temporada y ordenamiento
    │   ├── downloadHelpers.ts        # Nombres seguros, estimación de tamaño, descarga por bloques y exportación .MP4
    │   ├── libraryEnhancements.ts    # Estados de biblioteca, calificaciones, reseñas, colecciones y recomendaciones
    │   ├── mangaLanguage.ts          # Normalización ISO y aislamiento estricto por idioma (ES/EN/PT-BR/JA/KO)
    │   ├── mangaReaderHelpers.ts     # Helpers de paginación, spread doble, dirección RTL/LTR y filtros visuales
    │   ├── playerResume.ts           # Reanudación (5%–92%), umbral de completado (90%), formateo de tiempo y Up Next
    │   ├── profileReset.ts           # Lógica pura de limpieza total de perfil y llaves locales/nube
    │   ├── profileStats.ts           # Cálculo de tiempo real visto, episodios únicos, distribución de géneros y rango Otaku
    │   ├── proxySecurity.ts          # Anti-SSRF, allowlist, LruTtlCache, cap Range 4 MB, Referer por salto, CORS y rate limiter
    │   ├── pushNotifications.ts      # Helpers de suscripción Web Push VAPID / FCM y formato de alertas/resumen semanal
    │   ├── pwaReloadGuard.ts         # Guardia contra bucles de recarga del Service Worker
    │   ├── sanitize.ts               # escapeHTML, validación segura de URLs, acrónimos, tiempo relativo e iconos SVG
    │   ├── scrobble.ts               # Lógica de sincronización bilateral con AniList y MyAnimeList
    │   ├── seasonOrder.ts            # Agrupación cronológica de franquicias y conteo real de episodios emitidos
    │   ├── storageQuota.ts           # Escritura segura en localStorage con recuperación ante QuotaExceededError
    │   ├── syncLogic.ts              # Fusión de estado y tombstones anti-zombies para Cloud Firestore
    │   ├── uiPolishHelpers.ts        # Guardias de petición (AbortController), disciplina de modales, atajos de teclado y tarjetas de estado
    │   └── watchTogether.ts          # Códigos de sala, hashing de contraseña/token de invitación, enlaces privados y sincronización
    └── __tests__/                    # Suite Vitest: 28 archivos / 190 pruebas aprobadas
```

---

## 2. Stack Tecnológico y Scripts

| Capa | Tecnología | Detalles |
| :--- | :--- | :--- |
| **Frontend** | TypeScript (`^7.0.2`), Vite (`^5.4.10`), CSS OLED modular | Arquitectura modular vanilla sin virtual DOM; 9 hojas CSS especializadas |
| **Streaming** | HTML5 `<video>`, `hls.js` (`^1.7.4`), Iframe Sandbox | Reproducción nativa MP4/HLS `same-origin` sin anuncios y embebidos protegidos |
| **Servidor** | Node.js HTTP nativo (`server.ts`) | Compresión gzip, MIME exacto, SPA fallback desde `dist/`, apagado limpio (`SIGTERM`/`SIGINT`), puerto `3000` |
| **Nube y Tiempo Real** | Firebase (`^13.3.0`) | Auth (Google + Email/Password), Cloud Firestore y Firebase Cloud Messaging |
| **Notificaciones** | `web-push` (`^4.0.0`) | Canal primario Web Push VAPID con purga automática `404`/`410` (FCM legacy deprecado y documentado) |
| **PWA y Offline** | `vite-plugin-pwa` (`^2.0.0`), Workbox (`NetworkFirst`), IndexedDB, CacheStorage | Instalación `standalone`, `devOptions.enabled: false`, caché de manga y descarga `.MP4` por bloques de 4 MB |
| **Pruebas y Lint** | `vitest` (`^2.1.8`), `fake-indexeddb`, `tsc`, `eslint` (`^10.14.0`) + `@firebase/eslint-plugin-security-rules` | Verificación integral de lógica, contratos de fase, tipos y reglas de seguridad |

### Scripts (`package.json`)
* **`npm run dev`**: Inicia Vite en `0.0.0.0:3000` con el middleware completo de proxies, OAuth y Push (sin `dev-dist/`).
* **`npm run build`**: Compila los artefactos de producción en `dist/` y genera el Service Worker PWA sin precachear `index.html`.
* **`npm start`**: Ejecuta `node server.ts` en el puerto `3000` sirviendo `dist/`.
* **`npm test`**: Ejecuta la suite completa de Vitest (**28 archivos / 190 pruebas**).
* **`npm run lint`**: Ejecuta `tsc --noEmit && eslint firestore.rules`.

---

## 3. Infraestructura Backend, Proxies Seguros y Blindaje de Producción

Tanto `server.ts` (producción) como `vite.config.js` (`nyanimeServerProxyPlugin` en desarrollo/preview) comparten las protecciones definidas en `src/server/featureRoutes.ts` y `src/utils/proxySecurity.ts`.

### 3.1 Controles de Seguridad, Memoria y Compatibilidad Cloud Run / Preview
* **Protección Anti-SSRF (`validateProxyTargetUrl`)**: Lista blanca estricta de dominios permitidos y bloqueo de redes privadas/locales (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `169.254.169.254`, `localhost`, IPv6 `::1`/`fe80::`/`fc00::`, credenciales embebidas y protocolos no HTTP/HTTPS).
* **Validación de redirecciones por salto**: Máximo `3` redirecciones manuales validadas contra la allowlist en cada salto, ajustando `Referer`/`Origin` con `buildRedirectHopHeaders`.
* **Caché acotada (`LruTtlCache`) y límites de lectura**: Tope de `250` entradas / `32 MB` totales / TTL de `5 minutos`, lectura por stream con corte inmediato (`413`) al superar `MAX_API_PROXY_BYTES` o `MAX_IMG_PROXY_BYTES`, y cancelación segura de peticiones upstream al desconectarse el cliente (`bindClientDisconnectAbort`).
* **CORS estricto por Origen y Rate Limiter**: Validación de origen en `/api/*`, `Access-Control-Allow-Credentials: true`, límite de **600 peticiones/minuto por IP**.
* **Compatibilidad con proxy de Preview (`ais-pre-*.run.app`)**:
  * Eliminación del atributo `crossorigin` en `/assets/*` (plugin Vite) y en `<video>` same-origin para enviar cookies de sesión sin bloqueos CORS.
  * Uso consistente de `credentials: 'same-origin'` en todos los `fetch('/api/*')` y `xhr.withCredentials = true` en `hls.js`.
  * Límite inteligente de cabecera `Range` a **4 MB** (`capStreamingRangeHeader`) para evitar cortes por el tope de 32 MB en Cloud Run durante reproducción continua, con soporte para bloques exactos en descargas `.MP4`.
* **Entrega confiable de estáticos y PWA**:
  * `server.ts` sirve `dist/index.html` con `Cache-Control: no-cache`, assets inmutables con MIME exacto (`text/css; charset=utf-8`, `application/javascript; charset=utf-8`) y `404` real para assets faltantes (evitando devolver HTML ante un `.js`/`.css` ausente).
  * `vite-plugin-pwa` configurado con `devOptions: { enabled: false }`, exclusión de `index.html` del precache estático y estrategia `NetworkFirst` para navegaciones HTML.

### 3.2 Endpoints del Servidor

| Categoría | Endpoint | Descripción |
| :--- | :--- | :--- |
| **Proxies** | `GET/POST /api/proxy?url=...` | Proxy HTML/API con cabeceras sanitizadas (`Referer`, `Origin`, `Content-Type`, `X-Requested-With`), `LruTtlCache` y `probe=1` |
| | `GET /api/img-proxy?url=...` | Proxy de portadas y páginas de manga con `Referer` dinámico, tope de bytes y caché inmutable de 7 días |
| | `GET/HEAD /api/video-proxy?url=...` | Streaming de video MP4/WebM/HLS con `Range 206` (cap 4 MB en streaming), reescritura de `.m3u8` (incluyendo segmentos camuflados) y descarga adjunta sanitizada (`download=1`) |
| **OAuth y Scrobble** | `GET /api/auth/providers/status` | Indica si AniList y MyAnimeList tienen credenciales configuradas en el servidor |
| | `GET /api/auth/anilist/url` y `/callback` | Flujo OAuth 2.0 mediante popup con `postMessage` para AniList |
| | `POST /api/auth/anilist/scrobble` | Actualiza progreso de episodios, estado y calificación en AniList |
| | `GET /api/auth/mal/url` y `/callback` | Flujo OAuth 2.0 con **PKCE** para MyAnimeList |
| | `POST /api/auth/mal/refresh` y `/scrobble` | Renovación de tokens OAuth y envío de progreso a MyAnimeList |
| **Web Push** | `GET /api/push/vapid-public-key` | Retorna (o autogenera) la clave pública VAPID |
| | `POST /api/push/subscribe` y `/unsubscribe` | Registra o elimina suscripciones Web Push VAPID |
| | `POST /api/push/test` | Dispara una notificación de prueba inmediata con purga automática de endpoints expirados (`404`/`410`) |
| | `POST /api/push/check-airing` | Comprueba nuevos episodios emitidos para los animes favoritos del usuario |
| | `POST /api/push/send-weekly-summary` | Envía notificación con el resumen semanal de actividad |

---

## 4. Motor de Anime, Reproductor y Resolución de Fuentes

### 4.1 Organización de Franquicias y Ficha (`src/ui/animeDetailView.ts`, `src/utils/seasonOrder.ts`)
* Agrupación cronológica de temporadas, películas y OVAs/especiales estilo Crunchyroll a partir del grafo de relaciones de AniList.
* Cálculo real de episodios emitidos (`computeAvailableEpisodes`) para series en emisión (`RELEASING`).
* Metadatos de episodios (títulos y miniaturas) cargados de forma asíncrona desde `api.ani.zip` con guardias anti-carrera (`animeDetailGuard`, `aniZipRequestGuard`), paginación en rangos de 50 episodios y marcado masivo de vistos.
* Gestión de **5 estados de biblioteca** (`watching`, `plan_to_watch`, `completed`, `on_hold`, `dropped`), colecciones personalizadas, calificación `1–10`, reseñas y notas privadas.

### 4.2 Agregador Multi-Proveedor, Separación de Audio y Streaming Nativo (`src/ui/playerView.ts`, `src/utils/animeSources.ts`)
* **Proveedores en paralelo**: *AnimeAV1*, *TíoAnime*, *TVAnime*, *JKAnime*, *HenaoJara*, *HentaiLA*, *HentaiJK*, *Internet Archive*, con respaldo automático en *VidSrc* y *MultiEmbed*.
* **Separación estricta de idioma**: Clasificación limpia entre **Sub Español** y **Audio Latino**, evitando que fuentes latinas (como variantes de *TíoAnime*) contaminen la pestaña *Sub Español*.
* **Filtrado y priorización inteligente**:
  * Prioriza servidores directos nativos sin anuncios (*MP4Upload*, *YourUpload*, *StreamWish*, *Dotanborito*, *JKPlayer*) en `<video>` / `hls.js` con credenciales `same-origin`.
  * Filtra automáticamente enlaces muertos de *Mega* y copias *Archive.org RAW* sin subtítulos para evitar cargas fallidas.
  * Normaliza URLs válidas de *Mega* a `mega.nz/embed/<id>#<key>` dentro de un `<iframe>` con sandbox estricto (`allow-scripts allow-same-origin allow-forms`, sin `allow-popups` ni `allow-top-navigation`).
  * Detección de estancamiento y salto inmediato al siguiente servidor operativo.

### 4.3 Funcionalidades del Reproductor y Atajos de Teclado
* **AniSkip (`src/utils/aniskip.ts`)**: Detección automática de Opening/Ending con guardia de petición (`aniSkipRequestGuard`), botón `+85s` y **Auto-Salto**.
* **Reanudación y seguimiento real (`playerResume.ts`, `profileStats.ts`)**: Reanuda entre 5% y 92%, marca como visto al superar 90%, contabiliza segundos reales reproducidos y persiste en `timeupdate`, `pause`, `pagehide` y `beforeunload`.
* **Atajos de teclado con limpieza automática (`attachPlayerKeyboardShortcuts` / `detachPlayerKeyboardShortcuts`)**:
  * `Espacio` / `K` (reproducir/pausar), `J` / `←` (-10s), `L` / `→` (+10s), `Shift+←` / `Shift+→` (episodio anterior/siguiente), `F` (pantalla completa), `M` (silenciar) y `S` (saltar intro AniSkip).
  * Bloqueados automáticamente al escribir en campos de texto o con un modal abierto, y desregistrados con `removeEventListener` al cerrar el reproductor.
* **Controles y diseño móvil**: Picture-in-Picture (PiP), **MediaSession API**, modo cine, overlay *"A continuación"*, barra de navegación móvil en cuadrícula simétrica de 2 filas (`Anterior · Episodio · Siguiente` y `Marcar Visto`), reproducción de episodios `.MP4` offline y comentarios con filtro anti-spoilers.

---

## 5. Watch Together 100% Privado en Tiempo Real

Implementado con **Cloud Firestore** (`src/firebase.ts`, `src/ui/playerView.ts`, `src/ui/profileView.ts`, `src/utils/watchTogether.ts`):

* **Privacidad estricta**: Sin listados públicos de salas ajenas en Inicio; el acceso es exclusivo por **enlace de invitación** (`?room=<CODIGO>&k=<TOKEN>`) o **contraseña del creador** (`passcodeHash` / `inviteTokenHash`).
* **Sincronización en tiempo real**: Anime, episodio, marca de tiempo, estado `play/pause`, participantes y chat en vivo.
* **Gestión de salas del propietario en Perfil**: Tarjeta **"🔒 Mis Salas Watch Together (Propietario)"** con estado vacío OLED estilizado, acceso directo para continuar, copiar invitación o cerrar/eliminar definitivamente la sala.

---

## 6. Motor de Manga/Manhwa/Manhua y Lector Avanzado

* **Catálogo multi-fuente (`src/ui/mangaCatalogView.ts`)**: *AniList*, *MangaDex*, *ManhwaWeb*, *InManga*, *MangaPill*, *SpanishWebtoon* y extensiones *Keiyoushi / Mihon*, con guardia contra carreras (`mangaCatalogGuard`), skeletons OLED y sanitización XSS en el gestor de fuentes.
* **Aislamiento estricto por idioma (`src/utils/mangaLanguage.ts`)**: Buckets separados (`es`, `en`, `pt-br`, `ja`, `ko`) preservando capítulos `0`, con sanitización de fondos CSS y argumentos de capítulos en `mangaDetailView.ts`.
* **Lector avanzado (`src/ui/mangaReaderView.ts`, `src/utils/mangaReaderHelpers.ts`)**:
  * Modos **Webtoon/Vertical**, **Página Única**, **Doble Página (Spread)** y dirección **RTL / LTR**.
  * Atajos de teclado con ciclo de vida limpio (`attachReaderKeyboardNavigation` / `detachReaderKeyboardNavigation`): flechas adaptadas al modo activo, `H` (alternar HUD) y `Escape` (cerrar panel o alternar HUD).
  * Guardia de capítulo (`readerChapterGuard`) que descarta respuestas obsoletas y revoca URLs `blob:` offline anteriores para evitar fugas de memoria.
  * Filtros nocturnos (brillo, contraste, sepia), precarga del siguiente capítulo y descarga por lotes offline cancelable.

---

## 7. Descargas Reales `.MP4`, Almacenamiento Offline, Perfil y UX de Fase 3

### 7.1 Motor de Descargas `.MP4` por Bloques de 4 MB (`src/services/offline.ts`, `src/utils/downloadHelpers.ts`)
* **Chunked Range Downloader**: Descarga secuencial mediante peticiones `Range: bytes=start-end` en bloques de **4 MB** con `credentials: 'same-origin'` y hasta **2 reintentos por bloque**, superando el límite de respuesta de 32 MB de Cloud Run/Preview y guardando archivos `.MP4` reales en `IndexedDB` + `CacheStorage`.
* **Protección de almacenamiento**: Verificación de cuota disponible antes de iniciar descargas, solicitud de persistencia (`navigator.storage.persist()`) y manejo seguro de `QuotaExceededError`.
* **Modal "Descargar Episodios" rediseñado**: Selección rápida (*Todos*, *Ninguno*, *Sin ver*, *No descargados*), filtro por número y rango (*Del Ep. X al Y*), estimación de peso en tiempo real, elección de destino (*Guardar en la app*, *Guardar archivo .MP4* o *Ambos*), audio y preferencia de video. Si se cierra mientras hay una descarga activa, se **minimiza sin abortar el lote**.
* **Modal "Gestor de Descargas" rediseñado**: Indicador visual de espacio offline por categoría (*Animes .MP4*, *Mangas*, *Libre*), pestañas (*Todos*, *En curso*, *Animes Offline .MP4*, *Mangas Offline*), búsqueda, reproducción offline directa y exportación `.MP4`.

### 7.2 Disciplina de Modales, Navegación y Perfil (`src/ui/modals.ts`, `src/ui/profileView.ts`, `src/utils/uiPolishHelpers.ts`)
* **Bloqueo de scroll y accesibilidad**: `MutationObserver` sincroniza `body.ny-modal-open` automáticamente; objetivos táctiles `>= 44px` en móvil; `:focus-visible` OLED consistente y soporte `env(safe-area-inset-*)`.
* **Guardia de modales críticos (`resolveModalDismissBehavior`)**:
  * Modales normales cierran con `Escape` y clic en backdrop.
  * `#modal-wipe-profile` (`role="alertdialog"`, limpieza de perfil en 3 pasos) **no se cierra** con `Escape`, clic fuera, gestos táctiles ni el botón Atrás de Android.
* **Navegación segura**: Cambio entre pestañas principales (`Inicio`, `Emisión`, `Mangas`, `Buscar`, `Perfil`) únicamente por los botones de la barra inferior (sin swipe accidental).
* **Estados unificados y anti-carrera**: Guardias `createRequestGuard()` en todas las vistas asíncronas, eliminando spinners infinitos ante fallos de red (ej. Calendario de Emisión) y unificando skeletons y tarjetas de error con botón **Reintentar**.

---

## 8. Base de Datos Cloud Firestore y Reglas de Seguridad

* **Database ID**: `ai-studio-nyanime-0f24758c-5be4-4dbf-84a0-c5812235d1cd`.
* **Política raíz (`firestore.rules`)**: Denegación por defecto (`match /{document=**} { allow read, write: if false; }`), validación de esquemas (`hasAll`/`hasOnly`), límites de tamaño, verificación de tipos, sellos de tiempo del servidor (`request.time`) y sincronización con tombstones anti-zombies (`src/utils/syncLogic.ts`).

### Esquema Formal (14 rutas / entidades en `firebase-blueprint.json`)
1. **Árbol privado del propietario (`/users/{userId}` — `isOwner(userId)`)**:
   * `/users/{userId}` (`UserProfile`): nombre, avatar, rango, estadísticas y última actualización.
   * `/users/{userId}/favorites/{favoriteId}`: biblioteca de anime, estado, calificación (1–10), reseña y notas privadas.
   * `/users/{userId}/anime_watched/{seasonId}`: registro de episodios vistos por temporada.
   * `/users/{userId}/manga_favorites/{mangaId}`: biblioteca de manga y fuente.
   * `/users/{userId}/history/{historyId}`: historial de episodios con segundo exacto, duración y estado completado.
   * `/users/{userId}/manga_progress/{mangaId}`: capítulo y página actual de lectura.
   * `/users/{userId}/settings/{settingId}`: preferencias de reproductor, lector y recordatorios de emisión.
   * `/users/{userId}/custom_lists/{listId}`: colecciones personalizadas del usuario.
   * `/users/{userId}/push_subscriptions/{subId}`: suscripciones Web Push y tokens FCM por dispositivo.
   * `/users/{userId}/suggestions/{suggestionId}`: buzón de sugerencias enviadas.
2. **Comunidad**:
   * `/episodes/{episodeKey}/comments/{commentId}`: lectura y creación para usuarios autenticados, inmutabilidad en actualizaciones y eliminación exclusiva del autor.
3. **Watch Together en Tiempo Real**:
   * `/watch_rooms/{roomId}`: estado de sincronización, `hasPasscode`, `passcodeHash`, `inviteTokenHash` y borrado restringido al creador (`hostUid`).
   * `/watch_rooms/{roomId}/participants/{participantId}`: participantes autenticados o invitados validados (`guest_*`).
   * `/watch_rooms/{roomId}/messages/{messageId}`: mensajes del chat en vivo.

---

## 9. Variables de Entorno (`.env.example`)

| Variable | Propósito |
| :--- | :--- |
| `APP_URL` | URL pública base para callbacks OAuth y enlaces de invitación |
| `ANILIST_CLIENT_ID` / `ANILIST_CLIENT_SECRET` | Credenciales OAuth 2.0 para scrobbling con AniList |
| `MAL_CLIENT_ID` / `MAL_CLIENT_SECRET` | Credenciales OAuth 2.0 (PKCE) para scrobbling con MyAnimeList |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Llaves VAPID para el canal primario de notificaciones Web Push (se autogeneran si se omiten) |
| `VITE_FIREBASE_VAPID_KEY` | Clave VAPID pública opcional en cliente para tokens FCM |
| `FIREBASE_FCM_SERVER_KEY` | *(Deprecada por Google)* No usada como canal principal; Web Push VAPID es el mecanismo activo |

---

## 10. Suite de Pruebas Automatizadas y Estado de Verificación

* **Pruebas Unitarias y de Contratos (`npm test`)**: **28 archivos / 190 pruebas aprobadas** en Vitest + `fake-indexeddb`:
  * **Módulos base (21):** `animeSources`, `aniskip`, `avatarHelpers`, `directoryFilters`, `downloadHelpers`, `libraryEnhancements`, `mangaLanguage`, `mangaReaderHelpers`, `offline`, `playerResume`, `profileReset`, `profileStats`, `proxySecurity`, `pushNotifications`, `pwaReloadGuard`, `sanitize`, `scrobble`, `seasonOrder`, `storageQuota`, `syncLogic` y `watchTogether`.
  * **Suites de blindaje y regresión por fase (7):** `phase1Hardening`, `phase15Hotfix`, `phase16Systemic`, `phase17PreviewFixes`, `phase2OfflinePwa`, `phase25Downloads` y `phase3Polish`.
* **Compilación de Producción (`npm run build`)**: Exitosa con **0 errores** (sin `dev-dist/` ni artefactos temporales).
* **Validación de Tipos y Reglas de Seguridad (`npm run lint`)**: `tsc --noEmit && eslint firestore.rules` aprobados con **0 errores**.
* **Verificación en Navegador Real (Chromium headless)**:
  * Probado en **Escritorio (`1440×900`)** y **Móvil (`390×844`)** en Inicio, Emisión, Mangas, Buscar, Perfil, Reproductor, Gestor de Descargas y Descargar Episodios.
  * **0 errores de consola**, **0 errores de página** y **0 px de desbordamiento horizontal** en todas las vistas.
  * Validados en vivo el bloqueo/desbloqueo de scroll en modales, cierre con `Escape`, protección del modal crítico de limpieza de perfil y desregistro de atajos al cerrar Reproductor y Lector.
