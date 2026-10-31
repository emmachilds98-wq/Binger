# Binger: coverage upgrade plan (more films and shows)

Written 2026-10-31. [PLAN.md](PLAN.md) stays the source of truth for
decisions and the status log; this file is the plan for making Binger find
more of what's out there. **Picking this up? Start at [Next](#step-3-next-no-owner-input-needed).**

## The owner's ask (their words, 2026-10-31)

> Expand the coverage of the Binger app to include more shows and movies. I
> currently can't find Apple TV shows I like and there are clearly large gaps
> in the library for newer options.

> I should be able to search any show or movie I've seen in the initial
> screen to show what I like, but pickings seem slim.

> Make a full upgrade plan and ask me to upgrade connections if needed.

> Use more sources like IMDb to expand, as well as any more that would be
> useful, and maybe add user review score from Rotten Tomatoes.

> TMDB [is] built in now, right? Remove the settings area for it.

## What was wrong

TMDB already lists far more than Binger was reaching (hundreds of thousands
of films and series, every Apple TV+ show among them),
and the live site has its key built in, so films and TV were switched on.
The gaps came from **how Binger asked TMDB**, not from what TMDB has:

| Where | What it did | Why it felt thin |
|---|---|---|
| Search | One `/search/multi` call: 20 results, shared with actors | A show could lose its place to people with similar names. AniList's guesses were shuffled in at the same rank. No way to ask for "Apple TV" shows. |
| First run ("What have you loved?") | This week's trending only: 30 tiles (about 10 films, 10 shows, 10 anime) | Nothing from past years, so most favourites weren't there. A pick found by search disappeared when the search was cleared. A search that found nothing silently showed the grid again. |
| Deck: "on now" TV | Shows with an episode in the last fortnight, most popular first | Talk shows, news and daily soaps air every day, so they filled the one list meant for new series. TMDB's "popular TV" has the same problem. |
| Deck: new releases | Films from the last 120 days, page 1 | Nothing from the last couple of years beyond the newest 20. |
| Deck: vote floors | 150 ratings for genre picks, films and TV alike | Series get far fewer ratings than films on TMDB: a well-loved new show may have 40. Most newer series never qualified. |
| Deck: streamers | Only via trending, or if you'd picked the service | Apple TV+ originals rarely trend, so they rarely came up. |

## Step 1: done (PR #9, merged)

- [x] **Search finds any film or show.** Films and series are searched
      separately (20 + 20), plus 25 anime, ranked by how closely the name
      matches (accents, punctuation and a leading "The" ignored; every word
      matches word starts, so "slow hor" finds Slow Horses), then each
      source's own order (`searchTitles`, `rankSearch` in `js/sources/lookups.js`).
- [x] **Search by service.** Type "apple tv", "netflix originals", "iplayer"
      or "hbo" and that service's shows come first: its own series (TMDB
      networks, any country) and what's included with it where you live
      (`serviceFromQuery`, `TMDB_NETWORKS` in `js/sources/services.js`;
      `serviceTitles` in lookups). Works on the first-run screen too.
- [x] **First run: what most people have seen.** This week's trending, the
      most-rated films and series of all time, the biggest of the last three
      years, and the most-watched anime, taking turns (112 tiles on a
      full first page, was 30). "Show more" brings the next page of each.
      Picks found by search stay at the front; "Nothing found for …" is said.
- [x] **Deck: newer and wider.**
  - Trending reaches the top 40 (was 20).
  - A "recent" pull each refill: films and series first released in the last
    two years, a random page 1 to 4.
  - One streamer's own series each refill (your services first, otherwise
    any): cards say "An Apple TV+ original".
  - News, talk shows and daily soaps are left out of every deck TV list.
  - TV genre picks need 50 ratings (films keep 150).
