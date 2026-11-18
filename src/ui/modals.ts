import {
  CustomListsManager,
  DownloadManager,
  FavoritesManager,
  MangaFavoritesManager,
  MangaHistoryManager,
  HistoryManager,
  SuggestionsManager,
  UserManager,
  cerrarModales,
  escHtml,
  getActiveManga,
  nWin,
  safeImg,
  showToast,
  state,
  uiHooks
} from './appState.ts';
import { formatWatchDuration } from '../utils/profileStats.ts';
import { buildWeeklyDigestSummary } from '../utils/pushNotifications.ts';
import { sanitizeShortText, sanitizeUserScore } from '../utils/libraryEnhancements.ts';
import {
  DEFAULT_AVATAR_URL,
  compressAvatarImageInBrowser,
  isDataImageAvatar
} from '../utils/avatarHelpers.ts';
import {
  compactFavoritesArray,
  compactMangaEntry,
  safeStorageSetItem
} from '../utils/storageQuota.ts';
import {
  collectNyAnimeStorageKeys,
  getProfileWipeStep
} from '../utils/profileReset.ts';
import * as OfflineService from '../services/offline.ts';

const MODALS_MARKUP = `
  <!-- MODAL: SELECTOR DE FUENTES MIHON -->
  <div class="ny-dialog" id="modal-selector-fuentes-mihon" onclick="cerrarModalFuentesManga(event)">
    <div class="ny-sheet" style="max-height:85vh;" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title">🌐 Selector de Fuentes Mihon</div>
        <div class="ny-dialog-close" onclick="cerrarModalFuentesManga()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">
        Selecciona el servidor o extensión para explorar capítulos completos y evitar restricciones de editoriales o enlaces bloqueados.
      </div>
      <div class="mihon-sources-list" id="mihon-sources-list"></div>
    </div>
  </div>

  <!-- MODAL: GESTOR DE DESCARGA OFFLINE MIHON -->
  <div class="ny-dialog" id="modal-descarga-manga-mihon" onclick="cerrarModalDescargasManga(event)">
    <div class="ny-sheet" style="max-height:80vh;" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title">📥 Descargas para Lectura Offline</div>
        <div class="ny-dialog-close" onclick="cerrarModalDescargasManga()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:14px;" id="descarga-manga-info">
        Descarga los capítulos a CacheStorage e IndexedDB de tu dispositivo para leer sin conexión a internet.
      </div>
      <div id="manga-dl-progress-box" class="hide" style="background:rgba(255,26,64,0.08); border:1px solid rgba(255,26,64,0.3); border-radius:12px; padding:12px; margin-bottom:12px;">
        <div id="manga-dl-progress-text" style="font-size:12px; font-weight:700; color:#fff; margin-bottom:8px;">Preparando descarga...</div>
        <div style="width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:999px; overflow:hidden; margin-bottom:10px;">
          <div id="manga-dl-progress-bar" style="width:0%; height:100%; background:var(--primary); transition:width 0.15s ease;"></div>
        </div>
        <button type="button" class="chip" style="width:100%; justify-content:center; border-color:rgba(255,26,64,0.4); color:#ff4d6d;" onclick="cancelarDescargaManga()">Cancelar descarga</button>
      </div>
      <div class="mihon-download-options" id="mihon-download-options"></div>
    </div>
  </div>

  <!-- MODAL: DETALLE DE MANGA Y SELECTOR DE CAPÍTULOS -->
  <div class="ny-dialog" id="modal-detalle-manga" onclick="cerrarModales(event)">
    <div class="ny-sheet" style="max-height:85vh;" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title" id="manga-modal-sheet-title">Ficha del Manga</div>
        <div class="ny-dialog-close" onclick="cerrarModales()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div id="manga-modal-body"></div>
    </div>
  </div>

  <!-- MODAL: DESCARGA DE ANIME POR EPISODIOS -->
  <div class="ny-dialog" id="modal-descarga-temporada" onclick="cerrarModales(event)">
    <div class="ny-sheet ny-sheet-wide dl-modal-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header dl-sheet-header">
        <div>
          <div class="ny-dialog-title">Descargar Episodios</div>
          <div class="dl-sheet-subtitle" id="descarga-temporada-subtitle">Selecciona episodios para guardar offline o en .MP4</div>
        </div>
        <button type="button" class="ny-dialog-close" onclick="cerrarModales()" aria-label="Cerrar modal de descarga">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      <div class="dl-sheet-body">
        <div class="dl-series-hero">
          <img id="dl-series-cover" src="" alt="" class="dl-series-cover hide" referrerpolicy="no-referrer">
          <div class="dl-series-hero-info">
            <div class="dl-series-hero-title" id="descarga-temporada-title">Cargando anime...</div>
            <div class="dl-series-hero-meta tabular-nums" id="descarga-temporada-info">0 episodios</div>
          </div>
          <div class="dl-selection-count tabular-nums" id="dl-selection-summary">0 seleccionados</div>
        </div>

        <div id="season-dl-progress-box" class="dl-progress-panel hide">
          <div class="dl-progress-head">
            <span id="season-dl-progress-text" class="dl-progress-label">Preparando descarga...</span>
            <span id="season-dl-progress-pct" class="dl-progress-pct tabular-nums">0%</span>
          </div>
          <div class="dl-progress-track">
            <div id="season-dl-progress-bar" class="dl-progress-fill"></div>
          </div>
          <div class="dl-progress-actions">
            <button type="button" class="dl-cancel-btn" onclick="cancelarDescargaTemporada()">Cancelar descarga</button>
          </div>
        </div>

        <div class="dl-picker-toolbar">
          <div class="dl-picker-quick-actions" role="group" aria-label="Selección rápida de episodios">
            <button type="button" class="dl-tool-btn active" data-dl-mode="all" onclick="aplicarFiltroDescargaEpisodios('all')">Todos</button>
            <button type="button" class="dl-tool-btn" data-dl-mode="none" onclick="aplicarFiltroDescargaEpisodios('none')">Ninguno</button>
            <button type="button" class="dl-tool-btn" data-dl-mode="unwatched" onclick="aplicarFiltroDescargaEpisodios('unwatched')">Sin ver</button>
            <button type="button" class="dl-tool-btn" data-dl-mode="not-downloaded" onclick="aplicarFiltroDescargaEpisodios('not-downloaded')">No descargados</button>
          </div>
          <div class="dl-ep-search-wrap">
            <input type="search" id="dl-ep-filter-input" class="dl-ep-search-input" placeholder="Buscar ep. (ej. 12)" aria-label="Filtrar número de episodio" oninput="filtrarListaEpisodiosDescarga(this.value)">
          </div>
        </div>

        <div class="dl-range-row hide" id="dl-range-chips" aria-label="Rangos de episodios"></div>

        <div class="dl-ep-grid" id="descarga-ep-list"></div>

        <div class="dl-config-grid">
          <label class="dl-config-field">
            <span class="dl-config-label">Audio preferido</span>
            <select id="select-audio-descarga" class="dl-config-select" onchange="actualizarResumenSeleccionDescarga()">
              <option value="SUB">Sub Español</option>
              <option value="DUB">Audio Latino</option>
            </select>
          </label>
          <label class="dl-config-field">
            <span class="dl-config-label">Calidad</span>
            <select id="select-calidad-descarga" class="dl-config-select" onchange="actualizarResumenSeleccionDescarga()">
              <option value="1080p">1080p Full HD (.MP4)</option>
              <option value="720p">720p HD Rápido (.MP4)</option>
            </select>
          </label>
          <label class="dl-config-field">
            <span class="dl-config-label">Destino</span>
            <select id="select-destino-descarga" class="dl-config-select" onchange="actualizarResumenSeleccionDescarga()">
              <option value="both">Caché offline + Archivo .MP4</option>
              <option value="cache">Solo caché offline en la app</option>
            </select>
          </label>
        </div>
      </div>

      <div class="dl-sheet-footer">
        <div class="dl-footer-summary tabular-nums" id="dl-footer-summary">0 episodios seleccionados</div>
        <button type="button" id="btn-start-season-dl" class="btn-download-season dl-primary-cta" onclick="iniciarDescargaLote()">
          Descargar episodios
        </button>
      </div>
    </div>
  </div>

  <!-- MODAL: GESTOR DE DESCARGAS -->
  <div class="ny-dialog" id="modal-gestor-descargas" onclick="cerrarModales(event)">
    <div class="ny-sheet ny-sheet-wide dl-modal-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header dl-sheet-header">
        <div>
          <div class="ny-dialog-title">Gestor de Descargas</div>
          <div class="dl-sheet-subtitle">Reproduce capítulos offline o exporta archivos .MP4</div>
        </div>
        <button type="button" class="ny-dialog-close" onclick="cerrarModales()" aria-label="Cerrar gestor de descargas">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      <div class="dl-sheet-body">
        <div id="gestor-storage-summary" class="dl-storage-card">
          Calculando almacenamiento offline...
        </div>

        <div class="dl-manager-controls">
          <div class="dl-filter-tabs" id="gestor-filter-tabs" role="tablist" aria-label="Filtrar descargas por tipo"></div>
          <input type="search" id="gestor-search-input" class="dl-manager-search" placeholder="Buscar por título o episodio..." aria-label="Buscar descargas guardadas" oninput="setDownloadManagerSearch(this.value)">
        </div>

        <div class="dl-manager-list" id="gestor-downloads-list">
          <div class="dl-empty-state">Cargando descargas...</div>
        </div>
      </div>

      <div class="dl-sheet-footer dl-manager-footer">
        <button type="button" id="btn-clear-all-dl" class="dl-clear-trigger-btn" onclick="solicitarLimpiarDescargas()">
          Vaciar almacenamiento offline
        </button>
        <div id="dl-clear-confirm-box" class="dl-confirm-bar hide">
          <span class="dl-confirm-text">¿Eliminar todas las descargas?</span>
          <div class="dl-confirm-actions">
            <button type="button" class="dl-action-btn" onclick="cancelarLimpiarDescargas()">Cancelar</button>
            <button type="button" class="dl-action-btn danger-solid" onclick="confirmarLimpiarDescargas()">Sí, eliminar todo</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL: CAMBIAR AVATAR Y PERFIL -->
  <div class="ny-dialog" id="modal-avatar" onclick="cerrarModales(event)">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title">🎭 Editar Perfil y Foto</div>
        <div class="ny-dialog-close" onclick="cerrarModales()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>

      <div class="avatar-custom-preview-card">
        <img id="avatar-preview-img" class="avatar-preview-circle" src="https://api.dicebear.com/7.x/bottts/svg?seed=Gojo" alt="Vista previa de avatar">
        <div class="avatar-preview-info">
          <div class="avatar-preview-title">Foto de Perfil</div>
          <div class="avatar-preview-sub" id="avatar-preview-source">Avatar predefinido</div>
          <div class="avatar-upload-actions">
            <button type="button" class="avatar-gallery-btn" id="btn-avatar-gallery" onclick="seleccionarFotoGaleriaAvatar()">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
              Elegir foto de galería
            </button>
            <button type="button" class="avatar-reset-btn hide" id="btn-avatar-reset-preset" onclick="restaurarAvatarPredeterminado()">Quitar foto</button>
          </div>
          <input type="file" id="input-avatar-gallery" accept="image/*" style="display:none;" onchange="onAvatarGalleryFileChange(event)">
        </div>
      </div>
      <div id="avatar-upload-error" class="avatar-upload-error hide"></div>

      <div class="avatar-section-label">O ELIGE UN AVATAR PREDEFINIDO</div>
      <div class="avatar-grid" id="avatar-grid-options"></div>

      <div style="margin-top:10px;">
        <div class="avatar-section-label">NOMBRE DE USUARIO</div>
        <input type="text" id="input-edit-username" style="width:100%; background:var(--bg-card); border:1px solid var(--border-color); padding:10px 12px; border-radius:10px; color:white; font-family:inherit; font-size:13px;" placeholder="Tu Nombre">
      </div>
      <button type="button" class="chip active" id="btn-save-profile" style="width:100%; margin-top:14px; padding:10px;" onclick="guardarPerfilUsuario()">Guardar Cambios</button>
    </div>
  </div>

  <!-- MODAL: RANGO OTAKU Y PROGRESO REAL -->
  <div class="ny-dialog" id="modal-vip" onclick="cerrarModales(event)">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title">🏆 Tu Rango Otaku & Progreso</div>
        <div class="ny-dialog-close" onclick="cerrarModales()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div id="rank-modal-body" style="font-size:12.5px; color:var(--text-muted); line-height:1.6;">
        <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:12px; padding:12px; margin-bottom:12px;">
          <div id="rank-modal-current" style="font-size:15px; font-weight:800; color:#fff; margin-bottom:4px;">🌱 Rango: Novato</div>
          <div id="rank-modal-summary" style="font-size:12px; color:var(--text-muted);">0 puntos de actividad</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">
          <div class="pwa-step-box" style="margin:0;"><strong>🌱 Explorador Novato</strong> (0 – 19 pts): Inicio de viaje en NyAnime TV.</div>
          <div class="pwa-step-box" style="margin:0;"><strong>⚡ Otaku Activo</strong> (20 – 99 pts): Maratonista habitual de anime y manga.</div>
          <div class="pwa-step-box" style="margin:0;"><strong>👑 Leyenda Anime</strong> (100+ pts): Coleccionista veterano verificado por actividad real.</div>
        </div>
      </div>
      <button class="oled-btn-secondary" style="width:100%; justify-content:center;" onclick="cerrarModales()">
        Entendido
      </button>
    </div>
  </div>

  <!-- MODAL: AUTENTICACIÓN FIREBASE (EMAIL / PASSWORD) -->
  <div class="ny-dialog" id="modal-auth-email" onclick="cerrarModales(event)">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title" id="auth-modal-title">🔐 Iniciar Sesión con Correo</div>
        <div class="ny-dialog-close" onclick="cerrarModales()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div id="auth-email-error" style="display:none; background:rgba(239,68,68,0.15); border:1px solid #ef4444; border-radius:10px; padding:10px 12px; margin-bottom:12px; font-size:12px; color:#fca5a5; font-weight:600;"></div>

      <div id="auth-group-name" style="margin-bottom:12px; display:none;">
        <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">TU NOMBRE O ALIAS</div>
        <input type="text" id="input-auth-name" style="width:100%; background:var(--bg-card); border:1px solid var(--border-color); padding:10px 12px; border-radius:10px; color:white; font-family:inherit; font-size:13px;" placeholder="Ej. TuAlias">
      </div>

      <div style="margin-bottom:12px;">
        <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">CORREO ELECTRÓNICO</div>
        <input type="email" id="input-auth-email" autocomplete="email" onkeydown="if(event.key==='Enter')window.submitAuthEmail()" style="width:100%; background:var(--bg-card); border:1px solid var(--border-color); padding:10px 12px; border-radius:10px; color:white; font-family:inherit; font-size:13px;" placeholder="ejemplo@correo.com">
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">CONTRASEÑA</div>
        <input type="password" id="input-auth-password" autocomplete="current-password" onkeydown="if(event.key==='Enter')window.submitAuthEmail()" style="width:100%; background:var(--bg-card); border:1px solid var(--border-color); padding:10px 12px; border-radius:10px; color:white; font-family:inherit; font-size:13px;" placeholder="Mínimo 6 caracteres">
      </div>

      <button class="chip active" id="btn-auth-submit" style="width:100%; padding:12px; justify-content:center; font-weight:800; font-size:13px;" onclick="window.submitAuthEmail()">Iniciar Sesión</button>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:12px;">
        <a href="javascript:void(0)" id="toggle-auth-mode-link" style="color:var(--primary); text-decoration:none; font-weight:700;" onclick="window.toggleAuthModalMode()">¿No tienes cuenta? Regístrate</a>
        <a href="javascript:void(0)" id="reset-password-link" style="color:var(--text-muted); text-decoration:none;" onclick="window.recuperarContrasena()">¿Olvidaste tu contraseña?</a>
      </div>
    </div>
  </div>

  <!-- MODAL: SINCRONIZAR MYANIMELIST / ANILIST -->
  <div class="ny-dialog" id="modal-mal" onclick="cerrarModales(event)">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title">🔄 Importar MyAnimeList / AniList</div>
        <div class="ny-dialog-close" onclick="cerrarModales()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">
        Ingresa tu nombre de usuario público para importar automáticamente tus listas a Favoritos y Seguimiento.
      </div>
      <div id="mal-import-error" style="display:none; background:rgba(239,68,68,0.15); border:1px solid #ef4444; border-radius:10px; padding:10px 12px; margin-bottom:12px; font-size:12px; color:#fca5a5; font-weight:600;"></div>
      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <select id="select-servicio-sync" style="background:var(--bg-card); color:white; border:1px solid var(--border-color); padding:10px; border-radius:10px; font-family:inherit; font-size:12px;">
          <option value="anilist">AniList</option>
          <option value="mal">MyAnimeList (MAL)</option>
        </select>
        <input type="text" id="input-mal-username" style="flex:1; background:var(--bg-card); border:1px solid var(--border-color); padding:10px 12px; border-radius:10px; color:white; font-family:inherit; font-size:13px;" placeholder="Tu Usuario">
      </div>
      <button class="btn-download-season" id="btn-mal-sync" style="width:100%; justify-content:center; padding:12px;" onclick="sincronizarListaExterna()">
        📥 Importar mis Animes y Mangas
      </button>
    </div>
  </div>

  <!-- MODAL: BUZÓN DE SUGERENCIAS Y REPORTES -->
  <div class="ny-dialog" id="modal-sugerencias" onclick="cerrarModales(event)">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title">📮 Caja de Sugerencias</div>
        <div class="ny-dialog-close" onclick="cerrarModales()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
        ¿Falta algún anime, temporada, o tienes una sugerencia? Escríbenos directamente:
      </div>
      <select id="select-sug-tipo" style="width:100%; background:var(--bg-card); color:white; border:1px solid var(--border-color); padding:10px; border-radius:10px; font-family:inherit; font-size:12px; margin-bottom:10px;">
        <option value="Peticion">📺 Pedir nuevo Anime o Temporada</option>
        <option value="Reporte">⚠️ Reportar servidor o episodio caído</option>
        <option value="Mejora">💡 Idea / Sugerencia para la App</option>
      </select>
      <textarea id="textarea-sugerencia" style="width:100%; background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; padding:10px; color:white; font-family:inherit; font-size:12px; min-height:80px; margin-bottom:14px;" placeholder="Detalla tu sugerencia o anime que deseas ver..."></textarea>
      <button class="btn-download-season" style="width:100%; justify-content:center; padding:12px;" onclick="enviarSugerencia()">
        ✉️ Enviar Sugerencia
      </button>
    </div>
  </div>

  <!-- MODAL: INSTALAR APP EN EL CELULAR (PWA) -->
  <div class="ny-dialog" id="modal-pwa-install" onclick="cerrarModales(event)">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title">📲 Instalar NyAnime TV en tu Celular</div>
        <div class="ny-dialog-close" onclick="cerrarModales()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div style="font-size:12.5px; color:var(--text-muted); margin-bottom:14px; line-height:1.5;">
        Abre esta misma página en el navegador de tu teléfono para instalar <strong>NyAnime TV</strong> como app independiente (icono propio, pantalla completa y carga rápida).
      </div>

      <button id="modal-pwa-native-btn" class="btn-download-season hide" style="width:100%; justify-content:center; padding:12px; margin-bottom:14px;" onclick="window.NyAnimePWA?.install()">
        ⚡ Instalar Aplicación Ahora
      </button>

      <div id="modal-pwa-android-steps" class="pwa-step-box">
        <strong>🤖 Android (Google Chrome / Edge):</strong>
        <ol>
          <li>Abre esta app en <strong>Chrome</strong> desde tu celular.</li>
          <li>Toca el menú de <strong>tres puntos (⋮)</strong> arriba a la derecha.</li>
          <li>Selecciona <strong>"Instalar aplicación"</strong> o <strong>"Añadir a pantalla de inicio"</strong>.</li>
          <li>Confirma en <strong>Instalar</strong> y aparecerá con su icono en tu cajón de apps.</li>
        </ol>
      </div>

      <div id="modal-pwa-ios-steps" class="pwa-step-box">
        <strong>🍎 iPhone / iPad (Safari):</strong>
        <ol>
          <li>Abre esta URL en <strong>Safari</strong> (requerido en iOS).</li>
          <li>Toca el botón <strong>Compartir</strong> (cuadro con flecha hacia arriba).</li>
          <li>Desliza y elige <strong>"Añadir a pantalla de inicio"</strong>.</li>
          <li>Toca <strong>Añadir</strong> arriba a la derecha.</li>
        </ol>
      </div>

      <button class="oled-btn-secondary" style="width:100%; justify-content:center;" onclick="cerrarModales()">
        Entendido
      </button>
    </div>
  </div>

  <!-- MODAL: NUEVA LISTA PERSONALIZADA -->
  <div class="ny-dialog" id="modal-custom-list" onclick="cerrarModales(event)">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title">📁 Nueva Colección Personalizada</div>
        <div class="ny-dialog-close" onclick="cerrarModales()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
        Crea carpetas temáticas como "Para ver el finde", "Top Isekai" o "Clásicos 90s" para organizar tus animes y mangas.
      </div>
      <div style="margin-bottom:12px;">
        <div class="avatar-section-label">NOMBRE DE LA COLECCIÓN</div>
        <input type="text" id="input-custom-list-name" maxlength="48" style="width:100%; background:var(--bg-card); border:1px solid var(--border-color); padding:10px 12px; border-radius:10px; color:white; font-family:inherit; font-size:13px;" placeholder="Ej. Maratón de Finde">
      </div>
      <div style="margin-bottom:12px;">
        <div class="avatar-section-label">ICONO</div>
        <div class="custom-list-icon-row" id="custom-list-icon-row">
          <button type="button" class="chip active" data-icon="📁" onclick="seleccionarIconoListaNueva('📁', this)">📁</button>
          <button type="button" class="chip" data-icon="⭐" onclick="seleccionarIconoListaNueva('⭐', this)">⭐</button>
          <button type="button" class="chip" data-icon="🔥" onclick="seleccionarIconoListaNueva('🔥', this)">🔥</button>
          <button type="button" class="chip" data-icon="🎌" onclick="seleccionarIconoListaNueva('🎌', this)">🎌</button>
          <button type="button" class="chip" data-icon="📚" onclick="seleccionarIconoListaNueva('📚', this)">📚</button>
          <button type="button" class="chip" data-icon="💎" onclick="seleccionarIconoListaNueva('💎', this)">💎</button>
          <button type="button" class="chip" data-icon="🌙" onclick="seleccionarIconoListaNueva('🌙', this)">🌙</button>
          <button type="button" class="chip" data-icon="⚡" onclick="seleccionarIconoListaNueva('⚡', this)">⚡</button>
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <div class="avatar-section-label">COLOR DE ETIQUETA</div>
        <div class="custom-list-color-row" id="custom-list-color-row">
          <button type="button" class="color-swatch-btn active" style="background:#ff1a40;" data-color="#ff1a40" onclick="seleccionarColorListaNueva('#ff1a40', this)" aria-label="Rojo"></button>
          <button type="button" class="color-swatch-btn" style="background:#38bdf8;" data-color="#38bdf8" onclick="seleccionarColorListaNueva('#38bdf8', this)" aria-label="Azul"></button>
          <button type="button" class="color-swatch-btn" style="background:#a78bfa;" data-color="#a78bfa" onclick="seleccionarColorListaNueva('#a78bfa', this)" aria-label="Violeta"></button>
          <button type="button" class="color-swatch-btn" style="background:#34d399;" data-color="#34d399" onclick="seleccionarColorListaNueva('#34d399', this)" aria-label="Verde"></button>
          <button type="button" class="color-swatch-btn" style="background:#fbbf24;" data-color="#fbbf24" onclick="seleccionarColorListaNueva('#fbbf24', this)" aria-label="Ámbar"></button>
          <button type="button" class="color-swatch-btn" style="background:#fb7185;" data-color="#fb7185" onclick="seleccionarColorListaNueva('#fb7185', this)" aria-label="Rosa"></button>
        </div>
      </div>
      <button type="button" class="btn-download-season" style="width:100%; justify-content:center; padding:12px;" onclick="crearListaPersonalizada()">
        Crear Colección
      </button>
    </div>
  </div>

  <!-- MODAL: CALIFICACIÓN Y NOTAS PERSONALES -->
  <div class="ny-dialog" id="modal-personal-review" onclick="cerrarModales(event)">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title" id="review-modal-title">⭐ Calificar y Escribir Nota</div>
        <div class="ny-dialog-close" onclick="cerrarModales()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div id="review-modal-subtitle" style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Puntuación personal (1–10 ★) y notas privadas</div>
      <div style="margin-bottom:12px;">
        <div class="avatar-section-label">TU PUNTUACIÓN (1–10)</div>
        <div class="score-picker-grid" id="review-score-picker"></div>
      </div>
      <div style="margin-bottom:12px;">
        <div class="avatar-section-label">RESEÑA CORTA (HASTA 280 CARACTERES)</div>
        <textarea id="input-personal-review" maxlength="280" style="width:100%; background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; padding:10px; color:white; font-family:inherit; font-size:12px; min-height:68px;" placeholder="Tu opinión breve sobre la serie..."></textarea>
      </div>
      <div style="margin-bottom:14px;">
        <div class="avatar-section-label">NOTAS PRIVADAS (SOLO PARA TI · EJ. EPISODIO O RECORDATORIO)</div>
        <textarea id="input-personal-notes" maxlength="500" style="width:100%; background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; padding:10px; color:white; font-family:inherit; font-size:12px; min-height:68px;" placeholder="Notas personales privadas..."></textarea>
      </div>
      <div class="oled-btn-row">
        <button type="button" class="oled-btn-secondary" onclick="cerrarModales()">Cancelar</button>
        <button type="button" class="btn-download-season" style="flex:1; justify-content:center;" onclick="guardarResenaPersonal()">Guardar Calificación</button>
      </div>
    </div>
  </div>

  <!-- MODAL: RESUMEN SEMANAL -->
  <div class="ny-dialog" id="modal-weekly-summary" onclick="cerrarModales(event)">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title">📊 Tu Resumen Semanal</div>
        <div class="ny-dialog-close" onclick="cerrarModales()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div id="weekly-summary-body"></div>
    </div>
  </div>

  <!-- MODAL: LIMPIAR PERFIL (3 CONFIRMACIONES SECUENCIALES) -->
  <div class="ny-dialog" id="modal-wipe-profile" onclick="if(event.target===this) cancelarLimpiarPerfil()">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title" style="color:#ff8ea0;">⚠️ Restablecer Perfil</div>
        <div class="ny-dialog-close" onclick="cancelarLimpiarPerfil()" aria-label="Cerrar confirmación de limpieza">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div class="wipe-step-badge" id="wipe-step-badge">Confirmación 1 de 3</div>
      <div class="wipe-progress-track">
        <div class="wipe-progress-fill" id="wipe-progress-fill" style="width:33%;"></div>
      </div>
      <div id="wipe-step-title" style="font-size:17px; font-weight:800; color:#fff; margin-bottom:6px;"></div>
      <div id="wipe-step-warning" style="font-size:12.5px; color:#fecdd3; background:rgba(244,63,94,0.12); border:1px solid rgba(244,63,94,0.3); border-radius:10px; padding:10px 12px; margin-bottom:10px; line-height:1.45;"></div>
      <ul id="wipe-step-bullets" class="wipe-bullets-list"></ul>
      <div class="oled-btn-row" style="margin-top:14px;">
        <button type="button" class="oled-btn-secondary" id="wipe-btn-cancel" onclick="cancelarLimpiarPerfil()">Cancelar</button>
        <button type="button" class="oled-btn-secondary danger-tint" id="wipe-btn-confirm" style="flex:1; justify-content:center; font-weight:800;" onclick="avanzarLimpiarPerfil()">Continuar</button>
      </div>
    </div>
  </div>

  <!-- MODAL: CONTRASEÑA DE SALA WATCH TOGETHER -->
  <div class="ny-dialog" id="modal-wt-join-pass" onclick="if(event.target===this) cerrarModalPasscodeWatchTogether()">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title">🔒 Sala Protegida</div>
        <div class="ny-dialog-close" onclick="cerrarModalPasscodeWatchTogether()" aria-label="Cerrar acceso de sala">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div id="wt-join-modal-sub" style="font-size:12.5px; color:var(--text-muted); margin-bottom:12px;">
        Ingresa la contraseña de la sala o pega el enlace completo de invitación que compartió el anfitrión.
      </div>
      <input type="text"
             id="wt-join-pass-input"
             class="wt-code-input"
             style="width:100%; margin-bottom:8px; text-transform:none;"
             placeholder="Contraseña de la sala o URL con ?room=...&k=..."
             maxlength="240"
             aria-label="Contraseña o enlace de invitación"
             onkeydown="if(event.key==='Enter'){ event.preventDefault(); confirmarPasscodeWatchTogether(); }">
      <div id="wt-join-pass-error" style="display:none; color:#fb7185; font-size:12px; font-weight:700; margin-bottom:10px;"></div>
      <div class="oled-btn-row" style="margin-top:8px;">
        <button type="button" class="oled-btn-secondary" onclick="cerrarModalPasscodeWatchTogether()">Cancelar</button>
        <button type="button" class="btn-download-season" id="wt-join-pass-submit" style="flex:1; justify-content:center;" onclick="confirmarPasscodeWatchTogether()">🔓 Verificar y Entrar</button>
      </div>
    </div>
  </div>
`;

