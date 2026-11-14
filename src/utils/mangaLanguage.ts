export type NormalizedMangaLang = 'es' | 'en' | 'ja' | 'ko' | 'other';

export interface MangaChapterItem {
  id: string;
  chapter: string;
  chapterNum: number;
  title: string;
  pages: number;
  externalUrl?: string | null;
  publishAt?: string;
  group: string;
  lang: string;
  source: string;
  altGroups?: string[];
  otherVersions?: MangaChapterItem[];
}

export interface MangaLanguageBuckets {
  spanish: MangaChapterItem[];
  english: MangaChapterItem[];
  japanese: MangaChapterItem[];
  korean: MangaChapterItem[];
  other: MangaChapterItem[];
  all: MangaChapterItem[];
  total: number;
  isCustomWebtoon: boolean;
}

export function normalizeMangaLang(rawLang?: string | null): NormalizedMangaLang {
  const l = String(rawLang || '').trim().toLowerCase();
  if (l === 'es' || l === 'es-la' || l === 'es-es' || l === 'es-419') return 'es';
  if (l === 'en' || l.startsWith('en-')) return 'en';
  if (l === 'ja' || l === 'ja-ro' || l === 'jp') return 'ja';
  if (l === 'ko' || l === 'ko-ro' || l === 'kr') return 'ko';
  return 'other';
}

export function deduplicateLanguageChapters(items: MangaChapterItem[]): MangaChapterItem[] {
  const map = new Map<string, MangaChapterItem>();
  for (const item of items) {
    const key =
      item.chapterNum > 0
        ? String(item.chapterNum)
        : item.chapter
          ? String(item.chapter).trim()
          : item.id;
    if (!map.has(key)) {
      map.set(key, {
        ...item,
        altGroups: item.altGroups ? [...item.altGroups] : [item.group],
        otherVersions: item.otherVersions ? [...item.otherVersions] : []
      });
    } else {
      const existing = map.get(key)!;
      if (!existing.altGroups) existing.altGroups = [existing.group];
      if (!existing.altGroups.includes(item.group)) {
        existing.altGroups.push(item.group);
      }
      if (!existing.otherVersions) existing.otherVersions = [];
      if (!existing.otherVersions.some((v) => v.id === item.id)) {
        existing.otherVersions.push({
          ...item,
          otherVersions: []
        });
      }
    }
  }
  const result = Array.from(map.values());
  result.sort((a, b) => a.chapterNum - b.chapterNum);
  return result;
}

/**
 * Separa estrictamente cada idioma para que el filtro "🇪🇸 Español" NUNCA mezcle capítulos
 * de Inglés (MangaPill / MangaDex EN) haciéndolos pasar por Español.
 * La pestaña "🌐 Todos" combina todos los idiomas priorizando Español primero, manteniendo
 * intacto el campo real `lang` y `group` en cada capítulo.
 */
export function buildStrictLanguageBuckets(input: {
  dexChapters: MangaChapterItem[];
  inmangaChapters?: MangaChapterItem[];
  mangaPillChapters?: MangaChapterItem[];
}): MangaLanguageBuckets {
  const rawSpanish: MangaChapterItem[] = [];
  const rawEnglish: MangaChapterItem[] = [];
  const rawJapanese: MangaChapterItem[] = [];
  const rawKorean: MangaChapterItem[] = [];
  const rawOther: MangaChapterItem[] = [];

  for (const c of input.dexChapters || []) {
    const norm = normalizeMangaLang(c.lang);
    if (norm === 'es') rawSpanish.push(c);
    else if (norm === 'en') rawEnglish.push(c);
    else if (norm === 'ja') rawJapanese.push(c);
    else if (norm === 'ko') rawKorean.push(c);
    else rawOther.push(c);
  }

  for (const c of input.inmangaChapters || []) {
    // Only include genuine Spanish InManga items inside Spanish bucket
    const norm = normalizeMangaLang(c.lang || 'es');
    if (norm === 'es') {
      rawSpanish.push({
        ...c,
        lang: 'es',
        group: c.group || 'InManga Scan 🇪🇸'
      });
    }
  }

  // MangaPill is an English-only source -> belongs strictly in rawEnglish, NEVER in rawSpanish!
  for (const c of input.mangaPillChapters || []) {
    const norm = normalizeMangaLang(c.lang || 'en');
    if (norm === 'en') {
      rawEnglish.push({
        ...c,
        lang: 'en',
        group: c.group || 'MangaPill HD 🇬🇧'
      });
    }
  }

  // Within Spanish: prefer MangaDex ES first over InManga when both cover same chapter, preserving InManga in otherVersions
  const spanishDexFirst = [
    ...rawSpanish.filter((c) => c.source !== 'InManga 🇪🇸' && c.source !== 'InManga'),
    ...rawSpanish.filter((c) => c.source === 'InManga 🇪🇸' || c.source === 'InManga')
  ];
  const englishDexFirst = [
    ...rawEnglish.filter((c) => c.source !== 'MangaPill'),
    ...rawEnglish.filter((c) => c.source === 'MangaPill')
  ];

  const finalSpanish = deduplicateLanguageChapters(spanishDexFirst);
  const finalEnglish = deduplicateLanguageChapters(englishDexFirst);
  const japanese = deduplicateLanguageChapters(rawJapanese);
  const korean = deduplicateLanguageChapters(rawKorean);
  const other = deduplicateLanguageChapters(rawOther);

  const all = deduplicateLanguageChapters([
    ...finalSpanish,
    ...finalEnglish,
    ...japanese,
    ...korean,
    ...other
  ]);

  return {
    spanish: finalSpanish,
    english: finalEnglish,
    japanese,
    korean,
    other,
    all,
    total: all.length,
    isCustomWebtoon: finalSpanish.some((c) => String(c.id).startsWith('inmanga_'))
  };
}

/**
 * Selecciona candidatos de lectura respetando estrictamente el idioma del capítulo abierto / pestaña elegida.
 */
export function selectPageCandidatesForLanguage(
  chapterObj: MangaChapterItem | null,
  sameNumPool: MangaChapterItem[],
  preferredTabLang: string
): {
  targetLang: NormalizedMangaLang | 'all';
  candidates: MangaChapterItem[];
} {
  const chapLangNorm = chapterObj?.lang ? normalizeMangaLang(chapterObj.lang) : null;
  const tabNorm =
    preferredTabLang === 'all' ? 'all' : normalizeMangaLang(preferredTabLang || 'es');

  // If user is explicitly browsing a specific language tab ('es', 'en', 'ja', 'ko'), lock to that language
  // Unless they are in 'all', in which case use the opened chapter's own language as primary target
  const targetLang: NormalizedMangaLang | 'all' =
    tabNorm !== 'all' ? tabNorm : chapLangNorm || 'all';

  const seenIds = new Set<string>();
  const candidates: MangaChapterItem[] = [];

  const maybePush = (item: MangaChapterItem | null | undefined) => {
    if (!item || !item.id || seenIds.has(item.id)) return;
    if (targetLang !== 'all') {
      const itemNorm = normalizeMangaLang(item.lang);
      if (itemNorm !== targetLang) return;
    }
    seenIds.add(item.id);
    candidates.push(item);
  };

  if (chapterObj) {
    maybePush(chapterObj);
    if (Array.isArray(chapterObj.otherVersions)) {
      for (const ver of chapterObj.otherVersions) {
        maybePush(ver);
      }
    }
  }

  for (const item of sameNumPool || []) {
    maybePush(item);
  }

  return { targetLang, candidates };
}
