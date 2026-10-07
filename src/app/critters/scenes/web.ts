import { WEBBY, WEBBY_BLINK } from '../characters';
import { C, COLS, type Grid, inside, ROWS, tick } from '../grid';
import type { Scene } from './types';

// Webby lowers itself from the hub of its web on a thread, a row at a time,
// bobs at the bottom and climbs back. A fly caught in the web struggles.
const LOOP = 7;
const HUB = { x: 16, y: 5 };
const SPOKES = 8;
const RINGS = [2, 4, 6];

// The web is ASCII line drawing: each cell along a strand gets |, /, \ or —
// for the strand's direction. Cells are a third taller than wide, so
// directions are measured in screen space.
const ASPECT = 1.35;
const WEB = new Map<string, string>();
const strand = (x0: number, y0: number, x1: number, y1: number) => {
  const dx = x1 - x0, dy = (y1 - y0) * ASPECT;
  const a = ((Math.atan2(dy, dx) * 180 / Math.PI) + 180) % 180;
  const ch = a < 22 || a >= 158 ? '—' : a < 67 ? '\\' : a < 113 ? '|' : '/';
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 0; k <= n; k++) {
    const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n);
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) WEB.set(`${x},${y}`, ch);
  }
};
const point = (i: number, r: number) => {
  const a = i / SPOKES * Math.PI * 2;
  return { x: HUB.x + Math.cos(a) * r * ASPECT, y: HUB.y + Math.sin(a) * r };
};
for (let i = 0; i < SPOKES; i++) { const p = point(i, 12); strand(HUB.x, HUB.y, p.x, p.y); }
// Rings are dotted, and give way to the spokes they cross.
RINGS.forEach(r => {
  for (let k = 0; k < 64; k++) {
    const a = k / 64 * Math.PI * 2;
    const key = `${Math.round(HUB.x + Math.cos(a) * r * ASPECT)},${Math.round(HUB.y + Math.sin(a) * r)}`;
    if (!WEB.has(key)) WEB.set(key, '·');
  }
});
const STRANDS = [...WEB.entries()].map(([k, ch]) => { const [x, y] = k.split(',').map(Number); return { x, y, ch }; });
const DEW = STRANDS.filter((_, i) => i % 13 === 5);
const FLY = { x: HUB.x + 6, y: HUB.y - 3 };

/** Rows the spider has come down from the hub. */
function drop(t: number) {
  if (t < 1) return 0;
  if (t < 3) return tick(t - 1, .25);
  if (t < 4.4) return 8 + (tick(t, .35) % 2);
  if (t < 6.4) return 8 - tick(t - 4.4, .25);
  return 0;
}
const moving = (t: number) => inside(t, 1, 3) || inside(t, 4.4, 6.4);

/** Webby's frame: the sheet's four leg positions in turn, or a blink. */
function spider(t: number) {
  if (inside(t, 3.4, 3.55)) return WEBBY_BLINK[0];
  if (inside(t, 3.55, 3.7)) return WEBBY_BLINK[1];
  return WEBBY[tick(t, moving(t) ? .12 : .45) % WEBBY.length];
}

export const web: Scene = {
  key: 'web',
  animal: 'webby',
  place: 'web',
  loop: LOOP,
  still: 2.2,
  bg: '#000',

  frame(g: Grid, t: number) {
    STRANDS.forEach(s => g.set(s.x, s.y, s.ch, C.greyDark));
    DEW.forEach((d, i) => {
      const shine = (tick(t, .3) + i * 3) % 9;
      if (shine < 3) g.set(d.x, d.y, shine === 1 ? '°' : '·', C.blue);
    });

    const fx = Math.round(FLY.x), fy = Math.round(FLY.y);
    const struggle = tick(t, .7) % 3 === 0 && tick(t, .08) % 2;
    g.set(fx - 1, fy, struggle ? '~' : 'c', C.grey);
    g.set(fx, fy, '●', C.white);
    g.set(fx + 1, fy, struggle ? '~' : 'ɔ', C.grey);

    const d = drop(t);
    for (let y = HUB.y; y < HUB.y + d; y++) g.set(HUB.x, y, '|', C.grey);
    g.art(HUB.x, HUB.y - 1 + d, spider(t), C.orange);
  },
};