export function ensureModalsMounted(): void {
  const root = document.getElementById('ny-modals-root');
  if (!root || root.dataset.mounted === '1') return;
  root.innerHTML = MODALS_MARKUP;
  root.dataset.mounted = '1';

  root.querySelectorAll('.modal-overlay, .ny-dialog').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cerrarModales();
      }
    });
  });
}

let authModalMode: 'login' | 'register' = 'login';
const AVATAR_SEEDS = ['Gojo', 'Frieren', 'Tanjiro', 'Luffy', 'Rimuru', 'Anya', 'Zoro', 'Megumin'];
let avatarSeleccionado = '';

export async function iniciarSesionGoogle(): Promise<void> {
  try {
    showToast('Conectando con Google...');
    const auth = nWin.FirebaseAuth || nWin.NyAnime?.Core?.firebaseAuthManager;
    if (auth && typeof auth.signInWithGoogle === 'function') {
      await auth.signInWithGoogle();
      UserManager.renderProfile();
      showToast('¡Sesión iniciada con Google!');
      if (nWin.NyAnime?.Core?.syncAll) {
        nWin.NyAnime.Core.syncAll().catch(() => {});
      }
    } else {
      showToast('Servicio de autenticación no disponible.');
    }
  } catch (err: any) {
    console.error('Error inicio Google:', err);
    showToast(err?.message || 'Error al iniciar sesión con Google');
  }
}

