// Full detail for one title: trailer clip, why it was picked, synopsis, cast
// (people you know highlighted), where to watch, and your own history with it.

import { h, icon, clear, KIND_NAME, metaLine, publicScore, avatar, starsText, shortDate, titleCase, safeImg } from './dom.js';
import { openSheet } from './sheet.js';
import { trailerPlayer, fullTrailerUrl } from './trailer.js';
import { knownFrom } from './card.js';
import { canonicalService } from '../sources/services.js';

export function openDetail(initial, ctx) {
  const sheet = openSheet({ label: initial.title, variant: 'full', className: 'detail' });
  let title = initial;

  function render() {
    clear(sheet.body);
    sheet.body.append(media(title, ctx, sheet), body(title, ctx), footer(title, ctx, sheet));
  }
  render();
  sheet.focusFirst();

  if (ctx.loadDetails) {
    ctx.loadDetails(title).then((full) => {
      if (!full || !sheet.el.isConnected) return;
      title = { ...title, ...full, via: title.via };
      const scroll = sheet.body.scrollTop;
      render();
      sheet.body.scrollTop = scroll;
    }).catch(() => {});
  }
  return sheet;
}

function media(t, ctx, sheet) {
  const box = h('div', { class: 'detail-media', style: { '--art': t.color || null } });
  const showStill = () => {
    clear(box);
    const still = t.backdrop || t.poster;
    if (still) box.append(safeImg(still));
    if (t.trailer) {
      box.append(h('button', {
        type: 'button', class: 'play-btn', 'aria-label': 'Play trailer clip',
        onClick: () => { clear(box); box.append(trailerPlayer(t.trailer, { seconds: ctx.settings.clipSeconds, autoplay: true })); box.append(back()); },
      }, icon('play', 26)));
    }
    box.append(back());
  };
  const back = () => h('button', { type: 'button', class: 'icon-btn on-media', 'aria-label': 'Close', onClick: () => sheet.close() }, icon('back', 20));
  if (t.trailer && ctx.settings.autoplayTrailers) {
    box.append(trailerPlayer(t.trailer, { seconds: ctx.settings.clipSeconds, autoplay: true }), back());
  } else {
    showStill();
  }
  return box;
}

function crewLine(t) {
  const by = (job) => (t.crew || []).filter((c) => c.job === job).map((c) => c.name);
  const bits = [];
  const directors = by('Director');
  const creators = by('Creator');
  if (t.kind === 'anime' && t.studios && t.studios.length) bits.push(`Studio ${t.studios.map(titleCase).join(', ')}`);
  if (creators.length) bits.push(`Created by ${creators.join(', ')}`);
  if (directors.length) bits.push(`Directed by ${[...new Set(directors)].join(', ')}`);
  if (t.networks && t.networks.length) bits.push(t.networks.join(', '));
  return bits.join(' · ');
}

function body(t, ctx) {
  const format = t.kind === 'anime' && t.format && t.format !== 'TV' ? t.formatLabel : null;
  const facts = [format, metaLine(t, { genres: 0 }), t.certification, publicScore(t)].filter(Boolean).join(' · ');
  const chips = [...(t.genres || []), ...(t.keywords || []).slice(0, 4)];
  const reasons = ctx.reasons || [];
  const people = [...(t.cast || []).slice(0, 8)];

  return h('div', { class: 'detail-body' },
    h('div', { class: 'detail-head' },
      h('div', { class: 'row-gap' }, h('span', { class: `badge badge-${t.kind}` }, KIND_NAME[t.kind]), h('span', { class: 'muted small' }, facts)),
      h('h1', { class: 'detail-title' }, t.title),
      t.tagline ? h('p', { class: 'tagline' }, t.tagline) : null,
      crewLine(t) ? h('p', { class: 'muted small' }, crewLine(t)) : null),
    chips.length ? h('ul', { class: 'chips', 'aria-label': 'Genres and themes' }, chips.map((c) => h('li', { class: 'chip' }, c))) : null,
    reasons.length ? h('section', { class: 'why', 'aria-label': 'Why Binger picked this' },
      h('h2', { class: 'eyebrow accent' }, 'Why Binger picked this'),
      h('ul', null, reasons.map((r) => h('li', null, r.text)))) : null,
    t.overview ? h('p', { class: 'overview' }, t.overview) : null,
    people.length ? h('section', { 'aria-label': t.kind === 'anime' ? 'Voice cast' : 'Cast' },
      h('h2', { class: 'eyebrow' }, t.kind === 'anime' ? `Voice cast${ctx.settings.voiceLanguage === 'ENGLISH' ? ' (English dub)' : ''}` : 'Cast'),
      h('ul', { class: 'cast-row' }, people.map((p) => {
        const known = knownFrom(p, ctx.profile, t.id);
        return h('li', { class: 'cast-item' },
          avatar(p, 'lg', !!known),
          h('span', { class: 'cast-name' }, p.name),
          h('span', { class: `cast-role${known ? ' is-known' : ''}` }, known || p.character || ''));
      }))) : null,
    whereToWatch(t, ctx),
    history(t, ctx),
    h('p', { class: 'small muted links' },
      t.trailer ? h('a', { href: fullTrailerUrl(t.trailer), target: '_blank', rel: 'noopener' }, 'Full trailer on YouTube', icon('external', 14)) : null,
      t.url ? h('a', { href: t.url, target: '_blank', rel: 'noopener' }, t.source === 'anilist' ? 'AniList page' : 'TMDB page', icon('external', 14)) : null));
}

