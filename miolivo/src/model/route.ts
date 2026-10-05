import type { Point, TaskType } from './types.ts';

const WALK = 4000 / 60; // metres per minute
const MINUTES_PER_TREE: Record<TaskType, [traditional: number, intensive: number]> = {
  inspeccion: [2, 1.5],
  poda: [15, 6],
  riego: [3, 2],
  tratamiento: [1.5, 1],
};

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Visiting order from the gate: nearest neighbour, then 2-opt while it keeps shortening. */
export function planRoute(start: Point, points: Point[]) {
  const left = points.map((_, i) => i);
  const order: number[] = [];
  let here = start;
  while (left.length) {
    let best = 0;
    for (let k = 1; k < left.length; k++) if (distance(here, points[left[k]]) < distance(here, points[left[best]])) best = k;
    here = points[left[best]];
    order.push(left[best]);
    left.splice(best, 1);
  }
  const at = (k: number) => (k < 0 ? start : points[order[k]]);
  const passes = order.length <= 400 ? 8 : 1;
  for (let pass = 0, improved = true; improved && pass < passes; pass++) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const before = distance(at(i - 1), at(i)) + (j + 1 < order.length ? distance(at(j), at(j + 1)) : 0);
        const after = distance(at(i - 1), at(j)) + (j + 1 < order.length ? distance(at(i), at(j + 1)) : 0);
        if (after < before - 1e-6) {
          order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  let length = 0;
  for (let k = 0; k < order.length; k++) length += distance(at(k - 1), at(k));
  return { order, length };
}

export function taskHours(type: TaskType, metres: number, traditional: number, intensive: number) {
  const [t, i] = MINUTES_PER_TREE[type];
  return (metres / WALK + traditional * t + intensive * i) / 60;
}
