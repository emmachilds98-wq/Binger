# Binger: upgrade plan for PC and mobile (handover)

First written 2026-10-31 after a review of the whole repo; updated the same
day after the first round of upgrades. **If you're picking this up, start
with [Next steps](#next-steps-in-order).** [PLAN.md](PLAN.md) stays the
source of truth for decisions and the status log; this file is the plan for
the upgrade work.

## Owner's priorities (in their words, 2026-10-31)

> Optimise the UI for a PC web view as well as having this nice mobile UI.
> Allow me to connect with Firebase and make a way Dave and I can
> differentiate who is who when using. This should be ASAP.
> The TMDB API key … should be used for the app so we can have wider range.

## Done (on `claude/inspiring-ride-ieuekd`, PR #3)

- [x] **Phase 2 finished.** Step 3, "Not this franchise" (toast after a Pass,
      link in details, unhide on Taste). Step 4, new-season alerts (Library →
      "Back with new episodes", dot on the Library tab). Step 5, taste over
      time (small-multiples chart, one snapshot per calendar month) and "How
      you like to watch". Screenshots 10 to 12.
- [x] **People: you and Dave** (screenshots 13, 14). Each person has their own
      library and suggestions. A chip on every screen shows whose library it
      is (name and colour; just the initial on narrow phones). "Who's
      watching?" asks on open when there's more than one person (can be
      switched off per device). Settings → **People and sync** adds,
      renames, removes and switches people.
- [x] **Firebase sync code**: sign in (Google or email), start a household,
      invite by code or link (`#join=…`), "Which one is you?", live sync per
      person, the TMDB key shared through the household. Merge rules are in
      `js/state/library.js` (`mergeStates`); Firestore rules in
      `firestore.rules`; setup in [FIREBASE.md](FIREBASE.md).
      Tested in Node against a stand-in Firebase (`tests/sync.test.js`:
      two people on two devices, one person on two devices, deletes).
      **Not yet run against the real Firebase project.**
- Checks at hand-over: `npm test` 102/102, `npm run e2e` all passing.

## Next steps (in order)

### 1. Connect the real Firebase project (owner, then anyone) — ASAP

The owner has a Firebase project called **binger**. Nobody in the build
sessions had access to it, so this is the one piece that needs a person.

- [x] The live check, run for real on the Firebase emulators with the real
      SDK and `firestore.rules` (`npm run e2e:sync`, in CI as the `sync` job):
      34 checks, two bugs found and fixed (FIREBASE.md → Live check).
