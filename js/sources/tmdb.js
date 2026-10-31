// TMDB adapter (films and TV). Needs a free API key: either a v3 "API key"
// (32 hex characters) or a v4 "API Read Access Token" (starts "eyJ").
// Everything leaves this file as a normalised Title (docs/ARCHITECTURE.md).
//
// This product uses the TMDB API but is not endorsed or certified by TMDB.

import { fetchJSON, cached, HOUR, DAY, ApiError } from './http.js';
import { tmdbGenreNames, canonicalGenres } from './genres.js';
import { canonicalService, canonicalServices } from './services.js';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';

export const img = (path, size) => (path ? IMG + size + path : null);

export function authFor(key) {
  const k = String(key || '').trim();
  if (!k) return null;
  if (k.startsWith('eyJ')) return { headers: { Authorization: 'Bearer ' + k }, params: {} };
  return { headers: {}, params: { api_key: k } };
}

const yearOf = (date) => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null);

// Anime comes from AniList (better data: studios, voice cast, seasons), so
// TMDB's copies of Japanese animation are dropped to avoid duplicates.
export function isAnimeLike(r) {
  const ids = r.genre_ids || (r.genres || []).map((g) => g.id);
  return ids.includes(16) && (r.original_language === 'ja' || (r.origin_country || []).includes('JP'));
}

// News and talk shows (TMDB TV genres 10763, 10767) are guest spots and
// headlines, not something to swipe for; daily soaps (10766) air so often
// they'd fill every "on now" list. Left out of the deck's TV lists.
export const NOT_FOR_DECK = [10763, 10767, 10766];
const forDeck = (r) => !(r.genre_ids || []).some((g) => NOT_FOR_DECK.includes(g));

export function fromTmdbList(r, mediaType = r.media_type) {
  if (!r || r.id == null || (mediaType !== 'movie' && mediaType !== 'tv') || r.adult) return null;
  const date = (mediaType === 'movie' ? r.release_date : r.first_air_date) || null;
  return {
    id: `tmdb:${mediaType}:${r.id}`,
    source: 'tmdb',
    sourceId: r.id,
    mediaType,
    kind: mediaType === 'movie' ? 'film' : 'tv',
    title: r.title || r.name || 'Untitled',
    originalTitle: r.original_title || r.original_name || null,
    year: yearOf(date),
    releaseDate: date,
    overview: r.overview || '',
    poster: img(r.poster_path, 'w500'),
    backdrop: img(r.backdrop_path, 'w780'),
    genres: tmdbGenreNames(r.genre_ids, mediaType),
    keywords: [],
    cast: [],
    crew: [],
    studios: [],
    language: r.original_language || null,
    score: typeof r.vote_average === 'number' && r.vote_count ? r.vote_average : null,
    votes: r.vote_count ?? null,
    popularity: r.popularity ?? null,
    trailer: null,
    url: `https://www.themoviedb.org/${mediaType}/${r.id}`,
    animeLike: isAnimeLike(r),
    detailed: false,
  };
}

export function pickTrailer(videos = []) {
  const yt = videos.filter((v) => v && v.site === 'YouTube' && v.key);
  const rank = (v) => (v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 20 : 40) + (v.official ? 0 : 5) + (v.iso_639_1 === 'en' ? 0 : 2);
  yt.sort((a, b) => rank(a) - rank(b) || String(b.published_at || '').localeCompare(String(a.published_at || '')));
  const best = yt[0];
  return best ? { site: 'youtube', key: best.key, name: best.name || 'Trailer' } : null;
}

const provider = (p) => ({ name: p.provider_name, logo: img(p.logo_path, 'w92') });

const episode = (e) => (e && e.air_date ? { season: e.season_number ?? null, episode: e.episode_number ?? null, date: e.air_date } : null);

