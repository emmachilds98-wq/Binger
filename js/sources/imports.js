// Bring your history in from elsewhere: IMDb (its ratings or watchlist
// export, CSV), Letterboxd (the CSVs in its data export), MyAnimeList (its
// XML export, .xml or .xml.gz) and AniList (just a username). Reading the
// files is pure; matching titles goes through the TMDB and AniList adapters;
// what lands in your library is decided by importHistory in
// js/state/library.js. docs/COVERAGE-PLAN.md → Import history.
//
// A plan entry: { key, ref, label, status: 'watched' | 'want' | 'passed',
//   watches: [{ date, rating (0.5-5 | null), review, tags, from }] }
// ref is how to find it: { imdbId } | { name, year } | { malId } | { anilistId }.

import { mapLimit } from './http.js';
import { normaliseName } from './lookups.js';

// ---- CSV (RFC 4180: quoted fields, "" inside quotes, newlines in quotes) ----

export function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

// Rows as objects keyed by the header row's names.
export function csvRecords(text) {
  const [head, ...rows] = parseCsv(text);
  if (!head) return { header: [], records: [] };
  const header = head.map((x) => x.trim());
  return { header, records: rows.map((r) => Object.fromEntries(header.map((k, i) => [k, (r[i] ?? '').trim()]))) };
}

const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || '')) && !String(s).startsWith('0000') ? String(s).slice(0, 10) : null);
// A score out of 10 (IMDb, MyAnimeList, AniList) as half stars out of 5; 0 is "not rated".
const outOf10 = (x) => { const n = Number(x); return n > 0 ? Math.max(0.5, Math.min(5, Math.round(n) / 2)) : null; };
const halfStars = (x) => { const n = Number(x); return n > 0 ? Math.max(0.5, Math.min(5, Math.round(n * 2) / 2)) : null; };

// Which export a file is, from its name and first lines.
export function detectFormat(name, text) {
  const t = String(text || '').slice(0, 4000);
  if (/<myanimelist>/i.test(t)) return 'mal';
  const header = (parseCsv(t.split(/\r?\n/)[0])[0] || []).map((x) => x.trim());
  if (header.includes('Const') && (header.includes('Your Rating') || header.includes('Title Type'))) return 'imdb';
  if (header.includes('Letterboxd URI')) return 'letterboxd';
  return null;
}

// ---- IMDb ----

// Episodes, games and podcasts aren't films or series you'd swipe on.
const IMDB_SKIP = /episode|video game|podcast|music video/i;

export function fromImdbCsv(text) {
  const { header, records } = csvRecords(text);
  const watchlist = header.includes('Position');
  const out = [];
  for (const r of records) {
    const imdbId = r.Const;
    if (!/^tt\d+$/.test(imdbId || '') || IMDB_SKIP.test(r['Title Type'] || '')) continue;
    const rating = outOf10(r['Your Rating']);
    const label = [r.Title, r.Year ? `(${r.Year})` : null].filter(Boolean).join(' ');
    if (rating != null) {
      out.push({ key: `imdb:${imdbId}`, ref: { imdbId }, label, status: 'watched', watches: [{ date: day(r['Date Rated']), rating, review: '', tags: [], from: 'rating' }] });
    } else if (watchlist) {
      out.push({ key: `imdb:${imdbId}`, ref: { imdbId }, label, status: 'want', watches: [] });
    }
  }
  return out;
}

// ---- Letterboxd ----

// diary.csv / reviews.csv: one row per viewing. ratings.csv: one rating per
// film. watched.csv: films marked watched. watchlist.csv: the same columns as
// watched.csv, so it's told apart by its file name.
export function fromLetterboxdCsv(text, fileName = '') {
  const { header, records } = csvRecords(text);
  const diary = header.includes('Watched Date');
  const rated = header.includes('Rating');
  const watchlist = !diary && !rated && /watchlist/i.test(fileName);
  const out = [];
  for (const r of records) {
    if (!r.Name) continue;
    const year = Number(r.Year) || null;
    const key = `lb:${normaliseName(r.Name)}:${year || ''}`;
    const label = [r.Name, year ? `(${year})` : null].filter(Boolean).join(' ');
    const ref = { name: r.Name, year };
    if (watchlist) { out.push({ key, ref, label, status: 'want', watches: [] }); continue; }
    out.push({ key, ref, label, status: 'watched', watches: [{
      date: day(r['Watched Date']) || day(r.Date),
      rating: halfStars(r.Rating),
      review: r.Review || '',
      tags: [],
      from: diary ? 'diary' : rated ? 'rating' : 'watched',
    }] });
  }
  return out;
}

// ---- MyAnimeList and AniList ----

const ANIME_STATUS = {
  completed: 'watched', repeating: 'watched', watching: 'watched', current: 'watched', 'on-hold': 'watched', paused: 'watched',
  'plan to watch': 'want', planning: 'want', dropped: 'passed',
  // MyAnimeList's older exports use numbers.
  1: 'watched', 2: 'watched', 3: 'watched', 4: 'passed', 6: 'want',
};
const animeStatus = (s) => ANIME_STATUS[String(s || '').trim().toLowerCase()] || null;
const finished = (s) => /^(completed|repeating|2)$/i.test(String(s || '').trim());

