import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// A downhill run sized to Jumper (it stands ~18 cm tall: roughly a 1:10 road).
// Everything is downhill and nothing needs a jump: the only control is weight on
// the board, so the course asks for steering. Loose cones to dodge, an island
// that splits the road into two lines, a cone slalom, a bollard chicane, and a
// short uphill run-out after the finish.
//
// Physics is plain convex pieces: one box per chord of the road profile (6 m
// wide, so the verges are solid too), curbs, the island, bollards, and free
// cone bodies that the board and robot can knock over.

const rad = Math.PI / 180;
export const road = { half: 1.5, verge: 3, curb: [0.05, 0.035] as [number, number], start: -1.2, rollIn: 5 };

import { resample, stopperBoom, type Course, type Frame, type Point } from './track.ts';
function profile() {
  let x = road.start, z = 0, heading = -road.rollIn * rad;
  const points: Point[] = [[x, z]], marks: Record<string, number> = {};
  const line = (length: number) => { x += length * Math.cos(heading); z += length * Math.sin(heading); points.push([x, z]); };
  const turn = (radius: number, degrees: number) => {
    const to = degrees * rad, n = Math.max(1, Math.ceil(Math.abs(to - heading) * radius / 0.1)), d = (to - heading) / n;
    for (let i = 0; i < n; i++) {
      const chord = 2 * radius * Math.sin(Math.abs(d) / 2);
      x += chord * Math.cos(heading + d / 2); z += chord * Math.sin(heading + d / 2); heading += d; points.push([x, z]);
    }
  };
  line(1.2);                                // start ramp with the stopper
  turn(3, -7); line(1.6);                   // drop: builds about 2 m/s
  turn(4, -1.5); marks.cones = x; line(7);     // loose cones
  turn(4, -0.8); marks.split = x; line(9.5);   // island: pick a side
  turn(4, -0.6); marks.slalom = x; line(18);   // slalom
  turn(4, -1); marks.chicane = x; line(9);     // bollard chicane
  turn(4, 0); marks.finish = x + 0.6; line(2.5);
  turn(3, 4); line(4);                      // uphill run-out
  marks.end = x;
  const lowest = Math.min(...points.map(p => p[1]));
  for (const p of points) p[1] -= lowest - 0.02;
  return { points, marks };
}
export const course = profile();
const { points, marks } = course;

/** Road surface height at x. */
export function surfaceAt(x: number) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) if (points[i][0] >= x) return points[i - 1][1] + (x - points[i - 1][0]) / (points[i][0] - points[i - 1][0]) * (points[i][1] - points[i - 1][1]);
  return points[points.length - 1][1];
}
const slopeAt = (x: number) => { const d = 0.05; return Math.atan2(surfaceAt(x + d) - surfaceAt(x - d), 2 * d); };

export const obstacles = {
  // Spacing follows what the board can do: at ~2.5 m/s, full lean turns about
  // 16°/s after half a second, so moving 1 m sideways takes 4–5 m of road. The
  // slopes keep it near that speed: about 1° balances the rolling losses.
  // Loose cones (x, y); the slalom is 6 m between cones.
  cones: [
    [marks.cones + 2.5, 0.4], [marks.cones + 5.5, -0.1],
    [marks.split + 5.5, 0.95],
    [marks.slalom + 3.5, -0.3], [marks.slalom + 9.5, 0.3], [marks.slalom + 15.5, -0.3],
  ] as Point[],
  island: { x0: marks.split + 3, x1: marks.split + 8.3, half: 0.25, height: 0.2 },
  // Two rows of bollards from the curbs: the first leaves the left open, the second the right.
  bollards: [
    ...[-1.38, -1.06, -0.74, -0.42].map(y => [marks.chicane + 2, y] as Point),
    ...[1.38, 1.06, 0.74, 0.42].map(y => [marks.chicane + 8, y] as Point),
  ],
  finish: marks.finish,
};
/** A clean line through it all, for the pilot: right of the island. */
export const raceLine: Point[] = [
  [road.start, 0], [marks.cones, 0], [marks.cones + 2.5, -0.35], [marks.cones + 5.5, -0.8],
  [marks.split + 8.6, -0.85],
  [marks.slalom + 3.5, 0.35], [marks.slalom + 9.5, -0.35], [marks.slalom + 15.5, 0.35],
  [marks.chicane + 2, 0.45], [marks.chicane + 8, -0.45], [marks.finish + 1, 0], [marks.end, 0],
];

