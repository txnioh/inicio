import { useSyncExternalStore } from 'react';

export const robotSkins = ['classic', 'pixel'] as const;
export type RobotSkin = typeof robotSkins[number];

const KEY = 'robot-skin';
const listeners = new Set<() => void>();
let temporarySkin: RobotSkin | undefined;

function read(): RobotSkin {
  if (temporarySkin) return temporarySkin;
  try {
    return localStorage.getItem(KEY) === 'pixel' ? 'pixel' : 'classic';
  } catch {
    return 'classic';
  }
}

export function setRobotSkin(skin: RobotSkin) {
  try {
    localStorage.setItem(KEY, skin);
    temporarySkin = undefined;
  } catch {
    // Private windows may block storage; the choice then lasts for this page only.
    temporarySkin = skin;
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

// The prerendered homepage always ships the classic face; the saved skin
// takes over right after hydration.
export function useRobotSkin() {
  return useSyncExternalStore(subscribe, read, () => 'classic' as RobotSkin);
}
