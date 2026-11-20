export function escapeHTML(input: unknown): string {
  const str = String(input ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

export function safeImageUrl(url: unknown, fallback = ''): string {
  const raw = String(url ?? '').trim();
  if (!raw) return fallback;
  if (
    raw.startsWith('/api/img-proxy') ||
    raw.startsWith('data:image/') ||
    raw.startsWith('blob:') ||
    raw.startsWith('/')
  ) {
    return raw;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function safeExternalUrl(url: unknown): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

export const MANGA_SYNONYMS_DICT: Record<string, string[]> = {
  tbate: ['The Beginning After the End'],
  'the beginning after the end': ['The Beginning After the End'],
  op: ['One Piece'],
  'one piece': ['One Piece'],
  aot: ['Attack on Titan', 'Shingeki no Kyojin'],
  snk: ['Shingeki no Kyojin', 'Attack on Titan'],
  'attack on titan': ['Attack on Titan', 'Shingeki no Kyojin'],
  'shingeki no kyojin': ['Shingeki no Kyojin', 'Attack on Titan'],
  csm: ['Chainsaw Man'],
  'chainsaw man': ['Chainsaw Man'],
  jjk: ['Jujutsu Kaisen'],
  'jujutsu kaisen': ['Jujutsu Kaisen'],
  kny: ['Kimetsu no Yaiba', 'Demon Slayer'],
  ds: ['Demon Slayer', 'Kimetsu no Yaiba'],
  'demon slayer': ['Kimetsu no Yaiba', 'Demon Slayer'],
  'kimetsu no yaiba': ['Kimetsu no Yaiba', 'Demon Slayer'],
  hxh: ['Hunter x Hunter'],
  'hunter x hunter': ['Hunter x Hunter'],
  opm: ['One Punch Man', 'One-Punch Man'],
  'one punch man': ['One Punch Man'],
  mha: ['My Hero Academia', 'Boku no Hero Academia'],
  bnha: ['Boku no Hero Academia', 'My Hero Academia'],
  'my hero academia': ['My Hero Academia', 'Boku no Hero Academia'],
  'boku no hero academia': ['Boku no Hero Academia', 'My Hero Academia'],
  sbr: ['Steel Ball Run', "JoJo's Bizarre Adventure Part 7: Steel Ball Run"],
  'steel ball run': ['Steel Ball Run'],
  sl: ['Solo Leveling', 'Na Honjaman Level Up'],
  'solo leveling': ['Solo Leveling', 'Na Honjaman Level Up'],
  orv: ["Omniscient Reader's Viewpoint", 'Omniscient Reader'],
  'omniscient reader': ["Omniscient Reader's Viewpoint", 'Omniscient Reader'],
  'omniscient readers viewpoint': ["Omniscient Reader's Viewpoint", 'Omniscient Reader'],
  lotm: ['Lord of the Mysteries'],
  'lord of the mysteries': ['Lord of the Mysteries'],
  tg: ['Tokyo Ghoul'],
  'tokyo ghoul': ['Tokyo Ghoul'],
  fma: ['Fullmetal Alchemist'],
  fmab: ['Fullmetal Alchemist: Brotherhood'],
  'fullmetal alchemist': ['Fullmetal Alchemist'],
  db: ['Dragon Ball'],
  dbz: ['Dragon Ball Z'],
  dbs: ['Dragon Ball Super'],
  'dragon ball': ['Dragon Ball'],
  sao: ['Sword Art Online'],
  'sword art online': ['Sword Art Online'],
  ngnl: ['No Game No Life'],
  cote: ['Classroom of the Elite'],
  coted: ['Classroom of the Elite'],
  'classroom of the elite': ['Classroom of the Elite'],
  rezero: ['Re:Zero', 'Re:Zero kara Hajimeru Isekai Seikatsu'],
  're zero': ['Re:Zero', 'Re:Zero kara Hajimeru Isekai Seikatsu'],
  sxf: ['Spy x Family', 'SPY×FAMILY'],
  'spy x family': ['Spy x Family', 'SPY×FAMILY'],
  spyxfamily: ['Spy x Family', 'SPY×FAMILY'],
  bluelock: ['Blue Lock'],
  'blue lock': ['Blue Lock'],
  ddt: ['Dandadan'],
  dandadan: ['Dandadan'],
  tog: ['Tower of God', 'Sinui Tap'],
  'tower of god': ['Tower of God', 'Sinui Tap'],
  goh: ['The God of High School'],
  'the god of high school': ['The God of High School'],
  ged: ['The Greatest Estate Developer'],
  'the greatest estate developer': ['The Greatest Estate Developer'],
  'wind breaker': ['Wind Breaker'],
  windbreaker: ['Wind Breaker'],
  lookism: ['Lookism'],
  'nano machine': ['Nano Machine'],
  nanomachine: ['Nano Machine'],
  eleceed: ['Eleceed'],
  sss: ['SSS-Class Suicide Hunter', 'SSS-Class Revival Hunter'],
  'mount hua': ['Return of the Mount Hua Sect'],
  mounthua: ['Return of the Mount Hua Sect'],
  'return of the mount hua sect': ['Return of the Mount Hua Sect'],
  iruma: ['Mairimashita! Iruma-kun'],
  'iruma kun': ['Mairimashita! Iruma-kun'],
  bsd: ['Bungo Stray Dogs'],
  'bungo stray dogs': ['Bungo Stray Dogs'],
  frieren: ['Sousou no Frieren', 'Frieren'],
  'sousou no frieren': ['Sousou no Frieren', 'Frieren'],
  vagabond: ['Vagabond'],
  berserk: ['Berserk'],
  vinland: ['Vinland Saga'],
  'vinland saga': ['Vinland Saga']
};

export function expandMangaQuery(rawQuery: string): string[] {
  const raw = String(rawQuery || '').trim();
  if (!raw) return [];
  const norm = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const results = new Set<string>();
  const direct = MANGA_SYNONYMS_DICT[norm];
  if (direct) {
    direct.forEach((t) => results.add(t));
  }
  const compact = norm.replace(/\s+/g, '');
  if (MANGA_SYNONYMS_DICT[compact]) {
    MANGA_SYNONYMS_DICT[compact].forEach((t) => results.add(t));
  }

  for (const [key, expansions] of Object.entries(MANGA_SYNONYMS_DICT)) {
    if (norm.length >= 3 && (key.startsWith(norm) || norm.includes(key))) {
      expansions.forEach((t) => results.add(t));
    }
  }

  results.add(raw);
  return Array.from(results);
}

export interface UserRankInfo {
  tier: 'NOVATO' | 'OTAKU' | 'LEYENDA' | 'VIP';
  label: string;
  icon: string;
}

export function computeUserRank(
  episodesWatched: number,
  chaptersRead: number,
  verifiedRole?: string
): UserRankInfo {
  if (verifiedRole === 'CREATOR' || verifiedRole === 'VIP') {
    return { tier: 'VIP', label: 'VIP Verificado', icon: '' };
  }
  const score = Math.max(0, Number(episodesWatched || 0)) + Math.max(0, Number(chaptersRead || 0));
  if (score >= 100) {
    return { tier: 'LEYENDA', label: 'Leyenda Anime', icon: '' };
  }
  if (score >= 20) {
    return { tier: 'OTAKU', label: 'Otaku Activo', icon: '' };
  }
  return { tier: 'NOVATO', label: 'Explorador Novato', icon: '' };
}

export function formatRelativeTime(timestampMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 30) return 'hace un momento';
  if (diffSec < 60) return `hace ${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

export function generateSourceIconSvg(nombre: string, lang = 'all'): string {
  const palette: [string, string][] = [
    ['#ff1a40', '#991b1b'],
    ['#4f46e5', '#1e1b4b'],
    ['#059669', '#064e3b'],
    ['#d97706', '#78350f'],
    ['#dc2626', '#450a0a'],
    ['#7c3aed', '#3b0764']
  ];
  const hash = (nombre || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % palette.length;
  const [c1, c2] = palette[hash];
  const cleanWords = (nombre || 'K')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const initials = escapeHTML(
    (cleanWords.length > 0 ? cleanWords.map((w) => w[0]).join('') : 'K')
      .slice(0, 3)
      .toUpperCase() || 'K'
  );
  const langTag = escapeHTML((lang || 'ALL').slice(0, 3).toUpperCase());
  const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="96" height="96" rx="22" fill="#050507" stroke="${c1}" stroke-width="3"/>
    <rect x="6" y="6" width="84" height="84" rx="18" fill="url(#g)" fill-opacity="0.88"/>
    <text x="48" y="54" font-family="sans-serif" font-size="26" font-weight="900" fill="#ffffff" text-anchor="middle">${initials}</text>
    <text x="48" y="78" font-family="sans-serif" font-size="11" font-weight="700" fill="#f8fafc" fill-opacity="0.85" text-anchor="middle">${langTag}</text>
  </svg>`;
  return ('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rawSvg)).replace(/'/g, '%27');
}

export function generarPortadaSVG(titulo: string, lang = 'ja', subtitulo = 'Manga'): string {
  const colors: Record<string, [string, string]> = {
    ja: ['#1e1b4b', '#4338ca'],
    ko: ['#311042', '#7e22ce'],
    zh: ['#3f1212', '#b91c1c'],
    es: ['#064e3b', '#047857'],
    en: ['#1e293b', '#334155']
  };
  const [c1, c2] = colors[lang] || colors.ja;
  const cleanTitle = (titulo || 'Manga').replace(/["'&<>]/g, '').slice(0, 30);
  const cleanSub = (subtitulo || 'Manga').replace(/["'&<>]/g, '');
  const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="300" height="450" fill="url(#bg)"/>
    <circle cx="260" cy="50" r="120" fill="white" opacity="0.06"/>
    <circle cx="40" cy="400" r="140" fill="white" opacity="0.06"/>
    <rect x="20" y="24" width="80" height="24" rx="12" fill="white" fill-opacity="0.2"/>
    <text x="60" y="40" font-family="sans-serif" font-size="11" font-weight="bold" fill="white" text-anchor="middle">${cleanSub.toUpperCase()}</text>
    <text x="150" y="225" font-family="sans-serif" font-size="18" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">
      <tspan x="150" dy="-8">${cleanTitle.slice(0, 15)}</tspan>
      <tspan x="150" dy="24">${cleanTitle.slice(15, 30)}</tspan>
    </text>
    <text x="150" y="415" font-family="sans-serif" font-size="11" fill="white" fill-opacity="0.7" text-anchor="middle">NyAnime Manga Engine</text>
  </svg>`;
  return ('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rawSvg)).replace(/'/g, '%27');
}
