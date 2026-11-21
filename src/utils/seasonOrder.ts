export type MediaNodeId = number | string;

export interface AniListMediaNode {
  id: MediaNodeId;
  idMal?: number | null;
  hentailaSlug?: string | null;
  title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
  synonyms?: string[] | null;
  isAdult?: boolean | null;
  averageScore?: number | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  episodesCount?: number | null;
  nextAiringEpisode?: { episode?: number | null; timeUntilAiring?: number | null } | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  seasonYear?: number | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
  bannerImage?: string | null;
  description?: string | null;
  genres?: string[] | null;
  relations?: {
    edges?: Array<{
      relationType?: string | null;
      node?: AniListMediaNode | null;
    }> | null;
  } | null;
}

export type SeasonTier = 'MAIN_SEASON' | 'MOVIE' | 'OVA' | 'SPECIAL' | 'ONA_SHORT';

export interface OrganizedSeasonEntry {
  id: MediaNodeId;
  idMal?: number | null;
  averageScore?: number | null;
  seasonYear?: number | null;
  hentailaSlug?: string | null;
  seasonNumber: number;
  tier: SeasonTier;
  shortTag: string;
  title: string;
  romaji?: string;
  english?: string;
  displayLabel: string;
  episodeLabel: string;
  format: string;
  status: string;
  totalEpisodes: number;
  isUpcoming: boolean;
  nextAiringEpisode?: { episode?: number | null; timeUntilAiring?: number | null } | null;
  sortDateKey: number;
  coverImage: string;
  bannerImage: string;
  description: string;
}

export interface OrganizedFranchiseResult {
  seasons: OrganizedSeasonEntry[];
  initialIndex: number;
  franchiseTitle: string;
}

const VALID_ANIME_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA', 'OVA', 'MOVIE', 'SPECIAL']);
const NON_ANIME_FORMATS = new Set(['MANGA', 'NOVEL', 'ONE_SHOT', 'MUSIC']);
const ALLOWED_RELATION_TYPES = new Set([
  'PREQUEL',
  'SEQUEL',
  'PARENT',
  'SIDE_STORY',
  'SPIN_OFF',
  'SUMMARY',
  'COMPILATION'
]);
const MAIN_CONTINUITY_RELS = new Set(['PREQUEL', 'SEQUEL', 'PARENT']);

function isValidMediaId(id: unknown): id is MediaNodeId {
  if (typeof id === 'number') return Number.isFinite(id) && id > 0;
  if (typeof id === 'string') return id.trim().length > 0;
  return false;
}

function toIdKey(id: MediaNodeId): string {
  return String(id).trim();
}

function normalizeNodeFormat(rawFormat: string | null | undefined, isRootNode: boolean): string | null {
  const upper = String(rawFormat || '').trim().toUpperCase();
  if (!upper) return 'TV';
  if (VALID_ANIME_FORMATS.has(upper)) return upper;
  if (NON_ANIME_FORMATS.has(upper)) return null;
  if (isRootNode) {
    if (/HENTAI|CENSURA|UNCENSORED|OVA/i.test(upper)) return 'OVA';
    if (/PELICULA|MOVIE|FILM/i.test(upper)) return 'MOVIE';
    if (/SPECIAL|ESPECIAL/i.test(upper)) return 'SPECIAL';
    if (/ONA|WEB/i.test(upper)) return 'ONA';
    return 'OVA';
  }
  return null;
}

export function computeAvailableEpisodes(node: AniListMediaNode | null | undefined): {
  totalEpisodes: number;
  isUpcoming: boolean;
} {
  if (!node) return { totalEpisodes: 0, isUpcoming: false };
  const rawEpisodes = Number(node.episodes ?? node.episodesCount ?? 0);
  if (node.status === 'NOT_YET_RELEASED') {
    return { totalEpisodes: 0, isUpcoming: true };
  }
  if (node.status === 'RELEASING') {
    if (node.nextAiringEpisode?.episode) {
      return {
        totalEpisodes: Math.max(0, Number(node.nextAiringEpisode.episode) - 1),
        isUpcoming: false
      };
    }
    if (Number.isFinite(rawEpisodes) && rawEpisodes > 0) {
      return {
        totalEpisodes: Math.max(1, Math.floor(rawEpisodes)),
        isUpcoming: false
      };
    }
    return {
      totalEpisodes: 1,
      isUpcoming: false
    };
  }
  return {
    totalEpisodes: Number.isFinite(rawEpisodes) ? Math.max(0, Math.floor(rawEpisodes)) : 0,
    isUpcoming: false
  };
}

