# 📘 Auditoría Técnica y Funcional Final: NyAnime TV v3.0.0

> **Propósito de este documento:** Referencia técnica canónica, verificada y actualizada del estado final de **NyAnime TV v3.0.0** (arquitectura modular Vite + TypeScript + CSS OLED, Reproductor Nativo 2.0, motor de anime/manga, proxy anti-SSRF con `Range 206`, almacenamiento offline persistente, Firebase Auth + Firestore y suite de pruebas automatizadas).

---

## 1. Resumen Ejecutivo y Topología Final del Repositorio

La aplicación principal se ejecuta como una **Web App / PWA modular en Vite 5.4 + TypeScript + CSS nativo + servidor HTTP Node.js**, completamente desacoplada del antiguo monolito HTML. Los subproyectos heredados de etapas previas (`frontend/` en Flutter y `backend/` en Python) fueron movidos a `/legacy_archive/`.

| Ruta | Tipo | Stack Principal | Estado |
| :--- | :--- | :--- | :--- |
| **`/` (Raíz + `src/`)** | **Aplicación Principal (Web + PWA + Proxy)** | Vite 5.4, TypeScript, CSS OLED (`src/styles/main.css`), `hls.js`, Firebase v13 (Auth + Firestore), `vite-plugin-pwa` | **Producción (v3.0.0).** Puerto `3000`, build con `npm run build`, `8` suites / `39` tests Vitest (`npm test`), linter `tsc --noEmit && eslint firestore.rules`, servidor `node server.ts`. |
| **`/legacy_archive/`** | Archivo histórico | Flutter (`frontend/`), Python (`backend/`), `REPORTE_ARQUITECTURA_SISTEMA_NYANIME.md` | **Archivado** para referencia histórica; fuera del bundle activo. |

