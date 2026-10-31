// Binger's controller: owns the store, the data sources and the deck, and
// wires the UI modules together. All state is declared at the top and init()
// runs at the very bottom, so nothing at load time can reach a not-yet-declared
// const (see CLAUDE.md, "Load order").

import { CONFIG } from './config.js';
import { createStore, STORAGE_KEY } from './state/store.js';
import * as L from './state/library.js';
import { createCache, createMemoryCache } from './state/cache.js';
import { createTmdb } from './sources/tmdb.js';
import { createAniList } from './sources/anilist.js';
import { createRatings } from './sources/ratings.js';
import { gatherCandidates, hydrate, needsHydrating } from './sources/candidates.js';
import { buildProfile, buildDeck, explain, scoreTitle, warmth, tasteTimeline } from './engine/index.js';
import { renderDiscover } from './ui/deck.js';
import { openDetail, detailPanel } from './ui/detail.js';
import { openRate } from './ui/rate.js';
import { renderLibrary } from './ui/library.js';
import { renderTaste } from './ui/taste.js';
import { openSearch } from './ui/search.js';
import { openSettings } from './ui/settings.js';
import { openOnboarding } from './ui/onboarding.js';
import { openFilters } from './ui/filters.js';
import { openServices, servicesSummary } from './ui/services.js';
import { regionName } from './ui/settings.js';
import { serviceChoices, loadPerson, hasFranchise, loadFranchise, checkNewSeasons, searchTitles, starterTitles } from './sources/lookups.js';
import { openPerson } from './ui/person.js';
import { toast, anySheetOpen, choiceSheet } from './ui/sheet.js';
import { loadDevice, saveDevice } from './state/device.js';
import {
  currentProfile, displayName, addProfile, renameProfile, removeProfile, pickProfile, claimProfile,
  parseCode, parseFirebaseConfig, formatCode,
} from './state/profiles.js';
import { connectFirebase, authMessage } from './sync/firebase.js';
import { startSync, findHousehold, readHousehold, createHousehold, joinHousehold } from './sync/sync.js';
import { openWhoIsWatching, openPeople, openWelcome, askName, shareOrCopy } from './ui/people.js';
import { openShortcuts } from './ui/shortcuts.js';

// ---- state -----------------------------------------------------------------

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const TABS = ['discover', 'library', 'taste'];
const DECK_SIZE = 30;
const REFILL_BELOW = 8;
const DETAIL_AHEAD = 6;

// This device: who uses it (each person has their own library), the TMDB key
// and the sync setup. The library loaded is the current person's.
const device = loadDevice();
const store = createStore({ key: currentProfile(device.profiles).key, onSaveError: () => toast('Couldn’t save: this browser’s storage is full or blocked.') });
// Sync across devices (Firebase), once set up and signed in.
const sync = { fb: null, loading: null, user: null, ctl: null, status: '', error: '', busy: false, pendingCode: null };
let peopleSheet = null;
// The first-visit welcome (sign in, or just a name) while it's open.
let welcome = null;
let cache = createMemoryCache();
let tmdb = null;
let anilist = null;
let ratings = null; // review scores (MDBList), when the site has a key for them
let profile = buildProfile(store.get().items);

const deck = {
  pool: new Map(),   // every candidate seen this session, by id
  cards: [],         // ranked, filtered, ready to show
  topId: null,       // the card on top stays on top while the rest re-rank
  loading: false,
  queued: false,     // a forced refill asked for while one was running
  errors: [],
  filter: 'all',
  filters: { short: false, decade: null }, // length and decade, this session only
  undo: [],          // [{ id, prev, title }]
  pages: {},         // which page each pull has reached this session (turnPage)
  pendingRender: false,
  warnedKey: false,
};
const ui = { tab: 'discover', libraryTab: 'watchlist', librarySort: 'match' };
let discoverHandle = null;
let onboarding = null;
// New seasons of TV you've watched (Phase 2 step 4), and what they were
// worked out from, so they're only re-checked when your TV diary changes.
const seasons = { alerts: [], basis: '', checking: null };
// Taste over time rebuilds your profile at six points, so it's worked out
// once per library change, not on every render.
const timelineMemo = { items: null, value: null };
// Wide enough for the top card's details to sit beside the deck
// (docs/DESIGN.md → PC and tablet layout). CSS uses the same width.
const wideQuery = window.matchMedia('(min-width: 900px)');

// ---- sources ---------------------------------------------------------------

// The key built into the site wins (decision 4): Settings has no key field
// there, so nothing saved on a device can override it. A copy with no key
// built in uses yours, or your household's.
function tmdbKey() {
  return CONFIG.tmdbKey || store.get().settings.tmdbKey || device.tmdbKey || '';
}

function makeSources() {
  const s = store.get().settings;
  tmdb = createTmdb({ key: tmdbKey(), region: s.region, cache });
  anilist = createAniList({ cache, voiceLanguage: s.voiceLanguage });
  ratings = createRatings({ key: CONFIG.mdblistKey, cache });
}

async function enrich(t) {
  if (!needsHydrating(t, { tmdb, ratings })) return t;
  const [full] = await hydrate([t], { tmdb, ratings });
  return full;
}

