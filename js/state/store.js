// Keeps the library in localStorage and tells the UI when it changes.
// All the actual rules live in library.js; this file only loads, saves and notifies.

import { emptyState, migrate } from './library.js';

export const STORAGE_KEY = 'binger:v1';

export function createStore({ storage = globalThis.localStorage, key = STORAGE_KEY, onSaveError = null } = {}) {
  let state;
  try {
    const raw = storage && storage.getItem(key);
    state = raw ? migrate(JSON.parse(raw)) : emptyState();
  } catch {
    state = emptyState();
  }
  const subs = new Set();

  function save() {
    try {
      if (storage) storage.setItem(key, JSON.stringify(state));
    } catch (err) {
      if (onSaveError) onSaveError(err);
    }
  }

  return {
    get: () => state,
    // update(fn, ...args): state = fn(state, ...args); returns the previous state.
    update(fn, ...args) {
      const prev = state;
      const next = fn(state, ...args);
      if (next === prev) return prev;
      state = next;
      save();
      for (const s of subs) s(state, prev);
      return prev;
    },
    replace(next) {
      const prev = state;
      state = migrate(next);
      save();
      for (const s of subs) s(state, prev);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
