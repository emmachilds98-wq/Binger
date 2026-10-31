// Phase 2 engine: length, feeling tags, streaming services, deck filters,
// hidden series, a person's work, new seasons and taste over time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  featuresOf, lengthBucket, buildProfile, itemSignal, scoreTitle, onServices, buildDeck, explain,
  isShort, inDecade, franchiseBlock, isBlocked, rankForYou, seasonAlert, seasonAlerts, showsToCheck,
  tasteTimeline, itemAsOf, monthEnds, TAG_NUDGE, topFeatures,
} from '../js/engine/index.js';
import { TAGS } from '../js/state/library.js';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const DAY = 86400000;
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

let n = 0;
function title(over = {}) {
  n += 1;
  return {
    id: over.id || `t:${n}`, source: 'tmdb', kind: 'film', title: `Title ${n}`, year: 2020, releaseDate: '2020-01-01',
    genres: ['Drama'], keywords: [], cast: [], crew: [], studios: [], language: 'en', score: 7, votes: 1000, detailed: true,
    ...over,
  };
}
function watched(t, rating, daysAgo = 10, tags = []) {
  const date = iso(daysAgo * DAY).slice(0, 10);
  return { id: t.id, title: t, status: 'watched', addedAt: iso(daysAgo * DAY), updatedAt: iso(daysAgo * DAY), watches: [{ id: 'w' + t.id, date, rating, tags }] };
}

// --- length -------------------------------------------------------------

test('length buckets: films by runtime, series by episodes, unknown when missing', () => {
  assert.equal(lengthBucket(title({ runtime: 95 })).key, 'film-short');
  assert.equal(lengthBucket(title({ runtime: 167 })).key, 'film-long');
  assert.equal(lengthBucket(title({ runtime: null })), null);
  assert.equal(lengthBucket(title({ kind: 'anime', source: 'anilist', episodes: 12 })).key, 'series-short');
  assert.equal(lengthBucket(title({ kind: 'anime', source: 'anilist', format: 'MOVIE', runtime: 125, episodes: 1 })).key, 'film-mid');
  assert.equal(lengthBucket(title({ kind: 'tv', episodes: 62 })).key, 'series-long');
  assert.ok(featuresOf(title({ runtime: 95 })).some((f) => f.key === 'n:film-short'));
});

// --- feeling tags -------------------------------------------------------

test('every feeling tag in the rate sheet has a nudge', () => {
  for (const t of TAGS) assert.ok(t in TAG_NUDGE, `${t} has no TAG_NUDGE entry`);
});

test('tags fine-tune a rating without overriding it', () => {
  const plain = itemSignal(watched(title(), 4), 3).s;
  const loved = itemSignal(watched(title(), 4, 10, ['Rewatchable', 'Moving']), 3).s;
  const meh = itemSignal(watched(title(), 4, 10, ['Overhyped', 'Slow', 'Confusing']), 3).s;
  assert.ok(loved > plain && meh < plain);
  assert.ok(meh > 0, 'a 4-star rating stays positive however it was tagged');
  const many = itemSignal(watched(title(), 3, 10, ['Gripping', 'Funny', 'Moving', 'Beautiful', 'Clever', 'Comfort watch', 'Rewatchable']), 3).s;
  assert.ok(many <= 0.25 + 1e-9, 'the nudge is capped');
});

test('"Slow" on long films lowers long films, not films in general', () => {
  const items = [1, 2, 3].map(() => watched(title({ runtime: 170, genres: ['Drama'] }), 3.5, 10, ['Slow']));
  items.push(watched(title({ runtime: 95, genres: ['Drama'] }), 3.5));
  const p = buildProfile(items, { now: NOW });
  assert.ok(p.aff.get('n:film-long') < 0, `long films ${p.aff.get('n:film-long')}`);
  assert.ok(p.aff.get('n:film-short') > 0);
  assert.equal(p.evidence.get('n:film-long').n, 3, 'Slow evidence does not count as extra titles');
  const long = scoreTitle(title({ runtime: 165 }), p, { now: NOW }).score;
  const short = scoreTitle(title({ runtime: 98 }), p, { now: NOW }).score;
  assert.ok(short > long);
  assert.equal(p.stats.tags.Slow, 3);
});

