import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  featuresOf, buildProfile, topFeatures, scoreTitle, quality, freshness, buildDeck,
  rankWatchlist, ratingBaseline, itemSignal, latestRating, explain,
} from '../js/engine/index.js';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const DAY = 86400000;
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

let n = 0;
function title(over = {}) {
  n += 1;
  return {
    id: over.id || `t:${n}`,
    source: 'tmdb',
    kind: 'film',
    title: `Title ${n}`,
    year: 2020,
    releaseDate: '2020-01-01',
    genres: ['Drama'],
    keywords: [],
    cast: [],
    crew: [],
    studios: [],
    language: 'en',
    score: 7,
    votes: 1000,
    ...over,
  };
}
const villeneuve = { id: 'tmdb:p:137427', name: 'Denis Villeneuve', job: 'Director' };
const chalamet = { id: 'tmdb:p:1190668', name: 'Timothée Chalamet', character: 'Paul' };

function watched(t, rating, daysAgo = 10) {
  return { id: t.id, title: t, status: 'watched', addedAt: iso(daysAgo * DAY), updatedAt: iso(daysAgo * DAY), watches: [{ id: 'w' + t.id, date: iso(daysAgo * DAY).slice(0, 10), rating }] };
}
const want = (t, daysAgo = 5) => ({ id: t.id, title: t, status: 'want', addedAt: iso(daysAgo * DAY), updatedAt: iso(daysAgo * DAY), watches: [] });
const passed = (t, daysAgo = 5) => ({ id: t.id, title: t, status: 'passed', addedAt: iso(daysAgo * DAY), updatedAt: iso(daysAgo * DAY), watches: [] });

test('featuresOf covers every group with sensible keys', () => {
  const t = title({ genres: ['Science Fiction', 'Drama'], keywords: ['Desert Planet'], crew: [villeneuve], cast: [chalamet], studios: ['Legendary'], year: 2024 });
  const keys = featuresOf(t).map((f) => f.key);
  assert.deepEqual(keys.sort(), ['c:tmdb:p:137427', 'e:2020', 'g:drama', 'g:science fiction', 'k:desert planet', 'l:en', 'p:tmdb:p:1190668', 's:legendary', 't:film'].sort());
});

test('baseline is pulled toward 3 stars and follows your ratings', () => {
  assert.equal(ratingBaseline([]), 3);
  const generous = Array.from({ length: 20 }, () => watched(title(), 4.5));
  assert.ok(ratingBaseline(generous) > 4);
});

test('ratings map to signed signals, relative to your own baseline', () => {
  const lo = itemSignal(watched(title(), 1), 3).s;
  const mid = itemSignal(watched(title(), 3), 3).s;
  const hi = itemSignal(watched(title(), 5), 3).s;
  assert.ok(lo < 0 && mid === 0 && hi > 0);
  // For someone who rates everything 4.5, a 4 is a little below par.
  assert.ok(itemSignal(watched(title(), 4), 4.5).s < itemSignal(watched(title(), 4), 3).s);
  assert.equal(itemSignal(want(title()), 3).s, 0.5);
  assert.equal(itemSignal(passed(title()), 3).s, -0.2);
});

test('latest rating wins when you rewatch', () => {
  const t = title();
  const it = { id: t.id, title: t, status: 'watched', watches: [{ date: '2025-01-01', rating: 2 }, { date: '2026-06-01', rating: 4.5 }] };
  assert.equal(latestRating(it), 4.5);
});

test('profile learns director and genre likes, and shrinks thin evidence', () => {
  const items = [
    watched(title({ title: 'Arrival', genres: ['Science Fiction'], crew: [villeneuve] }), 5),
    watched(title({ title: 'Sicario', genres: ['Thriller'], crew: [villeneuve] }), 4.5),
    watched(title({ title: 'Tenet', genres: ['Science Fiction', 'Action'] }), 2),
    watched(title({ title: 'Romcom', genres: ['Romance'] }), 1.5),
  ];
  const p = buildProfile(items, { now: NOW });
  const dir = p.aff.get('c:tmdb:p:137427');
  assert.ok(dir > 0.3, `director affinity ${dir}`);
  assert.ok(p.aff.get('g:romance') < 0);
  assert.ok(Math.abs(p.aff.get('g:science fiction')) < dir, 'mixed evidence stays below unanimous evidence');
  assert.equal(p.evidence.get('c:tmdb:p:137427').best.title, 'Arrival');
  assert.equal(p.stats.rated, 4);
  const top = topFeatures(p, 'creator');
  assert.equal(top[0].label, 'Denis Villeneuve');
});

