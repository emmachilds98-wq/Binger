// First run: "What have you loved?" Tap a few titles (or search for them) so
// the very first deck already knows something about you. The grid is what
// most people have seen (js/sources/lookups.js → starterTitles), with "Show
// more" for the next lot; anything you've picked stays at the top of it.

import { h, icon, clear, KIND_NAME, safeImg } from './dom.js';
import { openSheet } from './sheet.js';
import { serviceLine } from './search.js';

export const MIN_PICKS = 3;

export function openOnboarding(ctx) {
  const sheet = openSheet({ label: 'Set up Binger', variant: 'full', className: 'onboarding', dismissible: false });
  const picked = new Map();
  let titles = [];
  let page = 1;
  let more = 'idle'; // 'idle' | 'loading' | 'done'

  const grid = h('div', { class: 'tile-grid', role: 'group', 'aria-label': 'Popular titles' });
  const status = h('p', { class: 'small muted onboard-status', role: 'status' });
  const moreBtn = h('button', { type: 'button', class: 'btn btn-quiet onboard-more' }, 'Show more');
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

  // Not searching: your picks first (including any found by search), then
  // the popular grid, then "Show more".
  function paintHome(note = '') {
    status.textContent = note;
    const mine = [...picked.values()].filter((t) => !titles.some((x) => x.id === t.id));
    paintGrid(titles.length ? [...mine, ...titles] : []);
    moreBtn.hidden = !titles.length || more === 'done';
    moreBtn.disabled = more === 'loading';
    moreBtn.textContent = more === 'loading' ? 'Loading…' : 'Show more';
  }

  moreBtn.addEventListener('click', async () => {
    if (more !== 'idle') return;
    more = 'loading';
    paintHome();
    try {
      const next = await ctx.loadPopular(page + 1);
      const fresh = next.filter((t) => !titles.some((x) => x.id === t.id));
      page += 1;
      titles = [...titles, ...fresh];
      more = fresh.length ? 'idle' : 'done';
    } catch {
      more = 'idle';
    }
    if (!input.value.trim()) paintHome();
  });

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) { paintHome(); return; }
      status.textContent = 'Searching…';
      const { titles: found, errors, service } = await ctx.search(q);
      if (input.value.trim() !== q) return;
      if (!found.length) {
        paintHome(errors.length ? 'Search failed. Check your connection.' : `Nothing found for “${q}”. Try another spelling, or pick from these.`);
        return;
      }
      status.textContent = service ? serviceLine(service) : '';
      moreBtn.hidden = true;
      paintGrid(found);
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
    h('div', { class: 'page-scroll' }, status, grid, moreBtn,
      !ctx.hasKey ? h('div', { class: 'notice' }, icon('info', 18),
        h('p', null, 'Anime works straight away. Films and TV need a free TMDB key; you can add it now or later in ',
          h('button', { type: 'button', class: 'link-btn', onClick: ctx.onSettings }, 'Settings'), '.')) : null),
    h('footer', { class: 'onboard-foot' }, count,
      h('button', { type: 'button', class: 'link-btn', onClick: () => { ctx.onDone([]); sheet.close(); } }, 'Skip'),
      start));

  // From the first page again (a TMDB key added mid-way brings films and TV).
  const load = () => ctx.loadPopular(1).then((list) => {
    titles = list;
    page = 1;
    more = 'idle';
    if (!input.value.trim()) paintHome();
  });

  paintCount();
  paintHome();
  load().catch(() => grid.replaceChildren(h('p', { class: 'muted' }, 'Couldn’t load popular titles. Search above instead.')));
  return { sheet, refresh: load };
}
