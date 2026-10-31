// `node scripts/tmdb-live.mjs`: check the TMDB adapter against the live API
// (docs/PLAN.md → Verifying TMDB live). Needs TMDB_API_KEY in the
// environment: a session secret, or the repository secret in GitHub Actions
// (.github/workflows/tmdb-live.yml). The key is never printed.
//
// It asks TMDB for the same titles the hand-written fixtures describe (Dune:
// Part Two, Severance, Timothée Chalamet, the Dune collection, GB's
// providers), runs both through the adapter, and compares the normalised
// shapes. With --captures <dir> it also writes trimmed raw responses there,
// ready to replace the fixtures in tests/fixtures/.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createTmdb, fromTmdbDetail, fromTmdbPerson, fromTmdbCollection, fromTmdbProviders, NOT_FOR_DECK } from '../js/sources/tmdb.js';
import { TMDB_NETWORKS } from '../js/sources/services.js';
import { searchTitles, starterTitles } from '../js/sources/lookups.js';
import { gatherCandidates } from '../js/sources/candidates.js';
import { createRatings } from '../js/sources/ratings.js';
import { buildProfile } from '../js/engine/index.js';

const KEY = process.env.TMDB_API_KEY || '';
if (!KEY) {
  console.error('TMDB_API_KEY is not set, so the live check can’t run.');
  process.exit(2);
}
const capDir = process.argv.includes('--captures') ? process.argv[process.argv.indexOf('--captures') + 1] : null;
if (capDir) mkdirSync(capDir, { recursive: true });

const failures = [];
const notes = [];
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures.push(msg); };
const fx = (name) => JSON.parse(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), 'utf8'));

// Every raw response, by path, so captures can be written from them.
const raw = new Map();
const fetchImpl = async (url, init) => {
  const res = await fetch(url, init);
  const text = await res.text();
  raw.set(new URL(url).pathname.replace('/3', ''), text);
  return new Response(text, { status: res.status, headers: res.headers });
};
const tmdb = createTmdb({ key: KEY, region: 'GB', fetchImpl });

// The shape of a value: type for scalars, keys (and element shape) for the rest.
function shape(v, depth = 0) {
  if (v === null || v === undefined) return 'empty';
  // An empty list is "empty" too: the fixture's show may stream nowhere in GB
  // while the live one streams somewhere, and that's not a different shape.
  if (Array.isArray(v)) return v.length ? (depth < 3 ? [shape(v.find((x) => x != null), depth + 1)] : 'array') : 'empty';
  if (typeof v === 'object') return depth < 3 ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k], depth + 1)])) : 'object';
  return typeof v;
}
// Differences between a live and a fixture shape. "empty" on either side is
// fine (a field TMDB leaves out for some titles), different types or missing
// keys are not.
function diff(live, fixture, path = '') {
  const out = [];
  if (live === 'empty' || fixture === 'empty') return out;
  if (Array.isArray(live) && Array.isArray(fixture)) return diff(live[0], fixture[0], `${path}[]`);
  if (live && fixture && typeof live === 'object' && typeof fixture === 'object' && !Array.isArray(live) && !Array.isArray(fixture)) {
    for (const k of new Set([...Object.keys(live), ...Object.keys(fixture)])) {
      if (!(k in live)) out.push(`${path}.${k}: in the fixture's output, missing live`);
      else if (!(k in fixture)) out.push(`${path}.${k}: live only`);
      else out.push(...diff(live[k], fixture[k], `${path}.${k}`));
    }
    return out;
  }
  if (JSON.stringify(live) !== JSON.stringify(fixture)) out.push(`${path}: live ${JSON.stringify(live)}, fixture ${JSON.stringify(fixture)}`);
  return out;
}
function compare(label, live, fixture) {
  const d = diff(shape(live), shape(fixture));
  const real = d.filter((x) => !/live only$/.test(x));
  for (const x of d.filter((y) => /live only$/.test(y))) notes.push(`${label} ${x}`);
  check(real.length === 0, `${label}: same normalised shape as the fixture${real.length ? `\n      ${real.join('\n      ')}` : ''}`);
}
async function step(label, fn) {
  try { await fn(); } catch (err) { check(false, `${label}: ${err.message}`); }
}

console.log('TMDB live check (region GB)');
await step('key', async () => check(await tmdb.test(), 'the key works (/configuration)'));

await step('trending', async () => {
  const films = await tmdb.trending('movie');
  const tv = await tmdb.trending('tv');
  check(films.length > 5 && tv.length > 5, `trending this week: ${films.length} films, ${tv.length} shows (e.g. ${films.slice(0, 3).map((t) => `${t.title} ${t.year}`).join('; ')})`);
  check(films.every((t) => t.id && t.title && t.kind === 'film'), 'every trending film has an id, a title and kind "film"');
});

