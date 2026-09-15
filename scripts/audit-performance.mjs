import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const output = 'out/performance';
await mkdir(output, { recursive: true });
const results = [];

// Each audit launches a fresh Chrome profile. Run sequentially to avoid CPU contention.
for (const device of ['mobile', 'desktop']) {
  for (let run = 1; run <= 3; run++) {
    const file = `${output}/${device}-${run}.json`;
    execFileSync('npx', ['--yes', 'lighthouse@13.4.1', url,
      ...(device === 'desktop' ? ['--preset=desktop'] : []),
      '--chrome-flags=--headless=new --no-first-run --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows',
      '--only-categories=performance', '--output=json', `--output-path=${file}`, '--quiet',
    ], { stdio: 'inherit' });
    const report = JSON.parse(await readFile(file, 'utf8'));
    if (report.runtimeError) throw new Error(report.runtimeError.message);
    const metric = id => report.audits[id].numericValue;
    const result = { device, run, score: report.categories.performance.score * 100,
      fcpMs: metric('first-contentful-paint'), lcpMs: metric('largest-contentful-paint'),
      tbtMs: metric('total-blocking-time'), cls: metric('cumulative-layout-shift'),
      speedIndexMs: metric('speed-index'), bytes: metric('total-byte-weight') };
    results.push(result);
    console.log(result);
  }
}
await writeFile(`${output}/summary.json`, JSON.stringify({ url, measuredAt: new Date().toISOString(), results }, null, 2) + '\n');
