export interface TrainingTrace {
  label: number;
  sampleIndex: number;
  prediction: number;
  pixels: number[];
  inputIndices: number[];
  activations: number[][];
  deltas: number[][];
  inputGradient: number[];
  weights: number[][][];
  gradients: number[][][];
  lossBefore: number;
  lossAfter: number;
}

export interface TrainingRecording {
  architecture: number[];
  epochs: number;
  testAccuracy: number;
  trainingExamples: number;
  testExamples: number;
  traces: TrainingTrace[];
}

export const CYCLE_SECONDS = 8;
export const WIDTH = 960;
export const HEIGHT = 540;
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (a: number, b: number, value: number) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const digits = [
  ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
];
type Point = { x: number; y: number };
type Edge = { from: Point; to: Point; weight: number; gradient: number; activity: number; salt: number; highlight: boolean; flow: boolean };

export function phaseAt(time: number) {
  const t = time % CYCLE_SECONDS;
  if (t < 1) return 'Entrada';
  if (t < 3.25) return 'Propagación';
  if (t < 4) return 'Predicción';
  if (t < 6.4) return 'Retropropagación';
  return 'Actualización de pesos';
}

/** A deliberately low-resolution canvas: even the lines and circles are pixels. */
export function createRenderer(canvas: HTMLCanvasElement, data: TrainingRecording, createCanvas = () => document.createElement('canvas')) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Tu navegador no permite dibujar la animación.');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  ctx.imageSmoothingEnabled = false;
  const layers: Point[][] = [
    Array.from({ length: 14 }, (_, i) => ({ x: 300, y: 45 + i * 30 + (i >= 7 ? 60 : 0) })),
    Array.from({ length: 16 }, (_, i) => ({ x: 450, y: 45 + i * 30 })),
    Array.from({ length: 16 }, (_, i) => ({ x: 600, y: 45 + i * 30 })),
    Array.from({ length: 10 }, (_, i) => ({ x: 750, y: 135 + i * 30 })),
  ];
  // Cache the static, dense connections once per actual training step.
  const scenes = data.traces.map(trace => {
    const activities = [trace.inputIndices.map(i => trace.activations[0][i]), ...trace.activations.slice(1)];
    const normalized = activities.map(values => {
      const max = Math.max(...values, .000001);
      return values.map(value => Math.sqrt(value / max));
    });
    const edges: Edge[][] = trace.weights.map((matrix, layer) => {
      const maxWeight = Math.max(...matrix.flat().map(Math.abs), .000001);
      const maxGradient = Math.max(...trace.gradients[layer].flat().map(Math.abs), .000001);
      const connections = matrix.flatMap((row, i) => row.map((weight, j) => ({
        from: layers[layer][i], to: layers[layer + 1][j],
        weight: weight / maxWeight,
        gradient: trace.gradients[layer][i][j] / maxGradient,
        activity: normalized[layer][i] * normalized[layer + 1][j],
        salt: (i * 71 + j * 31 + layer * 13) % 101 / 101,
        highlight: false,
        flow: false,
      })));
      // Emphasize the largest actual gradients; drawing every connection at full
      // intensity would hide both the pixel pulses and the network structure.
      [...connections].sort((a, b) => Math.abs(b.gradient) - Math.abs(a.gradient))
        .slice(0, layer === 1 ? 20 : 15).forEach(edge => { edge.highlight = true; });
      [...connections].sort((a, b) => b.activity * Math.abs(b.weight) - a.activity * Math.abs(a.weight))
        .slice(0, layer === 2 ? 32 : 52).forEach(edge => { edge.flow = true; });
      return connections;
    });
    const background = createCanvas();
    background.width = WIDTH;
    background.height = HEIGHT;
    const back = background.getContext('2d')!;
    back.fillStyle = '#000';
    rect(back, 0, 0, WIDTH, HEIGHT);
    for (const group of edges) for (const edge of group) {
      back.globalAlpha = .28 + Math.abs(edge.weight) * .35;
      back.fillStyle = '#283a66';
      line(back, edge.from, edge.to, 1, Math.abs(edge.weight) < .65 ? 9 : 3);
    }
    back.globalAlpha = 1;
    back.fillStyle = '#242d50';
    outline(back, 42, 180, 180, 180);
    outline(back, 864, 228, 66, 87);
    back.fillStyle = '#445071';
    for (let i = 0; i < 3; i++) rect(back, 299, 254 + i * 12, 2, 2);
    const nearInk = trace.pixels.map((_, i) => {
      const x = i % 28, y = Math.floor(i / 28);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (x + dx >= 0 && x + dx < 28 && y + dy >= 0 && y + dy < 28
          && trace.pixels[(y + dy) * 28 + x + dx] > 50) return true;
      }
      return false;
    });
    return { trace, activities: normalized, edges, background, nearInk };
  });

  return (elapsed: number) => {
    const index = Math.floor(elapsed / CYCLE_SECONDS) % scenes.length;
    const { trace, activities, edges, background, nearInk } = scenes[index];
    const t = elapsed % CYCLE_SECONDS;
    ctx.globalAlpha = 1;
    ctx.drawImage(background, 0, 0);
    const fadeOut = 1 - smooth(7.72, 8, t);
    const backward = smooth(3.95, 4.2, t) * fadeOut;
    const imageFade = 1 - smooth(7.05, 7.65, t);

    // Actual MNIST pixels, with the signed input gradient revealed on the return pass.
    const maxInputGradient = Math.max(...trace.inputGradient.map(Math.abs), .000001);
    const heat = smooth(6.1, 6.55, t) * fadeOut;
    for (let i = 0; i < 784; i++) {
      const x = 48 + i % 28 * 6;
      const y = 186 + Math.floor(i / 28) * 6;
      const value = trace.pixels[i] / 255;
      if (value > 0) {
        const reveal = ((i * 71) % 101) / 101 * .4;
        ctx.globalAlpha = value * imageFade * smooth(reveal, reveal + .2, t);
        ctx.fillStyle = '#f2f5ff';
        rect(ctx, x, y, 6, 6);
      }
      const gradient = trace.inputGradient[i] / maxInputGradient;
      if (heat > 0 && Math.abs(gradient) > .22 && value < .7 && nearInk[i]) {
        ctx.globalAlpha = Math.pow(Math.abs(gradient), .65) * heat;
        ctx.fillStyle = gradient > 0 ? '#ff407e' : '#df3771';
        rect(ctx, x + 1, y + 1, 4, 4);
      }
    }
    ctx.globalAlpha = 1;

    if (t > .75 && t < 1.45) {
      ctx.fillStyle = '#152466';
      ctx.globalAlpha = .65 * Math.sin((t - .75) / .7 * Math.PI);
      rect(ctx, 48, 186 + (t - .75) / .7 * 165, 168, 6);
    }

    // The input column displays 14 of 784 individual pixels, with an ellipsis.
    trace.inputIndices.forEach((pixel, i) => {
      const origin = { x: 51 + pixel % 28 * 6, y: 189 + Math.floor(pixel / 28) * 6 };
      const end = layers[0][i];
      const progress = (t - 1) / .55;
      if (progress > 0 && progress < 1.6) {
        ctx.fillStyle = '#3651c7';
        ctx.globalAlpha = .23 * (1 - smooth(1, 1.6, progress));
        line(ctx, origin, end);
        if (progress < 1) particle(ctx, origin, end, progress, .65, false);
        burst(ctx, origin, clamp(progress), '#80f4ff');
      }
      if (t > 6 && t < 6.6) {
        const gradient = trace.inputGradient[pixel] / maxInputGradient;
        ctx.fillStyle = '#ff4c86';
        ctx.globalAlpha = Math.sqrt(Math.abs(gradient)) * (1 - smooth(6.25, 6.6, t));
        line(ctx, origin, end);
        const p = (t - 6) / .55;
        particle(ctx, end, origin, clamp(p), .8, true);
        burst(ctx, origin, clamp(p), '#ff99c0');
      }
    });

    edges.forEach((group, layer) => {
      const forwardProgress = (t - (1.45 + layer * .62)) / .65;
      const reverseProgress = (t - (4.3 + (2 - layer) * .65)) / .65;
      for (const edge of group) {
        const activity = edge.activity * (.3 + Math.abs(edge.weight) * .7);
        const wake = smooth(0, .18, forwardProgress) * (1 - smooth(.85, 1.55, forwardProgress)) * fadeOut;
        if (wake > 0 && activity > .06 && edge.flow) {
          ctx.globalAlpha = activity * wake * .65;
          ctx.fillStyle = '#3158ec';
          line(ctx, edge.from, edge.to);
          const p = forwardProgress * 1.16 - edge.salt * .22;
          if (p > 0 && p < 1) particle(ctx, edge.from, edge.to, p, activity, false);
        }
        const strength = Math.sqrt(Math.abs(edge.gradient));
        const returnWake = smooth(0, .2, reverseProgress) * (1 - smooth(6.15, 6.65, t));
        if (returnWake > 0 && strength > .13 && edge.highlight) {
          const pink = true;
          ctx.fillStyle = '#e82e69';
          ctx.globalAlpha = strength * returnWake * .9;
          line(ctx, edge.to, edge.from, strength > .62 ? 2 : 1);
          const p = reverseProgress * 1.2 - edge.salt * .22;
          if (p > 0 && p < 1) particle(ctx, edge.to, edge.from, p, strength, pink);
        }
      }
    });

    layers.forEach((layer, l) => {
      const activationTime = 1.45 + l * .62;
      const arrival = smooth(activationTime - .2, activationTime + .15, t);
      const light = arrival * (1 - smooth(3.65, 4.15, t)) * fadeOut;
      const gradientValues = l === 0 ? trace.inputIndices.map(i => trace.inputGradient[i]) : trace.deltas[l - 1];
      const max = Math.max(...gradientValues.map(Math.abs), .000001);
      const reverseArrival = smooth(4.15 + (3 - l) * .65, 4.4 + (3 - l) * .65, t) * (1 - smooth(6.2, 6.6, t));
      layer.forEach((point, i) => {
        const activation = activities[l][i] * light;
        const gradient = gradientValues[i] / max;
        const returning = Math.sqrt(Math.abs(gradient)) * reverseArrival;
        node(ctx, point, activation, returning, true);
        const spark = (t - activationTime) / .38;
        if (spark > 0 && spark < 1 && activities[l][i] > .2) burst(ctx, point, spark, '#93e9ff');
        const reverseSpark = (t - (4.15 + (3 - l) * .65)) / .38;
        if (reverseSpark > 0 && reverseSpark < 1 && Math.abs(gradient) > .15) burst(ctx, point, reverseSpark, '#ff86ad');
      });
    });

    const result = smooth(3.2, 3.5, t) * (1 - smooth(7.1, 7.6, t));
    for (let i = 0; i < 10; i++) {
      const y = layers[3][i].y;
      const probability = trace.activations[3][i];
      const selected = i === trace.prediction;
      drawDigit(ctx, i, 773, y - 7, 2, selected && result > .1 ? '#e0f5ff' : '#6a789b', 1);
      ctx.globalAlpha = .17;
      ctx.fillStyle = '#48619a';
      rect(ctx, 792, y + 6, 50, 1);
      if (result > 0) {
        ctx.globalAlpha = result;
        ctx.fillStyle = '#2449af';
        rect(ctx, 792, y - 3, Math.max(1, probability * 47), 7);
        ctx.fillStyle = '#24c5ff';
        rect(ctx, 792, y - 2, Math.max(1, probability * 47), 3);
        if (selected) {
          ctx.fillStyle = '#f0ffff';
          rect(ctx, 791 + Math.round(probability * 47), y - 3, 2, 6);
        }
      }
      if (backward > 0) {
        ctx.globalAlpha = .28 * backward;
        ctx.fillStyle = '#445078';
        line(ctx, { x: 842, y }, { x: 897, y: 385 }, 1, 9);
        const p = (t - 3.95) / .35;
        if (p > 0 && p < 1 && (selected || i === trace.label)) particle(ctx, { x: 842, y }, { x: 897, y: 385 }, p, .9, true);
      }
    }
    if (result > 0) {
      drawDigit(ctx, trace.prediction, 877, 242, 8, '#215891', result, 2);
      drawDigit(ctx, trace.prediction, 875, 240, 8, '#acdeff', result, 2);
      ctx.globalAlpha = .65 * result;
      ctx.fillStyle = '#e3f9ff';
      rect(ctx, 875, 304, 43, 1);
    }
    if (backward > 0) {
      ctx.fillStyle = '#a33259';
      ctx.globalAlpha = backward * .8;
      line(ctx, { x: 897, y: 373 }, { x: 909, y: 385 });
      line(ctx, { x: 909, y: 385 }, { x: 897, y: 397 });
      line(ctx, { x: 897, y: 397 }, { x: 885, y: 385 });
      line(ctx, { x: 885, y: 385 }, { x: 897, y: 373 });
      rect(ctx, 894, 382, 6, 6);
    }
    ctx.globalAlpha = 1;
  };
}