await step('film details', async () => {
  const live = await tmdb.details('movie', 693134);
  console.log(`    ${live.title} (${live.year}) · ${live.runtime} min · ${live.certification} · cast ${live.cast.slice(0, 3).map((c) => c.name).join(', ')} · trailer ${live.trailer ? 'yes' : 'no'} · streaming ${JSON.stringify(live.streaming)} · collection ${live.collection && live.collection.name}`);
  check(live.title === 'Dune: Part Two' && live.cast.length > 0 && live.collection && live.collection.id === 'tmdb:collection:726871', 'Dune: Part Two: title, cast and its collection');
  compare('film details', live, fromTmdbDetail(fx('tmdb-movie-detail.json'), 'movie', 'GB'));
});

await step('TV details', async () => {
  const live = await tmdb.details('tv', 95396);
  console.log(`    ${live.title} · ${live.seasons} seasons · next ${JSON.stringify(live.nextEpisode)} · last ${JSON.stringify(live.lastEpisode)} · seasons ${live.seasonList.map((s) => `${s.number}:${s.date}`).join(' ')}`);
  check(live.title === 'Severance' && live.seasonList.length >= 2 && live.seasonList.every((s) => s.number > 0), 'Severance: seasons listed, specials left out');
  check(live.lastEpisode && typeof live.lastEpisode.season === 'number', 'the last episode has a season number (what new-season alerts read)');
  // An Apple original: TMDB calls the service "Apple TV" since Apple's 2025
  // rename; Binger's one name for it is "Apple TV+" (js/sources/services.js).
  check(live.streaming.includes('Apple TV+'), `Severance counts as on Apple TV+ (${JSON.stringify(live.streaming)})`);
  compare('TV details', live, fromTmdbDetail(fx('tmdb-tv-detail.json'), 'tv', 'GB'));
});

await step('providers', async () => {
  const live = await tmdb.providers('movie');
  console.log(`    ${live.slice(0, 10).map((p) => `${p.service} ${JSON.stringify(p.ids)}`).join(' · ')}`);
  check(live.some((p) => p.service === 'Netflix') && live.some((p) => p.service === 'Disney+'), 'GB providers include Netflix and Disney+, under one name each');
  compare('providers', live, fromTmdbProviders(fx('tmdb-providers-movie.json'), 'GB'));
});

await step('person', async () => {
  const live = await tmdb.person(1190668);
  console.log(`    ${live.person.name} · ${live.person.known} · ${live.credits.length} credits, e.g. ${live.credits.slice(0, 4).map((c) => `${c.title} / ${c.role}${c.major ? ' *' : ''}`).join('; ')}`);
  check(live.person.name === 'Timothée Chalamet' && live.credits.length > 5 && live.credits.some((c) => /Dune/.test(c.title)), 'Timothée Chalamet: his films, Dune among them');
  compare('person', live, fromTmdbPerson(fx('tmdb-person.json')));
});

await step('collection', async () => {
  const live = await tmdb.collection(726871);
  console.log(`    ${live.name}: ${live.ids.join(', ')}`);
  check(live.name === 'Dune' && live.ids.includes('tmdb:movie:693134'), 'the Dune collection, with Part Two in it');
  compare('collection', live, fromTmdbCollection(fx('tmdb-collection.json')));
});

await step('discover', async () => {
  const nineties = await tmdb.discover('movie', { providerIds: [8], runtimeMax: 120, from: '1990-01-01', to: '1999-12-31' });
  console.log(`    Netflix GB, 1990s, under 2 h: ${nineties.slice(0, 5).map((t) => `${t.title} ${t.year}`).join('; ')}`);
  check(nineties.length > 0 && nineties.every((t) => t.year >= 1990 && t.year <= 1999), `discover by service, length and decade keeps to the 1990s (${nineties.length} found)`);
});

// Coverage (docs/COVERAGE-PLAN.md): the network ids behind "An Apple TV+
// original", search, and the first-run grid.
const NETWORK_NAMES = { 2552: /apple/i, 213: /netflix/i, 1024: /prime|amazon/i, 2739: /disney/i, 3186: /max/i, 49: /hbo/i, 453: /hulu/i, 4330: /paramount/i, 3353: /peacock/i, 4: /bbc one/i, 332: /bbc two/i, 9: /itv/i, 26: /channel 4/i, 1063: /sky atlantic/i };
await step('networks', async () => {
  for (const [service, ids] of Object.entries(TMDB_NETWORKS)) {
    for (const id of ids) {
      const n = await tmdb.network(id);
      const want = NETWORK_NAMES[id];
      check(!!(n && want && want.test(n.name)), `network ${id} for ${service} is TMDB's "${n && n.name}"`);
    }
  }
});