export function abrirModalAuthEmail(mode: 'login' | 'register' = 'login'): void {
  ensureModalsMounted();
  authModalMode = mode;
  const modal = document.getElementById('modal-auth-email');
  const title = document.getElementById('auth-modal-title');
  const submitBtn = document.getElementById('btn-auth-submit');
  const toggleLink = document.getElementById('toggle-auth-mode-link');
  const nameGroup = document.getElementById('auth-group-name');
  const errEl = document.getElementById('auth-email-error');

  if (errEl) errEl.style.display = 'none';

  if (mode === 'register') {
    if (title) title.textContent = '📝 Crear Cuenta NyAnime';
    if (submitBtn) submitBtn.textContent = 'Registrarme';
    if (toggleLink) toggleLink.textContent = '¿Ya tienes cuenta? Inicia Sesión';
    if (nameGroup) nameGroup.style.display = 'block';
  } else {
    if (title) title.textContent = '🔐 Iniciar Sesión con Correo';
    if (submitBtn) submitBtn.textContent = 'Iniciar Sesión';
    if (toggleLink) toggleLink.textContent = '¿No tienes cuenta? Regístrate';
    if (nameGroup) nameGroup.style.display = 'none';
  }

  if (modal) modal.classList.add('active');
}

export function toggleAuthModalMode(): void {
  abrirModalAuthEmail(authModalMode === 'login' ? 'register' : 'login');
}

