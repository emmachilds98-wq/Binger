// Settings: TMDB key, region, trailer behaviour, anime voice language,
// backup / restore, reset, and credits.

import { h, icon } from './dom.js';
import { openSheet, closeButton, confirmSheet, choiceSheet, toast } from './sheet.js';
import { toggle } from './taste.js';

const REGIONS = [
  ['GB', 'United Kingdom'], ['IE', 'Ireland'], ['US', 'United States'], ['CA', 'Canada'], ['AU', 'Australia'],
  ['NZ', 'New Zealand'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'],
  ['SE', 'Sweden'], ['NO', 'Norway'], ['DK', 'Denmark'], ['JP', 'Japan'], ['IN', 'India'], ['BR', 'Brazil'], ['MX', 'Mexico'],
];

export function openSettings(ctx) {
  const sheet = openSheet({ label: 'Settings', variant: 'full', className: 'settings' });
  const s = ctx.getState().settings;

  // --- TMDB key ---
  const keyInput = h('input', { id: 'tmdb-key', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'API key or Read Access Token', value: s.tmdbKey || '' });
  const keyStatus = h('p', { class: 'small muted', role: 'status' }, ctx.keySource());
  const show = h('button', { type: 'button', class: 'btn btn-chip', onClick: () => { keyInput.type = keyInput.type === 'password' ? 'text' : 'password'; show.textContent = keyInput.type === 'password' ? 'Show' : 'Hide'; } }, 'Show');
  const testBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Test & save');
  testBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    testBtn.disabled = true;
    keyStatus.textContent = key ? 'Checking with TMDB…' : 'Removing key…';
    const result = await ctx.saveKey(key);
    keyStatus.textContent = result.message;
    keyStatus.classList.toggle('error', !result.ok);
    testBtn.disabled = false;
  });

  // --- region & playback ---
  const region = h('select', { id: 'region' }, REGIONS.map(([code, name]) => h('option', { value: code, selected: s.region === code }, name)));
  region.addEventListener('change', () => ctx.updateSettings({ region: region.value }));
  const clip = h('select', { id: 'clip' }, [[15, '15 seconds'], [30, '30 seconds'], [60, '1 minute'], [0, 'Whole trailer']]
    .map(([v, label]) => h('option', { value: String(v), selected: Number(s.clipSeconds) === v }, label)));
  clip.addEventListener('change', () => ctx.updateSettings({ clipSeconds: Number(clip.value) }));
  const voices = h('select', { id: 'voices' }, [['JAPANESE', 'Japanese (original)'], ['ENGLISH', 'English dub']]
    .map(([v, label]) => h('option', { value: v, selected: s.voiceLanguage === v }, label)));
  voices.addEventListener('change', () => ctx.updateSettings({ voiceLanguage: voices.value }));

  // --- backup ---
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import-file' });
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const text = await f.text();
    file.value = '';
    const mode = await choiceSheet({
      title: 'Restore backup',
      message: 'Merge keeps everything you have and adds what’s in the file. Replace makes the file your whole library.',
      options: [{ value: 'replace', label: 'Replace', danger: true }, { value: 'merge', label: 'Merge' }],
    });
    if (!mode) return;
    try {
      ctx.importBackup(text, mode);
      toast(mode === 'replace' ? 'Library replaced from backup' : 'Backup merged in');
    } catch (err) {
      toast(err.message);
    }
  });

  sheet.body.append(
    h('div', { class: 'sheet-head' }, h('h1', { class: 'page-title' }, 'Settings'), closeButton(sheet)),
    h('div', { class: 'page-scroll settings-body' },
      group('Films & TV (TMDB key)',
        h('p', { class: 'small muted' }, 'Films and TV come from TMDB, which needs a free key. Make an account at themoviedb.org, then Settings → API. Paste either the API Key or the Read Access Token. It’s stored only on this device.'),
        h('div', { class: 'key-row' }, h('label', { class: 'sr-only', for: 'tmdb-key' }, 'TMDB key'), keyInput, show),
        h('div', { class: 'row-gap' }, testBtn, h('a', { href: 'https://www.themoviedb.org/settings/api', target: '_blank', rel: 'noopener', class: 'small' }, 'Get a key', icon('external', 14))),
        keyStatus),
      group('Where you watch',
        field('Region (for streaming info and certificates)', 'region', region)),
      group('Trailers',
        toggle('Autoplay trailer in details', 'Muted; tap the video for sound', s.autoplayTrailers, (v) => ctx.updateSettings({ autoplayTrailers: v })),
        field('Clip length', 'clip', clip)),
      group('Anime',
        field('Voice cast to show', 'voices', voices)),
      group('Backup',
        h('p', { class: 'small muted' }, 'Your library lives in this browser. Export a backup now and then, especially on iPhone, where Safari can clear data for sites you haven’t added to your Home Screen.'),
        h('div', { class: 'row-gap' },
          h('button', { type: 'button', class: 'btn btn-quiet', onClick: ctx.exportBackup }, icon('download', 18), 'Export'),
          h('label', { class: 'btn btn-quiet', for: 'import-file' }, icon('upload', 18), 'Import'),
          file)),
      group('Start over',
        h('button', {
          type: 'button', class: 'btn btn-danger', onClick: async () => {
            const ok = await confirmSheet({ title: 'Erase everything?', message: 'Your watchlist, diary, ratings and settings on this device will be deleted. Export a backup first if you might want them.', confirmLabel: 'Erase', danger: true });
            if (ok) { ctx.reset(); sheet.close(); }
          },
        }, icon('trash', 18), 'Erase my library')),
      group('About',
        h('p', { class: 'small muted' }, `Binger ${self.BINGER_VERSION || 'dev'}${self.BINGER_BUILD_TIME ? ` · built ${new Date(self.BINGER_BUILD_TIME).toLocaleString()}` : ''}`),
        h('p', { class: 'small muted' }, 'Film and TV data: TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability: JustWatch, via TMDB. Anime data: AniList. Trailers: YouTube.'))));
  return sheet;
}

function group(title, ...children) {
  return h('section', { class: 'settings-group' }, h('h2', { class: 'eyebrow' }, title), children);
}

function field(label, id, control) {
  return h('div', { class: 'field' }, h('label', { for: id, class: 'small' }, label), control);
}
