import { escapeHTML, formatRelativeTime, safeImageUrl } from '../utils/sanitize.ts';
import {
  FirebaseCommentsBridge,
  FirebaseAuthBridge,
  type EpisodeCommentRecord
} from '../firebase.ts';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

export const COMMENT_MIN_LENGTH = 2;
export const COMMENT_MAX_LENGTH = 500;
export const COMMENT_COOLDOWN_MS = 5000;
export const COMMENTS_PAGE_SIZE = 50;

export type CommentValidationResult =
  | { valid: true; cleanText: string }
  | { valid: false; error: string };

export function validateCommentInput(rawText: string): CommentValidationResult {
  const clean = String(rawText ?? '').trim();
  if (clean.length < COMMENT_MIN_LENGTH) {
    return {
      valid: false,
      error: `El comentario debe tener al menos ${COMMENT_MIN_LENGTH} caracteres.`
    };
  }
  if (clean.length > COMMENT_MAX_LENGTH) {
    return {
      valid: false,
      error: `El comentario supera el máximo de ${COMMENT_MAX_LENGTH} caracteres.`
    };
  }
  return { valid: true, cleanText: clean };
}

export function checkCommentCooldown(
  lastPostedAtMs: number,
  nowMs = Date.now(),
  cooldownMs = COMMENT_COOLDOWN_MS
): { allowed: boolean; waitSeconds: number } {
  if (!lastPostedAtMs || lastPostedAtMs <= 0) {
    return { allowed: true, waitSeconds: 0 };
  }
  const elapsed = nowMs - lastPostedAtMs;
  if (elapsed >= cooldownMs) {
    return { allowed: true, waitSeconds: 0 };
  }
  const waitSeconds = Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000));
  return { allowed: false, waitSeconds };
}

export function formatRemainingChars(
  text: string,
  maxLength = COMMENT_MAX_LENGTH
): { remaining: number; label: string; isOver: boolean } {
  const len = String(text ?? '').length;
  const remaining = maxLength - len;
  return {
    remaining,
    label: `${len}/${maxLength}`,
    isOver: remaining < 0
  };
}

export function renderCommentCardMarkup(
  c: EpisodeCommentRecord,
  options: {
    currentUid?: string | null;
    animeId: number | string;
    ep: number | string;
  }
): string {
  const safeName = escapeHTML(c.displayName || 'Usuario');
  const safeText = escapeHTML(c.text || '');
  const safeAvatar = escapeHTML(
    safeImageUrl(c.avatar, 'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo')
  );
  const safeTime = escapeHTML(formatRelativeTime(toEpochMs(c.createdAt)));
  const isMine = Boolean(options.currentUid && c.uid === options.currentUid);
  const isSpoiler = Boolean(c.isSpoiler);

  const textMarkup = isSpoiler
    ? `
      <div class="comment-spoiler-wrap" data-revealed="false">
        <div class="comment-text is-spoiler">${safeText}</div>
        <button type="button" class="comment-spoiler-reveal-btn" onclick="CommentsManager.revealSpoiler(this)">
          ⚠️ Spoiler · Toca para revelar
        </button>
      </div>
    `
    : `<div class="comment-text">${safeText}</div>`;

  const spoilerBadge = isSpoiler
    ? '<span class="comment-spoiler-badge">Spoiler</span>'
    : '';

  return `
    <div class="comment-card" data-comment-id="${escapeHTML(c.id)}">
      <img class="comment-avatar" src="${safeAvatar}" alt="${safeName}">
      <div class="comment-body">
        <div class="comment-user-row">
          <div style="display:flex; align-items:center; gap:6px; min-width:0;">
            <span class="comment-username">${safeName}</span>
            ${spoilerBadge}
          </div>
          <span class="comment-time">${safeTime}</span>
        </div>
        ${textMarkup}
        ${
          isMine
            ? `<div class="comment-footer"><button class="comment-like-btn" onclick="CommentsManager.deleteComment(${Number(options.animeId)}, ${Number(options.ep)}, '${escapeHTML(c.id)}')">🗑️ Eliminar</button></div>`
            : ''
        }
      </div>
    </div>
  `;
}

