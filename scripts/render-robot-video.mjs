// Silent tour of the footer robot: the wardrobe hanger, music (it portals up
// to the player and dances), then a few of its idle animations.
// Needs `vite preview` on :4173. node scripts/render-robot-video.mjs [--preview]
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
const W = 1080, H = 1080, FPS = 60;
// 270 CSS px fill the frame 1:1 at 4×, the closest the camera gets.
const VIEW_W = 1280, VIEW_H = 1100, DPR = 4;
const PAPER = '#fdfdfc';
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { const p = clamp(n); return p * p * (3 - 2 * p); };
const mix = (a, b, p) => a + (b - a) * p;
const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
const previous = createCanvas(W, H), previousCtx = previous.getContext('2d');
// Must match the order of `activities` in FooterRobotMark.
const ACTIVITIES = ['coffee', 'paint', 'wish', 'sneeze', 'glitch'];

const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--mute-audio'] });
const context = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: DPR, colorScheme: 'light' });
const page = await context.newPage();
let encoder, encoded;
try {
  await page.addInitScript(() => {
    try { localStorage.setItem('robot-skin', 'classic'); } catch {}
    // Collect audio elements so the recording can pin their playback to the fake clock.
    window.__filmMedia = [];
    const NativeAudio = window.Audio;
    window.Audio = new Proxy(NativeAudio, { construct(Target, args) {
      const audio = new Target(...args); window.__filmMedia.push(audio); return audio;
    } });
    // Idle activities are picked with Math.random; the recording steers it.
    const random = Math.random;
    Math.random = () => window.__filmRandom ?? random();
  });
  const epoch = new Date('2026-09-18T12:00:00Z');
  await page.clock.install({ time: epoch });
  await page.goto(process.env.ROBOT_FILM_URL || 'http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Recording-only styling: no company names or biography enter any frame.
  await page.addStyleTag({ content: `
    [data-robot-companies] { display: none !important; }
    .minimal-home-intro { visibility: hidden !important; }
  ` });
  await page.clock.pauseAt(new Date(epoch.getTime() + 2_000));
  await page.clock.runFor(600);
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('.minimal-reveal-line')) for (const animation of element.getAnimations()) animation.finish();
    window.__filmAnimations = new Map();
    window.__filmRandom = .999; // No idle activity interrupts the first scene.
  });

  const rect = async selector => page.locator(selector).first().boundingBox();
  const center = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const robot = center(await rect('.minimal-robot-button'));
  const hanger = center(await rect('.robot-wardrobe-hook'));
  const player = await rect('[data-robot-player]');
  const play = center(await page.getByRole('button', { name: 'Play Birds Are Still', exact: true }).boundingBox());
  const perch = { x: player.x + player.width + 32, y: player.y + player.height / 2 };
  const whole = { x: VIEW_W / 2, y: (player.y + robot.y) / 2 };

  let cursor = { x: robot.x - 160, y: robot.y + 90 };
  const moveTo = async p => { cursor = p; await page.mouse.move(p.x, p.y); };
  await moveTo(cursor);
  const glide = async (from, to, t, t0, t1) => {
    if (t < t0 || t > t1 + .02) return;
    const p = smooth((t - t0) / (t1 - t0));
    await moveTo({ x: mix(from.x, to.x, p), y: mix(from.y, to.y, p) });
  };
  const at = (t, when) => Math.abs(t - when) < .5 / FPS;
  let musicAt = null;

  // Sample native CSS/WAAPI animations at the same clock as React and Framer Motion.
  const syncAnimations = () => page.evaluate(({ musicAt }) => {
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
    if (musicAt !== null) for (const audio of window.__filmMedia) if (audio.readyState >= 3) {
      audio.playbackRate = .0625;
      audio.currentTime = (now - musicAt) / 1000;
    }
  }, { musicAt });
  const tick = async ms => { await page.clock.runFor(ms); await syncAnimations(); };
  const expression = () => page.evaluate(() => document.querySelector('.minimal-robot-companion')?.dataset.expression);

  // One continuous take through the wardrobe and the music; each activity is a cut.
  const circle = a => ({ x: robot.x + Math.cos(a) * 110, y: robot.y + Math.sin(a) * 60 });
  const away = { x: hanger.x - 120, y: hanger.y + 110 };
  const nearPlay = { x: play.x + 40, y: play.y + 70 };
  const tour = {
    duration: 14.6, cursor: true,
    camera: () => [
      [0, robot.x, robot.y - 10, 270], [1.7, robot.x, robot.y - 10, 300],
      [2.7, (robot.x + hanger.x) / 2, robot.y - 20, 560], [4.4, (robot.x + hanger.x) / 2, robot.y - 20, 560],
      [5.2, robot.x, robot.y - 20, 300], [6.6, robot.x, robot.y - 20, 300],
      [7.8, whole.x, whole.y, 860], [9.3, whole.x, whole.y, 860],
      [10.3, perch.x - 110, perch.y + 10, 320], [12.3, perch.x - 110, perch.y + 10, 320],
      [13.0, whole.x, whole.y, 860], [14.0, robot.x, robot.y - 20, 300], [14.6, robot.x, robot.y - 20, 300],
    ],
    act: async t => {
      // The eyes follow the cursor around the robot (over the top, ending
      // underneath), then over to the hanger without touching the robot.
      if (t >= .3 && t <= 1.7) await moveTo(circle(mix(Math.PI * 1.1, Math.PI * 2.5, smooth((t - .3) / 1.4))));
      await glide(circle(Math.PI * 2.5), hanger, t, 1.75, 2.8);
      if (at(t, 3.9)) await page.mouse.click(hanger.x, hanger.y);
      await glide(hanger, away, t, 4.6, 5.6);
      // Music: the robot portals up beside the player and dances until paused.
      await glide(away, play, t, 6.8, 8.0);
      if (at(t, 8.2)) {
        await page.mouse.click(play.x, play.y);
        await page.waitForFunction(() => window.__filmMedia.some(audio => !audio.paused && audio.readyState >= 3));
        musicAt = await page.evaluate(() => performance.now());
      }
      await glide(play, nearPlay, t, 9.6, 10.4);
      await glide(nearPlay, play, t, 11.6, 12.2);
      if (at(t, 12.4)) { await page.mouse.click(play.x, play.y); musicAt = null; }
      await glide(play, { x: whole.x + 300, y: robot.y + 150 }, t, 12.8, 14.0);
    },
  };
  const activity = (id, previousId) => ({
    duration: 3, cut: true, cursor: false,
    setup: async () => {
      const options = ACTIVITIES.filter(item => item !== previousId);
      await page.evaluate(r => { window.__filmRandom = r; }, (options.indexOf(id) + .5) / options.length);
      // Off camera: nudge the cursor so it stays awake, then wait for the activity.
      await moveTo({ x: VIEW_W - 40, y: VIEW_H - 40 - (id.length % 3) * 8 });
      for (let waited = 0; (await expression()) !== `activity:${id}`; waited += 100) {
        if (waited > 20_000) throw new Error(`Activity ${id} never started`);
        await tick(100);
      }
    },
    camera: () => [[0, robot.x + 4, robot.y - 26, 270]],
    act: async () => {},
  });
  const scenes = [tour, activity('coffee', null), activity('wish', 'coffee'), activity('paint', 'wish')];
  const DURATION = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const samples = [];

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

  // A macOS-style arrow, drawn at a constant size over the footage.
  const drawCursor = (x, y) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(1.6, 1.6);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, 17); ctx.lineTo(4, 13); ctx.lineTo(7, 20); ctx.lineTo(10, 19);
    ctx.lineTo(7, 12); ctx.lineTo(12, 12); ctx.closePath();
    ctx.shadowColor = 'rgba(0, 0, 0, .25)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#111'; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
  };

  let start = 0, frame = 0;
  for (const scene of scenes) {
    if (scene.setup) await scene.setup();
    const keys = scene.camera();
    const frames = Math.round(scene.duration * FPS);
    for (let n = 0; n < frames; n++, frame++) {
      const t = n / FPS, time = start + t;
      if (n > 0) await tick(Math.round(n * 1000 / FPS) - Math.round((n - 1) * 1000 / FPS));
      else await syncAnimations();
      await scene.act(t);
      const sample = n % Math.round(FPS * 1.5) === 30;
      const last = n === frames - 1;
      if (preview && !sample && !last) continue;

      let [, cx, cy, width] = keys[0];
      for (let i = 1; i < keys.length; i++) {
        const [when, x, y, w] = keys[i];
        const p = smooth((t - keys[i - 1][0]) / (when - keys[i - 1][0]));
        cx = mix(cx, x, p); cy = mix(cy, y, p); width = mix(width, w, p);
      }
      const clip = { x: cx - width / 2, y: cy - width / 2, width, height: width };
      const shot = await loadImage(await page.screenshot({ type: 'png', animations: 'allow', scale: 'device', clip }));
      ctx.globalAlpha = 1; ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(shot, 0, 0, W, H);
      if (scene.cursor) drawCursor((cursor.x - clip.x) / width * W, (cursor.y - clip.y) / width * H);
      if (scene.cut && n < .35 * FPS) {
        ctx.globalAlpha = 1 - smooth(n / (.35 * FPS)); ctx.drawImage(previous, 0, 0); ctx.globalAlpha = 1;
      }
      const fade = Math.max(1 - smooth(time / .5), smooth((time - (DURATION - .6)) / .6));
      if (fade > 0) { ctx.globalAlpha = fade; ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      if (last) previousCtx.drawImage(canvas, 0, 0);
      if (sample) {
        const file = path.join(out, `frame-${time.toFixed(2)}.png`);
        await fs.writeFile(file, await canvas.encode('png')); samples.push(file);
      }
      if (encoder) {
        const rgba = ctx.getImageData(0, 0, W, H).data;
        if (!encoder.stdin.write(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength))) await once(encoder.stdin, 'drain');
      }
      if (frame % 120 === 0) console.log(`Rendered ${frame}/${Math.round(DURATION * FPS)}`);
    }
    start += scene.duration;
  }
  if (encoder) {
    encoder.stdin.end();
    const [code] = await encoded;
    if (code !== 0) throw new Error(`Video encoder exited ${code}`);
    const file = path.join(out, 'robot-pixel.mp4');
    await fs.rename(pending, file); console.log(file);
  }
  const cols = 4, size = 270, sheet = createCanvas(cols * size, Math.ceil(samples.length / cols) * size), sc = sheet.getContext('2d');
  sc.fillStyle = PAPER; sc.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 0; i < samples.length; i++) sc.drawImage(await loadImage(samples[i]), (i % cols) * size, Math.floor(i / cols) * size, size, size);
  await fs.writeFile(path.join(out, 'storyboard.png'), await sheet.encode('png'));
  console.log('Storyboard ready.');
} finally {
  if (encoder && encoder.exitCode === null && !encoder.stdin.writableEnded) { encoder.stdin.end(); encoder.kill(); }
  await context.close();
  await browser.close();
}
