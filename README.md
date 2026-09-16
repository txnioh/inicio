# inicio

Minimal portfolio for Antonio J. Gonzalez (txnio).

## Carrete

`/carrete` is the photography and film archive, linked from the homepage. Its
intro adapts the radial lens and RGB dispersion from VGPU Lab's `ripple-12`
study to an orbit of circular photographs, with deformation and RGB dispersion
limited to the left and right sides. The grid repeats the
collection in both directions and only mounts the tiles around the viewport.
Drag with a mouse or touch, use a trackpad, or use the arrow controls. Keyboard
arrows pan, Home recenters, and Enter opens the central photograph. The viewer
supports left/right arrows and Escape.

The circles fade and grow into their orbit in sequence. On entry, grid tiles use
a cloudy Ghosty Reveal mask that starts immediately, with a small random
variation in its initial progress and duration. The
original PNG masks come from [Arlan's Ghosty reveal](https://www.arlan.me/vault/ghosty-reveal)
(MIT; attribution in `public/carrete/GHOSTY-LICENSE.txt`). At full softness the
mask size is 600%; the reference grid's `cubic-bezier(.33, 0, .2, 1)`
curve is available alongside Glide and the other easing options. The reveal
runs alongside the 180 ms intro exit. During exploration, photos use half the
configured reveal duration plus 0–200 ms of random variation, and a separate
random delay (0–400 ms by default). The initial mask already shows a soft edge,
so this does not create an empty loading state. An observer starts the animation
when each photo enters the viewport and resets it when it leaves, including
cached tiles revisited by dragging back. Completed tiles release their mask.
Two extra rings of decoded tiles are prepared,
and large jumps commit the next tile set before moving the plane.

The grid and viewer have no glass effects or frame-rate monitor. Photographs
open directly in the viewer. The
**Ajustes** button is available in both views: switch between Entrada and Grid,
tune the circle entrance, orbit and intro glass lens, or change the reveal duration,
random delay, softness, direction and easing. Replay buttons preview the result
without downloading the collection again or resetting the grid position.
Settings persist locally in this browser and can be restored with Restablecer;
defaults and slider limits live in `src/app/carrete/settings.ts`.

The initial collection contains **12 temporary Unsplash images**, not Antonio's
photographs. Source URLs and embedded tiny previews are recorded in
`src/app/carrete/samples.json`; optimized files live in `public/carrete/`.
Replace `collection` in `src/app/carrete/media.ts` with the final selection:

```ts
{ id: 'photo-01', type: 'image', src: '/carrete/photo-01.webp',
  width: 1600, height: 1067, alt: 'A description of the photograph',
  preview: '/carrete/photo-01-preview.webp', title: 'Optional title' }

{ id: 'film-01', type: 'video', src: '/carrete/film-01.mp4',
  poster: '/carrete/film-01.webp', width: 1920, height: 1080,
  alt: 'A description of the film', preview: '/carrete/film-01-preview.webp' }
```

Use the real dimensions: the grid and viewer preserve their aspect ratio.
The loader downloads and decodes each image before enabling entry; videos are
fully buffered, so use short, compressed clips. Progress counts successful
pieces, not elapsed time. Tiny previews make the orbit available while the
full collection loads. Failed files can be retried or skipped explicitly.
Change the intro's “Archivo de muestra” label when adding the real selection.

The effect uses WebGL without an extra dependency, falls back to a 2D orbit
when unavailable, pauses in background tabs, and stops after entry. Reduced
motion uses a still composition and disables inertia and transitions.

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
