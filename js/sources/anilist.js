// AniList adapter (anime). No key needed. AniList's GraphQL API is rate-limited
// (30 requests/minute at the time of writing), so the whole deck's worth of
// anime is fetched in ONE batched request (deckBatch) rather than many small ones.

import { fetchJSON, cached, HOUR, DAY } from './http.js';
import { canonicalGenres } from './genres.js';
import { canonicalServices } from './services.js';

const ENDPOINT = 'https://graphql.anilist.co';

// Formats worth discovering. OVAs, specials and music videos are mostly side
// content for people already watching the main show.
export const DECK_FORMATS = ['TV', 'TV_SHORT', 'MOVIE', 'ONA'];

export function fragment(voiceLanguage = 'JAPANESE') {
  const lang = voiceLanguage === 'ENGLISH' ? 'ENGLISH' : 'JAPANESE';
  return `fragment M on Media {
  id idMal type title { romaji english } format status episodes duration season seasonYear
  startDate { year month day } endDate { year month day } nextAiringEpisode { airingAt episode }
  countryOfOrigin isAdult description(asHtml: false) genres averageScore popularity
  coverImage { extraLarge large color } bannerImage trailer { id site }
  tags { name rank isMediaSpoiler }
  studios(isMain: true) { nodes { id name } }
  staff(perPage: 6, sort: [RELEVANCE]) { edges { role node { id name { full } } } }
  characters(perPage: 6, sort: [ROLE, RELEVANCE, ID]) { edges { role node { name { full } }
    voiceActors(language: ${lang}, sort: [RELEVANCE, ID]) { id name { full } image { medium } } } }
  relations { edges { relationType(version: 2) node { id type } } }
  externalLinks { site type url isDisabled }
  siteUrl
}`;
}

