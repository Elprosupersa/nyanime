import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { organizeAnimeFranchise, computeAvailableEpisodes } from '../utils/seasonOrder.ts';

class FakeClassList {
  private set = new Set<string>();
  add(...tokens: string[]) {
    tokens.filter(Boolean).forEach((t) => this.set.add(t));
  }
  remove(...tokens: string[]) {
    tokens.filter(Boolean).forEach((t) => this.set.delete(t));
  }
  toggle(token: string, force?: boolean) {
    if (force === undefined) {
      if (this.set.has(token)) {
        this.set.delete(token);
        return false;
      }
      this.set.add(token);
      return true;
    }
    if (force) this.set.add(token);
    else this.set.delete(token);
    return force;
  }
  contains(token: string) {
    return this.set.has(token);
  }
  setFromString(str: string) {
    this.set.clear();
    String(str || '')
      .split(/\s+/)
      .filter(Boolean)
      .forEach((t) => this.set.add(t));
  }
  toString() {
    return Array.from(this.set).join(' ');
  }
}

class FakeElement {
  tagName: string;
  id = '';
  type = '';
  src = '';
  alt = '';
  title = '';
  disabled = false;
  textContent = '';
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  classList = new FakeClassList();
  onclick: ((ev?: any) => void) | null = null;
  private _innerHTML = '';

  constructor(tagName: string, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
  }

  get className() {
    return this.classList.toString();
  }
  set className(val: string) {
    this.classList.setFromString(val);
  }

  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(val: string) {
    this._innerHTML = String(val);
    if (val === '') this.children = [];
  }

  appendChild(child: FakeElement) {
    this.children.push(child);
    return child;
  }

  setAttribute(k: string, v: string) {
    this.attributes.set(k, String(v));
  }

  removeAttribute(k: string) {
    this.attributes.delete(k);
    if (k === 'src') this.src = '';
  }

  scrollTo() {
    // noop
  }
}

