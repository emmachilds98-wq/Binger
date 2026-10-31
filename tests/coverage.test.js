// Coverage: finding any film or show (search, the first-run grid, a service's
// own shows) and the deck's wider, newer pulls (docs/COVERAGE-PLAN.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serviceFromQuery, TMDB_NETWORKS, COMMON_SERVICES } from '../js/sources/services.js';
import { createTmdb, fromTmdbList } from '../js/sources/tmdb.js';
import { createAniList } from '../js/sources/anilist.js';
import { gatherCandidates, originalsPull } from '../js/sources/candidates.js';
import { normaliseName, matchTier, rankSearch, searchTitles, starterTitles, serviceTitles, interleave } from '../js/sources/lookups.js';
import { buildProfile, explain } from '../js/engine/index.js';

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

test('the first-run grid mixes this week, all-time favourites, recent hits and anime', async () => {
  const anime = fx('anilist-deck.json').data.trending.media.slice(0, 3);
  const fetchImpl = fakeFetch([
    ['/trending/movie/week', { results: [film(1, 'This Week Film')] }],
    ['/trending/tv/week', { results: [show(2, 'This Week Show')] }],
    ['primary_release_date.gte', { results: [film(3, 'Oppenheimer'), film(1, 'This Week Film')] }],
    ['first_air_date.gte', { results: [show(4, 'Shrinking')] }],
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
  assert.deepEqual(grid.slice(0, 3).map((t) => t.kind), ['film', 'tv', 'anime'], 'films, TV and anime take turns');
  const recent = fetchImpl.calls.find((c) => c.url.includes('primary_release_date.gte')).url;
  assert.equal(param(recent, 'primary_release_date.gte'), '2023-11-01', 'recent: the last three years');
  assert.equal(param(recent, 'sort_by'), 'vote_count.desc');

  fetchImpl.calls.length = 0;
  await starterTitles({ tmdb, anilist, page: 2, now: NOW });
  const tmdbCalls = fetchImpl.calls.filter((c) => c.url.includes('themoviedb'));
  assert.ok(tmdbCalls.length === 6 && tmdbCalls.every((c) => param(c.url, 'page') === '2'), '"Show more" asks every list for its next page');
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
