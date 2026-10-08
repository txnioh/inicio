import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
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

// ——— Landscape ———
// Heights follow the usual recipe for believable mountains: a ridged
// multifractal (sharp crests, each octave damped where the ones before are
// low, so detail gathers on ridges), sampled through a low-frequency domain warp
// so the crests meander, then a few thermal-erosion passes near the road.
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function ridged(x: number, y: number) {
  const wx = x + (fbm(x * 0.006, y * 0.006) - 0.5) * 90, wy = y + (fbm(x * 0.006 + 31, y * 0.006 + 17) - 0.5) * 90;
  let sum = 0, amplitude = 0.5, frequency = 1 / 70, weight = 1;
  for (let octave = 0; octave < 6; octave++) {
    let n = 1 - Math.abs(noise(wx * frequency + octave * 13.1, wy * frequency - octave * 7.7) * 2 - 1);
    n = n * n * weight;
    weight = Math.min(1, Math.max(0, n * 1.8));
    sum += n * amplitude; amplitude *= 0.5; frequency *= 2.02;
  }
  return sum;
}
const coastline = (x: number) => -13 + 4 * Math.sin(x * 0.045) + 2.5 * Math.sin(x * 0.11 + 1.3);
const farCoast = (x: number) => -240 + 35 * Math.sin(x * 0.012 + 2);
/** The landscape away from the road: a cliffy coast rising to ranges inland, and headlands across the bay. */
function farField(x: number, y: number) {
  const inland = y - coastline(x);
  let h = inland < 0 ? coast.seaLevel - 0.6 + inland * 0.5
    : 0.2 + Math.min(inland, 2.5) * 0.95 + Math.max(0, inland - 2.5) * 0.4 - Math.max(0, inland - 25) * 0.24 + ridged(x, y) * (2 + smooth(15, 160, inland) * 95); // a low rock lip, then the slope
  const across = farCoast(x) - y;
  if (across > 0) h = Math.max(h, 0.6 + across * 0.3 + ridged(x + 500, y) * (2 + smooth(10, 120, across) * 70));
  return h;
}
/** Height anywhere: the road's cut and fill near it, easing into the landscape. */
function hill(x: number, y: number) {
  const { d, z: road, along, s } = roadNear(x, y);
  // Behind the start the ground keeps rising gently, the same on both sides, so
  // there is no step where the uphill and downhill sides meet. Past the finish
  // the coast just carries on.
  const beyond = s < 1 && along < -1 ? -along - 1 : 0, z = road + beyond * 0.35;
  const edge = Math.abs(d) - coast.half - 0.25;
  if (edge < 0) return beyond ? z - 0.08 + beyond * 0.02 : z - 0.08;
  const rough = (fbm(x * 0.18, y * 0.18) - 0.5);
  const near = d > 0
    ? z + Math.min(edge * 0.9, 1.6 + edge * 0.35) + edge * edge * 0.012 + rough * Math.min(1, edge / 3) * 2.2 // rock cut, mountainside
    : Math.max(coast.seaLevel - 1.5, z - edge * 0.55 - edge * edge * 0.02 + rough * Math.min(1, edge / 4) * 1.4); // falling to the sea
  const w = smooth(6, 26, edge) * (beyond ? 0.4 : 1);
  return near + (Math.max(d > 0 ? z + 1 : -50, farField(x, y)) - near) * w;
}

const palette = {
  wet: new THREE.Color('#57534c'), wetSand: new THREE.Color('#a8956f'), sand: new THREE.Color('#cdb88c'), shoreRock: new THREE.Color('#6e675e'),
  grass: new THREE.Color('#5b7a3a'), meadow: new THREE.Color('#7d9147'), dry: new THREE.Color('#a39256'), scrub: new THREE.Color('#3d5a2b'),
  rock: new THREE.Color('#8a7f72'), cliff: new THREE.Color('#6a625a'), scree: new THREE.Color('#a59d92'), peak: new THREE.Color('#bdb7ad'),
};
/**
 * Colour by height above the sea, steepness (1 - normal z) and noise: wet rock
 * and sand at the waterline, grass on the lower slopes, scrub then bare rock and
 * scree higher up (the road sits ~7–8 m up; 1 m here is ~10 m at Jumper's scale).
 */