function toEpochMs(createdAt: unknown): number {
  if (!createdAt) return Date.now();
  if (typeof createdAt === 'number') return createdAt;
  if (typeof (createdAt as { toMillis?: () => number }).toMillis === 'function') {
    return (createdAt as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

export const RealCommentsManager = {
  lastPostedAt: 0,
  lastDocCursor: null as QueryDocumentSnapshot<DocumentData> | null,
  hasMorePages: false,
  loadedComments: [] as EpisodeCommentRecord[],

  buildEpisodeKey(animeId: number | string, episodeNum: number | string): string {
    const cleanId = String(animeId ?? '0').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanEp = String(episodeNum ?? '1').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${cleanId}_ep_${cleanEp}`;
  },

  updateCharCounter(text?: string): void {
    const input = document.getElementById('comment-text-input') as HTMLTextAreaElement | null;
    const counterEl = document.getElementById('comment-char-counter');
    if (!counterEl) return;
    const current = typeof text === 'string' ? text : input?.value || '';
    const info = formatRemainingChars(current, COMMENT_MAX_LENGTH);
    counterEl.textContent = info.label;
    counterEl.classList.toggle('is-over', info.isOver);
  },

  revealSpoiler(triggerEl: HTMLElement | null): void {
    if (!triggerEl) return;
    const wrap = triggerEl.closest('.comment-spoiler-wrap') as HTMLElement | null;
    if (!wrap) return;
    wrap.dataset.revealed = 'true';
    const textEl = wrap.querySelector('.comment-text');
    if (textEl) textEl.classList.remove('is-spoiler');
    triggerEl.remove();
  },

  renderLoadedList(
    container: HTMLElement,
    animeId: number | string,
    ep: number | string,
    currentUid: string
  ): void {
    const countEl = document.getElementById('comments-count');
    if (countEl) countEl.textContent = `(${this.loadedComments.length})`;

    if (this.loadedComments.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:18px 14px; color:var(--text-muted); font-size:12px; background:rgba(255,255,255,0.02); border:1px dashed var(--border-color); border-radius:12px;">
          Todavía no hay comentarios en este episodio. ¡Sé el primero en opinar!
        </div>
      `;
      return;
    }

    const cardsHtml = this.loadedComments
      .map((c) => renderCommentCardMarkup(c, { currentUid, animeId, ep }))
      .join('');

    const loadMoreHtml = this.hasMorePages
      ? `<button type="button" class="comment-load-more-btn" id="btn-load-more-comments" onclick="CommentsManager.loadMore(${Number(animeId)}, ${Number(ep)})">Cargar comentarios anteriores</button>`
      : '';

    container.innerHTML = cardsHtml + loadMoreHtml;
  },

  async render(animeId: number | string, ep: number | string): Promise<void> {
    const container = document.getElementById('comments-list-container');
    const countEl = document.getElementById('comments-count');
    if (!container) return;

    this.updateCharCounter();
    const epKey = this.buildEpisodeKey(animeId, ep);
    const fbUser = FirebaseAuthBridge.getCurrentUser();

    if (!fbUser || fbUser.isAnonymous) {
      this.loadedComments = [];
      this.lastDocCursor = null;
      this.hasMorePages = false;
      if (countEl) countEl.textContent = '(0)';
      container.innerHTML = `
        <div style="text-align:center; padding:20px 14px; color:var(--text-muted); font-size:12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:12px;">
          <div style="font-size:20px; margin-bottom:6px;">💬</div>
          <div>Inicia sesión con Google o Correo para leer y publicar comentarios reales de la comunidad en Firestore.</div>
          <button class="chip active" style="margin-top:10px; padding:7px 14px;" onclick="cambiarTab('perfil')">Ir a Iniciar Sesión</button>
        </div>
      `;
      return;
    }

    container.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:12px;">Cargando comentarios de la comunidad...</div>';

    try {
      const page = await FirebaseCommentsBridge.listCommentsPage(epKey, null, COMMENTS_PAGE_SIZE);
      this.loadedComments = page.items;
      this.lastDocCursor = page.lastDoc;
      this.hasMorePages = page.hasMore;
      this.renderLoadedList(container, animeId, ep, fbUser.uid);
    } catch (err) {
      if (countEl) countEl.textContent = '(0)';
      const msg = err instanceof Error ? err.message : 'Error cargando comentarios';
      container.innerHTML = `<div style="text-align:center; padding:16px; color:#fca5a5; font-size:12px;">${escapeHTML(msg)}</div>`;
    }
  },

  async loadMore(animeId: number | string, ep: number | string): Promise<void> {
    const container = document.getElementById('comments-list-container');
    const fbUser = FirebaseAuthBridge.getCurrentUser();
    if (!container || !fbUser || fbUser.isAnonymous || !this.lastDocCursor) return;

    const btn = document.getElementById('btn-load-more-comments') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Cargando más comentarios...';
    }

    try {
      const epKey = this.buildEpisodeKey(animeId, ep);
      const nextPage = await FirebaseCommentsBridge.listCommentsPage(epKey, this.lastDocCursor, COMMENTS_PAGE_SIZE);
      const seen = new Set(this.loadedComments.map((c) => c.id));
      for (const item of nextPage.items) {
        if (!seen.has(item.id)) {
          this.loadedComments.push(item);
        }
      }
      this.lastDocCursor = nextPage.lastDoc;
      this.hasMorePages = nextPage.hasMore;
      this.renderLoadedList(container, animeId, ep, fbUser.uid);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Reintentar cargar comentarios';
      }
      console.warn('Error paginando comentarios:', err);
    }
  },

  async addComment(
    animeId: number | string,
    ep: number | string,
    text: string,
    isSpoiler = false
  ): Promise<void> {
    const fbUser = FirebaseAuthBridge.getCurrentUser();
    if (!fbUser || fbUser.isAnonymous) {
      throw new Error('Debes iniciar sesión para comentar en la comunidad.');
    }

    const cooldown = checkCommentCooldown(this.lastPostedAt);
    if (!cooldown.allowed) {
      throw new Error(`Espera ${cooldown.waitSeconds}s antes de publicar otro comentario.`);
    }

    const validation = validateCommentInput(text);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const epKey = this.buildEpisodeKey(animeId, ep);
    await FirebaseCommentsBridge.addComment(epKey, validation.cleanText, Boolean(isSpoiler));
    this.lastPostedAt = Date.now();
    await this.render(animeId, ep);
  },

  async deleteComment(animeId: number | string, ep: number | string, commentId: string): Promise<void> {
    const epKey = this.buildEpisodeKey(animeId, ep);
    await FirebaseCommentsBridge.deleteComment(epKey, commentId);
    await this.render(animeId, ep);
  }
};
