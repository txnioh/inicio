// Offline motion study using the article's actual geometry and React SVG filters.
// node scripts/render-ink-video.mjs [--preview]
// Requires ffmpeg, sharp and @napi-rs/canvas. Rendering dependencies can be supplied
// through INK_RENDER_NODE_MODULES; they are not added to the website bundle.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out/ink-social');
const cache = path.join(out, '.render-cache');
await fs.mkdir(cache, { recursive: true });
const modules = process.env.INK_RENDER_NODE_MODULES ||
  '/Users/txnio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(path.join(modules, '../package.json'));
const sharp = require('sharp');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
GlobalFonts.registerFromPath(path.join(root, 'public/fonts/GeistVF.woff'), 'Geist');
sharp.concurrency(2);

for (const [source, name] of [['ink.ts', 'ink'], ['InkExample.tsx', 'InkExample']]) {
  const sourcePath = path.join(root, 'src/app/writing', source);
  const result = ts.transpileModule(await fs.readFile(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX },
    fileName: sourcePath,
  }).outputText.replace(/from '\.\/ink'/g, "from './ink.mjs'");
  await fs.writeFile(path.join(cache, `${name}.mjs`), result);
}
const ink = await import(pathToFileURL(path.join(cache, 'ink.mjs')));
const { InkFilters, InkPaths } = await import(pathToFileURL(path.join(cache, 'InkExample.mjs')));
const { curve, markerStroke, resample, ribbon, tangents, pathThrough, buildFan, segmentProgress, clamp } = ink;

