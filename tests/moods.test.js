// Moods on Discover and "More like this" on a title's page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOODS, moodOf, matchesMood, moodSeeds, buildDeck, buildProfile, explain, rankSimilar, eligible } from '../js/engine/index.js';
import { TAGS } from '../js/state/library.js';
import { gatherCandidates, moodGenreIds } from '../js/sources/candidates.js';
import { createTmdb, fromTmdbList } from '../js/sources/tmdb.js';
import { createAniList, moodGenres, parseSimilar } from '../js/sources/anilist.js';
import { similarTitles } from '../js/sources/lookups.js';
import { filterSummary } from '../js/ui/filters.js';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-09T12:00:00Z');
const DAY = 86400000;

let n = 0;
function title(over = {}) {
  n += 1;
  return {
    id: over.id || `tmdb:movie:${1000 + n}`, source: 'tmdb', mediaType: 'movie', sourceId: 1000 + n, kind: 'film', title: `Title ${n}`,
    year: 2020, genres: ['Drama'], keywords: [], cast: [], crew: [], studios: [], language: 'en', score: 7, votes: 1000, detailed: true,
    ...over,
  };
}
function watched(t, rating, tags = [], daysAgo = 20) {
  const date = new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);
  return { id: t.id, title: t, status: 'watched', addedAt: date, updatedAt: date, watches: [{ id: `w${t.id}`, date, rating, tags }] };
}
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
const film = (id, name, extra = {}) => ({ id, title: name, release_date: '2023-03-01', genre_ids: [35], original_language: 'en', poster_path: `/${id}.jpg`, vote_average: 7.5, vote_count: 900, popularity: 40, ...extra });

// --- the moods themselves ----------------------------------------------------

test('every mood is named after feelings you can tag in the rate sheet', () => {
  for (const m of MOODS) {
    for (const t of m.tags) assert.ok(TAGS.includes(t), `${m.label}: "${t}" isn't a feeling tag`);
    assert.ok(m.genres.length, `${m.label} has genres`);
    assert.ok(!m.genres.some((g) => m.not.includes(g)), `${m.label} never rules out its own genres`);
  }
  assert.equal(new Set(MOODS.map((m) => m.id)).size, MOODS.length);
  assert.equal(moodOf('nope'), null);
});

test('a title fits a mood by its genres, and some genres rule it out', () => {
  assert.ok(matchesMood(title({ genres: ['Comedy', 'Romance'] }), 'funny'));
  assert.ok(!matchesMood(title({ genres: ['Comedy', 'Horror'] }), 'funny'), 'no horror-comedies when you want a laugh');
  assert.ok(!matchesMood(title({ genres: ['Drama'] }), 'funny'));
  assert.ok(matchesMood(title({ genres: ['Horror'] }), 'scary'));
  assert.ok(matchesMood(title({ genres: ['Drama'] }), null), 'no mood fits everything');
  assert.ok(matchesMood(title({ genres: ['Drama'] }), 'unknown'));
});

test('anime can fit by an AniList theme as well as a genre', () => {
  const cosy = title({ source: 'anilist', kind: 'anime', genres: ['Adventure'], keywords: ['Iyashikei'] });
  assert.ok(matchesMood(cosy, 'feel-good'));
  assert.ok(!matchesMood({ ...cosy, keywords: [] }, 'feel-good'));
  const loop = title({ source: 'anilist', kind: 'anime', genres: ['Drama'], keywords: ['Time Loop'] });
  assert.ok(matchesMood(loop, 'mind-bending'));
});

test('the deck keeps only cards that fit the mood, still ranked for you', () => {
  const pool = [title({ genres: ['Comedy'] }), title({ genres: ['Thriller'] }), title({ genres: ['Comedy', 'Horror'] }), title({ genres: ['Comedy', 'Family'] })];
  const deck = buildDeck(pool, buildProfile([], { now: NOW }), { now: NOW, filters: { mood: 'funny' }, surprise: false });
  assert.deepEqual(deck.map((c) => c.title.id).sort(), [pool[0].id, pool[3].id].sort());
  assert.ok(!eligible(pool[1], { filters: { mood: 'funny' } }));
  assert.ok(eligible(pool[1], { filters: { mood: null } }));
});

test('what you tagged with a mood’s feelings seeds it, strongest first, never what you disliked', () => {
  const a = title({ title: 'Paddington 2' });
  const b = title({ title: 'Mildly Amusing' });
  const c = title({ title: 'Funny But Bad' });
  const d = title({ title: 'Not Tagged' });
  const items = Object.fromEntries([watched(a, 5, ['Funny']), watched(b, 3.5, ['Light-hearted']), watched(c, 2, ['Funny']), watched(d, 5)].map((it) => [it.id, it]));
  const seeds = moodSeeds(items, 'funny', { now: NOW });
  assert.deepEqual(seeds.map((s) => s.item.title.title), ['Paddington 2', 'Mildly Amusing']);
  assert.equal(seeds[0].tag, 'Funny');
  assert.deepEqual(moodSeeds(items, 'true-stories', { now: NOW }), [], 'a mood with no feeling tags has no seeds');
  assert.deepEqual(moodSeeds(items, 'scary', { now: NOW }), []);
});

