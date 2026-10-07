import * as THREE from 'three';

// EVA-01 appearance over the original CAD. No new physical bodies or actuators.
export function dressEva(name: string, mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>) {
  const material = mesh.material;
  const dark = /base_link|display_module|camera_link|tof_sensor|grip_insert|thigh_link/.test(name);
  const green = /hip_link|foot_tip|palm_pad|finger_tip/.test(name);
  const orange = /upper_arm/.test(name);
  material.color.set(dark ? '#20202c' : green ? '#9cdb46' : orange ? '#e49a43' : '#7350ae');
  material.roughness = 0.5;
  material.metalness = 0.08;

  if (name === 'upper_shell_link_visual') {
    // Static armour decoration, attached in the source shell's CAD frame.
    const horn = new THREE.BufferGeometry();
    horn.setAttribute('position', new THREE.Float32BufferAttribute([
      0.059, -0.004, 0.032, 0.059, 0.004, 0.032,
      0.080, 0, 0.030, 0.101, 0, 0.096,
    ], 3));
    horn.setIndex([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]);
    const faceted = horn.toNonIndexed();
    faceted.computeVertexNormals();
    faceted.addGroup(0, 6, 0);
    faceted.addGroup(6, 6, 1);
    const fin = new THREE.Mesh(faceted, [
      new THREE.MeshStandardMaterial({ color: '#432962', roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: '#a3e147', roughness: 0.5 }),
    ]);
    fin.castShadow = fin.receiveShadow = true;
    mesh.add(fin);
    horn.dispose();
  }

  if (name !== 'display_module_link_visual') return;
  material.color.set('#101218');
  const display = new THREE.Group();
  // Source display plane: +X is its normal, +Y is up, +Z runs across it.
  display.position.set(-0.001748549, 0.000016063, -0.000652644);
  display.quaternion.set(0.674767937, -0.211454873, 0.211535150, 0.674705823).normalize();
  mesh.add(display);
  const eyes = new THREE.MeshBasicMaterial({ color: '#e5ffac', toneMapped: false });
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.013 * side, 0.004);
    shape.lineTo(0.013 * side, 0.001);
    shape.lineTo(0.009 * side, -0.004);
    shape.lineTo(-0.011 * side, -0.004);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape).rotateY(Math.PI / 2);
    const eye = new THREE.Mesh(geometry, eyes);
    eye.position.set(0.0023, 0, side * 0.023);
    display.add(eye);
  }
}
