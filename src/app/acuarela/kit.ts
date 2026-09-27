// Small tools the painter builds with: seeded randomness, noise, colour in
// Oklab, and geometry for turning masks into shapes.

export type Point = [number, number];
export type Lab = [number, number, number];

/** Seeded random numbers (mulberry32), so a seed always paints the same. */
export function random(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (low: number, high: number) => low + (high - low) * next(),
    gaussian: (mean = 0, deviation = 1) => {
      const u = 1 - next(), v = next();
      return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
  };
}
export type Random = ReturnType<typeof random>;

// Colour

const toLinear = (c: number) => (c /= 255) <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
const toByte = (c: number) => Math.round(255 * Math.min(1, Math.max(0, c <= .0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - .055)));

export function oklab(r: number, g: number, b: number): Lab {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(.4122214708 * lr + .5363325363 * lg + .0514459929 * lb);
  const m = Math.cbrt(.2119034982 * lr + .6806995451 * lg + .1073969566 * lb);
  const s = Math.cbrt(.0883024619 * lr + .2817188376 * lg + .6299787005 * lb);
  return [
    .2104542553 * l + .7936177850 * m - .0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + .4505937099 * s,
    .0259040371 * l + .7827717662 * m - .8086757660 * s,
  ];
}

export function rgb([L, A, B]: Lab): [number, number, number] {
  const l = (L + .3963377774 * A + .2158037573 * B) ** 3;
  const m = (L - .1055613458 * A - .0638541728 * B) ** 3;
  const s = (L - .0894841775 * A - 1.2914855480 * B) ** 3;
  return [
    toByte(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s),
    toByte(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s),
    toByte(-.0041960863 * l - .7034186147 * m + 1.7076147010 * s),
  ];
}

export const hexLab = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return oklab(n >> 16 & 255, n >> 8 & 255, n & 255);
};
export const mixLab = (a: Lab, b: Lab, t: number): Lab => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Masks and shapes

/** Box blur of a mask, separable, radius in pixels. */
export function blur(field: Float32Array, width: number, height: number, radius: number) {
  const r = Math.max(1, Math.round(radius));
  const temp = new Float32Array(field.length), out = new Float32Array(field.length);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const row = y * width;
    for (let x = -r; x <= r; x++) sum += field[row + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      temp[row + x] = sum / (2 * r + 1);
      sum += field[row + Math.min(width - 1, x + r + 1)] - field[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += temp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / (2 * r + 1);
      sum += temp[Math.min(height - 1, y + r + 1) * width + x] - temp[Math.max(0, y - r) * width + x];
    }
  }
  return out;
}

/**
 * Outlines where `field` crosses `level`, as closed loops (marching squares).
 * The field carries on past the image for `pad` pixels and is 0 beyond, so
 * every loop closes, and shapes that reach the edge close outside it.
 */
