import * as THREE from 'three';

// The coast road's furniture, after the Mediterranean and Big Sur coast roads:
// wooden telephone poles along the uphill verge with sagging wires, and
// chevron signs on the outside of the tight bends. The hillside itself (grass,
// scrub, rock) is the terrain material's work, not geometry. Scaled to Jumper
// (~1:10): a 7.5 m pole is 75 cm here. Repeated parts are instanced.

export interface Land {
  /** Drawn ground height at (x, y). */
  surface(x: number, y: number): number;
  /** World point at arc length s, d to the left of the centre line, h above the road. */
  offset(s: number, d: number, h?: number): [number, number, number];
  heading(s: number): number;
  half: number; total: number;
  /** Bends: [arc length start, end, +1 left / -1 right]. */
  bends: [number, number, number][];
}

const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), position = new THREE.Vector3(), euler = new THREE.Euler();
function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, items: { p: [number, number, number]; s: [number, number, number]; r?: [number, number, number]; c?: THREE.Color }[]) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  items.forEach((item, i) => {
    euler.set(...(item.r ?? [0, 0, 0])); quaternion.setFromEuler(euler);
    mesh.setMatrixAt(i, matrix.compose(position.set(...item.p), quaternion, scale.set(...item.s)));
    if (item.c) mesh.setColorAt(i, item.c);
  });
  mesh.count = items.length;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Wooden telephone poles along the uphill verge, with two sagging wires. */
function poles(land: Land) {
  const items: Parameters<typeof instanced>[2] = [], arms: Parameters<typeof instanced>[2] = [], wires: number[] = [];
  const tops: [number, number, number][] = [];
  for (let s = 6; s < land.total - 4; s += 5.5) {
    const [x, y] = land.offset(s, land.half + 0.75), z = land.surface(x, y), heading = land.heading(s);
    items.push({ p: [x, y, z - 0.05], s: [1, 1, 1], r: [0, 0, heading] });
    arms.push({ p: [x, y, z + 0.66], s: [1, 1, 1], r: [0, 0, heading] });
    tops.push([x, y, z + 0.67]);
  }
  for (let i = 1; i < tops.length; i++) for (const side of [-1, 1]) {
    const [ax, ay, az] = tops[i - 1], [bx, by, bz] = tops[i], h = land.heading(6 + (i - 0.5) * 5.5);
    const ox = -Math.sin(h) * side * 0.07, oy = Math.cos(h) * side * 0.07;
    for (let k = 0; k < 8; k++) for (const t of [k / 8, (k + 1) / 8]) wires.push(ax + (bx - ax) * t + ox, ay + (by - ay) * t + oy, az + (bz - az) * t - Math.sin(Math.PI * t) * 0.06);
  }
  const wood = new THREE.MeshStandardMaterial({ color: '#5e4b3c', roughness: 1 });
  const group = new THREE.Group();
  group.add(instanced(new THREE.CylinderGeometry(0.008, 0.012, 0.75, 6).rotateX(Math.PI / 2).translate(0, 0, 0.375), wood, items));
  group.add(instanced(new THREE.BoxGeometry(0.012, 0.18, 0.012), wood, arms));
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)), new THREE.LineBasicMaterial({ color: '#2c2a28', transparent: true, opacity: 0.55 }));
  group.add(lines);
  return group;
}

let chevronTextures: Record<number, THREE.CanvasTexture | null> | undefined;
function chevronTexture(direction: number) {
  if (typeof document === 'undefined') return null;
  chevronTextures ??= {};
  if (chevronTextures[direction] !== undefined) return chevronTextures[direction];
  const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#f2c230'; c.fillRect(0, 0, 96, 128);
  c.fillStyle = '#1b1b1b'; c.beginPath();
  const flip = (x: number) => direction > 0 ? 96 - x : x;
  for (const [x, y] of [[22, 14], [58, 14], [84, 64], [58, 114], [22, 114], [48, 64]]) c.lineTo(flip(x), y);
  c.closePath(); c.fill();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return (chevronTextures[direction] = texture);
}

/** Chevron signs on the outside of each bend, facing the oncoming board. */
function chevrons(land: Land) {
  const group = new THREE.Group(), post = new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.7 });
  const back = new THREE.MeshStandardMaterial({ color: '#8f9399', roughness: 0.6, metalness: 0.3 });
  for (const [s0, s1, turn] of land.bends) {
    const texture = chevronTexture(turn), face = new THREE.MeshStandardMaterial({ map: texture, color: texture ? '#ffffff' : '#f2c230', roughness: 0.5 });
    for (let s = s0 + 1.5; s < s1 - 1; s += 3.2) {
      // Outside of the bend: right of a left turn, left of a right turn, just beyond the curb or rail.
      const d = -turn * (land.half + 0.32), [x, y] = land.offset(s, d), z = land.surface(x, y), heading = land.heading(s);
      const sign = new THREE.Group(); sign.position.set(x, y, Math.max(z, land.offset(s, 0)[2] - 0.02)); sign.rotation.z = heading;
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.2), post); pole.position.z = 0.1;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.1), face); plate.rotation.set(Math.PI / 2, -Math.PI / 2, 0); plate.position.set(-0.008, 0, 0.21);
      const backing = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.075, 0.1), back); backing.position.set(-0.002, 0, 0.21);
      sign.add(pole, backing, plate);
      group.add(sign);
    }
  }
  return group;
}

/** The road's furniture on the hillside. */
export function hillside(land: Land) {
  const group = new THREE.Group();
  group.add(poles(land), chevrons(land));
  return group;
}
