// The brush, on p5.brush (the standalone WebGL build): real watercolour
// fills with bleed and texture (Tyler Hobbs' layered polygons) — the same
// engine Aluan Wang builds inkField on. Every function here draws into
// the canvas `begin()` made.

import * as brush from 'p5.brush/standalone';
import { random, rgb, type Lab, type Point } from './kit';

const hex = (lab: Lab) => `#${rgb(lab).map(v => v.toString(16).padStart(2, '0')).join('')}`;

// p5.brush keeps one transform and one set of brush sizes for the whole page,
// and both compound: nothing resets the transform, and scaleBrushes()
// multiplies the current sizes. So each painting undoes the previous one's
// shift and scale before applying its own; otherwise every repaint would land
// half a sheet further up and left, with brushes several times thicker.
let origin: [number, number] = [0, 0];
let scaled = 1;

// Every painting gets a new canvas, and the last one's WebGL context is
// dropped. brush.load() builds a shader and three canvas-sized framebuffers
// each time and never frees the old ones, so repainting on one canvas ran a
// phone out of GPU memory after three or four paintings; and a resized canvas
// kept its old viewport, so a photo of another shape came out cut off.
let surface: HTMLCanvasElement | null = null;

/** A new canvas to paint on, on paper, with the origin in its top-left corner. */
export function begin(width: number, height: number, seed: number, paper: Lab) {
  surface?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  brush.load(surface);
  // Sets p5.brush's buffers up for this canvas now; otherwise clear() below
  // first clears the last canvas's, and WebGL warns on every painting.
  brush.render();
  brush.seed(seed);
  brush.noiseSeed(seed);
  // The built-in brushes are sized for small sketches.
  const scale = Math.max(width, height) / 420;
  brush.scaleBrushes(scale / scaled);
  scaled = scale;
  brush.clear(hex(paper));
  brush.translate(-origin[0] - width / 2, -origin[1] - height / 2);
  origin = [-width / 2, -height / 2];
  return surface;
}

/** Textures washes with p5.brush's original hard circles, or soft spots; see vite.config.ts. */
export const circles = (on: boolean) => brush.softTexture(!on);

/** Flushes what has been painted so far onto the canvas. */
export const flush = () => brush.render();

const outer = (loops: Point[][]) => loops.filter(loop => loop.length > 2);

/**
 * A watercolour wash: pigment that bleeds past the edge, granulates and dries
 * darker at the rim. With `body`, a flat layer goes down first so the wash
 * covers what's behind it, the way gouache would; with no opacity, that flat
 * layer is all there is.
 */
export function wash(loops: Point[][], color: Lab, { opacity = 150, bleed = .12, texture = .55, border = .5, body = 0 } = {}) {
  brush.noStroke();
  brush.noHatch();
  for (const loop of outer(loops)) {
    if (body > 0) {
      brush.noFill();
      brush.wash(hex(color), body);
      brush.polygon(loop);
      brush.noWash();
    }
    // Only the flat layer: fast, for small marks.
    if (opacity <= 0) continue;
    brush.fill(hex(color), opacity);
    brush.fillBleed(bleed, 'out');
    brush.fillTexture(texture, border);
    brush.polygon(loop);
  }
  brush.noFill();
}

/**
 * Flat brushes of stiff bristles for the oil sketch, one per size: dashes
 * spread across the brush, of uneven load, so a stroke is streaked by its
 * hairs. `texture` is how dry some hairs run, `load` how much paint the
 * brush lays at its edges. Each is stamped at a spacing in proportion to its
 * size, so every point takes the same few stamps. Call after begin().
 */
export function bristles({ sizes, texture, load }: { sizes: number[]; texture: number; load: number }, seed: number) {
  const { next } = random(seed);
  const hairs = Array.from({ length: 60 }, () => ({
    x: next() * 36 - 18, y: next() * 92 - 46, width: 2 + next() * 5, length: 18 + next() * 42,
    // More texture: more hairs run dry, and drier.
    tone: Math.floor(next() ** (3 - 2.4 * texture) * texture * 255),
  }));
  sizes.forEach((size, i) => brush.add(`bristle${i}`, {
    type: 'custom', weight: 1, scatter: .02, sharpness: .5, grain: 1, opacity: 30 + load * 170,
    spacing: Math.max(1, size * .15), pressure: [1.1, .9], rotate: 'natural', markerTip: false, noise: .6,
    tip: surface => {
      for (const hair of hairs) {
        surface.fill(hair.tone);
        surface.ellipse(hair.x, hair.y, hair.length, hair.width);
      }
    },
  }));
}

// Where a stroke's stamps pile up, p5.brush darkens its colour to
// c·0.85 − 0.075, like a loaded pencil. A brush stroke always piles up in
// its middle, so the colour asked for is lifted by the inverse, and comes
// out as itself; otherwise every stroke came out darker than its edges,
// outlined in a pale rim.
const loaded = (lab: Lab) => `#${rgb(lab).map(v => Math.min(255, Math.round((v / 255 + .075) / .85 * 255)).toString(16).padStart(2, '0')).join('')}`;

/** A brush stroke through points (x, y, pressure), with one of the bristle brushes. */
export function stroke(points: number[][], color: Lab, size: number, which: number) {
  brush.set(`bristle${which}`, loaded(color), size);
  brush.spline(points, .5);
}
