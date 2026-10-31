// `npm run e2e:sync`: the Firebase live check from docs/FIREBASE.md, run for
// real. Two browsers (Emma's and Dave's) use the real Firebase JS SDK against
// the local Firebase emulators (Auth + Firestore), with this repo's
// firestore.rules loaded. Then the rules are probed directly as a stranger.
//
// Needs Java 11+ and the Firebase CLI. Start the emulators first (from the
// repo root; firebase.json points them at firestore.rules):
//   npx firebase-tools@15 emulators:start --project demo-binger --only auth,firestore
// then, in another terminal: npm run e2e:sync
//
// TMDB and AniList are mocked as in `npm run e2e`; only Firebase is real.

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { startServer } from './serve.mjs';

const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
const PROJECT = 'demo-binger'; // "demo-" projects never reach real Firebase
const FIREBASE = {
  apiKey: 'demo-key', authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT, appId: '1:1:web:1',
  emulators: { auth: `http://${AUTH}`, firestore: FIRESTORE },
};

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch { /* next */ } }
  console.error('Playwright not found. Install it (npm i -g playwright) or set PLAYWRIGHT_MODULE.');
  process.exit(2);
}
const { chromium } = loadPlaywright();

for (const [name, host] of [['Auth', AUTH], ['Firestore', FIRESTORE]]) {
  try { await fetch(`http://${host}/`); } catch {
    console.error(`The Firebase ${name} emulator isn't running on ${host}. Start it first (see the top of this file).`);
    process.exit(2);
  }
}
// A clean slate, so the run can be repeated.
await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const fx = (name) => JSON.parse(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), 'utf8'));
const deckFx = fx('anilist-deck.json');
const frieren = fx('anilist-frieren.json');
const allAnime = Object.values(deckFx.data).flatMap((p) => p.media.flatMap((m) => (m.recommendations ? m.recommendations.nodes.map((n) => n.mediaRecommendation) : [m])));

const failures = [];
const realFirebase = [];
function check(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); failures.push(msg); }
}

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }

// One browser per person, each with Firebase set up the way a pasted config
// would leave it (plus the emulator hosts).
async function person(label) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript((cfg) => {
    if (localStorage.getItem('binger:device')) return;
    localStorage.setItem('binger:device', JSON.stringify({ firebase: cfg }));
  }, FIREBASE);
  await context.route('https://graphql.anilist.co/**', (route) => {
    const body = route.request().postData() || '';
    const data = body.includes('trending: Page') ? { ...deckFx.data, filtered: null }
      : body.includes('Media(id') ? frieren.data
        : { Page: { media: allAnime.slice(0, 12) } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await context.route('https://api.themoviedb.org/**', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('api_key') !== 'e2e-test-key') return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: url.pathname === '/3/configuration' ? '{"images":{}}' : '{"results":[]}' });
  });
  await context.route(/youtube-nocookie\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '' }));
  // Only the emulators: never the real project named in js/config.js.
  await context.route(/^https:\/\/(identitytoolkit|securetoken|firestore|firebase[a-z]*)\.googleapis\.com\//, (route) => { realFirebase.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${label}: ${m.text()}`); });
  return { context, page, errors };
}

