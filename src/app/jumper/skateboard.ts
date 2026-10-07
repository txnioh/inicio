import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Drawing of the skateboard, in the frames of its physical bodies. Nothing here
// collides: the deck, kicks, hangers and wheels that MuJoCo simulates are the
// boxes, capsules and cylinders in skate.ts. These meshes follow those bodies.

export interface BoardSize { kind?: 'skate' | 'longboard'; half: number[]; kick?: [number, number]; base: number; track: number; wheel: number; wheelHalf?: number; axle: number; pivot: number }
type Part = { body: 'deck' | 'hanger' | 'wheel'; side?: 1 | -1; wheel?: 1 | -1; mesh: THREE.Mesh };

const kickAngle = 0.25;
const long = (b: BoardSize) => b.kind === 'longboard';
export function deckLength(b: BoardSize) { const [length, angle] = b.kick ?? [0.08, kickAngle]; return long(b) ? b.half[0] : b.half[0] + length * Math.cos(angle); }
/**
 * Deck centre line and plan.
 * - skate (popsicle): flat middle, kicks rising 14° to match the physical kick
 *   boxes, nose and tail as near half-circles, 4 mm of concave.
 * - longboard (drop-through): long flat deck with round ends that lift 1 cm,
 *   cut-outs at the trucks where the 68 mm wheels sit, 5 mm of concave.
 */
/** Longboard wheel wells, metres: depth, flat half-length and full half-length. */
export const cutout = { depth: 0.072, flat: 0.08, reach: 0.13 };
export function deckPoint(b: BoardSize, x: number, v: number, inset = 0) {
  const L = deckLength(b), ax = Math.abs(x), w = b.half[1];
  if (long(b)) {
    const end = 0.2, tipStart = L - end, lift = ax > L - 0.14 ? 0.01 * ((ax - (L - 0.14)) / 0.14) ** 2 : 0;
    let half = ax <= tipStart ? w : w * Math.sqrt(Math.max(0, 1 - ((ax - tipStart) / end) ** 2));
    // Wheel wells: a flat-bottomed cut-out wide enough for the wheels to turn
    // into, easing back to the full width.
    const d = Math.abs(ax - b.base), well = cutout.depth * (d < cutout.flat ? 1 : d < cutout.reach ? Math.cos((d - cutout.flat) / (cutout.reach - cutout.flat) * Math.PI / 2) ** 2 : 0);
    half -= well;
    return new THREE.Vector3(x, v * Math.max(0, half - inset), lift + 0.005 * v * v * Math.min(1, half / w) ** 2);
  }
  // The kick bends up through a 5 cm curve centred where the physical kick box
  // starts, then follows its plane.
  const [, angle] = b.kick ?? [0.08, kickAngle], slope = Math.tan(angle), bend = 0.05, d = ax - (b.half[0] - bend / 2);
  const kick = d <= 0 ? 0 : d < bend ? d * d * slope / (2 * bend) : slope * (d - bend / 2);
  const end = w * 0.95, tipStart = L - end;
  const outline = ax <= tipStart ? w : w * Math.sqrt(Math.max(0, 1 - ((ax - tipStart) / end) ** 2));
  const half = Math.max(0, outline - inset);
  // Concave fades out towards the round tip, where the rails meet.
  return new THREE.Vector3(x, v * half, kick + 0.004 * v * v * (outline / w) ** 2);
}
/** Spacing along the deck that bunches up at the round ends, so they stay smooth. */
const spread = (u: number) => { const t = u * 2 - 1; return 0.45 * t + 0.55 * Math.sin(t * Math.PI / 2); };

function surfaceGeometry(b: BoardSize, z: number, inset: number, flip: boolean, nu = 120, nv = 24) {
  const L = deckLength(b) - inset, positions: number[] = [], uvs: number[] = [], index: number[] = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const u = i / nu, v = j / nv * 2 - 1, p = deckPoint(b, spread(u) * L, v, inset);
    positions.push(p.x, p.y, p.z + z); uvs.push(u, (v + 1) / 2);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, c = a + nv + 1;
    if (flip) index.push(a, a + 1, c, c, a + 1, c + 1); else index.push(a, c, a + 1, c, c + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)).setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index).computeVertexNormals();
  return geometry;
}

