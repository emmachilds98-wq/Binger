// Gathers the pool of candidate titles the engine ranks into a deck.
// This is where "keeps up with new releases" lives: every refill pulls this
// week's trending titles, recent releases, shows airing now and the current
// anime season, alongside recommendations seeded from what you've loved.
// Nothing here is a hand-kept catalogue.

import { itemSignal, latestRating, ratingBaseline, topFeatures, DEFAULT_MIX } from '../engine/index.js';
import { decay } from '../engine/profile.js';
import { CANON_TO_TMDB, canonToAniList } from './genres.js';
import { DECK_FORMATS } from './anilist.js';
import { mapLimit, DAY } from './http.js';

// When a title arrives by several routes, the most personal reason wins.
const VIA_RANK = { sequel: 0, seed: 1, fresh: 2, genre: 3, stream: 4, trending: 5, wider: 6, popular: 7, search: 8 };

// One "wider" pull per refill for films and one for TV, so the deck reaches
// past what's trending: all-time classics, well-loved titles few people have
// found, and films and series from other countries. Your profile still ranks
// them, so only the ones that suit you come up.
const WORLD = [['ko', 'Korean'], ['fr', 'French'], ['es', 'Spanish'], ['hi', 'Hindi'], ['it', 'Italian'], ['de', 'German'],
  ['da', 'Danish'], ['sv', 'Swedish'], ['ja', 'Japanese'], ['zh', 'Chinese'], ['pt', 'Portuguese'], ['tr', 'Turkish']];
const NOT_DRAMA = [10763, 10767]; // News and Talk: not what anyone swipes for

