// Node 24+. Pack indexed render geometry; physics only needs collision hulls.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import loadMujoco from '@mujoco/mujoco';
import { BufferAttribute } from 'three';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { boxes } from '../src/app/jumper/settings.ts';

const root = fileURLToPath(new URL('../public/jumper/', import.meta.url));
const manifest = JSON.parse(await readFile(`${root}manifest.json`, 'utf8'));
const physical = JSON.parse(await readFile(`${root}physics.json`, 'utf8'));
const mj = await loadMujoco();
mj.FS.mkdir('/jumper');
const directories = new Set();
for (const path of manifest.meshes) {
  let directory = '/jumper';
  for (const part of path.split('/').slice(0, -1)) {
    directory += `/${part}`;
    if (!directories.has(directory)) { mj.FS.mkdir(directory); directories.add(directory); }
  }
  mj.FS.writeFile(`/jumper/${path}`, await readFile(`${root}${path}`));
}
let xml = await readFile(`${root}jumper.xml`, 'utf8');
xml = xml.replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<option\b[^>]*\/>/, `<option ${Object.entries(physical.options).map(([key, value]) => `${key}="${Array.isArray(value) ? value.join(' ') : value}"`).join(' ')}/>`)
  .replace(/<geom\b[^>]*class="collision"[^>]*\/>/g, geom => {
    const name = geom.match(/name="([^"]+)"/)[1];
    const attributes = physical.collisions[name];
    if (!attributes) throw new Error(`Collision geom not in training: ${name}`);
    return geom.replace(/\/>$/, ` ${Object.entries(attributes).map(([key, value]) => `${key}="${Array.isArray(value) ? value.join(' ') : value}"`).join(' ')}/>`);
  });