test('old opinions fade: decay makes recent ratings count more', () => {
  const a = title({ genres: ['Horror'] });
  const b = title({ genres: ['Horror'] });
  const old = buildProfile([watched(a, 5, 1500), watched(b, 1, 5)], { now: NOW });
  const fresh = buildProfile([watched(a, 5, 5), watched(b, 1, 1500)], { now: NOW });
  assert.ok(old.aff.get('g:horror') < 0);
  assert.ok(fresh.aff.get('g:horror') > 0);
});

test('people index powers "you know them from"', () => {
  const lw = title({ title: 'Little Women', cast: [chalamet] });
  const p = buildProfile([watched(lw, 4.5)], { now: NOW });
  const rec = p.people.get(chalamet.id);
  assert.equal(rec.titles[0].title, 'Little Women');
});

test('quality shrinks scores with few votes', () => {
  assert.ok(quality(title({ score: 9, votes: 5 })) < quality(title({ score: 8, votes: 5000 })));
  assert.equal(quality(title({ score: null })), 0);
});

test('freshness favours new and airing titles', () => {
  assert.equal(freshness(title({ releaseDate: iso(10 * DAY).slice(0, 10) }), NOW), 1);
  assert.equal(freshness(title({ releaseDate: '2001-01-01' }), NOW), 0);
  assert.equal(freshness(title({ releaseDate: '2001-01-01', airing: true }), NOW), 1);
  assert.equal(freshness(title({ releaseDate: '2010-01-01', lastAirDate: iso(30 * DAY).slice(0, 10) }), NOW), 1);
});

test('a title by a loved director outscores an otherwise identical one', () => {
  const items = [
    watched(title({ title: 'Arrival', crew: [villeneuve], genres: ['Science Fiction'] }), 5),
    watched(title({ title: 'Prisoners', crew: [villeneuve], genres: ['Thriller'] }), 4.5),
  ];
  const p = buildProfile(items, { now: NOW });
  const dune = title({ title: 'Dune', crew: [villeneuve], genres: ['Science Fiction'] });
  const other = title({ title: 'Other', genres: ['Science Fiction'] });
  assert.ok(scoreTitle(dune, p, { now: NOW }).score > scoreTitle(other, p, { now: NOW }).score);
});

test('deck excludes library items and hidden genres, and explains itself', () => {
  const arrival = title({ title: 'Arrival', crew: [villeneuve], genres: ['Science Fiction'] });
  const p = buildProfile([watched(arrival, 5), watched(title({ title: 'Sicario', crew: [villeneuve] }), 5)], { now: NOW });
  const dune = title({ title: 'Dune', crew: [villeneuve], genres: ['Science Fiction'] });
  const horror = title({ title: 'Scary', genres: ['Horror'] });
  const deck = buildDeck([arrival, dune, horror], p, { now: NOW, exclude: new Set([arrival.id]), hiddenGenres: ['Horror'], surprise: false });
  assert.deepEqual(deck.map((d) => d.title.title), ['Dune']);
  assert.ok(deck[0].reasons.some((r) => r.text.startsWith('From Denis Villeneuve')), JSON.stringify(deck[0].reasons));
});

test('seed reasons name the title you loved', () => {
  const p = buildProfile([], { now: NOW });
  const t = title({ via: [{ type: 'seed', seedTitle: 'Arrival', seedRating: 5, strength: 1 }] });
  const [card] = buildDeck([t], p, { now: NOW, surprise: false });
  assert.equal(card.reasons[0].text, 'Because you loved Arrival');
});

test('deck respects the Films / TV / Anime mix', () => {
  const p = buildProfile([], { now: NOW });
  const pool = [];
  for (let i = 0; i < 30; i++) pool.push(title({ kind: 'film', score: 8 }));
  for (let i = 0; i < 30; i++) pool.push(title({ kind: 'anime', source: 'anilist', score: 6 }));
  const deck = buildDeck(pool, p, { now: NOW, size: 20, mix: { film: 50, tv: 50, anime: 50 }, surprise: false });
  const anime = deck.filter((d) => d.title.kind === 'anime').length;
  assert.ok(anime >= 8 && anime <= 12, `anime share ${anime}/20`);
  const noAnime = buildDeck(pool, p, { now: NOW, size: 20, mix: { film: 50, tv: 50, anime: 0 } });
  assert.equal(noAnime.filter((d) => d.title.kind === 'anime').length, 0);
  const onlyAnime = buildDeck(pool, p, { now: NOW, size: 5, kinds: new Set(['anime']) });
  assert.ok(onlyAnime.every((d) => d.title.kind === 'anime'));
});