test('a card found through a title you tagged says so', () => {
  const t = title({ via: [{ type: 'seed', seedId: 'x', seedTitle: 'Paddington 2', seedRating: 5, mood: 'Funny', strength: 0.8 }] });
  const reasons = explain(t, { contributions: [], quality: 0.5 }, buildProfile([], { now: NOW }), { now: NOW });
  assert.equal(reasons[0].text, 'Like Paddington 2, which you tagged Funny');
});

test('the filter line names the mood first', () => {
  assert.deepEqual(filterSummary({ mood: 'gripping', short: true, decade: 1990 }, false, []), ['Gripping', 'Quick watches', '1990s']);
  assert.deepEqual(filterSummary({ mood: null, short: false, decade: null }, false, []), []);
});

// --- moods in the sources ----------------------------------------------------

test('a mood becomes TMDB genre ids per media type, never ruling out a fused genre that fits', () => {
  assert.deepEqual(moodGenreIds(moodOf('funny'), 'movie'), { genreIds: [35], withoutGenreIds: [27, 10752] });
  assert.deepEqual(moodGenreIds(moodOf('scary'), 'tv').genreIds, [], 'TMDB has no Horror for TV');
  const epicTv = moodGenreIds(moodOf('epic'), 'tv');
  assert.deepEqual(epicTv.genreIds, [10759, 10765]);
  assert.deepEqual(moodGenreIds(moodOf('moving'), 'tv').withoutGenreIds, [35, 10759]);
  assert.deepEqual(moodGenreIds(null, 'movie'), { genreIds: [], withoutGenreIds: [] });
  assert.deepEqual(moodGenres(moodOf('mind-bending')), { genres: ['Sci-Fi', 'Mystery', 'Psychological'], not: [] });
  assert.deepEqual(moodGenres(moodOf('funny')), { genres: ['Comedy'], not: ['Horror'] });
});

test('with a mood on, the deck asks TMDB and AniList for it, and for more like what you tagged', async () => {
  const fetchImpl = fakeFetch([
    ['graphql.anilist.co', fx('anilist-deck.json')],
    ['/movie/77/recommendations', { results: [film(501, 'The Grand Budapest Hotel')] }],
    ['/discover/', { results: [] }], ['/trending/', { results: [] }], ['/popular', { results: [] }], ['/recommendations', { results: [] }], ['/similar', { results: [] }],
  ]);
  const loved = fromTmdbList(film(77, 'Paddington 2'), 'movie');
  const items = { [loved.id]: watched(loved, 5, ['Funny']) };
  const { pool } = await gatherCandidates({
    tmdb: createTmdb({ key: 'k', fetchImpl }), anilist: createAniList({ fetchImpl }), items,
    profile: buildProfile(Object.values(items), { now: NOW }), settings: {}, filters: { mood: 'funny' }, now: NOW, rng: () => 0,
  });
  const urls = fetchImpl.calls.map((c) => c.url);
  const moodPull = urls.find((u) => u.includes('/discover/movie') && new URL(u).searchParams.get('with_genres') === '35' && new URL(u).searchParams.get('without_genres') === '27,10752');
  assert.ok(moodPull, 'TMDB is asked for comedies without horror or war');
  assert.ok(urls.some((u) => u.includes('/discover/movie') && u.includes('sort_by=vote_average.desc') && u.includes('with_genres=35')), 'and for the best-loved ones');
  assert.equal(urls.filter((u) => u.includes('/movie/77/recommendations')).length, 1, 'Paddington 2 is asked about once');
  const wes = pool.find((t) => t.id === 'tmdb:movie:501');
  assert.equal(wes.via[0].mood, 'Funny');
  const anilistCall = fetchImpl.calls.find((c) => c.url.includes('graphql.anilist.co'));
  const vars = JSON.parse(anilistCall.init.body).variables;
  assert.equal(vars.withFiltered, true);
  assert.deepEqual(vars.filterGenres, ['Comedy']);
  assert.deepEqual(vars.notGenres, ['Horror']);
});

test('without a mood the deck asks nothing extra', async () => {
  const fetchImpl = fakeFetch([['graphql.anilist.co', fx('anilist-deck.json')], ['/discover/', { results: [] }], ['/trending/', { results: [] }], ['/popular', { results: [] }]]);
  await gatherCandidates({ tmdb: createTmdb({ key: 'k', fetchImpl }), anilist: createAniList({ fetchImpl }), items: {}, profile: buildProfile([], { now: NOW }), settings: {}, filters: { short: false, decade: null, mood: null }, now: NOW, rng: () => 0 });
  assert.ok(!fetchImpl.calls.some((c) => c.url.includes('without_genres=27')));
  const vars = JSON.parse(fetchImpl.calls.find((c) => c.url.includes('graphql')).init.body).variables;
  assert.equal(vars.withFiltered, false);
  assert.equal(vars.notGenres, null);
});