const W = 1080, H = 1080, FPS = 30, DURATION = 18;
const PAPER = '#f8f6f0', TEXT = '#373b35', MUTED = '#777b72';
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const ease = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
const svgMarkup = element => renderToStaticMarkup(React.createElement('svg', null, element)).replace(/^<svg>/, '').replace(/<\/svg>$/, '');
const svgPaths = paths => svgMarkup(React.createElement(InkPaths, { paths }));
const defs = mode => svgMarkup(React.createElement(InkFilters, { id: 'ink', mode }));
const images = new Map();
async function svgImage(key, body, viewBox = '0 0 550 210', width = 1000, height = 420) {
  if (images.has(key)) return images.get(key);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${body}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const img = await loadImage(png);
  images.set(key, img);
  return img;
}
function text(value, x, y, size = 26, color = TEXT, weight = 400, align = 'left') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Geist`;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function line(x1, y1, x2, y2, alpha = 1) {
  ctx.strokeStyle = `rgba(97,108,87,${alpha})`;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function paper() {
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  // The article's graph-paper motif, quiet enough to leave the ink in front.
  for (let x = 36; x < W; x += 36) line(x, 0, x, H, .045);
  for (let y = 36; y < H; y += 36) line(0, y, W, y, .045);
  const fade = ctx.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, '#f8f6f0'); fade.addColorStop(.27, '#f8f6f000');
  fade.addColorStop(.78, '#f8f6f000'); fade.addColorStop(1, '#f8f6f0');
  ctx.fillStyle = fade; ctx.fillRect(0, 0, W, H);
}
function chrome() {
  text('txnio', 72, 82, 25, TEXT, 500);
  text('a little svg experiment', 1008, 82, 23, MUTED, 400, 'right');
  line(72, 940, 1008, 940, .16);
  text('making svg feel like ink', 72, 992, 24, TEXT);
  text('inspired by Anthropic', 1008, 992, 21, MUTED, 400, 'right');
}
function title(label, sub) {
  text(label, 72, 187, 49, TEXT, 400);
  text(sub, 74, 232, 25, MUTED);
}
function choices(labels, selected, y = 818) {
  ctx.font = '23px Geist';
  const widths = labels.map(s => ctx.measureText(s).width + 44);
  const total = widths.reduce((a,b) => a+b, 0) + (labels.length - 1) * 8;
  let x = (W - total) / 2;
  labels.forEach((label, i) => {
    if (i === selected) {
      ctx.fillStyle = '#e9e9e0';
      ctx.beginPath(); ctx.roundRect(x, y - 34, widths[i], 52, 26); ctx.fill();
    }
    text(label, x + widths[i] / 2, y, 23, i === selected ? TEXT : MUTED, 400, 'center');
    x += widths[i] + 8;
  });
}

const fan = buildFan();
const fanPieces = fan.flatMap(run => run.pieces.map((paths, i) => ({
  at: segmentProgress(i, run.pieces.length, run.key), svg: svgPaths(paths),
})));
async function fanImage(progress) {
  const visible = fanPieces.filter(p => p.at <= progress);
  const key = `fan-${visible.length}`;
  return svgImage(key, `${defs('full')}<g filter="url(#ink)">${visible.map(p => p.svg).join('')}</g>`, '0 0 550 330', 990, 594);
}
const points = resample(curve(), 70);
const center = pathThrough(points);
const outline = ribbon(points, { width: 25, seed: 7 });
const directions = tangents(points);
const guides = points.filter((_, i) => i % 5 === 0).map((p, i) => {
  const [dx, dy] = directions[i * 5];
  return `<line x1="${p[0]-dy*15}" y1="${p[1]+dx*15}" x2="${p[0]+dy*15}" y2="${p[1]-dx*15}" stroke="#8179bf" stroke-width=".8"/><circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="#8179bf"/>`;
}).join('');
const shapeBodies = [
  `<path d="${center}" stroke="#827b74" stroke-width="1.2" fill="none"/>${points.filter((_,i)=>i%5===0).map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="#8179bf"/>`).join('')}`,
  `<path d="${outline}" fill="#918bd615" stroke="#8179bf" stroke-width="1.2"/><path d="${center}" stroke="#827b74" stroke-width="1.2" fill="none" stroke-dasharray="3 4"/>${guides}`,
  `${defs('full')}<g filter="url(#ink)">${svgPaths(markerStroke(points, {width:25,seed:7}))}</g>`,
];
const shapes = await Promise.all(shapeBodies.map((s,i)=>svgImage(`shape-${i}`,s)));
const pink = svgPaths(markerStroke(curve(), { width: 52, seed: 23, color: '#C46686', core: false }));
const textures = await Promise.all(['plain','grain','full'].map((mode,i)=>svgImage(`texture-${i}`,
  mode==='plain' ? pink : `${defs(mode)}<g filter="url(#ink)">${pink}</g>`,
  '92 20 366 171', 988, 462)));
const rows = Array.from({length:6},(_,i)=> {
  const y=58+i*19;
  return markerStroke([[120+i*2,y],[280,y-3+i],[426-i*3,y+2]],{
    width:32,seed:41+i*17,color:'#629987',opacity:.72,core:false,
    taperIn:.035,taperOut:.035,startWidth:.85,endWidth:.85,
  });
});
// Render passes separately; Skia's multiply keeps the same overlap composition
// as the isolated groups in LayersDemo (and avoids renderer-specific SVG CSS).
const layers = await Promise.all(rows.map((p,i)=>svgImage(`layer-${i}`,
  `${defs('full')}<g filter="url(#ink)">${svgPaths(p)}</g>`, '80 18 390 190', 975, 475)));