// Search and the first-run grid live in js/sources/lookups.js (ranking,
// service names, which lists to ask for); these just pass the sources in.
function searchAll(q) {
  return searchTitles(q, { tmdb, anilist });
}

function loadPopular(page = 1) {
  return starterTitles({ tmdb, anilist, page });
}

// ---- deck ------------------------------------------------------------------

function rerank() {
  const { settings, items } = store.get();
  const cards = buildDeck([...deck.pool.values()], profile, {
    exclude: new Set(Object.keys(items)),
    hiddenGenres: settings.hiddenGenres,
    hiddenFranchises: settings.hiddenFranchises,
    kinds: deck.filter === 'all' ? null : new Set([deck.filter]),
    mix: tmdb && tmdb.hasKey ? settings.mix : { ...settings.mix, film: 0, tv: 0 },
    filters: deck.filters,
    services: settings.services,
    streamOnly: settings.streamOnly,
    surprise: settings.surprise,
    preferFresh: settings.preferFresh,
    size: DECK_SIZE,
  });
  if (deck.topId) {
    const i = cards.findIndex((c) => c.title.id === deck.topId);
    if (i > 0) cards.unshift(cards.splice(i, 1)[0]);
  }
  deck.cards = cards;
  deck.topId = cards[0] ? cards[0].title.id : null;
}

async function refill({ force = false } = {}) {
  if (!anilist) return;
  if (deck.loading) {
    // e.g. a TMDB key added while the first deck is still loading: run again after.
    if (force) deck.queued = true;
    return;
  }
  if (!force && deck.cards.length >= REFILL_BELOW) return;
  deck.loading = true;
  renderDiscoverView();
  try {
    const { pool, errors } = await gatherCandidates({ tmdb, anilist, items: store.get().items, profile, settings: store.get().settings, filters: deck.filters, pages: deck.pages });
    for (const t of pool) {
      const had = deck.pool.get(t.id);
      if (!had) deck.pool.set(t.id, t);
      else if ((t.detailed && !had.detailed) || (t.streamHint && !had.streamHint)) {
        const better = t.detailed || !had.detailed ? t : had;
        deck.pool.set(t.id, { ...better, via: had.via.length ? had.via : t.via, streamHint: had.streamHint || t.streamHint });
      }
    }
    deck.errors = errors;
    const rejected = errors.find((e) => e.source === 'tmdb' && e.status === 401);
    if (rejected && !deck.warnedKey) {
      deck.warnedKey = true;
      if (CONFIG.tmdbKey) toast('Films and TV can’t load right now: TMDB turned down this site’s key.');
      else toast('TMDB didn’t accept your key. Check it in Settings.', { action: { label: 'Settings', fn: showSettings } });
    }
    rerank();
    await ensureDetails();
  } finally {
    deck.loading = false;
    renderDiscoverView();
    if (deck.queued) {
      deck.queued = false;
      refill({ force: true });
    }
  }
}

// List results lack cast, keywords, trailers, runtime and streaming info:
// fetch them for the next few cards. With filters on ("Quick watches", "Only
// what I can stream") some of those then drop out and others move up, so go
// round again (a few times at most) until the next few cards are all known.
async function ensureDetails() {
  for (let round = 0; round < 3; round++) {
    const need = deck.cards.slice(0, DETAIL_AHEAD).map((c) => c.title).filter((t) => needsHydrating(t, { tmdb, ratings }));
    if (!need.length) return;
    const full = await hydrate(need, { tmdb, ratings });
    let changed = false;
    for (const [i, t] of full.entries()) {
      if (t === need[i]) continue; // nothing came back for it
      if (t.animeLike) deck.pool.delete(t.id); else deck.pool.set(t.id, t);
      changed = true;
    }
    if (!changed) return;
    rerank();
  }
}

function afterDeckChange() {
  if (deck.cards.length < REFILL_BELOW) refill();
  ensureDetails().then(() => renderDiscoverView()).catch(() => {});
  // Warm the browser cache for the next posters.
  deck.cards.slice(1, 6).forEach((c) => { if (c.title.poster) { const img = new Image(); img.src = c.title.poster; } });
}

function pushUndo(title, prev) {
  deck.undo.push({ id: title.id, prev: prev || null, title });
  if (deck.undo.length > 20) deck.undo.shift();
}

function deckAction(dir, card) {
  const t = card.title;
  const prev = store.get().items[t.id];
  if (dir === 'up') {
    openRate(t, {
      onSave: (w) => { pushUndo(t, prev); deck.topId = null; store.update(L.logWatch, t, w); toast('Saved to your diary'); afterDeckChange(); },
      onSkip: () => { pushUndo(t, prev); deck.topId = null; store.update(L.logWatch, t, {}); toast('Marked as watched'); afterDeckChange(); },
    });
    return;
  }
  pushUndo(t, prev);
  deck.topId = null;
  store.update(L.setStatus, t, dir === 'right' ? 'want' : 'passed', Date.now(), t.via);
  if (dir === 'right') toast('Added to your Watchlist', { action: { label: 'Undo', fn: undo } });
  else if (hasFranchise(t)) toast('Passed', { action: { label: hideSeriesLabel(t), fn: () => hideSeries(t) }, ms: 4000 });
  afterDeckChange();
}

