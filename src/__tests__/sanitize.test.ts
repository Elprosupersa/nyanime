import { describe, expect, it } from 'vitest';
import {
  computeUserRank,
  escapeHTML,
  expandMangaQuery,
  formatRelativeTime,
  generateSourceIconSvg,
  safeExternalUrl,
  safeImageUrl
} from '../utils/sanitize.ts';

describe('sanitize & utilities', () => {
  it('escapes dangerous XSS payloads cleanly', () => {
    const payload = `<img src=x onerror="alert('XSS')"> & <script>evil(\`1\`)</script>`;
    const escaped = escapeHTML(payload);
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).not.toContain('"');
    expect(escaped).not.toContain("'");
    expect(escaped).not.toContain('`');
    expect(escaped).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;XSS&#39;)&quot;&gt; &amp; &lt;script&gt;evil(&#96;1&#96;)&lt;/script&gt;'
    );
  });

  it('sanitizes image and external URLs, blocking javascript: and html data URIs', () => {
    expect(safeImageUrl('javascript:alert(1)', '/fallback.png')).toBe('/fallback.png');
    expect(safeImageUrl('data:text/html,<script>alert(1)</script>', '/fallback.png')).toBe('/fallback.png');
    expect(safeImageUrl('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E')).toContain('data:image/svg+xml');
    expect(safeImageUrl('/api/img-proxy?url=https%3A%2F%2Fcdn.example.com%2Fa.jpg')).toContain('/api/img-proxy');
    expect(safeImageUrl('https://uploads.mangadex.org/covers/1.jpg')).toBe(
      'https://uploads.mangadex.org/covers/1.jpg'
    );

    expect(safeExternalUrl('javascript:void(0)')).toBe('');
    expect(safeExternalUrl('ftp://files.example.com/a')).toBe('');
    expect(safeExternalUrl('https://mangadex.org/title/123')).toBe('https://mangadex.org/title/123');
  });

  it('expands popular manga acronyms and Spanish/English synonyms cleanly', () => {
    expect(expandMangaQuery('tbate')).toContain('The Beginning After the End');
    expect(expandMangaQuery('orv')).toContain("Omniscient Reader's Viewpoint");
    expect(expandMangaQuery('jjk')).toContain('Jujutsu Kaisen');
    expect(expandMangaQuery('sl')).toContain('Solo Leveling');
    expect(expandMangaQuery('op')).toContain('One Piece');
    expect(expandMangaQuery('   ')).toEqual([]);
  });

  it('computes honest dynamic user rank tiers from activity rather than hardcoded VIP mocks', () => {
    expect(computeUserRank(0, 0).tier).toBe('NOVATO');
    expect(computeUserRank(10, 10).tier).toBe('OTAKU');
    expect(computeUserRank(55, 45).tier).toBe('LEYENDA');
    expect(computeUserRank(1, 0, 'CREATOR').tier).toBe('VIP');
  });

  it('formats relative timestamps and generates safe OLED SVG source icons', () => {
    expect(formatRelativeTime(Date.now() - 5000)).toBe('hace un momento');
    expect(formatRelativeTime(Date.now() - 120_000)).toBe('hace 2 min');

    const icon = generateSourceIconSvg('TuMangaOnline <script>', 'es');
    expect(icon.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(icon)).not.toContain('<script>');
    expect(decodeURIComponent(icon)).toContain('ES');
  });

  it('produces apostrophe-free SVG fallback URIs when titles contain quotes (regression)', async () => {
    const { generarPortadaSVG } = await import('../utils/sanitize.ts');
    const svgUri = generarPortadaSVG("Omniscient Reader's Viewpoint", 'ko', "Reader's");
    expect(svgUri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(svgUri).not.toContain("'");
    expect(svgUri).not.toContain('"');
  });
});
