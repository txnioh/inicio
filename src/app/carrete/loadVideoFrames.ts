import { loadImage } from './media';

export type VideoFramesData = {
  width: number;
  height: number;
  duration: number;
  times: number[];
  pixels: Uint8Array;
};

export async function loadVideoFrames(src: string, samples: number, signal: AbortSignal, onProgress: (progress: number) => void): Promise<VideoFramesData> {
  signal.throwIfAborted();
  onProgress(0);
  const dir = src.replace(/\.mp4$/, '-volume');
  const response = await fetch(`${dir}/index.json`, { signal });
  if (!response.ok) throw new Error('Samples could not be loaded.');
  const manifest = await response.json() as {
    width: number; height: number; duration: number; columns: number; rows: number; times: number[]; sheets: string[];
  };
  const { width, height, duration, columns, rows } = manifest;
  if (!manifest.times?.length || !manifest.sheets?.length || !width || !height) throw new Error('Invalid volume.');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const pixels = new Uint8Array(width * height * 4 * samples), times: number[] = [];
  const sheets = new Map<number, HTMLImageElement>();
  for (let i = 0; i < samples; i++) {
    signal.throwIfAborted();
    const index = Math.round(i * (manifest.times.length - 1) / (samples - 1));
    const sheetIndex = Math.floor(index / (columns * rows)), cell = index % (columns * rows);
    if (!sheets.has(sheetIndex)) sheets.set(sheetIndex, await loadImage(`${dir}/${manifest.sheets[sheetIndex]}`, signal));
    signal.throwIfAborted();
    ctx.drawImage(sheets.get(sheetIndex)!, cell % columns * width, Math.floor(cell / columns) * height, width, height, 0, 0, width, height);
    pixels.set(ctx.getImageData(0, 0, width, height).data, i * width * height * 4);
    times.push(manifest.times[index]);
    onProgress(Math.floor((i + 1) / samples * 100));
    // Cached atlas decoding is otherwise one long task. Yield between batches
    // so the percentage can paint and navigation/cancellation stays responsive.
    if ((i + 1) % 8 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  return { width, height, duration, pixels, times };
}

export function videoEvent(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', signal: AbortSignal, action: () => void) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout); video.removeEventListener(event, done); video.removeEventListener('error', failed); signal.removeEventListener('abort', aborted);
      error ? reject(error) : resolve();
    };
    const done = () => finish(), failed = () => finish(new Error('This video could not be decoded.'));
    const aborted = () => finish(new DOMException('Cancelled', 'AbortError'));
    const timeout = setTimeout(() => finish(new Error('Video decoding timed out.')), 15000);
    if (signal.aborted) { aborted(); return; }
    video.addEventListener(event, done, { once: true }); video.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
    try { action(); } catch (error) { finish(error as Error); }
  });
}

export async function sampleLocalVideo(src: string, samples: number, signal: AbortSignal, onProgress: (progress: number) => void): Promise<VideoFramesData> {
  signal.throwIfAborted();
  onProgress(0);
  const video = document.createElement('video'); video.muted = true; video.preload = 'auto';
  try {
    await videoEvent(video, 'loadeddata', signal, () => { video.src = src; });
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Invalid video duration.');
    const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(2, Math.round(video.videoWidth * scale)), height = Math.max(2, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const pixels = new Uint8Array(width * height * 4 * samples), times: number[] = [];
    const end = video.duration - Math.min(.04, video.duration * .01);
    for (let i = 0; i < samples; i++) {
      const time = end * i / (samples - 1); signal.throwIfAborted();
      if (Math.abs(video.currentTime - time) > .00001) await videoEvent(video, 'seeked', signal, () => { video.currentTime = time; });
      ctx.drawImage(video, 0, 0, width, height);
      pixels.set(ctx.getImageData(0, 0, width, height).data, i * width * height * 4); times.push(time);
      onProgress(Math.floor((i + 1) / samples * 100));
    }
    return { width, height, duration: video.duration, pixels, times };
  } finally { video.pause(); video.removeAttribute('src'); video.load(); }
}

export function frameAtTime(times: number[], time: number) {
  let low = 0, high = times.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (times[mid] <= time + .000001) low = mid; else high = mid - 1; }
  return low;
}