// "Not this franchise" (Phase 2 step 3): resolved once, when you hide it,
// into every title in the series, so the deck never has to look it up again.
function hideSeriesLabel(t) {
  return t.source === 'tmdb' && t.collection ? `Hide all ${t.collection.name} films` : 'Hide this whole series';
}

async function hideSeries(t) {
  const f = await loadFranchise(t, { tmdb, anilist });
  if (!f) return;
  store.update(L.hideFranchise, f);
  toast(`${f.name} is hidden`, { action: { label: 'Undo', fn: () => store.update(L.unhideFranchise, f.key) }, ms: 4000 });
}

function isSeriesHidden(t) {
  return store.get().settings.hiddenFranchises.some((f) => f.ids.includes(t.id));
}

function undo() {
  const last = deck.undo.pop();
  if (!last) return;
  if (!deck.pool.has(last.id)) deck.pool.set(last.id, last.title);
  deck.topId = last.id;
  store.update(L.restoreItem, last.id, last.prev);
  if (ui.tab !== 'discover') location.hash = '#discover';
}

function setFilter(key) {
  deck.filter = key;
  deck.topId = null;
  rerank();
  renderDiscoverView({ force: true });
  if (deck.cards.length < REFILL_BELOW) refill({ force: true });
}

// Length and decade apply now and fetch titles that fit (this week's
// trending list has no 1990s films in it). "Only what I can stream" is a
// saved setting, so it goes through the store.
function applyDeckFilters(filters, streamOnly) {
  deck.filters = { short: !!filters.short, decade: filters.decade ?? null };
  deck.pages = {}; // a new length or decade starts every list from its first pages again
  deck.topId = null;
  if (!!store.get().settings.streamOnly !== !!streamOnly) {
    store.update(L.updateSettings, { streamOnly: !!streamOnly }); // the subscriber refills
    return;
  }
  rerank();
  renderDiscoverView({ force: true });
  refill({ force: true });
}

function showFilters() {
  const s = store.get().settings;
  openFilters({
    filters: deck.filters,
    streamOnly: s.streamOnly,
    services: s.services,
    onPickServices: () => showServices(),
    onApply: applyDeckFilters,
  });
}

// "Your services". Saved on Done; the store subscriber clears the pool and
// refills when the services or "only what I can stream" change.
function showServices(after = null) {
  const s = store.get().settings;
  openServices({
    picked: s.services,
    streamOnly: s.streamOnly,
    hasKey: tmdb.hasKey,
    regionName: regionName(s.region),
    loadChoices: (picked) => serviceChoices({ tmdb, picked }),
    onDone: ({ services, streamOnly }) => {
      // "Only what I can stream" with nothing picked would empty the deck.
      store.update(L.updateSettings, { services, streamOnly: services.length ? streamOnly : false });
      toast(services.length ? `Your services: ${servicesSummary(services)}` : 'No services picked');
      if (after) after();
    },
  });
}

// A person's other work, best for you first.
function showPerson(stub) {
  openPerson(stub, {
    profile,
    services: store.get().settings.services,
    hasKey: tmdb.hasKey,
    load: (id) => loadPerson(id, { tmdb, anilist }),
    itemOf: (id) => store.get().items[id] || null,
    onOpen: (t) => showDetail(t),
    onSeen: (t) => logSeen(t),
    onWant: (t) => addToWatchlist(t),
  });
}

// ---- new seasons -------------------------------------------------------------

// What the alerts depend on: the key, and each watched show's latest diary
// date and dismissed seasons.
function seasonsBasis() {
  const { items } = store.get();
  const tv = Object.values(items).filter((it) => it.status === 'watched' && it.title && it.title.kind === 'tv')
    .map((it) => `${it.id}:${(it.watches || []).map((w) => w.date).sort().pop() || ''}:${(it.dismissed || []).join(',')}`).sort();
  return `${tmdbKey() ? 1 : 0}|${tv.join('|')}`;
}

async function refreshSeasons() {
  const basis = seasonsBasis();
  if (basis === seasons.basis) return;
  seasons.basis = basis;
  const job = checkNewSeasons({ tmdb, items: store.get().items }).catch(() => []);
  seasons.checking = job;
  const alerts = await job;
  if (seasons.checking !== job) return; // a newer check has started
  seasons.alerts = alerts;
  showLibraryDot();
  if (ui.tab === 'library') render();
}

function showLibraryDot() {
  const tab = tabbar.querySelector('[data-tab="library"]');
  if (!tab) return;
  const n = seasons.alerts.length;
  tab.classList.toggle('has-alert', n > 0);
  if (n) tab.setAttribute('aria-label', `Library, ${n} show${n === 1 ? '' : 's'} back with new episodes`);
  else tab.removeAttribute('aria-label');
}

function dismissSeason(alert) {
  seasons.alerts = seasons.alerts.filter((a) => a !== alert);
  showLibraryDot();
  store.update(L.dismissAlert, alert.id, alert.key);
}

// ---- people and sync --------------------------------------------------------

// The chip on each screen: whose library this is. Shown once there's more
// than one person (or sync is on).
function who() {
  const p = device.profiles;
  return p.list.length > 1 || device.household ? { profile: currentProfile(p), onClick: showWho } : null;
}

