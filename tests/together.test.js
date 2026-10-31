// Watch together: one deck for two people (Phase 3, "match with Dave").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile, buildDeck, blend, partnerExclusions } from '../js/engine/index.js';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const DAY = 86400000;
const iso = (ms) => new Date(NOW - ms).toISOString();
let n = 0;
function title(over = {}) {
  n += 1;
  return {
    id: over.id || `t:${n}`, source: 'tmdb', kind: 'film', title: `Title ${n}`, year: 2020, releaseDate: '2020-01-01',
    genres: ['Drama'], keywords: [], cast: [], crew: [], studios: [], language: 'en', score: 7, votes: 1000, detailed: true,
    ...over,
  };
}
function watched(t, rating) {
  return { id: t.id, title: t, status: 'watched', addedAt: iso(10 * DAY), updatedAt: iso(10 * DAY), watches: [{ id: `w${t.id}`, date: iso(10 * DAY).slice(0, 10), rating, tags: [] }] };
}
function library(list) {
  return Object.fromEntries(list.map((it) => [it.id, it]));
}

// Emma loves horror and comedy; Dave loves comedy and can't stand horror.
const emmaItems = library([
  ...[1, 2, 3].map((i) => watched(title({ genres: ['Horror'], title: `Scary ${i}` }), 5)),
  ...[1, 2, 3].map((i) => watched(title({ genres: ['Comedy'], title: `Funny ${i}` }), 5)),
]);
const daveItems = library([
  ...[1, 2, 3].map((i) => watched(title({ genres: ['Horror'], title: `Dave scary ${i}` }), 1)),
  ...[1, 2, 3].map((i) => watched(title({ genres: ['Comedy'], title: `Dave funny ${i}` }), 5)),
]);
const emma = buildProfile(Object.values(emmaItems), { now: NOW });
const dave = { id: 'p-dave', name: 'Dave', profile: buildProfile(Object.values(daveItems), { now: NOW }), items: daveItems };

test('blend: the least keen person counts most', () => {
  assert.ok(blend([0.9, 0.1]) < blend([0.5, 0.5]), 'one love and one hate ranks below two "fine"s');
  assert.equal(blend([0.4]), 0.4);
});

test('together, a comedy you both like beats a horror only Emma likes', () => {
  const horror = title({ id: 'h', genres: ['Horror'], title: 'New horror' });
  const comedy = title({ id: 'c', genres: ['Comedy'], title: 'New comedy' });
  const alone = buildDeck([horror, comedy], emma, { now: NOW, surprise: false, size: 2 });
  const both = buildDeck([horror, comedy], emma, { now: NOW, surprise: false, size: 2, partners: [dave] });
  assert.ok(Math.abs(alone[0].score - alone[1].score) < 0.05, 'on her own Emma likes both about the same');
  assert.equal(both[0].title.id, 'c');
  assert.ok(both[0].reasons.some((r) => r.text === 'Dave loves Comedy'), JSON.stringify(both[0].reasons));
  assert.ok(!both[0].reasons.some((r) => /\b(his|her|he|she)\b/i.test(r.text)), 'reasons name Dave, never guess pronouns');
});

test('together, something on Dave\'s watchlist goes near the top and says so', () => {
  const wanted = title({ id: 'w', genres: ['Drama'], title: 'Quiet drama' });
  const items = { ...daveItems, w: { id: 'w', title: wanted, status: 'want', addedAt: iso(DAY), updatedAt: iso(DAY), watches: [] } };
  const partner = { ...dave, items };
  const other = title({ id: 'o', genres: ['Drama'], title: 'Other drama' });
  const deck = buildDeck([other, wanted], emma, { now: NOW, surprise: false, size: 2, partners: [partner] });
  assert.equal(deck[0].title.id, 'w');
  assert.equal(deck[0].reasons[0].text, 'On Dave’s watchlist');
  assert.deepEqual(deck[0].wantedBy, ['Dave']);
});

test('together leaves out what either of you has watched or passed', () => {
  const passed = title({ id: 'x' });
  const items = { ...daveItems, x: { id: 'x', title: passed, status: 'passed', addedAt: iso(DAY), updatedAt: iso(DAY), watches: [] } };
  const out = partnerExclusions([{ ...dave, items }]);
  assert.ok(out.has('x'));
  for (const id of Object.keys(daveItems)) assert.ok(out.has(id));
});
