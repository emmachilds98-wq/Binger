// `npm run e2e`: drive the real app in a phone-sized Chromium, start to finish.
// TMDB and AniList are answered from tests/fixtures so the run is repeatable
// and needs no key. Poster images load for real if the network allows.
// Screenshots go to docs/screenshots/.
//
// Needs Playwright (`npm i -g playwright` or a local install). If it isn't
// importable normally, set PLAYWRIGHT_MODULE to its directory.

import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
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
const mdblistJaws = fx('mdblist-movie.json');
const rawFixture = (name) => readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url));
// Severance with season 3 announced: episode 1 airs in 77 days.
const s3Date = new Date(Date.now() + 77 * 86400000).toISOString().slice(0, 10);
const severanceNow = { ...tvDetail, next_episode_to_air: { id: 6001, name: 'Season 3, Episode 1', air_date: s3Date, episode_number: 1, season_number: 3 } };
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
// The typefaces are served by Binger itself (css/fonts.css), not Google Fonts.
const fontRequests = [];
page.on('request', (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) fontRequests.push(r.url()); });
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

// The seeds each AniList deck request asked "more like this" about.
const deckSeeds = [];
await context.route('https://graphql.anilist.co/**', async (route) => {
  const body = route.request().postData() || '';
  let data;
  if (body.includes('trending: Page')) {
    // The deck batch: its "filtered" page answers only when a deck filter is on.
    const vars = JSON.parse(body).variables || {};
    deckSeeds.push(vars.seeds || []);
    data = { ...deckFx.data, filtered: vars.withFiltered ? filtered90s.data.filtered : null };
  }
  else if (body.includes('Staff(id')) data = staffTanezaki.data;
  // Bring your history: a public AniList list for "emma", and lookups by id.
  else if (body.includes('MediaListCollection')) {
    const name = (JSON.parse(body).variables || {}).name;
    if (name !== 'emma') return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'User not found', status: 404 }], data: { MediaListCollection: null } }) });
    data = { MediaListCollection: { lists: [{ isCustomList: false, entries: [{ status: 'COMPLETED', score: 9, completedAt: { year: 2024, month: 3, day: 23 }, updatedAt: 1711152000, notes: 'Wonderful', media: { id: 154587 } }] }] } };
  }
  else if (body.includes('idMal_in')) data = { Page: { media: [{ ...frieren.data.Media, idMal: 52991 }] } };
  else if (body.includes('id_in:')) data = { Page: { media: [frieren.data.Media] } };
  else if (body.includes('search:')) {
    // Like AniList: only titles whose name has the words typed in.
    const q = String((JSON.parse(body).variables || {}).q || '').toLowerCase();
    data = { Page: { media: allAnime.filter((m) => /frieren|attack|vinland/i.test(JSON.stringify(m.title)) && JSON.stringify(m.title).toLowerCase().includes(q)) } };
  }
  else if (body.includes('Media(id')) data = frieren.data;
  else data = { Page: { media: allAnime.slice(0, 12) } };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
});
// The main run plays a copy of Binger without sync (it can't reach Firebase),
// which asks just for a name. The live site's sign-in-only welcome is
// checked on its own below ("Sign in or nothing"), and signing in for real
// by npm run e2e:sync against the Firebase emulators.
const withoutSync = (text) => text.replace(/\n  firebase: \{[\s\S]*?\n  \},/, '\n  firebase: null,');
await context.route('**/js/config.js', async (route) => {
  const res = await route.fetch();
  await route.fulfill({ response: res, body: withoutSync(await res.text()) });
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
  if (p === '/tv/95396') return json(severanceNow);
  if (p === '/find/tt15239678') return json({ movie_results: trending.results.filter((r) => r.id === 693134), tv_results: [] });
  if (p === '/find/tt11280740') return json({ movie_results: [], tv_results: tvList.results });
  if (p.startsWith('/find/')) return json({ movie_results: [], tv_results: [] });
  if (p === '/search/movie') return json(trending);
  if (p === '/search/tv') return json(tvList);
  if (p === '/search/person') {
    const who = /chalamet/i.test(url.searchParams.get('query') || '');
    return json({ results: who ? [{ id: 1190668, name: 'Timothée Chalamet', popularity: 50, known_for_department: 'Acting', profile_path: null, known_for: [{ ...trending.results[0], media_type: 'movie' }] }] : [] });
  }
  // Details for any other listed title: its list entry, with no streaming in GB.
  const other = p.match(/^\/(movie|tv)\/(\d+)$/);
  if (other) {
    const hit = [...trending.results, ...tvList.results].find((r) => String(r.id) === other[2]);
    if (hit) return json({ ...hit, genres: (hit.genre_ids || []).map((id) => ({ id, name: '' })), 'watch/providers': { results: {} } });
  }
  return json({ results: [] });
});
// js/config.js names the owner's real Firebase project. This run must never
// talk to it (sync is tested against the emulators: npm run e2e:sync).
await context.route(/^https:\/\/(identitytoolkit|securetoken|firestore|firebase[a-z]*)\.googleapis\.com\//, (route) => route.abort());
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

console.log('Sign in or nothing (the live site, with sync set up)');
{
  // Its own browser context with the real config: Firebase's servers are
  // blocked, so this checks the screen, not signing in (e2e:sync does that).
  const live = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await live.route(/^https:\/\/(identitytoolkit|securetoken|firestore|firebase[a-z]*)\.googleapis\.com\//, (route) => route.abort());
  await live.route('https://graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Page: { media: [] } } }) }));
  const lp = await live.newPage();
  await lp.goto(base);
  await lp.waitForSelector('.sheet.welcome');
  check(await lp.locator('.sheet.welcome h1').innerText() === 'Welcome to Binger', 'a first visit opens on the welcome');
  check(await lp.getByRole('button', { name: 'Continue with Google' }).count() === 1 && await lp.locator('#welcome-email').count() === 1, 'it offers Google, or email and a password');
  check(!/just my name|later/i.test(await lp.locator('.sheet.welcome').innerText()), 'and no way past without signing in');
  check(await lp.locator('#welcome-code').count() === 1, 'an invite code field joins someone’s household instead of starting a new one');
  await lp.waitForTimeout(400);
  await lp.screenshot({ path: new URL('20-welcome.jpg', SHOTS).pathname, type: 'jpeg', quality: 78 });
  await lp.keyboard.press('Escape');
  await lp.waitForTimeout(300);
  check(await lp.locator('.sheet.welcome').count() === 1, 'Escape doesn’t skip it');
  await lp.getByRole('button', { name: 'Create account' }).click();
  check(/Add your name first/.test(await lp.locator('.sheet.welcome [role=alert]').innerText()), 'a new account needs a name');
  await lp.goto(`${base}#join=abcdefghjkmn`);
  await lp.reload();
  await lp.waitForSelector('.sheet.welcome');
  check(/invited to a household/.test(await lp.locator('.sheet.welcome').innerText()) && await lp.locator('#welcome-code').inputValue() === 'abcd-efgh-jkmn', 'an invite link opens the welcome with its code filled in');
  check(await lp.locator('.sheet.people').count() === 0, 'not People and sync: signing in is the first step');
  // A device that went on with "just a name" before this change: asked to
  // sign in now, keeping what it has.
  await lp.goto(base);
  await lp.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('binger:device'));
    d.welcomed = true;
    d.profiles.list[0].name = 'Emma';
    localStorage.setItem('binger:device', JSON.stringify(d));
    localStorage.setItem(d.profiles.list[0].key, JSON.stringify({ items: { 'anilist:1': { id: 'anilist:1', status: 'want', title: { id: 'anilist:1', source: 'anilist', title: 'Cowboy Bebop', kind: 'anime' }, watches: [] } }, onboarded: true }));
  });
  await lp.reload();
  await lp.waitForSelector('.sheet.welcome');
  check(/Sign in to keep going\. Everything you’ve saved on this device comes with you/.test(await lp.locator('.sheet.welcome').innerText()), 'a device that skipped signing in before is asked now, and told its library comes too');
  await live.close();
}

