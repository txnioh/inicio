import * as THREE from 'three';
import { coast, coastRoad } from './mountain.ts';
import { frameQuat, stopperBoom, type Course, type Frame } from './track.ts';

// The coast road drawn minimal, in Inicio's palette, like the obstacle road:
// the same road, physics and ground, as an off-white topographic model.
// Contour lines every 50 cm (a heavier one every 2.5 m) show the hillside's
// gullies and spurs, the sea is a flat pale plane, and the road furniture is
// plain off-white volumes with fine edges. The only colour is the board,
// Jumper and the stopper; the finish is one black line under a thin black gate.

const { line, frame, offset, band, terrain, hill, xml, path } = coastRoad;
const palette = { paper: '#fdfdfc', land: '#f6f5f1', block: '#efeee9', road: '#e1e0d9', paint: '#c4c3bb', edge: '#a9a89e', ink: '#111111', sea: '#e1e6e7' };

/** The ground: off-white, with contour lines drawn in the shader from the world height. */
function contourMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: palette.land, roughness: 1 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vHeight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeight = (modelMatrix * vec4(transformed, 1.0)).z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vHeight;
        // An antialiased line wherever height / spacing crosses a whole number.
        float contour(float spacing, float width) {
          float z = vHeight / spacing, w = fwidth(z);
          return 1.0 - smoothstep(0.0, w * width, abs(fract(z + 0.5) - 0.5));
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Lines fade out far away, before they crowd into a grey moiré.
        float far = 1.0 - smoothstep(60.0, 260.0, length(vViewPosition));
        float lines = max(contour(0.5, 1.2) * 0.28, contour(2.5, 1.7) * 0.5) * far;
        // The waterline: one firmer line, everywhere.
        lines = max(lines, (1.0 - smoothstep(0.0, fwidth(vHeight) * 1.5, abs(vHeight - ${coast.seaLevel.toFixed(2)} - 0.02))) * 0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.35, 0.32), lines);`);
  };
  material.customProgramCacheKey = () => 'coast-contours';
  return material;
}

/**
 * A volume swept along the road: `profile` is a closed outline across it
 * ([offset left, height]). Each face is its own strip, so the shading is flat
 * per face, and every corner of the profile runs as a fine edge line.
 */
function sweep(profile: [number, number][], material: THREE.Material, edge: THREE.LineBasicMaterial, step = 0.2) {
  const group = new THREE.Group(), rows = Math.floor(line.total / step);
  for (let f = 0; f < profile.length - 1; f++) {
    const [a, b] = [profile[f], profile[f + 1]], positions: number[] = [], index: number[] = [];
    for (let r = 0; r <= rows; r++) {
      positions.push(...offset(r * step, a[0], a[1]), ...offset(r * step, b[0], b[1]));
      if (r) { const k = (r - 1) * 2; index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const [d, h] of profile.slice(0, -1)) {
    const points: number[] = [];
    for (let r = 0; r < rows; r++) points.push(...offset(r * step, d, h), ...offset((r + 1) * step, d, h));
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)), edge));
  }
  return group;
}

function build(scene: THREE.Scene, stopper: Frame) {
  const edge = new THREE.LineBasicMaterial({ color: palette.edge, transparent: true, opacity: 0.5 });
  const block = new THREE.MeshStandardMaterial({ color: palette.block, roughness: 0.95, side: THREE.DoubleSide });
  const ink = new THREE.MeshStandardMaterial({ color: palette.ink, roughness: 0.6 });
  // Ground layers sit millimetres apart, each with a polygon offset, as on the obstacle road.
  const layer = (color: string, level: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -level, polygonOffsetUnits: -level * 2 });
  const ground = (geometry: THREE.BufferGeometry, material: THREE.Material) => { const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; scene.add(mesh); return mesh; };

  // The landscape as a white site model, and the sea as a flat pale plane.
  scene.add(terrain(contourMaterial(), false).group);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: palette.sea, roughness: 1 }));
  sea.position.z = coast.seaLevel; sea.receiveShadow = true; scene.add(sea);

  // Road: pale surface, faint edge lines and centre dashes, a black finish line.
  ground(band(-coast.half - 0.02, coast.half + 0.02, 0.002), layer(palette.road, 1));
  const paint = layer(palette.paint, 2);
  for (const d of [coast.half - 0.09, -coast.half + 0.06]) ground(band(d, d + 0.03, 0.004), paint);
  for (let s = 0.6; s < line.total; s += 1.2) if (Math.abs(s - line.finish) > 1.2) ground(band(-0.012, 0.012, 0.004, s, s + 0.6, 0.1), paint);
  ground(band(-coast.half, coast.half, 0.006, line.finish, line.finish + 0.03, 0.03), layer(palette.ink, 3));

  // Curb (mountain side) and low wall (sea side), where the physics has them.
  const w = 0.04, h = coast.rail;
  for (const side of [1, -1]) {
    const d = side * (coast.half + 0.08);
    scene.add(sweep([[d - w, 0], [d - w, h], [d + w, h], [d + w, 0]], block, edge));
  }

  // Finish gate: two thin black posts and a bar, as on the obstacle road.
  const fin = frame(line.finish), gate = new THREE.Group(), q = frameQuat({ ...fin, slope: 0 });
  gate.position.set(...fin.p); gate.quaternion.set(q[1], q[2], q[3], q[0]);
  for (const side of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.9), ink); leg.position.set(0.015, side * (coast.half + 0.2), 0.45); gate.add(leg); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, coast.half * 2 + 0.412, 0.012), ink); bar.position.set(0.015, 0, 0.9); gate.add(bar);
  gate.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  scene.add(gate);

  // The lighthouse on its point, as a white tapered tower with one black band and a black lantern.
  const [lx, ly] = coastRoad.lighthouseAt(), tower = new THREE.Group();
  tower.position.set(lx, ly, Math.max(coast.seaLevel, hill(lx, ly)));
  const outlined = (geometry: THREE.BufferGeometry, material: THREE.Material, z: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.z = z; mesh.castShadow = mesh.receiveShadow = true;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edge)); tower.add(mesh); return mesh;
  };
  outlined(new THREE.CylinderGeometry(0.95, 1.05, 1.2, 40).rotateX(Math.PI / 2), block, -0.4);
  outlined(new THREE.CylinderGeometry(0.42, 0.62, 4.2, 40).rotateX(Math.PI / 2), block, 2.1);
  outlined(new THREE.CylinderGeometry(0.47, 0.53, 0.35, 40).rotateX(Math.PI / 2), ink, 2.6);
  outlined(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 40).rotateX(Math.PI / 2), ink, 4.24);
  outlined(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 24).rotateX(Math.PI / 2), block, 4.53);
  outlined(new THREE.ConeGeometry(0.4, 0.45, 24).rotateX(Math.PI / 2), ink, 5.0);
  scene.add(tower);

  return stopperBoom(scene, stopper);
}

export const minimalCoastCourse: Course = {
  rampStart: coast.lead,
  frame,
  path,
  get finish() { return line.finish; },
  cones: [],
  xml,
  build,
  // The coast's framing, in daylight on white: far ranges fade into the paper.
  view: {
    far: 900, near: 0.2, fog: [40, 520], sky: palette.paper, ground: false,
    chase: { behind: 5.2, side: -1.3, height: 2.3, ahead: 7, aim: -0.5, scenic: [-0.45, 0.5] },
    // A raking side light, as on a white architectural model, so the landform reads in shade.
    light: { sun: '#ffffff', intensity: 3.2, direction: [1.1, -0.9, 0.75], sky: '#ffffff', ground: '#c4c2ba', fill: 1.15, rim: '#eef2f8', rimIntensity: 0.5, exposure: 0.88 },
  },
  ground: hill,
};