function animeEntry(key, ref, label, status, score, date, notes) {
  const st = animeStatus(status);
  if (!st) return null;
  if (st !== 'watched') return { key, ref, label, status: st, watches: [] };
  return { key, ref, label, status: st, watches: [{ date, rating: finished(status) ? outOf10(score) : null, review: notes || '', tags: [], from: 'rating' }] };
}

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`, 'i'));
  return m ? m[1].trim() : '';
};

export function fromMalXml(text) {
  const out = [];
  for (const block of String(text || '').match(/<anime>[\s\S]*?<\/anime>/gi) || []) {
    const malId = Number(tag(block, 'series_animedb_id'));
    if (!malId) continue;
    const e = animeEntry(`mal:${malId}`, { malId }, tag(block, 'series_title') || `MyAnimeList ${malId}`, tag(block, 'my_status'),
      tag(block, 'my_score'), day(tag(block, 'my_finish_date')), tag(block, 'my_comments'));
    if (e) out.push(e);
  }
  return out;
}

// Entries from the AniList adapter's userList().
export function fromAniListEntries(entries) {
  return (entries || []).map((e) => animeEntry(`al:${e.id}`, { anilistId: e.id }, `AniList ${e.id}`, e.status, e.score, e.date, e.notes)).filter(Boolean);
}

// ---- one plan from many files ----

// The same title from several files (Letterboxd's diary and ratings, IMDb's
// ratings and watchlist) becomes one entry: watched beats passed beats want;
// diary viewings win over a bare rating, which wins over "watched"; a
// viewing listed twice (same date and rating) counts once.
export function mergePlan(entries) {
  const RANK = { watched: 0, passed: 1, want: 2 };
  const FROM = { diary: 0, rating: 1, watched: 2 };
  const by = new Map();
  for (const e of entries || []) {
    const had = by.get(e.key);
    if (!had) { by.set(e.key, { ...e, watches: [...e.watches] }); continue; }
    if (RANK[e.status] < RANK[had.status]) had.status = e.status;
    had.watches.push(...e.watches);
  }
  for (const e of by.values()) {
    if (e.status !== 'watched') { e.watches = []; continue; }
    const best = Math.min(...e.watches.map((w) => FROM[w.from] ?? 2));
    const kept = e.watches.filter((w) => (FROM[w.from] ?? 2) === best);
    // A film rated but never logged in the diary keeps its rating on its latest viewing.
    if (best === 0) {
      const rating = e.watches.find((w) => w.from === 'rating' && w.rating != null);
      if (rating && kept.every((w) => w.rating == null)) kept[kept.length - 1].rating = rating.rating;
    }
    const seen = new Set();
    e.watches = kept.filter((w) => { const k = `${w.date}|${w.rating}`; return !seen.has(k) && seen.add(k); });
  }
  return [...by.values()];
}

// Read one export file into plan entries. -> { format, entries } (format null
// when it isn't one Binger knows).
export function readExport(name, text) {
  const format = detectFormat(name, text);
  if (format === 'imdb') return { format, entries: fromImdbCsv(text) };
  if (format === 'letterboxd') return { format, entries: fromLetterboxdCsv(text, name) };
  if (format === 'mal') return { format, entries: fromMalXml(text) };
  return { format: null, entries: [] };
}

// ---- matching ----

// The film or series a Letterboxd name and year means: the same name and
// year first (a year either side, as release years differ by country), films
// before series.
export function bestMatch(results, name, year) {
  const n = normaliseName(name);
  const same = (t) => normaliseName(t.title) === n || normaliseName(t.originalTitle) === n;
  const near = (t) => !year || !t.year || Math.abs(t.year - year) <= 1;
  const film = (t) => (t.kind === 'film' ? 0 : 1);
  const pool = (results || []).filter((t) => same(t) && near(t));
  pool.sort((a, b) => film(a) - film(b) || (year ? Math.abs((a.year || year) - year) - Math.abs((b.year || year) - year) : 0));
  return pool[0] || null;
}

// Plan entries -> { matched: [{ ...entry, title }], missed: [entry] }.
// onProgress(done, total) as it goes. Japanese animation found through IMDb
// or Letterboxd keeps its TMDB entry: it still counts for your taste.
export async function resolvePlan(plan, { tmdb, anilist, onProgress = () => {}, concurrency = 6 } = {}) {
  const total = plan.length;
  let done = 0;
  const tick = () => onProgress(++done, total);
  const titleOf = new Map();
  const mal = plan.filter((e) => e.ref.malId);
  const al = plan.filter((e) => e.ref.anilistId);
  if (anilist && mal.length) {
    const found = await anilist.byMalIds(mal.map((e) => e.ref.malId));
    for (const e of mal) { titleOf.set(e.key, found.find((t) => t.malId === e.ref.malId) || null); tick(); }
  }
  if (anilist && al.length) {
    const found = await anilist.byIds(al.map((e) => e.ref.anilistId));
    for (const e of al) { titleOf.set(e.key, found.find((t) => t.sourceId === e.ref.anilistId) || null); tick(); }
  }
  const rest = plan.filter((e) => e.ref.imdbId || e.ref.name);
  await mapLimit(rest, concurrency, async (e) => {
    let t = null;
    try {
      if (tmdb && tmdb.hasKey && e.ref.imdbId) t = await tmdb.find(e.ref.imdbId);
      else if (tmdb && tmdb.hasKey && e.ref.name) {
        // That year first; then any year, as countries' release years differ.
        t = bestMatch(await tmdb.search(e.ref.name, { year: e.ref.year || null }), e.ref.name, e.ref.year)
          || (e.ref.year ? bestMatch(await tmdb.search(e.ref.name), e.ref.name, e.ref.year) : null);
      }
    } catch { t = null; }
    titleOf.set(e.key, t);
    tick();
  });
  const matched = [];
  const missed = [];
  for (const e of plan) {
    const t = titleOf.get(e.key);
    // Anime are named the way Binger shows them, not MyAnimeList's romaji.
    if (t) matched.push({ ...e, title: t, label: e.ref.malId || e.ref.anilistId ? t.title : e.label });
    else missed.push(e);
  }
  return { matched, missed };
}