function setProfiles(next, { fromSync = false } = {}) {
  if (JSON.stringify(next) === JSON.stringify(device.profiles)) return;
  device.profiles = next;
  saveDevice(device);
  if (!fromSync && sync.ctl) sync.ctl.saveProfiles(next).catch(() => {});
  if (ui.tab === 'discover') renderDiscoverView({ force: true }); else render();
  refreshPeople();
}

// "Who's watching?": picking someone else loads their library (a reload is
// the simplest way to swap every piece of state at once).
function showWho({ atStart = false } = {}) {
  openWhoIsWatching({
    profiles: device.profiles,
    onAskWho: (v) => setProfiles({ ...device.profiles, askWho: v }),
    onDone: (choice) => {
      if (atStart) afterWho();
      if (choice === 'add') addPerson();
      else if (choice === 'manage') showPeople();
      else if (choice) switchTo(choice);
    },
  });
}

async function switchTo(id) {
  if (id === device.profiles.current) return;
  setProfiles(pickProfile(device.profiles, id));
  if (sync.ctl) await Promise.race([sync.ctl.flush(), new Promise((r) => setTimeout(r, 1500))]);
  try { sessionStorage.setItem('binger:switched', id); } catch { /* private mode */ }
  location.hash = '#discover';
  location.reload();
}

async function nameMe() {
  const me = currentProfile(device.profiles);
  if (me.name) return true;
  const name = await askName({ title: 'What’s your name?', hint: 'So everyone can tell whose library is whose.' });
  if (!name) return false;
  setProfiles(renameProfile(device.profiles, me.id, name));
  return true;
}

async function addPerson() {
  if (!(await nameMe())) return;
  const name = await askName({ title: 'Add a person', label: 'Their name', confirmLabel: 'Add', hint: 'They get their own watchlist, diary and suggestions.' });
  if (!name) return;
  const next = addProfile(device.profiles, { name });
  setProfiles(next);
  const added = next.list[next.list.length - 1];
  toast(`${name} added`, { action: { label: `Switch to ${name}`, fn: () => switchTo(added.id) }, ms: 4000 });
}

