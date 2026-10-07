import { FROGE } from '../characters';
import { C, COLS, type Grid, play, rand, stars, tick, total } from '../grid';
import type { Scene } from './types';

// Froge on a lily pad: it winks, blinks, jumps in place as on the DevDay
// animation sheet, then catches the fly that has been circling it.
type Pose = keyof typeof FROGE;
const TIMELINE: [[Pose, number], number][] = [
  [['idle', 0], 1], [['wink', 0], .15], [['blink', 0], .15], [['idle', 0], .8],
  [['crouch', 0], .35], [['rise', 0], .1], [['leap', 1], .1], [['apex', 2], .2], [['leap', 1], .1],
  [['rise', 1], .1], [['land', 0], .12], [['crouch', 0], .15], [['idle', 0], 1.1], [['blink', 0], .15],
  [['idle', 0], .6], [['crouch', 0], .2], [['strike', 0], .36], [['gulp', 0], .3], [['idle', 0], 1.2],
];
const LOOP = total(TIMELINE);
const STRIKE = total(TIMELINE.slice(0, 16));
const CATCH = STRIKE + .18;
const FROG_X = 8, GROUND = 10, WATER = 11;
const MOUTH_Y = GROUND - 3 + 1;

// The fly circles in a figure of eight, a cell every 0.12 s, crossing in
// front of the mouth at the moment of the catch.
function fly(t: number) {
  const q = Math.floor(t / .12) * .12;
  const a = 2 * Math.PI * (q - CATCH) / LOOP * 2 + Math.PI / 4;
  return { x: Math.round(20 + 6 * Math.sin(a)), y: Math.round(5 + 3 * Math.sin(2 * a)) };
}
const flyShown = (t: number) => t < CATCH || t > CATCH + 1.3;

export const pond: Scene = {
  key: 'pond',
  animal: 'froge',
  place: 'pond',
  loop: LOOP,
  still: STRIKE + .2,
  bg: '#000',

  frame(g: Grid, t: number) {
    stars(g, t, 16, 3, 7, (x, y) => x > 23 && y < 5);
    g.set(26, 1, '_', C.yellow);
    g.set(25, 2, '(', C.yellow);
    g.set(26, 3, '¯', C.yellow);

    // Water drifts a cell at a time; deeper rows are darker and slower.
    for (let r = 0; r < 5; r++) {
      const shift = tick(t, .25 + r * .12);
      for (let x = 0; x < COLS; x++) {
        const p = (x + shift + r * 3) % 7;
        if (p === 0) g.set(x, WATER + r, r % 2 ? '≈' : '~', r ? C.blueDark : C.blue);
        else if (p === 4 && r < 3) g.set(x, WATER + r, '~', C.blueDeep);
      }
    }
    for (let r = 1; r < 4; r++) if ((tick(t, .3) + r) % 3) g.set(26 + ((tick(t, .45) + r) % 2), WATER + r, '—', C.yellow);

    // Reeds with cattails that lean one way, then the other.
    [[1, 4], [2, 3], [29, 3], [30, 4]].forEach(([x, tall], i) => {
      for (let j = 0; j < tall; j++) g.set(x, WATER - 1 - j, '|', C.greenDark);
      const lean = (tick(t, .6) + i) % 4;
      g.set(x + (lean === 1 ? 1 : lean === 3 ? -1 : 0), WATER - 1 - tall, lean === 1 ? '/' : lean === 3 ? '\\' : '•', lean % 2 ? C.greenDark : C.orangeDark);
    });
    g.text(FROG_X - 5, WATER, '(________)', C.greenDark);
    g.text(19, WATER + 2, '(__)', C.greenDeep);

    const { value: [pose, lift], p } = play(t, TIMELINE);
    // Landing sends a ripple out from the pad.
    const since = t - total(TIMELINE.slice(0, 10));
    if (since > 0 && since < 1.2) {
      const k = Math.floor(since / .2);
      g.set(FROG_X - 6 - k, WATER + 1, '(', C.blueDark);
      g.set(FROG_X + 5 + k, WATER + 1, ')', C.blueDark);
    }
    g.stand(FROG_X, GROUND, FROGE[pose], C.green, lift);

    // The tongue runs along the mouth row to the fly and back, cell by cell.
    if (pose === 'strike') {
      const start = FROG_X + 2, reach = fly(CATCH).x - start;
      const out = p < .5 ? Math.round(reach * Math.min(1, p * 4)) : Math.round(reach * (1 - (p - .5) * 2));
      for (let x = 0; x < out; x++) g.set(start + x, MOUTH_Y, '—~——~——'[x % 7], C.orange);
      g.set(start + out, MOUTH_Y, '●', p < .5 && out < reach ? C.orange : C.white);
    }

    if (flyShown(t)) {
      const f = fly(t);
      const up = tick(t, .06) % 2;
      g.set(f.x - 1, f.y, up ? 'c' : '~', C.grey);
      g.set(f.x, f.y, '●', C.white);
      g.set(f.x + 1, f.y, up ? 'ɔ' : '~', C.grey);
    }
    for (let i = 0; i < 2; i++) {
      if ((tick(t, .4) + i * 3) % 5 < 2) continue;
      g.set(Math.round(15 + 11 * Math.sin(t * .4 + i * 2.3) + rand(i) * 2), Math.round(6 + 1.5 * Math.cos(t * .6 + i)), '•', C.yellow);
    }
  },
};