export async function submitAuthEmail(): Promise<void> {
  const email = (document.getElementById('input-auth-email') as HTMLInputElement | null)?.value?.trim();
  const pass = (document.getElementById('input-auth-password') as HTMLInputElement | null)?.value?.trim();
  const name = (document.getElementById('input-auth-name') as HTMLInputElement | null)?.value?.trim();
  const errEl = document.getElementById('auth-email-error');
  const submitBtn = document.getElementById('btn-auth-submit') as HTMLButtonElement | null;

  if (!email || !pass) {
    if (errEl) {
      errEl.textContent = 'Por favor ingresa correo y contraseña.';
      errEl.style.display = 'block';
    }
    return;
  }

  if (errEl) errEl.style.display = 'none';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Procesando...';
  }

  try {
    const auth = nWin.FirebaseAuth || nWin.NyAnime?.Core?.firebaseAuthManager;
    if (!auth) throw new Error('Servicio de autenticación no inicializado');

    if (authModalMode === 'register') {
      await auth.signUpWithEmail(email, pass, name || 'Usuario');
      showToast('¡Cuenta creada exitosamente!');
    } else {
      await auth.signInWithEmail(email, pass);
      showToast('¡Sesión iniciada con éxito!');
    }

    cerrarModales();
    UserManager.renderProfile();
    if (nWin.NyAnime?.Core?.syncAll) {
      nWin.NyAnime.Core.syncAll().catch(() => {});
    }
  } catch (err: any) {
    console.error('Error auth email:', err);
    if (errEl) {
      errEl.textContent = err?.message || 'Error de autenticación';
      errEl.style.display = 'block';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = authModalMode === 'register' ? 'Registrarme' : 'Iniciar Sesión';
    }
  }
}

