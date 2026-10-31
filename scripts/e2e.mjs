// `npm run e2e`: drive the real app in a phone-sized Chromium, start to finish.
// TMDB and AniList are answered from tests/fixtures so the run is repeatable
// and needs no key. Poster images load for real if the network allows.
// Screenshots go to docs/screenshots/.
//
// Needs Playwright (`npm i -g playwright` or a local install). If it isn't
// importable normally, set PLAYWRIGHT_MODULE to its directory.

import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch { /* next */ } }
  console.error('Playwright not found. Install it (npm i -g playwright) or set PLAYWRIGHT_MODULE.');
  process.exit(2);
}
const { chromium } = loadPlaywright();

const fx = (name) => JSON.parse(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), 'utf8'));
const deckFx = fx('anilist-deck.json');
const frieren = fx('anilist-frieren.json');
const filtered90s = fx('anilist-filtered-90s.json');
const movieDetail = fx('tmdb-movie-detail.json');
const tvDetail = fx('tmdb-tv-detail.json');
const trending = fx('tmdb-trending-movie.json');
const providersList = fx('tmdb-providers-movie.json');
const personChalamet = fx('tmdb-person.json');
const staffTanezaki = fx('anilist-staff-tanezaki.json');
const duneCollection = fx('tmdb-collection.json');
const tvList = { results: [{ ...tvDetail, genre_ids: tvDetail.genres.map((g) => g.id), media_type: 'tv' }] };
const allAnime = Object.values(deckFx.data).flatMap((p) => p.media.flatMap((m) => (m.recommendations ? m.recommendations.nodes.map((n) => n.mediaRecommendation) : [m])));

const SHOTS = new URL('../docs/screenshots/', import.meta.url);
mkdirSync(SHOTS, { recursive: true });

const failures = [];
function check(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); failures.push(msg); }
}

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', hasTouch: false });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

await context.route('https://graphql.anilist.co/**', async (route) => {
  const body = route.request().postData() || '';
  let data;
  if (body.includes('trending: Page')) {
    // The deck batch: its "filtered" page answers only when a deck filter is on.
    const vars = JSON.parse(body).variables || {};
    data = { ...deckFx.data, filtered: vars.withFiltered ? filtered90s.data.filtered : null };
  }
  else if (body.includes('Staff(id')) data = staffTanezaki.data;
  else if (body.includes('search:')) data = { Page: { media: allAnime.filter((m) => /frieren|attack|vinland/i.test(JSON.stringify(m.title))) } };
  else if (body.includes('Media(id')) data = frieren.data;
  else data = { Page: { media: allAnime.slice(0, 12) } };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
});
await context.route('https://api.themoviedb.org/**', async (route) => {
  const url = new URL(route.request().url());
  const p = url.pathname.replace('/3', '');
  const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (url.searchParams.get('api_key') !== 'e2e-test-key') return route.fulfill({ status: 401, contentType: 'application/json', body: '{"status_message":"Invalid API key"}' });
  if (p === '/configuration') return json({ images: {} });
  if (p.startsWith('/watch/providers/')) return json(providersList);
  if (p === '/person/1190668') return json(personChalamet);
  if (p === '/collection/726871') return json(duneCollection);
  // "What's on these services": like real TMDB, only titles actually on them.
  // In the fixtures that's Dune (on "Netflix Standard with Ads" in GB) and nothing else.
  if (p.startsWith('/discover/') && url.searchParams.has('with_watch_providers')) {
    return json({ results: p === '/discover/movie' ? trending.results.filter((r) => r.id === 693134) : [] });
  }
  if (p === '/trending/movie/week' || p === '/movie/popular' || p === '/discover/movie') return json(trending);
  if (p === '/trending/tv/week' || p === '/tv/popular' || p === '/discover/tv') return json(tvList);
  if (p === '/movie/693134') return json(movieDetail);
  if (p === '/tv/95396') return json(tvDetail);
  if (p === '/search/multi') return json({ results: [...trending.results, ...tvList.results] });
  // Details for any other listed title: its list entry, with no streaming in GB.
  const other = p.match(/^\/(movie|tv)\/(\d+)$/);
  if (other) {
    const hit = [...trending.results, ...tvList.results].find((r) => String(r.id) === other[2]);
    if (hit) return json({ ...hit, genres: (hit.genre_ids || []).map((id) => ({ id, name: '' })), 'watch/providers': { results: {} } });
  }
  return json({ results: [] });
});
await context.route(/youtube-nocookie\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<body style="margin:0;background:#000;color:#888;font:14px sans-serif;display:grid;place-items:center;height:100vh">[YouTube trailer clip]</body>' }));

async function shot(name) {
  // Let posters finish loading (or fail) so screenshots show the real thing.
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: new URL(`${name}.jpg`, SHOTS).pathname, type: 'jpeg', quality: 78 });
}
const libraryCount = () => page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('binger:v1') || '{}');
  const items = Object.values(s.items || {});
  return { want: items.filter((i) => i.status === 'want').length, watched: items.filter((i) => i.status === 'watched').length, passed: items.filter((i) => i.status === 'passed').length };
});

