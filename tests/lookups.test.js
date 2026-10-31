// Phase 2 sources: streaming services, people, franchises, TV seasons, and
// candidate gathering with services and deck filters. AniList fixtures are
// real captured responses. TMDB ones are hand-written to TMDB's format; their
// normalised shapes are checked against the live API by scripts/tmdb-live.mjs
// (GitHub Actions, weekly).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalService, canonicalServices, isStoreOnly } from '../js/sources/services.js';
import { fromTmdbDetail, fromTmdbList, fromTmdbPerson, fromTmdbCollection, fromTmdbProviders, collectionName, createTmdb } from '../js/sources/tmdb.js';
import { fromAniList, parsePerson, parseFranchise, parseDeckBatch, decadeRange, createAniList } from '../js/sources/anilist.js';
import { gatherCandidates, hydrate, decadeDates } from '../js/sources/candidates.js';
import { loadPerson, loadFranchise, hasFranchise, serviceChoices, checkNewSeasons } from '../js/sources/lookups.js';
import { buildProfile } from '../js/engine/index.js';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const NOW = Date.parse('2026-10-18T12:00:00Z');

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

// --- services -----------------------------------------------------------

test('service names from TMDB and AniList meet in one vocabulary', () => {
  assert.equal(canonicalService('Netflix Standard with Ads'), 'Netflix');
  assert.equal(canonicalService('Netflix basic with Ads'), 'Netflix');
  assert.equal(canonicalService('Disney Plus'), 'Disney+');
  assert.equal(canonicalService('Crunchyroll Amazon Channel'), 'Crunchyroll');
  assert.equal(canonicalService('Paramount Plus Apple TV Channel'), 'Paramount+');
  assert.equal(canonicalService('Amazon Prime Video'), 'Amazon Prime Video');
  assert.equal(canonicalService('Peacock Premium'), 'Peacock');
  assert.equal(canonicalService('Funimation Now'), 'Crunchyroll');
  assert.deepEqual(canonicalServices(['Netflix', 'Netflix Standard with Ads', 'HIDIVE']), ['Netflix', 'HIDIVE']);
  // Live TMDB, 2026-10-31: Apple TV+ is now listed as "Apple TV". It must still
  // match a saved "Apple TV+" pick, or "only what I can stream" hides Apple shows.
  assert.equal(canonicalService('Apple TV'), 'Apple TV+');
  assert.equal(canonicalService('Apple TV Store'), 'Apple TV Store', 'the store (rent and buy) is not the subscription');
});

test('shops and guides are not services you subscribe to', () => {
  for (const name of ['Apple TV Store', 'JustWatch TV Store', 'JustWatch TV Free', 'Google Play Store']) assert.ok(isStoreOnly(name), name);
  for (const name of ['Netflix', 'Apple TV+', 'Rakuten TV', 'Amazon Prime Video']) assert.ok(!isStoreOnly(name), name);
});

test('TMDB region providers: one entry per service, most common first', () => {
  const list = fromTmdbProviders(fx('tmdb-providers-movie.json'), 'GB');
  assert.deepEqual(list.slice(0, 3).map((p) => p.service), ['BBC iPlayer', 'Netflix', 'Amazon Prime Video']);
  assert.deepEqual(list.find((p) => p.service === 'Netflix').ids, [8, 1796]);
  assert.equal(list.find((p) => p.service === 'Crunchyroll').ids[0], 1968);
  assert.ok(!list.some((p) => p.service === 'Example US Only'), 'services not in your region are left out');
  assert.ok(fromTmdbProviders(fx('tmdb-providers-movie.json'), 'US').some((p) => p.service === 'Example US Only'));
});

// --- TMDB details, people, collections ---------------------------------

test('TMDB film detail knows its collection and where it streams', () => {
  const t = fromTmdbDetail(fx('tmdb-movie-detail.json'), 'movie', 'GB');
  assert.deepEqual(t.collection, { id: 'tmdb:collection:726871', name: 'Dune' });
  assert.deepEqual(t.streaming, ['Example Stream', 'Netflix'], 'subscription and free only; rent/buy do not count');
  assert.deepEqual(fromTmdbDetail(fx('tmdb-movie-detail.json'), 'movie', 'US').streaming, []);
  assert.equal(collectionName('The Lord of the Rings Collection'), 'The Lord of the Rings');
});

