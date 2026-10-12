# Jumper in the official simulator

Marea and the two downhill runs as packages for KingKong's toolkit
([jumper-design](https://github.com/KingKongRobotics/jumper-design), protocol
v0.6), which the [BE UNLIMITED simulator](https://beunlimited.me/en/simulator)
loads under *Appearance / Scene → Load mine*:

| File | Kind | What it is |
| --- | --- | --- |
| `marea-v1.skin` | `kk-skin-package/3` | Marea: the original shell with two antennae and round eyes, four shell colours, recoloured limbs |
| `jumper-street-run.map` | `kk-scene-package/2` | *Calle*: the obstacle street, skateboard, Marea as default robot |
| `jumper-coast-road.map` | `kk-scene-package/2` | *Costa*: the coast road, longboard, Marea as default robot |

All three pass jumper-design's `verify-package` against the trusted `jumper`
profile, with MuJoCo loading. The maps also pass its default-robot composition
and spawn-support audit. Those checks cover package integrity and model
loading. They do not establish visual fidelity in the website renderer,
controller behaviour there, or anything physical.

## Marea

`marea_shell.py` builds the shell in original CAD millimetres: the baseline
upper shell, plus antennae and eye discs placed as in `src/app/jumper/marea.ts`.
It also writes a 4-colour AMS 3MF whose triangles match the STL exactly; that
is how `assemble` takes shell colours. `marea_assemble.py` runs jumper-design's
own `assemble`, adding visual-only colour overrides for every other part.

Results: seam p95 0.07 mm (limit 0.25), whole robot 41 links and 22 joints,
URDF matching MJCF, and masses, inertia and collision unchanged. The eyes are
part of the shell visual, because a `.skin` may only recolour the display
module.

## The runs: a drop-in start

jumper-design accepts only world-fixed ground under a spawn, so Jumper cannot
start on the rolling board as it does on the site. The maps use a drop-in
instead (`dropin.ts`):

- **Start.** Jumper starts on a fixed platform beside the board, level with
  the deck. The board waits on a level top added to both runs (`road.flat`,
  `coast.flat`), its front wheels 3 cm from the start ramp's clean edge.
- **Board.** A chock behind the back wheels (wheels only) keeps the board from
  rolling backwards. The platform touches only the robot, so the deck cannot
  rub along it.
- **Boarding.** Hold **D** (step right) until Jumper is centred on the deck.
  Its weight tips the board over the edge. Steer by leaning (roll: U / O).
- **Wider deck.** The deck is 60 cm wide in the maps (44–46 cm on the site),
  with the trucks widened to match. On the site, a host-side rider keeps Jumper
  centred; the official simulator has no such rider. On the narrow deck,
  Jumper drifted about 10 cm, put a foot on the road and stopped the board.

`node scripts/jumper-design/test-dropin.mjs calle|costa` drives this with the
shipped controller, policies, motor model and MuJoCo, with no applied forces.
The board waits unloaded, starts once Jumper is on, and rides at about
2.5 m/s. It stops after about 6 m against the first cone on *Calle*, and after
about 8 m against the curb at the first bend on *Costa*: those need steering.
Jumper stays on the deck in both. These are runs in the site's simulator; the
official simulator has not been tested.

The site's own runs are unchanged where the board rides. They gain the level
tops above their start ramps. On the coast, the road boxes on either side of
the ramp edge no longer overlap it, and the grade has no blend there.

## Scenery

`extract-runs.ts` takes every mesh the site draws, in world coordinates. The
coast ground's shader colour becomes per-vertex colour (`terrainMaterial.ts`'s
formula without its fine grain), clustered into 14 flat colours. A `.map`
carries flat materials only, and the website renderer's fixed `be-web/1` fog
(6–16 m) will haze the distant coast. The sky and the stopper boom are left
out. Native MuJoCo sizes its near clip from the coast's ~3 km extent (about
56 m), so a native viewer close to Jumper needs a smaller `znear`.

## Regenerate

```sh
npm run dev   # port 5191
node scripts/jumper-design/export-runs.mjs RUNS_DIR
# In a jumper-design checkout (git lfs pull; pip install -e ".[sim,dev]" pillow fast_simplification):
python marea_shell.py JUMPER_DESIGN SHELL_DIR
python marea_assemble.py JUMPER_DESIGN SHELL_DIR SIM_DIR
python scripts/shellflow.py export-skin --simulation SIM_DIR --profile robots/jumper/profile.json --id marea-v1 --title Marea --version 1.0.0 --author txnio --license Apache-2.0 --preview PREVIEW.png --output marea-v1.skin
python build_maps.py JUMPER_DESIGN RUNS_DIR marea-v1.skin OUT_DIR
```
