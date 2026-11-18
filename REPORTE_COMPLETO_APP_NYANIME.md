# Reporte Técnico y Funcional Completo — NyAnime TV

> **Propósito de este documento:** Referencia técnica canónica, verificada y actualizada del proyecto **NyAnime TV** (arquitectura modular Vite + TypeScript + CSS OLED, motor de streaming de Anime HD multi-servidor con reproducción nativa MP4/HLS y sandbox estricto para Mega, Watch Together 100% privado en tiempo real con Firebase Firestore, notificaciones Web Push / FCM, OAuth Scrobbling con AniList y MyAnimeList, lector de Manga/Manhwa/Manhua, almacenamiento offline persistente y suite automatizada de 21 archivos / 120 pruebas).

---

## 1. Resumen Ejecutivo y Topología del Repositorio

**NyAnime TV** es una aplicación web progresiva (PWA) full-stack construida con **Vite 5.4, TypeScript Vanilla, CSS OLED nativo y un servidor HTTP Node.js (`server.ts`)**, diseñada para ofrecer máximo rendimiento en móvil y escritorio sin sobrecarga de frameworks SPA pesados.

| Ruta | Tipo | Stack Principal | Estado |
| :--- | :--- | :--- | :--- |
| **`/` (Raíz + `src/`)** | **Aplicación Principal (Web + PWA + Backend Proxy/OAuth/Push)** | Vite 5.4, TypeScript, CSS OLED (`src/styles/main.css`), `hls.js`, Firebase v13 (Auth, Firestore, FCM), `web-push`, `vite-plugin-pwa` | **Producción.** Puerto `3000`, build con `npm run build`, servidor `node server.ts`, **21 suites / 120 tests** Vitest (`npm test`), `tsc --noEmit && eslint firestore.rules`. |
| **`/legacy_archive/`** | Archivo histórico | Subproyectos heredados de etapas anteriores | **Archivado** para referencia histórica; fuera del bundle activo. |

