// Tiny DOM helpers. Text always goes in as text nodes (never innerHTML), so
// titles and synopses from the APIs can't inject markup.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v)) {
        if (val == null) continue;
        if (p.startsWith('--')) el.style.setProperty(p, val); else el.style[p] = val;
      }
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of [children].flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

const PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  deck: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M10 8.5l5 3.5-5 3.5z"/>',
  library: '<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="M16.5 5l3.8 1-4 15-3.8-1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  star: '<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  forward: '<path d="M9 5l7 7-7 7"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  sparkle: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6"/><circle cx="17" cy="9" r="2.8"/><path d="M16 14.2c2.9.1 5 2.2 5.5 5.3"/>',
};

export function icon(name, size = 22) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = PATHS[name] || ''; // static markup from this file only
  return svg;
}

export const KIND_NAME = { film: 'Film', tv: 'TV', anime: 'Anime' };

export function formatRuntime(min) {
  if (!min) return null;
  const hrs = Math.floor(min / 60);
  const m = min % 60;
  return hrs ? `${hrs}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

export function metaLine(t, { genres = 2 } = {}) {
  const parts = [];
  if (t.kind === 'tv') parts.push(t.year ? `${t.year}${t.status === 'Ended' || t.status === 'Canceled' ? '' : '–'}` : null);
  else parts.push(t.year);
  if (t.kind === 'film') parts.push(formatRuntime(t.runtime));
  if (t.kind === 'tv' && t.seasons) parts.push(`${t.seasons} season${t.seasons === 1 ? '' : 's'}`);
  if (t.kind === 'anime') {
    if (t.format === 'MOVIE') parts.push(formatRuntime(t.runtime) || 'Film');
    else if (t.episodes) parts.push(`${t.episodes} eps`);
    else if (t.airing) parts.push('Airing');
  }
  if (t.kind === 'anime' && t.studios && t.studios[0]) parts.push(titleCase(t.studios[0]));
  else if (t.genres && t.genres.length) parts.push(t.genres.slice(0, genres).join(', '));
  return parts.filter(Boolean).join(' · ');
}

export function publicScore(t) {
  if (typeof t.score !== 'number') return null;
  return t.source === 'anilist' ? `AniList ${Math.round(t.score * 10)}%` : `TMDB ${t.score.toFixed(1)}`;
}

// Review scores (js/sources/ratings.js) as short labels, each with a link
// to its page when there is one. Rotten Tomatoes' audience score is the one
// from people who watched it; "critics" is its Tomatometer.
export function reviewScores(t) {
  const r = t && t.ratings;
  if (!r) return [];
  return [
    r.imdb ? { key: 'imdb', text: `IMDb ${r.imdb.value.toFixed(1)}`, url: r.imdb.url } : null,
    r.critics ? { key: 'critics', text: `RT critics ${r.critics.value}%`, url: r.critics.url } : null,
    r.audience ? { key: 'audience', text: `RT audience ${r.audience.value}%`, url: r.audience.url } : null,
    r.metacritic ? { key: 'metacritic', text: `Metacritic ${r.metacritic.value}`, url: r.metacritic.url } : null,
    r.letterboxd ? { key: 'letterboxd', text: `Letterboxd ${r.letterboxd.value.toFixed(1)}`, url: r.letterboxd.url } : null,
  ].filter(Boolean);
}

// The card's one-line score: IMDb and Rotten Tomatoes' audience score (or
// its critics' score) when known, otherwise TMDB's or AniList's own.
export function cardScore(t) {
  const s = reviewScores(t);
  const pick = [s.find((x) => x.key === 'imdb'), s.find((x) => x.key === 'audience') || s.find((x) => x.key === 'critics')].filter(Boolean);
  return pick.length ? pick.map((x) => x.text).join(' · ') : publicScore(t);
}

export function titleCase(s) {
  // AniList shouts some studio names ("MADHOUSE"); keep short acronyms as-is.
  if (!s || s !== s.toUpperCase() || s.length <= 4) return s;
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function starsText(r) {
  if (typeof r !== 'number') return '';
  return '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '');
}

export const RATING_WORDS = {
  0.5: 'Awful', 1: 'Not for me', 1.5: 'Poor', 2: 'Meh', 2.5: 'So-so',
  3: 'Decent', 3.5: 'Good', 4: 'Really good', 4.5: 'Excellent', 5: 'Loved it',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function shortDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const thisYear = new Date().getFullYear();
  return `${d} ${MONTHS[m - 1].slice(0, 3)}${y !== thisYear ? ` ${y}` : ''}`;
}
export function monthLabel(isoDate) {
  const [y, m] = isoDate.slice(0, 10).split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// An <img> that quietly removes itself (leaving the fallback behind) if the
// image is missing, instead of showing a broken-image icon.
export function safeImg(src, props = {}, onFail = null) {
  const img = h('img', { src, alt: '', decoding: 'async', ...props });
  img.addEventListener('error', () => { img.remove(); if (onFail) onFail(); }, { once: true });
  return img;
}

export function avatar(person, size = 'md', highlight = false) {
  const el = h('span', { class: `avatar avatar-${size}${highlight ? ' avatar-known' : ''}`, 'aria-hidden': 'true' });
  if (person.photo) el.append(safeImg(person.photo, { loading: 'lazy' }, () => el.append(initials(person.name))));
  else el.append(initials(person.name));
  return el;
}

export function poster(t, cls = 'thumb') {
  return h('span', { class: cls, style: { '--art': t.color || null }, 'aria-hidden': 'true' },
    t.poster ? safeImg(t.poster, { loading: 'lazy' }) : null);
}

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