export async function recuperarContrasena(): Promise<void> {
  const email = (document.getElementById('input-auth-email') as HTMLInputElement | null)?.value?.trim();
  if (!email) {
    showToast('Ingresa tu correo para recuperar contraseña');
    return;
  }
  try {
    const auth = nWin.FirebaseAuth || nWin.NyAnime?.Core?.firebaseAuthManager;
    if (auth?.sendPasswordReset) {
      await auth.sendPasswordReset(email);
      showToast('Correo de recuperación enviado a ' + email);
    }
  } catch (err: any) {
    showToast(err?.message || 'Error al enviar correo de recuperación');
  }
}

export async function reenviarVerificacionCorreo(): Promise<void> {
  try {
    const auth = nWin.FirebaseAuth || nWin.NyAnime?.Core?.firebaseAuthManager;
    if (auth?.resendVerification) {
      await auth.resendVerification();
      showToast('Correo de verificación reenviado');
    }
  } catch (err: any) {
    showToast(err?.message || 'Error al reenviar verificación');
  }
}

export async function cerrarSesionUsuario(): Promise<void> {
  try {
    const auth = nWin.FirebaseAuth || nWin.NyAnime?.Core?.firebaseAuthManager;
    if (auth?.signOutUser) {
      await auth.signOutUser();
    }
    UserManager.renderProfile();
    showToast('Sesión cerrada. Continuando en modo invitado.');
  } catch (err) {
    console.error('Error al cerrar sesión:', err);
    showToast('Error al cerrar sesión');
  }
}

export async function forzarSyncFirebase(): Promise<void> {
  const fbUser = nWin.FirebaseAuth?.getCurrentUser ? nWin.FirebaseAuth.getCurrentUser() : null;
  if (!fbUser || fbUser.isAnonymous) {
    showToast('Conecta una cuenta para sincronizar en la nube');
    abrirModalAuthEmail('login');
    return;
  }

  const badge = document.getElementById('sync-status-badge');
  const text = document.getElementById('sync-status-text');
  const lastTime = document.getElementById('sync-last-time');

  if (badge) badge.className = 'sync-pill syncing';
  if (text) text.textContent = 'Sincronizando...';

  try {
    if (nWin.NyAnime?.Core?.syncAll) {
      await nWin.NyAnime.Core.syncAll();
    } else if (nWin.firebaseSync?.syncAll) {
      await nWin.firebaseSync.syncAll();
    }
    UserManager.renderProfile();
    if (lastTime) lastTime.textContent = 'Hace un momento';
    showToast('Sincronización en la nube completada ✓');
  } catch (err: any) {
    UserManager.renderProfile();
    showToast(err?.message || 'Sincronizado en almacenamiento local');
  }
}