// --- more like this ----------------------------------------------------------

test('more films like this: TMDB’s recommendations, topped up with similar ones, never itself or anime', async () => {
  const fetchImpl = fakeFetch([
    ['/movie/693134/recommendations', { results: [film(1, 'Arrival'), film(693134, 'Dune: Part Two'), film(2, 'Your Name', { genre_ids: [16], original_language: 'ja' })] }],
    ['/movie/693134/similar', { results: [film(1, 'Arrival'), film(3, 'Interstellar')] }],
  ]);
  const dune = fromTmdbList(film(693134, 'Dune: Part Two'), 'movie');
  const list = await similarTitles(dune, { tmdb: createTmdb({ key: 'k', fetchImpl }), anilist: null });
  assert.deepEqual(list.map((t) => t.title), ['Arrival', 'Interstellar']);
  assert.deepEqual(await similarTitles(dune, { tmdb: createTmdb({ key: '' }), anilist: null }), [], 'nothing without a key');
});

test('plenty of recommendations means no /similar call', async () => {
  const many = Array.from({ length: 12 }, (_, i) => film(100 + i, `Film ${i}`));
  const fetchImpl = fakeFetch([['/recommendations', { results: many }], ['/similar', { results: [] }]]);
  const t = fromTmdbList(film(9, 'Anything'), 'movie');
  assert.equal((await similarTitles(t, { tmdb: createTmdb({ key: 'k', fetchImpl }) })).length, 12);
  assert.ok(!fetchImpl.calls.some((c) => c.url.includes('/similar')));
});

test('more anime like this comes from AniList’s recommendations, without adult entries', async () => {
  const deck = fx('anilist-deck.json');
  const recs = deck.data.seeds.media[0].recommendations.nodes;
  const media = { id: 1, recommendations: { nodes: [...recs, { mediaRecommendation: { ...recs[0].mediaRecommendation, id: 999999, isAdult: true } }] } };
  const parsed = parseSimilar(media);
  assert.equal(parsed.length, recs.filter((r) => r.mediaRecommendation && !r.mediaRecommendation.isAdult).length);
  assert.ok(parsed.every((t) => t.kind === 'anime' && t.id !== 'anilist:999999'));
  const fetchImpl = fakeFetch([['query Similar', { data: { Media: media } }]]);
  const list = await similarTitles({ id: 'anilist:1', source: 'anilist', sourceId: 1, kind: 'anime' }, { anilist: createAniList({ fetchImpl }) });
  assert.equal(list.length, parsed.filter((t) => t.id !== 'anilist:1').length);
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body).variables, { id: 1 });
  assert.deepEqual(parseSimilar(null), []);
});

test('more like this is ranked for you, without what you passed or hid', () => {
  const loved = title({ genres: ['Science Fiction'], title: 'Arrival' });
  const items = { [loved.id]: watched(loved, 5) };
  const profile = buildProfile(Object.values(items), { now: NOW });
  const scifi = title({ genres: ['Science Fiction'] });
  const drama = title({ genres: ['Drama'] });
  const passed = title({ genres: ['Science Fiction'] });
  const horror = title({ genres: ['Horror'] });
  const hiddenFilm = title({ genres: ['Science Fiction'], collection: { id: 'tmdb:collection:1', name: 'Hidden' } });
  items[passed.id] = { id: passed.id, title: passed, status: 'passed', updatedAt: '2026-11-01' };
  const ranked = rankSimilar([drama, scifi, passed, horror, hiddenFilm, loved, scifi], profile, {
    of: 'tmdb:movie:self', items, hiddenGenres: ['Horror'], hiddenFranchises: [{ key: 'tmdb:collection:1', name: 'Hidden', ids: [] }], now: NOW,
  });
  const ids = ranked.map((r) => r.title.id);
  assert.ok(ids.indexOf(scifi.id) < ids.indexOf(drama.id), 'sci-fi first for someone who loved Arrival');
  assert.ok(!ids.includes(passed.id) && !ids.includes(horror.id) && !ids.includes(hiddenFilm.id));
  assert.ok(ids.includes(loved.id), 'what you watched stays, to say "In your diary"');
  assert.equal(new Set(ids).size, ids.length, 'no repeats');
  assert.ok(!rankSimilar([title({ id: 'tmdb:movie:self' })], profile, { of: 'tmdb:movie:self' }).length, 'never the title itself');
  assert.equal(rankSimilar(Array.from({ length: 20 }, () => title()), profile, { limit: 5 }).length, 5);
});
