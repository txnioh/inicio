export type SkinId = 'original' | 'sand' | 'sage' | 'silver' | 'eva';
import type { Parity } from './controller';
import type { SkateStats } from './skate';

// Names for both are in i18n.ts.
export const motions = [
  { id: 'locomotion' }, { id: 'jump' },
  { id: 'gesture_hello' }, { id: 'gesture_bow' },
  { id: 'gesture_paw' }, { id: 'gesture_salute' },
  { id: 'dance_maze' }, { id: 'dance_brazilian' },
  { id: 'dance_crab' }, { id: 'dance_dream_wings' },
  { id: 'claw_left' }, { id: 'claw_right' },
] as const;

export const skins: { id: SkinId; shell: string; limb: string }[] = [
  { id: 'original', shell: '#db3b25', limb: '#bcbcbc' },
  { id: 'sand', shell: '#d9a660', limb: '#d4c4a8' },
  { id: 'sage', shell: '#82967b', limb: '#bdc7b4' },
  { id: 'silver', shell: '#b5bcc5', limb: '#ced2d7' },
  { id: 'eva', shell: '#7350ae', limb: '#9cdb46' },
];

export interface Joint { name: string; min: number; max: number; home: number }
export interface Stats {
  time: number;
  playing: boolean;
  fps: number;
  height: number;
  contacts: number;
  joints: number[];
  x: number;
  y: number;
  grounded: boolean;
  controllerMode: string;
  policyRunning: boolean;
  simRate: number;
  parity?: Parity;
  skate?: SkateStats;
  /** The run whose pad Jumper stands on, in the playground. */
  portal?: string;
}

export const initialStats: Stats = {
  time: 0, playing: false, fps: 0, height: 0.10647, contacts: 0, joints: [], x: 0, y: 0, grounded: true, controllerMode: 'locomotion', policyRunning: false, simRate: 1,
};

// Metres. The boxes stand out on a wide ring around the start (2.6-3.6 m),
// clear of the signs, so the middle stays open and the place reads as large.
export const boxes = [
  { x: 2.6, y: 0.45, width: 0.4, depth: 0.38, height: 0.03 },
  { x: 2.45, y: 2.1, width: 0.65, depth: 0.54, height: 0.14 },
  { x: 0.7, y: 2.9, width: 0.5, depth: 0.5, height: 0.22 },
  { x: -1.75, y: 3.05, width: 0.55, depth: 0.38, height: 0.32 },
  { x: -2.8, y: 0.7, width: 0.52, depth: 0.46, height: 0.08 },
  { x: -3.0, y: -1.45, width: 0.38, depth: 0.38, height: 0.16 },
  { x: -1.15, y: -2.6, width: 0.48, depth: 0.4, height: 0.05 },
  { x: 1.2, y: -3.3, width: 0.64, depth: 0.58, height: 0.10 },
  { x: 2.9, y: -1.6, width: 0.42, depth: 0.4, height: 0.05 },
];