console.log('First run');
await page.goto(base);
await page.waitForSelector('.sheet.welcome');
await page.evaluate(() => document.fonts.ready);
check(await page.evaluate(() => document.fonts.check('800 30px "Bricolage Grotesque"') && document.fonts.check('600 15px "Instrument Sans"')), 'both typefaces load, from Binger’s own fonts/ folder');
check(await page.locator('#welcome-email').count() === 0, 'a copy of Binger without sync asks just for a name');
await page.keyboard.press('Escape');
check(await page.locator('.sheet.welcome').count() === 1, 'Escape doesn’t skip it');
await page.getByRole('button', { name: 'Continue' }).click();
check(/Add your name first/.test(await page.locator('.sheet.welcome [role=alert]').innerText()), 'it needs a name');
await page.fill('#welcome-name', 'Emma');
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForSelector('.onboarding .tile');
const afterWelcome = await page.evaluate(() => JSON.parse(localStorage.getItem('binger:device')));
check(afterWelcome.welcomed === true && afterWelcome.profiles.list[0].name === 'Emma', 'then the first run, as Emma; the welcome won’t ask again');
check(await page.locator('.onboarding h1').innerText() === 'What have you loved?', 'onboarding opens on first visit');
check(await page.locator('.onboard-import').count() === 1, 'it offers to bring your history in from IMDb, Letterboxd or AniList');
await page.waitForTimeout(800);
await shot('01-onboarding');
const tiles = page.locator('.onboarding .tile');
check((await tiles.count()) >= 6, `onboarding shows popular anime without a key (${await tiles.count()} tiles)`);
// A favourite found by search stays at the top of the grid once you clear it.
await page.fill('#seed-search', 'Frieren');
await page.waitForSelector('.onboarding .tile[aria-label^="Frieren: Beyond Journey’s End Season 2"]');
await page.locator('.onboarding .tile[aria-label^="Frieren: Beyond Journey’s End Season 2"]').click();
await shot('21-onboarding-search');
await page.fill('#seed-search', '');
await page.waitForFunction(() => (document.querySelector('.onboarding .tile')?.getAttribute('aria-label') || '').startsWith('Frieren: Beyond Journey’s End Season 2'));
check(await tiles.first().getAttribute('aria-pressed') === 'true', 'a pick found by search stays at the top, still picked, after the search is cleared');
await tiles.first().click();
await page.fill('#seed-search', 'zzzz');
await page.waitForFunction(() => /Nothing found for “zzzz”/.test(document.querySelector('.onboard-status')?.textContent || ''));
check((await tiles.count()) >= 6, 'a search that finds nothing says so, and keeps the popular grid');
await page.fill('#seed-search', '');
await page.waitForFunction(() => !(document.querySelector('.onboard-status')?.textContent));
const before = await tiles.count();
check(await page.getByRole('button', { name: 'Show more' }).isVisible(), 'the grid offers "Show more"');
await page.getByRole('button', { name: 'Show more' }).click();
await page.waitForFunction(() => document.querySelector('.onboard-more')?.hidden === true);
check((await tiles.count()) === before, '"Show more" hides itself when there’s nothing new (the mock repeats its one page)');
for (let i = 0; i < 3; i++) await tiles.nth(i).click();
check(await page.locator('.onboard-foot [role=status]').innerText() === '3 picked', 'picking three tiles counts them');
const tileNames = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
check(new Set(tileNames).size === tileNames.length, 'no duplicate tiles');
await page.getByRole('button', { name: 'Start swiping' }).click();
await page.waitForSelector('.deck .card');
check((await libraryCount()).watched === 3, 'the three picks are saved as watched and loved');
const pickedIds = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('binger:v1')).items).filter((i) => i.status === 'watched').map((i) => i.title.sourceId));
await page.waitForFunction(() => true);
await page.waitForTimeout(300);
check(deckSeeds.some((seeds) => pickedIds.every((id) => seeds.includes(id))), 'the deck then asks "more like this" about every pick');

