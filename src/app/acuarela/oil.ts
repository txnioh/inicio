// The oil sketch: the photo painted in visible brush strokes, the way an
// oil study is — blocked in with a broad brush, then smaller and smaller
// strokes only where the photo has detail (Hertzmann's painterly rendering).
// Each stroke follows the forms of the photo (the direction its edges run,
// from a structure tensor), lies at one calm angle where the photo is flat,
// and stops where the colour changes. Far away, strokes are hazier and stay
// broad. Nothing here knows what is in the picture.
//
// Two versions: Classic, the first, broad and loose; and Impasto, which
// works from the full-size photo, lets strokes run along a smoothed edge
// flow (Kang et al.'s edge tangent flow) and turn only gently, breaks each
// stroke's colour a little, drags the paint beneath along (wet into wet),
// lets the brush run dry towards the end, and lights the paint's relief.

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
  /** Read the photo at full size rather than half. */
  fine: boolean;
  /** How much a stroke turns to follow the flow: 1 all the way, less for straighter strokes. */
  curve: number;
  /** Each finer round's strokes this much shorter than the last's. */
  shorten: number;
  /** Broken colour: how far each stroke strays in value, hue and strength. */
  jitter: number;
  /** Stroke directions from the structure tensor, or the smoother edge tangent flow. */
  flow: 'tensor' | 'etf';
  /** Wet into wet: how much of the paint beneath a stroke picks up as it goes. */
  wet: number;
  /** Strokes start loaded and run dry, rather than tapering at both ends. */
  dry: boolean;
  /** How strongly the paint's relief is lit; 0 for none. */
  relief: number;
};

// Chosen by eye on the page's sliders: broad, long, upright strokes that
// run on across colours, muted, with no dry bristle marks.
export const defaultOil: Oil = {
  size: 1.5, detail: .2, length: 14, follow: 1, angle: -90,
  texture: 0, load: .35, colour: .85, light: .04, haze: .25, edges: 0,
  fine: false, curve: 1, shorten: 1, jitter: 0, flow: 'tensor', wet: 0, dry: false, relief: 0,
};

// Chosen from side-by-side examples: finer and more faithful, with body.
export const impastoOil: Oil = {
  ...defaultOil,
  size: 1.1, detail: .7, length: 8, edges: .6, texture: .35, load: .5, colour: 1.05,
  fine: true, curve: .4, shorten: .8, jitter: .5, flow: 'etf', wet: .8, dry: true, relief: 1,
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

/** A stroke direction field from the gradient of a lightness field: unit tangents and edge strength. */
function tangents(light: Float32Array, w: number, h: number) {
  const smooth = soften(light, w, h, 1);
  const t = new Float32Array(w * h * 2), g = new Float32Array(w * h);
  let top = 1e-6;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const c = y * w + x;
    const gx = (smooth[c + 1 - w] + 2 * smooth[c + 1] + smooth[c + 1 + w] - smooth[c - 1 - w] - 2 * smooth[c - 1] - smooth[c - 1 + w]) / 8;
    const gy = (smooth[c + w - 1] + 2 * smooth[c + w] + smooth[c + w + 1] - smooth[c - w - 1] - 2 * smooth[c - w] - smooth[c - w + 1]) / 8;
    const m = Math.hypot(gx, gy);
    g[c] = m; top = Math.max(top, m);
    if (m > 0) { t[c * 2] = -gy / m; t[c * 2 + 1] = gx / m; }
  }
  for (let c = 0; c < g.length; c++) g[c] /= top;
  return { t, g };
}

/** Edge tangent flow (Kang, Lee and Chui 2007): tangents smoothed along strong edges. */
export function etf(light: Float32Array, w: number, h: number, angle: number, radius = 5, rounds = 3) {
  let { t, g } = tangents(light, w, h);
  for (let round = 0; round < rounds; round++) {
    const next = new Float32Array(t.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = y * w + x, tx = t[c * 2], ty = t[c * 2 + 1];
      let sx = 0, sy = 0;
      for (let j = -radius; j <= radius; j += 1) {
        const yy = y + j; if (yy < 0 || yy >= h) continue;
        for (let i = -radius; i <= radius; i += 1) {
          const xx = x + i; if (xx < 0 || xx >= w || i * i + j * j > radius * radius) continue;
          const n = yy * w + xx, ux = t[n * 2], uy = t[n * 2 + 1];
          const dot = tx * ux + ty * uy;
          const wm = (1 + Math.tanh(4 * (g[n] - g[c]))) / 2;
          const k = Math.sign(dot || 1) * wm * Math.abs(dot);
          sx += ux * k; sy += uy * k;
        }
      }
      const m = Math.hypot(sx, sy);
      if (m > 0) { next[c * 2] = sx / m; next[c * 2 + 1] = sy / m; }
    }
    t = next;
  }
  return blendCalm(t, g, w, h, angle);
}

/** Where edges are weak, lean towards the calm angle. */
function blendCalm(t: Float32Array, g: Float32Array, w: number, h: number, angle: number) {
  const calm = angle * Math.PI / 90;
  const soft = soften(g, w, h, 3);
  const out = new Float32Array(t.length);
  for (let c = 0; c < w * h; c++) {
    const k = clamp(soft[c] * 4);
    const a = Math.atan2(t[c * 2 + 1], t[c * 2]) * 2;
    const ax = k * Math.cos(a) + (1 - k) * Math.cos(calm), ay = k * Math.sin(a) + (1 - k) * Math.sin(calm);
    const half = Math.atan2(ay, ax) / 2;
    out[c * 2] = Math.cos(half); out[c * 2 + 1] = Math.sin(half);
  }
  return out;
}

