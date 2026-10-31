# Rules for this repo

Read **docs/PLAN.md** first, starting at "Start here (next session)": the
brief, decisions, roadmap, the Phase 2 build order and the status log.
At the end of every working session, add a dated entry to its status log and
tick off what's done. That file is how work survives a lost thread or a handover.

Build screens to the design: the canvas link is in docs/PLAN.md, and a copy
of every artboard is in `docs/design/canvas/`. If you change the canvas,
copy its files there again in the same PR.

## Shipping a change

1. Work on a feature branch and open a PR. Never commit straight to `main`
   (it's what GitHub Pages serves).
2. Before saying a change is ready, all of these must pass:
   - `npm run check` (syntax of every JS file)
   - `npm test` (unit + shell checks)
   - `npm run e2e` when anything under `js/ui/`, `js/app.js`, `css/` or
     `index.html` changed. It refreshes `docs/screenshots/`; commit those too.
   - `npm run e2e:sync` when `js/sync/`, `js/state/profiles.js`,
     `js/ui/people.js`, the sync parts of `js/app.js` or `firestore.rules`
     changed. It runs against the Firebase emulators (needs Java; how in
     docs/FIREBASE.md → Live check). CI runs it too.
3. `npm run bump` sets `js/version.js` from the real UTC clock. Never hand-type
   a version or build time.
4. Read back every file you changed before committing. A file must never be
   saved as a diff, patch or conflict fragment (`+`/`-` hunk lines, `@@`,
   `<<<<<<<`); `tests/shell.test.js` fails if one is.

## One source of truth

- **Recommendation logic** lives only in `js/engine/`, as pure functions (no
  DOM, no fetch, no storage) so it stays unit-testable in Node. Don't
  re-implement scoring in the UI.
- **API knowledge** lives only in `js/sources/`. Each adapter turns raw
  responses into the Title shape (docs/ARCHITECTURE.md). Nothing else touches
  raw TMDB / AniList JSON. Streaming-service names go through
  `js/sources/services.js`, genres through `js/sources/genres.js`.
- **Library rules** live only in `js/state/library.js` (pure). The store just persists.
- **Sync** lives only in `js/sync/`: `firebase.js` is the only file that
  touches Firebase, `sync.js` decides what to push and pull. What wins when
  two copies of a library differ is `mergeStates` in `js/state/library.js`.
- **People on this device** (who's watching, the TMDB key, the Firebase
  config, the household) live in `js/state/profiles.js` (pure) and
  `js/state/device.js`, never inside a person's library.
- **The version** lives only in `js/version.js`. The service worker
  deliberately has no app version (it's network-first), so there is nothing
  to keep in sync.
- **The service worker's `SHELL` list** must name every file under `js/` and
  `css/`. Add new modules to it; the shell test fails otherwise.

## Load order in js/app.js

All module-level state is declared at the top of `js/app.js`, and `init()`
is called on the last line. Keep it that way: a `const`/`let` declared below
a top-level call it's reachable from throws a TDZ `ReferenceError` at load.
`node --check` won't catch that, so trace any new top-level call.

## Safety

- Never commit an API key. `js/config.js` must keep `tmdbKey: ''`, and
  nothing shaped like a TMDB key or token may be committed anywhere (both tested).
  The Firebase web config is the exception: it isn't a secret (the rules in
  `firestore.rules` protect the data), so it may go in `config.firebase`.
  Keys go in the app's Settings (per device) or in a session's environment
  secret (`TMDB_API_KEY`).
- Put API text into the page with `h()` / `textContent`, never `innerHTML`.
  `icon()` is the one `innerHTML` use, and it only takes this repo's static SVG paths.
- Add optional children with `h()` or `dom.js` `append(el, [...])`, never the
  DOM's own `el.append(a, maybe ? b : null)`: that writes the text "null".
- If something looks stuck or looping, find the cause. Don't disable a
  feature to hide the symptom.

## Style

Plain ES modules, no framework, no build step. Small files, one job each,
comments that say *why*. User-facing copy is short, plain, and British English
("favourite", "colour").
