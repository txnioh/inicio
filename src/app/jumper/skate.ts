import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import * as THREE from 'three';
import { coneMesh, obstacleCourse } from './course.ts';
import { mountainCourse } from './mountain.ts';
import { frameQuat, nearest, nearestAll, type Course } from './track.ts';
import { safeTurn, skateboardParts } from './skateboard.ts';

// Jumper riding a skateboard down a hill (see course.ts). The board is a free
// body with real truck geometry: each hanger turns about a 45° pivot axis
// against a bushing spring, so leaning the deck steers it. Nothing pushes the
// robot or the board: gravity, contacts and the original policies ride. The
// only control is where Jumper puts its weight on the deck.

// Two boards, both as wide as Jumper needs: it stands sideways, as a skater
// does, and its feet spread 40 cm along the deck and 33 cm across. A real deck
// is half as wide, so wheels and trucks are scaled up with the deck too.
// - skate: a popsicle deck, 66 cm flat plus two 13 cm kicks at 19°, 44 cm wide,
//   50 cm wheelbase, traditional 45° high trucks on 6 mm risers and 64 mm
//   wheels, which clear the deck through about 9° of truck turn.
// - longboard: a drop-through deck, 116 × 46 cm with wheel wells, 80 cm
//   wheelbase (about 70 % of its length, as real drop-throughs), reverse-kingpin
//   50° trucks with softer bushings (2.5 against 4 N·m/rad) and 88 mm wheels
//   (about 15° of truck turn). Mounted through the deck, it sits lower than the
//   skate despite the bigger wheels.
export type BoardKind = 'skate' | 'longboard';
export interface Board {
  kind: BoardKind; half: number[]; kicks: boolean; kick: [number, number]; base: number; track: number; wheel: number; wheelHalf: number;
  /** start: where the deck centre waits, in metres past the start ramp's foot. */
  axle: number; pivot: number; bushing: number; start: number; mass: number;
}
export const boards: Record<BoardKind, Board> = {
  skate: { kind: 'skate', half: [0.33, 0.22, 0.006], kicks: true, kick: [0.13, 0.33], base: 0.25, track: 0.19, wheel: 0.032, wheelHalf: 0.017, axle: -0.064, pivot: 50, bushing: 4, start: 0.7, mass: 0.75 },
  longboard: { kind: 'longboard', half: [0.58, 0.23, 0.0065], kicks: false, kick: [0, 0], base: 0.4, track: 0.2, wheel: 0.044, wheelHalf: 0.024, axle: -0.016, pivot: 50, bushing: 2.5, start: 0.62, mass: 1.15 },
};
/** Each board has its run: the skate weaves through cones, the longboard carves a coast road. */
export const courses: Record<BoardKind, Course> = { skate: obstacleCourse, longboard: mountainCourse };
/** The default board; the scene takes another by kind. */
export const board = boards.skate;
const deckHeight = (b: Board) => b.wheel - b.axle;

export interface SkateStats {
  released: boolean; pilot: boolean; speed: number; top: number; time: number; finished: boolean; cones: number;
  feed: { id: number; text: string }[]; weight: [number, number]; target: [number, number]; lean: number; edge: number;
}

// Where Jumper's centre of mass may sit on the deck, from the middle, before its
// feet reach an edge (its claws reach 19 cm forward, its rear feet 14 cm back,
// so the deck is 44 cm wide). Past the feet, the body leans: the posture pitch
// extends the rear legs and folds the front ones, moving weight onto the toes
// without moving the feet (and the reverse for the heels).
export const stance = { toes: 0.03, heels: 0.035, along: 0.05, shift: 0.08 };
// Its centre of mass sits 1 cm ahead of the base frame, along its own x.
const comAhead = 0.01;
// Inputs: [toes(-)/heels(+), nose(+)/tail(-), turn left(+)/right(-)].
const weightKeys: Record<string, [number, number, number]> = {
  KeyW: [-1, 0, 0], ArrowUp: [-1, 0, 0], KeyS: [1, 0, 0], ArrowDown: [1, 0, 0],
  KeyA: [0, 0, 1], KeyD: [0, 0, -1], ArrowLeft: [0, 0, 1], ArrowRight: [0, 0, -1], KeyJ: [0, 0, 1], KeyL: [0, 0, -1],
};

