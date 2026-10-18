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
  return out;
}

export const KIND_LABEL = { film: 'Films', tv: 'TV', anime: 'Anime' };
