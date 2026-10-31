// Plain-English reasons for a recommendation ("Because you loved Arrival").
// Every card shows at least one, so you can always see what Binger is doing
// with your ratings, and correct it.

import { viaOf, latestDate } from './score.js';
import { DAY } from './profile.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthYear(ms) {
  const d = new Date(ms);
  return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// "Highly rated: IMDb 8.6" when a review score is known (js/sources/ratings.js).
function highlyRated(t) {
  const r = t.ratings || {};
  if (r.imdb) return `Highly rated: IMDb ${r.imdb.value.toFixed(1)}`;
  if (r.audience) return `Highly rated: ${r.audience.value}% of Rotten Tomatoes’ audience liked it`;
  if (r.mal) return `Highly rated: MyAnimeList ${r.mal.value.toFixed(1)}`;
  return 'Highly rated';
}

export function explain(title, scored, profile, { now = Date.now(), max = 3, services = null } = {}) {
  const out = [];
  const push = (kind, text) => {
    if (text && !out.some((r) => r.text === text)) out.push({ kind, text });
  };

  if (scored.explore) push('explore', 'Something different, and highly rated');

  const sequel = viaOf(title, 'sequel');
  if (sequel) push('sequel', `Next part of ${sequel.seedTitle}, which you watched`);

  const seed = viaOf(title, 'seed');
  if (seed && seed.seedTitle) {
    if (seed.seedRating >= 4) push('seed', `Because you loved ${seed.seedTitle}`);
    else if (seed.seedStatus === 'want') push('seed', `Like ${seed.seedTitle}, on your watchlist`);
    else push('seed', `Because you liked ${seed.seedTitle}`);
  }

  // Liked genres are folded into one line ("Fantasy and Comedy: genres you love")
  // rather than spending three reasons on them.
  // A wildcard is, by definition, not picked for your usual taste, so it
  // doesn't also claim to match it. One "Stars ..." line per card is plenty.
  let genreReason = null;
  for (const c of scored.explore ? [] : scored.contributions || []) {
    if (c.v < 0.015 || c.a < 0.25) continue;
    if (c.group === 'cast' && out.some((r) => r.kind === 'cast')) continue;
    if (c.group === 'genre') {
      if (c.a < 0.35) continue;
      if (genreReason) { genreReason.labels.push(c.label); continue; }
      if (out.length >= max) continue;
      genreReason = { kind: 'genre', text: '', labels: [c.label] };
      out.push(genreReason);
      continue;
    }
    if (out.length >= max) continue;
    const ev = profile.evidence.get(c.key);
    const from = ev && ev.best && ev.best.title !== title.title ? ev.best.title : null;
    if (c.group === 'creator' && from) push('creator', `From ${c.label}, who made ${from}`);
    else if (c.group === 'cast' && from) push('cast', `Stars ${c.label}, from ${from}`);
    else if (c.group === 'studio' && from) push('studio', `By ${c.label}, the studio behind ${from}`);
    else if (c.group === 'keyword' && c.a >= 0.35) push('keyword', `${cap(c.label)}: a theme you rate highly`);
    else if (c.group === 'length' && c.a >= 0.35) push('length', `${c.label}: your sweet spot`);
  }
  if (genreReason) {
    const l = genreReason.labels.slice(0, 3);
    genreReason.text = l.length === 1 ? `${l[0]} is one of your favourites` : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}: genres you love`;
    delete genreReason.labels;
  }

  if (out.length < max) {
    const at = latestDate(title);
    if (title.airing) push('fresh', 'Airing now');
    else if (at != null && at > now && at - now < 120 * DAY) push('fresh', `Coming ${monthYear(at)}`);
    else if (at != null && at <= now && now - at < 90 * DAY) push('fresh', `New: out ${monthYear(at)}`);
  }
  if (out.length < max && scored.onServices && services && services.length) {
    const on = (title.streaming || []).filter((x) => services.includes(x));
    push('stream', on.length ? `On ${on.slice(0, 2).join(' and ')}` : 'On one of your services');
  }
  // A streaming service's own series ("An Apple TV+ original").
  if (out.length < max && viaOf(title, 'originals')) push('stream', viaOf(title, 'originals').label);
  if (out.length < max && viaOf(title, 'trending')) push('trending', 'Trending this week');
  // Reached by a "wider" pull (js/sources/candidates.js): say how.
  if (out.length < max && viaOf(title, 'wider')) push('explore', viaOf(title, 'wider').label);
  if (!out.length) push('quality', scored.quality > 0.3 ? highlyRated(title) : 'Popular right now');
  return out.slice(0, max);
}
