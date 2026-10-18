// The recommendation engine. Pure functions only: no DOM, no fetch, no storage.
// See docs/ARCHITECTURE.md ("The engine") for the maths in plain English.
export { GROUPS, featuresOf, groupOf, KIND_LABEL } from './features.js';
export { buildProfile, topFeatures, latestRating, latestWatch, ratingBaseline, itemSignal, SIGNAL, HALF_LIFE_DAYS } from './profile.js';
export { scoreTitle, affinityOf, quality, freshness, warmth } from './score.js';
export { explain } from './explain.js';
export { buildDeck, rankWatchlist, eligible, DEFAULT_MIX } from './rank.js';
