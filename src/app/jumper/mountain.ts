import * as THREE from 'three';
import { bannerTexture, tree } from './course.ts';
import { frameQuat, resample, stopperBoom, type Course, type Frame, type Point } from './track.ts';

// A coast road for the longboard, after the classic downhill runs: a road cut
// into a hillside above the sea (Haleakalā, the Pacific Coast Highway), with
// linked bends like Maryhill's. No obstacles: the ride is carving the bends by
// weight alone. Scaled to Jumper (~1:10): a 2.4 m road, 9–11 m bends, the sea
// some 8 m below and mountains behind.
//
// Physics is the road (one convex box per 0.4 m of centre line, overlapping
// through the bends), a curb on the mountain side and a guardrail on the sea
// side. The hillside, sea, sky and far mountains are drawing only.

const rad = Math.PI / 180;
export const coast = { half: 1.2, rail: 0.08, seaLevel: 0, top: 8.5, chord: 0.4 };

interface Sample { x: number; y: number; z: number; heading: number; slope: number; s: number }
/** Centre line: straights and arcs in plan, each with a grade; grades blend over 1 m. */
function centreLine() {
  // [length or arc angle (deg), radius (0 = straight; + left, - right), grade (deg)]
  const plan: [number, number, number][] = [
    [1.2, 0, -5],     // start ramp with the stopper
    [2.0, 0, -6],     // drop in: about 2 m/s
    [5, 0, -1.3],
    [40, 10, -1.0],   // left round a gully
    [4, 0, -1.2],
    [80, -9, -0.9],   // right round a spur, towards the sea
    [4, 0, -1.2],
    [80, 9, -0.9],    // back left into the hill
    [5, 0, -1.2],
    [40, -11, -1.0],  // right, opening onto the bay
    [6, 0, -0.8],     // finish straight
    [5, 0, 4],        // uphill run-out
  ];
  const step = 0.05, samples: Sample[] = [];
  let x = 0, y = 0, heading = 0, s = 0;
  const pieces = plan.map(([a, r, grade]) => ({ length: r ? Math.abs(r) * a * rad : a, curvature: r ? 1 / r : 0, grade: grade * rad }));
  const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const gradeAt = (at: number) => {
    // Linear blend over 1 m around each boundary.
    let start = 0;
    for (let i = 0; i < pieces.length; i++) {
      const end = start + pieces[i].length;
      if (at < end || i === pieces.length - 1) {
        const next = pieces[i + 1], prev = pieces[i - 1];
        if (next && at > end - 0.5) return pieces[i].grade + (next.grade - pieces[i].grade) * (at - (end - 0.5));
        if (prev && at < start + 0.5) return pieces[i].grade + (prev.grade - pieces[i].grade) * (start + 0.5 - at);
        return pieces[i].grade;
      }
      start = end;
    }
    return 0;
  };
  const curvatureAt = (at: number) => { let start = 0; for (const piece of pieces) { if (at < start + piece.length) return piece.curvature; start += piece.length; } return 0; };
  let z = 0;
  for (; s <= total; s += step) {
    const slope = gradeAt(s);
    samples.push({ x, y, z, heading, slope, s });
    heading += curvatureAt(s) * step;
    x += Math.cos(heading) * Math.cos(slope) * step; y += Math.sin(heading) * Math.cos(slope) * step; z += Math.sin(slope) * step;
  }
  const lift = coast.top - samples[0].z;
  for (const sample of samples) sample.z += lift;
  const lengths = pieces.map(piece => piece.length);
  const finish = lengths.slice(0, 11).reduce((a, b) => a + b, 0) - 1.2; // near the end of the finish straight
  return { samples, step, finish, total };
}
const line = centreLine();
const at = (s: number) => {
  const i = Math.min(line.samples.length - 2, Math.max(0, Math.floor(s / line.step))), a = line.samples[i], b = line.samples[i + 1], t = Math.min(1, Math.max(0, (s - a.s) / line.step));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, heading: a.heading + (b.heading - a.heading) * t, slope: a.slope + (b.slope - a.slope) * t };
};
const frame = (s: number): Frame => { const c = at(s); return { p: [c.x, c.y, c.z], heading: c.heading, slope: c.slope }; };
/** World point at arc length s, `d` metres to the left of the centre line, `h` above the road. */
const offset = (s: number, d: number, h = 0): [number, number, number] => { const c = at(s); return [c.x - Math.sin(c.heading) * d, c.y + Math.cos(c.heading) * d, c.z + h]; };