### Topología Actual del Proyecto
```text
/
├── index.html                        # Shell HTML semántico de la SPA + navegación inferior fija + #ny-modals-root
├── server.ts                         # Servidor HTTP Node.js producción (gzip, SPA fallback, proxies anti-SSRF, OAuth, Push/FCM)
├── vite.config.js                    # Config Vite + middleware proxy dev/preview unificado (nyanimeServerProxyPlugin) + Workbox PWA
├── package.json                      # Scripts dev/build/preview/start/test/lint + dependencias runtime y de pruebas
├── tsconfig.json                     # Configuración TypeScript estricta sobre src/ y server.ts
├── metadata.json                     # Metadatos de la aplicación ("NyAnime TV")
├── .env.example                      # Plantilla de variables de entorno (OAuth AniList/MAL, VAPID, FCM, APP_URL)
├── firebase-applet-config.json       # Configuración pública de Firebase (proyecto + Database ID)
├── firebase-blueprint.json           # Esquema formal JSON de las 14 entidades / rutas en Firestore
├── firestore.rules                   # Reglas de seguridad Firestore (default-deny, RBAC, validación estricta de esquemas)
├── firestore.indexes.json            # Índices compuestos de Firestore
├── eslint.config.mjs                 # ESLint con @firebase/eslint-plugin-security-rules
├── public/
│   ├── keiyoushi_sources.json        # Catálogo de fuentes externas Keiyoushi / Mihon
│   ├── sw-push.js                    # Service Worker auxiliar para notificaciones Web Push
│   ├── firebase-messaging-sw.js      # Service Worker de Firebase Cloud Messaging (FCM)
│   ├── icon.svg, apple-touch-icon.png, pwa-*.png
│   └── assets/                       # Recursos estáticos
└── src/
    ├── main.ts                       # Punto de entrada: inicialización de módulos, estilos, eventos y puente global
    ├── firebase.ts                   # Auth (Google + Email/Password), Sync Firestore con tombstones, Comentarios, Watch Together y FCM
    ├── pwa.ts                        # Ciclo de vida PWA, instalación, guardia anti-recarga y suscripción Web Push / FCM
    ├── styles/
    │   └── main.css                  # Sistema de diseño Red & Black OLED responsivo (~5,464 líneas)
    ├── server/
    │   └── featureRoutes.ts          # Rutas backend de OAuth 2.0 / PKCE (AniList y MAL), Scrobbling y Web Push / FCM
    ├── ui/                           # 10 módulos de interfaz y estado en TypeScript
    │   ├── appState.ts               # Estado global, stores con protección de cuota y navegación estricta por menú
    │   ├── homeView.ts               # Inicio: Hero Spotlight, Continuar Viendo, recomendaciones, búsqueda global, filtros y Favoritos
    │   ├── scheduleView.ts           # Calendario semanal de simulcasts, reloj en vivo, filtros y recordatorios
    │   ├── animeDetailView.ts        # Ficha estilo Crunchyroll: temporadas cronológicas, AniZip, estados, listas y descarga en lote
    │   ├── playerView.ts             # Reproductor multi-servidor, MP4/HLS nativo, Mega sandbox, AniSkip, PiP, Up Next y Watch Together
    │   ├── mangaCatalogView.ts       # Catálogo multi-fuente (AniList, MangaDex, ManhwaWeb, InManga, MangaPill, Keiyoushi)
    │   ├── mangaDetailView.ts        # Ficha estilo Mihon: pestañas estrictas por idioma, selector de fuente y descarga offline
    │   ├── mangaReaderView.ts        # Lector Webtoon / Página Única / Doble Página / RTL-LTR, filtros nocturnos y lectura continua
    │   ├── profileView.ts            # Perfil, rango Otaku, métricas reales, Mis Salas Watch Together (Propietario) y 4 sub-pestañas
    │   └── modals.ts                 # Modales centralizados (Avatar, Auth, Importar, Listas, Reseñas, Descargas, Limpiar Perfil 3 pasos, Contraseña de Sala)
    ├── services/                     # 4 servicios de dominio
    │   ├── offline.ts                # Motor offline IndexedDB + CacheStorage (manga, .MP4 de anime y cola Ver Luego)
    │   ├── importers.ts              # Importador de listas públicas AniList (GraphQL) y MyAnimeList (Jikan)
    │   ├── comments.ts               # Comentarios comunitarios por episodio en Firestore con ocultamiento anti-spoilers
    │   └── keiyoushi.ts              # Gestor del catálogo de extensiones Keiyoushi
    ├── utils/                        # 20 módulos puros desacoplados (unit-tested)
    │   ├── animeSources.ts           # Parsers multi-proveedor, P.A.C.K.E.R., normalización de títulos/Mega, ranking y deduplicación
    │   ├── aniskip.ts                # Integración AniSkip para detección y salto de Opening / Ending
    │   ├── avatarHelpers.ts          # Procesamiento, recorte y compresión de avatares personalizados
    │   ├── directoryFilters.ts       # Filtrado avanzado de catálogo por género, estado, temporada y ordenamiento
    │   ├── downloadHelpers.ts        # Construcción de nombres seguros y utilidades de descarga directa MP4
    │   ├── libraryEnhancements.ts    # Estados de biblioteca, calificaciones, reseñas, colecciones y recomendaciones
    │   ├── mangaLanguage.ts          # Normalización ISO y aislamiento estricto por idioma (ES/EN/PT-BR/JA/KO)
    │   ├── mangaReaderHelpers.ts     # Helpers de paginación, spread doble, dirección RTL/LTR y filtros visuales
    │   ├── playerResume.ts           # Reanudación (5%–92%), umbral de completado (90%), formateo de tiempo y Up Next
    │   ├── profileReset.ts           # Lógica pura de limpieza total de perfil y llaves locales/nube
    │   ├── profileStats.ts           # Cálculo de tiempo real visto, episodios únicos, distribución de géneros y rango Otaku
    │   ├── proxySecurity.ts          # Validación anti-SSRF, allowlist de dominios, Referer dinámico y rate limiter
    │   ├── pushNotifications.ts      # Helpers de suscripción Web Push / FCM y formato de alertas/resumen semanal
    │   ├── pwaReloadGuard.ts         # Guardia contra bucles de recarga del Service Worker
    │   ├── sanitize.ts               # escapeHTML, validación segura de URLs, acrónimos, tiempo relativo e iconos SVG
    │   ├── scrobble.ts               # Lógica de sincronización bilateral con AniList y MyAnimeList
    │   ├── seasonOrder.ts            # Agrupación cronológica de franquicias y conteo real de episodios emitidos
    │   ├── storageQuota.ts           # Escritura segura en localStorage con recuperación ante QuotaExceededError
    │   ├── syncLogic.ts              # Fusión de estado y tombstones anti-zombies para Cloud Firestore
    │   └── watchTogether.ts          # Códigos de sala, hashing de contraseña/token de invitación, enlaces privados y sincronización
    └── __tests__/                    # Suite Vitest: 21 archivos / 120 pruebas aprobadas
```

