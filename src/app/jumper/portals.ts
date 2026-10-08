import * as THREE from 'three';
import { strings, type Lang } from './i18n';

// The downhill runs, as signs in the playground: a picture of each run floating
// over the floor, its title floating above it, with a pad on the floor in front. Walk Jumper onto a pad
// and press Enter to ride that run. Drawing only: the robot walks over the
// pads, and the signs stand beyond them.

export type PortalId = 'calle' | 'costa' | 'minimal';
// Their titles are in i18n.ts (maps).
export const portals: { id: PortalId; image: string }[] = [
  { id: 'calle', image: '/jumper/skate-calle.webp' },
  { id: 'costa', image: '/jumper/skate-costa.webp' },
  { id: 'minimal', image: '/jumper/skate-minimal.webp' },
];
/**
 * The row stands in the open, clear of the boxes, square to the default camera
 * (which looks from +x, -y): its centre, the angle it faces, the spacing, and
 * each pad's size (m). The signs stand behind their pads.
 */
export const pad = { centre: [-0.75, 0.75], facing: Math.PI / 4, spacing: 0.78, width: 0.5, depth: 0.4 };
const along = [Math.cos(pad.facing), Math.sin(pad.facing)], back = [-Math.sin(pad.facing), Math.cos(pad.facing)];
const place = (i: number, behind = 0): [number, number] => [pad.centre[0] + along[0] * (i - 1) * pad.spacing + back[0] * behind, pad.centre[1] + along[1] * (i - 1) * pad.spacing + back[1] * behind];

/** The title, alone on a clear canvas, so it floats with no strip behind it. */
function title([name, note]: readonly string[]) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 160;
  const c = canvas.getContext('2d')!;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.font = '600 96px system-ui, sans-serif';
  const gap = 28, nameWidth = c.measureText(name).width;
  c.font = '400 56px system-ui, sans-serif';
  const left = 512 - (nameWidth + gap + c.measureText(note).width) / 2;
  c.textAlign = 'left';
  c.fillStyle = '#3d3c37'; c.font = '600 96px system-ui, sans-serif'; c.fillText(name, left, 116);
  c.fillStyle = '#8f8e86'; c.font = '400 56px system-ui, sans-serif'; c.fillText(note, left + nameWidth + gap, 116);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  return texture;
}

export function buildPortals(scene: THREE.Scene, lang: Lang) {
  const loader = new THREE.TextureLoader();
  const pads: { id: PortalId; x: number; y: number; fill: THREE.MeshStandardMaterial; edge: THREE.LineBasicMaterial }[] = [];
  const labels: { id: PortalId; material: THREE.MeshBasicMaterial }[] = [];
  const floating: { object: THREE.Object3D; z: number; phase: number }[] = [];
  for (const [i, portal] of portals.entries()) {
    // The sign: the picture (16:10) floats, leaning back a touch, with no
    // stand or frame; its shadow on the floor shows the gap. The title floats
    // on its own above it.
    const sign = new THREE.Group();
    sign.position.set(...place(i, pad.depth / 2 + 0.16), 0); sign.rotation.z = pad.facing;
    const width = 0.52, height = 0.325, base = 0.14;
    const picture = loader.load(portal.image); picture.colorSpace = THREE.SRGBColorSpace; picture.anisotropy = 8;
    const board = new THREE.Group(); board.position.z = base; board.rotation.x = -0.12; sign.add(board);
    const image = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: picture, toneMapped: false, side: THREE.DoubleSide }));
    image.rotation.x = Math.PI / 2; image.position.z = height / 2; image.castShadow = true;
    board.add(image);
    const words = new THREE.MeshBasicMaterial({ map: title(strings[lang].maps[portal.id]), transparent: true, depthWrite: false, toneMapped: false });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 160 / 1024), words);
    labels.push({ id: portal.id, material: words });
    label.rotation.x = Math.PI / 2; label.position.z = base + height + 0.09;
    sign.add(label);
    scene.add(sign);
    floating.push({ object: board, z: base, phase: i * 2.1 }, { object: label, z: label.position.z, phase: i * 2.1 + 0.8 });
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
  /** Retitle the signs in another language. */
  const retitle = (lang: Lang) => { for (const l of labels) { l.material.map?.dispose(); l.material.map = title(strings[lang].maps[l.id]); l.material.needsUpdate = true; } };
  /** Which pad (if any) Jumper stands on; lights it. */
  const at = (x: number, y: number) => {
    // A slow bob, out of step from sign to sign and between picture and title.
    const t = performance.now() / 1000;
    for (const f of floating) f.object.position.z = f.z + Math.sin(t * 1.3 + f.phase) * 0.008;
    // In each pad's own frame (the row is turned to face the camera).
    const on = pads.find(p => { const dx = x - p.x, dy = y - p.y; return Math.abs(dx * along[0] + dy * along[1]) < pad.width / 2 && Math.abs(dx * back[0] + dy * back[1]) < pad.depth / 2; })?.id;
    if (on !== active) {
      active = on;
      for (const p of pads) { p.fill.color.set(p.id === on ? '#111111' : '#efeee9'); p.edge.color.set(p.id === on ? '#111111' : '#b9b8ad'); }
    }
    return on;
  };
  return { at, retitle };
}