console.log('Reviewing first-run picks');
await page.click('a[href="#library"]');
await page.getByRole('tab', { name: /Diary/ }).click();
await page.waitForSelector('.first-picks .row');
check(await page.locator('.first-picks .row').count() === 3, 'Library → Diary lists the three first-run picks to review');
check(await page.locator('.row-title-line', { hasText: 'Picked' }).count() === 3, 'their diary entries say "Picked" where the date would be');
await page.waitForFunction(() => !document.querySelector('#toast .toast'), null, { timeout: 8000 }).catch(() => {});
await shot('26-first-run-picks');
const reviewed = (await page.locator('.first-picks .row-title').first().innerText()).trim();
await page.locator('.first-picks').getByRole('button', { name: `Review ${reviewed}` }).click();
await page.waitForSelector('.rate .stars-input');
check(/review your pick/i.test(await page.locator('.rate').innerText()), 'Review opens the same sheet as "Seen it": stars, how it felt, your thoughts, the date');
await page.locator('.rate .star').nth(4).click();
await page.locator('.rate .pill', { hasText: 'Rewatchable' }).click();
await page.locator('.rate .pill', { hasText: /^Violent$/ }).click();
await page.fill('#review', 'Even better the second time.');
await shot('25-first-run-review');
check(await page.locator('.rate .tag-group-name').allInnerTexts().then((n) => n.length === 4 && n.includes('What didn’t work')), 'feeling tags come in groups, from how it felt to what didn’t work');
await page.locator('.rate .parts summary').click();
await page.getByRole('button', { name: 'Story: Loved' }).click();
await page.getByRole('button', { name: 'Ending: Weak' }).click();
await page.getByRole('button', { name: 'Look: Loved' }).click();
await page.getByRole('button', { name: 'Look: Loved' }).click();
check(await page.locator('.part-btns .pill[aria-pressed="true"]').count() === 2, 'Go deeper: each part loved, fine or weak, and a second tap clears it');
await page.locator('.rate .parts').scrollIntoViewIfNeeded();
await shot('30-go-deeper');
await page.getByRole('button', { name: 'Save review' }).click();
await page.waitForTimeout(300);
check(await page.locator('.first-picks .row').count() === 2, 'once reviewed, it leaves "Picked, not reviewed yet"');
const entry = await page.evaluate((name) => Object.values(JSON.parse(localStorage.getItem('binger:v1')).items).find((i) => i.title.title === name).watches[0], reviewed);
check(entry.rating === 5 && entry.review === 'Even better the second time.' && entry.tags.includes('Rewatchable') && !entry.setup, `and its diary entry has the full review (${entry.rating}★, ${entry.tags.join(', ')})`);
check(JSON.stringify(entry.aspects) === '{"story":1,"ending":-1}' && entry.tags.includes('Violent'), `the parts are saved with it (${JSON.stringify(entry.aspects)})`);
check(await page.locator('.row', { hasText: reviewed }).filter({ hasText: 'Rewatchable · Violent · Loved the story · Weak ending' }).count() === 1, 'the diary row sums the review up: tags, loved and weak parts');

console.log('Log a watch: the first-run panel again');
await page.getByRole('button', { name: 'Log a watch' }).click();
await page.waitForSelector('.log-picker .tile');
check(await page.locator('.log-picker h1').innerText() === 'What have you watched?', 'Library → Log a watch opens the first run’s panel: posters to tap, and search');
const watchedNow = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('binger:v1')).items).filter((i) => i.status === 'watched').map((i) => i.title.title));
const offered = await page.locator('.log-picker .tile').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').replace(/ \((Film|TV|Anime)\)$/, '')));
check(offered.length > 0 && !offered.some((t) => watchedNow.includes(t)), `what you’ve already watched isn’t offered again (${offered.length} titles)`);
check(await page.locator('.log-picker .onboard-foot .btn-primary').isDisabled(), 'nothing picked: nothing to add yet');
await page.fill('.log-picker #seed-search', 'vinland');
await page.waitForSelector('.log-picker .tile[aria-label^="Vinland"]');
await page.locator('.log-picker .tile[aria-label^="Vinland"]').first().click();
check(await page.locator('.log-picker .onboard-foot .btn-primary').innerText() === 'Add 1 to your diary', 'search finds any title to tick, and the button counts it');
await page.waitForTimeout(400);
await shot('28-log-a-watch');
await page.locator('.log-picker .onboard-foot .btn-primary').click();
await page.waitForFunction(() => !document.querySelector('.log-picker'));
await page.waitForFunction(() => [...document.querySelectorAll('.first-picks .row-title')].some((e) => /Vinland/.test(e.textContent)), null, { timeout: 8000 }).catch(() => {});
check(await page.locator('.first-picks .row-title', { hasText: 'Vinland' }).count() === 1, 'it’s in the diary as loved, waiting for a review like a first-run pick');

