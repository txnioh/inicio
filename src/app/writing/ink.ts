// Adapted from Antonio's econ-marker-demo and the drawing approach in
// https://www.anthropic.com/institute/econ-scenarios (inspected 2026-09-11).
// These synthetic shapes do not represent economic data.
export type Point = [number, number];
export type InkPath = { d: string; fill: string; opacity: number };
export type StrokeOptions = {
  width?: number;
  seed?: number;
  color?: string;
  opacity?: number;
  wobble?: number;
  edge?: number;
  taperIn?: number;
  taperOut?: number;
  startWidth?: number;
  endWidth?: number;
  belly?: number;
  chisel?: number;
  core?: boolean;
  samples?: number;
};

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const round = (n: number) => Math.round(n * 10) / 10;
export const hash = (n: number) => {
  const t = 43758.5453 * Math.sin(127.1 * n + 311.7);
  return t - Math.floor(t);
};

export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export function noise1D(seed: number, intervals: number) {
  const random = mulberry32(seed);
  const values = Array.from({ length: intervals + 2 }, () => random() * 2 - 1);
  return (position: number) => {
    const t = clamp(position) * intervals;
    const i = Math.floor(t);
    return values[i] + (values[i + 1] - values[i]) * smooth(t - i);
  };
}

function lengthOf(points: Point[]) {
  return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
}

export function resample(points: Point[], count = 80): Point[] {
  if (points.length < 2) return points.map(p => [...p]);
  count = Math.max(2, Math.round(count));
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = distances[distances.length - 1];
  if (!total) return [points[0]];
  let segment = 0;
  return Array.from({ length: count }, (_, i) => {
    const distance = total * i / (count - 1);
    while (segment < points.length - 2 && distances[segment + 1] < distance) segment++;
    const t = (distance - distances[segment]) / (distances[segment + 1] - distances[segment] || 1);
    return [points[segment][0] + (points[segment + 1][0] - points[segment][0]) * t,
      points[segment][1] + (points[segment + 1][1] - points[segment][1]) * t];
  });
}

export function tangents(points: Point[]): Point[] {
  return points.map((_, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  });
}

