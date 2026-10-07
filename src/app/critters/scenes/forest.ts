import { FLAP, HOOTS } from '../characters';
import { C, COLS, type Grid, play, rand, stars, tick, total } from '../grid';
import type { Scene } from './types';

// Hoots on a branch under the moon. It blinks, then takes off with the
// flap cycle from the DevDay sheet (wings open, sweep down, level, lift,
// rise), hovers, and settles back on the branch.
type Pose = keyof typeof HOOTS;
const N = FLAP.length;
const flap = (lift: (k: number) => number): [[Pose, number], number][] =>
  Array.from({ length: N }, (_, k) => [[FLAP[k], lift(k)], .1]);
const TIMELINE: [[Pose, number], number][] = [
  [['sit', 0], 1.2], [['blink', 0], .15], [['sit', 0], .9], [['blink', 0], .15], [['sit', 0], .5],
  ...flap(k => Math.round(k / N * 3)),
  ...flap(() => 3),
  ...flap(k => 3 - Math.round(k / N * 3)),
  [['open', 0], .15], [['sit', 0], 1.2],
];
const LOOP = total(TIMELINE);
const BRANCH = 11, OWL_X = 19;
const MOON: [number, number, string][] = [[6, 1, '_'], [5, 2, '/'], [4, 3, '('], [5, 4, '\\'], [6, 5, '¯']];
const TREE = ['  /\\  ', ' /  \\ ', ' /  \\ ', '/    \\', '/    \\', '/____\\', '  ||  '];

export const forest: Scene = {
  key: 'forest',
  animal: 'hoots',
  place: 'night',
  loop: LOOP,
  still: 2.9 + .1 * N * 1.4,
  bg: '#000',

  frame(g: Grid, t: number) {
    stars(g, t, 22, 11, 9, (x, y) => x > 2 && x < 9 && y < 7);
    MOON.forEach(([x, y, ch]) => g.set(x, y, ch, C.yellow));
    g.art(2, 9, TREE, C.greenDeep);
    g.art(29, 6, TREE, C.greenDeep);
    g.art(29, 6 + TREE.length, ['  ||  ', '  ||  ', '  ||  '], C.greenDeep);

    // The branch, as in the film, with leaves that swing.
    g.text(12, BRANCH, '[]>=¬—————————————', C.orangeDark);
    [15, 22, 26].forEach((x, i) => {
      const swing = (tick(t, .7) + i) % 3;
      g.set(x + (swing === 1 ? 1 : 0), BRANCH + 1, swing === 2 ? ',' : '"', C.greenDark);
    });

    const { value: [pose, lift] } = play(t, TIMELINE);
    g.stand(OWL_X, BRANCH - 1, HOOTS[pose], C.blue, lift);

    for (let i = 0; i < 4; i++) {
      const x = Math.round(16 + 9 * Math.sin(tick(t, .3) * .18 + i * 1.7 + rand(i)));
      const y = Math.round(9 + 3.5 * Math.sin(tick(t, .3) * .23 + i * 2.4));
      const on = (tick(t, .3) + i * 2) % 6;
      if (on < 4 && y !== BRANCH && !g.get(x, y)) g.set(x, y, on === 1 ? '*' : '•', on === 1 ? C.yellow : C.orange);
    }
    for (let x = 0; x < COLS; x++) if (rand(x + 3) > .5) g.set(x, 15, (tick(t, .8) + x) % 5 ? '„' : '"', C.greenDeep);
  },
};
