// Your library: everything you've swiped on, saved, watched, rated and reviewed,
// plus your settings. Pure functions over a plain JSON object. Each one returns
// a new state and leaves the old one untouched, so undo is "put the old item back".
//
// state = {
//   schema: 1,
//   items: { [titleId]: Item },
//   settings: { ...DEFAULT_SETTINGS },
//   onboarded: boolean,
//   createdAt: ISO string,
// }
// Item = {
//   id, title: Snapshot,                  // a trimmed copy of the Title
//   status: 'want' | 'watched' | 'passed',
//   addedAt, updatedAt,                   // ISO strings
//   watches: [{ id, date: 'YYYY-MM-DD', rating: 0.5..5 | null, tags: [], review: '' }],
//   via: [...]                            // why Binger showed it (if it did)
// }

export const SCHEMA = 1;

export const DEFAULT_SETTINGS = {
  tmdbKey: '',
  region: 'GB',
  mix: { film: 50, tv: 50, anime: 50 },
  preferFresh: true,
  surprise: true,
  hiddenGenres: [],
  autoplayTrailers: true,
  clipSeconds: 30,
  voiceLanguage: 'JAPANESE',
};

export const TAGS = ['Gripping', 'Funny', 'Moving', 'Beautiful', 'Clever', 'Comfort watch', 'Rewatchable', 'Slow', 'Confusing', 'Overhyped'];

const SNAPSHOT_KEYS = [
  'id', 'source', 'sourceId', 'mediaType', 'kind', 'title', 'originalTitle', 'year', 'releaseDate', 'lastAirDate',
  'overview', 'poster', 'backdrop', 'color', 'genres', 'keywords', 'studios', 'language', 'runtime', 'episodes',
  'seasons', 'format', 'formatLabel', 'score', 'votes', 'trailer', 'url', 'networks', 'certification',
  'prequelIds', 'sequelIds', 'detailed',
];

// Enough of a Title to show it in your library and learn from it, without
// keeping bulky, fast-changing data like streaming providers.
// `lite` (used for passes, which pile up fastest) keeps only what the engine
// and the "already seen this card" check need: about a third of the size.
const LITE_DROP = ['overview', 'backdrop', 'trailer', 'url', 'networks', 'certification', 'color', 'formatLabel'];

export function snapshot(title, { lite = false } = {}) {
  const s = {};
  for (const k of SNAPSHOT_KEYS) if (title[k] !== undefined && !(lite && LITE_DROP.includes(k))) s[k] = title[k];
  s.cast = (title.cast || []).slice(0, lite ? 6 : 8).map(({ id, name, character, photo }) =>
    (lite ? { id, name } : { id, name, character: character ?? null, photo: photo ?? null }));
  s.crew = (title.crew || []).slice(0, 4).map(({ id, name, job }) => ({ id, name, job }));
  s.keywords = (title.keywords || []).slice(0, lite ? 8 : 12);
  if (typeof s.overview === 'string' && s.overview.length > 1200) s.overview = s.overview.slice(0, 1197) + '…';
  return s;
}

export function emptyState(now = Date.now()) {
  return {
    schema: SCHEMA,
    items: {},
    settings: structuredClone(DEFAULT_SETTINGS),
    onboarded: false,
    createdAt: new Date(now).toISOString(),
  };
}

const iso = (now) => new Date(now).toISOString();
const today = (now) => iso(now).slice(0, 10);
let counter = 0;
const newId = (now) => `w${now.toString(36)}${(counter++).toString(36)}`;

function withItem(state, id, item) {
  const items = { ...state.items };
  if (item) items[id] = item; else delete items[id];
  return { ...state, items };
}

export function getItem(state, id) {
  return state.items[id] || null;
}

// Swipe right ('want') or left ('passed'). Never downgrades something you've watched.
export function setStatus(state, title, status, now = Date.now(), via = null) {
  const prev = state.items[title.id];
  if (prev && prev.status === 'watched' && status !== 'watched') return state;
  const item = {
    ...(prev || { id: title.id, addedAt: iso(now), watches: [] }),
    title: snapshot(title, { lite: status === 'passed' }),
    status,
    updatedAt: iso(now),
  };
  if (via && via.length && status !== 'passed') item.via = via;
  else delete item.via;
  return withItem(state, title.id, item);
}

export function logWatch(state, title, { rating = null, tags = [], review = '', date = null } = {}, now = Date.now()) {
  const prev = state.items[title.id];
  const watch = {
    id: newId(now),
    date: date || today(now),
    rating: typeof rating === 'number' ? Math.max(0.5, Math.min(5, Math.round(rating * 2) / 2)) : null,
    tags: [...new Set(tags)].filter((t) => typeof t === 'string').slice(0, 10),
    review: String(review || '').slice(0, 4000),
  };
  const item = {
    ...(prev || { id: title.id, addedAt: iso(now), watches: [] }),
    title: snapshot({ ...(prev ? prev.title : {}), ...title }),
    status: 'watched',
    updatedAt: iso(now),
    watches: [...((prev && prev.watches) || []), watch],
  };
  return withItem(state, title.id, item);
}

