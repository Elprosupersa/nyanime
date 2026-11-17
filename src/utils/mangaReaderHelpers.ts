export type MangaReaderMode = 'webtoon' | 'ltr' | 'rtl' | 'double';

export interface MangaNightFilters {
  brightness: number; // 45..130 (%)
  contrast: number;   // 60..140 (%)
  sepia: number;      // 0..70 (%)
}

export const DEFAULT_NIGHT_FILTERS: MangaNightFilters = {
  brightness: 100,
  contrast: 100,
  sepia: 0
};

export function normalizeMangaReaderMode(raw: unknown): MangaReaderMode {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'ltr' || val === 'rtl' || val === 'double' || val === 'webtoon') {
    return val;
  }
  return 'webtoon';
}

export function clampNightFilters(raw?: Partial<MangaNightFilters> | null): MangaNightFilters {
  const b = Number(raw?.brightness);
  const c = Number(raw?.contrast);
  const s = Number(raw?.sepia);
  return {
    brightness: Number.isFinite(b) ? Math.min(130, Math.max(45, Math.round(b))) : 100,
    contrast: Number.isFinite(c) ? Math.min(140, Math.max(60, Math.round(c))) : 100,
    sepia: Number.isFinite(s) ? Math.min(70, Math.max(0, Math.round(s))) : 0
  };
}

export function buildReaderFilterCss(filters: Partial<MangaNightFilters> | null | undefined): string {
  const clean = clampNightFilters(filters);
  const parts: string[] = [];
  if (clean.brightness !== 100) parts.push(`brightness(${clean.brightness}%)`);
  if (clean.contrast !== 100) parts.push(`contrast(${clean.contrast}%)`);
  if (clean.sepia > 0) parts.push(`sepia(${clean.sepia}%)`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

export interface MangaSpread {
  index: number;
  pageNumbers: number[]; // 1-based page numbers
  imageUrls: string[];
}

export function buildMangaSpreads(
  pages: readonly string[],
  mode: MangaReaderMode
): MangaSpread[] {
  if (!Array.isArray(pages) || pages.length === 0) return [];
  if (mode !== 'double') {
    return pages.map((url, idx) => ({
      index: idx,
      pageNumbers: [idx + 1],
      imageUrls: [url]
    }));
  }

  const spreads: MangaSpread[] = [];
  for (let i = 0; i < pages.length; i += 2) {
    const first = pages[i];
    const second = pages[i + 1];
    if (second !== undefined) {
      spreads.push({
        index: spreads.length,
        pageNumbers: [i + 1, i + 2],
        imageUrls: [first, second]
      });
    } else {
      spreads.push({
        index: spreads.length,
        pageNumbers: [i + 1],
        imageUrls: [first]
      });
    }
  }
  return spreads;
}

export function stepSpreadIndex(
  currentIndex: number,
  totalSpreads: number,
  directionKey: 'prev' | 'next' | 'ArrowLeft' | 'ArrowRight',
  mode: MangaReaderMode
): { nextIndex: number; boundary: 'start' | 'end' | null } {
  if (totalSpreads <= 0) return { nextIndex: 0, boundary: null };
  const cur = Math.min(Math.max(0, Math.floor(currentIndex)), totalSpreads - 1);

  let delta = 0;
  if (directionKey === 'next') delta = 1;
  else if (directionKey === 'prev') delta = -1;
  else if (directionKey === 'ArrowLeft') delta = mode === 'rtl' || mode === 'double' ? 1 : -1;
  else if (directionKey === 'ArrowRight') delta = mode === 'rtl' || mode === 'double' ? -1 : 1;

  const candidate = cur + delta;
  if (candidate < 0) return { nextIndex: 0, boundary: 'start' };
  if (candidate >= totalSpreads) return { nextIndex: totalSpreads - 1, boundary: 'end' };
  return { nextIndex: candidate, boundary: null };
}

export function formatSpreadLabel(spread: MangaSpread | undefined, totalPages: number): string {
  if (!spread || totalPages <= 0) return '0 / 0';
  if (spread.pageNumbers.length === 2) {
    return `${spread.pageNumbers[0]}-${spread.pageNumbers[1]} / ${totalPages}`;
  }
  return `${spread.pageNumbers[0]} / ${totalPages}`;
}
