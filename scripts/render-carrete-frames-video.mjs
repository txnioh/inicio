// Square, silent film of Carrete's real frame-volume renderer.
// node scripts/render-carrete-frames-video.mjs [--preview]
// Optional: CARRETE_FILM_CLIP=DYcOiLDgj1H-03
// Playwright and Canvas come from the workspace runtime, outside the site bundle.
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out/carrete-frames-black');
const cache = path.join(out, '.render-cache');
await fs.mkdir(cache, { recursive: true });
const modules = process.env.CARRETE_FILM_MODULES || '/Users/txnio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(path.join(modules, '../package.json'));
const { chromium } = require('playwright');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const preview = process.argv.includes('--preview');
const W = 1080, H = 1080, FPS = 60, DURATION = 9;
const PAPER = '#000000';
const names = [process.env.CARRETE_FILM_CLIP || 'DYcOiLDgj1H-03'];
const collection = JSON.parse(await fs.readFile(path.join(root, 'src/app/carrete/instagram.json'), 'utf8'));
const clips = names.map(name => collection.find(item => item.id === `instagram-${name}`));
if (clips.some(item => item?.type !== 'video')) throw new Error('Choose an existing video ID.');
const durations = await Promise.all(clips.map(async clip => JSON.parse(await fs.readFile(path.join(root, 'public', clip.src.replace(/\.mp4$/, '-volume/index.json')), 'utf8')).duration));

// Compile the actual WebGL renderer unchanged, except for preserving its drawing
// buffer for offline capture. No application file or browser setting is changed.
const volumeSource = await fs.readFile(path.join(root, 'src/app/carrete/FrameVolume.tsx'), 'utf8');
const start = volumeSource.indexOf('const vertex =');
const end = volumeSource.indexOf('export default function FrameVolume');
if (start < 0 || end < start) throw new Error('FrameVolume source structure changed.');
const standalone = volumeSource.slice(start, end)
  .replace('alpha: true, antialias: true, depth: false', 'alpha: true, antialias: true, depth: false, preserveDrawingBuffer: true');
