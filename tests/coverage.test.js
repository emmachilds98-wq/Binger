// Coverage: finding any film or show (search, the first-run grid, a service's
// own shows) and the deck's wider, newer pulls (docs/COVERAGE-PLAN.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serviceFromQuery, TMDB_NETWORKS, COMMON_SERVICES } from '../js/sources/services.js';
import { createTmdb, fromTmdbList, fromTmdbPersonHit } from '../js/sources/tmdb.js';
import { createAniList } from '../js/sources/anilist.js';
import { gatherCandidates, originalsPull, turnPage, pickSeeds } from '../js/sources/candidates.js';
import { normaliseName, matchTier, rankSearch, searchTitles, starterTitles, serviceTitles, interleave, splitYear, matchingPeople } from '../js/sources/lookups.js';
import { buildProfile, explain } from '../js/engine/index.js';
import { fromAniList } from '../js/sources/anilist.js';
import * as L from '../js/state/library.js';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const NOW = Date.parse('2026-10-31T12:00:00Z');

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

// TMDB list entries, as /discover, /search and /trending return them.
const show = (id, name, extra = {}) => ({ id, name, first_air_date: '2024-03-01', genre_ids: [18], original_language: 'en', poster_path: `/${id}.jpg`, vote_average: 8, vote_count: 300, popularity: 50, ...extra });
const film = (id, title, extra = {}) => ({ id, title, release_date: '2024-03-01', genre_ids: [18], original_language: 'en', poster_path: `/${id}.jpg`, vote_average: 7.5, vote_count: 900, popularity: 40, ...extra });
const param = (url, name) => new URL(url).searchParams.get(name);

test('a service typed into search is recognised, however it is written', () => {
  assert.equal(serviceFromQuery('apple tv'), 'Apple TV+');
  assert.equal(serviceFromQuery('Apple TV+'), 'Apple TV+');
  assert.equal(serviceFromQuery('apple tv plus'), 'Apple TV+');
  assert.equal(serviceFromQuery('Apple'), 'Apple TV+');
  assert.equal(serviceFromQuery('netflix originals'), 'Netflix');
  assert.equal(serviceFromQuery('on Disney+'), 'Disney+');
  assert.equal(serviceFromQuery('iplayer'), 'BBC iPlayer');
  assert.equal(serviceFromQuery('HBO'), 'Max');
  assert.equal(serviceFromQuery('severance'), null);
  assert.equal(serviceFromQuery('the bear'), null);
  assert.equal(serviceFromQuery('a'), null);
  for (const s of Object.keys(TMDB_NETWORKS)) assert.ok(COMMON_SERVICES.includes(s), `${s} can be picked in Settings`);
});

test('names compare without accents, punctuation or a leading "The"', () => {
  assert.equal(normaliseName('Pokémon: The Movie!'), 'pokemon the movie');
  assert.equal(normaliseName('Law & Order'), 'law and order');
  assert.equal(matchTier({ title: 'Severance' }, 'severance'), 0);
  assert.equal(matchTier({ title: 'The Studio' }, 'studio'), 0);
  assert.equal(matchTier({ title: 'Slow Horses' }, 'slow ho'), 1);
  assert.equal(matchTier({ title: 'Ted Lasso' }, 'lasso ted'), 2);
  assert.equal(matchTier({ title: 'Untitled', originalTitle: 'Shingeki no Kyojin' }, 'shingeki'), 1, 'the original title counts too');
  assert.equal(matchTier({ title: 'Something Else' }, 'severance'), 3);
});

test('search results: best match first, then each source in turn, posterless last', () => {
  const tmdbList = [
    { id: 't1', title: 'Severance Pay', poster: 'p' },
    { id: 't2', title: 'Severance', poster: 'p' },
    { id: 't3', title: 'Severance', poster: null },
  ];
  const anime = [{ id: 'a1', title: 'Sever', poster: 'p' }, { id: 'a2', title: 'Bleach', poster: 'p' }];
  const ids = rankSearch('severance', [tmdbList, anime]).map((t) => t.id);
  assert.deepEqual(ids, ['t2', 't3', 't1', 'a1', 'a2']);
  assert.deepEqual(interleave([[{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 3 }]]).map((t) => t.id), [1, 2, 3]);
});

