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
