import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decryptMegaAttributeName,
  detectDeadEmbedFromHtml,
  extractArchiveOrgSourcesFromMetadata,
  generateAnimeSlugCandidates,
  getServerBaseScore,
  isArchiveOrgSpanishMetadata,
  isRawOrNonSpanishArchiveText,
  normalizeKnownEmbedUrl,
  parseMegaApiCheckResult,
  parseMegaUrlFileIdAndKey,
  parseMonosChinosEpisodePlayers,
  parseMonosChinosSearchLinks,
  parseTioAnimeEpisodeVideos,
  rankAndDeduplicateSources,
  selectBestArchiveOrgDocs
} from '../utils/animeSources.ts';
import {
  DEFAULT_VIDEO_STREAM_CHUNK_BYTES,
  capStreamingRangeHeader,
  isDomainAllowlisted,
  shouldBypassProxyCache,
  validateIncomingRequestOrigin
} from '../utils/proxySecurity.ts';

async function createEncryptedMegaAttribute(fileName: string): Promise<{ atBase64: string; keyBase64: string }> {
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) keyBytes[i] = (i * 19 + 7) & 0xff;
  const aesKeyRaw = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) aesKeyRaw[i] = keyBytes[i] ^ keyBytes[i + 16];

  const payload = new TextEncoder().encode(`MEGA${JSON.stringify({ n: fileName })}`);
  const paddedLen = Math.ceil(payload.length / 16) * 16;
  const zeroPadded = new Uint8Array(paddedLen);
  zeroPadded.set(payload, 0);

  const cryptoKey = await globalThis.crypto.subtle.importKey('raw', aesKeyRaw, { name: 'AES-CBC' }, false, ['encrypt']);
  const fullCipher = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, cryptoKey, zeroPadded)
  );
  // Strip WebCrypto's trailing PKCS#7 padding block so ciphertext matches Mega's zero-padded format
  const megaAtBytes = fullCipher.subarray(0, paddedLen);

  const toB64Url = (buf: Uint8Array) =>
    Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return {
    atBase64: toB64Url(megaAtBytes),
    keyBase64: toB64Url(keyBytes)
  };
}