test('TMDB search asks for films and series separately, not /search/multi', async () => {
  const fetchImpl = fakeFetch([
    ['/search/movie', { results: [film(1, 'Dune', { popularity: 90 }), film(129, 'Spirited Away', { genre_ids: [16], original_language: 'ja' })] }],
    ['/search/tv', { results: [show(2, 'Dune: Prophecy', { popularity: 120 })] }],
  ]);
  const found = await createTmdb({ key: 'k', fetchImpl }).search('dune');
  assert.deepEqual(found.map((t) => t.id), ['tmdb:tv:2', 'tmdb:movie:1'], 'most popular first; Japanese animation is AniList’s');
  assert.ok(!fetchImpl.calls.some((c) => c.url.includes('/search/multi')));
  const halfDown = fakeFetch([['/search/tv', { results: [show(2, 'Dune: Prophecy')] }]]);
  assert.deepEqual((await createTmdb({ key: 'k', fetchImpl: halfDown }).search('dune')).map((t) => t.title), ['Dune: Prophecy'], 'films failing still finds series');
  await assert.rejects(createTmdb({ key: 'k', fetchImpl: fakeFetch([]) }).search('dune'));
});

test('TV for the deck leaves out news, talk shows and soaps; networks ask for a service’s own shows', async () => {
  const fetchImpl = fakeFetch([
    ['/trending/tv/week', { results: [show(1, 'Severance'), show(2, 'The Tonight Show', { genre_ids: [10767] }), show(3, 'EastEnders', { genre_ids: [10766, 18] })] }],
    ['/discover/tv', { results: [show(4, 'Slow Horses')] }],
  ]);
  const tmdb = createTmdb({ key: 'k', fetchImpl });
  assert.deepEqual((await tmdb.trending('tv')).map((t) => t.title), ['Severance']);
  await tmdb.discover('tv', { networkIds: [2552] });
  const url = fetchImpl.calls.find((c) => c.url.includes('/discover/tv')).url;
  assert.equal(param(url, 'with_networks'), '2552');
  assert.deepEqual(param(url, 'without_genres').split(',').map(Number).sort(), [10763, 10766, 10767]);
  await tmdb.trending('tv', 2);
  assert.equal(param(fetchImpl.calls.at(-1).url, 'page'), '2', 'trending reaches a second page');
});

test('searching "apple tv" lists Apple TV+ shows first, then whatever else matches', async () => {
  const fetchImpl = fakeFetch([
    ['with_networks=2552', { results: [show(95396, 'Severance'), show(4, 'Slow Horses')] }],
    ['/watch/providers/', { results: [{ provider_id: 350, provider_name: 'Apple TV', display_priorities: { GB: 3 } }, { provider_id: 2, provider_name: 'Apple TV Store', display_priorities: { GB: 4 } }] }],
    ['with_watch_providers=350', (url) => ({ results: String(url).includes('/discover/movie') ? [film(5, 'Wolfs')] : [show(95396, 'Severance')] })],
    ['/search/movie', { results: [film(6, 'Apple Tree Yard')] }],
    ['/search/tv', { results: [] }],
    ['graphql.anilist.co', { data: { Page: { media: [] } } }],
  ]);
  const { titles, errors, service } = await searchTitles('apple tv', { tmdb: createTmdb({ key: 'k', fetchImpl }), anilist: createAniList({ fetchImpl }) });
  assert.deepEqual(errors, []);
  assert.equal(service, 'Apple TV+');
  assert.deepEqual(titles.map((t) => t.title), ['Severance', 'Wolfs', 'Slow Horses', 'Apple Tree Yard']);
  assert.ok(!fetchImpl.calls.some((c) => /with_watch_providers=[^&]*\b2\b/.test(decodeURIComponent(c.url))), 'the Apple TV Store (rent and buy) isn’t Apple TV+');
});

test('searchTitles without a key searches anime only; a failing source is reported, not fatal', async () => {
  const anime = fx('anilist-deck.json').data.trending.media.slice(0, 2);
  const ok = fakeFetch([['graphql.anilist.co', { data: { Page: { media: anime } } }]]);
  const plain = await searchTitles('frieren', { tmdb: createTmdb({ key: '', fetchImpl: ok }), anilist: createAniList({ fetchImpl: ok }) });
  assert.deepEqual(plain.errors, []);
  assert.equal(plain.service, null);
  assert.ok(plain.titles.length > 0 && plain.titles.every((t) => t.kind === 'anime'));
  const broken = await searchTitles('frieren', { tmdb: createTmdb({ key: 'k', fetchImpl: ok }), anilist: createAniList({ fetchImpl: ok }) });
  assert.equal(broken.errors.length, 1, 'TMDB 404s');
  assert.ok(broken.titles.length > 0, 'anime still found');
  assert.deepEqual(await serviceTitles('Apple TV+', { tmdb: createTmdb({ key: '' }) }), []);
});

