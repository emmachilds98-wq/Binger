// The deploy build (scripts/build-site.mjs) exactly as the "Deploy site"
// workflow runs it: into _site inside the repository. Its first real run
// failed because a folder can't be copied into itself; this keeps it honest.
// No key is given, so nothing reaches TMDB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('the site builds into _site inside the repository, and holds no key without one', () => {
  const out = join(ROOT, '_site');
  try {
    execFileSync(process.execPath, ['scripts/build-site.mjs', '_site'], { cwd: ROOT, env: { ...process.env, TMDB_API_KEY: '', MDBLIST_API_KEY: '' }, stdio: 'pipe' });
    for (const f of ['index.html', 'service-worker.js', 'manifest.webmanifest', 'js/app.js', 'css/app.css', '.nojekyll']) {
      assert.ok(existsSync(join(out, f)), `${f} is in the built site`);
    }
    assert.ok(!existsSync(join(out, '_site')), 'the build doesn’t copy itself');
    assert.ok(!existsSync(join(out, '.git')) && !existsSync(join(out, '.github')), 'no dot-folders are published');
    assert.match(readFileSync(join(out, 'js', 'config.js'), 'utf8'), /tmdbKey: ''/);
    assert.match(readFileSync(join(out, 'js', 'config.js'), 'utf8'), /mdblistKey: ''/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
