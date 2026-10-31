// Swipe on speed as well as distance: a quick flick sends a card on its way
// even if it hasn't travelled the full threshold, as people expect on a
// phone. Pure (no DOM) so it's unit-tested in Node; js/ui/deck.js feeds it
// the pointer's recent positions.

export const FLICK_SPEED = 0.6;  // px per ms: a deliberate flick, not a drift
export const FLICK_MIN = 40;     // px: and it has to have gone somewhere
const WINDOW_MS = 100;           // judge speed over the last tenth of a second

// samples: [{ x, y, t }] in time order (t in ms). dx, dy: total movement.
// Returns 'right' | 'left' | 'up' | null.
export function flickDirection(samples, dx, dy) {
  if (!samples || samples.length < 2) return null;
  const last = samples[samples.length - 1];
  const first = samples.find((s) => last.t - s.t <= WINDOW_MS) || samples[0];
  const dt = last.t - first.t;
  if (dt <= 0) return null;
  const vx = (last.x - first.x) / dt;
  const vy = (last.y - first.y) / dt;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (Math.abs(dx) < FLICK_MIN || Math.abs(vx) < FLICK_SPEED) return null;
    // The flick must go the same way as the drag as a whole.
    return vx > 0 && dx > 0 ? 'right' : vx < 0 && dx < 0 ? 'left' : null;
  }
  return dy <= -FLICK_MIN && vy <= -FLICK_SPEED ? 'up' : null;
}
