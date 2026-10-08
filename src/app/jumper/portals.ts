import * as THREE from 'three';

// The downhill runs, as signs in the playground: a picture of each run on a
// thin black stand, with a pad on the floor in front. Walk Jumper onto a pad
// and press Enter to ride that run. Drawing only: the robot walks over the
// pads, and the signs stand beyond them.

export type PortalId = 'calle' | 'costa' | 'minimal';
export const portals: { id: PortalId; name: string; note: string; image: string }[] = [
  { id: 'calle', name: 'Calle', note: 'Skate', image: '/jumper/skate-calle.webp' },
  { id: 'costa', name: 'Costa', note: 'Longboard', image: '/jumper/skate-costa.webp' },
  { id: 'minimal', name: 'Costa minimal', note: 'Longboard', image: '/jumper/skate-minimal.webp' },
];
/**
 * The row stands in the open, clear of the boxes, square to the default camera
 * (which looks from +x, -y): its centre, the angle it faces, the spacing, and
 * each pad's size (m). The signs stand behind their pads.
 */
export const pad = { centre: [-0.75, 0.75], facing: Math.PI / 4, spacing: 0.78, width: 0.5, depth: 0.4 };
const along = [Math.cos(pad.facing), Math.sin(pad.facing)], back = [-Math.sin(pad.facing), Math.cos(pad.facing)];
const place = (i: number, behind = 0): [number, number] => [pad.centre[0] + along[0] * (i - 1) * pad.spacing + back[0] * behind, pad.centre[1] + along[1] * (i - 1) * pad.spacing + back[1] * behind];

function caption(name: string, note: string) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#fdfdfc'; c.fillRect(0, 0, 1024, 128);
  c.fillStyle = '#111111'; c.font = '600 60px system-ui, sans-serif'; c.textBaseline = 'middle';
  c.fillText(name, 24, 66);
  c.fillStyle = '#77766f'; c.font = '400 40px system-ui, sans-serif'; c.textAlign = 'right';
  c.fillText(note, 1000, 68);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  return texture;
}

export function buildPortals(scene: THREE.Scene) {
  const loader = new THREE.TextureLoader();
  const ink = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.6 });
  const pads: { id: PortalId; x: number; y: number; fill: THREE.MeshStandardMaterial; edge: THREE.LineBasicMaterial }[] = [];
  for (const [i, portal] of portals.entries()) {
    // The sign: picture (16:10) over a caption strip, on two thin black legs, leaning back a touch.
    const sign = new THREE.Group();
    sign.position.set(...place(i, pad.depth / 2 + 0.16), 0); sign.rotation.z = pad.facing;
    const width = 0.52, height = 0.325, base = 0.1;
    const picture = loader.load(portal.image); picture.colorSpace = THREE.SRGBColorSpace; picture.anisotropy = 8;
    const board = new THREE.Group(); board.position.z = base; board.rotation.x = -0.12; sign.add(board);
    const image = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: picture, toneMapped: false }));
    image.rotation.x = Math.PI / 2; image.position.set(0, 0, 0.075 + height / 2);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 8), new THREE.MeshBasicMaterial({ map: caption(portal.name, portal.note), color: '#ffffff', toneMapped: false }));
    strip.rotation.x = Math.PI / 2; strip.position.set(0, 0, width / 16);
    const back = new THREE.Mesh(new THREE.BoxGeometry(width + 0.016, 0.008, height + width / 8 + 0.016), ink);
    back.position.set(0, 0.0045, (height + width / 8) / 2 + 0.0005); back.castShadow = true;
    board.add(back, image, strip);
    for (const side of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, base + 0.02), ink); leg.position.set(side * width * 0.4, 0.01, (base + 0.02) / 2); leg.castShadow = true; sign.add(leg); }
    scene.add(sign);
    // The pad: a thin off-white plate with a fine edge; it turns black while Jumper stands on it.
    const fill = new THREE.MeshStandardMaterial({ color: '#efeee9', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(pad.width, pad.depth), fill);
    const [px, py] = place(i);
    plate.position.set(px, py, 0.0015); plate.rotation.z = pad.facing; plate.receiveShadow = true;
    const edge = new THREE.LineBasicMaterial({ color: '#b9b8ad' });
    const w = pad.width / 2, d = pad.depth / 2;
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, y]) => new THREE.Vector3(x, y, 0.002))), edge);
    outline.position.set(px, py, 0); outline.rotation.z = pad.facing;
    scene.add(plate, outline);
    pads.push({ id: portal.id, x: px, y: py, fill, edge });
  }
  let active: PortalId | undefined;
  /** Which pad (if any) Jumper stands on; lights it. */
  return (x: number, y: number) => {
    // In each pad's own frame (the row is turned to face the camera).
    const on = pads.find(p => { const dx = x - p.x, dy = y - p.y; return Math.abs(dx * along[0] + dy * along[1]) < pad.width / 2 && Math.abs(dx * back[0] + dy * back[1]) < pad.depth / 2; })?.id;
    if (on !== active) {
      active = on;
      for (const p of pads) { p.fill.color.set(p.id === on ? '#111111' : '#efeee9'); p.edge.color.set(p.id === on ? '#111111' : '#b9b8ad'); }
    }
    return on;
  };
}
