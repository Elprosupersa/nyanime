import { describe, it, expect } from 'vitest';
import {
  normalizeMangaLang,
  buildStrictLanguageBuckets,
  selectPageCandidatesForLanguage,
  type MangaChapterItem
} from '../utils/mangaLanguage.ts';

describe('mangaLanguage — Strict Language Isolation', () => {
  it('normalizes language codes consistently', () => {
    expect(normalizeMangaLang('es')).toBe('es');
    expect(normalizeMangaLang('es-la')).toBe('es');
    expect(normalizeMangaLang('ES-419')).toBe('es');
    expect(normalizeMangaLang('en')).toBe('en');
    expect(normalizeMangaLang('ja-ro')).toBe('ja');
    expect(normalizeMangaLang('ko')).toBe('ko');
    expect(normalizeMangaLang('pt-br')).toBe('other');
  });

  it('never leaks English MangaPill/MangaDex chapters into the Spanish bucket (Vinland Saga regression)', () => {
    const dexChapters: MangaChapterItem[] = [
      {
        id: 'dex-es-218',
        chapter: '218',
        chapterNum: 218,
        title: 'Capítulo 218',
        pages: 20,
        group: 'Scan ES',
        lang: 'es-la',
        source: 'MangaDex'
      },
      {
        id: 'dex-es-220',
        chapter: '220',
        chapterNum: 220,
        title: 'Capítulo 220',
        pages: 19,
        group: 'Scan ES',
        lang: 'es-la',
        source: 'MangaDex'
      }
    ];

    const mangaPillChapters: MangaChapterItem[] = Array.from({ length: 224 }, (_, idx) => ({
      id: `mpill_${idx + 1}`,
      chapter: String(idx + 1),
      chapterNum: idx + 1,
      title: `Chapter ${idx + 1}`,
      pages: 22,
      group: 'MangaPill HD 🇬🇧',
      lang: 'en',
      source: 'MangaPill'
    }));

    const buckets = buildStrictLanguageBuckets({
      dexChapters,
      inmangaChapters: [],
      mangaPillChapters
    });

    // Spanish keeps ONLY genuine Spanish chapters (218, 220) — zero English leak, zero renumbering to 1, 2
    expect(buckets.spanish).toHaveLength(2);
    expect(buckets.spanish.map((c) => c.chapterNum)).toEqual([218, 220]);
    expect(buckets.spanish.every((c) => normalizeMangaLang(c.lang) === 'es')).toBe(true);

    // English holds all 224 English chapters cleanly
    expect(buckets.english).toHaveLength(224);
    expect(buckets.english[0].chapterNum).toBe(1);
    expect(buckets.english[0].group).toBe('MangaPill HD 🇬🇧');
  });

  it('locks page candidates strictly to the active language tab and permits cross-language only under "all"', () => {
    const chEs: MangaChapterItem = {
      id: 'es-cap-5',
      chapter: '5',
      chapterNum: 5,
      title: 'Cap 5',
      pages: 20,
      group: 'InManga Scan 🇪🇸',
      lang: 'es',
      source: 'InManga',
      otherVersions: [
        {
          id: 'mpill_5',
          chapter: '5',
          chapterNum: 5,
          title: 'Chapter 5',
          pages: 20,
          group: 'MangaPill HD 🇬🇧',
          lang: 'en',
          source: 'MangaPill'
        }
      ]
    };

    const sameNumPool: MangaChapterItem[] = [
      {
        id: 'en-dex-5',
        chapter: '5',
        chapterNum: 5,
        title: 'Chapter 5',
        pages: 20,
        group: 'English Scan',
        lang: 'en',
        source: 'MangaDex'
      }
    ];

    const strictEs = selectPageCandidatesForLanguage(chEs, sameNumPool, 'es');
    expect(strictEs.targetLang).toBe('es');
    expect(strictEs.candidates.map((c) => c.id)).toEqual(['es-cap-5']);

    const inAllTab = selectPageCandidatesForLanguage(chEs, sameNumPool, 'all');
    expect(inAllTab.targetLang).toBe('es'); // still honors the opened chapter's language when opened from 'all'
    expect(inAllTab.candidates.map((c) => c.id)).toEqual(['es-cap-5']);

    const explicitEnTab = selectPageCandidatesForLanguage(sameNumPool[0], [], 'en');
    expect(explicitEnTab.targetLang).toBe('en');
    expect(explicitEnTab.candidates.map((c) => c.id)).toEqual(['en-dex-5']);
  });
});
