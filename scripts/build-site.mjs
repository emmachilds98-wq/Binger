// `node scripts/build-site.mjs _site`: the site GitHub Pages serves, with the
// TMDB key built in so nobody has to paste one (docs/PLAN.md, decision 4),
// and the MDBList key for review scores when there is one (decision 18).
//
// The key comes from the repository secret, through the deploy workflow
// (.github/workflows/pages.yml), and goes only into this copy of
// js/config.js. The repository never holds it: tests/shell.test.js fails if
// anything shaped like a TMDB key is committed. Anyone can read it from the
// deployed page, as with any key a browser uses; see PLAN.md for why that's
// accepted and how to move it behind a proxy later.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(process.argv[2] || join(ROOT, '_site'));
if (out === ROOT) throw new Error('Build into a separate folder, not the repository itself.');

// Everything the branch deploy served before, minus dot-folders and builds.
// Copied entry by entry: the workflow builds into _site inside the
// repository, and copying a folder into itself is refused.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const skip = new Set(['node_modules', '_site', out.slice(ROOT.length + 1).split('/')[0]]);
for (const name of readdirSync(ROOT)) {
  if (name.startsWith('.') || skip.has(name)) continue;
  cpSync(join(ROOT, name), join(out, name), { recursive: true });
}
writeFileSync(join(out, '.nojekyll'), ''); // serve files as they are

const key = String(process.env.TMDB_API_KEY || '').trim();
const say = (level, msg) => console.log(process.env.GITHUB_ACTIONS ? `::${level}::${msg}` : msg);

async function works(k) {
  const v4 = k.startsWith('eyJ');
  const url = `https://api.themoviedb.org/3/configuration${v4 ? '' : `?api_key=${encodeURIComponent(k)}`}`;
  try {
    const res = await fetch(url, { headers: v4 ? { Authorization: `Bearer ${k}` } : {} });
    return res.ok;
  } catch {
    return false;
  }
}

if (!key) {
  say('warning', 'No TMDB key secret: the site is built without one (anime only until someone adds a key in Settings).');
} else if (!/^[0-9a-f]{32}$/i.test(key) && !/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(key)) {
  say('warning', 'The TMDB key secret doesn’t look like a TMDB API key or Read Access Token, so it wasn’t built in.');
} else if (!(await works(key))) {
  say('warning', 'TMDB didn’t accept the key secret, so it wasn’t built in. Check it at themoviedb.org → Settings → API.');
} else {
  buildIn('tmdbKey', key);
  console.log('TMDB key built in (it works).');
}

// Review scores (js/sources/ratings.js): the MDBList key, built in the same
// way. Optional: without it the site simply shows no IMDb or Rotten Tomatoes
// scores. Checked with /user, which doesn't use up the day's lookups.
const mdblistKey = String(process.env.MDBLIST_API_KEY || '').trim();
async function mdblistWorks(k) {
  try {
    return (await fetch(`https://api.mdblist.com/user?apikey=${encodeURIComponent(k)}`)).ok;
  } catch {
    return false;
  }
}
if (!mdblistKey) {
  say('notice', 'No MDBList key secret: the site is built without review scores (IMDb, Rotten Tomatoes…). Add MDBLIST_API_KEY to show them.');
} else if (!/^[A-Za-z0-9]{8,64}$/.test(mdblistKey)) {
  say('warning', 'The MDBList key secret doesn’t look like an MDBList API key, so it wasn’t built in.');
} else if (!(await mdblistWorks(mdblistKey))) {
  say('warning', 'MDBList didn’t accept the key secret, so it wasn’t built in. Check it at mdblist.com → Preferences → API.');
} else {
  buildIn('mdblistKey', mdblistKey);
  console.log('MDBList key built in (it works).');
}

// name: '' in this copy of js/config.js -> name: "value". The marker must be
// there exactly once, so a key never lands in the wrong place.
function buildIn(name, value) {
  const file = join(out, 'js', 'config.js');
  const src = readFileSync(file, 'utf8');
  const marker = `${name}: ''`;
  if (src.split(marker).length !== 2) throw new Error(`js/config.js must contain ${marker} exactly once.`);
  writeFileSync(file, src.replace(marker, `${name}: ${JSON.stringify(value)}`));
}
if (!existsSync(join(out, 'index.html'))) throw new Error('The built site has no index.html.');
console.log(`Site built in ${out}`);