export function widerPull(mediaType, rng = Math.random) {
  const pick = (n) => Math.floor(rng() * n);
  const kind = mediaType === 'movie' ? 'film' : 'series';
  const without = mediaType === 'tv' ? NOT_DRAMA : [];
  const mode = ['acclaimed', 'gems', 'world'][pick(3)];
  if (mode === 'acclaimed') {
    return { mode, label: 'Acclaimed: among TMDB’s best rated', params: { sortBy: 'vote_average.desc', minVotes: mediaType === 'movie' ? 2000 : 600, page: 1 + pick(10), withoutGenreIds: without } };
  }
  if (mode === 'gems') {
    return { mode, label: 'A hidden gem: loved by the people who found it', params: { sortBy: 'vote_average.desc', minVotes: 150, maxVotes: 1500, minScore: 7.2, page: 1 + pick(5), withoutGenreIds: without } };
  }
  const [lang, name] = WORLD[pick(WORLD.length)];
  // Japanese animation comes from AniList, so it's left out here.
  return { mode, label: `A ${name} ${kind}, from further afield`, params: { originalLanguage: lang, minVotes: 100, page: 1 + pick(3), withoutGenreIds: lang === 'ja' ? [...without, 16] : without } };
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// The titles to ask "more like this" about: your strongest recent positives,
// plus one wildcard from further down so the seeds rotate between sessions.
export function pickSeeds(items, { now = Date.now(), rng = Math.random, perSource = 3 } = {}) {
  const list = Object.values(items || {});
  const baseline = ratingBaseline(list);
  const scored = [];
  for (const it of list) {
    if (!it || !it.title) continue;
    const sig = itemSignal(it, baseline);
    if (!sig || sig.s < 0.3) continue;
    scored.push({ item: it, rating: latestRating(it), strength: sig.s * decay(sig.at, now, sig.halfLife) });
  }
  scored.sort((a, b) => b.strength - a.strength);
  const choose = (arr) => {
    const top = arr.slice(0, perSource);
    const rest = arr.slice(perSource, perSource + 7);
    if (rest.length) top.push(rest[Math.floor(rng() * rest.length)]);
    return top;
  };
  return {
    tmdb: choose(scored.filter((s) => s.item.title.source === 'tmdb')),
    anime: choose(scored.filter((s) => s.item.title.source === 'anilist')),
  };
}

// Next seasons of anime you've watched (AniList tells us the SEQUEL ids).
export function sequelIdsToFetch(items) {
  const ids = [];
  const watched = Object.values(items || {})
    .filter((it) => it && it.status === 'watched' && it.title && it.title.source === 'anilist')
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  for (const it of watched) {
    for (const id of it.title.sequelIds || []) {
      if (!items[`anilist:${id}`] && !ids.includes(id)) ids.push(id);
    }
  }
  return ids.slice(0, 10);
}

export function seedVia(seed) {
  return {
    type: 'seed',
    seedId: seed.item.id,
    seedTitle: seed.item.title.title,
    seedRating: seed.rating,
    seedStatus: seed.item.status,
    strength: clamp(seed.strength, 0, 1),
  };
}

// TMDB date range for the deck's decade filter.
export function decadeDates(decade) {
  if (decade === 'older') return { from: null, to: '1979-12-31' };
  if (typeof decade === 'number') return { from: `${decade}-01-01`, to: `${decade + 9}-12-31` };
  return null;
}

// Your services -> TMDB provider ids in your region (one service can have
// several ids: "Netflix" and "Netflix Standard with Ads").
export async function providerIdsFor(tmdb, services) {
  if (!tmdb || !tmdb.hasKey || !services || !services.length) return [];
  const lists = await Promise.all(['movie', 'tv'].map((m) => tmdb.providers(m).catch(() => [])));
  const ids = new Set();
  for (const p of lists.flat()) if (services.includes(p.service)) p.ids.forEach((id) => ids.add(id));
  return [...ids];
}

// filters: the deck's session filters { short: boolean, decade: 2020 | ... | 'older' | null }.
export async function gatherCandidates({ tmdb, anilist, items = {}, profile, settings = {}, filters = null, now = Date.now(), rng = Math.random }) {
  const pool = new Map();
  const errors = [];
  const mix = settings.mix || DEFAULT_MIX;
  const wants = (kind) => (mix[kind] ?? 50) > 0;
  const services = settings.services || [];
  const dates = filters ? decadeDates(filters.decade) : null;
  const short = !!(filters && filters.short);

  const add = (title, via) => {
    if (!title || title.animeLike) return;
    if (title.source === 'anilist' && (title.isAdult || (title.format && !DECK_FORMATS.includes(title.format)))) return;
    let entry = pool.get(title.id);
    if (!entry) {
      entry = { ...title, via: [] };
    } else if (title.detailed && !entry.detailed) {
      entry = { ...title, via: entry.via, airing: entry.airing || title.airing, streamHint: entry.streamHint || title.streamHint };
    } else if (title.streamHint && !entry.streamHint) {
      entry = { ...entry, streamHint: true };
    }
    if (via && !entry.via.some((v) => v.type === via.type && v.seedId === via.seedId)) {
      entry.via = [...entry.via, via].sort((a, b) => VIA_RANK[a.type] - VIA_RANK[b.type]);
    }
    pool.set(title.id, entry);
  };

  const seeds = pickSeeds(items, { now, rng });
  const genres = profile ? topFeatures(profile, 'genre', { limit: 3 }).map((e) => e.label) : [];
  const page = 1 + Math.floor(rng() * 3);
  const tasks = [];
  const run = (label, fn) => tasks.push(Promise.resolve().then(fn).catch((err) => {
    errors.push({ label, source: (err && err.source) || label.split(':')[0], status: err && err.status, message: (err && err.message) || String(err) });
  }));

  if (tmdb && tmdb.hasKey) {
    // Looked up once (cached for a week) and shared by both media types.
    const providerIds = services.length ? providerIdsFor(tmdb, services).catch(() => []) : Promise.resolve([]);
    for (const mediaType of ['movie', 'tv']) {
      if (!wants(mediaType === 'movie' ? 'film' : 'tv')) continue;
      const genreIds = genres.map((g) => CANON_TO_TMDB[mediaType][g]).filter(Boolean);
      const dateParams = dates ? { from: dates.from, to: dates.to } : {};
      const runtimeMax = short && mediaType === 'movie' ? 120 : null;
      // Your services' catalogues: the titles here are known to be on one of
      // them, so "Only show what I can stream" never runs dry.
      if (services.length) {
        const pages = settings.streamOnly ? [1, 2 + Math.floor(rng() * 2)] : [page];
        for (const pg of pages) {
          run(`tmdb:stream:${mediaType}:${pg}`, async () => {
            const ids = await providerIds;
            if (!ids.length) return;
            (await tmdb.discover(mediaType, { providerIds: ids, page: pg, minVotes: 100, genreIds: pg === 1 ? [] : genreIds, runtimeMax, ...dateParams }))
              .forEach((t) => add({ ...t, streamHint: true }, { type: 'stream' }));
          });
        }
      }
      // Deck filters: ask for exactly that, since this week's trending list
      // has no 1990s films in it.
      if (dates || runtimeMax) {
        run(`tmdb:filtered:${mediaType}`, async () => (await tmdb.discover(mediaType, { genreIds, page, minVotes: dates ? 300 : 150, runtimeMax, ...dateParams, sortBy: dates ? 'vote_count.desc' : 'popularity.desc' }))
          .forEach((t) => add(t, { type: 'popular' })));
      }
      run(`tmdb:trending:${mediaType}`, async () => (await tmdb.trending(mediaType)).forEach((t) => add(t, { type: 'trending' })));
      if (genreIds.length) {
        run(`tmdb:genre:${mediaType}`, async () => (await tmdb.discover(mediaType, { genreIds, page })).forEach((t) => add(t, { type: 'genre' })));
      } else {
        run(`tmdb:popular:${mediaType}`, async () => (await tmdb.popular(mediaType, page)).forEach((t) => add(t, { type: 'popular' })));
      }
      {
        const w = widerPull(mediaType, rng);
        run(`tmdb:wider:${mediaType}`, async () => (await tmdb.discover(mediaType, { genreIds: [], runtimeMax, ...dateParams, ...w.params }))
          .forEach((t) => add(t, { type: 'wider', label: w.label })));
      }
      if (mediaType === 'movie') {
        run('tmdb:fresh:movie', async () => (await tmdb.discover('movie', { from: isoDay(now - 120 * DAY), to: isoDay(now), minVotes: 20 }))
          .forEach((t) => add(t, { type: 'fresh' })));
      } else {
        // Shows with an episode out in the last fortnight: new seasons of old shows included.
        run('tmdb:fresh:tv', async () => (await tmdb.discover('tv', { airingFrom: isoDay(now - 14 * DAY), airingTo: isoDay(now + 7 * DAY), minVotes: 20 }))
          .forEach((t) => add({ ...t, airing: true }, { type: 'fresh' })));
      }
    }
    for (const s of seeds.tmdb) {
      const t = s.item.title;
      if (!wants(t.kind)) continue;
      run(`tmdb:seed:${t.id}`, async () => (await tmdb.recommendations(t.mediaType, t.sourceId)).forEach((r) => add(r, seedVia(s))));
    }
  }

  if (anilist && wants('anime')) {
    run('anilist:deck', async () => {
      const batch = await anilist.deckBatch({
        seeds: seeds.anime.map((s) => s.item.title.sourceId),
        sequels: sequelIdsToFetch(items),
        genres: genres.map(canonToAniList).filter(Boolean).slice(0, 2),
        page,
        now: new Date(now),
        filters,
      });
      batch.trending.forEach((t) => add(t, { type: 'trending' }));
      batch.season.forEach((t) => add(t, { type: 'fresh' }));
      batch.genre.forEach((t) => add(t, { type: 'genre' }));
      for (const group of batch.seeds) {
        const s = seeds.anime.find((x) => x.item.id === group.seedId);
        group.titles.forEach((t) => add(t, s ? seedVia(s) : null));
      }
      batch.sequels.forEach((t) => add(t, null));
      (batch.filtered || []).forEach((t) => add(t, { type: 'popular' }));
    });
  }

  await Promise.all(tasks);

  const out = [];
  for (const t of pool.values()) {
    if (items[t.id]) continue;
    // Don't suggest "Season 3" of something you haven't watched; do suggest it
    // (flagged as the next part) when you've watched what comes before.
    if (t.prequelIds && t.prequelIds.length) {
      const pre = t.prequelIds.map((id) => items[`anilist:${id}`]).find((it) => it && it.status === 'watched');
      if (!pre) continue;
      if (!t.via.some((v) => v.type === 'sequel')) {
        t.via = [{ type: 'sequel', seedId: pre.id, seedTitle: pre.title.title }, ...t.via];
      }
    }
    out.push(t);
  }
  return { pool: out, errors };
}

// Film/TV list results lack cast, keywords and trailers; fetch full details for
// the titles about to be shown. Anime already arrives complete.
export async function hydrate(titles, { tmdb, concurrency = 4 } = {}) {
  return mapLimit(titles, concurrency, async (t) => {
    if (t.detailed || t.source !== 'tmdb' || !tmdb || !tmdb.hasKey) return t;
    try {
      const d = await tmdb.details(t.mediaType, t.sourceId);
      return d ? { ...d, via: t.via || [], airing: d.airing || t.airing, streamHint: t.streamHint || undefined } : t;
    } catch {
      return t;
    }
  });
}
