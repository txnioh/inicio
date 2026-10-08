import * as THREE from 'three';

// The coast's ground, shaded per pixel rather than painted per vertex: the usual
// terrain splat (as in Frostbite's terrain notes): grass, scrub, rock and sand
// blended by slope and height, with the thresholds broken up by noise so they
// never read as contour lines; low-frequency colour variation against
// repetition; fine detail that fades out with distance; layered sandstone with
// relief in the road cuts and cliffs; and a bump from the same noise, so
// the sun picks out the rock and the scrub. No textures, no extra geometry.
// It extends MeshStandardMaterial, so lighting, shadows and fog are unchanged.

const noise = /* glsl */`
float tHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float tFbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * tNoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }

`;

const glsl = /* glsl */`
uniform float uSea;
varying vec3 vWorld;
varying vec3 vWorldNormal;
varying vec4 vField; // macro, mid and strata-warp noise (per vertex), and curvature
vec3 tColour; float tBump;

void terrain(vec3 p, vec3 n, float distance) {
  float slope = 1.0 - clamp(n.z, 0.0, 1.0);
  float h = p.z - uSea;
  // Detail fades with distance (it would only shimmer), the large forms stay.
  float detail = 1.0 - smoothstep(12.0, 70.0, distance);
  // The broad noise varies over metres, so it is computed per vertex.
  float macro = vField.x, mid = vField.y, bend = vField.w;
  float fine = detail > 0.0 ? mix(0.5, tNoise(p.xy * 3.3) * 0.6 + tNoise(p.xy * 11.0) * 0.4, detail) : 0.5;

  // Grass: olive in the hollows, golden on the slopes that face the low sun and higher up.
  vec3 lush = vec3(0.33, 0.42, 0.19), olive = vec3(0.47, 0.5, 0.25), gold = vec3(0.72, 0.62, 0.37);
  float sunward = clamp(dot(n.xy, vec2(0.85, -0.53)) * 4.0, 0.0, 1.0);
  vec3 ground = mix(lush, olive, smoothstep(0.3, 0.7, macro));
  ground = mix(ground, gold, clamp(smoothstep(10.0, 22.0, h + (macro - 0.5) * 14.0) * 0.7 + sunward * 0.35 * smoothstep(0.35, 0.65, macro), 0.0, 0.85));
  // Chaparral grows thickest in the gullies the water carved, thinning onto the spurs.
  float scrub = smoothstep(0.46, 0.7, mid * 0.7 + (macro - 0.5) * 0.2 + bend * 0.6 + 0.15 + (fine - 0.5) * 0.05) * (1.0 - smoothstep(0.25, 0.42, slope)) * (1.0 - smoothstep(14.0, 26.0, h));
  ground = mix(ground, vec3(0.27, 0.34, 0.18) * (0.8 + 0.4 * fine), scrub * 0.75);
  // Earth paths where the grass wears thin.
  ground = mix(ground, vec3(0.6, 0.5, 0.37), smoothstep(0.68, 0.74, vField.z) * 0.3 * (1.0 - scrub));
  ground *= 0.88 + 0.24 * fine;

  // Rock: sandstone and marl in tilted, wavy layers, with a coarse grain.
  float layer = p.z * 3.4 + p.x * 0.05 + (vField.z - 0.5) * 2.4;
  // Layers of uneven thickness and gentle contrast, not candy stripes.
  float band = sin(layer * 1.3 + sin(layer * 0.37) * 2.0) * 0.5 + 0.5;
  vec3 rock = mix(vec3(0.5, 0.45, 0.39), vec3(0.62, 0.56, 0.47), smoothstep(0.35, 0.65, band));
  rock = mix(rock, vec3(0.5, 0.39, 0.31), smoothstep(0.8, 0.97, sin(layer * 0.53 + 1.0) * 0.5 + 0.5) * 0.45);
  // Rock on the steep ground and breaking through on the crests.
  float rocky = smoothstep(0.26, 0.48, slope + (mid - 0.5) * 0.3 - bend * 0.25);
  // Triplanar: each face takes its grain from the plane it faces, so cuts don't
  // smear. Only where there is rock to see (most of the ground is grass).
  float grain = 0.5;
  if (rocky * detail > 0.002) {
    vec3 w = pow(abs(n), vec3(4.0)); w /= w.x + w.y + w.z;
    grain = mix(0.5, (tNoise(p.yz * 7.0) * 0.5 + tNoise(p.yz * 23.0) * 0.5) * w.x + (tNoise(p.xz * 7.0) * 0.5 + tNoise(p.xz * 23.0) * 0.5) * w.y + (tNoise(p.xy * 7.0) * 0.5 + tNoise(p.xy * 23.0) * 0.5) * w.z, detail);
  }
  rock *= 0.78 + 0.4 * grain;
  // High up, the grass gives way to bare grey rock and scree.
  vec3 bare = mix(vec3(0.6, 0.57, 0.53), vec3(0.74, 0.71, 0.67), macro);
  float high = smoothstep(18.0, 34.0, h + (macro - 0.5) * 16.0);

  vec3 colour = mix(ground, bare * (0.85 + 0.3 * fine), high * 0.85);
  colour = mix(colour, rock, rocky);
  // The shore: wet dark rock at the waterline, then sand.
  float shore = 1.0 - smoothstep(0.2, 0.75, h + (fine - 0.5) * 0.25);
  colour = mix(colour, mix(vec3(0.77, 0.69, 0.53), vec3(0.62, 0.56, 0.45), rocky), shore);
  colour = mix(colour, vec3(0.33, 0.31, 0.29), 1.0 - smoothstep(0.03, 0.14, h));
  // Shade in the folds, light on the crests: the occlusion the sun's single shadow map can't give.
  colour *= 0.86 + 0.24 * smoothstep(0.6, -0.6, bend);
  // The palette above is in sRGB; lighting works in linear.
  tColour = pow(colour, vec3(2.2));
  // Relief for the light: rock grain and ledges, scrub clumps.
  tBump = (grain * rocky * 0.9 + band * rocky * 0.25 + scrub * fine * 0.6 + fine * 0.15) * detail;
}

// three.js's perturbNormalArb: tilt the normal by the screen-space gradient of a height.
vec3 tPerturb(vec3 surf, vec3 normal, float height, float scale) {
  vec3 dx = dFdx(surf), dy = dFdy(surf);
  float bx = dFdx(height) * scale, by = dFdy(height) * scale;
  vec3 r1 = cross(dy, normal), r2 = cross(normal, dx);
  float det = dot(dx, r1);
  vec3 gradient = sign(det) * (bx * r1 + by * r2);
  return normalize(abs(det) * normal - gradient);
}
`;

export function terrainMaterial(sea: number) {
  const material = new THREE.MeshStandardMaterial({ roughness: 1, envMapIntensity: 0.3 });
  material.onBeforeCompile = shader => {
    shader.uniforms.uSea = { value: sea };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;\nvarying vec3 vWorldNormal;\nvarying vec4 vField;\nattribute float curvature;\n' + noise)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWorldNormal = normalize(mat3(modelMatrix) * objectNormal);\nvField = vec4(tFbm(vWorld.xy * 0.03), tFbm(vWorld.xy * 0.21 + 7.0), tFbm(vWorld.xy * 0.07), curvature);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + noise + glsl)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nterrain(vWorld, normalize(vWorldNormal), length(vViewPosition));')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= tColour;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = tPerturb(-vViewPosition, normal, tBump, 0.06);');
  };
  material.customProgramCacheKey = () => 'coast-terrain';
  return material;
}
