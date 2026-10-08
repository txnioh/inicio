import * as THREE from 'three';

// What a downhill run gives the ride (skate.ts): the road's centre line, a line
// for the pilot, where the finish is, its physics and its drawing.

export type Point = [number, number];
/** A point on the road's centre line: position, heading (rad, from +x) and slope (rad, negative downhill). */
export interface Frame { p: [number, number, number]; heading: number; slope: number }

export interface Course {
  /** Arc length where the start ramp begins; the board waits just past it. */
  rampStart: number;
  /** Centre line at arc length s. */
  frame(s: number): Frame;
  /** The pilot's line, densely sampled, with the arc length of each point. */
  path: { points: Point[]; s: number[] };
  /** Arc length of the finish line along `path`. */
  finish: number;
  /** Loose cones, if any: x, y, and the road slope there. */
  cones: { x: number; y: number; slope: number; heading: number }[];
  xml(): { asset: string; world: string };
  /** Draw the run. Returns the stopper boom, which the ride swings open. */
  build(scene: THREE.Scene, stopper: Frame): THREE.Object3D;
  /** A message when the rider commits to a line (the obstacle run's island). */
  route?(x: number, y: number): string | undefined;
  /** Camera and atmosphere. */
  view: {
    far: number; fog: [number, number]; sky: string; ground?: boolean;
    /** Chase camera: metres behind the board, to its left, above it, how far ahead it looks, and how far to the left of the road it aims (negative: right),
     *  and optionally a scenic heading (rad) and how much the camera turns towards it (0–1). */
    chase: { behind: number; side: number; height: number; ahead: number; aim?: number; scenic?: [number, number] };
    /** Optional lighting: sun colour and intensity, sun direction (scaled to ~1.5 m), sky and ground fill, rim light, exposure. */
    light?: { sun: string; intensity: number; direction: [number, number, number]; sky: string; ground: string; fill: number; rim: string; rimIntensity: number; exposure: number };
    /** Studio environment strength (reflections); default 0.35. */
    environment?: number;
    /** Post-processing: bloom [strength, radius, threshold] and depth of field focused on the rider. */
    post?: { bloom?: [number, number, number]; dof?: { aperture: number; maxblur: number } };
  };
  /** Ground height at (x, y), so the camera stays above the scenery and keeps the rider in sight. */
  ground?(x: number, y: number): number;
  /** Per-frame animation of the scenery (waves, clouds, boats), seconds. */
  animate?(time: number): void;
}

/** Resample a polyline every `step` metres. */
export function resample(points: Point[], step = 0.1) {
  const out: Point[] = [points[0]], s = [0];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i], length = Math.hypot(bx - ax, by - ay);
    let d = step - carry;
    while (d <= length) { out.push([ax + (bx - ax) * d / length, ay + (by - ay) * d / length]); s.push(s[s.length - 1] + step); d += step; }
    carry = length - (d - step);
  }
  return { points: out, s };
}

/** Index of the path point nearest (x, y), searching near the previous one. */
export function nearest(path: Point[], x: number, y: number, hint: number) {
  let best = hint, distance = Infinity;
  const from = Math.max(0, hint - 30), to = Math.min(path.length - 1, hint + 120);
  for (let i = from; i <= to; i++) {
    const d = (path[i][0] - x) ** 2 + (path[i][1] - y) ** 2;
    if (d < distance) { distance = d; best = i; }
  }
  return best;
}

/** Quaternion [w, x, y, z] of a frame: heading about z, then pitched down the slope. */
export function frameQuat(frame: Frame) {
  const h = frame.heading / 2, p = -frame.slope / 2;
  const [cy, sy, cp, sp] = [Math.cos(h), Math.sin(h), Math.cos(p), Math.sin(p)];
  return [cy * cp, -sy * sp, cy * sp, sy * cp];
}

/** The start stopper: a low boom on a side post that swings aside on release. */
export function stopperBoom(scene: THREE.Scene, frame: Frame) {
  const steel = new THREE.MeshStandardMaterial({ color: '#a7aeb5', roughness: 0.35, metalness: 0.6 });
  const base = new THREE.Group();
  const q = frameQuat(frame);
  base.quaternion.set(q[1], q[2], q[3], q[0]);
  base.position.set(...frame.p);
  const side = new THREE.Group(); side.position.y = -0.32; base.add(side);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.05), steel); post.position.z = 0.025;
  const boom = new THREE.Group(); boom.position.z = 0.009;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.56, 0.016), new THREE.MeshStandardMaterial({ color: '#d4583a', roughness: 0.6 }));
  bar.position.y = 0.3; bar.castShadow = post.castShadow = true;
  boom.add(bar); side.add(post, boom);
  scene.add(base);
  return boom;
}