### Topología Exacta de la Aplicación Principal (v3.0.0)
```text
/
├── index.html                    # Shell HTML semántico y limpio (854 líneas) + #ny-modals-root
├── server.ts                     # Servidor HTTP Node.js producción (512 líneas: gzip, headers y /api/proxy, /api/img-proxy, /api/video-proxy)
├── vite.config.js                # Config Vite + Middleware proxy dev + Workbox PWA (452 líneas)
├── package.json                  # Scripts dev/build/preview/start/test/lint + hls.js, firebase, typescript, vitest
├── tsconfig.json                 # Config TS estricta sobre src/ y server.ts
├── metadata.json                 # Metadatos unificados ("NyAnime TV")
├── firebase-applet-config.json   # Credenciales públicas cliente Firebase (proyecto summer-question-nc70r)
├── firebase-blueprint.json       # Esquema formal JSON (8 entidades Firestore, 401 líneas)
├── firestore.rules               # Reglas de seguridad Firestore (291 líneas, default-deny + validación estricta)
├── firestore.indexes.json        # Índices Firestore
├── eslint.config.mjs             # ESLint con @firebase/eslint-plugin-security-rules
├── src/
│   ├── main.ts                   # Bootstrap modular (456 líneas): importa main.css, enlaza uiHooks, expone handlers en window y atajos de teclado
│   ├── firebase.ts               # Bridge Firebase Auth + Sync bidireccional con tombstones + comentarios + preferencias (1,332 líneas)
│   ├── pwa.ts                    # Registro SW (virtual:pwa-register), beforeinstallprompt y banner offline (145 líneas)
│   ├── styles/
│   │   └── main.css              # Sistema de diseño Red & Black OLED modular (2,571 líneas, incluye resets de botones semánticos)
│   ├── ui/                       # 10 módulos de interfaz y estado en TypeScript
│   │   ├── appState.ts           # Estado global, stores, historial (anime/manga + exact currentTime/page), favoritos y puente fetch/proxy (1,359 líneas)
│   │   ├── homeView.ts           # Hero destacado, Continuar Viendo, categorías, En Emisión Hoy, Populares y Tendencias (458 líneas)
│   │   ├── scheduleView.ts       # Calendario semanal de simulcasts, reloj local en vivo, filtros, vista TIMELINE/GRID y recordatorios (726 líneas)
│   │   ├── animeDetailView.ts    # Ficha estilo Crunchyroll: selector de temporadas, rangos de 50 eps, metadatos ani.zip y descarga en lote (639 líneas)
│   │   ├── playerView.ts         # Reproductor Nativo 2.0 + 7 proveedores en paralelo + Hls.js + PiP + Up Next + comentarios (1,690 líneas)
│   │   ├── mangaCatalogView.ts   # Catálogo MangaDex / InManga / MangaPill / Keiyoushi, filtros, acrónimos y búsqueda global (2,276 líneas)
│   │   ├── mangaDetailView.ts    # Ficha estilo Mihon: pestañas estrictas por idioma, descarga offline con progreso/cancelación y precarga (728 líneas)
│   │   ├── mangaReaderView.ts    # Lector Webtoon/Paginado, zoom multi-touch, tracking exacto de página y cambio rápido a inglés (764 líneas)
│   │   ├── profileView.ts        # Perfil, estadísticas reales, rango Otaku dinámico, respaldo JSON y estado de sesión (104 líneas)
│   │   └── modals.ts             # Inyección centralizada de modales en #ny-modals-root + Gestor de Descargas con estado de persistencia (744 líneas)
│   ├── services/                 # 4 servicios de dominio
│   │   ├── offline.ts            # Motor offline CacheStorage + IndexedDB (NyAnimeOfflineDB) + persistencia y cuota del navegador (544 líneas)
│   │   ├── importers.ts          # Importador real AniList GraphQL (Anime + Manga) + MAL vía Jikan (343 líneas)
│   │   ├── comments.ts           # Comentarios por episodio en Firestore, validación, cooldown 5s, contador 500 chars, spoiler blur y paginación (291 líneas)
│   │   └── keiyoushi.ts          # Gestor de catálogo Keiyoushi con filtros e iconos SVG OLED (162 líneas)
│   ├── utils/                    # 7 módulos puros desacoplados (unit-tested)
│   │   ├── animeSources.ts       # Parsers multi-proveedor, P.A.C.K.E.R., normalización, fusión de espejos y bloqueo de hosts inseguros (829 líneas)
│   │   ├── seasonOrder.ts        # Agrupación cronológica de franquicias tipo Crunchyroll y conteo real de episodios emitidos (443 líneas)
│   │   ├── proxySecurity.ts      # Protección Anti-SSRF, allowlist de dominios, Referer dinámico de video y rate limiter (401 líneas)
│   │   ├── sanitize.ts           # escapeHTML, safeImageUrl/safeExternalUrl, acrónimos, tiempo relativo, rango Otaku e iconos SVG (235 líneas)
│   │   ├── mangaLanguage.ts      # Aislamiento estricto por idioma (ES/EN/PT-BR/JA/KO) y failover en el mismo idioma (206 líneas)
│   │   ├── syncLogic.ts          # Resolución de conflictos y tombstones anti-zombies para Firestore (103 líneas)
│   │   └── playerResume.ts       # Cálculo de reanudación (5%–92%), umbral de completado (90%), formateo mm:ss/hh:mm:ss y texto Up Next (52 líneas)
│   └── __tests__/                # Suite Vitest: 8 archivos / 39 tests aprobados
│       ├── animeSources.test.ts  # 7 tests
│       ├── seasonOrder.test.ts   # 3 tests
│       ├── mangaLanguage.test.ts # 3 tests
│       ├── proxySecurity.test.ts # 6 tests
│       ├── sanitize.test.ts      # 5 tests
│       ├── playerResume.test.ts  # 8 tests
│       ├── syncLogic.test.ts     # 4 tests
│       └── offline.test.ts       # 3 tests
└── public/
    ├── keiyoushi_sources.json    # Catálogo oficial de extensiones Keiyoushi
    ├── icon.svg, apple-touch-icon.png, pwa-*.png
    └── assets/                   # Recursos estáticos
```

---

## 2. Infraestructura Web, Triple Proxy Endurecido y PWA

