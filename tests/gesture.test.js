// A quick flick counts as a swipe even short of the distance threshold
// (js/ui/gesture.js); a slow drag or a drift back does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flickDirection } from '../js/ui/gesture.js';

// A drag from (0,0) to (x,y) over ms milliseconds, sampled every 16 ms.
const drag = (x, y, ms) => {
  const out = [];
  for (let t = 0; t <= ms; t += 16) out.push({ x: (x * t) / ms, y: (y * t) / ms, t });
  return out;
};

test('a quick short flick swipes, in the direction it went', () => {
  assert.equal(flickDirection(drag(70, 5, 80), 70, 5), 'right');
  assert.equal(flickDirection(drag(-70, 5, 80), -70, 5), 'left');
  assert.equal(flickDirection(drag(4, -70, 80), 4, -70), 'up');
});

test('a slow drag of the same length doesn’t, nor does a tiny fast twitch', () => {
  assert.equal(flickDirection(drag(70, 5, 600), 70, 5), null);
  assert.equal(flickDirection(drag(25, 0, 20), 25, 0), null);
});

test('a drag that ends by flicking back the other way isn’t a swipe', () => {
  const out = [...drag(80, 0, 400)];
  const t0 = out[out.length - 1].t;
  for (let i = 1; i <= 4; i++) out.push({ x: 80 - i * 15, y: 0, t: t0 + i * 16 });
  assert.equal(flickDirection(out, 20, 0), null);
});

test('downwards is never a swipe', () => {
  assert.equal(flickDirection(drag(0, 90, 80), 0, 90), null);
});