// Relations that make two anime "the same series" for "Not this franchise".
// Spin-offs and side stories count; a shared character cameo does not.
export const FRANCHISE_RELATIONS = ['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'SUMMARY', 'COMPILATION'];

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
  const rel = (...types) => relations.filter((e) => e && types.includes(e.relationType) && e.node && e.node.type === 'ANIME').map((e) => e.node.id);
  const links = ((m.externalLinks || []).filter((l) => l && l.type === 'STREAMING' && !l.isDisabled && l.site));
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
    malId: m.idMal || null, // MyAnimeList's id, for review scores (js/sources/ratings.js)
    mediaType: 'anime',
    kind: 'anime',
    title: (m.title && (m.title.english || m.title.romaji)) || 'Untitled',
    originalTitle: (m.title && m.title.romaji) || null,
    year: m.seasonYear || (m.startDate && m.startDate.year) || null,
    releaseDate: dateOf(m.startDate),
    lastAirDate: finished ? dateOf(m.endDate) : null,
    airing: m.status === 'RELEASING',
    status: m.status || null,
    // Same shape as TMDB's ({ season, episode, date }), plus the exact time.
    nextEpisode: m.nextAiringEpisode ? {
      season: null,
      episode: m.nextAiringEpisode.episode,
      date: new Date(m.nextAiringEpisode.airingAt * 1000).toISOString().slice(0, 10),
      at: m.nextAiringEpisode.airingAt * 1000,
    } : null,
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
    franchiseIds: [...new Set(rel(...FRANCHISE_RELATIONS))],
    // AniList's streaming links are worldwide, not per region.
    streaming: canonicalServices(links.map((l) => l.site)),
    watchLinks: links.map((l) => ({ name: canonicalServices([l.site])[0], url: l.url })).filter((l) => l.url),
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
       $withSeeds: Boolean!, $withGenres: Boolean!, $withSequels: Boolean!,
       $withFiltered: Boolean!, $from: FuzzyDateInt, $to: FuzzyDateInt, $episodesBelow: Int, $filterGenres: [String]) {
  trending: Page(perPage: 25) { media(type: ANIME, sort: [TRENDING_DESC], isAdult: false) { ...M } }
  season: Page(perPage: 20) { media(type: ANIME, season: $season, seasonYear: $year, sort: [POPULARITY_DESC], isAdult: false) { ...M } }
  genre: Page(perPage: 25, page: $page) @include(if: $withGenres) {
    media(type: ANIME, genre_in: $genres, sort: [SCORE_DESC], isAdult: false, popularity_greater: 5000) { ...M } }
  seeds: Page(perPage: 10) @include(if: $withSeeds) {
    media(id_in: $seeds) { id title { romaji english }
      recommendations(perPage: 6, sort: [RATING_DESC]) { nodes { mediaRecommendation { ...M } } } } }
  sequels: Page(perPage: 10) @include(if: $withSequels) { media(id_in: $sequels) { ...M } }
  filtered: Page(perPage: 25, page: $page) @include(if: $withFiltered) {
    media(type: ANIME, isAdult: false, format_in: [TV, TV_SHORT, MOVIE, ONA], startDate_greater: $from, startDate_lesser: $to,
          episodes_lesser: $episodesBelow, genre_in: $filterGenres, sort: [SCORE_DESC], popularity_greater: 3000) { ...M } }
}`;
}

// AniList dates as FuzzyDateInt (YYYYMMDD). Deck filters ask for a decade,
// e.g. { from: 1990, to: 1999 } -> 19900000 .. 20000000.
export function decadeRange(filters = {}) {
  const d = filters.decade;
  if (d === 'older') return { from: null, to: 19800000 };
  if (typeof d === 'number') return { from: d * 10000, to: (d + 10) * 10000 };
  return { from: null, to: null };
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
  return { trending: media('trending'), season: media('season'), genre: media('genre'), seeds, sequels: media('sequels'), filtered: media('filtered') };
}

// A voice actor's roles and a staff member's credits, merged per show (one
// actor often voices several characters in the same series). `major` marks a
// lead voice role or a creative lead, which the person screen ranks higher
// than, say, one episode's key animation.
const MAJOR_STAFF = /^(Director|Chief Director|Series Director|Original (Creator|Story)|Series Composition|Character Design)$/i;

export function parsePerson(staff) {
  if (!staff || !staff.id) return null;
  const byId = new Map();
  const add = (node, role, major) => {
    if (!node || node.type !== 'ANIME' || node.isAdult) return;
    const t = fromAniList(node);
    if (!t) return;
    const had = byId.get(t.id);
    if (had) {
      if (role && !had.roles.includes(role)) had.roles.push(role);
      had.major = had.major || major;
      return;
    }
    byId.set(t.id, { ...t, roles: role ? [role] : [], major });
  };
  for (const e of (staff.characterMedia && staff.characterMedia.edges) || []) {
    const names = (e.characters || []).map((c) => c && c.name && String(c.name.full).trim()).filter(Boolean);
    add(e.node, names.join(' / ') || null, e.characterRole === 'MAIN');
  }
  for (const e of (staff.staffMedia && staff.staffMedia.edges) || []) {
    const role = e.staffRole ? String(e.staffRole).replace(/\s*\(.*\)$/, '') : null;
    add(e.node, role, !!role && MAJOR_STAFF.test(role));
  }
  return {
    person: {
      id: `anilist:s:${staff.id}`,
      name: String((staff.name && staff.name.full) || '').trim(),
      photo: (staff.image && (staff.image.large || staff.image.medium)) || null,
      known: (staff.primaryOccupations || []).slice(0, 2).join(' · ') || null,
      url: staff.siteUrl || `https://anilist.co/staff/${staff.id}`,
    },
    // Lead roles first in the role text; two is plenty on a row.
    credits: [...byId.values()].map(({ roles, ...t }) => {
      const sorted = [...roles].sort((a, b) => MAJOR_STAFF.test(b) - MAJOR_STAFF.test(a));
      return { ...t, role: sorted.slice(0, 2).join(', ') || null };
    }),
  };
}