### 2.1. Scripts y Build (`package.json`, `vite.config.js`, `server.ts`)
* **`npm run dev`:** `vite --host 0.0.0.0 --port 3000` (con middleware proxy idéntico a producción).
* **`npm run build`:** `vite build` (chunk `firebase-vendor` separado + precache Workbox hasta `2 MB`).
* **`npm start`:** `node server.ts` (servidor HTTP nativo Node.js con compresión gzip, headers de seguridad y 3 endpoints proxy).
* **`npm test`:** `vitest run` (`8` archivos / `39` pruebas aprobadas).
* **`npm run lint`:** `tsc --noEmit && eslint firestore.rules`.

### 2.2. Triple Middleware Proxy (`src/utils/proxySecurity.ts` + `server.ts` + `vite.config.js`)
1. **`GET/POST /api/proxy?url=<URL>`** (Scraping HTML, APIs JSON y peticiones AJAX `POST`):
   * Soporta cabeceras seguras `x-custom-content-type` y `x-custom-requested-with` para consultas `application/x-www-form-urlencoded` en portales como `jkanime.one/jk` y `ww1.henaojara.net/hj`.
   * Límite de `10 MB` (`MAX_API_PROXY_BYTES`), timeout y rate limit por IP.
2. **`GET /api/img-proxy?url=<URL>`** (Páginas de Manga y Pósters):
   * Inyecta el `Referer` esperado por cada CDN (ej. `https://mangapill.com/` para MangaPill/ReadDetectiveConan o el origen correspondiente para InManga/MangaDex).
   * Límite de `25 MB` (`MAX_IMG_PROXY_BYTES`) y caché inmutable (`max-age=604800`).
3. **`GET/HEAD /api/video-proxy?url=<URL>`** (Streaming Nativo MP4 con soporte `Range 206`):
   * Transmite por *streaming* (`Readable.fromWeb`) reenviando `Range`, `Content-Range`, `Accept-Ranges` y `Content-Length` (`206 Partial Content` / `200 OK`) para permitir búsqueda instantánea en la línea de tiempo del `<video>` nativo.
   * **Inyección dinámica de `Referer` (`resolveVideoStreamReferer`):** envía `https://www.mp4upload.com/` para `*.mp4upload.com` y `https://www.yourupload.com/` para `*.yourupload.com` / `*.vidcache.net`.
   * **Fail-fast connect timeout (`6.5s`):** aborta nodos caídos rápidamente para pasar al siguiente servidor sin bloquear la reproducción.
4. **Protección Anti-SSRF y Allowlist Estricta (`validateProxyTargetUrl`):**
   * Bloquea IPs privadas/loopback/link-local/CGNAT/multicast (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `169.254.169.254`, `metadata.google.internal`, IPv6 `::1`/`fe80::`/`fc00::`, IPv4 mapeada en IPv6, IPs en entero o hexadecimal), credenciales embebidas y protocolos distintos de HTTP(S).
   * Valida cada salto de redirección contra `ALLOWED_PROXY_DOMAINS`:
     `mangadex.org`, `*.mangadex.network`, `inmanga.com`, `*.intomanga.com`, `mangapill.com`, `*.readdetectiveconan.com`, `jkanime.net`, `jkanime.one`, `ww1.henaojara.net`, `animejara.com`, `ani.zip`, `jikan.moe`, `anilist.co`, `myanimelist.net`, `animeflv.net`, `tioanime.com`, `monoschinos2.com`, `animeav1.com`, `tvanime.tv`, `mp4upload.com`, `yourupload.com`, `vidcache.net`, `flaswish.com`, `streamwish.to`, `streamwish.com`, `sfastwish.com`, `dhcplay.com`, `zilla-networks.com`, `api.dicebear.com`.

### 2.3. Soporte PWA (`vite-plugin-pwa` + `src/pwa.ts`)
* Expone `window.NyAnimePWA` (`install()`, `openInstallModal()`, `closeInstallModal()`, `refreshUI()`, `isInstallable()`, `isInstalled()`, `isIOS()`, `isOnline()`).
* Detecta modo `standalone`, oculta los botones de instalación cuando ya está instalada y controla el banner `#pwa-offline-banner`.

