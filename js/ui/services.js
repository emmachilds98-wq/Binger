// "Your services": pick the streaming services you pay for, and whether the
// deck should show only what's on them. Design: docs/design/canvas/Services.dc.html.
// Changes apply on Done; closing the sheet any other way leaves things as they were.

import { h, append, clear, icon, safeImg } from './dom.js';
import { openSheet, closeButton } from './sheet.js';
import { toggle } from './taste.js';
import { COMMON_SERVICES } from '../sources/services.js';

export function onlyHint(on) {
  return on ? 'Everything else is hidden from your deck' : 'Off: your services are lifted, nothing is hidden';
}

// Starting tiles before TMDB answers: the common services, plus anything
// already picked (so a pick never vanishes from the grid).
export function initialChoices(picked) {
  const out = COMMON_SERVICES.map((service) => ({ service, logo: null }));
  for (const service of picked) if (!out.some((x) => x.service === service)) out.push({ service, logo: null });
  return out;
}

export function openServices(ctx) {
  const sheet = openSheet({ label: 'Your services', variant: 'full', className: 'services' });
  const picked = new Set(ctx.picked || []);
  let streamOnly = !!ctx.streamOnly;

  const grid = h('div', { class: 'service-grid', role: 'group', 'aria-label': 'Streaming services' });
  function tile({ service, logo }) {
    const mono = h('span', { class: 'service-mono', 'aria-hidden': 'true' });
    const initial = () => mono.append(service.replace(/[^A-Za-z0-9]/g, '').slice(0, 1) || '?');
    if (logo) mono.append(safeImg(logo, { loading: 'lazy' }, initial)); else initial();
    const b = h('button', { type: 'button', class: 'service-tile', 'aria-pressed': String(picked.has(service)) },
      mono,
      h('span', { class: 'service-name' }, service),
      h('span', { class: 'service-check', 'aria-hidden': 'true' }, icon('check', 13)));
    b.addEventListener('click', () => {
      if (picked.has(service)) picked.delete(service); else picked.add(service);
      b.setAttribute('aria-pressed', String(picked.has(service)));
    });
    return b;
  }
  const paint = (choices) => { clear(grid); choices.forEach((c) => grid.append(tile(c))); };
  paint(initialChoices([...picked]));
  if (ctx.loadChoices) {
    ctx.loadChoices([...picked]).then((choices) => {
      if (sheet.el.isConnected && choices && choices.length) paint(choices);
    }).catch(() => { /* keep the common list */ });
  }

  const only = toggle('Only show what I can stream', onlyHint(streamOnly), streamOnly, (v) => {
    streamOnly = v;
    only.querySelector('.small').textContent = onlyHint(v);
  });

  const done = h('button', { type: 'button', class: 'btn btn-primary grow' }, 'Done');
  done.addEventListener('click', () => {
    ctx.onDone({ services: [...picked], streamOnly });
    sheet.close();
  });

  append(sheet.body, [
    h('div', { class: 'sheet-head' }, h('h1', { class: 'page-title' }, 'Your services'), closeButton(sheet)),
    h('div', { class: 'page-scroll services-body' },
      h('p', { class: 'lede' }, 'Pick what you pay for. Binger lifts titles on these, and can hide everything else.'),
      grid,
      h('div', { class: 'panel' }, only),
      h('p', { class: 'small muted' },
        `Films and TV: what's included with a subscription in ${ctx.regionName || 'your region'}, from JustWatch via TMDB. `
        + 'Rent and buy don’t count. Anime: AniList’s official streaming links, which aren’t per country.'),
      ctx.hasKey ? null : h('p', { class: 'small muted' }, 'Add a TMDB key in Settings to see every service in your region, with logos.')),
    h('div', { class: 'sheet-footer' }, done)]);
  sheet.focusFirst();
  return sheet;
}

// "Netflix, BBC iPlayer and 2 more" / "None picked yet".
export function servicesSummary(services) {
  if (!services || !services.length) return 'None picked yet';
  const more = services.length > 2 ? ` and ${services.length - 2} more` : '';
  return services.slice(0, 2).join(', ') + more;
}
