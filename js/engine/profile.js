// Builds your taste profile from your library: every rating, every "want",
// every pass. Pure and deterministic given `now`, so it's cheap to rebuild
// after each swipe (a few hundred items x ~30 features) and easy to test.
//
// For each feature f (a genre, a director, an actor...) we keep
//   P[f] = sum of signal x decay x weight      (which way you lean)
//   N[f] = sum of |signal| x decay x weight     (how much evidence there is)
// and your affinity is P / (N + SHRINK). That lands in (-1, 1), says how much
// you like f *relative to how often you've met it*, and stays near zero until
// there's real evidence: one 5-star film doesn't make you a fan of its whole
// cast, three do.

import { featuresOf } from './features.js';

export const DAY = 86400000;

export const SIGNAL = {
  want: 0.5,          // swiped right / added to watchlist
  pass: -0.2,         // swiped left: weak, it often just means "not tonight"
  watchedUnrated: 0.35, // you chose to watch it, but didn't say how it went
};

// Feeling tags fine-tune a rating. Two 4-star films aren't equal if you
// called one "Rewatchable" and the other "Overhyped". The nudges are small
// (capped at a quarter of a star's worth either way) so stars stay in charge.
// Tags that describe a title rather than judge it ("Violent", "Dark",
// "Slow burn") have no nudge: liking violent films shows up in your stars.
export const TAG_NUDGE = {
  Gripping: 0.06, Tense: 0.04, Funny: 0.04, Moving: 0.06, 'Feel-good': 0.05, Romantic: 0.03, 'Mind-bending': 0.05, 'Comfort watch': 0.06,
  Dark: 0, Scary: 0, Violent: 0, Gory: 0, 'Slow burn': 0, Weird: 0,
  'Action-packed': 0.02, 'Thought-provoking': 0.05, 'Light-hearted': 0.02, Epic: 0.04,
  Clever: 0.06, Beautiful: 0.04, Rewatchable: 0.08, 'Binge-worthy': 0.06, 'Great twist': 0.05, Quotable: 0.03,
  Slow: -0.08, 'Too long': -0.06, Confusing: -0.08, Predictable: -0.06, 'Too violent': -0.08, Dull: -0.1, Overhyped: -0.1,
};
// Each part you rated (story, ending...) moves it a little too, inside the
// same cap: loving the story and hating the ending roughly cancel out.
export const ASPECT_NUDGE = 0.03;
// Tags that are evidence about length (see SLOW_LENGTH_SIGNAL).
const LENGTH_TAGS = ['Slow', 'Too long'];
const TAG_CAP = 0.25;
// "Slow" is also evidence about length: it counts against that title's length
// bucket on its own, so several "Slow" tags on long films lower long films.
export const SLOW_LENGTH_SIGNAL = -0.5;

// Recent behaviour counts more, so the profile drifts as your taste does.
export const HALF_LIFE_DAYS = { watched: 540, want: 180, pass: 120 };
export const SHRINK = 1.5;
const BASELINE_PRIOR = 3;   // ratings are pulled toward 3 stars...
const BASELINE_WEIGHT = 5;  // ...as if you'd already rated five titles 3 stars

export function latestWatch(item) {
  const watches = (item.watches || []).filter((w) => w && w.date);
  if (!watches.length) return null;
  return watches.reduce((a, b) => (String(b.date) >= String(a.date) ? b : a));
}

// Tags from your most recent viewing (a rewatch can change your mind).
export function latestTags(item) {
  const w = latestWatch(item);
  return (w && Array.isArray(w.tags)) ? w.tags : [];
}

export function tagNudge(tags, aspects = null) {
  let sum = (tags || []).reduce((acc, t) => acc + (TAG_NUDGE[t] || 0), 0);
  for (const v of Object.values(aspects || {})) if (v === 1 || v === -1) sum += v * ASPECT_NUDGE;
  return clamp(sum, -TAG_CAP, TAG_CAP);
}

// What your feeling tags say across your diary, for the Taste screen: the
// feelings on titles you rated well (or watched without rating), the
// complaints on any of them, and the parts that make or break a title.
// Latest viewing of each title only, like the profile.
export function feelingSummary(items, { limit = 8 } = {}) {
  const good = new Map();
  const bad = new Map();
  const parts = new Map();
  const bump = (m, k, by = 1) => m.set(k, (m.get(k) || 0) + by);
  for (const item of items) {
    const w = latestWatch(item);
    if (!w) continue;
    const liked = w.rating == null || w.rating >= 3.5;
    for (const t of w.tags || []) {
      if ((TAG_NUDGE[t] || 0) < 0) bump(bad, t);
      else if (liked) bump(good, t);
    }
    for (const [k, v] of Object.entries(w.aspects || {})) if (v) bump(parts, k, v);
  }
  const top = (m) => [...m].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([tag, n]) => ({ tag, n }));
  const partList = [...parts].sort((a, b) => b[1] - a[1]);
  return {
    loved: top(good),
    off: top(bad),
    strong: partList.filter(([, n]) => n > 0).map(([key, n]) => ({ key, n })),
    weak: partList.filter(([, n]) => n < 0).reverse().map(([key, n]) => ({ key, n: -n })),
  };
}

export function latestRating(item) {
  const rated = (item.watches || []).filter((w) => w && typeof w.rating === 'number');
  if (!rated.length) return null;
  return rated.reduce((a, b) => (String(b.date) >= String(a.date) ? b : a)).rating;
}