function groundColour(c: THREE.Color, x: number, y: number, h: number, steep: number) {
  const n = noise(x * 0.09, y * 0.09) * 0.6 + noise(x * 0.35, y * 0.35) * 0.4, m = noise(x * 0.8 + 9, y * 0.8), patch = noise(x * 0.12 + 5, y * 0.12);
  if (h < coast.seaLevel + 0.08) return c.copy(palette.wet).offsetHSL(0, 0, (m - 0.5) * 0.06);
  if (h < coast.seaLevel + 0.5) return c.copy(steep > 0.3 ? palette.shoreRock : palette.wetSand).lerp(palette.sand, smooth(0.15, 0.5, h) * (steep > 0.3 ? 0 : 1)).offsetHSL(0, 0, (m - 0.5) * 0.06);
  c.copy(palette.grass).lerp(palette.meadow, n * 0.8).lerp(palette.dry, smooth(7, 11, h) * 0.6);
  if (patch > 0.6) c.lerp(palette.scrub, 0.65);
  // Above the grass: rock showing through in patches, then bare rock and scree.
  const bare = smooth(9.5, 15, h + (patch - 0.5) * 4);
  c.lerp(palette.rock, bare * 0.85).lerp(palette.scree, smooth(30, 60, h) * 0.7);
  c.lerp(steep > 0.5 ? palette.cliff : palette.rock, smooth(0.18, 0.42, steep));
  if (h > 90) c.lerp(palette.peak, smooth(90, 150, h));
  return c.offsetHSL((m - 0.5) * 0.02, 0, (m - 0.5) * 0.1);
}

let grain: THREE.CanvasTexture | null | undefined;
/** Grass and soil grain: tufts and specks around mid-grey, multiplied over the colours. */
function groundGrain() {
  if (grain !== undefined) return grain;
  if (typeof document === 'undefined') return (grain = null);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#d8d8d8'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, g = 150 + Math.random() * 105;
    c.strokeStyle = `rgba(${g},${g},${g},0.55)`; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 4); c.stroke();
  }
  for (let i = 0; i < 2500; i++) { const g = 90 + Math.random() * 60; c.fillStyle = `rgba(${g},${g - 6},${g - 14},0.5)`; c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  grain = new THREE.CanvasTexture(canvas);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.colorSpace = THREE.SRGBColorSpace; grain.anisotropy = 8;
  return grain;
}

/** A height grid as an indexed, smooth-shaded mesh with colours by slope and height. */
function gridMesh(x0: number, y0: number, nx: number, ny: number, cell: number, heights: Float32Array) {
  const positions = new Float32Array((nx + 1) * (ny + 1) * 3), index: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const k = j * (nx + 1) + i; positions.set([x0 + i * cell, y0 + j * cell, heights[k]], k * 3); }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; index.push(a, b, d, a, d, c); }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(index); geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal'), colours = new Float32Array(positions.length), c = new THREE.Color();
  for (let k = 0; k < normals.count; k++) {
    groundColour(c, positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2], 1 - normals.getZ(k));
    colours.set([c.r, c.g, c.b], k * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  // World-space UVs for the ground's grain, tiled every 2.5 m.
  const uvs = new Float32Array((nx + 1) * (ny + 1) * 2);
  for (let k = 0; k < uvs.length / 2; k++) { uvs[k * 2] = positions[k * 3] / 2.5; uvs[k * 2 + 1] = positions[k * 3 + 1] / 2.5; }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, map: groundGrain(), roughness: 1, envMapIntensity: 0.3 }));
  mesh.receiveShadow = true;
  return mesh;
}