// Every anime in the same series as `media`: its direct relations, the next
// hop of prequels and sequels, and every anime adapted from the same source
// manga or novel (the most reliable thread through a long franchise).
export function parseFranchise(media) {
  if (!media || !media.id) return null;
  const ids = new Set([media.id]);
  let sourceTitle = null;
  for (const e of (media.relations && media.relations.edges) || []) {
    const n = e && e.node;
    if (!n) continue;
    if (n.type === 'ANIME' && FRANCHISE_RELATIONS.includes(e.relationType)) {
      ids.add(n.id);
      for (const e2 of (n.relations && n.relations.edges) || []) {
        if (e2 && e2.node && e2.node.type === 'ANIME' && FRANCHISE_RELATIONS.includes(e2.relationType)) ids.add(e2.node.id);
      }
    }
    if (e.relationType === 'SOURCE' && n.type === 'MANGA') {
      sourceTitle = sourceTitle || (n.title && (n.title.english || n.title.romaji)) || null;
      for (const e2 of (n.relations && n.relations.edges) || []) {
        if (e2 && e2.relationType === 'ADAPTATION' && e2.node && e2.node.type === 'ANIME') ids.add(e2.node.id);
      }
    }
  }
  const own = (media.title && (media.title.english || media.title.romaji)) || 'this series';
  return {
    key: `anilist:franchise:${Math.min(...ids)}`,
    name: sourceTitle || own,
    ids: [...ids].sort((a, b) => a - b).map((id) => `anilist:${id}`),
  };
}

