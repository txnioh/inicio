import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGridLayout } from '../src/app/carrete/gridLayout.ts';

function random(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('empty and small collections work across negative coordinates', () => {
  assert.deepEqual(createGridLayout(0)(0, 0, 5, 5), []);
  for (const count of [1, 2, 3, 8, 59, 200]) {
    const layout = createGridLayout(count, random(42));
    const cells = layout(-20, -15, 10, 8);
    assert.equal(cells.length, 80);
    for (const cell of cells) assert.ok(cell.index >= 0 && cell.index < count);
  }
});

test('nearby return journeys preserve the same photos at the same coordinates', () => {
  const layout = createGridLayout(59, random(42));
  const initial = layout(-2, -2, 10, 8);
  for (let i = 1; i < 25; i++) layout(i - 2, -i - 2, 10, 8);
  assert.deepEqual(layout(-2, -2, 10, 8), initial);
});

test('all directions discover the entire archive without immediate viewport repeats', () => {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [4, -1]]) {
    for (const seed of [1, 42, 1234]) {
      const layout = createGridLayout(59, random(seed));
      const seen = new Set();
      for (let step = 0; step < 100; step++) {
        const x = step * dx, y = step * dy;
        const visible = layout(x - 2, y - 2, 10, 8).filter(cell =>
          cell.column >= x && cell.column < x + 5 && cell.row >= y && cell.row < y + 4);
        const unique = new Set(visible.map(cell => cell.index));
        assert.equal(unique.size, 20, `direction ${dx},${dy}; seed ${seed}; step ${step}`);
        unique.forEach(index => seen.add(index));
      }
      assert.equal(seen.size, 59, `direction ${dx},${dy}; seed ${seed}`);
    }
  }
});

test('long journeys beyond the cache keep the current window stable', () => {
  const layout = createGridLayout(59, random(7));
  let latest;
  for (let x = 0; x < 600; x++) latest = layout(x, -x, 10, 8);
  assert.deepEqual(layout(599, -599, 10, 8), latest);
});