/** The edge tangent flow worked out at half size, where it costs a quarter as much, and spread back out. */
function halfFlow(light: Float32Array, w: number, h: number, angle: number) {
  const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
  const half = new Float32Array(hw * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
    const c = y * 2 * w + x * 2;
    half[y * hw + x] = (light[c] + light[Math.min(c + 1, light.length - 1)] + light[Math.min(c + w, light.length - 1)] + light[Math.min(c + w + 1, light.length - 1)]) / 4;
  }
  const flow = etf(half, hw, hh, angle, 4, 2);
  const out = new Float32Array(w * h * 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = Math.min(hh - 1, y >> 1) * hw + Math.min(hw - 1, x >> 1);
    out[(y * w + x) * 2] = flow[c * 2];
    out[(y * w + x) * 2 + 1] = flow[c * 2 + 1];
  }
  return out;
}

export function planOil(scene: Scene, seed: number, side: number, oil: Oil = defaultOil): Plan {
  const rng = random(seed);
  const g = grid(scene, oil.fine ? 1 : 2);
  const scale = side / Math.max(g.w, g.h);
  const width = Math.round(g.w * scale), height = Math.round(g.h * scale);
  const cell = (x: number, y: number) => clamp(Math.floor(y / scale), 0, g.h - 1) * g.w + clamp(Math.floor(x / scale), 0, g.w - 1);
  const colourAt = (field: Float32Array, x: number, y: number): Lab => {
    const c = cell(x, y) * 3;
    return [field[c], field[c + 1], field[c + 2]];
  };

  const light = new Float32Array(g.w * g.h);
  for (let i = 0; i < light.length; i++) light[i] = g.lab[i * 3];
  const phase = rng.next() * 100;
  const along = oil.flow === 'etf' ? halfFlow(light, g.w, g.h, oil.angle) : directions(light, g.w, g.h, oil.follow, oil.angle, phase);

  // The haze: the colour of the farthest tenth of the photo, lightened.
  const far = Array.from(g.depth, (d, i) => [d, i]).sort((p, q) => p[0] - q[0]).slice(0, Math.max(1, g.depth.length / 10 | 0));
  const haze: Lab = [0, 0, 0];
  for (const [, i] of far) for (let k = 0; k < 3; k++) haze[k] += g.lab[i * 3 + k] / far.length;
  haze[0] = Math.max(haze[0], .82);
  const paint = ([l, a, b]: Lab, depth: number): Lab =>
    mixLab([clamp(l + (oil.light > 0 ? 1 - l : l) * oil.light), a * oil.colour, b * oil.colour], haze, oil.haze * (1 - depth) ** 2);

  // Broken colour: each stroke a little off in value, hue and strength.
  const broken = (lab: Lab): Lab => {
    if (!oil.jitter) return lab;
    const [l, a, b] = lab;
    const hue = Math.atan2(b, a) + rng.gaussian(0, .1 * oil.jitter), chroma = Math.hypot(a, b) * (1 + rng.gaussian(0, .12 * oil.jitter));
    return [clamp(l + rng.gaussian(0, .025 * oil.jitter)), Math.cos(hue) * chroma, Math.sin(hue) * chroma];
  };
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
      const reach = Math.max(1, Math.round(oil.length * oil.shorten ** round * rng.range(.4, 1.1)));
      const trace = (sign: number) => {
        const points: number[][] = [];
        let x = sx, y = sy, px = 0, py = 0;
        for (let k = 0; k < reach; k++) {
          const c = cell(x, y);
          let dx = along[c * 2], dy = along[c * 2 + 1];
          if (k === 0 ? sign < 0 : dx * px + dy * py < 0) { dx = -dx; dy = -dy; }
          if (k > 0 && oil.curve < 1) {
            dx = px * (1 - oil.curve) + dx * oil.curve;
            dy = py * (1 - oil.curve) + dy * oil.curve;
            const m = Math.hypot(dx, dy) || 1;
            dx /= m; dy /= m;
          }
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
      const own = broken(paint(colour, depth));
      const size = R * rng.range(.85, 1.15);
      // Loaded, then running dry; or tapering in and out.
      const pressure = (i: number) => oil.dry ? 1.1 - .55 * i / Math.max(1, n - 1) : .35 + .75 * Math.sin(Math.PI * (i + .5) / n) ** .6;
      if (oil.wet > 0 && before) {
        // Wet into wet: the stroke picks up more of the paint beneath as it goes.
        const parts = n >= 6 ? 2 : 1;
        for (let part = 0; part < parts; part++) {
          const from = Math.floor(part * (n - 1) / parts), to = Math.floor((part + 1) * (n - 1) / parts);
          const [mx, my] = points[Math.floor((from + to) / 2)];
          marks.push({
            points: points.slice(from, to + 1).map(([x, y], i) => [x, y, pressure(from + i)]),
            color: mixLab(own, paint(colourAt(before, mx, my), depth), oil.wet * .6 * (part + .5) / parts),
            size, brush: round,
          });
        }
      } else {
        marks.push({ points: points.map(([x, y], i) => [x, y, pressure(i)]), color: own, size, brush: round });
      }
    }
    before = target;
  });
  const brushes = { sizes: rounds.map(base => base * oil.size * side / 1600), texture: oil.texture, load: oil.load };
  return { width, height, seed, paper: GROUND, strokes: [], marks, brushes, relief: oil.relief };
}
