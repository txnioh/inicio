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
  const { d, z: road, along, s } = roadNear(x, y);
  // Behind the start the ground keeps rising gently, the same on both sides, so
  // there is no step where the uphill and downhill sides meet. Past the finish
  // the coast just carries on, falling to the sea.
  const beyond = s < 1 && along < -1 ? -along - 1 : 0, z = road + beyond * 0.35;
  const edge = Math.abs(d) - coast.half - 0.25;
  if (edge < 0) return beyond ? z - 0.08 + beyond * 0.02 : z - 0.08;
  const rough = (fbm(x * 0.18, y * 0.18) - 0.5);
  if (d > 0) {
    // Rock cut, then the mountainside rising behind.
    return z + Math.min(edge * 0.9, 1.6 + edge * 0.35) + edge * edge * 0.012 + rough * Math.min(1, edge / 3) * 3;
  }
  const fall = z - edge * 0.55 - edge * edge * 0.02 + rough * Math.min(1, edge / 4) * 1.6;
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
    if (h < coast.seaLevel + 0.12) c.set('#f1ede4'); // surf
    else if (h < coast.seaLevel + 0.5) c.copy(sand);
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

/** A lighthouse: white tower with red bands, a lit lantern and a dark cap, on a rock. */
function lighthouse() {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f3efe7', roughness: 0.7 }), red = new THREE.MeshStandardMaterial({ color: '#c8452e', roughness: 0.6 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 4.2, 20).rotateX(Math.PI / 2), white); tower.position.z = 2.1;
  group.add(tower);
  for (const z of [1.1, 2.6]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.55 - z * 0.032 + 0.01, 0.57 - z * 0.032 + 0.02, 0.5, 20).rotateX(Math.PI / 2), red); band.position.z = z; group.add(band); }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2c2e33', roughness: 0.5 })); gallery.position.z = 4.25;
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.6, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffe8b0', emissive: '#ffcf70', emissiveIntensity: 1.4 })); lantern.position.z = 4.6;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.5, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2c2e33', roughness: 0.5 })); cap.position.z = 5.15;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0).scale(1.3, 1.1, 0.7), new THREE.MeshStandardMaterial({ color: '#7d756d', roughness: 1, flatShading: true }));
  group.add(gallery, lantern, cap, rock);
  return group;
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
  scene.add(skyDome('#f4d2ad', '#6a93c4'), sunDisc());
  // The sea: glossy blue with drifting ripples that catch the low sun.
  const ripples = seaNormals();
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: '#2a6582', roughness: 0.22, metalness: 0.2, normalMap: ripples, normalScale: new THREE.Vector2(0.35, 0.35) }));
  sea.position.z = coast.seaLevel; scene.add(sea);
  if (ripples) motion.push(t => { ripples.offset.set(t * 0.004, t * 0.0025); });
  scene.add(ridges());
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
  // Rocks along the shore.
  let seed = 11; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0, placed = 0; i < 3000 && placed < 40; i++) {
    const s0 = random() * line.total, d = -(coast.half + 6 + random() * 22), [x, y] = offset(s0, d), h = hill(x, y);
    if (h < coast.seaLevel - 0.6 || h > coast.seaLevel + 0.5) continue;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + random() * 0.9, 0).scale(1.2, 1, 0.6 + random() * 0.4), new THREE.MeshStandardMaterial({ color: random() > 0.5 ? '#7d756d' : '#8f857a', roughness: 1, flatShading: true }));
    rock.position.set(x, y, coast.seaLevel + 0.1); rock.rotation.z = random() * 6; add(rock); placed++;
  }
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
    const [x, y] = offset(s, coast.half + 8 + r * 7);
    add(tree(x, y, hill(x, y), 0.9 + r * 0.6));
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
  // Wide and high, from the mountain side, so the sea and the horizon show.
  // Golden hour: a warm, low sun over the sea and a warm haze.
  view: {
    far: 1200, fog: [35, 820], sky: '#f1d2ae', ground: false, chase: { behind: 3.6, side: 0.9, height: 1.6, ahead: 2.2 },
    light: { sun: '#ffcf9e', intensity: 3.6, direction: [sun.x * 1.5, sun.y * 1.5, sun.z * 1.5 + 0.35], sky: '#ffe4c8', ground: '#55623f', fill: 1.8, rim: '#a9bdf5', rimIntensity: 0.9, exposure: 0.95 },
  },
  animate(time) { for (const step of motion) step(time); },
};
