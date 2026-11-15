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

const MANGA_TITLE_STOPWORDS = new Set([
  'the', 'a', 'an', 'el', 'la', 'los', 'las', 'un', 'una'
]);

const MANGA_SPINOFF_MARKERS = new Set([
  'ragnarok', 'arise', 'boruto', 'generations', 'illegals', 'vigilantes',
  'smash', 'party', 'anthology', 'doujinshi', 'oneshot', 'gaiden', 'spinoff',
  'modulo', 'nagi', 'aftermath', 'another', 're', 'episode', 'spin', 'off',
  'fan', 'comic', 'novel', 'light'
]);

export function normalizeMangaCompareTitle(raw?: string | null): string {
  const s = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00d7/g, ' x ')
    // Strip parenthetical years or format tags e.g. "(2020)", "(Manhwa)", "[Webtoon]"
    .replace(/[([]\s*(?:19\d{2}|20\d{2}|manhwa|manga|manhua|webtoon|novel|novela|colored|full\s*color|espanol|spanish|english)\s*[)\]]/gi, ' ')
    // Normalize common leetspeak in ManhwaWeb titles (e.g. L3vel1ng, Di0s, W1nd, C4d3n4s)
    .replace(/([a-z])0([a-z])/g, '$1o$2')
    .replace(/([a-z])1([a-z])/g, '$1i$2')
    .replace(/([a-z])3([a-z])/g, '$1e$2')
    .replace(/([a-z])4([a-z])/g, '$1a$2')
    .replace(/([a-z])0([a-z])/g, '$1o$2')
    .replace(/([a-z])1([a-z])/g, '$1i$2')
    .replace(/([a-z])3([a-z])/g, '$1e$2')
    .replace(/([a-z])4([a-z])/g, '$1a$2')
    .replace(/([a-z0-9])['’]([a-z0-9])/g, '$1$2')
    .replace(/[卍:·,\-_!?¡¿'"’“”()[\]/\\~+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

export function tokenizeMangaTitle(raw?: string | null): string[] {
  const norm = normalizeMangaCompareTitle(raw);
  if (!norm) return [];
  const all = norm.split(' ').filter(Boolean);
  const filtered = all.filter((w) => !MANGA_TITLE_STOPWORDS.has(w));
  return filtered.length > 0 ? filtered : all;
}

export function scoreMangaTitleMatch(
  candidateTitle: string,
  targetTitles: string | string[]
): number {
  const targets = (Array.isArray(targetTitles) ? targetTitles : [targetTitles])
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  if (!candidateTitle || targets.length === 0) return -100;

  const normCand = normalizeMangaCompareTitle(candidateTitle);
  if (!normCand) return -100;
  const candTokens = tokenizeMangaTitle(candidateTitle);
  if (candTokens.length === 0) return -100;
  const candSet = new Set(candTokens);

  let bestScore = -100;

  for (const rawTarget of targets) {
    const normTarg = normalizeMangaCompareTitle(rawTarget);
    if (!normTarg) continue;

    if (normCand === normTarg) {
      bestScore = Math.max(bestScore, 100 + candTokens.length);
      continue;
    }

    const targTokens = tokenizeMangaTitle(rawTarget);
    if (targTokens.length === 0) continue;
    const targSet = new Set(targTokens);

    if (candTokens.join(' ') === targTokens.join(' ')) {
      bestScore = Math.max(bestScore, 96 + candTokens.length);
      continue;
    }

    // Reject if candidate or target has a spin-off/sequel marker that the other lacks
    let hasSpinoffConflict = false;
    for (const marker of MANGA_SPINOFF_MARKERS) {
      if (candSet.has(marker) !== targSet.has(marker)) {
        hasSpinoffConflict = true;
        break;
      }
    }
    if (hasSpinoffConflict) continue;

    let matched = 0;
    for (const t of targSet) {
      if (candSet.has(t)) matched++;
    }
    if (matched === 0) continue;

    const missingInCand = targSet.size - matched;
    let extraInCand = 0;
    for (const c of candSet) {
      if (!targSet.has(c)) extraInCand++;
    }

    // Short titles (1-2 meaningful tokens, e.g. "The Mansion", "Monster", "Naruto", "Solo Leveling"):
    // Require exact token set match (0 extra foreign tokens and 0 missing tokens).
    if (targSet.size <= 2 || candSet.size <= 2) {
      if (missingInCand === 0 && extraInCand === 0) {
        bestScore = Math.max(bestScore, 92 + matched);
      }
      continue;
    }

    // Longer titles (3+ meaningful tokens):
    // Require at least 80% of target tokens matched (minimum 3 tokens) and at most 1 extra token
    const coverage = matched / targSet.size;
    if (matched >= 3 && coverage >= 0.8 && extraInCand <= 1 && missingInCand <= 1) {
      const score = Math.round(coverage * 85) - extraInCand * 8 - missingInCand * 10;
      bestScore = Math.max(bestScore, score);
    }
  }

  return bestScore;
}

export function isStrictMangaTitleMatch(
  candidateTitle: string,
  targetTitles: string | string[]
): boolean {
  return scoreMangaTitleMatch(candidateTitle, targetTitles) >= 70;
}

export function lookupMangaCatalogStrict<T>(
  catalog: Record<string, T>,
  title: string,
  altTitles: string[] = []
): T | null {
  const targets = [title, ...(altTitles || [])].filter(Boolean);
  if (targets.length === 0) return null;

  let bestVal: T | null = null;
  let bestScore = -100;

  for (const [key, val] of Object.entries(catalog)) {
    const sc = scoreMangaTitleMatch(key, targets);
    if (sc >= 70 && sc > bestScore) {
      bestScore = sc;
      bestVal = val;
    }
  }
  return bestVal;
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
  manhwaWebChapters?: MangaChapterItem[];
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

  for (const c of input.manhwaWebChapters || []) {
    const norm = normalizeMangaLang(c.lang || 'es');
    if (norm === 'es') {
      rawSpanish.push({
        ...c,
        lang: 'es',
        group: c.group || 'ManhwaWeb ES 🇪🇸',
        source: c.source || 'ManhwaWeb 🇪🇸'
      });
    }
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

  // Within Spanish: prefer MangaDex ES first, then ManhwaWeb ES, then InManga ES, preserving alternatives in otherVersions
  const spanishDexFirst = [
    ...rawSpanish.filter(
      (c) =>
        c.source !== 'InManga 🇪🇸' &&
        c.source !== 'InManga' &&
        c.source !== 'ManhwaWeb 🇪🇸'
    ),
    ...rawSpanish.filter((c) => c.source === 'ManhwaWeb 🇪🇸'),
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
    isCustomWebtoon: finalSpanish.some(
      (c) => String(c.id).startsWith('inmanga_') || String(c.id).startsWith('mweb_')
    )
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
