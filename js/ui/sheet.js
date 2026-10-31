// Sheets (detail, rate, search, settings...) and toasts.
// The phone's back button / gesture closes the top sheet: while any sheet is
// open we hold one extra history entry and treat "back" as "close".

import { h, append, icon } from './dom.js';

const stack = [];
let skipPop = 0;

function onPop() {
  if (skipPop > 0) { skipPop -= 1; return; }
  const top = stack[stack.length - 1];
  if (!top) return;
  top.close({ fromHistory: true });
  if (stack.length) history.pushState({ binger: 'sheet' }, '');
}

function onKey(e) {
  if (e.key !== 'Escape' || !stack.length) return;
  const top = stack[stack.length - 1];
  if (top.dismissible) { e.preventDefault(); top.close(); }
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  window.addEventListener('popstate', onPop);
  document.addEventListener('keydown', onKey);
}

export function anySheetOpen() {
  return stack.length > 0;
}

// variant: 'full' (slides over everything) or 'bottom' (bottom sheet).
export function openSheet({ label, variant = 'full', className = '', dismissible = true, onClose = null } = {}) {
  wire();
  const opener = document.activeElement;
  const backdrop = h('div', { class: 'sheet-backdrop', onClick: () => dismissible && api.close() });
  const body = h('div', { class: 'sheet-body' });
  const panel = h('section', {
    class: `sheet sheet-${variant} ${className}`.trim(),
    role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1',
  }, body);
  let closed = false;

  const api = {
    el: panel,
    body,
    dismissible,
    close({ fromHistory = false } = {}) {
      if (closed) return;
      closed = true;
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      panel.classList.add('is-leaving');
      backdrop.classList.add('is-leaving');
      const done = () => { panel.remove(); backdrop.remove(); };
      panel.addEventListener('animationend', done, { once: true });
      setTimeout(done, 400);
      if (!stack.length) {
        document.body.classList.remove('has-sheet');
        if (!fromHistory && history.state && history.state.binger === 'sheet') { skipPop += 1; history.back(); }
      }
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true });
      if (onClose) onClose();
    },
    focusFirst() {
      const target = panel.querySelector('[autofocus], input, textarea, select, button, a[href]');
      (target || panel).focus({ preventScroll: true });
    },
  };

  if (!stack.length) {
    history.pushState({ binger: 'sheet' }, '');
    document.body.classList.add('has-sheet');
  }
  clearToast(); // a toast from the screen behind would sit on top of the sheet
  stack.push(api);
  document.body.append(backdrop, panel);
  // Focus the sheet itself on the next frame, unless something inside it has
  // focus by then (focusFirst(), or someone already typing in a field) or
  // another sheet has opened on top in the meantime: either way, focus is
  // already where the person is.
  requestAnimationFrame(() => {
    if (stack[stack.length - 1] === api && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
  });
  return api;
}

export function closeButton(sheet, label = 'Close') {
  return h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, onClick: () => sheet.close() }, icon('x', 20));
}

let toastTimer = null;
function clearToast() {
  const host = document.getElementById('toast');
  if (host) host.replaceChildren();
  clearTimeout(toastTimer);
}

export function toast(message, { action = null, ms = 2600 } = {}) {
  let host = document.getElementById('toast');
  if (!host) {
    host = h('div', { id: 'toast', class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  host.replaceChildren(h('div', { class: 'toast' },
    h('span', null, message),
    action ? h('button', { type: 'button', class: 'toast-action', onClick: () => { action.fn(); host.replaceChildren(); } }, action.label) : null));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.replaceChildren(), action ? ms + 2000 : ms);
}

// Resolves to the chosen option's value, or null if dismissed.
export function choiceSheet({ title, message, options }) {
  return new Promise((resolve) => {
    let answered = false;
    const s = openSheet({ label: title, variant: 'bottom', className: 'confirm', onClose: () => { if (!answered) resolve(null); } });
    append(s.body, [
      h('h2', { class: 'sheet-title' }, title),
      message ? h('p', { class: 'muted' }, message) : null,
      h('div', { class: 'row-end' },
        h('button', { type: 'button', class: 'btn btn-quiet', onClick: () => s.close() }, 'Cancel'),
        options.map((o) => h('button', { type: 'button', class: `btn ${o.danger ? 'btn-danger' : 'btn-primary'}`, onClick: () => { answered = true; resolve(o.value); s.close(); } }, o.label)))]);
    s.focusFirst();
  });
}

export function confirmSheet({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const s = openSheet({ label: title, variant: 'bottom', className: 'confirm', onClose: () => { if (!answered) resolve(false); } });
    s.body.append(
      h('h2', { class: 'sheet-title' }, title),
      h('p', { class: 'muted' }, message),
      h('div', { class: 'row-end' },
        h('button', { type: 'button', class: 'btn btn-quiet', onClick: () => s.close() }, 'Cancel'),
        h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onClick: () => { answered = true; resolve(true); s.close(); } }, confirmLabel)));
    s.focusFirst();
  });
}