---

## 3. Motor de Anime, Organización de Franquicias y Reproductor Nativo 2.0

### 3.1. Organización Cronológica estilo Crunchyroll (`src/utils/seasonOrder.ts` & `src/ui/animeDetailView.ts`)
* **`organizeAnimeFranchise`:** Recorre el grafo de relaciones de AniList (`PREQUEL`, `SEQUEL`, `PARENT`, `SIDE_STORY`, `SUMMARY`, `ALTERNATIVE`) para agrupar todas las temporadas, películas y especiales de una franquicia en una única vista desplegable (`.crunchy-season-wrap`).
* **Orden y deduplicación de *split cours*:** Ordena temporadas principales (`T1`, `T2`, `T3`...) por fecha de estreno seguidas de Películas y OVAs/Especiales.
* **Conteo real de episodios emitidos (`computeAvailableEpisodes`):** En series en emisión (`RELEASING`), calcula `nextAiringEpisode.episode - 1` para no habilitar episodios futuros aún no emitidos.
* **Paginación y metadatos `api.ani.zip`:** Agrupa series extensas en rangos de 50 episodios y carga títulos y miniaturas por episodio de forma asíncrona (`cargarAniZipMappingAsync`).

### 3.2. Agregador Multi-Proveedor en Paralelo (`SmartVideoSourceManager`)
Al abrir un episodio, consulta en paralelo (con timeout de seguridad y precarga del `Episodio + 1`):
1. **`JKAnimeSourceProvider` (`jkanime.one` + `jkanime.net`):**
   * Extrae servidores `MP4Upload`, `StreamWish`, `Filemoon`, `Vidhide`, `Uqload`, `LuluStream`, `Doodstream` y `MixDrop` desde `jkanime.one` (`POST /jk` hex `acc=opt`).
   * Intenta extraer los reproductores nativos `Desu` / `Desuv` / `Desuka` (`score 128/126/125`) en `jkanime.net`, protegido con un **circuit-breaker de 5 minutos (`cfBlockedUntil`)** cuando una IP de centro de datos recibe `HTTP 403` / Cloudflare, evitando reintentos fallidos continuos.
2. **`AnimeAV1SourceProvider` (`animeav1.com`):** Servidores `SUB` y `LATINO` (`embeds` + `downloads`), normalizando enlaces `mega.nz/file/...` a `mega.nz/embed/...`.
3. **`TVAnimeSourceProvider` (`tvanime.tv`):** Servidores `SUB` y `LATINO` con **fusión inteligente de espejos** (`AnimeAV1+TVAnime`) en `rankAndDeduplicateSources`.
4. **`HenaoJaraSourceProvider` (`ww1.henaojara.net`):** Espejos independientes mediante `POST /hj`.
5. **`TioAnimeSourceProvider` (`tioanime.com`):** `YourUpload`, `Mega`, `Okru`, `VidGuard`, `Maru`, `MixDrop`.
6. **`MultiEmbedProvider` (`multiembed.mov`)** y **`VidSrcMeProvider` (`vidsrcme.ru`)**: Respaldos por `tmdbId`/`imdbId`.

### 3.3. Reproductor Nativo 2.0 y Pipeline de Reproducción (`src/ui/playerView.ts` + `src/utils/playerResume.ts`)
1. **Extracción directa sin anuncios (`StreamExtractor`):**
   * **`MP4Upload` / `YourUpload`:** Extrae el enlace `.mp4` real y lo reproduce en `<video id="video-player-native">` mediante `/api/video-proxy` (**0% anuncios**). Si falla en origen o devuelve 404, marca la fuente como fallida (`✕`) y salta automáticamente al siguiente servidor vivo.
   * **`StreamWish` / `Flaswish`:** Desempaqueta bloques *Dean Edwards P.A.C.K.E.R.* sin `eval` (`unpackDeanEdwards`) y reproduce el flujo `.m3u8` mediante `Hls.js`.
