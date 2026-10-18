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
8. **Your streaming services**: a 3-column grid of toggle tiles (monogram,
   name, amber ring and tick when picked; no brand logos drawn by us, TMDB's
   logos when available), the "Only show what I can stream" switch, and a
   plain note on where availability comes from.
9. **A person's work**: big photo with an amber ring if you know them, name,
   what they're known for, "In Little Women, which you loved"; kind pills;
   rows best-for-you first, each with a match % or your status, and eye /
   bookmark actions.
10. **Not this franchise**: after a Pass on something in a series, the toast
    offers "Hide all Dune films"; then "Dune is hidden" with Undo. Also a link
    on the detail sheet. Hidden series sit in Taste → Never show me, tap to unhide.
11. **New seasons**: Library → Watchlist opens with "Back with new episodes":
    "Season 4 · airing now" / "out now" in amber, "starts 16 Jan" in sky;
    "Watched it" and ✕. The Library tab wears a dot while any are waiting.
12. **Taste over time + how you like to watch**: the chart below; your length
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

## Interaction rules

- Every gesture has a button twin and a key: → Want, ← Pass, ↑ Seen it, Enter details, Z undo.
- Filters that hide things always say so on screen (the summary line, the dot) and can be cleared in one tap.
- An empty deck under filters says it's the filters ("Nothing matches those filters yet") and offers Clear.
- A drag can start anywhere on a card, even on the play button; a tap on the button still plays.
- Trailer clips start muted and trimmed (30 s by default).
- Sheets close with the back gesture, Escape or the backdrop.
- Touch targets ≥ 44 px; reduced-motion respected; text via `textContent` only.
