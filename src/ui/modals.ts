import {
  DownloadManager,
  FavoritesManager,
  MangaFavoritesManager,
  MangaHistoryManager,
  HistoryManager,
  SuggestionsManager,
  UserManager,
  cerrarModales,
  nWin,
  showToast,
  uiHooks
} from './appState.ts';

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

  <!-- MODAL: DESCARGA DE TEMPORADA COMPLETA -->
  <div class="ny-dialog" id="modal-descarga-temporada" onclick="cerrarModales(event)">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title">⚡ Descarga en Lote de Temporada</div>
        <div class="ny-dialog-close" onclick="cerrarModales()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;" id="descarga-temporada-info">Selecciona los capítulos que deseas descargar en .MP4:</div>

      <div id="season-dl-progress-box" class="hide" style="background:rgba(255,26,64,0.08); border:1px solid rgba(255,26,64,0.3); border-radius:12px; padding:12px; margin-bottom:12px;">
        <div id="season-dl-progress-text" style="font-size:12px; font-weight:700; color:#fff; margin-bottom:8px;">Preparando descarga de episodios .MP4...</div>
        <div style="width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:999px; overflow:hidden; margin-bottom:10px;">
          <div id="season-dl-progress-bar" style="width:0%; height:100%; background:var(--primary); transition:width 0.15s ease;"></div>
        </div>
        <button type="button" class="chip" style="width:100%; justify-content:center; border-color:rgba(255,26,64,0.4); color:#ff4d6d;" onclick="cancelarDescargaTemporada()">Cancelar descarga</button>
      </div>

      <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
        <button type="button" class="chip active" onclick="toggleTodosEpisodiosDescarga(true)">Seleccionar Todos</button>
        <button type="button" class="chip" onclick="toggleTodosEpisodiosDescarga(false)">Deseleccionar</button>
      </div>

      <div class="download-ep-list" id="descarga-ep-list"></div>

      <div style="margin-bottom:15px;">
        <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">CALIDAD Y SERVIDOR</div>
        <div style="display:flex; gap:8px;">
          <select id="select-calidad-descarga" style="flex:1; background:var(--bg-card); color:white; border:1px solid var(--border-color); padding:8px; border-radius:10px; font-family:inherit; font-size:12px;">
            <option value="1080p">1080p Full HD (.MP4 Directo · MP4Upload / YourUpload)</option>
            <option value="720p">720p HD Rápido (.MP4)</option>
          </select>
        </div>
      </div>

      <button type="button" id="btn-start-season-dl" class="btn-download-season" style="width:100%; justify-content:center; padding:12px;" onclick="iniciarDescargaLote()">
        🚀 Descargar Episodios Seleccionados (.MP4)
      </button>
    </div>
  </div>

  <!-- MODAL: GESTOR DE DESCARGAS -->
  <div class="ny-dialog" id="modal-gestor-descargas" onclick="cerrarModales(event)">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title">📥 Gestor de Descargas</div>
        <div class="ny-dialog-close" onclick="cerrarModales()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div id="gestor-storage-summary" style="font-size:11.5px; color:var(--text-muted); background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:10px; padding:9px 12px; margin-bottom:10px;">
        Calculando almacenamiento offline...
      </div>
      <div class="download-ep-list" id="gestor-downloads-list">
        <div style="text-align:center; color:var(--text-muted); font-size:12px; padding:20px;">No hay descargas activas.</div>
      </div>
      <button class="chip" style="width:100%; margin-top:10px;" onclick="limpiarDescargasCompletadas()">Eliminar Todo del Dispositivo</button>
    </div>
  </div>

  <!-- MODAL: CAMBIAR AVATAR -->
  <div class="ny-dialog" id="modal-avatar" onclick="cerrarModales(event)">
    <div class="ny-sheet" onclick="event.stopPropagation()">
      <div class="ny-dialog-header">
        <div class="ny-dialog-title">🎭 Elegir Avatar de Anime</div>
        <div class="ny-dialog-close" onclick="cerrarModales()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
      <div class="avatar-grid" id="avatar-grid-options"></div>

      <div style="margin-top:10px;">
        <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">NOMBRE DE USUARIO</div>
        <input type="text" id="input-edit-username" style="width:100%; background:var(--bg-card); border:1px solid var(--border-color); padding:10px 12px; border-radius:10px; color:white; font-family:inherit; font-size:13px;" placeholder="Tu Nombre">
      </div>
      <button class="chip active" style="width:100%; margin-top:14px; padding:10px;" onclick="guardarPerfilUsuario()">Guardar Cambios</button>
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
          <div class="pwa-step-box" style="margin:0;"><strong>🌱 Novato</strong> (0 – 14 pts): Inicio de viaje en NyAnime TV.</div>
          <div class="pwa-step-box" style="margin:0;"><strong>⚡ Otaku</strong> (15 – 49 pts): Maratonista habitual de anime y manga.</div>
          <div class="pwa-step-box" style="margin:0;"><strong>👑 Leyenda</strong> (50+ pts): Coleccionista veterano verificado por actividad real.</div>
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
        localStorage.setItem('nyanime_favorites_v2', JSON.stringify(data.favorites));
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
  void DownloadManager.renderDownloadsModal();
  document.getElementById('modal-gestor-descargas')?.classList.add('active');
}

