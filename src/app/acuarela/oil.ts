// The oil sketch: the photo painted in visible brush strokes, the way an
// oil study is — blocked in with a broad brush, then smaller and smaller
// strokes only where the photo has detail (Hertzmann's painterly rendering).
// Each stroke follows the forms of the photo (the direction its edges run,
// from a structure tensor), lies at one calm angle where the photo is flat,
// and stops where the colour changes. Far away, strokes are hazier and stay
// broad. Nothing here knows what is in the picture.

import { blur, hexLab, mixLab, oklab, random, type Lab } from './kit';
import type { Plan } from './plan';
import type { Scene } from './understand';

/** One brush stroke: points (x, y, pressure), its colour, width, and which size of brush. */
export type Mark = { points: number[][]; color: Lab; size: number; brush: number };

/**
 * How the sketch is painted: brush `size`; `detail`, how many rounds of
 * smaller brushes go back in; stroke `length`; how much strokes `follow` the
 * photo's forms, and their `angle` where it is flat; bristle `texture`;
 * paint `load`; `colour` strength; `light`; distance `haze`; and how soon
 * strokes stop at colour `edges`.
 */
export type Oil = {
  size: number; detail: number; length: number; follow: number; angle: number;
  texture: number; load: number; colour: number; light: number; haze: number; edges: number;
};

// Chosen by eye on the page's sliders: broad, long, upright strokes that
// run on across colours, muted, with no dry bristle marks.
export const defaultOil: Oil = {
  size: 1.5, detail: .2, length: 14, follow: 1, angle: -90,
  texture: 0, load: .35, colour: .85, light: .04, haze: .25, edges: 0,
};

// The ground the sketch is painted on: a warm, toned panel.
export const GROUND = hexLab('#e9e2d4');
// Brush widths at 1600 px, broadest first; the first covers the whole ground.
const SIZES = [90, 44, 24, 12, 6];

const clamp = (v: number, low = 0, high = 1) => Math.min(high, Math.max(low, v));
const differ = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], 2 * (a[1] - b[1]), 2 * (a[2] - b[2]));

type Grid = { w: number; h: number; lab: Float32Array; depth: Float32Array };

function grid(scene: Scene, f = 2): Grid {
  const w = Math.floor(scene.width / f), h = Math.floor(scene.height / f);
  const lab = new Float32Array(w * h * 3), depth = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, d = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) {
      const s = (y * f + j) * scene.width + x * f + i;
      r += scene.color[s * 4]; g += scene.color[s * 4 + 1]; b += scene.color[s * 4 + 2]; d += scene.depth[s];
    }
    const n = f * f, c = y * w + x;
    lab.set(oklab(r / n, g / n, b / n), c * 3);
    depth[c] = d / n;
  }
  return { w, h, lab, depth };
}

/** Two box blurs, close to a gaussian. */
const soften = (field: Float32Array, w: number, h: number, r: number) => blur(blur(field, w, h, r), w, h, r);

function softenLab({ w, h, lab }: Grid, r: number) {
  const out = new Float32Array(lab.length), channel = new Float32Array(w * h);
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < channel.length; i++) channel[i] = lab[i * 3 + k];
    const soft = soften(channel, w, h, r);
    for (let i = 0; i < channel.length; i++) out[i * 3 + k] = soft[i];
  }
  return out;
}

/**
 * Which way strokes run, as a unit vector per cell of a lightness field:
 * along the edges where the photo has them (the structure tensor's weaker
 * direction), at the calm `angle` (degrees) where it is flat, with a slow
 * sway so flat areas aren't ruled. `follow` weighs the edges. Directions
 * are blended as doubled angles, where a way and its opposite are one.
 */
export function directions(light: Float32Array, w: number, h: number, follow: number, angle: number, phase: number) {
  const smooth = soften(light, w, h, 1);
  const xx = new Float32Array(light.length), xy = new Float32Array(light.length), yy = new Float32Array(light.length);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const c = y * w + x;
    const dx = (smooth[c + 1] - smooth[c - 1]) / 2, dy = (smooth[c + w] - smooth[c - w]) / 2;
    xx[c] = dx * dx; xy[c] = dx * dy; yy[c] = dy * dy;
  }
  const Jxx = soften(xx, w, h, 4), Jxy = soften(xy, w, h, 4), Jyy = soften(yy, w, h, 4);
  const along = new Float32Array(light.length * 2);
  const calm = angle * Math.PI / 90;
  for (let c = 0; c < light.length; c++) {
    const a = Jxx[c] - Jyy[c], b = 2 * Jxy[c], s = Jxx[c] + Jyy[c];
    const coherence = Math.hypot(a, b) / (s + 1e-9);
    const weight = clamp(coherence * clamp(Math.sqrt(s) / .012) * 1.3 * follow);
    const x = c % w, y = (c - x) / w;
    const sway = calm + .5 * Math.sin(x * .03 + phase) * Math.cos(y * .025 - phase);
    const cx = weight * Math.cos(Math.atan2(b, a) + Math.PI) + (1 - weight) * .8 * Math.cos(sway);
    const cy = weight * Math.sin(Math.atan2(b, a) + Math.PI) + (1 - weight) * .8 * Math.sin(sway);
    const half = Math.atan2(cy, cx || 1e-6) / 2;
    along[c * 2] = Math.cos(half);
    along[c * 2 + 1] = Math.sin(half);
  }
  return along;
}