test('"Overhyped" makes trending count for less', () => {
  const trending = title({ via: [{ type: 'trending' }] });
  const base = buildProfile([watched(title(), 4)], { now: NOW });
  const jaded = buildProfile([watched(title(), 4, 10, ['Overhyped']), watched(title(), 3, 12, ['Overhyped'])], { now: NOW });
  assert.ok(jaded.stats.hype > 1.5);
  const lift = (p) => scoreTitle(trending, p, { now: NOW }).score - scoreTitle({ ...trending, via: [] }, p, { now: NOW }).score;
  assert.ok(lift(jaded) < lift(base) * 0.6, `${lift(jaded)} vs ${lift(base)}`);
});

// --- streaming services -------------------------------------------------

test('onServices: known yes / known no / not known yet', () => {
  const mine = ['Netflix', 'Crunchyroll'];
  assert.equal(onServices(title({ streaming: ['Netflix'] }), mine), true);
  assert.equal(onServices(title({ streaming: ['Disney+'] }), mine), false);
  assert.equal(onServices(title({ streaming: [] }), mine), false, 'TMDB details with no providers here: not streaming');
  assert.equal(onServices(title({ detailed: false, streaming: undefined }), mine), null, 'list data: unknown');
  assert.equal(onServices(title({ detailed: false, streamHint: true }), mine), true, 'found via your services');
  assert.equal(onServices(title({ source: 'anilist', kind: 'anime', streaming: ['Crunchyroll'] }), mine), true);
  assert.equal(onServices(title({ streaming: ['Netflix'] }), []), null, 'no services picked: no opinion');
});

test('services lift a title, and "only what I can stream" removes the rest', () => {
  const p = buildProfile([], { now: NOW });
  const on = title({ title: 'On', streaming: ['Netflix'], score: 7 });
  const off = title({ title: 'Off', streaming: ['Disney+'], score: 7 });
  const unknown = title({ title: 'Unknown', detailed: false, score: 7 });
  const services = ['Netflix'];
  assert.ok(scoreTitle(on, p, { now: NOW, services }).score > scoreTitle(off, p, { now: NOW, services }).score);
  const boost = buildDeck([off, on, unknown], p, { now: NOW, services, surprise: false });
  assert.equal(boost[0].title.title, 'On');
  assert.equal(boost.length, 3, 'boost alone hides nothing');
  const only = buildDeck([off, on, unknown], p, { now: NOW, services, streamOnly: true, surprise: false });
  assert.deepEqual(only.map((c) => c.title.title).sort(), ['On', 'Unknown'], 'unknowns stay until their details arrive');
  assert.ok(only.find((c) => c.title.title === 'On').reasons.some((r) => r.text === 'On Netflix'), JSON.stringify(only[0].reasons));
});

// --- deck filters -------------------------------------------------------

test('quick watches: films up to 2 hours, series up to 13 episodes', () => {
  assert.equal(isShort(title({ runtime: 118 })), true);
  assert.equal(isShort(title({ runtime: 121 })), false);
  assert.equal(isShort(title({ runtime: null })), null);
  assert.equal(isShort(title({ kind: 'anime', source: 'anilist', episodes: 12 })), true);
  assert.equal(isShort(title({ kind: 'tv', episodes: 19 })), false);
});

test('decades, including "older"', () => {
  assert.equal(inDecade(title({ year: 1997 }), 1990), true);
  assert.equal(inDecade(title({ year: 2001 }), 1990), false);
  assert.equal(inDecade(title({ year: 1966 }), 'older'), true);
  assert.equal(inDecade(title({ year: null }), 2020), false);
  assert.equal(inDecade(title({ year: null }), null), true);
});

test('deck filters narrow the deck; unknown lengths wait for details', () => {
  const p = buildProfile([], { now: NOW });
  const pool = [
    title({ title: 'Short 90s', year: 1994, runtime: 99 }),
    title({ title: 'Long 90s', year: 1997, runtime: 170 }),
    title({ title: 'Short 2020s', year: 2023, runtime: 90 }),
    title({ title: 'Unknown 90s', year: 1995, runtime: null, detailed: false }),
  ];
  const deck = buildDeck(pool, p, { now: NOW, filters: { short: true, decade: 1990 }, surprise: false });
  assert.deepEqual(deck.map((c) => c.title.title).sort(), ['Short 90s', 'Unknown 90s']);
});