test('the first-run grid mixes this week, all-time favourites, recent hits, every service’s shows and anime', async () => {
  const anime = fx('anilist-deck.json').data.trending.media.slice(0, 3);
  const fetchImpl = fakeFetch([
    ['/trending/movie/week', { results: [film(1, 'This Week Film')] }],
    ['/trending/tv/week', { results: [show(2, 'This Week Show')] }],
    ['primary_release_date.gte', { results: [film(3, 'Oppenheimer'), film(1, 'This Week Film')] }],
    ['first_air_date.gte', { results: [show(4, 'Shrinking')] }],
    ['with_networks=', (url) => ({ results: [show(10000 + Number(param(url, 'with_networks').split('|')[0]), `Original from network ${param(url, 'with_networks')}`)] })],
    ['/discover/movie', { results: [film(5, 'Inception')] }],
    ['/discover/tv', { results: [show(6, 'Breaking Bad')] }],
    ['graphql.anilist.co', { data: { Page: { media: anime } } }],
  ]);
  const tmdb = createTmdb({ key: 'k', fetchImpl });
  const anilist = createAniList({ fetchImpl });
  const grid = await starterTitles({ tmdb, anilist, now: NOW });
  const names = grid.map((t) => t.title);
  for (const n of ['This Week Film', 'This Week Show', 'Inception', 'Breaking Bad', 'Oppenheimer', 'Shrinking']) assert.ok(names.includes(n), n);
  assert.equal(new Set(grid.map((t) => t.id)).size, grid.length, 'no repeats');
  const original = (t) => /^Original from network/.test(t.title);
  assert.deepEqual(grid.slice(0, 6).map((t) => (original(t) ? 'service' : t.kind)), ['film', 'service', 'tv', 'service', 'anime', 'service'], 'films, TV, anime and the services take turns');
  assert.equal(grid.filter(original).length, Object.keys(TMDB_NETWORKS).length, 'every service’s shows are in the grid');
  assert.ok(grid.slice(0, 24).filter(original).length >= 9, 'most of them in the first screenfuls');
  const recent = fetchImpl.calls.find((c) => c.url.includes('primary_release_date.gte')).url;
  assert.equal(param(recent, 'primary_release_date.gte'), '2023-11-01', 'recent: the last three years');
  assert.equal(param(recent, 'sort_by'), 'vote_count.desc');

  fetchImpl.calls.length = 0;
  await starterTitles({ tmdb, anilist, page: 2, now: NOW });
  const tmdbCalls = fetchImpl.calls.filter((c) => c.url.includes('themoviedb'));
  assert.ok(tmdbCalls.length === 6 + Object.keys(TMDB_NETWORKS).length && tmdbCalls.every((c) => param(c.url, 'page') === '2'), '"Show more" asks every list for its next page');
  assert.equal(JSON.parse(fetchImpl.calls.find((c) => c.url.includes('anilist')).init.body).variables.page, 2);

  await assert.rejects(starterTitles({ tmdb: createTmdb({ key: '' }), anilist: createAniList({ fetchImpl: fakeFetch([]) }) }), /Nothing loaded/);
});

test('an originals pull is one service’s own series: yours first, any otherwise', () => {
  const mine = originalsPull(['Apple TV+', 'Crunchyroll'], () => 0);
  assert.equal(mine.service, 'Apple TV+');
  assert.equal(mine.label, 'An Apple TV+ original');
  assert.deepEqual(mine.params.networkIds, [2552]);
  const any = originalsPull([], () => 0.999);
  assert.ok(Object.keys(TMDB_NETWORKS).includes(any.service));
  assert.equal(originalsPull(['Netflix'], () => 0).label, 'A Netflix original');
  assert.equal(originalsPull(['BBC iPlayer'], () => 0).label, 'A BBC original');
  assert.equal(originalsPull(['Max'], () => 0).label, 'An HBO original');
});

