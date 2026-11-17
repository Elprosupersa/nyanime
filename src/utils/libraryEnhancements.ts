export interface CustomList {
  id: string;
  name: string;
  color: string;
  icon: string;
  createdAt: number;
  updatedAt: number;
}

export interface RatedLibraryItem {
  kind: 'anime' | 'manga';
  id: string;
  title: string;
  cover: string;
  userScore: number;
  userReview?: string;
  scoreUpdatedAt: number;
}

export interface LibraryRatingsSummary {
  ratedCount: number;
  averageScore: number;
  topRated: RatedLibraryItem[];
}

export interface SmartRecommendationSeeds {
  becauseOfAnime: { id: string | number; title: string } | null;
  topGenres: string[];
  excludedIds: Set<string>;
}

const VALID_COLORS = ['#ff1a40', '#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb7185'];
const VALID_ICONS = ['📁', '⭐', '🔥', '🎌', '📚', '💎', '🌙', '⚡'];

export function sanitizeUserScore(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1 || n > 10) return null;
  return n;
}

export function sanitizeShortText(raw: unknown, maxLen: number): string {
  return String(raw ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeCustomListIds(raw: unknown, validIds?: Set<string>): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const clean = String(item ?? '').trim().slice(0, 64);
    if (!clean || !/^[a-zA-Z0-9_-]+$/.test(clean)) continue;
    if (validIds && !validIds.has(clean)) continue;
    if (!seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
      if (out.length >= 25) break;
    }
  }
  return out;
}

export function buildCustomList(
  nameRaw: string,
  opts?: { id?: string; color?: string; icon?: string; nowMs?: number }
): CustomList | null {
  const name = sanitizeShortText(nameRaw, 48);
  if (!name) return null;
  const now = Math.max(0, Math.floor(Number(opts?.nowMs ?? Date.now())));
  const slugBase = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'lista';
  const rawId = opts?.id && /^[a-zA-Z0-9_-]{1,64}$/.test(opts.id)
    ? opts.id
    : `list_${slugBase}_${now.toString(36)}`;
  const color = opts?.color && VALID_COLORS.includes(opts.color) ? opts.color : VALID_COLORS[0];
  const icon = opts?.icon && VALID_ICONS.includes(opts.icon) ? opts.icon : '📁';
  return {
    id: rawId,
    name,
    color,
    icon,
    createdAt: now,
    updatedAt: now
  };
}

export function toggleItemInCustomList(
  currentListIds: unknown,
  targetListId: string
): { nextIds: string[]; added: boolean } {
  const cleanTarget = String(targetListId || '').trim();
  const clean = sanitizeCustomListIds(currentListIds);
  if (!cleanTarget) return { nextIds: clean, added: false };
  if (clean.includes(cleanTarget)) {
    return {
      nextIds: clean.filter((id) => id !== cleanTarget),
      added: false
    };
  }
  return {
    nextIds: [...clean, cleanTarget].slice(0, 25),
    added: true
  };
}

export function computeLibraryRatingsSummary(
  animes: Array<Record<string, any>>,
  mangas: Array<Record<string, any>>,
  maxTop = 6
): LibraryRatingsSummary {
  const rated: RatedLibraryItem[] = [];

  for (const a of animes || []) {
    if (!a || !a.id) continue;
    const score = sanitizeUserScore(a.userScore);
    if (score === null) continue;
    const title = a.title?.english || a.title?.romaji || (typeof a.title === 'string' ? a.title : 'Anime');
    const cover = a.coverImage?.large || a.coverImage?.extraLarge || '';
    rated.push({
      kind: 'anime',
      id: String(a.id),
      title: String(title),
      cover: String(cover),
      userScore: score,
      userReview: sanitizeShortText(a.userReview || '', 280),
      scoreUpdatedAt: Math.max(0, Math.floor(Number(a.scoreUpdatedAt || a.listUpdatedAt || 0)))
    });
  }

  for (const m of mangas || []) {
    if (!m || !m.id) continue;
    const score = sanitizeUserScore(m.userScore);
    if (score === null) continue;
    rated.push({
      kind: 'manga',
      id: String(m.id),
      title: String(m.title || 'Manga'),
      cover: String(m.cover || ''),
      userScore: score,
      userReview: sanitizeShortText(m.userReview || '', 280),
      scoreUpdatedAt: Math.max(0, Math.floor(Number(m.scoreUpdatedAt || 0)))
    });
  }

  if (rated.length === 0) {
    return { ratedCount: 0, averageScore: 0, topRated: [] };
  }

  const sum = rated.reduce((acc, item) => acc + item.userScore, 0);
  const averageScore = Math.round((sum / rated.length) * 10) / 10;
  const topRated = [...rated]
    .sort((a, b) => b.userScore - a.userScore || b.scoreUpdatedAt - a.scoreUpdatedAt)
    .slice(0, Math.max(1, maxTop));

  return {
    ratedCount: rated.length,
    averageScore,
    topRated
  };
}