// --- hidden series ------------------------------------------------------

test('hiding a series blocks its films and every related anime', () => {
  const block = franchiseBlock([
    { key: 'tmdb:collection:726871', name: 'Dune', ids: ['tmdb:movie:438631', 'tmdb:movie:693134'] },
    { key: 'anilist:franchise:154587', name: 'Frieren', ids: ['anilist:154587', 'anilist:182255'] },
  ]);
  assert.equal(isBlocked(title({ id: 'tmdb:movie:438631' }), block), true, 'by id (list data)');
  assert.equal(isBlocked(title({ id: 'tmdb:movie:1170608', collection: { id: 'tmdb:collection:726871' } }), block), true, 'by collection');
  assert.equal(isBlocked(title({ id: 'anilist:999', source: 'anilist', kind: 'anime', franchiseIds: [182255] }), block), true, 'a later season, by relation');
  assert.equal(isBlocked(title({ id: 'tmdb:movie:1' }), block), false);
  const p = buildProfile([], { now: NOW });
  const deck = buildDeck([title({ id: 'tmdb:movie:438631' }), title({ id: 'tmdb:movie:2' })], p, { now: NOW, surprise: false, hiddenFranchises: [{ key: 'k', ids: ['tmdb:movie:438631'] }] });
  assert.deepEqual(deck.map((c) => c.title.id), ['tmdb:movie:2']);
});

// --- a person's work ----------------------------------------------------

test('rankForYou puts work matching your taste first, and leads above cameos', () => {
  const p = buildProfile([1, 2, 3].map(() => watched(title({ genres: ['Science Fiction'] }), 5)), { now: NOW });
  const ranked = rankForYou([
    title({ title: 'Romcom', genres: ['Romance'], major: true }),
    title({ title: 'Space', genres: ['Science Fiction'], major: true }),
    title({ title: 'Space cameo', genres: ['Science Fiction'], major: false }),
  ], p, { now: NOW });
  assert.deepEqual(ranked.map((r) => r.title.title), ['Space', 'Space cameo', 'Romcom']);
});

// --- new seasons --------------------------------------------------------

const show = (over = {}) => ({
  id: 'tmdb:tv:95396', kind: 'tv', source: 'tmdb', title: 'Severance', airing: false, nextEpisode: null,
  seasonList: [{ number: 1, date: '2022-02-17' }, { number: 2, date: '2025-01-17' }], ...over,
});
const watchedShow = (date, extra = {}) => ({ id: 'tmdb:tv:95396', status: 'watched', title: show(), watches: [{ id: 'w1', date, rating: 5 }], ...extra });

test('a season that premieres after you watched is flagged: out, airing or soon', () => {
  assert.equal(seasonAlert(watchedShow('2025-06-01'), show(), { now: NOW }), null, 'nothing new since');
  const out = seasonAlert(watchedShow('2023-01-01'), show(), { now: NOW });
  assert.deepEqual([out.season, out.state, out.key], [2, 'out', 's2']);
  const s3 = show({ seasonList: [...show().seasonList, { number: 3, date: '2026-10-10' }], airing: true, nextEpisode: { season: 3, episode: 3, date: '2026-10-24' } });
  assert.equal(seasonAlert(watchedShow('2025-06-01'), s3, { now: NOW }).state, 'airing');
  const soon = show({ nextEpisode: { season: 3, episode: 1, date: '2027-01-15' } });
  const a = seasonAlert(watchedShow('2025-06-01'), soon, { now: NOW });
  assert.deepEqual([a.season, a.state, a.date], [3, 'soon', '2027-01-15'], 'premiere known before the season has a date');
});

