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
import { createTmdb, fromTmdbDetail, fromTmdbPerson, fromTmdbCollection, fromTmdbProviders } from '../js/sources/tmdb.js';

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
  if (Array.isArray(v)) return v.length && depth < 3 ? [shape(v.find((x) => x != null), depth + 1)] : 'array';
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
