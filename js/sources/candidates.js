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
const VIA_RANK = { sequel: 0, seed: 1, fresh: 2, genre: 3, trending: 4, popular: 5, search: 6 };

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

export async function gatherCandidates({ tmdb, anilist, items = {}, profile, settings = {}, now = Date.now(), rng = Math.random }) {
  const pool = new Map();
  const errors = [];
  const mix = settings.mix || DEFAULT_MIX;
  const wants = (kind) => (mix[kind] ?? 50) > 0;

  const add = (title, via) => {
    if (!title || title.animeLike) return;
    if (title.source === 'anilist' && (title.isAdult || (title.format && !DECK_FORMATS.includes(title.format)))) return;
    let entry = pool.get(title.id);
    if (!entry) {
      entry = { ...title, via: [] };
    } else if (title.detailed && !entry.detailed) {
      entry = { ...title, via: entry.via, airing: entry.airing || title.airing };
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
    for (const mediaType of ['movie', 'tv']) {
      if (!wants(mediaType === 'movie' ? 'film' : 'tv')) continue;
      run(`tmdb:trending:${mediaType}`, async () => (await tmdb.trending(mediaType)).forEach((t) => add(t, { type: 'trending' })));
      const genreIds = genres.map((g) => CANON_TO_TMDB[mediaType][g]).filter(Boolean);
      if (genreIds.length) {
        run(`tmdb:genre:${mediaType}`, async () => (await tmdb.discover(mediaType, { genreIds, page })).forEach((t) => add(t, { type: 'genre' })));
      } else {
        run(`tmdb:popular:${mediaType}`, async () => (await tmdb.popular(mediaType, page)).forEach((t) => add(t, { type: 'popular' })));
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
      });
      batch.trending.forEach((t) => add(t, { type: 'trending' }));
      batch.season.forEach((t) => add(t, { type: 'fresh' }));
      batch.genre.forEach((t) => add(t, { type: 'genre' }));
      for (const group of batch.seeds) {
        const s = seeds.anime.find((x) => x.item.id === group.seedId);
        group.titles.forEach((t) => add(t, s ? seedVia(s) : null));
      }
      batch.sequels.forEach((t) => add(t, null));
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
      return d ? { ...d, via: t.via || [], airing: d.airing || t.airing } : t;
    } catch {
      return t;
    }
  });
}