const f = (v: number) => v.toFixed(5);
const pitchQuat = (pitch: number) => [Math.cos(pitch / 2), 0, Math.sin(pitch / 2), 0];

interface Block { name: string; kind: 'road' | 'curb' | 'island' | 'wall'; pos: number[]; quat: number[]; size: number[] }
function blocks() {
  const list: Block[] = [], t = 0.15;
  points.slice(0, -1).forEach((p, i) => {
    const n = points[i + 1], th = Math.atan2(n[1] - p[1], n[0] - p[0]), length = Math.hypot(n[0] - p[0], n[1] - p[1]);
    const q = pitchQuat(-th), cx = (p[0] + n[0]) / 2, cz = (p[1] + n[1]) / 2;
    list.push({ name: `road_${i}`, kind: 'road', pos: [cx + Math.sin(th) * t, 0, cz - Math.cos(th) * t], quat: q, size: [length / 2 + 0.002, road.verge, t] });
    for (const side of [-1, 1]) {
      const [w, h] = road.curb;
      list.push({ name: `curb_${i}_${side}`, kind: 'curb', pos: [cx - Math.sin(th) * h / 2, side * (road.half + w / 2), cz + Math.cos(th) * h / 2], quat: q, size: [length / 2 + 0.002, w / 2, h / 2] });
    }
  });
  const { x0, x1, half, height } = obstacles.island, ix = (x0 + x1) / 2;
  list.push({ name: 'island', kind: 'island', pos: [ix, 0, surfaceAt(ix) + height / 2 - 0.04], quat: pitchQuat(-slopeAt(ix)), size: [(x1 - x0) / 2, half, height / 2 + 0.04] });
  const end = marks.end;
  list.push({ name: 'end_wall', kind: 'wall', pos: [end + 0.1, 0, surfaceAt(end) + 0.15], quat: [1, 0, 0, 0], size: [0.1, road.half + 0.1, 0.15] });
  return list;
}

// Cones are 12 cm tall with an 11 cm foot: at Jumper's scale, a street cone.
export const cone = { height: 0.12, foot: 0.055, top: 0.012 };
function conePoints() {
  const points: number[][] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) points.push([sx * cone.foot, sy * cone.foot, 0], [sx * cone.foot, sy * cone.foot, 0.008]);
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; points.push([cone.top * Math.cos(a), cone.top * Math.sin(a), cone.height]); }
  return points;
}

export function courseXml() {
  const out = ['<geom name="playground_floor" type="plane" size="80 80 .1" contype="1" conaffinity="129" friction="1 .01 .01"/>'];
  for (const b of blocks()) out.push(`<geom name="skate_${b.name}" type="box" pos="${b.pos.map(f).join(' ')}" quat="${b.quat.map(f).join(' ')}" size="${b.size.map(f).join(' ')}" contype="1" conaffinity="129" friction="1 .01 .01"/>`);
  obstacles.bollards.forEach(([x, y], i) => out.push(`<geom name="skate_bollard_${i}" type="cylinder" pos="${f(x)} ${f(y)} ${f(surfaceAt(x) + 0.12)}" size="0.03 0.12" contype="1" conaffinity="129" friction="0.6 .01 .01"/>`));
  // Cones are loose: 80 g of soft plastic, free to slide and tip. They meet the
  // deck, the robot and the road, not the wheels: a cone the nose has knocked
  // flat goes under the board instead of wedging the trucks like a chock.
  obstacles.cones.forEach(([x, y], i) => {
    const pitch = -slopeAt(x), q = pitchQuat(pitch);
    out.push(`<body name="skate_cone_${i}" pos="${f(x)} ${f(y)} ${f(surfaceAt(x) + 0.0005)}" quat="${q.map(f).join(' ')}"><freejoint/><geom name="skate_cone_${i}" type="mesh" mesh="skate_cone" mass="0.08" contype="1" conaffinity="1" friction="0.35 .01 .01"/></body>`);
  });
  return { asset: `<mesh name="skate_cone" vertex="${conePoints().flat().map(f).join(' ')}"/>`, world: out.join('\n') };
}

