// Turns a normalised Title (see docs/ARCHITECTURE.md) into weighted features.
// Pure: no DOM, no network, so it runs the same in the browser and in tests.
//
// A feature key is "<prefix>:<value>". The prefix is the feature's group; each
// group has a weight in the final affinity and a way of combining its features:
//   mean - every title has a few of these (genres); average them.
//   sum  - most are unknown to you (cast, keywords); add up the ones you do
//          know and squash, so one beloved director counts without being
//          diluted by nine unknown cast members.

export const GROUPS = {
  genre:   { prefix: 'g', weight: 0.30, mode: 'mean' },
  keyword: { prefix: 'k', weight: 0.17, mode: 'sum' },
  creator: { prefix: 'c', weight: 0.17, mode: 'sum' },
  cast:    { prefix: 'p', weight: 0.15, mode: 'sum' },
  studio:  { prefix: 's', weight: 0.07, mode: 'sum' },
  kind:    { prefix: 't', weight: 0.06, mode: 'mean' },
  lang:    { prefix: 'l', weight: 0.04, mode: 'mean' },
  era:     { prefix: 'e', weight: 0.04, mode: 'mean' },
  length:  { prefix: 'n', weight: 0.05, mode: 'mean' },
};

const PREFIX_TO_GROUP = Object.fromEntries(Object.entries(GROUPS).map(([g, v]) => [v.prefix, g]));

export function groupOf(key) {
  return PREFIX_TO_GROUP[key.slice(0, key.indexOf(':'))] || null;
}

const CAST_WEIGHTS = [1, 0.9, 0.8, 0.6, 0.5, 0.4];
const CREATOR_JOBS = { Director: 1, Creator: 1, 'Original Story': 0.7, 'Original Creator': 0.7, Writer: 0.6, Screenplay: 0.6 };

const norm = (s) => String(s).trim().toLowerCase();

export function featuresOf(title) {
  const out = [];
  const seen = new Set();
  const add = (group, value, w, label) => {
    if (value == null || value === '' || !(w > 0)) return;
    const key = GROUPS[group].prefix + ':' + value;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, group, w, label: label ?? String(value) });
  };

  for (const g of title.genres || []) add('genre', norm(g), 1, g);
  (title.keywords || []).slice(0, 12).forEach((k) => add('keyword', norm(k), 0.7, k));
  for (const c of title.crew || []) {
    const w = CREATOR_JOBS[c.job];
    if (w) add('creator', c.id, w, c.name);
  }
  (title.cast || []).slice(0, CAST_WEIGHTS.length).forEach((p, i) => add('cast', p.id, CAST_WEIGHTS[i], p.name));
  (title.studios || []).slice(0, 2).forEach((s) => add('studio', norm(s), 1, s));
  if (title.kind) add('kind', title.kind, 1, KIND_LABEL[title.kind] || title.kind);
  if (title.language) add('lang', title.language, 1, title.language);
  if (title.year) {
    const decade = Math.floor(title.year / 10) * 10;
    add('era', decade, 1, decade + 's');
  }
  const len = lengthBucket(title);
  if (len) add('length', len.key, 1, len.label);
  return out;
}

// How long something takes to watch, in a few buckets: films by runtime,
// series by total episodes. Null when unknown (list data has no runtime).
export const LENGTH_LABEL = {
  'film-short': 'Films under 100 minutes',
  'film-mid': 'Films of 100 to 140 minutes',
  'film-long': 'Films over 140 minutes',
  'series-short': 'Short series (13 episodes or fewer)',
  'series-mid': 'Series of 14 to 39 episodes',
  'series-long': 'Long-running series (40+ episodes)',
};

export function isFilmLike(title) {
  return title.kind === 'film' || title.format === 'MOVIE';
}

export function lengthBucket(title) {
  let key = null;
  if (isFilmLike(title)) {
    const m = title.runtime;
    if (m > 0) key = m < 100 ? 'film-short' : m < 140 ? 'film-mid' : 'film-long';
  } else {
    const e = title.episodes;
    if (e > 0) key = e <= 13 ? 'series-short' : e <= 39 ? 'series-mid' : 'series-long';
  }
  return key ? { key, label: LENGTH_LABEL[key] } : null;
}

export const KIND_LABEL = { film: 'Films', tv: 'TV', anime: 'Anime' };
