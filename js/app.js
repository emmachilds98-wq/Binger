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
import { gatherCandidates, hydrate } from './sources/candidates.js';
import { buildProfile, buildDeck, explain, scoreTitle, warmth } from './engine/index.js';
import { renderDiscover } from './ui/deck.js';
import { openDetail } from './ui/detail.js';
import { openRate } from './ui/rate.js';
import { renderLibrary } from './ui/library.js';
import { renderTaste } from './ui/taste.js';
import { openSearch } from './ui/search.js';
import { openSettings } from './ui/settings.js';
import { openOnboarding } from './ui/onboarding.js';
import { openFilters } from './ui/filters.js';
import { toast, anySheetOpen } from './ui/sheet.js';

// ---- state -----------------------------------------------------------------

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const TABS = ['discover', 'library', 'taste'];
const DECK_SIZE = 30;
const REFILL_BELOW = 8;
const DETAIL_AHEAD = 6;

const store = createStore({ onSaveError: () => toast('Couldn’t save: this browser’s storage is full or blocked.') });
let cache = createMemoryCache();
let tmdb = null;
let anilist = null;
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
  pendingRender: false,
  warnedKey: false,
};
const ui = { tab: 'discover', libraryTab: 'watchlist', librarySort: 'match' };
let discoverHandle = null;
let onboarding = null;

// ---- sources ---------------------------------------------------------------

function tmdbKey() {
  return store.get().settings.tmdbKey || CONFIG.tmdbKey || '';
}

function makeSources() {
  const s = store.get().settings;
  tmdb = createTmdb({ key: tmdbKey(), region: s.region, cache });
  anilist = createAniList({ cache, voiceLanguage: s.voiceLanguage });
}

async function enrich(t) {
  if (t.detailed) return t;
  const [full] = await hydrate([t], { tmdb });
  return full;
}

async function searchAll(q) {
  const jobs = [anilist.search(q)];
  if (tmdb.hasKey) jobs.unshift(tmdb.search(q));
  const settled = await Promise.allSettled(jobs);
  const lists = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const errors = settled.filter((r) => r.status === 'rejected').map((r) => r.reason);
  const merged = [];
  for (let i = 0; i < 20; i++) for (const list of lists) if (list[i]) merged.push(list[i]);
  const needle = q.trim().toLowerCase();
  const closeness = (t) => {
    const name = t.title.toLowerCase();
    return name === needle ? 0 : name.startsWith(needle) ? 1 : 2;
  };
  merged.sort((x, y) => closeness(x) - closeness(y));
  return { titles: merged.slice(0, 30), errors };
}

async function loadPopular() {
  const jobs = [anilist.popular()];
  if (tmdb.hasKey) jobs.unshift(tmdb.trending('movie'), tmdb.trending('tv'));
  const settled = await Promise.allSettled(jobs);
  const lists = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value.filter((t) => !t.animeLike));
  if (!lists.length) throw new Error('Nothing loaded');
  const out = [];
  for (let i = 0; i < 30 && out.length < 30; i++) {
    for (const list of lists) if (list[i] && !out.some((t) => t.id === list[i].id)) out.push(list[i]);
  }
  return out;
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
    const { pool, errors } = await gatherCandidates({ tmdb, anilist, items: store.get().items, profile, settings: store.get().settings, filters: deck.filters });
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
      toast('TMDB didn’t accept your key. Check it in Settings.', { action: { label: 'Settings', fn: showSettings } });
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
    const need = deck.cards.slice(0, DETAIL_AHEAD).map((c) => c.title).filter((t) => t.source === 'tmdb' && !t.detailed);
    if (!need.length) return;
    const full = await hydrate(need, { tmdb });
    let changed = false;
    for (const t of full) {
      if (!t.detailed) continue;
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
  afterDeckChange();
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
    onPickServices: null, // the services picker is the next screen to build (docs/PLAN.md)
    onApply: applyDeckFilters,
  });
}

// ---- actions shared by every screen ----------------------------------------

