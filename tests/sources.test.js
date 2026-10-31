import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromTmdbList, fromTmdbDetail, pickTrailer, authFor, createTmdb, isAnimeLike, posterSrcset } from '../js/sources/tmdb.js';
import { fromAniList, cleanDescription, parseDeckBatch, seasonOf, createAniList } from '../js/sources/anilist.js';
import { canonicalGenres, tmdbGenreNames, canonToAniList } from '../js/sources/genres.js';
import { gatherCandidates, hydrate, pickSeeds, sequelIdsToFetch, widerPull } from '../js/sources/candidates.js';
import { cached } from '../js/sources/http.js';
import { buildProfile } from '../js/engine/index.js';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

test('genres: TMDB TV pairs split, AniList Sci-Fi maps, noise dropped', () => {
  assert.deepEqual(canonicalGenres(['Sci-Fi & Fantasy', 'Drama', 'Talk']), ['Science Fiction', 'Fantasy', 'Drama']);
  assert.deepEqual(canonicalGenres(['Sci-Fi', 'Action']), ['Science Fiction', 'Action']);
  assert.deepEqual(tmdbGenreNames([10759, 18], 'tv'), ['Action', 'Adventure', 'Drama']);
  assert.equal(canonToAniList('Science Fiction'), 'Sci-Fi');
  assert.equal(canonToAniList('Western'), null);
});

test('TMDB auth: v3 key as a query param, v4 token as a Bearer header', () => {
  assert.deepEqual(authFor('0123456789abcdef0123456789abcdef'), { headers: {}, params: { api_key: '0123456789abcdef0123456789abcdef' } });
  assert.equal(authFor('eyJhbGciOi.x.y').headers.Authorization, 'Bearer eyJhbGciOi.x.y');
  assert.equal(authFor('  '), null);
});

test('TMDB list items normalise; adult dropped; Japanese animation flagged for AniList', () => {
  const [dune, spirited, adult, novotes] = fx('tmdb-trending-movie.json').results.map((r) => fromTmdbList(r, 'movie'));
  assert.equal(dune.id, 'tmdb:movie:693134');
  assert.equal(dune.kind, 'film');
  assert.equal(dune.year, 2024);
  assert.deepEqual(dune.genres, ['Science Fiction', 'Adventure']);
  assert.equal(dune.poster, 'https://image.tmdb.org/t/p/w500/p1.jpg');
  assert.equal(dune.detailed, false);
  assert.equal(spirited.animeLike, true);
  assert.equal(adult, null);
  assert.equal(novotes.score, null, 'no votes means no score, not 0');
  assert.equal(novotes.year, null);
  assert.deepEqual(novotes.genres, ['Comedy'], 'TV Movie is not a taste signal');
});

test('TMDB movie detail: cast in billing order, director, trailer, UK certificate, providers', () => {
  const t = fromTmdbDetail(fx('tmdb-movie-detail.json'), 'movie', 'GB');
  assert.deepEqual(t.cast.map((c) => c.name), ['Timothée Chalamet', 'Zendaya', 'Rebecca Ferguson', 'Josh Brolin', 'Austin Butler']);
  assert.equal(t.cast[0].id, 'tmdb:p:1190668');
  assert.equal(t.cast[2].photo, null);
  assert.equal(t.crew[0].name, 'Denis Villeneuve');
  assert.equal(t.crew[0].job, 'Director');
  assert.deepEqual(t.keywords, ['desert planet', 'based on novel or book']);
  assert.deepEqual(t.trailer, { site: 'youtube', key: 'Way9Dexny3w', name: 'Official Trailer 3' });
  assert.equal(t.certification, '12A');
  assert.equal(t.runtime, 167);
  assert.deepEqual(t.studios, ['Legendary Pictures', 'Example Films']);
  assert.equal(t.providers.stream[0].name, 'Example Stream');
  assert.equal(t.providers.rent.length, 1);
  assert.equal(t.detailed, true);
  const us = fromTmdbDetail(fx('tmdb-movie-detail.json'), 'movie', 'US');
  assert.equal(us.certification, 'PG-13');
});

