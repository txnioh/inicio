export type InputSource = 'mnist' | 'rabbit' | 'draw' | 'shape' | 'text' | 'image';
export type Shape = 'circle' | 'square' | 'triangle' | 'star' | 'heart';
export const TILE_SIZE = 64;

export function makeInputTile(source: InputSource, options: {
  color: string; shape: Shape; text: string; image: ImageBitmap | null;
  drawing: number[]; pixels: number[];
}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = options.color;
  if (source === 'rabbit') rabbit(ctx);
  if (source === 'shape') {
    const { shape } = options;
    if (shape === 'square') ctx.fillRect(14, 14, 36, 36);
    if (shape === 'circle') pixelEllipse(ctx, 32, 32, 19, 19);
    if (shape === 'triangle') polygon(ctx, [[32, 10], [54, 52], [10, 52]]);
    if (shape === 'star') polygon(ctx, Array.from({ length: 10 }, (_, i) => {
      const angle = i * Math.PI / 5 - Math.PI / 2, radius = i % 2 ? 10 : 23;
      return [Math.round(32 + Math.cos(angle) * radius), Math.round(32 + Math.sin(angle) * radius)];
    }));
    if (shape === 'heart') {
      pixelEllipse(ctx, 22, 25, 12, 12); pixelEllipse(ctx, 42, 25, 12, 12);
      polygon(ctx, [[10, 27], [54, 27], [32, 54]]);
    }
  }
  if (source === 'text') {
    const text = options.text || ' ';
    const lines = text.split('\n').slice(0, 3);
    const length = Math.max(...lines.map(line => [...line].length), 1);
    const fontSize = Math.max(5, Math.min(38, Math.floor(88 / Math.sqrt(length)), Math.floor(88 / lines.length)));
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((line, i) => ctx.fillText(line, 32, 32 + (i - (lines.length - 1) / 2) * fontSize, 56));
  }
  if (source === 'image' && options.image) {
    const scale = 60 / Math.max(options.image.width, options.image.height);
    const w = options.image.width * scale, h = options.image.height * scale;
    ctx.drawImage(options.image, (64 - w) / 2, (64 - h) / 2, w, h);
  }
  if (source === 'draw' || source === 'mnist') {
    const pixels = source === 'draw' ? options.drawing : options.pixels;
    pixels.forEach((value, i) => {
      if (!value) return;
      ctx.globalAlpha = value / 255;
      ctx.fillRect(4 + i % 28 * 2, 4 + Math.floor(i / 28) * 2, 2, 2);
    });
    ctx.globalAlpha = 1;
  }
  return canvas;
}

export function digitPixels(tile: HTMLCanvasElement, invert = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 28;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(tile, 0, 0, 28, 28);
  const data = ctx.getImageData(0, 0, 28, 28).data;
  return Array.from({ length: 784 }, (_, i) => {
    const luminance = data[i * 4] * .2126 + data[i * 4 + 1] * .7152 + data[i * 4 + 2] * .0722;
    return Math.round(invert ? 255 - luminance : luminance);
  });
}

function polygon(ctx: CanvasRenderingContext2D, points: number[][]) {
  // Rasterize a polygon one integer row at a time, preserving hard pixel edges.
  for (let y = 0; y < 64; y++) {
    const hits: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a[1] > y) !== (b[1] > y)) hits.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    hits.sort((a, b) => a - b);
    for (let i = 0; i + 1 < hits.length; i += 2) ctx.fillRect(Math.ceil(hits[i]), y, Math.floor(hits[i + 1]) - Math.ceil(hits[i]) + 1, 1);
  }
}

function pixelEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  for (let j = -ry; j <= ry; j++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - j * j / (ry * ry))));
    ctx.fillRect(x - half, y + j, half * 2 + 1, 1);
  }
}

function rabbit(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#202b48'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#006b24'; polygon(ctx, [[8, 55], [15, 53], [51, 54], [56, 58], [47, 61], [15, 61]]);
  ctx.fillStyle = '#00cb36'; ctx.fillRect(12, 55, 39, 3); ctx.fillRect(20, 59, 25, 2);
  ctx.fillStyle = '#fff6ee'; pixelEllipse(ctx, 31, 43, 11, 12); pixelEllipse(ctx, 38, 33, 7, 10);
  ctx.fillStyle = '#ffe2cb'; pixelEllipse(ctx, 29, 44, 8, 10);
  ctx.fillStyle = '#fffaf0'; polygon(ctx, [[33, 31], [27, 13], [28, 7], [32, 8], [38, 27], [38, 9], [40, 4], [44, 5], [45, 12], [42, 28], [46, 29], [48, 32], [52, 34], [48, 37], [41, 38]]);
  ctx.fillStyle = '#eea0ba'; polygon(ctx, [[31, 12], [35, 25], [33, 26], [29, 13]]); ctx.fillRect(40, 10, 2, 16);
  ctx.fillStyle = '#fffaf1'; pixelEllipse(ctx, 19, 43, 4, 4); ctx.fillRect(30, 51, 15, 5); ctx.fillRect(25, 54, 20, 2);
  ctx.fillStyle = '#d9c9c4'; ctx.fillRect(28, 55, 18, 2); ctx.fillRect(36, 47, 2, 6);
  ctx.fillStyle = '#12152c'; ctx.fillRect(44, 29, 2, 2); ctx.fillRect(49, 34, 2, 1);
  ctx.fillStyle = '#f3b1c3'; ctx.fillRect(48, 33, 2, 2);
}
