// "Seen it": rate (half stars), tag how it felt (in groups, as deep as you
// like), rate the parts if you want to, write a few words, pick the date.
// Also used to edit or delete an existing diary entry.

import { h, icon, KIND_NAME, RATING_WORDS, poster } from './dom.js';
import { openSheet, closeButton } from './sheet.js';
import { TAG_GROUPS, ASPECTS, AGES_AGO } from '../state/library.js';

export function steerText(rating, title) {
  if (rating == null) return 'Your rating is the strongest signal Binger has.';
  if (rating >= 4) {
    const maker = (title.crew || []).find((c) => c.job === 'Director' || c.job === 'Creator');
    return `Binger will look for more like this${maker ? `, including more from ${maker.name}` : ''}.`;
  }
  if (rating >= 3) return 'Noted. A middling score barely moves your taste.';
  return 'Binger will steer away from titles like this.';
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function openRate(title, { watch = null, onSave, onSkip = null, onDelete = null, onCancel = null } = {}) {
  let saved = false;
  const sheet = openSheet({
    label: watch && watch.setup ? `Review ${title.title}` : watch ? `Edit diary entry: ${title.title}` : `Rate ${title.title}`,
    variant: 'bottom',
    className: 'rate',
    onClose: () => { if (!saved && onCancel) onCancel(); },
  });
  let rating = watch ? watch.rating : null;
  const tags = new Set(watch ? watch.tags : []);

  const word = h('div', { class: 'rating-word' });
  const steer = h('p', { class: 'steer small muted' });
  const starBtns = [1, 2, 3, 4, 5].map((n) => h('button', {
    type: 'button', class: 'star', 'aria-label': `${n} star${n > 1 ? 's' : ''}`,
    onClick: () => {
      // Tap a star to set it; tap it again for a half star.
      rating = rating === n ? n - 0.5 : rating === n - 0.5 ? n : n;
      paint();
    },
  }, starSvg()));
  const stars = h('div', { class: 'stars-input', role: 'group', 'aria-label': 'Your rating. Tap a star twice for a half star.' }, starBtns);
  stars.addEventListener('keydown', (e) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.5 : 0;
    if (!delta) return;
    e.preventDefault();
    rating = Math.max(0.5, Math.min(5, (rating || 0) + delta));
    paint();
  });

  function paint() {
    starBtns.forEach((b, i) => {
      const n = i + 1;
      const fill = rating == null ? 0 : rating >= n ? 1 : rating >= n - 0.5 ? 0.5 : 0;
      b.style.setProperty('--fill', fill);
      b.setAttribute('aria-pressed', String(fill > 0));
    });
    word.textContent = rating == null ? 'Tap to rate' : `${String(rating).replace('.5', '½')} · ${RATING_WORDS[rating]}`;
    steer.textContent = steerText(rating, title);
    save.disabled = false;
  }

  const tagGroups = TAG_GROUPS.map(([name, list], i) => {
    const id = `tags-${i}`;
    return h('div', { class: 'tag-group' },
      h('div', { class: 'tag-group-name small muted', id }, name),
      h('div', { class: 'pill-wrap', role: 'group', 'aria-labelledby': id }, list.map((tag) => {
        const b = h('button', { type: 'button', class: 'pill', 'aria-pressed': String(tags.has(tag)) }, tag);
        b.addEventListener('click', () => {
          if (tags.has(tag)) tags.delete(tag); else tags.add(tag);
          b.setAttribute('aria-pressed', String(tags.has(tag)));
        });
        return b;
      })));
  });

  // The parts, each loved / fine / weak; tap the same one again to clear it.
  const aspects = { ...((watch && watch.aspects) || {}) };
  const PART = [[1, 'Loved'], [0, 'Fine'], [-1, 'Weak']];
  const partRows = ASPECTS.map(([key, label]) => {
    const btns = PART.map(([v, word]) => h('button', {
      type: 'button', class: 'pill pill-sm', 'aria-pressed': String(aspects[key] === v), 'aria-label': `${label}: ${word}`,
      onClick: () => {
        if (aspects[key] === v) delete aspects[key]; else aspects[key] = v;
        btns.forEach((b, i) => b.setAttribute('aria-pressed', String(aspects[key] === PART[i][0])));
      },
    }, word));
    return h('div', { class: 'part-row' }, h('span', { class: 'part-label' }, label), h('div', { class: 'part-btns', role: 'group', 'aria-label': label }, btns));
  });
  const parts = h('details', { class: 'parts' },
    h('summary', null, 'Go deeper: rate the parts'),
    h('div', { class: 'part-rows' }, partRows));
  parts.open = Object.keys(aspects).length > 0;
  const review = h('textarea', { id: 'review', rows: '3', maxlength: '4000', placeholder: 'What stuck with you?' });
  review.value = watch ? watch.review || '' : '';
  // When: today, an exact day, or roughly (this year, a year, ages ago), for
  // long-time favourites nobody remembers the date of.
  const thisYear = new Date().getFullYear();
  let when = !watch ? 'today'
    : watch.when === 'ages' ? 'ages'
      : watch.when === 'year' ? (Number(String(watch.date).slice(0, 4)) === thisYear ? 'thisyear' : 'year')
        : watch.date === todayIso() ? 'today' : 'date';
  const date = h('input', { id: 'watch-date', type: 'date', max: todayIso(), 'aria-label': 'The day you watched it', value: watch && !watch.when ? watch.date : todayIso() });
  const year = h('select', { id: 'watch-year', 'aria-label': 'The year you watched it' },
    Array.from({ length: thisYear - 1949 }, (_, i) => String(thisYear - i)).map((y) => h('option', { value: y }, y)));
  year.value = watch && watch.when === 'year' ? String(watch.date).slice(0, 4) : String(thisYear - 1);
  const WHEN = [['today', 'Today'], ['date', 'On a date'], ['thisyear', 'This year'], ['year', 'In a year'], ['ages', 'Ages ago']];
  const whenBtns = WHEN.map(([key, label]) => h('button', {
    type: 'button', class: 'pill', 'aria-pressed': String(when === key),
    onClick: () => { when = key; paintWhen(); if (key === 'date') date.focus(); else if (key === 'year') year.focus(); },
  }, label));
  function paintWhen() {
    whenBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(WHEN[i][0] === when)));
    date.hidden = when !== 'date';
    year.hidden = when !== 'year';
  }
  const picked = () => (when === 'today' ? { date: todayIso(), when: null }
    : when === 'date' ? { date: date.value || todayIso(), when: null }
      : when === 'thisyear' ? { date: `${thisYear}-01-01`, when: 'year' }
        : when === 'year' ? { date: `${year.value}-01-01`, when: 'year' }
          : { date: AGES_AGO, when: 'ages' });

  // A first-run pick (watch.setup) is reviewed for the first time here.
  const save = h('button', { type: 'button', class: 'btn btn-primary grow' }, watch && watch.setup ? 'Save review' : watch ? 'Save changes' : 'Save to diary');
  save.addEventListener('click', () => {
    saved = true;
    onSave({ rating, tags: [...tags], aspects: { ...aspects }, review: review.value.trim(), ...picked() });
    sheet.close();
  });

  sheet.body.append(
    h('div', { class: 'grabber', 'aria-hidden': 'true' }),
    h('div', { class: 'rate-head' },
      poster(title, 'thumb thumb-sm'),
      h('div', { class: 'grow' },
        h('div', { class: 'eyebrow sky' }, watch && watch.setup ? 'Review your pick' : watch ? 'Edit diary entry' : 'Seen it'),
        h('h2', { class: 'sheet-title' }, title.title),
        h('div', { class: 'small muted' }, [KIND_NAME[title.kind], title.year].filter(Boolean).join(' · '))),
      closeButton(sheet)),
    h('div', { class: 'rate-stars' }, stars, word, steer),
    h('div', { class: 'field' }, h('div', { class: 'eyebrow' }, 'How did it feel?'), tagGroups, parts),
    h('div', { class: 'field' }, h('label', { class: 'eyebrow', for: 'review' }, 'Your thoughts (optional)'), review),
    h('div', { class: 'field' },
      h('div', { class: 'eyebrow', id: 'when-label' }, 'When did you watch it?'),
      h('div', { class: 'pill-wrap', role: 'group', 'aria-labelledby': 'when-label' }, whenBtns),
      date, year),
    h('div', { class: 'sheet-footer' },
      onDelete ? h('button', { type: 'button', class: 'btn btn-quiet', onClick: () => { saved = true; onDelete(); sheet.close(); } }, icon('trash', 18), 'Delete') : null,
      onSkip ? h('button', { type: 'button', class: 'btn btn-quiet', onClick: () => { saved = true; onSkip(); sheet.close(); } }, 'Skip rating') : null,
      save));
  paint();
  paintWhen();
  sheet.focusFirst();
  return sheet;
}

function starSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const d = 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z';
  const outline = document.createElementNS(ns, 'path');
  outline.setAttribute('d', d);
  outline.setAttribute('class', 'star-outline');
  const fill = document.createElementNS(ns, 'path');
  fill.setAttribute('d', d);
  fill.setAttribute('class', 'star-fill');
  svg.append(outline, fill);
  return svg;
}
