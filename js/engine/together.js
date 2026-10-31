// Watch together (Phase 3, "match with Dave"): one deck for two or more
// people. Each title is scored for everyone, and the scores are blended so
// the person who'd like it least counts most: a film one of you loves and the
// other would hate sinks, one you'd both enjoy rises. Pure, like the rest of
// the engine; the people's libraries come in from the app.

import { scoreTitle } from './score.js';

// How much the least keen person counts, against the average.
export const LEAST_KEEN_WEIGHT = 0.6;
// Something already on a partner's watchlist: they've said yes, so it goes near the top.
export const PARTNER_WANT_BOOST = 0.3;

export function blend(scores) {
  if (!scores.length) return 0;
  const min = Math.min(...scores);
  const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
  return LEAST_KEEN_WEIGHT * min + (1 - LEAST_KEEN_WEIGHT) * mean;
}

// partner: { id, name, profile, items } (items: their library's items).
// Everything either of you has watched or passed stays out of the deck;
// what they want to watch stays in, lifted.
export function partnerExclusions(partners) {
  const out = new Set();
  for (const p of partners) {
    for (const [id, it] of Object.entries(p.items || {})) if (it.status === 'watched' || it.status === 'passed') out.add(id);
  }
  return out;
}

export function partnerWants(partner) {
  return Object.values(partner.items || {}).filter((it) => it.status === 'want' && it.title);
}

// Your score for a title, plus each partner's, blended. Keeps your own
// components (contributions etc.) so your reasons still explain the card.
export function togetherScore(title, mine, partners, opts = {}) {
  const theirs = partners.map((p) => ({ partner: p, scored: scoreTitle(title, p.profile, opts) }));
  const wantedBy = partners.filter((p) => p.items && p.items[title.id] && p.items[title.id].status === 'want');
  const score = blend([mine.score, ...theirs.map((x) => x.scored.score)]) + (wantedBy.length ? PARTNER_WANT_BOOST : 0);
  const affinity = blend([mine.affinity, ...theirs.map((x) => x.scored.affinity)]);
  return { ...mine, score, affinity, together: theirs, wantedBy: wantedBy.map((p) => p.name) };
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// One line for a partner, by name, so it reads right whoever they are:
// "On Dave's watchlist", "Dave loves Fantasy", "Dave rated Heat highly".
export function partnerReason(title, scored, partner) {
  const name = partner.name || 'They';
  if (partner.items && partner.items[title.id] && partner.items[title.id].status === 'want') {
    return { kind: 'together', text: `On ${name}’s watchlist` };
  }
  for (const c of scored.contributions || []) {
    if (c.v < 0.015 || c.a < 0.3) continue;
    const ev = partner.profile.evidence.get(c.key);
    const from = ev && ev.best && ev.best.title !== title.title ? ev.best.title : null;
    if ((c.group === 'creator' || c.group === 'cast' || c.group === 'studio') && from) return { kind: 'together', text: `${name} rated ${from} highly` };
    if (c.group === 'genre' && c.a >= 0.35) return { kind: 'together', text: `${name} loves ${c.label}` };
    if (c.group === 'keyword' && c.a >= 0.35) return { kind: 'together', text: `${cap(c.label)}: a theme ${name} rates highly` };
  }
  return null;
}

// The card's reasons in together mode: a partner's yes first, then your best
// reason, then theirs, three at most.
export function togetherReasons(title, scored, myReasons, { max = 3 } = {}) {
  const theirs = (scored.together || []).map((x) => partnerReason(title, x.scored, x.partner)).filter(Boolean);
  const wanted = theirs.filter((r) => r.text.startsWith('On '));
  const other = theirs.filter((r) => !r.text.startsWith('On '));
  const out = [...wanted, ...myReasons.slice(0, 1), ...other, ...myReasons.slice(1)];
  const seen = new Set();
  return out.filter((r) => r && !seen.has(r.text) && seen.add(r.text)).slice(0, max);
}