// The deck centre at rest on the start ramp, and where the stopper meets the front wheels.
// The deck centre at rest on the start ramp, lifted along the road normal, and
// the frame where the stopper meets the front wheels.
function startOf(b: Board, course: Course) {
  const frame = course.frame(course.rampStart + b.start), q = frameQuat(frame), n = rotate(q, [0, 0, 1]);
  return { p: frame.p.map((v, i) => v + n[i] * (deckHeight(b) + 0.001)), q };
}
const stopperOf = (b: Board, course: Course) => course.frame(course.rampStart + b.start + b.base + b.wheel + 0.012);

const f = (value: number) => value.toFixed(5);
function boardXml(board: Board, course: Course) {
  // Trucks stop turning just before a wheel would touch the deck (wheelbite).
  const turn = safeTurn(board);
  const start = startOf(board, course), c = Math.cos(board.pivot * Math.PI / 180), s = Math.sin(board.pivot * Math.PI / 180), [hx, hy, hz] = board.half;
  const truck = (side: number, name: string) => `
    <geom name="skate_${name}_base" type="box" pos="${side * board.base} 0 -0.011" size="0.04 0.03 0.005" mass="0.06" contype="0" conaffinity="0"/>
    <body name="skate_${name}_hanger" pos="${side * board.base} 0 ${board.axle}">
      <joint name="skate_${name}_pivot" type="hinge" pos="0 0 0.014" axis="${f(-side * c)} 0 ${f(-s)}" stiffness="${board.bushing}" damping="0.05" range="${f(-turn)} ${f(turn)}" limited="true"/>
      <geom name="skate_${name}_hanger" type="capsule" fromto="0 ${-(board.track - 0.02)} 0 0 ${board.track - 0.02} 0" size="0.008" mass="0.16" contype="128" conaffinity="0"/>
      ${[1, -1].map(w => `<body name="skate_${name}_wheel_${w}" pos="0 ${w * board.track} 0">
        <joint name="skate_${name}_wheel_${w}" type="hinge" axis="0 1 0" damping="0.00002" frictionloss="0.00002"/>
        <geom name="skate_${name}_wheel_${w}" type="cylinder" size="${board.wheel} ${board.wheelHalf}" euler="1.5708 0 0" mass="${board.kind === 'longboard' ? 0.06 : 0.035}" contype="128" conaffinity="0" friction="0.9 0.005 0.0001"/>
      </body>`).join('')}
    </body>`;
  return `<body name="skate_board" pos="${start.p.map(f).join(' ')}" quat="${start.q.map(f).join(' ')}">
    <freejoint name="skate_board"/>
    <geom name="skate_deck" type="box" size="${hx} ${hy} ${hz}" mass="${board.mass}" contype="1" conaffinity="1" friction="0.9 0.01 0.01"/>
    ${(board.kicks ? [1, -1] : []).map(side => { const [length, angle] = board.kick; return `<geom name="skate_kick_${side}" type="box" pos="${f(side * (hx + length / 2 * Math.cos(angle)))} 0 ${f(length / 2 * Math.sin(angle))}" euler="0 ${f(-side * angle)} 0" size="${f(length / 2)} ${hy} ${hz}" mass="0.09" contype="1" conaffinity="1"/>`; }).join('')}
    ${truck(1, 'front')}${truck(-1, 'back')}
  </body>`;
}

/** Swap the flat playground (floor and boxes) for the downhill and the board. */
export function skateXml(xml: string, kind: BoardKind = 'skate') {
  const course = courses[kind], hill = course.xml(), board = boards[kind], frame = stopperOf(board, course), q = frameQuat(frame), n = rotate(q, [0, 0, 1]);
  const stopper = `<geom name="skate_stopper" type="box" pos="${frame.p.map((v, i) => f(v + n[i] * 0.008)).join(' ')}" quat="${q.map(f).join(' ')}" size="0.01 0.3 0.01" contype="1" conaffinity="129"/>`;
  const replaced = xml.replace(/<geom name="playground_floor"[\s\S]*?(?=<\/worldbody>)/, `${hill.world}\n${stopper}\n${boardXml(board, course)}\n`).replace('</asset>', `${hill.asset}\n</asset>`);
  if (replaced === xml || !replaced.includes('skate_board')) throw new Error('No se pudo montar la bajada.');
  return replaced;
}

type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
const rotate = (q: ArrayLike<number>, v: number[], inverse = false) => {
  const w = q[0], x = inverse ? -q[1] : q[1], y = inverse ? -q[2] : q[2], z = inverse ? -q[3] : q[3];
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
};
const mul = (a: number[], b: number[]) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];

