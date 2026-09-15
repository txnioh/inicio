import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const template = await readFile('dist/index.html', 'utf8');
  const { renderHome } = await server.ssrLoadModule('/src/prerender.tsx');
  // Other routes keep the client shell, so an article never flashes the homepage.
  await writeFile('dist/app.html', template);
  let home = template.replace('<div id="root"></div>', `<div id="root">${renderHome()}</div>`);
  // The homepage stylesheet is only ~4 kB compressed: inline it to save a
  // render-blocking round trip. Client routes retain the cacheable CSS file.
  for (const [tag, href] of template.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)) {
    const css = await readFile(`dist${href}`, 'utf8');
    home = home.replace(tag, `<style>${css}</style>`);
  }
  await writeFile('dist/index.html', home);
  console.log('Prerendered homepage; app.html retained for client routes.');
} finally {
  await server.close();
}