console.log('When you watched it: roughly is fine');
await page.locator('.first-picks').getByRole('button', { name: /Review Vinland/ }).click();
await page.waitForSelector('.rate .stars-input');
check(await page.locator('#watch-date').isHidden() && await page.locator('#watch-year').isHidden(), 'the date and year pickers stay out of the way until asked for');
await page.locator('.rate .pill', { hasText: 'In a year' }).click();
check(await page.locator('#watch-year').isVisible(), '"In a year" offers a year');
await page.selectOption('#watch-year', '2014');
await page.waitForTimeout(200);
await shot('29-when-you-watched');
await page.getByRole('button', { name: 'Save review' }).click();
await page.waitForTimeout(300);
const vinland = () => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('binger:v1')).items).find((i) => /Vinland/.test(i.title.title)).watches[0]);
const inYear = await vinland();
check(inYear.when === 'year' && inYear.date === '2014-01-01', `"In a year" keeps just the year (${inYear.date}, ${inYear.when})`);
check(await page.locator('#view h2.month', { hasText: 'Sometime in 2014' }).count() === 1 && await page.locator('.row-title-line', { hasText: 'Vinland' }).innerText().then((t) => /2014/.test(t)), 'the diary files it under "Sometime in 2014"');
await page.getByRole('button', { name: /Edit your entry for Vinland/ }).click();
await page.waitForSelector('.rate .stars-input');
check(await page.locator('.rate .pill[aria-pressed="true"]', { hasText: 'In a year' }).count() === 1 && await page.inputValue('#watch-year') === '2014', 'editing it again shows the year it was given');
await page.locator('.rate .pill', { hasText: 'Ages ago' }).click();
await page.getByRole('button', { name: 'Save changes' }).click();
await page.waitForTimeout(300);
const ages = await vinland();
check(ages.when === 'ages' && await page.locator('#view h2.month', { hasText: 'Ages ago' }).count() === 1 && /Ages ago/.test(await page.locator('.row-title-line', { hasText: 'Vinland' }).innerText()), '"Ages ago" goes at the bottom of the diary, as "Ages ago"');
await page.click('a[href="#discover"]');
await page.waitForSelector('.deck .card');

