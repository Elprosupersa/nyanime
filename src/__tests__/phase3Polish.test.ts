import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CRITICAL_MODAL_IDS,
  buildSkeletonCardsHtml,
  buildSkeletonListHtml,
  buildStateCardHtml,
  canDismissModalByBackdropOrEscape,
  computeBodyScrollLock,
  createRequestGuard,
  isEditableTarget,
  resolveMangaReaderShortcutAction,
  resolveModalDismissBehavior,
  resolvePlayerShortcutAction
} from '../utils/uiPolishHelpers.ts';

const ROOT = path.resolve(process.cwd());

describe('Phase 3 · Editable target & keyboard shortcut guards', () => {
  it('detects inputs, textareas, selects, and contentEditable elements', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'textarea' })).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(
      isEditableTarget({
        tagName: 'SPAN',
        getAttribute: (n: string) => (n === 'contenteditable' ? 'true' : null)
      })
    ).toBe(true);
    expect(
      isEditableTarget({
        tagName: 'SPAN',
        closest: () => ({ tagName: 'TEXTAREA' })
      })
    ).toBe(true);
    expect(isEditableTarget({ tagName: 'BUTTON', isContentEditable: false })).toBe(false);
    expect(isEditableTarget({ tagName: 'DIV' })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it('resolves all anime player keyboard shortcuts and blocks when typing, modal open, or modifier held', () => {
    const activeCtx = { playerActive: true, hasOpenModal: false, hasActiveAniSkip: true };
    expect(resolvePlayerShortcutAction({ key: ' ' }, activeCtx)).toBe('toggle-play');
    expect(resolvePlayerShortcutAction({ key: 'k' }, activeCtx)).toBe('toggle-play');
    expect(resolvePlayerShortcutAction({ key: 'K' }, activeCtx)).toBe('toggle-play');
    expect(resolvePlayerShortcutAction({ key: 'j' }, activeCtx)).toBe('seek-back-10');
    expect(resolvePlayerShortcutAction({ key: 'ArrowLeft' }, activeCtx)).toBe('seek-back-10');
    expect(resolvePlayerShortcutAction({ key: 'l' }, activeCtx)).toBe('seek-forward-10');
    expect(resolvePlayerShortcutAction({ key: 'ArrowRight' }, activeCtx)).toBe('seek-forward-10');
    expect(resolvePlayerShortcutAction({ key: 'ArrowLeft', shiftKey: true }, activeCtx)).toBe('prev-ep');
    expect(resolvePlayerShortcutAction({ key: 'ArrowRight', shiftKey: true }, activeCtx)).toBe('next-ep');
    expect(resolvePlayerShortcutAction({ key: 'f' }, activeCtx)).toBe('toggle-fullscreen');
    expect(resolvePlayerShortcutAction({ key: 'm' }, activeCtx)).toBe('toggle-mute');
    expect(resolvePlayerShortcutAction({ key: 's' }, activeCtx)).toBe('skip-intro');

    // S only skips when AniSkip segment is active
    expect(
      resolvePlayerShortcutAction({ key: 's' }, { ...activeCtx, hasActiveAniSkip: false })
    ).toBeNull();
    // Blocked when player inactive, modal open, typing, or Ctrl/Meta/Alt pressed
    expect(
      resolvePlayerShortcutAction({ key: ' ' }, { ...activeCtx, playerActive: false })
    ).toBeNull();
    expect(
      resolvePlayerShortcutAction({ key: ' ' }, { ...activeCtx, hasOpenModal: true })
    ).toBeNull();
    expect(
      resolvePlayerShortcutAction({ key: ' ', target: { tagName: 'TEXTAREA' } }, activeCtx)
    ).toBeNull();
    expect(
      resolvePlayerShortcutAction({ key: 'f', ctrlKey: true }, activeCtx)
    ).toBeNull();
    expect(
      resolvePlayerShortcutAction({ key: 'm', metaKey: true }, activeCtx)
    ).toBeNull();
  });

  it('resolves manga reader keyboard shortcuts for RTL, LTR, double, webtoon, HUD, and open sheets', () => {
    const baseCtx = { readerActive: true, hasOpenModal: false, hasOpenSheet: false };

    // RTL & double: ArrowLeft advances, ArrowRight goes back
    expect(
      resolveMangaReaderShortcutAction({ key: 'ArrowLeft' }, { ...baseCtx, mode: 'rtl' })
    ).toBe('next-page');
    expect(
      resolveMangaReaderShortcutAction({ key: 'ArrowRight' }, { ...baseCtx, mode: 'rtl' })
    ).toBe('prev-page');
    expect(
      resolveMangaReaderShortcutAction({ key: 'ArrowLeft' }, { ...baseCtx, mode: 'double' })
    ).toBe('next-page');

    // LTR: ArrowRight advances, ArrowLeft goes back
    expect(
      resolveMangaReaderShortcutAction({ key: 'ArrowRight' }, { ...baseCtx, mode: 'ltr' })
    ).toBe('next-page');
    expect(
      resolveMangaReaderShortcutAction({ key: 'ArrowLeft' }, { ...baseCtx, mode: 'ltr' })
    ).toBe('prev-page');

    // Webtoon: Arrows scroll vertically
    expect(
      resolveMangaReaderShortcutAction({ key: 'ArrowDown' }, { ...baseCtx, mode: 'webtoon' })
    ).toBe('scroll-down');
    expect(
      resolveMangaReaderShortcutAction({ key: 'ArrowUp' }, { ...baseCtx, mode: 'webtoon' })
    ).toBe('scroll-up');

    // H toggles HUD; Escape closes open sheet first, otherwise toggles HUD
    expect(
      resolveMangaReaderShortcutAction({ key: 'h' }, { ...baseCtx, mode: 'rtl' })
    ).toBe('toggle-hud');
    expect(
      resolveMangaReaderShortcutAction({ key: 'Escape' }, { ...baseCtx, mode: 'rtl' })
    ).toBe('toggle-hud');
    expect(
      resolveMangaReaderShortcutAction(
        { key: 'Escape' },
        { ...baseCtx, hasOpenSheet: true, mode: 'rtl' }
      )
    ).toBe('close-sheet');
    // Do not flip pages while sheet is open or modal is open or user is typing
    expect(
      resolveMangaReaderShortcutAction(
        { key: 'ArrowLeft' },
        { ...baseCtx, hasOpenSheet: true, mode: 'rtl' }
      )
    ).toBeNull();
    expect(
      resolveMangaReaderShortcutAction(
        { key: 'ArrowLeft' },
        { ...baseCtx, hasOpenModal: true, mode: 'rtl' }
      )
    ).toBeNull();
    expect(
      resolveMangaReaderShortcutAction(
        { key: 'h', target: { tagName: 'INPUT' } },
        { ...baseCtx, mode: 'webtoon' }
      )
    ).toBeNull();
  });
});

