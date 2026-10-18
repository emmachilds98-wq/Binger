// TMDB adapter (films and TV). Needs a free API key: either a v3 "API key"
// (32 hex characters) or a v4 "API Read Access Token" (starts "eyJ").
// Everything leaves this file as a normalised Title (docs/ARCHITECTURE.md).
//
// This product uses the TMDB API but is not endorsed or certified by TMDB.

import { fetchJSON, cached, HOUR, DAY, ApiError } from './http.js';
import { tmdbGenreNames, canonicalGenres } from './genres.js';

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

export function fromTmdbList(r, mediaType = r.media_type) {
  if (!r || (mediaType !== 'movie' && mediaType !== 'tv') || r.adult) return null;
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
    t.networks = (d.networks || []).map((n) => n.name).slice(0, 2);
    const cr = ((d.content_ratings && d.content_ratings.results) || []).find((r) => r.iso_3166_1 === region);
    t.certification = (cr && cr.rating) || null;
  }
  t.studios = (d.production_companies || []).map((c) => c.name).slice(0, 2);
  t.trailer = pickTrailer(d.videos && d.videos.results);

  const wp = d['watch/providers'] && d['watch/providers'].results && d['watch/providers'].results[region];
  t.providers = wp ? {
    link: wp.link || null,
    stream: (wp.flatrate || []).map(provider),
    free: [...(wp.free || []), ...(wp.ads || [])].map(provider),
    rent: (wp.rent || []).map(provider),
    buy: (wp.buy || []).map(provider),
  } : null;
  t.detailed = true;
  return t;
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

  return {
    hasKey: !!auth,
    region,
    async test() {
      await get('/configuration', {}, 0);
      return true;
    },
    async trending(mediaType) {
      return list(await get(`/trending/${mediaType}/week`), mediaType);
    },
    async popular(mediaType, page = 1) {
      return list(await get(`/${mediaType}/popular`, { page, region: mediaType === 'movie' ? region : undefined }, 12 * HOUR), mediaType);
    },
    async discover(mediaType, { genreIds = [], page = 1, minVotes = 150, from = null, to = null, airingFrom = null, airingTo = null } = {}) {
      const p = { sort_by: 'popularity.desc', include_adult: 'false', page, 'vote_count.gte': minVotes };
      if (genreIds.length) p.with_genres = [...new Set(genreIds)].join('|');
      if (mediaType === 'movie') {
        if (from) p['primary_release_date.gte'] = from;
        if (to) p['primary_release_date.lte'] = to;
      } else {
        if (from) p['first_air_date.gte'] = from;
        if (to) p['first_air_date.lte'] = to;
        if (airingFrom) p['air_date.gte'] = airingFrom;
        if (airingTo) p['air_date.lte'] = airingTo;
      }
      return list(await get(`/discover/${mediaType}`, p), mediaType);
    },
    async recommendations(mediaType, id) {
      return list(await get(`/${mediaType}/${id}/recommendations`, {}, DAY), mediaType);
    },
    async details(mediaType, id) {
      const append = mediaType === 'movie'
        ? 'credits,keywords,videos,watch/providers,release_dates'
        : 'aggregate_credits,keywords,videos,watch/providers,content_ratings';
      const d = await get(`/${mediaType}/${id}`, { append_to_response: append, include_video_language: 'en,null' }, 3 * DAY);
      return fromTmdbDetail(d, mediaType, region);
    },
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const json = await get('/search/multi', { query: q, include_adult: 'false' }, HOUR);
      return ((json && json.results) || []).map((r) => fromTmdbList(r, r.media_type)).filter((t) => t && !t.animeLike);
    },
  };
}
