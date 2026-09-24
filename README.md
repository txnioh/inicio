# inicio

Minimal portfolio for Antonio J. Gonzalez (txnio).

## Carrete

Carrete opens on Antonio’s archive. **Your photos** opens the device’s native
photo/file selector, a folder selector where supported, or a drop area. Visitors
can add up to 200 photos (40 MB per file), switch between Antonio’s collection
and their own, and clear their selection. Photos are processed in this tab only:
there are no uploads, accounts, or persistent gallery permissions. Reloading or
leaving Carrete clears the personal roll. Folder selection includes subfolders;
unsupported files and duplicates are reported without replacing the current roll.
HEIC/HEIF decoding depends on the browser; JPG, PNG, and WebP are alternatives.
Two files are decoded at a time. Local previews are capped at 512 px and viewer
images at 1600 px; object URLs are released on clearing or leaving the page.

The infinite grid assigns new cells using nearby-photo separation and recency,
with shuffled ties. Photos keep their coordinates during nearby return journeys;
a 4096-cell cache bounds memory, so sufficiently distant revisits may be rearranged.
Wheel and keyboard movement ease toward their destinations; direct dragging
retains time-based inertia. Reduced motion skips easing and inertia.
Run `node --test scripts/test-carrete-grid.mjs` with Node 24+ to check distribution,
six travel directions, small collections, return trips, and cache eviction.

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

The intro shows a small, muted percentage based on successfully decoded
archive items. Opening Frames shows the same indicator beneath the mode switch,
using the actual number of prepared samples; changing sample counts or loading
a local video uses it too. Atlas processing yields between batches so progress
can paint and cancellation stays responsive, including with cached files.

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
Carrete selects Lite or High automatically from the device and connection, with
no quality selector or saved manual override. This sets the initial sample count
(96 for Lite, 160 for High), without reducing the source video's resolution.
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

The active mark is an open circle drawn with three layered black ink strokes. Its favicon SVG is black in light mode and white in dark mode. Favicon SVG/ICO/PNG files, the Apple touch icon and the social preview use this same mark and are linked in `index.html`. Run `node scripts/render-identity.mjs --social-only` to regenerate the 1200 × 630 PNG/WebP sharing card directly from `public/favicon.svg`. The social image URL is versioned to refresh cached previews. The earlier filled-circle experiment remains in `public/identity/`.

Regenerate them with `node --experimental-strip-types scripts/render-identity.mjs` (verified with Node 24). The script uses Sharp and Canvas from the workspace runtime; `INK_RENDER_NODE_MODULES` can point to another installation. These packages are not added to the website bundle.

## Development

### Neural animation

`/neural` has two manually controlled pixel-art scenes, based on
[DotCSV's neural network video](https://x.com/DotCSV/status/2102737776219168939)
and [Scr44gr's rabbit animation](https://x.com/Scr44gr/status/2102772799248986562).
The neural scene uses an eight-second cycle with blue forward propagation,
probability bars and pink gradients flowing backward. The diffusion scene uses
a 24-second cycle with a typed caption, conditioning paths, network pulses and
ten noise-removal passes. It visually reconstructs the selected image; it is
not a text-to-image model. The default rabbit is original procedural pixel art.

Play/pause is the only playback button; Space also works outside form fields.
Both scenes start paused and play original synthesized effects synchronized to
the audio clock. Background tabs suspend playback. Inputs never change
automatically: choose a reference example, draw in the preview, select a shape,
type literal text or open a local image. Color and the digit target can also be
changed manually. Editing an input pauses and resets the scene. Double-click
the drawing preview, or focus it and press Delete, to clear it. Images stay in
the browser and are never uploaded.

The `784 → 16 → 16 → 10` ReLU/softmax network was trained from scratch on all
60,000 MNIST training images with Adam (12 epochs, seed 42). Its held-out test
accuracy is **95.30% on 9,993 images**. The reference examples replay recorded
forward passes, cross-entropy gradients and SGD updates. Custom inputs run
inference and calculate gradients in the browser using the exported weights in
`public/neural/model.json`; they do not persistently retrain the model. The
classifier recognizes digits 0–9, so shapes, photos and non-digit text are still
assigned one of those ten classes. The same seven handwritten images
as the reference were identified in MNIST: test indices 409, 1551, 996, 7435,
1374, 4068 and 1800. These seven demonstration images are excluded from held-out
evaluation before their recorded updates. All predictions are the model's actual
outputs, including the final misclassification of a 6 as a 4.
The displayed input column selects
14 of 784 real pixels. Intensities are normalized per layer, and the largest
gradients are emphasized for legibility. Each recorded update reduces its
example's cross-entropy loss. Full metrics, source indices, activations, displayed
weights and gradients are in `public/neural/training.json`.

To regenerate, install NumPy in your Python environment, download the four IDX
gzip files from the [MNIST mirror](https://github.com/cvdfoundation/mnist) into a
directory as `train-images.gz`, `train-labels.gz`, `test-images.gz`, and
`test-labels.gz`, then run:

```bash
python3 scripts/train-neural.py --data-dir /tmp/inicio-mnist
```

The demo loads its data and renderer only when `/neural` is visited.
To export the same canvas and synthesized audio as a clean 56-second, 1080p,
60 fps MP4, use Node 24+,
FFmpeg and `@napi-rs/canvas`: `node scripts/render-neural.mjs`. The default output
is `out/neural/mnist-pixel-training.mp4`; `NEURAL_CANVAS_MODULE` can point at a
bundled Canvas package without adding a website dependency.

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
