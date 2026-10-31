// Who's using Binger: the "Who's watching?" picker, the chip that shows whose
// library you're in, and the "People and sync" sheet (add, rename and remove
// people; connect Firebase; sign in; start or join a household).

import { h, icon, clear, append } from './dom.js';
import { openSheet, closeButton, confirmSheet, toast } from './sheet.js';
import { toggle } from './taste.js';
import { displayName, formatCode } from '../state/profiles.js';

export function personAvatar(p, size = 'md') {
  return h('span', { class: `who-avatar who-${size}`, style: { '--who': p.colour }, 'aria-hidden': 'true' },
    displayName(p).slice(0, 1).toUpperCase());
}

// The chip in each screen's header: whose library this is. Tap to switch.
export function whoChip(who) {
  if (!who) return null;
  return h('button', {
    type: 'button', class: 'who-chip', onClick: who.onClick,
    'aria-label': `Watching as ${displayName(who.profile)}. Switch person`,
  }, personAvatar(who.profile, 'sm'), h('span', { class: 'who-name' }, displayName(who.profile)));
}

// ctx.onDone(choice): a person's id, 'add', 'manage', or null if closed.
export function openWhoIsWatching(ctx) {
  let chosen = null;
  const sheet = openSheet({ label: 'Who’s watching?', variant: 'full', className: 'who', onClose: () => ctx.onDone(chosen) });
  const choose = (c) => { chosen = c; sheet.close(); };
  const p = ctx.profiles;
  append(sheet.body, [
    h('div', { class: 'who-body' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('play', 14)), h('span', { class: 'brand-word' }, 'binger')),
      h('h1', { class: 'page-title' }, 'Who’s watching?'),
      h('ul', { class: 'who-grid' },
        p.list.map((x) => h('li', null, h('button', {
          type: 'button', class: `who-tile${x.id === p.current ? ' is-current' : ''}`,
          onClick: () => choose(x.id),
        }, personAvatar(x, 'xl'), h('span', { class: 'who-tile-name' }, displayName(x))))),
        h('li', null, h('button', { type: 'button', class: 'who-tile who-add', onClick: () => choose('add') },
          h('span', { class: 'who-avatar who-xl who-plus', 'aria-hidden': 'true' }, icon('plus', 30)), h('span', { class: 'who-tile-name' }, 'Add a person')))),
      ctx.onAskWho ? toggle('Ask every time Binger opens', 'Turn off on a phone only one of you uses', p.askWho, ctx.onAskWho) : null,
      h('button', { type: 'button', class: 'link-btn', onClick: () => choose('manage') }, 'People and sync')),
  ]);
  sheet.focusFirst();
  return sheet;
}

