import { describe, expect, it } from 'vitest';
import {
  buildRedirectHopHeaders,
  isValidRangeHeader,
  resolveVideoStreamReferer,
  validateProxyTargetUrl
} from '../utils/proxySecurity.ts';
import {
  ProviderCircuitBreaker,
  extractArchiveOrgSourcesFromMetadata,
  isNonEmbeddableHost,
  parseAnimeAv1EpisodeEmbeds,
  parseMp4UploadDirectUrl,
  parseYourUploadDirectUrl,
  pickBestSlugMatch,
  rankAndDeduplicateSources,
  sanitizeArchiveOrgQuery,
  selectBestArchiveOrgDocs
} from '../utils/animeSources.ts';

describe('Phase 1.5 Hotfix: TV Series vs OVA/Movie/Season Matching', () => {
  it('picks Re:ZERO TV main series and strictly rejects Memory Snow, Hyouketsu, Break Time, Director Cut, and sequels', () => {
    const targets = [
      'Re:Zero kara Hajimeru Isekai Seikatsu',
      'Re:ZERO -Starting Life in Another World-'
    ];

    const fullCatalog = [
      'rezero-kara-hajimeru-isekai-seikatsu-memory-snow',
      'rezero-kara-hajimeru-isekai-seikatsu-hyouketsu-no-kizuna',
      'rezero-kara-hajimeru-isekai-seikatsu-shin-henshuu-ban',
      'rezero-kara-hajimeru-isekai-seikatsu-break-time',
      'rezero-kara-hajimeru-isekai-seikatsu-2nd-season',
      'rezero-kara-hajimeru-isekai-seikatsu-3rd-season',
      'rezero-kara-hajimeru-isekai-seikatsu-4th-season',
      'rezero-kara-hajimeru-isekai-seikatsu'
    ];

    expect(
      pickBestSlugMatch(fullCatalog, targets, 1, 'TV', { episodes: 25, seasonYear: 2016 })
    ).toBe('rezero-kara-hajimeru-isekai-seikatsu');

    // Critical live-bug scenario: TioAnime directory search only returned Memory Snow & Hyouketsu OVAs.
    // Matcher MUST return null so the provider falls back to exact slug candidates (rezero-kara-hajimeru-isekai-seikatsu).
    const ovaOnlySearch = [
      'rezero-kara-hajimeru-isekai-seikatsu-hyouketsu-no-kizuna',
      'rezero-kara-hajimeru-isekai-seikatsu-memory-snow'
    ];
    expect(
      pickBestSlugMatch(ovaOnlySearch, targets, 1, 'TV', { episodes: 25, seasonYear: 2016 })
    ).toBeNull();

    // Unknown 2+ extra-word spin-off suffix on TV Season 1 must also be rejected
    expect(
      pickBestSlugMatch(
        ['rezero-kara-hajimeru-isekai-seikatsu-frozen-memories'],
        targets,
        1,
        'TV',
        { episodes: 25, seasonYear: 2016 }
      )
    ).toBeNull();

    // Explicit OVA request MUST still match Memory Snow
    expect(
      pickBestSlugMatch(
        ovaOnlySearch,
        ['Re:Zero kara Hajimeru Isekai Seikatsu: Memory Snow'],
        1,
        'OVA',
        { episodes: 1, seasonYear: 2018 }
      )
    ).toBe('rezero-kara-hajimeru-isekai-seikatsu-memory-snow');
  });

  it('matches Black Clover Season 2 and rejects Season 1, OVAs, and the Wizard King movie', () => {
    const slugs = [
      'black-clover',
      'black-clover-ova',
      'black-clover-mahou-tei-no-ken',
      'black-clover-2nd-season'
    ];
    expect(
      pickBestSlugMatch(
        slugs,
        ['Black Clover Season 2', 'Black Clover 2nd Season'],
        2,
        'TV',
        { episodes: 51 }
      )
    ).toBe('black-clover-2nd-season');

    // Season 1 must reject sequels & movie
    expect(
      pickBestSlugMatch(
        ['black-clover-2nd-season', 'black-clover-mahou-tei-no-ken', 'black-clover'],
        ['Black Clover'],
        1,
        'TV',
        { episodes: 170 }
      )
    ).toBe('black-clover');
  });

  it('sanitizes Archive.org Solr queries with colons, filters wrong seasons/OVAs, and matches exact episode filenames', () => {
    expect(sanitizeArchiveOrgQuery('Re:ZERO -Starting Life in Another World-')).toBe(
      'Re ZERO Starting Life in Another World'
    );

    const docs = [
      { identifier: 'rezero-memory-snow-ova', title: 'Re:Zero Memory Snow OVA', downloads: 90000 },
      { identifier: 're.-zero-temporada-2-latino', title: 'Re Zero Temporada 2 Latino', downloads: 50000 },
      { identifier: 'rezerokarahajimeruisekaiseikatsu_202001', title: 'Re Zero Kara Hajimeru Isekai Seikatsu', downloads: 39000 }
    ];
    const picked = selectBestArchiveOrgDocs(
      docs,
      ['Re:Zero kara Hajimeru Isekai Seikatsu', 'Re:ZERO -Starting Life in Another World-'],
      1,
      false,
      1
    );
    expect(picked).toEqual(['rezerokarahajimeruisekaiseikatsu_202001']);

    // Multi-episode Archive item with "(mp4)_1" suffix: Ep 1 must match Episode 1(mp4).mp4, NOT Episode 10(mp4)_1.mp4!
    const reZeroMeta = {
      files: [
        { name: 'ReZero kara Hajimeru Isekai Seikatsu Episode 10(mp4)_1.mp4', format: 'MPEG4', size: 180_000_000 },
        { name: 'ReZero kara Hajimeru Isekai Seikatsu Episode 1(mp4).mp4', format: 'MPEG4', size: 195_000_000 }
      ]
    };
    const ep1Sources = extractArchiveOrgSourcesFromMetadata(
      'rezerokarahajimeruisekaiseikatsu_202001',
      reZeroMeta,
      1,
      'Archive Español HD',
      false
    );
    expect(ep1Sources.length).toBeGreaterThan(0);
    expect(decodeURIComponent(ep1Sources[0].url)).toContain('Episode 1(mp4).mp4');

    // Wrong-episode multi-file archive (only Ep 105 & 106 when Ep 1 requested) MUST return empty []
    const wrongEpMeta = {
      files: [
        { name: 'Black Clover 105.mp4', format: 'MPEG4', size: 150_000_000 },
        { name: 'Black Clover 106.mp4', format: 'MPEG4', size: 150_000_000 }
      ]
    };
    expect(
      extractArchiveOrgSourcesFromMetadata('black-clover-3', wrongEpMeta, 1, 'Archive Español HD', false)
    ).toEqual([]);

    // Season 2 request MUST reject unnumbered Season 1 Archive.org items like "black-clover-lat-1"
    const bcDocs = [
      { identifier: 'black-clover-lat-1', title: 'Black Clover Lat 1', downloads: 25000 },
      { identifier: 'black-clover-lat-2', title: 'Black Clover Lat 2', downloads: 20000 }
    ];
    expect(
      selectBestArchiveOrgDocs(bcDocs, ['Black Clover Season 2', 'Black Clover 2nd Season'], 1, false, 2)
    ).toEqual([]);
  });
});

