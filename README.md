# inicio

Minimal portfolio for Antonio J. Gonzalez (txnio).

## Writing

Read the [editorial guide](docs/writing-style.md) before drafting an article or designing its demos. It records the reference structures, writing rules, section template, and review checklist used in Inicio.

The first article, **Making SVG feel like ink**, lives at `/writing/ink`. It explains the drawing technique through interactive demos, without code blocks or source downloads. The demo uses synthetic curves rather than economic predictions.

## Identity

The purple ink circle uses three overlapping marker passes in `#918BD6`, generated with the article’s drawing geometry. The SVG master lives in `public/identity/ink-circle.svg`. Favicon SVG/ICO/PNG files, the Apple touch icon and `public/social-preview.png` are linked in `index.html`.

Regenerate them with `node --experimental-strip-types scripts/render-identity.mjs` (verified with Node 24). The script uses Sharp and Canvas from the workspace runtime; `INK_RENDER_NODE_MODULES` can point to another installation. These packages are not added to the website bundle.

## Development

```bash
npm install
npm run dev
```

## Production and performance

`npm run build` renders the homepage into `dist/index.html`, including its small
stylesheet. React hydrates that HTML in the browser. `dist/app.html` is the client
shell for the article and unknown routes; the Vercel rewrites and Vite preview
middleware select the appropriate document. A different static host needs the
same fallback to `app.html` for non-home routes.

Measure the production build with Chrome and Lighthouse:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
# In another terminal (Chrome must be installed):
npm run perf
```

The audit pins Lighthouse 13.4.1 and runs three cold loads per device, sequentially.
JSON reports and a summary go to `out/performance/`. Pass a URL to measure a
deployed build: `npm run perf -- https://txnio.com/`.
See [the measured results](docs/performance.md).

Original artwork and the original WOFF font are retained for production scripts.
Regenerate responsive covers, logos and textures with
`node scripts/optimize-images.mjs`; it uses the same Sharp runtime and
`INK_RENDER_NODE_MODULES` override as the identity renderer. The checked-in WOFF2
fonts need no build dependency. The Latin subset retains all variable weights;
the complete WOFF2 remains available for other characters. Track duration and
vinyl-label color are stored in `src/app/music.ts` so neither audio metadata nor
canvas image analysis is required on page load.
