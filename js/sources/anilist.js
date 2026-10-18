// AniList adapter (anime). No key needed. AniList's GraphQL API is rate-limited
// (30 requests/minute at the time of writing), so the whole deck's worth of
// anime is fetched in ONE batched request (deckBatch) rather than many small ones.

import { fetchJSON, cached, HOUR, DAY } from './http.js';
import { canonicalGenres } from './genres.js';

const ENDPOINT = 'https://graphql.anilist.co';

// Formats worth discovering. OVAs, specials and music videos are mostly side
// content for people already watching the main show.
export const DECK_FORMATS = ['TV', 'TV_SHORT', 'MOVIE', 'ONA'];

export function fragment(voiceLanguage = 'JAPANESE') {
  const lang = voiceLanguage === 'ENGLISH' ? 'ENGLISH' : 'JAPANESE';
  return `fragment M on Media {
  id title { romaji english } format status episodes duration season seasonYear
  startDate { year month day } endDate { year month day } nextAiringEpisode { airingAt episode }
  countryOfOrigin isAdult description(asHtml: false) genres averageScore popularity
  coverImage { extraLarge large color } bannerImage trailer { id site }
  tags { name rank isMediaSpoiler }
  studios(isMain: true) { nodes { id name } }
  staff(perPage: 6, sort: [RELEVANCE]) { edges { role node { id name { full } } } }
  characters(perPage: 6, sort: [ROLE, RELEVANCE, ID]) { edges { role node { name { full } }
    voiceActors(language: ${lang}, sort: [RELEVANCE, ID]) { id name { full } image { medium } } } }
  relations { edges { relationType(version: 2) node { id type } } }
  siteUrl
}`;
}

const pad = (n) => String(n).padStart(2, '0');
function dateOf(d) {
  if (!d || !d.year) return null;
  return `${d.year}-${pad(d.month || 1)}-${pad(d.day || 1)}`;
}

const ENTITIES = { amp: '&', quot: '"', '#039': "'", apos: "'", lt: '<', gt: '>', mdash: '—', ndash: '–', hellip: '…', nbsp: ' ' };

export function cleanDescription(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? m)
    .replace(/\((Source|Sources):[^)]*\)/gi, '')
    .replace(/\[(Written by|Note:)[^\]]*\]/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

const LANG = { JP: 'ja', CN: 'zh', TW: 'zh', KR: 'ko' };
const FORMAT_LABEL = { TV: 'Series', TV_SHORT: 'Shorts', MOVIE: 'Anime film', ONA: 'Web series', OVA: 'OVA', SPECIAL: 'Special' };

