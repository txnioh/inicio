// Node 24+. Ride the skate spot headless with the shipped controller and
// policies, the same physics loop as the page, and the page's own Skate class.
// The pilot only presses keys; nothing applies force to the robot or the board.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import * as ort from 'onnxruntime-node';
import * as THREE from 'three';
import { flushInputs } from '../src/app/jumper/inputs.ts';
import { Skate, skateXml } from '../src/app/jumper/skate.ts';

const root = fileURLToPath(new URL('../public/jumper/', import.meta.url));
const json = async file => JSON.parse(await readFile(root + file, 'utf8'));
const bundle = await json('app/bundle.json'), physical = await json('physics.json');
const { default: init, WebFsm } = await import(new URL('../public/jumper/app/runtime/web/controller.js', import.meta.url));
await init({ module_or_path: await readFile(root + 'app/runtime/web/controller.wasm') });
const contracts = {}, trajectories = {};
for (const [mode, spec] of Object.entries(bundle.modes)) {
  const c = await json('app/' + spec.contract); contracts[mode] = c;
  if (c.reference) trajectories[mode] = await readFile(root + 'app/' + c.reference.file, 'utf8');
}
const config = await readFile(root + 'app/controller.toml', 'utf8'), c = contracts.locomotion, names = c.wire_joint_order;
const robot = JSON.stringify({ joint_names: names, joint_pos_lo: names.map(n => c.joint_limits[n][0]), joint_pos_hi: names.map(n => c.joint_limits[n][1]), output_rate_hz: 200 });
const fsm = new WebFsm(config, JSON.stringify(contracts), robot, 0, JSON.stringify(trajectories));
const sessions = new Map();
async function infer(mode, obs) {
  const file = bundle.modes[mode].models.onnx;
  if (!sessions.has(file)) sessions.set(file, await ort.InferenceSession.create(root + 'app/' + file));
  const s = sessions.get(file), out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', Float32Array.from(obs), [1, obs.length]) });
  return out[s.outputNames[0]].data;
}

const mj = await loadMujoco(); mj.FS.mkdir('/jumper');
const manifest = await json('manifest.json');
for (const file of manifest.runtime.meshes) {
  let dir = '/jumper';
  for (const part of file.split('/').slice(0, -1)) { dir += '/' + part; if (!mj.FS.analyzePath(dir, false).exists) mj.FS.mkdir(dir); }
  mj.FS.writeFile('/jumper/' + file, await readFile(root + file));
}
// BOARD=longboard rides the drop-through instead of the skate.
const kind = process.env.BOARD ?? 'skate';
mj.FS.writeFile('/jumper/scene.xml', skateXml(await readFile(root + 'scene.xml', 'utf8'), kind));
const model = mj.MjModel.mj_loadXML('/jumper/scene.xml'), data = new mj.MjData(model), velocity = new mj.DoubleBuffer(6);
const qa = [], va = [], motors = [];
for (const name of names) { const id = mj.mj_name2id(model, 3, name); qa.push(model.jnt_qposadr[id]); va.push(model.jnt_dofadr[id]); motors.push(mj.mj_name2id(model, 19, name + '_motor')); }
const feet = new Set(physical.feet.map(name => mj.mj_name2id(model, 5, name)));
const queue = [];
const skate = new Skate(mj, model, new THREE.Scene(), feet, (lx, ly, rx, ry, now) => { globalThis.AX = [lx, ly, rx, ry]; fsm.setAxis('Lx', lx); fsm.setAxis('Ly', ly); fsm.setAxis('Rx', rx); fsm.setAxis('Ry', ry); fsm.padFrame(now); }, kind);
const heat = new Float32Array(22);
mj.mj_resetData(model, data);
qa.forEach((a, i) => { data.qpos[a] = c.default_joint_pos[names[i]]; });
skate.reset(data);
mj.mj_forward(model, data);

