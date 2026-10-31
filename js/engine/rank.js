// Orders a candidate pool into the deck you swipe through. Pure.
//
// 1. Drop anything already in your library, in a hidden genre or hidden
//    series, of a kind you've filtered out, outside the deck filters (length,
//    decade), or, with "Only show what I can stream", not on your services.
// 2. Score everything (score.js).
// 3. Pick cards one at a time, best first, but:
//    - nudge toward your Films / TV / Anime mix from the Taste screen,
//    - penalise a card that's too similar to the last few (no five Marvel
//      films in a row),
// 4. If "Surprise me" is on, every 7th card is a well-rated wildcard from
//    outside your usual taste, so the profile can discover new likes.

import { featuresOf, isFilmLike } from './features.js';
import { scoreTitle, onServices } from './score.js';
import { explain } from './explain.js';

export const DEFAULT_MIX = { film: 50, tv: 50, anime: 50 };
const EXPLORE_EVERY = 7;
const SIMILARITY_PENALTY = 0.25;
const QUOTA_BONUS = 0.3;
const RECENT = 5;

function diversityKeys(title) {
  return new Set(featuresOf(title)
    .filter((f) => f.group === 'genre' || f.group === 'creator' || f.group === 'studio' || f.group === 'kind')
    .map((f) => f.key));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const k of a) if (b.has(k)) inter += 1;
  return inter / (a.size + b.size - inter);
}

// "Quick watches": films up to 2 hours, series up to 13 episodes.
// true / false, or null while the length isn't known yet.
export const SHORT_FILM_MINUTES = 120;
export const SHORT_SERIES_EPISODES = 13;
// The Discover pills: any mix of Films, TV and Anime. An empty set means
// All; ticking every kind, or unticking the last one, goes back to All.
export const KINDS = ['film', 'tv', 'anime'];
export function toggleKind(kinds, key) {
  if (key === 'all') return new Set();
  const next = new Set(kinds);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next.size === KINDS.length ? new Set() : next;
}

export function isShort(title) {
  if (isFilmLike(title)) return title.runtime > 0 ? title.runtime <= SHORT_FILM_MINUTES : null;
  return title.episodes > 0 ? title.episodes <= SHORT_SERIES_EPISODES : null;
}

// decade: 2020, 2010, ... or 'older' (before 1980).
export function inDecade(title, decade) {
  if (decade == null) return true;
  if (!title.year) return false;
  if (decade === 'older') return title.year < 1980;
  return title.year >= decade && title.year < decade + 10;
}

// Your hidden series (Settings.hiddenFranchises) as quick lookups.
export function franchiseBlock(hiddenFranchises = []) {
  const ids = new Set();
  const keys = new Set();
  for (const f of hiddenFranchises || []) {
    if (!f) continue;
    if (f.key) keys.add(f.key);
    for (const id of f.ids || []) ids.add(id);
  }
  return { ids, keys };
}

export function isBlocked(title, block) {
  if (!block || (!block.ids.size && !block.keys.size)) return false;
  if (block.ids.has(title.id)) return true;
  if (title.collection && block.keys.has(title.collection.id)) return true;
  // An anime related to one you've hidden (its next season, a side story...).
  return title.source === 'anilist' && (title.franchiseIds || []).some((id) => block.ids.has(`anilist:${id}`));
}

export function eligible(title, { exclude, hiddenGenres, kinds, mix, block = null, filters = null, services = null, streamOnly = false }) {
  if (!title || !title.id) return false;
  if (exclude && exclude.has(title.id)) return false;
  if (kinds && !kinds.has(title.kind)) return false;
  if (mix && mix[title.kind] === 0) return false;
  if (hiddenGenres && hiddenGenres.size && (title.genres || []).some((g) => hiddenGenres.has(g))) return false;
  if (isBlocked(title, block)) return false;
  if (filters) {
    if (filters.short && isShort(title) === false) return false;
    if (!inDecade(title, filters.decade ?? null)) return false;
  }
  // Unknowns stay in: the app fetches details for the next few cards and
  // re-ranks, so a film that turns out not to be on your services drops out.
  if (streamOnly && services && services.length && onServices(title, services) === false) return false;
  return true;
}

