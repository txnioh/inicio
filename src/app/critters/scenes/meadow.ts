import { HOPPER } from '../characters';
import { C, COLS, type Grid, play, rand, tick, total } from '../grid';
import type { Scene } from './types';

// Hopper in a meadow, running through the ear sequence on the DevDay
// sheet: one ear bends and drops, both fall flat, it blinks, the ears come
// back up and perk, and it glances aside. Between sequences it hops.
type Pose = keyof typeof HOPPER;
const EARS: [[Pose, number], number][] = [
  [['idle', 0], .9], [['bend', 0], .14], [['drop', 0], .14], [['back', 0], .14], [['flat', 0], .5],
  [['flatBlink', 0], .14], [['flat', 0], .5], [['flatBlink', 0], .14], [['flat', 0], .3],
  [['perk', 0], .14], [['idle', 0], .4], [['narrow', 0], .14], [['turn', 0], .7], [['idle', 0], .6],
];
// A hop: crouch with the ears back, up two rows, down one, land.
const HOP: [[Pose, number], number][] = [[['back', 0], .1], [['idle', 2], .12], [['idle', 1], .1], [['idle', 0], .12]];
const TIMELINE: [[Pose, number], number][] = [...EARS, ...HOP, ...HOP, ...HOP, [['idle', 0], .8], ...HOP, ...HOP, ...HOP, [['idle', 0], .5]];
const LOOP = total(TIMELINE);
const EARS_END = total(EARS);
const GROUND = 12, LEFT = 8, RIGHT = 22;
const FLOWERS: [number, string][] = [[1, C.white], [5, C.blue], [25, C.orange], [30, C.white]];

/** Column after the hops so far: three to the right, a rest, three back. */
function column(t: number) {
  const hop = total(HOP), step = (RIGHT - LEFT) / 3;
  // Within a hop the bunny is halfway while it is in the air.
  const along = (s: number) => Math.floor(s / hop) + ((s % hop) < .1 ? 0 : (s % hop) < .34 ? .5 : 1);
  const out = t - EARS_END, back = out - 3 * hop - .8;
  if (out < 0) return LEFT;
  if (out < 3 * hop) return Math.round(LEFT + along(out) * step);
  if (back < 0) return RIGHT;
  if (back < 3 * hop) return Math.round(RIGHT - along(back) * step);
  return LEFT;
}

export const meadow: Scene = {
  key: 'meadow',
  animal: 'hopper',
  place: 'meadow',
  loop: LOOP,
  still: 2.5,
  bg: '#000',

  frame(g: Grid, t: number) {
    [[1, 0, .5], [5, 14, .8]].forEach(([y, at, every]) => {
      const x = ((at + tick(t, every)) % (COLS + 8)) - 8;
      g.text(x + 1, y, '.--.', C.greyDark);
      g.text(x, y + 1, '(____)', C.greyDark);
    });
    const ray = tick(t, .5) % 2;
    g.art(27, 1, ray ? ['\\ | /', '- ● -', '/ | \\'] : [' .:. ', ': ● :', " ':' "], C.orange);

    for (let x = 0; x < COLS; x++) {
      const lean = (tick(t, .3) - x + 64) % 8;
      g.set(x, GROUND + 1, lean < 2 ? '/' : lean === 4 || lean === 5 ? '\\' : '|', x % 2 ? C.greenDark : C.green);
      if (rand(x) > .6) g.set(x, GROUND + 2, ',', C.greenDeep);
      if (rand(x + 9) > .5) g.set(x, GROUND + 3, '.', C.greenDeep);
    }
    // Carrots and the film's flowers: * and • heads on V and ↓ stems.
    [3, 15, 28].forEach((x, i) => {
      const sway = (tick(t, .6) + i) % 4 === 0;
      g.text(x - 1 + (sway ? 1 : 0), GROUND, '\\|/', C.green);
      g.set(x, GROUND + 1, 'V', C.orange);
    });
    FLOWERS.forEach(([x, color], i) => {
      g.set(x + ((tick(t, .5) + i) % 6 === 0 ? 1 : 0), GROUND - 1, i % 2 ? '•' : '*', color);
      g.set(x, GROUND, i % 2 ? '↓' : 'V', C.green);
    });

    const { value: [pose, lift] } = play(t, TIMELINE);
    g.stand(column(t), GROUND, HOPPER[pose], C.white, lift);

    const bx = Math.round(16 + 12 * Math.sin(tick(t, .2) * .09)), by = Math.round(6 + 2 * Math.sin(tick(t, .2) * .21));
    const open = tick(t, .12) % 2;
    g.set(bx, by, open ? '}' : ')', C.blue);
    g.set(bx + 1, by, open ? '{' : '(', C.blue);
  },
};
