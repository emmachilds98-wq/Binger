// Moods: "What are you in the mood for?" on Discover. Pure.
//
// Each mood is a set of canonical genres (js/sources/genres.js), any of
// which fits, and genres that rule a title out (no horror-comedies under
// "Funny"). Anime themes from AniList's tags (Iyashikei, Time Travel…) can
// fit too. A mood is named after the rate sheet's feeling tags, so what you
// tagged "Funny" yourself steers what "Funny" brings up (moodSeeds).

import { latestTags, latestRating, itemSignal, ratingBaseline, decay } from './profile.js';

export const MOODS = [
  { id: 'funny', label: 'Funny', line: 'Make me laugh', tags: ['Funny', 'Light-hearted', 'Quotable'], genres: ['Comedy'], not: ['Horror', 'War'] },
  { id: 'feel-good', label: 'Feel-good', line: 'Warm, cosy, easy to love', tags: ['Feel-good', 'Comfort watch', 'Light-hearted'], genres: ['Comedy', 'Family', 'Romance', 'Music', 'Slice of Life'], themes: /iyashikei|found family|heartwarming/i, not: ['Horror', 'Thriller', 'Crime', 'War'] },
  { id: 'gripping', label: 'Gripping', line: 'Edge of my seat', tags: ['Gripping', 'Tense', 'Binge-worthy'], genres: ['Thriller', 'Mystery', 'Crime', 'Action'], not: ['Family', 'Kids'] },
  { id: 'mind-bending', label: 'Mind-bending', line: 'Something to think about', tags: ['Mind-bending', 'Thought-provoking', 'Great twist', 'Clever'], genres: ['Science Fiction', 'Mystery', 'Psychological'], themes: /time travel|time loop|dystopia|philosoph|alternate|simulation|parallel/i, not: ['Family', 'Kids'] },
  { id: 'scary', label: 'Scary', line: 'Lights off', tags: ['Scary'], genres: ['Horror'], not: ['Family', 'Kids'] },
  { id: 'romantic', label: 'Romantic', line: 'Love stories', tags: ['Romantic'], genres: ['Romance'], not: ['Horror'] },
  { id: 'moving', label: 'Moving', line: 'Ready for a good cry', tags: ['Moving'], genres: ['Drama'], not: ['Comedy', 'Horror', 'Action'] },
  { id: 'epic', label: 'Epic', line: 'Big worlds, big adventures', tags: ['Epic', 'Action-packed'], genres: ['Adventure', 'Fantasy'], not: ['Documentary'] },
  { id: 'dark', label: 'Dark', line: 'Gritty and grim', tags: ['Dark'], genres: ['Crime', 'Thriller', 'War', 'Psychological'], not: ['Family', 'Kids', 'Comedy', 'Animation'] },
  { id: 'true-stories', label: 'True stories', line: 'Real people, real events', tags: [], genres: ['Documentary', 'History'], not: [] },
  { id: 'family', label: 'Family night', line: 'Something everyone can watch', tags: [], genres: ['Family', 'Kids'], not: ['Horror'] },
];

export function moodOf(id) {
  return MOODS.find((m) => m.id === id) || null;
}

// Does this title fit the mood? id or mood object. An unknown mood fits everything.
export function matchesMood(title, mood) {
  const m = typeof mood === 'string' ? moodOf(mood) : mood;
  if (!m || !title) return true;
  const genres = title.genres || [];
  if (genres.some((g) => m.not.includes(g))) return false;
  if (genres.some((g) => m.genres.includes(g))) return true;
  return !!(m.themes && title.source === 'anilist' && (title.keywords || []).some((k) => m.themes.test(k)));
}

// What you've watched and tagged with this mood's feelings (and didn't
// dislike), strongest first, in pickSeeds' shape { item, rating, strength },
// so the deck can ask "more like this" about them.
export function moodSeeds(items, mood, { now = Date.now(), limit = 3 } = {}) {
  const m = typeof mood === 'string' ? moodOf(mood) : mood;
  if (!m || !m.tags.length) return [];
  const list = Object.values(items || {}).filter((it) => it && it.title && it.status === 'watched');
  const baseline = ratingBaseline(list);
  const out = [];
  for (const item of list) {
    const tags = latestTags(item);
    if (!tags.some((t) => m.tags.includes(t))) continue;
    const rating = latestRating(item);
    if (rating != null && rating < 3) continue;
    const sig = itemSignal(item, baseline);
    const strength = sig ? Math.max(0.3, sig.s) * decay(sig.at, now, sig.halfLife) : 0.3;
    out.push({ item, rating, strength, tag: tags.find((t) => m.tags.includes(t)) });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, limit);
}