test('gatherCandidates reaches further: trending top 40, the last two years, a streamer’s originals', async () => {
  const fetchImpl = fakeFetch([
    ['graphql.anilist.co', fx('anilist-deck.json')],
    ['with_networks=2552', { results: [show(95396, 'Severance')] }],
    ['/discover/', { results: [] }],
    ['/trending/', { results: [] }],
    ['/popular', { results: [] }],
    ['/recommendations', { results: [] }],
  ]);
  const { pool, errors } = await gatherCandidates({
    tmdb: createTmdb({ key: 'k', fetchImpl }), anilist: createAniList({ fetchImpl }), items: {},
    profile: buildProfile([], { now: NOW }), settings: { services: ['Apple TV+'] }, now: NOW, rng: () => 0,
  });
  assert.deepEqual(errors.filter((e) => e.status !== 404), []);
  const urls = fetchImpl.calls.map((c) => c.url);
  assert.equal(urls.filter((u) => u.includes('/trending/tv/week')).length, 2, 'two pages of trending TV');
  assert.ok(!urls.some((u) => u.includes('/tv/popular')), 'TMDB’s "popular TV" (talk shows, soaps) isn’t asked');
  const recent = urls.find((u) => u.includes('/discover/tv') && u.includes('first_air_date.gte'));
  assert.equal(param(recent, 'first_air_date.gte'), '2024-10-31', 'the last two years of series');
  assert.equal(param(recent, 'vote_count.gte'), '30', 'a lower vote floor for series');
  const severance = pool.find((t) => t.id === 'tmdb:tv:95396');
  assert.ok(severance, 'Apple TV+ originals reach the deck');
  assert.deepEqual(severance.via.find((v) => v.type === 'originals'), { type: 'originals', label: 'An Apple TV+ original', service: 'Apple TV+' });
  const reasons = explain(severance, { contributions: [], quality: 0.5 }, buildProfile([], { now: NOW }), { now: NOW });
  assert.ok(reasons.some((r) => r.text === 'An Apple TV+ original'), 'and the card says so');
});

test('a TV genre pull accepts newer shows with fewer ratings', async () => {
  const fetchImpl = fakeFetch([['graphql.anilist.co', fx('anilist-deck.json')], ['/discover/', { results: [] }], ['/trending/', { results: [] }], ['/popular', { results: [] }]]);
  const loved = fromTmdbList(film(9, 'A Drama I Loved'), 'movie');
  const items = { [loved.id]: { id: loved.id, title: loved, status: 'watched', updatedAt: '2026-10-01', watches: [{ id: 'w', date: '2026-10-01', rating: 5 }] } };
  await gatherCandidates({ tmdb: createTmdb({ key: 'k', fetchImpl }), anilist: createAniList({ fetchImpl }), items, profile: buildProfile(items, { now: NOW }), settings: {}, now: NOW, rng: () => 0 });
  const genreTv = fetchImpl.calls.map((c) => c.url).find((u) => u.includes('/discover/tv') && u.includes('with_genres'));
  assert.equal(param(genreTv, 'vote_count.gte'), '50');
});

// ---- Step 2: people and years in search, "more like this", page memory ----

test('a year at the end of a search narrows it; a title with a year in it stays a title', () => {
  assert.deepEqual(splitYear('dune 2021', NOW), { text: 'dune', year: 2021 });
  assert.deepEqual(splitYear('The Office (2005)', NOW), { text: 'The Office', year: 2005 });
  assert.deepEqual(splitYear('blade runner 2049', NOW), { text: 'blade runner 2049', year: null });
  assert.deepEqual(splitYear('1917', NOW), { text: '1917', year: null });
  const dunes = [{ id: 'a', title: 'Dune', year: 1984, poster: 'p' }, { id: 'b', title: 'Dune', year: 2021, poster: 'p' }, { id: 'c', title: 'Dune: Part Two', year: 2024, poster: 'p' }];
  assert.deepEqual(rankSearch(['dune 2021', 'dune'], [dunes], { year: 2021 }).map((t) => t.id), ['b', 'a', 'c']);
});

test('searching "dune 2021" asks TMDB for that year as well, and puts it first', async () => {
  const fetchImpl = fakeFetch([
    ['first_air_date_year=2021', { results: [] }],
    ['year=2021', { results: [film(438631, 'Dune', { release_date: '2021-09-15', popularity: 80 })] }],
    ['/search/movie', (url) => ({ results: param(url, 'query') === 'dune' ? [film(841, 'Dune', { release_date: '1984-12-14', popularity: 30 }), film(438631, 'Dune', { release_date: '2021-09-15', popularity: 80 })] : [] })],
    ['/search/tv', { results: [] }],
    ['/search/person', { results: [] }],
  ]);
  const { titles } = await searchTitles('dune 2021', { tmdb: createTmdb({ key: 'k', fetchImpl }), now: NOW });
  assert.deepEqual(titles.map((t) => `${t.title} ${t.year}`), ['Dune 2021', 'Dune 1984']);
  assert.ok(fetchImpl.calls.some((c) => c.url.includes('/search/movie') && param(c.url, 'year') === '2021'));
});