test('diversity: near-duplicates do not bunch together', () => {
  const p = buildProfile([], { now: NOW });
  const marvel = Array.from({ length: 6 }, () => title({ genres: ['Action', 'Science Fiction'], studios: ['Marvel Studios'], score: 7.6 }));
  const others = Array.from({ length: 6 }, (_, i) => title({ genres: [['Comedy'], ['Romance'], ['Documentary'], ['Western'], ['Crime'], ['History']][i], score: 7.4 }));
  const deck = buildDeck([...marvel, ...others], p, { now: NOW, size: 6, surprise: false });
  const marvelCount = deck.filter((d) => (d.title.studios || []).includes('Marvel Studios')).length;
  assert.ok(marvelCount <= 3, `marvel cards in first 6: ${marvelCount}`);
});

test('surprise slot inserts a well-rated wildcard every 7th card', () => {
  const items = Array.from({ length: 6 }, () => watched(title({ genres: ['Drama'] }), 5));
  const p = buildProfile(items, { now: NOW });
  const pool = [
    ...Array.from({ length: 10 }, () => title({ genres: ['Drama'], score: 7 })),
    title({ title: 'Wildcard', genres: ['Western'], language: 'it', year: 1966, score: 8.5, votes: 9000 }),
  ];
  const deck = buildDeck(pool, p, { now: NOW, size: 8, surprise: true, rng: () => 0 });
  assert.equal(deck[6].title.title, 'Wildcard');
  assert.equal(deck[6].explore, true);
  assert.equal(deck[6].reasons[0].text, 'Something different, and highly rated');
});

test('rankWatchlist puts the best match first', () => {
  const items = [watched(title({ crew: [villeneuve] }), 5), watched(title({ crew: [villeneuve] }), 5)];
  const p = buildProfile(items, { now: NOW });
  const w1 = want(title({ title: 'Meh', score: 6 }));
  const w2 = want(title({ title: 'Dune', crew: [villeneuve], score: 8 }));
  assert.equal(rankWatchlist([w1, w2], p, { now: NOW })[0].item.title.title, 'Dune');
});

test('liked genres fold into a single reason', () => {
  const items = Array.from({ length: 4 }, () => watched(title({ genres: ['Fantasy', 'Comedy', 'Adventure'] }), 5));
  const p = buildProfile(items, { now: NOW });
  const [card] = buildDeck([title({ title: 'New', genres: ['Fantasy', 'Comedy', 'Adventure'] })], p, { now: NOW, surprise: false });
  const genreReasons = card.reasons.filter((r) => r.kind === 'genre');
  assert.equal(genreReasons.length, 1, JSON.stringify(card.reasons));
  assert.match(genreReasons[0].text, /^.+, .+ and .+: genres you love$/);
});

test('wildcards do not claim to match your taste; one cast reason per card', () => {
  const a = { id: 'tmdb:p:1', name: 'Actor A' };
  const b = { id: 'tmdb:p:2', name: 'Actor B' };
  const items = Array.from({ length: 3 }, (_, i) => watched(title({ title: `Seen ${i}`, cast: [a, b], genres: ['Drama'] }), 5));
  const p = buildProfile(items, { now: NOW });
  const [card] = buildDeck([title({ title: 'Both', cast: [a, b], genres: ['Drama'] })], p, { now: NOW, surprise: false });
  assert.equal(card.reasons.filter((r) => r.kind === 'cast').length, 1, JSON.stringify(card.reasons));
  // Explaining the same title as a wildcard drops every taste-based reason.
  const both = title({ title: 'Both again', cast: [a, b], genres: ['Drama'] });
  const scored = scoreTitle(both, p, { now: NOW });
  assert.ok(explain(both, scored, p, { now: NOW }).some((r) => r.kind === 'cast'));
  const asWildcard = explain(both, { ...scored, explore: true }, p, { now: NOW });
  assert.equal(asWildcard[0].kind, 'explore');
  assert.ok(asWildcard.every((r) => !['genre', 'cast', 'creator', 'keyword', 'seed'].includes(r.kind)), JSON.stringify(asWildcard));
});
