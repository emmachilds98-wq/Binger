import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, setStatus, logWatch, updateWatch, deleteWatch, removeItem, restoreItem, forgetPasses,
  watchlist, diary, migrate, exportState, importState, snapshot, updateSettings, DEFAULT_SETTINGS,
  hideFranchise, unhideFranchise, dismissAlert,
} from '../js/state/library.js';
import { createStore } from '../js/state/store.js';
import * as L from '../js/state/library.js';

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

test('hiding a series: one entry per franchise, and it can be undone', () => {
  let s = emptyState(NOW);
  s = hideFranchise(s, { key: 'tmdb:collection:1', name: 'Dune', ids: ['tmdb:movie:1', 'tmdb:movie:1', 'tmdb:movie:2'] });
  s = hideFranchise(s, { key: 'tmdb:collection:1', name: 'Dune', ids: ['tmdb:movie:1', 'tmdb:movie:2', 'tmdb:movie:3'] });
  assert.equal(s.settings.hiddenFranchises.length, 1);
  assert.deepEqual(s.settings.hiddenFranchises[0].ids, ['tmdb:movie:1', 'tmdb:movie:2', 'tmdb:movie:3']);
  assert.equal(hideFranchise(s, null), s);
  s = unhideFranchise(s, 'tmdb:collection:1');
  assert.deepEqual(s.settings.hiddenFranchises, []);
});

test('dismissing a new-season alert is remembered on the item', () => {
  let s = logWatch(emptyState(NOW), t('tv1', { kind: 'tv' }), { rating: 5 }, NOW);
  s = dismissAlert(s, 'tv1', 's3', NOW);
  assert.deepEqual(s.items.tv1.dismissed, ['s3']);
  assert.equal(dismissAlert(s, 'tv1', 's3', NOW), s, 'no-op the second time');
  assert.equal(dismissAlert(s, 'missing', 's3', NOW), s);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(s)), NOW).items.tv1.dismissed, ['s3'], 'survives a reload');
});

test('snapshots keep what "Not this franchise" needs', () => {
  const snap = snapshot(t('a', { collection: { id: 'tmdb:collection:1', name: 'Dune' }, franchiseIds: [2, 3], streaming: ['Netflix'] }));
  assert.deepEqual(snap.collection, { id: 'tmdb:collection:1', name: 'Dune' });
  assert.deepEqual(snap.franchiseIds, [2, 3]);
  assert.equal(snap.streaming, undefined, 'where it streams changes too often to keep');
});

test('migrate fills and repairs the Phase 2 settings', () => {
  const fresh = migrate({ settings: {} }, NOW).settings;
  assert.deepEqual([fresh.services, fresh.streamOnly, fresh.hiddenFranchises], [[], false, []]);
  const junk = migrate({ settings: { services: ['Netflix', 7, null], streamOnly: 'yes', hiddenFranchises: [{ key: 'k', ids: ['a'] }, { name: 'no key' }, 'x'] } }, NOW).settings;
  assert.deepEqual(junk.services, ['Netflix']);
  assert.equal(junk.streamOnly, true);
  assert.deepEqual(junk.hiddenFranchises.map((f) => f.key), ['k']);
});

// --- sync: merging this device's library with the cloud's -------------------

test('mergeStates: the most recent change to an item wins, on both sides', () => {
  const t1 = { id: 'tmdb:movie:1', source: 'tmdb', kind: 'film', title: 'One' };
  const t2 = { id: 'tmdb:movie:2', source: 'tmdb', kind: 'film', title: 'Two' };
  const base = L.setStatus(L.emptyState(0), t1, 'want', 1000);
  const phone = L.logWatch(base, t1, { rating: 4 }, 3000);              // watched it later on the phone
  const pc = L.setStatus(L.setStatus(base, t1, 'want', 2000), t2, 'passed', 2000); // and passed something on the PC
  const a = L.mergeStates(phone, pc, 5000);
  const b = L.mergeStates(pc, phone, 5000);
  assert.equal(a.items[t1.id].status, 'watched');
  assert.equal(a.items[t2.id].status, 'passed');
  assert.equal(L.syncText(a), L.syncText(b), 'same result whichever side merges');
});

