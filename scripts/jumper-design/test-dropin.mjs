// Node 24+. Drive the drop-in start with the shipped controller and policies:
// Jumper on the fixed platform steps sideways onto the waiting board (D), then
// steps back (S) to push it over the edge. Only joint motors act; the board
// moves by contact and gravity. Usage: node test-dropin.mjs [calle|costa]
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import { Mlp } from '../../src/app/jumper/mlp.ts';
import { flushInputs } from '../../src/app/jumper/inputs.ts';
import { dropIn } from './dropin.ts';

const which = process.argv[2] ?? 'calle';
const [kind, look] = which === 'costa' ? ['longboard', 'scenic'] : ['skate', 'minimal'];
const root = fileURLToPath(new URL('../../public/jumper/', import.meta.url));
const json = async file => JSON.parse(await readFile(root + file, 'utf8'));
const bundle = await json('app/bundle.json'), physical = await json('physics.json');
const { default: init, WebFsm } = await import(new URL('../../public/jumper/app/runtime/web/controller.js', import.meta.url));
await init({ module_or_path: await readFile(root + 'app/runtime/web/controller.wasm') });
const contracts = {}, trajectories = {};
for (const [mode, spec] of Object.entries(bundle.modes)) { const c = await json('app/' + spec.contract); contracts[mode] = c; if (c.reference) trajectories[mode] = await readFile(root + 'app/' + c.reference.file, 'utf8'); }
const config = await readFile(root + 'app/controller.toml', 'utf8'), c = contracts.locomotion, names = c.wire_joint_order;
const fsm = new WebFsm(config, JSON.stringify(contracts), JSON.stringify({ joint_names: names, joint_pos_lo: names.map(n => c.joint_limits[n][0]), joint_pos_hi: names.map(n => c.joint_limits[n][1]), output_rate_hz: 200 }), 0, JSON.stringify(trajectories));
const mlps = new Map();
const infer = async (mode, obs) => { const file = bundle.modes[mode].models.onnx; if (!mlps.has(file)) { const b = await readFile(root + 'app/' + file); mlps.set(file, new Mlp(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))); } return mlps.get(file).run(Float32Array.from(obs)); };

const mj = await loadMujoco(); mj.FS.mkdir('/jumper');
for (const file of (await json('manifest.json')).runtime.meshes) {
  let dir = '/jumper'; for (const part of file.split('/').slice(0, -1)) { dir += '/' + part; if (!mj.FS.analyzePath(dir, false).exists) mj.FS.mkdir(dir); }
  mj.FS.writeFile('/jumper/' + file, await readFile(root + file));
}
const run = dropIn(kind, look);
const base = await readFile(root + 'scene.xml', 'utf8');
const xml = base.replace(/<geom name="playground_floor"[\s\S]*?(?=<\/worldbody>)/, run.world + '\n').replace('</asset>', run.asset + '\n</asset>');
mj.FS.writeFile('/jumper/dropin.xml', xml);
const model = mj.MjModel.mj_loadXML('/jumper/dropin.xml'), data = new mj.MjData(model), velocity = new mj.DoubleBuffer(6);
const qa = [], va = [], motors = [];
for (const name of names) { const id = mj.mj_name2id(model, 3, name); qa.push(model.jnt_qposadr[id]); va.push(model.jnt_dofadr[id]); motors.push(mj.mj_name2id(model, 19, name + '_motor')); }
const boardQ = model.jnt_qposadr[mj.mj_name2id(model, 3, 'skate_board')], boardV = model.jnt_dofadr[mj.mj_name2id(model, 3, 'skate_board')];
const deck = mj.mj_name2id(model, 5, 'skate_deck'), pad = mj.mj_name2id(model, 5, 'dropin_platform');
const feet = new Set(physical.feet.map(name => mj.mj_name2id(model, 5, name)));
const robotBody = g => model.geom_bodyid[g] > 0 && !mj.mj_id2name(model, 1, model.geom_bodyid[g]).startsWith('skate_');

