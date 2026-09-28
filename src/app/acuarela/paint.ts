// Painting a photo: the strokes are worked out in a worker (plan.ts), then
// laid down here with the brush, a few at a time so the page stays live.

import * as brush from './brushes';
import type { Plan } from './plan';
import { relief } from './relief';
import type { Look } from './style';
import type { Scene } from './understand';

let worker: Worker | null = null;
let requests = 0;

/** Works out the strokes that paint a scene; `side` is the painting's longest side. */
export function plan(scene: Scene, seed: number, side: number, look: Look): Promise<Plan> {
  worker ??= new Worker(new URL('./plan.worker.ts', import.meta.url), { type: 'module' });
  const id = ++requests;
  const current = worker;
  return new Promise((resolve, reject) => {
    const finish = () => {
      current.removeEventListener('message', listen);
      current.removeEventListener('error', fail);
    };
    const listen = ({ data }: MessageEvent) => {
      if (data.id !== id) return;
      finish();
      if (data.type === 'error') reject(new Error(data.message));
      else resolve(data.plan);
    };
    const fail = (event: ErrorEvent) => {
      finish();
      worker = null;
      reject(new Error(event.message || 'The painter could not start'));
    };
    current.addEventListener('message', listen);
    current.addEventListener('error', fail);
    current.postMessage({ id, scene, seed, side, look });
  });
}

/** A painting's size on the page. */
export type Layout = { width: number; height: number };

/** The size of the painting a photo of this size makes; `side` is its longest side. */
export function layoutFor(width: number, height: number, side: number): Layout {
  const long = Math.max(width, height);
  return { width: Math.round(width / long * side), height: Math.round(height / long * side) };
}

/** A new canvas for a plan, with its brushes and texture set. */
export function prepare(paint: Plan) {
  const surface = brush.begin(paint.width, paint.height, paint.seed, paint.paper);
  if (paint.brushes) brush.bristles(paint.brushes, paint.seed);
  brush.circles(!!paint.circles);
  return surface;
}

/** Lays down the plan's `i`th stroke: its watercolour washes first, then its brush strokes. */
export function layDown({ strokes, marks }: Plan, i: number) {
  if (i < strokes.length) {
    const { loops, color, ...options } = strokes[i];
    brush.wash(loops, color, options);
  } else {
    const { points, color, size, brush: which } = marks[i - strokes.length];
    brush.stroke(points, color, size, which);
  }
}

/**
 * Lays the strokes down in short batches, one per frame, so the animation
 * over the photo stays smooth; then shows the painting on `canvas`.
 * Returns null if cancelled.
 */
export async function perform(canvas: HTMLCanvasElement, paint: Plan,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (done: number) => void } = {}) {
  const surface = prepare(paint);
  const total = paint.strokes.length + paint.marks.length;
  let i = 0;
  while (i < total) {
    const start = performance.now();
    while (i < total && performance.now() - start < 20) {
      layDown(paint, i++);
    }
    brush.flush();
    onProgress?.(i / total);
    await new Promise(requestAnimationFrame);
    if (signal?.aborted) return null;
  }
  canvas.width = surface.width;
  canvas.height = surface.height;
  canvas.getContext('2d')!.drawImage(surface, 0, 0);
  if (paint.relief) relief(canvas, paint.marks, paint.relief, paint.seed);
  return { width: canvas.width, height: canvas.height };
}
