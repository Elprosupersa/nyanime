import { escapeHTML } from './sanitize';

/**
 * Pure, unit-testable UI/UX polish helpers for NyAnime TV (Phase 3):
 * - Focus / editable-target guards for keyboard shortcuts
 * - Critical modal dismissal & body scroll-lock policy
 * - Player & Manga Reader keyboard shortcut resolvers
 * - Request sequence + AbortController guards against async race conditions
 * - Unified Red & Black OLED skeleton / empty / error state card builders
 */

export const CRITICAL_MODAL_IDS: ReadonlySet<string> = new Set(['modal-wipe-profile']);

export interface KeyboardEventLike {
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: unknown;
}

export interface EditableTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
}

/**
 * Returns true if the event target is an input, textarea, select, or contentEditable element
 * so global/view keyboard shortcuts never hijack typing.
 */
export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as EditableTargetLike;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable === true) return true;
  if (typeof el.getAttribute === 'function') {
    const ce = el.getAttribute('contenteditable');
    if (ce === '' || ce === 'true' || ce === 'plaintext-only') return true;
  }
  if (typeof el.closest === 'function') {
    try {
      if (el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')) {
        return true;
      }
    } catch {
      // Ignore synthetic target errors
    }
  }
  return false;
}

export type ModalDismissBehavior = 'close' | 'minimize' | 'blocked';

/**
 * Determines what happens when the user presses Escape or clicks the backdrop of a modal.
 * Critical modals (such as #modal-wipe-profile) MUST NOT dismiss on backdrop or Escape.
 */
export function resolveModalDismissBehavior(
  modalId: string,
  options?: { isBatchDownloadRunning?: boolean }
): ModalDismissBehavior {
  const id = String(modalId || '').trim();
  if (CRITICAL_MODAL_IDS.has(id)) return 'blocked';
  if (id === 'modal-descarga-temporada' && options?.isBatchDownloadRunning) {
    return 'minimize';
  }
  return 'close';
}

export function canDismissModalByBackdropOrEscape(modalId: string): boolean {
  return resolveModalDismissBehavior(modalId) !== 'blocked';
}

/**
 * Returns true if at least one modal overlay is currently open, requiring body scroll lock.
 */
export function computeBodyScrollLock(activeModalIds: Iterable<string>): boolean {
  for (const id of activeModalIds) {
    if (String(id || '').trim().length > 0) return true;
  }
  return false;
}

export type PlayerShortcutAction =
  | 'toggle-play'
  | 'seek-back-10'
  | 'seek-forward-10'
  | 'toggle-fullscreen'
  | 'toggle-mute'
  | 'skip-intro'
  | 'prev-ep'
  | 'next-ep'
  | null;

export interface PlayerShortcutContext {
  playerActive: boolean;
  hasOpenModal: boolean;
  hasActiveAniSkip: boolean;
}

export function resolvePlayerShortcutAction(
  event: KeyboardEventLike,
  ctx: PlayerShortcutContext
): PlayerShortcutAction {
  if (!ctx.playerActive || ctx.hasOpenModal) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isEditableTarget(event.target)) return null;

  const key = String(event.key || '');
  const lower = key.toLowerCase();

  if (key === ' ' || event.code === 'Space' || lower === 'k') {
    return 'toggle-play';
  }
  if (key === 'ArrowLeft') {
    return event.shiftKey ? 'prev-ep' : 'seek-back-10';
  }
  if (key === 'ArrowRight') {
    return event.shiftKey ? 'next-ep' : 'seek-forward-10';
  }
  if (lower === 'j') return 'seek-back-10';
  if (lower === 'l') return 'seek-forward-10';
  if (lower === 'f') return 'toggle-fullscreen';
  if (lower === 'm') return 'toggle-mute';
  if (lower === 's') {
    return ctx.hasActiveAniSkip ? 'skip-intro' : null;
  }
  return null;
}

export type MangaReaderShortcutAction =
  | 'next-page'
  | 'prev-page'
  | 'scroll-down'
  | 'scroll-up'
  | 'toggle-hud'
  | 'close-sheet'
  | null;

export interface MangaReaderShortcutContext {
  readerActive: boolean;
  hasOpenModal: boolean;
  hasOpenSheet: boolean;
  mode: 'webtoon' | 'rtl' | 'ltr' | 'double' | string;
}

export function resolveMangaReaderShortcutAction(
  event: KeyboardEventLike,
  ctx: MangaReaderShortcutContext
): MangaReaderShortcutAction {
  if (!ctx.readerActive || ctx.hasOpenModal) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isEditableTarget(event.target)) return null;

  const key = String(event.key || '');
  const lower = key.toLowerCase();

  if (key === 'Escape') {
    return ctx.hasOpenSheet ? 'close-sheet' : 'toggle-hud';
  }
  if (lower === 'h') {
    return 'toggle-hud';
  }

  // If a quick-chapters or reader settings sheet is open, do not flip pages behind it
  if (ctx.hasOpenSheet) return null;

  if (ctx.mode === 'webtoon') {
    if (key === 'ArrowRight' || key === 'ArrowDown') return 'scroll-down';
    if (key === 'ArrowLeft' || key === 'ArrowUp') return 'scroll-up';
    return null;
  }

  const isRtl = ctx.mode === 'rtl' || ctx.mode === 'double';
  if (key === 'ArrowLeft') {
    return isRtl ? 'next-page' : 'prev-page';
  }
  if (key === 'ArrowRight') {
    return isRtl ? 'prev-page' : 'next-page';
  }
  return null;
}

