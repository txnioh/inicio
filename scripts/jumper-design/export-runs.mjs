// Extract the downhill runs from the running dev server (npm run dev) into
// JSON for build_maps.py. Usage: node export-runs.mjs OUTPUT_DIR [BASE_URL]
// Needs Playwright (the same runtime as scripts/render-index-video.mjs).
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const modules = process.env.INDEX_FILM_MODULES || '/Users/txnio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = createRequire(path.join(modules, '../package.json'))('playwright');
const [out, base = 'http://localhost:5191'] = process.argv.slice(2);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage();
page.on('pageerror', error => console.error('page:', error.message));
await page.goto(base + '/');
for (const [id, kind, look] of [['calle', 'skate', 'minimal'], ['costa', 'longboard', 'scenic']]) {
  const run = await page.evaluate(async ([kind, look]) => {
    const { extract } = await import('/scripts/jumper-design/extract-runs.ts');
    return JSON.stringify(extract(kind, look));
  }, [kind, look]);
  await fs.writeFile(path.join(out, id + '.json'), run);
  const parsed = JSON.parse(run);
  console.log(id, (run.length / 1e6).toFixed(1) + ' MB', parsed.parts.length + ' parts', 'spawn', JSON.stringify(parsed.spawn));
}
await browser.close();
