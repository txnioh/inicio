// Silent 10-second showcase of the footer robot's pixel skin:
// the look hops off the wardrobe hanger, a couple of gestures, then a drag.
// node scripts/render-robot-video.mjs [--preview]
// Uses external rendering dependencies, never the website bundle.
// ROBOT_FILM_MODULES and ROBOT_FILM_URL can override the defaults.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out/robot-pixel');
const cache = path.join(out, '.render-cache');
await fs.mkdir(cache, { recursive: true });
const modules = process.env.ROBOT_FILM_MODULES || '/Users/txnio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(path.join(modules, '../package.json'));
const { chromium } = require('playwright');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const preview = process.argv.includes('--preview');
const W = 1080, H = 1080, FPS = 60, DURATION = 10;
// 6× captures stay sharp at the closest framing (180 CSS px = 1080 px).
const VIEW_W = 1440, VIEW_H = 1200, DPR = 6;
const PAPER = '#fdfdfc';
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { const p = clamp(n); return p * p * (3 - 2 * p); };
const mix = (a, b, p) => a + (b - a) * p;
const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
const sampleTimes = [0.6, 1.4, 1.6, 1.75, 2.1, 2.8, 5.0, 7.6, 9.0];
const sampleFrames = new Set(sampleTimes.map(time => Math.round(time * FPS)));
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--mute-audio'] });
const context = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: DPR, colorScheme: 'light' });
const page = await context.newPage();
let encoder;
let encoded;
try {
  // Start from the classic skin so the swap is on camera.
  await page.addInitScript(() => { try { localStorage.setItem('robot-skin', 'classic'); } catch {} });
  const epoch = new Date('2026-09-18T12:00:00Z');
  await page.clock.install({ time: epoch });
  await page.goto(process.env.ROBOT_FILM_URL || 'http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Recording-only styling: no company names or biography enter any frame.
  await page.addStyleTag({ content: `
    [data-robot-companies] { display: none !important; }
    .minimal-home-intro, .minimal-section { visibility: hidden !important; }
  ` });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // Pause early so the robot never reaches its sleep timer before recording.
  await page.clock.pauseAt(new Date(epoch.getTime() + 2_000));
  await page.clock.runFor(600);
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('.minimal-reveal-line')) for (const animation of element.getAnimations()) animation.finish();
    window.__filmAnimations = new Map();
  });
  await page.mouse.move(10, 10);
  await page.clock.runFor(600);

  const rect = async selector => page.locator(selector).first().boundingBox();
  const center = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const click = async locator => { const p = center(await locator.boundingBox()); await page.mouse.click(p.x, p.y); };
  const home = center(await rect('.minimal-footer .minimal-robot-home'));
  const hanger = center(await rect('.robot-wardrobe-hook'));
  let dragFrom;

  const pending = path.join(cache, 'robot-pixel.mp4');
  if (!preview) {
    encoder = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba',
      '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0', '-an',
      '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart',
      '-metadata', 'title=Pixel robot — Antonio J. Gonzalez', pending],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    encoded = once(encoder, 'exit');
    encoder.stdin.on('error', () => {});
  }

  for (let n = 0; n < DURATION * FPS; n++) {
    const time = n / FPS;
    await page.clock.runFor(Math.round((n + 1) * 1000 / FPS) - Math.round(n * 1000 / FPS));

    // 1.2s hover the hanger, 1.5s take the pixel look off it.
    if (n === Math.round(1.2 * FPS)) await page.mouse.move(hanger.x, hanger.y);
    if (n === Math.round(1.5 * FPS)) { await page.mouse.click(hanger.x, hanger.y); await page.mouse.move(10, 10); }
    // 3.9s and 5.3s: two taps, wink then happy.
    if (n === Math.round(3.9 * FPS)) await page.mouse.click(home.x, home.y);
    if (n === Math.round(5.3 * FPS)) await page.mouse.click(home.x, home.y);
    // 6.4s pick it up, float it around, let go at 8.2s.
    if (n === Math.round(6.4 * FPS)) { dragFrom = center(await rect('.minimal-robot-button')); await page.mouse.move(dragFrom.x, dragFrom.y); await page.mouse.down(); }
    if (dragFrom && time > 6.5 && time <= 7.3) {
      const p = smooth((time - 6.5) / .8);
      await page.mouse.move(dragFrom.x - 60 * p, dragFrom.y - 55 * p);
    }
    if (dragFrom && time > 7.3 && time <= 8.1) {
      const p = smooth((time - 7.3) / .8);
      await page.mouse.move(dragFrom.x + mix(-60, 30, p), dragFrom.y - mix(55, 70, p));
    }
    if (n === Math.round(8.2 * FPS)) { await page.mouse.up(); await page.mouse.move(10, 10); dragFrom = null; }

    // Sample native CSS/WAAPI animations at the same clock as React and Framer Motion.
    await page.evaluate(() => {
      const now = performance.now();
      for (const animation of document.getAnimations()) {
        if (!window.__filmAnimations.has(animation)) {
          window.__filmAnimations.set(animation, now - Math.max(0, Number(animation.currentTime) || 0));
        }
        const age = now - window.__filmAnimations.get(animation);
        const end = animation.effect?.getComputedTiming().endTime;
        if (Number.isFinite(end) && age >= end) {
          try { animation.finish(); } catch {}
        } else {
          animation.pause(); animation.currentTime = age;
        }
      }
      for (const animation of window.__filmAnimations.keys()) {
        if (animation.playState === 'idle') window.__filmAnimations.delete(animation);
      }
    });
    if (preview && !sampleFrames.has(n)) continue;

    // Wide on the wardrobe, close on the gestures, then room for the drag.
    const shots = [[0, 22, -6, 150], [3.2, 22, -18, 180], [3.8, 40, -18, 200], [6.1, 40, -18, 200], [6.7, -10, -40, 240]];
    let [, cx, cy, width] = shots[0];
    for (let i = 1; i < shots.length; i++) {
      const [start, x, y, w] = shots[i], previousStart = shots[i - 1][0];
      const p = smooth((time - previousStart) / (start - previousStart));
      cx = mix(cx, x, p); cy = mix(cy, y, p); width = mix(width, w, p);
    }
    const clip = { x: home.x + cx - width / 2, y: home.y + cy - width / 2, width, height: width };
    const shotImage = await loadImage(await page.screenshot({ type: 'png', animations: 'allow', scale: 'device', clip }));
    ctx.globalAlpha = 1; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(shotImage, 0, 0, W, H);
    const entrance = smooth(time / .5);
    const exit = smooth((time - 9.4) / .6);
    ctx.globalAlpha = Math.max(1 - entrance, exit); ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    if (sampleFrames.has(n)) await fs.writeFile(path.join(out, `frame-${time.toFixed(2)}.png`), await canvas.encode('png'));
    if (encoder) {
      const rgba = ctx.getImageData(0, 0, W, H).data;
      if (!encoder.stdin.write(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength))) await once(encoder.stdin, 'drain');
    }
    if (n % 90 === 0) console.log(`Rendered ${n}/${DURATION * FPS}`);
  }
  if (encoder) {
    encoder.stdin.end();
    const [code] = await encoded;
    if (code !== 0) throw new Error(`Video encoder exited ${code}`);
    const file = path.join(out, 'robot-pixel.mp4');
    await fs.rename(pending, file); console.log(file);
  }
  const sheet = createCanvas(1080, 1080), sc = sheet.getContext('2d');
  sc.fillStyle = PAPER; sc.fillRect(0, 0, 1080, 1080);
  for (let i = 0; i < sampleTimes.length; i++) {
    const sample = await loadImage(path.join(out, `frame-${sampleTimes[i].toFixed(2)}.png`));
    sc.drawImage(sample, (i % 3) * 360, Math.floor(i / 3) * 360, 360, 360);
  }
  await fs.writeFile(path.join(out, 'storyboard.png'), await sheet.encode('png'));
  console.log('Storyboard ready.');
} finally {
  if (encoder && encoder.exitCode === null && !encoder.stdin.writableEnded) { encoder.stdin.end(); encoder.kill(); }
  await context.close();
  await browser.close();
}
