// First run: "What have you loved?" Tap a few titles (or search for them) so
// the very first deck already knows something about you. The grid is what
// most people have seen (js/sources/lookups.js → starterTitles), with "Show
// more" for the next lot; anything you've picked stays at the top of it.
//
// The same panel logs more watches later (Library → Log a watch, ctx.mode
// 'log'): it can be closed, needs no minimum, leaves out what you've already
// watched, and adds the picks to your diary instead of starting the deck.

import { h, icon, clear, KIND_NAME, safeImg } from './dom.js';
import { openSheet, closeButton } from './sheet.js';
import { serviceLine } from './search.js';

export const MIN_PICKS = 3;

export function openOnboarding(ctx) {
  const log = ctx.mode === 'log';
  const sheet = openSheet({ label: log ? 'Log what you’ve watched' : 'Set up Binger', variant: 'full', className: `onboarding${log ? ' log-picker' : ''}`, dismissible: log });
  // Already in your diary: not offered again in the grid (search still finds it, for a rewatch).
  const fresh = (list) => (log && ctx.isWatched ? list.filter((t) => !ctx.isWatched(t.id)) : list);
  const picked = new Map();
  let titles = [];
  let page = 1;
  let more = 'idle'; // 'idle' | 'loading' | 'done'
  const seen = new Set(); // every title a page has brought, shown or not

  const grid = h('div', { class: 'tile-grid', role: 'group', 'aria-label': 'Popular titles' });
  const status = h('p', { class: 'small muted onboard-status', role: 'status' });
  const moreBtn = h('button', { type: 'button', class: 'btn btn-quiet onboard-more' }, 'Show more');
  const count = h('span', { class: 'muted grow', role: 'status' });
  const start = h('button', { type: 'button', class: 'btn btn-primary btn-lg' }, log ? 'Add to your diary' : 'Start swiping');
  const input = h('input', { id: 'seed-search', type: 'search', placeholder: 'Films, shows, anime…', autocomplete: 'off', enterkeyhint: 'search' });

  function paintCount() {
    const n = picked.size;
    if (log) {
      count.textContent = n === 0 ? 'Nothing picked yet' : `${n} picked`;
      start.textContent = n ? `Add ${n} to your diary` : 'Add to your diary';
      start.disabled = n === 0;
      start.classList.toggle('is-ready', n > 0);
      return;
    }
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
      // "Nothing new" means nothing this panel hasn't been given before; in
      // log mode some of it may be left out because you've watched it.
      const unseen = next.filter((t) => !seen.has(t.id));
      unseen.forEach((t) => seen.add(t.id));
      page += 1;
      titles = [...titles, ...fresh(unseen)];
      more = unseen.length ? 'idle' : 'done';
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

  const head = log
    ? h('header', { class: 'onboard-head' },
      h('div', { class: 'row-between' }, h('h1', { class: 'page-title' }, 'What have you watched?'), closeButton(sheet)),
      h('p', { class: 'muted' }, 'Tap everything you’ve seen and liked, or search for any title. They go in your diary as loved (4½★); review them there to tell Binger more.'))
    : h('header', { class: 'onboard-head' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('play', 12)), h('span', { class: 'brand-word small' }, 'binger')),
      h('h1', { class: 'page-title' }, 'What have you loved?'),
      h('p', { class: 'muted' }, `Tap anything you've watched and enjoyed. ${MIN_PICKS} is enough to start. Binger keeps learning every time you swipe or rate.`));
  sheet.body.append(
    head,
    h('div', { class: 'onboard-search' },
      h('label', { class: 'eyebrow', for: 'seed-search' }, 'Find a favourite'),
      h('div', { class: 'search-box' }, icon('search', 18), input),
      ctx.onImport ? h('button', { type: 'button', class: 'link-btn small onboard-import', onClick: ctx.onImport }, 'Rate things on IMDb, Letterboxd or AniList? Bring your history in') : null),
    h('div', { class: 'page-scroll' }, status, grid, moreBtn,
      !ctx.hasKey ? h('div', { class: 'notice' }, icon('info', 18),
        h('p', null, 'Anime works straight away. Films and TV need a free TMDB key; you can add it now or later in ',
          h('button', { type: 'button', class: 'link-btn', onClick: ctx.onSettings }, 'Settings'), '.')) : null),
    h('footer', { class: 'onboard-foot' }, count,
      log ? null : h('button', { type: 'button', class: 'link-btn', onClick: () => { ctx.onDone([]); sheet.close(); } }, 'Skip'),
      start));

  // From the first page again (a TMDB key added mid-way brings films and TV).
  const load = () => ctx.loadPopular(1).then((list) => {
    seen.clear();
    list.forEach((t) => seen.add(t.id));
    titles = fresh(list);
    page = 1;
    more = 'idle';
    if (!input.value.trim()) paintHome();
  });

  paintCount();
  paintHome();
  load().catch(() => grid.replaceChildren(h('p', { class: 'muted' }, 'Couldn’t load popular titles. Search above instead.')));
  return { sheet, refresh: load };
}