let foamMaterial: THREE.MeshBasicMaterial | undefined;
/** A band of surf along the waterline segments, lying on the water and breathing. */
function foam(segments: [number, number, number, number][]) {
  const positions: number[] = [], uvs: number[] = [], width = 0.32;
  for (const [ax, ay, bx, by] of segments) {
    const l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l * width, ny = (bx - ax) / l * width, z = coast.seaLevel + 0.03;
    const quad = [[ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny], [ax - nx, ay - ny], [bx + nx, by + ny], [ax + nx, ay + ny]];
    for (const [x, y] of quad) { positions.push(x, y, z); uvs.push(x * 0.35, y * 0.35); }
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)).setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  let map: THREE.CanvasTexture | null = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const c = canvas.getContext('2d')!;
    for (let i = 0; i < 900; i++) { const a = Math.random(); c.fillStyle = `rgba(255,255,255,${0.2 + a * 0.8})`; c.beginPath(); c.arc(Math.random() * 128, Math.random() * 128, 1 + a * 3, 0, Math.PI * 2); c.fill(); }
    map = new THREE.CanvasTexture(canvas); map.wrapS = map.wrapT = THREE.RepeatWrapping;
  }
  foamMaterial = new THREE.MeshBasicMaterial({ color: '#fffaf1', alphaMap: map, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const mesh = new THREE.Mesh(geometry, foamMaterial);
  mesh.renderOrder = 1;
  return mesh;
}

function terrain() {
  const xs = line.samples.map(c => c.x), ys = line.samples.map(c => c.y);
  const x0 = Math.min(...xs) - 60, x1 = Math.max(...xs) + 60, y0 = Math.min(...ys) - 45, y1 = Math.max(...ys) + 90;
  const cell = 0.6, nx = Math.ceil((x1 - x0) / cell), ny = Math.ceil((y1 - y0) / cell);
  const heights = new Float32Array((nx + 1) * (ny + 1)), locked = new Uint8Array(heights.length);
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * cell, y = y0 + j * cell, k = j * (nx + 1) + i;
    heights[k] = hill(x, y);
    // The road, its shoulders and the cut stay as designed.
    if (Math.abs(roadNear(x, y).d) < coast.half + 3) locked[k] = 1;
  }
  // Thermal erosion: material slides down wherever a slope exceeds the talus angle.
  const talus = cell * 1.1;
  for (let pass = 0; pass < 4; pass++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
    const k = j * (nx + 1) + i;
    if (locked[k]) continue;
    for (const o of [1, -1, nx + 1, -(nx + 1)]) {
      const diff = heights[k] - heights[k + o];
      if (diff > talus && !locked[k + o]) { const move = (diff - talus) * 0.2; heights[k] -= move; heights[k + o] += move; }
    }
  }
  const near = gridMesh(x0, y0, nx, ny, cell, heights);
  // The waterline, by marching squares over the near grid: where each cell's
  // corners straddle sea level, the crossing points on its edges.
  const level = coast.seaLevel + 0.02, segments: [number, number, number, number][] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => ({ x: x0 + a * cell, y: y0 + b * cell, h: heights[b * (nx + 1) + a] - level }));
    const crossings: [number, number][] = [];
    for (let e = 0; e < 4; e++) {
      const a = corners[e], b = corners[(e + 1) % 4];
      if ((a.h < 0) !== (b.h < 0)) { const t = a.h / (a.h - b.h); crossings.push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t]); }
    }
    if (crossings.length >= 2) segments.push([...crossings[0], ...crossings[1]]);
    if (crossings.length === 4) segments.push([...crossings[2], ...crossings[3]]);
  }
  // The far landscape, out to the horizon, a little lower where the near grid covers it.
  const fx0 = -1200, fy0 = -900, fcell = 9, fnx = Math.ceil(2400 / fcell), fny = Math.ceil(2200 / fcell);
  const far = new Float32Array((fnx + 1) * (fny + 1));
  for (let j = 0; j <= fny; j++) for (let i = 0; i <= fnx; i++) {
    const x = fx0 + i * fcell, y = fy0 + j * fcell, inside = x > x0 + fcell && x < x1 - fcell && y > y0 + fcell && y < y1 - fcell;
    far[j * (fnx + 1) + i] = farField(x, y) - (inside ? 3 : 0.35);
  }
  const group = new THREE.Group();
  group.add(near, gridMesh(fx0, fy0, fnx, fny, fcell, far), foam(segments));
  return { group, shore: segments };
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