function showDetail(title, { card = null } = {}) {
  const item = store.get().items[title.id] || null;
  const reasons = card ? card.reasons : item ? [] : explain(title, scoreTitle(title, profile), profile);
  openDetail(title, {
    reasons,
    item,
    profile,
    settings: store.get().settings,
    loadDetails: (t) => (t.source === 'tmdb'
      ? (tmdb.hasKey ? tmdb.details(t.mediaType, t.sourceId) : Promise.resolve(null))
      : (t.detailed ? Promise.resolve(null) : anilist.details(t.sourceId))),
    onWant: (t) => (card ? deckAction('right', { ...card, title: { ...t, via: card.title.via } }) : addToWatchlist(t)),
    onPass: card ? (t) => deckAction('left', { ...card, title: { ...t, via: card.title.via } }) : null,
    onSeen: (t) => (card ? deckAction('up', { ...card, title: { ...t, via: card.title.via } }) : logSeen(t)),
    onRemove: (t) => { store.update(L.removeItem, t.id); toast('Removed from your Watchlist'); },
    onEditWatch: editWatch,
  });
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
  });
}

async function saveKey(key) {
  if (!key) {
    store.update(L.updateSettings, { tmdbKey: '' });
    return { ok: true, message: CONFIG.tmdbKey ? 'Key removed. Using the key built into this deployment.' : 'Key removed. Films and TV are off.' };
  }
  try {
    await createTmdb({ key }).test();
  } catch (err) {
    return { ok: false, message: err.status === 401 ? 'TMDB didn’t accept that key. Check you copied all of it.' : 'Couldn’t reach TMDB. Check your connection and try again.' };
  }
  deck.warnedKey = false;
  store.update(L.updateSettings, { tmdbKey: key });
  if (onboarding) onboarding.refresh().catch(() => {});
  return { ok: true, message: 'Key works. Films and TV are on.' };
}

function showSettings() {
  openSettings({
    getState: store.get,
    keySource: () => (store.get().settings.tmdbKey ? 'Using your key.' : CONFIG.tmdbKey ? 'Using the key built into this deployment.' : 'No key yet: films and TV are off.'),
    saveKey,
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
    });
  } else {
    renderTaste(view, {
      state, profile,
      hasKey: tmdb.hasKey,
      getState: store.get,
      updateSettings: (patch) => store.update(L.updateSettings, patch),
      onSettings: showSettings,
      onForgetPasses: () => { store.update(L.forgetPasses); toast('Passed titles can come back now'); refill({ force: true }); },
    });
  }
  view.dataset.rendered = ui.tab;
  const fresh = view.querySelector('.page-scroll');
  if (fresh && keep) fresh.scrollTop = keep;
}

function route() {
  const tab = location.hash.replace('#', '');
  ui.tab = TABS.includes(tab) ? tab : 'discover';
  render();
}

// ---- wiring ----------------------------------------------------------------

store.subscribe((next, prev) => {
  profile = buildProfile(next.items);
  const changed = (k) => JSON.stringify(next.settings[k]) !== JSON.stringify(prev.settings[k]);
  if (changed('tmdbKey') || changed('region') || changed('voiceLanguage')) {
    makeSources();
    deck.pool.clear();
    deck.topId = null;
    refill({ force: true });
  } else if (changed('services') || changed('streamOnly')) {
    // "Found on your services" hints belong to the old set of services.
    deck.pool.clear();
    deck.topId = null;
    refill({ force: true });
  }
  rerank();
  if (ui.tab === 'discover') renderDiscoverView({ force: true }); else render();
});

function isTyping(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

document.addEventListener('keydown', (e) => {
  if (ui.tab !== 'discover' || anySheetOpen() || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  const top = deck.cards[0];
  if (e.key === 'z' || e.key === 'Backspace') { e.preventDefault(); undo(); return; }
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

async function init() {
  cache = await createCache();
  makeSources();
  rerank();
  route();
  if (!store.get().onboarded) startOnboarding();
  refill({ force: true });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

init();
