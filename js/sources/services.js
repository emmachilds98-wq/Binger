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

// Canonical names, deduplicated, in first-seen order.
export function canonicalServices(names) {
  const out = [];
  for (const raw of names || []) {
    const c = canonicalService(raw);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}
