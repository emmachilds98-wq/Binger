# Binger: plan, status and handover

**This is the document to come back to.** If work stops, changes hands or
loses its thread, start here: what Binger is for, what's built, what's next,
and the decisions that shouldn't be quietly undone. Update the
[status log](#status-log) at the end of every working session.

- Design canvas (6 screens, clickable): https://claude.ai/artifact/LDWPjbsS8nxv55dmhy3SjW
  (private to the owner's claude.ai account; use Share on the canvas to show anyone else)
- How it works inside: [ARCHITECTURE.md](ARCHITECTURE.md)
- Look and feel: [DESIGN.md](DESIGN.md)
- Rules for anyone (human or agent) changing the code: [../CLAUDE.md](../CLAUDE.md)
- Screenshots from the last end-to-end run: [screenshots/](screenshots/)

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
| Key actors *I might know* | Card shows people first who appear in things **you've** watched or saved ("You loved Little Women"), then top billing (`keyPeople` in `js/ui/card.js`) |
| Short trailer clip | ▶ on the card plays a muted 30-second YouTube clip inline; length set in Settings (`js/ui/trailer.js`) |
| Track what I've watched, review it | Library → Diary: half-star rating, feeling tags, written review, date, rewatches (`js/ui/rate.js`, `js/state/library.js`) |
| Steer it | Taste tab: Films/TV/Anime mix, favour new releases, surprise me, never-show genres; plus every swipe and rating |
| Effortlessly use that for the next best suggestion | The engine re-ranks the deck after **every** swipe or rating; each card says why it was picked (`js/engine/`) |
| Easily updatable as new media comes out | No hand-kept catalogue: every refill pulls this week's trending, recent releases, shows airing now and the current anime season, live (`js/sources/candidates.js`) |
| Grows with the user | Recent opinions outweigh old ones (time decay), ratings are read relative to your own average, and seeds rotate so recommendations widen as your library grows |

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
   era) with evidence shrinkage and time decay, plus quality, freshness, seed
   and trending terms. Every card carries plain-English reasons. All of it is
   unit-tested in Node. Maths in [ARCHITECTURE.md](ARCHITECTURE.md#the-engine).
7. **Network-first service worker.** Online, every open runs the latest code:
   no "update available" step and no version to keep in sync with the worker
   (the drift that broke another app in this account). Offline, it falls back
   to the cached copy.
8. **One combined AniList request per deck refill.** AniList allows about 30
   requests a minute, so trending, the current season, genre picks,
   "recommended because you liked X" and next seasons all come back in a
   single GraphQL call.

---

## Roadmap

### Phase 0: Design ✅
- [x] Six-screen design canvas: first run, Discover deck, detail + trailer,
      rate/review sheet, Library (watchlist + diary), Taste.
- [x] Look committed: "late-night cinema" (DESIGN.md).

### Phase 1: MVP ✅ (first PR)
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
- [x] Tests: 51 unit tests (engine, adapters on real AniList responses, library, shell), 27-check browser run including offline (`npm run e2e`)
- [x] CI on every push / PR

### Phase 1.1: Go live (needs the owner) ⏳
- [ ] Merge the first PR into `main`
- [ ] Switch on GitHub Pages: repo **Settings → Pages → Build and deployment →
      Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
      The app appears at `https://emmachilds98-wq.github.io/Binger/`
- [ ] On your phone: open that link, Taste → ⚙ Settings → paste TMDB key → Test & save
- [ ] Add to Home Screen (Safari: Share → Add to Home Screen). On iPhone this
      also stops Safari clearing the library after 7 days unused.
- [ ] **Verify films and TV against the live TMDB API.** The owner has added
      `TMDB_API_KEY` as a cloud-environment secret; a new session can run the
      checks in [Verifying TMDB live](#verifying-tmdb-live). So far TMDB is
      tested only against hand-written responses that follow TMDB's documented
      format.

### Phase 2: Smarter suggestions
- [ ] "Only show what I can stream": pick your services, filter/boost by TMDB watch providers
- [ ] New-season alerts for TV you've watched (TMDB `next_episode_to_air`), as anime already has
- [ ] Use feeling tags in scoring (e.g. many "Slow" tags → lower long-runtime dramas)
- [ ] Tap a person → their other work, ranked for you
- [ ] "Not this franchise" pass (collection-level dislike)
- [ ] Taste-over-time view (how the profile has shifted)
- [ ] Deck filters: runtime ("under 2 hours"), episodes ("under 13"), decade

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
- **Not yet verified:** live TMDB responses (no key in that session; the
  owner has since added `TMDB_API_KEY` as an environment secret for the next
  session). AniList was verified live.
- **Next:** Phase 1.1 (merge, Pages, key on phone, live TMDB check), then Phase 2.

---

## Verifying TMDB live

In a session where `TMDB_API_KEY` is set:

```bash
# 1. The key works
curl -s "https://api.themoviedb.org/3/configuration?api_key=$TMDB_API_KEY" | head -c 200
# 2. The adapter normalises real responses (prints a few titles with cast + trailer)
node -e "
import('./js/sources/tmdb.js').then(async ({ createTmdb }) => {
  const t = createTmdb({ key: process.env.TMDB_API_KEY, region: 'GB' });
  const list = await t.trending('movie');
  const d = await t.details('movie', list[0].sourceId);
  console.log(d.title, d.year, d.cast.slice(0,3).map(c=>c.name), d.trailer, d.providers && d.providers.stream.map(p=>p.name));
  const tv = await t.details('tv', (await t.trending('tv'))[0].sourceId);
  console.log(tv.title, tv.seasons, tv.crew, tv.trailer);
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
- "Where to watch" covers films/TV (TMDB + JustWatch). For anime, the detail
  sheet points to AniList's streaming links.

## Resuming work: the 60-second version

```bash
npm test          # unit tests (no network)
npm run check     # syntax-check every JS file
npm run e2e       # full browser run with mocked APIs → docs/screenshots/
npm run serve     # http://localhost:8080
npm run bump      # set version + build time from the real UTC clock before shipping
```

Work on a branch, open a PR, keep this file's checkboxes and status log current.