// ——— Drawing ———

function noiseTexture(base: string, specks: [string, number][], size = 256) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  c.fillStyle = base; c.fillRect(0, 0, size, size);
  for (const [colour, count] of specks) { c.fillStyle = colour; for (let i = 0; i < count; i++) c.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5); }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A strip following the profile, between y0 and y1, lifted by `lift`. */
function strip(y0: number, y1: number, lift: number, x0 = -Infinity, x1 = Infinity) {
  const positions: number[] = [], uvs: number[] = [], index: number[] = [];
  const xs = points.map(p => p[0]).filter(x => x > x0 && x < x1);
  if (x0 > -Infinity) xs.unshift(x0);
  if (x1 < Infinity) xs.push(x1);
  xs.forEach((x, i) => {
    const z = surfaceAt(x) + lift;
    positions.push(x, y0, z, x, y1, z); uvs.push(x, y0, x, y1);
    if (i) { const a = (i - 1) * 2; index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)).setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index).computeVertexNormals();
  return geometry;
}

/** Build the course. Returns the stopper boom (the ride animates it) and cone parts. */
export function buildCourse(scene: THREE.Scene, stopper: Frame) {
  const add = <T extends THREE.Object3D>(object: T) => { object.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; }); scene.add(object); return object; };
  const asphaltMap = noiseTexture('#5d6064', [['#6f7276', 9000], ['#4b4e52', 9000], ['#85878a', 1500]]);
  asphaltMap?.repeat.set(1.5, 1.5);
  const asphalt = new THREE.MeshStandardMaterial({ color: asphaltMap ? '#ffffff' : '#5d6064', map: asphaltMap, roughness: 0.95 });
  const grassMap = noiseTexture('#a7b97e', [['#93a86b', 9000], ['#bccb94', 6000]]);
  grassMap?.repeat.set(1, 1);
  const grass = new THREE.MeshStandardMaterial({ color: grassMap ? '#ffffff' : '#a7b97e', map: grassMap, roughness: 1 });
  const paint = new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.8 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#e9b44c', roughness: 0.7 });
  const concrete = new THREE.MeshStandardMaterial({ color: '#d9d5cc', roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: '#a7aeb5', roughness: 0.35, metalness: 0.3 });

  // Embankment under the road, so the downhill reads as a hillside.
  const shape = new THREE.Shape();
  // The base sinks 5 cm under the floor so no face is coplanar with it.
  shape.moveTo(points[0][0], -0.05);
  for (const [x, z] of points) shape.lineTo(x, z - 0.008);
  shape.lineTo(points[points.length - 1][0], -0.05);
  const bank = new THREE.ExtrudeGeometry(shape, { depth: road.verge * 2, bevelEnabled: false });
  // Shape y → up, extrusion → -y: a rotation, not a mirror, so faces stay outward.
  bank.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, road.verge, 0, 1, 0, 0, 0, 0, 0, 1));
  bank.computeVertexNormals();
  add(new THREE.Mesh(bank, new THREE.MeshStandardMaterial({ color: '#b9a98e', roughness: 1 })));
  // Ground layers are millimetres apart; far down the hill the depth buffer
  // cannot separate them, so each layer also gets a polygon offset (stable at
  // any distance) and the layers sit 2–3 mm apart.
  const layer = (material: THREE.MeshStandardMaterial, level: number) => { material.polygonOffset = true; material.polygonOffsetFactor = -level; material.polygonOffsetUnits = -level * 2; return material; };
  layer(asphalt, 1); layer(paint, 2); layer(yellow, 2);
  // Ground layers receive shadows but cast none: a layer shadowing the one a
  // millimetre below it is shadow acne, which flickers as the light follows.
  const ground = (mesh: THREE.Mesh) => { scene.add(mesh); mesh.receiveShadow = true; return mesh; };
  ground(new THREE.Mesh(strip(-road.verge, road.verge, -0.002), grass));
  ground(new THREE.Mesh(strip(-road.half, road.half, 0.0008), asphalt));
  for (const y of [-road.half + 0.05, road.half - 0.08]) ground(new THREE.Mesh(strip(y, y + 0.03, 0.0025), paint));
  // Dashed centre line, interrupted by the island.
  for (let x = marks.cones; x < obstacles.finish - 0.6; x += 1) {
    if (x > obstacles.island.x0 - 1 && x < obstacles.island.x1 + 0.5) continue;
    ground(new THREE.Mesh(strip(-0.015, 0.015, 0.0025, x, x + 0.5), yellow));
  }
  // Finish: chequered band across the road.
  const white = layer(new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.8 }), 3), black = layer(new THREE.MeshStandardMaterial({ color: '#1d1d1f', roughness: 0.8 }), 3);
  for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) {
    const y = -road.half + i * (road.half * 2 / 20), x = obstacles.finish + j * 0.1;
    ground(new THREE.Mesh(strip(y, y + road.half * 2 / 20, 0.004, x, x + 0.1), (i + j) % 2 ? white : black));
  }
  for (const b of blocks()) {
    if (b.kind === 'road') continue;
    const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(b.size[0] * 2, b.size[1] * 2, b.size[2] * 2), b.kind === 'island' ? concrete : b.kind === 'wall' ? concrete : concrete));
    mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
    mesh.quaternion.set(b.quat[1], b.quat[2], b.quat[3], b.quat[0]);
    if (b.kind === 'island') {
      const top = add(new THREE.Mesh(new THREE.BoxGeometry(b.size[0] * 2 - 0.06, b.size[1] * 2 - 0.06, 0.01), grass));
      top.position.set(0, 0, b.size[2]); mesh.add(top);
      for (const dx of [-0.35, 0, 0.35]) mesh.add(tree(dx * (b.size[0] * 2 - 0.6), 0, b.size[2], 0.5 + Math.abs(dx)));
    }
  }
  // Bollards: steel posts with a yellow band.
  obstacles.bollards.forEach(([x, y]) => {
    const post = add(new THREE.Group());
    post.position.set(x, y, surfaceAt(x));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 16).rotateX(Math.PI / 2), steel); pole.position.z = 0.12;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.0305, 0.03, 16).rotateX(Math.PI / 2), yellow); band.position.z = 0.19;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), steel); cap.position.z = 0.24;
    post.add(pole, band, cap);
    post.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; });
  });
  // Roadside trees and the finish arch.
  let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let x = road.start + 1; x < marks.end; x += 2.2 + random() * 1.4) for (const side of [-1, 1]) {
    const y = side * (road.half + 0.6 + random() * 1.1);
    add(tree(x + random(), y, surfaceAt(x), 0.7 + random() * 0.5));
  }
  const arch = add(new THREE.Group());
  arch.position.set(obstacles.finish, 0, surfaceAt(obstacles.finish));
  for (const side of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.9), steel); leg.position.set(0, side * (road.half + 0.12), 0.45); arch.add(leg); }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.03, road.half * 2 + 0.3, 0.14), [steel, new THREE.MeshStandardMaterial({ map: bannerTexture(), color: bannerTexture() ? '#ffffff' : '#d4583a' }), steel, steel, steel, steel]);
  banner.position.z = 0.86; arch.add(banner);
  arch.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; });

  return stopperBoom(scene, stopper);
}

