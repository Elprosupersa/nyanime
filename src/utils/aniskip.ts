export type AniSkipType = 'op' | 'ed' | 'recap' | 'mixed-op' | 'mixed-ed';

export interface AniSkipInterval {
  skipId: string;
  skipType: AniSkipType;
  label: string;
  startTime: number;
  endTime: number;
}

const SUPPORTED_SKIP_TYPES = new Set<AniSkipType>([
  'op',
  'ed',
  'recap',
  'mixed-op',
  'mixed-ed'
]);

export function buildAniSkipUrl(
  malId: number | string | null | undefined,
  episodeNumber: number | string,
  episodeLength = 0
): string | null {
  const cleanMal = Math.floor(Number(malId));
  const cleanEp = Math.floor(Number(episodeNumber));
  if (!Number.isFinite(cleanMal) || cleanMal <= 0 || !Number.isFinite(cleanEp) || cleanEp <= 0) {
    return null;
  }
  const cleanLen = Number.isFinite(Number(episodeLength)) && Number(episodeLength) > 0
    ? Math.floor(Number(episodeLength))
    : 0;
  const params = new URLSearchParams();
  params.append('types[]', 'op');
  params.append('types[]', 'ed');
  params.append('types[]', 'recap');
  params.append('types[]', 'mixed-op');
  params.append('types[]', 'mixed-ed');
  params.set('episodeLength', String(cleanLen));
  return `https://api.aniskip.com/v2/skip-times/${cleanMal}/${cleanEp}?${params.toString()}`;
}

export function getAniSkipLabel(skipType: AniSkipType): string {
  switch (skipType) {
    case 'op':
    case 'mixed-op':
      return 'Saltar Intro';
    case 'ed':
    case 'mixed-ed':
      return 'Saltar Outro';
    case 'recap':
      return 'Saltar Resumen';
    default:
      return 'Saltar Segmento';
  }
}

export function isIntroSkipType(skipType: AniSkipType): boolean {
  return skipType === 'op' || skipType === 'mixed-op' || skipType === 'recap';
}

export function isOutroSkipType(skipType: AniSkipType): boolean {
  return skipType === 'ed' || skipType === 'mixed-ed';
}

export function parseAniSkipResponse(payload: unknown): AniSkipInterval[] {
  if (!payload || typeof payload !== 'object') return [];
  const raw = payload as { found?: boolean; results?: unknown[] };
  if (raw.found === false || !Array.isArray(raw.results)) return [];

  const out: AniSkipInterval[] = [];
  for (const item of raw.results) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as {
      skipId?: unknown;
      skipType?: unknown;
      interval?: { startTime?: unknown; endTime?: unknown };
    };
    const skipType = String(rec.skipType || '').trim() as AniSkipType;
    if (!SUPPORTED_SKIP_TYPES.has(skipType)) continue;
    const startTime = Number(rec.interval?.startTime);
    const endTime = Number(rec.interval?.endTime);
    if (
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime) ||
      startTime < 0 ||
      endTime <= startTime + 1
    ) {
      continue;
    }
    out.push({
      skipId: String(rec.skipId || `${skipType}-${Math.round(startTime)}`),
      skipType,
      label: getAniSkipLabel(skipType),
      startTime,
      endTime
    });
  }

  return out.sort((a, b) => a.startTime - b.startTime);
}

export function findActiveAniSkipInterval(
  intervals: readonly AniSkipInterval[],
  currentTimeSec: number
): AniSkipInterval | null {
  const t = Number(currentTimeSec);
  if (!Number.isFinite(t) || t < 0 || !Array.isArray(intervals) || intervals.length === 0) {
    return null;
  }
  for (const seg of intervals) {
    if (t >= seg.startTime && t < seg.endTime - 0.5) {
      return seg;
    }
  }
  return null;
}

export function computeSafeSeekTarget(
  currentTimeSec: number,
  deltaSeconds: number,
  durationSec?: number | null
): number {
  const cur = Number.isFinite(Number(currentTimeSec)) ? Math.max(0, Number(currentTimeSec)) : 0;
  const rawNext = Math.max(0, cur + Number(deltaSeconds || 0));
  const dur = Number(durationSec);
  if (Number.isFinite(dur) && dur > 0) {
    return Math.min(rawNext, Math.max(0, dur - 0.25));
  }
  return rawNext;
}
