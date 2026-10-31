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
- Coverage plan (more films and shows: search, first run, deck): [COVERAGE-PLAN.md](COVERAGE-PLAN.md)

---

## Start here (next session)

Where things stand at the end of 2026-10-31 (fourth session, handover):

- **The site is live** at https://emmachilds98-wq.github.io/Binger/,
  published from `main` by the "Deploy site" workflow with the TMDB key
  built in (decision 4). Films, TV and anime all work with nothing to paste.
- **Merged today:** #9 to #12, i.e. coverage steps 1 to 3 ([COVERAGE-PLAN.md](COVERAGE-PLAN.md)),
  review scores (code ready, key pending), bring your history (IMDb,
  Letterboxd, MyAnimeList, AniList), **sign in or nothing** (decision 20)
  and Settings on every page.
- **Checks:** `npm test` 146 passing, `npm run e2e` all passing,
  `npm run e2e:sync` 38/38 on the Firebase emulators, TMDB live green.
- **Waiting on the owner:**
  - the `MDBLIST_API_KEY` repository secret (COVERAGE-PLAN step 4): until
    then review scores (IMDb, Rotten Tomatoes, MyAnimeList) stay hidden;
  - optionally `TMDB_API_KEY` and `MDBLIST_API_KEY` in the Claude Code cloud
    environment, so sessions can check against the live APIs directly;
  - one real try of Google sign-in (only email sign-in is scripted).
- **Branch from `main`.** Work on a branch, open a PR, merge to `main`.

Do these in order:

1. Run `npm run check && npm test && npm run e2e` to confirm a green start
   (and `npm run e2e:sync` if Java is installed; see [FIREBASE.md](FIREBASE.md#on-the-emulators-no-firebase-project-needed)).
2. **TMDB is verified live** in GitHub Actions (`.github/workflows/tmdb-live.yml`,
   weekly and on source changes). If it goes red, read its log and fix
   `js/sources/`. Once `MDBLIST_API_KEY` exists, its "review scores" step
   runs too: if MDBList names Rotten Tomatoes' audience score differently
   from `popcorn` / `tomatoesaudience` / `audience`, fix `fromMdblist` in
   `js/sources/ratings.js` (the step prints the raw source names).
3. **Firebase is connected and live-checked** (`binger-5cee3`). Sign-in is
   now required where sync is set up (decision 20): the main e2e run plays a
   copy without sync; signing in is covered by `npm run e2e:sync`.
4. **Next work, in order:** mobile polish is done (2026-10-31, fifth
   session). The leftovers in COVERAGE-PLAN: anime
   rated on IMDb or Letterboxd should map to AniList (known gap), Coming
   soon (the owner said "not now"), Trakt (the owner's call). Phase 3's
   shared deck ("match with Dave") after that.
5. If someone with canvas access is around, add the PC layout, the import
   sheet and the new welcome to the design canvas (they're written up in
   DESIGN.md) and copy the canvas to `docs/design/canvas/`.
6. Tick the boxes here and add a [status log](#status-log) entry.

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
4. **The TMDB key is never committed, but it is built into the deployed
   site** (the owner's choice, 2026-10-31: nobody should have to paste a key).
   The deploy workflow (`.github/workflows/pages.yml` → `scripts/build-site.mjs`)
   writes the repository secret into the published copy of `js/config.js`
   only; the repo keeps `tmdbKey: ''`, and a test fails if anything shaped
   like a TMDB key is committed anywhere. The key is readable by anyone who
   opens the site, as any key a browser uses is. Accepted for a free,
   read-only key; if it's ever abused, make a new key at TMDB and update the
   secret, or move it behind a proxy (UPGRADE-PLAN step 3). **The built-in
   key wins, and Settings has no key field where one is built in** (the
   owner's ask, 2026-10-31); the field, and a pasted or household key, only
   apply to a copy with none built in (forks, local development). Without
   any key the app still works, anime-only.
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
15. **"Where to watch" links only to legal sources** (TMDB / JustWatch for
    films and TV, AniList's official links for anime). The owner asked for
    buttons and a Settings link to piracy streaming sites (r/Piracy's
    megathread) on 2026-10-31; declined, and the legal Watch button built
    instead. Don't add piracy sites or lists of them.
16. **Talk shows, news and daily soaps never reach the deck** (TMDB TV genres
    10767, 10763, 10766: `NOT_FOR_DECK` in `tmdb.js`). They air daily, so
    they filled "on now" and "popular TV". Search still finds them, so
    anyone can log one.
17. **A service's shows = its TMDB networks + what's on it where you live.**
    "Apple TV+ originals" are asked for by network (`TMDB_NETWORKS` in
    `services.js`, same in every country; each id checked weekly by the live
    check); "what's on Netflix" by watch provider, in your region. Typing a
    service into search lists both, first.
18. **Review scores come from MDBList** (`js/sources/ratings.js`): IMDb,
    Rotten Tomatoes critics and audience, Metacritic, Letterboxd, by TMDB
    id. Rotten Tomatoes and IMDb have no open API (RT licenses to partners
    only); OMDb lacks the audience score. The key is built in at deploy from
    `MDBLIST_API_KEY` like the TMDB key (decision 4), each title's scores are
    cached for a week (free plan: 1,000 lookups a day), and without a key
    nothing shows. Scores are shown, not yet used by the engine.
19. **First-run picks are 4½★ diary entries marked `setup`** until you
    review them (Library → Diary → "From your first run"): loved enough to
    steer the deck at once, and honest about not being a real review yet.
20. **Sign in or nothing, where sync is set up** (the owner's ask,
    2026-10-31: "no ability to add just a name… so there's no mismatches
    between people and we sync at the first possible point"). The welcome
    offers only Google or email and stays until the device is signed in and
    in a household; an invite code (or link) joins that household instead
    of starting one; signing out brings the welcome back. A copy without a
    Firebase config (forks, local development, the main e2e run) asks just
    a name. Supersedes the "Just my name" route of the third session.

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
- [x] Set the default branch to `main` (done by the owner, 2026-10-31)
- [x] **Build the TMDB key into the site:** repo **Settings → Pages → Build and
      deployment → Source: GitHub Actions** (switched by the owner, 2026-10-31), then Actions → "Deploy site" → Run
      workflow (or push to `main`). Until then "Deploy site" skips with a note
      and Pages serves `main` without a built-in key.
- [x] Switch on GitHub Pages (on by 2026-10-31, from `main`): repo **Settings → Pages → Build and deployment →
      Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
      The app appears at `https://emmachilds98-wq.github.io/Binger/`
- [ ] On your phone: open that link, Taste → ⚙ Settings → paste TMDB key → Test & save
- [ ] Add to Home Screen (Safari: Share → Add to Home Screen). On iPhone this
      also stops Safari clearing the library after 7 days unused.
- [x] **Verify films and TV against the live TMDB API** (2026-10-31, in GitHub
      Actions with the repository secret; now weekly and on every adapter
      change: [Verifying TMDB live](#verifying-tmdb-live)).

### Phase 2: Smarter suggestions ✅

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
- [x] **Step 3. "Not this franchise"** (canvas 10)
- [x] **Step 4. New-season alerts for TV you've watched** (canvas 11)
- [x] **Step 5. Taste over time + "how you like to watch"** (canvas 12)

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

### After Phase 2: PC and mobile upgrade ◐
- [x] People: separate libraries for each person, "Who's watching?", the who chip
- [x] Firebase sync code (household, invite, merge, shared TMDB key), unit-tested
- [x] The live check on the Firebase emulators (`npm run e2e:sync`, in CI)
- [x] Connect the real Firebase project and do the live check there ([FIREBASE.md](FIREBASE.md)): passed 2026-10-31
- [x] PC layout (designed in DESIGN.md, built, e2e at 1280 / 768 / 360 px)
- [x] Films and TV for everyone (the TMDB key, built into the deployed site: decision 4)
- [ ] Mobile polish
Details, order and owner decisions: [UPGRADE-PLAN.md](UPGRADE-PLAN.md).

### Coverage: more films and shows ◐ ([COVERAGE-PLAN.md](COVERAGE-PLAN.md))
- [x] Step 1: search finds any film or show (and "apple tv" lists Apple's),
      a first-run grid of what most people have seen with "Show more", a
      newer and wider deck (recent hits, streamers' originals, no talk shows)
- [x] Step 2: people and years in search, `/similar` fallback, page memory,
      review scores (IMDb, Rotten Tomatoes critics + audience, Metacritic,
      Letterboxd via MDBList), no TMDB key field where one is built in
- [x] Step 3: scores in the engine, anime scores (MyAnimeList), every
      service woven into the first-run grid (the owner's choice), first-run
      picks reviewable from Library → Diary
- [ ] Coming soon: "not now" (the owner, 2026-10-31)
- [ ] Step 4 (owner): `MDBLIST_API_KEY` repository secret (switches scores
      on); `TMDB_API_KEY` + `MDBLIST_API_KEY` in the cloud environment; Trakt later, maybe

### Phase 3: Grows with you everywhere
- [x] Optional sync across devices (Firebase Auth + Firestore): built early, see above
- [x] Import history: IMDb and Letterboxd CSVs, MyAnimeList export, AniList username (Trakt not yet)
- [ ] Shared watchlist / "match with a friend" deck (two profiles, one deck)

### Phase 4: AI assist (optional, needs a tiny backend for the API key)
- [ ] Claude-written taste summary from your reviews
- [ ] Ask in plain words: "cosy anime under 12 episodes", "something like Severance but funnier"
- [ ] Personal one-line pitches on cards

---

## Status log

Newest first. One entry per working session: what changed, what's next, what's blocking.

### 2026-10-31 (fifth session, later): mobile polish, Log a watch
- UPGRADE-PLAN step 4 done: install prompt after three saves (once per
  device); posters with a TMDB `srcset` and the next two preloaded; the two
  fonts served from `fonts/` (nothing from Google Fonts now, and they work
  offline); two faces on cards under 380 px; a quick flick swipes
  (`js/ui/gesture.js`) with a light vibration; Share on a title with a
  `#title/<id>` link that opens it. The backup nudge isn't needed since
  decision 20.
- The owner asked for the first run's "What have you loved?" panel from the
  diary too: Library → Log a watch now opens it ("What have you watched?"),
  closeable, no minimum, without what you've already watched, with search
  for any title. Picks go in the diary as loved under "Picked, not reviewed
  yet" (was "From your first run").
- Tests: 152 unit; e2e and e2e:sync passing; screenshots 28 new, 19 changed.
- **Next:** the coverage leftovers (COVERAGE-PLAN.md): anime rated on IMDb or
  Letterboxd should map to AniList.

### 2026-10-31 (fifth session): the two intermittent CI failures on #13
- **e2e, "Bring your history"** (Enter on the AniList field did nothing, so
  the wait timed out): a real bug in `js/ui/sheet.js`. Each sheet focused its
  own panel a frame after opening, unconditionally, so a field focused in that
  frame lost the cursor. And a sheet opened just before (Settings) did the
  same once another sheet (history) was on top. Now the deferred focus only
  happens if the sheet is still on top and nothing inside it has focus. The
  e2e check opens the sheet and focuses the field in one go, then waits two
  frames; it fails on the old code every time.
- **e2e:sync, "Both ways, live"**: switching person reloads the page, and the
  test went on before the reload, so Dave's ArrowRight landed on the old page
  and nothing was saved for Emma. It now waits for the reload, for Emma's
  who chip with a ready top card and no sheet open, and checks the save in
  Dave's localStorage before looking at Emma's browser.
- Ran `npm run e2e` and `npm run e2e:sync` three times each: all green.

### 2026-10-31 (fourth session, end): handover
- The owner merged #12 and asked to stop here for the next agent. Start
  here is refreshed for them; everything below is merged into `main`.

### 2026-10-31 (fourth session, evening): bring your history; sign-in only
- The owner merged #11 ("merge and continue"). Built Import history
  (Phase 3; COVERAGE-PLAN → Import history): IMDb ratings/watchlist CSV
  (exact, by IMDb id via TMDB `/find`), Letterboxd's export CSVs (by name
  and year), MyAnimeList's XML (.gz too) and an AniList username, from
  Settings and from the first-run screen. `importHistory` (library.js)
  only adds what's new; the sheet lists misses and offers Undo.
- The owner then asked for sign-in to be part of sync, with no "just a
  name", and Settings from any page. Decision 20: where sync is set up the
  welcome is sign in or nothing, with an invite code field (an invite link
  fills it in) so a second person joins the household rather than starting
  another; a device that skipped sign-in before is asked once more, keeping
  its library; signing out returns to the welcome. Settings is a fourth
  item in the tab bar (foot of the side rail on a PC).
- Checks: 146 unit; e2e all passing (new: sign-in-only welcome, invite
  link, returning device, Settings from every page, import from IMDb, a
  gzipped MyAnimeList export and AniList, Undo); e2e:sync 38 checks on the
  emulators (Dave joins from the welcome; a wrong code on the welcome).
  Screenshot `27-import`; `20-welcome` is now the sign-in-only welcome.

### 2026-10-31 (fourth session, latest): scores in the engine, anime scores
- The owner merged #10 ("merge it and continue").
- Built COVERAGE-PLAN step 3, items 1 and 4: the engine's quality term
  blends IMDb, Rotten Tomatoes' audience score and MyAnimeList with TMDB's
  or AniList's own when known ("Highly rated: IMDb 8.6"); anime asks
  MDBList by MyAnimeList id (AniList's `idMal`, checked live). Library
  snapshots keep `imdbId` and `malId`. All inert until the owner's
  `MDBLIST_API_KEY` secret exists.
- Asked the owner about the two design-first items. Browse by service:
  "mix all streaming services within the grid with no defined structure",
  so one first-run tile in three is a service's own series, the 12 services
  taking turns. Coming soon: "not now".
- The owner also asked that first-run picks steer the swipe deck (they do:
  now proven by a test and a browser check) and can get full reviews.
  They're marked `setup` (decision 19); Library → Diary lists them under
  "From your first run" with a Review button that opens the "Seen it" sheet.
- Tests: 136 unit; e2e (new: picks seed the deck, reviewing a pick;
  screenshots 25, 26) and e2e:sync passing.

### 2026-10-31 (fourth session, later): coverage step 2, review scores
- The owner merged #9 ("merge it and start"), then asked for more sources
  "like IMDb", Rotten Tomatoes' user score, and no TMDB key in Settings now
  that it's built in.
- Checked the sources (COVERAGE-PLAN → Sources): Rotten Tomatoes' API is
  partner-only and licensed (about $60k a year); IMDb has no free API; OMDb
  has no audience score. MDBList (free key) gives IMDb, Rotten Tomatoes
  critics and audience, Metacritic and Letterboxd by TMDB id: built
  `js/sources/ratings.js` against its documented format (decision 18). It
  switches on when the owner adds `MDBLIST_API_KEY` (built in at deploy).
- Built COVERAGE-PLAN step 2: people in search (a row that opens their
  page, plus what they're known for), a year in search ("dune 2021"),
  `/similar` when recommendations are thin, 5 seeds for big libraries, and a
  page memory so refills keep reaching new titles. Details link to IMDb.
- Settings has no TMDB key section where a key is built in, and the
  built-in key always wins (decision 4 updated).
- Tests: 131 unit (was 120); `e2e:sync` all passing on the emulators (the
  key order changed); e2e all passing with new checks (person in
  search, review scores with a built-in key, no key field); screenshots
  `23-search-person`, `24-review-scores`. The live check gains "people and
  years in search", "deck reach" and "review scores" (skips without the key).
- **Owner:** add the `MDBLIST_API_KEY` repository secret (COVERAGE-PLAN step
  4). **Next:** COVERAGE-PLAN step 3.

### 2026-10-31 (fourth session): coverage, more films and shows
- The owner couldn't find Apple TV+ shows they like, saw gaps in newer
  titles, found the first-run picks slim, and asked for a full upgrade plan
  (and to be asked about connections). Wrote [COVERAGE-PLAN.md](COVERAGE-PLAN.md).
- Found: the live site has its TMDB key, so the gaps were in how Binger asks
  TMDB: one shared page of search results, a first-run grid of this week's
  trending only (30 tiles), "on now" TV full of talk shows and soaps, nothing
  from the last two years beyond the newest 20, a 150-rating floor most
  newer series miss, and no route to a streamer's own shows.
- Built step 1: search by films and series separately plus anime, ranked by
  closeness; type a service ("apple tv") for its shows; first-run grid of
  trending + all-time most-rated + last three years + anime, with "Show
  more", picks kept at the front and "Nothing found" said; deck adds
  trending page 2, a two-year "recent" pull, one streamer's originals a
  refill ("An Apple TV+ original"), lower TV vote floors, and drops talk,
  news and soaps (decisions 16 and 17).
- The live check (`scripts/tmdb-live.mjs`, GitHub Actions) now also checks
  each network id, Apple originals, "on now" without talk shows, search
  results and the first-run grid. This session had no `TMDB_API_KEY`, so it
  ran on PR #9 with the repository secret: all passed (14 network ids right,
  Apple originals back, right first result for each search, 112 first-run
  titles plus 111 behind "Show more").
- Tests: 120 unit (was 109), e2e all passing (101 checks), new screenshots
  `21-onboarding-search`, `22-search-service`. `e2e:sync` not needed (no
  sync files changed).
- **Next:** COVERAGE-PLAN step 2. **Owner:** add `TMDB_API_KEY` to the cloud
  environment (COVERAGE-PLAN step 3) so sessions can check against live TMDB.

### 2026-10-31 (third session, end): sign in on the welcome, Watch button
- The owner asked for sign-in on the first visit (so nobody links devices
  later), with "just a name" as the only way past. The welcome now signs you
  in (Google or email) and makes a household for a new account straight away;
  an existing account gets "Which one is you?". `welcomeSignedIn` in `app.js`
  finishes it from `onUser`, so a Google redirect lands in the same place.
- The owner also asked for buttons to, and a Settings link to, piracy
  streaming sites. Declined (decision 15); built a legal **Watch** button in
  "Where to watch" instead.
- e2e: the main run takes "Just my name" (Escape can't skip; a name is
  needed); the sync run signs Emma up on the welcome, signs her laptop in
  there ("Which one is you?" → Emma → welcome closes), 36 checks.

### 2026-10-31 (third session, after merge): deploy fix
- The owner switched Pages to GitHub Actions and ran "Deploy site": it failed
  copying the repository into its own `_site` folder (my build script had
  only been tried with an outside folder). Fixed by copying entry by entry;
  `tests/build-site.test.js` now runs the build exactly as the workflow does.

### 2026-10-31 (third session, final): built-in TMDB key, wider deck, welcome
- The owner asked for films and TV with no key to paste, for wider coverage,
  and for Binger to ask who you are on entering so friends can sync; then
  merge and send the link. Also: no secrets in `config.js`.
- **Built-in key, never committed:** `scripts/build-site.mjs` + the "Deploy
  site" workflow build the site with the repository secret written into the
  published `config.js` only (after checking TMDB accepts it). Decision 4
  updated. Needs one owner click: Pages → Source: GitHub Actions (Phase 1.1).
- **Wider deck:** each refill adds one "wider" TMDB pull for films and one for
  TV (`widerPull` in `candidates.js`): all-time acclaimed, hidden gems (well
  rated, fewer votes), or a film or series in one of 12 other languages. Cards
  say so ("A Korean series, from further afield"). Your profile still ranks them.
- **Welcome:** a first visit asks "Who's this?" (name) with "Sync with friends"
  (opens sign-in over the first run) or "Just me for now". Skipped for invite
  links and devices already in a household; asked once per device.
- Fixed: the tablet e2e check measured before the re-render that follows a
  resize (it now waits for it).
- Tests: 108 unit; e2e and e2e:sync passing; screenshot `20-welcome`.

### 2026-10-31 (third session, last): TMDB verified live
- PC layout merged (#5). The owner added the TMDB key as a GitHub repository
  secret, so the live TMDB check now runs in GitHub Actions
  (`scripts/tmdb-live.mjs`, `.github/workflows/tmdb-live.yml`), no session
  secret needed. First real contact between the adapter and TMDB: shapes all
  match the fixtures.
- Fixed from what it found: Apple's rename (TMDB "Apple TV" is Binger's
  "Apple TV+" again, so stream-only stops hiding Apple shows); shops filtered
  out of the services picker (`isStoreOnly` in `services.js`). Tests: 105.
- **Next:** UPGRADE-PLAN step 3's proxy (films and TV for visitors without a
  key) needs the owner's Cloudflare account; then step 4, mobile polish.

### 2026-10-31 (third session, later): PC layout
- After #4 merged, the owner asked to carry on and merge to `main`. Built the
  PC and tablet layout from UPGRADE-PLAN step 2. The canvas couldn't be opened
  from this account, so the design is written in DESIGN.md → "PC and tablet
  layout" (the plan's fallback).
- Under 700 px nothing changes: the phone screenshots are byte-identical to
  `main`'s. ≥ 700 px: sheets are centred windows, Library rows in columns, a
  wider app. ≥ 900 px: the top card's details beside the deck (`detailPanel`,
  shared `detailCtx` in `app.js`), Taste in two columns. ≥ 1100 px: a side
  rail instead of the bottom tabs. Key hints under the deck buttons with a
  mouse; `/` search and `?` shortcuts from any tab.
- Found by the new checks: Taste's two CSS columns on its fixed-height scroll
  area spilled a third column off the right edge; the columns now sit on an
  inner wrapper that grows with its content.
- e2e: new passes at 1280×800, 768×1024 and 360×640 (side rail, details
  follow the top card, centred dialogs, columns, nothing wider than the
  screen); screenshots 15–19.
- `TMDB_API_KEY` still isn't visible to sessions started before the owner set
  it; they've also added it as a GitHub repository secret, so the live TMDB
  check can run in GitHub Actions instead.

### 2026-10-31 (third session): Firebase sync tested for real
- The owner asked to carry on from the last session, connect Firebase and
  finish the upgrades. Started from PR #3's head (`29488b5`, CI green); all
  three branches checked: `claude/happy-cerf-qei1lg` (PR #2) is contained in
  `claude/inspiring-ride-ieuekd` (PR #3), and `main` was at `e86c79f`. (The
  owner merged #2 and #3 into `main` at 07:48, just after; #4 holds only this
  session's commits on top.)
- No access to the owner's Firebase project from the session (gcloud has no
  credentials, and the web config isn't anywhere in the repo or PRs), so
  instead ran the FIREBASE.md live check for real: the real Firebase JS SDK
  (10.14.1, from gstatic) against the Auth + Firestore emulators with
  `firestore.rules` loaded, two to four browsers. New: `scripts/e2e-sync.mjs`
  (`npm run e2e:sync`), `firebase.json`, `npm run emulators`, a `sync` CI job,
  and an `emulators` key in a config that points `js/sync/firebase.js` at
  them (tests only).
- It found two bugs, both fixed:
  - People and sync re-rendered when Firebase finished loading and wiped the
    email and password you'd typed ("That doesn't look like an email
    address"). It now keeps typed values and focus across refreshes.
  - Signing in on a second device of your own (rather than via an invite
    link) added a nameless person to the household and didn't load your
    library. It now asks "Which one is you?" first, the same as joining
    (`whichOneIsYou` in `app.js`; `readHousehold` in `sync.js`).
- Verified: Emma signs up, starts a household; her library and TMDB key go to
  Firestore (the key never in the library doc); Dave opens the invite link,
  joins, picks "Someone new", gets films and TV via the shared key; both
  people listed; switching to Emma on Dave's phone shows her watchlist; a save
  on one device reaches the other in about 1.5 s and a delete propagates;
  Emma's laptop signs in and claims Emma; a wrong code says "No household with
  that code."; a stranger can't read a household, a library or `users/{uid}`,
  overwrite a library, create a household for someone else, or join while
  changing anything but adding themselves. No script errors.
- Then the owner sent the project's web config (`binger-5cee3`); it's in
  `js/config.js`, so every device connects with nothing to paste. A config
  pasted on a device now wins over the deployment's (like the TMDB key; it's
  also how the sync test reaches the emulators). Both browser runs block
  Firebase's real backends, and the sync run checks nothing reached them.
  The email field had no input styling (now matches the others). Read-only
  check of the project: web app done; Authentication not started yet; no
  Firestore database yet (FIREBASE.md §1 has the steps).
- Not done: the PC layout, the TMDB proxy and mobile polish (the owner asked
  to finish this round and continue in a new chat). `TMDB_API_KEY` was added
  to the secrets mid-session, but a running container doesn't pick up new
  secrets, so the live TMDB check waits for the next session.
- Tests: 104 unit (was 102), e2e all passing, sync 34/34.
- Then the owner did the console steps. Read-only check: Authentication on,
  `emmachilds98-wq.github.io` authorised, Firestore created. The live check on
  the real project passed (FIREBASE.md → On the real project); test accounts
  deleted. The owner asked for #4 to be merged into `main`, and for a new
  session (which gets the `TMDB_API_KEY` secret) to do the TMDB live check.
- **Next:** see Start here: TMDB live check, then the PC layout.

### 2026-10-31 (second session): Phase 2 finished, people and sync
- The owner turned on Pages (live from `main`) and asked for: the upgrades,
  a PC layout, Firebase, and a way for "Dave and I" to tell who is who, then
  to merge soon and leave next steps so someone else can finish.
- Built Phase 2 steps 3 to 5 to artboards 10 to 12. Taste over time now takes
  one snapshot per calendar month (30-day steps gave two "Oct"s).
- Built people and Firebase sync (see UPGRADE-PLAN.md → Done). Library state
  gained `removed` tombstones, `settingsAt` and `changedAt` (on undo) so two
  copies merge correctly; `mergeStates` / `syncText` are pure and tested.
- Not done: the PC layout (next), mobile polish. Firebase not yet connected:
  no access to the owner's project from the session; steps in FIREBASE.md.
  `TMDB_API_KEY` was not set in this session either.
- Tests: 102 unit (was 94), e2e all passing; screenshots 10 to 14 new.
- **Next:** UPGRADE-PLAN.md → Next steps.

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

**Automatic:** `.github/workflows/tmdb-live.yml` runs `scripts/tmdb-live.mjs`
with the repository's `TMDB_API_KEY` secret whenever the TMDB adapter changes,
every Monday, and on demand (Actions → TMDB live → Run workflow). It asks TMDB
for the titles the fixtures describe, runs both through the adapter and
compares the normalised shapes, and uploads trimmed raw captures as an
artifact (`tmdb-live-captures`) for replacing fixtures. Locally, with the key
in your environment: `npm run tmdb:live`.

First run, 2026-10-31: everything matched (trending, film and TV details,
GB providers, a person, a collection, discover by service + length + decade),
and it turned up two things, both fixed: TMDB now calls Apple TV+ "Apple TV"
(Apple's 2025 rename), which stopped "only what I can stream" matching Apple
shows for anyone who'd picked Apple TV+; and GB's provider list now includes
shops ("Apple TV Store", "JustWatch TV Store"), now kept out of the services
picker. Severance's season 3 is listed with no date yet; new-season alerts
wait for a date, which is the intended behaviour.

By hand, in a session where `TMDB_API_KEY` is set:

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
