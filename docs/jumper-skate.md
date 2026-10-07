# Jumper skate

`/jumper/skate` puts Jumper on a skateboard at the top of a downhill road. The
robot runs its original policies, unchanged. Nothing pushes the robot or the
board: speed comes from the slope, steering from the trucks, and the only
control is where Jumper puts its weight on the deck. There is no jumping.

## The run

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

## The board

- Deck 72 × 44 cm with 8 cm kicks (14°), 0.75 kg: a wide cruiser. Jumper stands
  sideways like a skater. Its claws reach 19 cm forward and its rear feet 14 cm
  back, so a 40 cm deck left almost no room to load the toes.
- Traditional-geometry trucks: each hanger turns about a 45° pivot axis against a
  4 N·m/rad bushing spring. Leaning the deck turns the trucks.
- The drawing (`skateboard.ts`) is attached to the physical bodies, so trucks
  turn and wheels spin.
  - Deck: popsicle shape with rounded nose and tail, curved kicks, concave and
    a sanded maple margin around the grip. The grip shows grit, wear on the
    kicks and a logo. The rim is rounded, with seven plies (two dyed), and the
    bottom carries a graphic.
  - Trucks: riser pads, baseplates with bolts and nuts, a pivot cup, an angled
    kingpin with bushings, washer and nut, and a rounded hanger with tapered
    axle housings, axle, speed washers and nuts.
  - Wheels: urethane with radiused lips, a coloured core and sealed bearings.
  - The collision primitives show only in the *Colisiones* view.

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

## Pilot

P (or *Piloto*) releases the stopper and steers with the same weight input. It
uses pure pursuit, 2.4 m ahead, on a race line: right of the first cone, right
of the island, through the slalom and the chicane gaps.

## Verified headless

`node scripts/verify-skate.mjs` rides the page's own `Skate` class with the
shipped controller, ONNX policies and servo model, and checks that no external
force is ever applied. With the pilot it finishes in 18.1 s, clean, at up to
11.4 km/h. No foot comes within 3 cm of a deck edge (the pads are about 1 cm in
radius), and the tilt safety never trips.

A hippie jump over a bar does not fit Jumper's geometry. The robot is 40 cm
long in the direction of travel and stays above a 10 cm bar for about 0.2 s. It
would have to pass at more than 3 m/s, so the run asks for steering instead.

## Controls

Enter: release. ←/→ or A/D: turn. W/S: toes/heels. P: pilot. R: reset. The HUD
shows speed, top speed, time and cones down. It also draws the deck from above:
where the feet were asked to be (ring), where they are (dot) and the body lean
(bar).