export async function exportarBackupJSON(): Promise<void> {
  try {
    showToast('Generando copia de seguridad...');
    let backupData: any;
    if (nWin.NyAnime?.Core?.exportBackupJSON) {
      backupData = await nWin.NyAnime.Core.exportBackupJSON();
    } else if (nWin.firebaseSync?.exportBackupJSON) {
      backupData = await nWin.firebaseSync.exportBackupJSON();
    } else {
      backupData = {
        schemaVersion: '3.0.0',
        exportedAt: new Date().toISOString(),
        app: 'NyAnime TV',
        data: {
          favorites: FavoritesManager.getAll(),
          history: HistoryManager.getAll(),
          mangaProgress: MangaHistoryManager.getAll(),
          userProfile: UserManager.getUser()
        }
      };
    }

    const jsonStr = typeof backupData === 'string' ? backupData : JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `nyanime_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Copia de seguridad descargada con éxito');
  } catch (err) {
    console.error('Error exportando backup:', err);
    showToast('Error al exportar copia de seguridad');
  }
}

export function abrirImportarBackupJSON(): void {
  const input = document.getElementById('input-backup-json') as HTMLInputElement | null;
  if (input) input.click();
}

export async function importarBackupJSON(event: Event): Promise<void> {
  const target = event?.target as HTMLInputElement | null;
  const file = target?.files?.[0];
  if (!file) return;

  try {
    showToast('Restaurando respaldo...');
    const text = await file.text();
    const json = JSON.parse(text);

    if (nWin.NyAnime?.Core?.importBackupJSON) {
      await nWin.NyAnime.Core.importBackupJSON(json);
    } else if (nWin.firebaseSync?.importBackupJSON) {
      await nWin.firebaseSync.importBackupJSON(json);
    } else {
      const data = json.data || json;
      if (Array.isArray(data.favorites)) {
        safeStorageSetItem('nyanime_favorites_v2', JSON.stringify(compactFavoritesArray(data.favorites)));
      }
      if (data.userProfile) {
        UserManager.saveUser(data.userProfile);
      }
    }

    UserManager.renderProfile();
    uiHooks.renderFavoritos();
    uiHooks.renderContinuarViendo();
    uiHooks.renderContinuarLeyendoManga();
    showToast('¡Respaldo restaurado exitosamente!');
  } catch (err) {
    console.error('Error importando backup:', err);
    showToast('Error al restaurar archivo: formato inválido');
  } finally {
    if (target) target.value = '';
  }
}

export function abrirModalDescargas(): void {
  ensureModalsMounted();
  cancelarLimpiarDescargas();
  const searchEl = document.getElementById('gestor-search-input') as HTMLInputElement | null;
  if (searchEl) searchEl.value = DownloadManager.searchQuery || '';
  void DownloadManager.renderDownloadsModal();
  document.getElementById('modal-gestor-descargas')?.classList.add('active');
}

export function setDownloadManagerTab(tab: 'all' | 'anime' | 'watch-later' | 'manga'): void {
  DownloadManager.setTab(tab);
}

export function setDownloadManagerSearch(query: string): void {
  DownloadManager.setSearch(query);
}

export async function eliminarGrupoOffline(kind: 'anime' | 'manga', mediaId: string): Promise<void> {
  if (!nWin.NyAnimeOffline?.deleteOfflineSeriesGroup) return;
  const removed = await nWin.NyAnimeOffline.deleteOfflineSeriesGroup(kind, mediaId);
  await DownloadManager.renderDownloadsModal();
  await DownloadManager.updateBadge();
  if (state.tipoLecturaActual === 'OFFLINE') {
    void uiHooks.cargarMangasYNovelas();
  }
  if (typeof nWin.refreshOfflineMangaDetailState === 'function') {
    await nWin.refreshOfflineMangaDetailState(undefined, true);
  }
  if (typeof nWin.renderDetalleEpisodios === 'function') {
    nWin.renderDetalleEpisodios();
  }
  showToast(removed > 0 ? `Se eliminaron ${removed} elementos de la serie.` : 'No había elementos por eliminar.');
}

export function solicitarLimpiarDescargas(): void {
  document.getElementById('btn-clear-all-dl')?.classList.add('hide');
  document.getElementById('dl-clear-confirm-box')?.classList.remove('hide');
}

export function cancelarLimpiarDescargas(): void {
  document.getElementById('dl-clear-confirm-box')?.classList.add('hide');
  document.getElementById('btn-clear-all-dl')?.classList.remove('hide');
}

export async function confirmarLimpiarDescargas(): Promise<void> {
  cancelarLimpiarDescargas();
  await limpiarDescargasCompletadas();
}

export async function limpiarDescargasCompletadas(): Promise<void> {
  if (nWin.NyAnimeOffline?.clearAllOfflineStorage) {
    await nWin.NyAnimeOffline.clearAllOfflineStorage();
  }
  DownloadManager.save([]);
  await DownloadManager.renderDownloadsModal();
  if (state.tipoLecturaActual === 'OFFLINE') {
    void uiHooks.cargarMangasYNovelas();
  }
  if (typeof nWin.refreshOfflineMangaDetailState === 'function') {
    await nWin.refreshOfflineMangaDetailState(undefined, true);
  }
  if (typeof nWin.renderDetalleEpisodios === 'function') {
    nWin.renderDetalleEpisodios();
  }
  showToast('Almacenamiento offline limpiado.');
}

function syncAvatarPreviewUI(url: string): void {
  const cleanUrl = safeImg(url, DEFAULT_AVATAR_URL);
  const previewImg = document.getElementById('avatar-preview-img') as HTMLImageElement | null;
  const sourceLabel = document.getElementById('avatar-preview-source');
  const resetBtn = document.getElementById('btn-avatar-reset-preset');
  const isCustomGallery = isDataImageAvatar(cleanUrl);
  if (previewImg) previewImg.src = cleanUrl;
  if (sourceLabel) {
    sourceLabel.textContent = isCustomGallery ? 'Foto de tu galería · Lista para guardar' : 'Avatar predefinido';
  }
  if (resetBtn) {
    resetBtn.classList.toggle('hide', !isCustomGallery);
  }
}

export function setupAvatarOptions(): void {
  ensureModalsMounted();
  const grid = document.getElementById('avatar-grid-options');
  if (!grid) return;
  grid.innerHTML = '';
  const user = UserManager.getUser();
  avatarSeleccionado = user.avatar || DEFAULT_AVATAR_URL;
  syncAvatarPreviewUI(avatarSeleccionado);

  AVATAR_SEEDS.forEach(seed => {
    const url = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = `avatar-option ${avatarSeleccionado === url ? 'selected' : ''}`;
    opt.setAttribute('aria-label', `Avatar ${seed}`);
    opt.onclick = () => {
      document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      avatarSeleccionado = url;
      const errEl = document.getElementById('avatar-upload-error');
      if (errEl) {
        errEl.classList.add('hide');
        errEl.textContent = '';
      }
      syncAvatarPreviewUI(url);
    };
    opt.innerHTML = `<img src="${url}" alt="${seed}">`;
    grid.appendChild(opt);
  });
}

export function seleccionarFotoGaleriaAvatar(): void {
  ensureModalsMounted();
  const errEl = document.getElementById('avatar-upload-error');
  if (errEl) {
    errEl.classList.add('hide');
    errEl.textContent = '';
  }
  const input = document.getElementById('input-avatar-gallery') as HTMLInputElement | null;
  if (input) {
    input.value = '';
    input.click();
  }
}

export async function onAvatarGalleryFileChange(event: Event): Promise<void> {
  const input = event?.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  const btn = document.getElementById('btn-avatar-gallery') as HTMLButtonElement | null;
  const errEl = document.getElementById('avatar-upload-error');
  if (errEl) {
    errEl.classList.add('hide');
    errEl.textContent = '';
  }
  if (btn) btn.disabled = true;

  try {
    const compressedDataUrl = await compressAvatarImageInBrowser(file);
    avatarSeleccionado = compressedDataUrl;
    document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
    syncAvatarPreviewUI(compressedDataUrl);
    showToast('Foto cargada · Pulsa Guardar Cambios');
  } catch (err: any) {
    const msg = err?.message || 'No se pudo cargar la imagen seleccionada.';
    if (errEl) {
      errEl.textContent = msg;
      errEl.classList.remove('hide');
    }
    showToast(msg);
  } finally {
    if (btn) btn.disabled = false;
    if (input) input.value = '';
  }
}

export function restaurarAvatarPredeterminado(): void {
  avatarSeleccionado = DEFAULT_AVATAR_URL;
  setupAvatarOptions();
  const firstOpt = document.querySelector('#avatar-grid-options .avatar-option');
  if (firstOpt) firstOpt.classList.add('selected');
  syncAvatarPreviewUI(DEFAULT_AVATAR_URL);
}

export function abrirModalAvatar(): void {
  ensureModalsMounted();
  const user = UserManager.getUser();
  const input = document.getElementById('input-edit-username') as HTMLInputElement | null;
  if (input) input.value = user.username;
  const errEl = document.getElementById('avatar-upload-error');
  if (errEl) {
    errEl.classList.add('hide');
    errEl.textContent = '';
  }
  setupAvatarOptions();
  document.getElementById('modal-avatar')?.classList.add('active');
}

export function guardarPerfilUsuario(): void {
  const input = document.getElementById('input-edit-username') as HTMLInputElement | null;
  const name = input?.value.trim().slice(0, 80) || 'Invitado';
  const user = UserManager.getUser();
  user.username = name;
  if (avatarSeleccionado) user.avatar = avatarSeleccionado;
  user.profileUpdatedAt = Date.now();
  UserManager.saveUser(user);
  if (nWin.FirebaseAuth?.updateAuthProfile) {
    nWin.FirebaseAuth.updateAuthProfile(user.username, user.avatar, user.profileUpdatedAt);
  }
  cerrarModales();
  showToast('Perfil actualizado correctamente');
}

export function abrirModalVip(): void {
  ensureModalsMounted();
  const user = UserManager.getUser();
  const fbUser = nWin.FirebaseAuth?.getCurrentUser ? nWin.FirebaseAuth.getCurrentUser() : null;
  const isLoggedIn = Boolean(fbUser && !fbUser.isAnonymous);
  const eps = Number(user.stats?.episodesWatched || 0);
  const secs = Number(user.stats?.totalSecondsWatched || 0);
  const chaps = UserManager.getTotalChaptersRead();
  const rank = nWin.NyAnimeUtils?.computeUserRank
    ? nWin.NyAnimeUtils.computeUserRank(eps, chaps, isLoggedIn ? user.role : 'FREE')
    : { icon: '🌱', label: 'Novato', points: eps };

  const curEl = document.getElementById('rank-modal-current');
  const sumEl = document.getElementById('rank-modal-summary');
  if (curEl) curEl.textContent = `${rank.icon} Rango actual: ${rank.label}`;
  if (sumEl) {
    sumEl.textContent = `${eps} eps vistos · ${formatWatchDuration(secs)} reales · ${chaps} caps leídos · ${rank.points} pts`;
  }
  document.getElementById('modal-vip')?.classList.add('active');
}

export function abrirModalImportarMAL(): void {
  ensureModalsMounted();
  const errEl = document.getElementById('mal-import-error');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
  document.getElementById('modal-mal')?.classList.add('active');
}

export async function sincronizarListaExterna(): Promise<void> {
  const username = (document.getElementById('input-mal-username') as HTMLInputElement | null)?.value.trim() || '';
  const servicio = (document.getElementById('select-servicio-sync') as HTMLSelectElement | null)?.value || 'anilist';
  const errEl = document.getElementById('mal-import-error');
  const syncBtn = document.getElementById('btn-mal-sync') as HTMLButtonElement | null;

  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }

  if (!username) {
    if (errEl) {
      errEl.textContent = 'Ingresa tu nombre de usuario público para importar.';
      errEl.style.display = 'block';
    }
    return;
  }

  if (!nWin.NyAnimeImporters?.importExternalList) {
    showToast('Importador no inicializado.');
    return;
  }

  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.textContent = `Conectando con ${servicio.toUpperCase()}...`;
  }

  try {
    const result = await nWin.NyAnimeImporters.importExternalList(servicio, username);
    const addedAnimes = FavoritesManager.importList(result.animes);
    let addedMangas = 0;
    if (Array.isArray(result.mangas) && result.mangas.length > 0) {
      const curMangas = MangaFavoritesManager.getAll();
      result.mangas.forEach((m: any) => {
        if (!curMangas.some((x) => String(x.id) === String(m.id))) {
          curMangas.unshift(compactMangaEntry(m) || m);
          addedMangas++;
        }
      });
      safeStorageSetItem(MangaFavoritesManager.KEY, JSON.stringify(curMangas));
      if (addedMangas > 0 && nWin.firebaseSync?.scheduleSync) {
        nWin.firebaseSync.scheduleSync('manga_favorites_import');
      }
      uiHooks.renderFavoritos();
      UserManager.renderProfile();
    }
    cerrarModales();
    showToast(`✅ Importados ${addedAnimes} animes y ${addedMangas} mangas de ${username} (${servicio.toUpperCase()})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo importar la lista.';
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }
    showToast(msg);
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.textContent = '📥 Importar mis Animes y Mangas';
    }
  }
}