export function updateWatch(state, id, watchId, patch, now = Date.now()) {
  const prev = state.items[id];
  if (!prev) return state;
  const watches = prev.watches.map((w) => {
    if (w.id !== watchId) return w;
    const next = { ...w, ...patch };
    if (typeof next.rating === 'number') next.rating = Math.max(0.5, Math.min(5, Math.round(next.rating * 2) / 2));
    return next;
  });
  return withItem(state, id, { ...prev, watches, updatedAt: iso(now) });
}

export function deleteWatch(state, id, watchId, now = Date.now()) {
  const prev = state.items[id];
  if (!prev) return state;
  const watches = prev.watches.filter((w) => w.id !== watchId);
  if (!watches.length) return withItem(state, id, null);
  return withItem(state, id, { ...prev, watches, updatedAt: iso(now) });
}

export function removeItem(state, id) {
  return withItem(state, id, null);
}

// Undo: put back exactly what was there before (or nothing).
export function restoreItem(state, id, prevItem) {
  return withItem(state, id, prevItem || null);
}

export function forgetPasses(state) {
  const items = {};
  for (const [id, it] of Object.entries(state.items)) if (it.status !== 'passed') items[id] = it;
  return { ...state, items };
}

export function updateSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...patch } };
}

export function setOnboarded(state, value = true) {
  return { ...state, onboarded: value };
}

export function watchlist(state) {
  return Object.values(state.items).filter((it) => it.status === 'want')
    .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
}

// One diary row per watch (a rewatch is its own entry), newest first.
export function diary(state) {
  const rows = [];
  for (const it of Object.values(state.items)) {
    for (const w of it.watches || []) rows.push({ item: it, watch: w });
  }
  return rows.sort((a, b) => String(b.watch.date).localeCompare(String(a.watch.date)) || String(b.watch.id).localeCompare(String(a.watch.id)));
}

// --- persistence formats -----------------------------------------------------

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

// Accepts anything (old schema, hand-edited, partial) and returns a valid state.
export function migrate(raw, now = Date.now()) {
  const base = emptyState(now);
  if (!isObj(raw)) return base;
  const out = { ...base, onboarded: !!raw.onboarded, createdAt: raw.createdAt || base.createdAt };
  out.settings = { ...base.settings, ...(isObj(raw.settings) ? raw.settings : {}) };
  out.settings.mix = { ...base.settings.mix, ...(isObj(out.settings.mix) ? out.settings.mix : {}) };
  if (!Array.isArray(out.settings.hiddenGenres)) out.settings.hiddenGenres = [];
  const items = {};
  for (const [id, it] of Object.entries(isObj(raw.items) ? raw.items : {})) {
    if (!isObj(it) || !isObj(it.title) || !it.title.id || it.title.id !== id) continue;
    if (!['want', 'watched', 'passed'].includes(it.status)) continue;
    items[id] = { ...it, watches: Array.isArray(it.watches) ? it.watches.filter(isObj) : [] };
  }
  out.items = items;
  out.schema = SCHEMA;
  return out;
}

export function exportState(state, now = Date.now()) {
  const { tmdbKey, ...settings } = state.settings; // keys stay on the device
  return JSON.stringify({ app: 'binger', exportedAt: iso(now), ...state, settings }, null, 2);
}

// mode 'merge': keep everything you have, add what's new, newer edit wins.
// mode 'replace': the file becomes your library (your TMDB key is kept).
export function importState(text, current, { mode = 'merge', now = Date.now() } = {}) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error("That file isn't a Binger backup (not JSON)."); }
  if (!isObj(raw) || (raw.app && raw.app !== 'binger') || !isObj(raw.items)) throw new Error("That file isn't a Binger backup.");
  const incoming = migrate(raw, now);
  if (mode === 'replace') {
    return { ...incoming, settings: { ...incoming.settings, tmdbKey: current.settings.tmdbKey } };
  }
  const items = { ...current.items };
  for (const [id, it] of Object.entries(incoming.items)) {
    const mine = items[id];
    if (!mine) { items[id] = it; continue; }
    const newer = String(it.updatedAt || '') > String(mine.updatedAt || '') ? it : mine;
    const watches = [...mine.watches];
    for (const w of it.watches) if (!watches.some((x) => x.id === w.id)) watches.push(w);
    items[id] = { ...newer, watches, status: watches.length ? 'watched' : newer.status };
  }
  return { ...current, items, onboarded: current.onboarded || incoming.onboarded };
}
