# Design canvas (copy)

The screens are designed on a Claude design canvas first, then built to match:
https://claude.ai/artifact/LDWPjbsS8nxv55dmhy3SjW (private to the owner's
claude.ai account; use Share on the canvas to show anyone else).

**The canvas is the source of truth.** This folder is a copy of its files, so
anyone (or any agent) without access to the canvas can still read exactly
what each screen should look like and say. Copied 2026-10-18, canvas version 8.
If you change the canvas, copy its `project/` files here again in the same PR.

These files need the canvas's runtime to render, so you can't open them
directly in a browser. Read them as source: the markup has every colour,
size, spacing and piece of copy inline, and the `renderVals()` script at the
bottom of each file holds the sample data and the interactive states.

| Row | File | Screen | Built? |
|---|---|---|---|
| 1 | `Onboarding.dc.html` | 1 · First run: seed your taste | ✅ `js/ui/onboarding.js` |
| 1 | `Main.dc.html` | 2 · Discover deck | ✅ `js/ui/deck.js`, `js/ui/card.js` |
| 1 | `Detail.dc.html` | 3 · Card detail + trailer clip | ✅ `js/ui/detail.js` |
| 1 | `Rate.dc.html` | 4 · Seen it: rate + review | ✅ `js/ui/rate.js` |
| 2 | `Library.dc.html` | 5 · Library: watchlist + diary | ✅ `js/ui/library.js` |
| 2 | `Taste.dc.html` | 6 · Taste: what Binger has learned | ✅ `js/ui/taste.js` |
| 3 | `Filters.dc.html` | 7 · Deck filters: length, decade, streaming | ✅ `js/ui/filters.js` ("Where" waits for 8) |
| 3 | `Services.dc.html` | 8 · Your streaming services | ✅ `js/ui/services.js` |
| 3 | `Person.dc.html` | 9 · A person's work, best for you first | ⏳ next, see docs/PLAN.md |
| 3 | `HideSeries.dc.html` | 10 · Not this franchise | ⏳ next |
| 3 | `Seasons.dc.html` | 11 · Library: new seasons of shows you watched | ⏳ next |
| 3 | `TasteTime.dc.html` | 12 · Taste over time + your words | ⏳ next |

`canvas.json` is the canvas index: where each artboard sits, its title, and
the sticky notes (the look, and the Phase 2 rules).
