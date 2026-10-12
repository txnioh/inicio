// Runs in the browser through the Vite dev server (see export-runs.mjs): takes
// each downhill run's physics and drawing straight from the site's own code,
// for packaging as a jumper-design .map. Physics is the MJCF the site
// simulates (road, curbs, cones, board) with the drop-in start of dropin.ts
// in place of the site's stopper. Drawing is every mesh in world coordinates with
// its material; the coast's shaded ground gets per-vertex colours from the
// same terrain formula (its far-distance form: no fine grain), since a .map
// carries flat materials only.
import * as THREE from 'three';
import { courseFor, type BoardKind, type Look } from '../../src/app/jumper/skate';
import { dropIn } from './dropin';

const fract = (v: number) => v - Math.floor(v);
function tHash(x: number, y: number) {
  x = fract(x * 123.34); y = fract(y * 456.21);
  const d = x * (x + 45.32) + y * (y + 45.32); x += d; y += d;
  return fract(x * y);
}
function tNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = tHash(ix, iy), b = tHash(ix + 1, iy), c = tHash(ix, iy + 1), d = tHash(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
function tFbm(x: number, y: number) { let v = 0, a = 0.5; for (let i = 0; i < 4; i++) { v += a * tNoise(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 17.1; a *= 0.5; } return v; }
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** terrainMaterial.ts's colour (sRGB), with fine = 0.5 and detail = 0. */
function terrainColour(p: THREE.Vector3, n: THREE.Vector3, bend: number, sea: number) {
  const fine = 0.5, slope = 1 - clamp(n.z, 0, 1), h = p.z - sea;
  const macro = tFbm(p.x * 0.03, p.y * 0.03), mid = tFbm(p.x * 0.21 + 7, p.y * 0.21 + 7), warp = tFbm(p.x * 0.07, p.y * 0.07);
  const lush = [0.33, 0.42, 0.19], olive = [0.47, 0.5, 0.25], gold = [0.72, 0.62, 0.37];
  const sunward = clamp((n.x * 0.85 - n.y * 0.53) * 4, 0, 1);
  let ground = mix(lush, olive, smooth(0.3, 0.7, macro));
  ground = mix(ground, gold, clamp(smooth(10, 22, h + (macro - 0.5) * 14) * 0.7 + sunward * 0.35 * smooth(0.35, 0.65, macro), 0, 0.85));
  const scrub = smooth(0.46, 0.7, mid * 0.7 + (macro - 0.5) * 0.2 + bend * 0.6 + 0.15) * (1 - smooth(0.25, 0.42, slope)) * (1 - smooth(14, 26, h));
  ground = mix(ground, [0.27, 0.34, 0.18], scrub * 0.75);
  ground = mix(ground, [0.6, 0.5, 0.37], smooth(0.68, 0.74, warp) * 0.3 * (1 - scrub));
  const layer = p.z * 3.4 + p.x * 0.05 + (warp - 0.5) * 2.4;
  const band = Math.sin(layer * 1.3 + Math.sin(layer * 0.37) * 2) * 0.5 + 0.5;
  let rock = mix([0.5, 0.45, 0.39], [0.62, 0.56, 0.47], smooth(0.35, 0.65, band));
  rock = mix(rock, [0.5, 0.39, 0.31], smooth(0.8, 0.97, Math.sin(layer * 0.53 + 1) * 0.5 + 0.5) * 0.45);
  const rocky = smooth(0.26, 0.48, slope + (mid - 0.5) * 0.3 - bend * 0.25);
  const bare = mix([0.6, 0.57, 0.53], [0.74, 0.71, 0.67], macro);
  const high = smooth(18, 34, h + (macro - 0.5) * 16);
  let colour = mix(ground, bare, high * 0.85);
  colour = mix(colour, rock, rocky);
  const shore = 1 - smooth(0.2, 0.75, h);
  colour = mix(colour, mix([0.77, 0.69, 0.53], [0.62, 0.56, 0.45], rocky), shore);
  colour = mix(colour, [0.33, 0.31, 0.29], 1 - smooth(0.03, 0.14, h));
  return colour.map(v => clamp(v * (0.86 + 0.24 * smooth(0.6, -0.6, bend)), 0, 1));
}

/** Average colour of a texture, as a CSS hex (for textured meshes). */
function textureColour(texture: THREE.Texture, tint: THREE.Color) {
  const image = texture.image as CanvasImageSource & { width: number; height: number } | undefined;
  if (!image?.width) return '#' + tint.getHexString();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
  const c = canvas.getContext('2d')!; c.drawImage(image, 0, 0, 16, 16);
  const data = c.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  const n = data.length / 4, colour = new THREE.Color().setRGB(r / n / 255 * tint.r, g / n / 255 * tint.g, b / n / 255 * tint.b, THREE.SRGBColorSpace);
  return '#' + colour.getHexString();
}

const base64 = (array: Float32Array | Uint32Array) => {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

interface Part { name: string; material: Record<string, unknown>; positions: string; indices: string; colours?: string }

function meshes(scene: THREE.Scene, sea: number) {
  const parts: Part[] = [];
  const matrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), v = new THREE.Vector3(), n = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverseVisible(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry, position = geometry.attributes.position;
    if (!position) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const sky = geometry.type === 'SphereGeometry' && (geometry as THREE.SphereGeometry).parameters.radius > 100;
    if (sky) return;
    const instances = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    const index = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: position.count }, (_, i) => i);
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index.length, materialIndex: 0 }];
    for (let k = 0; k < instances; k++) {
      matrix.copy(mesh.matrixWorld);
      if (instances > 1 || (mesh as THREE.InstancedMesh).isInstancedMesh) { const local = new THREE.Matrix4(); (mesh as THREE.InstancedMesh).getMatrixAt(k, local); matrix.multiply(local); }
      normalMatrix.getNormalMatrix(matrix);
      const world = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) { v.fromBufferAttribute(position, i).applyMatrix4(matrix); world.set([v.x, v.y, v.z], i * 3); }
      for (const group of groups) {
        const material = materials[group.materialIndex ?? 0] as THREE.MeshStandardMaterial & THREE.ShaderMaterial;
        if (!material || material.visible === false) continue;
        const tris = new Uint32Array(index.slice(group.start, group.start + group.count));
        const terrain = material.customProgramCacheKey?.() === 'coast-terrain';
        const shader = material.type === 'ShaderMaterial';
        let colour = material.color ? '#' + material.color.getHexString() : '#ffffff';
        if (material.map) colour = textureColour(material.map, material.color);
        if (shader) colour = '#3d6f86'; // the sea's mid-water tone
        const part: Part = {
          name: (mesh.name || material.name || material.type).replace(/[^A-Za-z0-9_]/g, '_') || 'part',
          material: { color: colour, roughness: material.roughness ?? 0.8, metalness: material.metalness ?? 0, emissive: material.emissive ? '#' + material.emissive.getHexString() : '#000000', emissiveIntensity: material.emissiveIntensity ?? 0, opacity: material.transparent ? material.opacity : 1, unlit: material.type === 'MeshBasicMaterial', terrain, double: material.side === THREE.DoubleSide },
          positions: base64(world), indices: base64(tris),
        };
        if (terrain) {
          const normal = geometry.attributes.normal, bend = geometry.attributes.curvature;
          const colours = new Float32Array(position.count * 3);
          for (let i = 0; i < position.count; i++) {
            v.fromArray(world, i * 3); n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
            colours.set(terrainColour(v, n, bend ? bend.getX(i) : 0, sea), i * 3);
          }
          part.colours = base64(colours);
        }
        parts.push(part);
      }
    }
  });
  return parts;
}

/** One run: the drop-in physics, where Jumper starts, and the site's drawing of the run. */
export function extract(kind: BoardKind, look: Look, sea = 0) {
  const course = courseFor(kind, look), run = dropIn(kind, look);
  const scene = new THREE.Scene();
  // The stopper boom only opens on the site's Enter key: the .map has none.
  course.build(scene, course.frame(course.rampStart)).visible = false;
  return { asset: run.asset, world: run.world, spawn: run.spawn, parts: meshes(scene, sea) };
}
