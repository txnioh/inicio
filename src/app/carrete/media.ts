import archive from './instagram.json';
import type { MediaQuality } from './quality';

type MediaBase = {
  id: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  title?: string;
  preview: string;
};

export type Media = MediaBase & ({ type: 'image' } | { type: 'video'; poster: string });
export type LoadedMedia = {
  item: Media;
  image: HTMLImageElement;
};

// All posts and carousel slides from @txnioh, with permanent local media files.
export const collection: Media[] = archive.map(item => item.type === 'video'
  ? { ...item, type: 'video', poster: item.poster! }
  : { ...item, type: 'image' });

export function loadImage(src: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      image.src = '';
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    image.onload = async () => {
      try {
        await image.decode();
        if (!signal.aborted) { cleanup(); resolve(image); }
      } catch (error) { cleanup(); reject(error); }
    };
    image.onerror = () => { cleanup(); reject(new Error(`Could not load ${src}`)); };
    image.src = src;
  });
}

export function imageSource(item: Media, quality: MediaQuality) {
  const src = item.type === 'image' ? item.src : item.poster;
  return quality === 'lite' ? src.replace(/\.webp$/, '-lite.webp') : src;
}

export async function loadMedia(item: Media, signal: AbortSignal, quality: MediaQuality): Promise<LoadedMedia> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = window.setTimeout(abort, 30_000);
  try {
    return { item, image: await loadImage(imageSource(item, quality), controller.signal) };
  } finally {
    controller.abort();
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
