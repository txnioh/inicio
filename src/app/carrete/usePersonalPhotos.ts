import { useEffect, useRef, useState } from 'react';
import { loadImage, type LoadedMedia } from './media';

export const PHOTO_LIMIT = 200;
const imageFile = (file: File) => file.type.startsWith('image/') || /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name);
const identity = (file: File) => JSON.stringify([file.webkitRelativePath || file.name, file.size, file.lastModified]);
const releasePhoto = (photo: LoadedMedia) => {
  URL.revokeObjectURL(photo.item.src);
  URL.revokeObjectURL(photo.item.preview);
  photo.image.src = '';
};

function encode(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    result => result ? resolve(result) : reject(new Error('Unsupported photo')), 'image/webp', .88));
}

async function preparePhoto(file: File, signal: AbortSignal): Promise<LoadedMedia> {
  const original = URL.createObjectURL(file);
  let resized: string | undefined;
  let preview: string | undefined;
  let image: HTMLImageElement | undefined;
  try {
    image = await loadImage(original, signal);
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare photo');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await encode(canvas);
    signal.throwIfAborted();
    resized = URL.createObjectURL(blob);
    const width = canvas.width, height = canvas.height;
    const previewScale = Math.min(1, 512 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * previewScale));
    canvas.height = Math.max(1, Math.round(height * previewScale));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const thumbnail = await encode(canvas);
    signal.throwIfAborted();
    preview = URL.createObjectURL(thumbnail);
    const decoded = await loadImage(preview, signal);
    return { item: { id: `personal:${identity(file)}`, type: 'image', src: resized, preview,
      width, height, alt: file.name, title: file.name }, image: decoded };
  } catch (error) {
    if (resized) URL.revokeObjectURL(resized);
    if (preview) URL.revokeObjectURL(preview);
    throw error;
  } finally { if (image) image.src = ''; URL.revokeObjectURL(original); }
}

export default function usePersonalPhotos() {
  const [media, setMedia] = useState<LoadedMedia[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState('');
  const owned = useRef<LoadedMedia[]>([]);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => {
    active.current?.abort();
    owned.current.forEach(releasePhoto);
    owned.current = [];
  }, []);

  async function addFiles(files: File[]) {
    if (!files.length || active.current) return 0;
    const controller = new AbortController();
    active.current = controller;
    const known = new Set(owned.current.map(photo => photo.item.id));
    let duplicates = 0, unsupported = 0, overflow = 0;
    const queue: File[] = [];
    for (const file of files) {
      if (!imageFile(file) || file.size > 40 * 1024 * 1024) { unsupported++; continue; }
      const id = `personal:${identity(file)}`;
      if (known.has(id)) { duplicates++; continue; }
      known.add(id);
      if (queue.length + owned.current.length >= PHOTO_LIMIT) { overflow++; continue; }
      queue.push(file);
    }
    setMessage('');
    setProgress({ done: 0, total: queue.length });
    const results: (LoadedMedia | undefined)[] = new Array(queue.length);
    let cursor = 0, done = 0;
    async function worker() {
      while (cursor < queue.length && !controller.signal.aborted) {
        const index = cursor++;
        const fileController = new AbortController();
        const timeout = window.setTimeout(() => fileController.abort(), 20_000);
        const abort = () => fileController.abort();
        controller.signal.addEventListener('abort', abort, { once: true });
        try { results[index] = await preparePhoto(queue[index], fileController.signal); }
        catch { if (!controller.signal.aborted) unsupported++; }
        finally { clearTimeout(timeout); controller.signal.removeEventListener('abort', abort); }
        done++;
        if (!controller.signal.aborted) setProgress({ done, total: queue.length });
      }
    }
    await Promise.all([worker(), worker()]);
    const added = results.filter((photo): photo is LoadedMedia => photo !== undefined);
    if (controller.signal.aborted) {
      added.forEach(releasePhoto);
      return 0;
    }
    owned.current = [...owned.current, ...added];
    setMedia(owned.current);
    setMessage([
      added.length ? `${added.length} photo${added.length === 1 ? '' : 's'} added.` : 'No new photos added.',
      duplicates ? `${duplicates} already in your roll.` : '',
      unsupported ? `${unsupported} could not be opened. Try JPG, PNG or WebP under 40 MB.` : '',
      overflow ? `Your roll holds up to ${PHOTO_LIMIT} photos. ${overflow} left out.` : '',
    ].filter(Boolean).join(' '));
    active.current = null;
    setProgress(null);
    return added.length;
  }

  function clear() {
    owned.current.forEach(releasePhoto);
    owned.current = [];
    setMedia([]);
    setMessage('Your photos have been cleared.');
  }

  return { media, progress, message, addFiles, clear };
}