const ground = '<geom name="playground_floor" type="plane" size="10 10 .1" contype="1" conaffinity="1" friction="1 .01 .01"/>';
const obstacles = boxes.map((box, index) => `<geom name="box_${index}" type="box" pos="${box.x} ${box.y} ${box.height / 2}" size="${box.width / 2} ${box.depth / 2} ${box.height / 2}" contype="1" conaffinity="1" friction="1 .01 .01"/>`).join('\n');
xml = xml.replace('</worldbody>', `${ground}\n${obstacles}\n</worldbody>`);
const names = Object.keys(physical.home);
const limit = physical.servo.plateau_torque_nm;
const motors = names.map(name => `<motor name="${name}_motor" joint="${name}" gear="1" forcelimited="true" forcerange="-${limit} ${limit}"/>`).join('\n');
xml = xml.replace('</mujoco>', `<actuator>${motors}</actuator></mujoco>`);
mj.FS.writeFile('/jumper/scene.xml', xml);
const model = mj.MjModel.mj_loadXML('/jumper/scene.xml');
const attributes = tag => Object.fromEntries(Array.from(tag.matchAll(/(\w+)="([^"]*)"/g), match => [match[1], match[2]]));
const meshFiles = new Map(Array.from(xml.matchAll(/<mesh\b[^>]*\/>/g), match => { const a = attributes(match[0]); return [a.name, a.file]; }));
const visualGeoms = new Map(Array.from(xml.matchAll(/<geom\b[^>]*class="visual"[^>]*\/>/g), match => { const a = attributes(match[0]); return [a.name, a]; }));
const loader = new STLLoader();
const chunks = [], geometries = [], visuals = [], placed = new Map();
let offset = 0;
for (let id = 0; id < model.ngeom; id++) {
  if (model.geom_group[id] !== 2 || model.geom_type[id] !== 7) continue;
  const name = mj.mj_id2name(model, 5, id);
  const visual = visualGeoms.get(name);
  if (!visual || ['euler', 'axisangle', 'xyaxes', 'zaxis'].some(key => key in visual)) throw new Error(`Unsupported visual transform: ${name}`);
  const meshId = model.geom_dataid[id];
  let geometry = placed.get(meshId);
  if (geometry === undefined) {
    geometry = geometries.length;
    placed.set(meshId, geometry);
    // Render the source STL directly in its CAD frame. Compiling then rotating
    // float32 vertices back from MuJoCo's inertia frame loses surface precision.
    const bytes = await readFile(`${root}${meshFiles.get(visual.mesh)}`);
    const source = loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const originalPositions = source.getAttribute('position');
    // Match the reference renderer: smooth neighbouring faces up to 60 degrees,
    // with a 0.01 mm positional tolerance. Never blend across a CAD hard edge.
    source.setAttribute('position', new BufferAttribute(Float64Array.from(originalPositions.array, v => v * 1000), 3));
    const smooth = toCreasedNormals(source, Math.PI / 3);
    smooth.setAttribute('position', originalPositions);
    const indexed = mergeVertices(smooth, 1e-7);
    const verts = indexed.getAttribute('position').array;
    const normals = indexed.getAttribute('normal').array;
    const faces = new Uint32Array(indexed.index.array);
    if (faces.length !== originalPositions.count) throw new Error(`Packing changed the triangles in ${name}`);
    for (let corner = 0; corner < faces.length; corner++) {
      for (let axis = 0; axis < 3; axis++) {
        if (Math.abs(verts[faces[corner] * 3 + axis] - originalPositions.array[corner * 3 + axis]) > 1e-7) throw new Error(`Packing moved a vertex in ${name}`);
      }
    }
    if (normals.some(value => !Number.isFinite(value))) throw new Error(`Invalid render normals in ${name}`);
    geometries.push({ vertices: offset, vertexCount: verts.length, normals: offset + verts.byteLength, faces: offset + verts.byteLength + normals.byteLength, faceCount: faces.length });
    chunks.push(Buffer.from(verts.buffer), Buffer.from(normals.buffer), Buffer.from(faces.buffer));
    offset += verts.byteLength + normals.byteLength + faces.byteLength;
    source.dispose(); indexed.dispose();
  }
  visuals.push({ name, body: mj.mj_id2name(model, 1, model.geom_bodyid[id]), geometry,
    position: (visual.pos ?? '0 0 0').split(/\s+/).map(Number),
    quaternion: (visual.quat ?? '1 0 0 0').split(/\s+/).map(Number),
    color: Array.from(model.geom_rgba.slice(id * 4, id * 4 + 3)) });
}
const binary = Buffer.concat(chunks);
const packed = gzipSync(binary, { level: 9 });
await writeFile(`${root}visuals.bin.gz`, packed);
// Every body has its own explicit inertia; visual geoms have density=0.
// Removing them preserves the mechanics while avoiding their convex hulls.
xml = xml.replace(/<geom\b[^>]*class="visual"[^>]*\/>/g, '');
const usedMeshes = new Set(Array.from(xml.matchAll(/<geom\b[^>]*mesh="([^"]+)"/g), match => match[1]));
xml = xml.replace(/<mesh\b[^>]*\/>/g, mesh => usedMeshes.has(mesh.match(/name="([^"]+)"/)[1]) ? mesh : '');
const meshes = Array.from(xml.matchAll(/<mesh\b[^>]*file="([^"]+)"/g), match => match[1]);
await writeFile(`${root}scene.xml`, xml);
mj.FS.writeFile('/jumper/physics.xml', xml);
const physics = mj.MjModel.mj_loadXML('/jumper/physics.xml');
if (physics.nq !== model.nq || physics.nbody !== model.nbody) throw new Error('Removing render meshes changed the robot topology.');
const a = new mj.MjData(model), b = new mj.MjData(physics);
mj.mj_forward(model, a); mj.mj_forward(physics, b);
for (let i = 0; i < model.nbody * 3; i++) {
  if (Math.abs(a.xpos[i] - b.xpos[i]) > 1e-10) throw new Error('Removing render meshes changed a body transform.');
}
for (const field of ['body_mass', 'body_inertia', 'jnt_axis', 'jnt_range']) {
  if (model[field].some((value, index) => Math.abs(value - physics[field][index]) > 1e-10)) throw new Error(`Removing visual meshes changed ${field}.`);
}
const originalBytes = (await Promise.all(manifest.meshes.map(path => readFile(`${root}${path}`)))).reduce((sum, bytes) => sum + bytes.length, 0);
manifest.runtime = {
  model: 'scene.xml',
  geometry: 'visuals.bin.gz',
  meshes, geometries, visuals,
  engine: mj.mj_versionString(),
  bytes: packed.length,
  unpackedBytes: binary.length,
  sha256: createHash('sha256').update(packed).digest('hex'),
  joints: model.njnt - 1,
  bodies: model.nbody,
  boxes,
};
await writeFile(`${root}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${model.njnt - 1} joints, ${model.nbody} bodies. STL ${(originalBytes / 1e6).toFixed(2)} MB → packed visuals ${(packed.length / 1e6).toFixed(2)} MB (${Math.round((1 - packed.length / originalBytes) * 100)}% smaller). Body transforms verified.`);
a.delete(); b.delete(); physics.delete();
model.delete();
