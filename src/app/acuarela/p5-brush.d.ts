// The part of p5.brush's standalone build this app uses; it ships no types.
declare module 'p5.brush/standalone' {
  type Colour = string;
  type Points = number[][];
  export function load(target: HTMLCanvasElement | OffscreenCanvas): void;
  export function seed(value: number): void;
  export function noiseSeed(value: number): void;
  export function scaleBrushes(scale: number): void;
  export function clear(colour?: Colour): void;
  export function render(): void;
  export function translate(x: number, y: number): void;
  export function noStroke(): void;
  export function fill(colour: Colour, opacity?: number): void;
  export function noFill(): void;
  export function fillBleed(strength: number, direction?: 'in' | 'out', angle?: number): void;
  export function fillTexture(texture: number, border: number, scatter?: boolean): void;
  export function wash(colour: Colour, opacity?: number): void;
  export function noWash(): void;
  export function noHatch(): void;
  export function polygon(points: Points): void;
  type Tip = { fill(value: number): void; ellipse(x: number, y: number, width: number, height: number): void };
  export function add(name: string, params: {
    type: 'custom'; weight: number; scatter: number; sharpness: number; grain: number; opacity: number;
    spacing: number; pressure: [number, number]; rotate: 'natural' | 'random' | 'none'; markerTip: boolean; noise: number;
    tip: (surface: Tip) => void;
  }): void;
  export function set(name: string, colour: Colour, weight?: number): void;
  export function spline(points: Points, curvature?: number): void;
}
