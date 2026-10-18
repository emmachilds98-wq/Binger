// Scores one candidate title against your profile. Pure.
//
//   score = affinity  (how well it matches what you've rated / swiped)
//         + quality   (public rating, shrunk toward average when few people voted)
//         + freshness (new releases and currently-airing shows get a lift)
//         + seed      (it was recommended off the back of something you loved)
//         + trending
//
// The mix shifts as Binger learns: a brand-new user is shown mostly
// well-rated, popular things; once there's enough signal, affinity dominates.

import { GROUPS, featuresOf } from './features.js';
import { DAY } from './profile.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function affinityOf(title, profile) {
  const byGroup = {};
  for (const f of featuresOf(title)) (byGroup[f.group] ||= []).push(f);
  let total = 0;
  let weight = 0;
  const contributions = [];
  for (const [g, feats] of Object.entries(byGroup)) {
    const spec = GROUPS[g];
    let groupScore;
    if (spec.mode === 'mean') {
      const den = feats.reduce((s, f) => s + f.w, 0);
      let num = 0;
      for (const f of feats) {
        const a = profile.aff.get(f.key) || 0;
        num += a * f.w;
        contributions.push({ ...f, a, v: (spec.weight * a * f.w) / den });
      }
      groupScore = num / den;
    } else {
      let sum = 0;
      for (const f of feats) {
        const a = profile.aff.get(f.key) || 0;
        sum += a * f.w;
        if (a) contributions.push({ ...f, a, v: spec.weight * a * f.w });
      }
      groupScore = Math.tanh(sum);
    }
    total += spec.weight * groupScore;
    weight += spec.weight;
  }
  contributions.sort((x, y) => y.v - x.v);
  return { value: weight ? total / weight : 0, contributions };
}

// Bayesian average: a 9.0 from 12 voters is treated as roughly a 6.9.
export function quality(title) {
  if (typeof title.score !== 'number') return 0;
  const C = 6.5;
  const m = title.source === 'anilist' ? 2000 : 150;
  const v = Math.max(0, title.votes || 0);
  const bayes = (v * title.score + m * C) / (v + m);
  return clamp((bayes - C) / 2, -1, 1);
}

export function latestDate(title) {
  const dates = [title.releaseDate, title.lastAirDate].filter(Boolean).map(Date.parse).filter((x) => !Number.isNaN(x));
  return dates.length ? Math.max(...dates) : null;
}

export function freshness(title, now = Date.now()) {
  if (title.airing) return 1;
  const at = latestDate(title);
  if (at == null) return 0;
  const days = (now - at) / DAY;
  if (days < 0) return days > -120 ? 0.4 : 0.1; // coming soon
  if (days <= 90) return 1;
  if (days >= 540) return 0;
  return 1 - (days - 90) / 450;
}

export function viaOf(title, type) {
  return (title.via || []).find((v) => v.type === type) || null;
}

export function seedBoost(title) {
  if (viaOf(title, 'sequel')) return 1;
  const seed = viaOf(title, 'seed');
  return seed ? clamp(seed.strength ?? 0.6, 0, 1) : 0;
}

export function warmth(profile) {
  return clamp((profile.stats.strength || 0) / 4, 0, 1);
}

// Each recent "Overhyped" tag makes "Trending this week" count for less.
export function hypeTrust(profile) {
  return 1 / (1 + 0.6 * ((profile.stats && profile.stats.hype) || 0));
}

// Is this title included with one of your streaming services?
//   true  - yes (or it came from a search for exactly your services)
//   false - we know where it streams, and it isn't on yours
//   null  - not known yet (film/TV list data, before details are fetched)
export function onServices(title, services) {
  if (!services || !services.length) return null;
  if (Array.isArray(title.streaming) && (title.detailed || title.source === 'anilist')) {
    if (title.streaming.some((s) => services.includes(s))) return true;
    // A title found by asking TMDB for your services' catalogue is on one of
    // them even if its details came back without that region's data.
    return title.streamHint ? true : false;
  }
  return title.streamHint ? true : null;
}

export const SERVICE_BOOST = 0.06;

export function scoreTitle(title, profile, { now = Date.now(), preferFresh = true, services = null } = {}) {
  const aff = affinityOf(title, profile);
  const q = quality(title);
  const fr = freshness(title, now);
  const seed = seedBoost(title);
  const trend = viaOf(title, 'trending') ? 1 : 0;
  const warm = warmth(profile);
  const onSvc = onServices(title, services);
  const score =
    (0.15 + 0.5 * warm) * aff.value +
    (0.35 - 0.15 * warm) * q +
    (preferFresh ? 0.1 : 0.02) * fr +
    0.12 * seed +
    (0.1 - 0.06 * warm) * hypeTrust(profile) * trend +
    (onSvc ? SERVICE_BOOST : 0);
  return { score, affinity: aff.value, quality: q, fresh: fr, onServices: onSvc, contributions: aff.contributions };
}
