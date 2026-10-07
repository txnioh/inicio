import { CELL_H, CELL_W } from '../font';
import { C, COLS, type Grid, LATTICE, rand, ROWS, tick } from '../grid';
import type { Scene } from './types';

// Slithy goes round a loop in a flower garden, a lattice cell at a time,
// drawn as at the start: § between rails, bent rails at the corners, a ‹°›
// head with a flicking Y and an arrow for a tail. It eats the apples on
// its way; they grow back behind it.
const SPEED = 8, LENGTH = 10;
const WAYPOINTS = [[3, 4], [20, 4], [20, 10], [13, 10], [13, 15], [20, 15], [20, 17], [3, 17], [3, 4]];
const PATH: { x: number; y: number }[] = [];
for (let i = 0; i < WAYPOINTS.length - 1; i++) {
  const [ax, ay] = WAYPOINTS[i], [bx, by] = WAYPOINTS[i + 1];
  const steps = Math.abs(bx - ax) + Math.abs(by - ay);
  for (let s = 0; s < steps; s++) PATH.push({ x: ax + Math.sign(bx - ax) * s, y: ay + Math.sign(by - ay) * s });
}
const L = PATH.length;
const LOOP = L / SPEED;
const APPLES = [10, 30, 45, 62];

// Grid cells that overlap the snake's loop get no scenery.
const onPath = new Set(PATH.map(c => `${c.x},${c.y}`));
const clear = (x: number, y: number) => {
  for (let lx = Math.floor(x * CELL_W / LATTICE); lx <= Math.floor((x * CELL_W + CELL_W - 1) / LATTICE); lx++)
    for (let ly = Math.floor(y * CELL_H / LATTICE); ly <= Math.floor((y * CELL_H + CELL_H - 1) / LATTICE); ly++)
      if (onPath.has(`${lx},${ly}`)) return false;
  return true;
};
// Flowers as in the film: * and • heads on ↓ and V stems.
const FLOWERS = [[8, 8], [11, 10], [14, 7], [24, 10], [30, 6], [1, 9], [30, 14], [1, 15], [12, 15], [22, 1]]
  .filter(([x, y]) => clear(x, y) && clear(x, y + 1));
const PETALS = [C.orange, C.white, C.blue];
const DOTS = Array.from({ length: 50 }, (_, i) => [Math.floor(rand(i) * COLS), Math.floor(rand(i + 70) * ROWS)]).filter(([x, y]) => clear(x, y));

export const garden: Scene = {
  key: 'garden',
  animal: 'slithy',
  place: 'garden',
  loop: LOOP,
  still: 2.6,
  bg: '#000',

  frame(g: Grid, t: number) {
    DOTS.forEach(([x, y], i) => g.set(x, y, (tick(t, .5) + i) % 7 ? '.' : ',', C.greenDeep));
    FLOWERS.forEach(([x, y], i) => {
      const nod = (tick(t, .5) + i) % 6 === 0 ? 1 : 0;
      g.set(x + nod, y, i % 3 === 1 ? '•' : '*', PETALS[i % 3]);
      g.set(x, y + 1, i % 2 ? '↓' : 'V', C.green);
    });

    const head = tick(t, 1 / SPEED) % L;
    g.snake = {
      body: Array.from({ length: LENGTH }, (_, i) => PATH[(head - i + L) % L]),
      apples: APPLES.filter(k => ((head - k + L) % L) >= L * .45).map(k => PATH[k]),
      tongue: tick(t, .25) % 3 !== 0,
    };

    const bx = tick(t, .25) % 40 - 4, by = 1 + (tick(t, .5) % 3 === 1 ? 1 : 0);
    const open = tick(t, .12) % 2;
    g.set(bx, by, open ? '}' : ')', C.blue);
    g.set(bx + 1, by, open ? '{' : '(', C.blue);
  },
};