export class Skate {
  readonly drawables: { id: number; mesh: Mesh; name: string; collision: boolean; body?: { id: number; position: THREE.Vector3; quaternion: THREE.Quaternion } }[] = [];
  private boardBody: number;
  private boardQ: number;
  private boardV: number;
  private stopper: number;
  private deckGeoms = new Set<number>();
  private cones: { q: number; x: number; y: number; down: boolean }[] = [];
  private stopperMesh: THREE.Object3D;
  private released = false;
  private releasedAt = 0;
  private finishedAt = -1;
  private pilot = false;
  private top = 0;
  private onDeck = true;
  private offBoard = false;
  private stuckSince = -1;
  private restartAt = -1;
  private route = '';
  private feed: { id: number; text: string }[] = [];
  private feedId = 0;
  private held = new Map<string, [number, number, number]>();
  private pilotTurn = 0;
  private travel = 1;
  private edge = 1;
  private lean = 0;
  private stick: [number, number] = [0, 0];
  private target: [number, number] = [0, 0];
  private weight: [number, number] = [0, 0];
  private correcting = [false, false, false];
  private axes = [0, 0, 0, 0];
  private steer: (lx: number, ly: number, rx: number, ry: number, nowUs: number) => void;
  private mujoco: MainModule;
  private model: MjModel;
  private feet: Set<number>;
  readonly board: Board;
  readonly course: Course;
  private pathIndex = 0;

  // Plain fields rather than parameter properties, so Node can run this file in tests.
  constructor(mujoco: MainModule, model: MjModel, scene: THREE.Scene, feet: Set<number>, steer: (lx: number, ly: number, rx: number, ry: number, nowUs: number) => void, kind: BoardKind = 'skate') {
    this.mujoco = mujoco; this.model = model; this.feet = feet; this.steer = steer; this.board = boards[kind]; this.course = courses[kind];
    const id = (type: number, name: string) => { const value = mujoco.mj_name2id(model, type, name); if (value < 0) throw new Error(`Falta ${name} en la bajada.`); return value; };
    this.boardBody = id(1, 'skate_board');
    const joint = id(3, 'skate_board');
    this.boardQ = model.jnt_qposadr[joint];
    this.boardV = model.jnt_dofadr[joint];
    this.stopper = id(5, 'skate_stopper');
    for (const name of this.board.kicks ? ['skate_deck', 'skate_kick_1', 'skate_kick_-1'] : ['skate_deck']) this.deckGeoms.add(id(5, name));
    this.course.cones.forEach(({ x, y }, i) => this.cones.push({ q: model.jnt_qposadr[model.body_jntadr[id(1, `skate_cone_${i}`)]], x, y, down: false }));
    this.stopperMesh = this.course.build(scene, stopperOf(this.board, this.course));
    this.buildBoard(scene);
  }

  private attach(scene: THREE.Scene, bodyId: number, mesh: Mesh, name: string) {
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    // The mesh's own placement is its offset in the body frame; the renderer
    // composes it with the body pose every frame.
    this.drawables.push({ id: -1, mesh, name, collision: false, body: { id: bodyId, position: mesh.position.clone(), quaternion: mesh.quaternion.clone() } });
  }

