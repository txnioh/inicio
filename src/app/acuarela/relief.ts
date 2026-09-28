// Paint with body, after Hertzmann's "Fast Paint Texture" (2002). Every
// brush stroke also leaves ridges in a height map — its bristles, along its
// direction, the last stroke on top — and the painting is lit across that
// relief from the upper left, with a faint glint where paint catches the
// light and the weave of the canvas under thin paint.

import { random } from './kit';
import type { Mark } from './oil';

// Bristle ridges, drawn once: soft-edged streaks of uneven height.
function ridges(seed: number) {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  const ctx = sprite.getContext('2d')!;
  const rng = random(seed);
  ctx.filter = 'blur(.6px)';
  for (let i = 0; i < 40; i++) {
    const y = rng.range(4, 60), thick = rng.range(1.5, 4), g = Math.floor(rng.range(150, 230));
    const fade = ctx.createLinearGradient(0, 0, 64, 0);
    fade.addColorStop(0, `rgba(${g},${g},${g},0)`);
    fade.addColorStop(.25, `rgba(${g},${g},${g},1)`);
    fade.addColorStop(.75, `rgba(${g},${g},${g},1)`);
    fade.addColorStop(1, `rgba(${g},${g},${g},0)`);
    ctx.fillStyle = fade;
    ctx.fillRect(0, y - thick / 2, 64, thick);
  }
  return sprite;
}

/** Lights `canvas`, the finished painting, across the relief its brush strokes leave; `strength` 1 is the usual. */
export function relief(canvas: HTMLCanvasElement, marks: Mark[], strength: number, seed: number) {
  const { width: W, height: H } = canvas;
  const field = document.createElement('canvas');
  field.width = W;
  field.height = H;
  const fx = field.getContext('2d', { willReadFrequently: true })!;
  fx.fillStyle = '#4d4d4d';
  fx.fillRect(0, 0, W, H);
  fx.globalAlpha = .45;
  const sprite = ridges(seed);
  for (const { points, size } of marks) {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay, pressure = 1] = points[i], [bx, by] = points[i + 1];
      const length = Math.hypot(bx - ax, by - ay), cos = (bx - ax) / (length || 1), sin = (by - ay) / (length || 1);
      const width = size * pressure, step = Math.max(1.5, width * .18), k = width / 64;
      for (let t = 0; t < length; t += step) {
        fx.setTransform(cos * k, sin * k, -sin * k, cos * k, ax + cos * t, ay + sin * t);
        fx.drawImage(sprite, -32, -32);
      }
    }
  }
  const heights = fx.getImageData(0, 0, W, H).data;
  const height = new Float32Array(W * H);
  for (let i = 0; i < height.length; i++) {
    const x = i % W, y = (i - x) / W;
    // The canvas weave, a fine basket pattern.
    height[i] = heights[i * 4] / 255 + (Math.sin(x * 1.9) * Math.sin(y * 1.9) + .5 * Math.sin((x + y) * .9)) * .007;
  }
  const ctx = canvas.getContext('2d')!;
  const image = ctx.getImageData(0, 0, W, H), px = image.data;
  const depth = .9, gloss = .08 * 255;
  // Light from the upper left, and the halfway vector for the glint.
  const [lx, ly, lz] = unit(-.55, -.6, .58), [hx, hy, hz] = unit(-.55, -.6, 1.58);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const nx = (height[i - 1] - height[i + 1]) * depth, ny = (height[i - W] - height[i + W]) * depth;
    const n = Math.hypot(nx, ny, 1);
    const shade = 1 + ((nx * lx + ny * ly + lz) / n / lz - 1) * .9 * strength;
    const glint = Math.max(0, (nx * hx + ny * hy + hz) / n) ** 60 * gloss * strength;
    px[i * 4] = px[i * 4] * shade + glint;
    px[i * 4 + 1] = px[i * 4 + 1] * shade + glint;
    px[i * 4 + 2] = px[i * 4 + 2] * shade + glint;
  }
  ctx.putImageData(image, 0, 0);
}

function unit(x: number, y: number, z: number): [number, number, number] {
  const m = Math.hypot(x, y, z);
  return [x / m, y / m, z / m];
}