// First visit: sign in straight away, so syncing (and inviting friends) is
// set up from the start rather than linked later. "Just my name" is the only
// way past without signing in. ctx.get() returns { hasConfig, busy, error };
// actions: onGoogle(name), onEmail(name, email, password, create),
// onNameOnly(name), onClose(). The app closes it once someone is signed in.
export function openWelcome(ctx) {
  const sheet = openSheet({ label: 'Welcome to Binger', variant: 'full', className: 'who welcome', dismissible: false, onClose: ctx.onClose });
  const body = h('div', { class: 'who-body welcome-body' });
  append(sheet.body, [body]);
  let need = '';

  const val = (id) => { const el = body.querySelector(`#${id}`); return el ? el.value.trim() : ''; };
  // A name is needed for a new account and for "Just my name", so friends can
  // tell whose library is whose. Google and an existing account bring theirs.
  const requireName = () => {
    if (val('welcome-name')) return true;
    need = 'Add your name first, so friends can tell whose library is whose.';
    render();
    body.querySelector('#welcome-name').focus();
    return false;
  };

  function render() {
    const st = ctx.get();
    const typed = new Map([...body.querySelectorAll('input[id]')].map((el) => [el.id, el.value]));
    const focused = document.activeElement && body.contains(document.activeElement) ? document.activeElement.id : null;
    clear(body);
    const name = h('input', { id: 'welcome-name', type: 'text', maxlength: '30', autocomplete: 'given-name', placeholder: 'Your name' });
    const parts = [
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('play', 14)), h('span', { class: 'brand-word' }, 'binger')),
      h('h1', { class: 'page-title' }, 'Welcome to Binger'),
      h('p', { class: 'small muted' }, st.hasConfig
        ? 'Sign in so your watchlist and ratings follow you to every device, and friends can join you.'
        : 'Everyone gets their own watchlist, diary and suggestions.'),
      h('label', { class: 'small', for: 'welcome-name' }, 'What should we call you?'),
      name,
    ];
    if (st.hasConfig) {
      const email = h('input', { id: 'welcome-email', type: 'email', autocomplete: 'username', placeholder: 'you@example.com' });
      const pw = h('input', { id: 'welcome-password', type: 'password', autocomplete: 'current-password', placeholder: 'Password (6 or more characters)' });
      parts.push(
        h('div', { class: 'welcome-actions' },
          h('button', { type: 'button', class: 'btn btn-primary', disabled: st.busy, onClick: () => { need = ''; ctx.onGoogle(val('welcome-name')); } }, 'Continue with Google'),
          h('p', { class: 'small muted welcome-or' }, 'or with email'),
          h('label', { class: 'sr-only', for: 'welcome-email' }, 'Email'), email,
          h('label', { class: 'sr-only', for: 'welcome-password' }, 'Password'), pw,
          h('div', { class: 'row-gap welcome-email-actions' },
            h('button', { type: 'button', class: 'btn btn-quiet grow', disabled: st.busy, onClick: () => { if (requireName()) { need = ''; ctx.onEmail(val('welcome-name'), val('welcome-email'), body.querySelector('#welcome-password').value, true); } } }, 'Create account'),
            h('button', { type: 'button', class: 'btn btn-quiet grow', disabled: st.busy, onClick: () => { need = ''; ctx.onEmail(val('welcome-name'), val('welcome-email'), body.querySelector('#welcome-password').value, false); } }, 'Sign in'))),
        st.busy ? h('p', { class: 'small muted', role: 'status' }, 'Signing in…') : null,
        st.error ? h('p', { class: 'small error', role: 'alert' }, st.error) : null,
        need ? h('p', { class: 'small error', role: 'alert' }, need) : null,
        h('button', { type: 'button', class: 'link-btn welcome-skip', disabled: st.busy, onClick: () => { if (requireName()) ctx.onNameOnly(val('welcome-name')); } }, 'Just my name for now'),
        h('p', { class: 'small muted' }, 'You can sign in to sync across devices later, in Settings → People and sync.'));
    } else {
      parts.push(
        need ? h('p', { class: 'small error', role: 'alert' }, need) : null,
        h('div', { class: 'welcome-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onClick: () => { if (requireName()) ctx.onNameOnly(val('welcome-name')); } }, 'Continue')));
    }
    append(body, parts);
    for (const [id, value] of typed) { const el = body.querySelector(`#${id}`); if (el && value) el.value = value; }
    // Typing survives a re-render (sign-in state changing), and so does focus.
    const again = focused && body.querySelector(`#${focused}`);
    if (again) again.focus();
  }

  render();
  // After the sheet's own focus (openSheet focuses the panel on the next frame).
  requestAnimationFrame(() => { const n = body.querySelector('#welcome-name'); if (n) n.focus(); });
  return { sheet, refresh: () => { if (sheet.el.isConnected) render(); }, close: () => sheet.close() };
}

// A small sheet asking for a name. Resolves to the name, or null.
export function askName({ title, label = 'Name', value = '', confirmLabel = 'Save', hint = null }) {
  return new Promise((resolve) => {
    let answered = false;
    const s = openSheet({ label: title, variant: 'bottom', className: 'confirm', onClose: () => { if (!answered) resolve(null); } });
    const input = h('input', { id: 'person-name', type: 'text', maxlength: '30', autocomplete: 'off', value });
    const save = () => {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      answered = true;
      resolve(v);
      s.close();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    append(s.body, [
      h('h2', { class: 'sheet-title' }, title),
      hint ? h('p', { class: 'muted small' }, hint) : null,
      h('label', { class: 'small', for: 'person-name' }, label),
      input,
      h('div', { class: 'row-end' },
        h('button', { type: 'button', class: 'btn btn-quiet', onClick: () => s.close() }, 'Cancel'),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: save }, confirmLabel)),
    ]);
    requestAnimationFrame(() => input.focus());
  });
}

