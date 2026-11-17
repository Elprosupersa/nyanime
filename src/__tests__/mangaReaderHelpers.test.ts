import { describe, expect, it } from 'vitest';
import {
  buildMangaSpreads,
  buildReaderFilterCss,
  clampNightFilters,
  formatSpreadLabel,
  normalizeMangaReaderMode,
  stepSpreadIndex
} from '../utils/mangaReaderHelpers.ts';

describe('mangaReaderHelpers', () => {
  it('normalizes modes and clamps night filter sliders', () => {
    expect(normalizeMangaReaderMode('rtl')).toBe('rtl');
    expect(normalizeMangaReaderMode('double')).toBe('double');
    expect(normalizeMangaReaderMode('invalid')).toBe('webtoon');

    expect(clampNightFilters({ brightness: 10, contrast: 999, sepia: -5 })).toEqual({
      brightness: 45,
      contrast: 140,
      sepia: 0
    });

    expect(buildReaderFilterCss({ brightness: 100, contrast: 100, sepia: 0 })).toBe('none');
    expect(buildReaderFilterCss({ brightness: 80, contrast: 110, sepia: 25 })).toBe(
      'brightness(80%) contrast(110%) sepia(25%)'
    );
  });

  it('builds double-page spreads and steps in RTL vs LTR accurately', () => {
    const pages = ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg', 'p5.jpg'];
    const doubleSpreads = buildMangaSpreads(pages, 'double');
    expect(doubleSpreads.length).toBe(3);
    expect(doubleSpreads[0].pageNumbers).toEqual([1, 2]);
    expect(doubleSpreads[2].pageNumbers).toEqual([5]);
    expect(formatSpreadLabel(doubleSpreads[0], 5)).toBe('1-2 / 5');

    // In RTL/double, ArrowLeft advances to next spread
    expect(stepSpreadIndex(0, 3, 'ArrowLeft', 'rtl')).toEqual({ nextIndex: 1, boundary: null });
    expect(stepSpreadIndex(1, 3, 'ArrowRight', 'rtl')).toEqual({ nextIndex: 0, boundary: null });
    expect(stepSpreadIndex(0, 3, 'prev', 'rtl')).toEqual({ nextIndex: 0, boundary: 'start' });
    expect(stepSpreadIndex(2, 3, 'next', 'ltr')).toEqual({ nextIndex: 2, boundary: 'end' });
  });
});
