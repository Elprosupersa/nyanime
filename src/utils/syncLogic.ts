export interface FavoriteSyncMergeInput {
  localIds: string[];
  cloudIds: string[];
  deletedIds: string[];
}

export interface FavoriteSyncMergeOutput {
  toUpload: string[];
  toKeepLocal: string[];
  toDeleteCloud: string[];
}

/**
 * Resuelve conflictos de favoritos respetando borrados explícitos (tombstones)
 * para evitar que un item eliminado localmente resucite tras el siguiente sync.
 */
export function resolveFavoritesMerge(input: FavoriteSyncMergeInput): FavoriteSyncMergeOutput {
  const localSet = new Set(input.localIds.map(String));
  const cloudSet = new Set(input.cloudIds.map(String));
  const deletedSet = new Set(input.deletedIds.map(String));

  const toDeleteCloud: string[] = [];
  const toUpload: string[] = [];
  const toKeepLocal: string[] = [];

  for (const id of cloudSet) {
    if (deletedSet.has(id) && !localSet.has(id)) {
      toDeleteCloud.push(id);
    } else {
      toKeepLocal.push(id);
    }
  }

  for (const id of localSet) {
    if (!cloudSet.has(id)) {
      toUpload.push(id);
    }
    if (!toKeepLocal.includes(id)) {
      toKeepLocal.push(id);
    }
  }

  return { toUpload, toKeepLocal, toDeleteCloud };
}

export interface MangaReadMergeInput {
  localChapters: string[];
  cloudChapters: string[];
  localUpdatedAt: number;
  cloudUpdatedAt: number;
  explicitLocalWrite?: boolean;
}

/**
 * Resuelve capítulos leídos sin resucitar capítulos desmarcados explícitamente.
 * - Si hubo una escritura/desmarcado explícito más reciente en local (`explicitLocalWrite` o `localUpdatedAt > cloudUpdatedAt`),
 *   prevalece exactamente el conjunto local (incluyendo `[]` si el usuario desmarcó todos).
 * - Si el estado de la nube es estrictamente más reciente (`cloudUpdatedAt > localUpdatedAt` y no hay cambio local más nuevo),
 *   prevalece la nube.
 * - En caso de empate exacto de marcas de tiempo, se unen sin pérdida.
 */
export function resolveMangaReadChapters(input: MangaReadMergeInput): string[] {
  const cleanLocal = Array.from(new Set((input.localChapters || []).map(String))).slice(0, 3000);
  const cleanCloud = Array.from(new Set((input.cloudChapters || []).map(String))).slice(0, 3000);

  if (input.explicitLocalWrite && input.localUpdatedAt >= input.cloudUpdatedAt) {
    return cleanLocal;
  }
  if (input.localUpdatedAt > input.cloudUpdatedAt) {
    return cleanLocal;
  }
  if (input.cloudUpdatedAt > input.localUpdatedAt) {
    return cleanCloud;
  }
  return Array.from(new Set([...cleanLocal, ...cleanCloud])).slice(0, 3000);
}

export interface HistoryDeletionFilterInput<T extends { id: string | number; timestamp: number }> {
  cloudEntries: T[];
  clearedAtTimestamp: number;
}

/**
 * Evita que entradas de historial anteriores a una limpieza explícita (`clearedAtTimestamp`)
 * vuelvan a importarse desde la nube.
 */
export function filterZombieHistoryEntries<T extends { id: string | number; timestamp: number }>(
  input: HistoryDeletionFilterInput<T>
): { validCloudEntries: T[]; zombieCloudIds: Array<string | number> } {
  const cutoff = Number(input.clearedAtTimestamp || 0);
  const validCloudEntries: T[] = [];
  const zombieCloudIds: Array<string | number> = [];

  for (const entry of input.cloudEntries) {
    if (cutoff > 0 && Number(entry.timestamp || 0) <= cutoff) {
      zombieCloudIds.push(entry.id);
    } else {
      validCloudEntries.push(entry);
    }
  }

  return { validCloudEntries, zombieCloudIds };
}

export type FavoriteStatusSyncSide = 'local' | 'cloud' | 'none';

export interface FavoriteStatusSyncResult {
  listStatus: string;
  listUpdatedAt: number;
  winner: FavoriteStatusSyncSide;
}

/**
 * Resuelve conflictos de categoría (listStatus) entre favorito local y en la nube
 * usando el timestamp más reciente (`listUpdatedAt`).
 */
