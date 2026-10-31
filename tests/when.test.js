// Rough dates: "In a year" and "Ages ago" for long-time favourites
// (watch.when in js/state/library.js). The date only sorts the diary; it
// doesn't make the rating count for less, or set off new-season alerts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/state/library.js';
import { itemSignal, seasonAlert } from '../js/engine/index.js';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const show = { id: 'tmdb:tv:1', kind: 'tv', source: 'tmdb', mediaType: 'tv', sourceId: 1, title: 'A Show' };

test('a watch can be roughly dated: a year, or ages ago', () => {
  let s = L.logWatch(L.emptyState(NOW), show, { rating: 5, date: '2014-06-10', when: 'year' }, NOW);
  assert.deepEqual(pick(s.items[show.id].watches[0]), { date: '2014-01-01', when: 'year' });
  s = L.logWatch(L.emptyState(NOW), show, { rating: 5, when: 'ages' }, NOW);
  assert.deepEqual(pick(s.items[show.id].watches[0]), { date: L.AGES_AGO, when: 'ages' });
  s = L.logWatch(L.emptyState(NOW), show, { rating: 5, date: '2026-10-01' }, NOW);
  assert.deepEqual(pick(s.items[show.id].watches[0]), { date: '2026-10-01' });
});

test('editing a rough date to an exact day clears "when", and back again', () => {
  let s = L.logWatch(L.emptyState(NOW), show, { rating: 4, when: 'ages' }, NOW);
  const w = s.items[show.id].watches[0];
  s = L.updateWatch(s, show.id, w.id, { date: '2025-03-02', when: null }, NOW);
  assert.deepEqual(pick(s.items[show.id].watches[0]), { date: '2025-03-02' });
  s = L.updateWatch(s, show.id, w.id, { date: '2019-01-01', when: 'year' }, NOW);
  assert.deepEqual(pick(s.items[show.id].watches[0]), { date: '2019-01-01', when: 'year' });
  s = L.updateWatch(s, show.id, w.id, { rating: 3 }, NOW);
  assert.equal(s.items[show.id].watches[0].when, 'year', 'changing only the rating keeps the date as it was');
});

test('a long-time favourite counts as today’s opinion, not one from 1900', () => {
  const s = L.logWatch(L.emptyState(NOW), show, { rating: 5, when: 'ages' }, NOW);
  const sig = itemSignal(s.items[show.id], 3);
  assert.equal(sig.at, NOW - (NOW % 1000), 'weighted from when it was logged');
  const exact = L.logWatch(L.emptyState(NOW), show, { rating: 5, date: '2016-01-01' }, NOW);
  assert.equal(itemSignal(exact.items[show.id], 3).at, Date.parse('2016-01-01'), 'an exact old date still counts as old');
});

test('"ages ago" doesn’t announce every season as new; "in a year" counts from the end of it', () => {
  const details = { ...show, seasonList: [{ number: 1, date: '2015-01-01' }, { number: 2, date: '2018-01-01' }, { number: 3, date: '2027-01-15' }] };
  const ages = L.logWatch(L.emptyState(NOW), show, { rating: 5, when: 'ages' }, NOW).items[show.id];
  assert.equal(seasonAlert(ages, details, { now: NOW }).season, 3, 'only a season after you logged it');
  const y2015 = L.logWatch(L.emptyState(NOW), show, { rating: 5, date: '2015-01-01', when: 'year' }, NOW).items[show.id];
  assert.equal(seasonAlert(y2015, details, { now: NOW }).season, 2, 'the first season after that year');
});

function pick(w) {
  return w.when ? { date: w.date, when: w.when } : { date: w.date };
}