export function planOil(scene: Scene, seed: number, side: number, oil: Oil = defaultOil): Plan {
  const rng = random(seed);
  const g = grid(scene);
  const scale = side / Math.max(g.w, g.h);
  const width = Math.round(g.w * scale), height = Math.round(g.h * scale);
  const cell = (x: number, y: number) => clamp(Math.floor(y / scale), 0, g.h - 1) * g.w + clamp(Math.floor(x / scale), 0, g.w - 1);
  const colourAt = (field: Float32Array, x: number, y: number): Lab => {
    const c = cell(x, y) * 3;
    return [field[c], field[c + 1], field[c + 2]];
  };

  const light = new Float32Array(g.w * g.h);
  for (let i = 0; i < light.length; i++) light[i] = g.lab[i * 3];
  const along = directions(light, g.w, g.h, oil.follow, oil.angle, rng.next() * 100);

  // The haze: the colour of the farthest tenth of the photo, lightened.
  const far = Array.from(g.depth, (d, i) => [d, i]).sort((p, q) => p[0] - q[0]).slice(0, Math.max(1, g.depth.length / 10 | 0));
  const haze: Lab = [0, 0, 0];
  for (const [, i] of far) for (let k = 0; k < 3; k++) haze[k] += g.lab[i * 3 + k] / far.length;
  haze[0] = Math.max(haze[0], .82);
  const paint = ([l, a, b]: Lab, depth: number): Lab =>
    mixLab([clamp(l + (oil.light > 0 ? 1 - l : l) * oil.light), a * oil.colour, b * oil.colour], haze, oil.haze * (1 - depth) ** 2);

  const rounds = SIZES.slice(0, 2 + Math.round(oil.detail * (SIZES.length - 2)));
  const threshold = .045 - .03 * oil.detail;
  const stop = .16 - .12 * oil.edges;
  const marks: Mark[] = [];
  let before: Float32Array | null = null;
  rounds.forEach((base, round) => {
    const R = base * oil.size * side / 1600;
    const target = softenLab(g, Math.max(1, Math.round(R / scale / 2)));
    const step = R * (round === 0 ? .45 : .65);
    const starts: [number, number][] = [];
    for (let y = -step / 2; y < height + step; y += step) for (let x = -step / 2; x < width + step; x += step) {
      starts.push([x + rng.range(-step, step), y + rng.range(-step, step) * .7]);
    }
    for (let i = starts.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [starts[i], starts[j]] = [starts[j], starts[i]];
    }
    for (const [sx, sy] of starts) {
      const depth = g.depth[cell(sx, sy)];
      const colour = colourAt(target, sx, sy);
      // After the block-in, only where this finer look differs from the last:
      // where there is detail, less of it far away.
      if (before && differ(colour, colourAt(before, sx, sy)) < threshold * (1 + (1 - depth) * round * .6)) continue;
      const reach = Math.max(1, Math.round(oil.length * rng.range(.4, 1.1)));
      const trace = (sign: number) => {
        const points: number[][] = [];
        let x = sx, y = sy, px = 0, py = 0;
        for (let k = 0; k < reach; k++) {
          const c = cell(x, y);
          let dx = along[c * 2], dy = along[c * 2 + 1];
          if (k === 0 ? sign < 0 : dx * px + dy * py < 0) { dx = -dx; dy = -dy; }
          px = dx; py = dy;
          x += dx * R * .5; y += dy * R * .5;
          if (k > 1 && differ(colourAt(target, x, y), colour) > stop) break;
          points.push([x, y]);
        }
        return points;
      };
      const points = [...trace(-1).reverse(), [sx, sy], ...trace(1)];
      if (points.length < 3) continue;
      const n = points.length;
      marks.push({
        // Lighter pressure at both ends: the stroke tapers in and out.
        points: points.map(([x, y], i) => [x, y, .35 + .75 * Math.sin(Math.PI * (i + .5) / n) ** .6]),
        color: paint(colour, depth),
        size: R * rng.range(.85, 1.15),
        brush: round,
      });
    }
    before = target;
  });
  const brushes = { sizes: rounds.map(base => base * oil.size * side / 1600), texture: oil.texture, load: oil.load };
  return { width, height, seed, paper: GROUND, strokes: [], marks, brushes };
}