// Golden hour: the sun low over the sea, ahead and to the right of the run.
const sun = new THREE.Vector3(1, -0.62, 0.2).normalize();
function skyDome(horizon: string, zenith: string) {
  const geometry = new THREE.SphereGeometry(800, 48, 24);
  const colours: number[] = [], low = new THREE.Color(horizon), high = new THREE.Color(zenith), glow = new THREE.Color('#ffc98a'), c = new THREE.Color(), v = new THREE.Vector3();
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    c.copy(low).lerp(high, Math.pow(Math.max(0, v.z), 0.5));
    c.lerp(glow, Math.pow(Math.max(0, v.dot(sun)), 6) * 0.85);
    colours.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  mesh.renderOrder = -1;
  return mesh;
}

/** The sun's disc and halo, far along the sun direction. */
function sunDisc() {
  if (typeof document === 'undefined') return new THREE.Group();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d')!, g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.12, 'rgba(255,240,205,1)'); g.addColorStop(0.2, 'rgba(255,210,150,0.55)'); g.addColorStop(0.5, 'rgba(255,190,130,0.16)'); g.addColorStop(1, 'rgba(255,180,120,0)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, fog: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true }));
  sprite.position.copy(sun).multiplyScalar(700);
  sprite.scale.setScalar(230);
  sprite.renderOrder = -0.5;
  return sprite;
}

/** Ripples for the sea: a tiling normal map from a few sine waves and noise. */
function seaNormals() {
  if (typeof document === 'undefined') return null;
  const size = 256, height = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = i / size * Math.PI * 2, v = j / size * Math.PI * 2;
    height[j * size + i] = Math.sin(u * 3 + v * 2) * 0.5 + Math.sin(u * 7 - v * 5) * 0.25 + Math.sin(u * 13 + v * 11) * 0.12 + (noise(i * 0.2, j * 0.2) - 0.5) * 0.3;
  }
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!, image = c.createImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const h = (a: number, b: number) => height[((b + size) % size) * size + ((a + size) % size)];
    const dx = (h(i + 1, j) - h(i - 1, j)) * 1.6, dy = (h(i, j + 1) - h(i, j - 1)) * 1.6, l = Math.hypot(dx, dy, 1), k = (j * size + i) * 4;
    image.data[k] = (-dx / l * 0.5 + 0.5) * 255; image.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; image.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; image.data[k + 3] = 255;
  }
  c.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(160, 160);
  return texture;
}

/** Puffy low-poly clouds: a few squashed blobs per cloud. */
function cloud(seed: number) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#fff7ee', emissive: '#f2c79c', emissiveIntensity: 0.18, roughness: 1, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const r = 9 + noise(seed, i) * 9, blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), material);
    blob.position.set((i - 2.5) * 11 + noise(i, seed) * 6, noise(seed * 3, i) * 8, (noise(i * 2, seed) - 0.3) * 5);
    blob.scale.set(1.3, 1, 0.5);
    group.add(blob);
  }
  return group;
}

/** A small sailing boat: hull and two sails. */
function boat() {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.3).translate(0, 0, 0.15), new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.6 }));
  const sail = new THREE.Shape(); sail.moveTo(0, 0); sail.lineTo(0, 2.2); sail.lineTo(1, 0.1); sail.closePath();
  const sails = new THREE.MeshStandardMaterial({ color: '#fbf8f2', roughness: 0.8, side: THREE.DoubleSide });
  const main = new THREE.Mesh(new THREE.ShapeGeometry(sail).rotateX(Math.PI / 2), sails); main.position.set(-0.35, 0, 0.35);
  const jib = new THREE.Mesh(new THREE.ShapeGeometry(sail).rotateX(Math.PI / 2).scale(-0.6, 1, 0.8), sails); jib.position.set(-0.3, 0, 0.35);
  group.add(hull, main, jib);
  return group;
}