export function buildDeck(candidates, profile, opts = {}) {
  const {
    now = Date.now(),
    exclude = new Set(),
    hiddenGenres = [],
    kinds = null,
    mix = DEFAULT_MIX,
    surprise = true,
    preferFresh = true,
    size = 20,
    rng = Math.random,
    hiddenFranchises = [],
    filters = null,
    services = [],
    streamOnly = false,
  } = opts;
  const hidden = new Set(hiddenGenres);
  const block = franchiseBlock(hiddenFranchises);
  const seen = new Set();
  const pool = [];
  for (const t of candidates) {
    if (seen.has(t.id) || !eligible(t, { exclude, hiddenGenres: hidden, kinds, mix, block, filters, services, streamOnly })) continue;
    seen.add(t.id);
    const s = scoreTitle(t, profile, { now, preferFresh, services });
    pool.push({ title: t, ...s, keys: diversityKeys(t) });
  }
  pool.sort((a, b) => b.score - a.score);

  const kindsPresent = [...new Set(pool.map((p) => p.title.kind))];
  const mixTotal = kindsPresent.reduce((s, k) => s + (mix[k] ?? 50), 0) || 1;
  const target = Object.fromEntries(kindsPresent.map((k) => [k, (mix[k] ?? 50) / mixTotal]));
  const counts = Object.fromEntries(kindsPresent.map((k) => [k, 0]));

  // Wildcards: things you haven't shown a taste for (yet) that people rate well.
  const explorePool = surprise ? pool.filter((p) => p.affinity < 0.15 && p.quality > 0.25) : [];

  const deck = [];
  const used = new Set();
  while (deck.length < size && used.size < pool.length) {
    const i = deck.length;
    let pick = null;

    if (surprise && i % EXPLORE_EVERY === EXPLORE_EVERY - 1) {
      const options = explorePool.filter((p) => !used.has(p.title.id));
      if (options.length) {
        pick = options[Math.floor(rng() * Math.min(options.length, 8))];
        pick = { ...pick, explore: true };
      }
    }

    if (!pick) {
      const recent = deck.slice(-RECENT);
      let best = null;
      let bestVal = -Infinity;
      for (const p of pool) {
        if (used.has(p.title.id)) continue;
        const k = p.title.kind;
        const deficit = target[k] * (i + 1) - counts[k];
        const bonus = QUOTA_BONUS * Math.max(-1, Math.min(1, deficit));
        const sim = recent.reduce((m, d) => Math.max(m, jaccard(p.keys, d.keys)), 0);
        const val = p.score + bonus - SIMILARITY_PENALTY * sim;
        if (val > bestVal) { bestVal = val; best = p; }
      }
      if (!best) break;
      pick = best;
    }

    used.add(pick.title.id);
    counts[pick.title.kind] = (counts[pick.title.kind] || 0) + 1;
    deck.push(pick);
  }

  return deck.map((p) => ({
    title: p.title,
    score: p.score,
    affinity: p.affinity,
    quality: p.quality,
    explore: !!p.explore,
    onServices: p.onServices,
    reasons: explain(p.title, p, profile, { now, services }),
    keys: p.keys,
  }));
}

// "What should I watch tonight?": your watchlist, best match first.
export function rankWatchlist(items, profile, { now = Date.now(), services = [] } = {}) {
  return items
    .map((it) => ({ item: it, ...scoreTitle(it.title, profile, { now, preferFresh: false, services }) }))
    .sort((a, b) => b.score - a.score);
}

// Someone's other work, best for you first. A lead role or creative lead
// (`major`) is worth a little more than a walk-on, so you see what they're
// known for before their cameos.
export const MAJOR_ROLE_BONUS = 0.08;
export function rankForYou(titles, profile, { now = Date.now(), services = [] } = {}) {
  return titles
    .filter((t) => t && t.id)
    .map((t) => {
      const s = scoreTitle(t, profile, { now, preferFresh: false, services });
      return { title: t, ...s, score: s.score + (t.major ? MAJOR_ROLE_BONUS : 0) };
    })
    .sort((a, b) => b.score - a.score);
}