export function fromTmdbDetail(d, mediaType, region = 'GB') {
  const t = fromTmdbList({ ...d, genre_ids: (d.genres || []).map((g) => g.id) }, mediaType);
  if (!t) return null;
  t.genres = canonicalGenres((d.genres || []).map((g) => g.name));
  t.tagline = d.tagline || '';
  t.status = d.status || null;

  const kw = mediaType === 'movie' ? d.keywords && d.keywords.keywords : d.keywords && d.keywords.results;
  t.keywords = (kw || []).map((k) => k.name).slice(0, 12);

  if (mediaType === 'movie') {
    const credits = d.credits || {};
    t.cast = (credits.cast || []).slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).slice(0, 8)
      .map((c) => ({ id: `tmdb:p:${c.id}`, name: c.name, character: c.character || null, photo: img(c.profile_path, 'w185') }));
    const crew = credits.crew || [];
    const directors = crew.filter((c) => c.job === 'Director');
    const writers = crew.filter((c) => c.job === 'Screenplay' || c.job === 'Writer').slice(0, 2);
    t.crew = [...directors, ...writers].map((c) => ({ id: `tmdb:p:${c.id}`, name: c.name, job: c.job }));
    t.runtime = d.runtime || null;
    const rel = ((d.release_dates && d.release_dates.results) || []).find((r) => r.iso_3166_1 === region);
    t.certification = (rel && (rel.release_dates || []).map((x) => x.certification).find(Boolean)) || null;
    const c = d.belongs_to_collection;
    t.collection = c && c.id ? { id: `tmdb:collection:${c.id}`, name: collectionName(c.name) } : null;
  } else {
    const credits = d.aggregate_credits || d.credits || {};
    t.cast = (credits.cast || []).slice(0, 8).map((c) => ({
      id: `tmdb:p:${c.id}`,
      name: c.name,
      character: c.character || (c.roles && c.roles[0] && c.roles[0].character) || null,
      photo: img(c.profile_path, 'w185'),
    }));
    t.crew = (d.created_by || []).map((c) => ({ id: `tmdb:p:${c.id}`, name: c.name, job: 'Creator' }));
    t.runtime = (d.episode_run_time && d.episode_run_time[0]) || null;
    t.seasons = d.number_of_seasons ?? null;
    t.episodes = d.number_of_episodes ?? null;
    t.lastAirDate = d.last_air_date || null;
    t.airing = !!d.next_episode_to_air;
    t.nextEpisode = episode(d.next_episode_to_air);
    t.lastEpisode = episode(d.last_episode_to_air);
    // Season 0 is "Specials" on TMDB; it's not a new season.
    t.seasonList = (d.seasons || []).filter((x) => x && x.season_number > 0)
      .map((x) => ({ number: x.season_number, date: x.air_date || null, episodes: x.episode_count ?? null, name: x.name || null }));
    t.networks = (d.networks || []).map((n) => n.name).slice(0, 2);
    const cr = ((d.content_ratings && d.content_ratings.results) || []).find((r) => r.iso_3166_1 === region);
    t.certification = (cr && cr.rating) || null;
  }
  t.studios = (d.production_companies || []).map((c) => c.name).slice(0, 2);
  // For the IMDb link in details (films carry it; series via external_ids).
  t.imdbId = d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || null;
  t.trailer = pickTrailer(d.videos && d.videos.results);

  const wp = d['watch/providers'] && d['watch/providers'].results && d['watch/providers'].results[region];
  t.providers = wp ? {
    link: wp.link || null,
    stream: (wp.flatrate || []).map(provider),
    free: [...(wp.free || []), ...(wp.ads || [])].map(provider),
    rent: (wp.rent || []).map(provider),
    buy: (wp.buy || []).map(provider),
  } : null;
  // Included in a subscription or free: what "on my services" means.
  // Rent and buy don't count.
  t.streaming = t.providers ? canonicalServices([...t.providers.stream, ...t.providers.free].map((x) => x.name)) : [];
  t.detailed = true;
  return t;
}

// "Dune Collection" -> "Dune".
export function collectionName(name) {
  return String(name || '').replace(/\s*[-:]?\s*(the )?collection$/i, '').trim() || String(name || '');
}

