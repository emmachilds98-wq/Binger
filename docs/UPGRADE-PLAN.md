# Binger: upgrade plan for PC and mobile

Written 2026-10-31 after a review of the whole repo. It sits alongside
[PLAN.md](PLAN.md), which stays the source of truth: when a milestone here
starts, its items move into PLAN.md's roadmap and status log.

## Where things stand

**What's good.** The core of the brief works: swipe across films, TV and
anime, rate and review, a library, and an engine that re-ranks after every
swipe and explains each pick. The code is tidy, with one job per file, pure
logic kept apart from the screens, 94 unit tests and 49 browser checks, all
passing on this branch (2026-10-31). Phase 2 steps 1 and 2 (streaming services,
a person's work) are built.

**What's holding it back**, most important first:

1. **Nobody can open it yet.** GitHub Pages is off (the site URL returns 404),
   GitHub's default branch is still `claude/happy-cerf-qei1lg`, and
   [PR #2](https://github.com/emmachilds98-wq/Binger/pull/2) (steps 1 and 2)
   isn't merged into `main`.
2. **Films and TV need each device to get its own TMDB key.** Without one the app
   is anime-only. Getting a key means making a TMDB account and filling in a form,
   which most people won't do. It's the biggest drop-off in the whole app.
3. **On a PC it's a phone in the middle of the screen.** The whole app is a
   480 px column (`.app { max-width: 480px }`), so on a 1440 px monitor two
   thirds of the screen is empty. Sheets cover the deck, so you can't read
   details while you swipe.
4. **Your PC and your phone don't share a library.** Everything lives in one
   browser. Someone who swipes on their phone and browses on their laptop
   ends up with two Bingers that know different things about them. Export and
   Import exist, but they're manual.
5. **Mobile polish gaps:** no install prompt (iPhone users need to Add to Home
   Screen, or Safari may clear the library after 7 days unused); posters
   are always fetched at `w500` (more data than a phone card needs on
   mobile data); fonts come from Google Fonts and aren't cached, so offline
   it falls back to system fonts; cast names on the card cut off early
   ("Timoth…", "Paul Atr…"); no way to share a title with a friend.
6. **Only tested at one size.** The browser run uses a 390×844 phone. Nothing
   checks a small phone (360×640), a tablet or a desktop.

## Milestones

Work top to bottom. Each item is about one PR. Items marked **owner** need
a decision or a settings change from the repo owner.

### M0. Go live (owner, about 10 minutes)

- [ ] Merge [PR #2](https://github.com/emmachilds98-wq/Binger/pull/2) into `main`.
- [ ] Settings → General → Default branch → `main`.
- [ ] Settings → Pages → Deploy from a branch → `main` / `(root)` → Save.
      The app appears at **https://emmachilds98-wq.github.io/Binger/** a
      minute or two later.
- [ ] On your phone: open it, Taste → ⚙ Settings → paste a TMDB key → Test & save,
      then Add to Home Screen.
- [ ] Verify TMDB live (steps in PLAN.md, "Verifying TMDB live"). This is still
      not done, and every film and TV screen depends on it.

### M1. Finish Phase 2 (already designed)

The screens are on the canvas (row 3) and the logic is written and tested.
Build order and checks are in PLAN.md.

- [ ] Step 3: "Not this franchise" (artboard 10)
- [ ] Step 4: New-season alerts for TV you've watched (artboard 11)
- [ ] Step 5: Taste over time + how you like to watch (artboard 12)

### M2. Mobile polish

Phones are where Binger is used most, so this comes before desktop.

- [ ] **Install prompt.** On Android/Chrome, catch `beforeinstallprompt` and offer
      "Add Binger to your home screen" once the user has saved 3+ things. On iPhone
      Safari (not already standalone), show a one-time hint with the Share →
      Add to Home Screen steps, and say why: it keeps the library safe.
- [ ] **Backup nudge.** If the library has 20+ entries and no export in 30 days, a
      quiet line on Library: "Back up your library". One tap exports.
- [ ] **Lighter images.** Add `srcset` for posters (`w342` / `w500` / `w780`) and
      cast photos (`w92` / `w185`) in `js/sources/tmdb.js` + `js/ui/dom.js`, so phones
      download only the size they draw. Preload the next two cards' posters so a
      swipe never shows a blank card.
- [ ] **Self-host the fonts.** Put the two font files (woff2, Latin subset) in `fonts/`
      and add them to `SHELL`. Offline then looks the same as online, there's no
      Google request on every open, and text appears sooner.
- [ ] **Card fit on small screens.** On the card, show two people instead of three
      below 380 px, so names don't cut off. Add a 360×640 run to the e2e (see M5).
- [ ] **Swipe feel.** A fast flick should count even if it's a short drag (use
      speed as well as distance in `js/ui/deck.js`); a light vibration on Want / Pass
      where the phone supports it (`navigator.vibrate`, Android only), with
      reduced-motion respected.
- [ ] **Share a title.** "Share" on the detail sheet uses the phone's share menu
      (`navigator.share`), copying a link where that isn't available. The link opens
      that title's details: add a `#title/<id>` route to `js/app.js`.

### M3. A proper PC layout

Design first: per CLAUDE.md, screens are built to the canvas. Add a desktop row
to the canvas (Discover, Library, Taste at 1280×800), copy it to
`docs/design/canvas/`, then build.

- [ ] **Breakpoints.** Phone (< 700 px): exactly as now. Tablet (700–1099 px):
      deck on the left, details on the right. Desktop (≥ 1100 px): a narrow side
      rail for Discover / Library / Taste instead of the bottom tab bar, the deck
      in the middle, and the detail panel open alongside it.
- [ ] **Details beside the deck, not over it.** On wide screens the detail view
      (trailer, why, cast, where to watch) is a panel that follows the top card,
      so you can read and swipe at the same time. Sheets stay for Rate, Filters and
      Settings, drawn as centred dialogs rather than bottom sheets.
- [ ] **Library as a poster grid.** Watchlist and Diary in 3 to 6 columns with
      sort and filter (kind, rating, year), instead of one long phone list.
- [ ] **Taste in two columns.** What's been learned on the left, steering controls
      on the right.
- [ ] **Keyboard and mouse.** The keys already work (← Pass, → Want, ↑ Seen it,
      Enter details, Z undo); show them as small hints on the buttons on devices
      with a mouse (`@media (hover: hover)`), add `/` to search and `?` for a
      shortcuts list. A bigger trailer on desktop, unmuted on click.

### M4. One library on every device (owner decision)

This is Phase 3 in PLAN.md. It's moved up because it's what makes PC and phone
feel like one app.

- [ ] **Owner: choose how to sync.** The plan says Firebase Auth + Firestore, as in
      your other apps. Sign-in stays optional, and without it nothing changes.
- [ ] Move the library from localStorage to IndexedDB first (localStorage holds
      about 5 MB, and sync touches the same code in `js/state/store.js`).
- [ ] Sync the library and settings (not the TMDB key) with last-write-wins per
      entry. Library rules stay pure in `js/state/library.js`.
- [ ] **Interim, no account:** "Move to another device" in Settings shows a QR code
      / link with the export, so moving a library from phone to PC takes seconds.

### M5. Films and TV without a key (owner decision)

- [ ] **Owner: choose.** Either keep "bring your own key" (free, nothing to run),
      or add a tiny proxy (for example a Cloudflare Worker on the free plan) that
      holds one TMDB key and forwards only the read-only calls Binger makes. The
      key never reaches the browser or the repo, and everyone gets films and TV
      on first open. The same small backend is what Phase 4 (AI assist) needs.
- [ ] If yes: `js/sources/tmdb.js` gets a base URL setting; a user's own key in
      Settings still overrides it. Cache headers on the Worker keep it within
      TMDB's limits.

### M6. Smarter from day one

- [ ] **Import history** (PLAN.md Phase 3): Letterboxd CSV, AniList / MyAnimeList
      export, Trakt. A new user with years of ratings gets good picks in their first
      minute instead of after 50 swipes. Parsing lives in `js/sources/`, matching
      reuses search.
- [ ] **"Tonight" pick.** One button on Library → Watchlist: "What should I watch
      tonight?" Asks how long you've got (the length buckets already exist) and
      picks the best match from your own watchlist, using the engine's ranking.

### M7. Testing on every size (alongside M2 and M3)

- [ ] Run the e2e at three sizes: 360×640 (small phone, touch), 390×844 (now),
      1280×800 (desktop, mouse). Save screenshots for each in `docs/screenshots/`.
- [ ] Keep the "nothing wider than the screen" check at every size, and add one
      that the deck's action buttons are fully on screen at 360×640.
- [ ] A Lighthouse run in CI (performance, accessibility, PWA), failing below
      agreed scores.

## Decisions needed from the owner

| Decision | Options | Recommendation |
|---|---|---|
| Go live (M0) | — | Do it now: nothing else matters until it can be opened |
| Desktop design (M3) | Design on the canvas first, or build straight away | Canvas first, so it matches the rest |
| Sync (M4) | Firebase, or stay local-only with QR transfer | QR transfer now, Firebase after M3 |
| TMDB key (M5) | Bring your own key, or a small proxy | Proxy: it's free and removes the biggest drop-off |

## Suggested order

M0 → M1 → M2 + M7 (small-phone checks) → M3 + M7 (desktop checks) → M4 → M5 → M6.
M5 can move earlier if you want to show Binger to friends: it's what lets
someone open the link and see films straight away.
