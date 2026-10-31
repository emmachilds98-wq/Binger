// `npm run check`: syntax-check every JavaScript file. (The structural checks,
// such as the service-worker file list and diff-marker scan, are in
// tests/shell.test.js and run with `npm test`.)
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function jsFiles(dir = ROOT, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '_site' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) jsFiles(p, out);
    else if (/\.(m?js)$/.test(name)) out.push(p);
  }
  return out;
}

let failed = 0;
for (const file of jsFiles()) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed += 1;
    console.error(`✗ ${file}\n${err.stderr}`);
  }
}
if (failed) {
  console.error(`${failed} file(s) failed the syntax check`);
  process.exit(1);
}
console.log('Syntax OK');