console.log('First run');
await page.goto(base);
await page.waitForSelector('.onboarding .tile');
check(await page.locator('.onboarding h1').innerText() === 'What have you loved?', 'onboarding opens on first visit');
await page.waitForTimeout(800);
await shot('01-onboarding');
const tiles = page.locator('.onboarding .tile');
check((await tiles.count()) >= 6, `onboarding shows popular anime without a key (${await tiles.count()} tiles)`);
for (let i = 0; i < 3; i++) await tiles.nth(i).click();
check(await page.locator('.onboard-foot [role=status]').innerText() === '3 picked', 'picking three tiles counts them');
const tileNames = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
check(new Set(tileNames).size === tileNames.length, 'no duplicate tiles');
await page.getByRole('button', { name: 'Start swiping' }).click();
await page.waitForSelector('.deck .card');
check((await libraryCount()).watched === 3, 'the three picks are saved as watched and loved');

console.log('Adding a TMDB key');
await page.goto(base + '#taste');
await page.getByRole('button', { name: 'Settings' }).first().click();
await page.fill('#tmdb-key', 'wrong-key');
await page.getByRole('button', { name: 'Test & save' }).click();
await page.waitForFunction(() => /didn.t accept/.test(document.querySelector('.settings [role=status]')?.textContent || ''));
check(true, 'a wrong key is rejected with a clear message');
await page.fill('#tmdb-key', 'e2e-test-key');
await page.getByRole('button', { name: 'Test & save' }).click();
await page.waitForFunction(() => /Key works/.test(document.querySelector('.settings [role=status]')?.textContent || ''));
check(true, 'a working key is accepted');
await page.keyboard.press('Escape');
await page.goto(base + '#discover');
await page.waitForSelector('.deck .card');
await page.getByRole('button', { name: 'Films' }).click();
await page.waitForSelector('.deck .card .badge-film');
await page.waitForFunction(() => document.querySelector('.deck .card:last-of-type .people'));
await page.waitForTimeout(600);
await shot('02-discover-film');
const topTitle = await page.locator('.deck .card:last-of-type h2').innerText();
check(topTitle === 'Dune: Part Two', `films filter shows a film on top (${topTitle})`);
check(await page.locator('.deck .card:last-of-type .play-btn').count() === 1, 'the film card has a trailer clip button');
await page.locator('.deck .card:last-of-type .play-btn').click();
check(await page.locator('.deck .card:last-of-type .clip iframe').count() === 1, 'tapping play starts the clip inside the card');
await page.getByRole('button', { name: 'Stop clip' }).click();
check(await page.locator('.deck .card:last-of-type .clip').count() === 0, 'the clip can be stopped');

