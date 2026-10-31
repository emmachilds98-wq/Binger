// Bringing your history in (js/sources/imports.js, importHistory in
// js/state/library.js). The fixtures are written to each site's export
// format with made-up rows: IMDb's ratings and watchlist CSVs, Letterboxd's
// diary / ratings / reviews / watchlist CSVs, MyAnimeList's XML. AniList's
// list shape was checked live (2026-10-31) against a public profile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseCsv, detectFormat, fromImdbCsv, fromLetterboxdCsv, fromMalXml, fromAniListEntries,
  mergePlan, readExport, bestMatch, resolvePlan,
} from '../js/sources/imports.js';
import { createTmdb, fromTmdbList } from '../js/sources/tmdb.js';
import { createAniList, fromAniList } from '../js/sources/anilist.js';
import * as L from '../js/state/library.js';
import { importSummary } from '../js/ui/import.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-31T12:00:00Z');

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [match, body] of routes) {
      if (String(url).includes(match) || (init.body && init.body.includes(match))) {
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => (typeof body === 'function' ? body(url, init) : body) };
      }
    }
    return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({ errors: [{ message: 'User not found' }] }) };
  };
  fn.calls = calls;
  return fn;
}

test('CSV: quotes, commas and newlines inside quotes, "" escapes, CRLF, a byte-order mark', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\n'), [['a', 'b'], ['x, y', 'say "hi"\nthere']]);
  assert.deepEqual(parseCsv('a,b\n\n1,2'), [['a', 'b'], ['1', '2']], 'blank lines skipped');
});

test('each export is recognised from its contents', () => {
  assert.equal(detectFormat('ratings.csv', fixture('imdb-ratings.csv')), 'imdb');
  assert.equal(detectFormat('WATCHLIST.csv', fixture('imdb-watchlist.csv')), 'imdb');
  assert.equal(detectFormat('diary.csv', fixture('letterboxd-diary.csv')), 'letterboxd');
  assert.equal(detectFormat('animelist.xml', fixture('mal-animelist.xml')), 'mal');
  assert.equal(detectFormat('notes.csv', 'a,b\n1,2'), null);
  assert.deepEqual(readExport('notes.txt', 'hello'), { format: null, entries: [] });
});

test('IMDb: ratings out of 10 become half stars, episodes are skipped, the watchlist becomes "want"', () => {
  const rated = fromImdbCsv(fixture('imdb-ratings.csv'));
  assert.deepEqual(rated.map((e) => [e.ref.imdbId, e.status, e.watches[0].rating, e.watches[0].date]), [
    ['tt15239678', 'watched', 4.5, '2024-03-10'],
    ['tt11280740', 'watched', 5, '2025-04-10'],
    ['tt0000002', 'watched', 0.5, '2020-06-01'],
  ]);
  assert.equal(rated[2].label, 'A Film, With a Comma (2019)');
  const wl = fromImdbCsv(fixture('imdb-watchlist.csv'));
  assert.deepEqual(wl.map((e) => [e.ref.imdbId, e.status]), [['tt0000003', 'want'], ['tt15239678', 'watched']], 'a rated watchlist title counts as watched');
});

test('Letterboxd: each diary viewing is an entry, a bare rating fills in, the watchlist is told by its file name', () => {
  const plan = mergePlan([
    ...fromLetterboxdCsv(fixture('letterboxd-diary.csv'), 'diary.csv'),
    ...fromLetterboxdCsv(fixture('letterboxd-ratings.csv'), 'ratings.csv'),
    ...fromLetterboxdCsv(fixture('letterboxd-reviews.csv'), 'reviews.csv'),
    ...fromLetterboxdCsv(fixture('letterboxd-watchlist.csv'), 'watchlist.csv'),
  ]);
  const by = Object.fromEntries(plan.map((e) => [e.ref.name, e]));
  assert.deepEqual(by['Dune: Part Two'].watches.map((w) => [w.date, w.rating]), [['2024-03-10', 4.5], ['2024-06-01', 5]], 'two viewings; the rating file’s copy isn’t a third');
  assert.deepEqual(by['Past Lives'].watches.map((w) => [w.date, w.rating]), [['2023-07-30', 4]], 'logged without a rating: the rating file fills it in');
  assert.equal(by['Paddington 2'].watches.length, 1);
  assert.match(by['Paddington 2'].watches[0].review, /"marmalade" everywhere\.\nSecond paragraph, with a comma\./);
  assert.equal(by['Perfect Days'].status, 'want');
  assert.equal(by['Perfect Days'].ref.year, 2023);
});

