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

1. **First run**: "What have you loved?" poster grid + search; 3 picks to start.
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
