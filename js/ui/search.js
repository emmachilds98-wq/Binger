// Search films, TV and anime at once, to log something you've watched or save
// something you've heard about.

import { h, append, icon, clear, KIND_NAME, poster, avatar } from './dom.js';
import { openSheet, closeButton } from './sheet.js';

export function openSearch(ctx) {
  const sheet = openSheet({ label: ctx.label || 'Search', variant: 'full', className: 'search' });
  const input = h('input', { id: 'search-q', type: 'search', placeholder: 'Films, shows, anime…', autocomplete: 'off', enterkeyhint: 'search', autofocus: true });
  const results = h('div', { class: 'page-scroll', 'aria-live': 'polite' });
  append(sheet.body, [
    h('div', { class: 'search-head' },
      h('label', { class: 'search-box', for: 'search-q' }, icon('search', 18), h('span', { class: 'sr-only' }, 'Search'), input),
      closeButton(sheet)),
    ctx.hint ? h('p', { class: 'small muted search-hint' }, ctx.hint) : null,
    results]);

  let timer = null;
  let seq = 0;
  const run = async () => {
    const q = input.value.trim();
    const mine = ++seq;
    if (q.length < 2) { clear(results); return; }
    clear(results).append(h('p', { class: 'muted search-status' }, 'Searching…'));
    const { titles, errors, service, people = [] } = await ctx.search(q);
    if (mine !== seq) return;
    clear(results);
    if (!titles.length && !people.length) {
      results.append(h('p', { class: 'muted search-status' }, errors.length ? 'Search failed. Check your connection.' : `Nothing found for “${q}”.`));
    } else {
      append(results, [
        people.length && ctx.onPerson ? h('ul', { class: 'rows search-people', 'aria-label': 'People' }, people.map((p) => personRow(p, ctx))) : null,
        service ? h('p', { class: 'small muted search-hint search-service' }, serviceLine(service)) : null,
        titles.length ? h('ul', { class: 'rows' }, titles.map((t) => resultRow(t, ctx, sheet))) : null]);
    }
    if (!ctx.hasKey) results.append(h('p', { class: 'small muted search-hint' }, 'Only anime is searched until you add a TMDB key in Settings.'));
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 350); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); run(); } });
  sheet.focusFirst();
  return sheet;
}

// Typing a service's name lists its shows first (js/sources/lookups.js).
export function serviceLine(service) {
  return `${service} shows and films first, then everything else that matches.`;
}

// Someone whose name you typed: opens their page (js/ui/person.js), their
// films and shows ranked for you. What they're known for is in the results too.
function personRow(p, ctx) {
  const known = (p.knownFor || []).slice(0, 2).map((t) => t.title).join(', ');
  return h('li', { class: 'row' },
    h('button', { type: 'button', class: 'row-main', 'aria-label': `${p.name}: see their films and shows`, onClick: () => ctx.onPerson(p) },
      avatar(p, 'lg'),
      h('span', { class: 'row-text' },
        h('span', { class: 'row-title' }, p.name),
        h('span', { class: 'small muted' }, [p.known, known ? `known for ${known}` : null].filter(Boolean).join(' · '))),
      icon('forward', 18)));
}

function resultRow(t, ctx, sheet) {
  const status = ctx.statusOf(t.id);
  const label = status === 'watched' ? 'Watched' : status === 'want' ? 'On watchlist' : null;
  return h('li', { class: 'row' },
    h('button', { type: 'button', class: 'row-main', onClick: () => ctx.onOpen(t) },
      poster(t),
      h('span', { class: 'row-text' },
        h('span', { class: 'row-title' }, t.title),
        h('span', { class: 'small muted' }, [KIND_NAME[t.kind], t.year].filter(Boolean).join(' · ')),
        label ? h('span', { class: 'small accent' }, label) : null)),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Seen ${t.title}: rate it`, onClick: () => ctx.onSeen(t, sheet) }, icon('eye', 20)),
      status === 'watched' || status === 'want' ? null
        : h('button', { type: 'button', class: 'icon-btn accent', 'aria-label': `Add ${t.title} to watchlist`, onClick: (e) => { ctx.onWant(t); e.currentTarget.replaceWith(h('span', { class: 'icon-btn accent', 'aria-label': 'Added' }, icon('check', 20))); } }, icon('bookmark', 20))));
}
