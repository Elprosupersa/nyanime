export interface AniListMediaNode {
  id: number;
  title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
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
  id: number;
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

export function computeAvailableEpisodes(node: AniListMediaNode | null | undefined): {
  totalEpisodes: number;
  isUpcoming: boolean;
} {
  if (!node) return { totalEpisodes: 0, isUpcoming: false };
  if (node.status === 'NOT_YET_RELEASED') {
    return { totalEpisodes: 0, isUpcoming: true };
  }
  if (node.status === 'RELEASING' && node.nextAiringEpisode?.episode) {
    return {
      totalEpisodes: Math.max(0, Number(node.nextAiringEpisode.episode) - 1),
      isUpcoming: false
    };
  }
  return {
    totalEpisodes: Math.max(0, Number(node.episodes || 0)),
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
  nodesById: Map<number, AniListMediaNode>;
  directedPrequelEdges: Map<number, Set<number>>;
  undirectedNeighbors: Map<number, Set<number>>;
  relationKindMap: Map<string, string>;
} {
  const nodesById = new Map<number, AniListMediaNode>();
  const directedPrequelEdges = new Map<number, Set<number>>();
  const undirectedNeighbors = new Map<number, Set<number>>();
  const relationKindMap = new Map<string, string>();
  const visitedObjects = new Set<AniListMediaNode>();

  const addUndirected = (a: number, b: number) => {
    if (!undirectedNeighbors.has(a)) undirectedNeighbors.set(a, new Set());
    if (!undirectedNeighbors.has(b)) undirectedNeighbors.set(b, new Set());
    undirectedNeighbors.get(a)!.add(b);
    undirectedNeighbors.get(b)!.add(a);
  };

  const addDirected = (beforeId: number, afterId: number) => {
    if (beforeId === afterId) return;
    if (!directedPrequelEdges.has(beforeId)) directedPrequelEdges.set(beforeId, new Set());
    directedPrequelEdges.get(beforeId)!.add(afterId);
  };

  const mergeNodeData = (node: AniListMediaNode) => {
    const existing = nodesById.get(node.id);
    if (!existing) {
      nodesById.set(node.id, node);
      return;
    }
    nodesById.set(node.id, {
      ...existing,
      ...node,
      title: node.title?.english || node.title?.romaji ? { ...existing.title, ...node.title } : existing.title,
      coverImage: node.coverImage?.extraLarge || node.coverImage?.large ? node.coverImage : existing.coverImage,
      bannerImage: node.bannerImage || existing.bannerImage,
      description: node.description || existing.description,
      relations:
        (node.relations?.edges?.length || 0) >= (existing.relations?.edges?.length || 0)
          ? node.relations
          : existing.relations
    });
  };

  const visit = (node: AniListMediaNode | null | undefined) => {
    if (!node || typeof node.id !== 'number' || visitedObjects.has(node)) return;
    visitedObjects.add(node);

    const fmt = String(node.format || 'TV').toUpperCase();
    if (!VALID_ANIME_FORMATS.has(fmt)) return;

    mergeNodeData(node);

    const edges = node.relations?.edges || [];
    for (const edge of edges) {
      const rel = String(edge?.relationType || '').toUpperCase();
      const target = edge?.node;
      if (!target || typeof target.id !== 'number') continue;
      if (!ALLOWED_RELATION_TYPES.has(rel)) continue;

      const targetFmt = String(target.format || '').toUpperCase();
      if (!VALID_ANIME_FORMATS.has(targetFmt)) continue;

      addUndirected(node.id, target.id);
      relationKindMap.set(`${node.id}->${target.id}`, rel);

      if (rel === 'SEQUEL') {
        addDirected(node.id, target.id);
      } else if (rel === 'PREQUEL') {
        addDirected(target.id, node.id);
      }

      visit(target);
    }
  };

  for (const r of roots) {
    visit(r);
  }

  return { nodesById, directedPrequelEdges, undirectedNeighbors, relationKindMap };
}

export function organizeAnimeFranchise(
  roots: AniListMediaNode[],
  openedAnimeId: number
): OrganizedFranchiseResult {
  const { nodesById, directedPrequelEdges, undirectedNeighbors, relationKindMap } =
    extractGraphFromMediaRoots(roots);

  if (!nodesById.has(openedAnimeId)) {
    return { seasons: [], initialIndex: 0, franchiseTitle: '' };
  }

  // BFS reachable component from openedAnimeId through allowed relations
  const reachable = new Set<number>([openedAnimeId]);
  const queue: number[] = [openedAnimeId];
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
    .map((id) => nodesById.get(id)!)
    .filter(Boolean);

  const isSeriesFormat = (fmt?: string | null) => fmt === 'TV' || fmt === 'ONA';

  // Identify mainline continuity nodes connected strictly by PREQUEL / SEQUEL
  const mainContinuityIds = new Set<number>();
  const continuityStartIds = allNodes.filter((n) => isSeriesFormat(n.format));
  if (continuityStartIds.length > 0) {
    let seedId = openedAnimeId;
    const openedNode = nodesById.get(openedAnimeId);
    if (!isSeriesFormat(openedNode?.format)) {
      const parentEdge = Array.from(undirectedNeighbors.get(openedAnimeId) || []).find(
        (nid) =>
          MAIN_CONTINUITY_RELS.has(relationKindMap.get(`${openedAnimeId}->${nid}`) || '') &&
          isSeriesFormat(nodesById.get(nid)?.format)
      );
      if (parentEdge) seedId = parentEdge;
      else seedId = continuityStartIds[0].id;
    }

    const qMain = [seedId];
    mainContinuityIds.add(seedId);
    while (qMain.length > 0) {
      const curr = qMain.shift()!;
      const neighbors = undirectedNeighbors.get(curr) || new Set<number>();
      for (const nxt of neighbors) {
        if (mainContinuityIds.has(nxt)) continue;
        const r1 = relationKindMap.get(`${curr}->${nxt}`);
        const r2 = relationKindMap.get(`${nxt}->${curr}`);
        const rel = r1 || r2 || '';
        const nxtNode = nodesById.get(nxt);
        if (!nxtNode) continue;
        if (rel === 'PREQUEL' || rel === 'SEQUEL') {
          if (isSeriesFormat(nxtNode.format)) {
            mainContinuityIds.add(nxt);
            qMain.push(nxt);
          }
        }
      }
    }
  }

  // Kahn topological sort over all reachable nodes honoring directed PREQUEL -> SEQUEL edges + chronological date
  const inDegree = new Map<number, number>();
  for (const n of allNodes) inDegree.set(n.id, 0);
  for (const [beforeId, afterSet] of directedPrequelEdges.entries()) {
    if (!reachable.has(beforeId)) continue;
    for (const afterId of afterSet) {
      if (!reachable.has(afterId)) continue;
      inDegree.set(afterId, (inDegree.get(afterId) || 0) + 1);
    }
  }

  const compareByDateThenId = (a: AniListMediaNode, b: AniListMediaNode) => {
    const da = getDateSortKey(a);
    const db = getDateSortKey(b);
    if (da !== db) return da - db;
    return a.id - b.id;
  };

  const ready: AniListMediaNode[] = allNodes
    .filter((n) => (inDegree.get(n.id) || 0) === 0)
    .sort(compareByDateThenId);

  const topoOrdered: AniListMediaNode[] = [];
  const usedIds = new Set<number>();

  while (ready.length > 0) {
    const current = ready.shift()!;
    if (usedIds.has(current.id)) continue;
    usedIds.add(current.id);
    topoOrdered.push(current);

    const targets = directedPrequelEdges.get(current.id);
    if (targets) {
      for (const tId of targets) {
        if (!reachable.has(tId) || usedIds.has(tId)) continue;
        const deg = (inDegree.get(tId) || 1) - 1;
        inDegree.set(tId, deg);
        if (deg <= 0) {
          const tNode = nodesById.get(tId);
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
    if (!usedIds.has(n.id)) {
      usedIds.add(n.id);
      topoOrdered.push(n);
    }
  }

  // Partition into Mainline Seasons vs Extras (Movies, OVAs, Specials, ONA/Shorts)
  const mainNodes: AniListMediaNode[] = [];
  const extraNodes: AniListMediaNode[] = [];

  for (const n of topoOrdered) {
    if (mainContinuityIds.has(n.id)) {
      mainNodes.push(n);
    } else if (
      ['MOVIE', 'OVA', 'SPECIAL', 'TV_SHORT', 'ONA'].includes(String(n.format || '').toUpperCase())
    ) {
      extraNodes.push(n);
    } else if (n.format === 'TV') {
      // Secondary TV spinoff
      extraNodes.push(n);
    }
  }

  // Deduplicate within combined order cleanly
  const dedupedOrdered: Array<{ node: AniListMediaNode; isMain: boolean }> = [];
  const seenKeys = new Set<string>();
  const seenIds = new Set<number>();

  const pushUnique = (node: AniListMediaNode, isMain: boolean) => {
    if (seenIds.has(node.id)) return;
    const rawTitle = node.title?.english || node.title?.romaji || `Anime ${node.id}`;
    const normTitle = normalizeTitleForDedup(rawTitle);
    const key = `${normTitle}::${node.format || 'TV'}::${node.startDate?.year || node.seasonYear || ''}`;
    if (normTitle && seenKeys.has(key) && node.id !== openedAnimeId) return;
    seenIds.add(node.id);
    if (normTitle) seenKeys.add(key);
    dedupedOrdered.push({ node, isMain });
  };

  mainNodes.forEach((n) => pushUnique(n, true));
  extraNodes.forEach((n) => pushUnique(n, false));

  const franchiseTitle =
    (dedupedOrdered[0]?.node.title?.english ||
      dedupedOrdered[0]?.node.title?.romaji ||
      nodesById.get(openedAnimeId)?.title?.english ||
      nodesById.get(openedAnimeId)?.title?.romaji ||
      '').trim();

  let mainCounter = 0;
  const seasons: OrganizedSeasonEntry[] = [];

  for (const { node, isMain } of dedupedOrdered) {
    const { totalEpisodes, isUpcoming } = computeAvailableEpisodes(node);
    const fmt = String(node.format || 'TV').toUpperCase();
    const rawTitle = (node.title?.english || node.title?.romaji || `Temporada ${mainCounter + 1}`).trim();
    const year = node.startDate?.year || node.seasonYear || '';

    // Omit completely unannounced/0-ep side-stories unless it is the currently opened item or mainline upcoming
    if (!isMain && totalEpisodes === 0 && !isUpcoming && node.id !== openedAnimeId) {
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
      shortTag = '🎬 Película';
    } else if (fmt === 'OVA') {
      tier = 'OVA';
      shortTag = '🎞️ OVA';
    } else if (fmt === 'TV_SHORT' || fmt === 'ONA') {
      tier = 'ONA_SHORT';
      shortTag = '📺 Cortos';
    } else {
      tier = 'SPECIAL';
      shortTag = '✨ Especial';
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
      sortDateKey: getDateSortKey(node),
      coverImage: node.coverImage?.extraLarge || node.coverImage?.large || '',
      bannerImage: node.bannerImage || node.coverImage?.extraLarge || node.coverImage?.large || '',
      description: String(node.description || '')
    });
  }

  let initialIndex = seasons.findIndex((s) => s.id === openedAnimeId);
  if (initialIndex < 0) initialIndex = 0;

  return {
    seasons,
    initialIndex,
    franchiseTitle
  };
}