---

## 2. Stack Tecnológico y Scripts

| Capa | Tecnología | Detalles |
| :--- | :--- | :--- |
| **Frontend** | TypeScript (`^7.0.2`), Vite (`^5.4.10`), CSS OLED | Arquitectura modular vanilla sin virtual DOM |
| **Streaming** | HTML5 `<video>`, `hls.js` (`^1.7.4`), Iframe Sandbox | Reproducción nativa MP4/HLS sin anuncios y embebidos protegidos |
| **Servidor** | Node.js HTTP nativo (`server.ts`) | Compresión gzip, SPA fallback, apagado limpio (`SIGTERM`/`SIGINT`), puerto `3000` |
| **Nube y Tiempo Real** | Firebase (`^13.3.0`) | Auth (Google + Email/Password), Cloud Firestore y Firebase Cloud Messaging |
| **Notificaciones** | `web-push` (`^4.0.0`) + FCM | Soporte dual VAPID Web Push y tokens FCM en segundo plano |
| **PWA y Offline** | `vite-plugin-pwa` (`^2.0.0`), Workbox, IndexedDB, CacheStorage | Instalación `standalone`, caché de manga y descarga `.MP4` offline |
| **Pruebas y Lint** | `vitest` (`^2.1.8`), `fake-indexeddb`, `tsc`, `eslint` (`^10.14.0`) + `@firebase/eslint-plugin-security-rules` | Verificación integral de lógica, tipos y reglas de seguridad |

### Scripts (`package.json`)
* **`npm run dev`**: Inicia Vite en `0.0.0.0:3000` con el middleware completo de proxies, OAuth y Push.
* **`npm run build`**: Compila los artefactos de producción y genera el Service Worker PWA.
* **`npm start`**: Ejecuta `node server.ts` en el puerto `3000`.
* **`npm test`**: Ejecuta la suite completa de Vitest (`21` archivos / `120` pruebas).
* **`npm run lint`**: Ejecuta `tsc --noEmit && eslint firestore.rules`.

---

## 3. Infraestructura Backend, Proxies Seguros y APIs

Tanto `server.ts` (producción) como `vite.config.js` (`nyanimeServerProxyPlugin` en desarrollo/preview) exponen las mismas rutas y protecciones definidas en `src/server/featureRoutes.ts` y `src/utils/proxySecurity.ts`.