export function abrirModalSugerencias(): void {
  ensureModalsMounted();
  document.getElementById('modal-sugerencias')?.classList.add('active');
}

export function enviarSugerencia(): void {
  const tipo = (document.getElementById('select-sug-tipo') as HTMLSelectElement | null)?.value || 'Mejora';
  const textarea = document.getElementById('textarea-sugerencia') as HTMLTextAreaElement | null;
  const texto = textarea?.value.trim() || '';

  if (!texto) {
    showToast('Por favor escribe tu sugerencia.');
    return;
  }

  SuggestionsManager.add(tipo, texto);
  if (textarea) textarea.value = '';
  cerrarModales();
  showToast('💌 ¡Muchas gracias! Tu sugerencia ha sido enviada al creador.');
}

let pendingListColor = '#ff1a40';
let pendingListIcon = '📁';
let pendingReviewTarget: { kind: 'anime' | 'manga'; item: any; score: number | null } | null = null;

export function abrirModalNuevaLista(): void {
  ensureModalsMounted();
  pendingListColor = '#ff1a40';
  pendingListIcon = '📁';
  const input = document.getElementById('input-custom-list-name') as HTMLInputElement | null;
  if (input) input.value = '';
  document.querySelectorAll('#custom-list-icon-row .chip').forEach((c) => {
    c.classList.toggle('active', (c as HTMLElement).dataset.icon === '📁');
  });
  document.querySelectorAll('#custom-list-color-row .color-swatch-btn').forEach((c) => {
    c.classList.toggle('active', (c as HTMLElement).dataset.color === '#ff1a40');
  });
  document.getElementById('modal-custom-list')?.classList.add('active');
}

