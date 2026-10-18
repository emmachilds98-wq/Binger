// Genre vocabularies. TMDB (film / TV) and AniList (anime) name genres
// differently, and TMDB's TV list fuses pairs ("Sci-Fi & Fantasy"). Everything
// outside this file speaks one canonical vocabulary, so a sci-fi film you loved
// counts towards sci-fi TV and sci-fi anime too.

export const TMDB_GENRES = {
  movie: {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
    878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  },
  tv: {
    10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 10762: 'Kids', 9648: 'Mystery',
    10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
    10767: 'Talk', 10768: 'War & Politics', 37: 'Western',
  },
};

const SPLIT = {
  'Action & Adventure': ['Action', 'Adventure'],
  'Sci-Fi & Fantasy': ['Science Fiction', 'Fantasy'],
  'War & Politics': ['War', 'Politics'],
  'Sci-Fi': ['Science Fiction'],
};

// Labels that say nothing about taste (or are implied by the kind of title).
const DROP = new Set(['TV Movie', 'News', 'Talk', 'Soap']);

export function canonicalGenres(names) {
  const out = [];
  for (const raw of names || []) {
    if (!raw || DROP.has(raw)) continue;
    for (const g of SPLIT[raw] || [raw]) if (!out.includes(g)) out.push(g);
  }
  return out;
}

export function tmdbGenreNames(ids, mediaType) {
  const table = TMDB_GENRES[mediaType] || {};
  return canonicalGenres((ids || []).map((id) => table[id]).filter(Boolean));
}

// Canonical genre -> TMDB genre id to use in /discover, per media type.
// A genre with no entry for a type simply isn't used to discover that type.
export const CANON_TO_TMDB = {
  movie: {
    Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99,
    Drama: 18, Family: 10751, Fantasy: 14, History: 36, Horror: 27, Music: 10402,
    Mystery: 9648, Romance: 10749, 'Science Fiction': 878, Thriller: 53, War: 10752, Western: 37,
  },
  tv: {
    Action: 10759, Adventure: 10759, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99,
    Drama: 18, Family: 10751, Kids: 10762, Mystery: 9648, Reality: 10764,
    'Science Fiction': 10765, Fantasy: 10765, War: 10768, Politics: 10768, Western: 37,
  },
};

// AniList accepts these exact genre names in genre_in.
export const ANILIST_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo',
  'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life',
  'Sports', 'Supernatural', 'Thriller',
];

export function canonToAniList(genre) {
  if (genre === 'Science Fiction') return 'Sci-Fi';
  return ANILIST_GENRES.includes(genre) ? genre : null;
}
