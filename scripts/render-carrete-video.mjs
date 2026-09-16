// Silent social edit, using the actual collection, grid geometry and lens shader.
// node scripts/render-carrete-video.mjs [--preview]
// Rendering dependencies stay outside the website bundle. Requires macOS Metal,
// ffmpeg, sharp and @napi-rs/canvas (CARRETE_RENDER_NODE_MODULES can override them).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out/carrete-social');
const cache = path.join(out, '.render-cache');
await fs.mkdir(cache, { recursive: true });
const modules = process.env.CARRETE_RENDER_NODE_MODULES ||
  '/Users/txnio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(path.join(modules, '../package.json'));
const { createCanvas, loadImage, ImageData, GlobalFonts } = require('@napi-rs/canvas');
const sharp = require('sharp');
GlobalFonts.registerFromPath(path.join(root, 'public/fonts/GeistVF.woff'), 'Geist');
const settingsModule = path.join(cache, 'settings.mjs');
await fs.writeFile(settingsModule, ts.transpileModule(await fs.readFile(path.join(root, 'src/app/carrete/settings.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText);
const { defaultSettings: settings } = await import(pathToFileURL(settingsModule));
const media = JSON.parse(await fs.readFile(path.join(root, 'src/app/carrete/instagram.json'), 'utf8'));
const W = 1080, H = 1080, FPS = 60, DURATION = 18, CELL = 320;
const PAPER = '#fdfdfc';
const HERO = 5, OPEN = 7.9, OPEN_END = 8.5, CLOSE = 11.4, CLOSE_END = 11.95;
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { const p = clamp(x); return p * p * (3 - 2 * p); };
const travel = x => { const p = clamp(x); return p * p * p * (p * (p * 6 - 15) + 10); };
const mix = (a, b, p) => a + (b - a) * p;
const wrap = (n, size) => ((n % size) + size) % size;
const asset = name => path.join(root, 'public', name);
const exists = file => fs.access(file).then(() => true, () => false);

const stills = [];
const covers = [];
for (let index = 0; index < media.length; index++) {
  const item = media[index];
  let source = asset(item.src);
  if (item.type === 'video') {
    source = path.join(cache, `first-${index}.png`);
    if (!await exists(source)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', asset(item.src),
      '-frames:v', '1', source]);
  }
  stills.push(await loadImage(await sharp(source).resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true }).png().toBuffer()));
  covers.push(item.type === 'video' ? await loadImage(asset(item.poster)) : stills[index]);
}
const heroDir = path.join(cache, 'hero');
await fs.mkdir(heroDir, { recursive: true });
const lastHeroFrame = Math.round((CLOSE - OPEN) * FPS);
if (!await exists(path.join(heroDir, `${String(lastHeroFrame + 1).padStart(4, '0')}.jpg`))) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', asset(media[HERO].src), '-t', '3.55',
    '-vf', `fps=${FPS}`, '-q:v', '2', path.join(heroDir, '%04d.jpg')]);
}
const pausedHero = await loadImage(path.join(heroDir, `${String(lastHeroFrame + 1).padStart(4, '0')}.jpg`));
const lensPath = path.join(cache, 'carrete-lens');
execFileSync('swiftc', ['-O', path.join(root, 'scripts/render-carrete-lens.swift'), '-o', lensPath]);
const lens = spawn(lensPath, [String(W), String(H), String(settings.distortion / 100),
  String(settings.ripple / 100), String(settings.dispersion / 100), String(settings.sideStart / 100)],
  { stdio: ['pipe', 'pipe', 'inherit'] });
const lensFinished = once(lens, 'exit');
const reader = lens.stdout[Symbol.asyncIterator]();
let remainder = Buffer.alloc(0);
async function lensFrame(time, pixels) {
  const header = Buffer.alloc(4); header.writeFloatLE(time);
  lens.stdin.write(header);
  if (!lens.stdin.write(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength))) await once(lens.stdin, 'drain');
  const result = Buffer.alloc(W * H * 4);
  let at = 0;
  while (at < result.length) {
    if (!remainder.length) {
      const chunk = await reader.next();
      if (chunk.done) throw new Error('Lens renderer closed before delivering a frame');
      remainder = chunk.value;
    }
    const count = Math.min(result.length - at, remainder.length);
    remainder.copy(result, at, 0, count);
    at += count; remainder = remainder.subarray(count);
  }
  return new ImageData(new Uint8ClampedArray(result.buffer, result.byteOffset, result.byteLength), W, H);
}

