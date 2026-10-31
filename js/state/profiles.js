// People who use Binger on this device (you, Dave...), each with their own
// library and suggestions. Pure functions over the device's profile list:
//   { list: [{ id, name, colour, key }], current: id, askWho: boolean }
// `key` is where that person's library is kept in this browser. The first
// person keeps the original key, so a library from before profiles is theirs.

import { STORAGE_KEY } from './store.js';

export const COLOURS = ['#F5B83D', '#7CC4FF', '#FF9BC2', '#8BE0A4', '#C3A6FF', '#FFB27A'];
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function randomId(length = 12, rand = Math.random) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return out;
}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

export function defaultProfiles(rand = Math.random) {
  const id = `p${randomId(10, rand)}`;
  return { list: [{ id, name: '', colour: COLOURS[0], key: STORAGE_KEY }], current: id, askWho: true };
}

// Accepts anything stored (or nothing) and returns a valid profile list.
export function normaliseProfiles(raw, rand = Math.random) {
  if (!isObj(raw) || !Array.isArray(raw.list)) return defaultProfiles(rand);
  const seen = new Set();
  const list = raw.list.filter((p) => isObj(p) && typeof p.id === 'string' && typeof p.key === 'string' && !seen.has(p.id) && seen.add(p.id))
    .map((p, i) => ({ id: p.id, name: String(p.name || '').slice(0, 30), colour: COLOURS.includes(p.colour) ? p.colour : COLOURS[i % COLOURS.length], key: p.key }));
  if (!list.length) return defaultProfiles(rand);
  const current = list.some((p) => p.id === raw.current) ? raw.current : list[0].id;
  return { list, current, askWho: raw.askWho !== false };
}

export function currentProfile(profiles) {
  return profiles.list.find((p) => p.id === profiles.current) || profiles.list[0];
}

export function displayName(p) {
  return (p && p.name) || 'You';
}

export function nextColour(profiles) {
  return COLOURS.find((c) => !profiles.list.some((p) => p.colour === c)) || COLOURS[profiles.list.length % COLOURS.length];
}

export function addProfile(profiles, { id = `p${randomId(10)}`, name, colour = null }) {
  const clean = String(name || '').trim().slice(0, 30);
  if (!clean) return profiles;
  if (profiles.list.some((p) => p.id === id)) return profiles;
  const entry = { id, name: clean, colour: colour && COLOURS.includes(colour) ? colour : nextColour(profiles), key: `${STORAGE_KEY}:${id}` };
  return { ...profiles, list: [...profiles.list, entry] };
}

export function renameProfile(profiles, id, name) {
  const clean = String(name || '').trim().slice(0, 30);
  if (!clean) return profiles;
  return { ...profiles, list: profiles.list.map((p) => (p.id === id ? { ...p, name: clean } : p)) };
}

// The last person can't be removed (someone has to be watching).
export function removeProfile(profiles, id) {
  if (profiles.list.length < 2) return profiles;
  const list = profiles.list.filter((p) => p.id !== id);
  return { ...profiles, list, current: profiles.current === id ? list[0].id : profiles.current };
}

export function pickProfile(profiles, id) {
  return profiles.list.some((p) => p.id === id) ? { ...profiles, current: id } : profiles;
}

// "This is me": the person on this device becomes someone already in the
// household (same id and name), keeping their library on this device, which
// sync then merges with the cloud's copy.
export function claimProfile(profiles, localId, remote) {
  if (profiles.list.some((p) => p.id === remote.id && p.id !== localId)) return pickProfile(profiles, remote.id);
  return {
    ...profiles,
    list: profiles.list.map((p) => (p.id === localId ? { ...p, id: remote.id, name: remote.name || p.name, colour: remote.colour || p.colour } : p)),
    current: profiles.current === localId ? remote.id : profiles.current,
  };
}

// The household's people (from the cloud) and this device's: everyone in
// either, names and colours as the household has them.
export function mergeProfileLists(profiles, remoteList) {
  let list = profiles.list.map((p) => {
    const r = (remoteList || []).find((x) => x.id === p.id);
    return r ? { ...p, name: r.name || p.name, colour: COLOURS.includes(r.colour) ? r.colour : p.colour } : p;
  });
  for (const r of remoteList || []) {
    if (!list.some((p) => p.id === r.id) && typeof r.id === 'string') {
      list = [...list, { id: r.id, name: String(r.name || ''), colour: COLOURS.includes(r.colour) ? r.colour : COLOURS[list.length % COLOURS.length], key: `${STORAGE_KEY}:${r.id}` }];
    }
  }
  return { ...profiles, list };
}

// What the household document stores about each person (not where this
// device keeps their library).
export function publicList(profiles) {
  return profiles.list.map(({ id, name, colour }) => ({ id, name, colour }));
}

// Grouped so it's easy to read out or type: "abcd-efgh-jkmn".
export function formatCode(code) {
  return String(code || '').replace(/(.{4})(?=.)/g, '$1-');
}

export function parseCode(text) {
  const s = String(text || '').trim();
  const fromLink = s.match(/[#&?]join=([a-z0-9-]+)/i);
  const raw = (fromLink ? fromLink[1] : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  return /^[a-z0-9]{12}$/.test(raw) ? raw : null;
}

// Firebase's web config, pasted as JSON or as the snippet the Firebase console
// shows (`const firebaseConfig = { apiKey: "...", ... };`). Not a secret:
// access is controlled by the security rules (firestore.rules).
export function parseFirebaseConfig(text) {
  const s = String(text || '');
  const out = {};
  for (const k of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']) {
    const m = s.match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`));
    if (m) out[k] = m[1];
  }
  return out.apiKey && out.projectId && out.appId ? { authDomain: `${out.projectId}.firebaseapp.com`, ...out } : null;
}
