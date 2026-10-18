# Binger design

The screens were designed first on a Claude design canvas, then built to match:
https://claude.ai/artifact/LDWPjbsS8nxv55dmhy3SjW (private to the owner; share it from the canvas).
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

## Interaction rules

- Every gesture has a button twin and a key: → Want, ← Pass, ↑ Seen it, Enter details, Z undo.
- A drag can start anywhere on a card, even on the play button; a tap on the button still plays.
- Trailer clips start muted and trimmed (30 s by default).
- Sheets close with the back gesture, Escape or the backdrop.
- Touch targets ≥ 44 px; reduced-motion respected; text via `textContent` only.
