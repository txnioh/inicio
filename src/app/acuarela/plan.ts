// The painter: looks at the photo — its colours and how far away each part
// is — and paints it in watercolour the way a painter blocks a picture in.
// Nothing is named or predefined: the photo is divided into its own shapes
// of colour, which are painted from the farthest to the nearest, each as a
// light wash with its darker tones glazed over it, and the darkest small
// accents last. Like Aluan Wang's scenes — "all 2D, built into a 3D view" —
// distance works as flat layers, far ones pale and soft, near ones strong.
//
// This only works out the strokes, as data, so it can run in a worker;
// paint.ts lays them down with the brush in brushes.ts.

import { area, blur, contours, densify, hexLab, mixLab, oklab, random, simplifyLoop, smooth, type Lab, type Point, type Random } from './kit';
import type { Mark } from './oil';
import { defaultStyle, type Style } from './style';
import type { Scene } from './understand';

/** One watercolour wash over a set of outlines; see brushes.ts. */
export type Stroke = { loops: Point[][]; color: Lab; opacity: number; bleed: number; texture: number; border: number; body: number };
/**
 * A painting to lay down: on `paper`, watercolour washes (`strokes`) and
 * oil brush strokes (`marks`), with the bristle brushes those need.
 */
export type Plan = {
  width: number; height: number; seed: number; paper: Lab; strokes: Stroke[]; marks: Mark[];
  brushes?: { sizes: number[]; texture: number; load: number };
};

export const PAPER = hexLab('#f3e8d6');
// A watercolour box: olive, sap and teal greens, earths, blues, a red, violets.
const PIGMENTS = ['#8a7e22', '#a99b3c', '#6f9c46', '#4a8c3e', '#2f9a6a', '#27796a', '#3f978c', '#2b8fa3',
  '#c3a27c', '#b8724e', '#d4693a', '#c0392b', '#5e7d92', '#4d6fb0', '#8e7cc3', '#b06aa8', '#e0a3b8', '#d8b43c'].map(hexLab);

/** How each depth layer is painted, from L0 (far) to L3 (near). */
const LAYERS = [
  { fade: .32, chroma: .7 },
  { fade: .16, chroma: .9 },
  { fade: .05, chroma: 1.05 },
  { fade: 0, chroma: 1.15 },
];

const clamp = (v: number, low = 0, high = 1) => Math.min(high, Math.max(low, v));

export type Grid = { width: number; height: number; depth: Float32Array; lab: Float32Array };

export function downsample(scene: Scene, factor: number): Grid {
  const width = Math.floor(scene.width / factor), height = Math.floor(scene.height / factor);
  const depth = new Float32Array(width * height), lab = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let d = 0, r = 0, g = 0, b = 0;
    for (let j = 0; j < factor; j++) for (let i = 0; i < factor; i++) {
      const s = (y * factor + j) * scene.width + x * factor + i;
      d += scene.depth[s];
      r += scene.color[s * 4]; g += scene.color[s * 4 + 1]; b += scene.color[s * 4 + 2];
    }
    const n = factor * factor, c = y * width + x;
    depth[c] = d / n;
    lab.set(oklab(r / n, g / n, b / n), c * 3);
  }
  return { width, height, depth, lab };
}

/**
 * Edge-preserving smoothing (a bilateral filter): texture settles into flat
 * colour while the edges between things stay where they are.
 */
export function settle({ width, height, lab }: Grid, radius: number, range: number) {
  const out = new Float32Array(lab.length);
  const spatial = 2 * (radius / 2) ** 2, tonal = 2 * range * range;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const c = (y * width + x) * 3;
    let l = 0, a = 0, b = 0, sum = 0;
    for (let j = -radius; j <= radius; j++) {
      const yy = y + j;
      if (yy < 0 || yy >= height) continue;
      for (let i = -radius; i <= radius; i++) {
        const xx = x + i;
        if (xx < 0 || xx >= width) continue;
        const n = (yy * width + xx) * 3;
        const d = (lab[n] - lab[c]) ** 2 + (lab[n + 1] - lab[c + 1]) ** 2 + (lab[n + 2] - lab[c + 2]) ** 2;
        const w = Math.exp(-(i * i + j * j) / spatial - d / tonal);
        l += lab[n] * w; a += lab[n + 1] * w; b += lab[n + 2] * w; sum += w;
      }
    }
    out[c] = l / sum; out[c + 1] = a / sum; out[c + 2] = b / sum;
  }
  return out;
}

