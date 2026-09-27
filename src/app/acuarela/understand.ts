// Reading a photo before painting it: its colours, and how far away each
// part is. Depth comes from a small model, Depth Anything V2, run on the
// device in a worker through transformers.js; it names nothing, it only
// measures near and far. Nothing leaves the phone; the model downloads once
// and stays in the browser's cache.

export type Scene = {
  width: number;
  height: number;
  /** 0 for the farthest point, 1 for the nearest. */
  depth: Float32Array;
  /** The photo at this size, RGBA. */
  color: Uint8ClampedArray;
};

export type Stage = 'download' | 'depth';

let worker: Worker | null = null;
let requests = 0;

/** Analyses a photo, scaled so its longest side is `side` pixels. */
export function understand(source: CanvasImageSource & { width: number; height: number }, side: number,
  onProgress: (stage: Stage, progress: number) => void = () => {}): Promise<Scene> {
  const scale = Math.min(1, side / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale), height = Math.round(source.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(source, 0, 0, width, height);
  const color = context.getImageData(0, 0, width, height).data;

  worker ??= new Worker(new URL('./understand.worker.ts', import.meta.url), { type: 'module' });
  const id = ++requests;
  const current = worker;
  return new Promise((resolve, reject) => {
    const finish = () => {
      current.removeEventListener('message', listen);
      current.removeEventListener('error', fail);
    };
    const listen = ({ data }: MessageEvent) => {
      if (data.type === 'progress') return onProgress(data.stage, data.progress);
      if (data.id !== id) return;
      finish();
      if (data.type === 'error') reject(new Error(data.message));
      else resolve({ width, height, depth: data.depth, color });
    };
    const fail = (event: ErrorEvent) => {
      finish();
      worker = null;
      reject(new Error(event.message || 'The model could not start'));
    };
    current.addEventListener('message', listen);
    current.addEventListener('error', fail);
    current.postMessage({ id, pixels: color.slice(), width, height });
  });
}