  private buildBoard(scene: THREE.Scene) {
    const m = this.model;
    // The physical primitives of the board, shown only in the collision view.
    const wire = new THREE.MeshBasicMaterial({ color: '#dc5f2b', wireframe: true });
    for (let id = 0; id < m.ngeom; id++) {
      if (m.geom_bodyid[id] < this.boardBody) continue;
      const name = this.mujoco.mj_id2name(m, 5, id) ?? '';
      if (!/^skate_(deck|kick|front|back)/.test(name)) continue;
      const s = [m.geom_size[id * 3], m.geom_size[id * 3 + 1], m.geom_size[id * 3 + 2]];
      const geometry = m.geom_type[id] === 6 ? new THREE.BoxGeometry(s[0] * 2, s[1] * 2, s[2] * 2)
        : m.geom_type[id] === 3 ? new THREE.CapsuleGeometry(s[0], s[1] * 2, 4, 12).rotateX(Math.PI / 2)
          : new THREE.CylinderGeometry(s[0], s[0], s[1] * 2, 24).rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, wire);
      mesh.visible = false;
      scene.add(mesh);
      this.drawables.push({ id, mesh, name, collision: true });
    }
    const body = (name: string) => this.mujoco.mj_name2id(m, 1, name);
    for (const part of skateboardParts(this.board)) {
      const name = part.side === 1 ? 'front' : 'back';
      const bodyId = part.body === 'deck' ? this.boardBody : part.body === 'hanger' ? body(`skate_${name}_hanger`) : body(`skate_${name}_wheel_${part.wheel}`);
      this.attach(scene, bodyId, part.mesh as Mesh, `skate_${part.body}`);
    }
    this.course.cones.forEach((_, i) => {
      for (const child of [...coneMesh().children] as Mesh[]) this.attach(scene, body(`skate_cone_${i}`), child, 'skate_cone');
    });
  }

  /** Called after mj_resetData: stand Jumper sideways on the deck. */
  reset(data: MjData) {
    this.released = false; this.releasedAt = 0; this.finishedAt = -1;
    this.top = 0; this.onDeck = true; this.offBoard = false; this.route = ''; this.stuckSince = -1; this.restartAt = -1;
    this.feed = [];
    this.held.clear(); this.stick = [0, 0]; this.pilotTurn = 0; this.target = [0, 0]; this.weight = [0, 0];
    this.correcting = [false, false, false]; this.axes = [0, 0, 0, 0]; this.travel = 1; this.lean = 0;
    for (const cone of this.cones) cone.down = false;
    this.setStopper(true);
    const start = startOf(this.board, this.course), q = mul(start.q, [Math.SQRT1_2, 0, 0, -Math.SQRT1_2]);
    // Robot frame in deck coordinates: its x across the deck, its y along it.
    const r = rotate(start.q, [0, comAhead, this.board.half[2] + 0.1075]);
    for (let i = 0; i < 3; i++) data.qpos[i] = start.p[i] + r[i];
    this.pathIndex = nearestAll(this.course.path.points, start.p[0], start.p[1]);
    for (let i = 0; i < 4; i++) data.qpos[3 + i] = q[i];
  }

  private setStopper(on: boolean) {
    this.model.geom_contype[this.stopper] = on ? 1 : 0;
    this.model.geom_conaffinity[this.stopper] = on ? 129 : 0;
    this.stopperMesh.rotation.z = on ? 0 : Math.PI / 2;
  }

  private say(text: string) { this.feed = [...this.feed.slice(-3), { id: ++this.feedId, text }]; }

  release(time = 0) {
    if (this.released) return;
    this.released = true; this.releasedAt = time;
    this.setStopper(false);
  }
  togglePilot() { this.pilot = !this.pilot; this.pilotTurn = 0; return this.pilot; }

  /** Walking keys shift weight on the deck instead of stepping off it. Jumping is off. */
  key(code: string, down: boolean) {
    if (code === 'Space') return true;
    const shift = weightKeys[code];
    if (!shift) return false;
    if (down) this.held.set(code, shift); else this.held.delete(code);
    return true;
  }
  /** The touch stick: sideways turns (relative to travel), up/down is toes/heels. */
  pad(x: number, y: number) { this.stick = [y, -x]; }
  letGo() { this.held.clear(); this.stick = [0, 0]; }

  // Feet stay planted unless the stance is off target by more than about a
  // centimetre; then the shipped walking command takes the smallest step that
  // carries the base back. The posture pitch leans the body over toes or heels.
  private balance(data: MjData, mode: string, policyRunning: boolean) {
    const nowUs = Math.round(data.time * 1e6);
    const q = data.qpos.subarray(this.boardQ + 3, this.boardQ + 7);
    // Turning left or right depends on the way the board is rolling: carving
    // left going nose-first loads the heels, going tail-first the toes.
    const velocity = rotate(q, [data.qvel[this.boardV], data.qvel[this.boardV + 1], data.qvel[this.boardV + 2]], true);
    if (Math.abs(velocity[0]) > 0.15) this.travel = Math.sign(velocity[0]);
    let lean = 0, turn = this.pilot ? this.pilotTurn : 0;
    for (const [a, , c] of this.held.values()) { lean += a; turn += c; }
    lean = THREE.MathUtils.clamp(lean + this.stick[0] + (turn - this.stick[1]) * this.travel, -1, 1);
    const across = lean < 0 ? lean * stance.toes : lean * stance.heels;
    const step = stance.shift * 0.005;
    this.target = [this.target[0] + THREE.MathUtils.clamp(across - this.target[0], -step, step), 0];
    // The body lean eases in like a rider's, about 0.4 s end to end.
    this.lean += THREE.MathUtils.clamp(lean - this.lean, -0.025, 0.025);
    const local = rotate(q, [data.qpos[0] - data.qpos[this.boardQ], data.qpos[1] - data.qpos[this.boardQ + 1], data.qpos[2] - data.qpos[this.boardQ + 2]], true);
    const heading = rotate(q, rotate(data.qpos.subarray(3, 7), [1, 0, 0]), true);
    // The feet's stance, as where the centre of mass sits when standing level.
    this.weight = [local[1] + comAhead * heading[1], local[0] + comAhead * heading[0]];
    if (!policyRunning || mode !== 'locomotion' || !this.onDeck) { this.correcting = [false, false, false]; this.send(0, 0, 0, 0, nowUs); return; }
    const error = [this.target[0] - this.weight[0], this.target[1] - this.weight[1], Math.atan2(heading[1], heading[0]) + Math.PI / 2];
    if (error[2] > Math.PI) error[2] -= 2 * Math.PI;
    const start = [0.012, 0.015, 0.08], stop = [0.004, 0.005, 0.03];
    const command = error.map((e, i) => {
      if (Math.abs(e) > start[i]) this.correcting[i] = true; else if (Math.abs(e) < stop[i]) this.correcting[i] = false;
      return this.correcting[i] ? e : 0;
    });
    // Body frame: its forward is the deck's -y, its left the deck's +x. Speeds
    // stay just above the policy's 0.06 m/s standing band, so it shuffles.
    const speed = (e: number) => e && Math.sign(e) * THREE.MathUtils.clamp(Math.abs(e) * 8, 0.08, 0.4);
    const forward = -speed(command[0]), left = speed(command[1]);
    const rx = command[2] ? Math.sign(command[2]) * 0.56 : 0;
    // Ry is the posture pitch: negative tips its nose (the toe side) down,
    // extending the rear legs; positive sits back onto the heels.
    this.send(-left / 0.8, -forward / 0.8, rx, Math.round(this.lean * 20) / 20, nowUs);
  }
  // Only report the stick when it moves, as a real pad does.
  private send(lx: number, ly: number, rx: number, ry: number, nowUs: number) {
    if (lx === this.axes[0] && ly === this.axes[1] && rx === this.axes[2] && ry === this.axes[3]) return;
    this.axes = [lx, ly, rx, ry];
    this.steer(lx, ly, rx, ry, nowUs);
  }

  /** Before each controller tick. The pilot steers with the same weight input a person has. */
  beforeControl(data: MjData, mode: string, policyRunning: boolean) {
    if (this.pilot && policyRunning) {
      if (!this.released && mode === 'locomotion' && data.time > 2.5) this.release(data.time);
      // Pure pursuit on the race line, looking about 1 s ahead (at least 2.4 m),
      // damped by the yaw rate.
      const x = data.qpos[this.boardQ], y = data.qpos[this.boardQ + 1], q = data.qpos.subarray(this.boardQ + 3, this.boardQ + 7);
      const nose = rotate(q, [1, 0, 0]), ahead = Math.max(2.4, Math.hypot(data.qvel[this.boardV], data.qvel[this.boardV + 1]));
      const { points, s } = this.course.path;
      let target = this.pathIndex;
      while (target < points.length - 1 && s[target] < s[this.pathIndex] + ahead) target++;
      let error = Math.atan2(points[target][1] - y, points[target][0] - x) - Math.atan2(nose[1], nose[0]);
      error = Math.atan2(Math.sin(error), Math.cos(error));
      const yawRate = rotate(q, [data.qvel[this.boardV + 3], data.qvel[this.boardV + 4], data.qvel[this.boardV + 5]])[2];
      this.pilotTurn = THREE.MathUtils.clamp(error * 4 - yawRate * 0.6, -1, 1);
    }
    this.balance(data, mode, policyRunning);
  }

  /** After physics: read the ride back from contacts and the bodies' motion. */
  afterControl(data: MjData) {
    const x = data.qpos[this.boardQ], y = data.qpos[this.boardQ + 1], t = data.time;
    const speed = Math.hypot(data.qvel[this.boardV], data.qvel[this.boardV + 1]);
    let deck = false, ground = false;
    const contacts = data.contact;
    try {
      for (let i = 0; i < data.ncon; i++) {
        const contact = contacts.get(i);
        if (!contact) continue;
        const foot = this.feet.has(contact.geom1) ? contact.geom2 : this.feet.has(contact.geom2) ? contact.geom1 : -1;
        const body = foot >= 0 ? this.model.geom_bodyid[foot] : -1;
        // Robot links are bodies 1…board-1; anything else a foot touches is outside the deck.
        if (this.deckGeoms.has(foot)) deck = true;
        else if (foot >= 0 && (body === 0 || body >= this.boardBody)) ground = true;
        contact.delete();
      }
    } finally { contacts.delete(); }
    if (ground && !this.offBoard) { this.offBoard = true; this.say('Fuera de la tabla'); }
    this.onDeck = deck;
    // Closest foot to a side edge of the deck, in metres (negative: overhanging).
    const q = data.qpos.subarray(this.boardQ + 3, this.boardQ + 7);
    this.edge = 1;
    for (const foot of this.feet) {
      const p = rotate(q, [data.geom_xpos[foot * 3] - data.qpos[this.boardQ], data.geom_xpos[foot * 3 + 1] - data.qpos[this.boardQ + 1], data.geom_xpos[foot * 3 + 2] - data.qpos[this.boardQ + 2]], true);
      this.edge = Math.min(this.edge, this.board.half[1] - Math.abs(p[1]));
    }
    if (deck && this.finishedAt < 0) this.top = Math.max(this.top, speed);
    // A cone is down once it has tipped past 35° or slid 4 cm.
    for (const cone of this.cones) {
      if (cone.down) continue;
      const c = data.qpos, up = 1 - 2 * (c[cone.q + 4] ** 2 + c[cone.q + 5] ** 2);
      if (up < Math.cos(35 * Math.PI / 180) || Math.hypot(c[cone.q] - cone.x, c[cone.q + 1] - cone.y) > 0.04) { cone.down = true; this.say('Cono derribado'); }
    }
    // Stopped, or no longer riding, for 2 s: back to the start (also after the finish).
    const stuck = this.released && t - this.releasedAt > 1.5 && (speed < 0.05 || this.offBoard);
    if (!stuck) this.stuckSince = -1;
    else if (this.stuckSince < 0) this.stuckSince = t;
    else if (t - this.stuckSince > 2 && this.restartAt < 0) { this.restartAt = t; if (this.finishedAt < 0) this.say('Atascado · vuelta a la salida'); }
    // After the finish, 6 s to read the time; the board may rock in the run-out.
    if (this.finishedAt >= 0 && t - this.finishedAt > 6 && this.restartAt < 0) this.restartAt = t;
    // Progress along the line: nearest point of the pilot's path.
    this.pathIndex = nearest(this.course.path.points, x, y, this.pathIndex);
    const route = this.route ? undefined : this.course.route?.(x, y);
    if (route) { this.route = route; this.say(`Por la ${route}`); }
    if (this.finishedAt < 0 && this.released && this.course.path.s[this.pathIndex] >= this.course.finish) {
      this.finishedAt = t;
      const down = this.cones.filter(cone => cone.down).length;
      this.say(`Meta · ${(t - this.releasedAt).toFixed(1).replace('.', ',')} s${down ? ` · ${down} ${down === 1 ? 'cono' : 'conos'}` : ' · limpio'}`);
    }
  }

  stats(data: MjData): SkateStats {
    const time = !this.released ? 0 : (this.finishedAt >= 0 ? this.finishedAt : data.time) - this.releasedAt;
    return {
      released: this.released, pilot: this.pilot, speed: Math.hypot(data.qvel[this.boardV], data.qvel[this.boardV + 1]), top: this.top, time,
      finished: this.finishedAt >= 0, cones: this.cones.filter(cone => cone.down).length, feed: this.feed, weight: this.weight, target: this.target, lean: this.lean, edge: this.edge,
    };
  }
  /** True once the ride has been stuck for 2 s; the host then resets the scene. */
  get wantsRestart() { return this.restartAt >= 0; }
  /** Board position and heading, for the chase camera. */
  boardPose(data: MjData) {
    const q = data.qpos.subarray(this.boardQ + 3, this.boardQ + 7), nose = rotate(q, [1, 0, 0]);
    const v = [data.qvel[this.boardV], data.qvel[this.boardV + 1], data.qvel[this.boardV + 2]];
    return { x: data.qpos[this.boardQ], y: data.qpos[this.boardQ + 1], z: data.qpos[this.boardQ + 2], v, heading: Math.hypot(v[0], v[1]) > 0.3 ? Math.atan2(v[1], v[0]) : Math.atan2(nose[1], nose[0]) };
  }
}