export function contours(field: Float32Array, width: number, height: number, level = .5, pad = 0): Point[][] {
  const o = pad + 1, w = width + 2 * o, h = height + 2 * o;
  const at = (x: number, y: number) => x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1 ? 0
    : field[Math.min(height - 1, Math.max(0, y - o)) * width + Math.min(width - 1, Math.max(0, x - o))];
  // Each crossing lives on a grid edge; 2·cell for the edge to the right of
  // (x, y), 2·cell + 1 for the edge below it.
  const next = new Map<number, number>();
  const point = new Map<number, Point>();
  const cross = (x0: number, y0: number, x1: number, y1: number) => {
    const a = at(x0, y0), b = at(x1, y1);
    const t = (level - a) / (b - a || 1e-9);
    return [x0 + (x1 - x0) * t - o, y0 + (y1 - y0) * t - o] as Point;
  };
  const edge = (x: number, y: number, side: 'top' | 'right' | 'bottom' | 'left') => {
    const id = side === 'top' ? (y * w + x) * 2 : side === 'left' ? (y * w + x) * 2 + 1
      : side === 'bottom' ? ((y + 1) * w + x) * 2 : (y * w + x + 1) * 2 + 1;
    if (!point.has(id)) {
      point.set(id, side === 'top' ? cross(x, y, x + 1, y) : side === 'left' ? cross(x, y, x, y + 1)
        : side === 'bottom' ? cross(x, y + 1, x + 1, y + 1) : cross(x + 1, y, x + 1, y + 1));
    }
    return id;
  };
  const link = (x: number, y: number, from: 'top' | 'right' | 'bottom' | 'left', to: 'top' | 'right' | 'bottom' | 'left') =>
    next.set(edge(x, y, from), edge(x, y, to));
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const tl = at(x, y) >= level ? 8 : 0, tr = at(x + 1, y) >= level ? 4 : 0;
    const br = at(x + 1, y + 1) >= level ? 2 : 0, bl = at(x, y + 1) >= level ? 1 : 0;
    // Oriented so the inside is always on the same side of the line.
    switch (tl | tr | br | bl) {
      case 1: link(x, y, 'left', 'bottom'); break;
      case 2: link(x, y, 'bottom', 'right'); break;
      case 3: link(x, y, 'left', 'right'); break;
      case 4: link(x, y, 'right', 'top'); break;
      case 5: link(x, y, 'left', 'top'); link(x, y, 'right', 'bottom'); break;
      case 6: link(x, y, 'bottom', 'top'); break;
      case 7: link(x, y, 'left', 'top'); break;
      case 8: link(x, y, 'top', 'left'); break;
      case 9: link(x, y, 'top', 'bottom'); break;
      case 10: link(x, y, 'top', 'right'); link(x, y, 'bottom', 'left'); break;
      case 11: link(x, y, 'top', 'right'); break;
      case 12: link(x, y, 'right', 'left'); break;
      case 13: link(x, y, 'right', 'bottom'); break;
      case 14: link(x, y, 'bottom', 'left'); break;
    }
  }
  const loops: Point[][] = [];
  for (const start of next.keys()) {
    if (!next.has(start)) continue;
    const loop: Point[] = [];
    let id: number | undefined = start;
    while (id !== undefined && next.has(id)) {
      loop.push(point.get(id)!);
      const following: number = next.get(id)!;
      next.delete(id);
      id = following;
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}

/** Signed area; positive loops go one way round, holes the other. */
export function area(points: Point[]) {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) sum += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  return sum / 2;
}

/** Ramer–Douglas–Peucker on an open polyline. */
export function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  const [ax, ay] = points[0], [bx, by] = points[points.length - 1];
  const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy) || 1;
  let far = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs((points[i][0] - ax) * dy - (points[i][1] - ay) * dx) / length;
    if (d > far) { far = d; index = i; }
  }
  if (far <= epsilon) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), epsilon).slice(0, -1), ...simplify(points.slice(index), epsilon)];
}

/** Simplifies a closed loop by splitting it at its two most distant points. */
export function simplifyLoop(points: Point[], epsilon: number) {
  if (points.length < 8) return points;
  let far = 0, index = 0;
  for (let i = 1; i < points.length; i++) {
    const d = (points[i][0] - points[0][0]) ** 2 + (points[i][1] - points[0][1]) ** 2;
    if (d > far) { far = d; index = i; }
  }
  const a = simplify(points.slice(0, index + 1), epsilon);
  const b = simplify([...points.slice(index), points[0]], epsilon);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Splits long edges of a closed loop, so smoothing only rounds corners locally. */
export function densify(points: Point[], longest: number) {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length];
    const pieces = Math.ceil(Math.hypot(bx - ax, by - ay) / longest);
    for (let k = 0; k < pieces; k++) out.push([ax + (bx - ax) * k / pieces, ay + (by - ay) * k / pieces]);
  }
  return out;
}

/** Rounds corners of a closed loop (Chaikin). */
export function smooth(points: Point[], iterations = 1) {
  let current = points;
  for (let k = 0; k < iterations; k++) {
    const out: Point[] = [];
    for (let i = 0; i < current.length; i++) {
      const [ax, ay] = current[i], [bx, by] = current[(i + 1) % current.length];
      out.push([ax * .75 + bx * .25, ay * .75 + by * .25], [ax * .25 + bx * .75, ay * .25 + by * .75]);
    }
    current = out;
  }
  return current;
}