export async function limpiarDescargasCompletadas(): Promise<void> {
  if (nWin.NyAnimeOffline?.clearAllOfflineStorage) {
    await nWin.NyAnimeOffline.clearAllOfflineStorage();
  }
  DownloadManager.save([]);
  await DownloadManager.renderDownloadsModal();
  showToast('Almacenamiento offline limpiado.');
}

export function setupAvatarOptions(): void {
  ensureModalsMounted();
  const grid = document.getElementById('avatar-grid-options');
  if (!grid) return;
  grid.innerHTML = '';
  const user = UserManager.getUser();
  avatarSeleccionado = user.avatar;

  AVATAR_SEEDS.forEach(seed => {
    const url = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
    const opt = document.createElement('div');
    opt.className = `avatar-option ${user.avatar === url ? 'selected' : ''}`;
    opt.onclick = () => {
      document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      avatarSeleccionado = url;
    };
    opt.innerHTML = `<img src="${url}" alt="${seed}">`;
    grid.appendChild(opt);
  });
}

export function abrirModalAvatar(): void {
  ensureModalsMounted();
  const user = UserManager.getUser();
  const input = document.getElementById('input-edit-username') as HTMLInputElement | null;
  if (input) input.value = user.username;
  setupAvatarOptions();
  document.getElementById('modal-avatar')?.classList.add('active');
}

export function guardarPerfilUsuario(): void {
  const input = document.getElementById('input-edit-username') as HTMLInputElement | null;
  const name = input?.value.trim() || 'Invitado';
  const user = UserManager.getUser();
  user.username = name;
  if (avatarSeleccionado) user.avatar = avatarSeleccionado;
  UserManager.saveUser(user);
  if (nWin.FirebaseAuth?.updateAuthProfile) {
    nWin.FirebaseAuth.updateAuthProfile(user.username, user.avatar);
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
  const chaps = UserManager.getTotalChaptersRead();
  const rank = nWin.NyAnimeUtils?.computeUserRank
    ? nWin.NyAnimeUtils.computeUserRank(eps, chaps, isLoggedIn ? user.role : 'FREE')
    : { icon: '🌱', label: 'Novato', points: eps };

  const curEl = document.getElementById('rank-modal-current');
  const sumEl = document.getElementById('rank-modal-summary');
  if (curEl) curEl.textContent = `${rank.icon} Rango actual: ${rank.label}`;
  if (sumEl) sumEl.textContent = `${eps} episodios vistos · ${chaps} capítulos leídos · ${rank.points} pts de actividad`;
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
          curMangas.unshift(m);
          addedMangas++;
        }
      });
      localStorage.setItem(MangaFavoritesManager.KEY, JSON.stringify(curMangas));
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
