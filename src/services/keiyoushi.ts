import { escapeHTML, generateSourceIconSvg, safeExternalUrl, safeImageUrl } from '../utils/sanitize.ts';

export interface KeiyoushiSource {
  id: string;
  name: string;
  pkg: string;
  lang: string;
  ver?: string;
  version?: string;
  site?: string;
  baseUrl?: string;
  icon?: string;
  apk?: string;
  isNsfw?: boolean;
  desc?: string;
}

export class KeiyoushiCatalogManager {
  sources: KeiyoushiSource[] = [];
  filterLang: 'es' | 'en' | 'all' = 'es';
  searchQuery = '';
  loaded = false;
  lastError: string | null = null;

  async init(): Promise<KeiyoushiSource[]> {
    if (this.loaded && this.sources.length > 0) return this.sources;
    try {
      const res = await fetch('/keiyoushi_sources.json');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} cargando catálogo Keiyoushi`);
      }
      const data = (await res.json()) as KeiyoushiSource[];
      this.sources = Array.isArray(data) ? data : [];
      this.loaded = true;
      this.lastError = null;
      return this.sources;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.sources = [];
      this.loaded = false;
      return [];
    }
  }

  filter(): KeiyoushiSource[] {
    let list = this.sources || [];
    if (this.filterLang === 'es') {
      list = list.filter((s) => s.lang === 'es' || s.lang === 'all' || (s.pkg && s.pkg.includes('.es.')));
    } else if (this.filterLang === 'en') {
      list = list.filter((s) => s.lang === 'en' || s.lang === 'all' || (s.pkg && s.pkg.includes('.en.')));
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.pkg && s.pkg.toLowerCase().includes(q)) ||
          (s.site && s.site.toLowerCase().includes(q)) ||
          (s.desc && s.desc.toLowerCase().includes(q))
      );
    }
    return list;
  }

  setLang(lang: 'es' | 'en' | 'all'): void {
    this.filterLang = lang;
    this.render();
  }

  onSearch(val: string): void {
    this.searchQuery = (val || '').trim();
    this.render();
  }

  render(): void {
    const container = document.getElementById('resultados-lectura');
    if (!container) return;

    if (this.lastError) {
      container.innerHTML = `
        <div class="keiyoushi-hub-header">
          <div style="font-size:15px; font-weight:800; color:#ff4d6d;">Error al cargar extensiones Keiyoushi</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:6px;">${escapeHTML(this.lastError)}</div>
          <button class="chip active" style="margin-top:12px;" onclick="KeiyoushiManager.reload()">Reintentar</button>
        </div>
      `;
      return;
    }

    const list = this.filter();
    const totalEs = this.sources.filter((s) => s.lang === 'es' || s.lang === 'all').length;
    const totalEn = this.sources.filter((s) => s.lang === 'en' || s.lang === 'all').length;
    const totalAll = this.sources.length;

    container.innerHTML = `
      <div class="keiyoushi-hub-header">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span class="keiyoushi-badge">Mihon / Tachiyomi Extension Hub</span>
            <div style="font-size:15px; font-weight:800; color:white; margin-top:4px;">Repositorio Keiyoushi Oficial</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:var(--text-muted);">${totalAll} extensiones</div>
            <div style="font-size:10px; color:#10b981; font-weight:700;">Catálogo Activo</div>
          </div>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">
          Filtra y explora mangas/manhwas directamente dentro de NyAnime TV desde proveedores en español, inglés y multilingüe.
        </div>

        <div class="keiyoushi-subbar" id="keiyoushi-lang-chips">
          <button class="chip ${this.filterLang === 'es' ? 'active' : ''}" onclick="KeiyoushiManager.setLang('es', this)">Español (${totalEs})</button>
          <button class="chip ${this.filterLang === 'en' ? 'active' : ''}" onclick="KeiyoushiManager.setLang('en', this)">English (${totalEn})</button>
          <button class="chip ${this.filterLang === 'all' ? 'active' : ''}" onclick="KeiyoushiManager.setLang('all', this)">Todas (${totalAll})</button>
        </div>

        <div style="margin-top:10px;">
          <input type="text" class="manga-chap-search" style="width:100%; border-radius:8px;" placeholder="Buscar fuente (ej. InManga, TuMangaOnline, Asura, MangaDex)..." value="${escapeHTML(this.searchQuery)}" oninput="KeiyoushiManager.onSearch(this.value)">
        </div>
      </div>

      <div style="grid-column: 1 / -1; display:grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 12px;">
        ${list.length === 0 ? '<div style="text-align:center; color:var(--text-muted); padding:30px; grid-column:1/-1;">No se encontraron extensiones con ese criterio.</div>' : ''}
        ${list
          .map((ext) => {
            const fallbackIcon = generateSourceIconSvg(ext.name, ext.lang);
            const iconSrc = safeImageUrl(ext.icon, fallbackIcon);
            const safeName = escapeHTML(ext.name);
            const safeVer = escapeHTML(ext.version || ext.ver || '1.0');
            const safeLang = escapeHTML((ext.lang || 'ALL').toUpperCase());
            const safeDesc = escapeHTML(ext.desc || '');
            const safeSite = safeExternalUrl(ext.site || ext.baseUrl || '');
            const encName = encodeURIComponent(ext.name);
            const safePkg = escapeHTML(ext.pkg);

            return `
              <div class="keiyoushi-card fade-in">
                <div class="keiyoushi-card-top">
                  <img src="${escapeHTML(iconSrc)}"
                       class="keiyoushi-icon"
                       loading="lazy"
                       alt="${safeName}"
                       onerror="this.onerror=null; this.src='${escapeHTML(fallbackIcon)}';"/>
                  <div class="keiyoushi-info">
                    <div class="keiyoushi-name" title="${safeName}">${safeName}</div>
                    <div class="keiyoushi-ver">v${safeVer} · ${safeLang}</div>
                    ${safeDesc ? `<div style="font-size:11px; color:var(--text-muted); margin-top:3px; line-height:1.3;">${safeDesc}</div>` : ''}
                  </div>
                </div>
                <div class="keiyoushi-actions" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:auto;">
                  <button class="chip active" style="padding:5px 10px; font-size:11px;" onclick="KeiyoushiManager.explorarFuente('${encName}')">Explorar en App</button>
                  <button class="chip" style="padding:5px 10px; font-size:11px; background:rgba(99,102,241,0.22); border:1px solid rgba(99,102,241,0.45); color:#c7d2fe;" onclick="KeiyoushiManager.abrirEnMihon('${safePkg}', '${escapeHTML(safeSite)}', '${encName}')">Mihon</button>
                  ${safeSite ? `<button class="chip" style="padding:5px 9px; font-size:11px;" onclick="handleOpenExternal('${escapeHTML(safeSite)}')">Web</button>` : ''}
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }
}
