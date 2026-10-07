import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Drawing of the skateboard, in the frames of its physical bodies. Nothing here
// collides: the deck, kicks, hangers and wheels that MuJoCo simulates are the
// boxes, capsules and cylinders in skate.ts. These meshes follow those bodies.

export interface BoardSize { kind?: 'skate' | 'longboard'; half: number[]; base: number; track: number; wheel: number; wheelHalf?: number; axle: number; pivot: number }
type Part = { body: 'deck' | 'hanger' | 'wheel'; side?: 1 | -1; wheel?: 1 | -1; mesh: THREE.Mesh };

const kickAngle = 0.25;
const long = (b: BoardSize) => b.kind === 'longboard';
function deckLength(b: BoardSize) { return long(b) ? b.half[0] : b.half[0] + 0.08 * Math.cos(kickAngle); }
/**
 * Deck centre line and plan.
 * - skate (popsicle): flat middle, kicks rising 14° to match the physical kick
 *   boxes, nose and tail as near half-circles, 4 mm of concave.
 * - longboard (drop-through): long flat deck with round ends that lift 1 cm,
 *   cut-outs at the trucks where the 68 mm wheels sit, 5 mm of concave.
 */
function deckPoint(b: BoardSize, x: number, v: number, inset = 0) {
  const L = deckLength(b), ax = Math.abs(x), w = b.half[1];
  if (long(b)) {
    const end = 0.2, tipStart = L - end, lift = ax > L - 0.14 ? 0.01 * ((ax - (L - 0.14)) / 0.14) ** 2 : 0;
    let half = ax <= tipStart ? w : w * Math.sqrt(Math.max(0, 1 - ((ax - tipStart) / end) ** 2));
    const d = Math.abs(ax - b.base);
    if (d < 0.08) half -= 0.058 * Math.cos(d / 0.08 * Math.PI / 2) ** 2; // wheel well, clear of the 68 mm wheels
    return new THREE.Vector3(x, v * Math.max(0, half - inset), lift + 0.005 * v * v);
  }
  const end = w * 0.95, tipStart = L - end, d = ax - 0.335, slope = Math.tan(kickAngle);
  const kick = d <= 0 ? 0 : d < 0.03 ? d * d * slope / 0.06 : 0.03 * slope / 2 + (d - 0.03) * slope;
  const half = (ax <= tipStart ? w : w * Math.sqrt(Math.max(0, 1 - ((ax - tipStart) / end) ** 2))) - inset;
  return new THREE.Vector3(x, v * Math.max(0, half), kick + 0.004 * v * v);
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
    for (let i = 0; i < 90000; i++) {
      const g = Math.random() < 0.5 ? 20 + Math.random() * 25 : 55 + Math.random() * 40;
      c.fillStyle = `rgb(${g},${g},${g + 2})`; c.fillRect(Math.random() * 2048, Math.random() * 512, 1.4, 1.4);
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
  // Seven plies, two of them dyed, as on a real deck's edge.
  const ply = canvasTexture(16, 140, c => {
    const plies = ['#e3c9a0', '#d1b285', '#2f6f73', '#e3c9a0', '#d4583a', '#d1b285', '#e3c9a0'];
    plies.forEach((colour, i) => { c.fillStyle = colour; c.fillRect(0, i * 20, 16, 20); });
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
  });
  return { grip, ply, graphic };
}

const material = {
  maple: () => new THREE.MeshStandardMaterial({ color: '#dcc29a', roughness: 0.65 }),
  // No environment map in the scene: strongly metallic materials would render
  // almost black, so the metals are mostly diffuse with a sheen.
  aluminium: () => new THREE.MeshStandardMaterial({ color: '#c9cdd2', roughness: 0.38, metalness: 0.3 }),
  steel: () => new THREE.MeshStandardMaterial({ color: '#9aa1a8', roughness: 0.32, metalness: 0.35 }),
  dark: () => new THREE.MeshStandardMaterial({ color: '#2c2e33', roughness: 0.5, metalness: 0.2 }),
  riser: () => new THREE.MeshStandardMaterial({ color: '#1c1c1e', roughness: 0.9 }),
  bushing: () => new THREE.MeshStandardMaterial({ color: '#f0b33b', roughness: 0.55 }),
  urethane: () => new THREE.MeshStandardMaterial({ color: '#f4ecd8', roughness: 0.42, side: THREE.DoubleSide }),
  core: () => new THREE.MeshStandardMaterial({ color: '#d4583a', roughness: 0.4, side: THREE.DoubleSide }),
  shield: () => new THREE.MeshStandardMaterial({ color: '#2f6f73', roughness: 0.35, metalness: 0.2 }),
};

const hex = (r: number, h: number) => new THREE.CylinderGeometry(r, r, h, 6);
const along = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2); // cylinder axis y → z

