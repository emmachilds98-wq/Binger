# Binger design

The screens were designed first on a Claude design canvas, then built to match:
https://claude.ai/artifact/LDWPjbsS8nxv55dmhy3SjW (private to the owner; share it from the canvas).
A copy of every artboard lives in [design/canvas/](design/canvas/) (see
[design/README.md](design/README.md) for which are built).
Screenshots of the built app: [screenshots/](screenshots/).

## Look: "late-night cinema"

A dark room, a lit marquee. One warm accent for the thing you most want to do
(save it), and everything else stays quiet so the poster art carries the screen.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0F0E13` | page |
| `--surface` / `--surface-2` | `#1A1820` / `#24212C` | cards, rows / buttons |
| `--line` | `#34303D` | borders |
| `--text` / `--text-2` / `--muted` | `#F4F1EA` / `#D4CFDB` / `#ABA5B6` | text, body, secondary |
| `--accent` | `#F5B83D` marquee amber | Want, primary buttons, stars, "people you know" |
| `--sky` | `#7CC4FF` | Seen it, TV badge |
| `--pink` | `#FF9BC2` | Anime badge |

Kind badges are always labelled (FILM / TV / ANIME), never colour alone.

**Type:** Bricolage Grotesque (display: titles, wordmark) + Instrument Sans
(everything else), from Google Fonts with system fallbacks.

## Screens

1. **First run**: "What have you loved?" poster grid + search; 3 picks to start. Built additions (2026-10-31): titles you pick from a search stay at the front of the grid; a search that finds nothing says so above the grid; a full-width quiet "Show more" button ends the grid. The grid has no sections: one tile in three is a streaming service's own series, services taking turns (the owner's choice over a row of service chips).
2. **Discover**: filter pills, card stack, actions: Undo · Pass · Seen it · Want · Info.
3. **Detail**: trailer on top, why it was picked, synopsis, cast (people you know ringed in amber), where to watch, your diary entries.
4. **Rate (bottom sheet)**: stars (tap twice for a half), what the rating will do ("Binger will look for more like this…"), feeling tags, review, date.
5. **Library**: Watchlist (best match first) / Diary (by month).
6. **Taste**: what's been learned, plus the steering controls.

### Phase 2 (canvas row 3)

7. **Deck filters** (built): a Filters button between Search and Fresh cards;
   a bottom sheet with Length (Any length / Quick watches), Released (Any time,
   2020s … 1980s, Older) and Where ("Only what I can stream", once you've
   picked services). While any filter is on, the button wears an amber dot and
   a summary line with **Clear** sits under the pills.
8. **Your streaming services** (built): a 3-column grid of toggle tiles (monogram,
   name, amber ring and tick when picked; no brand logos drawn by us, TMDB's
   logos when available), the "Only show what I can stream" switch, and a
   plain note on where availability comes from.
9. **A person's work** (built): big photo with an amber ring if you know them, name,
   what they're known for, "In Little Women, which you loved"; kind pills;
   rows best-for-you first, each with a match % or your status, and eye /
   bookmark actions.
10. **Not this franchise** (built): after a Pass on something in a series, the toast
    offers "Hide all Dune films"; then "Dune is hidden" with Undo. Also a link
    on the detail sheet. Hidden series sit in Taste → Never show me, tap to unhide.
11. **New seasons** (built): Library → Watchlist opens with "Back with new episodes":
    "Season 4 · airing now" / "out now" in amber, "starts 16 Jan" in sky;
    "Watched it" and ✕. The Library tab wears a dot while any are waiting.
12. **Taste over time + how you like to watch** (built): the chart below; your length
    "sweet spot"; feeling-tag counts with one plain line on what "Slow" and
    "Overhyped" are doing to your suggestions.

### Taste over time chart

Small multiples, not one tangled multi-line chart: one row per genre (today's
favourites plus any that faded), all on **one shared scale** so rows compare.

- Row: genre label (text colour) · sparkline 150×30 · trend in words
  ("▲ Rising", "Steady", "▼ Fading"), never colour alone.
- Line: 2px, `--muted` grey, round joins. Current month: an 8px amber dot with
  a 2px ring in the surface colour. A 1px solid `--line` zero baseline, so a
  genre dipping below "neutral" reads as a dislike.
- Months under the chart once (first and last). Tap a row for its month-by-month
  numbers; offer the same numbers as a table for screen readers.
- Colours checked with the dataviz validator: grey vs amber ΔE 18 under colour
  blindness (19 normal), both ≥ 3:1 on `#0F0E13` and `#1A1820`.

### After Phase 2 (no artboard yet)

- **People** (built, `js/ui/people.js`): "Who's watching?" is a full screen of
  large round initials in each person's colour (amber, sky, pink, green,
  lilac, orange), the current one ringed. The **who chip** (initial + name;
  initial only under 420 px) sits at the right of every screen's header.
  **People and sync** is a full sheet in the Settings style.