test('TMDB TV detail: creators, aggregate cast roles, seasons, not airing', () => {
  const t = fromTmdbDetail(fx('tmdb-tv-detail.json'), 'tv', 'GB');
  assert.equal(t.kind, 'tv');
  assert.deepEqual(t.genres, ['Drama', 'Mystery', 'Science Fiction', 'Fantasy']);
  assert.deepEqual(t.crew, [{ id: 'tmdb:p:1216630', name: 'Dan Erickson', job: 'Creator' }]);
  assert.equal(t.cast[0].character, 'Mark Scout');
  assert.equal(t.seasons, 2);
  assert.equal(t.airing, false);
  assert.equal(t.lastAirDate, '2025-03-21');
  assert.equal(t.trailer, null);
  assert.equal(t.providers, null);
  assert.equal(t.certification, '15');
  assert.deepEqual(t.networks, ['Apple TV+']);
});

test('pickTrailer prefers official YouTube trailers over teasers and fan cuts', () => {
  assert.equal(pickTrailer([{ site: 'YouTube', key: 'a', type: 'Teaser', official: true }, { site: 'YouTube', key: 'b', type: 'Trailer', official: true }]).key, 'b');
  assert.equal(pickTrailer([]), null);
  assert.equal(isAnimeLike({ genre_ids: [16], origin_country: ['JP'] }), true);
  assert.equal(isAnimeLike({ genre_ids: [16], original_language: 'en' }), false);
});

test('AniList (real response): Frieren normalises with voice cast, director, studio, tags', () => {
  const t = fromAniList(fx('anilist-frieren.json').data.Media);
  assert.equal(t.id, 'anilist:154587');
  assert.equal(t.kind, 'anime');
  assert.equal(t.title, 'Frieren: Beyond Journey’s End');
  assert.equal(t.episodes, 28);
  assert.deepEqual(t.studios, ['MADHOUSE']);
  assert.equal(t.cast[0].name, 'Atsumi Tanezaki');
  assert.equal(t.cast[0].character, 'Frieren');
  assert.ok(t.crew.some((c) => c.job === 'Director'), JSON.stringify(t.crew));
  assert.ok(t.keywords.includes('Travel'));
  assert.ok(!t.keywords.includes('Time Skip'), 'spoiler tags are hidden');
  assert.equal(t.trailer.site, 'youtube');
  assert.ok(t.score > 8);
  assert.ok(!/<br>|Source:/.test(t.overview));
  assert.deepEqual(t.sequelIds.length > 0, true);
});

test('cleanDescription strips HTML, entities and source credits', () => {
  assert.equal(cleanDescription('Hi<br><br>there &amp; <i>you</i>\n(Source: Crunchyroll)'), 'Hi\n\nthere & you');
});

test('seasonOf maps months to AniList seasons', () => {
  assert.deepEqual(seasonOf(new Date('2026-10-18T00:00:00Z')), { season: 'FALL', year: 2026 });
  assert.deepEqual(seasonOf(new Date('2026-02-01T00:00:00Z')), { season: 'WINTER', year: 2026 });
});

test('AniList deck batch (real response) parses every section', () => {
  const b = parseDeckBatch(fx('anilist-deck.json').data);
  assert.equal(b.trending.length, 3);
  assert.equal(b.season.length, 3);
  assert.equal(b.genre.length, 3);
  assert.equal(b.seeds.length, 2);
  assert.ok(b.seeds.every((s) => s.seedId.startsWith('anilist:') && s.titles.length));
  assert.equal(b.sequels[0].prequelIds.includes(154587), true);
});

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [match, body] of routes) {
      if (String(url).includes(match) || (init.body && init.body.includes(match))) {
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => (typeof body === 'function' ? body(url, init) : body) };
      }
    }
    return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({ status_message: 'not found' }) };
  };
  fn.calls = calls;
  return fn;
}

test('createTmdb sends the key and caches responses', async () => {
  const fetchImpl = fakeFetch([['/trending/movie/week', fx('tmdb-trending-movie.json')]]);
  const store = new Map();
  const cache = { get: async (k) => store.get(k), set: async (k, v, ttl) => store.set(k, { value: v, expires: Date.now() + ttl }) };
  const tmdb = createTmdb({ key: '0123456789abcdef0123456789abcdef', fetchImpl, cache });
  const a = await tmdb.trending('movie');
  const b = await tmdb.trending('movie');
  assert.equal(fetchImpl.calls.length, 1, 'second call served from cache');
  assert.ok(fetchImpl.calls[0].url.includes('api_key=0123456789abcdef0123456789abcdef'));
  assert.ok(![...store.keys()].some((k) => k.includes('0123456789abcdef')), 'the key never ends up in cache keys');
  assert.equal(a.length, b.length);
  await assert.rejects(createTmdb({ key: '' }).trending('movie'), /TMDB key/);
});

