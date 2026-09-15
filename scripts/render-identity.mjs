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

const purple = '#918BD6';
const paper = '#fdfdfc';
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
    ...options, color: purple, core: false, samples: 140, wobble: .07,
    edge: 1.15, taperIn: .045, taperOut: .055, startWidth: .18, endWidth: .26, chisel: .13,
  }).map(p => `<path d="${p.d}" fill="${p.fill}" fill-opacity="${p.opacity}"/>`).join('');
});
// The same grain and displaced edge as the article, at the mark's own scale.
const texture = `<defs><filter id="ink" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="2" seed="7" result="grain"/>
  <feColorMatrix in="grain" type="luminanceToAlpha" result="alpha"/>
  <feComposite in="SourceGraphic" in2="alpha" operator="arithmetic" k1="0" k2="1" k3="-.22" k4="0" result="ink"/>
  <feTurbulence type="fractalNoise" baseFrequency=".11" numOctaves="2" seed="11" result="warp"/>
  <feDisplacementMap in="ink" in2="warp" scale="1.5" xChannelSelector="R" yChannelSelector="G"/>
</filter></defs>`;
const body = `${texture}<g>${paths.map(p => `<g filter="url(#ink)">${p}</g>`).join('')}</g>`;
const svg = size => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256"><title>txnio — purple ink circle</title>${body}</svg>\n`;
await fs.writeFile(path.join(publicDir, 'identity/ink-circle.svg'), svg(256));
await fs.writeFile(path.join(publicDir, 'favicon.svg'), svg(32));
const master = await sharp(Buffer.from(svg(1024))).png().toBuffer();
await sharp(master).resize(512, 512).png().toFile(path.join(publicDir, 'identity/ink-circle.png'));

const pngs = await Promise.all([16, 32, 48].map(size => sharp(master).resize(size, size).png().toBuffer()));
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
await sharp(master).resize(180, 180).flatten({ background: paper }).png()
  .toFile(path.join(publicDir, 'apple-touch-icon.png'));

const mark = await loadImage(master);
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
await fs.writeFile(path.join(publicDir, 'social-preview.png'), canvas.toBuffer('image/png'));

// A compact proof showing the same mark at tab sizes and on both browser themes.
const proof = createCanvas(800, 370);
const p = proof.getContext('2d');
p.fillStyle = paper;
p.fillRect(0, 0, 800, 370);
p.drawImage(mark, 35, 22, 270, 270);
p.fillStyle = '#20201e';
p.font = '500 18px Geist';
p.fillText('txnio · purple ink', 352, 67);
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
p.fillText('Three marker passes · #918BD6', 49, 331);
await fs.writeFile(path.join(out, 'identity-proof.png'), proof.toBuffer('image/png'));
console.log('Generated the ink mark, SVG/ICO/PNG favicons, touch icon and 1200 × 630 social preview.');
