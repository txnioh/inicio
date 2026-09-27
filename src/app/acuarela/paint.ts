// Painting a photo: the strokes are worked out in a worker (plan.ts), then
// laid down here with the brush, a few at a time so the page stays live.

import * as brush from './brushes';
import { PAPER, type Plan } from './plan';
import type { Style } from './style';
import type { Scene } from './understand';

let worker: Worker | null = null;
let requests = 0;

/** Works out the strokes that paint a scene; `side` is the painting's longest side. */
export function plan(scene: Scene, seed: number, side: number, style: Style): Promise<Plan> {
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
    current.postMessage({ id, scene, seed, side, style });
  });
}

/** A painting as shown: its size with the margin, and the margin. */
export type Layout = { width: number; height: number; border: number };

/** The painting a photo of this size will make, with or without its margin; `side` is its longest side. */
export function layoutFor(width: number, height: number, side: number, frame: boolean): Layout {
  const border = frame ? Math.round(side * .03) : 0;
  const long = Math.max(width, height);
  return { width: Math.round(width / long * side) + border * 2, height: Math.round(height / long * side) + border * 2, border };
}

// The last finished painting, without its margin, so the margin can be
// switched on and off without painting again.
let painted: HTMLCanvasElement | null = null;

/**
 * Lays the strokes down in short batches, one per frame, so the animation
 * over the photo stays smooth; then shows the painting on `canvas`.
 * Returns null if cancelled.
 */
export async function perform(canvas: HTMLCanvasElement, paint: Plan,
  { frame = true, signal, onProgress }: { frame?: boolean; signal?: AbortSignal; onProgress?: (done: number) => void } = {}) {
  const surface = brush.begin(paint.width, paint.height, paint.seed, PAPER);
  const { strokes } = paint;
  let i = 0;
  while (i < strokes.length) {
    const start = performance.now();
    while (i < strokes.length && performance.now() - start < 20) {
      const { loops, color, ...options } = strokes[i++];
      brush.wash(loops, color, options);
    }
    brush.flush();
    onProgress?.(i / strokes.length);
    await new Promise(requestAnimationFrame);
    if (signal?.aborted) return null;
  }
  painted ??= document.createElement('canvas');
  painted.width = surface.width;
  painted.height = surface.height;
  painted.getContext('2d')!.drawImage(surface, 0, 0);
  return present(canvas, frame);
}

/** Shows the last painting on `canvas`, framed by a white margin or not. */
export function present(canvas: HTMLCanvasElement, frame: boolean): Layout | null {
  if (!painted) return null;
  const border = frame ? Math.round(Math.max(painted.width, painted.height) * .03) : 0;
  canvas.width = painted.width + border * 2;
  canvas.height = painted.height + border * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fbfaf6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(painted, border, border);
  return { width: canvas.width, height: canvas.height, border };
}
