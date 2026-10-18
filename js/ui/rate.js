// "Seen it": rate (half stars), tag how it felt, write a few words, pick the
// date. Also used to edit or delete an existing diary entry.

import { h, icon, KIND_NAME, RATING_WORDS, poster } from './dom.js';
import { openSheet, closeButton } from './sheet.js';
import { TAGS } from '../state/library.js';

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
    label: watch ? `Edit diary entry: ${title.title}` : `Rate ${title.title}`,
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

  const tagEls = TAGS.map((tag) => {
    const b = h('button', { type: 'button', class: 'pill', 'aria-pressed': String(tags.has(tag)) }, tag);
    b.addEventListener('click', () => {
      if (tags.has(tag)) tags.delete(tag); else tags.add(tag);
      b.setAttribute('aria-pressed', String(tags.has(tag)));
    });
    return b;
  });
  const review = h('textarea', { id: 'review', rows: '3', maxlength: '4000', placeholder: 'What stuck with you?' });
  review.value = watch ? watch.review || '' : '';
  const date = h('input', { id: 'watch-date', type: 'date', max: todayIso(), value: watch ? watch.date : todayIso() });

  const save = h('button', { type: 'button', class: 'btn btn-primary grow' }, watch ? 'Save changes' : 'Save to diary');
  save.addEventListener('click', () => {
    saved = true;
    onSave({ rating, tags: [...tags], review: review.value.trim(), date: date.value || todayIso() });
    sheet.close();
  });

  sheet.body.append(
    h('div', { class: 'grabber', 'aria-hidden': 'true' }),
    h('div', { class: 'rate-head' },
      poster(title, 'thumb thumb-sm'),
      h('div', { class: 'grow' },
        h('div', { class: 'eyebrow sky' }, watch ? 'Edit diary entry' : 'Seen it'),
        h('h2', { class: 'sheet-title' }, title.title),
        h('div', { class: 'small muted' }, [KIND_NAME[title.kind], title.year].filter(Boolean).join(' · '))),
      closeButton(sheet)),
    h('div', { class: 'rate-stars' }, stars, word, steer),
    h('div', { class: 'field' }, h('div', { class: 'eyebrow' }, 'How did it feel?'), h('div', { class: 'pill-wrap' }, tagEls)),
    h('div', { class: 'field' }, h('label', { class: 'eyebrow', for: 'review' }, 'Your thoughts (optional)'), review),
    h('div', { class: 'field field-inline' }, h('label', { class: 'eyebrow', for: 'watch-date' }, 'Watched on'), date),
    h('div', { class: 'sheet-footer' },
      onDelete ? h('button', { type: 'button', class: 'btn btn-quiet', onClick: () => { saved = true; onDelete(); sheet.close(); } }, icon('trash', 18), 'Delete') : null,
      onSkip ? h('button', { type: 'button', class: 'btn btn-quiet', onClick: () => { saved = true; onSkip(); sheet.close(); } }, 'Skip rating') : null,
      save));
  paint();
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
