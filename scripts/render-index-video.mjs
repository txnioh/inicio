// Silent two-scene showcase: music and dragging the footer robot.
// node scripts/render-index-video.mjs [--preview]
// Uses external rendering dependencies, never the website bundle.
// INDEX_FILM_CDP, INDEX_FILM_MODULES and INDEX_FILM_URL can override the defaults.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out/index-social-v2');
const cache = path.join(out, '.render-cache');
await fs.mkdir(cache, { recursive: true });
const modules = process.env.INDEX_FILM_MODULES || '/Users/txnio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(path.join(modules, '../package.json'));
const { chromium } = require('playwright');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const preview = process.argv.includes('--preview');
const W = 1080, H = 1080, FPS = 60, DURATION = 18;
const VIEW_W = 1440, VIEW_H = 1200, DPR = 3;
const PAPER = '#fdfdfc';
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { const p = clamp(n); return p * p * (3 - 2 * p); };
const mix = (a, b, p) => a + (b - a) * p;
const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
const previous = createCanvas(W, H), previousCtx = previous.getContext('2d');
const sampleTimes = [1, 1.85, 2.05, 2.45, 4.5, 7.5, 10.5, 12.5, 16];
const sampleFrames = new Set(sampleTimes.map(time => Math.round(time * FPS)));
const browser = process.env.INDEX_FILM_CDP
  ? await chromium.connectOverCDP(process.env.INDEX_FILM_CDP)
  : await chromium.launch({ headless: true, channel: 'chrome', args: ['--mute-audio'] });
