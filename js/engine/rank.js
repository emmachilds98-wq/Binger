// Orders a candidate pool into the deck you swipe through. Pure.
//
// 1. Drop anything already in your library, in a hidden genre, or of a kind
//    you've filtered out.
// 2. Score everything (score.js).
// 3. Pick cards one at a time, best first, but:
//    - nudge toward your Films / TV / Anime mix from the Taste screen,
//    - penalise a card that's too similar to the last few (no five Marvel
//      films in a row),
// 4. If "Surprise me" is on, every 7th card is a well-rated wildcard from
//    outside your usual taste, so the profile can discover new likes.

import { featuresOf } from './features.js';
import { scoreTitle } from './score.js';
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

export function eligible(title, { exclude, hiddenGenres, kinds, mix }) {
  if (!title || !title.id) return false;
  if (exclude && exclude.has(title.id)) return false;
  if (kinds && !kinds.has(title.kind)) return false;
  if (mix && mix[title.kind] === 0) return false;
  if (hiddenGenres && hiddenGenres.size && (title.genres || []).some((g) => hiddenGenres.has(g))) return false;
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
  } = opts;
  const hidden = new Set(hiddenGenres);
  const seen = new Set();
  const pool = [];
  for (const t of candidates) {
    if (seen.has(t.id) || !eligible(t, { exclude, hiddenGenres: hidden, kinds, mix })) continue;
    seen.add(t.id);
    const s = scoreTitle(t, profile, { now, preferFresh });
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
    reasons: explain(p.title, p, profile, { now }),
    keys: p.keys,
  }));
}

// "What should I watch tonight?": your watchlist, best match first.
export function rankWatchlist(items, profile, { now = Date.now() } = {}) {
  return items
    .map((it) => ({ item: it, ...scoreTitle(it.title, profile, { now, preferFresh: false }) }))
    .sort((a, b) => b.score - a.score);
}
