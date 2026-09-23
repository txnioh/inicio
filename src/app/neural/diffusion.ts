import { HEIGHT, WIDTH, line, outline, particle, rect } from './render';

export const DIFFUSION_SECONDS = 24;
const FIRST_PASS = 3.2;
const STEP_SECONDS = 1.65;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const hash = (n: number) => {
  let h = Math.imul(n ^ 0x45d9f3b, 0x45d9f3b);
  h = Math.imul(h ^ h >>> 16, 0x45d9f3b);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
};

/** Illustrates denoising of a supplied image, not text-to-image model inference. */
export function createDiffusionRenderer(canvas: HTMLCanvasElement, target: HTMLCanvasElement, caption: string) {
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingEnabled = false;
  const base = document.createElement('canvas');
  base.width = WIDTH; base.height = HEIGHT;
  const back = base.getContext('2d')!;
  back.fillStyle = '#000'; back.fillRect(0, 0, WIDTH, HEIGHT);
  const layers = [7, 6, 5, 4, 5, 6, 7].map((count, l) => Array.from({ length: count }, (_, i) => ({
    x: 99 + l * 72, y: 296 + (i - (count - 1) / 2) * 34,
  })));
  const edges = layers.slice(0, -1).map((layer, l) => layer.flatMap((a, i) => layers[l + 1].flatMap((b, j) =>
    Math.abs(i / layer.length - j / layers[l + 1].length) < .57 ? [{ a, b, strength: hash(i * 311 + j * 73 + l * 911) }] : [])));
  back.fillStyle = '#27375c';
  back.globalAlpha = .55;
  edges.flat().forEach(edge => line(back, edge.a, edge.b));
  back.globalAlpha = 1;
  const bypass = layers.slice(0, 3).map((layer, i) => [
    layer[0],
    { x: layer[0].x, y: 151 + i * 22 },
    { x: layers[6 - i][0].x, y: 151 + i * 22 }, layers[6 - i][0],
  ]);
  bypass.forEach(points => polyline(back, points));
  line(back, layers[6][3], { x: 608, y: 296 });
  line(back, { x: 608, y: 296 }, { x: 660, y: 296 });
  const feedback = [{ x: 783, y: 404 }, { x: 783, y: 459 }, { x: 54, y: 459 }, { x: 54, y: 296 }, layers[0][3]];
  polyline(back, feedback);
  back.fillStyle = '#243452';
  outline(back, 663, 159, 240, 243);
  back.fillStyle = '#4d7088';
  outline(back, 669, 165, 228, 231);
  outline(back, 51, 57, 555, 48);
  back.fillStyle = '#66304c';
  polyline(back, [{ x: 591, y: 105 }, { x: 591, y: 126 }, { x: 315, y: 126 }, { x: 315, y: 245 }]);

  const rgba = target.getContext('2d')!.getImageData(0, 0, 64, 64).data;
  const noise = document.createElement('canvas'); noise.width = noise.height = 64;
  const noiseCtx = noise.getContext('2d')!;
  const frame = noiseCtx.createImageData(64, 64);
  const palette = [[29, 40, 66], [74, 122, 159], [218, 227, 222], [209, 116, 141], [42, 73, 115], [146, 174, 191]];
  let lastNoiseFrame = -1;

  return (elapsed: number) => {
    const t = elapsed % DIFFUSION_SECONDS;
    ctx.globalAlpha = 1; ctx.drawImage(base, 0, 0);
    const pass = Math.max(0, (t - FIRST_PASS) / STEP_SECONDS);
    const step = Math.min(10, Math.floor(pass));
    const within = pass % 1;
    const running = t >= FIRST_PASS && pass < 10;
    // The editable input is the actual target: each of ten passes removes noise.
    const denoise = clamp((pass - .66) / 9.34);
    const tick = Math.floor(t * 24);
    if (tick !== lastNoiseFrame) {
      lastNoiseFrame = tick;
      for (let i = 0; i < 64 * 64; i++) {
        const jitter = hash(i * 73 + step * 2029);
        const color = palette[Math.floor(hash(i * 997 + tick * 37) * palette.length)];
        const mix = denoise >= 1 ? 1 : clamp((denoise - jitter * .32) / .68);
        for (let c = 0; c < 3; c++) frame.data[i * 4 + c] = rgba[i * 4 + c] * mix + color[c] * (1 - mix);
        frame.data[i * 4 + 3] = 255;
      }
      noiseCtx.putImageData(frame, 0, 0);
    }
    ctx.drawImage(noise, 0, 0, 64, 64, 675, 171, 216, 219);
    pixelText(ctx, '›', 66, 75, '#f08bb1');
    const typed = caption.slice(0, Math.floor(clamp((t - .2) / 2.3) * caption.length));
    pixelText(ctx, typed.slice(0, 39), 90, 75, '#d4d8e2');
    if (t < 2.6) {
      ctx.fillStyle = '#f08bb1';
      if (Math.floor(t * 6) % 2) rect(ctx, 90 + Math.min(39, typed.length) * 12, 74, 2, 15);
    } else {
      ctx.fillStyle = '#62cfff';
      polyline(ctx, [{ x: 573, y: 81 }, { x: 579, y: 87 }, { x: 591, y: 69 }]);
    }
    for (let l = 0; l < edges.length; l++) {
      const pulse = within * 1.6 - l * .115;
      if (running && pulse > 0 && pulse < .48) {
        edges[l].forEach(edge => {
          if (edge.strength < .38) return;
          ctx.globalAlpha = (1 - Math.min(1, pulse / .48)) * .55;
          ctx.fillStyle = '#4581bf'; line(ctx, edge.a, edge.b);
          particle(ctx, edge.a, edge.b, clamp(pulse / .3), .45 + edge.strength * .4, false);
        });
      }
    }
    layers.forEach((layer, l) => layer.forEach((p, i) => {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#2c4277';
      rect(ctx, p.x - 3, p.y - 6, 9, 15); rect(ctx, p.x - 6, p.y - 3, 15, 9);
      ctx.fillStyle = '#23365f'; rect(ctx, p.x - 3, p.y - 3, 9, 9);
      const glow = within * 1.6 - l * .115;
      if (running && glow > 0 && glow < .16 && hash(i * 41 + l * 71 + step) > .22) {
        ctx.globalAlpha = 1 - glow / .16; ctx.fillStyle = '#b8edff'; outline(ctx, p.x - 6, p.y - 6, 15, 15);
        rect(ctx, p.x, p.y, 3, 3);
      }
    }));
    if (running) {
      travel(ctx, [{ x: 591, y: 105 }, { x: 591, y: 126 }, { x: 315, y: 126 }, { x: 315, y: 245 }], clamp(within * 2), true);
      if (within > .68) travel(ctx, feedback, (within - .68) / .32, false);
      if (within > .57 && within < .8) {
        particle(ctx, { x: 537, y: 296 }, { x: 663, y: 296 }, (within - .57) / .23, 1, false);
        ctx.globalAlpha = (1 - (within - .57) / .23) * .6;
        ctx.fillStyle = '#54bddd'; outline(ctx, 663, 159, 240, 243);
      }
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i < step ? '#29c1ed' : '#293963';
      rect(ctx, 678 + i * 21, 420, 15, 6);
    }
    pixelText(ctx, `${String(step).padStart(2, '0')}/10`, 819, 438, '#8296bb');
    if (step >= 10) {
      ctx.fillStyle = '#8ee8fe'; outline(ctx, 663, 159, 240, 243);
    }
    ctx.globalAlpha = 1;
  };
}