### 3.1 Controles de Seguridad de Red
* **Protección Anti-SSRF (`validateProxyTargetUrl`)**: Lista blanca estricta de dominios permitidos y bloqueo de direcciones locales/privadas (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `169.254.169.254`, `localhost`, IPv6 `::1`/`fe80::`/`fc00::`, credenciales en URL y protocolos no HTTP/HTTPS).
* **Validación de redirecciones**: Máximo `3` saltos validados contra la lista blanca en cada redirección.
* **CORS estricto por Origen**, límite de **600 peticiones por minuto por IP**, límites máximos de tamaño por respuesta y caché en memoria de `5 minutos` para respuestas de metadatos.

### 3.2 Endpoints del Servidor

| Categoría | Endpoint | Descripción |
| :--- | :--- | :--- |
| **Proxies** | `GET/POST /api/proxy?url=...` | Proxy HTML/API con cabeceras personalizadas (`Referer`, `Origin`, `Content-Type`, `X-Requested-With`) y soporte `probe=1` |
| | `GET /api/img-proxy?url=...` | Proxy de portadas y páginas de manga con `Referer` dinámico y caché inmutable de 7 días |
| | `GET/HEAD /api/video-proxy?url=...` | Streaming de video MP4/WebM/HLS con soporte `Range 206`, reescritura de manifiestos `.m3u8` (incluyendo segmentos camuflados) y descarga como archivo adjunto sanitizado (`download=1`) |
| **OAuth y Scrobble** | `GET /api/auth/providers/status` | Indica si AniList y MyAnimeList tienen credenciales configuradas en el servidor |
| | `GET /api/auth/anilist/url` y `/callback` | Flujo OAuth 2.0 mediante popup con `postMessage` para AniList |
| | `POST /api/auth/anilist/scrobble` | Actualiza progreso de episodios, estado y calificación en AniList |
| | `GET /api/auth/mal/url` y `/callback` | Flujo OAuth 2.0 con **PKCE** para MyAnimeList |
| | `POST /api/auth/mal/refresh` y `/scrobble` | Renovación de tokens OAuth y envío de progreso a MyAnimeList |
| **Web Push / FCM** | `GET /api/push/vapid-public-key` | Retorna (o autogenera) la clave pública VAPID |
| | `POST /api/push/subscribe` y `/unsubscribe` | Registra o elimina suscripciones Web Push y tokens FCM |
| | `POST /api/push/test` | Dispara una notificación de prueba inmediata |
| | `POST /api/push/check-airing` | Comprueba nuevos episodios emitidos para los animes favoritos del usuario |
| | `POST /api/push/send-weekly-summary` | Envía notificación con el resumen semanal de actividad |

---

## 4. Motor de Anime, Reproductor y Resolución de Fuentes

### 4.1 Organización de Franquicias y Ficha (`src/ui/animeDetailView.ts`, `src/utils/seasonOrder.ts`)
* Agrupación cronológica de temporadas, películas y OVAs/especiales estilo Crunchyroll a partir del grafo de relaciones de AniList.
* Cálculo real de episodios emitidos (`computeAvailableEpisodes`) para series en emisión (`RELEASING`).
* Metadatos de episodios (títulos y miniaturas) cargados de forma asíncrona desde `api.ani.zip`, paginación en rangos de 50 episodios y marcado masivo de vistos.
* Gestión de **5 estados de biblioteca** (`watching`, `plan_to_watch`, `completed`, `on_hold`, `dropped`), colecciones personalizadas, calificación `1–10`, reseñas y notas privadas.