/** A lighthouse: tapered white tower with red bands, a gallery, a lit lantern and a dark cap, on a rock. */
function lighthouse() {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f3efe7', roughness: 0.7 }), red = new THREE.MeshStandardMaterial({ color: '#c8452e', roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2c2e33', roughness: 0.5 });
  const height = 4.2, base = 0.62, top = 0.42, radius = (z: number) => base + (top - base) * z / height;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(top, base, height, 32).rotateX(Math.PI / 2), white); tower.position.z = height / 2;
  group.add(tower);
  // Bands follow the taper, 2 cm proud of the tower so no face is shared.
  for (const z of [1.1, 2.6]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(radius(z + 0.25) + 0.02, radius(z - 0.25) + 0.02, 0.5, 32).rotateX(Math.PI / 2), red);
    band.position.z = z; group.add(band);
  }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 32).rotateX(Math.PI / 2), dark); gallery.position.z = height + 0.1;
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.55, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffe8b0', emissive: '#ffcf70', emissiveIntensity: 0.9 })); lantern.position.z = height + 0.46;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.5, 20).rotateX(Math.PI / 2), dark); cap.position.z = height + 0.99;
  const rock = new THREE.Mesh(rockGeometry(1.6, 3), new THREE.MeshStandardMaterial({ color: '#7d756d', roughness: 1, flatShading: true }));
  rock.scale.set(1.3, 1.1, 0.7); rock.position.z = -0.35;
  group.add(gallery, lantern, cap, rock);
  return group;
}