export function selectSmartRecommendationSeeds(
  animes: Array<Record<string, any>>,
  history: Array<Record<string, any>>
): SmartRecommendationSeeds {
  const excludedIds = new Set<string>();
  const genreFreq = new Map<string, number>();

  const candidates: Array<{ id: string | number; title: string; weight: number }> = [];

  for (const a of animes || []) {
    if (!a || !a.id) continue;
    excludedIds.add(String(a.id));
    const score = sanitizeUserScore(a.userScore) ?? 0;
    const status = String(a.listStatus || 'plan_to_watch');
    if (status === 'dropped') continue;

    let statusBonus = 1;
    if (status === 'completed') statusBonus = 4;
    else if (status === 'watching') statusBonus = 3;

    const genreWeight = score > 0 ? score : statusBonus;
    if (Array.isArray(a.genres)) {
      for (const g of a.genres) {
        const clean = String(g || '').trim();
        if (clean) genreFreq.set(clean, (genreFreq.get(clean) || 0) + genreWeight);
      }
    }

    const title = a.title?.english || a.title?.romaji || 'Anime';
    candidates.push({
      id: a.id,
      title: String(title),
      weight: score * 10 + statusBonus
    });
  }

  for (const h of history || []) {
    const a = h?.anime;
    if (!a || !a.id) continue;
    const sid = String(a.id);
    if (!excludedIds.has(sid)) {
      excludedIds.add(sid);
      candidates.push({
        id: a.id,
        title: String(a.title?.english || a.title?.romaji || 'Anime'),
        weight: 2
      });
    }
    if (Array.isArray(a.genres)) {
      for (const g of a.genres) {
        const clean = String(g || '').trim();
        if (clean) genreFreq.set(clean, (genreFreq.get(clean) || 0) + 1);
      }
    }
  }

  candidates.sort((a, b) => b.weight - a.weight);
  const topGenres = Array.from(genreFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);

  const best = candidates[0] ? { id: candidates[0].id, title: candidates[0].title } : null;
  return {
    becauseOfAnime: best,
    topGenres,
    excludedIds
  };
}

export function rankSmartCandidates<T extends Record<string, any>>(
  pool: readonly T[],
  topGenres: readonly string[],
  excludedIds: Set<string>,
  limit = 14
): T[] {
  const genreOrder = new Map<string, number>();
  topGenres.forEach((g, idx) => genreOrder.set(g.toLowerCase(), topGenres.length - idx));

  const scored: Array<{ item: T; score: number }> = [];
  const seen = new Set<string>();

  for (const item of pool) {
    if (!item || !item.id) continue;
    const sid = String(item.id);
    if (excludedIds.has(sid) || seen.has(sid)) continue;
    seen.add(sid);

    let matchScore = 0;
    if (Array.isArray(item.genres)) {
      for (const g of item.genres) {
        const w = genreOrder.get(String(g || '').trim().toLowerCase()) || 0;
        matchScore += w * 10;
      }
    }
    const avg = Number(item.averageScore || 0);
    if (Number.isFinite(avg) && avg > 0) matchScore += avg / 20;
    scored.push({ item, score: matchScore });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}