await step('originals', async () => {
  const apple = await tmdb.discover('tv', { networkIds: TMDB_NETWORKS['Apple TV+'], minVotes: 20 });
  console.log(`    Apple TV+ originals: ${apple.slice(0, 8).map((t) => t.title).join('; ')}`);
  check(apple.length > 10 && apple.some((t) => /Severance|Slow Horses|Ted Lasso|Silo|Shrinking|The Studio|Pluribus/.test(t.title)), `Apple TV+ originals come back by network (${apple.length})`);
});

await step('TV without talk shows', async () => {
  const day = 86400000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  await tmdb.discover('tv', { airingFrom: iso(Date.now() - 14 * day), airingTo: iso(Date.now() + 7 * day), minVotes: 20 });
  const results = JSON.parse(raw.get('/discover/tv')).results || [];
  console.log(`    on now: ${results.slice(0, 8).map((r) => r.name).join('; ')}`);
  check(results.length > 5 && results.every((r) => !(r.genre_ids || []).some((g) => NOT_FOR_DECK.includes(g))), 'TMDB honours without_genres: no news, talk shows or soaps in "on now"');
});

await step('search', async () => {
  for (const [q, want] of [['slow horses', /^Slow Horses$/], ['severance', /^Severance$/], ['the studio', /^The Studio$/], ['pokemon detective', /Detective Pikachu/]]) {
    const { titles } = await searchTitles(q, { tmdb });
    check(!!(titles[0] && want.test(titles[0].title)), `search "${q}" → first result ${titles[0] ? `"${titles[0].title}" (${titles[0].kind} ${titles[0].year})` : 'none'}`);
  }
  const apple = await searchTitles('apple tv', { tmdb });
  console.log(`    "apple tv": ${apple.titles.slice(0, 8).map((t) => t.title).join('; ')}`);
  check(apple.service === 'Apple TV+' && apple.titles.length > 10, `search "apple tv" lists Apple TV+'s shows (${apple.titles.length})`);
});

await step('people and years in search', async () => {
  const adam = await searchTitles('adam scott', { tmdb });
  console.log(`    "adam scott": ${adam.people.map((p) => `${p.name} (${p.known})`).join('; ')} · ${adam.titles.slice(0, 5).map((t) => t.title).join('; ')}`);
  check(adam.people[0] && adam.people[0].name === 'Adam Scott' && adam.titles.some((t) => t.title === 'Severance'), 'search "adam scott" brings him up, and Severance among his work');
  const dune = await searchTitles('dune 2021', { tmdb });
  check(!!(dune.titles[0] && dune.titles[0].title === 'Dune' && dune.titles[0].year === 2021), `search "dune 2021" → first result ${dune.titles[0] ? `"${dune.titles[0].title}" (${dune.titles[0].year})` : 'none'}`);
  const blade = await searchTitles('blade runner 2049', { tmdb });
  check(!!(blade.titles[0] && /2049/.test(blade.titles[0].title)), `search "blade runner 2049" still finds the film (${blade.titles[0] && blade.titles[0].title})`);
  const similar = await tmdb.similar('movie', 693134);
  check(similar.length > 5, `"similar" answers for Dune: Part Two (${similar.length})`);
});

// Review scores (js/sources/ratings.js), when the repository has an
// MDBLIST_API_KEY secret. Prints the raw source names MDBList sends, so a
// rename (it has called the audience score "popcorn" and "tomatoesaudience")
// shows up here first.
const MDBLIST_KEY = process.env.MDBLIST_API_KEY || '';
await step('review scores', async () => {
  if (!MDBLIST_KEY) { notes.push('No MDBLIST_API_KEY: review scores not checked (optional).'); return; }
  const sources = new Set();
  const capture = async (url, init) => {
    const res = await fetch(url, init);
    const text = await res.text();
    try { for (const r of JSON.parse(text).ratings || []) if (r && r.value != null) sources.add(r.source); } catch { /* not JSON */ }
    return new Response(text, { status: res.status, headers: res.headers });
  };
  const ratings = createRatings({ key: MDBLIST_KEY, fetchImpl: capture });
  const dune = await ratings.forTitle({ source: 'tmdb', sourceId: 693134, mediaType: 'movie' });
  const severance = await ratings.forTitle({ source: 'tmdb', sourceId: 95396, mediaType: 'tv' });
  const show = (r) => (r ? Object.entries(r).filter(([k, v]) => v && k !== 'imdbId').map(([k, v]) => `${k} ${v.value}`).join(', ') : 'none');
  console.log(`    sources with a score: ${[...sources].sort().join(', ')}`);
  console.log(`    Dune: Part Two: ${show(dune)} · Severance: ${show(severance)}`);
  check(!!(dune && dune.imdb && dune.critics && dune.imdbId === 'tt15239678'), 'Dune: Part Two has IMDb and Rotten Tomatoes scores, and its IMDb id');
  check(!!(dune && dune.audience), 'and Rotten Tomatoes’ audience score');
  check(!!(severance && severance.imdb), 'Severance (a series) has an IMDb score');
});