/** A weathered rock: an icosahedron pushed in and out by noise, flatter on top. */
function rockGeometry(radius: number, seed: number) {
  const geometry = new THREE.IcosahedronGeometry(radius, 1), p = geometry.getAttribute('position'), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 0.75 + noise(v.x * 1.7 + seed, v.y * 1.7 - seed) * 0.45 + noise(v.z * 3 + seed, v.x * 3) * 0.12;
    v.multiplyScalar(k); if (v.z > radius * 0.35) v.z = radius * 0.35 + (v.z - radius * 0.35) * 0.4;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A gull: two thin wings that flap. */
function gull() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#f5f3ee', roughness: 0.8, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const shape = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.05, side * 0.32, 0.02, -0.08, side * 0.12, 0], 3));
    shape.computeVertexNormals();
    const wing = new THREE.Mesh(shape, material);
    wing.name = side > 0 ? 'left' : 'right';
    group.add(wing);
  }
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.18, 6).rotateZ(-Math.PI / 2), material); group.add(body);
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
  motion.length = 0;
  scene.add(skyDome('#ecd9c2', '#5b88c0'), sunDisc());
  // The sea: three.js's Water (a mirror reflection distorted by four scrolling
  // ripple layers, Fresnel, and the sun's glitter), turned to this Z-up world.
  const sea = new Water(new THREE.PlaneGeometry(4000, 4000), {
    textureWidth: 1024, textureHeight: 1024, waterNormals: seaNormals() ?? undefined,
    sunDirection: sun.clone(), sunColor: 0xffdcae, waterColor: 0x1d5a78, distortionScale: 0.7, fog: true,
  });
  const shader = sea.material as THREE.ShaderMaterial;
  shader.fragmentShader = shader.fragmentShader
    .replace('getNoise( worldPosition.xz * size )', 'getNoise( worldPosition.xy * size )')
    .replace('normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) )', 'normalize( noise.xyz * vec3( 1.5, 1.5, 1.0 ) )')
    .replace('surfaceNormal.xz * ( 0.001 + 1.0 / distance )', 'surfaceNormal.xy * ( 0.001 + 1.0 / distance )')
    // Less mirror, more water: the sea keeps its own deep blue and the sun's path.
    .replace('vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), reflectionSample + specularLight, reflectance );',
      'vec3 albedo = mix( ( sunColor * diffuseLight * 0.12 + scatter + waterColor * 0.35 ) * getShadowMask(), reflectionSample * 0.5 + specularLight, reflectance * 0.75 );');
  shader.uniforms.size.value = 22;
  sea.position.z = coast.seaLevel; scene.add(sea);
  motion.push(t => { shader.uniforms.time.value = t * 0.6; });
  // Clouds drifting along the coast, boats on the bay, a lighthouse on a point.
  for (let i = 0; i < 9; i++) {
    const c = cloud(i), angle = -2.2 + i * 0.55, distance = 260 + noise(i, 3) * 260;
    c.position.set(Math.cos(angle) * distance + 60, Math.sin(angle) * distance, 28 + noise(i, 9) * 30);
    c.rotation.z = angle + Math.PI / 2;
    scene.add(c);
    const x0 = c.position.x;
    motion.push(t => { c.position.x = x0 + ((t * 0.6 + i * 40) % 160) - 80; });
  }
  for (const [x, y, speed] of [[40, -55, 0.25], [-10, -120, 0.15], [110, -90, 0.2], [70, -200, 0.1]]) {
    const b = boat(); b.position.set(x, y, coast.seaLevel); b.rotation.z = 0.3; b.scale.setScalar(x > 100 ? 1.2 : 1);
    scene.add(b);
    motion.push(t => { b.position.x = x + Math.sin(t * speed * 0.2) * 12; b.position.z = coast.seaLevel + Math.sin(t * 1.3 + x) * 0.06; b.rotation.x = Math.sin(t * 1.1 + y) * 0.04; });
  }
  const pointS = 52, [lx, ly] = offset(pointS, -16);
  const light = lighthouse(); light.position.set(lx, ly, Math.max(coast.seaLevel, hill(lx, ly)) + 0.2); add(light);
  // Gulls circling over the cliff.
  for (let i = 0; i < 7; i++) {
    const g = gull(), [cx, cy, cz] = offset(10 + i * 9, -6 - (i % 3) * 3, 3 + (i % 4)), r = 3 + (i % 3) * 2, speed = 0.25 + (i % 4) * 0.06;
    scene.add(g);
    motion.push(t => {
      const a = t * speed + i * 1.7;
      g.position.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz + Math.sin(t * 0.7 + i) * 0.4);
      g.rotation.z = a + Math.PI / 2;
      const flap = Math.sin(t * 7 + i) * 0.45;
      for (const wing of g.children) if (wing.name) wing.rotation.x = (wing.name === 'left' ? 1 : -1) * flap;
    });
  }
  const land = terrain();
  add(land.group, false);
  if (foamMaterial?.alphaMap) { const surf = foamMaterial, map = surf.alphaMap!; motion.push(t => { surf.opacity = 0.6 + Math.sin(t * 0.9) * 0.25; map.offset.set(t * 0.03, Math.sin(t * 0.5) * 0.05); }); }
  // Rocks along the waterline, half sunk, in small clusters.
  let seed = 11; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rockMaterials = ['#6f685f', '#7d756d', '#8a8176'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  for (let k = 0; k < 26 && land.shore.length; k++) {
    const [ax, ay] = land.shore[Math.floor(random() * land.shore.length)];
    for (let r = 0; r < 1 + Math.floor(random() * 3); r++) {
      const size = 0.15 + random() * 0.5, rock = new THREE.Mesh(rockGeometry(size, k * 7 + r), rockMaterials[Math.floor(random() * 3)]);
      rock.position.set(ax + (random() - 0.5) * 1.2, ay + (random() - 0.5) * 1.2, coast.seaLevel - size * 0.25);
      rock.rotation.z = random() * 6; add(rock, false);
    }
  }
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
  const steel = new THREE.MeshStandardMaterial({ color: '#a9b0b7', roughness: 0.55, metalness: 0.35 });
  const fin = frame(line.finish), arch = new THREE.Group(), q = frameQuat({ ...fin, slope: 0 });
  arch.position.set(...fin.p); arch.quaternion.set(q[1], q[2], q[3], q[0]);
  for (const side of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.9), steel); leg.position.set(0, side * (coast.half + 0.2), 0.45); arch.add(leg); }
  const texture = bannerTexture();
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.03, coast.half * 2 + 0.45, 0.14), [steel, new THREE.MeshStandardMaterial({ map: texture, color: texture ? '#ffffff' : '#d4583a' }), steel, steel, steel, steel]);
  banner.position.z = 0.86; arch.add(banner); add(arch, false);
  // Mountain side: concrete curb. Sea side: W-beam guardrail on posts.
  const concrete = new THREE.MeshStandardMaterial({ color: '#cfcac0', roughness: 0.9 });
  const n = Math.floor(line.total / coast.chord);
  const curbGeometry = new THREE.BoxGeometry(coast.chord + 0.04, 0.08, coast.rail);
  const postGeometry = new THREE.BoxGeometry(0.03, 0.03, 0.16);
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) * coast.chord, fr = frame(s), fq = frameQuat(fr), quat = new THREE.Quaternion(fq[1], fq[2], fq[3], fq[0]);
    // Road furniture receives shadows but casts none: with the sun this low, its long
    // shadows would sweep in and out of the shadow map around the rider.
    const curb = new THREE.Mesh(curbGeometry, concrete); curb.position.set(...offset(s, coast.half + 0.08, coast.rail / 2)); curb.quaternion.copy(quat); add(curb, false);
    if (i % 3 === 0) { const post = new THREE.Mesh(postGeometry, steel); post.position.set(...offset(s, -coast.half - 0.1, 0.08)); post.quaternion.copy(quat); add(post, false); }
  }
  const beam = band(-coast.half - 0.125, -coast.half - 0.125, 0, 0, line.total, 0.2);
  const p = beam.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + (i % 2 ? 0.07 : 0.15));
  beam.computeVertexNormals();
  add(new THREE.Mesh(beam, new THREE.MeshStandardMaterial({ color: '#b9bec3', roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide })), false);
  // A few pines above the cut and along the shoulder on the sea side.
  for (let s = 3; s < line.total - 3; s += 3.7) {
    const k = Math.sin(s * 12.9898) * 43758.5453, r = k - Math.floor(k);
    const [x, y] = offset(s, coast.half + 8 + r * 7);
    add(tree(x, y, hill(x, y), 0.9 + r * 0.6), false);
  }
  return stopperBoom(scene, stopper);
}