/**
 * Groups every cell by colour and distance (k-means, seeded with k-means++),
 * so that shapes follow the photo and near and far things of the same colour
 * stay apart.
 */
export function cluster(lab: Float32Array, depth: Float32Array, k: number, depthWeight: number, rng: Random) {
  const count = depth.length;
  const feature = (c: number): number[] =>
    [lab[c * 3], lab[c * 3 + 1] * 2.2, lab[c * 3 + 2] * 2.2, depth[c] * depthWeight * .45];
  const distance = (f: number[], g: number[]) => (f[0] - g[0]) ** 2 + (f[1] - g[1]) ** 2 + (f[2] - g[2]) ** 2 + (f[3] - g[3]) ** 2;
  const sample = Array.from({ length: Math.min(count, 4000) }, () => feature(Math.floor(rng.next() * count)));
  const centres = [sample[Math.floor(rng.next() * sample.length)]];
  while (centres.length < k) {
    const weights = sample.map(f => Math.min(...centres.map(c => distance(f, c))));
    let pick = rng.next() * weights.reduce((s, w) => s + w, 0);
    let index = 0;
    while (index < weights.length - 1 && (pick -= weights[index]) > 0) index++;
    centres.push(sample[index]);
  }
  const nearest = (f: number[]) => {
    let best = 0, bestDistance = Infinity;
    centres.forEach((c, i) => {
      const d = distance(f, c);
      if (d < bestDistance) { bestDistance = d; best = i; }
    });
    return best;
  };
  for (let iteration = 0; iteration < 10; iteration++) {
    const sums = centres.map(() => [0, 0, 0, 0, 0]);
    for (const f of sample) {
      const s = sums[nearest(f)];
      for (let i = 0; i < 4; i++) s[i] += f[i];
      s[4]++;
    }
    sums.forEach((s, i) => { if (s[4]) centres[i] = [s[0] / s[4], s[1] / s[4], s[2] / s[4], s[3] / s[4]]; });
  }
  const labels = new Uint8Array(count);
  for (let c = 0; c < count; c++) labels[c] = nearest(feature(c));
  return labels;
}

/** Each cell takes the most common label around it, so shapes lose their speckle. */
export function calm(labels: Uint8Array, width: number, height: number, radius: number, k: number) {
  const out = new Uint8Array(labels.length);
  const votes = new Uint16Array(k);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    votes.fill(0);
    for (let j = Math.max(0, y - radius); j <= Math.min(height - 1, y + radius); j++) {
      for (let i = Math.max(0, x - radius); i <= Math.min(width - 1, x + radius); i++) votes[labels[j * width + i]]++;
    }
    let best = labels[y * width + x];
    for (let l = 0; l < k; l++) if (votes[l] > votes[best]) best = l;
    out[y * width + x] = best;
  }
  return out;
}

/**
 * Connected pieces of each label. Pieces smaller than `smallest` join the
 * neighbour that reaches them first; without `absorb`, they are dropped instead.
 */
function pieces(labels: Uint8Array, width: number, height: number, smallest: number, absorb = true) {
  const id = new Int32Array(labels.length).fill(-1);
  const seen = new Uint8Array(labels.length);
  const groups: number[][] = [];
  const queue: number[] = [];
  const around = (c: number) => {
    const x = c % width, y = (c - x) / width, out: number[] = [];
    if (x > 0) out.push(c - 1);
    if (x < width - 1) out.push(c + 1);
    if (y > 0) out.push(c - width);
    if (y < height - 1) out.push(c + width);
    return out;
  };
  for (let start = 0; start < labels.length; start++) {
    if (seen[start]) continue;
    const cells = [start];
    seen[start] = 1;
    for (let i = 0; i < cells.length; i++) {
      for (const n of around(cells[i])) if (!seen[n] && labels[n] === labels[start]) { seen[n] = 1; cells.push(n); }
    }
    if (cells.length < smallest) continue;
    for (const c of cells) { id[c] = groups.length; queue.push(c); }
    groups.push(cells);
  }
  if (absorb) {
    for (let i = 0; i < queue.length; i++) {
      for (const n of around(queue[i])) if (id[n] < 0) { id[n] = id[queue[i]]; groups[id[n]].push(n); queue.push(n); }
    }
  }
  return groups;
}

