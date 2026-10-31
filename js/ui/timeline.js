// "How your taste has moved" and "How you like to watch" on the Taste tab
// (Phase 2 step 5; design: TasteTime.dc.html, chart spec in docs/DESIGN.md).
// Small multiples on one shared scale: a grey line per genre, an amber dot for
// this month, a zero baseline, and the trend in words. Tap a row for its
// month-by-month numbers; the same numbers sit in a table for screen readers.

import { h, icon } from './dom.js';
import { topFeatures } from '../engine/index.js';

const W = 150;
const H = 30;
const PAD = 5; // room for the end dot
const SVG = 'http://www.w3.org/2000/svg';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TREND = { rising: '▲ Rising', steady: 'Steady', fading: '▼ Fading' };

const monthOf = (ms) => MONTHS[new Date(ms).getUTCMonth()]; // snapshots are UTC month ends
const pct = (v) => Math.round(v * 100);

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function sparkline(values, lo, hi) {
  const x = (i) => PAD + (i * (W - 2 * PAD)) / (values.length - 1);
  const y = (v) => PAD + (H - 2 * PAD) * (1 - (v - lo) / (hi - lo));
  const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'spark', 'aria-hidden': 'true' });
  svg.append(svgEl('line', { x1: PAD, x2: W - PAD, y1: y(0), y2: y(0), class: 'spark-zero' }));
  const pts = values.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
  if (pts.length > 1) svg.append(svgEl('polyline', { points: pts.join(' '), class: 'spark-line' }));
  const last = values[values.length - 1];
  if (last != null) svg.append(svgEl('circle', { cx: x(values.length - 1), cy: y(last), r: 4, class: 'spark-dot' }));
  return svg;
}

export function tasteMoved(timeline) {
  if (!timeline || !timeline.enough || !timeline.series.length) return null;
  const all = timeline.series.flatMap((s) => s.values).filter((v) => v != null);
  const lo = Math.min(-0.2, ...all);
  const hi = Math.max(0.6, ...all);
  const months = timeline.at.map(monthOf);
  const readout = (s) => s.values.map((v, i) => (v == null ? null : `${months[i]} ${pct(v)}`)).filter(Boolean).join(' · ');

  const rows = timeline.series.map((s) => {
    const known = s.values.filter((v) => v != null);
    const label = `${s.label}: ${s.trend}, from ${pct(known[0] || 0)} in ${months[s.values.findIndex((v) => v != null)]} to ${pct(known[known.length - 1] || 0)} in ${months[months.length - 1]}`;
    const detail = h('span', { class: 'trend-readout small muted', hidden: true }, readout(s));
    const btn = h('button', { type: 'button', class: 'trend-row', 'aria-expanded': 'false', 'aria-label': label },
      h('span', { class: 'trend-line' },
        h('span', { class: 'trend-name' }, s.label),
        sparkline(s.values, lo, hi),
        h('span', { class: `trend-word trend-${s.trend}` }, TREND[s.trend])),
      detail);
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      detail.hidden = !open;
    });
    return h('li', null, btn);
  });

  const table = h('table', { class: 'sr-only' },
    h('caption', null, 'How strongly each genre pulls you in, by month (0 is neutral, 100 is strongest)'),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Genre'), months.map((m) => h('th', { scope: 'col' }, m)))),
    h('tbody', null, timeline.series.map((s) => h('tr', null, h('th', { scope: 'row' }, s.label), s.values.map((v) => h('td', null, v == null ? '–' : String(pct(v))))))));

  return h('section', { class: 'taste-section', 'aria-labelledby': 'moved-title' },
    h('div', { class: 'row-between' },
      h('h2', { id: 'moved-title', class: 'eyebrow' }, 'How your taste has moved'),
      h('span', { class: 'small muted' }, `Last ${months.length} months`)),
    h('ul', { class: 'trends' }, rows),
    h('div', { class: 'trend-axis', 'aria-hidden': 'true' }, h('span', null, months[0]), h('span', null, months[months.length - 1])),
    table);
}

// Sweet spot (length), feeling-tag counts, and a plain line on what "Slow"
// and "Overhyped" are doing to your suggestions.
export function howYouWatch(profile) {
  const st = profile.stats;
  const sweet = topFeatures(profile, 'length', { limit: 1 })[0] || null;
  const tags = Object.entries(st.tags || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const lines = [];
  const slow = (st.tags || {}).Slow || 0;
  if (slow) {
    const longs = ['n:film-long', 'n:series-long'].filter((k) => (profile.aff.get(k) || 0) < 0);
    if (longs.length) {
      const what = longs.length === 2 ? 'long films and long series' : longs[0] === 'n:film-long' ? 'long films' : 'long series';
      lines.push(`You've called ${times(slow)} Slow, so ${what} count against them a little.`);
    }
  }
  const hype = (st.tags || {}).Overhyped || 0;
  if (hype && st.hype > 0) lines.push(`You've called ${times(hype)} Overhyped, so "Trending this week" counts for less.`);
  if (!sweet && !tags.length) return null;

  return h('section', { class: 'taste-section', 'aria-labelledby': 'how-title' },
    h('h2', { id: 'how-title', class: 'eyebrow' }, 'How you like to watch'),
    sweet ? h('div', { class: 'row-gap' }, h('span', { class: 'lede' }, 'Sweet spot'), h('span', { class: 'reason' }, icon('star', 14), h('span', null, sweet.label))) : null,
    tags.length ? h('ul', { class: 'chips' }, tags.map(([t, n]) => h('li', { class: 'chip' }, `${t} ×${n}`))) : null,
    lines.length ? h('ul', { class: 'how-lines' }, lines.map((l) => h('li', null, l))) : null);
}

function times(n) {
  return n === 1 ? 'one thing' : `${n} things`;
}
