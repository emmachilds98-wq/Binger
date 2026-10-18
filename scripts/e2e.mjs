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
const movieDetail = fx('tmdb-movie-detail.json');
const tvDetail = fx('tmdb-tv-detail.json');
const trending = fx('tmdb-trending-movie.json');
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
  if (body.includes('trending: Page')) data = deckFx.data;
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
  if (p === '/trending/movie/week' || p === '/movie/popular' || p === '/discover/movie') return json(trending);
  if (p === '/trending/tv/week' || p === '/tv/popular' || p === '/discover/tv') return json(tvList);
  if (p === '/movie/693134') return json(movieDetail);
  if (p === '/tv/95396') return json(tvDetail);
  if (p === '/search/multi') return json({ results: [...trending.results, ...tvList.results] });
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