export function plan(scene: Scene, seed: number, side: number, style: Style = defaultStyle): Plan {
  const rng = random(seed);
  const factor = 2;
  const grid = downsample(scene, factor);
  const { width: gw, height: gh } = grid;
  const scale = side / Math.max(gw, gh);
  const width = Math.round(gw * scale), height = Math.round(gh * scale);
  const layers: Stroke[][] = [[], [], [], []];

  /**
   * Watercolour colour: lift the value, pull the hue to the nearest pigment,
   * keep greys warm, and fade with distance towards the paper.
   */
  const tone = ([l, a, b]: Lab, layer: number, pull = .55): Lab => {
    const L = l + (.38 + .58 * clamp(l) ** .8 - l) * style.light;
    const chroma = Math.hypot(a, b);
    if (chroma < .025) {
      const warm = 1 - chroma / .025;
      a = a * (1 - warm) + .005 * warm;
      b = b * (1 - warm) + .018 * warm;
    } else {
      let best = PIGMENTS[0], distance = Infinity;
      for (const p of PIGMENTS) {
        const pc = Math.hypot(p[1], p[2]);
        const d = (p[1] / pc - a / chroma) ** 2 + (p[2] / pc - b / chroma) ** 2;
        if (d < distance) { distance = d; best = p; }
      }
      const strength = clamp(pull * clamp(chroma / .05) * style.harmony);
      a += (best[1] - a) * strength;
      b += (best[2] - b) * strength;
    }
    const c = Math.hypot(a, b) || 1e-6;
    const target = Math.min(.16 * Math.max(1, style.saturation), c * (chroma < .025 ? 1 : 1.3 * LAYERS[layer].chroma) * style.saturation);
    a *= target / c;
    b *= target / c;
    return mixLab([L, a, b], PAPER, clamp(LAYERS[layer].fade * style.atmosphere));
  };
  // Washes share the style's bleed, grain and wet edges; far ones bleed more.
  const wash = (loops: Point[][], color: Lab, layer: number, { opacity = 170, bleed = .12, body = 0 } = {}): Stroke => ({
    loops, color, body,
    opacity: Math.min(255, opacity * style.pigment), bleed: bleed * style.bleed * (1 + (3 - layer) * .35),
    texture: style.granulation, border: style.wetEdges,
  });

  const mean = (cells: number[]): Lab => {
    let a = 0, b = 0, l = 0;
    for (const c of cells) { l += grid.lab[c * 3]; a += grid.lab[c * 3 + 1]; b += grid.lab[c * 3 + 2]; }
    return [l / cells.length, a / cells.length, b / cells.length];
  };
  const median = (values: number[]) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];

  /** The outlines of a set of cells, as rounded shapes on the canvas; worked out in a crop around them. */
  const shapes = (cells: number[], radius: number, detail = .6, smallest = 6) => {
    let x0 = gw, y0 = gh, x1 = 0, y1 = 0;
    for (const c of cells) {
      const x = c % gw, y = (c - x) / gw;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const pad = Math.ceil(radius) * 2 + 2;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(gw - 1, x1 + pad); y1 = Math.min(gh - 1, y1 + pad);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const mask = new Float32Array(w * h);
    for (const c of cells) {
      const x = c % gw, y = (c - x) / gw;
      mask[(y - y0) * w + x - x0] = 1;
    }
    return contours(blur(mask, w, h, radius), w, h, .5, 4)
      .filter(loop => area(loop) > smallest)
      .map(loop => smooth(densify(simplifyLoop(loop, detail), 5), 1)
        .map(([x, y]) => [(x + x0 + .5) * scale, (y + y0 + .5) * scale] as Point));
  };

  /** Groups cells by colour alone, lightest first. */
  const tones = (cells: number[], k: number) => {
    const sample = cells.length > 2500 ? Array.from({ length: 2500 }, () => cells[Math.floor(rng.next() * cells.length)]) : cells;
    const distance = (c: number, m: Lab) => (grid.lab[c * 3] - m[0]) ** 2 + 4 * ((grid.lab[c * 3 + 1] - m[1]) ** 2 + (grid.lab[c * 3 + 2] - m[2]) ** 2);
    const sorted = sample.slice().sort((a, b) => grid.lab[a * 3] - grid.lab[b * 3]);
    let centres: Lab[] = Array.from({ length: k }, (_, i) => mean([sorted[Math.floor((i + .5) / k * sorted.length)]]));
    const nearest = (c: number) => {
      let best = 0;
      for (let i = 1; i < k; i++) if (distance(c, centres[i]) < distance(c, centres[best])) best = i;
      return best;
    };
    for (let iteration = 0; iteration < 8; iteration++) {
      const members: number[][] = centres.map(() => []);
      for (const c of sample) members[nearest(c)].push(c);
      centres = centres.map((centre, i) => members[i].length ? mean(members[i]) : centre);
    }
    const groups = centres.map(color => ({ color, cells: [] as number[] }));
    for (const c of cells) groups[nearest(c)].cells.push(c);
    return groups.filter(g => g.cells.length).map(g => ({ ...g, color: mean(g.cells) })).sort((a, b) => b.color[0] - a.color[0]);
  };

  // 1. The photo's own shapes: colour settled flat, grouped with distance,
  //    cleaned of speckle, and tiny pieces absorbed by their neighbours.
  const k = Math.round(style.regions);
  const flat = settle(grid, 3, .07);
  const labels = calm(cluster(flat, grid.depth, k, style.depthSplit, rng), gw, gh, 2, k);
  const regions = pieces(labels, gw, gh, Math.max(12, gw * gh * .0025 * style.simplify))
    .map(cells => ({ cells, depth: median(cells.map(c => grid.depth[c])) }))
    .sort((a, b) => a.depth - b.depth);

  // Four depth layers, split where the photo's own depths fall.
  const depths = Array.from(grid.depth).sort((a, b) => a - b);
  const cut = [.25, .5, .75].map(q => depths[Math.floor(q * depths.length)]);
  const layerOf = (d: number) => d < cut[0] ? 0 : d < cut[1] ? 1 : d < cut[2] ? 2 : 3;

  // 2. Each shape, far to near: its lightest tone washed over all of it, the
  //    darker tones glazed on top. Nearer shapes carry more body, so they
  //    cover what's behind them.
  for (const region of regions) {
    const layer = layerOf(region.depth);
    const size = region.cells.length;
    const loops = shapes(region.cells, 1.2 * style.simplify);
    if (!loops.length) continue;
    const count = size > 3000 ? Math.round(style.zones) : size > 400 ? Math.max(1, Math.round(style.zones) - 1) : 1;
    const groups = tones(region.cells, count);
    const base = tone(groups[0].color, layer);
    const body = style.cover * (120 + 40 * layer);
    const out = layers[layer];
    out.push(wash(loops, base, layer, { body }));
    const soft = style.simplify * Math.max(1.5, Math.sqrt(size) / 20);
    for (const group of groups.slice(1)) {
      if (group.cells.length < size * .06) continue;
      const colour = tone(group.color, layer);
      colour[0] = Math.min(colour[0], base[0] - .05);
      const parts = shapes(group.cells, soft, 1, Math.max(20, size * .01));
      if (parts.length) out.push(wash(parts, colour, layer, { body: body * .8, opacity: 150, bleed: .08 }));
    }
  }

  // 3. Accents: small, compact places noticeably darker than what surrounds
  //    them — whatever they are in the photo — dabbed last in their layer.
  //    Long thin ones are edges between shapes, and would read as drawn
  //    lines, so they are left out.
  if (style.detail > 0) {
    const light = new Float32Array(gw * gh);
    for (let c = 0; c < light.length; c++) light[c] = grid.lab[c * 3];
    const around = blur(light, gw, gh, 3);
    const threshold = .05 / style.detail;
    const dark = new Uint8Array(light.length);
    for (let c = 0; c < light.length; c++) dark[c] = around[c] - light[c] > threshold ? 1 : 0;
    const compact = (cells: number[]) => {
      let x0 = gw, y0 = gh, x1 = 0, y1 = 0;
      for (const c of cells) {
        const x = c % gw, y = (c - x) / gw;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      return cells.length >= .3 * Math.max(x1 - x0 + 1, y1 - y0 + 1) ** 2;
    };
    const spots = pieces(dark, gw, gh, 3, false)
      .filter(cells => dark[cells[0]] && cells.length < gw * gh * .02 && compact(cells));
    const ranked = spots
      .map(cells => ({ cells, strength: cells.reduce((s, c) => s + around[c] - light[c], 0) }))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, Math.round(260 * style.detail));
    for (const { cells } of ranked) {
      const layer = layerOf(median(cells.map(c => grid.depth[c])));
      const colour = tone(mean(cells), layer);
      colour[0] *= .9;
      const parts = shapes(cells, 1.5, .6, 2);
      // Small enough that a flat glaze reads as paint, and far cheaper.
      if (parts.length) layers[layer].push(wash(parts, colour, layer, { opacity: 0, body: Math.min(255, 150 * style.pigment) }));
    }
  }

  return { width, height, seed, paper: PAPER, strokes: layers.flat(), marks: [] };
}