const f = (v: number) => v.toFixed(5);
function xml() {
  const out = ['<geom name="playground_floor" type="plane" size="400 400 .1" pos="0 0 -1" contype="1" conaffinity="129" friction="1 .01 .01"/>'];
  const t = 0.15, n = Math.floor(line.total / coast.chord);
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) * coast.chord, fr = frame(s), q = frameQuat(fr);
    // Box centre below the surface, along the road normal.
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(q[1], q[2], q[3], q[0]));
    const centre = fr.p.map((v, k) => v - [normal.x, normal.y, normal.z][k] * t);
    // Long enough to overlap through the tightest bend at the road's edge.
    out.push(`<geom name="skate_road_${i}" type="box" pos="${centre.map(f).join(' ')}" quat="${q.map(f).join(' ')}" size="${f(coast.chord / 2 + 0.05)} ${f(coast.half + 0.4)} ${t}" contype="1" conaffinity="129" friction="1 .01 .01"/>`);
    for (const side of [1, -1]) {
      const [x, y, z] = offset(s, side * (coast.half + 0.08), coast.rail / 2);
      out.push(`<geom name="skate_${side > 0 ? 'curb' : 'rail'}_${i}" type="box" pos="${f(x)} ${f(y)} ${f(z)}" quat="${q.map(f).join(' ')}" size="${f(coast.chord / 2 + 0.02)} 0.04 ${coast.rail / 2}" contype="1" conaffinity="129" friction="0.6 .01 .01"/>`);
    }
  }
  const end = frame(line.total - 0.2), q = frameQuat(end);
  out.push(`<geom name="skate_end_wall" type="box" pos="${end.p.map((v, k) => f(v + (k === 2 ? 0.15 : 0))).join(' ')}" quat="${q.map(f).join(' ')}" size="0.1 ${coast.half + 0.1} 0.15" contype="1" conaffinity="129"/>`);
  return { asset: '', world: out.join('\n') };
}

// ——— Drawing ———

/** Smooth value noise for the hills. */
function noise(x: number, y: number) {
  const hash = (i: number, j: number) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
const fbm = (x: number, y: number) => noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.28 + noise(x * 4.3, y * 4.3) * 0.17;

/** Signed distance to the road (left of travel positive) and the road height there. */
function roadNear(x: number, y: number) {
  let best = Infinity, sample = line.samples[0];
  for (let i = 0; i < line.samples.length; i += 6) { const c = line.samples[i], d = (c.x - x) ** 2 + (c.y - y) ** 2; if (d < best) { best = d; sample = c; } }
  const side = -Math.sin(sample.heading) * (x - sample.x) + Math.cos(sample.heading) * (y - sample.y);
  return { d: side, along: Math.cos(sample.heading) * (x - sample.x) + Math.sin(sample.heading) * (y - sample.y), z: sample.z, s: sample.s };
}

/** Hill height: the road's cut on the uphill (left) side, a falling slope to the sea on the right. */
function hill(x: number, y: number) {
  const { d, z, along } = roadNear(x, y);
  const beyond = Math.abs(along) > 1 ? Math.abs(along) - 1 : 0; // past either end of the road
  const edge = Math.abs(d) - coast.half - 0.25;
  if (edge < 0 && beyond === 0) return z - 0.08;
  const rough = (fbm(x * 0.18, y * 0.18) - 0.5);
  if (d > 0) {
    // Rock cut, then the mountainside rising behind.
    const e = Math.max(edge, beyond);
    return z + Math.min(e * 0.9, 1.6 + e * 0.35) + e * e * 0.012 + rough * Math.min(1, e / 3) * 3;
  }
  const e = Math.max(edge, beyond);
  const fall = z - e * 0.55 - e * e * 0.02 + rough * Math.min(1, e / 4) * 1.6;
  return Math.max(coast.seaLevel - 1.5, fall);
}

function terrain() {
  const xs = line.samples.map(c => c.x), ys = line.samples.map(c => c.y);
  const x0 = Math.min(...xs) - 35, x1 = Math.max(...xs) + 35, y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 45;
  const cell = 0.55, nx = Math.ceil((x1 - x0) / cell), ny = Math.ceil((y1 - y0) / cell);
  const heights = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) heights[j * (nx + 1) + i] = hill(x0 + i * cell, y0 + j * cell);
  // Flat-shaded triangles, coloured by height and steepness.
  const positions: number[] = [], colours: number[] = [];
  const sand = new THREE.Color('#cdb88c'), grass = new THREE.Color('#5f7d3e'), dry = new THREE.Color('#9c8f55'), rock = new THREE.Color('#857a6c'), dark = new THREE.Color('#5f5850'), c = new THREE.Color();
  const vertex = (i: number, j: number) => [x0 + i * cell, y0 + j * cell, heights[j * (nx + 1) + i]];
  const tri = (a: number[], b: number[], d: number[]) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const nz = e1[0] * e2[1] - e1[1] * e2[0], len = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], nz);
    const steep = 1 - Math.abs(nz) / len, h = (a[2] + b[2] + d[2]) / 3;
    if (h < coast.seaLevel + 0.4) c.copy(sand);
    else c.copy(grass).lerp(dry, Math.min(1, Math.max(0, (h - 9) / 12)));
    c.lerp(steep > 0.45 ? dark : rock, Math.min(1, Math.max(0, (steep - 0.25) * 2.2)));
    c.offsetHSL(0, 0, (noise(a[0] * 0.7, a[1] * 0.7) - 0.5) * 0.08);
    // Scrub patches on the gentler slopes.
    if (steep < 0.35 && noise(a[0] * 0.35 + 7, a[1] * 0.35) > 0.62) c.lerp(new THREE.Color('#3f5a2c'), 0.6);
    for (const p of [a, b, d]) { positions.push(p[0], p[1], p[2]); colours.push(c.r, c.g, c.b); }
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = vertex(i, j), b = vertex(i + 1, j), d = vertex(i, j + 1), e = vertex(i + 1, j + 1);
    tri(a, b, e); tri(a, e, d);
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)).setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  mesh.receiveShadow = true;
  return mesh;
}