/** Cone meshes, built in the cone body's frame. */
export function coneMesh() {
  const group = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: '#f26b2a', roughness: 0.55 });
  const white = new THREE.MeshStandardMaterial({ color: '#f6f2ea', roughness: 0.5 });
  // Tapered body on a square foot, with two reflective bands, like a street cone.
  const h = cone.height - 0.008, r0 = cone.foot * 0.8, r = (z: number) => r0 + (cone.top - r0) * z / h;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(cone.top, r0, h, 28, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f26b2a', roughness: 0.55, side: THREE.DoubleSide })); body.position.z = 0.008 + h / 2;
  const tip = new THREE.Mesh(new THREE.CircleGeometry(cone.top, 28), orange); tip.position.z = cone.height;
  group.add(body, tip);
  for (const [z0, z1] of [[0.42, 0.55], [0.68, 0.76]]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r(z1 * h) + 0.0006, r(z0 * h) + 0.0006, (z1 - z0) * h, 28, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f6f2ea', roughness: 0.35, side: THREE.DoubleSide }));
    band.position.z = 0.008 + (z0 + z1) / 2 * h; group.add(band);
  }
  const foot = new THREE.Mesh(new RoundedBoxGeometry(cone.foot * 2, cone.foot * 2, 0.008, 2, 0.004), orange); foot.position.z = 0.004;
  group.add(foot);
  return group;
}