mj.mj_resetData(model, data);
const yaw = run.spawn.yaw * Math.PI / 180;
data.qpos[0] = run.spawn.position[0]; data.qpos[1] = run.spawn.position[1]; data.qpos[2] = run.spawn.position[2] + physical.standHeight;
data.qpos[3] = Math.cos(yaw / 2); data.qpos[6] = Math.sin(yaw / 2);
qa.forEach((a, i) => { data.qpos[a] = c.default_joint_pos[names[i]]; });
mj.mj_forward(model, data);
const heat = new Float32Array(22), queue = [];
async function step() {
  const now = Math.round(data.time * 1e6);
  mj.mj_objectVelocity(model, data, mj.mjtObj.mjOBJ_XBODY.value, 1, velocity, 1);
  const vel = velocity.GetView();
  fsm.set_state(Float32Array.from(qa, a => data.qpos[a]), Float32Array.from(va, a => data.qvel[a]), Float32Array.from(motors, a => data.actuator_force[a]), Float32Array.from(data.qpos.slice(3, 7)), Float32Array.from(vel.slice(0, 3)), now);
  fsm.setSignal('base_lin_vel', Float32Array.from(vel.slice(3, 6))); fsm.set_command(0, 0, 0, now);
  flushInputs(fsm, queue, now);
  const mode = fsm.tick(now);
  if (mode !== undefined) fsm.resume(await infer(mode, fsm.observation()));
  const targets = fsm.positions(), kp = fsm.kp(), kd = fsm.kd(), dt = (contracts[fsm.mode()] ?? c).control.sim_dt, s = physical.servo, rpm = Math.PI * 2 / 60;
  model.opt.timestep = dt;
  for (let j = 0; j < Math.round(.005 / dt); j++) {
    motors.forEach((motor, i) => {
      const v = data.qvel[va[i]], w = Math.abs(v), curve = w >= s.cutoff_speed_rpm * rpm ? 0 : s.plateau_torque_nm * Math.exp(-Math.max(0, w - s.corner_speed_rpm * rpm) / (s.decay_speed_rpm * rpm));
      const limit = Math.min(curve, heat[i] >= 1 ? s.thermal_continuous_torque_nm : s.plateau_torque_nm, (contracts[fsm.mode()] ?? c).control.effort_limit);
      const tau = Math.max(-limit, Math.min(limit, kp[i] * (targets[i] - data.qpos[qa[i]]) - kd[i] * v));
      data.ctrl[motor] = tau; heat[i] = Math.max(0, heat[i] + ((tau / s.thermal_continuous_torque_nm) ** 2 - heat[i]) * dt / s.thermal_time_constant_s);
    });
    mj.mj_step(model, data);
    if (!data.qfrc_applied.every(f => f === 0)) throw new Error('external force');
  }
  mj.mj_forward(model, data);
}
const seconds = async t => { for (let i = 0; i < Math.round(t / .005); i++) await step(); };
const key = (code, down) => fsm.setKeyCode(code, down, false, Math.round(data.time * 1e6));
function state() {
  // Robot base in the board's frame (x along, y left, z up), board speed, contacts.
  const q = data.qpos, b = [q[boardQ], q[boardQ + 1], q[boardQ + 2]], w = q[boardQ + 3], x = q[boardQ + 4], y = q[boardQ + 5], z = q[boardQ + 6];
  const d = [q[0] - b[0], q[1] - b[1], q[2] - b[2]];
  const r = [[1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)], [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)], [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]];
  const local = r.map(row => row[0] * d[0] + row[1] * d[1] + row[2] * d[2]);
  let onDeck = 0, onPad = 0, ground = 0; const touching = new Set();
  const contacts = data.contact;
  for (let i = 0; i < data.ncon; i++) {
    const k = contacts.get(i), g = [k.geom1, k.geom2]; k.delete();
    const foot = g.find(id => feet.has(id)), other = g.find(id => id !== foot);
    if (foot === undefined) continue;
    if (other === deck) onDeck++; else if (other === pad) onPad++; else if (!robotBody(other)) { ground++; touching.add(mj.mj_id2name(model, 5, foot) + '>' + mj.mj_id2name(model, 5, other)); }
  }
  contacts.delete();
  const speed = Math.hypot(data.qvel[boardV], data.qvel[boardV + 1], data.qvel[boardV + 2]);
  return { t: +data.time.toFixed(2), along: +local[0].toFixed(3), side: +local[1].toFixed(3), up: +local[2].toFixed(3), speed: +speed.toFixed(2), onDeck, onPad, ground, mode: fsm.mode(), boardX: +b[0].toFixed(2), touching: [...touching].join(' ') };
}
await seconds(3); console.log('settled', state());
const [pushKey, pushTime] = (process.env.PUSH ?? 'KeyS,0.6').split(','), stopSide = +(process.env.STOPSIDE ?? 0.02);
key('KeyD', true);
for (let i = 0; i < 160 && Math.abs(state().side) > stopSide; i++) await seconds(0.05);
key('KeyD', false); await seconds(2); console.log('on deck', state());
if (pushKey !== 'none') { key(pushKey, true); await seconds(+pushTime); key(pushKey, false); }
for (let t = 0; t < 12; t += 2) { await seconds(2); console.log('ride', state()); }
