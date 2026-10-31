// The Library tab: your Watchlist (best match first, so it doubles as "what
// should I watch tonight?") and your Diary of everything you've watched.

import { h, icon, clear, KIND_NAME, metaLine, poster, starsText, shortDate, monthLabel, watchWhen, watchGroup, reviewLine } from './dom.js';
import { latestWatch } from '../engine/index.js';
import { whoChip } from './people.js';
import { watchlist, diary, setupPicks, ASPECTS } from '../state/library.js';
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
      h('div', { class: 'row-gap' }, whoChip(ctx.who), h('button', { type: 'button', class: 'btn btn-chip', onClick: ctx.onLog }, icon('plus', 16), 'Log a watch'))),
    tabs));

  const list = h('div', { class: 'page-scroll', role: 'tabpanel' });
  root.append(list);

  if (tab === 'watchlist') {
    if (ctx.alerts && ctx.alerts.length) list.append(newSeasons(ctx));
    const shared = ctx.shared || [];
    if (shared.length) list.append(sharedSection(shared, ctx));
    const sharedIds = new Set(shared.map((x) => x.item.id));
    if (!wl.length) {
      list.append(empty('Nothing saved yet', 'Swipe right on anything you fancy and it lands here, best match first.'));
      return;
    }
    const rest = wl.filter((item) => !sharedIds.has(item.id));
    if (!rest.length) return;
    const sorted = ctx.sort === 'recent' ? rest.map((item) => ({ item })) : rankWatchlist(rest, profile);
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
  const picks = setupPicks(state);
  if (picks.length) list.append(firstRunPicks(picks, ctx));
  const rated = rows.filter((r) => typeof r.watch.rating === 'number');
  const avg = rated.length ? rated.reduce((s, r) => s + r.watch.rating, 0) / rated.length : null;
  list.append(h('p', { class: 'small muted list-tools' },
    `${rows.length} watched${avg != null ? ` · average ${avg.toFixed(1)}★` : ''}`));
  let month = null;
  let ul = null;
  for (const { item, watch } of rows) {
    const m = watchGroup(watch);
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
          h('span', { class: 'row-title-line' }, h('span', { class: 'row-title' }, t.title), h('span', { class: 'small muted' }, watch.setup ? 'Picked' : watchWhen(watch))),
          h('span', { class: 'stars small', 'aria-label': watch.rating ? `${watch.rating} out of 5` : 'Not rated' }, watch.rating ? starsText(watch.rating) : 'Not rated'),
          watch.review ? h('span', { class: 'row-review' }, watch.review) : null,
          reviewLine(watch, ASPECTS) ? h('span', { class: 'small muted' }, reviewLine(watch, ASPECTS)) : null)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `More about ${t.title}`, onClick: () => ctx.onOpen(item) }, icon('info', 18))));
  }
}

// What you picked on the first-run screen, saved as loved: rate and review
// each properly with the same sheet as "Seen it" (stars, how it felt, your
// thoughts, when you watched). Each leaves this list once reviewed.
function firstRunPicks(picks, ctx) {
  return h('section', { class: 'alerts first-picks', 'aria-labelledby': 'first-picks-title' },
    h('h2', { id: 'first-picks-title', class: 'eyebrow' }, 'Picked, not reviewed yet'),
    h('p', { class: 'small muted' }, `${picks.length === 1 ? 'This is' : 'These are'} saved as loved (4½★). Review ${picks.length === 1 ? 'it' : 'them'} to tell Binger more.`),
    h('ul', { class: 'rows' }, picks.map(({ item, watch }) => {
      const t = item.title;
      return h('li', { class: 'row row-alert' },
        h('button', { type: 'button', class: 'row-main', onClick: () => ctx.onOpen(item), 'aria-label': `More about ${t.title}` },
          poster(t, 'thumb thumb-sm'),
          h('span', { class: 'row-text' },
            h('span', { class: 'row-title' }, t.title),
            h('span', { class: 'small muted' }, [KIND_NAME[t.kind], t.year].filter(Boolean).join(' · ')))),
        h('button', { type: 'button', class: 'btn btn-chip btn-seen-chip', 'aria-label': `Review ${t.title}`, onClick: () => ctx.onEditWatch(item, watch) }, 'Review'));
    })));
}

