// Taste over time: rebuild your profile as it stood at a few points in the
// past (using only what you'd rated, saved or passed by then, decayed as of
// then) and track how each top genre has moved. Pure.

import { buildProfile, DAY } from './profile.js';

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// The item as it stood at `at`: only the viewings logged on or before that
// day; a save or pass only if it had happened by then.
export function itemAsOf(item, at) {
  if (!item || !item.title) return null;
  const day = isoDay(at);
  const watches = (item.watches || []).filter((w) => w && w.date && String(w.date).slice(0, 10) <= day);
  if (watches.length) return { ...item, status: 'watched', watches };
  if (item.status === 'watched') return null; // first watched after `at`
  const set = Date.parse(item.updatedAt || item.addedAt || '');
  return set && set <= at ? { ...item, watches: [] } : null;
}

export const TREND_STEP = 0.12;

// points: how many snapshots (oldest first, the last one is now);
// stepDays: the gap between them. Returns
// { at: [ms...], series: [{ key, label, values: [affinity | null], trend }], enough }.
// `enough` is false until at least three snapshots have something to say.
export function tasteTimeline(items, { now = Date.now(), points = 6, stepDays = 30, group = 'genre', limit = 5 } = {}) {
  const list = Object.values(items || {});
  const at = Array.from({ length: points }, (_, i) => now - (points - 1 - i) * stepDays * DAY);
  const profiles = at.map((t) => buildProfile(list.map((it) => itemAsOf(it, t)).filter(Boolean), { now: t }));

  const ranked = (p, n) => [...p.evidence.values()]
    .filter((e) => e.group === group)
    .map((e) => ({ key: e.key, label: e.label, a: p.aff.get(e.key) || 0 }))
    .filter((e) => e.a > 0.05)
    .sort((x, y) => y.a - x.a)
    .slice(0, n);

  // Today's favourites, plus anything that used to be a favourite and has faded.
  const keys = new Map();
  for (const e of ranked(profiles[points - 1], limit)) keys.set(e.key, e.label);
  for (const p of profiles.slice(0, -1)) {
    for (const e of ranked(p, 2)) if (!keys.has(e.key) && keys.size < limit + 2) keys.set(e.key, e.label);
  }

  const series = [...keys].map(([key, label]) => {
    const values = profiles.map((p) => (p.stats.items ? p.aff.get(key) || 0 : null));
    const known = values.filter((v) => v != null);
    const delta = known.length > 1 ? known[known.length - 1] - known[0] : 0;
    const trend = delta > TREND_STEP ? 'rising' : delta < -TREND_STEP ? 'fading' : 'steady';
    return { key, label, values, trend, delta };
  });
  const enough = profiles.filter((p) => p.stats.items >= 3).length >= 3;
  return { at, series, enough };
}