describe('Phase 1.5 Hotfix: Video Proxy Referer Preservation, CDN Ports & Anti-SSRF', () => {
  it('preserves required video Referer across allowed CDN redirects while stripping auth/cookie headers', () => {
    const hopVidcache = buildRedirectHopHeaders(
      {
        Authorization: 'Bearer secret',
        Cookie: 'sid=123',
        'Proxy-Authorization': 'Basic abc',
        Referer: 'https://www.yourupload.com/',
        Origin: 'https://www.yourupload.com',
        Range: 'bytes=0-1023'
      },
      new URL('https://vidcache.net:8161/a123/video.mp4'),
      new URL('https://s169.vidcache.net:8166/play/a123/video.mp4'),
      resolveVideoStreamReferer,
      { preserveVideoReferer: true }
    );
    expect(hopVidcache.Authorization).toBeUndefined();
    expect(hopVidcache.Cookie).toBeUndefined();
    expect(hopVidcache['Proxy-Authorization']).toBeUndefined();
    expect(hopVidcache.Referer).toBe('https://www.yourupload.com/');
    expect(hopVidcache.Origin).toBe('https://www.yourupload.com');
    expect(hopVidcache.Range).toBe('bytes=0-1023');

    // Redirect to a generic allowlisted storage CDN preserves extractor Referer when preserveVideoReferer=true
    const hopGenericCdn = buildRedirectHopHeaders(
      {
        Cookie: 'session=leak',
        Referer: 'https://streamwish.to/',
        Origin: 'https://streamwish.to'
      },
      new URL('https://streamwish.to/hls/master.m3u8'),
      new URL('https://edge01.vidhidepro.com/hls/seg1.ts'),
      resolveVideoStreamReferer,
      { preserveVideoReferer: true }
    );
    expect(hopGenericCdn.Cookie).toBeUndefined();
    expect(hopGenericCdn.Referer).toBe('https://streamwish.to/');
    expect(hopGenericCdn.Origin).toBe('https://streamwish.to');

    // Archive.org storage node redirect keeps https://archive.org/
    const hopArchive = buildRedirectHopHeaders(
      { Referer: 'https://archive.org/' },
      new URL('https://archive.org/download/item/ep1.mp4'),
      new URL('https://dn720400.ca.archive.org/0/items/item/ep1.mp4'),
      resolveVideoStreamReferer,
      { preserveVideoReferer: true }
    );
    expect(hopArchive.Referer).toBe('https://archive.org/');
  });

  it('allows real video CDN ports (:182, :183, :282, :8161, :8166) while blocking private IPs and sensitive ports', () => {
    const allowedCdnUrls = [
      'https://a3.mp4upload.com:182/d/xyz/video.mp4',
      'https://a4.mp4upload.com:183/d/xyz/video.mp4',
      'https://a5.mp4upload.com:282/d/xyz/video.mp4',
      'https://vidcache.net:8161/a/video.mp4',
      'https://s169.vidcache.net:8166/play/a/video.mp4',
      'https://dn720400.ca.archive.org/0/items/foo/bar.mp4',
      'https://byselapuix.com/e/r9g4afc6pl7g',
      'https://cdnwish.com/hls/index.m3u8'
    ];
    for (const u of allowedCdnUrls) {
      expect(validateProxyTargetUrl(u).valid, `Expected ${u} allowed`).toBe(true);
    }

    const blockedUrls = [
      'http://127.0.0.1:183/video.mp4',
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'https://a4.mp4upload.com:6379/secret',
      'https://a4.mp4upload.com:22/ssh'
    ];
    for (const u of blockedUrls) {
      expect(validateProxyTargetUrl(u).valid, `Expected ${u} blocked`).toBe(false);
    }

    expect(isValidRangeHeader('bytes=0-')).toBe(true);
    expect(isValidRangeHeader('bytes=0-1023')).toBe(true);
    expect(isValidRangeHeader('bytes=1024-2047')).toBe(true);
    expect(isValidRangeHeader('bytes=-500')).toBe(true);
    expect(isValidRangeHeader('bytes=-')).toBe(false);
    expect(isValidRangeHeader('items=0-5')).toBe(false);
  });
});

