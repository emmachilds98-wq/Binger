// One-off lookups the screens ask for, each routed to the right source:
// search, the first-run grid, a service's shows, a person's work, a whole
// franchise, the streaming services you can pick, and new seasons of shows
// you've watched.

import { COMMON_SERVICES, TMDB_NETWORKS, isStoreOnly, serviceFromQuery } from './services.js';
import { providerIdsFor } from './candidates.js';
import { mapLimit, DAY } from './http.js';
import { seasonAlerts, showsToCheck } from '../engine/index.js';

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const settledValues = (settled) => settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);

// One from each list in turn, skipping repeats: [a1, b1, c1, a2, b2, …].
export function interleave(lists) {
  const out = [];
  const seen = new Set();
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const t = list[i];
      if (t && t.id && !seen.has(t.id)) { seen.add(t.id); out.push(t); }
    }
  }
  return out;
}

// ---- Search ------------------------------------------------------------------

// For comparing names: "Pokémon: The Movie!" and "pokemon the movie" match.
export function normaliseName(s) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const ARTICLE = /^(the|a|an) /;

// How closely a title's name matches what was typed: 0 the same name,
// 1 starts with it, 2 has every word ("slow hor" finds Slow Horses),
// 3 anything else the source thought was a match.
export function matchTier(title, query) {
  const q = normaliseName(query).replace(ARTICLE, '');
  if (!q) return 3;
  const words = q.split(' ');
  let best = 3;
  for (const raw of [title.title, title.originalTitle]) {
    const name = normaliseName(raw).replace(ARTICLE, '');
    if (!name) continue;
    if (name === q) return 0;
    if (name.startsWith(q)) best = Math.min(best, 1);
    else if (words.every((w) => name.split(' ').some((n) => n.startsWith(w)))) best = Math.min(best, 2);
  }
  return best;
}

// Results from several sources, best match first. Within a tier, each
// source's own order (TMDB's most popular, AniList's best match) decides,
// sources taking turns, and titles with no poster go last.
export function rankSearch(query, lists) {
  const all = [];
  const seen = new Set();
  lists.forEach((list, li) => (list || []).forEach((t, pos) => {
    if (!t || !t.id || seen.has(t.id)) return;
    seen.add(t.id);
    all.push({ t, tier: matchTier(t, query), art: t.poster ? 0 : 1, pos, li });
  }));
  all.sort((a, b) => a.tier - b.tier || a.art - b.art || a.pos - b.pos || a.li - b.li);
  return all.map((x) => x.t);
}

// A streaming service's shows and films: its own series (TMDB networks, any
// country), then what's included with it where you live (watch providers).
// Not marked as "on your services": you may have typed one you don't have.
export async function serviceTitles(service, { tmdb, page = 1 } = {}) {
  if (!service || !tmdb || !tmdb.hasKey) return [];
  const networkIds = TMDB_NETWORKS[service] || [];
  const jobs = [];
  if (networkIds.length) jobs.push(tmdb.discover('tv', { networkIds, minVotes: 10, page }));
  jobs.push(providerIdsFor(tmdb, [service]).then((ids) => (ids.length
    ? Promise.all(['movie', 'tv'].map((m) => tmdb.discover(m, { providerIds: ids, minVotes: 50, page })))
    : [])));
  const lists = settledValues(await Promise.allSettled(jobs)).flatMap((v) => (Array.isArray(v[0]) ? v : [v]));
  return interleave(lists.map((l) => l.filter((t) => !t.animeLike)));
}

// Search films, TV and anime at once. Typing a service's name ("apple tv",
// "netflix") also brings up that service's shows, first.
// -> { titles, errors, service } (service: the name matched, or null).
export async function searchTitles(query, { tmdb, anilist, limit = 40 } = {}) {
  const q = String(query || '').trim();
  if (!q) return { titles: [], errors: [], service: null };
  const service = serviceFromQuery(q);
  const jobs = [];
  if (tmdb && tmdb.hasKey) jobs.push(tmdb.search(q));
  if (anilist) jobs.push(anilist.search(q));
  const [svc, ...settled] = await Promise.allSettled([serviceTitles(service, { tmdb }), ...jobs]);
  const errors = settled.filter((r) => r.status === 'rejected').map((r) => r.reason);
  const found = rankSearch(q, settledValues(settled));
  const fromService = svc.status === 'fulfilled' ? svc.value.slice(0, 24) : [];
  const ids = new Set(fromService.map((t) => t.id));
  const titles = [...fromService, ...found.filter((t) => !ids.has(t.id))].slice(0, limit + fromService.length);
  return { titles, errors, service: fromService.length ? service : null };
}

// ---- First run ---------------------------------------------------------------

