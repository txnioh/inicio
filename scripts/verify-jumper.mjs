// Node 24+. Check the shipped controller, policies and physical outcomes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import * as ort from 'onnxruntime-node';
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
const create = () => new WebFsm(config, JSON.stringify(contracts), robot, 0, JSON.stringify(trajectories));
let fsm = create();
const reference = await readFile(root + 'app/reference.json', 'utf8');
const parity = JSON.parse(fsm.checkReference(reference));
assert.equal(parity.observation, 0); assert.equal(parity.target, 0); assert.deepEqual(parity.modeMismatches, []);
fsm.free(); fsm = create();
const sessions = new Map();
async function infer(mode, obs) {
  const file = bundle.modes[mode].models.onnx;
  if (!sessions.has(file)) sessions.set(file, await ort.InferenceSession.create(root + 'app/' + file));
  const s = sessions.get(file), out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', Float32Array.from(obs), [1, obs.length]) });
  return out[s.outputNames[0]].data;
}
let inferenceError = 0;
for (const frame of JSON.parse(reference).frames.filter(f => f.obs)) {
  const act = await infer(frame.mode, frame.obs);
  act.forEach((a, i) => { inferenceError = Math.max(inferenceError, Math.abs(a - frame.act[i])); });
}
assert(inferenceError < 1e-4);
const mj = await loadMujoco(); mj.FS.mkdir('/jumper');
const manifest = await json('manifest.json');
for (const file of manifest.runtime.meshes) {
  let dir = '/jumper';
  for (const part of file.split('/').slice(0, -1)) { dir += '/' + part; if (!mj.FS.analyzePath(dir, false).exists) mj.FS.mkdir(dir); }
  mj.FS.writeFile('/jumper/' + file, await readFile(root + file));
}
mj.FS.writeFile('/jumper/scene.xml', await readFile(root + 'scene.xml'));
const model = mj.MjModel.mj_loadXML('/jumper/scene.xml'), data = new mj.MjData(model), velocity = new mj.DoubleBuffer(6);
assert.equal(model.nu, 22);
const qa = [], va = [], motors = [];
for (const name of names) { const id = mj.mj_name2id(model, 3, name); qa.push(model.jnt_qposadr[id]); va.push(model.jnt_dofadr[id]); motors.push(mj.mj_name2id(model, 19, name + '_motor')); }
const heat = new Float64Array(22);
const footIds = new Set(physical.feet.map(name => mj.mj_name2id(model, 5, name)));
const firstBox = mj.mj_name2id(model, 5, 'box_0');
let footTouchedBox = false;
function reset() {
  fsm.free(); fsm = create(); mj.mj_resetData(model, data); heat.fill(0);
  data.qpos[2] = physical.standHeight; data.qpos[3] = 1;
  qa.forEach((a, i) => { data.qpos[a] = c.default_joint_pos[names[i]]; });
  mj.mj_forward(model, data);
}
async function step() {
  const now = Math.round(data.time * 1e6);
  mj.mj_objectVelocity(model, data, 1, 1, velocity, 1);
  const vel = velocity.GetView();
  fsm.set_state(Float32Array.from(qa, a => data.qpos[a]), Float32Array.from(va, a => data.qvel[a]), Float32Array.from(motors, a => data.actuator_force[a]), Float32Array.from(data.qpos.slice(3, 7)), Float32Array.from(vel.slice(0, 3)), now);
  fsm.setSignal('base_lin_vel', Float32Array.from(vel.slice(3, 6))); fsm.set_command(0, 0, 0, now);
  const mode = fsm.tick(now); if (mode !== undefined) fsm.resume(await infer(mode, fsm.observation()));
  const targets = fsm.positions(), kp = fsm.kp(), kd = fsm.kd(), dt = (contracts[fsm.mode()] ?? c).control.sim_dt;
  model.opt.timestep = dt;
  const s = physical.servo, rpm = Math.PI * 2 / 60;
  for (let j = 0; j < Math.round(.005 / dt); j++) {
    motors.forEach((motor, i) => {
      const v = data.qvel[va[i]], w = Math.abs(v), curve = w >= s.cutoff_speed_rpm * rpm ? 0 : s.plateau_torque_nm * Math.exp(-Math.max(0, w - s.corner_speed_rpm * rpm) / (s.decay_speed_rpm * rpm));
      const limit = Math.min(curve, heat[i] >= 1 ? s.thermal_continuous_torque_nm : s.plateau_torque_nm);
      const tau = Math.max(-limit, Math.min(limit, kp[i] * (targets[i] - data.qpos[qa[i]]) - kd[i] * v));
      data.ctrl[motor] = tau;
      heat[i] = Math.max(0, heat[i] + ((tau / s.thermal_continuous_torque_nm) ** 2 - heat[i]) * dt / s.thermal_time_constant_s);
    });
    mj.mj_step(model, data);
    assert(data.qfrc_applied.every(f => f === 0), 'No external support or jump impulse');
    assert(data.qpos.every(Number.isFinite));
    assert(data.actuator_force.every(f => Math.abs(f) <= s.plateau_torque_nm + 1e-6));
  }
  const contacts = data.contact;
  try {
    for (let i = 0; i < data.ncon; i++) {
      const contact = contacts.get(i);
      footTouchedBox ||= (contact.geom1 === firstBox && footIds.has(contact.geom2)) || (contact.geom2 === firstBox && footIds.has(contact.geom1));
      contact.delete();
    }
  } finally { contacts.delete(); }
}
const run = async seconds => { for (let i = 0; i < Math.round(seconds / .005); i++) await step(); };
reset(); await run(5);
assert(fsm.is_running_policy()); assert(data.qpos[2] > .08 && data.qpos[2] < .13);
const stand = Array.from(data.qpos.slice(0, 3));
fsm.setKeyCode('KeyW', true, false, Math.round(data.time * 1e6)); await run(2.5);
fsm.setKeyCode('KeyW', false, false, Math.round(data.time * 1e6)); await run(1);
const walk = Array.from(data.qpos.slice(0, 3));
assert(walk[0] - stand[0] > .1, 'Walking must result from joint torques');
reset(); await run(4);
fsm.setKeyCode('KeyW', true, false, Math.round(data.time * 1e6)); await run(6);
fsm.setKeyCode('KeyW', false, false, Math.round(data.time * 1e6)); await run(.5);
const obstacle = Array.from(data.qpos.slice(0, 3));
assert(footTouchedBox && obstacle[0] > .92 && obstacle[2] > .08 && fsm.mode() === 'locomotion', 'The robot must physically contact and pass the first box');
reset(); await run(4);
fsm.setKeyCode('Space', true, false, Math.round(data.time * 1e6)); await run(.1);
fsm.setKeyCode('Space', false, false, Math.round(data.time * 1e6));
let peak = data.qpos[2], airborne = false, jumpSeen = false;
for (let i = 0; i < 1200; i++) { await step(); peak = Math.max(peak, data.qpos[2]); airborne ||= data.ncon === 0 && data.qpos[2] > .15; jumpSeen ||= fsm.mode() === 'jump'; }
assert(jumpSeen && airborne && peak > .2, 'Trained jump must leave the floor');
assert(data.qpos[2] > .07 && data.qpos[2] < .14, 'Jump must land and return to locomotion');
const final = Array.from(data.qpos.slice(0, 3));
console.log(JSON.stringify({ parity, inferenceError, stand, walk, obstacle: { position: obstacle, footTouchedBox }, jump: { peak, airborne, landed: final, mode: fsm.mode() }, wasmMemoryMB: data.qpos.buffer.byteLength / 1e6 }, null, 2));
fsm.free(); velocity.delete(); data.delete(); model.delete();
for (const session of sessions.values()) await session.release();