function readLibrary(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeLibrary(key, state) {
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { toast('Couldn’t save: this browser’s storage is full or blocked.'); }
}

// A config pasted on this device wins over the deployment's, like the TMDB
// key (and it's how the sync test points the app at the emulators).
function firebaseConfig() {
  return device.firebase || CONFIG.firebase || null;
}

function refreshPeople() {
  if (peopleSheet) peopleSheet.refresh();
  if (welcome) welcome.refresh();
}
function syncStatus(text) { sync.status = text; sync.error = ''; refreshPeople(); }
function syncError(text) { sync.error = text; refreshPeople(); }

// Firebase loads only for people who sync.
function ensureFirebase() {
  if (!firebaseConfig()) return Promise.resolve(null);
  if (!sync.loading) {
    sync.loading = connectFirebase(firebaseConfig()).then((fb) => {
      sync.fb = fb;
      fb.onUser(onUser);
      return fb;
    }).catch(() => {
      sync.loading = null;
      syncError('Couldn’t load Firebase. Check your connection, or the config you pasted.');
      return null;
    });
  }
  return sync.loading;
}

async function onUser(user) {
  sync.user = user;
  if (!user) { stopSync(); refreshPeople(); return; }
  if (!device.household) {
    const code = await findHousehold(sync.fb, user.uid).catch(() => null);
    if (code) {
      // Signed in on another device of yours: say who you are first, or this
      // device's person would join the household as someone new.
      const hh = await readHousehold(sync.fb, code).catch(() => null);
      await whichOneIsYou((hh && hh.profiles) || []);
      device.household = code;
      saveDevice(device);
    }
  }
  if (device.household) await beginSync();
  refreshPeople();
  // Signed in from the welcome (straight away, or back from a Google redirect).
  if (welcome) await welcomeSignedIn();
}

async function beginSync() {
  stopSync();
  try {
    sync.ctl = await startSync({
      fb: sync.fb, uid: sync.user.uid, code: device.household, store, currentId: device.profiles.current,
      getProfiles: () => device.profiles,
      setProfiles: (p) => setProfiles(p, { fromSync: true }),
      readLocal: (p) => readLibrary(p.key),
      writeLocal: (p, state) => writeLibrary(p.key, state),
      getKey: () => store.get().settings.tmdbKey || device.tmdbKey || '',
      setKey: useSharedKey,
      onStatus: syncStatus,
    });
  } catch (err) {
    if (err.code === 'not-found') { device.household = null; saveDevice(device); }
    syncError(err.code === 'not-found' ? err.message : authMessage(err));
  }
  if (ui.tab !== 'discover') render(); else renderDiscoverView({ force: true });
}

function stopSync() {
  if (sync.ctl) { sync.ctl.stop(); sync.ctl = null; }
}

// The household's TMDB key arrived: films and TV come on for this person.
function useSharedKey(key) {
  const before = tmdbKey();
  device.tmdbKey = key || '';
  saveDevice(device);
  if (tmdbKey() === before) return;
  makeSources();
  deck.pool.clear();
  deck.pages = {};
  deck.topId = null;
  refill({ force: true });
  refreshSeasons();
  if (onboarding) onboarding.refresh().catch(() => {});
  if (key) toast('Films and TV are on, with your household’s TMDB key');
}

// Runs fn with the sheet showing it's busy, and any error in plain words.
async function syncAction(fn) {
  sync.busy = true;
  sync.error = '';
  refreshPeople();
  try { await fn(); } catch (err) { syncError(err.code === 'not-found' || err.code === 'bad-code' ? err.message : authMessage(err)); }
  sync.busy = false;
  refreshPeople();
}

// Joining a household, or signing in on another device: which of the
// household's people is this device's library? (Nothing to ask if this
// device's person is already one of them.)
async function whichOneIsYou(remote) {
  const me = currentProfile(device.profiles);
  if (!remote.length || remote.some((r) => r.id === me.id)) return;
  const pick = await choiceSheet({
    title: 'Which one is you?',
    message: 'What you’ve saved and rated on this device joins your library.',
    options: [...remote.map((r) => ({ value: r.id, label: r.name || 'Unnamed' })), { value: 'new', label: 'Someone new' }],
  });
  const r = remote.find((x) => x.id === pick);
  if (r) setProfiles(claimProfile(device.profiles, me.id, r), { fromSync: true });
  else await nameMe();
}

function inviteUrl() {
  return `${location.origin}${location.pathname}#join=${device.household}`;
}

function showPeople() {
  if (peopleSheet && peopleSheet.sheet.el.isConnected) return;
  if (firebaseConfig()) ensureFirebase();
  peopleSheet = openPeople({
    get: () => ({
      profiles: device.profiles,
      hasConfig: !!firebaseConfig(),
      configFromDeploy: !device.firebase && !!CONFIG.firebase,
      user: sync.user,
      household: device.household && sync.user ? device.household : null,
      status: sync.status,
      error: sync.error,
      busy: sync.busy || (!!firebaseConfig() && !sync.fb && !!sync.loading),
      pendingCode: sync.pendingCode,
    }),
    onSwitch: switchTo,
    onAdd: addPerson,
    onAskWho: (v) => setProfiles({ ...device.profiles, askWho: v }),
    onRename: async (x) => {
      const name = await askName({ title: `Rename ${displayName(x)}`, value: x.name });
      if (name) setProfiles(renameProfile(device.profiles, x.id, name));
    },
    onRemove: (x) => {
      const wasCurrent = x.id === device.profiles.current;
      try { localStorage.removeItem(x.key); } catch { /* ignore */ }
      if (sync.ctl) sync.ctl.removeProfile(x.id);
      setProfiles(removeProfile(device.profiles, x.id));
      toast(`${displayName(x)} removed`);
      if (wasCurrent) { location.hash = '#discover'; location.reload(); }
    },
    onConfig: (text) => {
      const cfg = parseFirebaseConfig(text);
      if (!cfg) { syncError('That doesn’t look like a Firebase web config: it needs apiKey, projectId and appId.'); return; }
      device.firebase = cfg;
      saveDevice(device);
      sync.error = '';
      ensureFirebase();
      refreshPeople();
    },
    onForgetConfig: () => {
      stopSync();
      device.firebase = null;
      device.household = null;
      saveDevice(device);
      location.reload();
    },
    onGoogle: () => syncAction(async () => { const fb = await ensureFirebase(); if (fb) await fb.signInGoogle(); }),
    onEmail: (email, password, create) => syncAction(async () => {
      if (!email || !password) throw Object.assign(new Error(), { code: 'auth/invalid-email' });
      const fb = await ensureFirebase();
      if (fb) await (create ? fb.createAccount(email, password) : fb.signInEmail(email, password));
    }),
    onCreate: () => syncAction(async () => {
      if (!(await nameMe())) return;
      device.household = await createHousehold(sync.fb, sync.user.uid, device.profiles);
      saveDevice(device);
      await beginSync();
      toast('Household started. Now invite whoever you watch with.');
    }),
    onJoin: (text) => syncAction(async () => {
      const code = parseCode(text);
      if (!code) throw Object.assign(new Error('That isn’t an invite code. They look like abcd-efgh-jkmn.'), { code: 'bad-code' });
      const hh = await joinHousehold(sync.fb, sync.user.uid, code);
      sync.pendingCode = null;
      await whichOneIsYou((hh && hh.profiles) || []);
      device.household = code;
      saveDevice(device);
      await beginSync();
      toast(`Joined. Watching as ${displayName(currentProfile(device.profiles))}`);
    }),
    onShareInvite: () => shareOrCopy({
      title: 'Join me on Binger',
      text: `Join my Binger household so we each keep our own watchlist. Code: ${formatCode(device.household)}`,
      url: inviteUrl(),
    }),
    onCopyInvite: async () => {
      try { await navigator.clipboard.writeText(inviteUrl()); toast('Invite link copied'); } catch { toast('Couldn’t copy. Select the code and copy it instead.'); }
    },
    onSignOut: () => syncAction(async () => {
      stopSync();
      device.household = null;
      saveDevice(device);
      if (sync.fb) await sync.fb.signOut();
      toast('Signed out. Everyone’s library stays on this device.');
    }),
  });
}

// ---- actions shared by every screen ----------------------------------------

// What the detail sheet (and, on a wide screen, the panel beside the deck)
// needs to show a title and act on it.
function detailCtx(title, card) {
  const item = store.get().items[title.id] || null;
  const reasons = card ? card.reasons : item ? [] : explain(title, scoreTitle(title, profile), profile);
  return {
    reasons,
    item,
    profile,
    settings: store.get().settings,
    loadDetails: (t) => (t.source === 'tmdb'
      ? (tmdb.hasKey ? withScores(tmdb.details(t.mediaType, t.sourceId), t) : Promise.resolve(null))
      : withScores(t.detailed ? Promise.resolve(null) : anilist.details(t.sourceId), t)),
    onWant: (t) => (card ? deckAction('right', { ...card, title: { ...t, via: card.title.via } }) : addToWatchlist(t)),
    onPass: card ? (t) => deckAction('left', { ...card, title: { ...t, via: card.title.via } }) : null,
    onSeen: (t) => (card ? deckAction('up', { ...card, title: { ...t, via: card.title.via } }) : logSeen(t)),
    onRemove: (t) => { store.update(L.removeItem, t.id); toast('Removed from your Watchlist'); },
    onPerson: showPerson,
    onEditWatch: editWatch,
    onHideSeries: (t) => (hasFranchise(t) && !isSeriesHidden(t) ? hideSeries(t) : null),
    canHideSeries: (t) => hasFranchise(t) && !isSeriesHidden(t),
  };
}

// Details plus review scores, fetched side by side; a failure to get scores
// never holds up the details. Scores alone when there are no new details
// (anime that arrived complete).
async function withScores(details, t) {
  const [d, scores] = await Promise.all([details, ratings && ratings.hasKey ? ratings.forTitle(t).catch(() => null) : null]);
  if (!scores) return d;
  return { ...(d || {}), ratings: scores };
}

function showDetail(title, { card = null } = {}) {
  openDetail(title, detailCtx(title, card));
}

async function addToWatchlist(t) {
  store.update(L.setStatus, t, 'want', Date.now(), t.via);
  toast('Added to your Watchlist');
  const full = await enrich(t);
  if (full !== t && store.get().items[t.id]) store.update(L.setStatus, full, 'want', Date.now(), t.via);
}

function logSeen(t) {
  const fuller = enrich(t); // fetch cast etc. while you rate, so the profile learns more
  openRate(t, {
    onSave: async (w) => { store.update(L.logWatch, await fuller, w); toast('Saved to your diary'); },
    onSkip: async () => { store.update(L.logWatch, await fuller, {}); toast('Marked as watched'); },
  });
}

function editWatch(item, watch) {
  openRate(item.title, {
    watch,
    onSave: (patch) => { store.update(L.updateWatch, item.id, watch.id, patch); toast('Diary updated'); },
    onDelete: () => { store.update(L.deleteWatch, item.id, watch.id); toast('Diary entry deleted'); },
  });
}

function showSearch() {
  openSearch({
    hasKey: tmdb.hasKey,
    hint: 'Log something you’ve watched (eye) or save it for later (bookmark).',
    search: searchAll,
    statusOf: (id) => (store.get().items[id] ? store.get().items[id].status : null),
    onOpen: (t) => showDetail(t),
    onWant: (t) => addToWatchlist(t),
    onSeen: (t) => logSeen(t),
    onPerson: showPerson,
  });
}

async function saveKey(key) {
  if (!key) {
    device.tmdbKey = '';
    saveDevice(device);
    store.update(L.updateSettings, { tmdbKey: '' });
    return { ok: true, message: CONFIG.tmdbKey ? 'Key removed. Using the key built into this deployment.' : 'Key removed. Films and TV are off.' };
  }
  try {
    await createTmdb({ key }).test();
  } catch (err) {
    return { ok: false, message: err.status === 401 ? 'TMDB didn’t accept that key. Check you copied all of it.' : 'Couldn’t reach TMDB. Check your connection and try again.' };
  }
  deck.warnedKey = false;
  device.tmdbKey = key;
  saveDevice(device);
  store.update(L.updateSettings, { tmdbKey: key });
  if (sync.ctl) sync.ctl.shareKey(key).catch(() => {});
  if (onboarding) onboarding.refresh().catch(() => {});
  return { ok: true, message: 'Key works. Films and TV are on.' };
}

function showSettings() {
  openSettings({
    getState: store.get,
    keySource: () => (store.get().settings.tmdbKey ? `Using your key${sync.ctl ? ', shared with your household' : ''}.`
      : device.tmdbKey ? 'Using your household’s key.'
        : CONFIG.tmdbKey ? 'Using the key built into this deployment.' : 'No key yet: films and TV are off.'),
    currentKey: () => store.get().settings.tmdbKey || device.tmdbKey || '',
    keyField: !CONFIG.tmdbKey,
    onPeople: showPeople,
    saveKey,
    onServices: showServices,
    updateSettings: (patch) => store.update(L.updateSettings, patch),
    exportBackup: () => {
      const blob = new Blob([L.exportState(store.get())], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `binger-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    importBackup: (text, mode) => store.replace(L.importState(text, store.get(), { mode })),
    reset: () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      store.replace(L.emptyState());
      deck.pool.clear();
      deck.pages = {};
      deck.undo = [];
      cache.clear().catch(() => {});
      location.hash = '#discover';
      startOnboarding();
    },
  });
}

function startOnboarding() {
  onboarding = openOnboarding({
    hasKey: tmdb.hasKey,
    search: searchAll,
    loadPopular,
    onSettings: showSettings,
    onDone: async (picks) => {
      onboarding = null;
      store.update(L.setOnboarded, true);
      if (picks.length) {
        toast('Learning your taste…');
        const full = await hydrate(picks, { tmdb });
        store.update((s) => full.reduce((acc, t) => L.logWatch(acc, t, { rating: 4.5 }), s));
      }
      refill({ force: true });
    },
  });
}

// ---- rendering -------------------------------------------------------------

function renderDiscoverView({ force = false } = {}) {
  if (ui.tab !== 'discover') return;
  // Don't yank the card out from under a drag or a playing clip; catch up after.
  if (!force && view.querySelector('.card.is-dragging, .card[data-flying], .card .clip')) {
    deck.pendingRender = true;
    return;
  }
  deck.pendingRender = false;
  const s = store.get().settings;
  discoverHandle = renderDiscover(view, {
    cards: deck.cards,
    loading: deck.loading,
    errors: deck.errors.filter((e) => e.source !== 'tmdb' || tmdb.hasKey),
    errorText: deck.errors.length ? `Problem talking to ${[...new Set(deck.errors.map((e) => (e.source === 'tmdb' ? 'TMDB' : 'AniList')))].join(' and ')}.` : '',
    filter: deck.filter,
    hasKey: tmdb.hasKey,
    profile,
    showMatch: warmth(profile) >= 0.25,
    clipSeconds: s.clipSeconds,
    canUndo: deck.undo.length > 0,
    deckFilters: deck.filters,
    streamOnly: s.streamOnly,
    services: s.services,
    onFilters: showFilters,
    onClearFilters: () => applyDeckFilters({ short: false, decade: null }, false),
    setFilter,
    onAction: deckAction,
    onOpen: (card) => showDetail(card.title, { card }),
    onUndo: undo,
    onSearch: showSearch,
    onRefresh: () => refill({ force: true }),
    onSettings: showSettings,
    who: who(),
    detail: wideQuery.matches ? (card) => detailPanel(card.title, detailCtx(card.title, card)) : null,
  });
}

function render() {
  for (const btn of tabbar.querySelectorAll('[data-tab]')) {
    if (btn.dataset.tab === ui.tab) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  }
  view.dataset.tab = ui.tab;
  if (ui.tab === 'discover') { renderDiscoverView({ force: true }); return; }
  const scroller = view.querySelector('.page-scroll');
  const keep = scroller && view.dataset.rendered === ui.tab ? scroller.scrollTop : 0;
  const state = store.get();
  if (ui.tab === 'library') {
    renderLibrary(view, {
      state, profile,
      tab: ui.libraryTab, setTab: (t) => { ui.libraryTab = t; render(); },
      sort: ui.librarySort, setSort: (s) => { ui.librarySort = s; render(); },
      onLog: showSearch,
      onOpen: (item) => showDetail(item.title),
      onWatched: (item) => logSeen(item.title),
      onEditWatch: editWatch,
      who: who(),
      alerts: seasons.alerts,
      onAlertWatched: (a) => { const item = store.get().items[a.id]; if (item) logSeen({ ...item.title, ...a.title, via: item.title.via }); },
      onAlertDismiss: dismissSeason,
      onAlertOpen: (a) => showDetail({ ...store.get().items[a.id].title, ...a.title }),
    });
  } else {
    renderTaste(view, {
      state, profile,
      hasKey: tmdb.hasKey,
      getState: store.get,
      updateSettings: (patch) => store.update(L.updateSettings, patch),
      onSettings: showSettings,
      onServices: () => showServices(),
      onPerson: showPerson,
      timeline: timelineFor(state.items),
      who: who(),
      onUnhideSeries: (f) => { store.update(L.unhideFranchise, f.key); toast(`${f.name} can come back now`); },
      onForgetPasses: () => { store.update(L.forgetPasses); toast('Passed titles can come back now'); refill({ force: true }); },
    });
  }
  view.dataset.rendered = ui.tab;
  const fresh = view.querySelector('.page-scroll');
  if (fresh && keep) fresh.scrollTop = keep;
}

function timelineFor(items) {
  if (timelineMemo.items !== items) timelineMemo.value = tasteTimeline(items);
  timelineMemo.items = items;
  return timelineMemo.value;
}

function route() {
  const tab = location.hash.replace('#', '');
  ui.tab = TABS.includes(tab) ? tab : 'discover';
  render();
}

// ---- wiring ----------------------------------------------------------------

store.subscribe((next, prev) => {
  profile = buildProfile(next.items);
  // Sync brought this person's library from another device: no need to start over.
  if (onboarding && next.onboarded && !prev.onboarded) { onboarding.sheet.close(); onboarding = null; }
  const changed = (k) => JSON.stringify(next.settings[k]) !== JSON.stringify(prev.settings[k]);
  if (changed('tmdbKey') || changed('region') || changed('voiceLanguage')) {
    makeSources();
    deck.pool.clear();
    deck.pages = {};
    deck.topId = null;
    refill({ force: true });
  } else if (changed('services') || changed('streamOnly')) {
    // "Found on your services" hints belong to the old set of services.
    deck.pool.clear();
    deck.pages = {};
    deck.topId = null;
    refill({ force: true });
  }
  rerank();
  if (ui.tab === 'discover') renderDiscoverView({ force: true }); else render();
  refreshSeasons();
});

function isTyping(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

document.addEventListener('keydown', (e) => {
  if (anySheetOpen() || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  // From any tab: / to search, ? for the list of shortcuts (js/ui/shortcuts.js).
  if (e.key === '/') { e.preventDefault(); showSearch(); return; }
  if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
  if (ui.tab !== 'discover') return;
  const top = deck.cards[0];
  if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); undo(); return; }
  if (!top || !discoverHandle) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); discoverHandle.swipe('right'); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); discoverHandle.swipe('left'); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); deckAction('up', top); }
  else if (e.key === 'Enter' && e.target === document.body) { e.preventDefault(); showDetail(top.title, { card: top }); }
});

document.addEventListener('pointerup', () => {
  if (deck.pendingRender) setTimeout(() => renderDiscoverView(), 350);
});

window.addEventListener('hashchange', route);
// Crossing the wide breakpoint adds or removes the details beside the deck.
wideQuery.addEventListener('change', () => renderDiscoverView({ force: true }));

// After "Who's watching?" (or straight away): the join screen for someone who
// opened an invite link; the welcome on a device's first visit; then the
// first run for a new person.
function afterWho() {
  if (sync.pendingCode) { showPeople(); return; }
  if (needsWelcome()) { showWelcome(); return; }
  if (!store.get().onboarded) startOnboarding();
}

// The welcome, once per device, before anything else: sign in straight away
// (so syncing and inviting friends are set up from the start, not linked
// later), or "Just my name" to go on without.
function needsWelcome() {
  return !device.welcomed && !device.household && !currentProfile(device.profiles).name;
}

function setMyName(name) {
  const me = currentProfile(device.profiles);
  if (name && name !== me.name) setProfiles(renameProfile(device.profiles, me.id, name));
}

function showWelcome() {
  if (firebaseConfig()) ensureFirebase();
  welcome = openWelcome({
    get: () => ({
      hasConfig: !!firebaseConfig(),
      busy: sync.busy || (!!firebaseConfig() && !sync.fb && !!sync.loading),
      error: sync.error,
    }),
    onGoogle: (name) => welcomeSignIn(name, (fb) => fb.signInGoogle()),
    onEmail: (name, email, password, create) => welcomeSignIn(name, (fb) => {
      if (!email || !password) throw Object.assign(new Error(), { code: 'auth/invalid-email' });
      return create ? fb.createAccount(email, password) : fb.signInEmail(email, password);
    }),
    onNameOnly: (name) => finishWelcome({ name }),
    // Closed some other way (the phone's back gesture): carry on without
    // marking it done, so it asks again next time.
    onClose: () => { if (welcome) { welcome = null; if (!store.get().onboarded) startOnboarding(); } },
  });
}

// The name goes on this device's person first, so a new household (or
// "Someone new" in a household) already knows it.
async function welcomeSignIn(name, signIn) {
  setMyName(name);
  await syncAction(async () => { const fb = await ensureFirebase(); if (fb) await signIn(fb); });
  // onUser carries on from here once Firebase says who's signed in.
}

// Signed in: an account with a household joins it (onUser has already asked
// "Which one is you?"); a new account gets its own household, so inviting a
// friend is one link from now on.
async function welcomeSignedIn() {
  if (!welcome || welcome.finishing || !sync.user) return;
  welcome.finishing = true;
  try {
    if (!device.household) {
      if (!currentProfile(device.profiles).name && sync.user.name) setMyName(sync.user.name.split(' ')[0]);
      device.household = await createHousehold(sync.fb, sync.user.uid, device.profiles);
      saveDevice(device);
      await beginSync();
    }
  } catch (err) {
    welcome.finishing = false;
    syncError(authMessage(err));
    return;
  }
  finishWelcome({ signedIn: true });
}

function finishWelcome({ name = '', signedIn = false } = {}) {
  if (name) setMyName(name);
  device.welcomed = true;
  saveDevice(device);
  const w = welcome;
  welcome = null;
  if (w) w.close();
  // Sync may have brought this person's library from another device.
  if (!store.get().onboarded) startOnboarding();
  if (signedIn) toast(`Signed in as ${displayName(currentProfile(device.profiles))}. Invite friends from Settings → People and sync.`, { ms: 4000 });
}

async function init() {
  saveDevice(device); // keep the first person's id stable from now on
  if (/^#join=/.test(location.hash)) {
    sync.pendingCode = parseCode(location.hash);
    history.replaceState(null, '', `${location.pathname}${location.search}#discover`);
  }
  let switched = null;
  try { switched = sessionStorage.getItem('binger:switched'); sessionStorage.removeItem('binger:switched'); } catch { /* private mode */ }
  cache = await createCache();
  makeSources();
  rerank();
  route();
  const p = device.profiles;
  if (switched) toast(`Watching as ${displayName(currentProfile(p))}`);
  if (p.list.length > 1 && p.askWho && !switched && !sync.pendingCode) showWho({ atStart: true });
  else afterWho();
  refill({ force: true });
  refreshSeasons();
  if (firebaseConfig() && device.household) ensureFirebase();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

init();
