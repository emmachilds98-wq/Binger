// First run: "What have you loved?" Tap a few titles (or search for them) so
// the very first deck already knows something about you.

import { h, icon, clear, KIND_NAME, safeImg } from './dom.js';
import { openSheet } from './sheet.js';

export const MIN_PICKS = 3;

export function openOnboarding(ctx) {
  const sheet = openSheet({ label: 'Set up Binger', variant: 'full', className: 'onboarding', dismissible: false });
  const picked = new Map();
  let titles = [];

  const grid = h('div', { class: 'tile-grid', role: 'group', 'aria-label': 'Popular titles' });
  const count = h('span', { class: 'muted grow', role: 'status' });
  const start = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, 'Start swiping');
  const input = h('input', { id: 'seed-search', type: 'search', placeholder: 'Films, shows, anime…', autocomplete: 'off', enterkeyhint: 'search' });

  function paintCount() {
    const n = picked.size;
    count.textContent = n === 0 ? 'Nothing picked yet' : `${n} picked${n < MIN_PICKS ? ` · ${MIN_PICKS - n} more` : ''}`;
    start.classList.toggle('is-ready', n >= MIN_PICKS);
  }

  function tile(t) {
    const b = h('button', { type: 'button', class: 'tile', 'aria-pressed': String(picked.has(t.id)), 'aria-label': `${t.title} (${KIND_NAME[t.kind]})`, style: { '--art': t.color || null } },
      t.poster ? safeImg(t.poster, { loading: 'lazy' }) : null,
      h('span', { class: `badge badge-${t.kind} badge-xs` }, KIND_NAME[t.kind]),
      h('span', { class: 'tile-check', 'aria-hidden': 'true' }, icon('check', 14)),
      h('span', { class: 'tile-title' }, t.title));
    b.addEventListener('click', () => {
      if (picked.has(t.id)) picked.delete(t.id); else picked.set(t.id, t);
      b.setAttribute('aria-pressed', String(picked.has(t.id)));
      paintCount();
    });
    return b;
  }

  function paintGrid(list) {
    clear(grid);
    if (!list.length) grid.append(h('p', { class: 'muted' }, 'Loading popular titles…'));
    list.forEach((t) => grid.append(tile(t)));
  }

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) { paintGrid(titles); return; }
      const { titles: found } = await ctx.search(q);
      if (input.value.trim() === q) paintGrid(found.length ? found : titles);
    }, 350);
  });

  start.addEventListener('click', () => {
    ctx.onDone([...picked.values()]);
    sheet.close();
  });

  sheet.body.append(
    h('header', { class: 'onboard-head' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('play', 12)), h('span', { class: 'brand-word small' }, 'binger')),
      h('h1', { class: 'page-title' }, 'What have you loved?'),
      h('p', { class: 'muted' }, `Tap anything you've watched and enjoyed. ${MIN_PICKS} is enough to start. Binger keeps learning every time you swipe or rate.`)),
    h('div', { class: 'onboard-search' },
      h('label', { class: 'eyebrow', for: 'seed-search' }, 'Find a favourite'),
      h('div', { class: 'search-box' }, icon('search', 18), input)),
    h('div', { class: 'page-scroll' }, grid,
      !ctx.hasKey ? h('div', { class: 'notice' }, icon('info', 18),
        h('p', null, 'Anime works straight away. Films and TV need a free TMDB key; you can add it now or later in ',
          h('button', { type: 'button', class: 'link-btn', onClick: ctx.onSettings }, 'Settings'), '.')) : null),
    h('footer', { class: 'onboard-foot' }, count,
      h('button', { type: 'button', class: 'link-btn', onClick: () => { ctx.onDone([]); sheet.close(); } }, 'Skip'),
      start));

  paintCount();
  paintGrid([]);
  ctx.loadPopular().then((list) => {
    titles = list;
    if (!input.value.trim()) paintGrid(titles);
  }).catch(() => grid.replaceChildren(h('p', { class: 'muted' }, 'Couldn’t load popular titles. Search above instead.')));
  return {
    sheet,
    refresh: () => ctx.loadPopular().then((list) => { titles = list; if (!input.value.trim()) paintGrid(titles); }),
  };
}
