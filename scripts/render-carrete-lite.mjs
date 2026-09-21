// Prebuilt Lite assets avoid downloading full images just to shrink them in-browser.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const archive = JSON.parse(await readFile('src/app/carrete/instagram.json', 'utf8'));
let originalBytes = 0;
let liteBytes = 0;
for (const item of archive) {
  const input = path.join('public', item.type === 'image' ? item.src : item.poster);
  const output = input.replace(/\.webp$/, '-lite.webp');
  const maxSide = item.type === 'image' ? 640 : 480;
  const ratio = Math.min(1, maxSide / Math.max(item.width, item.height));
  execFileSync('cwebp', ['-quiet', '-q', '58', '-m', '6', '-resize',
    String(Math.round(item.width * ratio)), String(Math.round(item.height * ratio)), input, '-o', output]);
  originalBytes += (await stat(input)).size;
  liteBytes += (await stat(output)).size;
}
console.log(`Images: ${Math.round(originalBytes / 1024)} → ${Math.round(liteBytes / 1024)} KB`);

originalBytes = 0;
liteBytes = 0;
for (const item of archive.filter(item => item.type === 'video')) {
  const source = path.join('public', item.src.replace(/\.mp4$/, '-frames'));
  const manifest = JSON.parse(await readFile(path.join(source, 'index.json'), 'utf8'));
  const { columns, rows, times } = manifest;
  const capacity = columns * rows;
  const scale = Math.min(96 / Math.max(manifest.width, manifest.height),
    Math.sqrt(2_000_000 / (manifest.sheets.length * capacity * manifest.width * manifest.height)));
  const width = Math.max(2, Math.floor(manifest.width * scale / 2) * 2);
  const height = Math.max(2, Math.floor(manifest.height * scale / 2) * 2);
  const output = `${source}-lite`;
  await mkdir(output, { recursive: true });
  // Re-extract each frame so atlas resizing never blends neighbouring cells.
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join('public', item.src), '-an',
    '-vf', `scale=${width}:${height},tile=${columns}x${rows}`, '-fps_mode', 'passthrough',
    '-q:v', '8', '-start_number', '0', path.join(output, '%03d.jpg')]);
  for (const file of manifest.sheets) {
    originalBytes += (await stat(path.join(source, file))).size;
    liteBytes += (await stat(path.join(output, file))).size;
  }
  await writeFile(path.join(output, 'index.json'), JSON.stringify({ ...manifest, width, height }));
  console.log(`${path.basename(source)}: ${times.length} frames, ${width}×${height}`);
}
console.log(`Frame atlases: ${Math.round(originalBytes / 1024)} → ${Math.round(liteBytes / 1024)} KB`);
