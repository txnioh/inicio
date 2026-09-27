// Works out a painting's strokes off the main thread: on a phone that takes
// a second or more, and the loading animation over the photo keeps moving.

import { planOil } from './oil';
import { plan } from './plan';
import type { Look } from './style';
import type { Scene } from './understand';

type Request = { id: number; scene: Scene; seed: number; side: number; look: Look };

self.onmessage = ({ data }: MessageEvent<Request>) => {
  const { id, scene, seed, side, look } = data;
  try {
    const made = look.kind === 'oil' ? planOil(scene, seed, side, look.oil) : plan(scene, seed, side, look.style);
    postMessage({ type: 'done', id, plan: made });
  } catch (error) {
    postMessage({ type: 'error', id, message: (error as Error).message });
  }
};