async function step() {
  const now = Math.round(data.time * 1e6);
  mj.mj_objectVelocity(model, data, mj.mjtObj.mjOBJ_XBODY.value, 1, velocity, 1);
  const vel = velocity.GetView();
  fsm.set_state(Float32Array.from(qa, a => data.qpos[a]), Float32Array.from(va, a => data.qvel[a]), Float32Array.from(motors, a => data.actuator_force[a]), Float32Array.from(data.qpos.slice(3, 7)), Float32Array.from(vel.slice(0, 3)), now);
  fsm.setSignal('base_lin_vel', Float32Array.from(vel.slice(3, 6))); fsm.set_command(0, 0, 0, now);
  skate.beforeControl(data, fsm.mode(), fsm.is_running_policy());
  flushInputs(fsm, queue, now);
  const mode = fsm.tick(now);
  if (mode !== undefined) fsm.resume(await infer(mode, fsm.observation()));
  const targets = fsm.positions(), kp = fsm.kp(), kd = fsm.kd(), contract = contracts[fsm.mode()] ?? c, dt = contract.control.sim_dt;
  model.opt.timestep = dt;
  const s = physical.servo, rpm = Math.PI * 2 / 60;
  for (let j = 0; j < Math.round(.005 / dt); j++) {
    motors.forEach((motor, i) => {
      const v = data.qvel[va[i]], w = Math.abs(v), curve = w >= s.cutoff_speed_rpm * rpm ? 0 : s.plateau_torque_nm * Math.exp(-Math.max(0, w - s.corner_speed_rpm * rpm) / (s.decay_speed_rpm * rpm));
      const limit = Math.min(curve, heat[i] >= 1 ? s.thermal_continuous_torque_nm : s.plateau_torque_nm, contract.control.effort_limit);
      const tau = Math.max(-limit, Math.min(limit, kp[i] * (targets[i] - data.qpos[qa[i]]) - kd[i] * v));
      data.ctrl[motor] = tau;
      heat[i] = Math.max(0, heat[i] + ((tau / s.thermal_continuous_torque_nm) ** 2 - heat[i]) * dt / s.thermal_time_constant_s);
    });
    mj.mj_step(model, data);
    assert(data.qfrc_applied.every(f => f === 0) && data.xfrc_applied.every(f => f === 0), 'No external force on robot or board');
    assert(data.qpos.every(Number.isFinite));
  }
  mj.mj_forward(model, data);
  skate.afterControl(data);
}

const seen = [];
let last = 0, safe = 0, edge = 1, worst = 0;
skate.togglePilot();
for (let i = 0; i < Math.round(45 / .005) && !skate.stats(data).finished; i++) {
  await step();
  safe += Number(fsm.mode() === 'safe');
  const st = skate.stats(data);
  if (fsm.mode() === 'locomotion' && st.released) { edge = Math.min(edge, st.edge); worst = Math.max(worst, Math.abs(data.qpos[1])); }
  for (const item of st.feed) if (item.id > last) { seen.push(`${data.time.toFixed(2)}s ${item.text}`); last = item.id; }
  if (process.env.TRACE && i % +(process.env.EVERY ?? 100) === 0) console.log(data.time.toFixed(2), fsm.mode(), 'x', data.qpos[0].toFixed(2), 'y', data.qpos[1].toFixed(2), 'v', st.speed.toFixed(2), 'w', st.weight[0].toFixed(3), 'lean', st.lean.toFixed(2), 'edge', st.edge.toFixed(3));
}
const stats = skate.stats(data);
console.log(seen.join('\n'));
console.log(`${kind}: top ${(stats.top * 3.6).toFixed(1)} km/h · ${stats.time.toFixed(1)} s · cones down ${stats.cones} · safe frames ${safe} · closest foot to a deck edge ${(edge * 100).toFixed(1)} cm · widest |y| ${worst.toFixed(2)} m`);
assert(stats.finished, 'The pilot reaches the finish by weight alone');
assert(!seen.some(s => s.includes('Fuera')), 'Stays on the board');
assert.equal(safe, 0, 'Never trips the tilt safety');
// Foot contact centres stay on the deck: the pads are about 1 cm in radius.
assert(edge > 0.005, 'Feet stay on the deck');
assert(stats.cones <= 1, 'The race line misses the cones');
// Once it stops (here on the run-out after the finish) for 2 s, it asks to go back to the start.
const stoppedFrom = data.time;
for (let i = 0; i < Math.round(15 / .005) && !skate.wantsRestart; i++) await step();
console.log(`back to the start after ${(data.time - stoppedFrom).toFixed(1)} s past the finish`);
assert(skate.wantsRestart, 'A stopped ride restarts');