function createFakeDomEnvironment() {
  const byId = new Map<string, FakeElement>();
  const register = (tag: string, id: string, className = '') => {
    const el = new FakeElement(tag, id);
    if (className) el.className = className;
    byId.set(id, el);
    return el;
  };

  register('div', 'pantalla-detalle', 'hide');
  register('h1', 'det-titulo');
  register('img', 'det-img');
  register('p', 'det-sinopsis');
  register('div', 'det-meta-badges');
  register('div', 'det-temporadas');
  register('h2', 'det-header-title');
  register('span', 'det-count');
  register('div', 'det-rangos');
  register('div', 'det-episodios');
  register('button', 'det-btn-continue');
  register('span', 'det-watch-progress');
  register('button', 'det-mark-mode-btn');
  register('div', 'det-mark-hint', 'hide');
  register('button', 'det-btn-fav');
  register('div', 'det-library-status-bar');
  const dlBtn = new FakeElement('button');
  dlBtn.className = 'btn-download-season';

  const fakeDocument = {
    getElementById: (id: string) => byId.get(id) || null,
    createElement: (tag: string) => new FakeElement(tag),
    querySelector: (selector: string) => {
      if (selector === '#pantalla-detalle .btn-download-season') return dlBtn;
      return null;
    },
    querySelectorAll: (selector: string) => {
      if (selector === '#det-episodios .ep-btn') {
        const epContainer = byId.get('det-episodios');
        return (epContainer?.children || []).filter((c) => c.classList.contains('ep-btn'));
      }
      return [];
    },
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const storageMap = new Map<string, string>();
  const fakeLocalStorage = {
    getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
    setItem: (k: string, v: string) => {
      storageMap.set(k, String(v));
    },
    removeItem: (k: string) => {
      storageMap.delete(k);
    },
    clear: () => {
      storageMap.clear();
    }
  };

  const fakeWindow: Record<string, any> = {
    localStorage: fakeLocalStorage,
    NyAnimeSeasons: {
      organizeAnimeFranchise,
      computeAvailableEpisodes
    },
    NyAnimeVideoSources: {
      parseHentaiLaMediaDetail: (json: any) => json?.mockDetail || null,
      extractEpisodeDetailsMap: () => ({})
    },
    NyAnimeOffline: {
      getOfflineEpisodesForAnime: vi.fn(async () => new Set<number>())
    },
    abrirReproductor: vi.fn(),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  return { byId, dlBtn, fakeDocument, fakeLocalStorage, fakeWindow };
}

describe('animeDetailView — Systemic episode rendering & atomic state cleanup', () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalLocalStorage = (globalThis as any).localStorage;
  const originalFetch = globalThis.fetch;

  let env: ReturnType<typeof createFakeDomEnvironment>;

  beforeEach(() => {
    vi.resetModules();
    env = createFakeDomEnvironment();
    (globalThis as any).window = env.fakeWindow;
    (globalThis as any).document = env.fakeDocument;
    (globalThis as any).localStorage = env.fakeLocalStorage;
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
    (globalThis as any).localStorage = originalLocalStorage;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('clears previous anime DOM atomically and renders all episodes when navigating from an AniList OVA to an external HentaiLA catalog entry', async () => {
    const fetchCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.includes('graphql.anilist.co')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              Media: {
                id: 185432,
                title: {
                  romaji: "Kan'ochi x Netorare Kazoku The Animation: Anata, Yurushite.",
                  english: "Kan'ochi x Netorare Kazoku The Animation: Anata, Yurushite."
                },
                format: 'OVA',
                status: 'FINISHED',
                episodes: 2,
                isAdult: true,
                description: 'Sinopsis de Kanochi.',
                relations: { edges: [] }
              }
            }
          })
        } as any;
      }
      if (url.includes('hentaila.com') && url.includes('hitozuma')) {
        return {
          ok: true,
          json: async () => ({
            mockDetail: {
              id: 'hla_999',
              mediaId: 999,
              slug: 'hitozuma-no-kuchibiru-wa-kan-chuuhai-no-aji-ga-shite',
              title: 'Hitozuma no Kuchibiru wa Kan Chuuhai no Aji ga Shite',
              synopsis: 'Sinopsis completa en español para Hitozuma.',
              category: 'HENTAI',
              status: 'FINISHED',
              episodesCount: 4,
              malId: null,
              genres: ['Hentai'],
              cover: 'https://cdn.example.com/hitozuma.jpg',
              thumbnail: 'https://cdn.example.com/hitozuma.jpg',
              backdrop: 'https://cdn.example.com/hitozuma-bg.jpg'
            }
          })
        } as any;
      }
      if (url.includes('api.ani.zip')) {
        return { ok: false, status: 404, json: async () => ({}) } as any;
      }
      return { ok: false, status: 404, json: async () => ({}) } as any;
    }) as any;

    const { abrirDetalle, iniciarOContinuarAnime } = await import('../ui/animeDetailView.ts');
    const { state } = await import('../ui/appState.ts');

    // 1. Open first anime (AniList OVA with apostrophe & 2 episodes)
    await abrirDetalle({
      id: 185432,
      title: {
        romaji: "Kan'ochi x Netorare Kazoku The Animation: Anata, Yurushite.",
        english: "Kan'ochi x Netorare Kazoku The Animation: Anata, Yurushite."
      },
      format: 'OVA',
      status: 'FINISHED',
      episodes: 2,
      isAdult: true
    });

    expect(env.byId.get('det-titulo')!.textContent).toContain("Kan'ochi x Netorare Kazoku");
    expect(env.byId.get('det-header-title')!.textContent).toContain("Kan'ochi x Netorare Kazoku");
    expect(env.byId.get('det-count')!.textContent).toBe('2 Episodios');
    expect(env.byId.get('det-episodios')!.children.map((c) => c.dataset.ep)).toEqual(['1', '2']);

    // 2. Navigate directly to second anime (external HentaiLA string ID + format 'HENTAI' + 4 episodes)
    await abrirDetalle({
      id: 'hla_999',
      hentailaSlug: 'hitozuma-no-kuchibiru-wa-kan-chuuhai-no-aji-ga-shite',
      title: {
        romaji: 'Hitozuma no Kuchibiru wa Kan Chuuhai no Aji ga Shite',
        english: 'Hitozuma no Kuchibiru wa Kan Chuuhai no Aji ga Shite'
      },
      format: 'HENTAI',
      status: 'FINISHED',
      episodes: 2,
      isAdult: true,
      description: 'Sinopsis inicial en español.'
    });

    // Zero stale text from previous anime!
    expect(env.byId.get('det-titulo')!.textContent).toBe('Hitozuma no Kuchibiru wa Kan Chuuhai no Aji ga Shite');
    expect(env.byId.get('det-header-title')!.textContent).toBe('Hitozuma no Kuchibiru wa Kan Chuuhai no Aji ga Shite');
    expect(env.byId.get('det-header-title')!.textContent).not.toContain("Kan'ochi");
    expect(env.byId.get('det-count')!.textContent).toBe('4 Episodios');
    expect(env.byId.get('det-watch-progress')!.textContent).toBe('0 / 4 vistos');
    expect(env.byId.get('det-btn-continue')!.textContent).toBe('Empezar Episodio 1');
    expect(env.byId.get('det-btn-continue')!.disabled).toBe(false);

    // All 4 episode cards rendered cleanly
    const epButtons = env.byId.get('det-episodios')!.children.filter((c) => c.classList.contains('ep-btn'));
    expect(epButtons.map((b) => b.dataset.ep)).toEqual(['1', '2', '3', '4']);
    expect(epButtons.map((b) => b.textContent)).toEqual(['1', '2', '3', '4']);

    // Clicking an episode card or CTA launches player with the CURRENT anime context
    epButtons[1].onclick?.();
    expect(env.fakeWindow.abrirReproductor).toHaveBeenCalledWith(2);
    expect(state.anime.id).toBe('hla_999');
    expect(state.seasons[0].id).toBe('hla_999');

    iniciarOContinuarAnime();
    expect(env.fakeWindow.abrirReproductor).toHaveBeenCalledWith(1);

    // Must never send invalid non-numeric IDs to api.ani.zip
    expect(fetchCalls.some((u) => u.includes('api.ani.zip') && u.includes('hla_999'))).toBe(false);
  });

  it('prevents stale late responses from overwriting a newly opened anime detail view', async () => {
    let resolveSlowFirst!: (value: any) => void;
    const slowFirstPromise = new Promise((resolve) => {
      resolveSlowFirst = resolve;
    });

    globalThis.fetch = vi.fn((input: any) => {
      const url = String(input);
      if (url.includes('graphql.anilist.co')) {
        return slowFirstPromise;
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as any);
    }) as any;

    const { abrirDetalle } = await import('../ui/animeDetailView.ts');

    // Start opening slow Anime A (do not await yet)
    const pA = abrirDetalle({
      id: 11111,
      title: { romaji: 'Slow Anime A', english: 'Slow Anime A' },
      format: 'TV',
      status: 'FINISHED',
      episodes: 12
    });

    // Immediately switch to external Anime B
    await abrirDetalle({
      id: 'hla_777',
      title: { romaji: 'Fast Anime B', english: 'Fast Anime B' },
      format: 'OVA',
      status: 'FINISHED',
      episodes: 3
    });

    // Now resolve Anime A's late AniList payload
    resolveSlowFirst({
      ok: true,
      json: async () => ({
        data: {
          Media: {
            id: 11111,
            title: { romaji: 'Slow Anime A', english: 'Slow Anime A' },
            format: 'TV',
            status: 'FINISHED',
            episodes: 12,
            relations: { edges: [] }
          }
        }
      })
    });
    await pA;

    // UI must still belong exclusively to Fast Anime B
    expect(env.byId.get('det-titulo')!.textContent).toBe('Fast Anime B');
    expect(env.byId.get('det-header-title')!.textContent).toBe('Fast Anime B');
    expect(env.byId.get('det-count')!.textContent).toBe('3 Episodios');
    expect(env.byId.get('det-episodios')!.children.map((c) => c.dataset.ep)).toEqual(['1', '2', '3']);
  });
});