export function resolveFavoriteStatusSync(input: {
  localStatus?: unknown;
  localUpdatedAt?: unknown;
  cloudStatus?: unknown;
  cloudUpdatedAt?: unknown;
}): FavoriteStatusSyncResult {
  const validStatuses = new Set(['watching', 'plan_to_watch', 'completed', 'on_hold', 'dropped']);
  const localStat = typeof input.localStatus === 'string' && validStatuses.has(input.localStatus)
    ? input.localStatus
    : null;
  const cloudStat = typeof input.cloudStatus === 'string' && validStatuses.has(input.cloudStatus)
    ? input.cloudStatus
    : null;
  const localTs = Math.max(0, Math.floor(Number(input.localUpdatedAt || 0)));
  const cloudTs = Math.max(0, Math.floor(Number(input.cloudUpdatedAt || 0)));

  if (!localStat && cloudStat) {
    return { listStatus: cloudStat, listUpdatedAt: cloudTs, winner: 'local' };
  }
  if (localStat && !cloudStat) {
    return { listStatus: localStat, listUpdatedAt: localTs, winner: 'cloud' };
  }
  if (!localStat && !cloudStat) {
    return { listStatus: 'plan_to_watch', listUpdatedAt: 0, winner: 'none' };
  }

  if (localTs > cloudTs) {
    return { listStatus: localStat!, listUpdatedAt: localTs, winner: 'cloud' };
  }
  if (cloudTs > localTs) {
    return { listStatus: cloudStat!, listUpdatedAt: cloudTs, winner: 'local' };
  }
  return {
    listStatus: localStat || cloudStat || 'plan_to_watch',
    listUpdatedAt: Math.max(localTs, cloudTs),
    winner: 'none'
  };
}

export interface AnimeWatchedMergeInput {
  localEpisodes: number[];
  cloudEpisodes: number[];
  localUpdatedAt: number;
  cloudUpdatedAt: number;
  explicitLocalWrite?: boolean;
}

/**
 * Resuelve episodios vistos de anime sin resucitar episodios desmarcados explícitamente.
 */
export function resolveAnimeWatchedMerge(input: AnimeWatchedMergeInput): number[] {
  const cleanLocal = Array.from(
    new Set((input.localEpisodes || []).map(Number).filter((n) => Number.isFinite(n) && n >= 1).map(Math.floor))
  )
    .sort((a, b) => a - b)
    .slice(0, 5000);
  const cleanCloud = Array.from(
    new Set((input.cloudEpisodes || []).map(Number).filter((n) => Number.isFinite(n) && n >= 1).map(Math.floor))
  )
    .sort((a, b) => a - b)
    .slice(0, 5000);

  if (input.explicitLocalWrite && input.localUpdatedAt >= input.cloudUpdatedAt) {
    return cleanLocal;
  }
  if (input.localUpdatedAt > input.cloudUpdatedAt) {
    return cleanLocal;
  }
  if (input.cloudUpdatedAt > input.localUpdatedAt) {
    return cleanCloud;
  }
  return Array.from(new Set([...cleanLocal, ...cleanCloud]))
    .sort((a, b) => a - b)
    .slice(0, 5000);
}

export interface UserProfileSyncInput {
  localName?: string;
  localAvatar?: string;
  localProfileUpdatedAt?: number;
  cloudName?: string;
  cloudAvatar?: string;
  cloudProfileUpdatedAt?: number;
  fallbackName?: string;
  fallbackAvatar?: string;
}

export interface UserProfileSyncResult {
  displayName: string;
  avatar: string;
  profileUpdatedAt: number;
  source: 'local' | 'cloud';
}

/**
 * Resuelve el nombre y avatar de perfil entre almacenamiento local y nube
 * respetando la edición explícita más reciente (`profileUpdatedAt`).
 */
export function resolveUserProfileSync(input: UserProfileSyncInput): UserProfileSyncResult {
  const localTs = Math.max(0, Math.floor(Number(input.localProfileUpdatedAt || 0)));
  const cloudTs = Math.max(0, Math.floor(Number(input.cloudProfileUpdatedAt || 0)));
  const cleanLocalName = String(input.localName || '').trim();
  const cleanCloudName = String(input.cloudName || '').trim();
  const cleanLocalAvatar = String(input.localAvatar || '').trim();
  const cleanCloudAvatar = String(input.cloudAvatar || '').trim();
  const fbName = String(input.fallbackName || 'Usuario').trim() || 'Usuario';
  const fbAvatar = String(input.fallbackAvatar || '').trim();

  if (localTs > cloudTs) {
    return {
      displayName: cleanLocalName || cleanCloudName || fbName,
      avatar: cleanLocalAvatar || cleanCloudAvatar || fbAvatar,
      profileUpdatedAt: localTs,
      source: 'local'
    };
  }

  if (cloudTs > localTs) {
    return {
      displayName: cleanCloudName || cleanLocalName || fbName,
      avatar: cleanCloudAvatar || cleanLocalAvatar || fbAvatar,
      profileUpdatedAt: cloudTs,
      source: 'cloud'
    };
  }

  return {
    displayName: cleanCloudName || cleanLocalName || fbName,
    avatar: cleanCloudAvatar || cleanLocalAvatar || fbAvatar,
    profileUpdatedAt: Math.max(localTs, cloudTs),
    source: cleanCloudName || cleanCloudAvatar ? 'cloud' : 'local'
  };
}