const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
const orbit = createCanvas(W, H), orbitCtx = orbit.getContext('2d');
const warped = createCanvas(W, H), warpCtx = warped.getContext('2d');
const grid = createCanvas(W, H), gridCtx = grid.getContext('2d');
const easeOut = p => 1 - Math.pow(1 - clamp(p), 4);

async function drawIntro(time) {
  orbitCtx.fillStyle = PAPER; orbitCtx.fillRect(0, 0, W, H);
  const radiusX = Math.min(W * .48, H * .46), radiusY = Math.min(H * .32, W * .5);
  const size = Math.min(W, H) * .085 * settings.circleScale / 100;
  for (let index = 0; index < settings.orbitCount; index++) {
    const image = covers[index % covers.length];
    const p = smooth((time * 1000 - index * settings.introStagger) / settings.introDuration);
    if (!p) continue;
    const angle = index / settings.orbitCount * Math.PI * 2 + time * .075 * settings.orbitSpeed / 100 - Math.PI / 2;
    const crop = Math.min(image.width, image.height);
    orbitCtx.save(); orbitCtx.globalAlpha = p;
    orbitCtx.translate(W / 2 + Math.cos(angle) * radiusX * (.96 + .04 * p),
      H / 2 + Math.sin(angle) * radiusY * (.96 + .04 * p));
    orbitCtx.scale(.82 + .18 * p, .82 + .18 * p);
    orbitCtx.rotate(angle + Math.PI / 2);
    orbitCtx.beginPath(); orbitCtx.arc(0, 0, size / 2, 0, Math.PI * 2); orbitCtx.clip();
    orbitCtx.drawImage(image, (image.width - crop) / 2, (image.height - crop) / 2, crop, crop,
      -size / 2, -size / 2, size, size);
    orbitCtx.restore();
  }
  warpCtx.putImageData(await lensFrame(time, orbitCtx.getImageData(0, 0, W, H).data), 0, 0);
}
function title(alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = '#111';
  ctx.font = '500 30px Geist'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Carrete', W / 2, H / 2); ctx.restore();
}