export function seleccionarIconoListaNueva(icon: string, btn?: HTMLElement | null): void {
  pendingListIcon = icon || '📁';
  document.querySelectorAll('#custom-list-icon-row .chip').forEach((c) => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

export function seleccionarColorListaNueva(color: string, btn?: HTMLElement | null): void {
  pendingListColor = color || '#ff1a40';
  document.querySelectorAll('#custom-list-color-row .color-swatch-btn').forEach((c) => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

export function crearListaPersonalizada(): void {
  const input = document.getElementById('input-custom-list-name') as HTMLInputElement | null;
  const rawName = sanitizeShortText(input?.value || '', 48);
  if (!rawName) {
    showToast('Escribe un nombre para la colección.');
    return;
  }
  const created = CustomListsManager.create(rawName, {
    color: pendingListColor,
    icon: pendingListIcon
  });
  if (!created) return;
  cerrarModales();
  showToast(`${created.icon} Lista "${created.name}" creada`);
}

function renderReviewScorePicker(): void {
  const wrap = document.getElementById('review-score-picker');
  if (!wrap || !pendingReviewTarget) return;
  const current = pendingReviewTarget.score;
  const scores: Array<number | null> = [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  wrap.innerHTML = scores
    .map((s) => {
      const isSelected = current === s;
      const label = s === null ? 'Sin nota' : `★ ${s}`;
      return `<button type="button" class="score-pill-btn ${isSelected ? 'active' : ''}" onclick="seleccionarPuntuacionModal(${s === null ? 'null' : s})">${label}</button>`;
    })
    .join('');
}

export function seleccionarPuntuacionModal(score: number | null): void {
  if (!pendingReviewTarget) return;
  pendingReviewTarget.score = score === null ? null : sanitizeUserScore(score);
  renderReviewScorePicker();
}

export function abrirModalResenaPersonal(kind: 'anime' | 'manga', itemId: string | number): void {
  ensureModalsMounted();
  let item: any = null;
  if (kind === 'anime') {
    const activeDet = nWin.getActiveDetailAnimeEntry?.();
    item =
      FavoritesManager.getEntry(itemId) ||
      (activeDet && String(activeDet.id) === String(itemId) ? activeDet : null) ||
      (state.anime && String(state.anime.id) === String(itemId) ? state.anime : null) ||
      activeDet ||
      state.anime;
  } else {
    const activeM = getActiveManga();
    item =
      MangaFavoritesManager.getEntry(itemId) ||
      (activeM && String(activeM.id) === String(itemId) ? activeM : null) ||
      activeM;
  }
  if (!item) {
    showToast('Guarda primero el título en tu biblioteca para calificarlo.');
    return;
  }

  pendingReviewTarget = {
    kind,
    item,
    score: sanitizeUserScore(item.userScore)
  };

  const titleEl = document.getElementById('review-modal-title');
  const subEl = document.getElementById('review-modal-subtitle');
  const revEl = document.getElementById('input-personal-review') as HTMLTextAreaElement | null;
  const notesEl = document.getElementById('input-personal-notes') as HTMLTextAreaElement | null;

  const displayTitle =
    kind === 'anime'
      ? item.title?.english || item.title?.romaji || 'Anime'
      : item.title || 'Manga';

  if (titleEl) titleEl.textContent = `⭐ ${displayTitle}`;
  if (subEl) subEl.textContent = kind === 'anime' ? 'Calificación (se sincroniza con AniList/MAL si está conectado)' : 'Calificación y notas privadas de manga';
  if (revEl) revEl.value = String(item.userReview || '');
  if (notesEl) notesEl.value = String(item.userNotes || '');
  renderReviewScorePicker();
  document.getElementById('modal-personal-review')?.classList.add('active');
}

export function guardarResenaPersonal(): void {
  if (!pendingReviewTarget) return;
  const revEl = document.getElementById('input-personal-review') as HTMLTextAreaElement | null;
  const notesEl = document.getElementById('input-personal-notes') as HTMLTextAreaElement | null;
  const patch = {
    userScore: pendingReviewTarget.score,
    userReview: revEl?.value || '',
    userNotes: notesEl?.value || ''
  };
  const ok =
    pendingReviewTarget.kind === 'anime'
      ? FavoritesManager.setRatingAndNotes(pendingReviewTarget.item, patch)
      : MangaFavoritesManager.setRatingAndNotes(pendingReviewTarget.item, patch);

  if (ok) {
    cerrarModales();
    showToast('Calificación y notas guardadas ★');
  }
}

export function abrirModalResumenSemanal(): void {
  ensureModalsMounted();
  const bodyEl = document.getElementById('weekly-summary-body');
  if (!bodyEl) return;

  const digest = buildWeeklyDigestSummary({
    history: HistoryManager.getAll(),
    mangaHistory: MangaHistoryManager.getAll(),
    favorites: FavoritesManager.getAll()
  });

  bodyEl.innerHTML = `
    <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">${escHtml(digest.weekLabel)}</div>
    <div style="background:rgba(255,26,64,0.08); border:1px solid rgba(255,26,64,0.28); border-radius:12px; padding:12px; margin-bottom:12px; font-size:13px; color:#fff; font-weight:700;">
      ${escHtml(digest.headline)}
    </div>
    <div class="weekly-digest-grid">
      <div class="stat-card"><div class="stat-label">Episodios</div><div class="stat-num">${digest.episodesWatchedCount}</div></div>
      <div class="stat-card"><div class="stat-label">Minutos</div><div class="stat-num">${digest.minutesWatched}m</div></div>
      <div class="stat-card"><div class="stat-label">Mangas</div><div class="stat-num">${digest.chaptersReadCount}</div></div>
      <div class="stat-card"><div class="stat-label">Series activas</div><div class="stat-num">${digest.activeSeriesCount}</div></div>
    </div>
    ${
      digest.watchingTitles.length > 0
        ? `<div style="margin:12px 0; font-size:12px; color:var(--text-muted);">
            <strong style="color:#fff;">Actualmente viendo:</strong> ${digest.watchingTitles.map((t) => escHtml(t)).join(' · ')}
           </div>`
        : ''
    }
    <div class="oled-btn-row" style="margin-top:12px;">
      <button type="button" class="oled-btn-secondary" onclick="enviarResumenSemanalPush()">📲 Enviar como Push</button>
      <button type="button" class="btn-download-season" style="flex:1; justify-content:center;" onclick="cerrarModales()">Cerrar</button>
    </div>
  `;
  document.getElementById('modal-weekly-summary')?.classList.add('active');
}

let profileWipeCurrentStep: 1 | 2 | 3 = 1;
let profileWipeInFlight = false;

function renderProfileWipeStepUI(): void {
  const meta = getProfileWipeStep(profileWipeCurrentStep);
  const badgeEl = document.getElementById('wipe-step-badge');
  const fillEl = document.getElementById('wipe-progress-fill');
  const titleEl = document.getElementById('wipe-step-title');
  const warnEl = document.getElementById('wipe-step-warning');
  const bulletsEl = document.getElementById('wipe-step-bullets');
  const confirmBtn = document.getElementById('wipe-btn-confirm') as HTMLButtonElement | null;
  const cancelBtn = document.getElementById('wipe-btn-cancel') as HTMLButtonElement | null;

  if (badgeEl) badgeEl.textContent = meta.badge;
  if (fillEl) fillEl.style.width = `${Math.round((meta.step / 3) * 100)}%`;
  if (titleEl) titleEl.textContent = meta.title;
  if (warnEl) warnEl.textContent = meta.warning;
  if (bulletsEl) {
    bulletsEl.innerHTML = meta.bullets.map((b) => `<li>${escHtml(b)}</li>`).join('');
  }
  if (confirmBtn) {
    confirmBtn.disabled = profileWipeInFlight;
    confirmBtn.textContent = profileWipeInFlight ? 'Limpiando perfil...' : meta.confirmLabel;
    confirmBtn.classList.toggle('is-final-danger', meta.step === 3);
  }
  if (cancelBtn) {
    cancelBtn.disabled = profileWipeInFlight;
  }
}

export function solicitarLimpiarPerfil(): void {
  ensureModalsMounted();
  profileWipeCurrentStep = 1;
  profileWipeInFlight = false;
  renderProfileWipeStepUI();
  document.getElementById('modal-wipe-profile')?.classList.add('active');
}

export function cancelarLimpiarPerfil(): void {
  if (profileWipeInFlight) return;
  profileWipeCurrentStep = 1;
  document.getElementById('modal-wipe-profile')?.classList.remove('active');
}

export async function confirmarLimpiarPerfilFinal(): Promise<void> {
  if (profileWipeInFlight) return;
  profileWipeInFlight = true;
  renderProfileWipeStepUI();

  try {
    await nWin.NyAnimePWA?.unsubscribeWebPush?.().catch(() => false);
    await OfflineService.clearAllOfflineStorage().catch(() => {});
    if (nWin.NyAnime?.Core?.wipeAllUserData) {
      await nWin.NyAnime.Core.wipeAllUserData().catch(() => {});
    } else if (nWin.firebaseSync?.wipeAllUserData) {
      await nWin.firebaseSync.wipeAllUserData().catch(() => {});
    }

    const keysToRemove = collectNyAnimeStorageKeys(Object.keys(localStorage));
    for (const k of keysToRemove) {
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore storage removal errors
      }
    }

    DownloadManager.save([]);
    await DownloadManager.updateBadge().catch(() => {});
    UserManager.renderProfile();
    uiHooks.renderProfileUI();
    uiHooks.renderFavoritos();
    uiHooks.renderContinuarViendo();
    uiHooks.renderContinuarLeyendoManga();
    uiHooks.renderEmisionDiasChips();
    uiHooks.renderEmisionDia(state.diaEmisionActual);
    uiHooks.renderSmartRecommendations();

    profileWipeCurrentStep = 1;
    document.getElementById('modal-wipe-profile')?.classList.remove('active');
    showToast('🧹 Perfil limpiado por completo. Ahora está como nuevo.');
  } finally {
    profileWipeInFlight = false;
  }
}

export async function avanzarLimpiarPerfil(): Promise<void> {
  if (profileWipeInFlight) return;
  if (profileWipeCurrentStep < 3) {
    profileWipeCurrentStep = (profileWipeCurrentStep + 1) as 2 | 3;
    renderProfileWipeStepUI();
    return;
  }
  await confirmarLimpiarPerfilFinal();
}