console.log('Swiping');
await page.getByRole('button', { name: 'All' }).click();
await page.waitForSelector('.deck .card');
const card = page.locator('.deck .card:last-of-type');
const first = await card.locator('h2').innerText();
const box = await card.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 22, box.y + box.height / 3 + i * 2);
await page.mouse.up();
await page.waitForTimeout(500);
check((await libraryCount()).want === 1, `dragging "${first}" right adds it to the watchlist`);
check(await page.locator('.toast').innerText().then((t) => t.includes('Watchlist')).catch(() => false), 'a toast confirms it');
const second = await page.locator('.deck .card:last-of-type h2').innerText();
check(second !== first, 'the next card comes up');
await page.getByRole('button', { name: 'Pass', exact: true }).click();
await page.waitForTimeout(450);
check((await libraryCount()).passed === 1, `the Pass button passes "${second}"`);
await page.getByRole('button', { name: 'Undo last swipe' }).click();
await page.waitForTimeout(300);
check((await page.locator('.deck .card:last-of-type h2').innerText()) === second && (await libraryCount()).passed === 0, 'Undo brings the passed card back');

console.log('Detail');
await page.getByRole('button', { name: 'More about this title' }).click();
await page.waitForSelector('.detail .detail-title');
await page.waitForTimeout(700);
await shot('03-detail');
check(await page.locator('.detail .why li').count() >= 1, 'detail explains why it was picked');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('Rating');
await page.getByRole('button', { name: 'Seen it: rate it' }).click();
await page.waitForSelector('.rate .stars-input');
const rated = await page.locator('.rate .sheet-title').innerText();
await page.locator('.rate .star').nth(4).click();
await page.locator('.rate .star').nth(3).click();
await page.locator('.rate .star').nth(3).click();
check((await page.locator('.rate .rating-word').innerText()).startsWith('3½'), 'tapping a star twice gives a half star');
await page.locator('.rate .star').nth(4).click();
await page.getByRole('button', { name: 'Gripping' }).click();
await page.fill('#review', 'Loved the soundtrack.');
await page.waitForTimeout(200);
await shot('04-rate');
await page.getByRole('button', { name: 'Save to diary' }).click();
await page.waitForTimeout(400);
const after = await libraryCount();
check(after.watched === 4, `"${rated}" is saved to the diary with a rating`);

console.log('Library and taste');
await page.click('a[href="#library"]');
await page.waitForSelector('.row');
check((await page.locator('.seg').first().innerText()).includes('1'), 'watchlist shows one title');
await shot('05-library');
await page.getByRole('tab', { name: /Diary/ }).click();
await page.waitForSelector('.row-review');
check((await page.locator('.row-review').first().innerText()) === 'Loved the soundtrack.', 'diary shows the review');
await page.click('a[href="#taste"]');
await page.waitForSelector('.bars .bar-row');
await shot('06-taste');
check(await page.locator('.bars .bar-row').count() >= 1, 'taste shows learned genres');

console.log('Persistence');
await page.reload();
await page.waitForSelector('.view');
const persisted = await libraryCount();
check(persisted.want === 1 && persisted.watched === 4, 'everything is still there after a reload');
check(await page.locator('.onboarding').count() === 0, 'onboarding does not reappear');