test('cached() falls back to stale data when the network fails', async () => {
  const cache = { get: async () => ({ value: 'old', expires: 0 }), set: async () => {} };
  assert.equal(await cached(cache, 'k', 1000, async () => { throw new Error('offline'); }), 'old');
});

const NOW = Date.parse('2026-10-18T12:00:00Z');

test('gatherCandidates merges sources, drops TMDB anime, applies the sequel rule', async () => {
  const fetchImpl = fakeFetch([
    ['graphql.anilist.co', fx('anilist-deck.json')],
    ['/trending/', fx('tmdb-trending-movie.json')],
    ['/discover/', { results: [] }],
    ['/popular', { results: [] }],
    ['/recommendations', { results: [] }],
  ]);
  const tmdb = createTmdb({ key: 'k', fetchImpl });
  const anilist = createAniList({ fetchImpl });
  const frieren = fromAniList(fx('anilist-frieren.json').data.Media);
  const items = {
    [frieren.id]: { id: frieren.id, title: frieren, status: 'watched', updatedAt: '2026-10-01', watches: [{ id: 'w1', date: '2026-10-01', rating: 5 }] },
  };
  const profile = buildProfile(items, { now: NOW });
  const { pool, errors } = await gatherCandidates({ tmdb, anilist, items, profile, settings: {}, now: NOW, rng: () => 0 });
  assert.deepEqual(errors, []);
  const ids = pool.map((t) => t.id);
  assert.ok(ids.includes('tmdb:movie:693134'));
  assert.ok(!ids.includes('tmdb:movie:129'), 'Spirited Away via TMDB is dropped (AniList owns anime)');
  assert.ok(!ids.includes(frieren.id), 'already-watched titles never come back');
  const s2 = pool.find((t) => t.title.startsWith('Frieren') && t.id !== frieren.id);
  assert.ok(s2, 'season 2 of a watched show is suggested');
  assert.equal(s2.via[0].type, 'sequel');
  assert.equal(s2.via[0].seedTitle, frieren.title);
  const sequelsOfUnwatched = pool.filter((t) => t.prequelIds && t.prequelIds.length && !t.via.some((v) => v.type === 'sequel'));
  assert.deepEqual(sequelsOfUnwatched, [], 'no "Season 2" of shows you have not seen');
  const dune = pool.find((t) => t.id === 'tmdb:movie:693134');
  assert.equal(dune.via[0].type, 'trending');
  // The seed request asked AniList for recommendations off Frieren.
  const body = JSON.parse(fetchImpl.calls.find((c) => c.url.includes('anilist')).init.body);
  assert.deepEqual(body.variables.seeds, [154587]);
});

test('a "wider" pull reaches past what\'s popular: classics, hidden gems, other countries', () => {
  const seq = (...xs) => () => xs.shift() ?? 0;
  const classic = widerPull('movie', seq(0, 0));
  assert.equal(classic.mode, 'acclaimed');
  assert.equal(classic.params.sortBy, 'vote_average.desc');
  assert.ok(classic.params.minVotes >= 1000, 'only titles enough people have rated');
  const gem = widerPull('tv', seq(0.4, 0));
  assert.equal(gem.mode, 'gems');
  assert.ok(gem.params.maxVotes && gem.params.minScore, 'well rated, by fewer people');
  assert.ok(gem.params.withoutGenreIds.includes(10767), 'no talk shows');
  const korean = widerPull('tv', seq(0.9, 0, 0));
  assert.equal(korean.params.originalLanguage, 'ko');
  assert.equal(korean.label, 'A Korean series, from further afield');
  const japanese = widerPull('movie', seq(0.9, 8 / 12, 0));
  assert.equal(japanese.params.originalLanguage, 'ja');
  assert.ok(japanese.params.withoutGenreIds.includes(16), 'Japanese animation is AniList\'s job');
});

