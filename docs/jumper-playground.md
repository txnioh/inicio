# Jumper playground

Open `/jumper` on the Inicio development server (`npm run dev`). The page uses
Inicio's minimal interface: a full-screen scene, pause/reset and a small settings
popover. Drag the scene to orbit; scroll to zoom.

`/jumper/eva` is a separate Evangelion EVA-01 appearance: purple armour, green
accents, angular eyes and a horn. The header switches between both pages.
EVA reuses the exact CAD bodies, collision meshes and controller. Its eyes and
horn attach to the display/shell meshes as visual decoration, not extra
physical bodies. It is a cosmetic concept, not a separately calibrated robot.

The default camera shows the front and claws. The Z-up lighting and a 2048 px
shadow map, with depth bias -0.0003 and normal bias 0.002 m, remove the
self-shadow striping visible on the shell in close-up. Robot self-shadowing and
shadows on the floor remain enabled; no source geometry was removed or altered.
The visual pack now reads the source STL coordinates directly instead of
round-tripping MuJoCo's float32 inertia-frame vertices. It preserves the reference
renderer's 60-degree crease normals and 0.01 mm smoothing tolerance. The old
unconditional averaging across hard edges caused triangular highlights along
the visor and claws. The archive includes the normals, so loading needs no
normal reconstruction. The packer verifies triangle counts, vertex positions
and the unchanged physical masses, inertia and joint limits.

Contour antialiasing uses a 4-sample render target followed by SMAA before the
output colour transform. The camera clips at 0.04–12 m to preserve depth precision
over the orbit range. These are rendering changes only.

## Controls

- WASD / arrows: walk in the robot's body frame.
- J / L: turn. Space: request the original trained jump. R: reset the physical state.
- Escape: release inputs. The controller also releases them when the tab loses focus.
- I / K: pitch, U / O: roll, H / semicolon: twist, N / M: stance height.
- 1–4: wave, bow, offer paw, salute; Ctrl + 1–4: the four dances.
- V / B: left / right claw modes. The settings menu exposes these same bindings.
- On touch devices, the stick reports the controller's native Lx/Ly axes; the
  jump button reports its A button. No camera-relative motion mapping is added.

Bindings, command ranges, key ramp rates, mode transitions, joint targets, gains
and observations are all computed by the original `WebFsm`. Short key presses
retain both edges across consecutive ticks. The host does not invent a gait or
translate keyboard input into its own velocity commands.

## What is simulated

Assets come from [KingKongRobotics/jumper](https://github.com/KingKongRobotics/jumper)
at `61d065219fca767f3142c8f10aff59eae5a5a004`, under Apache-2.0, with LICENSE and
NOTICE preserved. The reference UI is [BE UNLIMITED](https://beunlimited.me/en/simulator).
The bundled Rust controller was built from `ce71f79b191766f0208dca34516564a37816c729`,
which upstream also distributes for the board and the native simulator. Its glue,
WASM, contracts, trajectories and ONNX files are unchanged. Bundle files are
checked against their upstream SHA-256 digests before execution.

MuJoCo 3.15.0 integrates the CAD robot's masses, inertia, 22 joints, limits,
friction, contacts, ground and boxes in SI units. Only 22 joint motors are
actuated. The floating base receives no invented support, balance torque, jump
impulse or positional correction. Only an explicit reset writes its initial pose.
The original model remains byte-for-byte at `public/jumper/jumper.xml`; a derived
`scene.xml` adds the environment and motor actuators.

`prepare-jumper-physics.py` resolves the pinned training constants into
`physics.json`. It retains foot/chassis contact properties and the per-leg masks
that permit different legs to collide while excluding contacts within one leg.
Solver options come from the training configuration; the active policy's own
`sim_dt` controls integration: 1 ms for locomotion, 2.5 ms for jump, 5 ms for
recorded gestures. The controller publishes at 200 Hz and decides each policy's
inference cadence. ONNX Runtime Web executes the actual trained networks.

The host supplies joint positions, velocities, actual MuJoCo motor torque,
(w,x,y,z) orientation, and angular/linear velocity in the body frame, paired by
wire joint names. MuJoCo's velocity out-buffer is reused and freed on disposal.
A single copied contact vector is freed per step.

Motor PD output follows the upstream exponential torque-speed curve and thermal
model, including the 1.7464 N·m peak, 1.2 N·m continuous ceiling and 300 ms cold
peak budget. These constants come from the pinned motor specification. The
thermal model, foot friction and several hardware properties are estimates in
upstream; reproducing them does not constitute physical calibration.

The jump policy was trained for a vertical jump on flat ground. Boxes participate
in physical collisions, but arbitrary obstacle climbing or a directed forward
jump is not a demonstrated skill of this bundle. The playground preserves that
limit: a blocked foot, fall or unreachable box is a simulated outcome, not an
occasion to raise the robot or strengthen its motors. Reproducing a particular
physical robot requires measurements of that robot and its floor.

## Performance and verification

Rendering is capped at 60 Hz and device pixel ratio 2 (with a 3-megapixel budget
for Retina upsampling, never below native resolution); physics and ONNX inference
run independently of React. Telemetry updates four times a second. Hidden tabs
stop stepping and rendering. A bounded catch-up budget prevents stalls; if the
machine is too slow the simulated clock slows, without changing the policy's
physical timestep. Settings shows simulated seconds per wall-clock second.

The indexed visual geometry is packed into a gzip archive: 21.75 MB of source
STLs becomes 6.92 MB including crease normals. Physics downloads only its required collision meshes.
Packing checks that removing visual-only meshes preserves body transforms.
ONNX sessions are cached per model, locomotion/jump are warmed before playing,
and other models load when first requested. All WASM stays on the Jumper route.

On load, the original controller replays 24 reference frames, with zero
observation/target error and no mode mismatches. All 18 recorded inferences are
also checked in the browser; maximum observed error was 4.77e-7.

Run `node scripts/verify-jumper.mjs` (Node 24+) for controller parity, ONNX parity,
standing, forward movement, foot contact and traversal of the first box, a complete jump/landing, finite states, actuator limits
and absence of applied external forces. The native ONNX runtime is already supplied
by this repository's Transformers dependency. The checked scene measured ~61 cm
of forward travel, a peak body height of 23.02 cm, and return to the 10.57 cm stance.
These are simulator measurements, not claims about a hardware test.

Regenerate pinned assets in order:

```sh
python3 scripts/fetch-jumper-assets.py
python3 scripts/fetch-jumper-controller.py
python3 scripts/prepare-jumper-physics.py
node scripts/pack-jumper.mjs
node scripts/verify-jumper.mjs
npm run build
```