console.log('Deck filters');
await page.goto(base + '#discover');
await page.waitForSelector('.deck .card');
await page.getByRole('button', { name: 'Filters', exact: true }).click();
await page.waitForSelector('.filters .pill');
await page.getByRole('button', { name: 'Quick watches' }).click();
await page.getByRole('button', { name: '1990s' }).click();
await page.waitForTimeout(250);
await shot('07-filters');
check(!/\bnull\b|undefined/.test(await page.locator('.filters').innerText()), 'the filter sheet shows no stray "null" or "undefined" text');
await page.getByRole('button', { name: 'Show cards' }).click();
await page.waitForFunction(() => /Quick watches · 1990s/.test(document.querySelector('.filter-line')?.textContent || ''));
check(true, 'the active filters are summarised under the pills');
await page.waitForFunction(() => /199\d/.test(document.querySelector('.deck .card:last-of-type .card-meta')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
const metas = await page.locator('.deck .card .card-meta').allInnerTexts();
check(metas.length > 0 && metas.every((m) => /\b199\d\b/.test(m)), `every card is from the 1990s (${metas.map((m) => m.split(' · ')[0]).join(', ')})`);
check(await page.getByRole('button', { name: 'Filters (on)' }).count() === 1, 'the filter button shows the filters are on');
await page.getByRole('button', { name: 'Clear', exact: true }).click();
await page.waitForTimeout(300);
check(await page.locator('.filter-line').count() === 0, 'Clear turns the filters off');

console.log('Streaming services');
await page.goto(base + '#taste');
await page.getByRole('button', { name: /Your streaming services/ }).click();
await page.waitForSelector('.services .service-tile');
await page.waitForFunction(() => [...document.querySelectorAll('.services .service-name')].some((e) => e.textContent === 'Disney+'), null, { timeout: 8000 }).catch(() => {});
const serviceNames = await page.locator(".services .service-name").allInnerTexts();
check(serviceNames.includes("Disney+") && !serviceNames.includes("Disney Plus"), 'the region\u2019s services load from TMDB, under one name each ("Disney Plus" shows as "Disney+")');
check(new Set(serviceNames).size === serviceNames.length, "no service appears twice");
await page.locator('.services .service-tile', { hasText: /^Netflix$/ }).first().click();
await page.locator('.services [role=switch]').click();
check(await page.locator('.services .service-tile[aria-pressed="true"]').count() === 1, 'tapping a tile picks it');
check(!serviceNames.includes('Example US Only'), 'services only available in other countries are left out');
await page.locator('.services .page-scroll').evaluate((el) => { el.scrollTop = 0; });
await page.waitForTimeout(250);
await shot('08-services');
await page.getByRole('button', { name: 'Done' }).click();
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('binger:v1')).settings);
check(JSON.stringify(saved.services) === '["Netflix"]' && saved.streamOnly === true, 'Done saves your services and "only what I can stream"');
check(/Netflix · only these/.test(await page.locator('.taste').innerText()), 'Taste shows your services');
await page.goto(base + '#discover');
await page.waitForSelector('.deck .card');
await page.waitForFunction(() => [...document.querySelectorAll('.deck .card h2')].every((e) => e.textContent === 'Dune: Part Two'), null, { timeout: 10000 }).catch(() => {});
const streamTitles = await page.locator('.deck .card h2').allInnerTexts();
check(streamTitles.length > 0 && streamTitles.every((t) => t === 'Dune: Part Two'), `only what's on Netflix is left (${streamTitles.join(', ')})`);
check(await page.locator('.deck .badge-anime').count() === 0, 'anime with no Netflix link is hidden');
await page.getByRole('button', { name: 'More about this title' }).click();
await page.waitForSelector('.detail .where');
check(await page.locator('.detail .provider-yours', { hasText: 'Netflix' }).count() === 1, 'the detail sheet rings your service under "Where to watch"');
const why = await page.locator('.detail .why').innerText().catch(() => '');
console.log(`    (why it was picked: ${why.replace(/\s+/g, ' ').trim()})`);