const FRANCHISE_QUERY = `query ($id: Int) { Media(id: $id, type: ANIME) { id title { english romaji }
  relations { edges { relationType(version: 2) node { id type title { english romaji }
    relations { edges { relationType(version: 2) node { id type } } } } } } } }`;

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
    // filters: the deck's { short, decade } (see decadeRange). When set, one
    // extra page asks AniList for exactly that, since trending and this season
    // rarely include, say, 1990s anime.
    async deckBatch({ seeds = [], sequels = [], genres = [], page = 1, now = new Date(), filters = null } = {}) {
      const { season, year } = seasonOf(now);
      const range = decadeRange(filters || {});
      const withFiltered = !!(filters && (filters.short || filters.decade));
      const vars = {
        season, year, genres, page,
        seeds: seeds.slice(0, 10), sequels: sequels.slice(0, 10),
        withSeeds: seeds.length > 0, withGenres: genres.length > 0, withSequels: sequels.length > 0,
        withFiltered, from: range.from, to: range.to,
        episodesBelow: withFiltered && filters.short ? 14 : null,
        filterGenres: withFiltered && genres.length ? genres : null,
      };
      const key = `anilist:deck:${voiceLanguage}:${JSON.stringify(vars)}`;
      return parseDeckBatch(await gql(buildDeckQuery(voiceLanguage), vars, key, 6 * HOUR));
    },
    // The most-watched anime of all time, 30 a page (the first-run grid).
    async popular(page = 1) {
      const q = `${fragment(voiceLanguage)} query ($page: Int) { Page(page: $page, perPage: 30) { media(type: ANIME, sort: [POPULARITY_DESC], isAdult: false, format_in: [TV, MOVIE]) { ...M } } }`;
      const data = await gql(q, { page }, `anilist:popular:${voiceLanguage}${page > 1 ? `:${page}` : ''}`, DAY);
      return ((data && data.Page && data.Page.media) || []).map(fromAniList).filter(Boolean);
    },
    async search(text) {
      const q = String(text || '').trim();
      if (!q) return [];
      const query = `${fragment(voiceLanguage)} query ($q: String) { Page(perPage: 25) { media(search: $q, type: ANIME, isAdult: false, sort: [SEARCH_MATCH]) { ...M } } }`;
      const data = await gql(query, { q }, `anilist:search:${voiceLanguage}:${q.toLowerCase()}`, HOUR);
      return ((data && data.Page && data.Page.media) || []).map(fromAniList).filter(Boolean);
    },
    // Anime by their MyAnimeList ids (imports from MyAnimeList), 25 a request.
    async byMalIds(ids) {
      const want = [...new Set((ids || []).map(Number).filter((n) => n > 0))];
      const out = [];
      for (let i = 0; i < want.length; i += 25) {
        const chunk = want.slice(i, i + 25);
        const query = `${fragment(voiceLanguage)} query ($ids: [Int]) { Page(perPage: 25) { media(idMal_in: $ids, type: ANIME) { ...M } } }`;
        const data = await gql(query, { ids: chunk }, `anilist:mal:${voiceLanguage}:${chunk.join(',')}`, 7 * DAY);
        out.push(...((data && data.Page && data.Page.media) || []).map(fromAniList).filter(Boolean));
      }
      return out;
    },
    // Anime by AniList id, 25 a request (imports from an AniList list).
    async byIds(ids) {
      const want = [...new Set((ids || []).map(Number).filter((n) => n > 0))];
      const out = [];
      for (let i = 0; i < want.length; i += 25) {
        const chunk = want.slice(i, i + 25);
        const query = `${fragment(voiceLanguage)} query ($ids: [Int]) { Page(perPage: 25) { media(id_in: $ids, type: ANIME) { ...M } } }`;
        const data = await gql(query, { ids: chunk }, `anilist:ids:${voiceLanguage}:${chunk.join(',')}`, 7 * DAY);
        out.push(...((data && data.Page && data.Page.media) || []).map(fromAniList).filter(Boolean));
      }
      return out;
    },
    // Someone's public AniList anime list: each entry's AniList id, status,
    // score (0-10, 0 when unrated), when they finished it and their notes.
    // Custom lists repeat entries from the standard ones, so they're left out.
    async userList(userName) {
      const name = String(userName || '').trim();
      if (!name) return [];
      const query = `query ($name: String) { MediaListCollection(userName: $name, type: ANIME) {
  lists { isCustomList entries { status score(format: POINT_10_DECIMAL) completedAt { year month day } updatedAt notes media { id } } } } }`;
      const data = await gql(query, { name }, null, 0);
      const lists = (data && data.MediaListCollection && data.MediaListCollection.lists) || [];
      return lists.filter((l) => l && !l.isCustomList).flatMap((l) => l.entries || []).map((e) => ({
        id: e.media && e.media.id,
        status: e.status,
        score: typeof e.score === 'number' ? e.score : 0,
        date: dateOf(e.completedAt) || (e.updatedAt ? new Date(e.updatedAt * 1000).toISOString().slice(0, 10) : null),
        notes: (e.notes || '').trim(),
      })).filter((e) => e.id);
    },
    async details(id) {
      const query = `${fragment(voiceLanguage)} query ($id: Int) { Media(id: $id, type: ANIME) { ...M } }`;
      const data = await gql(query, { id: Number(id) }, `anilist:media:${voiceLanguage}:${id}`, 3 * DAY);
      return fromAniList(data && data.Media);
    },
    // id: the number from 'anilist:s:<n>'.
    async person(id) {
      const query = `${fragment(voiceLanguage)} query ($id: Int) { Staff(id: $id) {
  id name { full } image { large medium } primaryOccupations siteUrl
  characterMedia(perPage: 25, sort: [POPULARITY_DESC]) { edges { characterRole characters { name { full } } node { ...M } } }
  staffMedia(perPage: 20, type: ANIME, sort: [POPULARITY_DESC]) { edges { staffRole node { ...M } } } } }`;
      const data = await gql(query, { id: Number(id) }, `anilist:staff:${voiceLanguage}:${id}`, 3 * DAY);
      return parsePerson(data && data.Staff);
    },
    async franchise(id) {
      const data = await gql(FRANCHISE_QUERY, { id: Number(id) }, `anilist:franchise:${id}`, 7 * DAY);
      return parseFranchise(data && data.Media);
    },
  };
}
