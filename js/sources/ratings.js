// Review scores, from MDBList (mdblist.com): IMDb, Rotten Tomatoes (critics
// and audience), Metacritic and Letterboxd for a film or series, by its TMDB
// id, and MyAnimeList's for anime, by its MyAnimeList id (AniList's idMal).
// Rotten Tomatoes and IMDb have no open API of their own (Rotten Tomatoes
// licenses its scores to partners only), so this one free service is how
// Binger shows them: docs/COVERAGE-PLAN.md → Sources.
//
// Needs a free key (mdblist.com → Preferences → API), built in at deploy
// like the TMDB key (CONFIG.mdblistKey). Without one, titles have no scores
// and nothing else changes. The free plan allows 1,000 lookups a day, so
// each title's scores are kept for a week.

import { fetchJSON, cached, DAY } from './http.js';

const API = 'https://api.mdblist.com';

// MDBList's links are paths on each site ("/m/jaws", "/film/jaws/").
const on = (site, path) => (typeof path === 'string' && path.startsWith('/') ? site + path : null);
const round1 = (x) => Math.round(x * 10) / 10;

// An MDBList title -> { imdb, critics, audience, metacritic, letterboxd, mal, imdbId },
// each { value, votes, url } on its own scale (IMDb and MyAnimeList out of
// 10, Letterboxd out of 5, the rest out of 100), or null when there's no
// score. null when nothing has a score.
export function fromMdblist(d) {
  if (!d || !Array.isArray(d.ratings)) return null;
  const find = (...names) => d.ratings.find((r) => r && names.includes(r.source) && typeof r.value === 'number') || null;
  const imdbId = (d.ids && typeof d.ids.imdb === 'string' && d.ids.imdb) || null;
  const votes = (r) => (typeof r.votes === 'number' ? r.votes : null);
  const imdb = find('imdb');
  const critics = find('tomatoes');
  // Rotten Tomatoes' audience score (its "Popcornmeter"); MDBList has
  // called it all three of these.
  const audience = find('popcorn', 'tomatoesaudience', 'audience');
  const metacritic = find('metacritic');
  const letterboxd = find('letterboxd');
  const mal = find('myanimelist');
  const malId = (d.ids && d.ids.mal) || null;
  const out = {
    imdb: imdb ? { value: round1(imdb.value), votes: votes(imdb), url: imdbId ? `https://www.imdb.com/title/${imdbId}/` : null } : null,
    critics: critics ? { value: Math.round(critics.value), votes: votes(critics), url: on('https://www.rottentomatoes.com', critics.url) } : null,
    audience: audience ? { value: Math.round(audience.value), votes: votes(audience), url: on('https://www.rottentomatoes.com', audience.url) || on('https://www.rottentomatoes.com', critics && critics.url) } : null,
    metacritic: metacritic ? { value: Math.round(metacritic.value), votes: votes(metacritic), url: null } : null,
    // Out of 5 on Letterboxd; MDBList's score is out of 100.
    letterboxd: letterboxd ? { value: round1(typeof letterboxd.score === 'number' ? letterboxd.score / 20 : letterboxd.value > 5 ? letterboxd.value / 2 : letterboxd.value), votes: votes(letterboxd), url: on('https://letterboxd.com', letterboxd.url) } : null,
    mal: mal ? { value: round1(mal.value), votes: votes(mal), url: malId ? `https://myanimelist.net/anime/${malId}` : null } : null,
    imdbId,
  };
  return out.imdb || out.critics || out.audience || out.metacritic || out.letterboxd || out.mal ? out : null;
}

export function createRatings({ key, fetchImpl = globalThis.fetch, cache = null } = {}) {
  const k = String(key || '').trim();
  return {
    hasKey: !!k,
    // A film or series from TMDB, or an anime with a MyAnimeList id -> its
    // scores, or null (no key, no id to ask by, or MDBList doesn't know it).
    async forTitle(t) {
      if (!k || !t) return null;
      let path;
      if (t.source === 'tmdb' && t.sourceId != null) path = `tmdb/${t.mediaType === 'movie' ? 'movie' : 'show'}/${t.sourceId}`;
      else if (t.source === 'anilist' && t.malId) path = `mal/any/${t.malId}`;
      else return null;
      const url = `${API}/${path.split('/').map(encodeURIComponent).join('/')}?apikey=${encodeURIComponent(k)}`;
      // Only the scores are kept, under a cache key without the API key. A
      // title MDBList doesn't know is remembered too, so it isn't asked about
      // again all week.
      const d = await cached(cache, `mdblist:${path.replace(/\//g, ':')}`, 7 * DAY, () =>
        fetchJSON(url, { fetchImpl, source: 'mdblist', init: { headers: { Accept: 'application/json' } } })
          .then((r) => ({ ids: (r && r.ids) || null, ratings: (r && r.ratings) || [] }))
          .catch((err) => { if (err && err.status === 404) return { ids: null, ratings: [] }; throw err; }));
      return fromMdblist(d);
    },
  };
}
