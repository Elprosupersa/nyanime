import { describe, expect, it } from 'vitest';
import {
  JKANIME_PROVIDER_BONUS,
  ProviderCircuitBreaker,
  buildAnimeSearchQueries,
  classifySourceBadgeType,
  detectAudioLanguageFromSignals,
  detectDeadEmbedFromHtml,
  extractEmbedTitleFromHtml,
  getServerBaseScore,
  isFrameBlockedByHeaders,
  normalizeKnownEmbedUrl,
  parseAnimePortalSearchSlugs,
  parseHexOptServerList,
  parseJkNetEpisodeSources,
  parseJkPlayerDirectM3u8,
  parseMp4UploadDirectUrl,
  parseStreamWishDirectUrl,
  pickBestSlugMatch,
  rankAndDeduplicateSources,
  selectBestArchiveOrgDocs,
  unpackDeanEdwards
} from '../utils/animeSources.ts';
import {
  resolveValidatedVideoReferer,
  resolveVideoStreamReferer,
  rewriteHlsManifestUrls,
  shouldBypassProxyCache,
  validateProxyTargetUrl
} from '../utils/proxySecurity.ts';

describe('Fase 1.6 — Systemic JKAnime, Health Probes, Strict SUB/LAT, Deduplication & Priority Matrix', () => {
  it('supports JKAnime Route A (jkanime.one) search + POST acc=opt hex extraction with +14 bonus', () => {
    const searchHtml = `
      <article class="li"><figure class="i"><a href="./anime/rezero-kara-hajimeru-isekai-seikatsu-memory-snow">OVA</a></figure></article>
      <article class="li"><figure class="i"><a href="./anime/rezero-kara-hajimeru-isekai-seikatsu-2nd-season">S2</a></figure></article>
      <article class="li"><figure class="i"><a href="./anime/rezero-kara-hajimeru-isekai-seikatsu">TV S1</a></figure></article>
    `;
    const slugs = parseAnimePortalSearchSlugs(searchHtml);
    expect(
      pickBestSlugMatch(
        slugs,
        ['Re:Zero kara Hajimeru Isekai Seikatsu', 'Re:ZERO -Starting Life in Another World-'],
        1,
        'TV',
        { episodes: 25, seasonYear: 2016 }
      )
    ).toBe('rezero-kara-hajimeru-isekai-seikatsu');

    // Generic colon-joined query builder produces "ReZero" for "Re:Zero" without hardcoding titles
    const queries = buildAnimeSearchQueries(
      'Re:Zero kara Hajimeru Isekai Seikatsu',
      'Re:ZERO -Starting Life in Another World-'
    );
    expect(queries.some((q) => /^rezero$/i.test(q))).toBe(true);

    const enc = (u: string) => Buffer.from(u, 'utf8').toString('hex');
    const optHtml = `
      <li encrypt="${enc('https://mp4upload.com/embed-abc123def456.html')}" title="Opción Mp4upload 1"><span>Mp4upload 1</span></li>
      <li encrypt="${enc('https://streamwish.to/e/wish123')}" title="Opción Streamwish 1"><span>Streamwish 1</span></li>
      <li encrypt="${enc('https://filemoon.sx/e/fm123')}" title="Opción Filemoon 1"><span>Filemoon 1</span></li>
      <li encrypt="${enc('https://vidhidevip.com/v/vh123')}" title="Opción Vidhide 1"><span>Vidhide 1</span></li>
      <li encrypt="${enc('https://uqload.is/embed-uq123.html')}" title="Opción Uqload 1"><span>Uqload 1</span></li>
      <li encrypt="${enc('https://luluvdo.com/e/lulu123')}" title="Opción Lulustream 1"><span>Lulustream 1</span></li>
      <li encrypt="${enc('https://dood.wf/e/dood123')}" title="Opción Doodstream 1"><span>Doodstream 1</span></li>
      <li encrypt="${enc('https://mixdrop.ag/e/mix123')}" title="Opción Mixdrop 1"><span>Mixdrop 1</span></li>
    `;

    const parsed = parseHexOptServerList(optHtml, 'jkanime', 'JKAnime', 'SUB');
    expect(parsed.map((s) => s.serverName)).toEqual([
      'MP4Upload',
      'StreamWish',
      'Filemoon',
      'Vidhide',
      'Uqload',
      'LuluStream',
      'Doodstream',
      'MixDrop'
    ]);
    // Verify +14 JKAnime bonus applied consistently
    const mp4 = parsed.find((s) => s.serverName === 'MP4Upload')!;
    expect(mp4.score).toBe(getServerBaseScore('MP4Upload') + JKANIME_PROVIDER_BONUS);
    expect(mp4.url).toBe('https://www.mp4upload.com/embed-abc123def456.html');
    // uqload.is normalized to uqload.vc
    expect(parsed.find((s) => s.serverName === 'Uqload')?.url).toBe('https://uqload.vc/embed-uq123.html');
  });

  it('parses JKAnime Route B (jkanime.net) Desu/Desuka Base64 remotes -> playmudos.com with Referer: https://jkanime.net/', () => {
    const b64Desu = Buffer.from('https://jkanime.net/jkplayer/um?e=XYZ987').toString('base64');
    const b64Mp4 = Buffer.from('https://www.mp4upload.com/embed-jk999888777a.html').toString('base64');
    const jkNetHtml = `
      <script>
        video[0] = '<iframe src="https://jkanime.net/jkplayer/um?e=DESU001" allowfullscreen></iframe>';
        video[2] = '<iframe src="/jkplayer/c?u=DESUKA002" allowfullscreen></iframe>';
        var servers = [
          {"remote":"${b64Desu}","server":"Desu","title":"Desu"},
          {"remote":"${b64Mp4}","server":"Mp4upload","title":"Mp4upload"},
          {"remote":"https://mediafire.com/file/skip","server":"Mediafire"}
        ];
      </script>
    `;

    const sources = parseJkNetEpisodeSources(jkNetHtml, 'SUB');
    expect(sources.some((s) => s.serverName === 'Desu' && s.url === 'https://jkanime.net/jkplayer/um?e=DESU001')).toBe(true);
    expect(sources.some((s) => s.serverName === 'Desuka' && s.url === 'https://jkanime.net/jkplayer/c?u=DESUKA002')).toBe(true);
    expect(sources.some((s) => s.serverName === 'Desu' && s.url === 'https://jkanime.net/jkplayer/um?e=XYZ987')).toBe(true);
    expect(sources.some((s) => s.serverName === 'MP4Upload' && s.url === 'https://www.mp4upload.com/embed-jk999888777a.html')).toBe(true);
    expect(sources.some((s) => /mediafire/i.test(s.serverName))).toBe(false);

    const desu = sources.find((s) => s.serverName === 'Desu')!;
    expect(desu.score).toBe(getServerBaseScore('Desu') + JKANIME_PROVIDER_BONUS);

    // Extract playmudos.com master.m3u8 from jkplayer HTML (both plain and atob forms)
    const umHtml = `<script>var video = { src: "https://cdn01.playmudos.com/hls/abc123/master.m3u8?st=ok" };</script>`;
    const m3u8 = parseJkPlayerDirectM3u8(umHtml);
    expect(m3u8).toBe('https://cdn01.playmudos.com/hls/abc123/master.m3u8?st=ok');

    // playmudos.com is allowlisted and defaults to Referer: https://jkanime.net/
    expect(validateProxyTargetUrl(m3u8!).valid).toBe(true);
    expect(resolveVideoStreamReferer(new URL(m3u8!))).toBe('https://jkanime.net/');
    expect(resolveValidatedVideoReferer(new URL(m3u8!), 'https://hentaijk.com/')).toBe('https://hentaijk.com/');
    // Rejects spoofed / non-allowlisted referer override
    expect(resolveValidatedVideoReferer(new URL(m3u8!), 'http://127.0.0.1/evil')).toBe('https://jkanime.net/');

    // Rewritten HLS manifest preserves validated referer param for segments
    const rewritten = rewriteHlsManifestUrls('#EXTM3U\nchunk_001.ts', m3u8!, 'https://jkanime.net/');
    expect(rewritten).toContain('referer=https%3A%2F%2Fjkanime.net%2F');
  });

  it('extracts MP4Upload regex & safely unpacks StreamWish/Vidhide P.A.C.K.E.R. without eval', () => {
    const mp4Html = `<script>player.src({ type: "video/mp4", src: "https://a3.mp4upload.com:183/d/tok123/video.mp4" });</script>`;
    expect(parseMp4UploadDirectUrl(mp4Html)).toBe('https://a3.mp4upload.com:183/d/tok123/video.mp4');

    const packedVidhide = `<script>eval(function(p,a,c,k,e,d){return p}('0({1:"2://3.4-5.6/7/8.9"});',10,10,'setup|file|https|edge1|dramiyos|cdn|com|hls2|master|m3u8'.split('|'),0,{}))</script>`;
    expect(unpackDeanEdwards(packedVidhide)).toContain('https://edge1.dramiyos-cdn.com/hls2/master.m3u8');
    expect(parseStreamWishDirectUrl(packedVidhide)).toBe('https://edge1.dramiyos-cdn.com/hls2/master.m3u8');
    expect(validateProxyTargetUrl('https://edge1.dramiyos-cdn.com/hls2/master.m3u8').valid).toBe(true);

    // Ephemeral video token hosts MUST bypass server proxy cache
    expect(shouldBypassProxyCache(new URL('https://www.mp4upload.com/embed-abc.html'))).toBe(true);
    expect(shouldBypassProxyCache(new URL('https://www.yourupload.com/embed/abc'))).toBe(true);
    expect(shouldBypassProxyCache(new URL('https://jkanime.net/jkplayer/um?e=123'))).toBe(true);
    expect(shouldBypassProxyCache(new URL('https://jkanime.one/jk'))).toBe(true);
    expect(shouldBypassProxyCache(new URL('https://ok.ru/videoembed/123'))).toBe(true);
    expect(shouldBypassProxyCache(new URL('https://graphql.anilist.co/'))).toBe(false);

    // Anti-SSRF remains strictly enforced
    expect(validateProxyTargetUrl('http://127.0.0.1:3000/').valid).toBe(false);
    expect(validateProxyTargetUrl('http://169.254.169.254/latest/meta-data/').valid).toBe(false);
    expect(validateProxyTargetUrl('https://evil.attacker.example/video.mp4').valid).toBe(false);
  });

  it('detects dead embeds (EN/ES/RU DMCA, 404, Byse JSON 404) and X-Frame-Options/CSP frame blocks', () => {
    // Russian OK.ru DMCA block
    const okDmcaRu = `<html><head><title>OK</title></head><body><div class="vp_video_stub">Видео заблокировано из-за нарушений авторских прав</div><script>{"Error":true}</script></body></html>`;
    const rRu = detectDeadEmbedFromHtml(okDmcaRu, 200, 'https://ok.ru/videoembed/260470868679');
    expect(rRu.alive).toBe(false);

    // Alive OK.ru with LAT title inside <title>
    const okAliveLat = `<html><head><title>Смотрите видео "2433_LAT_1" в ОК</title></head><body><div data-options="{&quot;flashvars&quot;:{}}"></div></body></html>`;
    const rOkLat = detectDeadEmbedFromHtml(okAliveLat, 200, 'https://ok.ru/videoembed/1294184876718');
    expect(rOkLat.alive).toBe(true);
    expect(rOkLat.detectedLanguage).toBe('LATINO');

    // English & Spanish DMCA / deleted
    expect(
      detectDeadEmbedFromHtml('<html><body>This Video has been blocked due to copyright infringement</body></html>', 200, 'https://mixdrop.ag/e/dead').alive
    ).toBe(false);
    expect(
      detectDeadEmbedFromHtml('<html><body>Video bloqueado por infracción de derechos de autor</body></html>', 200, 'https://filemoon.sx/e/dead').alive
    ).toBe(false);
    expect(
      detectDeadEmbedFromHtml('<html><body>File was deleted</body></html>', 200, 'https://uqload.vc/embed-dead.html').alive
    ).toBe(false);

    // Byse JSON API dead 404 vs alive 200 DUB/SUB
    expect(
      detectDeadEmbedFromHtml('{"error":"video record missing: video not found"}', 404, 'https://byselapuix.com/api/videos/dead123').alive
    ).toBe(false);
    const byseAliveDub = detectDeadEmbedFromHtml(
      '{"id":1,"title":"1645 1 DUB","duration_seconds":1436}',
      200,
      'https://bysesukior.com/api/videos/live123'
    );
    expect(byseAliveDub.alive).toBe(true);
    expect(byseAliveDub.detectedLanguage).toBe('LATINO');

    // X-Frame-Options & CSP frame-ancestors checks
    expect(isFrameBlockedByHeaders('DENY', null)).toBe(true);
    expect(isFrameBlockedByHeaders('SAMEORIGIN', null)).toBe(true);
    expect(isFrameBlockedByHeaders(null, "default-src 'self'; frame-ancestors 'none'")).toBe(true);
    expect(isFrameBlockedByHeaders(null, "frame-ancestors 'self'")).toBe(true);
    expect(isFrameBlockedByHeaders(null, 'frame-ancestors *')).toBe(false);

    const frameBlocked = detectDeadEmbedFromHtml('<html><body>OK</body></html>', 200, 'https://mixdrop.ag/e/xfo', {
      xFrameOptions: 'SAMEORIGIN'
    });
    expect(frameBlocked.frameBlocked).toBe(true);
  });

  it('strictly classifies SUB vs LAT from URL, label, and embed video titles', () => {
    expect(extractEmbedTitleFromHtml('<html><head><title>2433_LAT_1.mp4</title></head></html>')).toBe('2433_LAT_1.mp4');
    expect(detectAudioLanguageFromSignals({ title: '2433_LAT_1.mp4', fallback: 'SUB' })).toBe('LATINO');
    expect(detectAudioLanguageFromSignals({ title: '2433_1.mp4', fallback: 'SUB' })).toBe('SUB');
    expect(detectAudioLanguageFromSignals({ title: '1645 1 DUB', fallback: 'SUB' })).toBe('LATINO');
    expect(detectAudioLanguageFromSignals({ title: '1645 1 SUB', fallback: 'LATINO' })).toBe('SUB');
    expect(detectAudioLanguageFromSignals({ slug: 'kimetsu-no-yaiba-latino', fallback: 'SUB' })).toBe('LATINO');
    expect(detectAudioLanguageFromSignals({ label: 'Audio Latino', fallback: 'SUB' })).toBe('LATINO');
  });

  it('deduplicates identical targets across mirrors/labels and enforces the exact Priority Matrix & native-only badges', () => {
    expect(normalizeKnownEmbedUrl('https://streamtape.com/v/abc123/video.mp4')).toBe('https://streamtape.com/e/abc123');
    expect(normalizeKnownEmbedUrl('https://bysesukior.com/d/zlsq6gidy8tq')).toBe('https://bysesukior.com/e/zlsq6gidy8tq');
    expect(normalizeKnownEmbedUrl('https://dhcplay.com/f/h001n3hgy5z1')).toBe('https://streamwish.to/e/h001n3hgy5z1');

    const ranked = rankAndDeduplicateSources(
      [
        // Duplicate Byse under 3 different labels from JKAnime -> must collapse to 1
        { providerId: 'jkanime', providerName: 'JKAnime (Filemoon)', serverName: 'Filemoon', url: 'https://bysesukior.com/e/zlsq6gidy8tq', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('Filemoon') + 14 },
        { providerId: 'jkanime', providerName: 'JKAnime (Byse)', serverName: 'Byse', url: 'https://bysesukior.com/d/zlsq6gidy8tq', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('Byse') + 14 },
        // Duplicate StreamWish via dhcplay vs streamwish.to -> must collapse to 1
        { providerId: 'jkanime', providerName: 'JKAnime (StreamWish)', serverName: 'StreamWish', url: 'https://dhcplay.com/f/h001n3hgy5z1', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('StreamWish') + 14 },
        { providerId: 'jkanime', providerName: 'JKAnime (StreamWish)', serverName: 'StreamWish', url: 'https://streamwish.to/e/h001n3hgy5z1', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('StreamWish') + 14 },
        // Full priority tiers
        { providerId: 'animeav1', providerName: 'AnimeAV1 (TransferIt)', serverName: 'TransferIt', url: 'https://transfer.it/t/abc', language: 'SUB', quality: '1080p', type: 'embed', direct: false, externalOnly: true, score: -120 },
        { providerId: 'tioanime', providerName: 'TíoAnime (Okru)', serverName: 'Okru', url: 'https://ok.ru/videoembed/777', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('Okru') + 6 },
        { providerId: 'animeav1', providerName: 'AnimeAV1 (Mega)', serverName: 'Mega', url: 'https://mega.nz/embed/m123#k', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('Mega') + 6 },
        { providerId: 'archive_org', providerName: 'Archive Español HD (Direct MP4)', serverName: 'Archive Direct', url: 'https://archive.org/download/a/1.mp4', language: 'SUB', quality: '1080p', type: 'mp4', direct: true, score: getServerBaseScore('Archive Direct') },
        { providerId: 'tioanime', providerName: 'TíoAnime (YourUpload)', serverName: 'YourUpload', url: 'https://www.yourupload.com/embed/yu1', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('YourUpload') + 6 },
        { providerId: 'jkanime', providerName: 'JKAnime (MP4Upload)', serverName: 'MP4Upload', url: 'https://www.mp4upload.com/embed-mp41.html', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('MP4Upload') + 14 },
        { providerId: 'jkanime', providerName: 'JKAnime (Desu)', serverName: 'Desu', url: 'https://jkanime.net/jkplayer/um?e=desu1', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('Desu') + 14 }
      ],
      'SUB'
    );

    // Deduplicated cleanly: 11 raw -> 9 unique
    expect(ranked).toHaveLength(9);
    // Exact priority order verified: Desu > MP4Upload > StreamWish > YourUpload > Archive Direct > Mega > Okru > TransferIt
    expect(ranked[0].serverName).toBe('Desu');
    expect(ranked[1].serverName).toBe('MP4Upload');
    expect(ranked[2].serverName).toBe('StreamWish');
    expect(ranked[3].serverName).toBe('YourUpload');
    expect(ranked[4].serverName).toBe('Archive Direct');
    const megaIdx = ranked.findIndex((s) => s.serverName === 'Mega');
    const okruIdx = ranked.findIndex((s) => s.serverName === 'Okru');
    const transferIdx = ranked.findIndex((s) => s.serverName === 'TransferIt');
    expect(megaIdx).toBeGreaterThan(4);
    expect(okruIdx).toBeGreaterThan(megaIdx);
    expect(transferIdx).toBe(ranked.length - 1);

    // Native badge discipline: Sin Anuncios ONLY for native HLS/direct streams, never for embeds
    expect(classifySourceBadgeType(ranked[0])).toBe('native-hls');
    expect(classifySourceBadgeType(ranked[1])).toBe('native-direct');
    expect(classifySourceBadgeType(ranked[megaIdx])).toBe('embed');
    expect(classifySourceBadgeType(ranked[okruIdx])).toBe('embed');
    expect(classifySourceBadgeType(ranked[transferIdx])).toBe('external');

    // Circuit breaker trips cleanly on 403/429 and recovers after cooldown
    const cb = new ProviderCircuitBreaker({ failureThreshold: 1, cooldownMs: 5 * 60 * 1000 });
    cb.recordHttpStatus('jkanime_net', 403, false, 1000);
    expect(cb.canAttempt('jkanime_net', 2000)).toBe(false);
    expect(cb.canAttempt('jkanime_net', 1000 + 5 * 60 * 1000 + 1)).toBe(true);
  });

  it('collapses duplicate same-provider fallback embeds and rejects bogus/NSFW/foreign/sequel Archive.org docs generically', () => {
    const deduped = rankAndDeduplicateSources(
      [
        { providerId: 'tioanime', providerName: 'TíoAnime (Mega)', serverName: 'Mega', url: 'https://mega.nz/embed/idA#keyA', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: 56 },
        { providerId: 'tioanime', providerName: 'TíoAnime (Mega)', serverName: 'Mega', url: 'https://mega.nz/embed/idB#keyB', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: 56 },
        { providerId: 'animeav1', providerName: 'AnimeAV1 (Mega)', serverName: 'Mega', url: 'https://mega.nz/embed/idC#keyC', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: 58 }
      ],
      'SUB'
    );
    expect(deduped.filter((s) => s.providerId === 'tioanime' && s.serverName === 'Mega')).toHaveLength(1);
    expect(deduped.filter((s) => s.providerId === 'animeav1' && s.serverName === 'Mega')).toHaveLength(1);

    const archiveCandidates = [
      { identifier: 'hero-fan-made-hentai-example-anime-you-tube', title: 'FanMade Hentai Example Anime YouTube', downloads: 9000 },
      { identifier: 'example-anime-2-part-2-ep-01-sub-ita', title: 'Example Anime 2 Part 2 Ep 01 SUB ITA', downloads: 8000 },
      { identifier: 'example-anime-some-sequel-arc-part-1-ep-1', title: 'Example Anime Some Sequel Arc Part 1 Episode 1', downloads: 7500 },
      { identifier: 'example-anime-new-generation-remux', title: 'Example Anime New Generation BluRay Remux', downloads: 7000 },
      { identifier: 'example-anime-ep-01-sub-espanol-1080p', title: 'Example Anime Ep 01 Sub Espanol 1080p', downloads: 1200 }
    ];
    const selected = selectBestArchiveOrgDocs(archiveCandidates, ['Example Anime'], 1, false, 1);
    expect(selected).toEqual(['example-anime-ep-01-sub-espanol-1080p']);
  });
});