async function scene(id, time, opacity = 1, shift = 0) {
  ctx.save(); ctx.globalAlpha = opacity; ctx.translate(0, shift);
  if (id === 0 || id === 4) {
    title(id === 0 ? 'making svg feel like ink' : 'a few demos to play with.',
      id === 0 ? 'a closer look at Anthropic’s marker effect' : 'shape, grain, layers, and the way it arrives.');
    const p = id === 4 ? 1 : clamp(.10 + time / 3.0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(await fanImage(p), 45, 267);
    ctx.globalCompositeOperation = 'source-over';
    text(id === 0 ? 'shape · grain · layers · timing' : 'an interactive breakdown  ↗', 540, 866, 25, MUTED, 400, 'center');
  }
  if (id === 1) {
    title('it starts with a shape.', 'one curve, seen three ways.');
    const s = time < .85 ? 0 : time < 1.8 ? 1 : 2;
    ctx.drawImage(shapes[s], 40, 338);
    choices(['Path','Outline','Ink'],s);
  }
  if (id === 2) {
    title('leave a little paper.', 'same stroke. just changing the texture.');
    const s = time < 1.1 ? 0 : time < 2.45 ? 1 : 2;
    ctx.drawImage(textures[s], 46, 307);
    choices(['Plain','Grain','Grain + warp'],s);
  }
  if (id === 3) {
    title('go over it again.', 'ink builds up where the strokes overlap.');
    const passes = Math.min(6, 1 + Math.floor(Math.max(0,time-.35)/.4));
    ctx.globalCompositeOperation='multiply';
    for(let i=0;i<passes;i++) {
      const start = i === 0 ? -1 : .35+i*.4;
      const p = ease((time-start)/.35);
      ctx.save(); ctx.beginPath(); ctx.rect(52,310,975*p,480); ctx.clip();
      ctx.drawImage(layers[i],52,310); ctx.restore();
    }
    ctx.globalCompositeOperation='source-over';
    choices([`${passes} ${passes===1?'pass':'passes'}`, 'Multiply on'],0);
  }
  ctx.restore();
}
const scenes = [
  { id:0, start:0, end:3.65 },
  { id:1, start:3.65, end:7.05 },
  { id:2, start:7.05, end:11.5 },
  { id:3, start:11.5, end:15.35 },
  { id:4, start:15.35, end:DURATION },
];
async function frame(time) {
  ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  paper();
  const current = scenes.find(s=>time>=s.start && time<s.end) || scenes.at(-1);
  const local = time-current.start;
  const duration=.28;
  if(current.id>0 && local<duration) {
    const p=ease(local/duration);
    const prev=scenes[current.id-1];
    await scene(prev.id,prev.end-prev.start,1-p,-10*p);
    await scene(current.id,local,p,10*(1-p));
  } else await scene(current.id,local);
  chrome();
}

const samples = [0.5,3.2,4.1,5.0,6.1,7.8,9.0,10.6,12.0,13.7,14.8,16.5];
for (const time of samples) {
  await frame(time);
  await fs.writeFile(path.join(out,`frame-${time.toFixed(1)}.png`), await canvas.encode('png'));
}
await frame(3.2);
await fs.writeFile(path.join(out,'ink-cover.png'),await canvas.encode('png'));
console.log('Preview frames saved.');
if (process.argv.includes('--preview')) process.exit(0);

const videoPath = path.join(out,'ink-for-x.mp4');
const ffmpeg = spawn('ffmpeg', ['-y','-loglevel','error','-f','image2pipe','-framerate',String(FPS),
  '-vcodec','png','-i','pipe:0','-an','-c:v','libx264','-preset','slow','-crf','17',
  '-pix_fmt','yuv420p','-r',String(FPS),'-movflags','+faststart',
  '-metadata','title=Making SVG feel like ink',
  '-metadata','comment=An SVG study by txnio, adapted from Anthropic. Synthetic curves, not economic data.',videoPath],
  {stdio:['pipe','inherit','inherit']});
const ended=once(ffmpeg,'exit');
for(let i=0;i<DURATION*FPS;i++) {
  await frame(i/FPS);
  if(!ffmpeg.stdin.write(await canvas.encode('png'))) await once(ffmpeg.stdin,'drain');
  if(i%60===0) console.log(`Rendered ${i}/${DURATION*FPS}`);
}
ffmpeg.stdin.end();
const [code]=await ended;
if(code!==0) throw new Error(`ffmpeg exited ${code}`);
console.log(videoPath);
