import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleText, knownLine, rowNote } from '../js/ui/person.js';
import { buildProfile, scoreTitle } from '../js/engine/index.js';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const chalamet = { id: 'tmdb:p:1190668', name: 'Timothée Chalamet', character: 'Laurie' };
const lw = { id: 'tmdb:movie:331482', source: 'tmdb', kind: 'film', title: 'Little Women', year: 2019, genres: ['Drama'], cast: [chalamet], crew: [], score: 7.9, votes: 9000 };
const watched = (t, rating) => ({ id: t.id, title: t, status: 'watched', updatedAt: '2026-10-01', watches: [{ id: 'w', date: '2026-10-01', rating }] });

test('roles read as characters ("as Laurie") or as jobs ("Director")', () => {
  assert.equal(roleText('Laurie'), 'as Laurie');
  assert.equal(roleText('Director'), 'Director');
  assert.equal(roleText('Willy Wonka, Screenplay'), 'Willy Wonka, Screenplay');
  assert.equal(roleText(null), null);
});

test('"In Little Women, which you loved" comes from your own history', () => {
  const p = buildProfile([watched(lw, 4.5)], { now: NOW });
  assert.equal(knownLine(chalamet.id, p), 'In Little Women, which you loved');
  assert.equal(knownLine('tmdb:p:999', p), null);
  const meh = buildProfile([watched(lw, 3)], { now: NOW });
  assert.equal(knownLine(chalamet.id, meh), 'In Little Women, which you watched');
});

test('a row shows your diary or watchlist status, otherwise the match and why', () => {
  const p = buildProfile([watched(lw, 4.5)], { now: NOW });
  const dune = { id: 'tmdb:movie:693134', source: 'tmdb', kind: 'film', title: 'Dune', year: 2021, genres: ['Drama'], cast: [chalamet], crew: [], score: 7.8, votes: 12000 };
  const ranked = { title: dune, ...scoreTitle(dune, p, { now: NOW }) };
  assert.match(rowNote(ranked, null, p).text, /^\d+% match/);
  assert.equal(rowNote(ranked, { status: 'want' }, p).text, 'On your watchlist');
  assert.equal(rowNote(ranked, watched(dune, 4.5), p).text, '★★★★½ in your diary');
  assert.equal(rowNote(ranked, watched(dune, 4.5), p).mine, true);
});
