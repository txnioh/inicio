import { loadImage } from './media';
import type { MediaQuality } from './quality';

export type VideoFramesData = {
  columns: number;
  rows: number;
  width: number;
  height: number;
  times: number[];
  sheets: HTMLImageElement[];
};

export async function loadVideoFrames(src: string, quality: MediaQuality, signal: AbortSignal, onProgress: (progress: number) => void): Promise<VideoFramesData> {
  const directory = src.replace(/\.mp4$/, quality === 'lite' ? '-frames-lite' : '-frames');
  const response = await fetch(`${directory}/index.json`, { signal });
  if (!response.ok) throw new Error('No se han podido cargar los fotogramas.');
  const manifest = await response.json() as Omit<VideoFramesData, 'sheets'> & { sheets: string[] };
  if (!manifest.times?.length || !manifest.sheets?.length) throw new Error('No hay fotogramas disponibles.');
  const sheets: HTMLImageElement[] = [];
  for (const file of manifest.sheets) {
    signal.throwIfAborted();
    sheets.push(await loadImage(`${directory}/${file}`, signal));
    onProgress(Math.round(sheets.length / manifest.sheets.length * 100));
  }
  return { ...manifest, sheets };
}

export function frameAtTime(times: number[], time: number) {
  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (times[mid] <= time + .000001) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function frameBackground(data: VideoFramesData, index: number) {
  const cell = index % (data.columns * data.rows);
  return {
    backgroundImage: `url("${data.sheets[Math.floor(index / (data.columns * data.rows))].src}")`,
    backgroundSize: `${data.columns * 100}% ${data.rows * 100}%`,
    backgroundPosition: `${cell % data.columns / Math.max(1, data.columns - 1) * 100}% ${Math.floor(cell / data.columns) / Math.max(1, data.rows - 1) * 100}%`,
  };
}