/** The rim: a rounded edge from top to bottom, carrying the ply texture. */
function rimGeometry(b: BoardSize, nu = 120) {
  const t = b.half[2], L = deckLength(b), steps = 7, positions: number[] = [], uvs: number[] = [], index: number[] = [];
  // Profile around the edge: angle 0 is the top face, π the bottom face.
  const row = steps + 1;
  for (const v of [-1, 1]) for (let i = 0; i <= nu; i++) {
    const p = deckPoint(b, spread(i / nu) * L, v);
    const out = new THREE.Vector2(0, v);
    if (i === 0 || i === nu) out.set(i === 0 ? -1 : 1, 0);
    else {
      const prev = deckPoint(b, spread((i - 1) / nu) * L, v), next = deckPoint(b, spread((i + 1) / nu) * L, v);
      out.set(next.y - prev.y, -(next.x - prev.x)).normalize().multiplyScalar(v);
    }
    for (let k = 0; k <= steps; k++) {
      const a = k / steps * Math.PI, r = t * 0.6;
      // Squashed half-round: flat sides with a radius at the top and bottom.
      const bulge = Math.sin(a) * r, height = Math.cos(a) * t;
      positions.push(p.x + out.x * (bulge - r * 0.35), p.y + out.y * (bulge - r * 0.35), p.z + height);
      uvs.push(i / nu, 1 - k / steps);
    }
  }
  for (const [side, v] of [[0, -1], [1, 1]]) for (let i = 0; i < nu; i++) for (let k = 0; k < steps; k++) {
    const a = side * (nu + 1) * row + i * row + k, c = a + row;
    if (v > 0) index.push(a, a + 1, c, c, a + 1, c + 1); else index.push(a, c, a + 1, c, c + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)).setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index).computeVertexNormals();
  return geometry;
}

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  if (typeof document === 'undefined') return null;
  const element = document.createElement('canvas'); element.width = w; element.height = h;
  draw(element.getContext('2d')!);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function textures(kind: BoardSize['kind']) {
  // Griptape across the whole top (u along, v across): grit, wear on the kicks
  // where feet pop and drag, and a die-cut logo by the nose.
  const grip = canvasTexture(2048, 512, c => {
    c.fillStyle = '#2a2a2c'; c.fillRect(0, 0, 2048, 512);
    // Fine silicon-carbide grit: many small specks, a few brighter ones.
    for (let i = 0; i < 260000; i++) {
      const g = Math.random() < 0.55 ? 18 + Math.random() * 22 : Math.random() < 0.9 ? 52 + Math.random() * 30 : 95 + Math.random() * 40;
      c.fillStyle = `rgb(${g},${g},${g + 3})`; c.fillRect(Math.random() * 2048, Math.random() * 512, 1, 1);
    }
    // Wear where the feet scuff: the kicks on a skate, around the trucks on a longboard.
    for (const x of kind === 'longboard' ? [330, 1718] : [130, 1918]) {
      const wear = c.createRadialGradient(x, 256, 10, x, 256, 230);
      wear.addColorStop(0, 'rgba(150,150,150,0.35)'); wear.addColorStop(1, 'rgba(150,150,150,0)');
      c.fillStyle = wear; c.fillRect(x - 240, 0, 480, 512);
    }
    const logo = kind === 'longboard' ? 1420 : 1700; // clear of the drop-through baseplate
    c.save(); c.translate(logo, 256); c.rotate(-Math.PI / 2);
    c.fillStyle = 'rgba(232,228,218,0.92)'; c.font = '800 54px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('JUMPER', 0, 0); c.restore();
    c.strokeStyle = 'rgba(232,228,218,0.85)'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(logo - 60, 150); c.lineTo(logo - 60, 362); c.stroke();
  });
  // Seven maple plies in alternating grain tones, one dyed core veneer, and
  // the darker glue lines between them, as on a real deck's edge.
  const ply = canvasTexture(16, 140, c => {
    const plies = kind === 'longboard'
      ? ['#e2c79c', '#d4b689', '#e2c79c', '#c9a777', '#e2c79c', '#d4b689', '#e2c79c']
      : ['#e2c79c', '#d4b689', '#e2c79c', '#2f6f73', '#e2c79c', '#d4b689', '#e2c79c'];
    plies.forEach((colour, i) => { c.fillStyle = colour; c.fillRect(0, i * 20, 16, 20); c.fillStyle = 'rgba(110,80,45,0.35)'; c.fillRect(0, i * 20, 16, 1.5); });
  });
  // Longboard bottom: clear-coated maple grain with racing stripes end to end.
  if (kind === 'longboard') return { grip, ply, graphic: canvasTexture(2048, 512, c => {
    c.fillStyle = '#d8b88a'; c.fillRect(0, 0, 2048, 512);
    for (let i = 0; i < 160; i++) {
      const y = Math.random() * 512, a = 0.05 + Math.random() * 0.12;
      c.strokeStyle = `rgba(120,80,40,${a})`; c.lineWidth = 1 + Math.random() * 2;
      c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= 2048; x += 128) c.lineTo(x, y + Math.sin(x / 300 + i) * 6);
      c.stroke();
    }
    for (const [y, h, colour] of [[196, 34, '#2f6f73'], [236, 40, '#f4efe4'], [282, 34, '#d4583a']] as const) { c.fillStyle = colour; c.fillRect(0, y, 2048, h); }
    c.save(); c.translate(1024, 256); c.scale(-1, 1);
    c.fillStyle = '#1f2a33'; c.font = '900 86px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('JUMPER  LONG', 0, 2); c.restore();
  }) };
  // Skate bottom graphic: warm bands and a big rider silhouette, under clear coat.
  const graphic = canvasTexture(2048, 512, c => {
    const g = c.createLinearGradient(0, 0, 2048, 0);
    g.addColorStop(0, '#f0e6d2'); g.addColorStop(0.5, '#e9b44c'); g.addColorStop(1, '#d4583a');
    c.fillStyle = g; c.fillRect(0, 0, 2048, 512);
    c.fillStyle = '#2f6f73';
    for (let i = 0; i < 9; i++) c.fillRect(140 + i * 40, 0, 18, 512);
    c.fillStyle = '#1f2a33';
    c.beginPath(); c.arc(1024, 256, 150, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#d4583a'; c.fillRect(944, 200, 160, 70);
    c.fillStyle = '#f0e6d2'; c.fillRect(964, 220, 120, 30);
    c.save(); c.translate(1560, 256); c.scale(-1, 1); c.rotate(Math.PI / 2);
    c.fillStyle = '#1f2a33'; c.font = '900 120px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('SKATE', 0, 0); c.restore();
    // Tail and nose scrapes: the graphic worn through to the wood where the
    // kicks meet the ground.
    for (const x0 of [0, 1880]) for (let i = 0; i < 70; i++) {
      const y = 40 + Math.random() * 432, x = x0 + Math.random() * 168, l = 20 + Math.random() * 90;
      c.strokeStyle = `rgba(222,196,152,${0.35 + Math.random() * 0.5})`; c.lineWidth = 1 + Math.random() * 3;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (x0 ? l : -l) * 0.3, y + (Math.random() - 0.5) * l); c.stroke();
    }
  });
  return { grip, ply, graphic };
}

