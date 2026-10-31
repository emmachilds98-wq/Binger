// The recommendation engine. Pure functions only: no DOM, no fetch, no storage.
// See docs/ARCHITECTURE.md ("The engine") for the maths in plain English.
export { GROUPS, featuresOf, groupOf, KIND_LABEL, lengthBucket, LENGTH_LABEL, isFilmLike } from './features.js';
export { buildProfile, topFeatures, latestRating, latestWatch, latestTags, ratingBaseline, itemSignal, tagNudge, feelingSummary, ASPECT_NUDGE, SIGNAL, HALF_LIFE_DAYS, TAG_NUDGE } from './profile.js';
export { scoreTitle, affinityOf, quality, freshness, warmth, onServices, hypeTrust } from './score.js';
export { explain } from './explain.js';
export { buildDeck, rankWatchlist, rankForYou, eligible, isShort, inDecade, franchiseBlock, isBlocked, DEFAULT_MIX, KINDS, toggleKind } from './rank.js';
export { seasonAlert, seasonAlerts, showsToCheck } from './seasons.js';
export { tasteTimeline, itemAsOf, monthEnds } from './timeline.js';
export { blend, togetherScore, togetherReasons, partnerReason, partnerExclusions, partnerWants, LEAST_KEEN_WEIGHT, PARTNER_WANT_BOOST } from './together.js';
