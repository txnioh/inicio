// node --experimental-strip-types scripts/render-identity.mjs
// Uses the article's marker geometry. Rendering packages stay out of the app bundle.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { markerStroke } from '../src/app/writing/ink.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modules = process.env.INK_RENDER_NODE_MODULES ||
  '/Users/txnio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(path.join(modules, '../package.json'));
const sharp = require('sharp');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
GlobalFonts.registerFromPath(path.join(root, 'public/fonts/GeistVF.woff'), 'Geist');
const publicDir = path.join(root, 'public');
const out = path.join(root, 'out/identity');
await fs.mkdir(path.join(publicDir, 'identity'), { recursive: true });
await fs.mkdir(out, { recursive: true });

const ink = '#000000';
const paper = '#fdfdfc';
async function renderSocialPreview(mark) {
  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 1200, 630);
  ctx.drawImage(mark, 75, 165, 300, 300);
  ctx.fillStyle = '#77736e';
  ctx.font = '400 25px Geist';
  ctx.fillText('txnio', 434, 248);
  ctx.fillStyle = '#20201e';
  ctx.font = '500 52px Geist';
  ctx.fillText('Antonio J. Gonzalez', 430, 319);
  ctx.fillStyle = '#77736e';
  ctx.font = '400 26px Geist';
  ctx.fillText('Software, interfaces, and experiments.', 434, 371);
  const png = canvas.toBuffer('image/png');
  await fs.writeFile(path.join(publicDir, 'social-preview.png'), png);
  await sharp(png).webp({ quality: 92 }).toFile(path.join(publicDir, 'social-preview.webp'));
}