test('dismissed or not-yet-watched shows stay quiet; alerts sort by urgency', () => {
  assert.equal(seasonAlert(watchedShow('2023-01-01', { dismissed: ['s2'] }), show(), { now: NOW }), null);
  assert.equal(seasonAlert({ ...watchedShow('2023-01-01'), status: 'want' }, show(), { now: NOW }), null);
  const items = {
    a: { ...watchedShow('2023-01-01'), id: 'a' },
    b: { ...watchedShow('2025-06-01'), id: 'b' },
  };
  const shows = { a: show(), b: show({ nextEpisode: { season: 3, episode: 1, date: '2027-01-15' } }) };
  assert.deepEqual(seasonAlerts(items, shows, { now: NOW }).map((x) => x.state), ['out', 'soon']);
  assert.deepEqual(showsToCheck({ x: { status: 'watched', title: { kind: 'film', source: 'tmdb' } }, ...items }).map((i) => i.id), ['b', 'a']);
});

// --- taste over time ----------------------------------------------------

test('itemAsOf replays the library as it stood on a past date', () => {
  const t = title();
  const it = { id: t.id, title: t, status: 'watched', addedAt: iso(100 * DAY), watches: [{ id: 'a', date: iso(90 * DAY).slice(0, 10), rating: 2 }, { id: 'b', date: iso(5 * DAY).slice(0, 10), rating: 5 }] };
  assert.equal(itemAsOf(it, NOW - 200 * DAY), null);
  assert.deepEqual(itemAsOf(it, NOW - 30 * DAY).watches.map((w) => w.rating), [2]);
  assert.equal(itemAsOf(it, NOW).watches.length, 2);
  const want = { id: 'w', title: t, status: 'want', addedAt: iso(10 * DAY), updatedAt: iso(10 * DAY), watches: [] };
  assert.equal(itemAsOf(want, NOW - 20 * DAY), null);
  assert.ok(itemAsOf(want, NOW));
});

test('tasteTimeline shows a genre rising and another fading', () => {
  const items = {};
  const add = (it) => { items[it.id] = it; };
  // Months ago: loved horror. Lately: loved comedies, went off horror.
  for (let i = 0; i < 4; i++) add(watched(title({ genres: ['Horror'] }), 5, 150 + i * 3));
  for (let i = 0; i < 4; i++) add(watched(title({ genres: ['Comedy'] }), 5, 5 + i * 3));
  for (let i = 0; i < 3; i++) add(watched(title({ genres: ['Horror'] }), 1, 20 + i * 2));
  const tl = tasteTimeline(items, { now: NOW, points: 6, stepDays: 30 });
  assert.equal(tl.at.length, 6);
  assert.equal(tl.enough, true);
  const comedy = tl.series.find((s) => s.label === 'Comedy');
  const horror = tl.series.find((s) => s.label === 'Horror');
  assert.ok(comedy && horror, JSON.stringify(tl.series.map((s) => s.label)));
  assert.equal(comedy.trend, 'rising');
  assert.equal(horror.trend, 'fading', 'a faded favourite stays on the chart');
  assert.equal(comedy.values[0], 0, 'before any comedy, affinity is 0');
  const fresh = tasteTimeline({}, { now: NOW });
  assert.equal(fresh.enough, false);
});

test('taste over time takes one snapshot per calendar month, ending now', () => {
  const at = monthEnds(NOW, 6);
  const months = at.map((ms) => new Date(ms).toISOString().slice(0, 7));
  assert.deepEqual(months, ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.equal(at[5], NOW);
  assert.equal(new Date(at[0]).toISOString(), '2026-05-31T23:59:59.999Z');
  assert.equal(tasteTimeline({}, { now: NOW }).at.length, 6);
});

test('explain names a length you rate highly', () => {
  const items = [1, 2, 3, 4].map(() => watched(title({ kind: 'anime', source: 'anilist', episodes: 12, genres: ['Drama'] }), 5));
  const p = buildProfile(items, { now: NOW });
  assert.ok(topFeatures(p, 'length')[0].key === 'n:series-short');
  const t = title({ kind: 'anime', source: 'anilist', episodes: 13, genres: ['Western'], language: 'xx', year: 1950 });
  const reasons = explain(t, scoreTitle(t, p, { now: NOW }), p, { now: NOW });
  assert.ok(reasons.some((r) => r.kind === 'length' && r.text.startsWith('Short series')), JSON.stringify(reasons));
});