describe('Preview Streaming Fixes — Mega Probe, Archive RAW Block, Native Video & SUB/LAT Purity', () => {
  it('validates Mega live vs deleted (-9/-16/-6), decrypts Mega filenames for SUB vs LAT, and detects expanded dead-embed strings', async () => {
    // TíoAnime legacy /embed/!ID!KEY format normalizes cleanly to /embed/ID#KEY
    expect(normalizeKnownEmbedUrl('https://mega.nz/embed/!uyRSTZjB!abc123KEY')).toBe(
      'https://mega.nz/embed/uyRSTZjB#abc123KEY'
    );
    expect(parseMegaUrlFileIdAndKey('https://mega.nz/embed/!uyRSTZjB!abc123KEY')).toEqual({
      fileId: 'uyRSTZjB',
      key: 'abc123KEY'
    });

    // Dead Mega error responses from g.api.mega.co.nz/cs
    expect((await parseMegaApiCheckResult([-9])).alive).toBe(false);
    expect((await parseMegaApiCheckResult([-16])).alive).toBe(false);
    expect((await parseMegaApiCheckResult([-6])).alive).toBe(false);
    expect((await parseMegaApiCheckResult(-9)).alive).toBe(false);
    expect((await parseMegaApiCheckResult([{ e: -9 }])).alive).toBe(false);

    // Live Mega SUB file -> alive + SUB
    const subAttr = await createEncryptedMegaAttribute('10_1.mp4');
    expect(await decryptMegaAttributeName(subAttr.atBase64, subAttr.keyBase64)).toBe('10_1.mp4');
    const liveSub = await parseMegaApiCheckResult([{ s: 148200123, at: subAttr.atBase64 }], subAttr.keyBase64);
    expect(liveSub.alive).toBe(true);
    expect(liveSub.fileName).toBe('10_1.mp4');
    expect(liveSub.detectedLanguage).toBeUndefined(); // neutral filename keeps provider's SUB tag

    // Live Mega LATINO file -> alive + reclassified as LATINO!
    const latAttr = await createEncryptedMegaAttribute('10_LAT_1_LzRj.mp4');
    expect(await decryptMegaAttributeName(latAttr.atBase64, latAttr.keyBase64)).toBe('10_LAT_1_LzRj.mp4');
    const liveLat = await parseMegaApiCheckResult([{ s: 148200123, at: latAttr.atBase64 }], latAttr.keyBase64);
    expect(liveLat.alive).toBe(true);
    expect(liveLat.detectedLanguage).toBe('LATINO');

    // Expanded dead embed text patterns (Mega / cyberlockers)
    expect(
      detectDeadEmbedFromHtml('<html><body>Video is not exist or not available</body></html>', 200, 'https://mega.nz/embed/dead#k').alive
    ).toBe(false);
    expect(
      detectDeadEmbedFromHtml('<html><body>The file you are trying to download is no longer available</body></html>', 200, 'https://mega.nz/embed/dead#k').alive
    ).toBe(false);
    expect(
      detectDeadEmbedFromHtml('<html><body>File does not exist</body></html>', 200, 'https://filemoon.sx/e/dead').alive
    ).toBe(false);
    expect(
      detectDeadEmbedFromHtml('<html><body>This video has been removed</body></html>', 200, 'https://ok.ru/videoembed/dead').alive
    ).toBe(false);

    // Mega API is allowlisted and bypasses proxy cache
    expect(isDomainAllowlisted('g.api.mega.co.nz')).toBe(true);
    expect(shouldBypassProxyCache(new URL('https://g.api.mega.co.nz/cs'))).toBe(true);
  });

  it('hard-rejects Archive.org RAW and non-Spanish items on BOTH Direct MP4 and Embed while preserving Spanish packs', () => {
    const rawTitle = '[Leopard-Raws] Re Zero kara Hajimeru Isekai Seikatsu - 01 RAW (TX 1280x720 x264 AAC)';
    expect(isRawOrNonSpanishArchiveText(rawTitle)).toBe(true);
    expect(isRawOrNonSpanishArchiveText('Ohys-Raws Anime Ep 01 (1280x720)')).toBe(true);
    expect(isRawOrNonSpanishArchiveText('[SubsPlease] Example Anime - 01 (1080p)')).toBe(true);
    expect(isRawOrNonSpanishArchiveText('Example Anime Episode 01 English Sub')).toBe(true);
    expect(isRawOrNonSpanishArchiveText('Example Anime 01 SUB ITA')).toBe(true);
    expect(isRawOrNonSpanishArchiveText('Example Anime 01 VOSTFR')).toBe(true);
    expect(isRawOrNonSpanishArchiveText('Example Anime 01 Sub Espanol HD')).toBe(false);

    const rawMetadata = {
      metadata: {
        identifier: 'leopard-raws-example-anime-01-raw',
        title: rawTitle,
        description: 'Raw Japanese broadcast without subtitles'
      },
      files: [{ name: '[Leopard-Raws] Example Anime - 01 RAW (TX 1280x720 x264 AAC).mp4', format: 'MPEG4' }]
    };

    expect(isArchiveOrgSpanishMetadata('leopard-raws-example-anime-01-raw', rawMetadata)).toBe(false);
    // Rejects BOTH Direct MP4 and Embed!
    expect(extractArchiveOrgSourcesFromMetadata('leopard-raws-example-anime-01-raw', rawMetadata, 1)).toEqual([]);

    // Mixed pack where metadata mentions Spanish but the matched MP4 file itself is RAW -> still rejected
    const mixedRawFileMeta = {
      metadata: {
        identifier: 'example-anime-espanol-pack',
        title: 'Example Anime Sub Espanol'
      },
      files: [{ name: '[Ohys-Raws] Example Anime - 01 RAW.mp4', format: 'MPEG4' }]
    };
    expect(extractArchiveOrgSourcesFromMetadata('example-anime-espanol-pack', mixedRawFileMeta, 1)).toEqual([]);

    // Genuine Sub Español pack -> emits Direct MP4 + Embed tagged SUB (NOT LATINO)
    const validSpanishMeta = {
      metadata: {
        identifier: 'example-anime-sub-espanol-hd',
        title: 'Example Anime Sub Español HD'
      },
      files: [{ name: 'Example_Anime_Ep_01_Sub_Espanol.mp4', format: 'MPEG4' }]
    };
    expect(isArchiveOrgSpanishMetadata('example-anime-sub-espanol-hd', validSpanishMeta)).toBe(true);
    const validSources = extractArchiveOrgSourcesFromMetadata('example-anime-sub-espanol-hd', validSpanishMeta, 1);
    expect(validSources).toHaveLength(2);
    expect(validSources.every((s) => s.language === 'SUB')).toBe(true);

    // selectBestArchiveOrgDocs filters out RAW docs even with huge download counts
    const docs = [
      { identifier: 'leopard-raws-example-anime-01-raw', title: rawTitle, downloads: 99999 },
      { identifier: 'example-anime-sub-espanol-hd', title: 'Example Anime Sub Español HD', downloads: 500 }
    ];
    expect(selectBestArchiveOrgDocs(docs, ['Example Anime'], 1, false, 1)).toEqual(['example-anime-sub-espanol-hd']);
  });

  it('guarantees zero crossorigin="anonymous" on <video>, same-origin hls.js xhrSetup, and 4MB Range chunking for Cloud Run Preview', () => {
    const playerSrc = readFileSync(resolve(process.cwd(), 'src/ui/playerView.ts'), 'utf8');
    const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

    // No <video> tag anywhere may carry crossorigin="anonymous" (which drops Preview session cookies on /api/video-proxy)
    expect(playerSrc).not.toMatch(/<video[^>]*crossorigin/i);
    expect(indexHtml).not.toMatch(/<video[^>]*crossorigin/i);

    // hls.js MUST configure xhrSetup with xhr.withCredentials = true for same-origin /api/* requests
    expect(playerSrc).toMatch(/new nWin\.Hls\(\{[\s\S]*?xhrSetup:\s*\(xhr:\s*XMLHttpRequest,\s*url:\s*string\)\s*=>[\s\S]*?xhr\.withCredentials\s*=\s*true/m);

    // Open-ended Range: bytes=0- is capped to 4MB chunks so Cloud Run's 32MB response cap never stalls <video>
    expect(capStreamingRangeHeader('bytes=0-', false)).toBe(`bytes=0-${DEFAULT_VIDEO_STREAM_CHUNK_BYTES - 1}`);
    expect(capStreamingRangeHeader('bytes=8388608-', false)).toBe(
      `bytes=8388608-${8388608 + DEFAULT_VIDEO_STREAM_CHUNK_BYTES - 1}`
    );
    // Small explicit probe range is preserved untouched
    expect(capStreamingRangeHeader('bytes=0-65535', false)).toBe('bytes=0-65535');
    // Download mode is never capped
    expect(capStreamingRangeHeader('bytes=0-', true)).toBe('bytes=0-');

    // Cloud Run reverse proxy origin validation trusts both x-forwarded-host and host
    expect(
      validateIncomingRequestOrigin({
        origin: 'https://ais-pre-xyz.run.app',
        host: '127.0.0.1:3000',
        'x-forwarded-host': 'ais-pre-xyz.run.app'
      }).allowed
    ).toBe(true);
    expect(
      validateIncomingRequestOrigin({
        origin: 'https://evil-site.example',
        host: '127.0.0.1:3000',
        'x-forwarded-host': 'ais-pre-xyz.run.app'
      }).allowed
    ).toBe(false);
  });

  it('cleanly separates SUB vs LAT in TíoAnime & MonosChinos and ranks live MP4Upload/YourUpload/HLS above Archive & Mega', () => {
    // Slug candidates never append -latino suffixes for SUB lookups
    const slugs = generateAnimeSlugCandidates('Death Note', 'Death Note', 'Death Note', 1);
    expect(slugs.some((s) => /latino/i.test(s))).toBe(false);

    // TíoAnime detects LATINO pages cleanly from slug/title
    const tioLatHtml = `<html><head><title>Ver Example Anime Latino 1</title></head><script>var videos = [["Mega","https://mega.nz/embed/!abc123!key123",0,0],["YourUpload","https://www.yourupload.com/embed/yu123",0,0]];</script></html>`;
    const tioLatSources = parseTioAnimeEpisodeVideos(tioLatHtml, 'SUB', 'example-anime-latino');
    expect(tioLatSources.length).toBe(2);
    expect(tioLatSources.every((s) => s.language === 'LATINO')).toBe(true);

    // MonosChinos search separates -sub-espanol vs -latino cleanly
    const mcSearchHtml = `
      <a href="https://monoschinos.st/anime/death-note-sub-espanol">Death Note Sub</a>
      <a href="https://monoschinos.st/anime/death-note-latino">Death Note Latino</a>
    `;
    const mcEntries = parseMonosChinosSearchLinks(mcSearchHtml);
    expect(mcEntries).toEqual([
      { rawSlug: 'death-note-sub-espanol', baseSlug: 'death-note', language: 'SUB' },
      { rawSlug: 'death-note-latino', baseSlug: 'death-note', language: 'LATINO' }
    ]);
    expect(isDomainAllowlisted('monoschinos.st')).toBe(true);

    // MonosChinos base64 data-player extraction
    const b64Mp4 = Buffer.from('https://www.mp4upload.com/embed-mc123456.html').toString('base64');
    const b64Wish = Buffer.from('https://sfastwish.com/e/wishmc123').toString('base64');
    const mcEpHtml = `
      <title>Ver Death Note Episodio 1 Sub Español</title>
      <li data-player="${b64Mp4}">mp4upload</li>
      <li data-player="${b64Wish}">streamwish</li>
    `;
    const mcSources = parseMonosChinosEpisodePlayers(mcEpHtml, 'SUB', 'death-note');
    expect(mcSources.map((s) => s.serverName)).toEqual(['MP4Upload', 'StreamWish']);
    expect(mcSources.every((s) => s.language === 'SUB')).toBe(true);

    // Ranking: live MP4Upload / YourUpload / HLS MUST outrank Archive Direct, Mega, and Archive Embed
    const ranked = rankAndDeduplicateSources(
      [
        { providerId: 'archive_org', providerName: 'Archive Español HD (Embed)', serverName: 'Archive Embed', url: 'https://archive.org/embed/a', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('Archive Embed') },
        { providerId: 'tioanime', providerName: 'TíoAnime (Mega)', serverName: 'Mega', url: 'https://mega.nz/embed/m1#k1', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('Mega') + 6 },
        { providerId: 'archive_org', providerName: 'Archive Español HD (Direct MP4)', serverName: 'Archive Direct', url: 'https://archive.org/download/a/1.mp4', language: 'SUB', quality: '1080p', type: 'mp4', direct: true, score: getServerBaseScore('Archive Direct') },
        { providerId: 'tioanime', providerName: 'TíoAnime (YourUpload)', serverName: 'YourUpload', url: 'https://www.yourupload.com/embed/yu1', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('YourUpload') + 6 },
        { providerId: 'monoschinos', providerName: 'MonosChinos (MP4Upload)', serverName: 'MP4Upload', url: 'https://www.mp4upload.com/embed-mc1.html', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('MP4Upload') + 10 },
        { providerId: 'animeav1', providerName: 'AnimeAV1 (HLS)', serverName: 'HLS', url: 'https://cdn.dotanborito.net/e/123', language: 'SUB', quality: '1080p', type: 'hls', direct: true, score: getServerBaseScore('Dotanborito') + 8 }
      ],
      'SUB'
    );
    expect(ranked.map((s) => s.serverName)).toEqual([
      'MP4Upload',
      'HLS',
      'YourUpload',
      'Archive Direct',
      'Mega',
      'Archive Embed'
    ]);

    // Strict SUB vs LATINO separation: when working SUB sources exist, ZERO LATINO sources leak into SUB mode
    const mixedRankedSub = rankAndDeduplicateSources(
      [
        { providerId: 'tioanime', providerName: 'TíoAnime (YourUpload)', serverName: 'YourUpload', url: 'https://www.yourupload.com/embed/yuSub', language: 'SUB', quality: '1080p', type: 'embed', direct: true, score: getServerBaseScore('YourUpload') + 6 },
        { providerId: 'tioanime', providerName: 'TíoAnime (Okru)', serverName: 'Okru', url: 'https://ok.ru/videoembed/lat999', language: 'LATINO', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('Okru') + 6 },
        { providerId: 'animeav1', providerName: 'AnimeAV1 (Mega)', serverName: 'Mega', url: 'https://mega.nz/embed/latId#k2', language: 'LATINO', quality: '1080p', type: 'embed', direct: false, score: getServerBaseScore('Mega') + 8 }
      ],
      'SUB'
    );
    expect(mixedRankedSub).toHaveLength(1);
    expect(mixedRankedSub.every((s) => s.language === 'SUB')).toBe(true);

    // Pre-probe option preserves duplicate same-provider hosts and all languages so dead/LAT ones can be probed separately from live SUB ones
    const preProbe = rankAndDeduplicateSources(
      [
        { providerId: 'tioanime', providerName: 'TíoAnime (Mega)', serverName: 'Mega', url: 'https://mega.nz/embed/subId#k1', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: 100 },
        { providerId: 'tioanime', providerName: 'TíoAnime (Mega)', serverName: 'Mega', url: 'https://mega.nz/embed/latId#k2', language: 'SUB', quality: '1080p', type: 'embed', direct: false, score: 100 }
      ],
      'BEST',
      undefined,
      { deduplicateByProviderHost: false, strictLanguageFilter: false }
    );
    expect(preProbe).toHaveLength(2);
  });
});
