// "It's back": new seasons of TV you've watched. Anime gets this in the deck
// (a sequel is its own AniList entry, so it turns up as "Next part of..."),
// but a TV show keeps one TMDB id across seasons and so never returns to the
// deck once you've watched it. This spots the new season instead. Pure.
//
// A season counts as new if it premieres after the latest date you logged
// watching the show. Logging the new season (a fresh diary entry) clears it.

import { latestWatch } from './profile.js';

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// item: your library item; show: fresh TMDB details for it (seasonList,
// nextEpisode, airing). Returns null, or
// { id, key: 's3', season: 3, date: 'YYYY-MM-DD', state: 'soon' | 'airing' | 'out', title }.
export function seasonAlert(item, show, { now = Date.now() } = {}) {
  if (!item || !show || show.kind !== 'tv' || item.status !== 'watched') return null;
  const last = latestWatch(item);
  const since = (last && last.date) || String(item.updatedAt || '').slice(0, 10);
  if (!since) return null;

  const fresh = (show.seasonList || [])
    .filter((s) => s && s.number > 0 && s.date && s.date > since)
    .sort((a, b) => a.number - b.number);
  let season = fresh[0] || null;
  // TMDB sometimes knows the premiere date (next episode is episode 1) before
  // the season itself has a date.
  const next = show.nextEpisode;
  if (!season && next && next.episode === 1 && next.date && next.date > since) {
    season = { number: next.season, date: next.date };
  }
  if (!season || season.number == null) return null;

  const key = `s${season.number}`;
  if ((item.dismissed || []).includes(key)) return null;
  const today = isoDay(now);
  const state = season.date > today ? 'soon'
    : show.airing && next && next.season === season.number ? 'airing'
      : 'out';
  return { id: item.id, key, season: season.number, date: season.date, state, title: show };
}

// Every alert, most pressing first: airing now, then out, then coming soon
// (soonest first).
export function seasonAlerts(items, showsById, { now = Date.now() } = {}) {
  const order = { airing: 0, out: 1, soon: 2 };
  const out = [];
  for (const item of Object.values(items || {})) {
    const a = seasonAlert(item, showsById[item.id], { now });
    if (a) out.push(a);
  }
  return out.sort((a, b) => order[a.state] - order[b.state]
    || (a.state === 'soon' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));
}

// Which watched shows to check: TV only, most recently watched first.
export function showsToCheck(items, { limit = 24 } = {}) {
  return Object.values(items || {})
    .filter((it) => it && it.status === 'watched' && it.title && it.title.kind === 'tv' && it.title.source === 'tmdb')
    .sort((a, b) => String((latestWatch(b) || {}).date || '').localeCompare(String((latestWatch(a) || {}).date || '')))
    .slice(0, limit);
}