function whereToWatch(t, ctx) {
  const mine = ctx.settings.services || [];
  if (t.source === 'anilist') {
    const links = t.watchLinks || [];
    return h('section', { class: 'where' }, h('h2', { class: 'eyebrow' }, 'Where to watch'),
      links.length
        ? h('ul', { class: 'providers' }, links.map((l) => h('li', null,
          h('a', { class: `provider provider-link${mine.includes(l.name) ? ' provider-yours' : ''}`, href: l.url, target: '_blank', rel: 'noopener' },
            h('span', null, l.name), mine.includes(l.name) ? h('span', { class: 'sr-only' }, ' (one of your services)') : null))))
        : h('p', { class: 'small muted' }, 'No official streaming links listed on AniList yet.'),
      links.length ? h('p', { class: 'small muted' }, 'Official links from AniList. They aren\u2019t per country, so check yours carries it.') : null);
  }
  if (!t.detailed) return null;
  const region = ctx.settings.region;
  const p = t.providers;
  const rows = p ? [['Stream', p.stream], ['Free', p.free], ['Rent', p.rent], ['Buy', p.buy]].filter(([, list]) => list && list.length) : [];
  return h('section', { class: 'where' },
    h('h2', { class: 'eyebrow' }, `Where to watch · ${region}`),
    rows.length
      ? h('div', { class: 'provider-rows' }, rows.map(([label, list]) => h('div', { class: 'provider-row' },
        h('span', { class: 'provider-label' }, label),
        h('ul', { class: 'providers' }, list.slice(0, 6).map((x) => {
          const yours = label !== 'Rent' && label !== 'Buy' && mine.includes(canonicalService(x.name));
          return h('li', { class: `provider${yours ? ' provider-yours' : ''}`, title: x.name },
            x.logo ? h('img', { src: x.logo, alt: '', loading: 'lazy' }) : null, h('span', null, x.name),
            yours ? h('span', { class: 'sr-only' }, ' (one of your services)') : null);
        })))))
      : h('p', { class: 'small muted' }, `Not streaming in ${region} right now, as far as TMDB knows.`),
    rows.length && p.link ? h('p', { class: 'small muted' }, 'Availability data from ', h('a', { href: p.link, target: '_blank', rel: 'noopener' }, 'JustWatch via TMDB'), '.') : null);
}

function history(t, ctx) {
  const item = ctx.item;
  if (!item || !item.watches || !item.watches.length) return null;
  const watches = [...item.watches].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return h('section', { class: 'history' },
    h('h2', { class: 'eyebrow' }, 'Your diary'),
    h('ul', { class: 'history-list' }, watches.map((w) => h('li', null,
      h('button', { type: 'button', class: 'history-row', onClick: () => ctx.onEditWatch && ctx.onEditWatch(item, w) },
        h('span', { class: 'stars', 'aria-label': w.rating ? `${w.rating} out of 5 stars` : 'Not rated' }, w.rating ? starsText(w.rating) : 'No rating'),
        h('span', { class: 'muted small' }, shortDate(w.date)),
        w.review ? h('span', { class: 'history-review' }, w.review) : null,
        w.tags && w.tags.length ? h('span', { class: 'muted small' }, w.tags.join(' · ')) : null)))));
}

function footer(t, ctx, sheet) {
  const status = ctx.item ? ctx.item.status : null;
  const act = (fn) => () => { sheet.close(); fn(t); };
  const btns = [];
  if (status === 'watched') {
    btns.push(h('button', { type: 'button', class: 'btn btn-primary grow', onClick: act(ctx.onSeen) }, 'Log a rewatch'));
  } else if (status === 'want') {
    btns.push(h('button', { type: 'button', class: 'btn btn-quiet grow', onClick: act(ctx.onRemove) }, 'Remove'));
    btns.push(h('button', { type: 'button', class: 'btn btn-seen grow', onClick: act(ctx.onSeen) }, 'Watched it'));
  } else {
    if (ctx.onPass) btns.push(h('button', { type: 'button', class: 'btn btn-quiet grow', onClick: act(ctx.onPass) }, 'Pass'));
    btns.push(h('button', { type: 'button', class: 'btn btn-seen grow', onClick: act(ctx.onSeen) }, 'Seen it'));
    btns.push(h('button', { type: 'button', class: 'btn btn-primary grow-2', onClick: act(ctx.onWant) }, 'Want to watch'));
  }
  return h('div', { class: 'sheet-footer' }, btns);
}