const lib = (page) => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('binger:device'));
  const me = d.profiles.list.find((p) => p.id === d.profiles.current);
  const s = JSON.parse(localStorage.getItem(me.key) || '{}');
  const items = Object.values(s.items || {});
  return { who: me.name, want: items.filter((i) => i.status === 'want').map((i) => i.title.title).sort(), tmdbKey: d.tmdbKey || s.settings?.tmdbKey || '' };
});
const openPeople = async (page) => {
  await page.goto(page.url().replace(/#.*$/, '') + '#taste');
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByRole('button', { name: /Who uses Binger, and sync/ }).click();
  await page.waitForSelector('.sheet.people');
};
const createAccount = async (page, email) => {
  await page.waitForSelector('#sync-email');
  await page.fill('#sync-email', email);
  await page.fill('#sync-password', 'binger-test-pw');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForFunction((e) => document.querySelector('.sheet.people')?.textContent.includes(`Signed in as ${e}`), email, { timeout: 15000 })
    .catch(async (err) => {
      console.log(`  (People and sync says: ${await page.locator('.sheet.people').innerText().catch(() => '?')})`);
      throw err;
    });
};
const closeSheets = async (page) => {
  for (let i = 0; i < 4 && await page.locator('.sheet:not(.is-leaving)').count(); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
  }
};
// The emulator's REST API, as an admin ("owner") or as someone signed in.
const docUrl = (path) => `http://${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
const adminGet = async (path) => (await fetch(docUrl(path), { headers: { Authorization: 'Bearer owner' } })).json();
// The emulator accepts unsigned tokens, so a "stranger" is just a made-up uid.
const tokenFor = (uid) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + 3600, firebase: { sign_in_provider: 'password' } })}.`;
};
const as = (uid, method, path, body) => fetch(docUrl(path), {
  method, headers: { Authorization: `Bearer ${tokenFor(uid)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
});

console.log('Emma: sign in and start a household');
const emma = await person('Emma');
await emma.page.goto(base);
// The welcome on a first visit: her name, then "Sync with friends" opens
// People and sync on top of the first run.
await emma.page.waitForSelector('.sheet.welcome');
await emma.page.fill('#welcome-name', 'Emma');
await emma.page.getByRole('button', { name: 'Sync with friends' }).click();
await emma.page.waitForSelector('.sheet.people');
check(await emma.page.locator('.sheet.people').isVisible() && await emma.page.locator('.onboarding').count() === 1, 'the welcome takes her name, then "Sync with friends" opens sign-in over the first run');
await emma.page.keyboard.press('Escape');
await emma.page.waitForTimeout(400);
await emma.page.waitForSelector('.onboarding');
await emma.page.getByRole('button', { name: 'Skip' }).click();
await emma.page.waitForSelector('.deck .card');
await emma.page.waitForTimeout(500);
await emma.page.keyboard.press('ArrowRight');
await emma.page.waitForTimeout(600);
const emmaFirst = (await lib(emma.page)).want;
check(emmaFirst.length === 1, `Emma saves a title before syncing (${emmaFirst.join(', ')})`);
await emma.page.goto(base + '#taste');
await emma.page.getByRole('button', { name: 'Settings' }).first().click();
await emma.page.fill('#tmdb-key', 'e2e-test-key');
await emma.page.getByRole('button', { name: 'Test & save' }).click();
await emma.page.waitForFunction(() => /Key works/.test(document.querySelector('.settings [role=status]')?.textContent || ''));
await emma.page.keyboard.press('Escape');
await openPeople(emma.page);
await createAccount(emma.page, 'emma@example.com');
check(true, 'Emma creates an account (real Firebase Auth SDK, emulated)');
await emma.page.getByRole('button', { name: 'Start a household' }).click();
// No "What's your name?" here: the welcome already asked.
await emma.page.waitForSelector('.invite-code', { timeout: 15000 });
const code = (await emma.page.locator('.invite-code').innerText()).replace(/-/g, '');
check(/^[a-z0-9]{12}$/.test(code), `she gets an invite code (${code})`);
await emma.page.waitForFunction(() => /Synced/.test(document.querySelector('.sync-status')?.textContent || ''), null, { timeout: 15000 });
check(true, 'and the sheet says Synced');
const hh1 = await adminGet(`households/${code}`);
const members1 = (hh1.fields?.members?.arrayValue?.values || []).map((v) => v.stringValue);
check(members1.length === 1, 'Firestore: households/{code} has Emma as its only member');
check(hh1.fields?.tmdbKey?.stringValue === 'e2e-test-key', 'Firestore: her TMDB key is stored for the household');
const emmaId = await emma.page.evaluate(() => JSON.parse(localStorage.getItem('binger:device')).profiles.current);
const emmaDoc = await adminGet(`households/${code}/profiles/${emmaId}`);
const emmaCloud = emmaDoc.fields ? JSON.parse(emmaDoc.fields.state.stringValue) : null;
check(emmaCloud && Object.values(emmaCloud.items).some((i) => i.status === 'want'), 'Firestore: her library is pushed, watchlist and all');
check(emmaCloud && !emmaCloud.settings.tmdbKey, 'the TMDB key is not in her library document');

console.log('Dave: open the invite link, sign in, join');
const dave = await person('Dave');
await dave.page.goto(`${base}#join=${code}`);
await dave.page.waitForSelector('.sheet.people');
check(true, 'the invite link opens People and sync, not the first run');
await createAccount(dave.page, 'dave@example.com');
check(await dave.page.locator('#join-code').inputValue() === code.replace(/(.{4})(?=.)/g, '$1-'), 'the code from the link is already filled in');
await dave.page.getByRole('button', { name: 'Join household' }).click();
await dave.page.waitForSelector('.confirm .sheet-title', { timeout: 15000 });
check(await dave.page.locator('.confirm .sheet-title').innerText() === 'Which one is you?', '"Which one is you?" asks');
const choices = await dave.page.locator('.confirm .btn-primary').allInnerTexts();
check(JSON.stringify(choices) === '["Emma","Someone new"]', `and offers Emma or someone new (${choices.join(', ')})`);
await dave.page.getByRole('button', { name: 'Someone new' }).click();
await dave.page.waitForSelector('#person-name');
await dave.page.fill('#person-name', 'Dave');
await dave.page.keyboard.press('Enter');
await dave.page.waitForSelector('.invite-code', { timeout: 15000 });
await dave.page.waitForTimeout(1500);
const daveLib = await lib(dave.page);
check(daveLib.who === 'Dave', 'Dave is watching as himself');
check(daveLib.tmdbKey === 'e2e-test-key', 'he gets films and TV: the household’s TMDB key arrived');
const hh2 = await adminGet(`households/${code}`);
const members2 = (hh2.fields?.members?.arrayValue?.values || []).map((v) => v.stringValue);
check(members2.length === 2, 'Firestore: households/{code} now has both uids in members');
const names2 = (hh2.fields?.profiles?.arrayValue?.values || []).map((v) => v.mapValue.fields.name.stringValue).sort();
check(JSON.stringify(names2) === '["Dave","Emma"]', `Firestore: the household lists both people (${names2.join(', ')})`);

console.log('Both ways, live');
await dave.page.keyboard.press('Escape');
await dave.page.goto(base + '#discover');
await dave.page.waitForSelector('.who-chip');
await dave.page.locator('.who-chip').first().click();
await dave.page.waitForSelector('.who .who-tile');
const tilesOnDave = await dave.page.locator('.who .who-tile-name').allInnerTexts();
check(tilesOnDave.includes('Emma') && tilesOnDave.includes('Dave'), `"Who's watching?" on Dave's phone shows Emma too (${tilesOnDave.join(', ')})`);
await dave.page.locator('.who .who-tile', { hasText: 'Emma' }).click();
await dave.page.waitForSelector('.deck', { timeout: 15000 });
await dave.page.waitForFunction(() => {
  const d = JSON.parse(localStorage.getItem('binger:device'));
  const me = d.profiles.list.find((p) => p.id === d.profiles.current);
  const s = JSON.parse(localStorage.getItem(me.key) || '{}');
  return Object.values(s.items || {}).some((i) => i.status === 'want');
}, null, { timeout: 15000 }).catch(() => {});
const emmaOnDave = await lib(dave.page);
check(emmaOnDave.who === 'Emma' && JSON.stringify(emmaOnDave.want) === JSON.stringify(emmaFirst), `switching to Emma on Dave's phone shows her watchlist (${emmaOnDave.want.join(', ')})`);
// A change on Dave's phone (as Emma) reaches Emma's browser…
await dave.page.waitForSelector('.deck .card');
await dave.page.waitForTimeout(800);
await dave.page.keyboard.press('ArrowRight');
const t0 = Date.now();
const reached = await emma.page.waitForFunction(() => {
  const d = JSON.parse(localStorage.getItem('binger:device'));
  const me = d.profiles.list.find((p) => p.id === d.profiles.current);
  const s = JSON.parse(localStorage.getItem(me.key) || '{}');
  return Object.values(s.items || {}).filter((i) => i.status === 'want').length === 2;
}, null, { timeout: 15000 }).then(() => true).catch(() => false);
check(reached, `a title saved on the other device appears on Emma's within ${((Date.now() - t0) / 1000).toFixed(1)} s`);
// …and a delete on Emma's reaches Dave's.
const both = (await lib(emma.page)).want;
await closeSheets(emma.page);
await emma.page.goto(base + '#library');
await emma.page.locator('#view .row-main', { hasText: both[0] }).first().click();
await emma.page.getByRole('button', { name: 'Remove', exact: true }).click();
const removed = await dave.page.waitForFunction((gone) => {
  const d = JSON.parse(localStorage.getItem('binger:device'));
  const me = d.profiles.list.find((p) => p.id === d.profiles.current);
  const s = JSON.parse(localStorage.getItem(me.key) || '{}');
  return !Object.values(s.items || {}).some((i) => i.status === 'want' && i.title.title === gone);
}, both[0], { timeout: 15000 }).then(() => true).catch(() => false);
check(removed, `removing "${both[0]}" on Emma's browser removes it on Dave's too`);

console.log("Emma's laptop: sign in with the same account");
const laptop = await person('Laptop');
await laptop.page.goto(base);
await laptop.page.waitForSelector('.sheet.welcome');
await laptop.page.getByRole('button', { name: 'Just me for now' }).click();
await laptop.page.waitForSelector('.onboarding');
await laptop.page.getByRole('button', { name: 'Skip' }).click();
await openPeople(laptop.page);
await laptop.page.waitForSelector('#sync-email');
await laptop.page.fill('#sync-email', 'emma@example.com');
await laptop.page.fill('#sync-password', 'binger-test-pw');
await laptop.page.getByRole('button', { name: 'Sign in', exact: true }).click();
await laptop.page.waitForSelector('.confirm .sheet-title', { timeout: 15000 }).catch(() => {});
check(await laptop.page.locator('.confirm .sheet-title').count() === 1 && await laptop.page.locator('.confirm .sheet-title').innerText() === 'Which one is you?', 'signing in on a second device asks "Which one is you?"');
await laptop.page.locator('.confirm').getByRole('button', { name: 'Emma' }).click().catch(() => {});
await laptop.page.waitForSelector('.invite-code', { timeout: 15000 }).catch(() => {});
await laptop.page.waitForTimeout(2500);
const onLaptop = await lib(laptop.page);
const laptopPeople = await laptop.page.evaluate(() => JSON.parse(localStorage.getItem('binger:device')).profiles.list.map((p) => p.name || '(no name)'));
check(onLaptop.who === 'Emma', `picking Emma makes this device's person Emma, not a new nameless one (${laptopPeople.join(', ')})`);
check(JSON.stringify(onLaptop.want) === JSON.stringify((await lib(emma.page)).want), `with her watchlist (${onLaptop.want.join(', ')})`);
const hh3 = await adminGet(`households/${code}`);
const names3 = (hh3.fields?.profiles?.arrayValue?.values || []).map((v) => v.mapValue.fields.name.stringValue || '(no name)').sort();
check(JSON.stringify(names3) === '["Dave","Emma"]', `and the household still lists just Dave and Emma (${names3.join(', ')})`);

console.log('A wrong code');
const stranger = await person('Stranger');
await stranger.page.goto(base);
await stranger.page.waitForSelector('.sheet.welcome');
await stranger.page.getByRole('button', { name: 'Just me for now' }).click();
await stranger.page.waitForSelector('.onboarding');
await stranger.page.getByRole('button', { name: 'Skip' }).click();
await openPeople(stranger.page);
await createAccount(stranger.page, 'someone@example.com');
await stranger.page.fill('#join-code', 'zzzz-zzzz-zzzz');
await stranger.page.getByRole('button', { name: 'Join household' }).click();
await stranger.page.waitForSelector('.sheet.people [role=alert]', { timeout: 15000 });
check(await stranger.page.locator('.sheet.people [role=alert]').innerText() === 'No household with that code.', 'joining with a wrong code says "No household with that code."');

console.log('Security rules (firestore.rules), probed as a stranger');
const uidE = members1[0];
const mallory = 'mallory-uid';
const st = async (r) => (await r).status;
check(await st(as(mallory, 'GET', `households/${code}`)) === 403, 'a stranger can’t read a household');
check(await st(as(mallory, 'GET', `households/${code}/profiles/${emmaId}`)) === 403, 'or anyone’s library in it');
check(await st(as(mallory, 'GET', `users/${uidE}`)) === 403, 'or which household someone is in');
check(await st(as(mallory, 'PATCH', `households/${code}/profiles/${emmaId}`, { fields: { state: { stringValue: '{}' } } })) === 403, 'or overwrite a library');
check(await st(as(mallory, 'POST', 'households?documentId=fakehousehold1', { fields: { members: { arrayValue: { values: [{ stringValue: uidE }] } } } })) === 403, 'or start a household in someone else’s name');
const withMembers = (extra) => ({ fields: { members: { arrayValue: { values: [...members2, ...extra].map((s) => ({ stringValue: s })) } } } });
check(await st(as(mallory, 'PATCH', `households/${code}?updateMask.fieldPaths=members&updateMask.fieldPaths=tmdbKey`, { fields: { ...withMembers([mallory]).fields, tmdbKey: { stringValue: 'stolen' } } })) === 403, 'joining can’t change anything but the member list');
check(await st(as(mallory, 'PATCH', `households/${code}?updateMask.fieldPaths=members`, withMembers([mallory, 'friend-uid']))) === 403, 'or add anyone but yourself');
check(await st(as(mallory, 'PATCH', `households/${code}?updateMask.fieldPaths=members`, { fields: { members: { arrayValue: { values: [{ stringValue: mallory }] } } } })) === 403, 'or remove the people already in it');

check(realFirebase.length === 0, `nothing reached the real Firebase project${realFirebase.length ? ': ' + realFirebase[0] : ''}`);
const errors = [...emma.errors, ...dave.errors, ...laptop.errors, ...stranger.errors];
check(errors.length === 0, `no script errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

await browser.close();
server.close();
if (failures.length) {
  console.log(`\n${failures.length} sync check(s) failed`);
  process.exit(1);
}
console.log('\nAll sync checks passed against the Firebase emulators.');
