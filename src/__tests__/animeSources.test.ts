import { describe, it, expect } from 'vitest';
import {
  generateAnimeSlugCandidates,
  extractBestSearchQuery,
  buildAnimeSearchQueries,
  parseAnimeAv1CatalogLinks,
  parseTioAnimeDirectoryLinks,
  parseTvAnimeDirectoryLinks,
  pickBestSlugMatch,
  parseAnimeAv1EpisodeEmbeds,
  parseTioAnimeEpisodeVideos,
  parseTvAnimeEpisodePlayers,
  parseMonosChinosEpisodePlayers,
  parseMp4UploadDirectUrl,
  parseYourUploadDirectUrl,
  unpackDeanEdwards,
  parseStreamWishDirectUrl,
  parseAnimePortalSearchSlugs,
  parseAnimePortalEpisodeData,
  parseHexOptServerList,
  parsePortalDownloadUrls,
  isBlockedOrUnsafeStreamHost,
  rankAndDeduplicateSources,
  formatAiringCountdown,
  extractEpisodeDetailsMap
} from '../utils/animeSources.ts';

describe('animeSources — Real Multi-Provider Parsers & Ranking', () => {
  it('generates clean slug candidates and picks exact season match from catalog links', () => {
    const candidates = generateAnimeSlugCandidates(
      'Kusuriya no Hitorigoto 2nd Season',
      'The Apothecary Diaries Season 2',
      'The Apothecary Diaries Season 2',
      2
    );
    expect(candidates).toContain('kusuriya-no-hitorigoto-2nd-season');
    expect(candidates).toContain('kusuriya-no-hitorigoto-season-2');
    expect(candidates).not.toContain('kusuriya-no-hitorigoto');

    expect(extractBestSearchQuery('', 'The Apothecary Diaries Season 3', 'The Apothecary Diaries Season 3')).toBe(
      'The Apothecary Diaries'
    );

    const catalogHtml = `
      <a href="/media/kusuriya-no-hitorigoto-3rd-season">S3</a>
      <a href="/media/kusuriya-no-hitorigoto-2nd-season">S2</a>
      <a href="/media/kusuriya-no-hitorigoto">S1</a>
    `;
    const slugs = parseAnimeAv1CatalogLinks(catalogHtml);
    expect(slugs).toEqual([
      'kusuriya-no-hitorigoto-3rd-season',
      'kusuriya-no-hitorigoto-2nd-season',
      'kusuriya-no-hitorigoto'
    ]);

    expect(pickBestSlugMatch(slugs, ['Kusuriya no Hitorigoto', 'The Apothecary Diaries'], 1)).toBe(
      'kusuriya-no-hitorigoto'
    );
    expect(pickBestSlugMatch(slugs, ['Kusuriya no Hitorigoto 2nd Season'], 2)).toBe(
      'kusuriya-no-hitorigoto-2nd-season'
    );
    expect(pickBestSlugMatch(slugs, ['Kusuriya no Hitorigoto 3rd Season'], 3)).toBe(
      'kusuriya-no-hitorigoto-3rd-season'
    );
    // When Season 3 does not exist on a portal that only has S1 and S2, it MUST return null instead of falling back to S1 or S2!
    expect(
      pickBestSlugMatch(
        ['kusuriya-no-hitorigoto', 'kusuriya-no-hitorigoto-2nd-season'],
        ['Kusuriya no Hitorigoto 3rd Season', 'The Apothecary Diaries Season 3'],
        3
      )
    ).toBeNull();

    const tioSlugs = parseTioAnimeDirectoryLinks(
      `<a href="/anime/kimetsu-no-yaiba-yuukakuhen">KNY YK</a><a href="/anime/kimetsu-no-yaiba">KNY</a><a href="/anime/kimetsu-no-yaiba-movie-1">Movie</a>`
    );
    expect(tioSlugs).toEqual(['kimetsu-no-yaiba-yuukakuhen', 'kimetsu-no-yaiba', 'kimetsu-no-yaiba-movie-1']);
    expect(pickBestSlugMatch(tioSlugs, ['Kimetsu no Yaiba', 'Demon Slayer: Kimetsu no Yaiba'], 1)).toBe(
      'kimetsu-no-yaiba'
    );

    const tvSlugs = parseTvAnimeDirectoryLinks(
      `<a href="https://tvanime.tv/anime/bleach-sennen-kessen-hen">Sennen</a><a href="https://tvanime.tv/anime/bleach">Bleach</a>`
    );
    expect(tvSlugs).toEqual(['bleach-sennen-kessen-hen', 'bleach']);
    expect(pickBestSlugMatch(tvSlugs, ['Bleach'], 1)).toBe('bleach');
  });

  it('parses AnimeAV1 embeds & downloads (converting Mega file->embed) and prioritizes MP4Upload & Mega', () => {
    const html = `
      <script>
      const data = {embeds:{DUB:[{server:"HLS",url:"https://player.zilla-networks.com/play/abc"},{server:"MP4Upload",url:"https://www.mp4upload.com/embed-123.html"}],SUB:[{server:"Voe",url:"https://voe.sx/e/xyz"},{server:"UPNShare",url:"https://animeav1.uns.bio/#999"},{server:"MP4Upload",url:"https://www.mp4upload.com/embed-sub.html"}]},downloads:{SUB:[{server:"Mega",url:"https://mega.nz/file/3y4XHZaI#key123"}],DUB:[{server:"Mega",url:"https://mega.nz/file/XjohjYQC#key456"}]}};
      </script>
    `;
    const parsed = parseAnimeAv1EpisodeEmbeds(html);
    expect(parsed.filter((s) => s.language === 'LATINO').map((s) => s.serverName)).toEqual(['HLS', 'MP4Upload', 'Mega']);
    expect(parsed.filter((s) => s.language === 'SUB').map((s) => s.serverName)).toEqual(['MP4Upload', 'Mega']);
    const rankedSub = rankAndDeduplicateSources(parsed, 'SUB');
    expect(rankedSub[0].serverName).toBe('MP4Upload');
    expect(rankedSub[1].serverName).toBe('Mega');
    expect(rankedSub[1].url).toBe('https://mega.nz/embed/3y4XHZaI#key123');
  });

  it('parses TVAnime SUB & DUB players while filtering unsafe/sandbox-breaking hosts', () => {
    const tvHtml = `
      <button class="watch-server active" data-server-url="https://mega.nz/embed/abc#123" data-server-name="Mega" data-server-language="SUB">Mega</button>
      <button class="watch-server" data-server-url="https://www.mp4upload.com/embed-999.html" data-server-name="MP4Upload" data-server-language="DUB">MP4Upload</button>
      <button class="watch-server" data-server-url="https://animeav1.uns.bio/#blocked" data-server-name="UPNShare" data-server-language="SUB">UPNShare</button>
      <button class="watch-server" data-server-url="https://voe.sx/e/blocked" data-server-name="Voe" data-server-language="SUB">Voe</button>
    `;
    const parsed = parseTvAnimeEpisodePlayers(tvHtml);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].providerName).toBe('TVAnime (Mega)');
    expect(parsed[0].language).toBe('SUB');
    expect(parsed[1].providerName).toBe('TVAnime (MP4Upload)');
    expect(parsed[1].language).toBe('LATINO');
  });

  it('filters out unsafe/dead/sandbox-hostile hosts across all providers', () => {
    expect(isBlockedOrUnsafeStreamHost('https://embedsb.com/e/pex1k9.html', 'StreamSB')).toBe(true);
    expect(isBlockedOrUnsafeStreamHost('https://hqq.tv/e/abc', 'Netu')).toBe(true);
    expect(isBlockedOrUnsafeStreamHost('https://1fichier.com/?abc', '1Fichier')).toBe(true);
    expect(isBlockedOrUnsafeStreamHost('https://v.tioanime.com/embed.php?s=amus&v=123', 'Amus')).toBe(true);
    expect(isBlockedOrUnsafeStreamHost('https://animeav1.uns.bio/#hk13mv', 'UPNShare')).toBe(true);
    expect(isBlockedOrUnsafeStreamHost('https://voe.sx/e/xyz', 'Voe')).toBe(true);
    expect(isBlockedOrUnsafeStreamHost('https://www.yourupload.com/embed/54oMN0', 'YourUpload')).toBe(false);
    expect(isBlockedOrUnsafeStreamHost('https://mega.nz/embed/3y4XHZaI#key123', 'Mega')).toBe(false);

    const tioHtml = `<script>var videos = [["StreamSB","https:\\/\\/embedsb.com\\/e\\/bad.html",0,0],["Amus","https:\\/\\/v.tioanime.com\\/embed.php?s=amus&v=1",0,0],["YourUpload","https:\\/\\/www.yourupload.com\\/embed\\/54oMN0",0,0],["Okru","https:\\/\\/ok.ru\\/videoembed\\/123",0,0]];</script>`;
    const tio = parseTioAnimeEpisodeVideos(tioHtml, 'SUB');
    expect(tio).toHaveLength(2);
    expect(tio.map((s) => s.serverName)).toEqual(['YourUpload', 'Okru']);

    const b64Mp4 = Buffer.from('https://www.mp4upload.com/embed-abc.html').toString('base64');
    const b64Bad = Buffer.from('https://embedsb.com/e/bad.html').toString('base64');
    const mcHtml = `
      <button data-player="${b64Bad}">streamsb</button>
      <button data-player="${b64Mp4}">mp4upload</button>
    `;
    const mc = parseMonosChinosEpisodePlayers(mcHtml, 'SUB');
    expect(mc).toHaveLength(1);
    expect(mc[0].url).toBe('https://www.mp4upload.com/embed-abc.html');
  });

  it('extracts direct MP4Upload, YourUpload, and Dean Edwards packed StreamWish M3U8 URLs', () => {
    const mp4Html = `<script>player.src({type:"video/mp4",src:"https://s1.mp4upload.com:282/d/xyz/video.mp4"});</script>`;
    expect(parseMp4UploadDirectUrl(mp4Html)).toBe('https://s1.mp4upload.com:282/d/xyz/video.mp4');

    const yuHtml = `<script>jwplayer().setup({file: 'https://vidcache.net:8161/abc123/video.mp4'});</script>`;
    expect(parseYourUploadDirectUrl(yuHtml)).toBe('https://vidcache.net:8161/abc123/video.mp4');

    const packedWish = `<script>eval(function(p,a,c,k,e,d){return p}('0("1",{2:"3://4.5/6/7.8"});',9,9,'jwplayer|player|file|https|cdn|flaswish|hls|master|m3u8'.split('|'),0,{}))</script>`;
    expect(unpackDeanEdwards(packedWish)).toContain('https://cdn.flaswish/hls/master.m3u8');
    expect(parseStreamWishDirectUrl(packedWish)).toBe('https://cdn.flaswish/hls/master.m3u8');

    const sources = [
      {
        providerId: 'tioanime',
        providerName: 'TíoAnime (YourUpload)',
        serverName: 'YourUpload',
        url: 'https://www.yourupload.com/embed/1',
        language: 'SUB' as const,
        quality: '1080p',
        type: 'embed' as const,
        direct: false,
        score: 118
      },
      {
        providerId: 'tvanime',
        providerName: 'TVAnime (Mega)',
        serverName: 'Mega',
        url: 'https://mega.nz/embed/abc#1',
        language: 'LATINO' as const,
        quality: '1080p',
        type: 'embed' as const,
        direct: false,
        score: 120
      }
    ];

    const latRanked = rankAndDeduplicateSources(sources, 'LATINO');
    expect(latRanked[0].language).toBe('LATINO');

    const subWithFailed = rankAndDeduplicateSources(sources, 'SUB', new Set(['https://www.yourupload.com/embed/1']));
    expect(subWithFailed[0].url).toBe('https://mega.nz/embed/abc#1');
    expect(subWithFailed[1].status).toBe('FAILED');
  });

  it('formats airing countdown and extracts AniZip episode metadata cleanly', () => {
    expect(formatAiringCountdown(2 * 86400 + 5 * 3600, 7)).toBe('Ep 7 en 2d 5h');
    expect(formatAiringCountdown(3 * 3600 + 25 * 60, 12)).toBe('Ep 12 en 3h 25m');

    const map = extractEpisodeDetailsMap({
      episodes: {
        '1': { title: { en: 'Maomao', es: 'Maomao' }, image: 'https://img.example/1.jpg', overview: 'Intro' },
        '2': { title: { en: 'Chilly Pharmacist' } }
      }
    });
    expect(map[1].title).toBe('Maomao');
    expect(map[1].thumbnail).toBe('https://img.example/1.jpg');
    expect(map[2].title).toBe('Chilly Pharmacist');
  });

  it('parses JKAnime.one/HenaoJara portal search cards, hex opt servers, downloads, and merges mirror providers', () => {
    const searchHtml = `
      <nav><a href="./anime/one-piece">One Piece</a></nav>
      <article class="li"><a href="./anime/jujutsu-kaisen-2nd-season">S2</a></article>
      <article class="li"><a href="./anime/jujutsu-kaisen-tv">JJK TV</a></article>
    `;
    const portalSlugs = parseAnimePortalSearchSlugs(searchHtml);
    expect(portalSlugs).toEqual(['jujutsu-kaisen-2nd-season', 'jujutsu-kaisen-tv']);
    expect(pickBestSlugMatch(portalSlugs, ['Jujutsu Kaisen'], 1)).toBe('jujutsu-kaisen-tv');

    const epHtml = `<ul class="opt" data-encrypt="323731392d31"></ul><div class="dwn" data-dwn="https://voe.sx/fwf4vodksr8z,https://www.mp4upload.com/hfapvdkqe1ak"></div>`;
    const epData = parseAnimePortalEpisodeData(epHtml);
    expect(epData.encryptId).toBe('323731392d31');
    expect(epData.downloadUrls).toEqual(['https://voe.sx/fwf4vodksr8z', 'https://www.mp4upload.com/hfapvdkqe1ak']);

    const hexMp4 = Buffer.from('https://mp4upload.com/embed-eoofxeleyj20.html').toString('hex');
    const hexNetu = Buffer.from('https://hqq.ac/e/152FR3PIJaJk').toString('hex');
    const hexWish = Buffer.from('https://streamwish.to/e/z3ksy08vx1gu').toString('hex');
    const optHtml = `
      <li encrypt="${hexNetu}" title="Opción Netu"><span>Netu</span></li>
      <li encrypt="${hexWish}" title="Opción Streamwish 1"><span>Streamwish 1</span></li>
      <li encrypt="${hexMp4}" title="Opción Mp4upload 1"><span>Mp4upload 1</span></li>
    `;
    const optSources = parseHexOptServerList(optHtml, 'jkanime', 'JKAnime', 'SUB');
    expect(optSources).toHaveLength(2);
    expect(optSources[0].providerName).toBe('JKAnime (StreamWish)');
    expect(optSources[1].providerName).toBe('JKAnime (MP4Upload)');

    const dlSources = parsePortalDownloadUrls(epData.downloadUrls, 'henaojara', 'HenaoJara', 'SUB');
    expect(dlSources).toHaveLength(1);
    expect(dlSources[0].url).toBe('https://www.mp4upload.com/embed-hfapvdkqe1ak.html');

    const merged = rankAndDeduplicateSources(
      [
        {
          providerId: 'animeav1',
          providerName: 'AnimeAV1 (Mega)',
          serverName: 'Mega',
          url: 'https://mega.nz/embed/umAGSTqD#abc',
          language: 'SUB',
          quality: '1080p',
          type: 'embed',
          direct: false,
          score: 126
        },
        {
          providerId: 'tvanime',
          providerName: 'TVAnime (Mega)',
          serverName: 'Mega',
          url: 'https://mega.nz/embed/umAGSTqD#abc',
          language: 'SUB',
          quality: '1080p',
          type: 'embed',
          direct: false,
          score: 124
        }
      ],
      'SUB'
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].providerName).toBe('AnimeAV1+TVAnime (Mega)');
  });

  it('handles 2000–2026 edge-case titles (diacritics, semicolons, colons, parentheticals, sequel suffixes, and gaiden)', () => {
    // 2001 Grappler Baki (TV) -> strips (TV)
    expect(buildAnimeSearchQueries('Grappler Baki (TV)', 'Baki the Grappler', 'Grappler Baki (TV)')).toEqual([
      'Grappler Baki',
      'Baki the Grappler'
    ]);

    // 2005 Koukyoushihen Eureka Seven -> includes English title "Eureka Seven"
    expect(buildAnimeSearchQueries('Koukyoushihen Eureka Seven', 'Eureka Seven', 'Koukyoushihen Eureka Seven')).toEqual([
      'Koukyoushihen Eureka Seven',
      'Eureka Seven'
    ]);

    // 2007 DARKER THAN BLACK: Kuro no Keiyakusha -> includes prefix before colon & avoids Gaiden OVA
    const dtbQueries = buildAnimeSearchQueries(
      'DARKER THAN BLACK: Kuro no Keiyakusha',
      'Darker than Black',
      'DARKER THAN BLACK: Kuro no Keiyakusha'
    );
    expect(dtbQueries).toEqual([
      'DARKER THAN BLACK: Kuro no Keiyakusha',
      'DARKER THAN BLACK'
    ]);
    expect(
      pickBestSlugMatch(
        ['darker-than-black-kuro-no-keiyakusha-gaiden'],
        ['DARKER THAN BLACK: Kuro no Keiyakusha', 'Darker than Black'],
        1
      )
    ).toBeNull();
    expect(
      pickBestSlugMatch(
        ['darker-than-black-kuro-no-keiyakusha-gaiden', 'darker-than-black'],
        ['DARKER THAN BLACK: Kuro no Keiyakusha', 'Darker than Black'],
        1
      )
    ).toBe('darker-than-black');

    // 2000 Gensou Maden Saiyuuki -> rejects unrelated anime starting with non-target words ("iyashite-agerun-...")
    expect(
      pickBestSlugMatch(
        ['iyashite-agerun-saiyuuki-karma-saiyuki'],
        ['Gensou Maden Saiyuuki', 'Saiyuki'],
        1
      )
    ).toBeNull();

    // 2008 ChäoS;HEAd -> normalizes umlaut + semicolon & matches compound "chaoshead" over unrelated "chaos-dragon-sekiryuu-seneki"
    const chaosQueries = buildAnimeSearchQueries('ChäoS;HEAd', 'ChäoS;HEAd', 'ChäoS;HEAd');
    expect(chaosQueries).toEqual(['ChaoS HEAd', 'ChaoS;HEAd']);
    expect(
      pickBestSlugMatch(
        ['chaos-dragon-sekiryuu-seneki', 'chaoschild', 'chaoshead'],
        ['ChäoS;HEAd'],
        1
      )
    ).toBe('chaoshead');

    // 2016 Sakamoto desu ga? & 2023 [Oshi no Ko] -> strips ? and brackets
    expect(extractBestSearchQuery('Sakamoto desu ga?', '', '')).toBe('Sakamoto desu ga');
    expect(extractBestSearchQuery('[Oshi no Ko]', 'OSHI NO KO', '')).toBe('Oshi no Ko');

    // 2018 Isekai Maou -> prefers exact Season 1 slug over trailing 1-letter Omega sequel (-o / -w)
    expect(
      pickBestSlugMatch(
        [
          'isekai-maou-to-shoukan-shoujo-no-dorei-majutsu-o',
          'isekai-maou-to-shoukan-shoujo-no-dorei-majutsu-w',
          'isekai-maou-to-shoukan-shoujo-no-dorei-majutsu'
        ],
        ['Isekai Maou to Shoukan Shoujo no Dorei Majutsu'],
        1
      )
    ).toBe('isekai-maou-to-shoukan-shoujo-no-dorei-majutsu');

    // 2025 Dandadan 2nd Season -> does not return Season 1 ("dandadan") when requesting Season 2 and only S1 exists
    expect(pickBestSlugMatch(['dandadan'], ['Dandadan 2nd Season', 'DAN DA DAN Season 2'], 2)).toBeNull();

    // Blue Box (Ao no Hako) Season 1 vs Season 2 disambiguation
    const bbS1Candidates = generateAnimeSlugCandidates('Ao no Hako', 'Blue Box', 'Blue Box', 1);
    expect(bbS1Candidates[0]).toBe('ao-no-hako');
    expect(bbS1Candidates).toContain('blue-box');
    expect(bbS1Candidates).not.toContain('ao-no-hako-2nd-season');

    const bbS2Candidates = generateAnimeSlugCandidates('Ao no Hako Season 2', 'Blue Box Season 2', 'Blue Box Season 2', 2);
    expect(bbS2Candidates).toContain('ao-no-hako-season-2');
    expect(bbS2Candidates).toContain('ao-no-hako-2nd-season');

    expect(
      pickBestSlugMatch(['ao-no-hako', 'ao-no-hako-2nd-season'], ['Ao no Hako', 'Blue Box'], 1)
    ).toBe('ao-no-hako');
    expect(
      pickBestSlugMatch(['ao-no-hako', 'ao-no-hako-2nd-season'], ['Ao no Hako Season 2', 'Blue Box Season 2'], 2)
    ).toBe('ao-no-hako-2nd-season');

    // Additional complex punctuation & symbol anime search tests
    expect(buildAnimeSearchQueries('Steins;Gate', 'Steins;Gate', 'Steins;Gate')).toEqual([
      'Steins Gate',
      'Steins;Gate'
    ]);
    expect(pickBestSlugMatch(['steinsgate-0', 'steinsgate'], ['Steins;Gate'], 1)).toBe('steinsgate');

    const reZeroQueries = buildAnimeSearchQueries(
      'Re:Zero kara Hajimeru Isekai Seikatsu',
      'Re:ZERO -Starting Life in Another World-',
      'Re:Zero'
    );
    expect(reZeroQueries[0]).toBe('Re:Zero kara Hajimeru Isekai Seikatsu');
    expect(
      pickBestSlugMatch(
        ['rezero-kara-hajimeru-isekai-seikatsu-2nd-season', 'rezero-kara-hajimeru-isekai-seikatsu'],
        ['Re:Zero kara Hajimeru Isekai Seikatsu'],
        1
      )
    ).toBe('rezero-kara-hajimeru-isekai-seikatsu');
  });

  it('never matches unrelated partial-coincidence slugs like hagane-orchestra for Fullmetal Alchemist: Brotherhood', () => {
    const fmabTargets = [
      'Fullmetal Alchemist: Brotherhood',
      'Hagane no Renkinjutsushi: FULLMETAL ALCHEMIST'
    ];

    // Query 1 on AnimeAV1 (Romaji) only returns unrelated Hagane titles — MUST return null so provider tries English query!
    expect(
      pickBestSlugMatch(
        [
          'aoki-hagane-no-arpeggio-ars-nova-movie-2-cadenza',
          'aoki-hagane-no-arpeggio-ars-nova',
          'hagane-orchestra'
        ],
        fmabTargets,
        1
      )
    ).toBeNull();

    // Query 2 (English) returns real FMAB alongside specials, 2003 FMA, and Full Metal Panic — MUST pick FMAB!
    expect(
      pickBestSlugMatch(
        [
          'fullmetal-alchemist',
          'fullmetal-alchemist-brotherhood-specials',
          'fullmetal-alchemist-brotherhood-4-koma-gekijou',
          'fullmetal-alchemist-brotherhood',
          'full-metal-panic'
        ],
        fmabTargets,
        1
      )
    ).toBe('fullmetal-alchemist-brotherhood');

    // Primary English slug must appear in the first 3 candidates so slice(0, 3) fallback portals find it
    const fmabSlugs = generateAnimeSlugCandidates(
      'Hagane no Renkinjutsushi: FULLMETAL ALCHEMIST',
      'Fullmetal Alchemist: Brotherhood',
      'Fullmetal Alchemist: Brotherhood',
      1
    );
    expect(fmabSlugs.slice(0, 3)).toContain('fullmetal-alchemist-brotherhood');

    // Other classic stopword / single-word collisions must also return null
    expect(pickBestSlugMatch(['shingeki-no-bahamut'], ['Shingeki no Kyojin', 'Attack on Titan'], 1)).toBeNull();
    expect(pickBestSlugMatch(['monster-musume-no-iru-nichijou'], ['Monster'], 1)).toBeNull();
    expect(pickBestSlugMatch(['bleach-sennen-kessen-hen'], ['Bleach'], 1)).toBeNull();
  });
});