export function fromAniList(m) {
  if (!m || !m.id) return null;
  const relations = (m.relations && m.relations.edges) || [];
  const rel = (type) => relations.filter((e) => e && e.relationType === type && e.node && e.node.type === 'ANIME').map((e) => e.node.id);
  const cast = [];
  for (const edge of (m.characters && m.characters.edges) || []) {
    const va = edge.voiceActors && edge.voiceActors[0];
    if (!va || cast.some((c) => c.id === `anilist:s:${va.id}`)) continue;
    cast.push({ id: `anilist:s:${va.id}`, name: String(va.name.full).trim(), character: edge.node && edge.node.name ? String(edge.node.name.full).trim() : null, photo: va.image ? va.image.medium : null });
  }
  const crew = [];
  for (const edge of (m.staff && m.staff.edges) || []) {
    const role = edge.role || '';
    const job = /^Director$/i.test(role) ? 'Director' : /^Original (Creator|Story)$/i.test(role) ? 'Original Story' : null;
    if (job && edge.node && !crew.some((c) => c.id === `anilist:s:${edge.node.id}`)) {
      crew.push({ id: `anilist:s:${edge.node.id}`, name: String(edge.node.name.full).trim(), job });
    }
  }
  const finished = m.status === 'FINISHED';
  return {
    id: `anilist:${m.id}`,
    source: 'anilist',
    sourceId: m.id,
    mediaType: 'anime',
    kind: 'anime',
    title: (m.title && (m.title.english || m.title.romaji)) || 'Untitled',
    originalTitle: (m.title && m.title.romaji) || null,
    year: m.seasonYear || (m.startDate && m.startDate.year) || null,
    releaseDate: dateOf(m.startDate),
    lastAirDate: finished ? dateOf(m.endDate) : null,
    airing: m.status === 'RELEASING',
    status: m.status || null,
    nextEpisode: m.nextAiringEpisode ? { episode: m.nextAiringEpisode.episode, at: m.nextAiringEpisode.airingAt * 1000 } : null,
    overview: cleanDescription(m.description),
    poster: (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || null,
    backdrop: m.bannerImage || null,
    color: (m.coverImage && m.coverImage.color) || null,
    genres: canonicalGenres(m.genres || []),
    keywords: (m.tags || []).filter((t) => !t.isMediaSpoiler && t.rank >= 60).slice(0, 10).map((t) => t.name),
    cast,
    crew: crew.slice(0, 3),
    studios: ((m.studios && m.studios.nodes) || []).map((s) => s.name).slice(0, 2),
    language: LANG[m.countryOfOrigin] || 'ja',
    format: m.format || null,
    formatLabel: FORMAT_LABEL[m.format] || null,
    episodes: m.episodes ?? null,
    runtime: m.duration ?? null,
    score: typeof m.averageScore === 'number' ? m.averageScore / 10 : null,
    votes: m.popularity ?? null,
    popularity: m.popularity ?? null,
    trailer: m.trailer && m.trailer.site === 'youtube' && m.trailer.id ? { site: 'youtube', key: m.trailer.id, name: 'Trailer' } : null,
    prequelIds: rel('PREQUEL'),
    sequelIds: rel('SEQUEL'),
    isAdult: !!m.isAdult,
    url: m.siteUrl || `https://anilist.co/anime/${m.id}`,
    detailed: true,
  };
}

export function seasonOf(date) {
  const month = date.getUTCMonth() + 1;
  const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
  return { season, year: date.getUTCFullYear() };
}

export function buildDeckQuery(voiceLanguage) {
  return `${fragment(voiceLanguage)}
query ($season: MediaSeason, $year: Int, $genres: [String], $seeds: [Int], $sequels: [Int], $page: Int,
       $withSeeds: Boolean!, $withGenres: Boolean!, $withSequels: Boolean!) {
  trending: Page(perPage: 25) { media(type: ANIME, sort: [TRENDING_DESC], isAdult: false) { ...M } }
  season: Page(perPage: 20) { media(type: ANIME, season: $season, seasonYear: $year, sort: [POPULARITY_DESC], isAdult: false) { ...M } }
  genre: Page(perPage: 25, page: $page) @include(if: $withGenres) {
    media(type: ANIME, genre_in: $genres, sort: [SCORE_DESC], isAdult: false, popularity_greater: 5000) { ...M } }
  seeds: Page(perPage: 10) @include(if: $withSeeds) {
    media(id_in: $seeds) { id title { romaji english }
      recommendations(perPage: 6, sort: [RATING_DESC]) { nodes { mediaRecommendation { ...M } } } } }
  sequels: Page(perPage: 10) @include(if: $withSequels) { media(id_in: $sequels) { ...M } }
}`;
}

// Turns a deckBatch response into { trending, season, genre, seeds: [{seedId, titles}], sequels }.
export function parseDeckBatch(data) {
  const media = (k) => ((data && data[k] && data[k].media) || []).map(fromAniList).filter(Boolean);
  const seeds = ((data && data.seeds && data.seeds.media) || []).map((s) => ({
    seedId: `anilist:${s.id}`,
    titles: ((s.recommendations && s.recommendations.nodes) || [])
      .map((n) => n && n.mediaRecommendation)
      .filter((m) => m && !m.isAdult)
      .map(fromAniList)
      .filter(Boolean),
  }));
  return { trending: media('trending'), season: media('season'), genre: media('genre'), seeds, sequels: media('sequels') };
}

export function createAniList({ fetchImpl = globalThis.fetch, cache = null, voiceLanguage = 'JAPANESE' } = {}) {
  async function gql(query, variables, cacheKey, ttl) {
    const load = async () => {
      const json = await fetchJSON(ENDPOINT, {
        fetchImpl,
        source: 'anilist',
        init: { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) },
      });
      if (json.errors && !json.data) throw new Error(json.errors[0] && json.errors[0].message);
      return json.data;
    };
    return cacheKey ? cached(cache, cacheKey, ttl, load) : load();
  }

  return {
    async deckBatch({ seeds = [], sequels = [], genres = [], page = 1, now = new Date() } = {}) {
      const { season, year } = seasonOf(now);
      const vars = {
        season, year, genres, page,
        seeds: seeds.slice(0, 10), sequels: sequels.slice(0, 10),
        withSeeds: seeds.length > 0, withGenres: genres.length > 0, withSequels: sequels.length > 0,
      };
      const key = `anilist:deck:${voiceLanguage}:${JSON.stringify(vars)}`;
      return parseDeckBatch(await gql(buildDeckQuery(voiceLanguage), vars, key, 6 * HOUR));
    },
    async popular() {
      const q = `${fragment(voiceLanguage)} query { Page(perPage: 30) { media(type: ANIME, sort: [POPULARITY_DESC], isAdult: false, format_in: [TV, MOVIE]) { ...M } } }`;
      const data = await gql(q, {}, `anilist:popular:${voiceLanguage}`, DAY);
      return ((data && data.Page && data.Page.media) || []).map(fromAniList).filter(Boolean);
    },
    async search(text) {
      const q = String(text || '').trim();
      if (!q) return [];
      const query = `${fragment(voiceLanguage)} query ($q: String) { Page(perPage: 15) { media(search: $q, type: ANIME, isAdult: false, sort: [SEARCH_MATCH]) { ...M } } }`;
      const data = await gql(query, { q }, `anilist:search:${voiceLanguage}:${q.toLowerCase()}`, HOUR);
      return ((data && data.Page && data.Page.media) || []).map(fromAniList).filter(Boolean);
    },
    async details(id) {
      const query = `${fragment(voiceLanguage)} query ($id: Int) { Media(id: $id, type: ANIME) { ...M } }`;
      const data = await gql(query, { id: Number(id) }, `anilist:media:${voiceLanguage}:${id}`, 3 * DAY);
      return fromAniList(data && data.Media);
    },
  };
}
