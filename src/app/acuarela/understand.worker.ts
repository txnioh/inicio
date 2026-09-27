// Runs the depth model off the main thread, so the page stays responsive
// while a phone spends a few seconds on it.

import { pipeline, RawImage } from '@huggingface/transformers';

type Request = { id: number; pixels: Uint8ClampedArray; width: number; height: number };
type Estimator = (image: RawImage) => Promise<{ depth: { data: Uint8Array | Uint8ClampedArray; width: number; height: number } }>;

let model: Promise<Estimator> | null = null;

function load() {
  const bytes = new Map<string, [number, number]>();
  const progress_callback = (event: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (event.status !== 'progress' || !event.file) return;
    bytes.set(event.file, [event.loaded ?? 0, event.total ?? 0]);
    let loaded = 0, total = 0;
    for (const [l, t] of bytes.values()) { loaded += l; total += t; }
    if (total) postMessage({ type: 'progress', stage: 'download', progress: loaded / total });
  };
  // Quantised to 8 bits: about 27 MB, downloaded once and cached.
  model ??= pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small',
    { device: 'wasm', dtype: 'q8', progress_callback }) as unknown as Promise<Estimator>;
  model.catch(() => { model = null; });
  return model;
}

self.onmessage = async ({ data }: MessageEvent<Request>) => {
  const { id, pixels, width, height } = data;
  try {
    const estimate = await load();
    postMessage({ type: 'progress', stage: 'depth', progress: 0 });
    const { depth: map } = await estimate(new RawImage(pixels, width, height, 4));
    // Depth Anything gives relative inverse depth: larger is nearer.
    const depth = new Float32Array(width * height);
    let low = Infinity, high = -Infinity;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const v = map.data[Math.min(map.height - 1, Math.floor(y * map.height / height)) * map.width
        + Math.min(map.width - 1, Math.floor(x * map.width / width))];
      depth[y * width + x] = v;
      low = Math.min(low, v);
      high = Math.max(high, v);
    }
    for (let i = 0; i < depth.length; i++) depth[i] = (depth[i] - low) / Math.max(1, high - low);
    postMessage({ type: 'done', id, depth }, { transfer: [depth.buffer] });
  } catch (error) {
    postMessage({ type: 'error', id, message: (error as Error).message });
  }
};