console.log('Settings from any page');
for (const where of ['discover', 'library', 'taste']) {
  await page.goto(`${base}#${where}`);
  await page.waitForTimeout(200);
  await page.locator('#settings-tab').click();
  await page.waitForSelector('.sheet.settings');
  check(await page.locator('.sheet.settings h1').innerText() === 'Settings', `the Settings button in the tab bar opens Settings from ${where[0].toUpperCase()}${where.slice(1)}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

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
const posterSet = await page.locator('.deck .card:last-of-type .card-art img').getAttribute('srcset');
check(/\/w342\/\S+ 342w, .*\/w780\/\S+ 780w/.test(posterSet || ''), 'a film poster offers TMDB’s sizes, so a phone fetches a smaller one');
check(await page.locator('.deck .card:last-of-type .play-btn').count() === 1, 'the film card has a trailer clip button');
await page.locator('.deck .card:last-of-type .play-btn').click();
check(await page.locator('.deck .card:last-of-type .clip iframe').count() === 1, 'tapping play starts the clip inside the card');
await page.getByRole('button', { name: 'Stop clip' }).click();
check(await page.locator('.deck .card:last-of-type .clip').count() === 0, 'the clip can be stopped');

// The pills combine: Films and TV together, no anime.
await page.getByRole('button', { name: 'TV', exact: true }).click();
await page.waitForSelector('.deck .card');
const pressed = await page.locator('.pills .pill[aria-pressed="true"]').allInnerTexts();
check(pressed.join(',') === 'Films,TV', `Films and TV can be picked together (${pressed.join(', ')})`);
const kindsShown = await page.locator('.deck .card .badge').evaluateAll((els) => els.map((e) => e.className));
check(kindsShown.length > 0 && kindsShown.every((c) => !/badge-anime/.test(c)), 'with Films and TV picked, no anime cards show');
await page.getByRole('button', { name: 'Anime', exact: true }).click();
check((await page.locator('.pills .pill[aria-pressed="true"]').allInnerTexts()).join(',') === 'All', 'picking all three kinds goes back to All');
await page.getByRole('button', { name: 'Films', exact: true }).click();
await page.getByRole('button', { name: 'Films', exact: true }).click();
check((await page.locator('.pills .pill[aria-pressed="true"]').allInnerTexts()).join(',') === 'All', 'unpicking the last kind goes back to All');

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
// Speed as well as distance (js/ui/gesture.js): a short quick flick swipes;
// the same short drag done slowly springs back.
const shortDrag = async (dx, pauseMs) => {
  const b = await page.locator('.deck .card:last-of-type').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 3);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(b.x + b.width / 2 + (i * dx) / 4, b.y + b.height / 3);
    if (pauseMs) await page.waitForTimeout(pauseMs);
  }
  await page.mouse.up();
  await page.waitForTimeout(450);
};
await shortDrag(-72, 80);
check((await libraryCount()).passed === 0 && (await page.locator('.deck .card:last-of-type h2').innerText()) === second, 'a slow short drag springs back');
await shortDrag(-72, 0);
check((await libraryCount()).passed === 1, 'a quick short flick passes the card');
await page.getByRole('button', { name: 'Undo last swipe' }).click();
await page.waitForTimeout(300);

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
// Watched by now: three first-run picks, Vinland Saga (Log a watch) and this one.
check(after.watched === 5, `"${rated}" is saved to the diary with a rating`);

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
const loveSection = await page.locator('.taste section', { hasText: 'What you love in a watch' }).innerText().catch(() => '');
check(/Violent/.test(loveSection) && /parts you rate highest: story/.test(loveSection), 'Taste sums up your feeling tags and the parts you rate highest');

console.log('Persistence');
await page.reload();
await page.waitForSelector('.view');
const persisted = await libraryCount();
check(persisted.want === 1 && persisted.watched === 5, 'everything is still there after a reload');
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
check(/themoviedb\.org\/movie\/693134.*\/watch/.test(await page.locator('.detail a.watch-btn').getAttribute('href') || ''), 'a "Where to watch it" button goes to the title’s legal watch options');
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

console.log('Search by service');
await page.goto(base + '#discover');
await page.getByRole('button', { name: 'Search', exact: true }).click();
await page.fill('#search-q', 'apple tv');
await page.waitForSelector('.search .search-service');
check(/Apple TV\+ shows and films first/.test(await page.locator('.search .search-service').innerText()), 'typing "apple tv" says Apple TV+’s shows come first');
check(await page.locator('.search .row-title').first().innerText() === 'Severance', 'and Severance (an Apple original) leads the results');
await shot('22-search-service');
await page.fill('#search-q', 'timothée chalamet');
await page.waitForSelector('.search .search-people .row-title');
check(await page.locator('.search .search-people .row-title').first().innerText() === 'Timothée Chalamet', 'typing an actor’s name brings them up');
check(/known for Dune: Part Two/.test(await page.locator('.search .search-people').innerText()), 'with what they’re known for');
await shot('23-search-person');
await page.getByRole('button', { name: 'Timothée Chalamet: see their films and shows' }).click();
await page.waitForSelector('.person-sheet .row-title');
check(/Timothée Chalamet/.test(await page.locator('.person-sheet .detail-title').innerText()), 'and tapping them opens their films and shows, best for you first');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('New seasons');
await page.goto(base + '#discover');
await page.getByRole('button', { name: 'Search', exact: true }).click();
await page.fill('#search-q', 'Severance');
await page.getByRole('button', { name: 'Seen Severance: rate it' }).first().click();
await page.waitForSelector('.rate .stars-input');
await page.locator('.rate .star').nth(4).click();
await page.locator('.rate .pill', { hasText: 'On a date' }).click();
await page.fill('#watch-date', '2025-04-10');
await page.getByRole('button', { name: 'Save to diary' }).click();
await page.keyboard.press('Escape');
await page.click('a[href="#library"]');
await page.getByRole('tab', { name: /Watchlist/ }).click();
await page.waitForSelector('.alerts .row', { timeout: 8000 }).catch(() => {});
const alertText = await page.locator('.alerts').innerText().catch(() => '');
check(/Severance/.test(alertText) && /Season 3 · starts \d+ \w{3}/.test(alertText), `Library shows "Back with new episodes": ${alertText.split('\n').slice(1, 3).join(' / ')}`);
check(/You watched it in April 2025/.test(alertText), 'it says when you last watched');
check(await page.locator('#tabbar .tab.has-alert[data-tab="library"]').count() === 1, 'the Library tab wears a dot');
await shot('11-new-seasons');
await page.getByRole('button', { name: "Not interested in Severance's new season" }).click();
await page.waitForTimeout(300);
check(await page.locator('.alerts').count() === 0 && await page.locator('#tabbar .tab.has-alert').count() === 0, '✕ dismisses it, and the dot goes');
const dismissed = await page.evaluate(() => JSON.parse(localStorage.getItem('binger:v1')).items['tmdb:tv:95396'].dismissed);
check(JSON.stringify(dismissed) === '["s3"]', 'the dismissal is saved for that season only');

console.log('Taste over time');
// Six months of history: Horror loved early then soured on, Comedy loved
// lately, a couple of long films called Slow, one thing called Overhyped.
await page.evaluate(async () => {
  const L = await import('/js/state/library.js');
  const DAY = 86400000;
  const now = Date.now();
  let s = L.migrate(JSON.parse(localStorage.getItem('binger:v1')));
  const film = (i, genres, runtime = 95) => ({ id: `tmdb:movie:${9000 + i}`, source: 'tmdb', sourceId: 9000 + i, mediaType: 'movie', kind: 'film', title: `Test film ${i}`, genres, year: 2020, runtime, detailed: true });
  const log = (t, daysAgo, rating, tags = []) => {
    const at = now - daysAgo * DAY;
    s = L.logWatch(s, t, { rating, tags, date: new Date(at).toISOString().slice(0, 10) }, at);
  };
  [170, 160, 150, 140].forEach((d, i) => log(film(i, ['Horror']), d, 5));
  [40, 30, 20].forEach((d, i) => log(film(10 + i, ['Horror']), d, 1));
  [100, 60, 35, 25, 15, 5].forEach((d, i) => log(film(20 + i, ['Comedy']), d, 5, i === 5 ? ['Funny', 'Moving'] : ['Funny']));
  log(film(30, ['Drama'], 170), 50, 2, ['Slow']);
  log(film(31, ['Drama'], 165), 12, 2, ['Slow']);
  log(film(32, ['Action'], 120), 8, 3, ['Overhyped']);
  localStorage.setItem('binger:v1', JSON.stringify(s));
});
await page.goto(base + '#taste');
await page.reload();
await page.waitForSelector('.trends .trend-row', { timeout: 8000 }).catch(() => {});
const trendRows = await page.locator('.trends .trend-row').allInnerTexts();
const trendOf = (g) => (trendRows.find((r) => r.startsWith(g)) || '').replace(/\s+/g, ' ');
check(trendRows.length >= 2, `"How your taste has moved" shows a row per genre (${trendRows.length})`);
check(/Rising/.test(trendOf('Comedy')) && /Fading/.test(trendOf('Horror')), `trends in words: Comedy ${trendOf('Comedy').split(' ').slice(-1)}, Horror ${trendOf('Horror').split(' ').slice(-1)}`);
await page.locator('.trends .trend-row', { hasText: 'Comedy' }).click();
check(/\w{3} \d+ · \w{3} \d+/.test(await page.locator('.trends .trend-row', { hasText: 'Comedy' }).innerText()), 'tapping a row shows its month-by-month numbers');
check(await page.locator('.taste table.sr-only td').count() > 0, 'the same numbers are in a table for screen readers');
const how = await page.locator('.taste-section', { hasText: 'How you like to watch' }).innerText().catch(() => '');
check(/Sweet spot/.test(how) && /Funny ×6/.test(how), 'how you like to watch: sweet spot and feeling-tag counts');
check(/Slow, so long films count against them/.test(how) && /Overhyped, so "Trending this week" counts for less/.test(how), 'one plain line each on what Slow and Overhyped do');
await shot('12-taste-time');

console.log('Bring your history');
await page.goto(base + '#taste');
await page.getByRole('button', { name: 'Settings' }).first().click();
// Open the sheet and put the cursor in the AniList field in the same moment
// (the worst case for the sheet focusing itself a frame later), then give it
// two frames: the cursor must still be there. It used to be taken back, and
// Enter then went nowhere (CI caught it intermittently).
const keptFocus = await page.evaluate(async () => {
  [...document.querySelectorAll('button')].find((b) => /Bring your history/.test(b.textContent)).click();
  document.querySelector('#anilist-user').focus();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return document.activeElement && document.activeElement.id;
});
check(keptFocus === 'anilist-user', `typing straight into a sheet keeps the cursor there (${keptFocus || 'nothing'})`);
const statusText = () => page.locator('.import-status').innerText();
const finished = () => page.waitForFunction(() => /^(Done|Nothing new)|not found|private|couldn/i.test(document.querySelector('.import-status')?.textContent || ''), null, { timeout: 15000 });
const watchedBefore = (await libraryCount()).watched;
await page.fill('#anilist-user', 'nobody');
await page.keyboard.press('Enter');
await finished();
check(/User not found/.test(await statusText()), 'an AniList name that doesn’t exist says so');
await page.fill('#anilist-user', 'emma');
await page.locator('.import').getByRole('button', { name: 'Import', exact: true }).click();
await finished();
check(/^(Done|Nothing new)/.test(await statusText()), `an AniList username imports its list: “${await statusText()}”`);
const frierenEntry = await page.evaluate(() => (JSON.parse(localStorage.getItem('binger:v1')).items['anilist:154587'] || { watches: [] }).watches.find((w) => w.date === '2024-03-23'));
check(!!frierenEntry && frierenEntry.rating === 4.5 && frierenEntry.review === 'Wonderful', 'Frieren arrives with its AniList score (9 → 4½★), finish date and notes');
await page.locator('.import').getByRole('button', { name: 'Undo import' }).click();
await page.waitForTimeout(300);
check(await page.evaluate(() => !(JSON.parse(localStorage.getItem('binger:v1')).items['anilist:154587'] || { watches: [] }).watches.some((w) => w.date === '2024-03-23')), 'Undo import takes it back out');
check(/Undone/.test(await statusText()), 'and says so');
await page.setInputFiles('#history-file', [
  { name: 'ratings.csv', mimeType: 'text/csv', buffer: rawFixture('imdb-ratings.csv') },
  { name: 'animelist_123.xml.gz', mimeType: 'application/gzip', buffer: gzipSync(rawFixture('mal-animelist.xml')) },
  { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
]);
await finished();
const summary = await statusText();
// Earlier in this run Severance was logged with the very date and rating in
// the IMDb file, and Frieren was already watched: the import adds Dune, a
// new diary entry for Frieren, and skips Severance rather than doubling it.
check(/^Done: 1 title watched \(2 diary entries\)\. 1 was already in your library\.$/.test(summary), `IMDb ratings and a gzipped MyAnimeList export import together: “${summary}”`);
const severance = await page.evaluate(() => JSON.parse(localStorage.getItem('binger:v1')).items['tmdb:tv:95396']);
check(severance.watches.filter((w) => w.date === '2025-04-10').length === 1, 'a viewing already in the diary isn’t added twice');
check(/4 titles couldn.t be found/.test(await page.locator('.import-missed summary').innerText()), 'what couldn’t be found is listed (an obscure film, three anime the mock doesn’t know)');
check(/Not an export Binger knows: notes\.txt/.test(await page.locator('.import-outcome').innerText()), 'a file that isn’t an export is named, not guessed at');
const duneEntry = await page.evaluate(() => JSON.parse(localStorage.getItem('binger:v1')).items['tmdb:movie:693134']);
check(duneEntry && duneEntry.status === 'watched' && duneEntry.watches.some((w) => w.date === '2024-03-10' && w.rating === 4.5), 'Dune: Part Two arrives from IMDb as 4½★ on 10 March 2024');
check((await libraryCount()).watched === watchedBefore + 1, 'the library grows by what was new (Dune)');
await shot('27-import');
await page.locator('.import').getByRole('button', { name: 'Done' }).click();
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('People: you and Dave');
await page.goto(base + '#taste');
await page.getByRole('button', { name: 'Settings' }).first().click();
await page.getByRole('button', { name: /Who uses Binger, and sync/ }).click();
await page.getByRole('button', { name: 'Add a person' }).click();
// No "What's your name?" first: the welcome already asked.
await page.fill('#person-name', 'Dave');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const people = await page.locator('.people .person-row .row-title').allInnerTexts();
check(JSON.stringify(people) === '["Emma","Dave"]', `Emma (named on the welcome) adds Dave (${people.join(', ')})`);
check(/Sync across devices/i.test(await page.locator('.people').innerText()), 'the sheet offers sync across devices');
await shot('13-people');
const wantsBefore = (await libraryCount()).watched;
await page.locator('.people .person-row', { hasText: 'Dave' }).getByRole('button', { name: 'Switch' }).click();
await page.waitForSelector('.onboarding', { timeout: 8000 }).catch(() => {});
check(await page.locator('.onboarding').count() === 1, 'switching to Dave starts his own first run');
await page.getByRole('button', { name: 'Skip' }).click();
await page.waitForSelector('.who-chip');
check((await page.locator('.who-chip').first().getAttribute('aria-label')) === 'Watching as Dave. Switch person', 'the chip says whose library this is');
check((await page.locator('.who-chip').first().textContent()).includes('Dave'), 'and carries his name and colour (just the initial on a narrow phone)');
await page.reload();
await page.waitForSelector('.who .who-tile', { timeout: 8000 }).catch(() => {});
check(await page.locator('.who .who-tile').count() === 3, '"Who\u2019s watching?" asks on open, with Emma, Dave and Add a person');
await shot('14-whos-watching');
await page.locator('.who .who-tile', { hasText: 'Emma' }).click();
await page.waitForSelector('.who-chip');
await page.waitForTimeout(300);
check((await page.locator('.who-chip').first().getAttribute('aria-label')).includes('Emma') && (await libraryCount()).watched === wantsBefore, 'back to Emma, with her library untouched');

console.log('Wider screens (docs/DESIGN.md → PC and tablet layout)');
// Nothing on the page may stick out past the right edge, at any size.
// Returns '' when everything fits, else what sticks out (for the message).
const overflowing = () => page.evaluate(() => {
  const over = [...document.querySelectorAll('#view *, .sheet *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1);
  const page = document.documentElement.scrollWidth > innerWidth + 1 ? ['the page itself'] : [];
  return [...page, ...over.slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} (${e.textContent.trim().slice(0, 30)})`)].join(', ');
});
const fits = async (where) => {
  const over = await overflowing();
  check(!over, `nothing ${where} is wider than the screen${over ? `: ${over}` : ''}`);
};
const rectOf = (sel) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, top: r.top, bottom: r.bottom }; });
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(base + '#discover');
await page.waitForSelector('.deck .card');
await page.waitForSelector('.deck-side .detail-title');
const rail = await page.evaluate(() => getComputedStyle(document.getElementById('tabbar')).flexDirection);
check((await rectOf('#settings-tab')).bottom > (await rectOf('#tabbar a[data-tab="taste"]')).bottom + 200, 'Settings sits at the foot of the side rail');
check(rail === 'column' && (await rectOf('#tabbar')).right <= (await rectOf('#view')).left + 1, 'on a PC the tabs are a side rail on the left');
const topName = await page.locator('.deck .card:last-of-type h2').innerText();
check(await page.locator('.deck-side .detail-title').innerText() === topName, `the top card's details sit beside the deck (${topName})`);
check(await page.locator('.key-hint').first().isVisible(), 'each deck button shows its key when there’s a mouse');
await fits('at 1280 px');
await page.waitForTimeout(400);
await shot('15-desktop-discover');
await page.keyboard.press('ArrowRight');
await page.waitForFunction((was) => {
  const t = document.querySelector('.deck-side .detail-title');
  return t && t.textContent !== was;
}, topName, { timeout: 8000 }).catch(() => {});
const nextName = await page.locator('.deck .card:last-of-type h2').innerText();
check(nextName !== topName && await page.locator('.deck-side .detail-title').innerText() === nextName, `the details follow the top card after a swipe (${nextName})`);
await page.keyboard.press('?');
await page.waitForSelector('.sheet.shortcuts');
await page.waitForTimeout(400); // let it finish sliding in
const dlg = await rectOf('.sheet.shortcuts');
check(Math.abs((dlg.left + dlg.right) / 2 - 640) < 2 && Math.abs((dlg.top + dlg.bottom) / 2 - 400) < 2, '? opens the shortcuts as a window in the middle of the screen');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('/');
await page.waitForSelector('.sheet.search');
check(true, '/ opens search');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'More about this title' }).click();
await page.waitForSelector('.sheet.detail .detail-title');
const detailBox = await rectOf('.sheet.detail');
check(detailBox.width <= 760 && detailBox.top >= 23, `the detail sheet is a centred panel, not edge to edge (${Math.round(detailBox.width)} px wide)`);
await page.waitForTimeout(400);
await shot('16-desktop-detail');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.goto(base + '#library');
await page.waitForSelector('#view .rows');
const libCols = await page.locator('#view .rows').first().evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
check(libCols >= 2, `Library rows sit in columns (${libCols})`);
await fits('on Library at 1280 px');
await shot('17-desktop-library');
await page.goto(base + '#taste');
await page.waitForSelector('.taste');
check(await page.locator('.taste').evaluate((e) => getComputedStyle(e).columnCount) === '2', 'Taste flows into two columns');
await fits('on Taste at 1280 px');
await shot('18-desktop-taste');

