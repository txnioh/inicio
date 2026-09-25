import { useSyncExternalStore } from 'react';

// The station follows the system's light or dark setting until the visitor
// picks one with the toggle. CSS handles itself with light-dark(); this is
// for colours painted from script (the canvases).
export type Scheme = 'light' | 'dark';

const KEY = 'trenes-theme';
const listeners = new Set<() => void>();
let query: MediaQueryList | null = null;
let chosen: Scheme | null | undefined;

const system = () => (query ??= matchMedia('(prefers-color-scheme: dark)'));

function saved(): Scheme | null {
  if (chosen !== undefined) return chosen;
  try {
    const value = localStorage.getItem(KEY);
    chosen = value === 'light' || value === 'dark' ? value : null;
  } catch {
    chosen = null;
  }
  return chosen;
}

export function scheme(): Scheme {
  if (typeof matchMedia === 'undefined') return 'light';
  return saved() ?? (system().matches ? 'dark' : 'light');
}

// Cheap enough to call every frame: nothing is recreated.
export const isDark = () => scheme() === 'dark';
export const pick = <T,>(light: T, dark: T) => (isDark() ? dark : light);

export function setScheme(next: Scheme) {
  chosen = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Private windows may refuse storage; the choice lasts for this visit.
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  system().addEventListener('change', listener);
  return () => {
    listeners.delete(listener);
    system().removeEventListener('change', listener);
  };
}

export function useScheme() {
  return useSyncExternalStore(subscribe, scheme, () => 'light' as Scheme);
}
