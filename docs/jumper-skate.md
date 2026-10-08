# Jumper skate

`/jumper/skate` puts Jumper on a skateboard at the top of a downhill road. The
robot runs its original policies, unchanged. Nothing pushes the robot or the
board: speed comes from the slope, steering from the trucks, and the only
control is where Jumper puts its weight on the deck. There is no jumping.

## The runs

Each board has its own run. The skate weaves through the obstacle road below,
and the longboard carves a coast road (see *The coast road*). Both share the
`Course` interface in `track.ts`: a road centre line, a pilot line, a finish,
physics and drawing.

## The obstacle road (skate)

Drawn minimal, in Inicio's palette: off-white volumes with fine edges, like the
Jumper playground's boxes, a pale road, faint paint and a single black finish
line under a thin black gate. The only colour is the cones, the board and
Jumper.

About 50 m of road, scaled to Jumper (it stands ~18 cm tall). It runs over a
6 m embankment with grass verges, curbs and trees:

1. Start ramp (5°) with a stopper boom at the front wheels; Enter releases it.
2. A 7° drop that builds about 2 m/s.
3. Two loose cones (1.5°).
4. An island splitting the road into a left and a right line (1°).
5. A cone slalom, 5.5 m spacing (0.9°).
6. A bollard chicane: the first row leaves the left open, the second the right (1°).
7. Finish line and arch, then a 4° uphill run-out and an end wall.

The spacing follows the board. At about 2.5 m/s, full lean turns it about 16°/s
after half a second, so moving 1 m sideways takes 4–5 m of road. The slopes
hold it near that speed: about 1° balances its rolling losses. Jumper rides
stably up to at least 4.5 m/s on the flat.

The road collides as one box per chord of its profile (6 m wide, so the verges
are solid too), plus curbs, the island, bollards and an end wall. Cones are
free bodies: 12 cm street cones with a square foot, 80 g. They meet the deck,
the robot and the road, but not the wheels. A cone the nose knocks flat goes under the board instead of wedging
the trucks like a chock, which stopped the board dead in testing.

## The boards

Both are as wide as Jumper needs. It stands sideways like a skater, and its
claws reach 19 cm forward while its rear feet reach 14 cm back. Proportions
otherwise follow real boards. A popsicle skate deck is 28–32" long and
7.5–8.75" wide, with symmetric kicked nose and tail, concave and a 13–15"
wheelbase. A drop-through longboard is about 39" × 9.25", with a 73 cm
wheelbase, wheel cut-outs, 50° reverse-kingpin trucks and 70 mm wheels.

| | Skate | Longboard |
|---|---|---|
| Deck | 66 cm + two 13 cm kicks (19°) × 44 cm, popsicle with half-circle ends | 116 × 46 cm, round ends lifting 1 cm, wheel wells |
| Wheelbase | 50 cm | 80 cm (about 70 % of the length) |
| Trucks | traditional high trucks, 50° pivot, bushings 4 N·m/rad, 6 mm risers, raw aluminium | reverse kingpin, 50° pivot, bushings 2.5 N·m/rad, drop-through, black anodised |
| Wheels | 64 mm, cream, orange cores | 88 mm, amber, wider, white cores |
| Free truck turn (wheelbite) | 11.5° | 14.9° |
| Deck height | 9.6 cm | 6.0 cm (lower despite the bigger wheels) |
| Pilot run | obstacle road, 17.5 s, up to 12.2 km/h | coast road, 38.6 s, up to 11.5 km/h |

A real deck is half as wide as these, so wheels and trucks are scaled up with
the deck: at real-world sizes they looked like toys under it.

**Wheels never pass through the deck.** The wheels and the deck do not collide
in the physics, as on a real board where only wheelbite stops a truck. So each
truck's turn is limited to the largest angle at which every point of every
wheel stays 3 mm clear of the deck (`safeTurn` in `skateboard.ts`), computed
from the same geometry the drawing uses. Risers (skate) and deeper wheel wells
(longboard) give the bigger wheels room to turn further than a ride needs.

The longboard rolls faster and turns less per degree of lean; softer bushings,
as on real longboards, give it back enough turn for the course.

The drawing (`skateboard.ts`) is attached to the physical bodies, so trucks
turn and wheels spin.

- Deck: concave and a sanded maple margin around the grip. The grip shows grit,
  wear and a logo. The rim is rounded, with seven plies (two dyed), and the
  bottom carries a graphic (maple grain and stripes on the longboard).
- Trucks: baseplates with bolts and nuts (risers on the skate, on top of the
  deck on the drop-through), a pivot cup, a kingpin with bushings, washer and
  nut, and a rounded hanger with tapered axle housings, axle and nuts.
- Wheels: urethane with radiused lips, a coloured core and sealed bearings.
- The collision primitives show only in the *Colisiones* view.