type Point = { x: number; y: number };
function polyline(ctx: CanvasRenderingContext2D, points: Point[]) {
  for (let i = 1; i < points.length; i++) line(ctx, points[i - 1], points[i], 1, 3);
}
function travel(ctx: CanvasRenderingContext2D, points: Point[], progress: number, pink: boolean) {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let distance = progress * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i]) { particle(ctx, points[i], points[i + 1], distance / lengths[i], 1, pink); return; }
    distance -= lengths[i];
  }
}

const glyphs: Record<string, string> = {
  a:'000000111000001011111000101111', b:'100001000011110100011000111110', c:'000000111010000100001000001110',
  d:'000010000101111100011000101111', e:'000000111010001111111000001110', f:'001100100011110010000100001000',
  g:'000000111110001011110000111110', h:'100001000011110100011000110001', i:'001000000001100001000010001110',
  j:'000100000000110000100001011100', k:'100001001010100110001010010010', l:'011000010000100001000010001110',
  m:'000001101010101101011010110101', n:'000001111010001100011000110001', o:'000000111010001100011000101110',
  p:'000001111010001111101000010000', q:'000000111110001011110000100001', r:'000001011011001100001000010000',
  s:'000000111110000011100000111110', t:'010000100011110010000100000110', u:'000001000110001100011001101101',
  v:'000001000110001100010101000100', w:'000001000110001101011010101010', x:'000001000101010001000101010001',
  y:'000001000110001011110000111110', z:'000001111100010001000100011111',
  '0':'011101000110101101011000101110', '1':'001000110000100001000010001110', '2':'011101000100010001000100011111',
  '3':'111100000101110000010000111110', '4':'000100011001010111110001000010', '5':'111111000011110000010000111110',
  '6':'011101000011110100011000101110', '7':'111110000100010001000100001000', '8':'011101000101110100011000101110',
  '9':'011101000110001011110000101110', '/':'000010001000010001000100010000',
  '›':'100000100000100010001000000000', '.':'000000000000000000000110001100', '-':'000000000011111000000000000000',
};
function pixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.globalAlpha = 1; ctx.fillStyle = color;
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  [...normalized].forEach((letter, index) => {
    const glyph = glyphs[letter];
    if (!glyph) return;
    [...glyph].forEach((on, i) => { if (on === '1') ctx.fillRect(x + index * 12 + i % 5 * 2, y + Math.floor(i / 5) * 2, 2, 2); });
  });
}
