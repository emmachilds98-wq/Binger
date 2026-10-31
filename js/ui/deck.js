// The Discover screen: filter pills, the card stack with swipe gestures, and
// the action buttons. Every gesture has a button twin (and a keyboard key):
//   right / → = Want to watch     left / ← = Pass     up / ↑ = Seen it
//   tap / Enter = Details         Undo / Z = Undo

import { h, icon, clear, prefersReducedMotion } from './dom.js';
import { cardEl, preloadPoster } from './card.js';
import { filterSummary } from './filters.js';
import { whoChip } from './people.js';
import { flickDirection } from './gesture.js';

const FILTERS = [['all', 'All'], ['film', 'Films'], ['tv', 'TV'], ['anime', 'Anime']];
const THRESHOLD_X = 110;
const THRESHOLD_UP = 120;

export function renderDiscover(root, ctx) {
  clear(root);
  const active = filterSummary(ctx.deckFilters, ctx.streamOnly, ctx.services);
  const header = h('header', { class: 'topbar' },
    h('div', { class: 'topbar-row' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('play', 14)), h('span', { class: 'brand-word' }, 'binger')),
      h('div', { class: 'topbar-actions' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Search', onClick: ctx.onSearch }, icon('search')),
        h('button', {
          type: 'button', class: `icon-btn${active.length ? ' is-on has-dot' : ''}`,
          'aria-label': active.length ? 'Filters (on)' : 'Filters', onClick: ctx.onFilters,
        }, icon('sliders')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fresh cards', onClick: ctx.onRefresh }, icon('refresh')),
        whoChip(ctx.who))),
    h('div', { class: 'pills', role: 'group', 'aria-label': 'What to show' },
      FILTERS.map(([key, label]) => h('button', {
        type: 'button', class: 'pill', 'aria-pressed': String(ctx.filter === key), onClick: () => ctx.setFilter(key),
      }, label))),
    active.length ? h('div', { class: 'filter-line' },
      h('span', null, active.join(' · ')),
      h('button', { type: 'button', class: 'link-btn', onClick: ctx.onClearFilters }, 'Clear')) : null);

  const deckEl = h('div', { class: 'deck' });
  const cards = ctx.cards.slice(0, 3);

  if (cards.length) {
    // Bottom card first so the top card is last in the DOM (and on top).
    cards.slice().reverse().forEach((card, revIdx) => {
      const depth = cards.length - 1 - revIdx;
      const el = cardEl(card, { profile: ctx.profile, showMatch: ctx.showMatch, clipSeconds: ctx.clipSeconds, isTop: depth === 0 });
      el.style.setProperty('--depth', depth);
      if (depth > 0) { el.setAttribute('aria-hidden', 'true'); el.inert = true; }
      deckEl.append(el);
    });
  } else {
    deckEl.append(emptyState(ctx));
  }
  if (ctx.loading && cards.length) deckEl.append(h('div', { class: 'deck-loading', role: 'status' }, 'Finding more…'));
  // The three cards on screen load their own posters; fetch the next two too.
  ctx.cards.slice(3, 5).forEach((c) => preloadPoster(c.title));

  const top = cards[0] || null;
  const disabled = !top;
  // Each button shows its key underneath when there's a mouse (CSS decides).
  const key = (k) => h('kbd', { class: 'key-hint', 'aria-hidden': 'true' }, k);
  const actions = h('div', { class: 'actions' },
    h('button', { type: 'button', class: 'act act-sm', 'aria-label': 'Undo last swipe', title: 'Undo (Z)', disabled: !ctx.canUndo, onClick: ctx.onUndo }, icon('undo', 18), key('Z')),
    h('button', { type: 'button', class: 'act act-pass', 'aria-label': 'Pass', title: 'Pass (←)', disabled, onClick: () => swipe('left') }, icon('x', 26), key('←')),
    h('button', { type: 'button', class: 'act act-seen', 'aria-label': 'Seen it: rate it', title: 'Seen it (↑)', disabled, onClick: () => top && ctx.onAction('up', top) }, icon('eye', 24), key('↑')),
    h('button', { type: 'button', class: 'act act-want', 'aria-label': 'Want to watch', title: 'Want to watch (→)', disabled, onClick: () => swipe('right') }, icon('bookmark', 26), key('→')),
    h('button', { type: 'button', class: 'act act-sm', 'aria-label': 'More about this title', title: 'Details (Enter)', disabled, onClick: () => top && ctx.onOpen(top) }, icon('info', 18), key('Enter')));

  // On a phone .discover-main and .deck-col are display: contents, so this is
  // the same column as ever. On a wide screen the top card's details sit
  // beside the deck (ctx.detail is only passed then).
  const side = top && ctx.detail ? ctx.detail(top) : null;
  root.append(header, h('div', { class: `discover-main${side ? ' has-side' : ''}` },
    h('div', { class: 'deck-col' }, h('div', { class: 'deck-wrap' }, deckEl), actions),
    side ? h('aside', { class: 'deck-side', 'aria-label': `About ${top.title.title}` }, side) : null));

  const topEl = deckEl.querySelector('.card:last-of-type');
  if (top && topEl) attachGestures(topEl, {
    onSwipe: (dir) => (dir === 'up' ? ctx.onAction('up', top) : fly(topEl, dir, () => ctx.onAction(dir, top))),
    onTap: () => ctx.onOpen(top),
  });

  function swipe(dir) {
    if (!top || !topEl) return;
    fly(topEl, dir, () => ctx.onAction(dir, top));
  }

  return { swipe };
}

function emptyState(ctx) {
  if (ctx.loading) {
    return h('div', { class: 'deck-empty', role: 'status' },
      h('div', { class: 'skeleton-card', 'aria-hidden': 'true' }),
      h('p', null, 'Finding things you might like…'));
  }
  const blocks = [];
  if (ctx.errors && ctx.errors.length) {
    blocks.push(h('h2', null, "Couldn't load cards"), h('p', { class: 'muted' }, ctx.errorText || 'Check your connection and try again.'));
  } else if (ctx.filter !== 'all' && ctx.filter !== 'anime' && !ctx.hasKey) {
    blocks.push(h('h2', null, 'Films and TV need a TMDB key'), h('p', { class: 'muted' }, "It's free and takes two minutes. Anime works without one."));
    blocks.push(h('button', { type: 'button', class: 'btn btn-primary', onClick: ctx.onSettings }, 'Add a TMDB key'));
    return h('div', { class: 'deck-empty' }, blocks);
  } else if (filterSummary(ctx.deckFilters, ctx.streamOnly, ctx.services).length) {
    blocks.push(h('h2', null, 'Nothing matches those filters yet'), h('p', { class: 'muted' }, 'Fetch fresh cards to look further, or loosen the filters.'));
    blocks.push(h('button', { type: 'button', class: 'btn btn-quiet', onClick: ctx.onClearFilters }, 'Clear filters'));
  } else {
    blocks.push(h('h2', null, "That's everything for now"), h('p', { class: 'muted' }, 'Try another filter, change your mix on the Taste tab, or fetch fresh cards.'));
  }
  blocks.push(h('button', { type: 'button', class: 'btn btn-primary', onClick: ctx.onRefresh }, icon('refresh', 18), 'Fetch fresh cards'));
  return h('div', { class: 'deck-empty' }, blocks);
}

function fly(el, dir, done) {
  if (el.dataset.flying) return;
  el.dataset.flying = '1';
  const reduce = prefersReducedMotion();
  const x = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
  el.style.transition = reduce ? 'opacity 120ms ease' : 'transform 260ms cubic-bezier(.2,.7,.3,1), opacity 260ms ease';
  el.style.transform = reduce ? '' : `translate(${x * 140}%, ${dir === 'up' ? -120 : 0}%) rotate(${x * 18}deg)`;
  el.style.opacity = '0';
  el.classList.add(`is-${dir}`);
  let called = false;
  const finish = () => { if (!called) { called = true; done(); } };
  el.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, reduce ? 160 : 320);
}

