// Node 24+, @napi-rs/canvas and FFmpeg. No browser recording or dropped frames.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { createRenderer, WIDTH, HEIGHT, CYCLE_SECONDS } from '../src/app/neural/render.ts';
import { renderSoundtrack, SAMPLE_RATE } from '../src/app/neural/sound.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require(process.env.NEURAL_CANVAS_MODULE || '@napi-rs/canvas');
const output = path.resolve(process.argv[2] || 'out/neural/mnist-pixel-training.mp4');
await mkdir(path.dirname(output), { recursive: true });
const recording = JSON.parse(await readFile('public/neural/training.json', 'utf8'));
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');
const draw = createRenderer(canvas, recording, () => createCanvas(WIDTH, HEIGHT));
const fps = 60;
const totalFrames = recording.traces.length * CYCLE_SECONDS * fps;
const samples = renderSoundtrack(recording);
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(SAMPLE_RATE, 24); wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
wav.writeUInt32LE(samples.length * 2, 40);
for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
const audioPath = path.join(path.dirname(output), 'neural-soundtrack.wav');
await writeFile(audioPath, wav);
const encoder = spawn('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${WIDTH}x${HEIGHT}`,
  '-framerate', String(fps), '-i', 'pipe:0',
  '-i', audioPath, '-vf', 'scale=1920:1080:flags=neighbor',
  '-c:a', 'aac', '-b:a', '192k', '-shortest',
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', output,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const completed = once(encoder, 'close');
for (let frame = 0; frame < totalFrames; frame++) {
  draw(frame / fps);
  const pixels = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
  if (!encoder.stdin.write(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength))) {
    await once(encoder.stdin, 'drain');
  }
  if (frame % (fps * 8) === 0) console.log(`Rendering ${frame / fps}s / ${totalFrames / fps}s`);
}
encoder.stdin.end();
const [code] = await completed;
if (code !== 0) throw new Error(`FFmpeg exited with ${code}`);
draw(22.9);
await writeFile(path.join(path.dirname(output), 'neural-preview.png'), canvas.toBuffer('image/png'));
console.log(output);
