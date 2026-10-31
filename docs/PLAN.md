# Binger: plan, status and handover

**This is the document to come back to.** If work stops, changes hands or
loses its thread, start here: what Binger is for, what's built, what's next,
and the decisions that shouldn't be quietly undone. Update the
[status log](#status-log) at the end of every working session.

- Design canvas (12 screens, clickable): https://claude.ai/artifact/LDWPjbsS8nxv55dmhy3SjW
  (private to the owner's claude.ai account; use Share on the canvas to show anyone else).
  **A copy of every artboard is in [design/canvas/](design/canvas/)**, so you can
  build to the design without canvas access ([design/README.md](design/README.md)).
- How it works inside: [ARCHITECTURE.md](ARCHITECTURE.md)
- Look and feel: [DESIGN.md](DESIGN.md)
- Rules for anyone (human or agent) changing the code: [../CLAUDE.md](../CLAUDE.md)
- Screenshots from the last end-to-end run: [screenshots/](screenshots/)
- Upgrade plan for PC and mobile (milestones M0 to M7, after Phase 2): [UPGRADE-PLAN.md](UPGRADE-PLAN.md)

---

## Start here (next session)

Where things stand on 2026-10-18:

- **Phase 1 (MVP) is live on `main`.** The first build's PR was merged by
  fast-forward; `main` holds the whole app.
- **Phase 2 is more than half built.** All of its logic is done and
  unit-tested: the engine, both API adapters, and the library rules. Four
  items are finished end to end: **deck filters**, **feeling tags in scoring**,
  **step 1, streaming services** and **step 2, a person's work** (both on
  PR #2's branch until it merges). The other three are **designed** (canvas
  row 3) and need only their screens built and wired. Each one is a
  self-contained step in [Phase 2: build order](#phase-2-build-order).
  **Next: step 3, "Not this franchise".**
- **Checks:** `npm test` 94 passing, `npm run e2e` 49/49 on the PR #2 branch
  (`main` at `e86c79f`: 90 and 32/32, CI green).
- **Not live yet:** GitHub Pages is still off (the site URL returned 404 at
  14:20 UTC). The repo is public, so Pages is free; turning it on is in
  [Phase 1.1](#phase-11-go-live-needs-the-owner-).
- **Default branch:** GitHub's default branch is still
  `claude/happy-cerf-qei1lg` (the first build's working branch), not `main`.
  Clone or branch from **`main`**: `git clone -b main …`, or
  `git checkout main` after cloning.

Do these in order:

1. Run `npm run check && npm test && npm run e2e` to confirm a green start.
2. If `TMDB_API_KEY` is set in the session, do [Verifying TMDB live](#verifying-tmdb-live) first.
   It has been blocked three times for want of a key, and Phase 2 adds four TMDB
   endpoints that are still tested only against hand-written responses.
3. Build the remaining Phase 2 steps (3 to 5) below, one PR each (or one PR with one commit
   each). Every step lists the design artboard, the functions that already
   exist, the files to touch and the checks to add.
4. Tick the boxes here and add a [status log](#status-log) entry.

### New to the project? (human engineers)

Everything above applies to you too. This is the extra you need on day one.

**The owner does these once** (repo owner: @emmachilds98-wq):
1. **Settings → Collaborators** → add the engineer with write access.
2. **Settings → General → Default branch** → switch to `main`, so the repo
   page, clones and new PRs all start from current code.
3. **Settings → Pages** → Deploy from a branch → `main` / `(root)` → Save.
4. Optional: share the design canvas from its Share menu. Without it, the
   copy in [design/canvas/](design/canvas/) has every screen's markup and copy.

**Your setup** (about 15 minutes):
- Node 20 or newer. There's no `npm install`: the app has no dependencies
  and no build step.
- `npm run check && npm test`: no network or key needed.
- Browser run, the same way CI does it:
  `npm i -g playwright@1.56.1 && npx playwright install chromium`, then
  `PLAYWRIGHT_MODULE="$(npm root -g)/playwright" npm run e2e`.
- `npm run serve`, then open http://localhost:8080. Anime works with no key.
- Films and TV: get your own free TMDB key (themoviedb.org → Settings → API).
  Paste it into the app (Taste → ⚙ → TMDB key → Test & save), and
  `export TMDB_API_KEY=…` in your shell for [Verifying TMDB live](#verifying-tmdb-live).
  **Never commit it.** The repo is public, and a test fails if
  `js/config.js` holds a key.

**How work flows:** branch from `main` → PR into `main` → CI (syntax, unit
tests, browser run) must be green → merge. [CLAUDE.md](../CLAUDE.md) is
written for AI agents but its rules apply to everyone, especially "one
source of truth" and keeping `SHELL` in `service-worker.js` complete.
Product decisions (what to build, how it should feel) go to the owner.
Everything technical you need is in this file,
[ARCHITECTURE.md](ARCHITECTURE.md) and [DESIGN.md](DESIGN.md).

**Your first tasks:** the live TMDB check (once you have a key), then
[Phase 2 step 1](#phase-2-build-order) (the streaming services picker).

---

## The brief (in the owner's words)

> An app like Tinder that I can look at movies/TV shows and anime to find new
> things to watch. It should give artwork, synopsis and key actors I might know
> as well as a short trailer clip. I should be able to steer this app with an
> area to track what I have watched and review what I thought of it, then the
> app should be able to effortlessly use this to give the next best
> suggestions. I want this to be easily updatable as new media comes out and
> can grow with the user.

### How each part of the brief is met

| Ask | Where it lives |
|---|---|
| Tinder-style swiping across films, TV and anime | Discover tab: right = want, left = pass, up = seen it (`js/ui/deck.js`) |
| Artwork, synopsis | Card front + detail sheet, from TMDB / AniList |
| Key actors *I might know* | Card shows people first who appear in things **you've** watched or saved ("You loved Little Women"), then top billing (`keyPeople` in `js/ui/card.js`). Phase 2: tap anyone to see their other work, ranked for you |
| Short trailer clip | ▶ on the card plays a muted 30-second YouTube clip inline; length set in Settings (`js/ui/trailer.js`) |
| Track what I've watched, review it | Library → Diary: half-star rating, feeling tags, written review, date, rewatches (`js/ui/rate.js`, `js/state/library.js`) |
| Steer it | Taste tab: Films/TV/Anime mix, favour new releases, surprise me, never-show genres; Discover → Filters: quick watches, decade; plus every swipe, rating and feeling tag |
| Effortlessly use that for the next best suggestion | The engine re-ranks the deck after **every** swipe or rating; each card says why it was picked (`js/engine/`) |
| Easily updatable as new media comes out | No hand-kept catalogue: every refill pulls this week's trending, recent releases, shows airing now and the current anime season, live (`js/sources/candidates.js`). Phase 2: new seasons of TV you've watched |
| Grows with the user | Recent opinions outweigh old ones (time decay), ratings are read relative to your own average, and seeds rotate so recommendations widen as your library grows. Phase 2: see your taste move over time |

---

## Decisions (and why). Don't undo these without updating this list.

1. **Static web app (PWA), no build step, no framework.** Plain ES modules,
   hosted free on GitHub Pages, installable to a phone's home screen. Matches
   the owner's other apps, and anyone can edit any file without a toolchain.
2. **Live data, never a bundled catalogue.** TMDB for films and TV, AniList
   for anime. New releases appear on their own.
3. **Anime comes only from AniList.** TMDB also lists Japanese animation; those
   are dropped so nothing appears twice. AniList has better anime data (studios,
   voice cast, seasons, sequel links).
4. **TMDB needs a free key; it is never committed.** Each device pastes it once
   in Settings (stored only in that browser). `js/config.js` can hold a
   deployment-wide key, but only if the repo is private; a test fails if one
   is committed. Without a key the app still works, anime-only.
5. **Local-first library.** Everything you do lives in the browser
   (localStorage), with Export/Import for backup. No account needed. Cross-device
   sync is Phase 3.
6. **The engine is pure and explainable.** No ML model or server. A weighted
   feature profile (genres, themes, directors, cast, studios, kind, language,
   era, length) with evidence shrinkage and time decay, plus quality,
   freshness, seed, trending and streaming terms. Every card carries
   plain-English reasons. All of it is unit-tested in Node. Maths in
   [ARCHITECTURE.md](ARCHITECTURE.md#the-engine).
7. **Network-first service worker.** Online, every open runs the latest code:
   no "update available" step and no version to keep in sync with the worker
   (the drift that broke another app in this account). Offline, it falls back
   to the cached copy.
8. **One combined AniList request per deck refill.** AniList allows about 30
   requests a minute, so trending, the current season, genre picks,
   "recommended because you liked X", next seasons and (with a deck filter
   on) the filtered page all come back in a single GraphQL call.
9. **Streaming services are stored as one canonical name each**
   (`js/sources/services.js`): "Netflix", never "Netflix Standard with Ads".
   TMDB (via JustWatch) and AniList name services differently; this is where
   they meet. Only subscription and free count as "on your service"; rent and
   buy don't. AniList's streaming links aren't per country, TMDB's are.
10. **"Only what I can stream" hides what's known not to be on your
    services, and keeps what isn't known yet.** Film/TV list data has no
    availability; the app fetches details for the next few cards and re-ranks,
    up to three rounds (`ensureDetails` in `js/app.js`), so a film that turns
    out not to be on your services drops out before you see it. Your services'
    own catalogues are also searched directly so the deck never runs dry.
11. **Deck filters (length, decade) last for the session**, like the
    Films/TV/Anime pills. "Only what I can stream" is a saved setting.
12. **Feeling tags fine-tune a rating; they never override it.** Each tag
    nudges the item's signal (capped at ±0.25 overall). "Slow" also counts
    against that title's length bucket; "Overhyped" makes "Trending this week"
    count for less (`TAG_NUDGE`, `stats.hype` in `js/engine/profile.js`).
13. **"Not this franchise" is resolved once, when you hide it**, into
    `{ key, name, ids }` in `settings.hiddenFranchises`: every film in the TMDB
    collection, or every anime related to it (via its source manga's
    adaptations, which is the most reliable thread through a long franchise).
    It hides suggestions only; a person's page still lists everything they made.
14. **New-season alerts are for TV only.** An anime sequel is its own AniList
    entry and already arrives in the deck ("Next part of…"); a TV show keeps one
    TMDB id across seasons, so it can't. A season is "new" if it premieres after
    the latest date in your diary for that show; logging it clears the alert.

---

## Roadmap

### Phase 0: Design ✅
- [x] Six-screen design canvas: first run, Discover deck, detail + trailer,
      rate/review sheet, Library (watchlist + diary), Taste.
- [x] Look committed: "late-night cinema" (DESIGN.md).
- [x] Phase 2 screens designed: canvas row 3, artboards 7 to 12.

### Phase 1: MVP ✅ (first PR, merged)
- [x] Swipe deck with gesture + button + keyboard twins, undo
- [x] Cards: artwork, kind badge, match %, why-picked reason, synopsis, key people you know
- [x] Inline trailer clips (muted, trimmed); full trailer link
- [x] Detail sheet: trailer, reasons, cast row, where to watch (TMDB/JustWatch, by region), your diary entries
- [x] Rate sheet: half stars, feeling tags, review, date; edit and delete; rewatches
- [x] Library: watchlist sorted by best match for you, diary by month with averages
- [x] Taste: learned genres/themes/people, dislikes, mix sliders, toggles, hidden genres, forget passes
- [x] Search across films, TV and anime to log or save anything
- [x] First run: pick what you've loved; works anime-only without a key
- [x] Settings: TMDB key test-and-save, region, clip length, autoplay, anime voice language, export/import, erase
- [x] Recommendation engine + candidate gathering + caching (IndexedDB, stale-on-error)
- [x] PWA: manifest, icons, offline shell
- [x] Tests and CI on every push / PR

### Phase 1.1: Go live (needs the owner) ⏳
- [x] Merge the first PR into `main`
- [ ] Set the default branch to `main`: repo **Settings → General → Default branch**
      (it's still `claude/happy-cerf-qei1lg`, the first build's working branch)
- [ ] Switch on GitHub Pages (still off at 2026-10-18 14:20 UTC): repo **Settings → Pages → Build and deployment →
      Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
      The app appears at `https://emmachilds98-wq.github.io/Binger/`
- [ ] On your phone: open that link, Taste → ⚙ Settings → paste TMDB key → Test & save
- [ ] Add to Home Screen (Safari: Share → Add to Home Screen). On iPhone this
      also stops Safari clearing the library after 7 days unused.
- [ ] **Verify films and TV against the live TMDB API.** Still not done: the
      `TMDB_API_KEY` secret wasn't present in any of the three sessions so far. Steps in
      [Verifying TMDB live](#verifying-tmdb-live).

### Phase 2: Smarter suggestions ◐

Logic (engine, sources, library) is done and tested for every item. Status of
each item end to end:

- [x] **Deck filters**: "Quick watches" (films ≤ 2 h, series ≤ 13 episodes)
      and decade, from the Filters button on Discover (canvas 7).
- [x] **Feeling tags in scoring**: tags nudge ratings; "Slow" lowers that
      length, "Overhyped" trusts trending less. (Showing this on Taste is step 5.)
- [x] **Step 1. Streaming services** ("Only show what I can stream"): picker (canvas 8),
      from Settings, Taste and the Filters sheet; your services ringed in "Where to watch";
      anime shows AniList's official streaming links
- [x] **Step 2. Tap a person → their other work, ranked for you** (canvas 9), from the
      detail sheet's cast row and crew line, and Taste's "People you rate highly"
- [ ] **Step 3. "Not this franchise"** (canvas 10)
- [ ] **Step 4. New-season alerts for TV you've watched** (canvas 11)
- [ ] **Step 5. Taste over time + "how you like to watch"** (canvas 12)

#### Phase 2: build order

Each step: read the artboard in `docs/design/canvas/`, build the screen in
`js/ui/`, wire it in `js/app.js`, add CSS to `css/app.css`, add the new module
to `SHELL` in `service-worker.js` (the shell test fails otherwise), add e2e
checks + a screenshot to `scripts/e2e.mjs`, then `npm run check && npm test && npm run e2e`.
Fixtures for every API call below already exist in `tests/fixtures/`.

**Step 1. Streaming services picker** · artboard `Services.dc.html` (8) · ✅ built (`js/ui/services.js`)
- New `js/ui/services.js`: `openServices(ctx)`, a full sheet with a 3-column
  grid of toggle tiles, the "Only show what I can stream" switch, and a Done button.
- Choices: `serviceChoices({ tmdb, picked })` (`js/sources/lookups.js`). Show
  `COMMON_SERVICES` at once, then the region's list (with logos) when TMDB answers.
- Save: `store.update(L.updateSettings, { services, streamOnly })`. The store
  subscriber in `app.js` already clears the pool and refills when either changes.
- Entry points: Settings → "Where you watch" (beside Region); Taste → "Steer the
  deck"; and the Filters sheet: in `showFilters()` (`app.js`) replace
  `onPickServices: null` with a function that opens the picker ("Where" then appears).
- Detail sheet: ring your services in "Where to watch"; for anime, list
  `title.watchLinks` as links instead of the "AniList lists…" sentence.
- Already done: `onServices`, `SERVICE_BOOST` (score.js), stream-only in
  `eligible` (rank.js), the "On Netflix" reason (explain.js), searching your
  services' catalogues (`providerIdsFor`, `gatherCandidates`).
- e2e: mock `/watch/providers/` with `tmdb-providers-movie.json`; pick Netflix,
  turn on "only": Dune shows (its GB providers include "Netflix Standard with
  Ads") with the reason "On Netflix"; anime from `anilist-deck.json` has no
  streaming links, so it's hidden. Screenshot `08-services`.

**Step 2. A person's work** · artboard `Person.dc.html` (9) · ✅ built (`js/ui/person.js`)
- New `js/ui/person.js`: `openPerson(stub, ctx)`, a full sheet: photo, name,
  `known`, a "You know them from…" line (from `profile.people`), kind pills
  when there's more than one kind, rows "best for you first".
- Data: `loadPerson(personId, { tmdb, anilist })` (lookups.js) returns
  `{ person, credits }`; rank with `rankForYou(credits, profile, { services })`
  (engine). Each credit has `role` and `major`. A TMDB person needs a key:
  without one, say "Add a TMDB key to see their films and TV".
- Rows reuse the search-row pattern (eye → `logSeen`, bookmark →
  `addToWatchlist`, tap → `showDetail`).
- Entry points: cast items in `js/ui/detail.js` become buttons; directors and
  creators in the crew line; Taste "People you rate highly" chips for
  creator/cast (their keys are `c:<personId>` / `p:<personId>`; studios aren't people).
- e2e: mock TMDB `/person/1190668` → `tmdb-person.json`; AniList body
  containing `Staff(id` → `anilist-staff-tanezaki.json`. Check ranked rows,
  merged roles, no talk-show credits. Screenshot `09-person`.

**Step 3. "Not this franchise"** · artboard `HideSeries.dc.html` (10)
- `hasFranchise(title)` and `loadFranchise(title, { tmdb, anilist })`
  (lookups.js); save with `store.update(L.hideFranchise, f)`, undo with
  `L.unhideFranchise`.
- Pass toast: in `deckAction` (`app.js`), for a left swipe on a title where
  `hasFranchise(t)`, show `toast('Passed', { action: { label: 'Hide all <name> films', fn } })`
  (anime: "Hide this whole series"). Then the toast "<name> is hidden" with Undo.
- Detail sheet: a link button "Hide the whole series" when `hasFranchise`.
- Taste → "Never show me": hidden series as removable pills before the genres.
- Already done: `isBlocked` / `franchiseBlock` in rank.js, by id, by TMDB
  collection, and by AniList relation; snapshots keep `collection` and `franchiseIds`.
- e2e: mock `/collection/726871` → `tmdb-collection.json`; pass Dune, tap
  "Hide all Dune films"; `settings.hiddenFranchises[0].ids` has 3 ids; Taste
  shows "Dune"; tapping it unhides. Screenshot `10-hide-series`.

**Step 4. New seasons** · artboard `Seasons.dc.html` (11)
- `checkNewSeasons({ tmdb, items })` (lookups.js) returns alerts
  `{ id, key, season, date, state: 'airing' | 'out' | 'soon', title }` via the
  engine's `seasonAlerts`. Run it after `init()` (when there's a TMDB key) and
  after a TV watch is logged; keep the result in `app.js` state.
- Library → Watchlist: "Back with new episodes" section above the list.
  "Watched it" → `logSeen(item.title)` (a new diary entry clears the alert);
  ✕ → `store.update(L.dismissAlert, id, alert.key)`.
- Library tab dot: an amber dot on the Library tab's icon while alerts wait
  (artboard 11). `.has-dot` in `css/app.css` draws one for 44px icon buttons;
  the tab needs its own placement, on the icon rather than the tab's corner.
- e2e: mock `/tv/95396` with `next_episode_to_air` = season 3 episode 1 in the
  future; log Severance with a 2025 date; Library shows "Season 3 · starts …".
  Screenshot `11-new-seasons`.

**Step 5. Taste over time + how you like to watch** · artboard `TasteTime.dc.html` (12)
- `tasteTimeline(items, { now })` (engine/timeline.js) returns
  `{ at, series: [{ label, values, trend }], enough }`. Render only when
  `enough`. Chart spec in [DESIGN.md](DESIGN.md#taste-over-time-chart): small
  multiples, 2px grey line, amber end dot, zero baseline, trend in words, tap
  for the numbers, plus a table view.
- "How you like to watch": sweet spot = `topFeatures(profile, 'length', { limit: 1 })`;
  tag counts = `profile.stats.tags`; one line each for "Slow" (when the long
  bucket's affinity is negative) and "Overhyped" (`profile.stats.hype > 0`).
- e2e: write a library with past-dated ratings into localStorage, reload,
  check rows and trend words. Screenshot `12-taste-time`.

### After Phase 2: PC and mobile upgrade
The 2026-10-31 review's plan: mobile polish, a real desktop layout, one
library across devices, films and TV without a key, importing history.
Milestones and owner decisions: [UPGRADE-PLAN.md](UPGRADE-PLAN.md).

### Phase 3: Grows with you everywhere
- [ ] Optional sync across devices (Firebase Auth + Firestore, as in the owner's other apps)
- [ ] Import history: Letterboxd CSV, MyAnimeList / AniList export, Trakt
- [ ] Shared watchlist / "match with a friend" deck (two profiles, one deck)

### Phase 4: AI assist (optional, needs a tiny backend for the API key)
- [ ] Claude-written taste summary from your reviews
- [ ] Ask in plain words: "cosy anime under 12 episodes", "something like Severance but funnier"
- [ ] Personal one-line pitches on cards

---

## Status log

Newest first. One entry per working session: what changed, what's next, what's blocking.

### 2026-10-31: review + upgrade plan for PC and mobile
- The owner asked for a review, the link to view the app, and a plan to make it
  better on PC and mobile. No app code changed.
- Checked: `npm run check` passes, `npm test` 94/94, `npm run e2e` 49/49 on
  this branch (same code as PR #2's head, `e653bbb`).
- Still not live: `https://emmachilds98-wq.github.io/Binger/` returns 404, the
  default branch is still `claude/happy-cerf-qei1lg`, and PR #2 is unmerged.
- Looked at the app at 1440×900, 1024×768 and 360×640: on a PC or tablet it
  stays a 480 px phone column; on a small phone onboarding fits, and card cast
  names cut off early.
- Wrote [UPGRADE-PLAN.md](UPGRADE-PLAN.md): M0 go live, M1 finish Phase 2,
  M2 mobile polish, M3 desktop layout (canvas first), M4 sync across devices,
  M5 films/TV without a key, M6 import + "Tonight", M7 e2e at three sizes.
- **Blocking (unchanged):** going live needs the owner (M0); live TMDB
  verification needs `TMDB_API_KEY`.
- **Next:** M0, then Phase 2 step 3, "Not this franchise".

### 2026-10-18 (fourth session): Phase 2 steps 1 and 2, services and people
- Picked up from PR #2 (this session's own handover PR, still open).
  `main` unchanged since `e86c79f`.
- Built the services picker to artboard 8 (`js/ui/services.js`): tiles for
  your region's services from TMDB (common ones first, before or without a
  key), the "Only show what I can stream" switch, saved on Done. Opened from
  Settings → Where you watch, Taste → Steer the deck, and the Filters sheet
  ("Pick your services"). Picking none turns "only" off, so the deck can't empty.
- Detail sheet: your services are ringed in "Where to watch" (subscription
  and free only); anime lists AniList's official streaming links instead of
  a sentence.
- Fixed, found while building: TMDB's region provider list offered services
  only available in other countries (now left out); a TMDB response with no
  `id` became a `tmdb:movie:undefined` title (now refused, and the card keeps
  its list data).
- The e2e TMDB mock now answers "what's on these services" and details
  requests the way TMDB does; before, it claimed every title was on every
  service.
- Built a person's work to artboard 9 (`js/ui/person.js`): photo (ringed
  if you know them), what they're known for, "In Little Women, which you
  loved", kind pills, rows best for you first with match % and why (or your
  diary / watchlist status), Seen it and Watchlist buttons. Opened from cast
  and crew in the detail sheet and from Taste's "People you rate highly"
  (directors and cast; studios aren't people). TMDB people need a key;
  AniList voice actors and staff don't.
- Fixed before it shipped: the sheet's class name `person` clashed with the
  cards' `.person` (each face in "Starring"), which laid the whole sheet
  out as one row. Renamed to `person-sheet`; an e2e check now fails if
  anything on the page is wider than the screen.
- Tests: 94 unit (was 90), e2e 49/49 (was 32). New screenshots `08-services`, `09-person`.
- **Blocking (unchanged):** live TMDB verification needs `TMDB_API_KEY`.
- **Next:** step 3, "Not this franchise" (artboard 10).

### 2026-10-18 (third session): handover check for a new engineer
- The owner asked for the handover to be ready in GitHub for a new engineer.
  No code changed.
- Verified the second session's state instead of trusting it: on `main` at
  `e86c79f`, `npm run check` passes, `npm test` 90/90, `npm run e2e` 32/32,
  and CI is green on that commit.
- Found and wrote up three things a newcomer would trip on: GitHub's default
  branch is still the first build's working branch (`claude/happy-cerf-qei1lg`,
  which this PR brings level with `main`, but it'll fall behind again until
  the owner switches the default to `main`); Pages is still off (404); and
  there was no human-engineer setup. Added
  [New to the project?](#new-to-the-project-human-engineers) and Phase 1.1 items.
- **Blocking (unchanged):** live TMDB verification; `TMDB_API_KEY` wasn't
  in this session either.
- **Next:** the owner's one-time steps, then the live TMDB check, then Phase 2 step 1.

### 2026-10-18 (second session): Phase 2 logic, design, deck filters
- `main` held only a README; the first build was waiting in an unmerged draft
  PR. Verified it here (51 tests, 27/27 e2e), then fast-forwarded `main` to it.
  This session's environment was set up to push straight to `main`;
  `CLAUDE.md`'s "branch + PR" rule still stands for normal work.
- Designed the Phase 2 screens on the canvas (row 3, artboards 7 to 12, plus a
  "Phase 2 rules" note) and copied all 12 artboards to `docs/design/canvas/`.
- Built every Phase 2 piece of logic, with tests:
  - engine: length features; feeling-tag nudges ("Slow" → length,
    "Overhyped" → less trending); streaming-service matching, boost and
    stream-only; deck filters; hidden franchises; `rankForYou`;
    `seasonAlert(s)`; `tasteTimeline`.
  - sources: one service vocabulary (`services.js`); TMDB providers, discover
    by provider / runtime / dates, person credits, collections, TV seasons and
    next episode; AniList streaming links, franchise relations, Staff (person)
    query, franchise graph, filtered deck page; `lookups.js` for person,
    franchise, service choices and new-season checks.
  - library: `services`, `streamOnly`, `hiddenFranchises` settings (migrated),
    `hideFranchise`, `unhideFranchise`, `dismissAlert`.
- Built the Deck filters screen end to end (Filters button, sheet, summary
  line with Clear, filtered fetching from both sources).
- Real AniList captures added for a voice actor, a director, the Frieren
  franchise graph and a "short 1990s" page. TMDB fixtures for providers,
  person, collection and TV seasons are hand-written to TMDB's documented format.
- Fixed: the native `Element.append` writes `null` as text (caught by eye on
  the filters screenshot); the filters sheet, search and choice sheet now use
  `dom.js` `append()`. An e2e check guards the filters sheet.
- Tests: 90 unit (was 51), e2e 32/32 (was 27).
- **Blocking:** live TMDB verification still needs `TMDB_API_KEY` in the session.
- **Next:** Phase 2 build order, steps 1 to 5.

### 2026-10-18: Design + MVP build (Claude Code session)
- Designed six screens on a Claude design canvas (link at top).
- Built the whole Phase 1 MVP in this repo (it was empty). Unit tests: 51
  passing. End-to-end run in Chromium: 27/27 checks passing (first run,
  key test, filters, clip play/stop, drag swipe, pass, undo, detail, half-star
  rating, diary, taste, reload persistence, zero console errors, service
  worker caches all 36 app files, opens offline).
- Checked live against AniList: a real deck seeded from one 5★ Frieren rating
  came back with Frieren Season 2 ("Next part of…, which you watched"),
  Witch Hat Atelier ("Because you loved Frieren"), The Apothecary Diaries
  ("Stars Atsumi Tanezaki, from Frieren").
- Bug found and fixed by the e2e run: dragging a card from the middle of the
  poster hit the play button and started the clip instead of swiping. Drags
  can now start anywhere on the card; a tap still plays.
- **Not yet verified:** live TMDB responses (no key in that session). AniList
  was verified live.

---

## Verifying TMDB live

In a session where `TMDB_API_KEY` is set:

```bash
# 1. The key works
curl -s "https://api.themoviedb.org/3/configuration?api_key=$TMDB_API_KEY" | head -c 200
# 2. The adapter normalises real responses: details, providers, a person, a
#    collection and a TV show's seasons (prints a short summary of each)
node -e "
import('./js/sources/tmdb.js').then(async ({ createTmdb }) => {
  const t = createTmdb({ key: process.env.TMDB_API_KEY, region: 'GB' });
  const list = await t.trending('movie');
  const d = await t.details('movie', list[0].sourceId);
  console.log(d.title, d.year, d.cast.slice(0,3).map(c=>c.name), d.trailer, d.streaming, d.collection);
  const tv = await t.details('tv', (await t.trending('tv'))[0].sourceId);
  console.log(tv.title, tv.seasons, tv.seasonList, tv.nextEpisode, tv.lastEpisode, tv.streaming);
  console.log((await t.providers('movie')).slice(0, 8).map(p => p.service + ' ' + p.ids));
  const p = await t.person(1190668);
  console.log(p.person, p.credits.slice(0, 5).map(c => c.title + ' / ' + c.role + (c.major ? ' *' : '')));
  console.log(await t.collection(726871));
  console.log((await t.discover('movie', { providerIds: [8], runtimeMax: 120, from: '1990-01-01', to: '1999-12-31' })).slice(0, 5).map(x => x.title + ' ' + x.year));
});"
```

If field shapes differ from `tests/fixtures/tmdb-*.json`, fix the adapter
(`js/sources/tmdb.js`), then replace the hand-written fixtures with trimmed
real captures and keep the tests green.

## Known limitations

- Data lives in one browser. Export a backup now and then (Settings → Backup);
  sync is Phase 3.
- localStorage holds about 5 MB: roughly 3,000+ watched/saved titles plus
  many thousands of passes (passes are stored slim). If anyone gets close,
  move the library to IndexedDB (Phase 3 sync work touches the same code).
- Some studios block YouTube embedding; those clips show YouTube's own error,
  and the detail sheet links to the full trailer.
- AniList rate limits (about 30 requests a minute). Normal use is about 1
  request per refill plus searches; responses are cached for 6 hours.
- "Where to watch" covers films/TV (TMDB + JustWatch, per region). AniList's
  streaming links for anime are worldwide, not per region.
- TMDB details are cached for 3 days, so a new season can show up to 3 days late.
  The region's provider list is cached for a week.

## Resuming work: the 60-second version

```bash
npm test          # unit tests (no network)
npm run check     # syntax-check every JS file
npm run e2e       # full browser run with mocked APIs → docs/screenshots/
npm run serve     # http://localhost:8080
npm run bump      # set version + build time from the real UTC clock before shipping
```

Work on a branch, open a PR, keep this file's checkboxes and status log current.
