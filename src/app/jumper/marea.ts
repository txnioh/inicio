import * as THREE from 'three';

// Marea: an original appearance over the original CAD (deep-sea shell, coral
// tips, two antennae and round eyes). No new physical bodies or actuators; the
// added pieces are tagged `dress` so another skin removes them.
export function dressMarea(name: string, mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>) {
  const material = mesh.material;
  const dark = /base_link|display_module|camera_link|tof_sensor|grip_insert|thigh_link/.test(name);
  const coral = /foot_tip|palm_pad|finger_tip/.test(name);
  const foam = /hip_link|upper_arm/.test(name);
  material.color.set(dark ? '#16222c' : coral ? '#ff7a59' : foam ? '#cfe3dc' : '#1f5673');
  material.roughness = 0.42;
  material.metalness = 0.12;

  if (name === 'upper_shell_link_visual') {
    // Two antennae, in the source shell's CAD frame (+Z up, +X forward).
    const stalk = new THREE.MeshStandardMaterial({ color: '#16222c', roughness: 0.5 });
    const tip = new THREE.MeshStandardMaterial({ color: '#ff7a59', emissive: '#ff7a59', emissiveIntensity: 0.35, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const base = new THREE.Vector3(0.066, side * 0.014, 0.031);
      const end = new THREE.Vector3(0.094, side * 0.042, 0.102);
      const length = base.distanceTo(end);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0019, 0.0026, length, 10), stalk);
      rod.position.copy(base).lerp(end, 0.5);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(base).normalize());
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 16, 12), tip);
      ball.position.copy(end);
      for (const piece of [rod, ball]) { piece.castShadow = piece.receiveShadow = true; piece.userData.dress = true; mesh.add(piece); }
    }
  }

  if (name !== 'display_module_link_visual') return;
  material.color.set('#0d141a');
  const display = new THREE.Group();
  // Source display plane: +X is its normal, +Y is up, +Z runs across it.
  display.position.set(-0.001748549, 0.000016063, -0.000652644);
  display.quaternion.set(0.674767937, -0.211454873, 0.211535150, 0.674705823).normalize();
  display.userData.dress = true;
  mesh.add(display);
  const eye = new THREE.MeshBasicMaterial({ color: '#bff4f0', toneMapped: false });
  const glint = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  for (const side of [-1, 1]) {
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0085, 32).rotateY(Math.PI / 2), eye);
    iris.position.set(0.0023, 0, side * 0.022);
    const spark = new THREE.Mesh(new THREE.CircleGeometry(0.0024, 16).rotateY(Math.PI / 2), glint);
    spark.position.set(0.0026, 0.003, side * 0.022 - 0.0025);
    display.add(iris, spark);
  }
}