function camera(time) {
  const p = travel((time - 4.15) / 3.55), q = travel((time - 12.1) / 4.5);
  return { x: 60 - 270 * p + 180 * q, y: 60 - 120 * p - 390 * q };
}
function geometry(column, row) {
  const index = wrap(column + row * 4, media.length), item = media[index];
  const variation = wrap(column * 7 + row * 11, 9);
  const size = CELL * [1.12, .56, .84, .68, 1.04, .61, .92, .74, 1.18][variation];
  const width = item.width >= item.height ? size : size * item.width / item.height;
  const height = width * item.height / item.width;
  return { index, column, row, z: variation, width, height,
    x: column * CELL + CELL / 2 + Math.sin(column * 13 + row * 7) * CELL * .25,
    y: row * CELL + CELL / 2 + Math.cos(column * 5 + row * 17) * CELL * .27,
    angle: Math.sin(column * 3 + row * 5) * 3 * Math.PI / 180 };
}
function drawTile(context, tile, image, pos, focus = 0) {
  const x = tile.x + pos.x, y = tile.y + pos.y;
  context.save();
  context.translate(x + (x - W / 2) * .045 * focus, y + (y - H / 2) * .045 * focus);
  context.rotate(tile.angle);
  context.beginPath(); context.roundRect(-tile.width / 2, -tile.height / 2, tile.width, tile.height, 10); context.clip();
  context.drawImage(image, -tile.width / 2, -tile.height / 2, tile.width, tile.height);
  context.restore();
}
async function drawGrid(time) {
  const pos = camera(time);
  const focus = time < CLOSE ? easeOut((time - OPEN) / (OPEN_END - OPEN))
    : 1 - easeOut((time - CLOSE) / (CLOSE_END - CLOSE));
  const selected = geometry(1, 1);
  const tiles = [];
  for (let row = -2; row <= 7; row++) for (let column = -3; column <= 6; column++) {
    const tile = geometry(column, row);
    if (tile.x + pos.x + tile.width < 0 || tile.x + pos.x - tile.width > W
      || tile.y + pos.y + tile.height < 0 || tile.y + pos.y - tile.height > H) continue;
    if (column !== 1 || row !== 1) tiles.push(tile);
  }
  tiles.sort((a, b) => a.z - b.z || a.row - b.row || a.column - b.column);
  gridCtx.fillStyle = PAPER; gridCtx.fillRect(0, 0, W, H);
  for (const tile of tiles) drawTile(gridCtx, tile,
    tile.index === HERO && time >= CLOSE ? pausedHero : stills[tile.index], pos, focus);
  ctx.save(); ctx.filter = `blur(${3 * focus}px)`; ctx.drawImage(grid, 0, 0); ctx.restore();
  let hero = time >= CLOSE ? pausedHero : stills[HERO];
  if (time >= OPEN && time < CLOSE) {
    const number = Math.min(lastHeroFrame, Math.floor((time - OPEN) * FPS)) + 1;
    hero = await loadImage(path.join(heroDir, `${String(number).padStart(4, '0')}.jpg`));
  }
  const expandedHeight = H - 200, expandedWidth = expandedHeight * media[HERO].width / media[HERO].height;
  drawTile(ctx, { ...selected, x: mix(selected.x + pos.x, W / 2, focus),
    y: mix(selected.y + pos.y, H / 2, focus), width: mix(selected.width, expandedWidth, focus),
    height: mix(selected.height, expandedHeight, focus), angle: selected.angle * (1 - focus) }, hero, { x: 0, y: 0 });
}
async function frame(time) {
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  if (time >= 3.6 && time < 17.25) {
    ctx.save(); ctx.globalAlpha = easeOut((time - 3.6) / (settings.fadeDuration / 1000)) * (1 - smooth((time - 16.6) / .65));
    await drawGrid(time); ctx.restore();
  }
  if (time < 3.7) {
    await drawIntro(time);
    const exit = smooth((time - 3.35) / .35);
    ctx.save(); ctx.globalAlpha = 1 - exit; ctx.filter = `blur(${8 * exit}px)`;
    const scale = 1 + .16 * exit;
    ctx.translate(W / 2, H / 2); ctx.scale(scale, scale); ctx.drawImage(warped, -W / 2, -H / 2); ctx.restore();
    title(1 - exit);
  }
  if (time >= 17) title(smooth((time - 17) / .45));
}

const samples = [1.2, 3.2, 3.85, 5.5, 7.5, 8.2, 9.7, 11.7, 13.7, 16, 17.6];
for (const time of samples) {
  await frame(time);
  await fs.writeFile(path.join(out, `frame-${time.toFixed(2)}.png`), await canvas.encode('png'));
}
await fs.copyFile(path.join(out, 'frame-3.20.png'), path.join(out, 'carrete-cover.png'));
console.log('Review frames ready.');
if (!process.argv.includes('--preview')) {
  const pending = path.join(cache, 'carrete-social.mp4');
  const video = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba',
    '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0', '-an',
    '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-profile:v', 'high', '-level:v', '4.2', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart',
    '-metadata', 'title=Carrete', '-metadata', 'comment=Carrete by txnio. Silent social edit.', pending],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const finished = once(video, 'exit');
  for (let n = 0; n < DURATION * FPS; n++) {
    await frame(n / FPS);
    const pixels = ctx.getImageData(0, 0, W, H).data;
    if (!video.stdin.write(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength))) await once(video.stdin, 'drain');
    if (n % 120 === 0) console.log(`Rendered ${n}/${DURATION * FPS}`);
  }
  video.stdin.end();
  const [code] = await finished;
  if (code !== 0) throw new Error(`ffmpeg failed: ${code}`);
  const destination = path.join(out, 'carrete-x-linkedin.mp4');
  await fs.rename(pending, destination);
  console.log(destination);
}
lens.stdin.end();
const [lensCode] = await lensFinished;
if (lensCode !== 0) throw new Error(`Lens renderer failed: ${lensCode}`);
