// A person's work, best for you first: tap anyone in a cast row, a director,
// or a chip on Taste. Design: docs/design/canvas/Person.dc.html.
// TMDB has people in films and TV; AniList has voice actors and anime staff.

import { h, append, clear, icon, KIND_NAME, poster, starsText, initials, safeImg } from './dom.js';
import { openSheet } from './sheet.js';
import { rankForYou, explain, latestRating } from '../engine/index.js';
import { matchPercent } from './card.js';

const PILL_LABEL = { film: 'Films', tv: 'TV', anime: 'Anime' };
// Crew jobs read as themselves ("Director"); anything else is a character ("as Laurie").
const JOB = /director|creator|writer|screenplay|teleplay|story|novel|characters|composer|music|producer|design|animation|script|storyboard|photography/i;

export function roleText(role) {
  if (!role) return null;
  return JOB.test(role) ? role : `as ${role}`;
}

// "In Little Women, which you loved" (or null if you don't know them yet).
export function knownLine(personId, profile) {
  const rec = profile && profile.people && profile.people.get(personId);
  const t = rec && rec.titles[0];
  if (!t) return null;
  if (t.status === 'watched') return t.rating >= 4 ? `In ${t.title}, which you loved` : `In ${t.title}, which you watched`;
  return `In ${t.title}, on your watchlist`;
}

// The small line under a row: your status if it's in your library, else the match and why.
export function rowNote(ranked, item, profile) {
  if (item && item.status === 'watched') {
    const r = latestRating(item);
    return { text: r != null ? `${starsText(r)} in your diary` : 'In your diary', mine: true };
  }
  if (item && item.status === 'want') return { text: 'On your watchlist', mine: true };
  const why = explain(ranked.title, ranked, profile, { max: 1 })[0];
  return { text: `${matchPercent(ranked.score)}% match${why ? ` · ${why.text}` : ''}`, mine: false };
}

export function openPerson(stub, ctx) {
  const sheet = openSheet({ label: stub.name || 'Person', variant: 'full', className: 'person-sheet' });
  const known = knownLine(stub.id, ctx.profile);
  let data = null;
  let kind = 'all';

  const head = h('header', { class: 'person-head' });
  const tools = h('div', { class: 'person-tools' });
  const list = h('ul', { class: 'rows', 'aria-live': 'polite' });

  function paintHead(person, count) {
    const photo = person.photo || stub.photo;
    const av = h('span', { class: `avatar avatar-xl${known ? ' avatar-known' : ''}`, 'aria-hidden': 'true' });
    if (photo) av.append(safeImg(photo, {}, () => av.append(initials(person.name || stub.name))));
    else av.append(initials(person.name || stub.name));
    clear(head);
    append(head, [av, h('div', { class: 'person-text' },
      h('h1', { class: 'detail-title' }, person.name || stub.name),
      h('div', { class: 'small muted' }, [person.known, count != null ? `${count} ${count === 1 ? 'title' : 'films and shows'}` : null].filter(Boolean).join(' · ')),
      known ? h('div', { class: 'small accent strong' }, known) : null)]);
  }

  function paintRows() {
    clear(list);
    const ranked = rankForYou(data.credits, ctx.profile, { services: ctx.services })
      .filter((r) => kind === 'all' || r.title.kind === kind);
    if (!ranked.length) { list.append(h('li', { class: 'muted' }, 'Nothing to show here.')); return; }
    for (const r of ranked) {
      const t = r.title;
      const item = ctx.itemOf(t.id);
      const note = rowNote(r, item, ctx.profile);
      list.append(h('li', { class: 'row' },
        h('button', { type: 'button', class: 'row-main', onClick: () => ctx.onOpen(t) },
          poster(t),
          h('span', { class: 'row-text' },
            h('span', { class: 'row-title' }, t.title),
            h('span', { class: 'small muted' }, [KIND_NAME[t.kind], t.year, roleText(t.role)].filter(Boolean).join(' · ')),
            h('span', { class: `small row-note${note.mine ? ' accent' : ''}` }, note.text))),
        item ? null : h('div', { class: 'row-actions' },
          h('button', { type: 'button', class: 'icon-btn sky', 'aria-label': `Seen ${t.title}: rate it`, onClick: () => ctx.onSeen(t) }, icon('eye', 20)),
          h('button', { type: 'button', class: 'icon-btn accent', 'aria-label': `Add ${t.title} to watchlist`, onClick: (e) => {
            ctx.onWant(t);
            e.currentTarget.closest('.row-actions').replaceChildren(h('span', { class: 'icon-btn accent', role: 'img', 'aria-label': 'Added' }, icon('check', 20)));
          } }, icon('bookmark', 20)))));
    }
  }

  function paintTools() {
    clear(tools);
    const kinds = [...new Set(data.credits.map((t) => t.kind))];
    if (kinds.length > 1) {
      const pills = h('div', { class: 'pills', role: 'group', 'aria-label': 'Show' });
      for (const k of ['all', ...['film', 'tv', 'anime'].filter((x) => kinds.includes(x))]) {
        const b = h('button', { type: 'button', class: 'pill', 'aria-pressed': String(kind === k) }, k === 'all' ? 'All' : PILL_LABEL[k]);
        b.addEventListener('click', () => {
          kind = k;
          for (const other of pills.children) other.setAttribute('aria-pressed', String(other === b));
          paintRows();
        });
        pills.append(b);
      }
      tools.append(pills);
    }
    tools.append(h('h2', { class: 'eyebrow' }, 'Best for you first'));
  }

  paintHead({ name: stub.name, photo: stub.photo, known: null }, null);
  list.append(h('li', { class: 'muted', role: 'status' }, 'Loading their work…'));
  append(sheet.body, [
    h('div', { class: 'person-back' }, h('button', { type: 'button', class: 'icon-btn on-surface', 'aria-label': 'Back', onClick: () => sheet.close() }, icon('back', 20))),
    head,
    h('div', { class: 'page-scroll' }, tools, list,
      h('p', { class: 'small muted person-foot' }, 'Lead roles rank above cameos. Data: TMDB (people in films and TV) or AniList (voice actors and anime staff).'))]);
  sheet.focusFirst();

  if (String(stub.id).startsWith('tmdb:') && !ctx.hasKey) {
    clear(list).append(h('li', { class: 'muted' }, 'Add a TMDB key in Settings to see their films and TV.'));
    return sheet;
  }
  ctx.load(stub.id).then((result) => {
    if (!sheet.el.isConnected) return;
    if (!result) { clear(list).append(h('li', { class: 'muted' }, 'Couldn’t find their work.')); return; }
    data = result;
    paintHead(result.person, result.credits.length);
    paintTools();
    paintRows();
  }).catch(() => {
    if (sheet.el.isConnected) clear(list).append(h('li', { class: 'muted' }, 'Couldn’t load their work. Check your connection and try again.'));
  });
  return sheet;
}
