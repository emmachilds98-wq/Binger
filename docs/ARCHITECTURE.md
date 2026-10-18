# How Binger works inside

A static web app: `index.html` + ES modules, no build step. Four layers, and
each one only talks to the one below it.

```
 ui/        screens and sheets: build DOM, handle taps and swipes
   │          (deck, card, detail, rate, library, taste, search, settings, onboarding, filters)
 app.js     the controller: owns the store, sources and deck; wires UI callbacks
   │
 engine/    PURE: profile, scoring, ranking, explanations   (no DOM, no fetch)
 sources/   TMDB + AniList adapters → normalised Title; candidate gathering
 state/     library rules (pure), localStorage store, IndexedDB API cache
```

## File map

| File | Job |
|---|---|
| `index.html` | Shell: `#view`, tab bar, loads `js/version.js` then `js/app.js` |
| `js/version.js` | The only place the version lives (`npm run bump`) |
| `js/config.js` | Deployment defaults (optional shared TMDB key, empty in the repo) |
| `js/app.js` | Controller: deck state, refill, actions, undo, routing, rendering |
| `js/engine/features.js` | Title → weighted features, grouped |
| `js/engine/profile.js` | Library → taste profile (affinities, evidence, people you know) |
| `js/engine/score.js` | One title × profile → score |
| `js/engine/explain.js` | Score → plain-English reasons |
| `js/engine/rank.js` | Pool → deck (filters, hidden series, streaming, mix quotas, diversity, wildcards); watchlist ranking; `rankForYou` (a person's work) |
| `js/engine/seasons.js` | New seasons of TV you've watched (`seasonAlert`, `seasonAlerts`, `showsToCheck`) |
| `js/engine/timeline.js` | Your profile replayed at past dates (`tasteTimeline`, `itemAsOf`) |
| `js/sources/genres.js` | TMDB / AniList genre vocabularies → one canonical set |
| `js/sources/services.js` | TMDB / AniList streaming-service names → one canonical name each |
| `js/sources/http.js` | `fetchJSON` (timeout, 429 retry), `cached` (stale-on-error), `mapLimit` |
| `js/sources/tmdb.js` | TMDB client + normalisers (films, TV) |
| `js/sources/anilist.js` | AniList client + normaliser (anime); one batched deck query |
| `js/sources/candidates.js` | Builds the candidate pool from both sources (incl. your services and deck filters); `hydrate` fetches TMDB details |
| `js/sources/lookups.js` | On-demand lookups: a person's work, a whole franchise, service choices, new-season checks |
| `js/state/library.js` | Pure library rules: status, watches, undo, import/export, migration |
| `js/state/store.js` | localStorage persistence + change notifications |
| `js/state/cache.js` | IndexedDB key-value cache with expiry (memory fallback) |
| `js/ui/*.js` | One file per screen or sheet; `dom.js` = `h()` / `append()` helpers + icons; `sheet.js` = sheets + toasts; `filters.js` = deck filters sheet |
| `service-worker.js` | Network-first app shell, cache-first images |
| `tests/*.test.js` | `node --test` unit tests; fixtures in `tests/fixtures/` |
| `scripts/e2e.mjs` | Full browser run with mocked APIs, writes `docs/screenshots/` |
| `docs/design/canvas/` | A copy of the design canvas's artboards (the screens to build to) |

## The Title (what every source produces)

Every adapter turns its API's response into this shape, and nothing outside
`js/sources/` ever sees a raw API response.

```js
{
  id: 'tmdb:movie:693134' | 'tmdb:tv:95396' | 'anilist:154587',
  source: 'tmdb' | 'anilist', sourceId: 693134, mediaType: 'movie' | 'tv' | 'anime',
  kind: 'film' | 'tv' | 'anime',
  title, originalTitle, year, releaseDate, lastAirDate, airing,
  overview, tagline, poster, backdrop, color,
  genres: ['Science Fiction', ...],          // canonical vocabulary (genres.js)
  keywords: ['desert planet', ...],          // TMDB keywords / AniList tags (no spoilers)
  cast: [{ id: 'tmdb:p:1190668', name, character, photo }],   // anime: voice actors
  crew: [{ id, name, job: 'Director' | 'Creator' | 'Writer' | 'Screenplay' | 'Original Story' }],
  studios: ['Legendary Pictures'], networks, language: 'en',
  runtime, episodes, seasons, format, formatLabel, certification, status,
  score: 0-10, votes, popularity,
  trailer: { site: 'youtube', key, name } | null,
  providers: { link, stream: [{ name, logo }], free, rent, buy } | null,   // TMDB only, per region
  streaming: ['Netflix', ...],               // canonical services: TMDB stream+free in your region; AniList links
  watchLinks: [{ name, url }],               // AniList only: official streaming pages
  streamHint: true,                          // found by searching your services' catalogues (TMDB)
  collection: { id: 'tmdb:collection:726871', name: 'Dune' } | null,   // TMDB films (details)
  prequelIds, sequelIds, franchiseIds,       // AniList only (franchiseIds: every related anime, one hop)
  nextEpisode: { season, episode, date },    // when the next episode airs (AniList adds `at`, ms)
  lastEpisode, seasonList: [{ number, date, episodes, name }],   // TMDB TV details
  url, detailed: boolean,                    // false = list data (no cast/keywords/runtime/streaming yet)
  via: [{ type: 'seed' | 'sequel' | 'fresh' | 'genre' | 'stream' | 'trending' | 'popular', seedTitle, ... }]
}
```

A person's credits (`loadPerson` in `js/sources/lookups.js`) are Titles plus
`role` ("Paul Atreides", "Director, Storyboard") and `major` (a lead role or a
creative lead, which ranks a little higher).

## The library (what's saved on the device)

`localStorage['binger:v1']`, shape documented at the top of
`js/state/library.js`. Items hold a trimmed **snapshot** of the Title (so the
library still renders offline and the profile can be rebuilt without any
network), a status (`want` / `watched` / `passed`), and a list of watches
(`{ date, rating (0.5-5), tags, review }`, one per viewing), and
`dismissed` (new-season alerts you waved away, e.g. `['s3']`). Settings
include `services` (canonical names), `streamOnly`, and `hiddenFranchises`
(`[{ key, name, ids }]`). `migrate()` repairs anything malformed on load;
export strips the TMDB key.

## The engine

All in `js/engine/`, pure functions, run on every change (fast enough: a few
hundred items × ~30 features).

**1. Features** (`features.js`). Each title becomes weighted features in groups:

| Group | Example key | Weight in affinity | Combined by |
|---|---|---|---|
| genre | `g:science fiction` | 0.30 | mean |
| keyword / theme | `k:desert planet` | 0.17 | sum, then squash (tanh) |
| creator | `c:tmdb:p:137427` | 0.17 | sum, then squash |
| cast (top 6, by billing) | `p:tmdb:p:1190668` | 0.15 | sum, then squash |
| studio | `s:madhouse` | 0.07 | sum, then squash |
| kind | `t:anime` | 0.06 | mean |
| language | `l:ja` | 0.04 | mean |
| era | `e:2020` | 0.04 | mean |
| length | `n:film-short`, `n:series-long` | 0.05 | mean |

"Sum then squash" means one director you love counts fully even though the
other nine people on the card are strangers.

Length buckets: films under 100 / 100-140 / over 140 minutes; series of
≤ 13 / 14-39 / 40+ episodes. Unknown (list data) means no length feature yet.

**2. Signals** (`profile.js`). Each library item gives one signed signal:
rating → `0.5·(r−3)/2 + 0.5·(r−baseline)/2` (half absolute, half relative
to *your* average, which is shrunk toward 3 stars), want = +0.5, watched
unrated = +0.35, pass = −0.2 (weak: it often means "not tonight"). Each is
decayed by age (half-life: ratings 540 days, wants 180, passes 120).
Feeling tags on your latest viewing nudge the signal (`TAG_NUDGE`, e.g.
Rewatchable +0.08, Overhyped −0.1; capped at ±0.25 overall). "Slow" also adds
negative evidence to that title's length bucket, and recent "Overhyped" tags
add up in `stats.hype`.

**3. Profile.** For every feature, `P = Σ signal·decay·weight`,
`N = Σ |signal|·decay·weight`, and **affinity = P / (N + 1.5)**. That's in
(−1, 1), measures how you feel *relative to how often you've met it*, and
stays near 0 until there's real evidence. The profile also records, per
feature, the best title behind it (for "From Denis Villeneuve, who made
Arrival") and a people index (for "You loved Little Women").

**4. Score** (`score.js`).
`score = (0.15+0.5w)·affinity + (0.35−0.15w)·quality + 0.10·freshness + 0.12·seed + (0.10−0.06w)·h·trending + 0.06·onServices`,
where `w` (warmth, 0-1) grows with how much you've told Binger and
`h = 1/(1+0.6·hype)` shrinks as you call things "Overhyped". New users get
mostly well-rated and popular titles; affinity takes over as you rate.
Quality is a Bayesian average (a 9.0 from 12 votes counts as roughly 6.9).
`onServices` is true / false / unknown: known from the title's `streaming`
list once detailed (AniList always), or from `streamHint`.

**5. Deck** (`rank.js`). First `eligible()` drops what's in your library,
hidden genres and hidden series (`isBlocked`: by id, TMDB collection or AniList
relation), kinds filtered out, titles outside the deck filters (`isShort`:
films ≤ 120 min, series ≤ 13 episodes; `inDecade`), and with "Only what I can
stream", titles known not to be on your services. Unknown length or
availability stays in until details arrive. Then pick cards one at a time:
best score, plus a bonus for whichever kind is under its Films/TV/Anime share,
minus a penalty for being too similar to the last five (genre/creator/studio
overlap). With "Surprise me" on, every 7th card is a well-rated title with low
affinity, so the profile can discover new likes. The deck re-ranks after every swipe.

`rankForYou` orders a person's credits the same way (`major` roles +0.08);
`rankWatchlist` orders your watchlist.

**6. Reasons** (`explain.js`): sequel of something you watched →
recommended off a title you loved → creator / cast / studio you rate (one cast
line max) → liked genres folded into one line → themes → a length you rate
highly → new / airing / coming soon → on your services ("On Netflix") →
trending → "Highly rated".

**7. New seasons** (`seasons.js`). For TV you've watched, a season counts as
new if it premieres after the latest date in your diary for that show (or the
next episode is a premiere). States: `airing`, `out`, `soon`. Dismissed per season.

**8. Taste over time** (`timeline.js`). `itemAsOf` replays each item as it
stood on a past date; the profile is rebuilt at 6 monthly points and each top
genre (plus any faded favourite) gets a series and a trend (rising / fading /
steady, at ±0.12).

## Where candidates come from (`sources/candidates.js`)

On every refill (deck below 8 cards, a filter change, or "Fetch fresh cards"):

| Source | Films / TV (TMDB, needs key) | Anime (AniList, one batched request) |
|---|---|---|
| Trending | `/trending/{movie,tv}/week` | `TRENDING_DESC` |
| New | discover: released in the last 120 days; TV with an episode in the last 14 days | current season, by popularity |
| Your genres | discover with your top genres (random page 1-3 for variety) | `genre_in` your top anime genres |
| Because you liked | `/recommendations` for your top 3 seeds + 1 rotating | `recommendations` for anime seeds |
| Next seasons | (TV keeps one id: see engine/seasons.js) | `SEQUEL` ids of anime you've watched |
| Your services | discover with `with_watch_providers` (your services' ids in your region); 2 pages with "only" on | (AniList links checked per title) |
| Deck filters | discover with `with_runtime.lte=120` and/or the decade's dates | a `filtered` page: `episodes_lesser`, `startDate` range |
| Cold start | `/popular` | (trending covers it) |

Then: TMDB copies of Japanese animation are dropped, AniList OVAs/specials and
adult titles are dropped, anything already in your library is dropped, and
"Season 2" of something you haven't watched is dropped (but kept, marked as
the next part, when you have). The top few TMDB titles are then *hydrated*
(one detail call each, with credits, keywords, videos, watch providers and
certificates appended) so their cards have cast and trailers.

## Caching and offline

- **API responses**: IndexedDB (`js/state/cache.js`) with expiry: lists 6 h,
  details, people and AniList staff 3 days, providers and collections 7 days,
  popular 12-24 h. If a refresh fails, the stale copy is used.
- **App code**: service worker, network-first with a 4 s timeout, falling
  back to cache. Online always means latest code, so there's no update prompt.
- **Images**: service worker, cache-first, capped at 400.
- **Your library**: localStorage. Export/import JSON in Settings.

## Testing

- `npm test`: engine maths (`engine.test.js`, and Phase 2 in
  `steering.test.js`), both adapters (AniList against **real** captured
  responses; TMDB against hand-written responses following TMDB's documented
  format) and lookups (`sources.test.js`, `lookups.test.js`), candidate
  gathering with fake fetch, library rules, and shell checks (service-worker
  file list complete, no diff/conflict text in sources, version format, no
  committed key).
- `npm run e2e`: the real app in Chromium at phone size with the APIs mocked
  from fixtures: first run, key validation, filters, trailer play/stop, drag
  swipe, pass, undo, detail, half-star rating, diary, taste, reload
  persistence, deck filters, zero console errors, offline. Writes `docs/screenshots/`.
