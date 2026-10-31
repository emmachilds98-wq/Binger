// Structural checks on the app shell: the things that broke other apps in
// this account (stale service-worker file lists, files saved as diff text,
// version drift). Cheap to run, and they fail loudly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules' || name === '_site') continue; // _site: a local build, may hold a key
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function shellList() {
  const sw = readFileSync(join(ROOT, 'service-worker.js'), 'utf8');
  const block = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(block, 'SHELL array found in service-worker.js');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('every file in the service worker SHELL exists', () => {
  for (const f of shellList()) {
    if (f === './') continue;
    assert.ok(existsSync(join(ROOT, f)), `SHELL lists ${f}, which doesn't exist`);
  }
});

test('every app script and stylesheet is in the service worker SHELL', () => {
  const listed = new Set(shellList());
  const needed = [...walk(join(ROOT, 'js')), ...walk(join(ROOT, 'css'))]
    .map((p) => relative(ROOT, p).split('\\').join('/'))
    .filter((p) => /\.(js|css)$/.test(p));
  for (const f of needed) assert.ok(listed.has(f), `${f} is missing from SHELL in service-worker.js (the app would break offline)`);
});

test('no source file is a diff, patch or conflict fragment', () => {
  const files = walk(ROOT).filter((p) => /\.(js|mjs|css|html|json|webmanifest|md)$/.test(p) && !p.includes(`${join('tests', 'fixtures')}`));
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!/^(<{7}|>{7}|={7})( |$)/m.test(text), `${relative(ROOT, f)} contains merge-conflict markers`);
    if (!f.endsWith('.md')) {
      assert.ok(!/^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/m.test(text), `${relative(ROOT, f)} contains diff hunk headers`);
      const lines = text.split('\n').filter((l) => l.trim());
      const diffy = lines.filter((l) => /^[+-](?![+-])/.test(l)).length;
      assert.ok(lines.length < 10 || diffy / lines.length < 0.3, `${relative(ROOT, f)} looks like diff text, not source`);
    }
  }
});

test('version.js carries a dated version and a real UTC build time', () => {
  const src = readFileSync(join(ROOT, 'js', 'version.js'), 'utf8');
  const version = (src.match(/BINGER_VERSION = '([^']+)'/) || [])[1];
  const built = (src.match(/BINGER_BUILD_TIME = '([^']+)'/) || [])[1];
  assert.match(version, /^\d{4}\.\d{2}\.\d{2}-\d+$/);
  assert.match(built, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(Date.parse(built) <= Date.now() + 5 * 60 * 1000, 'build time is not in the future (use npm run bump)');
  assert.equal(version.slice(0, 10).replaceAll('.', '-'), built.slice(0, 10), 'version date matches build date');
});

test('index.html loads version.js before the app and links the manifest', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/version.js') < html.indexOf('js/app.js'));
  assert.ok(html.includes('manifest.webmanifest'));
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) assert.ok(existsSync(join(ROOT, icon.src)), `manifest icon ${icon.src} exists`);
});

test('no TMDB key is committed in config.js', () => {
  const src = readFileSync(join(ROOT, 'js', 'config.js'), 'utf8');
  assert.match(src, /tmdbKey: ''/, 'leave CONFIG.tmdbKey empty in the repo; set keys in the app\u2019s Settings');
  assert.match(src, /mdblistKey: ''/, 'leave CONFIG.mdblistKey empty in the repo: the deploy builds it in from the MDBLIST_API_KEY secret');
});

// A TMDB key is a secret: not in config.js, and not anywhere else either.
// A v3 key is 32 hex characters, a v4 token a long JWT ("eyJ…"). The only
// key-shaped string allowed is the obvious fake the unit tests use.
test('no TMDB key or token is committed anywhere', () => {
  const FAKE = '0123456789abcdef0123456789abcdef';
  const text = walk(ROOT).filter((f) => !/\.(jpg|png|ico|webp|woff2?)$/.test(f));
  for (const file of text) {
    const src = readFileSync(file, 'utf8');
    const hex = (src.match(/\b[0-9a-f]{32}\b/g) || []).filter((m) => m !== FAKE);
    assert.deepEqual(hex, [], `${relative(ROOT, file)} holds something shaped like a TMDB key`);
    assert.ok(!/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\./.test(src), `${relative(ROOT, file)} holds something shaped like a TMDB access token`);
  }
});

// The Firebase web config may be committed (it isn't a secret), but a broken
// or test-only one would stop sync for everyone.
test('the committed Firebase config is a whole web config, never the emulators', async () => {
  const { CONFIG } = await import('../js/config.js');
  if (!CONFIG.firebase) return;
  const f = CONFIG.firebase;
  for (const k of ['apiKey', 'authDomain', 'projectId', 'appId']) assert.equal(typeof f[k], 'string', `config.firebase.${k}`);
  assert.equal(f.authDomain, `${f.projectId}.firebaseapp.com`, 'authDomain belongs to the same project');
  assert.ok(!('emulators' in f), 'config.firebase must not point at the emulators');
  assert.ok(!/^demo-/.test(f.projectId), 'a demo- project only exists in the emulators');
});