- [x] Owner: the console steps in [FIREBASE.md §1](FIREBASE.md#1-in-the-firebase-console-the-owner-once-about-10-minutes)
      (web app, Google + Email sign-in, authorised domain
      `emmachilds98-wq.github.io`, Firestore, publish `firestore.rules`).
- [x] Put the web config in `js/config.js` → `firebase: { … }` (project
      `binger-5cee3`, 2026-10-31). A shell test checks its shape, and that
      it never points at the emulators.
- [x] The [live check on the real project](FIREBASE.md#on-the-real-project)
      passed (2026-10-31). Google sign-in still wants one try by a person.

### 2. A proper PC layout — ASAP

Today every screen is a 480 px phone column in the middle of the monitor
(`.app { max-width: 480px }` in `css/app.css`). Mobile stays exactly as it is.

- [x] **Design first** (CLAUDE.md: build to the canvas). Done in
      `docs/DESIGN.md` → "PC and tablet layout" (the canvas couldn't be opened
      from the 2026-10-31 session's account); a canvas row is still to add. Add a desktop row to
      the canvas (Discover, Library, Taste, Detail at 1280×800) and copy it
      to `docs/design/canvas/`. If there's no canvas access, sketch it in
      `docs/DESIGN.md` and get the owner's OK.
- [x] **Breakpoints in `css/app.css`** (built as 700 / 900 / 1100 px; see DESIGN.md). Under 700 px: unchanged. 700 to
      1099 px: deck left, details right. 1100 px and up: a side rail
      (Discover / Library / Taste, plus the who chip) instead of the bottom
      tab bar, and the main area up to about 1200 px wide.
- [x] **Details beside the deck** (≥ 900 px; `detailPanel` in `js/ui/detail.js`). On wide screens render `openDetail`'s
      content into a panel next to the deck that follows the top card,
      instead of a full sheet (`js/ui/detail.js` builds the parts;
      `js/ui/sheet.js` decides how they're shown). Rate, Filters and
      Settings become centred dialogs (`.sheet-bottom` at ≥ 700 px:
      `max-width: 560px; border-radius: 28px; bottom: auto; top: 50%; transform: translateY(-50%)`).
- [x] **Library in columns** at ≥ 700 px (rows in columns rather than a
      poster grid, so match % and actions stay); **Taste in two columns** at ≥ 900 px.
- [x] **Keyboard and mouse** (key hints, `/` search, `?` shortcuts: `js/ui/shortcuts.js`). Keys already work (← Pass, → Want, ↑ Seen it,
      Enter details, Z undo; `keydown` in `js/app.js`). Show them as small
      hints on the action buttons under `@media (hover: hover)`, add `/` to
      search and `?` for a shortcuts list.
- [x] **e2e at more sizes** (1280×800, 768×1024 and 360×640 passes; screenshots 15–19) (`scripts/e2e.mjs` uses one 390×844 context):
      add 360×640 (touch) and 1280×800 (mouse) runs of the main flow, with
      screenshots, and keep the "nothing wider than the screen" check.

### 3. Films and TV for everyone (the TMDB key)

The owner wants the TMDB key used app-wide. The repo is public and the site
is static, so **anything built into the site is readable by every visitor**,
and `tests/shell.test.js` fails if `js/config.js` holds a key (decision 4 in
PLAN.md). Options, best first:

- [ ] **Now, no code:** paste the key once in Settings on one device. With
      sync connected (step 1) it's shared through the household, so Dave
      gets films and TV too. (A cloud session's `TMDB_API_KEY` secret is
      only for development: use it for [Verifying TMDB live](PLAN.md#verifying-tmdb-live).)
- [ ] **For anyone who opens the link:** a tiny proxy (e.g. a free
      Cloudflare Worker) that holds the key as its own secret and forwards
      only Binger's read-only TMDB calls; point `js/sources/tmdb.js` at it
      (a base-URL setting; a user's own key still wins). Needs the owner to
      create the Worker account.
- [ ] Not recommended: inject the key into `js/config.js` at deploy time
      from a GitHub Actions secret. It still ends up public on the site.
      If the owner chooses it anyway, update decision 4 in PLAN.md and the
      shell test together.
- [ ] Still outstanding from Phase 1.1: [Verifying TMDB live](PLAN.md#verifying-tmdb-live)
      in a session where `TMDB_API_KEY` is actually set (it wasn't in this one).

### 4. Mobile polish (after 1 to 3)

- [ ] Install prompt (Android `beforeinstallprompt`; an iPhone hint for
      Share → Add to Home Screen) once someone has saved 3+ things.
- [ ] Backup nudge on Library when there's no sync and no export in 30 days.
- [ ] `srcset` for posters (`w342` / `w500` / `w780`) and cast photos; preload
      the next two cards.
- [ ] Self-host the two fonts (woff2 in `fonts/`, add to `SHELL`).
- [ ] Cast on the card: two people instead of three under 380 px.
- [ ] Swipe on speed as well as distance (`js/ui/deck.js`), light vibration
      on Android.
- [ ] Share a title (`navigator.share`) with a `#title/<id>` route.

### 5. Later

- [ ] Import history: Letterboxd CSV, AniList / MyAnimeList, Trakt.
- [ ] "Tonight" pick from your watchlist by time available.
- [ ] Shared deck for two ("match with Dave"): both people's profiles are
      now in every household device's storage, so the engine can score a
      title for both and show what you'd both like.
- [ ] Lighthouse in CI.

## Decisions taken in this round (add to PLAN.md's list if they hold)

- **People are profiles on the device; sync is per household.** Each person
  signs in with their own account, but libraries belong to people, not
  accounts, so a shared PC can switch between Emma and Dave.
- **Switching person reloads the page.** Every piece of state (deck, caches,
  profile, sync) belongs to one person; a reload swaps them all safely.
- **Firebase web config may be committed; the TMDB key may not.**
- **Sync merges with the library's own rules** (`mergeStates`, pure,
  unit-tested). Newest change per title wins; deletes are tombstoned.