// Your personal "average": a 4 from someone who gives everything 4s means
// less than a 4 from someone who rarely does.
export function ratingBaseline(items) {
  let sum = BASELINE_PRIOR * BASELINE_WEIGHT;
  let n = BASELINE_WEIGHT;
  for (const it of items) {
    const r = latestRating(it);
    if (r != null) { sum += r; n += 1; }
  }
  return sum / n;
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// One item -> { s: signed strength, at: ms timestamp, halfLife: days } or null.
export function itemSignal(item, baseline) {
  if (item.status === 'watched' || (item.watches && item.watches.length)) {
    const r = latestRating(item);
    const w = latestWatch(item);
    // A rough date ("ages ago", "sometime in 2014") says nothing about how
    // current your opinion is, so it counts from when you logged it instead:
    // a long-time favourite rated today is today's opinion.
    const at = Date.parse((w && !w.when && w.date) || item.updatedAt || item.addedAt || 0) || 0;
    const nudge = tagNudge(latestTags(item), w && w.aspects);
    if (r == null) return { s: SIGNAL.watchedUnrated + nudge, at, halfLife: HALF_LIFE_DAYS.watched };
    // Half absolute (3 stars = neutral), half relative to your own baseline.
    const s = 0.5 * ((r - 3) / 2) + 0.5 * ((r - baseline) / 2) + nudge;
    return { s: clamp(s, -1.25, 1), at, halfLife: HALF_LIFE_DAYS.watched };
  }
  const at = Date.parse(item.updatedAt || item.addedAt || 0) || 0;
  if (item.status === 'want') return { s: SIGNAL.want, at, halfLife: HALF_LIFE_DAYS.want };
  if (item.status === 'passed') return { s: SIGNAL.pass, at, halfLife: HALF_LIFE_DAYS.pass };
  return null;
}

export function decay(at, now, halfLifeDays) {
  if (!at) return 0.5;
  const ageDays = Math.max(0, (now - at) / DAY);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export function buildProfile(items, { now = Date.now() } = {}) {
  const list = Array.isArray(items) ? items : Object.values(items || {});
  const baseline = ratingBaseline(list);
  const P = new Map();
  const N = new Map();
  const evidence = new Map();
  const people = new Map();
  // hype: how often (recently) you've called something "Overhyped"; the
  // score trusts trending lists less as it grows. tags: how often you use each.
  const stats = { items: 0, rated: 0, watched: 0, wants: 0, passes: 0, baseline, strength: 0, hype: 0, tags: {} };

  for (const item of list) {
    if (!item || !item.title) continue;
    const sig = itemSignal(item, baseline);
    if (!sig) continue;
    stats.items += 1;
    if (item.status === 'want') stats.wants += 1;
    if (item.status === 'passed') stats.passes += 1;
    if (item.status === 'watched') stats.watched += 1;
    const rating = latestRating(item);
    if (rating != null) stats.rated += 1;

    const d = decay(sig.at, now, sig.halfLife);
    stats.strength += Math.abs(sig.s) * d;
    const tags = item.status === 'watched' ? latestTags(item) : [];
    for (const t of tags) stats.tags[t] = (stats.tags[t] || 0) + 1;
    if (tags.includes('Overhyped')) stats.hype += d;

    const record = (f, v, extra = false) => {
      P.set(f.key, (P.get(f.key) || 0) + v);
      N.set(f.key, (N.get(f.key) || 0) + Math.abs(v));
      let e = evidence.get(f.key);
      if (!e) {
        e = { key: f.key, group: f.group, label: f.label, n: 0, pos: 0, neg: 0, best: null };
        evidence.set(f.key, e);
      }
      if (!extra) e.n += 1;
      if (v > 0) e.pos += 1; else if (v < 0) e.neg += 1;
      if (v > 0 && (!e.best || v > e.best.strength)) {
        e.best = { id: item.id, title: item.title.title, rating, strength: v };
      }
    };
    for (const f of featuresOf(item.title)) {
      record(f, sig.s * d * f.w);
      if (f.group === 'length' && tags.some((t) => LENGTH_TAGS.includes(t))) record(f, SLOW_LENGTH_SIGNAL * d * f.w, true);
    }

    // People you'd recognise: anyone in something you've watched or want to.
    if (item.status === 'watched' || item.status === 'want') {
      const add = (p, role) => {
        if (!p || !p.id) return;
        let rec = people.get(p.id);
        if (!rec) { rec = { id: p.id, name: p.name, titles: [] }; people.set(p.id, rec); }
        rec.titles.push({ id: item.id, title: item.title.title, role, rating, status: item.status });
      };
      (item.title.cast || []).forEach((p) => add(p, p.character || null));
      (item.title.crew || []).forEach((p) => add(p, p.job || null));
    }
  }

  const aff = new Map();
  for (const [k, p] of P) aff.set(k, p / (N.get(k) + SHRINK));

  // Best-rated / watched-first for "you know them from ...".
  for (const rec of people.values()) {
    rec.titles.sort((a, b) =>
      (b.status === 'watched') - (a.status === 'watched') || (b.rating ?? 0) - (a.rating ?? 0));
  }

  return { aff, evidence, people, stats };
}

// The strongest likes / dislikes in a group, for the Taste screen.
export function topFeatures(profile, group, { limit = 6, sign = 1, minN = 1 } = {}) {
  const out = [];
  for (const e of profile.evidence.values()) {
    if (e.group !== group || e.n < minN) continue;
    const a = profile.aff.get(e.key) || 0;
    if (sign > 0 ? a > 0.05 : a < -0.05) out.push({ ...e, affinity: a });
  }
  out.sort((x, y) => sign * (y.affinity - x.affinity) || y.n - x.n);
  return out.slice(0, limit);
}