export function line(ctx: CanvasRenderingContext2D, a: Point, b: Point, width = 1, spacing = 1) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= length; i += Math.max(3, spacing)) {
    rect(ctx, Math.round(a.x + dx * i / length), Math.round(a.y + dy * i / length), width, width);
  }
}

export function particle(ctx: CanvasRenderingContext2D, a: Point, b: Point, p: number, brightness: number, pink: boolean) {
  for (let trail = 5; trail >= 0; trail--) {
    const position = p - trail * .013;
    if (position < 0) continue;
    ctx.globalAlpha = (1 - trail / 6) * (.35 + brightness * .65);
    ctx.fillStyle = trail === 0 ? '#e5f4ff' : pink ? '#ff4f88' : '#4b7cff';
    rect(ctx, Math.round(a.x + (b.x - a.x) * position), Math.round(a.y + (b.y - a.y) * position), trail === 0 ? 2 : 1, 2);
  }
}

function node(ctx: CanvasRenderingContext2D, p: Point, activation: number, gradient: number, pink: boolean) {
  const rows = [[2, 4], [1, 5], [0, 6], [0, 6], [0, 6], [1, 5], [2, 4]];
  ctx.globalAlpha = 1;
  for (let y = 0; y < 7; y++) for (let x = rows[y][0]; x <= rows[y][1]; x++) {
    const border = y === 0 || y === 6 || x === rows[y][0] || x === rows[y][1];
    ctx.fillStyle = border ? '#344a7c' : '#14213d';
    rect(ctx, p.x - 9 + x * 3, p.y - 9 + y * 3, 3, 3);
    if (activation > .01) {
      ctx.globalAlpha = activation * (border ? .7 : .9);
      ctx.fillStyle = '#2e50e2';
      rect(ctx, p.x - 9 + x * 3, p.y - 9 + y * 3, 3, 3);
    }
    if (gradient > .05) {
      ctx.globalAlpha = gradient * .85;
      ctx.fillStyle = pink ? (border ? '#e93572' : '#761733') : '#579cca';
      rect(ctx, p.x - 9 + x * 3, p.y - 9 + y * 3, 3, 3);
    }
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = activation;
  ctx.fillStyle = '#6d9bff';
  rect(ctx, p.x, p.y, 3, 3);
  ctx.globalAlpha = 1;
}

function drawDigit(ctx: CanvasRenderingContext2D, digit: number, x: number, y: number, scale: number, color: string, alpha: number, gap = 0) {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  const small = ['111101101101111', '010110010010111', '110001010100111', '110001010001110', '101101111001001', '111100110001110', '011100111101111', '111001010010010', '111101111101111', '111101111001110'];
  const glyph = scale === 2 ? small[digit].match(/.{3}/g)! : digits[digit];
  if (scale === 2) scale = 3;
  glyph.forEach((row, j) => [...row].forEach((pixel, i) => {
    if (pixel === '1') rect(ctx, x + i * scale, y + j * scale, scale, scale - gap);
  }));
}

export function outline(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  rect(ctx, x, y, width, 3); rect(ctx, x, y + height - 3, width, 3);
  rect(ctx, x, y, 3, height); rect(ctx, x + width - 3, y, 3, height);
}

function burst(ctx: CanvasRenderingContext2D, p: Point, progress: number, color: string) {
  ctx.fillStyle = color;
  ctx.globalAlpha = (1 - progress) * .9;
  if (progress < .5) outline(ctx, p.x - 6, p.y - 6, 12, 12);
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.39996 + p.y;
    const radius = 8 + progress * (11 + (i * 7) % 15);
    rect(ctx, p.x + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius, 3, 3);
  }
}

// The original has a 320 × 180 pixel grid, enlarged without smoothing.
// Keep the scene coordinates convenient while snapping every mark to that grid.
export function rect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.fillRect(Math.round(x / 3) * 3, Math.round(y / 3) * 3, Math.max(3, Math.round(width / 3) * 3), Math.max(3, Math.round(height / 3) * 3));
}