2. **Ciclo de vida Player 2.0 (`attachNativeVideoLifecycle` & `flushPlayerProgress`):**
   * **Reanudación automática (`shouldResumePlayback`):** Si el progreso guardado está entre el **5% y 92%** de la duración total, reanuda en el segundo exacto y muestra un toast interactivo con acción **`"Reiniciar desde 00:00"`**.
   * **Persistencia resiliente:** Guarda progreso con *throttle* en `timeupdate`, inmediatamente al pausar (`pause`), al cerrar el reproductor, cambiar de servidor/idioma/episodio y en eventos `pagehide` / `beforeunload` / `visibilitychange`.
   * **Auto-completado al 90% (`shouldMarkEpisodeCompleted`):** Marca automáticamente el episodio como visto en `AnimeWatchedManager` y sincroniza los botones de la ficha y del reproductor.
   * **Overlay *"A continuación"* (`showUpNextOverlay`):** Al finalizar el episodio (`ended`), muestra una cuenta regresiva de 5 segundos para pasar al siguiente episodio con botones **"Reproducir ahora"** y **"Cancelar"**.
   * **Picture-in-Picture (`#btn-pip-toggle`), MediaSession y Atajos:** Control de PiP nativo, metadatos/acciones multimedia del sistema (`play`, `pause`, `seekbackward`, `seekforward`, `previoustrack`, `nexttrack`) y atajos de escritorio (`Espacio`/`k`, `m`, `f`, `ArrowLeft`/`ArrowRight`, `Shift+Arrow`).
3. **Filtrado de hosts bloqueados e Iframe de respaldo:**
   * `isBlockedOrUnsafeStreamHost` filtra globalmente hosts muertos o incompatibles (`UPNShare`/`*.uns.bio`, `Voe`, `StreamSB`, `Netu`/`hqq`, `Fembed`, `1fichier`, `v.tioanime.com`).
   * Cuando se usa el `<iframe id="video-player-iframe">` de respaldo (ej. `Mega`, `Okru`, `Filemoon`, `VidGuard`), se renderiza sin atributo `sandbox` y con `allow="autoplay; encrypted-media; fullscreen; picture-in-picture"` y `referrerpolicy="strict-origin-when-cross-origin"` para evitar bloqueos tipo *"Sandboxed our player is not allowed"*.

---

## 4. Motor de Manga, Aislamiento de Idiomas y Lector Webtoon

### 4.1. Aislamiento Estricto por Idioma (`src/utils/mangaLanguage.ts`)
* Normaliza códigos ISO dispares (`normalizeMangaLang`) y separa estrictamente los capítulos en buckets (`es`, `en`, `pt-br`, `ja`, `ko`) sin mezclar capítulos en inglés dentro de la pestaña `🇪🇸 Español`.
* El *failover* de escaneos (`selectPageCandidatesForLanguage`) solo alterna entre versiones del mismo idioma activo.
* Preserva explícitamente capítulos con número `0` (ej. `Cap. 00`).

### 4.2. Lector Webtoon (`src/ui/mangaReaderView.ts`) y Resiliencia en 5 Niveles
* **Seguimiento exacto de página:** Rastrea la página visible durante la lectura, la guarda periódicamente y al salir (`flushMangaReaderPage` -> `MangaHistoryManager.savePageNumber`), y restaura el desplazamiento automático al reabrir el capítulo.
* **Cambio rápido a inglés (`cambiarAVersionInglesCapitulo`):** Función global exportada para saltar directamente a la versión en inglés si un capítulo no tiene páginas disponibles en español.
* **Resiliencia de imágenes (`handleMangaImgError`):** Rotación de espejos InManga (`pack`/`cdn1`/`cdn2`/fallback), failover MangaDex (`dataSaver` -> `uploads.mangadex.org` -> nuevo nodo `at-home`), reintentos con cache-buster, cambio automático de scanlator en el mismo idioma y colapso limpio de páginas 404.

---