// The scene has a soft studio environment (playground.ts, skate mode only), so
// metals can be metallic and the clear coats catch highlights.
const material = {
  maple: () => new THREE.MeshStandardMaterial({ color: '#dcc29a', roughness: 0.6 }),
  aluminium: () => new THREE.MeshStandardMaterial({ color: '#c4c8cd', roughness: 0.3, metalness: 0.85 }),
  cast: () => new THREE.MeshStandardMaterial({ color: '#a3a8ae', roughness: 0.5, metalness: 0.8 }),
  steel: () => new THREE.MeshStandardMaterial({ color: '#b4b9bf', roughness: 0.25, metalness: 0.9 }),
  dark: () => new THREE.MeshStandardMaterial({ color: '#25272b', roughness: 0.4, metalness: 0.6 }),
  riser: () => new THREE.MeshStandardMaterial({ color: '#1c1c1e', roughness: 0.85 }),
  bushing: () => new THREE.MeshPhysicalMaterial({ color: '#f0b33b', roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  urethane: () => new THREE.MeshPhysicalMaterial({ color: '#f4ecd8', roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.5, side: THREE.DoubleSide }),
  core: () => new THREE.MeshStandardMaterial({ color: '#d4583a', roughness: 0.4, side: THREE.DoubleSide }),
  shield: () => new THREE.MeshStandardMaterial({ color: '#2f6f73', roughness: 0.3, metalness: 0.5 }),
  print: () => new THREE.MeshStandardMaterial({ color: '#2f6f73', roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
};

const hex = (r: number, h: number) => new THREE.CylinderGeometry(r, r, h, 6);
const along = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2); // cylinder axis y → z
/** A rounded rectangle extruded with a soft bevel: cast parts, risers. */
function plate(width: number, depth: number, height: number, radius: number, bevel: number) {
  const shape = new THREE.Shape(), w = width / 2 - bevel, d = depth / 2 - bevel, r = Math.min(radius, w, d);
  shape.moveTo(-w + r, -d); shape.lineTo(w - r, -d); shape.quadraticCurveTo(w, -d, w, -d + r); shape.lineTo(w, d - r);
  shape.quadraticCurveTo(w, d, w - r, d); shape.lineTo(-w + r, d); shape.quadraticCurveTo(-w, d, -w, d - r); shape.lineTo(-w, -d + r);
  shape.quadraticCurveTo(-w, -d, -w + r, -d);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 6 });
  geometry.translate(0, 0, -(height - bevel * 2) / 2);
  geometry.computeVertexNormals();
  return geometry;
}
/** Button-head bolt with a hex socket, seen from the top (axis z). */
function bolt(m: { dark: THREE.Material }) {
  const group = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0036, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.45), m.dark);
  const socket = new THREE.Mesh(along(hex(0.0013, 0.0004)), new THREE.MeshBasicMaterial({ color: '#0d0d0f' })); socket.position.z = 0.0015;
  group.add(head, socket);
  return group;
}