test('typing someone’s name brings them up (to open their page) and what they’re known for', async () => {
  const person = (id, name, popularity, knownFor) => ({ id, name, popularity, known_for_department: 'Acting', profile_path: `/p${id}.jpg`, known_for: knownFor });
  const fetchImpl = fakeFetch([
    ['/search/person', (url) => ({ results: param(url, 'query') === 'adam scott'
      ? [person(55536, 'Adam Scott', 30, [{ ...show(95396, 'Severance'), media_type: 'tv' }, { ...show(8592, 'Parks and Recreation'), media_type: 'tv' }, { ...film(129, 'Spirited Away', { genre_ids: [16], original_language: 'ja' }), media_type: 'movie' }]),
        person(9999, 'Adam Scott', 2, [{ ...film(5555, 'Man of the West'), media_type: 'movie' }])]
      : [person(1, 'Tom', 0.6, []), person(2, 'Tom Hanks', 60, [])] })],
    ['/search/movie', { results: [film(7, 'Great Scott!', { popularity: 90 })] }],
    ['/search/', { results: [] }],
  ]);
  const tmdb = createTmdb({ key: 'k', fetchImpl });
  const adam = await searchTitles('adam scott', { tmdb });
  assert.deepEqual(adam.people.map((p) => [p.id, p.name, p.known]), [['tmdb:p:55536', 'Adam Scott', 'Actor']], 'a far less known namesake is left out');
  assert.deepEqual(adam.titles.map((t) => t.title), ['Severance', 'Parks and Recreation', 'Great Scott!'], 'his best-known shows first (anime left to AniList), then loose matches');
  assert.deepEqual((await searchTitles('tom', { tmdb })).people, [], 'one word is more likely a title: an obscure "Tom" isn’t shown');
  assert.deepEqual(matchingPeople('zendaya', [{ name: 'Zendaya', popularity: 40 }]).map((p) => p.name), ['Zendaya']);
  assert.deepEqual(matchingPeople('pedro pas', [{ name: 'Pedro Pascal', popularity: 50 }]).map((p) => p.name), ['Pedro Pascal']);
  assert.equal(fromTmdbPersonHit({ id: 9, adult: true }), null);
});

test('"more like this" falls back on similar titles when recommendations are thin', async () => {
  const loved = fromTmdbList(film(999, 'A New Film'), 'movie');
  const items = { [loved.id]: { id: loved.id, title: loved, status: 'watched', updatedAt: '2026-10-01', watches: [{ id: 'w', date: '2026-10-01', rating: 5 }] } };
  const fetchImpl = fakeFetch([
    ['/movie/999/recommendations', { results: [film(1, 'Only One Rec')] }],
    ['/movie/999/similar', { results: [film(2, 'Similar One'), film(3, 'Similar Two')] }],
    ['/discover/', { results: [] }], ['/trending/', { results: [] }], ['/popular', { results: [] }],
  ]);
  const { pool } = await gatherCandidates({ tmdb: createTmdb({ key: 'k', fetchImpl }), anilist: null, items, profile: buildProfile(items, { now: NOW }), settings: {}, now: NOW, rng: () => 0 });
  const seeded = pool.filter((t) => t.via.some((v) => v.type === 'seed' && v.seedTitle === 'A New Film')).map((t) => t.title).sort();
  assert.deepEqual(seeded, ['Only One Rec', 'Similar One', 'Similar Two']);
});

test('a big library asks "more like this" about five titles, not three', () => {
  const lib = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => {
    const t = fromTmdbList(film(1000 + i, `Loved ${i}`), 'movie');
    return [t.id, { id: t.id, title: t, status: 'watched', updatedAt: '2026-10-01', watches: [{ id: `w${i}`, date: '2026-10-01', rating: 5 }] }];
  }));
  assert.equal(pickSeeds(lib(10), { now: NOW, rng: () => 0 }).tmdb.length, 4, '3 + a wildcard');
  assert.equal(pickSeeds(lib(30), { now: NOW, rng: () => 0 }).tmdb.length, 6, '5 + a wildcard');
});