function getDateSortKey(node: AniListMediaNode): number {
  const y = Number(node.startDate?.year || node.seasonYear || 0);
  if (!y || y <= 0) return 99999999;
  const m = Number(node.startDate?.month || 12);
  const d = Number(node.startDate?.day || 28);
  return y * 10000 + m * 100 + d;
}

function normalizeTitleForDedup(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripBaseSeriesPrefix(title: string, baseTitle: string): string {
  const cleanT = title.trim();
  const cleanB = baseTitle.trim();
  if (!cleanT || !cleanB || cleanT.toLowerCase() === cleanB.toLowerCase()) return cleanT;
  return cleanT;
}

export function extractGraphFromMediaRoots(roots: AniListMediaNode[]): {
  nodesById: Map<string, AniListMediaNode>;
  directedPrequelEdges: Map<string, Set<string>>;
  undirectedNeighbors: Map<string, Set<string>>;
  relationKindMap: Map<string, string>;
} {
  const nodesById = new Map<string, AniListMediaNode>();
  const directedPrequelEdges = new Map<string, Set<string>>();
  const undirectedNeighbors = new Map<string, Set<string>>();
  const relationKindMap = new Map<string, string>();
  const visitedObjects = new Set<AniListMediaNode>();

  const addUndirected = (a: string, b: string) => {
    if (!undirectedNeighbors.has(a)) undirectedNeighbors.set(a, new Set());
    if (!undirectedNeighbors.has(b)) undirectedNeighbors.set(b, new Set());
    undirectedNeighbors.get(a)!.add(b);
    undirectedNeighbors.get(b)!.add(a);
  };

  const addDirected = (beforeKey: string, afterKey: string) => {
    if (beforeKey === afterKey) return;
    if (!directedPrequelEdges.has(beforeKey)) directedPrequelEdges.set(beforeKey, new Set());
    directedPrequelEdges.get(beforeKey)!.add(afterKey);
  };

  const mergeNodeData = (node: AniListMediaNode, normalizedFmt: string) => {
    const key = toIdKey(node.id);
    const existing = nodesById.get(key);
    const mergedEpisodes = node.episodes ?? node.episodesCount ?? existing?.episodes ?? existing?.episodesCount ?? null;
    if (!existing) {
      nodesById.set(key, {
        ...node,
        format: normalizedFmt,
        episodes: mergedEpisodes
      });
      return;
    }
    nodesById.set(key, {
      ...existing,
      ...node,
      idMal: node.idMal ?? existing.idMal,
      hentailaSlug: node.hentailaSlug || existing.hentailaSlug,
      status:
        (existing.status === 'RELEASING' || existing.status === 'FINISHED') &&
        (!node.status || node.status === 'NOT_YET_RELEASED')
          ? existing.status
          : (node.status || existing.status),
      format: normalizedFmt || existing.format,
      episodes: mergedEpisodes,
      nextAiringEpisode:
        node.nextAiringEpisode?.episode
          ? node.nextAiringEpisode
          : existing.nextAiringEpisode,
      startDate:
        node.startDate?.year
          ? node.startDate
          : existing.startDate,
      seasonYear: node.seasonYear ?? existing.seasonYear,
      averageScore: node.averageScore ?? existing.averageScore,
      genres:
        Array.isArray(node.genres) && node.genres.length > 0
          ? node.genres
          : existing.genres,
      synonyms:
        Array.isArray(node.synonyms) && node.synonyms.length > 0
          ? node.synonyms
          : existing.synonyms,
      isAdult: node.isAdult ?? existing.isAdult,
      title:
        node.title?.english || node.title?.romaji
          ? {
              romaji: node.title?.romaji || existing.title?.romaji,
              english: node.title?.english || existing.title?.english,
              native: node.title?.native || existing.title?.native
            }
          : existing.title,
      coverImage: node.coverImage?.extraLarge || node.coverImage?.large ? node.coverImage : existing.coverImage,
      bannerImage: node.bannerImage || existing.bannerImage,
      description: node.description || existing.description,
      relations:
        (node.relations?.edges?.length || 0) >= (existing.relations?.edges?.length || 0)
          ? node.relations
          : existing.relations
    });
  };

  const visit = (node: AniListMediaNode | null | undefined, isRootNode: boolean) => {
    if (!node || !isValidMediaId(node.id) || visitedObjects.has(node)) return;
    visitedObjects.add(node);

    const normalizedFmt = normalizeNodeFormat(node.format, isRootNode);
    if (!normalizedFmt) return;

    const nodeKey = toIdKey(node.id);
    mergeNodeData(node, normalizedFmt);

    const edges = node.relations?.edges || [];
    for (const edge of edges) {
      const rel = String(edge?.relationType || '').toUpperCase();
      const target = edge?.node;
      if (!target || !isValidMediaId(target.id)) continue;
      if (!ALLOWED_RELATION_TYPES.has(rel)) continue;

      const targetFmt = normalizeNodeFormat(target.format, false);
      if (!targetFmt) continue;

      const targetKey = toIdKey(target.id);
      addUndirected(nodeKey, targetKey);
      relationKindMap.set(`${nodeKey}->${targetKey}`, rel);

      if (rel === 'SEQUEL') {
        addDirected(nodeKey, targetKey);
      } else if (rel === 'PREQUEL') {
        addDirected(targetKey, nodeKey);
      }

      visit(target, false);
    }
  };

  for (const r of roots) {
    visit(r, true);
  }

  return { nodesById, directedPrequelEdges, undirectedNeighbors, relationKindMap };
}

export function organizeAnimeFranchise(
  roots: AniListMediaNode[],
  openedAnimeId: MediaNodeId
): OrganizedFranchiseResult {
  if (!isValidMediaId(openedAnimeId)) {
    return { seasons: [], initialIndex: 0, franchiseTitle: '' };
  }
  const openedKey = toIdKey(openedAnimeId);
  const { nodesById, directedPrequelEdges, undirectedNeighbors, relationKindMap } =
    extractGraphFromMediaRoots(roots);

  if (!nodesById.has(openedKey)) {
    return { seasons: [], initialIndex: 0, franchiseTitle: '' };
  }

  // BFS reachable component from openedAnimeId through allowed relations
  const reachable = new Set<string>([openedKey]);
  const queue: string[] = [openedKey];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const neighbors = undirectedNeighbors.get(curr);
    if (!neighbors) continue;
    for (const nxt of neighbors) {
      if (!reachable.has(nxt) && nodesById.has(nxt)) {
        reachable.add(nxt);
        queue.push(nxt);
      }
    }
  }

  const allNodes = Array.from(reachable)
    .map((key) => nodesById.get(key)!)
    .filter(Boolean);

  const isSeriesFormat = (fmt?: string | null) => fmt === 'TV' || fmt === 'ONA';

  // Identify mainline continuity nodes connected strictly by PREQUEL / SEQUEL
  const mainContinuityKeys = new Set<string>();
  const continuityStartNodes = allNodes.filter((n) => isSeriesFormat(n.format));
  if (continuityStartNodes.length > 0) {
    let seedKey = openedKey;
    const openedNode = nodesById.get(openedKey);
    if (!isSeriesFormat(openedNode?.format)) {
      const parentEdge = Array.from(undirectedNeighbors.get(openedKey) || []).find(
        (nKey) =>
          MAIN_CONTINUITY_RELS.has(relationKindMap.get(`${openedKey}->${nKey}`) || '') &&
          isSeriesFormat(nodesById.get(nKey)?.format)
      );
      if (parentEdge) seedKey = parentEdge;
      else seedKey = toIdKey(continuityStartNodes[0].id);
    }

    const qMain = [seedKey];
    mainContinuityKeys.add(seedKey);
    while (qMain.length > 0) {
      const curr = qMain.shift()!;
      const neighbors = undirectedNeighbors.get(curr) || new Set<string>();
      for (const nxt of neighbors) {
        if (mainContinuityKeys.has(nxt)) continue;
        const r1 = relationKindMap.get(`${curr}->${nxt}`);
        const r2 = relationKindMap.get(`${nxt}->${curr}`);
        const rel = r1 || r2 || '';
        const nxtNode = nodesById.get(nxt);
        if (!nxtNode) continue;
        if (rel === 'PREQUEL' || rel === 'SEQUEL') {
          if (isSeriesFormat(nxtNode.format)) {
            mainContinuityKeys.add(nxt);
            qMain.push(nxt);
          }
        }
      }
    }
  }

  // Kahn topological sort over all reachable nodes honoring directed PREQUEL -> SEQUEL edges + chronological date
  const inDegree = new Map<string, number>();
  for (const n of allNodes) inDegree.set(toIdKey(n.id), 0);
  for (const [beforeKey, afterSet] of directedPrequelEdges.entries()) {
    if (!reachable.has(beforeKey)) continue;
    for (const afterKey of afterSet) {
      if (!reachable.has(afterKey)) continue;
      inDegree.set(afterKey, (inDegree.get(afterKey) || 0) + 1);
    }
  }

  const compareByDateThenId = (a: AniListMediaNode, b: AniListMediaNode) => {
    const da = getDateSortKey(a);
    const db = getDateSortKey(b);
    if (da !== db) return da - db;
    if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
    return toIdKey(a.id).localeCompare(toIdKey(b.id));
  };

  const ready: AniListMediaNode[] = allNodes
    .filter((n) => (inDegree.get(toIdKey(n.id)) || 0) === 0)
    .sort(compareByDateThenId);

  const topoOrdered: AniListMediaNode[] = [];
  const usedKeys = new Set<string>();

  while (ready.length > 0) {
    const current = ready.shift()!;
    const currentKey = toIdKey(current.id);
    if (usedKeys.has(currentKey)) continue;
    usedKeys.add(currentKey);
    topoOrdered.push(current);

    const targets = directedPrequelEdges.get(currentKey);
    if (targets) {
      for (const tKey of targets) {
        if (!reachable.has(tKey) || usedKeys.has(tKey)) continue;
        const deg = (inDegree.get(tKey) || 1) - 1;
        inDegree.set(tKey, deg);
        if (deg <= 0) {
          const tNode = nodesById.get(tKey);
          if (tNode) {
            ready.push(tNode);
            ready.sort(compareByDateThenId);
          }
        }
      }
    }
  }

  // Push any cyclic leftovers in chronological order
  for (const n of [...allNodes].sort(compareByDateThenId)) {
    const nKey = toIdKey(n.id);
    if (!usedKeys.has(nKey)) {
      usedKeys.add(nKey);
      topoOrdered.push(n);
    }
  }

  // Partition into Mainline Seasons vs Extras (Movies, OVAs, Specials, ONA/Shorts, External Catalog)
  const mainNodes: AniListMediaNode[] = [];
  const extraNodes: AniListMediaNode[] = [];

  for (const n of topoOrdered) {
    const nKey = toIdKey(n.id);
    const fmt = String(n.format || 'TV').toUpperCase();
    if (mainContinuityKeys.has(nKey)) {
      mainNodes.push(n);
    } else if (['MOVIE', 'OVA', 'SPECIAL', 'TV_SHORT', 'ONA'].includes(fmt)) {
      extraNodes.push(n);
    } else if (fmt === 'TV' || !NON_ANIME_FORMATS.has(fmt)) {
      // Secondary TV spinoff or external catalog entry
      extraNodes.push(n);
    }
  }

  // Deduplicate within combined order cleanly
  const dedupedOrdered: Array<{ node: AniListMediaNode; isMain: boolean }> = [];
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();

  const pushUnique = (node: AniListMediaNode, isMain: boolean) => {
    const nKey = toIdKey(node.id);
    if (seenIds.has(nKey)) return;
    const rawTitle = node.title?.english || node.title?.romaji || `Anime ${node.id}`;
    const normTitle = normalizeTitleForDedup(rawTitle);
    const key = `${normTitle}::${node.format || 'TV'}::${node.startDate?.year || node.seasonYear || ''}`;
    if (normTitle && seenKeys.has(key) && nKey !== openedKey) return;
    seenIds.add(nKey);
    if (normTitle) seenKeys.add(key);
    dedupedOrdered.push({ node, isMain });
  };

  mainNodes.forEach((n) => pushUnique(n, true));
  extraNodes.forEach((n) => pushUnique(n, false));

  const franchiseTitle =
    (dedupedOrdered[0]?.node.title?.english ||
      dedupedOrdered[0]?.node.title?.romaji ||
      nodesById.get(openedKey)?.title?.english ||
      nodesById.get(openedKey)?.title?.romaji ||
      '').trim();

  let mainCounter = 0;
  const seasons: OrganizedSeasonEntry[] = [];

  for (const { node, isMain } of dedupedOrdered) {
    const nKey = toIdKey(node.id);
    const { totalEpisodes, isUpcoming } = computeAvailableEpisodes(node);
    const fmt = String(node.format || 'TV').toUpperCase();
    const rawTitle = (node.title?.english || node.title?.romaji || `Temporada ${mainCounter + 1}`).trim();
    const year = node.startDate?.year || node.seasonYear || '';

    // Omit completely unannounced/0-ep side-stories unless it is the currently opened item or mainline upcoming
    if (!isMain && totalEpisodes === 0 && !isUpcoming && nKey !== openedKey) {
      continue;
    }

    let tier: SeasonTier = 'SPECIAL';
    let shortTag = 'Especial';

    if (isMain) {
      tier = 'MAIN_SEASON';
      // Check if title explicitly denotes Part 2 / Cour 2 without being a brand new season increment
      const partMatch = rawTitle.match(/\b(?:part|parte|cour)\s*([2-9])\b/i);
      if (partMatch && mainCounter > 0) {
        shortTag = `T${mainCounter} · P${partMatch[1]}`;
      } else {
        mainCounter += 1;
        shortTag = `T${mainCounter}`;
      }
    } else if (fmt === 'MOVIE') {
      tier = 'MOVIE';
      shortTag = 'Película';
    } else if (fmt === 'OVA' || /HENTAI|CENSURA|UNCENSORED/i.test(fmt)) {
      tier = 'OVA';
      shortTag = 'OVA';
    } else if (fmt === 'TV_SHORT' || fmt === 'ONA') {
      tier = 'ONA_SHORT';
      shortTag = 'Cortos';
    } else {
      tier = 'SPECIAL';
      shortTag = 'Especial';
    }

    let episodeLabel = '';
    if (isUpcoming) {
      episodeLabel = year ? `Próximamente (${year})` : 'Próximamente';
    } else if (totalEpisodes === 0) {
      episodeLabel = 'Pendiente';
    } else if (fmt === 'MOVIE' && totalEpisodes === 1) {
      episodeLabel = 'Película';
    } else {
      episodeLabel = `${totalEpisodes} ${totalEpisodes === 1 ? 'Episodio' : 'Episodios'}`;
    }

    const cleanSubTitle = stripBaseSeriesPrefix(rawTitle, franchiseTitle);
    const displayLabel = isMain
      ? `${shortTag}: ${cleanSubTitle}`
      : `${shortTag} · ${cleanSubTitle}`;

    seasons.push({
      id: node.id,
      ...(node.idMal ? { idMal: node.idMal } : {}),
      ...(node.averageScore ? { averageScore: node.averageScore } : {}),
      ...(node.seasonYear || node.startDate?.year ? { seasonYear: Number(node.seasonYear || node.startDate?.year) } : {}),
      ...(node.hentailaSlug ? { hentailaSlug: node.hentailaSlug } : {}),
      seasonNumber: isMain ? mainCounter || 1 : mainCounter + 1,
      tier,
      shortTag,
      title: rawTitle,
      romaji: (node.title?.romaji || rawTitle).trim(),
      english: (node.title?.english || rawTitle).trim(),
      displayLabel,
      episodeLabel,
      format: fmt,
      status: String(node.status || 'FINISHED'),
      totalEpisodes,
      isUpcoming,
      nextAiringEpisode: node.nextAiringEpisode || null,
      sortDateKey: getDateSortKey(node),
      coverImage: node.coverImage?.extraLarge || node.coverImage?.large || '',
      bannerImage: node.bannerImage || node.coverImage?.extraLarge || node.coverImage?.large || '',
      description: String(node.description || '')
    });
  }

  let initialIndex = seasons.findIndex((s) => toIdKey(s.id) === openedKey);
  if (initialIndex < 0) initialIndex = 0;

  return {
    seasons,
    initialIndex,
    franchiseTitle
  };
}
