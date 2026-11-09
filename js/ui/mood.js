// "What are you in the mood for?": the Mood pill on Discover (or M) opens
// this. One tap picks a mood and goes back to the deck, which then shows only
// cards that fit it, still ranked by your taste. The moods themselves, and
// what fits each, are in js/engine/moods.js.

import { h, append } from './dom.js';
import { openSheet, closeButton } from './sheet.js';
import { MOODS } from '../engine/index.js';

// ctx: { current: mood id or null, hints: { [moodId]: 'Like Paddington 2' }, onPick(id or null) }
export function openMood(ctx) {
  const sheet = openSheet({ label: 'Mood', variant: 'bottom', className: 'mood-sheet' });
  const hints = ctx.hints || {};
  const tile = (id, label, line, hint) => h('button', {
    type: 'button', class: 'mood-tile', 'aria-pressed': String((ctx.current ?? null) === id),
    onClick: () => { sheet.close(); ctx.onPick(id); },
  },
  h('span', { class: 'mood-name' }, label),
  // Something you tagged with this feeling says more than the stock line.
  hint ? h('span', { class: 'mood-line accent' }, hint) : h('span', { class: 'mood-line' }, line));

  append(sheet.body, [
    h('div', { class: 'grabber', 'aria-hidden': 'true' }),
    h('div', { class: 'row-between' }, h('h2', { class: 'sheet-title' }, 'What are you in the mood for?'), closeButton(sheet)),
    h('p', { class: 'small muted' }, 'Cards that fit, still picked for your taste. Lasts until you close Binger.'),
    h('div', { class: 'mood-grid', role: 'group', 'aria-label': 'Moods' },
      tile(null, 'Any mood', 'Everything you might like'),
      MOODS.map((m) => tile(m.id, m.label, m.line, hints[m.id]))),
  ]);
  sheet.focusFirst();
  return sheet;
}
