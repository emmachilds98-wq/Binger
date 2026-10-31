// Streaming services. TMDB (via JustWatch) and AniList name the same service
// differently ("Disney Plus" / "Disney+", "Netflix Standard with Ads",
// "Crunchyroll Amazon Channel"), so everything outside this file speaks one
// canonical name per service. Your picks in Settings are stored as these names.

// Shown in Settings even without a TMDB key, so anime fans can pick services too.
export const COMMON_SERVICES = [
  'Netflix', 'Amazon Prime Video', 'Disney+', 'Apple TV+', 'Crunchyroll', 'HIDIVE', 'Max', 'Hulu',
  'Paramount+', 'Peacock', 'NOW', 'BBC iPlayer', 'ITVX', 'Channel 4', 'MUBI', 'YouTube',
];

const ALIASES = {
  'amazon prime video': 'Amazon Prime Video',
  'prime video': 'Amazon Prime Video',
  'amazon video': 'Amazon Prime Video',
  'disney plus': 'Disney+',
  'apple tv plus': 'Apple TV+',
  'apple tv+': 'Apple TV+',
  // Apple renamed Apple TV+ to "Apple TV" in 2025 and TMDB followed (seen in
  // the live check, 2026-10-31). Binger keeps "Apple TV+" so saved picks keep
  // working and it can't be mistaken for the Apple TV Store (rent and buy).
  'apple tv': 'Apple TV+',
  'paramount plus': 'Paramount+',
  'paramount+ premium': 'Paramount+',
  'hbo max': 'Max',
  'max': 'Max',
  'now tv': 'NOW',
  'now': 'NOW',
  'now tv cinema': 'NOW',
  'sky go': 'Sky Go',
  'bbc iplayer': 'BBC iPlayer',
  'itvx': 'ITVX',
  'itv hub': 'ITVX',
  'channel 4': 'Channel 4',
  'all 4': 'Channel 4',
  'hidive': 'HIDIVE',
  'crunchyroll': 'Crunchyroll',
  'funimation': 'Crunchyroll', // merged into Crunchyroll in 2024
  'funimation now': 'Crunchyroll',
  'youtube': 'YouTube',
  'youtube free': 'YouTube',
  'youtube premium': 'YouTube',
  'peacock premium': 'Peacock',
  'peacock premium plus': 'Peacock',
  'mubi': 'MUBI',
};

// Bundles and add-on channels are the same catalogue as the service itself:
// "Crunchyroll Amazon Channel" needs a Crunchyroll subscription.
const SUFFIXES = [
  / amazon channel$/i, / apple tv channel$/i, / roku premium channel$/i, / with ads$/i,
  / standard$/i, / basic$/i, / premium$/i,
];

export function canonicalService(name) {
  if (!name) return null;
  let n = String(name).trim().replace(/\s+/g, ' ');
  for (let i = 0; i < 3; i++) {
    const before = n;
    for (const re of SUFFIXES) n = n.replace(re, '');
    if (n === before) break;
  }
  const alias = ALIASES[n.toLowerCase()];
  return alias || n;
}

// The TMDB "networks" that make each service's own shows, so Binger can ask
// for, say, Apple TV+ originals wherever you live. ("What's on Netflix in your
// country" is a different question, answered by watch providers.) Each id is
// checked against TMDB's name for it by scripts/tmdb-live.mjs, weekly.
export const TMDB_NETWORKS = {
  'Apple TV+': [2552],
  Netflix: [213],
  'Amazon Prime Video': [1024],
  'Disney+': [2739],
  Max: [3186, 49],          // Max / HBO Max, and HBO itself
  Hulu: [453],
  'Paramount+': [4330],
  Peacock: [3353],
  'BBC iPlayer': [4, 332],  // BBC One, BBC Two
  ITVX: [9],                // ITV1
  'Channel 4': [26],
  NOW: [1063],              // Sky Atlantic
};

// "An Apple TV+ original", "A BBC original": who made it, in the words people
// use (iPlayer shows are the BBC's; NOW's are Sky's; Max's are HBO's).
const MAKER = { 'Apple TV+': 'An Apple TV+', 'Amazon Prime Video': 'A Prime Video', Max: 'An HBO', 'BBC iPlayer': 'A BBC', ITVX: 'An ITV', NOW: 'A Sky' };
export const originalLabel = (service) => `${MAKER[service] || `A ${service}`} original`;

// Extra ways people type a service into search ("apple", "iplayer", "hbo").
const SEARCH_ALIASES = {
  apple: 'Apple TV+', 'apple tv': 'Apple TV+', 'appletv': 'Apple TV+', 'apple tv+': 'Apple TV+', 'apple tv plus': 'Apple TV+', 'apple originals': 'Apple TV+',
  amazon: 'Amazon Prime Video', 'amazon prime': 'Amazon Prime Video', prime: 'Amazon Prime Video',
  disney: 'Disney+', hbo: 'Max', iplayer: 'BBC iPlayer', bbc: 'BBC iPlayer', itv: 'ITVX', sky: 'NOW',
};

// "apple tv", "Netflix originals", "on disney+" -> the service, or null when
// the words aren't a service's name.
export function serviceFromQuery(query) {
  const q = String(query || '').toLowerCase().trim().replace(/\s+/g, ' ')
    .replace(/^(on|from) /, '').replace(/ (originals?|shows|series|films|movies)$/, '').trim();
  if (q.length < 2) return null;
  if (SEARCH_ALIASES[q]) return SEARCH_ALIASES[q];
  const c = canonicalService(q);
  return [...COMMON_SERVICES, ...Object.keys(TMDB_NETWORKS)].find((s) => s.toLowerCase() === String(c).toLowerCase()) || null;
}

// Shops and guides, not subscriptions: TMDB's region list includes them
// ("Apple TV Store", "JustWatch TV Store"), but nobody subscribes to them, so
// they don't belong in "Your streaming services".
export function isStoreOnly(name) {
  return / store$/i.test(String(name || '').trim()) || /^justwatch\b/i.test(String(name || '').trim());
}

// Canonical names, deduplicated, in first-seen order.
export function canonicalServices(names) {
  const out = [];
  for (const raw of names || []) {
    const c = canonicalService(raw);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}
