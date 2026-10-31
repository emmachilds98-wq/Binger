// Sync across devices, for a household (you and Dave): each person's library
// is one Firestore document, merged with this device's copy using the
// library's own rules (mergeStates), so nothing here decides what wins.
//
//   users/{uid}                      { household: code }
//   households/{code}                { members: [uid], owner, profiles: [{ id, name, colour }], tmdbKey }
//   households/{code}/profiles/{id}  { state: syncText(library), updatedAt, by }
//
// No DOM here: the app passes in how to read and write libraries.

import { mergeStates, syncText, emptyState } from '../state/library.js';
import { mergeProfileLists, publicList, randomId } from '../state/profiles.js';

const PUSH_AFTER_MS = 1200;
const MAX_DOC = 900000; // Firestore's limit is 1 MiB a document

const householdPath = (code) => ['households', code];
const profilePath = (code, id) => ['households', code, 'profiles', id];

export async function findHousehold(fb, uid) {
  const me = await fb.get(['users', uid]);
  return me && typeof me.household === 'string' ? me.household : null;
}

export async function createHousehold(fb, uid, profiles) {
  const code = randomId(12);
  await fb.set(householdPath(code), { members: [uid], owner: uid, profiles: publicList(profiles), createdAt: fb.now() });
  await fb.set(['users', uid], { household: code });
  return code;
}

// Joining needs only the code: the rules let a signed-in person add
// themselves (and no one else) to a household's members.
export async function joinHousehold(fb, uid, code) {
  try {
    await fb.update(householdPath(code), { members: fb.addMember(uid) });
  } catch (err) {
    if (/not-found|permission-denied/.test(err.code || '')) throw Object.assign(new Error('No household with that code.'), { code: 'not-found' });
    throw err;
  }
  await fb.set(['users', uid], { household: code });
  return fb.get(householdPath(code));
}

export async function leaveHousehold(fb, uid) {
  await fb.set(['users', uid], { household: null });
}

// o: { fb, uid, code, store, currentId, getProfiles, setProfiles,
//      readLocal(profile), writeLocal(profile, state), getKey, setKey, onStatus }
export async function startSync(o) {
  const { fb, uid, code, store } = o;
  const status = (s) => o.onStatus && o.onStatus(s);
  const current = o.currentId;
  status('Syncing…');

  const hh = await fb.get(householdPath(code));
  if (!hh) throw Object.assign(new Error('That household no longer exists.'), { code: 'not-found' });

  // People: everyone the household or this device knows about.
  const profiles = mergeProfileLists(o.getProfiles(), hh.profiles || []);
  o.setProfiles(profiles);
  if (JSON.stringify(publicList(profiles)) !== JSON.stringify(hh.profiles || [])) {
    await fb.update(householdPath(code), { profiles: publicList(profiles) });
  }

  // One TMDB key for the household, so everyone gets films and TV.
  if (hh.tmdbKey && !o.getKey()) o.setKey(hh.tmdbKey);
  else if (!hh.tmdbKey && o.getKey()) await fb.update(householdPath(code), { tmdbKey: o.getKey() });

  const push = async (id, text) => {
    if (text.length > MAX_DOC) { status('This library is too big to sync in one go. Export a backup instead.'); return false; }
    await fb.set(profilePath(code, id), { state: text, updatedAt: fb.now(), by: uid });
    return true;
  };

  // Everyone's library: merge this device's copy with the cloud's, both ways.
  for (const p of profiles.list) {
    const remote = await fb.get(profilePath(code, p.id));
    const remoteState = remote && typeof remote.state === 'string' ? JSON.parse(remote.state) : null;
    const local = p.id === current ? store.get() : o.readLocal(p);
    if (!local && !remoteState) continue;
    const merged = mergeStates(local || emptyState(), remoteState || emptyState());
    const text = syncText(merged);
    if (p.id === current) {
      if (syncText(store.get()) !== text) store.replace(merged);
    } else if (!local || syncText(local) !== text) {
      o.writeLocal(p, merged);
    }
    if (!remote || remote.state !== text) await push(p.id, text);
  }

  // From now on, the current person's library syncs live.
  let lastText = syncText(store.get());
  let timer = null;
  const flush = async () => {
    clearTimeout(timer);
    timer = null;
    try {
      if (await push(current, lastText)) status('Synced');
    } catch (err) {
      status(/unavailable|network/.test(err.code || '') ? 'Offline: changes will sync when you’re back.' : 'Couldn’t sync. Trying again on your next change.');
    }
  };
  const schedule = () => { status('Syncing…'); clearTimeout(timer); timer = setTimeout(flush, PUSH_AFTER_MS); };

  const unsubStore = store.subscribe((next) => {
    const text = syncText(next);
    if (text === lastText) return;
    lastText = text;
    schedule();
  });
  const unsubDoc = fb.watch(profilePath(code, current), (data) => {
    if (!data || typeof data.state !== 'string' || data.state === lastText) return;
    const merged = mergeStates(store.get(), JSON.parse(data.state));
    const text = syncText(merged);
    if (text !== syncText(store.get())) {
      lastText = data.state; // the store change below pushes only if we add to it
      store.replace(merged);
    } else if (text !== data.state) {
      lastText = text;
      schedule();
    }
  }, () => status('Couldn’t reach Firebase.'));
  const unsubHousehold = fb.watch(householdPath(code), (data) => {
    if (!data) return;
    o.setProfiles(mergeProfileLists(o.getProfiles(), data.profiles || []));
    if (data.tmdbKey && data.tmdbKey !== o.getKey()) o.setKey(data.tmdbKey);
  });
  const onHide = () => { if (document.visibilityState === 'hidden' && timer) flush(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide);
  status('Synced');

  return {
    flush,
    async shareKey(key) { await fb.update(householdPath(code), { tmdbKey: key || null }); },
    async saveProfiles(next) { await fb.update(householdPath(code), { profiles: publicList(next) }); },
    async removeProfile(id) { await fb.remove(profilePath(code, id)).catch(() => {}); },
    stop() {
      unsubStore();
      unsubDoc();
      unsubHousehold();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide);
      if (timer) flush();
    },
  };
}