## 5. Almacenamiento Offline y Persistencia (`src/services/offline.ts` & `src/ui/modals.ts`)

* **Almacenamiento real:** Combina `CacheStorage` (`nyanime-offline-manga-v1` y `nyanime-offline-anime-v1`) e `IndexedDB` (`NyAnimeOfflineDB`) para guardar capítulos de manga (páginas en caché) y episodios de video MP4 directos (o cola *"Ver Luego"*).
* **Persistencia y Cuota del Dispositivo:** `ensurePersistentStorage()` solicita almacenamiento persistente (`navigator.storage.persist()`) y `getStorageSummary()` calcula uso y espacio disponible (`navigator.storage.estimate()`), mostrando la insignia de estado (`Persistente` / `Estándar`) dentro del resumen `#gestor-storage-summary` del Gestor de Descargas (`#modal-gestor-descargas`).
* **Progreso y Cancelación:** La descarga por lotes de capítulos de manga reporta progreso en vivo (capítulo, página y MB descargados) y soporta cancelación limpia mediante `AbortController` (`cancelarDescargaManga()`).

---

## 6. Pantallas de la SPA (`/index.html` + `src/ui/*`)

La SPA organiza **10 vistas principales** (`#pantalla-*`) bajo el tema **Red & Black OLED** (`--bg-dark: #050507`, `--bg-card: #0c0d12`, `--primary: #ff1a40`) y un contenedor único de modales (`#ny-modals-root` gestionado por `src/ui/modals.ts`):

1. **`#pantalla-inicio` (`homeView.ts`)**: Topbar (Instalar PWA, Gestor de Descargas, Favoritos), Hero destacado, `Continuar Viendo`, chips de género, `En Emisión Hoy`, `Animes Populares` y `Nuevos Episodios (Tendencias)`.
2. **`#pantalla-emision` (`scheduleView.ts`)**: Calendario semanal de simulcasts con reloj en tiempo real, selector de 7 días, filtros (`Todos`, `Por Estrenar`, `Ya Disponibles`, `Siguiendo`, `Semana Completa`), orden, vistas `TIMELINE`/`GRID` y recordatorios sincronizados.
3. **`#pantalla-lectura` (`mangaCatalogView.ts`)**: Spotlight, `Continuar Leyendo`, buscador multi-fuente con expansión de acrónimos (`TBATE`, `ORV`, `SL`, `JJK`, `CSM`), filtros por tipo (`Mangas`, `Manhwas`, `Manhuas`, `Mi Biblioteca`, `Extensiones Keiyoushi`), géneros y vistas `GRID`/`EDITORIAL`.
4. **`#pantalla-busqueda` (`homeView.ts`)**: Búsqueda dual simultánea de animes y mangas con chips rápidos y filtro por ámbito.
5. **`#pantalla-favoritos` (`homeView.ts`)**: Animes y Mangas guardados sincronizados con Firestore.
6. **`#pantalla-perfil` (`profileView.ts`)**: Avatar/nombre personalizables, rango Otaku por actividad real (`Novato`, `Otaku`, `Leyenda`), estadísticas reales, Autenticación Firebase (Google + Correo/Contraseña), estado de sincronización Cloud Firestore, tarjeta de instalación PWA, respaldo/migración JSON, importación AniList/MAL y buzón de sugerencias.
7. **`#pantalla-detalle` (`animeDetailView.ts`)**: Ficha de anime estilo Crunchyroll con desplegable de temporadas/películas/OVAs en orden cronológico, rangos de 50 episodios, metadatos `ani.zip` y descarga en lote.
8. **`#pantalla-detalle-manga` (`mangaDetailView.ts`)**: Ficha estilo Mihon con pestañas estrictas por idioma, selector de fuente, progreso de lectura, descarga offline con barra de progreso y precarga del capítulo objetivo.
9. **`#pantalla-reproductor` (`playerView.ts`)**: Reproductor Nativo 2.0, selector de audio (`Sub Español`, `Audio Latino`, `Auto HD`), barra de servidores rankeados, botones `PiP`, `Abrir`, `Copiar`, `Cine`, `Siguiente`, overlay *Up Next* y comentarios comunitarios anti-spoilers.
10. **`#pantalla-lector` (`mangaReaderView.ts`)**: Lector Webtoon / Paginado con zoom multi-touch, doble tap, restauración exacta de página, cambio rápido a inglés y ajustes visuales sincronizados.

