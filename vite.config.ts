import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function gitValue(format: string, fallback: string) {
  try {
    return execFileSync('git', ['log', '-1', `--format=${format}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

// p5.brush textures a watercolour fill by punching hundreds of hard-edged
// circles out of it, and its compositor then darkens every circle's rim:
// the paintings came out full of bubbles. Acuarela builds p5.brush from its
// source and adds softTexture(): on, those circles become soft spots, which
// mottle the wash the way pigment settles; off, the original circles stay,
// for the classic look. The build stops if a new p5.brush no longer matches.
const HARD_CIRCLES = `      Mix.ctx.beginPath();
      circle(x, y, radius);
      if (i % 5 !== 0) {
        Mix.ctx.fill();
      }`;
const SOFT_SPOTS = `      if (i % 5 !== 0 && soft) {
        Mix.ctx.globalAlpha = Math.min(1, alpha * 2.5);
        Mix.ctx.drawImage(softSpot(), x - radius / 2, y - radius / 2, radius, radius);
        Mix.ctx.globalAlpha = 1;
      } else if (i % 5 !== 0) {
        Mix.ctx.beginPath();
        circle(x, y, radius);
        Mix.ctx.fill();
      }`;
const SOFT_SPOT = `
let soft = true;
/** Soft spots (the default), or p5.brush's own hard circles, as fill texture. */
export function softTexture(on) {
  soft = on;
}
let spot;
// A round spot that fades out from its middle, drawn once.
function softSpot() {
  if (spot) return spot;
  spot = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(64, 64) : Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const ctx = spot.getContext("2d");
  const fade = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(.5, "rgba(0,0,0,.6)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 64, 64);
  return spot;
}
`;

const FILL_EXPORTS = 'export { fill, noFill, fillTexture, fillBleed } from "./fill/fill.js";';

function softWatercolour(): Plugin {
  const source = fileURLToPath(new URL('./node_modules/p5.brush/src/', import.meta.url));
  return {
    name: 'p5-brush-soft-watercolour',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'p5.brush/standalone') return `${source}index.standalone.js`;
    },
    transform(code, id) {
      const file = id.split('?')[0];
      if (!file.startsWith(source)) return;
      // p5.brush's own build imports its shaders as text.
      if (/\.(vert|frag)$/.test(file)) return `export default ${JSON.stringify(code)};`;
      const patch = file.endsWith('fill/fill.js') ? [HARD_CIRCLES, SOFT_SPOTS, SOFT_SPOT]
        : file.endsWith('index.shared.js') ? [FILL_EXPORTS, FILL_EXPORTS.replace('fillBleed', 'fillBleed, softTexture'), ''] : null;
      if (!patch) return;
      if (!code.includes(patch[0])) throw new Error('p5.brush changed: update the soft watercolour patch in vite.config.ts');
      return code.replace(patch[0], patch[1]) + patch[2];
    },
  };
}

export default defineConfig({
  // Built from source, so the patch above applies in development too.
  optimizeDeps: { exclude: ['p5.brush'] },
  plugins: [softWatercolour(), react(), {
    name: 'preview-client-routes',
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        const path = request.url?.split('?')[0];
        if (request.headers.accept?.includes('text/html') && path !== '/' && path !== '/index.html') {
          request.url = '/app.html';
        }
        next();
      });
    },
  }],
  define: {
    __BUILD_INFO__: JSON.stringify({
      hash: gitValue('%h', 'local'),
      message: gitValue('%s', 'Local build'),
      date: gitValue('%cI', new Date().toISOString()),
    }),
  },
});