// A drag can start anywhere on the card, including on the play button: a tap
// on the button still plays the clip, a drag that starts there still swipes.
// Pointer capture only begins once the finger has actually moved, so taps
// reach their buttons normally.
function attachGestures(el, { onSwipe, onTap }) {
  let start = null;
  let dragging = false;
  let justDragged = false;
  let dx = 0;
  let dy = 0;
  let samples = []; // recent pointer positions, for a flick's speed

  const setStamps = () => {
    const horiz = Math.abs(dx) >= Math.abs(dy);
    el.style.setProperty('--want', horiz ? Math.max(0, Math.min(1, dx / THRESHOLD_X)) : 0);
    el.style.setProperty('--pass', horiz ? Math.max(0, Math.min(1, -dx / THRESHOLD_X)) : 0);
    el.style.setProperty('--seen', !horiz ? Math.max(0, Math.min(1, -dy / THRESHOLD_UP)) : 0);
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('a, iframe, .clip')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, onButton: !!e.target.closest('button') };
    dragging = false;
    dx = 0; dy = 0;
    samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
  });
  el.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    dx = e.clientX - start.x;
    dy = e.clientY - start.y;
    samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (samples.length > 12) samples.shift();
    if (!dragging) {
      if (Math.hypot(dx, dy) < 8) return;
      dragging = true;
      try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      el.style.transition = 'none';
      el.classList.add('is-dragging');
    }
    el.style.transform = `translate(${dx}px, ${Math.min(dy, 40)}px) rotate(${dx / 18}deg)`;
    setStamps();
  });
  const end = () => {
    if (!start) return;
    const wasDrag = dragging;
    const onButton = start.onButton;
    start = null;
    dragging = false;
    el.classList.remove('is-dragging');
    if (!wasDrag) {
      if (!onButton) onTap();
      return;
    }
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    const horiz = Math.abs(dx) >= Math.abs(dy);
    const reset = () => {
      el.style.transition = 'transform 200ms ease';
      el.style.transform = '';
      dx = 0; dy = 0; setStamps();
    };
    // Far enough, or flicked: a quick short swipe counts too (js/ui/gesture.js).
    const flick = flickDirection(samples, dx, dy);
    const commit = (dir) => {
      // A light tick on phones that can (Android); silently nothing elsewhere.
      if (navigator.vibrate && !prefersReducedMotion()) { try { navigator.vibrate(8); } catch { /* not allowed */ } }
      if (dir === 'up') reset();
      onSwipe(dir);
    };
    if ((horiz && dx > THRESHOLD_X) || flick === 'right') commit('right');
    else if ((horiz && dx < -THRESHOLD_X) || flick === 'left') commit('left');
    else if ((!horiz && dy < -THRESHOLD_UP) || flick === 'up') commit('up');
    else reset();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', () => {
    start = null; dragging = false;
    el.style.transform = ''; el.classList.remove('is-dragging');
    dx = 0; dy = 0; setStamps();
  });
  // A drag that began on the play button must not also "click" it.
  el.addEventListener('click', (e) => { if (justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);
}