test('TMDB TV detail lists real seasons (not Specials) and the latest episode', () => {
  const t = fromTmdbDetail(fx('tmdb-tv-detail.json'), 'tv', 'GB');
  assert.deepEqual(t.seasonList.map((s) => [s.number, s.date]), [[1, '2022-02-17'], [2, '2025-01-17']]);
  assert.deepEqual(t.lastEpisode, { season: 2, episode: 10, date: '2025-03-21' });
  assert.equal(t.nextEpisode, null);
});

test('TMDB person: talk-show and obscure credits dropped, roles merged, leads flagged', () => {
  const { person, credits } = fromTmdbPerson(fx('tmdb-person.json'));
  assert.deepEqual(person, { id: 'tmdb:p:1190668', name: 'Timothée Chalamet', photo: 'https://image.tmdb.org/t/p/w342/tc.jpg', known: 'Actor', url: 'https://www.themoviedb.org/person/1190668' });
  const names = credits.map((c) => c.title);
  assert.ok(!names.includes('The Tonight Show Starring Jimmy Fallon'));
  assert.ok(!names.includes('Obscure Short'));
  assert.ok(!names.includes('A Complete Unknown'), 'producer credits are left out');
  const wonka = credits.find((c) => c.title === 'Wonka');
  assert.equal(wonka.role, 'Willy Wonka, Screenplay');
  assert.equal(wonka.major, true);
  assert.equal(credits.find((c) => c.title === 'Interstellar').major, false, 'ninth billing is not a lead');
  assert.equal(credits.find((c) => c.title === 'Homeland').major, true, '8 episodes is a real part');
});

test('TMDB collection lists every film in the series', () => {
  assert.deepEqual(fromTmdbCollection(fx('tmdb-collection.json')), {
    key: 'tmdb:collection:726871', name: 'Dune', ids: ['tmdb:movie:438631', 'tmdb:movie:693134', 'tmdb:movie:1170608'],
  });
});

// --- AniList (real responses) ------------------------------------------

test('AniList (real response): streaming links and franchise relations', () => {
  const t = fromAniList(fx('anilist-frieren.json').data.Media);
  assert.ok(t.streaming.includes('Crunchyroll') && t.streaming.includes('Netflix'), JSON.stringify(t.streaming));
  assert.ok(t.watchLinks.every((l) => l.name && l.url.startsWith('https://')));
  assert.ok(t.franchiseIds.includes(182255), 'season 2 is in the same franchise');
  assert.ok(!t.franchiseIds.includes(118586), 'the manga is not an anime');
});

test('AniList (real response): a voice actor\'s shows, one row per show', () => {
  const { person, credits } = parsePerson(fx('anilist-staff-tanezaki.json').data.Staff);
  assert.equal(person.name, 'Atsumi Tanezaki');
  assert.equal(person.id, 'anilist:s:112215');
  const ids = credits.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate shows');
  const frieren = credits.find((c) => c.id === 'anilist:154587');
  assert.equal(frieren.role, 'Frieren');
  assert.equal(frieren.major, true);
  assert.ok(credits.every((c) => c.kind === 'anime'));
});

test('AniList (real response): a director\'s many roles on one show collapse to the main two', () => {
  const { credits } = parsePerson(fx('anilist-staff-saitou.json').data.Staff);
  const frieren = credits.find((c) => c.id === 'anilist:154587');
  assert.ok(frieren.role.startsWith('Director'), frieren.role);
  assert.ok(frieren.role.split(', ').length <= 2);
  assert.equal(frieren.major, true);
  assert.equal(credits.find((c) => c.id !== 'anilist:154587').major, false);
});

test('AniList (real response): the whole Frieren franchise, via its source manga', () => {
  const f = parseFranchise(fx('anilist-franchise-frieren.json').data.Media);
  assert.equal(f.name, 'Frieren: Beyond Journey’s End');
  assert.ok(f.ids.includes('anilist:154587') && f.ids.includes('anilist:182255'));
  assert.ok(f.ids.every((id) => /^anilist:\d+$/.test(id)));
});