Sources for the proportions: [Skate Warehouse deck guide](https://blog.skatewarehouse.com/news/articles/Skateboard_Deck_Buying_Guide.html),
[Longboard (Wikipedia)](https://en.wikipedia.org/wiki/Longboard_(skateboard)),
[SkatePro drop-through listing](https://www.skatepro.com/en-us/83-17829.htm).

## The coast road (longboard)

Inspired by the classic downhill roads: Haleakalā Highway (sea on one side,
mountain on the other), the cliffside bends of the Pacific Coast Highway, and
Maryhill Loops' linked curves. It has no obstacles: the ride is carving the
bends by weight alone.

- The road comes 40 m down to the start and carries on 35 m uphill past the
  run-out, where the board rolls to a stop, so it never begins or ends in mid
  air. The run itself is about 75 m of 2.4 m road. Start ramp and stopper, a drop in, then four linked
  bends (left 40°, right 80°, left 80°, right 40°, radii 9–11 m) at 0.8–1.3°,
  a finish straight and an uphill run-out. Grades blend over 1 m.
- Physics: one convex box per 0.4 m of centre line, overlapping through the
  bends, plus a curb on the mountain side and a guardrail on the sea side.
  The ground right beside the road (behind the curb and before the guardrail)
  is drawn on the road's own frame at 20–25 cm detail. The 60 cm terrain grid
  is too coarse to meet an 8 cm curb cleanly.
- Drawing only: a flat-shaded hillside carved around the road (rock cut above,
  scrub and grass, a slope falling to a beach with surf), the sea out to the
  haze, far ranges and headlands, pines, guardrail posts and the finish arch.
- Golden hour: a low sun over the sea ahead (disc and halo), a warm gradient
  sky that glows on the sun's side, warm haze, the run's own sun and fill
  light (`view.light`). The sea has drifting ripples that catch the sun.
  Clouds drift, sailing boats rock on the bay, gulls circle the cliff and a
  lighthouse stands on a point among shore rocks (`animate`).

The landscape follows the usual recipe for believable mountains (see the
three.js TerrainGenerator and Musgrave's ridged multifractal). The heights are
a ridged multifractal, with each octave damped where the ones before it are
low, sampled through a low-frequency domain warp so the crests meander. Near
the road it is blended with the road's cut and fill, then run through four
passes of thermal erosion. The coast rises from the water as a low rock lip
before the slope. The ground is coloured by slope and height: wet rock and
sand at the waterline, grass on the lower slopes, then scrub, bare rock and
scree from 2–3 m above the road (20–30 m at Jumper's scale). It carries a
grass grain texture. A band of surf follows the exact waterline, traced by
marching squares over the height grid and breathing with the swell, with
weathered rocks half sunk along it. A far mesh carries the ranges inland and the headlands across the
bay out to the horizon. The sea is three.js's `Water` (mirror reflection,
Fresnel, scrolling ripples and sun glitter), with its Y-up shader turned to
this Z-up world and tuned to keep its own deep blue. A soft bloom and a very
light depth of field, focused on Jumper, finish the frame (`view.post`).

The chase camera is set per run (`view.chase`). On the coast road it sits
5.2 m behind, out over the sea side and 2.3 m up, looking 7 m down the road.
It follows the road's heading smoothed over about 0.7 s, not the board's,
which shivers with every correction. Only the look-at point leans halfway
towards the bay, so bends into the hill still open onto the sea; turning the
camera itself would swing it round onto the hillside. It never goes through
the scenery: it stays 0.8 m above the ground and rises over any rise that
would hide Jumper (`course.ground`), quickly, then settles back slowly.

The camera does not orbit: the run frames itself. The wheel (or a pinch)
zooms between 0.6× and 1.6× the chase distance, and the zoom stays as set,
restarts included. The
road furniture casts no shadows, because with the sun this low its long
shadows would sweep in and out of the shadow map around the rider.

Sources: [three.js TerrainGenerator](https://threejs.org/docs/pages/TerrainGenerator.html),
[Procedural eroded terrain in three.js](https://getbutterfly.com/procedural-eroded-terrain-in-three-js-theory-techniques-field-notes/),
[Classic ocean shader with Gerstner waves (three.js forum)](https://discourse.threejs.org/t/classic-ocean-shader-example-with-gestner-waves/29227).

Sources: [10 best longboarding roads in the US (Solgaard)](https://solgaard.co/blogs/stories/10-best-longboarding-roads-in-the-us),
[Pacific Coast Highway road trip (Enterprise)](https://www.enterpriserentacar.it/en/inspiration/road-trip/california-pacific-coast-highway.html),
[three.js forum: stylised scenes](https://discourse.threejs.org/t/how-can-i-make-this-world-more-fancy/32275).

## Weight, not walking

The walking keys never reach the controller as walking. They set where Jumper's
weight goes:

- ← / → (or A/D, J/L) turn relative to the way the board is rolling.
- W/S load the toes or heels directly.
- The touch stick does the same: sideways turns, up and down for toes and heels.

Two things move the weight, both through the controller's own pad axes, the way
a person with a gamepad would:

- **Feet.** A balance loop holds Jumper's centre of mass where it was asked:
  up to 3 cm towards the toes or 3.5 cm towards the heels. It also keeps
  Jumper square to the deck. While the error stays under about 1 cm the feet
  stay planted. Above that, it asks for the smallest walking speed above the
  policy's 0.06 m/s standing band, so Jumper shuffles.
- **Body.** The posture pitch (Ry) extends the rear legs and folds the front
  ones, or the reverse. This loads the toes or heels without moving the feet.
  It eases in over about 0.4 s.

The loop measures the centre of mass, not the middle of the footprint: they sit
1.2 cm apart, and centring the footprint made the board drift to one side. It
reports the stick only when it changes, as a real pad does.

## Restart

If the board stops for 2 s after the release, or Jumper leaves it, the scene
goes back to the start. That includes stopping on the run-out after the finish.
The pilot stays on, so it rides the run again.

## Rendering notes

- The deck rim and the turned parts (wheels, cores, cone bands) are double-sided
  thin shells. The embankment is extruded with a rotation, not a mirror: with a
  mirror, its faces pointed inward and it looked hollow.
- The metals are mostly diffuse. The scene has no environment map, so strongly
  metallic materials render almost black.
- The ground layers (grass, asphalt, paint, finish) are 2–3 mm apart and carry
  polygon offsets. They receive shadows but cast none. The embankment's base
  sits 5 cm under the floor. Before this, coplanar faces and layer-on-layer
  shadow acne flickered at the bottom of the hill.

- The coast's far landscape (9 m cells) drops well under the near terrain
  inside it. Otherwise its coarse triangles poked up through the last bends
  and covered the road.
- The coast's static furniture and scenery (curbs, posts, dashes, finish
  squares, rocks, pines) is merged into one mesh per material. As separate
  meshes they cost about 800 draw calls in each of the view, the sea's
  reflection and the depth-of-field pass, and frames swung between 8 and 33 ms.
  The sea reflection renders at 512².
- Depth of field reads the depth buffer the scene was just rendered with
  (`DepthBokeh`), instead of `BokehPass`'s second render of the whole scene,
  and the bloom works at half its usual resolution (`HalfBloom`). On a Retina
  screen a coast frame went from about 27 ms to 14.5 ms (8 ms at 1×).
- The physics advances in 5 ms steps, in bursts between policy inferences,
  and the screen every 8 ms or more, so a frame's pose lagged by a different
  amount each frame. On the coast's textured ground that read as the board
  moving in jerks (on the obstacle road's plain white ground it hardly
  showed). The camera and everything that moves are drawn at a clock that
  advances steadily with the screen, carried on from the last physics step at
  the board's velocity. Measured per drawn frame, the board's apparent speed
  varied by 31 % before and 6 % after (the board's own speed changes through
  the bends). `BUMPS=1 node scripts/verify-skate.mjs` prints the board's
  speed, bounce and jolts per second of a run.

## Pilot

P (or *Piloto*) releases the stopper and steers with the same weight input. It
uses pure pursuit, 2.4 m ahead, on a race line: right of the first cone, right
of the island, through the slalom and the chicane gaps.

## Verified headless

`node scripts/verify-skate.mjs` (or `BOARD=longboard node scripts/verify-skate.mjs`) rides the page's own `Skate` class with the
shipped controller, ONNX policies and servo model, and checks that no external
force is ever applied. With the pilot it finishes in 18.1 s, clean, at up to
11.4 km/h. No foot comes within 3 cm of a deck edge (the pads are about 1 cm in
radius), and the tilt safety never trips.

A hippie jump over a bar does not fit Jumper's geometry. The robot is 40 cm
long in the direction of travel and stays above a 10 cm bar for about 0.2 s. It
would have to pass at more than 3 m/s, so the run asks for steering instead.

## Controls

On the skate page the header, HUD and hints sit on light translucent panels
with black text, so they read over the scenery. A *Reiniciar* button (R)
stays in the HUD during the run.

A panel in the middle of the screen picks the board and starts the run (Enter)
or the pilot (P). At the finish it shows the time with *Otra vez*.

Enter: release. ←/→ or A/D: turn. W/S: toes/heels. P: pilot. R: reset. Wheel or pinch: zoom. The HUD
shows speed, top speed, time and cones down. It also draws the deck from above:
where the feet were asked to be (ring), where they are (dot) and the body lean
(bar).
