/*
  Finds every olive crown in the PNOA orthophoto over an area of the farm:
  centre (farm metres) and crown diameter of each tree. Run by build-farm.ts.

  Olive groves are the easy case for classical vision: dark, round crowns on
  pale soil, photographed near midday so shadows are short. The steps:
    1. darkness relative to the local soil (some plots have far darker soil);
    2. drop tinted things (solar panels, ponds) and threshold into a crown mask;
    3. smooth the mask so the lobes of one multi-trunk olive merge;
    4. crown centres are maxima of the distance to the mask edge, suppressed
       when two maxima belong to one crown;
    5. each crown's diameter comes from the mask area nearest to its centre.
*/
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { mosaic } from './pnoa.ts';

const SOIL_WINDOW_M = 7; // wider than a crown: the brightest nearby ground is soil
const DARKER_THAN_SOIL = 0.72; // crown pixels are at most this fraction of the soil's brightness…
const MIN_CONTRAST = 55; // …and this many levels darker, so darker soil patches don't pass
const MERGE_SIGMA_M = 0.6; // joins lobes and trunks of one tree
const MIN_RADIUS_M = 1; // smaller blobs are weeds, bushes along tracks or noise
const MIN_SPACING_M = 3.2; // no two olives' trunks closer than this
const MAX_DIAMETER_M = 11;

export type Olive = { x: number; y: number; diameter: number };
export type Area = { minX: number; minY: number; maxX: number; maxY: number };
type Image = { W: number; H: number };

function boxBlur({ W, H }: Image, src: Float32Array, radius: number) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), size = radius * 2 + 1;
  for (let y = 0; y < H; y++) {
    let sum = 0;
    const row = y * W;
    for (let x = -radius; x <= radius; x++) sum += src[row + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = sum / size;
      sum += src[row + Math.min(W - 1, x + radius + 1)] - src[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = sum / size;
      sum += tmp[Math.min(H - 1, y + radius + 1) * W + x] - tmp[Math.max(0, y - radius) * W + x];
    }
  }
  return out;
}

/** Three box blurs approximate a Gaussian. */
function gaussian(image: Image, src: Float32Array, sigma: number) {
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  return boxBlur(image, boxBlur(image, boxBlur(image, src, r), r), r);
}

/** Sliding maximum (van Herk / Gil-Werman), rows then columns. */
function maxFilter({ W, H }: Image, src: Float32Array, radius: number) {
  const pass = (input: Float32Array, length: number, lines: number, at: (line: number, k: number) => number) => {
    const out = new Float32Array(W * H), size = radius * 2 + 1;
    const g = new Float32Array(length + size), h = new Float32Array(length + size);
    for (let line = 0; line < lines; line++) {
      const value = (k: number) => input[at(line, Math.min(length - 1, Math.max(0, k - radius)))];
      for (let k = 0; k < length + size - 1; k++) g[k] = k % size === 0 ? value(k) : Math.max(g[k - 1], value(k));
      for (let k = length + size - 2; k >= 0; k--) h[k] = (k + 1) % size === 0 || k === length + size - 2 ? value(k) : Math.max(h[k + 1], value(k));
      for (let k = 0; k < length; k++) out[at(line, k)] = Math.max(h[k], g[k + size - 1]);
    }
    return out;
  };
  return pass(pass(src, W, H, (y, x) => y * W + x), H, W, (x, y) => y * W + x);
}

/** Exact Euclidean distance transform (Felzenszwalb–Huttenlocher): squared distance to the nearest 0. */
function distanceTransform({ W, H }: Image, mask: Uint8Array) {
  const INF = 1e20, n = Math.max(W, H);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const out = new Float32Array(W * H);
  const line = (length: number) => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < length; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < length; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  };
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = mask[y * W + x] ? INF : 0;
    line(H);
    for (let y = 0; y < H; y++) out[y * W + x] = d[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = out[y * W + x];
    line(W);
    for (let x = 0; x < W; x++) out[y * W + x] = d[x];
  }
  return out;
}