- [x] **Checked live** (on PR #9, in GitHub Actions with the repository's key,
      `scripts/tmdb-live.mjs`, 2026-10-31): all 14 network ids are the
      services they claim (2552 is TMDB's "Apple TV", 1063 "Sky Atlantic"…);
      Apple TV+ originals come back (Slow Horses, Ted Lasso, Silo, Dark
      Matter, Severance, For All Mankind, Foundation…); "on now" has no talk
      shows or soaps; "slow horses", "severance", "the studio" and "pokemon
      detective" each find the right title first; "apple tv" lists 25 of
      Apple's shows and films; the first-run grid has 112 titles, and "Show
      more" brings 111 new ones. Kept in the weekly run.
      Seen, not acted on: "on now" still includes weekly wrestling (WWE Raw,
      NXT), and JustWatch lists a few older films (Inception) as included
      with Apple TV+ in GB; both are TMDB / JustWatch data, not Binger's.
- [x] Unit tests (`tests/coverage.test.js`) and browser checks (first-run
      search, "Show more", "apple tv" search; screenshots 21 and 22).

## Step 2: built (2026-10-31, second round)

The owner merged step 1 and asked to carry on; then asked for more sources
("like IMDb"), Rotten Tomatoes' user score, and no TMDB key in Settings now
it's built in.

1. [x] **People in search.** Typing someone's name ("adam scott", "pedro
       pas") shows them as a row that opens their page (`openPerson`), and
       their best-known titles join the results. One word ("tom") is more
       likely a title, so only a well-known one-name person ("zendaya") gets
       a row; a far less known namesake (a second "Adam Scott", found by the
       live check) is left out, and what they're known for ranks above
       titles that only loosely match the words (`matchingPeople`, TMDB
       `/search/person`).
2. [x] **A year in search.** "dune 2021", "The Office (2005)": TMDB is also
       asked for that year, and that year's title goes first. "Blade Runner
       2049" and "Space 1999" still work as titles (`splitYear`).
3. [x] **"More like this" that never runs dry.** When `/recommendations`
       has fewer than 10 titles (new or niche films), `/similar` fills in; a
       library with 30+ loved titles from a source seeds from 5 of them, not 3.
4. [x] **Page memory.** Each refill turns every list to its next page
       (`turnPage`; the app keeps `deck.pages` for the session, reset with
       the pool or a filter change), so a long session keeps reaching titles
       it hasn't seen. The live check measures it ("deck reach", PR #10):
       five refills reach 686 titles with the memory, 444 without (312 and
       183 of them from the last two years); the fifth refill still adds
       123 new titles, against 57.
5. [x] **Review scores** (the owner's ask): IMDb, Rotten Tomatoes critics
       and audience, Metacritic and Letterboxd, on cards ("IMDb 8.1 · RT
       audience 90%") and in details (each opens its site). From MDBList: see
       [Sources](#sources-what-each-could-add) for why. Needs the owner's
       key (step 3, item 1); until then nothing shows and nothing breaks.
       Details also link to the title's IMDb page, key or not.
6. [x] **No TMDB key in Settings on the live site.** The key built into the
       site always wins; the field only appears on a copy with none built
       in (forks, local development). Decision 4 updated.

## Step 3: next (no owner input needed)

1. [ ] **Scores in the engine.** Use IMDb / Rotten Tomatoes audience
       scores, where known, in the engine's quality term (today it's TMDB's
       vote average), so well-loved titles rank higher. Pure change in
       `js/engine/score.js`, after a week of real scores in the cache.
2. [ ] **Browse by service on the first run.** A row of service chips above
       the grid (Apple TV+, Netflix, Prime Video, Disney+, BBC iPlayer…); a
       tap fills the grid with that service's shows (`serviceTitles`, page by
       page). **Design first**: add it to canvas artboard 1, or sketch it in
       DESIGN.md and get the owner's OK.
3. [ ] **Coming soon.** Films and series not out yet (TMDB discover with
       future dates, most anticipated first), so they can go on the
       watchlist now. Needs a place on screen: design first.
4. [ ] **Anime scores.** MDBList also knows MyAnimeList ids; AniList gives
       `idMal`. Add it to the AniList query and show MyAnimeList's score.

## Step 4: needs the owner (connections)

1. [ ] **MDBList key, for review scores** (five minutes, free). Make an
       account at mdblist.com → Preferences → API → generate a key. Add it
       to GitHub: the repository's **Settings → Secrets and variables →
       Actions → New repository secret**, named **`MDBLIST_API_KEY`**. The
       next deploy builds it in (and the weekly live check starts checking
       scores). Like the TMDB key it ends up readable on the live site,
       which is fine for a free key; if it's ever abused, make a new one.
       Never paste it into a chat or commit it. The free plan allows 1,000
       lookups a day; each title's scores are kept for a week, which is
       plenty for a household.
2. [ ] **TMDB key for cloud sessions** (recommended; two minutes). The repo's
       GitHub Actions secret already runs the live check, but a Claude Code
       cloud session can't see it, so a session builds against fixtures and
       waits for Actions to find out how real TMDB answers. Add the same key
       (and the MDBList one) to the cloud environment: the environment menu
       in the session's title bar → Edit → Network secrets (or environment
       variables) named **`TMDB_API_KEY`** and **`MDBLIST_API_KEY`**. New
       sessions pick them up.
3. [ ] **Optional, later: Trakt.** See [Sources](#sources-what-each-could-add).

## Sources: what each could add

Checked 2026-10-31. TMDB stays the catalogue: it lists far more than any
household will watch, every streaming original included. What the others
could add is mostly *scores*, and history import.

| Source | Gives | Can Binger use it? |
|---|---|---|
| **MDBList** | IMDb, Rotten Tomatoes critics + audience, Metacritic, Letterboxd, Trakt scores, by TMDB id | **Yes: chosen.** Free key, 1,000 lookups a day. One call per title (`js/sources/ratings.js`). |
| IMDb | Its ratings and the biggest catalogue | Not directly: no free API (only paid AWS data, or bulk files for non-commercial use, too big for a web app). Its rating comes via MDBList; details link to IMDb pages. |
| Rotten Tomatoes | Tomatometer, audience score | Not directly: its API is for approved partners only, with a licence fee (from about $60,000 a year). Both scores come via MDBList. |
| OMDb | IMDb rating, Tomatometer, Metascore | Possible (free key, 1,000 a day), but no Rotten Tomatoes audience score, and MDBList covers it all. Not needed. |
| Trakt | "Most anticipated", "most watched" lists; history import | Later, maybe (free API app, a client id). A third source is the owner's call (decision 2). |
| Letterboxd | Film ratings, diaries | Its API is closed; its rating comes via MDBList. CSV import of your diary is Phase 3. |
| JustWatch | Where to watch | Already in, through TMDB. No public API of its own. |
| TVmaze | TV schedules | Free, but adds little TMDB doesn't have. |

## How to see it working

- Search "apple tv": Apple TV+ shows first, with a line saying so.
- Search "slow hor": Slow Horses comes up before you've finished typing.
- First run: scroll the grid (classics, recent hits, anime), tap "Show more".
- Discover: some cards say "An Apple TV+ original" (or another service).
- GitHub → Actions → **TMDB live**: the "networks", "originals", "TV without
  talk shows", "search", "people and years in search", "deck reach",
  "review scores" (once the MDBList key is in) and "first-run grid" steps.
- Search "adam scott": him first (tap for his page), then Severance and more.
- Search "dune 2021": the 2021 film first.
- Once the MDBList key is in: cards say "IMDb 8.5 · RT audience 95%", and
  details list every score, each opening its site.