### 4.2 Agregador Multi-Proveedor y Cobertura Ampliada (`src/ui/playerView.ts`, `src/utils/animeSources.ts`)
* **Proveedores principales en paralelo**: *AnimeAV1*, *TíoAnime*, *TVAnime*, *JKAnime*, *HenaoJara*, *HentaiLA*, *HentaiJK*, *Internet Archive*, con respaldo automático en *VidSrc* y *MultiEmbed* para maximizar cobertura en animes difíciles de localizar.
* **Resolución inteligente de títulos**: Soporta coincidencia de subtítulos de secuelas, sufijos de año, sinónimos alternativos y sondeo directo de slugs cuando las búsquedas literales no arrojan coincidencias.
* **Extracción directa sin anuncios**: Reproducción nativa en `<video>` / `hls.js` para *MP4Upload*, *YourUpload*, *StreamWish*, *Dotanborito* y *JKPlayer* (con detección automática de enlaces caídos y salto inmediato al siguiente servidor operativo).
* **Solución definitiva a descargas externas en Mega**:
  * Normalización universal de URLs (`mega.nz/file/...`, `mega.nz/#!...`, etc.) al formato de reproducción embebida `mega.nz/embed/<id>#<key>`.
  * Renderizado en `<iframe>` con sandbox estricto (`allow-scripts allow-same-origin allow-forms`) omitiendo `allow-popups` y `allow-top-navigation` para impedir redirecciones o ventanas de descarga externa.
  * Prioridad reducida (`score: 75`) para dar preferencia automática a servidores directos sin anuncios.

### 4.3 Funcionalidades del Reproductor
* **AniSkip (`src/utils/aniskip.ts`)**: Detección automática de intervalos de Opening/Ending, botón rápido de salto `+85s` y opción de **Auto-Salto**.
* **Reanudación y seguimiento real (`playerResume.ts`, `profileStats.ts`)**: Reanuda automáticamente entre el 5% y el 92%, marca como visto al superar el 90%, contabiliza segundos reales reproducidos y persiste en `timeupdate`, `pause`, `pagehide` y `beforeunload`.
* **Controles modernos**: Picture-in-Picture (PiP), **MediaSession API**, modo cine, overlay *"A continuación"* con cuenta regresiva, reproducción de episodios `.MP4` guardados offline y comentarios por episodio con filtro anti-spoilers.

---

## 5. Watch Together 100% Privado en Tiempo Real

Implementado con **Cloud Firestore** (`src/firebase.ts`, `src/ui/playerView.ts`, `src/ui/profileView.ts`, `src/utils/watchTogether.ts`):

* **Privacidad estricta**: Se eliminó cualquier listado público de salas de otros usuarios en el Inicio. Nadie puede descubrir ni entrar libremente a salas ajenas.
* **Acceso exclusivo por invitación o contraseña**:
  * Al crear una sala, el anfitrión define una **contraseña de sala** (protegida con hash `passcodeHash`) y se genera un **token de invitación** (`inviteTokenHash`).
  * Para unirse, un usuario debe ingresar mediante el **enlace de invitación completo** (`?room=<CODIGO>&k=<TOKEN>`) o introducir manualmente la **contraseña** que posee el creador en el modal protegido.
* **Sincronización en tiempo real**: Sincroniza anime, episodio, marca de tiempo, estado `play/pause`, lista de participantes y chat en vivo.
* **Gestión de salas del propietario en Perfil**: Tarjeta dedicada **"🔒 Mis Salas Watch Together (Propietario)"** que permite al creador ver todas sus salas activas, **continuar/entrar** directamente, **copiar el enlace de invitación** o **cerrar/eliminar definitivamente** la sala.

---

## 6. Motor de Manga/Manhwa/Manhua y Lector Avanzado

* **Catálogo multi-fuente (`src/ui/mangaCatalogView.ts`)**: Integra *AniList*, *MangaDex*, *ManhwaWeb*, *InManga*, *MangaPill*, *SpanishWebtoon* y extensiones del catálogo *Keiyoushi / Mihon* (`src/services/keiyoushi.ts` + `public/keiyoushi_sources.json`).
* **Aislamiento estricto por idioma (`src/utils/mangaLanguage.ts`)**: Separa capítulos en buckets por idioma (`es`, `en`, `pt-br`, `ja`, `ko`) sin mezclar idiomas y preserva capítulos `0`.
* **Lector avanzado (`src/ui/mangaReaderView.ts`, `src/utils/mangaReaderHelpers.ts`)**:
  * Modos **Webtoon/Vertical**, **Página Única**, **Doble Página (Spread)** y dirección **RTL / LTR**.
  * Lectura continua con precarga del siguiente capítulo, seguimiento exacto de página, zoom multi-touch, selector rápido de capítulos y cambio rápido a inglés si un capítulo no tiene páginas en español.
  * Filtros visuales nocturnos (brillo, contraste, sepia), ancho de página y color de fondo configurables.
  * Descarga por lotes offline con progreso en vivo y cancelación mediante `AbortController`.