// ctx.get() returns { profiles, hasConfig, configFromDeploy, user, household,
// status, busy, error, pendingCode }; the rest are actions. Call refresh()
// on the returned handle when any of that changes.
export function openPeople(ctx) {
  const sheet = openSheet({ label: 'People and sync', variant: 'full', className: 'people' });
  const scroll = h('div', { class: 'page-scroll people-body' });
  append(sheet.body, [h('div', { class: 'sheet-head' }, h('h1', { class: 'page-title' }, 'People and sync'), closeButton(sheet)), scroll]);

  // The sheet re-renders whenever sync's state changes (Firebase finishing
  // loading, a sign-in landing), often while someone is typing. What they've
  // typed, and where the cursor is, must survive that.
  function render() {
    const st = ctx.get();
    const keep = scroll.scrollTop;
    const typed = new Map([...scroll.querySelectorAll('input[id], textarea[id]')].map((el) => [el.id, el.value]));
    const focused = document.activeElement && scroll.contains(document.activeElement) ? document.activeElement.id : null;
    clear(scroll);
    append(scroll, [peopleSection(st), syncSection(st)]);
    for (const [id, value] of typed) {
      const el = scroll.querySelector(`#${id}`);
      if (el && value && el.type !== 'checkbox') el.value = value;
    }
    if (focused) { const el = scroll.querySelector(`#${focused}`); if (el) el.focus(); }
    scroll.scrollTop = keep;
  }

  function peopleSection(st) {
    const p = st.profiles;
    return group('Who uses Binger',
      h('p', { class: 'small muted' }, 'Everyone gets their own watchlist, diary and suggestions. The chip at the top of each screen shows whose they are.'),
      h('ul', { class: 'rows' }, p.list.map((x) => h('li', { class: 'row person-row' },
        personAvatar(x, 'md'),
        h('span', { class: 'row-text' },
          h('span', { class: 'row-title' }, displayName(x)),
          x.id === p.current ? h('span', { class: 'small accent' }, 'Watching now') : null),
        x.id !== p.current ? h('button', { type: 'button', class: 'btn btn-chip', onClick: () => ctx.onSwitch(x.id) }, 'Switch') : null,
        h('button', { type: 'button', class: 'btn btn-chip', 'aria-label': `Rename ${displayName(x)}`, onClick: () => ctx.onRename(x) }, 'Rename'),
        p.list.length > 1 ? h('button', {
          type: 'button', class: 'icon-btn icon-btn-narrow', 'aria-label': `Remove ${displayName(x)}`,
          onClick: async () => {
            const ok = await confirmSheet({
              title: `Remove ${displayName(x)}?`,
              message: `${displayName(x)}’s watchlist, diary and ratings will be deleted from this device${st.household ? ' and from sync' : ''}.`,
              confirmLabel: 'Remove', danger: true,
            });
            if (ok) ctx.onRemove(x);
          },
        }, icon('trash', 18)) : null))),
      h('button', { type: 'button', class: 'btn btn-quiet', onClick: ctx.onAdd }, icon('plus', 18), 'Add a person'),
      p.list.length > 1 ? toggle('Ask who’s watching when Binger opens', 'Turn off on a phone only one of you uses', p.askWho, ctx.onAskWho) : null);
  }

  function syncSection(st) {
    const body = [];
    if (!st.hasConfig) {
      const area = h('textarea', { id: 'firebase-config', rows: '5', spellcheck: 'false', placeholder: 'const firebaseConfig = {\n  apiKey: "…",\n  projectId: "…",\n  appId: "…"\n};' });
      body.push(
        h('p', { class: 'small muted' }, 'Keep each person’s library the same on every phone and computer. Binger syncs through your own free Firebase project. Set it up once (about 10 minutes), then paste its web config here.'),
        h('a', { class: 'small', href: 'https://github.com/emmachilds98-wq/Binger/blob/main/docs/FIREBASE.md', target: '_blank', rel: 'noopener' }, 'How to set up Firebase', icon('external', 14)),
        h('label', { class: 'small', for: 'firebase-config' }, 'Firebase web config'),
        area,
        h('div', { class: 'row-gap' }, h('button', { type: 'button', class: 'btn btn-primary', onClick: () => ctx.onConfig(area.value) }, 'Connect')));
    } else if (!st.user) {
      const email = h('input', { id: 'sync-email', type: 'email', autocomplete: 'username', placeholder: 'you@example.com' });
      const pw = h('input', { id: 'sync-password', type: 'password', autocomplete: 'current-password', placeholder: 'At least 6 characters' });
      body.push(
        h('p', { class: 'small muted' }, st.pendingCode
          ? 'Sign in to join the household you were invited to.'
          : 'Sign in to sync. Each of you signs in with your own account; one starts a household and invites the other.'),
        h('button', { type: 'button', class: 'btn btn-primary', disabled: st.busy, onClick: ctx.onGoogle }, 'Sign in with Google'),
        h('p', { class: 'small muted or' }, 'or with email'),
        h('label', { class: 'small', for: 'sync-email' }, 'Email'), email,
        h('label', { class: 'small', for: 'sync-password' }, 'Password'), pw,
        h('div', { class: 'row-gap' },
          h('button', { type: 'button', class: 'btn btn-quiet', disabled: st.busy, onClick: () => ctx.onEmail(email.value.trim(), pw.value, false) }, 'Sign in'),
          h('button', { type: 'button', class: 'btn btn-quiet', disabled: st.busy, onClick: () => ctx.onEmail(email.value.trim(), pw.value, true) }, 'Create account')),
        st.configFromDeploy ? null : h('button', { type: 'button', class: 'link-btn quiet-link', onClick: ctx.onForgetConfig }, 'Use a different Firebase project'));
    } else if (!st.household) {
      const code = h('input', { id: 'join-code', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'abcd-efgh-jkmn', value: st.pendingCode ? formatCode(st.pendingCode) : '' });
      body.push(
        h('p', { class: 'small' }, `Signed in as ${st.user.email || st.user.name || 'you'}.`),
        h('div', { class: 'panel' },
          h('h3', { class: 'switch-label' }, 'Got an invite?'),
          h('label', { class: 'small muted', for: 'join-code' }, 'Paste the code or link you were sent'),
          code,
          h('button', { type: 'button', class: `btn ${st.pendingCode ? 'btn-primary' : 'btn-quiet'}`, disabled: st.busy, onClick: () => ctx.onJoin(code.value) }, 'Join household')),
        h('div', { class: 'panel' },
          h('h3', { class: 'switch-label' }, 'First one here?'),
          h('p', { class: 'small muted' }, 'Start a household, then send the invite to whoever you watch with.'),
          h('button', { type: 'button', class: `btn ${st.pendingCode ? 'btn-quiet' : 'btn-primary'}`, disabled: st.busy, onClick: ctx.onCreate }, 'Start a household')),
        h('button', { type: 'button', class: 'link-btn quiet-link', onClick: ctx.onSignOut }, 'Sign out'));
    } else {
      body.push(
        h('p', { class: 'sync-status', role: 'status' }, icon('check', 16), st.status || 'Synced'),
        h('div', { class: 'panel' },
          h('h3', { class: 'switch-label' }, 'Invite someone'),
          h('p', { class: 'small muted' }, 'Send them this link. They sign in with their own account, pick who they are, and their library syncs too. The TMDB key is shared, so they get films and TV straight away.'),
          h('p', { class: 'invite-code', 'aria-label': `Invite code ${st.household.split('').join(' ')}` }, formatCode(st.household)),
          h('div', { class: 'row-gap' },
            h('button', { type: 'button', class: 'btn btn-primary', onClick: ctx.onShareInvite }, 'Share invite link'),
            h('button', { type: 'button', class: 'btn btn-quiet', onClick: ctx.onCopyInvite }, 'Copy'))),
        h('p', { class: 'small muted' }, `Signed in as ${st.user.email || st.user.name || 'you'}.`),
        h('button', { type: 'button', class: 'link-btn quiet-link', onClick: ctx.onSignOut }, 'Sign out of sync'));
    }
    if (st.error) body.push(h('p', { class: 'small error', role: 'alert' }, st.error));
    else if (st.status && !st.household) body.push(h('p', { class: 'small muted', role: 'status' }, st.status));
    return group('Sync across devices', body);
  }

  render();
  return { sheet, refresh: () => { if (sheet.el.isConnected) render(); } };
}

function group(title, ...children) {
  return h('section', { class: 'settings-group' }, h('h2', { class: 'eyebrow' }, title), children);
}

export async function shareOrCopy({ title, text, url }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return 'shared'; } catch (err) { if (err && err.name === 'AbortError') return 'cancelled'; }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Invite link copied');
    return 'copied';
  } catch {
    toast('Couldn’t copy. Long-press the code to copy it instead.');
    return 'failed';
  }
}