test('AniList (real response): the filtered page honours decade and length', () => {
  const b = parseDeckBatch(fx('anilist-filtered-90s.json').data);
  assert.ok(b.filtered.length > 0);
  for (const t of b.filtered) {
    assert.ok(t.year >= 1990 && t.year <= 1999, `${t.title} ${t.year}`);
    assert.ok(t.episodes == null || t.episodes <= 13, `${t.title} ${t.episodes}`);
  }
  assert.deepEqual(decadeRange({ decade: 1990 }), { from: 19900000, to: 20000000 });
  assert.deepEqual(decadeRange({ decade: 'older' }), { from: null, to: 19800000 });
  assert.deepEqual(decadeDates(2010), { from: '2010-01-01', to: '2019-12-31' });
});

test('the deck batch only asks for the filtered page when a filter is on', async () => {
  const fetchImpl = fakeFetch([['graphql.anilist.co', fx('anilist-deck.json')]]);
  const anilist = createAniList({ fetchImpl });
  await anilist.deckBatch({ now: new Date(NOW) });
  await anilist.deckBatch({ now: new Date(NOW), filters: { short: true, decade: 1990 } });
  const [plain, filtered] = fetchImpl.calls.map((c) => JSON.parse(c.init.body).variables);
  assert.equal(plain.withFiltered, false);
  assert.equal(filtered.withFiltered, true);
  assert.equal(filtered.episodesBelow, 14);
  assert.equal(filtered.from, 19900000);
});

// --- gathering with services and filters -------------------------------

test('gathering searches your services\' catalogues and the deck filters on TMDB', async () => {
  const fetchImpl = fakeFetch([
    ['/watch/providers/', fx('tmdb-providers-movie.json')],
    ['graphql.anilist.co', fx('anilist-deck.json')],
    ['with_watch_providers', { results: [{ ...fx('tmdb-trending-movie.json').results[0], id: 777, title: 'On Netflix' }] }],
    ['/trending/', fx('tmdb-trending-movie.json')],
    ['/discover/', { results: [] }],
    ['/popular', { results: [] }],
  ]);
  const tmdb = createTmdb({ key: 'k', fetchImpl, region: 'GB' });
  const { pool, errors } = await gatherCandidates({
    tmdb, anilist: createAniList({ fetchImpl }), items: {}, profile: buildProfile([], { now: NOW }),
    settings: { services: ['Netflix'], streamOnly: true }, filters: { short: true, decade: 1990 }, now: NOW, rng: () => 0,
  });
  assert.deepEqual(errors, []);
  const urls = fetchImpl.calls.map((c) => decodeURIComponent(c.url));
  const stream = urls.filter((u) => u.includes('with_watch_providers'));
  assert.ok(stream.length >= 2, 'two pages of your services when "only" is on');
  assert.ok(stream.every((u) => u.includes('with_watch_providers=8|1796') && u.includes('watch_region=GB')), stream[0]);
  assert.ok(urls.some((u) => u.includes('/discover/movie') && u.includes('with_runtime.lte=120') && u.includes('primary_release_date.gte=1990-01-01')));
  const onNetflix = pool.find((t) => t.title === 'On Netflix');
  assert.equal(onNetflix.streamHint, true);
  assert.equal(onNetflix.via[0].type, 'stream');
});

test('the streaming hint survives details being fetched', async () => {
  const fetchImpl = fakeFetch([['/movie/693134', fx('tmdb-movie-detail.json')]]);
  const light = { ...fromTmdbList(fx('tmdb-trending-movie.json').results[0], 'movie'), via: [], streamHint: true };
  const [full] = await hydrate([light], { tmdb: createTmdb({ key: 'k', fetchImpl }) });
  assert.equal(full.detailed, true);
  assert.equal(full.streamHint, true);
});

// --- lookups ------------------------------------------------------------

test('loadPerson routes TMDB and AniList people, and needs a key for TMDB', async () => {
  const fetchImpl = fakeFetch([['/person/1190668', fx('tmdb-person.json')], ['Staff(id', fx('anilist-staff-tanezaki.json')]]);
  const tmdb = createTmdb({ key: 'k', fetchImpl });
  const anilist = createAniList({ fetchImpl });
  assert.equal((await loadPerson('tmdb:p:1190668', { tmdb, anilist })).person.name, 'Timothée Chalamet');
  assert.equal((await loadPerson('anilist:s:112215', { tmdb, anilist })).person.name, 'Atsumi Tanezaki');
  assert.equal(await loadPerson('tmdb:p:1190668', { tmdb: createTmdb({ key: '' }), anilist }), null);
  assert.equal(await loadPerson('nonsense', { tmdb, anilist }), null);
});