describe('Phase 1.5 Hotfix: Non-Aggressive Circuit Breaker, Direct Extractors & TransferIt Deprioritization', () => {
  it('never penalizes or opens circuit on isolated 404s or single transient failures', () => {
    const breaker = new ProviderCircuitBreaker({ failureThreshold: 3, cooldownMs: 60_000 });
    const t0 = 1_000_000;

    // Even 5 consecutive 404s (missing episodes/slugs) must NOT trip or increment failures
    for (let i = 0; i < 5; i += 1) {
      const r = breaker.recordHttpStatus('tioanime', 404, false, t0 + i * 100);
      expect(r.tripped).toBe(false);
      expect(r.failures).toBe(0);
      expect(breaker.canAttempt('tioanime', t0 + i * 100)).toBe(true);
    }

    // 1 or 2 transient 502s do NOT open the circuit
    expect(breaker.recordHttpStatus('tioanime', 502, false, t0 + 1000).tripped).toBe(false);
    expect(breaker.recordHttpStatus('tioanime', 502, false, t0 + 2000).tripped).toBe(false);
    expect(breaker.canAttempt('tioanime', t0 + 2500)).toBe(true);

    // A 200 resets the failure streak back to 0
    breaker.recordHttpStatus('tioanime', 200, false, t0 + 3000);
    expect(breaker.getState('tioanime', t0 + 3000).failures).toBe(0);

    // Only 3 consecutive real failures open the circuit, and it recovers after 60s
    breaker.recordHttpStatus('tioanime', 503, false, t0 + 4000);
    breaker.recordHttpStatus('tioanime', 0, true, t0 + 5000);
    const tripped = breaker.recordHttpStatus('tioanime', 502, false, t0 + 6000);
    expect(tripped.tripped).toBe(true);
    expect(breaker.canAttempt('tioanime', t0 + 30_000)).toBe(false);
    expect(breaker.canAttempt('tioanime', t0 + 67_000)).toBe(true);
  });

  it('classifies TransferIt as externalOnly, never ranks it above playable players, and prioritizes direct video over ad embeds', () => {
    expect(isNonEmbeddableHost('https://transfer.it/t/aqn7yDwDxDbB', 'TransferIt')).toBe(true);
    expect(isNonEmbeddableHost('https://www.mp4upload.com/embed-emxnjda39nsh.html', 'MP4Upload')).toBe(false);

    const animeAv1Snippet = `
      embeds:{SUB:[
        {server:"HLS",url:"https://player.zilla-networks.com/play/4f9dfa2695cbec5deeeb5c80f4bb2c1f"},
        {server:"Byse",url:"https://byselapuix.com/e/r9g4afc6pl7g"},
        {server:"MP4Upload",url:"https://www.mp4upload.com/embed-emxnjda39nsh.html"}
      ]},
      downloads:{SUB:[
        {server:"TransferIt",url:"https://transfer.it/t/aqn7yDwDxDbB"},
        {server:"Mega",url:"https://mega.nz/file/v6IQUKDZ#key123"},
        {server:"1Fichier",url:"https://1fichier.com/?abc"}
      ]}
    `;
    const parsed = parseAnimeAv1EpisodeEmbeds(animeAv1Snippet);
    const transfer = parsed.find((s) => s.serverName === 'TransferIt');
    expect(transfer?.externalOnly).toBe(true);
    expect((transfer?.score ?? 0) < 0).toBe(true);

    const ranked = rankAndDeduplicateSources(
      [
        ...parsed,
        {
          providerId: 'tioanime',
          providerName: 'TíoAnime (Okru)',
          serverName: 'Okru',
          url: 'https://ok.ru/videoembed/123456',
          language: 'SUB',
          quality: '1080p',
          type: 'embed',
          direct: false,
          score: 102
        },
        {
          providerId: 'tioanime',
          providerName: 'TíoAnime (YourUpload)',
          serverName: 'YourUpload',
          url: 'https://www.yourupload.com/embed/sH43x42tO1Fq',
          language: 'SUB',
          quality: '1080p',
          type: 'embed',
          direct: false,
          score: 146
        }
      ],
      'SUB'
    );

    // Direct/extractable ad-free hosts (MP4Upload, YourUpload) MUST rank ahead of Okru & Byse
    expect(ranked[0].serverName).toBe('MP4Upload');
    expect(ranked[1].serverName).toBe('YourUpload');
    const okruIdx = ranked.findIndex((s) => s.serverName === 'Okru');
    const transferIdx = ranked.findIndex((s) => s.serverName === 'TransferIt');
    expect(okruIdx).toBeGreaterThan(1);
    expect(transferIdx).toBe(ranked.length - 1);
    expect(ranked[transferIdx].externalOnly).toBe(true);
  });

  it('extracts direct MP4 URLs from MP4Upload and YourUpload HTML variants', () => {
    expect(
      parseMp4UploadDirectUrl(`<script>player.src({type:"video/mp4",src:"https://a4.mp4upload.com:183/d/abc/video.mp4"});</script>`)
    ).toBe('https://a4.mp4upload.com:183/d/abc/video.mp4');
    expect(
      parseYourUploadDirectUrl(`<meta property="og:video" content="https://vidcache.net:8161/a123/video.mp4">`)
    ).toBe('https://vidcache.net:8161/a123/video.mp4');
  });
});