describe('Phase 3 · Critical modal policy & body scroll lock', () => {
  it('blocks backdrop and Escape dismissal for #modal-wipe-profile and minimizes running batch downloads', () => {
    expect(CRITICAL_MODAL_IDS.has('modal-wipe-profile')).toBe(true);
    expect(resolveModalDismissBehavior('modal-wipe-profile')).toBe('blocked');
    expect(canDismissModalByBackdropOrEscape('modal-wipe-profile')).toBe(false);

    expect(
      resolveModalDismissBehavior('modal-descarga-temporada', { isBatchDownloadRunning: true })
    ).toBe('minimize');
    expect(
      resolveModalDismissBehavior('modal-descarga-temporada', { isBatchDownloadRunning: false })
    ).toBe('close');
    expect(resolveModalDismissBehavior('modal-descargas')).toBe('close');
    expect(canDismissModalByBackdropOrEscape('modal-descargas')).toBe(true);
  });

  it('computes body scroll lock accurately across open/closed modal sets', () => {
    expect(computeBodyScrollLock([])).toBe(false);
    expect(computeBodyScrollLock(['', '   '])).toBe(false);
    expect(computeBodyScrollLock(['modal-descargas'])).toBe(true);
    expect(computeBodyScrollLock(['modal-descargas', 'modal-wipe-profile'])).toBe(true);
  });
});

describe('Phase 3 · Async request guard against race conditions', () => {
  it('invalidates previous tokens and aborts prior AbortSignals on rapid switches', () => {
    const guard = createRequestGuard();
    const t1 = guard.next();
    expect(guard.isCurrent(t1.seq)).toBe(true);
    expect(t1.signal.aborted).toBe(false);

    const t2 = guard.next();
    expect(t2.seq).toBeGreaterThan(t1.seq);
    expect(t1.signal.aborted).toBe(true);
    expect(guard.isCurrent(t1.seq)).toBe(false);
    expect(guard.isCurrent(t2.seq)).toBe(true);
    expect(t2.signal.aborted).toBe(false);

    guard.invalidate();
    expect(t2.signal.aborted).toBe(true);
    expect(guard.isCurrent(t2.seq)).toBe(false);
    expect(guard.currentSeq()).toBeGreaterThan(t2.seq);
  });
});