// The region's providers, one entry per service (TMDB lists the same service
// several times: "Netflix", "Netflix Standard with Ads"...), most common first.
export function fromTmdbProviders(json, region = 'GB') {
  const rank = (p) => (p.display_priorities && p.display_priorities[region]) ?? p.display_priority ?? 999;
  // A service that lists the countries it's in, without yours, isn't offered.
  const here = (p) => !p.display_priorities || p.display_priorities[region] != null;
  const list = ((json && json.results) || []).filter((p) => p && p.provider_id && p.provider_name && here(p)).sort((a, b) => rank(a) - rank(b));
  const out = [];
  for (const p of list) {
    const service = canonicalService(p.provider_name);
    let entry = out.find((x) => x.service === service);
    if (!entry) { entry = { service, ids: [], logo: img(p.logo_path, 'w92') }; out.push(entry); }
    if (!entry.ids.includes(p.provider_id)) entry.ids.push(p.provider_id);
  }
  return out;
}

const KNOWN_FOR = { Acting: 'Actor', Directing: 'Director', Writing: 'Writer', Production: 'Producer', Sound: 'Composer', Camera: 'Cinematographer', Creator: 'Creator' };
// Crew jobs worth listing on someone's page. Executive producer credits are
// too many and say too little about the work.
const PERSON_JOBS = ['Director', 'Creator', 'Screenplay', 'Writer', 'Teleplay', 'Novel', 'Story', 'Original Story', 'Characters', 'Original Music Composer', 'Director of Photography'];
const MAJOR_JOBS = ['Director', 'Creator', 'Screenplay', 'Writer', 'Novel'];
const SELF = /\b(self|himself|herself|themselves|host|archive footage)\b/i;
const NOT_DRAMA = [10763, 10767]; // News, Talk: guest spots, not work you'd watch for them

// A person and their films and shows, from /person/{id}?append_to_response=combined_credits.
// Each credit is a list-level Title plus `role` and `major` (a lead role or a
// creative lead), merged when someone is both in and behind the same title.
export function fromTmdbPerson(d) {
  if (!d || !d.id) return null;
  const byId = new Map();
  const add = (r, role, major) => {
    if (!r || (r.genre_ids || []).some((g) => NOT_DRAMA.includes(g))) return;
    if (!r.poster_path && !(r.vote_count >= 10)) return; // obscure: no art, barely rated
    const t = fromTmdbList(r, r.media_type);
    if (!t || t.animeLike) return;
    const had = byId.get(t.id);
    if (had) {
      if (role && !had.roles.includes(role)) had.roles.push(role);
      had.major = had.major || major;
      return;
    }
    byId.set(t.id, { ...t, roles: role ? [role] : [], major });
  };
  const credits = d.combined_credits || {};
  for (const c of credits.cast || []) {
    if (c.character && SELF.test(c.character)) continue;
    const major = c.media_type === 'tv' ? (c.episode_count || 0) >= 8 : (c.order ?? 99) <= 3;
    add(c, c.character || null, major);
  }
  for (const c of credits.crew || []) {
    if (!PERSON_JOBS.includes(c.job)) continue;
    add(c, c.job, MAJOR_JOBS.includes(c.job));
  }
  const list = [...byId.values()]
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 60)
    .map(({ roles, ...t }) => ({ ...t, role: roles.slice(0, 2).join(', ') || null }));
  return {
    person: {
      id: `tmdb:p:${d.id}`,
      name: d.name || '',
      photo: img(d.profile_path, 'w342'),
      known: KNOWN_FOR[d.known_for_department] || d.known_for_department || null,
      url: `https://www.themoviedb.org/person/${d.id}`,
    },
    credits: list,
  };
}

// Someone from /search/person: who they are, and the titles they're known
// for (as list-level Titles; Japanese animation left to AniList).
export function fromTmdbPersonHit(r) {
  if (!r || !r.id || r.adult) return null;
  return {
    id: `tmdb:p:${r.id}`,
    name: r.name || '',
    photo: img(r.profile_path, 'w185'),
    known: KNOWN_FOR[r.known_for_department] || r.known_for_department || null,
    popularity: r.popularity ?? 0,
    knownFor: (r.known_for || []).map((k) => fromTmdbList(k, k.media_type)).filter((t) => t && !t.animeLike),
  };
}

