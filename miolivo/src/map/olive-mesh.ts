/**
 * A low-poly olive built in code, in unit space: one metre of crown diameter and one metre of height.
 * Each instance scales it by its own crown and height, so the mesh never needs a file or a licence.
 */

type Mesh = {
  attributes: {
    positions: { size: 3; value: Float32Array };
    normals: { size: 3; value: Float32Array };
    colors: { size: 3; value: Float32Array };
  };
  indices: { size: 1; value: Uint32Array };
};

type Builder = { positions: number[]; normals: number[]; colors: number[]; indices: number[] };

const builder = (): Builder => ({ positions: [], normals: [], colors: [], indices: [] });

function finish(b: Builder): Mesh {
  // Smooth normals from the faces around each vertex.
  const normals = new Float32Array(b.positions.length);
  for (let k = 0; k < b.indices.length; k += 3) {
    const [a, c, d] = [b.indices[k], b.indices[k + 1], b.indices[k + 2]];
    const p = (i: number) => [b.positions[i * 3], b.positions[i * 3 + 1], b.positions[i * 3 + 2]];
    const [pa, pc, pd] = [p(a), p(c), p(d)];
    const u = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const v = [pd[0] - pa[0], pd[1] - pa[1], pd[2] - pa[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const i of [a, c, d]) for (let j = 0; j < 3; j++) normals[i * 3 + j] += n[j];
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l;
  }
  return {
    attributes: {
      positions: { size: 3, value: new Float32Array(b.positions) },
      normals: { size: 3, value: normals },
      colors: { size: 3, value: new Float32Array(b.colors) },
    },
    indices: { size: 1, value: new Uint32Array(b.indices) },
  };
}

/** A lumpy ellipsoid: the bumps break up the outline the way an olive's foliage clumps do. */
function lobe(b: Builder, cx: number, cy: number, cz: number, rx: number, rz: number, seed: number, rings = 9, segments = 14) {
  const start = b.positions.length / 3;
  for (let r = 0; r <= rings; r++) {
    const theta = (r / rings) * Math.PI;
    for (let s = 0; s <= segments; s++) {
      const phi = (s / segments) * Math.PI * 2;
      const bump = 1
        + 0.13 * Math.sin(3 * phi + seed) * Math.sin(2 * theta + seed * 0.7)
        + 0.08 * Math.sin(5 * phi - seed * 1.3) * Math.sin(4 * theta);
      const nx = Math.sin(theta) * Math.cos(phi), ny = Math.sin(theta) * Math.sin(phi), nz = Math.cos(theta);
      const z = cz + nz * rz * bump * (nz < 0 ? 0.7 : 1); // flatter underneath
      b.positions.push(cx + nx * rx * bump, cy + ny * rx * bump, z);
      // Baked light: darker inside and underneath, so the crown reads as foliage, not plastic.
      const shade = 0.62 + 0.38 * Math.min(1, Math.max(0, (nz + 1) / 2)) * (0.85 + 0.15 * bump);
      b.colors.push(shade, shade, shade);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = start + r * (segments + 1) + s, c = a + segments + 1;
      b.indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
}

export function canopyMesh(): Mesh {
  const b = builder();
  // Three clumps around a fuller centre, all inside a 1 m crown between 35 % and 100 % of the height.
  lobe(b, 0, 0, 0.7, 0.36, 0.28, 0.4);
  lobe(b, 0.16, 0.06, 0.62, 0.27, 0.22, 1.9);
  lobe(b, -0.12, 0.14, 0.64, 0.26, 0.22, 3.1);
  lobe(b, -0.04, -0.17, 0.6, 0.26, 0.2, 4.6);
  return finish(b);
}

export function trunkMesh(): Mesh {
  const b = builder();
  const segments = 7, top = 0.5;
  // A short, leaning, tapering trunk: olives are gnarled, not posts.
  for (let r = 0; r <= 1; r++) {
    for (let s = 0; s <= segments; s++) {
      const phi = (s / segments) * Math.PI * 2;
      const radius = r ? 0.045 : 0.075;
      b.positions.push(Math.cos(phi) * radius + r * 0.05, Math.sin(phi) * radius, r * top);
      b.colors.push(1, 1, 1);
    }
  }
  for (let s = 0; s < segments; s++) {
    const a = s, c = s + segments + 1;
    b.indices.push(a, a + 1, c, a + 1, c + 1, c);
  }
  return finish(b);
}