// "Back with new episodes" (Phase 2 step 4; design: Seasons.dc.html).
function newSeasons(ctx) {
  const items = ctx.state.items;
  return h('section', { class: 'alerts', 'aria-labelledby': 'alerts-title' },
    h('h2', { id: 'alerts-title', class: 'eyebrow' }, 'Back with new episodes'),
    h('ul', { class: 'rows' }, ctx.alerts.map((a) => {
      const item = items[a.id];
      if (!item) return null;
      const t = item.title;
      const last = latestWatch(item);
      return h('li', { class: 'row row-alert' },
        h('button', { type: 'button', class: 'row-main', onClick: () => ctx.onAlertOpen(a) },
          poster({ ...t, poster: (a.title && a.title.poster) || t.poster }, 'thumb thumb-sm'),
          h('span', { class: 'row-text' },
            h('span', { class: 'row-title' }, t.title),
            h('span', { class: `small strong ${a.state === 'soon' ? 'sky' : 'accent'}` }, seasonState(a)),
            last && last.date ? h('span', { class: 'small muted' }, `You watched it ${last.when === 'ages' ? 'ages ago' : last.when === 'year' ? `in ${String(last.date).slice(0, 4)}` : monthWords(last.date)}`) : null)),
        h('button', { type: 'button', class: 'btn btn-chip btn-seen-chip', onClick: () => ctx.onAlertWatched(a) }, 'Watched it'),
        h('button', { type: 'button', class: 'icon-btn icon-btn-narrow', 'aria-label': `Not interested in ${t.title}'s new season`, onClick: () => ctx.onAlertDismiss(a) }, icon('x', 18)));
    })));
}

export function seasonState(a) {
  const when = a.state === 'soon' ? `starts ${shortDate(a.date)}` : a.state === 'airing' ? 'airing now' : 'out now';
  return `Season ${a.season} · ${when}`;
}

// "in April" this year, "in March 2024" before that.
function monthWords(isoDate) {
  const label = monthLabel(isoDate);
  const thisYear = String(new Date().getFullYear());
  return `in ${label.endsWith(thisYear) ? label.split(' ')[0] : label}`;
}

// "You and Dave both want to watch" (watch together): matches first.
function sharedSection(shared, ctx) {
  const names = [...new Set(shared.flatMap((x) => x.with))];
  const heading = names.length === 1 ? `You and ${names[0]} both want to watch` : 'Others want to watch these too';
  return h('section', { class: 'alerts shared', 'aria-labelledby': 'shared-title' },
    h('h2', { id: 'shared-title', class: 'eyebrow accent' }, heading),
    h('ul', { class: 'rows' }, shared.map(({ item, with: who }) => {
      const t = item.title;
      return h('li', { class: 'row row-alert row-match' },
        h('button', { type: 'button', class: 'row-main', onClick: () => ctx.onOpen(item) },
          poster(t),
          h('span', { class: 'row-text' },
            h('span', { class: 'row-title' }, t.title),
            h('span', { class: 'small muted' }, [KIND_NAME[t.kind], metaLine(t)].filter(Boolean).join(' · ')),
            h('span', { class: 'small accent strong' }, icon('people', 14), ` A match with ${who.join(' and ')}`))),
        h('button', { type: 'button', class: 'btn btn-chip btn-seen-chip', onClick: () => ctx.onWatched(item) }, 'Watched it'));
    })));
}

function empty(title, text) {
  return h('div', { class: 'empty' }, h('h2', null, title), h('p', { class: 'muted' }, text));
}