const volumeModule = ts.transpileModule(`${standalone}\nexport { createVolume };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const settingsModule = ts.transpileModule(await fs.readFile(path.join(root, 'src/app/carrete/frameSettings.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1080px;height:1080px;overflow:hidden;background:${PAPER}}
canvas{position:absolute;inset:0;width:1080px;height:1080px}
video{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
</style></head><body><script type="module">
import { createVolume } from '/volume.mjs';
import { defaultFrameSettings } from '/settings.mjs';
const clips = ${JSON.stringify(clips)};
const scenes = [];
for (const clip of clips) {
  const dir = clip.src.replace(/\\.mp4$/, '-volume');
  const manifest = await fetch(dir + '/index.json').then(r => r.json());
  const sheets = await Promise.all(manifest.sheets.map(async name => {
    const img = new Image(); img.src = dir + '/' + name; await img.decode(); return img;
  }));
  const sampleCount = 160;
  const scratch = document.createElement('canvas'); scratch.width=manifest.width; scratch.height=manifest.height;
  const brush=scratch.getContext('2d',{willReadFrequently:true});
  const pixels=new Uint8Array(manifest.width*manifest.height*4*sampleCount),times=[];
  for(let i=0;i<sampleCount;i++) {
    const n=Math.round(i*(manifest.times.length-1)/(sampleCount-1)),cell=n%64;
    brush.drawImage(sheets[Math.floor(n/64)],cell%8*manifest.width,Math.floor(cell/8)*manifest.height,manifest.width,manifest.height,0,0,manifest.width,manifest.height);
    pixels.set(brush.getImageData(0,0,manifest.width,manifest.height).data,i*manifest.width*manifest.height*4);
    times.push(manifest.times[n]);
  }
  const data = { ...manifest, pixels, times };
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1080;
  canvas.style.visibility = 'hidden'; document.body.append(canvas);
  const renderer = createVolume(canvas, data);
  if (!renderer) throw new Error('WebGL is required for this film.');
  const video = document.createElement('video'); video.muted = true; video.preload = 'auto';
  document.body.append(video);
  await new Promise((resolve,reject) => { video.onloadeddata=resolve; video.onerror=reject; video.src=clip.src; });
  scenes.push({ clip, canvas, renderer, data, video, lastFrame: -1 });
}
window.renderFilmFrame = async ({ shot, mediaTime, rotationX, rotationY, scale }) => {
  const scene = scenes[shot];
  for (const other of scenes) other.canvas.style.visibility = other === scene ? 'visible' : 'hidden';
  let selected = 0;
  while (selected + 1 < scene.data.times.length && scene.data.times[selected + 1] <= mediaTime + .000001) selected++;
  const mediaFrame=Math.floor(mediaTime*30);
  if (scene.lastFrame !== mediaFrame) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Video seek timed out')), 10000);
      scene.video.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once:true });
      scene.video.currentTime = mediaFrame/30 + .0001;
    });
    scene.lastFrame = mediaFrame;
  }
  scene.renderer.draw(1080, 1080, scene.clip.width / scene.clip.height,
    { ...defaultFrameSettings, rotationX, rotationY, scale }, mediaTime, scene.video);
  return { selected, count: scene.data.times.length, time:scene.video.currentTime, duration:scene.video.duration };
};
window.filmReady = true;
</script></body></html>`;

const server = createServer(async (request, response) => {
  try {
    const route = new URL(request.url, 'http://localhost').pathname;
    if (route === '/' || route === '/volume.mjs' || route === '/settings.mjs') {
      response.setHeader('Content-Type', route === '/' ? 'text/html' : 'text/javascript');
      response.end(route === '/' ? html : route === '/volume.mjs' ? volumeModule : settingsModule); return;
    }
    const publicRoot = path.join(root, 'public');
    const file = path.resolve(publicRoot, `.${decodeURIComponent(route)}`);
    if (!file.startsWith(publicRoot + path.sep)) { response.writeHead(403).end(); return; }
    const stat = await fs.stat(file);
    const mime = { '.mp4':'video/mp4', '.jpg':'image/jpeg', '.json':'application/json' }[path.extname(file)];
    if (mime) response.setHeader('Content-Type', mime);
    response.setHeader('Accept-Ranges', 'bytes');
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const lo = Number(range[1]), hi = Math.min(Number(range[2] || stat.size - 1), stat.size - 1);
      response.writeHead(206, { 'Content-Range':`bytes ${lo}-${hi}/${stat.size}`, 'Content-Length':hi-lo+1 });
      createReadStream(file, {start:lo,end:hi}).pipe(response);
    } else { response.setHeader('Content-Length', stat.size); createReadStream(file).pipe(response); }
  } catch { response.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({ headless:true, channel:'chrome', args:['--mute-audio'] });
const context = await browser.newContext({ viewport:{width:W,height:H}, deviceScaleFactor:1, colorScheme:'light' });
const page = await context.newPage();
page.on('pageerror', error => console.error(error));
const canvas = createCanvas(W,H), ctx = canvas.getContext('2d');
const sampleTimes = [.1, .35, .7, 1, 2, 3, 4, 5, 6, 7, 8, 8.6];
const sampleFrames = new Set(sampleTimes.map(t => Math.round(t * FPS)));
const clamp = value => Math.max(0, Math.min(1,value));
const smooth = value => { const p=clamp(value); return p*p*p*(p*(p*6-15)+10); };
const mix = (a,b,p) => a+(b-a)*p;
const poses = [
  [{t:0,x:0,y:0},{t:.7,x:22,y:42},{t:2.6,x:16,y:65},{t:6.2,x:10,y:115},{t:9,x:22,y:145}],
];
function poseAt(shot,time) {
  if(time<.7) {const p=clamp(time/.7),ease=p*p*(3-2*p);return {rotationX:22*ease,rotationY:42*ease};}
  const points=poses[shot];
  const end=points.findIndex((p,i)=>i>0 && p.t>=time);
  const a=points[Math.max(0,end-1)], b=points[end<0?points.length-1:end];
  const p=smooth((time-a.t)/(b.t-a.t));
  return {rotationX:mix(a.x,b.x,p),rotationY:mix(a.y,b.y,p)};
}
let encoder, encoded;
const pending = path.join(cache, 'carrete-fotogramas-black.mp4');
const observations=[];
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>window.filmReady, null, {timeout:60000});
  const depthChecks = await page.evaluate(async () => {
    const { createVolume } = await import('/volume.mjs');
    const { defaultFrameSettings } = await import('/settings.mjs');
    const results=[];
    for(const count of [96,160,240]) {
      const pixels=new Uint8Array(8*8*4*count);
      for(let i=0;i<count;i++) for(let p=0;p<64;p++) {
        const at=(i*64+p)*4;
        pixels[at]=Math.round(255*(1-i/(count-1)));pixels[at+2]=Math.round(255*i/(count-1));pixels[at+3]=255;
      }
      const data={width:8,height:8,duration:10,times:Array.from({length:count},(_,i)=>10*i/(count-1)),pixels};
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const renderer=createVolume(canvas,data),gl=canvas.getContext('webgl2');
      if(!renderer||!gl)throw new Error('WebGL 2 unavailable');
      const read=(rotationY)=>{
        renderer.draw(256,256,1,{...defaultFrameSettings,rotationX:0,rotationY,showFrame:false},7.5,null);
        const pixel=new Uint8Array(4);gl.readPixels(128,128,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];
      };
      const front=read(0),back=read(180),side=read(90);
      if(back[0]<250||back[2]>3)throw new Error('The solid played interval must occlude the current frame from behind.');
      if(side[0]<80||side[2]<80||side[3]!==255)throw new Error('Missing continuous interpolation between samples.');
      results.push({count,front,back,side});renderer.dispose();gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    for(const result of results)for(const side of ['front','back','side'])for(let c=0;c<4;c++) {
      if(Math.abs(result[side][c]-results[0][side][c])>3)throw new Error('Sample count changes volume continuity.');
    }
    return results;
  });
  await fs.writeFile(path.join(out,'depth-checks.json'),JSON.stringify(depthChecks,null,2));
  console.log('Depth and continuous sampling verified at 96, 160 and 240 samples.');
  if (!preview) {
    encoder=spawn('ffmpeg',['-y','-loglevel','error','-f','rawvideo','-pixel_format','rgba','-video_size',`${W}x${H}`,
      '-framerate',String(FPS),'-i','pipe:0','-an','-vf','scale=in_range=full:out_range=tv:out_color_matrix=bt709',
      '-c:v','libx264','-preset','slow','-crf','17','-profile:v','high','-pix_fmt','yuv420p',
      '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',
      '-metadata','title=Carrete — Fotogramas','-metadata','comment=First Carrete city film. Frame volume only, black background, no text or controls.',pending],
      {stdio:['pipe','inherit','inherit']});
    encoder.stdin.on('error',()=>{}); encoded=once(encoder,'exit');
  }
  for(let frame=0;frame<DURATION*FPS;frame++) {
    if(preview && !sampleFrames.has(frame)) continue;
    const time=frame/FPS, shot=0, local=time;
    const entry=clamp(local/.7), entryEase=entry*entry*(3-2*entry);
    const mediaTime=local<.7 ? durations[shot]*(1-.7*entryEase) : Math.min(durations[shot]-.001,durations[shot]*.3+Math.max(0,local-.8));
    const state=await page.evaluate(params=>window.renderFilmFrame(params),{
      shot,mediaTime,...poseAt(shot,local),scale:1.02,
    });
    const still=await loadImage(await page.screenshot({type:'png',animations:'allow',scale:'device'}));
    ctx.globalAlpha=1; ctx.fillStyle=PAPER;ctx.fillRect(0,0,W,H);
    ctx.drawImage(still,0,0,W,H);
    const fade=Math.max(1-smooth(time/.12),smooth((time-(DURATION-.4))/.4));
    ctx.globalAlpha=fade;ctx.fillStyle=PAPER;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;
    if(sampleFrames.has(frame)) {
      await fs.writeFile(path.join(out,`frame-${time.toFixed(2)}.png`),await canvas.encode('png'));
      observations.push({filmTime:time,clip:clips[shot].id,...state});
    }
    if(encoder) {
      const pixels=ctx.getImageData(0,0,W,H).data;
      if(!encoder.stdin.write(Buffer.from(pixels.buffer,pixels.byteOffset,pixels.byteLength))) await once(encoder.stdin,'drain');
    }
    if(frame%120===0) console.log(`Rendered ${frame}/${DURATION*FPS}`);
  }
  if(encoder) {
    encoder.stdin.end();const [code]=await encoded;if(code!==0)throw new Error(`ffmpeg exited ${code}`);
    await fs.rename(pending,path.join(out,'carrete-fotogramas-black.mp4'));
  }
  const sheet=createCanvas(1440,1080),sc=sheet.getContext('2d');sc.fillStyle=PAPER;sc.fillRect(0,0,1440,1080);
  for(const [i,time] of sampleTimes.entries()) {
    sc.drawImage(await loadImage(path.join(out,`frame-${time.toFixed(2)}.png`)),i%4*360,Math.floor(i/4)*360,360,360);
    sc.font='14px sans-serif';sc.fillStyle='#777';sc.fillText(`${time.toFixed(1)} s`,i%4*360+14,Math.floor(i/4)*360+342);
  }
  await fs.writeFile(path.join(out,'storyboard.png'),await sheet.encode('png'));
  await fs.copyFile(path.join(out,'frame-4.00.png'),path.join(out,'carrete-fotogramas-black-cover.png'));
  await fs.writeFile(path.join(out,'render.json'),JSON.stringify({width:W,height:H,fps:FPS,duration:DURATION,background:PAPER,overlays:false,clips:clips.map(c=>c.src),observations},null,2));
  console.log(preview?'Review frames ready.':path.join(out,'carrete-fotogramas-black.mp4'));
} finally {
  if(encoder && encoder.exitCode===null && !encoder.stdin.writableEnded) encoder.kill();
  await context.close();await browser.close();server.close();server.closeAllConnections();
}
