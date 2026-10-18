// Network helpers shared by the TMDB and AniList adapters.

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export class ApiError extends Error {
  constructor(message, { status = 0, source = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.source = source;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchJSON(url, { fetchImpl = globalThis.fetch, init = {}, timeoutMs = 15000, source = '', retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetchImpl(url, { ...init, signal: ctrl ? ctrl.signal : undefined });
    } catch (err) {
      if (attempt < retries) { await sleep(800); continue; }
      throw new ApiError(err && err.name === 'AbortError' ? 'Request timed out' : 'Network error', { source });
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (res.status === 429 && attempt < retries) {
      const wait = Number(res.headers && res.headers.get && res.headers.get('Retry-After')) || 2;
      await sleep(Math.min(wait, 10) * 1000);
      continue;
    }
    if (!res.ok) {
      let detail = '';
      try { const body = await res.json(); detail = body.status_message || (body.errors && body.errors[0] && body.errors[0].message) || ''; } catch { /* not JSON */ }
      throw new ApiError(detail || `HTTP ${res.status}`, { status: res.status, source });
    }
    return res.json();
  }
}

// Read-through cache. Serves a fresh entry if there is one; otherwise loads,
// and if loading fails (offline, rate-limited) falls back to a stale entry.
export async function cached(cache, key, ttlMs, loader) {
  let entry;
  if (cache && ttlMs > 0) {
    try { entry = await cache.get(key); } catch { entry = undefined; }
    if (entry && entry.expires > Date.now()) return entry.value;
  }
  try {
    const value = await loader();
    if (cache && ttlMs > 0) { try { await cache.set(key, value, ttlMs); } catch { /* full or unavailable */ } }
    return value;
  } catch (err) {
    if (entry) return entry.value;
    throw err;
  }
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
