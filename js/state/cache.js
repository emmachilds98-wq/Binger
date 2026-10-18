// API response cache in IndexedDB (localStorage is too small for this), with
// expiry. If IndexedDB isn't available (private mode in some browsers) it
// falls back to memory, which just means more network requests.

const DB = 'binger-cache';
const STORE = 'kv';
const PRUNE_AFTER = 14 * 24 * 60 * 60 * 1000;

export function createMemoryCache() {
  const m = new Map();
  return {
    async get(k) { return m.get(k); },
    async set(k, value, ttl) { m.set(k, { value, expires: Date.now() + ttl }); },
    async clear() { m.clear(); },
  };
}

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function createCache() {
  if (typeof indexedDB === 'undefined') return createMemoryCache();
  let db;
  try {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    db = await req(open);
  } catch {
    return createMemoryCache();
  }
  const tx = (mode) => db.transaction(STORE, mode).objectStore(STORE);

  // Drop entries that expired long ago so the cache can't grow forever.
  try {
    const cursorReq = tx('readwrite').openCursor();
    cursorReq.onsuccess = () => {
      const c = cursorReq.result;
      if (!c) return;
      if (!c.value || c.value.expires < Date.now() - PRUNE_AFTER) c.delete();
      c.continue();
    };
  } catch { /* best effort */ }

  return {
    async get(k) {
      try { return await req(tx('readonly').get(k)); } catch { return undefined; }
    },
    async set(k, value, ttl) {
      try { await req(tx('readwrite').put({ value, expires: Date.now() + ttl }, k)); } catch { /* quota */ }
    },
    async clear() {
      try { await req(tx('readwrite').clear()); } catch { /* ignore */ }
    },
  };
}