// Reuse the checked-in favicon exactly, without regenerating any identity assets.
if (process.argv.includes('--social-only')) {
  const favicon = await fs.readFile(path.join(publicDir, 'favicon.svg'));
  const mark = await sharp(favicon, { density: 2304 }).resize(1024, 1024).png().toBuffer();
  await renderSocialPreview(await loadImage(mark));
  console.log('Generated the 1200 × 630 social preview from the current favicon.');
  process.exit(0);
}
const silhouettePoints = Array.from({ length: 96 }, (_, i) => {
  const angle = i / 96 * Math.PI * 2;
  const radius = 101 + 2.5 * Math.sin(angle * 3 + .8) + 1.6 * Math.sin(angle * 7 + 2.1);
  return [128 + Math.cos(angle) * radius, 128 + Math.sin(angle) * radius * .98];
});
const silhouette = `${silhouettePoints.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')}Z`;
const fillPasses = [
  { y: 48, bend: -5, width: 54, seed: 17, opacity: .16 },
  { y: 82, bend: 4, width: 52, seed: 31, opacity: .14 },
  { y: 116, bend: -3, width: 53, seed: 47, opacity: .13 },
  { y: 150, bend: 5, width: 52, seed: 67, opacity: .14 },
  { y: 184, bend: -4, width: 54, seed: 89, opacity: .16 },
  { y: 214, bend: 3, width: 49, seed: 109, opacity: .12 },
].map(pass => {
  const points = [[18, pass.y + 2], [62, pass.y - pass.bend], [110, pass.y], [158, pass.y + pass.bend], [207, pass.y - 2], [240, pass.y]];
  return markerStroke(points, {
    width: pass.width, seed: pass.seed, color: ink, opacity: pass.opacity, core: false, samples: 110,
    wobble: .07, edge: 1.12, taperIn: .025, taperOut: .025,
    startWidth: .7, endWidth: .7, chisel: .12,
  }).map(path => `<path d="${path.d}" fill="currentColor" fill-opacity="${pass.opacity}"/>`).join('');
}).join('');
const outlinePasses = [-1.5, 1.2, 3].map((offset, i) => {
  const points = silhouettePoints.map(([x, y]) => {
    const dx = x - 128;
    const dy = y - 128;
    const length = Math.hypot(dx, dy) || 1;
    return [x + dx / length * offset, y + dy / length * offset];
  });
  const opacity = [.42, .3, .2][i];
  return markerStroke([...points, ...points.slice(0, 4)], {
    width: [9, 7, 6][i], seed: [127, 149, 173][i], color: ink, opacity, core: false, samples: 150,
    wobble: .06, edge: 1.08, taperIn: .02, taperOut: .03,
    startWidth: .7, endWidth: .5, chisel: .08,
  }).map(path => `<path d="${path.d}" fill="currentColor" fill-opacity="${opacity}"/>`).join('');
}).join('');
// The same grain and displaced edge as the article, at the mark's own scale.
const texture = `<defs><clipPath id="mark-shape"><path d="${silhouette}"/></clipPath><filter id="ink" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="2" seed="7" result="grain"/>
  <feColorMatrix in="grain" type="luminanceToAlpha" result="alpha"/>
  <feComposite in="SourceGraphic" in2="alpha" operator="arithmetic" k1="0" k2="1" k3="-.22" k4="0" result="ink"/>
  <feTurbulence type="fractalNoise" baseFrequency=".11" numOctaves="2" seed="11" result="warp"/>
  <feDisplacementMap in="ink" in2="warp" scale="1.5" xChannelSelector="R" yChannelSelector="G"/>
</filter></defs>`;
const holes = `<mask id="ink-holes">
  <rect width="256" height="256" fill="white"/>
  <path d="M82 151L104 132L122 145L145 119L165 133L184 105M104 132L93 103L119 87L145 119L154 82" fill="none" stroke="black" stroke-opacity=".13" stroke-width="1" stroke-linecap="round"/>
  <circle cx="82" cy="151" r="2.2" fill="black"/>
  <circle cx="93" cy="103" r="3.1" fill="black"/>
  <circle cx="104" cy="132" r="1.6" fill="black"/>
  <circle cx="119" cy="87" r="2.1" fill="black"/>
  <circle cx="122" cy="145" r="3.6" fill="black"/>
  <circle cx="145" cy="119" r="2.4" fill="black"/>
  <circle cx="154" cy="82" r="1.5" fill="black"/>
  <circle cx="165" cy="133" r="1.8" fill="black"/>
  <circle cx="184" cy="105" r="3.2" fill="black"/>
  <circle cx="173" cy="164" r="2.3" fill="black"/>
  <circle cx="109" cy="178" r="1.4" fill="black"/>
  <circle cx="69" cy="119" r="1.2" fill="black"/>
</mask>`;
const body = `${texture}${holes}<g mask="url(#ink-holes)" filter="url(#ink)"><path d="${silhouette}" fill="currentColor" fill-opacity=".62"/><g clip-path="url(#mark-shape)">${fillPasses}</g>${outlinePasses}</g>`;
const svg = size => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256"><title>txnio — ink circle</title><style>:root{color:${ink}}@media(prefers-color-scheme:dark){:root{color:#fff}}</style>${body}</svg>\n`;
// Original three-pass circle from 33c446e, recolored in black.
const passes = [
  { seed: 7, radius: 86, width: 37, x: 128, y: 128, start: -.32, opacity: .74 },
  { seed: 23, radius: 89, width: 31, x: 127, y: 126, start: -.17, opacity: .58 },
  { seed: 41, radius: 83, width: 29, x: 130, y: 130, start: -.46, opacity: .46 },
];
const paths = passes.map(({ radius, x, y, start, ...options }) => {
  const points = Array.from({ length: 181 }, (_, i) => {
    const angle = start + i / 180 * Math.PI * 2.06;
    const r = radius + 1.8 * Math.sin(angle * 3 + options.seed) + 1.1 * Math.sin(angle * 5);
    return [x + Math.cos(angle) * r, y + Math.sin(angle) * r * .97];
  });
  return markerStroke(points, {
    ...options, color: ink, core: false, samples: 140, wobble: .07,
    edge: 1.15, taperIn: .045, taperOut: .055, startWidth: .18, endWidth: .26, chisel: .13,
  }).map(p => `<path d="${p.d}" fill="currentColor" fill-opacity="${p.opacity}"/>`).join('');
});
// The same grain and displaced edge as the article, at the mark's own scale.
const faviconTexture = `<defs><filter id="ink" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="2" seed="7" result="grain"/>
  <feColorMatrix in="grain" type="luminanceToAlpha" result="alpha"/>
  <feComposite in="SourceGraphic" in2="alpha" operator="arithmetic" k1="0" k2="1" k3="-.22" k4="0" result="ink"/>
  <feTurbulence type="fractalNoise" baseFrequency=".11" numOctaves="2" seed="11" result="warp"/>
  <feDisplacementMap in="ink" in2="warp" scale="1.5" xChannelSelector="R" yChannelSelector="G"/>
</filter></defs>`;
const faviconBody = `${faviconTexture}<g>${paths.map(p => `<g filter="url(#ink)">${p}</g>`).join('')}</g>`;
const faviconSvg = size => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256"><title>txnio — ink circle</title><style>:root{color:#000}@media(prefers-color-scheme:dark){:root{color:#fff}}</style>${faviconBody}</svg>\n`;
const faviconOnly = process.argv.includes('--favicon-only');
if (!faviconOnly) await fs.writeFile(path.join(publicDir, 'identity/ink-circle.svg'), svg(256));
await fs.writeFile(path.join(publicDir, 'favicon.svg'), faviconSvg(32));
const master = await sharp(Buffer.from(svg(1024))).png().toBuffer();
if (!faviconOnly) await sharp(master).resize(512, 512).png().toFile(path.join(publicDir, 'identity/ink-circle.png'));
if (!faviconOnly) await sharp(master).resize(512, 512).webp({ quality: 92 }).toFile(path.join(publicDir, 'identity/ink-circle.webp'));

