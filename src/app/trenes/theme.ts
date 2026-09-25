import { useSyncExternalStore } from 'react';

// The station always opens light, whatever the system setting; the toggle
// switches it to dark for the visit. CSS handles itself with light-dark();
// this is for colours painted from script (the canvases).
export type Scheme = 'light' | 'dark';

const listeners = new Set<() => void>();
let current: Scheme = 'light';

export const scheme = (): Scheme => current;

// Cheap enough to call every frame: nothing is recreated.
export const isDark = () => current === 'dark';
export const pick = <T,>(light: T, dark: T) => (isDark() ? dark : light);

export function setScheme(next: Scheme) {
  current = next;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useScheme() {
  return useSyncExternalStore(subscribe, scheme, () => 'light' as Scheme);
}