await page.setViewportSize({ width: 768, height: 1024 });
await page.goto(base + '#discover');
await page.waitForSelector('.deck .card');
// Crossing the 900 px line re-renders Discover when the browser reports the
// new width (a matchMedia change event), which can land just after the hash
// change: wait for it rather than measuring mid-way.
await page.waitForFunction(() => !document.querySelector('.deck-side'), null, { timeout: 5000 }).catch(() => {});
const tabletDeck = await rectOf('.discover-main');
check(await page.locator('.deck-side').count() === 0 && tabletDeck.width <= 480 && Math.abs((tabletDeck.left + tabletDeck.right) / 2 - 384) < 2, 'on a tablet the deck stays phone-sized in the middle, with the tab bar below');
await fits('at 768 px');

await page.setViewportSize({ width: 360, height: 640 });
await page.goto(base + '#discover');
await page.waitForSelector('.deck .card');
await page.waitForFunction(() => !document.querySelector('.deck-side'), null, { timeout: 5000 }).catch(() => {});
const phoneTabs = await page.evaluate(() => getComputedStyle(document.getElementById('tabbar')).flexDirection);
check(phoneTabs === 'row' && await page.locator('.deck-side').count() === 0 && !(await page.locator('.key-hint').first().isVisible()), 'on a small phone it is the phone layout: tabs at the bottom, no side panel, no key hints');
const faces = await page.locator('.deck .card:last-of-type .people-row .person').evaluateAll((els) => ({ all: els.length, shown: els.filter((e) => getComputedStyle(e).display !== 'none').length }));
check(faces.shown === Math.min(2, faces.all), `on a small phone a card shows two faces, not three (${faces.shown} of ${faces.all})`);
await fits('at 360 px');
await page.waitForTimeout(400);
await shot('19-small-phone');
// After a few saves, Binger offers the home screen once. Chromium's own
// prompt event is stood in for here; Install hands over to it.
check(await page.evaluate(() => JSON.parse(localStorage.getItem('binger:device')).installAsked !== true), 'nothing has offered the home screen yet (no prompt from this browser)');
await page.evaluate(() => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = () => { window.__installPrompted = true; };
  window.dispatchEvent(e);
});
await page.waitForSelector('.toast');
check(/home screen/.test(await page.locator('.toast').innerText()), 'once the browser can install it, Binger offers the home screen');
await page.locator('.toast').getByRole('button', { name: 'Install' }).click();
check(await page.evaluate(() => window.__installPrompted === true && JSON.parse(localStorage.getItem('binger:device')).installAsked === true), 'Install opens the browser’s own prompt, and it won’t ask again');