// "What have you loved?": titles most people will have seen. This week's
// trending, the films and series with the most ratings on TMDB (the ones
// nearly everyone has watched), the biggest of the last three years, and
// the most-watched anime. Films, TV and anime take turns. page 2, 3… for
// "Show more".
export async function starterTitles({ tmdb, anilist, page = 1, now = Date.now() } = {}) {
  const kinds = [];
  if (tmdb && tmdb.hasKey) {
    const since = isoDay(now - 3 * 365 * DAY);
    for (const m of ['movie', 'tv']) {
      kinds.push(Promise.allSettled([
        tmdb.trending(m, page),
        tmdb.discover(m, { sortBy: 'vote_count.desc', minVotes: 500, page }),
        tmdb.discover(m, { sortBy: 'vote_count.desc', minVotes: 100, from: since, page }),
      ]).then((s) => interleave(settledValues(s))));
    }
  }
  if (anilist) kinds.push(anilist.popular(page));
  const lists = settledValues(await Promise.allSettled(kinds)).map((l) => l.filter((t) => !t.animeLike));
  if (!lists.some((l) => l.length)) throw new Error('Nothing loaded');
  return interleave(lists);
}

// 'tmdb:p:1190668' or 'anilist:s:112215' -> { person, credits } (or null).
export async function loadPerson(personId, { tmdb, anilist }) {
  const m = String(personId).match(/^(tmdb):p:(\d+)$/) || String(personId).match(/^(anilist):s:(\d+)$/);
  if (!m) return null;
  if (m[1] === 'tmdb') return tmdb && tmdb.hasKey ? tmdb.person(m[2]) : null;
  return anilist ? anilist.person(m[2]) : null;
}

// Can this title be hidden as a whole series? Films in a TMDB collection and
// anime with related entries can; a standalone film is just a pass.
export function hasFranchise(title) {
  if (!title) return false;
  if (title.source === 'tmdb') return !!title.collection;
  return title.source === 'anilist' && (title.franchiseIds || []).length > 0;
}

// The whole series a title belongs to, as { key, name, ids } for
// Settings.hiddenFranchises. If the lookup fails, falls back to what the
// title itself knows (its collection, or its direct relations).
export async function loadFranchise(title, { tmdb, anilist }) {
  if (!hasFranchise(title)) return null;
  try {
    if (title.source === 'tmdb' && tmdb && tmdb.hasKey) {
      const f = await tmdb.collection(title.collection.id.split(':').pop());
      if (f && f.ids.length) return f.ids.includes(title.id) ? f : { ...f, ids: [...f.ids, title.id] };
    }
    if (title.source === 'anilist' && anilist) {
      const f = await anilist.franchise(title.sourceId);
      if (f && f.ids.length) return f;
    }
  } catch { /* fall through to what the title knows */ }
  if (title.source === 'tmdb') return { key: title.collection.id, name: title.collection.name, ids: [title.id] };
  return {
    key: `anilist:franchise:${Math.min(title.sourceId, ...title.franchiseIds)}`,
    name: title.title,
    ids: [title.id, ...title.franchiseIds.map((id) => `anilist:${id}`)],
  };
}

// The services to offer in Settings: your region's from TMDB (most common
// first, with logos) when there's a key, plus the common ones so anime-only
// users can pick Crunchyroll or HIDIVE too. Anything you've already picked
// is always included.
export async function serviceChoices({ tmdb, picked = [] }) {
  let regional = [];
  if (tmdb && tmdb.hasKey) {
    const lists = await Promise.all(['movie', 'tv'].map((m) => tmdb.providers(m).catch(() => [])));
    // A service's rank is its best position in either list.
    const best = new Map();
    for (const list of lists) {
      list.forEach((p, i) => {
        if (isStoreOnly(p.service)) return;
        const had = best.get(p.service);
        if (!had) best.set(p.service, { service: p.service, logo: p.logo || null, rank: i });
        else { had.rank = Math.min(had.rank, i); had.logo = had.logo || p.logo || null; }
      });
    }
    regional = [...best.values()].sort((a, b) => a.rank - b.rank).slice(0, 24).map(({ service, logo }) => ({ service, logo }));
  }
  const out = [...regional];
  for (const name of [...COMMON_SERVICES, ...picked]) {
    if (!out.some((x) => x.service === name)) out.push({ service: name, logo: null });
  }
  return out;
}

// Fresh details for the TV you've watched (cached by the adapter), then the
// engine decides which have a new season. At most a couple of dozen shows,
// three at a time, so it's gentle on TMDB.
export async function checkNewSeasons({ tmdb, items, now = Date.now() }) {
  if (!tmdb || !tmdb.hasKey) return [];
  const toCheck = showsToCheck(items);
  if (!toCheck.length) return [];
  const shows = {};
  await mapLimit(toCheck, 3, async (it) => {
    try { shows[it.id] = await tmdb.details('tv', it.title.sourceId); } catch { /* skip this one */ }
  });
  return seasonAlerts(items, shows, { now });
}