export function tree(x: number, y: number, z: number, height: number) {
  const group = new THREE.Group(); group.position.set(x, y, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, height, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8a7058', roughness: 0.9 }));
  trunk.position.z = height / 2;
  const leaves = new THREE.MeshStandardMaterial({ color: height > 0.95 ? '#8fa86e' : '#a4b97f', roughness: 0.9, flatShading: true });
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(height * 0.32, 1), leaves); crown.position.z = height + 0.05;
  const crown2 = new THREE.Mesh(new THREE.IcosahedronGeometry(height * 0.22, 1), leaves); crown2.position.set(0.08, -0.05, height + 0.22);
  group.add(trunk, crown, crown2);
  group.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; });
  return group;
}

let banner: THREE.CanvasTexture | null | undefined;
export function bannerTexture() {
  if (banner !== undefined) return banner;
  if (typeof document === 'undefined') return (banner = null);
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#d4583a'; c.fillRect(0, 0, 1024, 128);
  c.fillStyle = '#f6f2ea'; c.font = '800 72px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('META', 512, 68);
  banner = new THREE.CanvasTexture(canvas); banner.colorSpace = THREE.SRGBColorSpace;
  return banner;
}

/** The obstacle run as a Course: arc length is x along the straight road. */
export const obstacleCourse: Course = {
  rampStart: road.start,
  frame: s => ({ p: [s, 0, surfaceAt(s)], heading: 0, slope: slopeAt(s) }),
  path: resample(raceLine),
  get finish() { const p = this.path; return p.s[p.points.findIndex(([x]) => x >= obstacles.finish)]; },
  cones: obstacles.cones.map(([x, y]) => ({ x, y, slope: slopeAt(x), heading: 0 })),
  xml: courseXml,
  build: buildCourse,
  route(x, y) { const { x0, x1 } = obstacles.island; return x > (x0 + x1) / 2 && x < x1 ? (y > 0 ? 'izquierda' : 'derecha') : undefined; },
  view: { far: 60, fog: [12, 40], sky: '#fdfdfc', chase: { behind: 2.6, side: -0.6, height: 1.15, ahead: 1.2 } },
};
