import { SHELLDON, SHELLDON_HIDE } from '../characters';
import { C, COLS, type Grid, inside, rand, tick } from '../grid';
import type { Scene } from './types';

// Shelldon walks along the beach at sunset, a column a step, leaving
// footprints. Halfway it stops and pulls its head in, then carries on.
const LOOP = 13;
const STEP = .3;
const PAUSE = 5, RESUME = 6.6;
const HORIZON = 5, WALK = 12;

/** Steps taken so far, not counting the pause. */
const steps = (t: number) => tick(Math.min(t, PAUSE) + Math.max(0, t - RESUME), STEP);
const turtleX = (t: number) => steps(t) - 7;
const shore = (x: number, t: number) => 9 + (tick(t, 1.5) % 4 === 2 ? 1 : 0) + ((x + tick(t, 3)) % 11 < 3 ? 1 : 0);

export const beach: Scene = {
  key: 'beach',
  animal: 'shelldon',
  place: 'beach',
  loop: LOOP,
  still: 4.4,
  bg: '#000',

  frame(g: Grid, t: number) {
    g.art(21, 2, ['_.---._', '/       \\'], C.orange);
    const ray = tick(t, .6) % 2;
    g.art(21, 0, [ray ? '\\   |   /' : ' .  :  . '], C.orangeDark);

    for (let r = 0; r < 4; r++) {
      const shift = tick(t, .3 + r * .15);
      for (let x = 0; x < COLS; x++) {
        const p = (x + shift + r * 4) % 6;
        if (p === 0 || (r < 2 && p === 3)) g.set(x, HORIZON + r, '~', r < 2 ? C.blueDark : C.blue);
      }
      if ((tick(t, .25) + r) % 3) g.set(21 + ((r + tick(t, .5)) % 3) - 1, HORIZON + r, '—', C.orange);
    }
    for (let x = 0; x < COLS; x++) {
      const y = shore(x, t);
      g.set(x, y, (x + tick(t, .3)) % 3 ? '~' : '-', C.white);
      g.set(x, y + 1, '.', C.sandDark);
      for (let yy = y + 2; yy < 16; yy++) if (rand(x * 16 + yy) > .78) g.set(x, yy, rand(x + yy) > .7 ? ':' : '.', C.sand);
    }
    g.set(4, 15, '@', C.sand);
    g.set(28, 15, '*', C.orange);

    const x = turtleX(t);
    for (let k = 1; k < 8; k++) g.set(x - 6 - k * 2, WALK + 1 + (k % 2), '„', k < 4 ? C.sand : C.sandDark);
    const hiding = inside(t, PAUSE + .3, RESUME - .3);
    g.stand(x, WALK, hiding ? SHELLDON_HIDE : SHELLDON[steps(t) % 2], C.orange);
  },
};
