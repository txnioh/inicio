import { AutoConfig, AutoModel, AutoProcessor, RawImage, RawVideo, RawVideoFrame, Tensor, env } from '@huggingface/transformers';
import { normalizeEmbedding } from './semanticSearch';
import type { VideoFramesData } from './loadVideoFrames';

type Request = { id: number } & (
  | { type: 'load' }
  | { type: 'text'; text: string }
  | { type: 'image'; src: string }
  | { type: 'video'; frames: VideoFramesData }
);

const MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX';
env.allowLocalModels = false;
// A single worker owns the GPU sessions and serializes inference.
env.backends.onnx.wasm!.numThreads = 1;
let runtime: Promise<{ processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  model: Awaited<ReturnType<typeof AutoModel.from_pretrained>> }> | null = null;

function load() {
  runtime ??= (async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu || !await gpu.requestAdapter()) throw new Error('Search needs WebGPU. Try an up-to-date Chrome or Edge browser.');
    const config = await AutoConfig.from_pretrained(MODEL_ID);
    // Carrete contains photos and films: video uses the vision encoder, audio is unnecessary.
    Object.assign(config, { audio_config: null });
    const [processor, model] = await Promise.allSettled([
      AutoProcessor.from_pretrained(MODEL_ID),
      AutoModel.from_pretrained(MODEL_ID, { config, device: 'webgpu', dtype: 'q4',
        progress_callback: event => {
          if (event.status === 'progress_total') postMessage({ type: 'progress', progress: event.progress });
        } }),
    ]);
    if (processor.status === 'rejected') {
      if (model.status === 'fulfilled') await model.value.dispose();
      throw processor.reason;
    }
    if (model.status === 'rejected') throw model.reason;
    return { processor: processor.value, model: model.value };
  })();
  runtime.catch(() => { runtime = null; });
  return runtime;
}

function dispose(value: unknown, seen = new Set<unknown>()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Tensor) {
    if (!seen.has(value.ort_tensor)) {
      seen.add(value.ort_tensor);
      try { value.dispose(); } catch { /* An aliased tensor may already be released by the model. */ }
    }
  } else if (Array.isArray(value)) value.forEach(item => dispose(item, seen));
  else if (!ArrayBuffer.isView(value)) Object.values(value).forEach(item => dispose(item, seen));
}

async function handle(request: Request) {
  let inputs: unknown, outputs: unknown;
  try {
    const { processor, model } = await load();
    if (request.type === 'load') { postMessage({ type: 'done', id: request.id }); return; }
    if (request.type === 'text') inputs = await processor(`task: search result | query: ${request.text}`);
    else if (request.type === 'image') inputs = await processor(null, await RawImage.read(request.src));
    else {
      const { width, height, pixels, times, duration } = request.frames;
      const stride = width * height * 4;
      const frames = times.map((time, index) => new RawVideoFrame(
        new RawImage(pixels.subarray(index * stride, (index + 1) * stride), width, height, 4), time));
      inputs = await processor(null, null, null, new RawVideo(frames, duration));
    }
    outputs = await model(inputs);
    const embedding = (outputs as { sentence_embedding: Tensor }).sentence_embedding;
    const values = normalizeEmbedding(Float32Array.from(embedding.data as Float32Array));
    postMessage({ type: 'done', id: request.id, values }, { transfer: [values.buffer] });
  } catch (error) {
    postMessage({ type: 'error', id: request.id, message: error instanceof Error ? error.message : 'Search could not complete.' });
  } finally { dispose([inputs, outputs]); }
}

let queue = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<Request>) => { queue = queue.then(() => handle(data)); };