---

## 7. Firebase Auth, Firestore y Seguridad (`src/firebase.ts` & `firestore.rules`)

* **Proyecto Firebase:** `summer-question-nc70r` | **Database ID:** `ai-studio-nyanime-0f24758c-5be4-4dbf-84a0-c5812235d1cd`.
* **Autenticación:** Google Sign-In (`signInWithPopup`) y Correo/Contraseña (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, verificación por correo y restablecimiento de contraseña).
* **Esquema Firestore (`firebase-blueprint.json` + `firestore.rules`):**
  * `/users/{uid}` (`UserProfile`) y subcolecciones privadas del propietario (`isOwner(userId)`): `/favorites/{id}`, `/manga_favorites/{id}`, `/history/{id}` (incluye `currentTime`, `duration`, `completed`), `/manga_progress/{id}`, `/settings/{id}` (`readerBg`, `readerWidth`, `readerMode`, `scheduleReminders`) y `/suggestions/{id}`.
  * `/episodes/{episodeKey}/comments/{commentId}` (`EpisodeComment` — incluye `isSpoiler` boolean, texto `2..500` caracteres, creación/lectura para usuarios autenticados y borrado restringido al autor).
* **Sincronización con Tombstones (`src/utils/syncLogic.ts`):** Evita la resurrección de favoritos, historial o capítulos desmarcados tras fusiones entre dispositivos.
* **Reglas (`firestore.rules`):** `default-deny` global, validación estricta de claves permitidas/requeridas, tipos, tamaños, marcas de tiempo del servidor (`request.time`) e inmutabilidad de `uid`/`createdAt`, validadas con `@firebase/eslint-plugin-security-rules`.

---

## 8. Verificación Final (Compilación, Pruebas y Navegador Real)

* **Pruebas Unitarias (`npm test`):** **`8` suites / `39` tests aprobados** en Vitest (`animeSources`, `seasonOrder`, `mangaLanguage`, `proxySecurity`, `sanitize`, `playerResume`, `syncLogic`, `offline`).
* **Compilación y Linter (`npm run build` + `npm run lint`):** `vite build` y `tsc --noEmit && eslint firestore.rules` **aprobados con 0 errores**.
* **Pruebas en Navegador Real (Chromium Desktop `1440×900` y Móvil `390×844`):**
  * **Inicio y Responsividad:** Carga limpia sin errores de consola; layout móvil `390×844` con `0 px` de desbordamiento horizontal (`scrollWidth === innerWidth`).
  * **Ficha de Anime y Selector de Temporadas:** Verificados *Black Clover Season 2* y *Attack on Titan* con desplegable de temporadas estilo Crunchyroll (`T1`–`T4` + películas/OVAs/especiales).
  * **Reproductor Nativo 2.0:** Verificado en *Attack on Titan · Ep 1* reproduciendo stream directo en `<video>` nativo (`readyState: 4`) vía `/api/video-proxy`, `44` enlaces detectados, botón `PiP` visible, contador `0/500` (`28/500` al escribir) y casilla anti-spoiler funcionales. (Ante respuesta `403` de Cloudflare en `jkanime.net` desde IP de servidor, el *circuit-breaker* delegó correctamente en los servidores alternativos sin afectar la reproducción).
  * **Emisión, Mangas, Lector Webtoon y Descargas:** Verificados calendario de emisión semanal con reloj en vivo, catálogo y ficha de *Chainsaw Man* (`Cap. 00`, `🇪🇸 Español 241`, `🇬🇧 English 1076`), lector Webtoon con `54` páginas cargadas (`1 / 54`) y 0 errores, y modal de Gestor de Descargas con resumen de almacenamiento y estado de persistencia del dispositivo.
