import samples from './samples.json';

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
export type LoadedMedia = { item: Media; image: HTMLImageElement; videoUrl?: string };

const descriptions = [
  'El sol se pone detrás de una sierra',
  'Una cabaña junto a un lago entre montañas',
  'Valle alpino bajo un cielo de nubes',
  'Olas azules a la altura del agua',
  'Luz de la tarde entre los árboles',
  'Una calle de noche iluminada en azul y violeta',
  'Un edificio de cristal visto desde la calle',
  'Una barca en un lago de agua turquesa',
  'Niebla y luz de amanecer sobre el campo',
  'Una pasarela se adentra en un bosque',
  'Una carretera entre montañas de roca roja',
  'Una figura ante un paisaje de montañas',
];

// Temporary Unsplash photographs. Replace this collection with your own files.
// Videos use `src` for the video, `poster` for its cover, and the same dimensions.
export const collection: Media[] = samples.map((sample, index) => ({
  ...sample,
  type: 'image',
  alt: descriptions[index],
}));

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

function decodeVideo(src: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const cleanup = () => {
      video.onloadeddata = null;
      video.onerror = null;
      signal.removeEventListener('abort', abort);
      video.removeAttribute('src');
      video.load();
    };
    const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    video.onloadeddata = () => { cleanup(); resolve(); };
    video.onerror = () => { cleanup(); reject(new Error('Could not decode the video')); };
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = src;
  });
}

export async function loadMedia(item: Media, signal: AbortSignal): Promise<LoadedMedia> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = window.setTimeout(abort, 30_000);
  try {
    if (item.type === 'image') return { item, image: await loadImage(item.src, controller.signal) };
    // Buffer the complete video before entry, so exploring the grid never starts a download.
    const [image, blob] = await Promise.all([
      loadImage(item.poster, controller.signal),
      fetch(item.src, { signal: controller.signal }).then(response => {
        if (!response.ok) throw new Error(`Could not load ${item.src}`);
        return response.blob();
      }),
    ]);
    const videoUrl = URL.createObjectURL(blob);
    try {
      await decodeVideo(videoUrl, controller.signal);
      return { item, image, videoUrl };
    } catch (error) {
      URL.revokeObjectURL(videoUrl);
      throw error;
    }
  } finally {
    controller.abort();
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
