// The Library tab: your Watchlist (best match first, so it doubles as "what
// should I watch tonight?") and your Diary of everything you've watched.

import { h, icon, clear, KIND_NAME, metaLine, poster, starsText, shortDate, monthLabel } from './dom.js';
import { watchlist, diary } from '../state/library.js';
import { rankWatchlist } from '../engine/index.js';

export function renderLibrary(root, ctx) {
  clear(root);
  const { state, profile, tab } = ctx;
  const wl = watchlist(state);
  const rows = diary(state);

  const tabs = h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Library sections' },
    [['watchlist', `Watchlist · ${wl.length}`], ['diary', `Diary · ${rows.length}`]].map(([key, label]) => h('button', {
      type: 'button', role: 'tab', class: 'seg', 'aria-selected': String(tab === key), onClick: () => ctx.setTab(key),
    }, label)));

  root.append(h('header', { class: 'page-head' },
    h('div', { class: 'row-between' },
      h('h1', { class: 'page-title' }, 'Library'),
      h('button', { type: 'button', class: 'btn btn-chip', onClick: ctx.onLog }, icon('plus', 16), 'Log a watch')),
    tabs));

  const list = h('div', { class: 'page-scroll', role: 'tabpanel' });
  root.append(list);

  if (tab === 'watchlist') {
    if (!wl.length) {
      list.append(empty('Nothing saved yet', 'Swipe right on anything you fancy and it lands here, best match first.'));
      return;
    }
    const sorted = ctx.sort === 'recent' ? wl.map((item) => ({ item })) : rankWatchlist(wl, profile);
    list.append(h('div', { class: 'row-between list-tools' },
      h('span', { class: 'small muted' }, ctx.sort === 'recent' ? 'Recently added first' : 'Best match for you first'),
      h('button', { type: 'button', class: 'link-btn', onClick: () => ctx.setSort(ctx.sort === 'recent' ? 'match' : 'recent') },
        ctx.sort === 'recent' ? 'Sort by best match' : 'Sort by recently added')));
    list.append(h('ul', { class: 'rows' }, sorted.map(({ item }) => {
      const t = item.title;
      const why = item.via && item.via[0] && item.via[0].seedTitle ? `Because you liked ${item.via[0].seedTitle}` : `Added ${shortDate(item.addedAt)}`;
      return h('li', { class: 'row' },
        h('button', { type: 'button', class: 'row-main', onClick: () => ctx.onOpen(item) },
          poster(t),
          h('span', { class: 'row-text' },
            h('span', { class: 'row-title' }, t.title),
            h('span', { class: 'small muted' }, [KIND_NAME[t.kind], metaLine(t)].filter(Boolean).join(' · ')),
            h('span', { class: 'small accent' }, why))),
        h('button', { type: 'button', class: 'btn btn-chip btn-seen-chip', onClick: () => ctx.onWatched(item) }, 'Watched it'));
    })));
    return;
  }

  if (!rows.length) {
    list.append(empty('Your diary is empty', 'Swipe up on a card you’ve already seen, or tap "Log a watch", to rate it. Every rating sharpens your suggestions.'));
    return;
  }
  const rated = rows.filter((r) => typeof r.watch.rating === 'number');
  const avg = rated.length ? rated.reduce((s, r) => s + r.watch.rating, 0) / rated.length : null;
  list.append(h('p', { class: 'small muted list-tools' },
    `${rows.length} watched${avg != null ? ` · average ${avg.toFixed(1)}★` : ''}`));
  let month = null;
  let ul = null;
  for (const { item, watch } of rows) {
    const m = monthLabel(watch.date);
    if (m !== month) {
      month = m;
      ul = h('ul', { class: 'rows' });
      list.append(h('h2', { class: 'eyebrow month' }, m), ul);
    }
    const t = item.title;
    ul.append(h('li', { class: 'row' },
      h('button', { type: 'button', class: 'row-main', onClick: () => ctx.onEditWatch(item, watch), 'aria-label': `Edit your entry for ${t.title}` },
        poster(t),
        h('span', { class: 'row-text' },
          h('span', { class: 'row-title-line' }, h('span', { class: 'row-title' }, t.title), h('span', { class: 'small muted' }, shortDate(watch.date))),
          h('span', { class: 'stars small', 'aria-label': watch.rating ? `${watch.rating} out of 5` : 'Not rated' }, watch.rating ? starsText(watch.rating) : 'Not rated'),
          watch.review ? h('span', { class: 'row-review' }, watch.review) : null,
          watch.tags && watch.tags.length ? h('span', { class: 'small muted' }, watch.tags.join(' · ')) : null)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `More about ${t.title}`, onClick: () => ctx.onOpen(item) }, icon('info', 18))));
  }
}

function empty(title, text) {
  return h('div', { class: 'empty' }, h('h2', null, title), h('p', { class: 'muted' }, text));
}
