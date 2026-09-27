// The brush, on p5.brush (the standalone WebGL build): real watercolour
// fills with bleed and texture (Tyler Hobbs' layered polygons) — the same
// engine Aluan Wang builds inkField on. Every function here draws into
// whatever canvas `begin()` loaded.

import * as brush from 'p5.brush/standalone';
import { rgb, type Lab, type Point } from './kit';

const hex = (lab: Lab) => `#${rgb(lab).map(v => v.toString(16).padStart(2, '0')).join('')}`;

// p5.brush keeps one transform and one set of brush sizes for the whole page,
// and both compound: nothing resets the transform, and scaleBrushes()
// multiplies the current sizes. So each painting undoes the previous one's
// shift and scale before applying its own; otherwise every repaint would land
// half a sheet further up and left, with brushes several times thicker.
let origin: [number, number] = [0, 0];
let scaled = 1;

/** Loads a canvas for painting, on paper, with the origin in its top-left corner. */
export function begin(canvas: HTMLCanvasElement, width: number, height: number, seed: number, paper: Lab) {
  canvas.width = width;
  canvas.height = height;
  brush.load(canvas);
  brush.seed(seed);
  brush.noiseSeed(seed);
  // The built-in brushes are sized for small sketches.
  const scale = Math.max(width, height) / 420;
  brush.scaleBrushes(scale / scaled);
  scaled = scale;
  brush.clear(hex(paper));
  brush.translate(-origin[0] - width / 2, -origin[1] - height / 2);
  origin = [-width / 2, -height / 2];
}

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