test('with a page memory, each refill turns every list to its next page', async () => {
  assert.equal(turnPage(null, 'x', 3), 3, 'no memory: the page given');
  const mem = {};
  assert.deepEqual([turnPage(mem, 'x', 2), turnPage(mem, 'x', 1), turnPage(mem, 'x', 3)], [2, 3, 4], 'the first page sticks, then it counts on');

  const fetchImpl = fakeFetch([['/discover/', { results: [] }], ['/trending/', { results: [] }], ['/popular', { results: [] }]]);
  const pages = {};
  const refill = async () => {
    fetchImpl.calls.length = 0;
    await gatherCandidates({ tmdb: createTmdb({ key: 'k', fetchImpl }), anilist: null, items: {}, profile: buildProfile([], { now: NOW }), settings: {}, now: NOW, rng: () => 0, pages });
    return fetchImpl.calls.map((c) => c.url);
  };
  const recentPage = (urls) => param(urls.find((u) => u.includes('/discover/movie') && u.includes('primary_release_date.gte') && !u.includes('vote_count.gte=20')), 'page');
  const first = await refill();
  const second = await refill();
  assert.equal(recentPage(first), '1');
  assert.equal(recentPage(second), '2', 'the next refill asks for the next page');
  assert.ok(second.some((u) => u.includes('/movie/popular') && param(u, 'page') === '2'));
});

// ---- First-run picks: they steer the deck, and can be reviewed properly ----

test('first-run picks are saved as loved, listed for review, and leave the list once reviewed', () => {
  const t = fromTmdbList(show(95396, 'Severance'), 'tv');
  let s = L.logWatch(L.emptyState(NOW), t, { rating: 4.5, setup: true }, NOW);
  const [pick] = L.setupPicks(s);
  assert.equal(pick.item.id, 'tmdb:tv:95396');
  assert.equal(pick.watch.rating, 4.5);
  assert.equal(pick.watch.setup, true);
  s = L.updateWatch(s, pick.item.id, pick.watch.id, { rating: 5, tags: ['Gripping'], review: 'Loved it', date: '2024-03-01' }, NOW + 1000);
  assert.deepEqual(L.setupPicks(s), [], 'reviewed: no longer a setup pick');
  const w = s.items['tmdb:tv:95396'].watches[0];
  assert.deepEqual([w.rating, w.review, w.date, 'setup' in w], [5, 'Loved it', '2024-03-01', false]);
  assert.equal(L.logWatch(L.emptyState(NOW), t, { rating: 4 }, NOW).items['tmdb:tv:95396'].watches[0].setup, undefined, 'a normal "Seen it" isn’t a setup pick');
  const synced = L.mergeStates(L.logWatch(L.emptyState(NOW), t, { rating: 4.5, setup: true }, NOW), L.emptyState(NOW), NOW);
  assert.equal(L.setupPicks(synced).length, 1, 'the mark survives sync');
});

test('first-run picks steer the deck: "more like this" is asked about them', async () => {
  const picks = [film(27205, 'Inception'), film(157336, 'Interstellar')].map((r) => fromTmdbList(r, 'movie'));
  const frieren = fromAniList(fx('anilist-frieren.json').data.Media);
  const s = [...picks, frieren].reduce((acc, t) => L.logWatch(acc, t, { rating: 4.5, setup: true }, NOW), L.emptyState(NOW));
  const fetchImpl = fakeFetch([['graphql.anilist.co', fx('anilist-deck.json')], ['/discover/', { results: [] }], ['/trending/', { results: [] }], ['/popular', { results: [] }], ['/recommendations', { results: [film(1, 'A Rec')] }]]);
  const { pool } = await gatherCandidates({ tmdb: createTmdb({ key: 'k', fetchImpl }), anilist: createAniList({ fetchImpl }), items: s.items, profile: buildProfile(s.items, { now: NOW }), settings: {}, now: NOW, rng: () => 0 });
  const asked = fetchImpl.calls.map((c) => c.url).filter((u) => u.includes('/recommendations'));
  assert.ok(asked.some((u) => u.includes('/movie/27205/')) && asked.some((u) => u.includes('/movie/157336/')), 'both films seed recommendations');
  const body = JSON.parse(fetchImpl.calls.find((c) => c.url.includes('anilist')).init.body);
  assert.deepEqual(body.variables.seeds, [frieren.sourceId], 'and the anime pick seeds AniList’s');
  const rec = pool.find((t) => t.title === 'A Rec');
  assert.ok(rec.via.some((v) => v.type === 'seed' && v.seedRating === 4.5), 'cards from them say "Because you loved…"');
});
