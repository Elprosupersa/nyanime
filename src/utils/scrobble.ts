import type { AnimeListStatus } from './profileStats.ts';

export type OAuthProviderId = 'anilist' | 'mal';

export type AniListMediaListStatus =
  | 'CURRENT'
  | 'PLANNING'
  | 'COMPLETED'
  | 'PAUSED'
  | 'DROPPED';

export type MalListStatus =
  | 'watching'
  | 'plan_to_watch'
  | 'completed'
  | 'on_hold'
  | 'dropped';

export interface OAuthAccountSession {
  provider: OAuthProviderId;
  accessToken: string;
  refreshToken?: string;
  expiresAtMs?: number;
  username?: string;
  userId?: string | number;
  connectedAt: number;
}

export function mapListStatusToAniList(status: AnimeListStatus): AniListMediaListStatus {
  switch (status) {
    case 'watching':
      return 'CURRENT';
    case 'completed':
      return 'COMPLETED';
    case 'on_hold':
      return 'PAUSED';
    case 'dropped':
      return 'DROPPED';
    case 'plan_to_watch':
    default:
      return 'PLANNING';
  }
}

export function mapListStatusToMal(status: AnimeListStatus): MalListStatus {
  switch (status) {
    case 'watching':
      return 'watching';
    case 'completed':
      return 'completed';
    case 'on_hold':
      return 'on_hold';
    case 'dropped':
      return 'dropped';
    case 'plan_to_watch':
    default:
      return 'plan_to_watch';
  }
}

export function normalizeScrobbleProgress(progress: unknown): number {
  const n = Math.floor(Number(progress));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(10_000, n);
}

export function normalizeScrobbleScore(score: unknown): number | undefined {
  if (score === null || score === undefined || score === '') return undefined;
  const n = Math.round(Number(score));
  if (!Number.isFinite(n) || n < 1 || n > 10) return undefined;
  return n;
}

export function buildAniListScrobblePayload(input: {
  mediaId: number;
  status: AnimeListStatus;
  progress: number;
  score?: number | null;
}) {
  const variables: Record<string, unknown> = {
    mediaId: Math.floor(Number(input.mediaId)),
    status: mapListStatusToAniList(input.status),
    progress: normalizeScrobbleProgress(input.progress)
  };
  const cleanScore = normalizeScrobbleScore(input.score);
  if (cleanScore !== undefined) {
    // AniList SaveMediaListEntry score acepta escala 0-100 o decimal dependiendo de la cuenta;
    // scoreRaw siempre está en escala 0-100 en todas las cuentas.
    variables.scoreRaw = cleanScore * 10;
  }
  return {
    query: `
      mutation SaveProgress($mediaId: Int!, $status: MediaListStatus, $progress: Int, $scoreRaw: Int) {
        SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw) {
          id
          status
          progress
          score
          media { id idMal title { romaji english } }
        }
      }
    `.trim(),
    variables
  };
}

export function buildMalScrobbleFormBody(input: {
  status: AnimeListStatus;
  progress: number;
  score?: number | null;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('status', mapListStatusToMal(input.status));
  params.set('num_watched_episodes', String(normalizeScrobbleProgress(input.progress)));
  const cleanScore = normalizeScrobbleScore(input.score);
  if (cleanScore !== undefined) {
    params.set('score', String(cleanScore));
  }
  return params;
}