const faviconMaster = await sharp(Buffer.from(faviconSvg(1024))).png().toBuffer();
const pngs = await Promise.all([16, 32, 48].map(size => sharp(faviconMaster).resize(size, size).png().toBuffer()));
await fs.writeFile(path.join(publicDir, 'favicon-16x16.png'), pngs[0]);
await fs.writeFile(path.join(publicDir, 'favicon-32x32.png'), pngs[1]);
const header = Buffer.alloc(6 + pngs.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach((png, i) => {
  const entry = 6 + i * 16;
  header[entry] = header[entry + 1] = [16, 32, 48][i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await fs.writeFile(path.join(publicDir, 'favicon.ico'), Buffer.concat([header, ...pngs]));
await sharp(faviconMaster).resize(180, 180).flatten({ background: paper }).png()
  .toFile(path.join(publicDir, 'apple-touch-icon.png'));

if (faviconOnly) process.exit(0);

const mark = await loadImage(faviconMaster);
await renderSocialPreview(mark);

// A compact proof showing the same mark at tab sizes and on both browser themes.
const proof = createCanvas(800, 370);
const p = proof.getContext('2d');
p.fillStyle = paper;
p.fillRect(0, 0, 800, 370);
p.drawImage(mark, 35, 22, 270, 270);
p.fillStyle = '#20201e';
p.font = '500 18px Geist';
p.fillText('txnio · black ink', 352, 67);
p.font = '400 13px Geist';
p.fillStyle = '#77736e';
p.fillText('16 px', 354, 105);
p.fillText('32 px', 438, 105);
p.fillText('48 px', 535, 105);
for (const [i, size] of [16, 32, 48].entries()) {
  const icon = await loadImage(pngs[i]);
  p.drawImage(icon, [365, 438, 535][i], 147 - size / 2, size, size);
}
p.fillStyle = '#242423';
p.fillRect(332, 191, 295, 80);
for (const [i, size] of [16, 32, 48].entries()) {
  const icon = await loadImage(pngs[i]);
  p.drawImage(icon, [365, 438, 535][i], 231 - size / 2, size, size);
}
p.font = '400 13px Geist';
p.fillStyle = '#77736e';
p.fillText('Layered marker passes · open ink circle', 49, 331);
await fs.writeFile(path.join(out, 'identity-proof.png'), proof.toBuffer('image/png'));
console.log('Generated the ink mark, SVG/ICO/PNG favicons, touch icon and 1200 × 630 social preview.');