---

## 7. Perfil, Navegación, PWA, Offline y Notificaciones

### 7.1 Navegación Segura
* El cambio entre las secciones principales (`Inicio`, `Emisión`, `Mangas`, `Buscar`, `Perfil`) ocurre **únicamente mediante los iconos de la barra de menú** (se deshabilitó el cambio por gesto de deslizamiento horizontal).

### 7.2 Perfil, Estadísticas y Limpieza Total (`src/ui/profileView.ts`, `src/ui/modals.ts`, `src/utils/profileReset.ts`)
* Cabecera con avatar personalizable (recorte/compresión local), rango Otaku progresivo y barra de métricas verificadas (tiempo real visto, episodios únicos, capítulos leídos y elementos en biblioteca).
* **4 sub-pestañas organizadas**: *Mi Biblioteca*, *Estadísticas y Actividad*, *Cuenta y Nube* y *Herramientas y Offline*.
* Incluye importación de bibliotecas públicas de **AniList y MyAnimeList**, respaldo/restauración en formato JSON, estado de OAuth Scrobbling, gestión de almacenamiento offline y botón de **Limpiar Perfil** protegido con **3 confirmaciones consecutivas** que explican claramente que se eliminará absolutamente todo (local y nube) para iniciar desde cero.

### 7.3 Almacenamiento Offline (`src/services/offline.ts`) y PWA (`src/pwa.ts`)
* Combina `IndexedDB` (`NyAnimeOfflineDB`) y `CacheStorage` para almacenar capítulos de manga, episodios `.MP4` y cola *"Ver Luego"*, con solicitud de almacenamiento persistente (`navigator.storage.persist()`) y monitor de cuota.
* Service Worker gestionado por Workbox + guardia anti-recarga infinita (`pwaReloadGuard.ts`), guía de instalación multiplataforma (Android/iOS/Escritorio) y workers dedicados de Push/FCM (`public/sw-push.js`, `public/firebase-messaging-sw.js`).

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
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Llaves VAPID para notificaciones Web Push |
| `VITE_FIREBASE_VAPID_KEY` | Clave VAPID pública en cliente para tokens FCM |
| `FIREBASE_FCM_SERVER_KEY` | Clave del servidor para despacho de notificaciones FCM |

---

## 10. Suite de Pruebas Automatizadas y Estado de Verificación

* **Pruebas Unitarias (`npm test`)**: **21 archivos / 120 pruebas aprobadas** en Vitest + `fake-indexeddb`:
  `animeSources`, `aniskip`, `avatarHelpers`, `directoryFilters`, `downloadHelpers`, `libraryEnhancements`, `mangaLanguage`, `mangaReaderHelpers`, `offline`, `playerResume`, `profileReset`, `profileStats`, `proxySecurity`, `pushNotifications`, `pwaReloadGuard`, `sanitize`, `scrobble`, `seasonOrder`, `storageQuota`, `syncLogic` y `watchTogether`.
* **Compilación de Producción (`npm run build`)**: Exitosa con **0 errores**.
* **Validación de Tipos y Reglas de Seguridad (`npm run lint`)**: `tsc --noEmit && eslint firestore.rules` aprobados con **0 errores**.
* **Verificación en Navegador Real (Chromium headless)**: Flujos principales, reproductor, salas privadas y sección de perfil verificados con **0 errores de consola**.
