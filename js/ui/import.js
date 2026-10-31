// "Bring your history": IMDb, Letterboxd and MyAnimeList exports, or an
// AniList username, into your library (reading and matching:
// js/sources/imports.js; what's added: importHistory in js/state/library.js).
// Opened from Settings and from the first-run screen.

import { h, append, icon, clear } from './dom.js';
import { openSheet, closeButton } from './sheet.js';

const n = (x, one, many) => `${x.toLocaleString('en-GB')} ${x === 1 ? one : many}`;

// "412 watched (430 diary entries), 17 added to your watchlist…"
export function importSummary(counts) {
  const bits = [];
  if (counts.watched) bits.push(`${n(counts.watched, 'title', 'titles')} watched${counts.watches !== counts.watched ? ` (${n(counts.watches, 'diary entry', 'diary entries')})` : ''}`);
  else if (counts.watches) bits.push(n(counts.watches, 'new diary entry', 'new diary entries'));
  if (counts.want) bits.push(`${n(counts.want, 'title', 'titles')} added to your watchlist`);
  if (counts.passed) bits.push(`${n(counts.passed, 'dropped title', 'dropped titles')} kept out of your deck`);
  const done = bits.length ? `Done: ${bits.join(', ')}.` : 'Nothing new to add.';
  return counts.skipped ? `${done} ${counts.skipped.toLocaleString('en-GB')} ${counts.skipped === 1 ? 'was' : 'were'} already in your library.` : done;
}

export function openImport(ctx) {
  const sheet = openSheet({ label: 'Bring your history', variant: 'full', className: 'import', onClose: () => ctx.onClose && ctx.onClose(result) });
  let result = null;
  let busy = false;

  const status = h('p', { class: 'small muted import-status', role: 'status', 'aria-live': 'polite' });
  const outcome = h('div', { class: 'import-outcome' });
  const file = h('input', { type: 'file', id: 'history-file', class: 'sr-only', multiple: true, accept: '.csv,.xml,.gz,text/csv,text/xml,application/xml,application/gzip' });
  const user = h('input', { id: 'anilist-user', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'Your AniList username', enterkeyhint: 'go' });
  const userBtn = h('button', { type: 'button', class: 'btn btn-quiet' }, 'Import');
  const controls = [file, user, userBtn];

  const progress = (done, total) => { status.textContent = `Matching ${done.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}…`; };

  async function go(job) {
    if (busy) return;
    busy = true;
    controls.forEach((c) => { c.disabled = true; });
    clear(outcome);
    status.classList.remove('error');
    status.textContent = 'Reading…';
    try {
      const r = await job();
      result = { counts: { ...r.counts }, missed: r.missed };
      status.textContent = importSummary(r.counts);
      append(outcome, [
        r.unknown && r.unknown.length ? h('p', { class: 'small muted' }, `Not an export Binger knows: ${r.unknown.join(', ')}.`) : null,
        r.missed.length ? h('details', { class: 'import-missed' },
          h('summary', { class: 'small' }, `${n(r.missed.length, 'title', 'titles')} couldn’t be found`),
          h('ul', { class: 'small muted' }, r.missed.slice(0, 60).map((label) => h('li', null, label))),
          r.missed.length > 60 ? h('p', { class: 'small muted' }, `…and ${r.missed.length - 60} more.`) : null) : null,
        h('div', { class: 'row-end' },
          r.undo ? h('button', { type: 'button', class: 'btn btn-quiet', onClick: (e) => {
            r.undo();
            result = null;
            e.currentTarget.remove();
            status.textContent = 'Undone: your library is as it was before.';
          } }, 'Undo import') : null,
          h('button', { type: 'button', class: 'btn btn-primary', onClick: () => sheet.close() }, 'Done')),
      ]);
    } catch (err) {
      status.classList.add('error');
      status.textContent = (err && err.message) || 'That didn’t work. Check your connection and try again.';
    } finally {
      busy = false;
      controls.forEach((c) => { c.disabled = false; });
      file.value = '';
    }
  }

  file.addEventListener('change', () => { if (file.files && file.files.length) go(() => ctx.importFiles([...file.files], progress)); });
  const fromAniList = () => { const name = user.value.trim(); if (name) go(() => ctx.importAniList(name, progress)); };
  userBtn.addEventListener('click', fromAniList);
  user.addEventListener('keydown', (e) => { if (e.key === 'Enter') fromAniList(); });

  append(sheet.body, [
    h('div', { class: 'sheet-head' }, h('h1', { class: 'page-title' }, 'Bring your history'), closeButton(sheet)),
    h('div', { class: 'page-scroll import-body' },
      h('p', { class: 'muted' }, 'Already rate films and shows somewhere else? Bring them in: ratings become diary entries and watchlists join yours, so Binger knows your taste straight away. Nothing you’ve done in Binger is changed.'),
      h('section', { class: 'settings-group' },
        h('h2', { class: 'eyebrow' }, 'From a file'),
        h('ul', { class: 'small muted import-help' },
          h('li', null, h('strong', null, 'IMDb: '), 'Your ratings (or Your watchlist) → ⋯ → Export. You get a .csv file.'),
          h('li', null, h('strong', null, 'Letterboxd: '), 'Settings → Import & export → Export your data. Unzip it and choose diary.csv, ratings.csv, watched.csv and watchlist.csv together.'),
          h('li', null, h('strong', null, 'MyAnimeList: '), 'Profile → Export → Anime list. Choose the .xml.gz file it downloads.')),
        ctx.hasKey ? null : h('p', { class: 'small muted' }, 'IMDb and Letterboxd need films and TV, which aren’t on in this copy of Binger.'),
        h('label', { class: 'btn btn-quiet', for: 'history-file' }, icon('upload', 18), 'Choose files'),
        file),
      h('section', { class: 'settings-group' },
        h('h2', { class: 'eyebrow' }, 'From AniList'),
        h('label', { class: 'sr-only', for: 'anilist-user' }, 'AniList username'),
        h('div', { class: 'key-row' }, user, userBtn),
        h('p', { class: 'small muted' }, 'Your list needs to be public on AniList.')),
      status,
      outcome),
  ]);
  sheet.focusFirst();
  return sheet;
}
