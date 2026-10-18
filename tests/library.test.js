import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, setStatus, logWatch, updateWatch, deleteWatch, removeItem, restoreItem, forgetPasses,
  watchlist, diary, migrate, exportState, importState, snapshot, updateSettings, DEFAULT_SETTINGS,
} from '../js/state/library.js';
import { createStore } from '../js/state/store.js';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const t = (id, extra = {}) => ({ id, source: 'tmdb', kind: 'film', title: `T ${id}`, genres: ['Drama'], cast: [], crew: [], providers: { stream: [] }, ...extra });

test('swipes set status; watching beats wanting; passes never overwrite a watch', () => {
  let s = emptyState(NOW);
  s = setStatus(s, t('a'), 'want', NOW);
  assert.equal(s.items.a.status, 'want');
  s = logWatch(s, t('a'), { rating: 4.5, tags: ['Moving'], review: 'Lovely' }, NOW + 1000);
  assert.equal(s.items.a.status, 'watched');
  assert.equal(s.items.a.addedAt, new Date(NOW).toISOString(), 'keeps when it was first added');
  const same = setStatus(s, t('a'), 'passed', NOW + 2000);
  assert.equal(same, s, 'no-op');
});

test('logWatch: rounds to half stars, supports rewatches, dates default to today', () => {
  let s = emptyState(NOW);
  s = logWatch(s, t('a'), { rating: 4.26 }, NOW);
  s = logWatch(s, t('a'), { rating: 9, date: '2026-10-20' }, NOW + 1);
  const w = s.items.a.watches;
  assert.equal(w.length, 2);
  assert.equal(w[0].rating, 4.5);
  assert.equal(w[0].date, '2026-10-18');
  assert.equal(w[1].rating, 5);
  const rows = diary(s);
  assert.equal(rows[0].watch.date, '2026-10-20', 'newest first');
});

test('editing and deleting diary entries', () => {
  let s = logWatch(emptyState(NOW), t('a'), { rating: 3 }, NOW);
  const wid = s.items.a.watches[0].id;
  s = updateWatch(s, 'a', wid, { rating: 2.2, review: 'Worse on reflection' }, NOW);
  assert.equal(s.items.a.watches[0].rating, 2);
  assert.equal(s.items.a.watches[0].review, 'Worse on reflection');
  s = deleteWatch(s, 'a', wid, NOW);
  assert.equal(s.items.a, undefined, 'deleting the only watch removes the title');
});

test('undo restores exactly the previous item', () => {
  const s0 = setStatus(emptyState(NOW), t('a'), 'want', NOW);
  const prev = s0.items.b;
  const s1 = setStatus(s0, t('b'), 'passed', NOW);
  const s2 = restoreItem(s1, 'b', prev);
  assert.deepEqual(s2.items, s0.items);
  assert.ok(s1.items.b, 'original states are not mutated');
});

test('watchlist / forgetPasses / removeItem', () => {
  let s = emptyState(NOW);
  s = setStatus(s, t('a'), 'want', NOW);
  s = setStatus(s, t('b'), 'want', NOW + 5);
  s = setStatus(s, t('c'), 'passed', NOW);
  assert.deepEqual(watchlist(s).map((i) => i.id), ['b', 'a']);
  s = forgetPasses(s);
  assert.equal(s.items.c, undefined);
  s = removeItem(s, 'a');
  assert.deepEqual(Object.keys(s.items), ['b']);
});

test('snapshot drops bulky data and caps sizes', () => {
  const snap = snapshot(t('a', { overview: 'x'.repeat(5000), cast: Array.from({ length: 20 }, (_, i) => ({ id: i, name: 'n', extra: 1 })) }));
  assert.equal(snap.providers, undefined);
  assert.equal(snap.cast.length, 8);
  assert.equal(snap.cast[0].extra, undefined);
  assert.ok(snap.overview.length <= 1200);
});

test('migrate repairs junk and fills defaults', () => {
  assert.deepEqual(migrate(null, NOW).items, {});
  const m = migrate({ settings: { mix: { anime: 0 } }, items: { a: { title: { id: 'a' }, status: 'want' }, bad: { title: { id: 'x' }, status: 'want' }, b: { status: 'weird', title: { id: 'b' } } } }, NOW);
  assert.deepEqual(Object.keys(m.items), ['a']);
  assert.deepEqual(m.items.a.watches, []);
  assert.deepEqual(m.settings.mix, { film: 50, tv: 50, anime: 0 });
  assert.equal(m.settings.region, DEFAULT_SETTINGS.region);
});

test('export never contains the TMDB key; import merges by newest edit', () => {
  let mine = updateSettings(emptyState(NOW), { tmdbKey: 'secret-key' });
  mine = logWatch(mine, t('a'), { rating: 4 }, NOW);
  mine = setStatus(mine, t('b'), 'want', NOW);
  const file = exportState(mine, NOW);
  assert.ok(!file.includes('secret-key'));

  let theirs = logWatch(emptyState(NOW), t('a'), { rating: 2 }, NOW + 10);
  theirs = setStatus(theirs, t('c'), 'want', NOW);
  const merged = importState(exportState(theirs), mine, { mode: 'merge' });
  assert.equal(merged.items.a.watches.length, 2, 'both watches kept');
  assert.ok(merged.items.b && merged.items.c);
  assert.equal(merged.settings.tmdbKey, 'secret-key');

  const replaced = importState(exportState(theirs), mine, { mode: 'replace' });
  assert.equal(replaced.items.b, undefined);
  assert.equal(replaced.settings.tmdbKey, 'secret-key', 'your key survives a restore');
  assert.throws(() => importState('{nope', mine), /not JSON/);
  assert.throws(() => importState('{"app":"other","items":{}}', mine), /isn't a Binger backup/);
});

test('store persists, notifies, and survives corrupt storage', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const store = createStore({ storage });
  let calls = 0;
  store.subscribe(() => calls++);
  store.update(setStatus, t('a'), 'want', NOW);
  assert.equal(calls, 1);
  assert.equal(createStore({ storage }).get().items.a.status, 'want');
  mem.set('binger:v1', '{corrupt');
  assert.deepEqual(createStore({ storage }).get().items, {});
  const failing = createStore({ storage: { getItem: () => null, setItem: () => { throw new Error('quota'); } }, onSaveError: () => calls++ });
  failing.update(setStatus, t('a'), 'want', NOW);
  assert.equal(calls, 2);
});

test('passes keep a slim snapshot so a long history fits in browser storage', () => {
  const big = t('p', { overview: 'x'.repeat(800), backdrop: 'b.jpg', trailer: { site: 'youtube', key: 'k' }, keywords: Array.from({ length: 12 }, (_, i) => `k${i}`), cast: Array.from({ length: 8 }, (_, i) => ({ id: i, name: `n${i}`, character: 'c', photo: 'p.jpg' })) });
  const wantSize = JSON.stringify(setStatus(emptyState(NOW), big, 'want', NOW).items.p).length;
  const passed = setStatus(emptyState(NOW), big, 'passed', NOW, [{ type: 'trending' }]).items.p;
  assert.equal(passed.title.overview, undefined);
  assert.equal(passed.via, undefined);
  assert.deepEqual(passed.title.cast[0], { id: 0, name: 'n0' });
  assert.ok(JSON.stringify(passed).length < wantSize / 2, `${JSON.stringify(passed).length} vs ${wantSize}`);
});
