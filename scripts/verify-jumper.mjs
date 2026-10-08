// Node 24+. Check the shipped controller, policies and physical outcomes.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import * as ort from 'onnxruntime-node';
import { queueMode, flushInputs } from '../src/app/jumper/inputs.ts';
import { Mlp } from '../src/app/jumper/mlp.ts';
const root = fileURLToPath(new URL('../public/jumper/', import.meta.url));
const json = async file => JSON.parse(await readFile(root + file, 'utf8'));
const bundle = await json('app/bundle.json'), physical = await json('physics.json');
let verifiedFiles = 0;
for (const [file, expected] of Object.entries(bundle.files)) {
  let bytes;
  try { bytes = await readFile(root + 'app/' + file); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  assert.equal(bytes.length, expected.bytes, file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, file);
  verifiedFiles++;
}
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
// The browser runs the policies with mlp.ts, not ONNX Runtime: it must match both the
// original actions and ONNX Runtime on every reference frame.
const mlps = new Map();
let browserError = 0;
for (const frame of JSON.parse(reference).frames.filter(f => f.obs)) {
  const file = bundle.modes[frame.mode].models.onnx;
  if (!mlps.has(file)) { const bytes = await readFile(root + 'app/' + file); mlps.set(file, new Mlp(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))); }
  const act = mlps.get(file).run(Float32Array.from(frame.obs)), onnx = await infer(frame.mode, frame.obs);
  act.forEach((a, i) => { browserError = Math.max(browserError, Math.abs(a - frame.act[i]), Math.abs(a - onnx[i])); });
}
assert(browserError < 1e-4, `Browser policy inference differs by ${browserError}`);
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
const heat = new Float32Array(22);
const footIds = new Set(physical.feet.map(name => mj.mj_name2id(model, 5, name)));
const firstBox = mj.mj_name2id(model, 5, 'box_0');
let footTouchedBox = false;
let observeStep;
const inputQueue = [];
function reset() {
  fsm.free(); fsm = create(); mj.mj_resetData(model, data); heat.fill(0); inputQueue.length = 0;
  data.qpos[2] = physical.standHeight; data.qpos[3] = 1;
  qa.forEach((a, i) => { data.qpos[a] = c.default_joint_pos[names[i]]; });
  mj.mj_forward(model, data);
}
async function step() {
  const now = Math.round(data.time * 1e6);
  mj.mj_objectVelocity(model, data, mj.mjtObj.mjOBJ_XBODY.value, 1, velocity, 1);
  const vel = velocity.GetView();
  // A free root's angular qvel is body-local. This fails when mj_step's stale
  // derived velocity is mixed with the newly integrated joint state.
  for (let i = 0; i < 3; i++) {
    assert(Math.abs(vel[i] - data.qvel[3 + i]) < 1e-9, 'Body velocity must match the current physical state');
    assert(Math.abs(data.xpos[3 + i] - data.qpos[i]) < 1e-9, 'Rendered root must match the current physical state');
  }
  fsm.set_state(Float32Array.from(qa, a => data.qpos[a]), Float32Array.from(va, a => data.qvel[a]), Float32Array.from(motors, a => data.actuator_force[a]), Float32Array.from(data.qpos.slice(3, 7)), Float32Array.from(vel.slice(0, 3)), now);
  fsm.setSignal('base_lin_vel', Float32Array.from(vel.slice(3, 6))); fsm.set_command(0, 0, 0, now);
  flushInputs(fsm, inputQueue, now);
  const mode = fsm.tick(now);
  const observation = mode === undefined ? undefined : fsm.observation();
  if (mode !== undefined) {
    assert.equal(observation.length, contracts[mode].observation.dim, `${mode}: observation size`);
    assert(observation.every(Number.isFinite));
    fsm.resume(await infer(mode, observation));
  }
  const targets = fsm.positions(), kp = fsm.kp(), kd = fsm.kd(), dt = (contracts[fsm.mode()] ?? c).control.sim_dt;
  model.opt.timestep = dt;
  const s = physical.servo, rpm = Math.PI * 2 / 60;
  for (let j = 0; j < Math.round(.005 / dt); j++) {
    motors.forEach((motor, i) => {
      const v = data.qvel[va[i]], w = Math.abs(v), curve = w >= s.cutoff_speed_rpm * rpm ? 0 : s.plateau_torque_nm * Math.exp(-Math.max(0, w - s.corner_speed_rpm * rpm) / (s.decay_speed_rpm * rpm));
      const limit = Math.min(curve, heat[i] >= 1 ? s.thermal_continuous_torque_nm : s.plateau_torque_nm, (contracts[fsm.mode()] ?? c).control.effort_limit);
      const tau = Math.max(-limit, Math.min(limit, kp[i] * (targets[i] - data.qpos[qa[i]]) - kd[i] * v));
      data.ctrl[motor] = tau;
      heat[i] = Math.max(0, heat[i] + ((tau / s.thermal_continuous_torque_nm) ** 2 - heat[i]) * dt / s.thermal_time_constant_s);
    });
    mj.mj_step(model, data);
    assert(data.qfrc_applied.every(f => f === 0), 'No external support or jump impulse');
    assert(data.qpos.every(Number.isFinite));
    assert(data.actuator_force.every(f => Math.abs(f) <= s.plateau_torque_nm + 1e-6));
  }
  mj.mj_forward(model, data);
  const contacts = data.contact;
  try {
    for (let i = 0; i < data.ncon; i++) {
      const contact = contacts.get(i);
      footTouchedBox ||= (contact.geom1 === firstBox && footIds.has(contact.geom2)) || (contact.geom2 === firstBox && footIds.has(contact.geom1));
      contact.delete();
    }
  } finally { contacts.delete(); }
  observeStep?.(mode, observation);
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
// Obstacle traversal is not a trained skill of this bundle. Contact and a
// finite, upright response are required; crossing the box is not guaranteed.
assert(footTouchedBox && obstacle[2] > .08 && fsm.mode() === 'locomotion', 'The robot must physically contact the first box and remain upright');
reset(); await run(4);
fsm.setKeyCode('Space', true, false, Math.round(data.time * 1e6)); await run(.1);
fsm.setKeyCode('Space', false, false, Math.round(data.time * 1e6));
let peak = data.qpos[2], airborne = false, jumpSeen = false;
for (let i = 0; i < 1200; i++) { await step(); peak = Math.max(peak, data.qpos[2]); airborne ||= data.ncon === 0 && data.qpos[2] > .15; jumpSeen ||= fsm.mode() === 'jump'; }
assert(jumpSeen && airborne && peak > .2, 'Trained jump must leave the floor');
assert(data.qpos[2] > .07 && data.qpos[2] < .14, 'Jump must land and return to locomotion');
const final = Array.from(data.qpos.slice(0, 3));
const result = { verifiedFiles, referenceModes: [...new Set(JSON.parse(reference).frames.map(f => f.mode))], parity, inferenceError, browserError, stand, walk, obstacle: { position: obstacle, footTouchedBox, crossed: obstacle[0] > .92 }, jump: { peak, airborne, landed: final, mode: fsm.mode() }, wasmMemoryMB: data.qpos.buffer.byteLength / 1e6 };
if (process.argv.includes('--all-modes')) {
  // A repeatable flat-floor fixture, independent of the user's park/obstacles.
  // The shipped scene file is never changed by this test.
  for (let id = 0; id < model.ngeom; id++) {
    if (mj.mj_id2name(model, 5, id)?.startsWith('box_')) model.geom_contype[id] = model.geom_conaffinity[id] = 0;
  }
  reset(); await run(4);
  const parkedAt = Array.from(data.qpos.slice(0, 3));
  const idle = { seconds: 60, inferences: 0, maxCommand: 0, maxGait: 0, maxPostureOffset: 0, maxDrift: 0, minHeight: Infinity, maxHeight: 0 };
  let samples = 0, meanHeight = 0, heightM2 = 0, stepSquared = 0, angularSquared = 0, previousHeight = data.qpos[2];
  observeStep = (mode, obs) => {
    assert.equal(fsm.mode(), 'locomotion', 'Parked robot must remain in the original locomotion policy');
    if (mode) {
      idle.inferences++;
      for (const [name, field] of [['velocity_commands', 'maxCommand'], ['gait_phase', 'maxGait'], ['posture_command', 'maxPostureOffset']]) {
        const term = c.observation.terms.find(t => t.name === name);
        idle[field] = Math.max(idle[field], ...obs.slice(term.offset, term.offset + term.dim).map(Math.abs));
      }
    }
    idle.maxDrift = Math.max(idle.maxDrift, Math.hypot(data.qpos[0] - parkedAt[0], data.qpos[1] - parkedAt[1]));
    idle.minHeight = Math.min(idle.minHeight, data.qpos[2]); idle.maxHeight = Math.max(idle.maxHeight, data.qpos[2]);
    const height = data.qpos[2], delta = height - meanHeight;
    meanHeight += delta / ++samples; heightM2 += delta * (height - meanHeight);
    stepSquared += (height - previousHeight) ** 2; previousHeight = height;
    angularSquared += data.qvel[3] ** 2 + data.qvel[4] ** 2 + data.qvel[5] ** 2;
  };
  await run(idle.seconds); observeStep = undefined;
  assert.equal(idle.maxCommand, 0); assert.equal(idle.maxGait, 0); assert(idle.maxPostureOffset < 1e-6);
  result.idle = { ...idle, meanHeight, heightStd: Math.sqrt(heightM2 / samples), heightStepRms: Math.sqrt(stepSquared / samples), angularSpeedRms: Math.sqrt(angularSquared / samples) };
  assert(result.idle.heightStd < .0002, 'Neutral stance must not regress to the incorrect IMU-frame oscillation');
  console.log('Idle:', JSON.stringify(idle));
  result.modes = [];
  for (const name of Object.keys(bundle.modes).filter(name => name !== 'locomotion')) {
    reset(); await run(4);
    const spec = contracts[name];
    const start = data.time;
    const record = { name, duration: spec.reference?.duration ?? null, inferences: 0, firstPolicy: null, lastPolicy: null, transitions: [], minHeight: Infinity, maxHeight: 0, safeFrames: 0, maxTargetChange: 0 };
    let previous = fsm.mode(), targetsAtEntry;
    observeStep = (mode) => {
      if (fsm.mode() !== previous) { record.transitions.push({ at: +(data.time - start).toFixed(3), mode: fsm.mode() }); previous = fsm.mode(); }
      if (mode === name) {
        record.inferences++; record.firstPolicy ??= data.time - start; record.lastPolicy = data.time - start;
        targetsAtEntry ??= fsm.positions();
        record.maxTargetChange = Math.max(record.maxTargetChange, ...fsm.positions().map((v, i) => Math.abs(v - targetsAtEntry[i])));
      }
      record.safeFrames += Number(fsm.mode() === 'safe');
      record.minHeight = Math.min(record.minHeight, data.qpos[2]); record.maxHeight = Math.max(record.maxHeight, data.qpos[2]);
    };
    assert(queueMode(fsm, name, inputQueue), `${name}: official pad binding`);
    await run(.1);
    await run((spec.reference?.duration ?? 8) + 12);
    observeStep = undefined;
    record.finalMode = fsm.mode(); record.finalPosition = Array.from(data.qpos.slice(0, 3));
    if (!spec.reference) {
      fsm.letGo(Math.round(data.time * 1e6)); await run(.2); record.afterLetGo = fsm.mode();
      assert(queueMode(fsm, 'locomotion', inputQueue)); await run(3);
      record.afterWalkSelection = fsm.mode();
      assert.equal(record.afterWalkSelection, 'locomotion', `${name}: selecting Caminar must leave the claw mode`);
    }
    const ref = spec.reference;
    // Residual jump starts at t_go and samples at control_hz, unlike recorded
    // gestures, whose complete frame count must be played at rec_hz.
    record.expectedInferences = ref ? (ref.residual_action ? Math.ceil(ref.span / spec.control.control_dt) + 1 : ref.n_frames) : null;
    record.passed = record.inferences > 0 && record.safeFrames === 0 && (!ref || (record.finalMode === 'locomotion' && record.inferences === record.expectedInferences));
    result.modes.push(record);
    console.log('Mode:', JSON.stringify(record));
  }
  await mkdir(new URL('../output/', import.meta.url), { recursive: true });
  await writeFile(new URL('../output/jumper-motion-audit.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  assert(result.modes.every(m => m.passed), 'Some modes did not complete the physical audit; see output/jumper-motion-audit.json');
}
console.log(JSON.stringify(result, null, 2));
fsm.free(); velocity.delete(); data.delete(); model.delete();
for (const session of sessions.values()) await session.release();
