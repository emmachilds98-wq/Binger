// A short, muted, inline trailer clip via YouTube's privacy-enhanced embed.
// `seconds` trims it to a taster (0 = play the whole thing).

import { h } from './dom.js';

export function clipUrl(trailer, { seconds = 30, autoplay = true } = {}) {
  const p = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    mute: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    start: '0',
  });
  if (seconds > 0) p.set('end', String(seconds));
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?${p}`;
}

export function trailerPlayer(trailer, opts = {}) {
  return h('iframe', {
    class: 'trailer-frame',
    src: clipUrl(trailer, opts),
    title: trailer.name || 'Trailer',
    allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
    allowfullscreen: true,
    referrerpolicy: 'strict-origin-when-cross-origin',
  });
}

export function fullTrailerUrl(trailer) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}`;
}