- **Welcome** (built, `openWelcome` in `js/ui/people.js`): **sign in or
  nothing** where sync is set up (decision 20). "Welcome to Binger": your
  name, an invite code field ("Invite code (if someone sent you one)"),
  **Continue with Google** (amber), or email with **Create account** /
  **Sign in**. No way past without signing in; Escape and the back gesture
  don't skip it. A new account gets its own household, or joins the one
  whose code was typed; an existing one asks "Which one is you?". An invite
  link opens it with the code filled in ("You've been invited to a
  household…"). Signed in but not in a household (a wrong code): "Nearly
  there", the code field, **Join household** / **Start my own household**.
  A device that skipped signing in before is asked once more ("Sign in to
  keep going. Everything you've saved on this device comes with you…").
  A copy of Binger without sync asks just a name. Screenshot `20-welcome`.
- **Settings from any page** (built): a fourth item in the tab bar, a gear
  and "Settings", opening the Settings sheet (not a tab of its own); at the
  foot of the side rail on a PC. Taste keeps its "Settings and backup" button.
- **Watch button** (built): "Where to watch" opens with one amber button:
  "Watch on Crunchyroll" (anime: the official stream, your service first) or
  "Where to watch it" (films and TV: TMDB's page of legal options in your
  country). Only legal sources: decision 15 in PLAN.md.
- **"Wider" picks** (built): a card reached by the deck's wider pull says how,
  in the sky "explore" style: "Acclaimed: among TMDB's best rated", "A hidden
  gem: loved by the people who found it", "A Korean series, from further afield".
- **Streamers' own shows** (built): a card from the deck's originals pull
  says "An Apple TV+ original" (or Netflix, BBC iPlayer…), in the plain
  reason style. Typing a service into search adds a muted line above the
  results, "Apple TV+ shows and films first, then everything else that
  matches." Screenshots `21-onboarding-search`, `22-search-service`.
- **People in search** (built): someone whose name you type gets a row
  above the results: a 60px round photo (initials without one), their name,
  "Actor · known for Severance, Parks and Recreation" muted, and a chevron;
  it opens their page. Screenshot `23-search-person`.
- **Review scores** (built): the card's meta line ends "IMDb 8.1 · RT
  audience 90%" (critics when there's no audience score; TMDB's own score
  when there are none). Details have a row of chips under the crew line,
  "IMDb 8.1", "RT critics 97%", "RT audience 90%", "Metacritic 87",
  "Letterboxd 4.0", each a link to that site with a small external-link
  icon (Metacritic has no link). Just "IMDb" when there are no scores yet.
  Anime: "MAL 9.3" on the card, a "MyAnimeList 9.3" chip in details. A card
  picked for being well rated says by whom: "Highly rated: IMDb 8.6".
  Screenshot `24-review-scores`.
- **Reviewing first-run picks** (built): Library → Diary opens with "From
  your first run" (eyebrow), a muted line "These are saved as loved (4½★).
  Review them to tell Binger more.", and a row per pick in the alert-row
  style with a sky "Review" chip. Review opens the "Seen it" sheet with the
  eyebrow "Review your pick" and the button "Save review". Their diary rows
  say "First run" where the date would be. Screenshots
  `25-first-run-review`, `26-first-run-picks`.
- **Bring your history** (built): a full sheet (title "Bring your history"),
  a muted intro, then "From a file" (one line each for IMDb, Letterboxd and
  MyAnimeList on where their export lives, and a quiet "Choose files"
  button) and "From AniList" (username field + quiet Import). A status line
  counts "Matching 120 of 1,203…", then says what happened; a "couldn't be
  found" disclosure lists misses; "Undo import" (quiet) and Done (amber).
  Reached from Settings → "Your history elsewhere" and a small link under
  the first-run search. Screenshot `27-import`.
- **Settings** (built): no "Films & TV (TMDB key)" group where a key is
  built into the site, which is the live site.
- **PC layout** (built; see below). Designed here rather than on the canvas,
  which the 2026-10-31 session couldn't open from its account. Add a desktop
  row to the canvas when someone with access can, and copy it to `design/canvas/`.

### PC and tablet layout

The phone layout is the design; wider screens give it room rather than
inventing new screens. **Under 700 px nothing changes.** Same tokens, type and
components throughout.

| Width | What changes |
|---|---|
| < 700 px | Phone, exactly as designed (390 × 844 artboards). |
| ≥ 700 px | Sheets become centred windows instead of edge-to-edge: bottom sheets (Rate, Filters, confirmations) are a 560 px dialog in the middle of the screen; full sheets (Detail, Search, Settings, People, a person's work, Services) are a 680 px panel with 24 px clear above and below, 28 px corners and a `--line` border. Library rows sit in columns (auto-fill, min 320 px). The app column widens to 960 px. Shortcut hints appear under the deck buttons when there's a mouse. |
| ≥ 900 px | **Details beside the deck.** Discover becomes two columns: the deck (card stack 440 px wide, actions under it) and, to its right, the top card's details: why it was picked, the full synopsis, cast (people you know ringed), where to watch, your diary. It follows the top card as you swipe. The trailer and the Want / Pass / Seen buttons stay on the card. Taste flows into two columns. |
| ≥ 1100 px | **Side rail** instead of the bottom tab bar: Discover / Library / Taste stacked at the top left, icon + label, 220 px wide, `--surface-2` rule on its right; the current tab amber. The app goes up to 1280 px wide. |

- Library is rows in columns, not a poster grid: each row keeps its match %,
  "why" and actions, which a poster grid would hide.
- **Keyboard** (with a mouse, ≥ 700 px): each deck button shows its key under
  it in a small `--muted` label (Z, ←, ↑, →, Enter). `/` opens Search from any
  tab; `?` opens the list of shortcuts. Keys never fire while typing or while
  a sheet is open (except Escape, which closes it).

## Interaction rules

- Every gesture has a button twin and a key: → Want, ← Pass, ↑ Seen it, Enter details, Z undo; / search, ? shortcuts.
- Filters that hide things always say so on screen (the summary line, the dot) and can be cleared in one tap.
- An empty deck under filters says it's the filters ("Nothing matches those filters yet") and offers Clear.
- A drag can start anywhere on a card, even on the play button; a tap on the button still plays.
- Trailer clips start muted and trimmed (30 s by default).
- Sheets close with the back gesture, Escape or the backdrop.
- Touch targets ≥ 44 px; reduced-motion respected; text via `textContent` only.