const motion: ((time: number) => void)[] = [];
const path = resample(line.samples.filter((_, i) => i % 4 === 0).map(c => [c.x, c.y] as Point));
export const mountainCourse: Course = {
  rampStart: 0,
  frame,
  path,
  get finish() { return line.finish; },
  cones: [],
  xml,
  build,
  // Golden hour: a warm, low sun over the sea and a warm haze.
  view: {
    // Behind and a little out over the sea side (where the ground falls away),
    // looking far down the road: the horizon sits in the top third, the sea on
    // one side and the mountains on the other. The view leans halfway towards
    // the bay, so bends into the hill still open onto the sea.
    // Near plane 20 cm: the camera never comes closer, and with a 1.2 km far
    // plane this keeps enough depth precision that distant parts don't flicker.
    far: 1200, near: 0.2, fog: [35, 820], sky: '#f1d2ae', ground: false, chase: { behind: 5.2, side: -1.3, height: 2.3, ahead: 7, aim: -0.5, scenic: [-0.45, 0.5] },
    environment: 0.12,
    // A soft bloom on the sun, its glitter and the lantern; a shallow depth of field on Jumper.
    post: { bloom: [0.35, 0.5, 0.93], dof: { aperture: 0.00008, maxblur: 0.0009 } },
    light: { sun: '#ffcf9e', intensity: 3.6, direction: [sun.x * 1.5, sun.y * 1.5, sun.z * 1.5 + 0.35], sky: '#ffe4c8', ground: '#55623f', fill: 1.8, rim: '#a9bdf5', rimIntensity: 0.9, exposure: 0.95 },
  },
  animate(time) { for (const step of motion) step(time); },
  ground: hill,
};
