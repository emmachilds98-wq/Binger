// Deck filters: length ("Quick watches"), decade, and "Only what I can stream".
// Length and decade last for this session, like the Films / TV / Anime
// pills; "Only what I can stream" is a saved setting (it's also in Settings).

import { h, append } from './dom.js';
import { openSheet, closeButton } from './sheet.js';
import { toggle } from './taste.js';

export const DECADES = [[null, 'Any time'], [2020, '2020s'], [2010, '2010s'], [2000, '2000s'], [1990, '1990s'], [1980, '1980s'], ['older', 'Older']];

export function decadeLabel(d) {
  const hit = DECADES.find(([v]) => v === d);
  return hit ? hit[1] : null;
}

// The one-line summary under the pills, e.g. "Quick watches · 1990s · On your services".
export function filterSummary(filters, streamOnly, services) {
  const bits = [];
  if (filters.short) bits.push('Quick watches');
  if (filters.decade != null) bits.push(decadeLabel(filters.decade));
  if (streamOnly && services.length) bits.push(services.length === 1 ? `On ${services[0]}` : 'On your services');
  return bits;
}

export function openFilters(ctx) {
  const sheet = openSheet({ label: 'Filters', variant: 'bottom', className: 'filters' });
  let short = !!ctx.filters.short;
  let decade = ctx.filters.decade ?? null;
  let streamOnly = !!ctx.streamOnly;
  const services = ctx.services || [];

  const choice = (options, current, onPick) => {
    const btns = options.map(([value, label]) => {
      const b = h('button', { type: 'button', class: 'pill', 'aria-pressed': String(value === current) }, label);
      b.addEventListener('click', () => {
        for (const other of btns) other.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-pressed', 'true');
        onPick(value);
      });
      return b;
    });
    return btns;
  };

  const lengthPills = choice([[false, 'Any length'], [true, 'Quick watches']], short, (v) => { short = v; });
  const decadePills = choice(DECADES, decade, (v) => { decade = v; });
  // "Where" needs your services; with none picked (and no picker to send
  // you to) it's left out.
  let where = null;
  if (services.length) {
    const more = services.length > 3 ? ` and ${services.length - 3} more` : '';
    where = toggle('Only what I can stream', `On ${services.slice(0, 3).join(', ')}${more}`, streamOnly, (v) => { streamOnly = v; });
  } else if (ctx.onPickServices) {
    where = h('div', { class: 'notice' },
      h('p', null, 'Tell Binger which services you have and it can show only what you can watch tonight. ',
        h('button', { type: 'button', class: 'link-btn', onClick: () => { sheet.close(); ctx.onPickServices(); } }, 'Pick your services')));
  }

  const apply = h('button', { type: 'button', class: 'btn btn-primary grow' }, 'Show cards');
  apply.addEventListener('click', () => {
    ctx.onApply({ short, decade }, streamOnly);
    sheet.close();
  });
  const reset = h('button', { type: 'button', class: 'btn btn-quiet' }, 'Reset');
  reset.addEventListener('click', () => {
    ctx.onApply({ short: false, decade: null }, false);
    sheet.close();
  });

  // dom.js append (not the DOM's own), which skips the missing "Where".
  append(sheet.body, [
    h('div', { class: 'grabber', 'aria-hidden': 'true' }),
    h('div', { class: 'row-between' }, h('h2', { class: 'sheet-title' }, 'Filters'), closeButton(sheet)),
    h('div', { class: 'field' },
      h('div', { class: 'eyebrow', id: 'f-length' }, 'Length'),
      h('div', { class: 'pill-wrap', role: 'group', 'aria-labelledby': 'f-length' }, lengthPills),
      h('p', { class: 'small muted' }, 'Quick watches: films up to 2 hours, series up to 13 episodes.')),
    h('div', { class: 'field' },
      h('div', { class: 'eyebrow', id: 'f-decade' }, 'Released'),
      h('div', { class: 'pill-wrap', role: 'group', 'aria-labelledby': 'f-decade' }, decadePills)),
    where ? h('div', { class: 'field' }, h('div', { class: 'eyebrow' }, 'Where'), where) : null,
    h('div', { class: 'sheet-footer' }, reset, apply)]);
  sheet.focusFirst();
  return sheet;
}