console.log("A person's work");
await page.getByRole('button', { name: 'Timothée Chalamet: see their other work' }).click();
await page.waitForSelector('.person-sheet .row-title');
check((await page.locator('.person-sheet h1').innerText()) === 'Timothée Chalamet', 'tapping a cast member opens their page');
const personRows = await page.locator('.person-sheet .row-title').allInnerTexts();
check(personRows.length >= 3 && !personRows.includes('The Tonight Show Starring Jimmy Fallon'), `their work is listed, without talk-show appearances (${personRows.length} titles)`);
check(/Willy Wonka, Screenplay/.test(await page.locator('.person-sheet .row', { hasText: 'Wonka' }).first().innerText()), 'two roles on one film are merged into one row');
check(/\d+% match|in your diary|On your watchlist/.test(await page.locator('.person-sheet .row-note').first().innerText()), 'each row says how well it matches you, or your status');
await page.waitForTimeout(250);
await shot('09-person');
check(await page.evaluate(() => [...document.querySelectorAll('.person-sheet *')].every((e) => e.getBoundingClientRect().right <= innerWidth + 1)), 'nothing on the person page is wider than the screen');
check(await page.locator('.person-sheet .row-actions button').count() >= 2, 'rows not in your library have both Seen it and Watchlist buttons');
const firstPerson = personRows[0];
await page.locator('.person-sheet .row-main').first().click();
await page.waitForSelector('.detail .detail-title');
check((await page.locator('.detail .detail-title').last().innerText()) === firstPerson, 'a row opens that title\u2019s details');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Search', exact: true }).click();
await page.fill('#search-q', 'Frieren');
await page.waitForSelector('.search .row-title');
await page.locator('.search .row-main', { hasText: /^Frieren: Beyond Journey/ }).first().click();
await page.waitForSelector('.detail .cast-item');
await page.getByRole('button', { name: 'Atsumi Tanezaki: see their other work' }).click();
await page.waitForSelector('.person-sheet .row-title');
const vaRows = await page.locator('.person-sheet .row').allInnerTexts();
check(vaRows.some((r) => /Frieren[\s\S]*as Frieren/.test(r)), 'a voice actor\u2019s page (AniList) lists their shows with the character they voice');
for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('Not this franchise');
await page.goto(base + '#discover');
await page.waitForFunction(() => document.querySelector('.deck .card:last-of-type h2')?.textContent === 'Dune: Part Two', null, { timeout: 10000 }).catch(() => {});
await page.getByRole('button', { name: 'Pass', exact: true }).click();
const offer = page.getByRole('button', { name: 'Hide all Dune films' });
await offer.waitFor({ timeout: 4000 }).catch(() => {});
check(await offer.count() === 1, 'passing Dune offers "Hide all Dune films"');
await offer.click();
await page.waitForFunction(() => /Dune is hidden/.test(document.querySelector('.toast')?.textContent || ''), null, { timeout: 4000 }).catch(() => {});
const hiddenSeries = await page.evaluate(() => JSON.parse(localStorage.getItem('binger:v1')).settings.hiddenFranchises);
check(hiddenSeries.length === 1 && hiddenSeries[0].name === 'Dune' && hiddenSeries[0].ids.length === 3, `the whole collection is hidden (${hiddenSeries.map((f) => `${f.name}: ${f.ids.length} films`).join(', ')})`);
check(/Dune is hidden/.test(await page.locator('.toast').innerText().catch(() => '')), 'a toast says Dune is hidden, with Undo');
// Let go of "only what I can stream" so the deck moves on, as in the design.
await page.getByRole('button', { name: 'Clear', exact: true }).click();
await page.waitForSelector('.deck .card', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(400);
check(await page.locator('.deck .card h2', { hasText: /^Dune/ }).count() === 0, 'no Dune film comes back into the deck');
await shot('10-hide-series');
await page.click('a[href="#taste"]');
const seriesPill = page.getByRole('button', { name: 'Show Dune again' });
await seriesPill.waitFor({ timeout: 4000 }).catch(() => {});
check(await seriesPill.count() === 1, 'Taste lists Dune under "Never show me"');
await seriesPill.click();
await page.waitForTimeout(200);
check((await page.evaluate(() => JSON.parse(localStorage.getItem('binger:v1')).settings.hiddenFranchises.length)) === 0, 'tapping it shows Dune again');

check(errors.length === 0, `no script errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

console.log('Offline support');
// The run above blocks the service worker (so API mocks apply). Check it on
// its own: it must install and cache every app file.
const swContext = await browser.newContext();
const swPage = await swContext.newPage();
await swPage.goto(base);
const cached = await swPage.evaluate(async () => {
  await navigator.serviceWorker.ready;
  const keys = await caches.keys();
  const shell = keys.find((k) => k.startsWith('binger-shell-'));
  return shell ? (await (await caches.open(shell)).keys()).length : 0;
});
const shellCount = [...readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].length;
check(cached === shellCount, `service worker installed and cached all ${shellCount} app files (${cached})`);
await swContext.setOffline(true);
await swPage.reload();
check(await swPage.locator('#tabbar').count() === 1, 'the app still opens offline');
await swContext.close();

await browser.close();
server.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll end-to-end checks passed. Screenshots in docs/screenshots/.');