export function skateboardParts(b: BoardSize): Part[] {
  const parts: Part[] = [];
  const add = (body: Part['body'], mesh: THREE.Mesh, side?: 1 | -1, wheel?: 1 | -1) => { mesh.castShadow = mesh.receiveShadow = true; parts.push({ body, side, wheel, mesh }); return mesh; };
  const t = b.half[2], tex = textures(b.kind), m = {
    grip: new THREE.MeshStandardMaterial({ color: tex.grip ? '#ffffff' : '#2a2a2c', map: tex.grip, roughness: 1 }),
    // The rim is a thin band seen from both sides as the board tilts.
    ply: new THREE.MeshStandardMaterial({ color: tex.ply ? '#ffffff' : '#dcc29a', map: tex.ply, roughness: 0.6, side: THREE.DoubleSide }),
    graphic: new THREE.MeshStandardMaterial({ color: tex.graphic ? '#ffffff' : '#e9b44c', map: tex.graphic, roughness: 0.35 }),
    maple: material.maple(), aluminium: material.aluminium(), steel: material.steel(), dark: material.dark(), riser: material.riser(),
    bushing: material.bushing(), urethane: material.urethane(), core: material.core(), shield: material.shield(),
  };
  if (long(b)) {
    // Longboard: amber 68 mm wheels with white cores, red bushings.
    m.urethane.color.set('#e9a23b'); m.core.color.set('#f4efe4'); m.bushing.color.set('#d4583a');
  }
  // Deck: maple top under the grip (a 5 mm sanded margin shows), rounded rim, graphic.
  add('deck', new THREE.Mesh(surfaceGeometry(b, t * 0.95, 0, false), m.maple));
  add('deck', new THREE.Mesh(surfaceGeometry(b, t + 0.0004, 0.005, false), m.grip));
  add('deck', new THREE.Mesh(surfaceGeometry(b, -t * 0.95, 0, true), m.graphic));
  add('deck', new THREE.Mesh(rimGeometry(b), m.ply));

  const pivot = b.pivot * Math.PI / 180, drop = long(b), hw = b.track - 0.07;
  for (const side of [1, -1] as const) {
    const x = side * b.base;
    // Baseplate: under the deck on risers (skate), or on top of it with the
    // truck dropped through a hole (longboard drop-through).
    const plateZ = drop ? t + 0.00325 : -t - 0.003 - 0.00325;
    for (const dx of [-0.021, 0.021]) for (const dy of [-0.017, 0.017]) {
      add('deck', new THREE.Mesh(along(new THREE.CylinderGeometry(0.0034, 0.0034, 0.0012, 16)), m.dark)).position.set(x + dx, dy, drop ? plateZ + 0.0038 : t + 0.0008);
      add('deck', new THREE.Mesh(along(hex(0.0036, 0.003)), m.steel)).position.set(x + dx, dy, drop ? -t - 0.0015 : plateZ - 0.00325 - 0.0015);
    }
    if (!drop) add('deck', new THREE.Mesh(new RoundedBoxGeometry(0.074, 0.058, 0.003, 2, 0.0012), m.riser)).position.set(x, 0, -t - 0.0015);
    add('deck', new THREE.Mesh(new RoundedBoxGeometry(0.068, 0.054, 0.0065, 2, 0.002), m.aluminium)).position.set(x, 0, plateZ);
    // Traditional kingpin leans in towards the middle with the pivot cup
    // outboard; a reverse kingpin is the mirror image, outboard and leaning out.
    const out = drop ? 1 : -1;
    const kingpin = new THREE.Group();
    kingpin.position.set(x + out * side * 0.016, 0, -t - (drop ? 0.002 : 0.009));
    kingpin.rotation.y = out * side * 0.42;
    kingpin.updateMatrix();
    const boss = new THREE.Mesh(along(new THREE.CylinderGeometry(0.0095, 0.011, 0.009, 20)), m.aluminium); boss.position.z = -0.003;
    const pin = new THREE.Mesh(along(new THREE.CylinderGeometry(0.0033, 0.0033, 0.034, 12)), m.steel); pin.position.z = -0.016;
    const top = new THREE.Mesh(along(new THREE.CylinderGeometry(0.0085, 0.0095, 0.006, 20)), m.bushing); top.position.z = -0.0105;
    const bottom = new THREE.Mesh(along(new THREE.CylinderGeometry(0.009, 0.0075, 0.006, 20)), m.bushing); bottom.position.z = -0.0225;
    const washer = new THREE.Mesh(along(new THREE.CylinderGeometry(0.0095, 0.0095, 0.001, 20)), m.steel); washer.position.z = -0.026;
    const nut = new THREE.Mesh(along(hex(0.0055, 0.004)), m.steel); nut.position.z = -0.029;
    for (const part of [boss, pin, top, bottom, washer, nut]) { part.applyMatrix4(kingpin.matrix); add('deck', part); }
    const cup = add('deck', new THREE.Mesh(along(new THREE.CylinderGeometry(0.0055, 0.0065, 0.008, 16)), m.aluminium));
    cup.position.set(x - out * side * 0.024, 0, -t - 0.01);
    cup.rotation.y = side * (Math.PI / 2 - pivot);

    // Hanger, in its own body frame (origin on the axle). Reverse-kingpin
    // hangers stand taller, with the kingpin hole outboard.
    const rise = drop ? 0.024 : 0.017;
    const shape = new THREE.Shape();
    shape.moveTo(-hw + 0.002, -0.004); shape.quadraticCurveTo(-hw - 0.002, -0.006, -hw + 0.008, -0.008);
    shape.lineTo(hw - 0.008, -0.008); shape.quadraticCurveTo(hw + 0.002, -0.006, hw - 0.002, -0.004);
    shape.bezierCurveTo(hw * 0.6, 0.0, 0.035, rise * 0.7, 0.018, rise); shape.lineTo(-0.018, rise);
    shape.bezierCurveTo(-0.035, rise * 0.7, -hw * 0.6, 0.0, -hw + 0.002, -0.004);
    const cast = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.004, bevelSegments: 4, curveSegments: 10 });
    cast.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1)).translate(-0.006, 0, 0);
    cast.computeVertexNormals();
    add('hanger', new THREE.Mesh(cast, m.aluminium), side);
    // Axle housings taper out to each wheel; the axle runs through.
    for (const w of [1, -1]) {
      const housing = add('hanger', new THREE.Mesh(new THREE.CylinderGeometry(0.0048, 0.0068, 0.03, 16), m.aluminium), side);
      housing.position.set(0, w * (hw - 0.016), -0.002);
      housing.rotation.x = w > 0 ? 0 : Math.PI;
    }
    const wheelHalf = b.wheelHalf ?? 0.014;
    add('hanger', new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 2 * (b.track + wheelHalf + 0.005), 12), m.steel), side);
    const ring = add('hanger', new THREE.Mesh(along(new THREE.TorusGeometry(0.0078, 0.0026, 10, 24)), m.aluminium), side);
    ring.position.set(out * side * 0.014, 0, rise - 0.005); ring.rotation.y = out * side * 0.42;
    const pivotPin = add('hanger', new THREE.Mesh(along(new THREE.CylinderGeometry(0.0032, 0.0042, 0.016, 12)), m.aluminium), side);
    pivotPin.position.set(-out * side * 0.012, 0, rise); pivotPin.rotation.y = side * (Math.PI / 2 - pivot);

    for (const w of [1, -1] as const) {
      // Urethane with a radiused lip, a coloured core, sealed 608 bearings.
      // Longboard wheels are bigger and wider, with the bearings set in.
      const r = b.wheel, h = wheelHalf, sx = r / 0.024, sy = h / 0.014;
      const profile = [[0.012, -0.014], [0.0195, -0.014], [0.0222, -0.0128], [0.0234, -0.0105], [0.024, -0.0065], [0.024, 0.0065], [0.0234, 0.0105], [0.0222, 0.0128], [0.0195, 0.014], [0.012, 0.014]]
        .map(([a, c]) => new THREE.Vector2(a === 0.012 ? 0.012 * Math.max(1, sx * 0.85) : a * sx, c * sy));
      add('wheel', new THREE.Mesh(new THREE.LatheGeometry(profile, 48), m.urethane), side, w);
      const cr = 0.0122 * Math.max(1, sx * 0.85) + 0.0002, ch = h - 0.0014;
      const core = new THREE.LatheGeometry([[0.0068, -ch], [cr, -ch], [cr, ch], [0.0068, ch]].map(([a, c]) => new THREE.Vector2(a, c)), 32);
      add('wheel', new THREE.Mesh(core, m.core), side, w);
      for (const face of [-1, 1]) {
        const bearing = add('wheel', new THREE.Mesh(new THREE.CylinderGeometry(0.0068, 0.0068, 0.0012, 24), m.shield), side, w);
        bearing.position.y = face * (ch + 0.0002);
        const race = add('wheel', new THREE.Mesh(new THREE.TorusGeometry(0.0068, 0.0006, 6, 24).rotateX(Math.PI / 2), m.steel), side, w);
        race.position.y = face * (ch + 0.0008);
      }
      add('wheel', new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.0008, 16), m.steel), side, w).position.y = w * (h + 0.0005);
      add('wheel', new THREE.Mesh(hex(0.0048, 0.0045), m.steel), side, w).position.y = w * (h + 0.0032);
    }
  }
  return parts;
}