test('loadFranchise resolves the whole series, or falls back to what the title knows', async () => {
  const dune = fromTmdbDetail(fx('tmdb-movie-detail.json'), 'movie', 'GB');
  const frieren = fromAniList(fx('anilist-frieren.json').data.Media);
  assert.equal(hasFranchise(dune), true);
  assert.equal(hasFranchise(fromTmdbDetail(fx('tmdb-tv-detail.json'), 'tv', 'GB')), false);
  const fetchImpl = fakeFetch([['/collection/726871', fx('tmdb-collection.json')], ['relations { edges', fx('anilist-franchise-frieren.json')]]);
  const ctx = { tmdb: createTmdb({ key: 'k', fetchImpl }), anilist: createAniList({ fetchImpl }) };
  assert.equal((await loadFranchise(dune, ctx)).ids.length, 3);
  assert.ok((await loadFranchise(frieren, ctx)).ids.includes('anilist:182255'));
  const offline = { tmdb: createTmdb({ key: 'k', fetchImpl: fakeFetch([]) }), anilist: createAniList({ fetchImpl: fakeFetch([]) }) };
  assert.deepEqual(await loadFranchise(dune, offline), { key: 'tmdb:collection:726871', name: 'Dune', ids: ['tmdb:movie:693134'] });
  assert.ok((await loadFranchise(frieren, offline)).ids.includes('anilist:182255'));
});

test('serviceChoices: your region\'s services first, common ones always offered', async () => {
  const noKey = await serviceChoices({ tmdb: createTmdb({ key: '' }), picked: ['Shudder'] });
  assert.ok(noKey.some((s) => s.service === 'Crunchyroll'));
  assert.ok(noKey.some((s) => s.service === 'Shudder'), 'anything already picked stays visible');
  const fetchImpl = fakeFetch([['/watch/providers/', fx('tmdb-providers-movie.json')]]);
  const withKey = await serviceChoices({ tmdb: createTmdb({ key: 'k', fetchImpl }) });
  assert.equal(withKey[0].service, 'BBC iPlayer');
  assert.ok(withKey[0].logo);
  assert.equal(new Set(withKey.map((s) => s.service)).size, withKey.length);
  // The live GB list includes shops (2026-10-31); the picker leaves them out.
  const shops = { results: [...fx('tmdb-providers-movie.json').results, { provider_id: 2, provider_name: 'Apple TV Store', display_priorities: { GB: 4 } }, { provider_id: 2784, provider_name: 'JustWatch TV Store', display_priorities: { GB: 5 } }] };
  const picker = await serviceChoices({ tmdb: createTmdb({ key: 'k', fetchImpl: fakeFetch([['/watch/providers/', shops]]) }) });
  assert.ok(!picker.some((s) => isStoreOnly(s.service)), 'no shops in "Your streaming services"');
});

test('checkNewSeasons fetches watched shows and reports a new season', async () => {
  const tv = fx('tmdb-tv-detail.json');
  const fetchImpl = fakeFetch([['/tv/95396', { ...tv, next_episode_to_air: { air_date: '2027-01-16', episode_number: 1, season_number: 3 } }]]);
  const title = fromTmdbDetail(tv, 'tv', 'GB');
  const items = { [title.id]: { id: title.id, title, status: 'watched', watches: [{ id: 'w', date: '2025-04-01', rating: 5 }] } };
  const alerts = await checkNewSeasons({ tmdb: createTmdb({ key: 'k', fetchImpl }), items, now: NOW });
  assert.equal(alerts.length, 1);
  assert.deepEqual([alerts[0].season, alerts[0].state, alerts[0].date], [3, 'soon', '2027-01-16']);
  assert.deepEqual(await checkNewSeasons({ tmdb: createTmdb({ key: '' }), items, now: NOW }), []);
});