export function pathThrough(points: Point[], closed = false) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${round(p[0])} ${round(p[1])}`).join('') + (closed && points.length ? 'Z' : '');
}

export function ribbon(points: Point[], options: StrokeOptions = {}) {
  if (points.length < 2) return '';
  const { width = 4, seed = 1, taperIn = .14, taperOut = .08, startWidth = .14,
    endWidth = .8, belly = .07, wobble = .14, edge = .055 * width + .35, chisel = .35 } = options;
  const widthNoise = noise1D(seed * 7 + 1, Math.max(3, Math.round(points.length / 9)));
  const leftNoise = noise1D(seed * 13 + 2, Math.max(4, Math.round(points.length / 5)));
  const rightNoise = noise1D(seed * 17 + 3, Math.max(4, Math.round(points.length / 5)));
  const directions = tangents(points), left: Point[] = [], right: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const t = i / (points.length - 1);
    let pressure = 1;
    if (taperIn > 0 && t < taperIn) pressure *= startWidth + (1 - startWidth) * smooth(t / taperIn);
    if (taperOut > 0 && t > 1 - taperOut) pressure *= endWidth + (1 - endWidth) * smooth((1 - t) / taperOut);
    pressure *= (1 + belly * Math.sin(Math.PI * t)) * (1 + wobble * widthNoise(t));
    const half = Math.max(.25, width * pressure / 2);
    const [tx, ty] = directions[i];
    const normal: Point = [-ty, tx];
    const [x, y] = points[i];
    const l = half + edge * leftNoise(t);
    const r = half + edge * rightNoise(t);
    left.push([x + normal[0] * l, y + normal[1] * l]);
    right.push([x - normal[0] * r, y - normal[1] * r]);
  }
  const last = points.length - 1;
  left[last] = [left[last][0] + directions[last][0] * chisel * width, left[last][1] + directions[last][1] * chisel * width];
  right[0] = [right[0][0] - directions[0][0] * chisel * width * .6, right[0][1] - directions[0][1] * chisel * width * .6];
  return pathThrough([...left, ...right.reverse()], true);
}

function offset(points: Point[], distance: (t: number) => number): Point[] {
  const directions = tangents(points);
  return points.map(([x, y], i) => {
    const d = distance(i / (points.length - 1));
    return [x - directions[i][1] * d, y + directions[i][0] * d];
  });
}

function darken(color: string, amount: number) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  const max = Math.max(...rgb);
  return `rgb(${rgb.map(c => Math.max(0, Math.round((c + (c - max) * .25) * (1 - amount)))).join(',')})`;
}

export function markerStroke(points: Point[], options: StrokeOptions = {}): InkPath[] {
  const { width = 4, seed = 1, color = '#918BD6', opacity = .92, core = true } = options;
  const sampled = resample(points, options.samples ?? clamp(Math.round(lengthOf(points) / 5), 16, 160));
  if (sampled.length < 2) return [];
  const paths = [{ d: ribbon(sampled, options), fill: color, opacity }];
  if (width >= 3.5 && core) {
    const noise = noise1D(5 * seed + 9, 5);
    paths.push({ d: ribbon(offset(sampled, t => noise(t) * width * .17), {
      width: .45 * width, seed: seed + 31, taperIn: .2, taperOut: .16,
      startWidth: .2, endWidth: .5, edge: .03 * width + .3, chisel: .25,
    }), fill: darken(color, .12), opacity: .3 });
    paths.push({ d: ribbon(offset(sampled, () => .3 * width), {
      width: .16 * width, seed: seed + 57, taperIn: .25, taperOut: .2,
      startWidth: .15, endWidth: .4, edge: .5, chisel: .15,
    }), fill: darken(color, .18), opacity: .22 });
  }
  return paths;
}

export function dashedPieces(points: Point[], options: StrokeOptions & { dashLength?: number; gap?: number } = {}): InkPath[][] {
  const { width = 4, seed = 1, color = '#918BD6', opacity = 1, dashLength = width * 3.4, gap = width * 1.6 } = options;
  const sampled = resample(points, Math.max(48, options.samples ?? 100));
  const total = lengthOf(sampled), random = mulberry32(seed * 101 + 5);
  if (total < 2) return [];
  const pieces: InkPath[][] = [];
  for (let start = .3 * dashLength * random(); start < total - 2;) {
    const end = Math.min(total, start + Math.max(1, dashLength) * (.8 + .45 * random()));
    const i0 = Math.floor(start / total * (sampled.length - 1));
    const i1 = Math.ceil(end / total * (sampled.length - 1));
    if (i1 > i0) {
      pieces.push(markerStroke(sampled.slice(i0, i1 + 1), {
        width: width * (.85 + .35 * random()), color, seed: seed + Math.round(start),
        opacity: opacity * (.82 + .16 * random()), taperIn: .18, taperOut: .18,
        startWidth: .55, endWidth: .5, belly: .05, wobble: .08, core: false, samples: 8,
      }));
    }
    start = end + Math.max(0, gap) * (.75 + .5 * random());
  }
  return pieces;
}

export function curve(width = 550, height = 210): Point[] {
  return Array.from({ length: 65 }, (_, i) => {
    const t = i / 64;
    return [width * (.1 + .8 * t), height * (.64 - .25 * Math.sin(t * Math.PI * 2) - .17 * t)];
  });
}

export function buildFan(width = 550, height = 330) {
  const colors = ['#6A9BCC', '#788C5D', '#C46686'];
  return Array.from({ length: 38 }, (_, key) => {
    const pair = (Math.floor(key / 2) + .5) / 19;
    const sign = key % 2 ? 1 : -1;
    const random = mulberry32(key * 13 + 7);
    const end = random() < .22 ? 1 : .64 + random() * .36;
    const points: Point[] = Array.from({ length: 80 }, (_, i) => {
      const t = i / 79 * end;
      return [-20 + (width + 10) * t, height / 2 + sign * pair * (12 + height * .48 * t ** (1.5 + pair))];
    });
    const color = colors[pair < .32 ? 0 : pair < .65 ? 1 : 2];
    const split = Math.floor(points.length * .72);
    return { key, pieces: [
      ...dashedPieces(points.slice(0, split + 1), { color, width: 3.7, seed: key * 13 + 1, dashLength: 7, gap: 4.5 }),
      ...dashedPieces(points.slice(split), { color, width: 3.4, seed: key * 13 + 4, dashLength: 6, gap: 12, opacity: .8 }),
    ] };
  });
}

export function segmentProgress(index: number, count: number, lane: number) {
  const delay = hash(lane * 2.71 + .5) * .22;
  const duration = .6 + hash(lane * 3.31 + 1.1) * .16;
  return delay + ((index + 1) / count) * duration;
}