export async function detectOlives(area: Area, debug?: { dir: string; spots: [string, number, number][] }): Promise<Olive[]> {
  console.log('Loading orthophoto…');
  const m = await mosaic(area.minX, area.minY, area.maxX, area.maxY);
  const { width: W, height: H, rgb } = m;
  const image = { W, H }, N = W * H;
  const px = (metres: number) => metres / m.metresPerPixel;
  console.log(`  ${W}×${H} px at ${m.metresPerPixel.toFixed(3)} m/px`);

  // 1. Darkness relative to the local soil.
  console.log('Measuring crowns against the soil…');
  const lum = new Float32Array(N);
  // Olive crowns are a neutral dark grey (R ≈ G ≈ B). Solar panels lean blue and ponds green,
  // so tint is averaged over a few metres: panel frames and pond edges go with them.
  const tint = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    tint[i] = b - r > 14 || g - r > 18 ? 1 : 0;
  }
  const tinted = gaussian(image, tint, px(2.5));
  const smooth = gaussian(image, lum, 1);
  const soil = gaussian(image, maxFilter(image, smooth, Math.round(px(SOIL_WINDOW_M))), px(2));

  // 2–3. Crown mask, with the lobes of one tree merged.
  const raw = new Uint8Array(N);
  for (let i = 0; i < N; i++) raw[i] = tinted[i] < 0.06 && smooth[i] < soil[i] * DARKER_THAN_SOIL && soil[i] - smooth[i] > MIN_CONTRAST ? 1 : 0;
  const merged = gaussian(image, Float32Array.from(raw), px(MERGE_SIGMA_M));
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) mask[i] = merged[i] > 0.45 ? 1 : 0;

  // 4. Centres from the distance transform.
  console.log('Finding crown centres…');
  const dist = distanceTransform(image, mask);
  const minR2 = px(MIN_RADIUS_M) ** 2;
  type Peak = { x: number; y: number; r: number };
  const candidates: Peak[] = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, v = dist[i];
      if (v < minR2) continue;
      if (v >= dist[i - 1] && v >= dist[i + 1] && v >= dist[i - W] && v >= dist[i + W]
        && v >= dist[i - W - 1] && v >= dist[i - W + 1] && v >= dist[i + W - 1] && v > dist[i + W + 1]) {
        candidates.push({ x, y, r: Math.sqrt(v) });
      }
    }
  }
  candidates.sort((a, b) => b.r - a.r);

  // Greedy suppression on a spatial hash: a weaker maximum inside a kept crown is the same tree.
  const CELL = Math.ceil(px(MAX_DIAMETER_M));
  const grid = new Map<number, Peak[]>();
  const key = (cx: number, cy: number) => cy * 100_000 + cx;
  const kept: Peak[] = [];
  const minSpacing = px(MIN_SPACING_M);
  for (const p of candidates) {
    const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL);
    let clash = false;
    for (let gy = cy - 1; gy <= cy + 1 && !clash; gy++) {
      for (let gx = cx - 1; gx <= cx + 1 && !clash; gx++) {
        for (const q of grid.get(key(gx, gy)) ?? []) {
          if (Math.hypot(p.x - q.x, p.y - q.y) < Math.max(minSpacing, q.r + 0.8 * p.r)) { clash = true; break; }
        }
      }
    }
    if (clash) continue;
    kept.push(p);
    const list = grid.get(key(cx, cy)) ?? [];
    list.push(p);
    grid.set(key(cx, cy), list);
  }

  // 5. Crown area nearest to each centre, on the unsmoothed mask.
  console.log('Measuring crown diameters…');
  const crown = new Float64Array(kept.length);
  const index = new Map<Peak, number>(kept.map((p, k) => [p, k]));
  const reach = px(MAX_DIAMETER_M / 2);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!raw[y * W + x]) continue;
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      let best: Peak | null = null, bestD = reach;
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          for (const q of grid.get(key(gx, gy)) ?? []) {
            const d = Math.hypot(x - q.x, y - q.y);
            if (d < bestD) { bestD = d; best = q; }
          }
        }
      }
      if (best) crown[index.get(best)!]++;
    }
  }

  const olives = kept.map((p, k) => ({
    ...m.toFarm(p.x, p.y),
    diameter: Math.min(MAX_DIAMETER_M, 2 * Math.sqrt(crown[k] / Math.PI) * m.metresPerPixel),
  })).filter(t => t.diameter >= 2 * MIN_RADIUS_M);
  console.log(`  ${olives.length} olives`);

  // Crops with the detections drawn on top, to check by eye.
  if (debug) {
    await mkdir(debug.dir, { recursive: true });
    const photo = sharp(Buffer.from(rgb), { raw: { width: W, height: H, channels: 3 } });
    for (const [name, fx, fy] of debug.spots) {
      const c = m.toImage(fx, fy), size = 700;
      const left = Math.round(Math.min(W - size, Math.max(0, c.x - size / 2)));
      const top = Math.round(Math.min(H - size, Math.max(0, c.y - size / 2)));
      const circles = olives.map(t => {
        const p = m.toImage(t.x, t.y);
        if (p.x < left || p.y < top || p.x > left + size || p.y > top + size) return '';
        const [cx, cy] = [(p.x - left).toFixed(1), (p.y - top).toFixed(1)];
        return `<circle cx="${cx}" cy="${cy}" r="${(px(t.diameter) / 2).toFixed(1)}" fill="none" stroke="#ff3b30" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="1.8" fill="#ffd60a"/>`;
      }).join('');
      await photo.clone().extract({ left, top, width: size, height: size })
        .composite([{ input: Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${circles}</svg>`) }])
        .png().toFile(path.join(debug.dir, `${name}.png`));
    }
    console.log(`  debug crops in ${debug.dir}`);
  }
  return olives;
}
