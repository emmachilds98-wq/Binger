// One-off lookups the screens ask for, each routed to the right source:
// a person's work, a whole franchise, the streaming services you can pick,
// and new seasons of shows you've watched.

import { COMMON_SERVICES } from './services.js';
import { mapLimit } from './http.js';
import { seasonAlerts, showsToCheck } from '../engine/index.js';

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