/** A strip following the road between lateral offsets d0..d1, lifted by h. */
function band(d0: number, d1: number, h: number, s0 = 0, s1 = line.total, step = 0.2) {
  const positions: number[] = [], uvs: number[] = [], index: number[] = [];
  let k = 0;
  for (let s = s0; s <= s1 + 1e-6; s += step, k++) {
    positions.push(...offset(s, d0, h), ...offset(s, d1, h)); uvs.push(s, d0, s, d1);
    if (k) { const a = (k - 1) * 2; index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)).setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index).computeVertexNormals();
  return geometry;
}

function skyDome(horizon: string, zenith: string) {
  const geometry = new THREE.SphereGeometry(800, 32, 16);
  const colours: number[] = [], low = new THREE.Color(horizon), high = new THREE.Color(zenith), c = new THREE.Color();
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const t = Math.max(0, p.getZ(i) / 800); c.copy(low).lerp(high, Math.pow(t, 0.55)); colours.push(c.r, c.g, c.b); }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  mesh.renderOrder = -1;
  return mesh;
}

/** Distant low-poly ridges, hazed by the fog into the sky. */
function ridges() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#5d6f7d', roughness: 1, flatShading: true });
  // Ranges behind the coast, and headlands across the bay.
  const peaks: [number, number, number, number][] = [
    [-80, 150, 70, 90], [-10, 200, 95, 120], [60, 170, 75, 95], [130, 220, 110, 140], [200, 160, 70, 95], [280, 120, 60, 85],
    [-150, 110, 45, 70], [330, 40, 45, 70], [300, -90, 28, 45], [240, -150, 22, 40], [-120, -40, 18, 35],
  ];
  for (const [x, y, h, r] of peaks) {
    const geometry = new THREE.ConeGeometry(r, h, 9, 3).rotateX(Math.PI / 2);
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z > -h / 2 + 0.01 && z < h / 2 - 0.01) { p.setX(i, p.getX(i) * (0.8 + noise(i, x) * 0.4)); p.setY(i, p.getY(i) * (0.8 + noise(x, i) * 0.4)); } }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, h / 2 - 4);
    group.add(mesh);
  }
  return group;
}

function asphaltTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#55585c'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 16000; i++) { const g = 60 + Math.random() * 60; c.fillStyle = `rgb(${g},${g},${g + 4})`; c.fillRect(Math.random() * 256, Math.random() * 256, 1.3, 1.3); }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(0.7, 0.7);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function build(scene: THREE.Scene, stopper: Frame) {
  const add = <T extends THREE.Object3D>(o: T, cast = true) => { o.traverse(m => { if (m instanceof THREE.Mesh) { m.castShadow = cast; m.receiveShadow = true; } }); scene.add(o); return o; };
  const layer = (m: THREE.MeshStandardMaterial, level: number) => { m.polygonOffset = true; m.polygonOffsetFactor = -level; m.polygonOffsetUnits = -level * 2; return m; };
  scene.add(skyDome('#f3e6d4', '#7fa7c9'));
  // The sea: deep blue, glossy, out to the haze.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: '#2f6f8f', roughness: 0.18, metalness: 0.15 }));
  sea.position.z = coast.seaLevel; scene.add(sea);
  scene.add(ridges());
  add(terrain(), false);
  const asphaltMap = asphaltTexture();
  add(new THREE.Mesh(band(-coast.half - 0.02, coast.half + 0.02, 0.002), layer(new THREE.MeshStandardMaterial({ color: asphaltMap ? '#ffffff' : '#55585c', map: asphaltMap, roughness: 0.9 }), 1)), false);
  const paint = layer(new THREE.MeshStandardMaterial({ color: '#f1ede4', roughness: 0.7 }), 2);
  for (const d of [coast.half - 0.09, -coast.half + 0.06]) add(new THREE.Mesh(band(d, d + 0.03, 0.004), paint), false);
  const yellow = layer(new THREE.MeshStandardMaterial({ color: '#e9b44c', roughness: 0.7 }), 2);
  for (let s = 4; s < line.finish - 1; s += 1.2) add(new THREE.Mesh(band(-0.015, 0.015, 0.004, s, s + 0.6, 0.1), yellow), false);
  // Finish: chequered band and arch.
  const white = layer(new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.8 }), 3), black = layer(new THREE.MeshStandardMaterial({ color: '#1d1d1f', roughness: 0.8 }), 3);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
    const d0 = -coast.half + i * coast.half * 2 / 16;
    add(new THREE.Mesh(band(d0, d0 + coast.half * 2 / 16, 0.006, line.finish + j * 0.1, line.finish + (j + 1) * 0.1, 0.1), (i + j) % 2 ? white : black), false);
  }
  const steel = new THREE.MeshStandardMaterial({ color: '#a9b0b7', roughness: 0.35, metalness: 0.7 });
  const fin = frame(line.finish), arch = new THREE.Group(), q = frameQuat({ ...fin, slope: 0 });
  arch.position.set(...fin.p); arch.quaternion.set(q[1], q[2], q[3], q[0]);
  for (const side of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.9), steel); leg.position.set(0, side * (coast.half + 0.2), 0.45); arch.add(leg); }
  const texture = bannerTexture();
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.03, coast.half * 2 + 0.45, 0.14), [steel, new THREE.MeshStandardMaterial({ map: texture, color: texture ? '#ffffff' : '#d4583a' }), steel, steel, steel, steel]);
  banner.position.z = 0.86; arch.add(banner); add(arch);
  // Mountain side: concrete curb. Sea side: W-beam guardrail on posts.
  const concrete = new THREE.MeshStandardMaterial({ color: '#cfcac0', roughness: 0.9 });
  const n = Math.floor(line.total / coast.chord);
  const curbGeometry = new THREE.BoxGeometry(coast.chord + 0.04, 0.08, coast.rail);
  const postGeometry = new THREE.BoxGeometry(0.03, 0.03, 0.16);
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) * coast.chord, fr = frame(s), fq = frameQuat(fr), quat = new THREE.Quaternion(fq[1], fq[2], fq[3], fq[0]);
    const curb = new THREE.Mesh(curbGeometry, concrete); curb.position.set(...offset(s, coast.half + 0.08, coast.rail / 2)); curb.quaternion.copy(quat); add(curb);
    if (i % 3 === 0) { const post = new THREE.Mesh(postGeometry, steel); post.position.set(...offset(s, -coast.half - 0.1, 0.08)); post.quaternion.copy(quat); add(post); }
  }
  const beam = band(-coast.half - 0.125, -coast.half - 0.125, 0, 0, line.total, 0.2);
  const p = beam.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + (i % 2 ? 0.07 : 0.15));
  beam.computeVertexNormals();
  add(new THREE.Mesh(beam, new THREE.MeshStandardMaterial({ color: '#c7ccd1', roughness: 0.3, metalness: 0.75, side: THREE.DoubleSide })));
  // A few pines above the cut and along the shoulder on the sea side.
  for (let s = 3; s < line.total - 3; s += 3.7) {
    const k = Math.sin(s * 12.9898) * 43758.5453, r = k - Math.floor(k);
    const [x, y] = offset(s, coast.half + 4 + r * 5);
    add(tree(x, y, hill(x, y), 0.9 + r * 0.6));
  }
  return stopperBoom(scene, stopper);
}

const path = resample(line.samples.filter((_, i) => i % 4 === 0).map(c => [c.x, c.y] as Point));
export const mountainCourse: Course = {
  rampStart: 0,
  frame,
  path,
  get finish() { return line.finish; },
  cones: [],
  xml,
  build,
  // Wide and high, from the mountain side, so the sea and the horizon show.
  view: { far: 1200, fog: [40, 900], sky: '#f3e6d4', ground: false, chase: { behind: 3.6, side: 0.9, height: 1.6, ahead: 2.2 } },
};
