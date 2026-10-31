// One swipeable card: artwork, title, why it was picked, synopsis, and the
// people in it, with anyone you'd recognise from your own history first.

import { h, icon, KIND_NAME, metaLine, cardScore, avatar, safeImg } from './dom.js';
import { trailerPlayer } from './trailer.js';

export function knownFrom(person, profile, titleId) {
  const rec = profile && profile.people && profile.people.get(person.id);
  if (!rec) return null;
  const t = rec.titles.find((x) => x.id !== titleId);
  if (!t) return null;
  if (t.status === 'watched') return t.rating >= 4 ? `You loved ${t.title}` : `You watched ${t.title}`;
  return `On your watchlist: ${t.title}`;
}

// Up to `limit` people: recognised ones first (cast or crew), then top billing.
export function keyPeople(title, profile, limit = 3) {
  const people = [];
  const push = (p, role) => {
    if (!p || people.some((x) => x.id === p.id)) return;
    people.push({ ...p, role, known: knownFrom(p, profile, title.id) });
  };
  (title.cast || []).forEach((p) => push(p, p.character));
  (title.crew || []).forEach((p) => push(p, p.job));
  const known = people.filter((p) => p.known);
  const cast = people.filter((p) => !p.known && (title.cast || []).some((c) => c.id === p.id));
  return [...known, ...cast].slice(0, limit);
}

export function matchPercent(score) {
  return Math.max(1, Math.min(99, Math.round(50 + 50 * Math.tanh(2 * score))));
}

export function cardEl(card, { profile, showMatch = false, clipSeconds = 30, isTop = false } = {}) {
  const t = card.title;
  const people = keyPeople(t, profile, 3);
  const anyKnown = people.some((p) => p.known);
  const reason = card.reasons && card.reasons[0];
  const score = cardScore(t);

  const fallback = () => h('div', { class: 'art-fallback', 'aria-hidden': 'true' }, t.title);
  const art = h('div', { class: 'card-art', style: { '--art': t.color || null } },
    t.poster ? safeImg(t.poster, { loading: isTop ? 'eager' : 'lazy', draggable: 'false' }, () => art.prepend(fallback())) : fallback(),
    h('div', { class: 'card-top' },
      h('span', { class: `badge badge-${t.kind}` }, KIND_NAME[t.kind] || t.kind),
      showMatch ? h('span', { class: 'pill-dark' }, `${matchPercent(card.score)}% match`) : null),
    h('div', { class: 'stamp stamp-want', 'aria-hidden': 'true' }, 'Want'),
    h('div', { class: 'stamp stamp-pass', 'aria-hidden': 'true' }, 'Pass'),
    h('div', { class: 'stamp stamp-seen', 'aria-hidden': 'true' }, 'Seen it'),
    h('div', { class: 'card-title' },
      h('h2', null, t.title),
      h('div', { class: 'card-meta' }, [metaLine(t), score].filter(Boolean).join(' · '))));

  if (t.trailer && isTop) {
    const play = h('button', { type: 'button', class: 'play-btn', 'aria-label': `Play a ${clipSeconds ? clipSeconds + ' second ' : ''}trailer clip` }, icon('play', 26));
    play.addEventListener('click', (e) => {
      e.stopPropagation();
      const stop = h('button', { type: 'button', class: 'clip-stop', 'aria-label': 'Stop clip' }, icon('x', 18));
      const clip = h('div', { class: 'clip' }, trailerPlayer(t.trailer, { seconds: clipSeconds, autoplay: true }), stop);
      stop.addEventListener('click', (ev) => { ev.stopPropagation(); clip.remove(); play.hidden = false; });
      play.hidden = true;
      art.append(clip);
    });
    art.append(play);
  }

  const body = h('div', { class: 'card-body' },
    reason ? h('div', { class: `reason reason-${reason.kind}` }, icon('sparkle', 14), h('span', null, reason.text)) : null,
    t.overview ? h('p', { class: 'synopsis' }, t.overview) : h('p', { class: 'synopsis muted' }, 'No synopsis yet.'),
    people.length ? h('div', { class: 'people' },
      h('div', { class: 'eyebrow' }, anyKnown ? 'People you know' : t.kind === 'anime' ? 'Main voices' : 'Starring'),
      h('ul', { class: 'people-row' }, people.map((p) => h('li', { class: 'person' },
        avatar(p, 'sm', !!p.known),
        h('span', { class: 'person-text' },
          h('span', { class: 'person-name' }, p.name),
          h('span', { class: `person-role${p.known ? ' is-known' : ''}` }, p.known || p.role || '')))))) : null);

  return h('article', {
    class: 'card',
    dataset: { id: t.id },
    'aria-label': `${t.title}, ${KIND_NAME[t.kind] || ''}${reason ? '. ' + reason.text : ''}`,
  }, art, body);
}
