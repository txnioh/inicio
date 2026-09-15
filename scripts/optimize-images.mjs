// Generated assets are checked in; Sharp is only needed when artwork changes.
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const modules = process.env.INK_RENDER_NODE_MODULES ||
  '/Users/txnio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(path.join(modules, '../package.json'));
const sharp = require('sharp');
const covers = ['yoshimatsu', 'gurre-lieder-prelude', 'rukiawaa-track', 'red-dragonfly',
  'on-the-level', 'funk-machine', 'antarctica-echoes-remastered'];

await mkdir('public/music/cover/optimized', { recursive: true });
for (const name of covers) {
  const source = name === 'yoshimatsu' ? 'public/yoshimatsu.webp' : `public/music/cover/${name}.webp`;
  for (const size of [144, 256]) {
    const suffix = size === 256 ? '' : `-${size}`;
    await sharp(source).resize(size, size, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 80, effort: 6 }).toFile(`public/music/cover/optimized/${name}${suffix}.webp`);
  }
}
for (const name of ['ntt-data', 'cemosa']) {
  await sharp(`public/logos/${name}.webp`).resize(48, 48, { fit: 'inside' })
    .webp({ quality: 85, effort: 6 }).toFile(`public/logos/${name}-48.webp`);
}
for (const name of ['cover-grain', 'cover-texture', 'vinyl-disc']) {
  await sharp(`public/textures/${name}.webp`).resize(256, 256)
    .webp({ quality: 82, effort: 6 }).toFile(`public/textures/${name}-256.webp`);
}