describe('Phase 3 · Unified OLED state cards & client-side XSS sanitization', () => {
  it('escapes HTML payloads in state cards and builds OLED skeletons cleanly', () => {
    const stateHtml = buildStateCardHtml({
      kind: 'error',
      title: '<img src=x onerror=alert(1)>',
      message: 'Fallo <script>evil()</script>',
      retryLabel: 'Reintentar',
      retryOnClick: 'cargarCatalogoHome()'
    });
    expect(stateHtml).toContain('ny-state-card is-error');
    expect(stateHtml).toContain('ny-retry-btn');
    expect(stateHtml).not.toContain('<script>');
    expect(stateHtml).not.toContain('<img src=x');

    const skelCards = buildSkeletonCardsHtml(4, 'row');
    expect((skelCards.match(/ny-skeleton-card is-row-card/g) || []).length).toBe(4);
    const skelList = buildSkeletonListHtml(3);
    expect((skelList.match(/ny-skeleton-list-item/g) || []).length).toBe(3);
  });

  it('prevents NaN onclick arguments and unescaped attributes in comments & manga sources/chapters', () => {
    const commentsTs = fs.readFileSync(path.join(ROOT, 'src/services/comments.ts'), 'utf8');
    const mangaCatalogTs = fs.readFileSync(path.join(ROOT, 'src/ui/mangaCatalogView.ts'), 'utf8');
    const mangaDetailTs = fs.readFileSync(path.join(ROOT, 'src/ui/mangaDetailView.ts'), 'utf8');

    expect(commentsTs).not.toContain('Number(options.animeId)');
    expect(commentsTs).not.toContain('Number(animeId)');
    expect(commentsTs).toContain('toSafeJsSingleQuotedArg');
    expect(commentsTs).toContain('commentsRequestGuard');

    expect(mangaCatalogTs).toContain('escHtml(s.name)');
    expect(mangaCatalogTs).toContain('escHtml(s.desc)');
    expect(mangaDetailTs).toContain('safeChapNumArg');
    expect(mangaDetailTs).toContain('mangaDetailGuard');
  });
});

describe('Phase 3 · Hygiene, safe-area & listener cleanup static invariants', () => {
  it('keeps temporary artifact directories cleaned and ignored for public GitHub sync', () => {
    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.aistudio/');
    expect(fs.existsSync(path.join(ROOT, 'public/assets/aistudio'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'dev-dist'))).toBe(false);
  });

  it('enforces safe-area insets, overflow-x: clip, and removeEventListener cleanup in views', () => {
    const baseCss = fs.readFileSync(path.join(ROOT, 'src/styles/base.css'), 'utf8');
    const layoutCss = fs.readFileSync(path.join(ROOT, 'src/styles/layout.css'), 'utf8');
    const playerTs = fs.readFileSync(path.join(ROOT, 'src/ui/playerView.ts'), 'utf8');
    const readerTs = fs.readFileSync(path.join(ROOT, 'src/ui/mangaReaderView.ts'), 'utf8');
    const modalsTs = fs.readFileSync(path.join(ROOT, 'src/ui/modals.ts'), 'utf8');
    const mainTs = fs.readFileSync(path.join(ROOT, 'src/main.ts'), 'utf8');

    expect(baseCss).toContain('overflow-x: clip');
    expect(baseCss).toContain('body.ny-modal-open');
    expect(layoutCss).toContain('env(safe-area-inset-top');
    expect(layoutCss).toContain('env(safe-area-inset-bottom');
    expect(playerTs).toContain("document.removeEventListener('keydown', playerKeydownListener)");
    expect(readerTs).toContain("document.removeEventListener('keydown', readerKeydownListener)");
    expect(mainTs).not.toContain('bindPlayerKeyboardShortcuts();');
    expect(modalsTs).toContain('role="alertdialog"');
    expect(modalsTs).not.toContain('onclick="if(event.target===this) cancelarLimpiarPerfil()"');
  });
});
