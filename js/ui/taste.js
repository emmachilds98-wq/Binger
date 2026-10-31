// The Taste tab: what Binger has learned (so you can see it working) and the
// controls to steer it: Films / TV / Anime mix, new releases, surprises,
// genres to hide.

import { h, icon, clear, KIND_NAME, titleCase } from './dom.js';
import { topFeatures } from '../engine/index.js';
import { servicesSummary } from './services.js';
import { tasteMoved, howYouWatch } from './timeline.js';
import { whoChip } from './people.js';

const ALL_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror',
  'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western', 'Reality', 'Kids', 'Slice of Life',
  'Sports', 'Supernatural', 'Psychological', 'Mecha', 'Ecchi',
];

export function renderTaste(root, ctx) {
  clear(root);
  const { state, profile } = ctx;
  const s = state.settings;
  const st = profile.stats;

  const head = h('header', { class: 'page-head' },
    h('div', { class: 'row-between' },
      h('h1', { class: 'page-title' }, 'Your taste'),
      h('div', { class: 'row-gap' }, whoChip(ctx.who), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Settings', onClick: ctx.onSettings }, icon('settings')))));
  // The scroll area holds an inner column that grows with its content: on a
  // wide screen that column flows into two (CSS columns on a fixed-height box
  // would spill into extra columns off to the side instead).
  const scroll = h('div', { class: 'page-scroll' });
  const page = h('div', { class: 'taste' });
  scroll.append(page);
  root.append(head, scroll);

  page.append(h('p', { class: 'lede' }, st.items
    ? `Learned from ${plural(st.rated, 'rating')}, ${plural(st.wants, 'save')} and ${plural(st.passes, 'pass', 'passes')}. Recent ones count most, so this shifts as your taste does.`
    : 'Nothing learned yet. Rate a few things you’ve watched (swipe up on a card, or Library → Log a watch) and this fills in.'));

  const moved = tasteMoved(ctx.timeline);
  if (moved) page.append(moved);

  const likes = topFeatures(profile, 'genre', { limit: 6 });
  if (likes.length) {
    const max = Math.max(...likes.map((g) => g.affinity));
    page.append(section('Pulls you in', h('ul', { class: 'bars' }, likes.map((g) => h('li', { class: 'bar-row' },
      h('span', { class: 'bar-label' }, g.label),
      h('span', { class: 'bar-track', 'aria-hidden': 'true' }, h('span', { class: 'bar-fill', style: { width: `${Math.round((g.affinity / max) * 100)}%` } })),
      h('span', { class: 'sr-only' }, `${Math.round(g.affinity * 100)} percent`))))));
  }

  const themes = topFeatures(profile, 'keyword', { limit: 8 });
  if (themes.length) page.append(section('Themes you rate highly', chips(themes.map((k) => k.label))));

  // A director counts after one title you loved; actors and studios need two,
  // otherwise one 5-star rating would list that title's entire cast.
  const people = [...topFeatures(profile, 'creator', { limit: 4 }), ...topFeatures(profile, 'cast', { limit: 6, minN: 2 }), ...topFeatures(profile, 'studio', { limit: 3, minN: 2 })]
    .sort((a, b) => b.affinity - a.affinity).slice(0, 8);
  if (people.length) {
    // Directors and cast open their other work; studios aren't people.
    page.append(section('People you rate highly', h('ul', { class: 'chips' }, people.map((p) => {
      const inner = [h('span', null, p.group === 'studio' ? titleCase(p.label) : p.label), p.best ? h('span', { class: 'muted' }, ` · ${p.best.title}`) : null];
      return p.group === 'studio' || !ctx.onPerson
        ? h('li', { class: 'chip chip-solid' }, inner)
        : h('li', null, h('button', { type: 'button', class: 'chip chip-solid chip-btn', onClick: () => ctx.onPerson({ id: p.key.slice(2), name: p.label }) }, inner));
    }))));
  }

  const how = howYouWatch(profile);
  if (how) page.append(how);

  const dislikes = [...topFeatures(profile, 'genre', { limit: 4, sign: -1 }), ...topFeatures(profile, 'keyword', { limit: 4, sign: -1 })];
  if (dislikes.length) page.append(section('Not really your thing', chips(dislikes.map((d) => d.label))));

  // --- steering ---------------------------------------------------------
  const mixTotal = (s.mix.film + s.mix.tv + s.mix.anime) || 1;
  const pctEls = {};
  const sliders = ['film', 'tv', 'anime'].map((k) => {
    const id = `mix-${k}`;
    pctEls[k] = h('span', { class: 'mix-pct' }, `${Math.round((s.mix[k] / mixTotal) * 100)}%`);
    const input = h('input', { id, type: 'range', min: '0', max: '100', step: '5', value: String(s.mix[k]) });
    input.addEventListener('input', () => {
      const mix = { ...s.mix, [k]: Number(input.value) };
      const total = (mix.film + mix.tv + mix.anime) || 1;
      for (const kk of Object.keys(pctEls)) pctEls[kk].textContent = `${Math.round((mix[kk] / total) * 100)}%`;
    });
    input.addEventListener('change', () => ctx.updateSettings({ mix: { ...ctx.getState().settings.mix, [k]: Number(input.value) } }));
    return h('div', { class: 'mix-row' }, h('label', { for: id, class: 'mix-label' }, KIND_NAME[k] === 'Film' ? 'Films' : KIND_NAME[k]), input, pctEls[k]);
  });

  page.append(h('section', { class: 'panel' },
    h('h2', { class: 'eyebrow' }, 'Steer the deck'),
    sliders,
    !ctx.hasKey ? h('p', { class: 'small muted' }, 'Films and TV need a TMDB key (Settings). Until then the deck is all anime.') : null,
    h('button', { type: 'button', class: 'row-btn', onClick: ctx.onServices },
      h('span', { class: 'switch-text' },
        h('span', { class: 'switch-label' }, 'Your streaming services'),
        h('span', { class: 'small muted' }, s.services && s.services.length
          ? `${servicesSummary(s.services)}${s.streamOnly ? ' · only these' : ''}`
          : 'Pick yours to lift what you can watch tonight')),
      icon('forward', 18)),
    toggle('Favour new releases', 'Lift films, shows and seasons from the last few months', s.preferFresh, (v) => ctx.updateSettings({ preferFresh: v })),
    toggle('Surprise me sometimes', 'About 1 card in 7 is a well-rated title outside your usual taste', s.surprise, (v) => ctx.updateSettings({ surprise: v }))));

  const hidden = new Set(s.hiddenGenres);
  // Hidden series first (tap to show again), then the genres.
  const series = (s.hiddenFranchises || []).map((f) => h('button', {
    type: 'button', class: 'pill pill-series', 'aria-label': `Show ${f.name} again`, onClick: () => ctx.onUnhideSeries && ctx.onUnhideSeries(f),
  }, f.name, icon('x', 14)));
  page.append(section('Never show me', h('div', { class: 'pill-wrap' }, series, ALL_GENRES.map((g) => {
    const b = h('button', { type: 'button', class: 'pill pill-hide', 'aria-pressed': String(hidden.has(g)) }, g);
    b.addEventListener('click', () => {
      const next = new Set(ctx.getState().settings.hiddenGenres);
      if (next.has(g)) next.delete(g); else next.add(g);
      b.setAttribute('aria-pressed', String(next.has(g)));
      ctx.updateSettings({ hiddenGenres: [...next] });
    });
    return b;
  }))));

  page.append(h('div', { class: 'stack-gap' },
    st.passes ? h('button', { type: 'button', class: 'btn btn-quiet', onClick: ctx.onForgetPasses }, `Give my ${plural(st.passes, 'pass', 'passes')} another chance`) : null,
    h('button', { type: 'button', class: 'btn btn-quiet', onClick: ctx.onSettings }, icon('settings', 18), 'Settings, backup and TMDB key')));
}

function plural(n, one, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}

function section(title, content) {
  return h('section', { class: 'taste-section' }, h('h2', { class: 'eyebrow' }, title), content);
}

function chips(labels) {
  return h('ul', { class: 'chips' }, labels.map((l) => h('li', { class: 'chip' }, l)));
}

export function toggle(label, hint, on, onChange) {
  const btn = h('button', { type: 'button', role: 'switch', class: 'switch-row', 'aria-checked': String(!!on) },
    h('span', { class: 'switch-text' }, h('span', { class: 'switch-label' }, label), hint ? h('span', { class: 'small muted' }, hint) : null),
    h('span', { class: 'switch', 'aria-hidden': 'true' }, h('span', { class: 'knob' })));
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return btn;
}