// How far the deck reaches: a few refills with and without the page memory.
await step('deck reach', async () => {
  const twoYearsAgo = Date.now() - 730 * 86400000;
  const reach = async (pages) => {
    const seen = new Map();
    const added = [];
    for (let i = 0; i < 5; i++) {
      const { pool } = await gatherCandidates({ tmdb, anilist: null, items: {}, profile: buildProfile([]), settings: {}, pages });
      const before = seen.size;
      for (const t of pool) seen.set(t.id, t);
      added.push(seen.size - before);
    }
    const recent = [...seen.values()].filter((t) => t.releaseDate && Date.parse(t.releaseDate) >= twoYearsAgo).length;
    return { total: seen.size, recent, added };
  };
  const without = await reach(null);
  const withMemory = await reach({});
  console.log(`    5 refills without page memory: ${without.total} titles (${without.recent} from the last two years), new per refill ${without.added.join(', ')}`);
  console.log(`    5 refills with page memory:    ${withMemory.total} titles (${withMemory.recent} from the last two years), new per refill ${withMemory.added.join(', ')}`);
  check(withMemory.total > without.total && withMemory.added[4] >= 20, 'with page memory, later refills keep finding new titles');
});

await step('first-run grid', async () => {
  const grid = await starterTitles({ tmdb });
  const more = await starterTitles({ tmdb, page: 2 });
  console.log(`    ${grid.length} titles, then ${more.length} more: ${grid.slice(0, 10).map((t) => t.title).join('; ')}`);
  check(grid.length >= 60 && more.filter((t) => !grid.some((g) => g.id === t.id)).length >= 30, 'the first-run grid has 60+ titles and "Show more" brings 30+ new ones');
  check(grid.some((t) => /Breaking Bad|Game of Thrones|Stranger Things|Friends/.test(t.title)), 'it includes the series most people have seen');
});

if (capDir) {
  // Trimmed so fixtures stay small; the adapter only reads these parts.
  const json = (p) => (raw.has(p) ? JSON.parse(raw.get(p)) : null);
  const save = (name, value) => { if (value) writeFileSync(`${capDir}/${name}`, JSON.stringify(value, null, 1) + '\n'); };
  const gbOnly = (wp) => (wp && wp.results ? { results: { GB: wp.results.GB } } : wp);
  const movie = json('/movie/693134');
  if (movie) save('tmdb-movie-detail.json', { ...movie, credits: { cast: movie.credits.cast.slice(0, 10), crew: movie.credits.crew.filter((c) => ['Director', 'Screenplay', 'Writer'].includes(c.job)) }, 'watch/providers': gbOnly(movie['watch/providers']), release_dates: { results: movie.release_dates.results.filter((r) => r.iso_3166_1 === 'GB') }, videos: { results: movie.videos.results.slice(0, 6) } });
  const tv = json('/tv/95396');
  if (tv) save('tmdb-tv-detail.json', { ...tv, aggregate_credits: { cast: tv.aggregate_credits.cast.slice(0, 10) }, 'watch/providers': gbOnly(tv['watch/providers']), content_ratings: { results: tv.content_ratings.results.filter((r) => r.iso_3166_1 === 'GB') }, videos: { results: tv.videos.results.slice(0, 6) } });
  const prov = json('/watch/providers/movie');
  if (prov) save('tmdb-providers-movie.json', { results: prov.results.filter((p) => p.display_priorities && p.display_priorities.GB != null).sort((a, b) => a.display_priorities.GB - b.display_priorities.GB).slice(0, 25).map((p) => ({ ...p, display_priorities: { GB: p.display_priorities.GB } })) });
  const person = json('/person/1190668');
  if (person) save('tmdb-person.json', { ...person, combined_credits: { cast: person.combined_credits.cast.slice(0, 25), crew: person.combined_credits.crew.slice(0, 10) } });
  save('tmdb-collection.json', json('/collection/726871'));
  console.log(`\nTrimmed captures written to ${capDir}/`);
}

if (notes.length) console.log(`\nLive responses have fields the fixtures don't (fine, for information):\n  ${notes.join('\n  ')}`);
if (failures.length) {
  console.log(`\n${failures.length} live check(s) failed`);
  process.exit(1);
}
console.log('\nThe TMDB adapter matches the live API.');
