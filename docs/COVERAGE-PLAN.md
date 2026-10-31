# Binger: coverage upgrade plan (more films and shows)

Written 2026-10-31. [PLAN.md](PLAN.md) stays the source of truth for
decisions and the status log; this file is the plan for making Binger find
more of what's out there. **Picking this up? Start at [Next](#step-2-next-no-owner-input-needed).**

## The owner's ask (their words, 2026-10-31)

> Expand the coverage of the Binger app to include more shows and movies. I
> currently can't find Apple TV shows I like and there are clearly large gaps
> in the library for newer options.

> I should be able to search any show or movie I've seen in the initial
> screen to show what I like, but pickings seem slim.

> Make a full upgrade plan and ask me to upgrade connections if needed.

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

## Step 1 (this PR): done

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

## Step 2: next (no owner input needed)

In order of value for "I can't find what I've watched":

1. [ ] **People in search.** Typing an actor or director ("Adam Scott")
       shows them as a row that opens their page (already built: `openPerson`),
       plus their best-known titles in the results. TMDB `/search/person`
       gives `known_for`. Needs a small design note (a person row in search).
2. [ ] **A year in search.** "Dune 1984" or "The Office 2001": when the last
       word is a year, ask TMDB with `year` / `first_air_date_year` as well as
       without, and rank the matching year first.
3. [ ] **"More like this" that never runs dry.** Seeds use TMDB
       `/recommendations`, which is empty for many new or niche titles. Fall
       back to `/similar` when it is, and allow 5 seeds (not 3) once a library
       has 30+ loved titles.
4. [ ] **Browse by service on the first run.** A row of service chips above
       the grid (Apple TV+, Netflix, Prime Video, Disney+, BBC iPlayer…); a
       tap fills the grid with that service's shows (`serviceTitles`, page by
       page). **Design first**: add it to canvas artboard 1, or sketch it in
       DESIGN.md and get the owner's OK.
5. [ ] **Coming soon.** Films and series not out yet (TMDB discover with
       future dates, most anticipated first), so they can go on the watchlist
       now; new-season alerts already cover shows you've watched.
6. [ ] **Fewer "nothing new" refills.** Each refill picks random pages; keep
       a per-session record of which pages have been asked for, so a long
       session keeps reaching new titles instead of re-asking page 1.
7. [ ] **Measure it.** A small script (`npm run coverage`, needs the key)
       that counts how many distinct titles ten refills reach, and how many
       are from the last two years, so changes here can be compared.

## Step 3: needs the owner (connections and decisions)

1. [ ] **TMDB key for cloud sessions** (recommended; two minutes). The repo's
       GitHub Actions secret already runs the live check, but a Claude Code
       cloud session can't see it, so a session builds against fixtures and
       waits for Actions to find out how real TMDB answers. Add the same key
       to the cloud environment: the environment menu in the session's title
       bar → Edit → Network secrets (or an environment variable) named
       **`TMDB_API_KEY`**. New sessions pick it up. Never paste it into a chat
       or commit it.
2. [ ] **Optional, later: Trakt.** A free Trakt API app gives "most
       anticipated", "most watched this week / year" lists and history import
       (Phase 3). It would be a third source (decision 2 says TMDB + AniList),
       so it's the owner's call. Needs a Trakt account and an API app's client
       id (not a secret); nothing is needed now.
3. Not needed: JustWatch has no public API (TMDB's "where to watch" already
   comes from JustWatch); TVmaze and OMDb would add little that TMDB doesn't
   have. The TMDB proxy in [UPGRADE-PLAN.md](UPGRADE-PLAN.md) step 3 is about
   who can use the key, not coverage.

## How to see it working

- Search "apple tv": Apple TV+ shows first, with a line saying so.
- Search "slow hor": Slow Horses comes up before you've finished typing.
- First run: scroll the grid (classics, recent hits, anime), tap "Show more".
- Discover: some cards say "An Apple TV+ original" (or another service).
- GitHub → Actions → **TMDB live**: the "networks", "originals", "TV without
  talk shows", "search" and "first-run grid" steps.
