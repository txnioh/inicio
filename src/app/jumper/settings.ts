export type SkinId = 'original' | 'sand' | 'sage' | 'silver' | 'eva';
import type { Parity } from './controller';
import type { SkateStats } from './skate';

export const motions = [
  { id: 'locomotion', name: 'Caminar' }, { id: 'jump', name: 'Saltar' },
  { id: 'gesture_hello', name: 'Hola' }, { id: 'gesture_bow', name: 'Reverencia' },
  { id: 'gesture_paw', name: 'Dar la pata' }, { id: 'gesture_salute', name: 'Saludo' },
  { id: 'dance_maze', name: 'Baile Maze' }, { id: 'dance_brazilian', name: 'Baile brasileño' },
  { id: 'dance_crab', name: 'Baile Crab' }, { id: 'dance_dream_wings', name: 'Dream Wings' },
  { id: 'claw_left', name: 'Pinza izquierda' }, { id: 'claw_right', name: 'Pinza derecha' },
];

export const skins: { id: SkinId; name: string; shell: string; limb: string }[] = [
  { id: 'original', name: 'Original', shell: '#db3b25', limb: '#bcbcbc' },
  { id: 'sand', name: 'Desierto', shell: '#d9a660', limb: '#d4c4a8' },
  { id: 'sage', name: 'Salvia', shell: '#82967b', limb: '#bdc7b4' },
  { id: 'silver', name: 'Plata', shell: '#b5bcc5', limb: '#ced2d7' },
  { id: 'eva', name: 'EVA-01', shell: '#7350ae', limb: '#9cdb46' },
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

// Metres; the route starts just beyond the robot's calibrated footprint.
export const boxes = [
  { x: 0.72, y: 0, width: 0.4, depth: 0.38, height: 0.03 },
  { x: 1.28, y: 0.18, width: 0.48, depth: 0.4, height: 0.05 },
  { x: 1.88, y: -0.14, width: 0.52, depth: 0.46, height: 0.08 },
  { x: 2.55, y: 0.10, width: 0.64, depth: 0.58, height: 0.10 },
  { x: 0.6, y: -0.78, width: 0.38, depth: 0.38, height: 0.16 },
  { x: 0.95, y: 0.85, width: 0.5, depth: 0.5, height: 0.22 },
  { x: 1.7, y: -0.85, width: 0.55, depth: 0.38, height: 0.32 },
  { x: 2.1, y: 1.1, width: 0.65, depth: 0.54, height: 0.14 },
];