// Every film in a TMDB collection, for "Not this franchise".
export function fromTmdbCollection(d) {
  if (!d || !d.id) return null;
  return {
    key: `tmdb:collection:${d.id}`,
    name: collectionName(d.name),
    ids: ((d.parts || []).map((p) => p && p.id).filter(Boolean)).map((id) => `tmdb:movie:${id}`),
  };
}

export function createTmdb({ key, region = 'GB', language = 'en-GB', fetchImpl = globalThis.fetch, cache = null } = {}) {
  const auth = authFor(key);

  async function get(path, params = {}, ttl = 6 * HOUR) {
    if (!auth) throw new ApiError('Add a TMDB key in Settings to see films and TV', { status: 401, source: 'tmdb' });
    const query = { language, ...params };
    const keyPart = Object.keys(query).sort().map((k) => `${k}=${query[k]}`).join('&');
    const url = new URL(API + path);
    for (const [k, v] of Object.entries({ ...query, ...auth.params })) {
      if (v != null && v !== '') url.searchParams.set(k, String(v));
    }
    return cached(cache, `tmdb:${path}?${keyPart}`, ttl, () =>
      fetchJSON(url.toString(), { fetchImpl, init: { headers: { Accept: 'application/json', ...auth.headers } }, source: 'tmdb' }));
  }

  const list = (json, mediaType) => ((json && json.results) || []).map((r) => fromTmdbList(r, mediaType)).filter(Boolean);
  // Lists for the deck and the first-run grid: TV without news, talk or soaps.
  const deckList = (json, mediaType) => list(mediaType === 'tv' && json && json.results ? { results: json.results.filter(forDeck) } : json, mediaType);

  return {
    hasKey: !!auth,
    region,
    async test() {
      await get('/configuration', {}, 0);
      return true;
    },
    async trending(mediaType, page = 1) {
      return deckList(await get(`/trending/${mediaType}/week`, page > 1 ? { page } : {}), mediaType);
    },
    async popular(mediaType, page = 1) {
      return deckList(await get(`/${mediaType}/popular`, { page, region: mediaType === 'movie' ? region : undefined }, 12 * HOUR), mediaType);
    },
    // providerIds: only titles included with these services (subscription or
    // free) in your region. networkIds: TV made by these networks (a
    // service's own shows: TMDB_NETWORKS in services.js). runtimeMax: films
    // under N minutes. originalLanguage, minScore, maxVotes and
    // withoutGenreIds reach past what's popular: classics, hidden gems,
    // films from other countries. TV never includes news, talk or soaps.
    async discover(mediaType, { genreIds = [], page = 1, minVotes = 150, from = null, to = null, airingFrom = null, airingTo = null, providerIds = [], networkIds = [], runtimeMax = null, sortBy = 'popularity.desc', originalLanguage = null, minScore = null, maxVotes = null, withoutGenreIds = [] } = {}) {
      const p = { sort_by: sortBy, include_adult: 'false', page, 'vote_count.gte': minVotes };
      const without = mediaType === 'tv' ? [...withoutGenreIds, ...NOT_FOR_DECK] : withoutGenreIds;
      if (genreIds.length) p.with_genres = [...new Set(genreIds)].join('|');
      if (without.length) p.without_genres = [...new Set(without)].join(',');
      if (mediaType === 'tv' && networkIds.length) p.with_networks = [...new Set(networkIds)].join('|');
      if (originalLanguage) p.with_original_language = originalLanguage;
      if (minScore) p['vote_average.gte'] = minScore;
      if (maxVotes) p['vote_count.lte'] = maxVotes;
      if (providerIds.length) {
        p.with_watch_providers = [...new Set(providerIds)].sort((a, b) => a - b).join('|');
        p.watch_region = region;
        p.with_watch_monetization_types = 'flatrate|free|ads';
      }
      if (runtimeMax) { p['with_runtime.lte'] = runtimeMax; p['with_runtime.gte'] = 40; }
      if (mediaType === 'movie') {
        if (from) p['primary_release_date.gte'] = from;
        if (to) p['primary_release_date.lte'] = to;
      } else {
        if (from) p['first_air_date.gte'] = from;
        if (to) p['first_air_date.lte'] = to;
        if (airingFrom) p['air_date.gte'] = airingFrom;
        if (airingTo) p['air_date.lte'] = airingTo;
      }
      return deckList(await get(`/discover/${mediaType}`, p), mediaType);
    },
    async recommendations(mediaType, id) {
      return deckList(await get(`/${mediaType}/${id}/recommendations`, {}, DAY), mediaType);
    },
    // Same genres and keywords: what "more like this" falls back on when a
    // new or niche title has few recommendations yet.
    async similar(mediaType, id) {
      return deckList(await get(`/${mediaType}/${id}/similar`, {}, DAY), mediaType);
    },
    async details(mediaType, id) {
      const append = mediaType === 'movie'
        ? 'credits,keywords,videos,watch/providers,release_dates'
        : 'aggregate_credits,keywords,videos,watch/providers,content_ratings,external_ids';
      const d = await get(`/${mediaType}/${id}`, { append_to_response: append, include_video_language: 'en,null' }, 3 * DAY);
      return fromTmdbDetail(d, mediaType, region);
    },
    async providers(mediaType) {
      const json = await get(`/watch/providers/${mediaType}`, { watch_region: region }, 7 * DAY);
      return fromTmdbProviders(json, region);
    },
    // id: the number from 'tmdb:p:<n>'.
    async person(id) {
      return fromTmdbPerson(await get(`/person/${id}`, { append_to_response: 'combined_credits' }, 3 * DAY));
    },
    // id: the number from 'tmdb:collection:<n>'.
    async collection(id) {
      return fromTmdbCollection(await get(`/collection/${id}`, {}, 7 * DAY));
    },
    // Films and series asked for separately: /search/multi shares its 20
    // results with people, so a show could miss out to an actor's namesake.
    // Merged most popular first; js/sources/lookups.js ranks by closeness.
    // year: only titles from that year (a film's release, a series' first episode).
    async search(query, { year = null } = {}) {
      const q = String(query || '').trim();
      if (!q) return [];
      const yearParam = (m) => (year ? (m === 'movie' ? { year } : { first_air_date_year: year }) : {});
      // One half failing still returns the other; both failing is an error.
      const settled = await Promise.allSettled(['movie', 'tv'].map((m) => get(`/search/${m}`, { query: q, include_adult: 'false', ...yearParam(m) }, HOUR).then((json) => list(json, m))));
      const ok = settled.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
      if (settled.every((r) => r.status === 'rejected')) throw settled[0].reason;
      return ok.filter((t) => !t.animeLike).sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    },
    // People whose name matches, most popular first, with what they're known for.
    async searchPeople(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const json = await get('/search/person', { query: q, include_adult: 'false' }, HOUR);
      return ((json && json.results) || []).map(fromTmdbPersonHit).filter(Boolean);
    },
    // An IMDb id ('tt0111161') -> the film or series it is on TMDB (list-level
    // Title), or null. Exact, so imports from IMDb never guess. Cached a month.
    async find(imdbId) {
      const id = String(imdbId || '').trim();
      if (!/^tt\d+$/.test(id)) return null;
      const json = await get(`/find/${id}`, { external_source: 'imdb_id' }, 30 * DAY);
      const film = ((json && json.movie_results) || [])[0];
      const show = ((json && json.tv_results) || [])[0];
      return film ? fromTmdbList(film, 'movie') : show ? fromTmdbList(show, 'tv') : null;
    },
    // id: a TMDB network id (TMDB_NETWORKS in services.js), for the live check.
    async network(id) {
      const d = await get(`/network/${id}`, {}, 7 * DAY);
      return d && d.id ? { id: d.id, name: d.name || '' } : null;
    },
  };
}