test('MyAnimeList and AniList: statuses, scores out of 10, unknown dates', () => {
  const mal = fromMalXml(fixture('mal-animelist.xml'));
  assert.deepEqual(mal.map((e) => [e.ref.malId, e.status, e.watches[0] ? e.watches[0].rating : null, e.watches[0] ? e.watches[0].date : null]), [
    [52991, 'watched', 5, '2024-03-23'],
    [5114, 'want', null, null],
    [21, 'passed', null, null],
    [1535, 'watched', null, null],
  ], 'Completed is rated; Watching counts as watched but unrated; dropped (4) is passed');
  assert.equal(mal[0].watches[0].review, 'Wonderful.');
  const al = fromAniListEntries([
    { id: 154587, status: 'COMPLETED', score: 9.5, date: '2024-03-23', notes: '' },
    { id: 5114, status: 'PLANNING', score: 0, date: '2023-01-01', notes: '' },
    { id: 21, status: 'DROPPED', score: 3, date: '2022-01-01', notes: '' },
    { id: 1, status: 'SOMETHING_NEW', score: 0, date: null, notes: '' },
  ]);
  assert.deepEqual(al.map((e) => [e.ref.anilistId, e.status, e.watches[0] ? e.watches[0].rating : null]), [[154587, 'watched', 5], [5114, 'want', null], [21, 'passed', null]]);
});

test('AniList usernames: the public list, without custom lists; a missing user says so', async () => {
  const list = { data: { MediaListCollection: { lists: [
    { isCustomList: false, entries: [{ status: 'COMPLETED', score: 8.5, completedAt: { year: 2024, month: 3, day: 23 }, updatedAt: 1700000000, notes: 'Lovely', media: { id: 154587 } }] },
    { isCustomList: true, entries: [{ status: 'COMPLETED', score: 8.5, completedAt: { year: 2024, month: 3, day: 23 }, updatedAt: 1700000000, notes: null, media: { id: 154587 } }] },
    { isCustomList: false, entries: [{ status: 'PLANNING', score: 0, completedAt: { year: null, month: null, day: null }, updatedAt: 1700000000, notes: null, media: { id: 5114 } }] },
  ] } } };
  const anilist = createAniList({ fetchImpl: fakeFetch([['"name":"emma"', list]]) });
  assert.deepEqual(await anilist.userList('emma'), [
    { id: 154587, status: 'COMPLETED', score: 8.5, date: '2024-03-23', notes: 'Lovely' },
    { id: 5114, status: 'PLANNING', score: 0, date: '2023-11-14', notes: '' },
  ]);
  await assert.rejects(anilist.userList('nobody'), /User not found/);
});

test('a Letterboxd name and year finds the right film, a year either side, films before series', () => {
  const t = (id, title, year, kind = 'film') => ({ id, title, year, kind });
  assert.equal(bestMatch([t(1, 'Dune', 1984), t(2, 'Dune', 2021)], 'Dune', 2021).id, 2);
  assert.equal(bestMatch([t(3, 'Past Lives', 2023)], 'Past Lives', 2022).id, 3, 'a year either side');
  assert.equal(bestMatch([t(4, 'The Office', 2005, 'tv'), t(5, 'The Office', 2005)], 'the office', 2005).id, 5);
  assert.equal(bestMatch([t(6, 'Something Else', 2023)], 'Past Lives', 2023), null);
});

