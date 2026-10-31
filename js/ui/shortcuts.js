// "?" on a keyboard: the list of shortcuts. The keys themselves are handled
// in js/app.js; this is only the list, so keep the two in step.

import { h, append } from './dom.js';
import { openSheet } from './sheet.js';

const KEYS = [
  ['→', 'Want to watch'],
  ['←', 'Pass'],
  ['↑', 'Seen it: rate it'],
  ['Enter', 'Details'],
  ['Z', 'Undo the last swipe'],
  ['/', 'Search'],
  ['?', 'This list'],
  ['Esc', 'Close'],
];

export function openShortcuts() {
  const s = openSheet({ label: 'Keyboard shortcuts', variant: 'bottom', className: 'shortcuts' });
  append(s.body, [
    h('h2', { class: 'sheet-title' }, 'Keyboard shortcuts'),
    h('p', { class: 'small muted' }, 'The deck keys work on Discover. None of them fire while you’re typing.'),
    h('dl', { class: 'shortcut-list' }, KEYS.map(([k, what]) => h('div', { class: 'shortcut' }, h('dt', null, h('kbd', null, k)), h('dd', null, what)))),
    h('div', { class: 'row-end' }, h('button', { type: 'button', class: 'btn btn-primary', onClick: () => s.close() }, 'Done')),
  ]);
  s.focusFirst();
  return s;
}
