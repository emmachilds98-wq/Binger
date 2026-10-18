// `npm run bump`: set the app version and build time in js/version.js from
// the real UTC clock (never hand-typed). Version is YYYY.MM.DD-N, where N
// counts releases on the same day.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../js/version.js', import.meta.url);
const src = readFileSync(file, 'utf8');
const now = new Date();
const day = now.toISOString().slice(0, 10).replaceAll('-', '.');
const current = (src.match(/BINGER_VERSION = '([^']+)'/) || [])[1] || '';
const n = current.startsWith(day + '-') ? Number(current.split('-')[1]) + 1 : 1;
const version = `${day}-${n}`;
const built = now.toISOString().replace(/\.\d{3}Z$/, 'Z');

const next = src
  .replace(/BINGER_VERSION = '[^']*'/, `BINGER_VERSION = '${version}'`)
  .replace(/BINGER_BUILD_TIME = '[^']*'/, `BINGER_BUILD_TIME = '${built}'`);
writeFileSync(file, next);
console.log(`Binger ${version} (built ${built})`);
