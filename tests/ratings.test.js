// Review scores from MDBList (js/sources/ratings.js). The fixture is MDBList's
// own documented example response (Jaws, from its OpenAPI description); the
// live shape is checked by scripts/tmdb-live.mjs once the repository has an
// MDBLIST_API_KEY secret.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromMdblist, createRatings } from '../js/sources/ratings.js';
import { createTmdb } from '../js/sources/tmdb.js';
import { hydrate } from '../js/sources/candidates.js';
import { reviewScores, cardScore } from '../js/ui/dom.js';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const jaws = fx('mdblist-movie.json');

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [match, status, body] of routes) {
      if (String(url).includes(match)) return { ok: status < 400, status, headers: { get: () => null }, json: async () => body };
    }
    return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({ error: 'Item not found' }) };
  };
  fn.calls = calls;
  return fn;
}

test('MDBList scores normalise: IMDb out of 10, Rotten Tomatoes and Metacritic out of 100, Letterboxd out of 5', () => {
  const r = fromMdblist(jaws);
  assert.deepEqual(r.imdb, { value: 8.1, votes: 673852, url: 'https://www.imdb.com/title/tt0073195/' });
  assert.deepEqual(r.critics, { value: 97, votes: 102, url: 'https://www.rottentomatoes.com/m/jaws' });
  assert.equal(r.audience, null, 'the documented example has no audience score');
  assert.equal(r.metacritic.value, 87);
  assert.deepEqual(r.letterboxd, { value: 4, votes: 876082, url: 'https://letterboxd.com/film/jaws/' });
  assert.equal(r.imdbId, 'tt0073195');
});

test('Rotten Tomatoes’ audience score is read under any of the names MDBList has used', () => {
  for (const source of ['popcorn', 'tomatoesaudience', 'audience']) {
    const r = fromMdblist({ ...jaws, ratings: [...jaws.ratings, { source, value: 90, score: 90, votes: 250000, url: null }] });
    assert.deepEqual(r.audience, { value: 90, votes: 250000, url: 'https://www.rottentomatoes.com/m/jaws' }, source);
  }
  assert.equal(fromMdblist({ ratings: [{ source: 'imdb', value: null }] }), null, 'no scores at all: null');
  assert.equal(fromMdblist(null), null);
});

test('scores are asked for by TMDB id, cached for a week without the key, and skipped without a key or for anime', async () => {
  const fetchImpl = fakeFetch([['/tmdb/movie/578', 200, jaws]]);
  const store = new Map();
  const cache = { get: async (k) => store.get(k), set: async (k, v, ttl) => store.set(k, { value: v, expires: Date.now() + ttl }) };
  const ratings = createRatings({ key: 'abc123KEY', fetchImpl, cache });
  const film = { id: 'tmdb:movie:578', source: 'tmdb', sourceId: 578, mediaType: 'movie' };
  assert.equal((await ratings.forTitle(film)).imdb.value, 8.1);
  assert.equal((await ratings.forTitle(film)).critics.value, 97);
  assert.equal(fetchImpl.calls.length, 1, 'the second ask is served from the cache');
  assert.ok(fetchImpl.calls[0].url.startsWith('https://api.mdblist.com/tmdb/movie/578?apikey=abc123KEY'));
  assert.ok(![...store.keys()].some((k) => k.includes('abc123KEY')), 'the key never ends up in a cache key');
  assert.ok(!JSON.stringify([...store.values()]).includes('streams'), 'only the scores are kept');

  const show = { id: 'tmdb:tv:95396', source: 'tmdb', sourceId: 95396, mediaType: 'tv' };
  assert.equal(await ratings.forTitle(show), null, 'a title MDBList doesn’t know: no scores');
  assert.ok(fetchImpl.calls.at(-1).url.includes('/tmdb/show/95396'), 'series are "show" to MDBList');
  await ratings.forTitle(show);
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('95396')).length, 1, 'and it isn’t asked again');

  assert.equal(await createRatings({ key: '' }).forTitle(film), null);
  assert.equal(createRatings({ key: '' }).hasKey, false);
  assert.equal(await ratings.forTitle({ id: 'anilist:1', source: 'anilist', sourceId: 1 }), null);
});

test('details come with their scores, and a failing score lookup never holds them up', async () => {
  const fetchImpl = fakeFetch([['api.mdblist.com/tmdb/movie/693134', 200, jaws], ['/movie/693134', 200, fx('tmdb-movie-detail.json')]]);
  const tmdb = createTmdb({ key: 'k', fetchImpl });
  const light = { id: 'tmdb:movie:693134', source: 'tmdb', sourceId: 693134, mediaType: 'movie', title: 'Dune: Part Two', via: [] };
  const [withScores] = await hydrate([light], { tmdb, ratings: createRatings({ key: 'abc123KEY', fetchImpl }) });
  assert.equal(withScores.detailed, true);
  assert.equal(withScores.ratings.imdb.value, 8.1);
  const broken = { hasKey: true, forTitle: async () => { throw new Error('quota'); } };
  const [still] = await hydrate([light], { tmdb, ratings: broken });
  assert.equal(still.detailed, true);
  assert.equal(still.ratings, undefined);
});

test('the card shows IMDb and Rotten Tomatoes’ audience score, else critics, else TMDB’s own', () => {
  const base = { source: 'tmdb', score: 7.4 };
  assert.equal(cardScore(base), 'TMDB 7.4');
  const r = fromMdblist(jaws);
  assert.equal(cardScore({ ...base, ratings: r }), 'IMDb 8.1 · RT critics 97%');
  assert.equal(cardScore({ ...base, ratings: { ...r, audience: { value: 90, url: null } } }), 'IMDb 8.1 · RT audience 90%');
  assert.deepEqual(reviewScores({ ratings: r }).map((s) => s.text), ['IMDb 8.1', 'RT critics 97%', 'Metacritic 87', 'Letterboxd 4.0']);
});