test('matching: IMDb ids exactly, Letterboxd names by search, MyAnimeList ids through AniList; misses listed', async () => {
  const dune = { id: 693134, title: 'Dune: Part Two', release_date: '2024-02-27', genre_ids: [878], original_language: 'en', vote_average: 8.1, vote_count: 6000, popularity: 100 };
  const fetchImpl = fakeFetch([
    ['/find/tt15239678', { movie_results: [dune], tv_results: [] }],
    ['/find/', { movie_results: [], tv_results: [] }],
    ['/search/movie', (url) => ({ results: /Paddington/.test(decodeURIComponent(String(url))) ? [{ id: 346648, title: 'Paddington 2', release_date: '2017-11-09', genre_ids: [35], vote_count: 3000, vote_average: 7.6 }] : [] })],
    ['/search/tv', { results: [] }],
    ['idMal_in', { data: { Page: { media: [{ ...JSON.parse(fixture('anilist-frieren.json')).data.Media, idMal: 52991 }] } } }],
  ]);
  const plan = mergePlan([
    ...fromImdbCsv(fixture('imdb-ratings.csv')),
    ...fromLetterboxdCsv(fixture('letterboxd-ratings.csv'), 'ratings.csv'),
    ...fromMalXml(fixture('mal-animelist.xml')).slice(0, 1),
  ]);
  const progress = [];
  const { matched, missed } = await resolvePlan(plan, { tmdb: createTmdb({ key: 'k', fetchImpl }), anilist: createAniList({ fetchImpl }), onProgress: (d, n) => progress.push(`${d}/${n}`) });
  assert.deepEqual(matched.map((m) => m.title.id).sort(), ['anilist:154587', 'tmdb:movie:346648', 'tmdb:movie:693134']);
  assert.equal(matched.find((m) => m.title.id === 'anilist:154587').label, 'Frieren: Beyond Journey’s End', 'anime get their AniList name');
  assert.ok(missed.some((e) => e.label === 'Past Lives (2023)'));
  assert.equal(progress.at(-1), `${plan.length}/${plan.length}`);
});

test('importHistory adds what’s new, never undoes what you did in Binger, and importing twice changes nothing', () => {
  const dune = fromTmdbList({ id: 693134, title: 'Dune: Part Two', release_date: '2024-02-27', genre_ids: [878] }, 'movie');
  const wish = fromTmdbList({ id: 3, title: 'Some Film I Want', release_date: '2023-09-01', genre_ids: [18] }, 'movie');
  const frieren = fromAniList(JSON.parse(fixture('anilist-frieren.json')).data.Media);
  const matched = [
    { title: dune, status: 'watched', watches: [{ date: '2024-03-10', rating: 4.5, review: 'Huge', tags: ['gripping', 'imax'] }, { date: '2024-06-01', rating: 5, review: '', tags: [] }] },
    { title: wish, status: 'want', watches: [] },
    { title: frieren, status: 'passed', watches: [] },
  ];
  // Frieren is already watched in Binger: a "dropped" from elsewhere mustn't hide it.
  const start = L.logWatch(L.emptyState(NOW), frieren, { rating: 5, date: '2024-01-01' }, NOW);
  const first = L.importHistory(start, matched, NOW);
  assert.deepEqual(first.counts, { watched: 1, want: 1, passed: 0, watches: 2, skipped: 1 });
  const d = first.state.items['tmdb:movie:693134'];
  assert.deepEqual(d.watches.map((w) => [w.date, w.rating, w.review, w.tags]), [['2024-03-10', 4.5, 'Huge', ['Gripping']], ['2024-06-01', 5, '', []]], 'only Binger’s own feeling tags are kept');
  assert.equal(first.state.items['tmdb:movie:3'].status, 'want');
  assert.equal(first.state.items['anilist:154587'].status, 'watched');
  const again = L.importHistory(first.state, matched, NOW);
  assert.deepEqual(again.counts, { watched: 0, want: 0, passed: 0, watches: 0, skipped: 3 });
  assert.equal(again.state.items['tmdb:movie:693134'].watches.length, 2);
});

test('the summary says what happened in plain words', () => {
  assert.equal(importSummary({ watched: 412, watches: 430, want: 17, passed: 3, skipped: 6 }),
    'Done: 412 titles watched (430 diary entries), 17 titles added to your watchlist, 3 dropped titles kept out of your deck. 6 were already in your library.');
  assert.equal(importSummary({ watched: 1, watches: 1, want: 0, passed: 0, skipped: 0 }), 'Done: 1 title watched.');
  assert.equal(importSummary({ watched: 0, watches: 0, want: 0, passed: 0, skipped: 2 }), 'Nothing new to add. 2 were already in your library.');
});