test('mergeStates: a delete wins over an older copy, a newer re-add wins over the delete', () => {
  const t = { id: 'anilist:1', source: 'anilist', kind: 'anime', title: 'A' };
  const both = L.setStatus(L.emptyState(0), t, 'want', 1000);
  const removedHere = L.removeItem(both, t.id, 2000);
  assert.ok(removedHere.removed[t.id]);
  assert.equal(L.mergeStates(removedHere, both, 3000).items[t.id], undefined, 'the other copy does not bring it back');
  const readded = L.setStatus(both, t, 'want', 2500);
  assert.equal(L.mergeStates(removedHere, readded, 3000).items[t.id].status, 'want');
  assert.equal(L.mergeStates(removedHere, readded, 3000).removed[t.id], undefined);
});

test('mergeStates: undo beats the change it undid; forgetting passes sticks', () => {
  const t = { id: 'anilist:2', source: 'anilist', kind: 'anime', title: 'B' };
  const wanted = L.setStatus(L.emptyState(0), t, 'want', 1000);
  const passed = L.setStatus(wanted, t, 'passed', 2000);
  const undone = L.restoreItem(passed, t.id, wanted.items[t.id], 3000);
  assert.equal(L.mergeStates(passed, undone, 4000).items[t.id].status, 'want');
  const forgot = L.forgetPasses(passed, 3000);
  assert.equal(L.mergeStates(passed, forgot, 4000).items[t.id], undefined);
});

test('mergeStates: newer settings win but the TMDB key stays on the device; syncText leaves the key out', () => {
  const mine = L.updateSettings(L.emptyState(0), { tmdbKey: 'secret', region: 'GB' }, 1000);
  const theirs = L.updateSettings(L.emptyState(0), { region: 'US', surprise: false }, 2000);
  const m = L.mergeStates(mine, theirs, 3000);
  assert.equal(m.settings.region, 'US');
  assert.equal(m.settings.surprise, false);
  assert.equal(m.settings.tmdbKey, 'secret');
  assert.ok(!L.syncText(m).includes('secret'));
  assert.equal(L.mergeStates(L.emptyState(0), theirs, 3000).settings.region, 'US', 'untouched defaults never beat real settings');
});

test('rated parts: only loved / fine / weak on known parts are kept; editing can clear them', () => {
  let s = logWatch(emptyState(), t('p'), { rating: 4, tags: ['Violent'], aspects: { story: 1, ending: -1, look: 0, plot: 1, sound: 2 } }, NOW);
  const w = s.items[t('p').id].watches[0];
  assert.deepEqual(w.aspects, { story: 1, look: 0, ending: -1 });
  assert.deepEqual(w.tags, ['Violent']);
  s = updateWatch(s, t('p').id, w.id, { aspects: { story: 1 } }, NOW + 1);
  assert.deepEqual(s.items[t('p').id].watches[0].aspects, { story: 1 });
  s = updateWatch(s, t('p').id, w.id, { aspects: {} }, NOW + 2);
  assert.equal('aspects' in s.items[t('p').id].watches[0], false);
  const none = logWatch(emptyState(), t('q'), { rating: 3 }, NOW);
  assert.equal('aspects' in none.items[t('q').id].watches[0], false, 'no parts, no field');
});

test('every feeling tag sits in exactly one group', () => {
  assert.equal(new Set(L.TAGS).size, L.TAGS.length);
  for (const old of ['Gripping', 'Funny', 'Moving', 'Beautiful', 'Clever', 'Comfort watch', 'Rewatchable', 'Slow', 'Confusing', 'Overhyped']) {
    assert.ok(L.TAGS.includes(old), `${old} is still offered, so old diary entries keep it`);
  }
});