const context = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: DPR, colorScheme: 'light' });
const page = await context.newPage();
let encoder;
let encoded;
try {
  // Lock browser time for frame-accurate recording. All gestures still use the real UI.
  await page.addInitScript(() => {
    window.__filmMedia = [];
    const NativeAudio = window.Audio;
    window.Audio = new Proxy(NativeAudio, { construct(Target, args) {
      const audio = new Target(...args); window.__filmMedia.push(audio); return audio;
    } });
    const startTransition = document.startViewTransition?.bind(document);
    if (startTransition) document.startViewTransition = callback => {
      const transition = startTransition(callback);
      window.__filmTransition = transition;
      return transition;
    };
  });
  const epoch = new Date('2026-09-18T12:00:00Z');
  await page.clock.install({ time: epoch });
  await page.goto(process.env.INDEX_FILM_URL || 'http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Recording-only styling: no company names or biography enter any video frame.
  // This runs in an isolated browser context and never changes the website files.
  await page.addStyleTag({ content: `
    [data-robot-companies] { display: none !important; }
    .minimal-home-intro { visibility: hidden !important; }
    html[data-film-shot="music"] .minimal-section { visibility: hidden !important; }
  ` });
  await page.clock.pauseAt(new Date(epoch.getTime() + 60_000));
  await page.clock.runFor(100);
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('.minimal-reveal-line')) for (const animation of element.getAnimations()) animation.finish();
    window.__filmAnimations = new Map();
    document.documentElement.dataset.filmShot = 'music';
  });
  const rect = async selector => page.locator(selector).first().boundingBox();
  const center = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const moveTo = async selector => { const p = center(await rect(selector)); await page.mouse.move(p.x, p.y); return p; };
  const click = async locator => { const p = center(await locator.boundingBox()); await page.mouse.click(p.x, p.y); };
  await click(page.getByRole('button', { name: 'Play Birds Are Still', exact: true }));
  await page.waitForFunction(() => window.__filmMedia.some(audio => !audio.paused && audio.readyState >= 3));
  await page.mouse.move(10, 10);
  await page.clock.runFor(4600);
  const playerStart = await rect('[data-robot-player]');
  console.log('Recording music and drag; companies excluded.');
  let dragHome;
  let shot = -1;
  const segments = [{ start: 0, end: 9 }, { start: 9, end: DURATION }];
  const pending = path.join(cache, 'index-showcase.mp4');
  if (!preview) {
    encoder = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba',
      '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0', '-an',
      '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart',
      '-metadata', 'title=Music & a little robot — Antonio J. Gonzalez', '-metadata', 'comment=Music and dragging on the index. Company content excluded from the recording.', pending],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    encoded = once(encoder, 'exit');
    encoder.stdin.on('error', () => {});
  }

  for (let n = 0; n < DURATION * FPS; n++) {
    const time = n / FPS;
    await page.clock.runFor(Math.round((n + 1) * 1000 / FPS) - Math.round(n * 1000 / FPS));
    if (n === Math.round(1.8 * FPS)) {
      await click(page.getByRole('button', { name: 'Expand player', exact: true }));
      // Wait for the native shared-element snapshots before advancing their timeline.
      await page.evaluate(async () => {
        await window.__filmTransition?.ready;
        const now = performance.now();
        for (const animation of document.getAnimations()) {
          if (!window.__filmAnimations.has(animation)) {
            animation.pause();
            animation.currentTime = 0;
            window.__filmAnimations.set(animation, now);
          }
        }
      });
      await page.mouse.move(10, 10);
    }
    if (n === 9 * FPS) {
      await click(page.getByRole('button', { name: 'Pause Birds Are Still', exact: true }));
      await page.mouse.move(10, 10);
      await page.evaluate(() => { document.documentElement.dataset.filmShot = 'footer'; });
    }
    if (n === Math.round(11.2 * FPS)) { dragHome = await moveTo('.minimal-robot-button'); await page.mouse.down(); }
    if (time >= 11.4 && time <= 12.4 && dragHome) {
      const p = smooth((time - 11.4) / 1);
      await page.mouse.move(dragHome.x + 66 * p, dragHome.y - 50 * p);
    }
    if (time > 12.4 && time <= 13.6 && dragHome) {
      const p = smooth((time - 12.4) / 1.2);
      await page.mouse.move(dragHome.x + mix(66, 26, p), dragHome.y - mix(50, 75, p));
    }
    if (n === Math.round(14.1 * FPS)) { await page.mouse.up(); await page.mouse.move(10, 10); }
    if (n === 16 * FPS) await page.mouse.click(10, 10);

    // Sample native CSS/WAAPI animations at the same clock as React and Framer Motion.
    // This changes only the recording tab, never application files or saved settings.
    await page.evaluate(({ time }) => {
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
      if (time < 9) {
        for (const audio of window.__filmMedia) if (audio.readyState >= 3) {
          audio.playbackRate = .0625;
          audio.currentTime = time + 1;
        }
      }
    }, { time });

    const nextShot = segments.findIndex(segment => time >= segment.start && time < segment.end);
    const changed = nextShot !== shot;
    if (changed) { previousCtx.drawImage(canvas, 0, 0); shot = nextShot; }
    const local = time - segments[shot].start;
    if (preview && !sampleFrames.has(n)) continue;

    const home = center(await rect('.minimal-footer .minimal-robot-home'));
    let cx, cy, width;
    if (shot === 0) {
      const p = smooth((local - 3.8) / 4);
      cx = mix(playerStart.x + playerStart.width / 2 + 30, playerStart.x + playerStart.width - 70, p);
      // Fixed framing during expansion: the camera never jumps with layout height.
      cy = playerStart.y + 70;
      width = mix(730, 550, p);
    } else {
      cx = home.x + 24;
      cy = home.y + 12;
      width = mix(400, 350, smooth(local / 7));
    }
    const shotImage = await loadImage(await page.screenshot({ type: 'png', animations: 'allow', scale: 'device' }));
    ctx.globalAlpha = 1; ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    const zoom = W / width;
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom);
    ctx.drawImage(shotImage, -cx, -cy, VIEW_W, VIEW_H); ctx.restore();
    // Soften the edges of tight crops, keeping only the actual interface in the frame.
    {
      for (const reverse of [false, true]) {
        const fade = ctx.createLinearGradient(reverse ? W : 0, 0, reverse ? W - 80 : 80, 0);
        fade.addColorStop(0, PAPER); fade.addColorStop(1, '#fdfdfc00');
        ctx.fillStyle = fade; ctx.fillRect(reverse ? W - 80 : 0, 0, 80, H);
      }
      for (const reverse of [false, true]) {
        const fade = ctx.createLinearGradient(0, reverse ? H : 0, 0, reverse ? H - 140 : 140);
        fade.addColorStop(0, PAPER); fade.addColorStop(1, '#fdfdfc00');
        ctx.fillStyle = fade; ctx.fillRect(0, reverse ? H - 140 : 0, W, 140);
      }
    }
    if (shot > 0 && local < .65 && !preview) {
      ctx.globalAlpha = 1 - smooth(local / .65); ctx.drawImage(previous, 0, 0); ctx.globalAlpha = 1;
    }
    const entrance = smooth(time / .5);
    const exit = smooth((time - 17.2) / .8);
    ctx.globalAlpha = Math.max(1 - entrance, exit); ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    if (sampleFrames.has(n)) await fs.writeFile(path.join(out, `frame-${time.toFixed(2)}.png`), await canvas.encode('png'));
    if (n === Math.round(4.5 * FPS)) await fs.writeFile(path.join(out, 'index-cover.png'), await canvas.encode('png'));
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
    const file = path.join(out, 'index-showcase.mp4');
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
