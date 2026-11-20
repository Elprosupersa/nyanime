import { describe, it, expect } from 'vitest';
import {
  normalizeMangaLang,
  isStrictMangaTitleMatch,
  scoreMangaTitleMatch,
  lookupMangaCatalogStrict,
  buildStrictLanguageBuckets,
  selectPageCandidatesForLanguage,
  type MangaChapterItem
} from '../utils/mangaLanguage.ts';

describe('mangaLanguage — Strict Language Isolation & Title Matching', () => {
  it('normalizes language codes consistently', () => {
    expect(normalizeMangaLang('es')).toBe('es');
    expect(normalizeMangaLang('es-la')).toBe('es');
    expect(normalizeMangaLang('ES-419')).toBe('es');
    expect(normalizeMangaLang('en')).toBe('en');
    expect(normalizeMangaLang('ja-ro')).toBe('ja');
    expect(normalizeMangaLang('ko')).toBe('ko');
    expect(normalizeMangaLang('pt-br')).toBe('other');
  });

  it('rejects false-positive partial title matches ("The Mansion" vs "Maison and the Man-Eating Apartment" / "Hitokui Mansion to Ooya no Maison")', () => {
    // Regression for User Bug: "The Mansion" (Manhwa) must NEVER match "Hitokui Mansion to Ooya no Maison" or "Maison and the Man-Eating Apartment"
    expect(
      isStrictMangaTitleMatch('Hitokui Mansion to Ooya no Maison', ['The Mansion', 'Mansion'])
    ).toBe(false);
    expect(
      isStrictMangaTitleMatch('Maison and the Man-Eating Apartment', ['The Mansion', 'Mansion'])
    ).toBe(false);
    expect(
      scoreMangaTitleMatch('Hitokui Mansion to Ooya no Maison', ['The Mansion'])
    ).toBeLessThan(0);

    // Other common false-positive traps
    expect(isStrictMangaTitleMatch('Re:Monster', ['Monster'])).toBe(false);
    expect(isStrictMangaTitleMatch('Boruto: Naruto Next Generations', ['Naruto'])).toBe(false);
    expect(isStrictMangaTitleMatch('Solo Leveling: Ragnarok', ['Solo Leveling'])).toBe(false);
    expect(isStrictMangaTitleMatch('Boku no Hero Academia: Vigilantes', ['Boku no Hero Academia'])).toBe(false);

    // Genuine matches (including leetspeak on ManhwaWeb and altTitles)
    expect(isStrictMangaTitleMatch('The Mansion', ['The Mansion'])).toBe(true);
    expect(isStrictMangaTitleMatch('Solo L3vel1ng', ['Solo Leveling'])).toBe(true);
    expect(
      isStrictMangaTitleMatch('Lector Omnisciente (2020)', [
        'Omniscient Reader',
        'Lector Omnisciente'
      ])
    ).toBe(true);
  });

  it('looks up catalog entries strictly without substring collisions', () => {
    const sampleCatalog: Record<string, string> = {
      'solo leveling': 'solo-leveling-id',
      'the mansion': 'the-mansion-id',
      'monster': 'monster-id',
      'someone stop her': 'dejadefumar_1724705448986',
      'got a room': 'sharehouse_1678427324851',
      'dont tell mom': 'secret_your_mom_1679371230456'
    };
    expect(lookupMangaCatalogStrict(sampleCatalog, 'The Mansion')).toBe('the-mansion-id');
    expect(
      lookupMangaCatalogStrict(sampleCatalog, 'Hitokui Mansion to Ooya no Maison')
    ).toBeNull();
    expect(lookupMangaCatalogStrict(sampleCatalog, 'Re:Monster')).toBeNull();
    expect(lookupMangaCatalogStrict(sampleCatalog, 'Someone Stop Her!')).toBe('dejadefumar_1724705448986');
    expect(lookupMangaCatalogStrict(sampleCatalog, 'Got A Room?')).toBe('sharehouse_1678427324851');
    expect(lookupMangaCatalogStrict(sampleCatalog, "Don't Tell Mom!")).toBe('secret_your_mom_1679371230456');
    expect(lookupMangaCatalogStrict(sampleCatalog, 'Don’t Tell Mom!')).toBe('secret_your_mom_1679371230456');
  });

  it('matches Korean Hangul, Spanish inverted punctuation, and ManhwaWeb see aliases accurately', () => {
    expect(
      isStrictMangaTitleMatch('빈방 있어요?', ['Got A Room?', 'Binbang Isseoyo?', '빈방 있어요?'])
    ).toBe(true);
    expect(
      isStrictMangaTitleMatch('엄마한텐 비밀이야', ["Don't Tell Mom!", '엄마한텐 비밀이야!'])
    ).toBe(true);
    expect(
      isStrictMangaTitleMatch('Es un secreto para mamá', ['¡ES UN SECRETO PARA MAMÁ!'])
    ).toBe(true);
    expect(
      isStrictMangaTitleMatch('Someone Stop Her!', ['Deja de fumar', 'Stop Smoking!', 'Someone Stop Her!'])
    ).toBe(true);
  });

  it('merges ManhwaWeb Spanish chapters into the Spanish bucket and prioritizes Spanish providers', () => {
    const manhwaWebChapters: MangaChapterItem[] = [
      {
        id: 'mweb_the-mansion_1726386419822-1',
        chapter: '1',
        chapterNum: 1,
        title: 'Capítulo 1',
        pages: 24,
        group: 'ManhwaWeb ES',
        lang: 'es',
        source: 'ManhwaWeb'
      },
      {
        id: 'mweb_the-mansion_1726386419822-2',
        chapter: '2',
        chapterNum: 2,
        title: 'Capítulo 2',
        pages: 26,
        group: 'ManhwaWeb ES',
        lang: 'es',
        source: 'ManhwaWeb'
      }
    ];

    const buckets = buildStrictLanguageBuckets({
      dexChapters: [],
      inmangaChapters: [],
      manhwaWebChapters,
      mangaPillChapters: []
    });

    expect(buckets.spanish).toHaveLength(2);
    expect(buckets.spanish[0].id).toBe('mweb_the-mansion_1726386419822-1');
    expect(buckets.spanish[0].source).toBe('ManhwaWeb');
    expect(buckets.english).toHaveLength(0);
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
      group: 'MangaPill HD',
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
    expect(buckets.english[0].group).toBe('MangaPill HD');
  });

  it('locks page candidates strictly to the active language tab and permits cross-language only under "all"', () => {
    const chEs: MangaChapterItem = {
      id: 'es-cap-5',
      chapter: '5',
      chapterNum: 5,
      title: 'Cap 5',
      pages: 20,
      group: 'InManga Scan',
      lang: 'es',
      source: 'InManga',
      otherVersions: [
        {
          id: 'mpill_5',
          chapter: '5',
          chapterNum: 5,
          title: 'Chapter 5',
          pages: 20,
          group: 'MangaPill HD',
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
