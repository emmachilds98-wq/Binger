// Sync between two devices (you and Dave) against an in-memory stand-in for
// the Firebase wrapper (js/sync/firebase.js), so the merge-and-push logic is
// checked without a network or a real project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSync, createHousehold, joinHousehold, findHousehold } from '../js/sync/sync.js';
import { createStore } from '../js/state/store.js';
import * as L from '../js/state/library.js';
import { defaultProfiles, renameProfile, addProfile, claimProfile, parseCode, formatCode, parseFirebaseConfig } from '../js/state/profiles.js';

function fakeCloud() {
  const docs = new Map();
  const watchers = new Map();
  const key = (p) => p.join('/');
  const notify = (k) => { for (const cb of watchers.get(k) || []) cb(docs.has(k) ? structuredClone(docs.get(k)) : null); };
  const UNION = Symbol('union');
  return function client() {
    return {
      async get(p) { return docs.has(key(p)) ? structuredClone(docs.get(key(p))) : null; },
      async set(p, d) { docs.set(key(p), structuredClone(d)); notify(key(p)); },
      async update(p, d) {
        const k = key(p);
        if (!docs.has(k)) throw Object.assign(new Error('missing'), { code: 'not-found' });
        const cur = docs.get(k);
        for (const [f, v] of Object.entries(d)) cur[f] = v && v[UNION] ? [...new Set([...(cur[f] || []), v[UNION]])] : structuredClone(v);
        notify(k);
      },
      async remove(p) { docs.delete(key(p)); notify(key(p)); },
      watch(p, cb) { const k = key(p); if (!watchers.has(k)) watchers.set(k, new Set()); watchers.get(k).add(cb); return () => watchers.get(k).delete(cb); },
      addMember: (uid) => ({ [UNION]: uid }),
      now: () => 'server-time',
    };
  };
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function deviceFor(name, cloud, uid) {
  const storage = memoryStorage();
  let profiles = renameProfile(defaultProfiles(), defaultProfiles().list[0].id, name);
  profiles = { ...profiles, list: profiles.list.map((p) => ({ ...p, name })) };
  const store = createStore({ storage, key: profiles.list[0].key });
  let key = '';
  return {
    fb: cloud(), uid, storage, store,
    get profiles() { return profiles; }, set profiles(p) { profiles = p; },
    opts(code) {
      return {
        fb: this.fb, uid, code, store, currentId: profiles.current,
        getProfiles: () => profiles, setProfiles: (p) => { profiles = p; },
        readLocal: (p) => JSON.parse(storage.getItem(p.key) || 'null'),
        writeLocal: (p, s) => storage.setItem(p.key, JSON.stringify(s)),
        getKey: () => key, setKey: (k) => { key = k; },
      };
    },
    get key() { return key; }, set key(k) { key = k; },
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const film = (id, title) => ({ id, source: 'tmdb', kind: 'film', title });

test('two people, two devices: each keeps their own library, both see each other in the household', async () => {
  const cloud = fakeCloud();
  const me = deviceFor('Emma', cloud, 'uid-emma');
  me.key = 'tmdb-key-123';
  me.store.update(L.setStatus, film('tmdb:movie:1', 'Arrival'), 'want');
  const code = await createHousehold(me.fb, me.uid, me.profiles);
  assert.equal(await findHousehold(me.fb, me.uid), code);
  const mine = await startSync(me.opts(code));

  const dave = deviceFor('Dave', cloud, 'uid-dave');
  dave.store.update(L.logWatch, film('tmdb:movie:2', 'Heat'), { rating: 5 });
  const hh = await joinHousehold(dave.fb, dave.uid, code);
  assert.deepEqual(hh.members, ['uid-emma', 'uid-dave']);
  const his = await startSync(dave.opts(code));

  assert.equal(dave.key, 'tmdb-key-123', 'the household TMDB key reaches Dave');
  assert.deepEqual(dave.profiles.list.map((p) => p.name).sort(), ['Dave', 'Emma'], 'Dave sees both people');
  assert.ok(dave.store.get().items['tmdb:movie:2'] && !dave.store.get().items['tmdb:movie:1'], 'Dave’s library is his own');
  const emmaOnDavesPhone = dave.profiles.list.find((p) => p.name === 'Emma');
  assert.ok(JSON.parse(dave.storage.getItem(emmaOnDavesPhone.key)).items['tmdb:movie:1'], 'Emma’s library is on Dave’s phone, under her name');
  mine.stop(); his.stop();
});

test('the same person on two devices: a change on one reaches the other, and nothing echoes forever', async () => {
  const cloud = fakeCloud();
  const phone = deviceFor('Emma', cloud, 'uid-emma');
  const code = await createHousehold(phone.fb, phone.uid, phone.profiles);
  const a = await startSync(phone.opts(code));
  const pc = deviceFor('Emma', cloud, 'uid-emma');
  pc.profiles = claimProfile(pc.profiles, pc.profiles.current, phone.profiles.list[0]);
  const b = await startSync(pc.opts(code));

  phone.store.update(L.setStatus, film('tmdb:movie:3', 'Past Lives'), 'want');
  await a.flush();
  await wait(5);
  assert.equal(pc.store.get().items['tmdb:movie:3'].status, 'want', 'the PC has it');
  pc.store.update(L.removeItem, 'tmdb:movie:3');
  await b.flush();
  await wait(5);
  assert.equal(phone.store.get().items['tmdb:movie:3'], undefined, 'removing it on the PC removes it on the phone');
  a.stop(); b.stop();
});

test('invite codes and Firebase config are read from what people actually paste', () => {
  assert.equal(parseCode('https://x.github.io/Binger/#join=abcd2345efgh'), 'abcd2345efgh');
  assert.equal(parseCode(' ABCD-2345-EFGH '), 'abcd2345efgh');
  assert.equal(parseCode('nope'), null);
  assert.equal(formatCode('abcd2345efgh'), 'abcd-2345-efgh');
  const cfg = parseFirebaseConfig('const firebaseConfig = {\n  apiKey: "AIza-x",\n  authDomain: "binger.firebaseapp.com",\n  projectId: "binger",\n  appId: "1:2:web:3"\n};');
  assert.deepEqual(cfg, { authDomain: 'binger.firebaseapp.com', apiKey: 'AIza-x', projectId: 'binger', appId: '1:2:web:3' });
  assert.equal(parseFirebaseConfig('{"apiKey":"k"}'), null);
  const two = addProfile(defaultProfiles(), { name: 'Dave' });
  assert.equal(two.list.length, 2);
  assert.notEqual(two.list[0].key, two.list[1].key, 'each person has their own library');
});
