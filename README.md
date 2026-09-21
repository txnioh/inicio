# inicio

Minimal portfolio for Antonio J. Gonzalez (txnio).

## Carrete

`/carrete` is the photography and film archive, linked from the homepage. Its
intro adapts the radial lens and RGB dispersion from VGPU Lab's `ripple-12`
study to an orbit of circular photographs, with deformation and RGB dispersion
limited to the left and right sides. The grid repeats the
collection in both directions and only mounts the tiles around the viewport.
Tap or click the intro composition to enter once loading completes. There is
no visible entry label, drag hint, or grid navigation footer on either screen size.
Drag with a mouse or touch, or use a trackpad. Keyboard
arrows pan, Home recenters, and Enter opens the central photograph. The viewer
supports left/right arrows and Escape.

The circles fade and grow into their orbit in sequence. Grid images use a short
opacity fade, with no masks, staggered delays, or per-image visibility observers.
Two extra rings of decoded tiles are prepared before the plane moves.
Pointer capture belongs to the grid from the start of a gesture, so crossing or
recycling a photograph cannot interrupt a touch drag. Taps open the viewer;
drags never open a photograph. Movement uses requestAnimationFrame and elapsed-time
inertia, following the display refresh rate rather than a fixed 60 Hz timer.
Actual frame rate depends on the browser, device, and power settings.

Photographs expand from their position while the surrounding grid recedes,
and return to their original tile on close. The **Ajustes** button is available
in both views: switch between Entrada and Grid, tune the circle entrance,
orbit and intro glass lens, or change the grid fade duration. Replay previews
the entrance without downloading the collection again or resetting the grid position.
Settings persist locally in this browser and can be restored with Restablecer;
defaults and slider limits live in `src/app/carrete/settings.ts`.

Video tiles contain real, paused players with no poster image. Opening expands
the same tile and starts its existing player (muted if the browser blocks audible
playback). Closing pauses and returns that same element, preserving its decoded
frame and playback position. The grid and playback view always retain that
player, including original black opening frames. Native controls
remain hidden on mobile and desktop; only the selected player runs.
The selected tile stays mounted during viewport changes. Repeated tiles and
tiles recycled by the virtual grid restore the saved playback position.
Focus returns to the grid without outlining the tapped photograph.

Opening a video offers a **Frames** view: a continuous space/time volume of the
clip. Its WebGL 2 renderer interpolates a 3D texture rather than drawing separated
planes. The selected time divides the solid played interval from the transparent
upcoming interval, using the continuous sampling approach in
[Video Summagator](https://video-summagator.v2space.workers.dev/). The current image
stays at its physical depth and uses the original video player when decoded;
it cannot draw through the volume in front of it.

The Tweakpane panel replaces the previous frame editor. It offers the same groups
as the reference: Video source (Carrete or a local file, Samples), Timeline (time,
play, speed and return to start), Transparent volume (depth, frame outline,
density and brightness), and Camera (automatic rotation, reset and front view).
Samples offers 96, 160 or 240 temporal samples at the same image resolution.
The site's image-quality selector is hidden in this view; it only sets the initial
sample count (96 for Lite, 160 for High), without reducing the source video's resolution.
Drag to orbit, scroll or pinch to zoom, use Left/Right to step through time,
Space/Enter or a tap to play/pause, and R to reset the camera. Mobile has a compact
play/scrub control. The **Video** switch returns to the archive player at the same
position. Local files are decoded in the browser and never uploaded.

Video and Frames share the same transparent viewer, blurred gallery background,
stage bounds, header and footer. The View Transition API blends only the video and
volume once the samples are ready; the gallery stays fully visible throughout,
without a white flash. It has an immediate fallback for reduced motion or browsers
without support. Controls start hidden; opening them overlays a white panel with
soft, blurred edges without moving the model. The volume preserves alpha so the
gallery remains visible through the unplayed interval.

Defaults are depth 4, density 0.88, brightness 1.70, with frame outline and auto
rotation off. Each entry opens fully filled in front view, then moves to 30%
filled and the angled camera (22° / 42°) over 700 ms. Playback starts from that
30% position and grows the solid interval. Clicking during the entrance skips
straight to 30%; reduced-motion preferences skip the animation too.

Run `npm run volume:carrete` (FFmpeg and ffprobe required) when videos change.
The checked-in `*-volume/` atlases provide 240 uniformly spaced samples, at up to
320 pixels on the longest edge, including the beginning and end. Smaller sample
counts select from these atlases without shrinking the images. Atlases load only
on entering Frames. Sampling can be retried or cancelled, GPU resources are
released on exit, and a selected-frame fallback remains available without WebGL 2.
Legacy `*-frames/` assets and their generator remain available but are not used by
the continuous viewer.

The collection contains **47 photos and 12 videos from [@txnioh](https://www.instagram.com/txnioh/)**:
all slides of the 22 profile publications, including six reels and six videos
inside carousels. Post permalinks, slide positions, dimensions, descriptions and embedded tiny previews are recorded
in `src/app/carrete/instagram.json`; optimized WebP files live in
`public/carrete/instagram/`, alongside MP4 clips and their WebP covers. Images retain their original aspect ratio, are at
most 1600 px on the longest edge, and load entirely from this site. There is no
Instagram embed, login requirement, or dependency on expiring Instagram CDN URLs.
To add more media, update `collection` in `src/app/carrete/media.ts`:

```ts
{ id: 'photo-01', type: 'image', src: '/carrete/photo-01.webp',
  width: 1600, height: 1067, alt: 'A description of the photograph',
  preview: '/carrete/photo-01-preview.webp', title: 'Optional title' }

{ id: 'film-01', type: 'video', src: '/carrete/film-01.mp4',
  poster: '/carrete/film-01.webp', width: 1920, height: 1080,
  alt: 'A description of the film', preview: '/carrete/film-01-preview.webp' }
```

Use the real dimensions: the grid and viewer preserve their aspect ratio.
The loader downloads and decodes photographs and the decorative orbit's covers
before enabling entry. Mounted video tiles preload metadata and decode their
initial paused frame; opening reuses the player without assigning a new source.
The orbit's covers are never used as grid or viewer video posters.
MP4 files use H.264, preserve available audio, and put metadata first for
progressive playback. Progress counts successful
pieces, not elapsed time. Tiny previews make the orbit available while the
full collection loads. Failed files can be retried or skipped explicitly.

The effect uses WebGL without an extra dependency, falls back to a 2D orbit
when unavailable, pauses in background tabs, and stops after entry. Reduced
motion uses a still composition and disables inertia and transitions.

## Writing

Read the [editorial guide](docs/writing-style.md) before drafting an article or designing its demos. It records the reference structures, writing rules, section template, and review checklist used in Inicio.

The first article, **Making SVG feel like ink**, lives at `/writing/ink`. It explains the drawing technique through interactive demos, without code blocks or source downloads. The demo uses synthetic curves rather than economic predictions.

## Identity

The ink circle uses broad, layered marker passes spread evenly across one organic silhouette, with no separate center shape or visible spiral line. Several loose outline passes finish the edge. Varied pinholes and very faint connecting lines form a small constellation in the ink. Its SVG is black in light mode and white in dark mode. The master lives in `public/identity/ink-circle.svg`. Favicon SVG/ICO/PNG files, the Apple touch icon and `public/social-preview.webp` are linked in `index.html`.

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