console.log('Share a title');
await page.goto(base + '#title/tmdb:movie:693134');
await page.waitForSelector('.sheet.detail .detail-title');
check(await page.locator('.sheet.detail .detail-title').innerText() === 'Dune: Part Two' && await page.evaluate(() => location.hash) === '#discover', 'a shared link (#title/…) opens that title');
await page.evaluate(() => { navigator.share = async (d) => { window.__shared = d; }; });
await page.locator('.sheet.detail .share-btn').click();
const sharedLink = await page.evaluate(() => window.__shared);
check(!!sharedLink && /#title\/tmdb%3Amovie%3A693134$/.test(sharedLink.url) && /Dune: Part Two/.test(sharedLink.text), 'Share hands over a link straight back to the title');
await page.keyboard.press('Escape');
await page.waitForTimeout(350);
await page.setViewportSize({ width: 390, height: 844 });

check(fontRequests.length === 0, `nothing was fetched from Google Fonts${fontRequests.length ? `: ${fontRequests[0]}` : ''}`);
check(errors.length === 0, `no script errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

console.log('Keys built into the site: TMDB, and review scores');
// The live site has a TMDB key built in (scripts/build-site.mjs): Settings
// has no key field there, and nothing saved on a device can override it.
// With an MDBList key built in too, films and series show review scores.
const built = await context.newPage();
await built.setViewportSize({ width: 390, height: 844 });
const keysUsed = [];
built.on('request', (r) => { if (r.url().startsWith('https://api.themoviedb.org/')) keysUsed.push(new URL(r.url()).searchParams.get('api_key')); });
await built.route('**/js/config.js', async (route) => {
  const res = await route.fetch();
  await route.fulfill({ response: res, body: withoutSync((await res.text()).replace("tmdbKey: ''", "tmdbKey: 'e2e-test-key'").replace("mdblistKey: ''", "mdblistKey: 'e2eMdblistKey'")) });
});
// MDBList's documented example (Jaws), plus an audience score, for any title.
await built.route('https://api.mdblist.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ ...mdblistJaws, ratings: [...mdblistJaws.ratings, { source: 'popcorn', value: 90, score: 90, votes: 250000, url: '/m/jaws' }] }) }));
const setSavedKeys = (key) => built.evaluate((k) => {
  for (const name of Object.keys(localStorage).filter((n) => n.startsWith('binger:'))) {
    try {
      const v = JSON.parse(localStorage.getItem(name));
      if (v && v.settings) v.settings.tmdbKey = k;
      if (v && 'tmdbKey' in v) v.tmdbKey = k;
      localStorage.setItem(name, JSON.stringify(v));
    } catch { /* not JSON */ }
  }
}, key);
await built.goto(base + '#discover');
await setSavedKeys('wrong-key');
await built.reload();
await built.waitForTimeout(500);
if (await built.locator('.who .who-tile').count()) await built.locator('.who .who-tile', { hasText: 'Emma' }).click();
await built.waitForSelector('.deck .card');
await built.getByRole('button', { name: 'Search', exact: true }).click();
await built.fill('#search-q', 'Dune');
await built.locator('.search .row-main', { hasText: /^Dune: Part Two/ }).first().click();
await built.waitForSelector('.detail .scores');
const scoreText = await built.locator('.detail .scores').innerText();
check(/IMDb 8\.1/.test(scoreText) && /RT critics 97%/.test(scoreText) && /RT audience 90%/.test(scoreText), `details show review scores: ${scoreText.replace(/\s+/g, ' ')}`);
check((await built.locator('.detail .scores a', { hasText: 'IMDb' }).getAttribute('href')) === 'https://www.imdb.com/title/tt0073195/', 'each score opens its own site (IMDb here)');
await built.waitForTimeout(300);
await built.screenshot({ path: new URL('24-review-scores.jpg', SHOTS).pathname, type: 'jpeg', quality: 78 });
await built.keyboard.press('Escape');
await built.keyboard.press('Escape');
await built.waitForTimeout(200);
await built.click('a[href="#taste"]');
await built.getByRole('button', { name: 'Settings' }).first().click();
await built.waitForSelector('.settings .settings-body');
check(await built.locator('#tmdb-key').count() === 0 && !/TMDB key/.test(await built.locator('.settings').innerText()), 'with a key built into the site, Settings has no TMDB key section');
check(keysUsed.length > 0 && keysUsed.every((k) => k === 'e2e-test-key'), `the built-in key is used, even with another saved on the device (${keysUsed.length} TMDB calls)`);
await setSavedKeys('e2e-test-key');
await built.close();

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