export interface RequestGuardToken {
  seq: number;
  signal: AbortSignal;
}

export interface RequestGuard {
  /** Increments sequence, aborts any in-flight request, and returns the fresh token + signal. */
  next: () => RequestGuardToken;
  /** Returns true only if `seq` is still the active request and has not been aborted/invalidated. */
  isCurrent: (seq: number) => boolean;
  /** Cancels any pending request without starting a new one (e.g. when closing a view). */
  invalidate: () => void;
  /** Current sequence number (read-only helper for diagnostics/tests). */
  currentSeq: () => number;
}

/**
 * Monotonic request guard backed by AbortController to prevent async race conditions
 * when users switch tabs, search queries, anime/manga details, episodes, or chapters rapidly.
 */
export function createRequestGuard(): RequestGuard {
  let seq = 0;
  let controller: AbortController | null = null;

  return {
    next() {
      seq += 1;
      if (controller) {
        try {
          controller.abort();
        } catch {
          // Ignore abort errors in edge environments
        }
      }
      controller = new AbortController();
      return { seq, signal: controller.signal };
    },
    isCurrent(candidateSeq: number) {
      return candidateSeq === seq && (!controller || !controller.signal.aborted);
    },
    invalidate() {
      seq += 1;
      if (controller) {
        try {
          controller.abort();
        } catch {
          // Ignore abort errors
        }
        controller = null;
      }
    },
    currentSeq() {
      return seq;
    }
  };
}

export interface StateCardOptions {
  kind: 'empty' | 'error';
  icon?: string;
  title: string;
  message: string;
  retryLabel?: string;
  retryOnClick?: string;
  secondaryLabel?: string;
  secondaryOnClick?: string;
  compact?: boolean;
}

/**
 * Builds a unified Red & Black OLED empty/error state card with fully escaped copy
 * and accessible 44px+ action buttons.
 */
export function buildStateCardHtml(opts: StateCardOptions): string {
  const kindClass = opts.kind === 'error' ? 'is-error' : 'is-empty';
  const compactClass = opts.compact ? ' is-compact' : '';
  const icon = opts.icon ? escapeHTML(opts.icon.trim()) : '';
  const title = escapeHTML(opts.title);
  const message = escapeHTML(opts.message);

  const actions: string[] = [];
  if (opts.retryOnClick) {
    const label = escapeHTML(opts.retryLabel || 'Reintentar');
    actions.push(
      `<button type="button" class="ny-retry-btn" onclick="${escapeHTML(opts.retryOnClick)}">${label}</button>`
    );
  }
  if (opts.secondaryOnClick && opts.secondaryLabel) {
    actions.push(
      `<button type="button" class="ny-retry-btn ny-retry-btn-secondary" onclick="${escapeHTML(opts.secondaryOnClick)}">${escapeHTML(opts.secondaryLabel)}</button>`
    );
  }

  return `
    <div class="ny-state-card ${kindClass}${compactClass}" role="${opts.kind === 'error' ? 'alert' : 'status'}">
      ${icon ? `<div class="ny-state-icon" aria-hidden="true">${icon}</div>` : ''}
      <div class="ny-state-title">${title}</div>
      <div class="ny-state-message">${message}</div>
      ${actions.length > 0 ? `<div class="ny-state-actions">${actions.join('')}</div>` : ''}
    </div>
  `;
}

/**
 * Renders lightweight OLED skeleton cards for horizontal rails or responsive grids.
 */
export function buildSkeletonCardsHtml(count = 6, variant: 'grid' | 'row' = 'grid'): string {
  const safeCount = Math.max(1, Math.min(24, Math.floor(count)));
  const cardClass = variant === 'row' ? 'ny-skeleton-card is-row-card' : 'ny-skeleton-card';
  return Array.from({ length: safeCount })
    .map(
      () => `
        <div class="${cardClass}" aria-hidden="true">
          <div class="ny-skeleton-poster"></div>
          <div class="ny-skeleton-line is-title"></div>
          <div class="ny-skeleton-line is-meta"></div>
        </div>
      `
    )
    .join('');
}

/**
 * Renders lightweight OLED skeleton list rows (for schedule, episodes, chapters, or comments).
 */
export function buildSkeletonListHtml(count = 5): string {
  const safeCount = Math.max(1, Math.min(20, Math.floor(count)));
  return Array.from({ length: safeCount })
    .map(
      () => `
        <div class="ny-skeleton-list-item" aria-hidden="true">
          <div class="ny-skeleton-thumb"></div>
          <div class="ny-skeleton-body">
            <div class="ny-skeleton-line is-title"></div>
            <div class="ny-skeleton-line is-meta"></div>
          </div>
        </div>
      `
    )
    .join('');
}
