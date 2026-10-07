import { BUBBLES } from '../characters';
import { C, COLS, type Grid, rand, tick } from '../grid';
import type { Scene } from './types';

// Bubbles swims across a kelp bed breathing out bubbles that grow as they
// rise, while the film's small orange fish pass above and below.
const LOOP = 9.6;
const STEP = .24; // one column per step
const FLOOR = 15;
const KELP = [2, 5, 8, 21, 24, 27, 30].map((x, i) => ({ x, rows: 4 + Math.floor(rand(i + 3) * 5), phase: Math.floor(rand(i) * 8) }));

const fishX = (t: number) => tick(t, STEP) - 6;
const fishY = (t: number) => 6 + (tick(t, 1.2) % 4 === 1 ? -1 : tick(t, 1.2) % 4 === 3 ? 1 : 0);

export const sea: Scene = {
  key: 'sea',
  animal: 'bubbles',
  place: 'sea',
  loop: LOOP,
  still: 3.1,
  bg: '#030d1a',

  frame(g: Grid, t: number) {
    // Light from the surface: slanted strokes that come and go.
    for (let r = 0; r < 2; r++) {
      const x0 = 9 + r * 12 + (tick(t, 1.5) + r) % 2;
      for (let y = 0; y < 7; y++) if ((y + tick(t, .5) + r) % 3) g.set(x0 + Math.floor(y / 2), y, '/', C.blueDeep);
    }

    // The sea floor from the film: ..!.. pebbles, a shell and a starfish.
    for (let x = 0; x < COLS; x++) g.set(x, FLOOR, (x + 3) % 8 === 0 ? '!' : '.', C.green);
    g.set(13, FLOOR, '@', C.sand);
    g.set(17, FLOOR, '*', C.orange);

    // Kelp: braces stacked, each row leaning a cell with the current.
    KELP.forEach(k => {
      for (let j = 0; j < k.rows; j++) {
        const wave = (tick(t, .4) + k.phase - j) % 8;
        const lean = j < 2 ? 0 : wave < 2 ? 1 : wave >= 4 && wave < 6 ? -1 : 0;
        g.set(k.x + lean, FLOOR - 1 - j, j % 2 ? '}' : '{', j > k.rows - 3 ? C.green : C.greenDark);
      }
    });

    // Bubbles from the kelp, one row every 0.3 s.
    KELP.slice(0, 5).forEach((k, i) => {
      const age = (tick(t, .3) + i * 7) % 16;
      const y = FLOOR - 2 - k.rows - age;
      if (y < 0 || age > 10) return;
      g.set(k.x + (age % 4 === 3 ? 1 : 0), y, age < 3 ? '·' : age < 7 ? '°' : 'o', C.white);
    });

    // The film's small orange fish: ><;> heading right, ◊‹ heading left.
    g.art(tick(t, .2) % 48 - 4, 2, ['><;>'], C.orange);
    g.art(COLS + 3 - tick(t, .3) % 32, 10, ['◊‹'], C.orange);

    const x = fishX(t), y = fishY(t);
    g.art(x + 3, y, [BUBBLES], C.blue);
    // Breath: a · at the mouth grows to ° and o as it rises, a row at a time.
    for (let k = 0; k < 8; k++) {
      const born = k * 1.2 + .3, age = tick(t - born, .2);
      if (t < born || age > 8) continue;
      g.set(fishX(born) + 6 + (age % 3 === 2 ? 1 : 0), fishY(born) - age, age < 2 ? '·' : age < 5 ? '°' : 'o', C.white);
    }
  },
};