test('gatherCandidates asks TMDB for one wider pull per kind, and marks what it found', async () => {
  const trending = fx('tmdb-trending-movie.json');
  const fetchImpl = fakeFetch([
    ['graphql.anilist.co', fx('anilist-deck.json')],
    ['vote_average.desc', trending],
    ['/discover/', { results: [] }],
    ['/trending/', { results: [] }],
    ['/popular', { results: [] }],
  ]);
  const { pool, errors } = await gatherCandidates({
    tmdb: createTmdb({ key: 'k', fetchImpl }), anilist: createAniList({ fetchImpl }), items: {},
    profile: buildProfile([], { now: NOW }), settings: {}, now: NOW, rng: () => 0,
  });
  assert.deepEqual(errors, []);
  const asked = fetchImpl.calls.map((c) => c.url).filter((u) => u.includes('vote_average.desc'));
  assert.equal(asked.length, 2, 'one for films, one for TV');
  const dune = pool.find((t) => t.id === 'tmdb:movie:693134');
  assert.deepEqual(dune.via.find((v) => v.type === 'wider'), { type: 'wider', label: 'Acclaimed: among TMDB’s best rated' });
});

test('gatherCandidates without a TMDB key still returns anime, and reports nothing as an error', async () => {
  const fetchImpl = fakeFetch([['graphql.anilist.co', fx('anilist-deck.json')]]);
  const { pool, errors } = await gatherCandidates({
    tmdb: createTmdb({ key: '', fetchImpl }), anilist: createAniList({ fetchImpl }), items: {},
    profile: buildProfile([], { now: NOW }), now: NOW, rng: () => 0,
  });
  assert.deepEqual(errors, []);
  assert.ok(pool.length > 0 && pool.every((t) => t.kind === 'anime'));
});

test('gatherCandidates reports a failing source without losing the others', async () => {
  const fetchImpl = fakeFetch([['graphql.anilist.co', fx('anilist-deck.json')]]); // TMDB 404s
  const { pool, errors } = await gatherCandidates({
    tmdb: createTmdb({ key: 'k', fetchImpl }), anilist: createAniList({ fetchImpl }), items: {},
    profile: buildProfile([], { now: NOW }), now: NOW, rng: () => 0,
  });
  assert.ok(pool.length > 0);
  assert.ok(errors.length > 0 && errors.every((e) => e.source === 'tmdb'));
});

test('hydrate fetches TMDB details but keeps the reason a title was picked', async () => {
  const fetchImpl = fakeFetch([['/movie/693134', fx('tmdb-movie-detail.json')]]);
  const tmdb = createTmdb({ key: 'k', fetchImpl });
  const light = { ...fromTmdbList(fx('tmdb-trending-movie.json').results[0], 'movie'), via: [{ type: 'trending' }] };
  const [full] = await hydrate([light], { tmdb });
  assert.equal(full.detailed, true);
  assert.equal(full.cast[0].name, 'Timothée Chalamet');
  assert.deepEqual(full.via, [{ type: 'trending' }]);
});

test('pickSeeds and sequelIdsToFetch read the library', () => {
  const frieren = fromAniList(fx('anilist-frieren.json').data.Media);
  const items = { [frieren.id]: { id: frieren.id, title: frieren, status: 'watched', updatedAt: '2026-10-01', watches: [{ date: '2026-10-01', rating: 4.5 }] } };
  const seeds = pickSeeds(items, { now: NOW, rng: () => 0 });
  assert.equal(seeds.anime[0].item.id, frieren.id);
  assert.deepEqual(seeds.tmdb, []);
  assert.deepEqual(sequelIdsToFetch(items), frieren.sequelIds);
});

test('a TMDB response with no id is refused, not turned into a broken title', async () => {
  assert.equal(fromTmdbList({ results: [] }, 'movie'), null);
  assert.equal(fromTmdbDetail({ results: [] }, 'movie', 'GB'), null);
  const fetchImpl = fakeFetch([['/movie/6', { results: [] }]]);
  const light = { ...fromTmdbList(fx('tmdb-trending-movie.json').results[3], 'movie'), via: [] };
  const [same] = await hydrate([light], { tmdb: createTmdb({ key: 'k', fetchImpl }) });
  assert.equal(same, light, 'hydrate keeps the original when details are unusable');
});

test('posters come in the sizes TMDB serves, for the screen to choose from', () => {
  assert.equal(posterSrcset('https://image.tmdb.org/t/p/w500/abc.jpg'),
    'https://image.tmdb.org/t/p/w342/abc.jpg 342w, https://image.tmdb.org/t/p/w500/abc.jpg 500w, https://image.tmdb.org/t/p/w780/abc.jpg 780w');
  assert.equal(posterSrcset('https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/x.jpg'), null, 'AniList covers come in one size');
  assert.equal(posterSrcset(null), null);
});