export function skateboardParts(b: BoardSize): Part[] {
  const parts: Part[] = [];
  const add = (body: Part['body'], mesh: THREE.Mesh, side?: 1 | -1, wheel?: 1 | -1) => { mesh.castShadow = mesh.receiveShadow = true; parts.push({ body, side, wheel, mesh }); return mesh; };
  const addGroup = (body: Part['body'], group: THREE.Group, side?: 1 | -1, wheel?: 1 | -1) => {
    group.updateMatrixWorld(true);
    for (const child of [...group.children] as THREE.Mesh[]) { child.applyMatrix4(group.matrix); add(body, child, side, wheel); }
  };
  const t = b.half[2], tex = textures(b.kind), m = {
    grip: new THREE.MeshStandardMaterial({ color: tex.grip ? '#ffffff' : '#2a2a2c', map: tex.grip, roughness: 1 }),
    // The rim is a thin band seen from both sides as the board tilts.
    ply: new THREE.MeshStandardMaterial({ color: tex.ply ? '#ffffff' : '#dcc29a', map: tex.ply, roughness: 0.55, side: THREE.DoubleSide }),
    graphic: new THREE.MeshPhysicalMaterial({ color: tex.graphic ? '#ffffff' : '#e9b44c', map: tex.graphic, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    maple: material.maple(), aluminium: material.aluminium(), cast: material.cast(), steel: material.steel(), dark: material.dark(), riser: material.riser(),
    bushing: material.bushing(), urethane: material.urethane(), core: material.core(), shield: material.shield(), print: material.print(),
  };
  if (long(b)) {
    // Longboard: amber wheels with white cores, red bushings, a white print.
    m.urethane.color.set('#eaa53c'); m.core.color.set('#f4efe4'); m.bushing.color.set('#d4583a'); m.print.color.set('#f6f1e4');
    // Black anodised trucks, as most downhill trucks are.
    m.cast.color.set('#2e3035'); m.cast.metalness = 0.6; m.cast.roughness = 0.38;
  }
  // Deck: maple top under the grip (a 5 mm sanded margin shows), rounded rim, graphic.
  add('deck', new THREE.Mesh(surfaceGeometry(b, t * 0.95, 0, false), m.maple));
  add('deck', new THREE.Mesh(surfaceGeometry(b, t + 0.0004, 0.005, false), m.grip));
  add('deck', new THREE.Mesh(surfaceGeometry(b, -t * 0.95, 0, true), m.graphic));
  add('deck', new THREE.Mesh(rimGeometry(b), m.ply));

  const pivot = b.pivot * Math.PI / 180, drop = long(b), hw = b.track - 0.07, wheelHalf = b.wheelHalf ?? 0.014;
  // Truck hardware grows with the wheels, as a wider truck does.
  const k = Math.max(1, b.wheel / 0.026);
  // Top-mount on a 6 mm riser, with a high truck (taller hanger) making up the
  // rest of the height; drop-through: the baseplate sits on the deck.
  const plateH = 0.0065, riserH = drop ? 0 : 0.006;
  const plateZ = drop ? t + plateH / 2 : -t - riserH - plateH / 2;
  const plateBottom = drop ? -t : plateZ - plateH / 2;
  const rise = plateBottom - b.axle - 0.002; // hanger top, just under the plate
  for (const side of [1, -1] as const) {
    const x = side * b.base, out = drop ? 1 : -1; // reverse kingpin sits outboard
    // Mounting hardware: button heads on the grip (or on the drop-through
    // plate), washers and nyloc nuts underneath.
    for (const dx of [-0.021 * k, 0.021 * k]) for (const dy of [-0.017 * k, 0.017 * k]) {
      const head = bolt(m); head.position.set(x + dx, dy, drop ? plateZ + plateH / 2 : t + 0.0004); addGroup('deck', head);
      const nutZ = drop ? -t - 0.0018 : plateZ - plateH / 2 - 0.0018;
      add('deck', new THREE.Mesh(along(new THREE.CylinderGeometry(0.0044, 0.0044, 0.0006, 16)), m.steel)).position.set(x + dx, dy, nutZ + 0.0014);
      add('deck', new THREE.Mesh(along(hex(0.0037, 0.0026)), m.steel)).position.set(x + dx, dy, nutZ);
    }
    if (!drop) {
      // Hard riser with a thin soft shock pad on top.
      add('deck', new THREE.Mesh(plate(0.074 * k, 0.058 * k, riserH - 0.0015, 0.008, 0.0008), m.riser)).position.set(x, 0, -t - 0.0015 - (riserH - 0.0015) / 2);
      add('deck', new THREE.Mesh(plate(0.074 * k, 0.058 * k, 0.0015, 0.008, 0.0005), new THREE.MeshStandardMaterial({ color: '#3a3a3d', roughness: 1 }))).position.set(x, 0, -t - 0.00075);
    }
    add('deck', new THREE.Mesh(plate(0.07 * k, 0.054 * k, plateH, 0.012 * k, 0.0018), m.cast)).position.set(x, 0, plateZ);
    // Kingpin boss under the plate, kingpin, bushings, cup washers and nut.
    const kingpin = new THREE.Group();
    kingpin.position.set(x + out * side * 0.016 * k, 0, plateBottom - 0.001);
    kingpin.rotation.y = out * side * 0.42;
    kingpin.scale.setScalar(k);
    const boss = new THREE.Mesh(along(new THREE.CylinderGeometry(0.0095, 0.012, 0.008, 24)), m.cast); boss.position.z = -0.003;
    const pin = new THREE.Mesh(along(new THREE.CylinderGeometry(0.0033, 0.0033, 0.034, 12)), m.steel); pin.position.z = -0.016;
    const upperCup = new THREE.Mesh(along(new THREE.CylinderGeometry(0.0105, 0.0105, 0.0008, 24)), m.steel); upperCup.position.z = -0.0075;
    const top = new THREE.Mesh(along(new THREE.CylinderGeometry(0.0088, 0.0098, 0.006, 24)), m.bushing); top.position.z = -0.0109;
    const bottom = new THREE.Mesh(along(new THREE.CylinderGeometry(0.0095, 0.0078, 0.006, 24)), m.bushing); bottom.position.z = -0.0225;
    const washer = new THREE.Mesh(along(new THREE.CylinderGeometry(0.0098, 0.0098, 0.0009, 24)), m.steel); washer.position.z = -0.026;
    const nut = new THREE.Mesh(along(hex(0.0056, 0.0042)), m.steel); nut.position.z = -0.0287;
    kingpin.add(boss, pin, upperCup, top, bottom, washer, nut);
    addGroup('deck', kingpin);
    const cup = add('deck', new THREE.Mesh(along(new THREE.CylinderGeometry(0.0058, 0.0072, 0.009, 20)), m.cast));
    cup.position.set(x - out * side * 0.024 * k, 0, plateBottom - 0.004); cup.scale.setScalar(k);
    cup.rotation.y = side * (Math.PI / 2 - pivot);

    // Hanger casting in its body frame (origin on the axle), softly bevelled,
    // reaching up to the pivot and the kingpin seat.
    const shape = new THREE.Shape();
    shape.moveTo(-hw + 0.002, -0.004); shape.quadraticCurveTo(-hw - 0.002, -0.0065, -hw + 0.008, -0.0085);
    shape.lineTo(hw - 0.008, -0.0085); shape.quadraticCurveTo(hw + 0.002, -0.0065, hw - 0.002, -0.004);
    shape.bezierCurveTo(hw * 0.5, -0.001, 0.034 * k, rise * 0.7, 0.019 * k, rise); shape.lineTo(-0.019 * k, rise);
    shape.bezierCurveTo(-0.034 * k, rise * 0.7, -hw * 0.5, -0.001, -hw + 0.002, -0.004);
    const cast = new THREE.ExtrudeGeometry(shape, { depth: 0.008 * k, bevelEnabled: true, bevelSize: 0.0045 * k, bevelThickness: 0.0055 * k, bevelSegments: 6, curveSegments: 16 });
    cast.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1)).translate(-0.004 * k, 0, 0);
    cast.computeVertexNormals();
    add('hanger', new THREE.Mesh(cast, m.cast), side);
    // Axle housings taper from the body to each wheel, with speed rings at the wheels.
    for (const w of [1, -1]) {
      const length = b.track - wheelHalf - 0.0015 - hw * 0.62;
      const housing = add('hanger', new THREE.Mesh(new THREE.CylinderGeometry(0.0046 * k, 0.0072 * k, length, 20), m.cast), side);
      housing.position.set(0, w * (hw * 0.62 + length / 2), -0.002);
      housing.rotation.x = w > 0 ? 0 : Math.PI;
      add('hanger', new THREE.Mesh(new THREE.CylinderGeometry(0.0056, 0.0056, 0.0008, 20), m.steel), side).position.set(0, w * (b.track - wheelHalf - 0.0006), 0);
    }
    add('hanger', new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 2 * (b.track + wheelHalf + 0.0055), 12), m.steel), side);
    const seat = add('hanger', new THREE.Mesh(along(new THREE.TorusGeometry(0.0082 * k, 0.0028 * k, 12, 28)), m.cast), side);
    seat.position.set(out * side * 0.016 * k, 0, rise - 0.004 * k); seat.rotation.y = out * side * 0.42;
    const pivotPin = add('hanger', new THREE.Mesh(along(new THREE.CylinderGeometry(0.0034 * k, 0.0044 * k, 0.014 * k, 16)), m.cast), side);
    pivotPin.position.set(-out * side * 0.014 * k, 0, rise + 0.001); pivotPin.rotation.y = side * (Math.PI / 2 - pivot);

    for (const w of [1, -1] as const) {
      // Urethane with radiused lips, a coloured core, sealed 608 bearings and a
      // printed ring on the outer face. Longboard wheels are bigger and wider.
      const r = b.wheel, h = wheelHalf, sx = r / 0.024, sy = h / 0.014, bore = 0.012 * Math.max(1, sx * 0.85);
      const outline = [[bore, -0.014], [0.0185, -0.014], [0.0214, -0.0136], [0.0229, -0.0124], [0.0237, -0.0104], [0.024, -0.0075], [0.024, 0.0075], [0.0237, 0.0104], [0.0229, 0.0124], [0.0214, 0.0136], [0.0185, 0.014], [bore, 0.014]]
        .map(([a, c]) => new THREE.Vector2(a === bore ? bore : a * sx, c * sy));
      add('wheel', new THREE.Mesh(new THREE.LatheGeometry(outline, 64), m.urethane), side, w);
      const cr = bore + 0.0002, ch = h - 0.0014;
      add('wheel', new THREE.Mesh(new THREE.LatheGeometry([[0.0068, -ch], [cr, -ch], [cr, ch], [0.0068, ch]].map(([a, c]) => new THREE.Vector2(a, c)), 40), m.core), side, w);
      for (const face of [-1, 1]) {
        add('wheel', new THREE.Mesh(new THREE.CylinderGeometry(0.0068, 0.0068, 0.0012, 28), m.shield), side, w).position.y = face * (ch + 0.0002);
        add('wheel', new THREE.Mesh(new THREE.TorusGeometry(0.0068, 0.0006, 8, 28).rotateX(Math.PI / 2), m.steel), side, w).position.y = face * (ch + 0.0008);
        add('wheel', new THREE.Mesh(new THREE.TorusGeometry(0.0032, 0.0007, 8, 20).rotateX(Math.PI / 2), m.steel), side, w).position.y = face * (ch + 0.0008);
      }
      // Printed ring on the outer face (the face away from the hanger).
      const ring = add('wheel', new THREE.Mesh(new THREE.RingGeometry(bore + 0.0012, bore + 0.0026, 48).rotateX(-w * Math.PI / 2), m.print), side, w);
      ring.position.y = w * (h + 0.0001);
      add('wheel', new THREE.Mesh(new THREE.CylinderGeometry(0.0056, 0.0056, 0.0008, 16), m.steel), side, w).position.y = w * (h + 0.0005);
      add('wheel', new THREE.Mesh(hex(0.0048, 0.0045), m.steel), side, w).position.y = w * (h + 0.0032);
    }
  }
  return parts;
}

