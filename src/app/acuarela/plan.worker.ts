// Works out a painting's strokes off the main thread: on a phone that takes
// a second or more, and the loading animation over the photo keeps moving.

import { plan } from './plan';
import type { Style } from './style';
import type { Scene } from './understand';

type Request = { id: number; scene: Scene; seed: number; side: number; style: Style };

self.onmessage = ({ data }: MessageEvent<Request>) => {
  const { id, scene, seed, side, style } = data;
  try {
    postMessage({ type: 'done', id, plan: plan(scene, seed, side, style) });
  } catch (error) {
    postMessage({ type: 'error', id, message: (error as Error).message });
  }
};