/**
 * Largest hanger turn, in radians, before any point of a wheel comes within
 * `margin` of the deck. The physics stops the truck there, so a wheel never
 * passes through the deck: it is where a real board gets wheelbite.
 */
export function safeTurn(b: BoardSize, margin = 0.003) {
  const p = b.pivot * Math.PI / 180, axis = [-Math.cos(p), 0, -Math.sin(p)];
  const pivotPoint = [b.base, 0, b.axle + 0.014], L = deckLength(b), t = b.half[2], wh = b.wheelHalf ?? 0.014;
  const rotate = (v: number[], th: number) => {
    const c = Math.cos(th), s = Math.sin(th), d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
    const x = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]];
    return v.map((value, i) => value * c + x[i] * s + axis[i] * d * (1 - c));
  };
  const points: number[][] = [];
  for (const w of [1, -1]) for (const y of [-wh, 0, wh]) for (let k = 0; k < 32; k++) {
    const a = k / 32 * 2 * Math.PI;
    points.push([b.base + Math.cos(a) * b.wheel, w * b.track + y, b.axle + Math.sin(a) * b.wheel]);
  }
  const touches = (th: number) => points.some(q => {
    const r = rotate(q.map((v, i) => v - pivotPoint[i]), th).map((v, i) => v + pivotPoint[i]);
    if (Math.abs(r[0]) > L) return false;
    const half = Math.abs(deckPoint(b, r[0], 1).y);
    if (Math.abs(r[1]) > half + margin) return false;
    const z = deckPoint(b, r[0], r[1] / Math.max(half, 1e-6)).z;
    return r[2] > z - t - margin && r[2] < z + t + 0.03;
  });
  let th = 0;
  while (th < 0.6 && !touches(th + 0.002) && !touches(-th - 0.002)) th += 0.002;
  return th;
}
