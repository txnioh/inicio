import loadMujoco, { type MainModule, type MjData, type MjModel, type DoubleBuffer } from '@mujoco/mujoco';
import wasmUrl from '@mujoco/mujoco/mujoco.wasm?url';
import * as THREE from 'three';
import { RobotController } from './controller';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { dressEva } from './eva';
import { Skate, skateXml, type BoardKind } from './skate';
import { flushInputs, modeBinding, queueMode, type InputEdge } from './inputs';
import { type Joint, type SkinId, type Stats, boxes, skins } from './settings';

interface PhysicalConfig {
  standHeight: number;
  feet: string[];
  servo: { plateau_torque_nm: number; corner_speed_rpm: number; decay_speed_rpm: number; cutoff_speed_rpm: number; thermal_continuous_torque_nm: number; thermal_time_constant_s: number };
}
interface AssetManifest {
  runtime: {
    model: string; geometry: string; meshes: string[];
    geometries: { vertices: number; vertexCount: number; normals: number; faces: number; faceCount: number }[];
    visuals: { name: string; body: string; geometry: number; position: number[]; quaternion: number[]; color: number[] }[];
  };
}
type Drawable = { id: number; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; name: string; color: THREE.Color; collision: boolean; body?: { id: number; position: THREE.Vector3; quaternion: THREE.Quaternion } };

let modulePromise: Promise<MainModule> | undefined;
function mujocoModule() {
  return modulePromise ??= loadMujoco({ locateFile: () => wasmUrl }).catch(error => { modulePromise = undefined; throw error; });
}

async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/jumper/${path}`, { signal });
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status}).`);
  return response.json() as Promise<T>;
}

export class Playground {
  private mujoco!: MainModule;
  private model!: MjModel;
  private data!: MjData;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(37, 1, 0.04, 12);
  private controls: OrbitControls;
  private resize: ResizeObserver;
  private abort = new AbortController();
  private disposed = false;
  private frame = 0;
  private drawables: Drawable[] = [];
  private geometries = new Map<number, THREE.BufferGeometry>();
  private grid: THREE.GridHelper;
  private robot: RobotController;
  private physical!: PhysicalConfig;
  private joints: Joint[] = [];
  private qAddresses: number[] = [];
  private vAddresses: number[] = [];
  private motorIds: number[] = [];
  private footGeoms = new Set<number>();
  private targets: Float32Array = new Float32Array(22);
  private heat = new Float32Array(22);
  private phase = 0;
  private playing = false;
  private grounded = true;
  private follow = new THREE.Vector3();
  private lightOffset = new THREE.Vector3(0.5, 0.6, 1.2);
  private light: THREE.DirectionalLight;
  private renderPrevious = 0;
  private collisionView = false;
  private previous = 0;
  private lastReport = 0;
  private accumulator = 0;
  private stepping = false;
  private generation = 0;
  private inputEvents: InputEdge[] = [];
  private boundKeys = new Set<string>();
  private simRate = 1;
  private rateAt = 0;
  private rateTime = 0;
  private velocityBuffer!: DoubleBuffer;
  private matrix = new THREE.Matrix4();
  private bodyRotation = new THREE.Quaternion();
  private onStats: (stats: Stats) => void;

  private skate?: Skate;

  constructor(private host: HTMLElement, onStats: (stats: Stats) => void, private onError: (message: string) => void, private skateMode: false | BoardKind = false) {
    this.onStats = onStats;
    this.robot = new RobotController(this.abort.signal);
    // Antialias the scene's render target; canvas MSAA cannot filter that image.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor('#fdfdfc');
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, this.renderer.capabilities.maxSamples) });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new SMAAPass());
    this.composer.addPass(new OutputPass());
    this.scene.fog = skateMode ? new THREE.Fog('#fdfdfc', 8, 26) : new THREE.Fog('#fdfdfc', 3, 7);
    if (skateMode) { this.camera.far = 45; this.camera.updateProjectionMatrix(); }
    this.renderer.domElement.setAttribute('aria-label', 'Modelo 3D de Jumper. Arrastra para girar; usa la rueda para acercarte.');
    this.host.append(this.renderer.domElement);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = skateMode ? 7 : 3;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.addEventListener('start', () => { this.chasePaused = performance.now() + 4000; });
    this.cameraView('iso');
    const ambient = new THREE.HemisphereLight('#ffffff', '#9ca3a0', 2.6);
    ambient.position.set(0, 0, 1);
    this.scene.add(ambient);
    const light = new THREE.DirectionalLight('#fff5e4', 3.8);
    light.position.set(0.5, 0.6, 1.2);
    light.up.set(0, 0, 1);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = light.shadow.camera.bottom = -2;
    light.shadow.camera.right = light.shadow.camera.top = 2;
    light.shadow.camera.near = 0.01;
    light.shadow.camera.far = 4;
    // Millimetre-scale CAD needs enough separation to avoid self-shadow stripes.
    light.shadow.bias = -0.0003;
    light.shadow.normalBias = 0.002;
    light.shadow.radius = 3;
    this.scene.add(light, light.target);
    this.light = light;
    const rim = new THREE.DirectionalLight('#e2edff', 1.7);
    rim.position.set(-0.4, -0.5, 0.6);
    this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#fdfdfc', roughness: 1 }));
    floor.position.z = -0.001;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.grid = new THREE.GridHelper(12, 120, '#e9e9e4', '#efefeb');
    this.grid.rotation.x = Math.PI / 2;
    this.grid.position.z = -0.0005;
    this.scene.add(this.grid);
    this.grid.visible = false;
    const boxMaterial = new THREE.MeshStandardMaterial({ color: '#deddd5', roughness: 0.9 });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: '#b9b8ad', transparent: true, opacity: 0.5 });
    for (const box of skateMode ? [] : boxes) {
      const geometry = new THREE.BoxGeometry(box.width, box.depth, box.height);
      const mesh = new THREE.Mesh(geometry, boxMaterial);
      mesh.position.set(box.x, box.y, box.height / 2);
      mesh.castShadow = mesh.receiveShadow = true;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
      mesh.add(edges);
      this.scene.add(mesh);
    }
    this.resize = new ResizeObserver(() => {
      const { width, height } = this.host.getBoundingClientRect();
      // Keep Retina detail without allocating oversized post-processing buffers.
      const ratio = Math.min(devicePixelRatio, 2, Math.max(1, Math.sqrt(3_000_000 / Math.max(width * height, 1))));
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(width, height);
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(width, height);
      this.camera.aspect = width / Math.max(height, 1);
      this.camera.updateProjectionMatrix();
    });
    this.resize.observe(host);
  }

  async load(onProgress: (value: number) => void) {
    const signal = this.abort.signal;
    const module = mujocoModule();
    const controllerRequest = this.robot.load();
    void module.catch(() => {});
    void controllerRequest.catch(() => {});
    const manifest = await read<AssetManifest>('manifest.json', signal);
    const geometryRequest = fetch(`/jumper/${manifest.runtime.geometry}`, { signal }).then(async response => {
      if (!response.ok) throw new Error('No se pudieron cargar las mallas.');
      const bytes = await response.arrayBuffer();
      const prefix = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
      // Vite serves .gz with Content-Encoding, while static hosts may serve the
      // gzip file verbatim. Fetch has already decoded an HTTP-encoded response.
      return prefix[0] === 0x1f && prefix[1] === 0x8b
        ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
        : bytes;
    });
    const [mujoco, response, , binary, physical] = await Promise.all([
      module, fetch(`/jumper/${manifest.runtime.model}`, { signal }), controllerRequest, geometryRequest, read<PhysicalConfig>('physics.json', signal),
    ]);
    if (this.disposed) return [];
    if (!response.ok) throw new Error('No se pudo cargar el modelo original de Jumper.');
    this.mujoco = mujoco;
    const xml = await response.text();
    if (!mujoco.FS.analyzePath('/jumper', false).exists) mujoco.FS.mkdir('/jumper');
    let loaded = 0;
    const paths = new Set<string>();
    // Bound downloads to avoid opening dozens of connections on mobile.
    const queue = [...manifest.runtime.meshes];
    const download = async () => {
      while (queue.length) {
        const path = queue.shift()!;
        const mesh = await fetch(`/jumper/${path}`, { signal });
        if (!mesh.ok) throw new Error(`No se pudo cargar la malla ${path}.`);
        const bytes = new Uint8Array(await mesh.arrayBuffer());
        if (this.disposed) return;
        const parts = path.split('/');
        parts.pop();
        let directory = '/jumper';
        for (const part of parts) {
          directory += `/${part}`;
          if (!paths.has(directory)) {
            if (!mujoco.FS.analyzePath(directory, false).exists) mujoco.FS.mkdir(directory);
            paths.add(directory);
          }
        }
        mujoco.FS.writeFile(`/jumper/${path}`, bytes);
        onProgress(Math.round(++loaded / manifest.runtime.meshes.length * 95));
      }
    };
    await Promise.all(Array.from({ length: 6 }, download));
    if (this.disposed) return [];
    mujoco.FS.writeFile('/jumper/scene.xml', this.skateMode ? skateXml(xml, this.skateMode) : xml);
    this.model = mujoco.MjModel.mj_loadXML('/jumper/scene.xml');
    this.data = new mujoco.MjData(this.model);
    this.velocityBuffer = new mujoco.DoubleBuffer(6);
    this.physical = physical;
    const inputs = JSON.parse(this.robot.fsm.inputs()) as { keys: { code: string }[] };
    this.boundKeys = new Set(inputs.keys.map(key => key.code));
    const contract = this.robot.contracts.locomotion;
    for (const name of contract.wire_joint_order) {
      const id = mujoco.mj_name2id(this.model, 3, name);
      const motor = mujoco.mj_name2id(this.model, 19, `${name}_motor`);
      if (id < 0 || motor < 0) throw new Error(`Articulación sin motor: ${name}.`);
      this.joints.push({ name, min: contract.joint_limits[name][0], max: contract.joint_limits[name][1], home: contract.default_joint_pos[name] });
      this.qAddresses.push(this.model.jnt_qposadr[id]);
      this.vAddresses.push(this.model.jnt_dofadr[id]);
      this.motorIds.push(motor);
    }
    for (const name of physical.feet) this.footGeoms.add(mujoco.mj_name2id(this.model, 5, name));
    this.createMeshes(manifest, binary);
    if (this.skateMode) {
      this.skate = new Skate(mujoco, this.model, this.scene, this.footGeoms, (lx, ly, rx, ry, nowUs) => {
        const fsm = this.robot.fsm;
        fsm.setAxis('Lx', lx); fsm.setAxis('Ly', ly); fsm.setAxis('Rx', rx); fsm.setAxis('Ry', ry); fsm.padFrame(nowUs);
      }, this.skateMode);
      for (const { id, mesh, name, collision, body } of this.skate.drawables) this.drawables.push({ id, mesh: mesh as Drawable['mesh'], name, color: new THREE.Color(), collision, body });
    }
    this.reset();
    this.frame = requestAnimationFrame(this.tick);
    onProgress(100);
    return this.joints;
  }

  private createMeshes(manifest: AssetManifest, binary: ArrayBuffer) {
    const model = this.model;
    for (let id = 0; id < model.ngeom; id++) {
      if (model.geom_type[id] !== 7) continue;
      const meshId = model.geom_dataid[id];
      let geometry = this.geometries.get(meshId);
      if (!geometry) {
        geometry = new THREE.BufferGeometry();
        const vertices = model.mesh_vert.slice(model.mesh_vertadr[meshId] * 3, (model.mesh_vertadr[meshId] + model.mesh_vertnum[meshId]) * 3);
        const faces = model.mesh_face.slice(model.mesh_faceadr[meshId] * 3, (model.mesh_faceadr[meshId] + model.mesh_facenum[meshId]) * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(faces), 1));
        geometry.computeVertexNormals();
        this.geometries.set(meshId, geometry);
      }
      const name = this.mujoco.mj_id2name(model, 5, id);
      // The skate scene draws its own meshes (cones) from skate.ts.
      if (name?.startsWith('skate_')) continue;
      const collision = model.geom_group[id] === 1;
      const color = new THREE.Color().setRGB(model.geom_rgba[id * 4], model.geom_rgba[id * 4 + 1], model.geom_rgba[id * 4 + 2], THREE.SRGBColorSpace);
      const material = new THREE.MeshStandardMaterial({ color: collision ? '#dc5f2b' : color, roughness: 0.48, metalness: 0.15, wireframe: collision });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = !collision;
      mesh.receiveShadow = !collision;
      mesh.visible = !collision;
      this.scene.add(mesh);
      this.drawables.push({ id, mesh, name, color, collision });
    }
    const packed = manifest.runtime.geometries.map((entry, index) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(binary, entry.vertices, entry.vertexCount), 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(binary, entry.normals, entry.vertexCount), 3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(binary, entry.faces, entry.faceCount), 1));
      this.geometries.set(-index - 1, geometry);
      return geometry;
    });
    for (const visual of manifest.runtime.visuals) {
      const color = new THREE.Color().setRGB(visual.color[0], visual.color[1], visual.color[2], THREE.SRGBColorSpace);
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.15 });
      const mesh = new THREE.Mesh(packed[visual.geometry], material);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      const id = this.mujoco.mj_name2id(model, 1, visual.body);
      if (id < 0) throw new Error(`Cuerpo ausente: ${visual.body}.`);
      const q = visual.quaternion;
      this.drawables.push({ id: -1, mesh, name: visual.name, color, collision: false,
        body: { id, position: new THREE.Vector3(...visual.position), quaternion: new THREE.Quaternion(q[1], q[2], q[3], q[0]) } });
    }
  }

  reset() {
    if (!this.data || this.disposed) return;
    ++this.generation;
    this.inputEvents.length = 0;
    this.robot.reset();
    this.phase = this.accumulator = 0;
    this.heat.fill(0);
    this.targets = new Float32Array(this.joints.map(joint => joint.home));
    this.mujoco.mj_resetData(this.model, this.data);
    this.data.qpos[2] = this.physical.standHeight;
    this.data.qpos[3] = 1;
    this.joints.forEach((_, i) => { this.data.qpos[this.qAddresses[i]] = this.targets[i]; });
    this.skate?.reset(this.data);
    this.mujoco.mj_forward(this.model, this.data);
    this.cameraView('iso');
    this.draw();
    this.report(0);
    this.rateAt = performance.now(); this.rateTime = 0;
  }

  private async controlStep() {
    const generation = this.generation;
    const fsm = this.robot.fsm;
    const previousMode = fsm.mode();
    const nowUs = Math.round(this.data.time * 1e6);
    // XBODY is the robot link frame. BODY uses the rotated principal-inertia
    // frame from the CAD, which is not the frame expected by the policy's IMU.
    this.mujoco.mj_objectVelocity(this.model, this.data, this.mujoco.mjtObj.mjOBJ_XBODY.value, 1, this.velocityBuffer, 1);
    const velocity = this.velocityBuffer.GetView() as Float64Array;
    fsm.set_state(new Float32Array(this.qAddresses.map(a => this.data.qpos[a])),
      new Float32Array(this.vAddresses.map(a => this.data.qvel[a])),
      new Float32Array(this.motorIds.map(a => this.data.actuator_force[a])),
      new Float32Array(this.data.qpos.slice(3, 7)), new Float32Array(velocity.slice(0, 3)), nowUs);
    fsm.setSignal('base_lin_vel', new Float32Array(velocity.slice(3, 6)));
    fsm.set_command(0, 0, 0, nowUs);
    // A short press can have both edges between ticks. Deliver its release on
    // the next tick so the shipped FSM observes both, without remapping keys.
    this.skate?.beforeControl(this.data, fsm.mode(), fsm.is_running_policy());
    flushInputs(fsm, this.inputEvents, nowUs);
    await this.robot.tick(nowUs);
    if (this.disposed || generation !== this.generation || !this.playing) return;
    if (fsm.mode() !== previousMode) console.debug('[Jumper]', previousMode, '→', fsm.mode());
    this.targets = fsm.positions();
    const kp = fsm.kp(), kd = fsm.kd();
    const contract = this.robot.contracts[fsm.mode()] ?? this.robot.contracts.locomotion;
    const dt = contract.control.sim_dt;
    const substeps = Math.round(0.005 / dt);
    if (Math.abs(substeps * dt - 0.005) > 1e-9) throw new Error('Cadencia física incompatible con el controlador.');
    this.model.opt.timestep = dt;
    const servo = this.physical.servo;
    const rpm = Math.PI * 2 / 60;
    for (let step = 0; step < substeps; step++) {
      // Only the 22 joint motors apply force. The floating base receives gravity
      // and contacts from MuJoCo; there is no support force, root impulse or gait.
      this.joints.forEach((_, i) => {
        const velocity = this.data.qvel[this.vAddresses[i]];
        const speed = Math.abs(velocity);
        const curve = speed >= servo.cutoff_speed_rpm * rpm ? 0 : servo.plateau_torque_nm * Math.exp(-Math.max(0, speed - servo.corner_speed_rpm * rpm) / (servo.decay_speed_rpm * rpm));
        const ceiling = this.heat[i] >= 1 ? servo.thermal_continuous_torque_nm : servo.plateau_torque_nm;
        const limit = Math.min(curve, ceiling, contract.control.effort_limit);
        const demanded = kp[i] * (this.targets[i] - this.data.qpos[this.qAddresses[i]]) - kd[i] * velocity;
        const torque = THREE.MathUtils.clamp(demanded, -limit, limit);
        this.data.ctrl[this.motorIds[i]] = torque;
        this.heat[i] = Math.max(0, this.heat[i] + ((torque / servo.thermal_continuous_torque_nm) ** 2 - this.heat[i]) * dt / servo.thermal_time_constant_s);
      });
      this.mujoco.mj_step(this.model, this.data);
    }
    // mj_step integrates qpos/qvel last, leaving derived poses and body velocity
    // one substep behind. Refresh them together, as upstream native_sim does,
    // before rendering or supplying the next policy observation.
    this.mujoco.mj_forward(this.model, this.data);
    this.skate?.afterControl(this.data);
    this.phase = this.data.time;
    this.grounded = false;
    // contact is a copied vector in the official bindings: retain one snapshot
    // per step and free it, rather than allocating it once for every contact.
    const contacts = this.data.contact;
    try {
      for (let i = 0; i < this.data.ncon; i++) {
        const contact = contacts.get(i);
        if (contact && (this.footGeoms.has(contact.geom1) || this.footGeoms.has(contact.geom2))) this.grounded = true;
        contact?.delete();
      }
    } finally { contacts.delete(); }
    if (this.data.qpos.some((value: number) => !Number.isFinite(value))) throw new Error('La simulación perdió estabilidad. Reinicia.');
  }

  private async advance() {
    if (this.stepping) return;
    this.stepping = true;
    const start = performance.now();
    try {
      while (this.accumulator >= 0.005 && this.playing && !this.disposed && !document.hidden && performance.now() - start < 20) {
        this.accumulator -= 0.005;
        await this.controlStep();
      }
    } catch (error) {
      if (!this.disposed) { this.setPlaying(false); this.onError(error instanceof Error ? error.message : 'Error del controlador.'); }
    } finally { this.stepping = false; }
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    const elapsed = this.previous ? Math.min((now - this.previous) / 1000, 0.04) : 0;
    this.previous = document.hidden ? 0 : now;
    if (!document.hidden) {
      if (this.skate?.wantsRestart && !this.stepping) { this.reset(); this.setPlaying(true); }
      if (this.playing) {
        this.accumulator = Math.min(this.accumulator + elapsed, 0.04);
        void this.advance();
      }
      this.follow.set(this.data.qpos[0], this.data.qpos[1], this.skate ? this.data.qpos[2] - 0.07 : Math.max(0.09, this.data.qpos[2] * 0.7));
      this.follow.sub(this.controls.target).multiplyScalar(1 - Math.exp(-elapsed * 5));
      this.controls.target.add(this.follow);
      this.camera.position.add(this.follow);
      if (this.skate && now > this.chasePaused) this.chase(elapsed);
      this.light.target.position.set(this.data.qpos[0], this.data.qpos[1], this.skate ? this.data.qpos[2] - 0.17 : 0);
      this.light.position.copy(this.light.target.position).add(this.lightOffset);
      this.controls.update();
      if (now - this.renderPrevious >= 1000 / 60 - 0.5) { this.draw(); this.renderPrevious = now; }
      if (now - this.lastReport > 250) {
        if (now - this.rateAt >= 1000) {
          this.simRate = this.playing ? (this.data.time - this.rateTime) / ((now - this.rateAt) / 1000) : 0;
          this.rateAt = now; this.rateTime = this.data.time;
        }
        this.report(elapsed ? Math.round(1 / elapsed) : 0);
        this.lastReport = now;
      }
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  private draw() {
    for (const { id, mesh, body } of this.drawables) {
      if (body) {
        const p = body.id * 3, r = body.id * 4, q = this.data.xquat;
        this.bodyRotation.set(q[r + 1], q[r + 2], q[r + 3], q[r]);
        mesh.position.copy(body.position).applyQuaternion(this.bodyRotation);
        mesh.position.x += this.data.xpos[p]; mesh.position.y += this.data.xpos[p + 1]; mesh.position.z += this.data.xpos[p + 2];
        mesh.quaternion.copy(this.bodyRotation).multiply(body.quaternion);
        continue;
      }
      const p = id * 3, r = id * 9;
      mesh.position.set(this.data.geom_xpos[p], this.data.geom_xpos[p + 1], this.data.geom_xpos[p + 2]);
      const m = this.data.geom_xmat;
      this.matrix.set(m[r], m[r + 1], m[r + 2], 0, m[r + 3], m[r + 4], m[r + 5], 0, m[r + 6], m[r + 7], m[r + 8], 0, 0, 0, 0, 1);
      mesh.quaternion.setFromRotationMatrix(this.matrix);
    }
    this.composer.render();
  }

  private report(fps: number) {
    this.onStats({ time: this.phase, playing: this.playing, fps, height: this.data.qpos[2], contacts: this.data.ncon, joints: this.qAddresses.map(address => this.data.qpos[address]), x: this.data.qpos[0], y: this.data.qpos[1], grounded: this.grounded, controllerMode: this.robot.fsm.mode(), policyRunning: this.robot.fsm.is_running_policy(), simRate: this.simRate, parity: this.robot.parity, skate: this.skate?.stats(this.data) });
  }

  setPlaying(playing: boolean) {
    if (!playing) this.release();
    this.playing = playing; this.previous = 0; this.accumulator = 0; this.report(0);
    this.rateAt = performance.now(); this.rateTime = this.data.time;
  }
  key(code: string, down: boolean, repeat = false) {
    if (!this.data || !this.playing || this.disposed) return false;
    if (this.skate?.key(code, down)) return true;
    this.inputEvents.push({ device: 'key', code, down, repeat });
    return this.boundKeys.has(code);
  }
  pad(x: number, y: number) {
    if (!this.data || this.disposed) return;
    if (this.skate) { this.skate.pad(x, y); return; }
    const fsm = this.robot.fsm;
    fsm.setAxis('Lx', x); fsm.setAxis('Ly', y);
    fsm.padFrame(Math.round(this.data.time * 1e6));
  }
  padButton(name: string, down: boolean) {
    if (!this.data || !this.playing || this.disposed) return;
    if (this.skate && name === 'A') { this.skate.key('Space', down); return; }
    this.inputEvents.push({ device: 'pad', code: name, down, repeat: false });
  }
  release() {
    this.inputEvents.length = 0;
    this.skate?.letGo();
    if (this.data && !this.disposed) this.robot.fsm.letGo(Math.round(this.data.time * 1e6));
  }
  action(name: string) {
    if (!this.data || this.disposed || !this.playing) return;
    if (name === 'locomotion') this.release();
    queueMode(this.robot.fsm, name, this.inputEvents);
  }
  canAction(name: string) { return !!this.data && (name === 'locomotion' || !!modeBinding(this.robot.fsm, name)); }
  releaseBoard() { if (this.data) this.skate?.release(this.data.time); }
  // Chase camera for the downhill: behind the board and a little to the toe
  // side, so Jumper's face shows. Dragging the view pauses it for 4 s.
  private chasePaused = 0;
  private chaseOffset = new THREE.Vector3();
  private chase(elapsed: number) {
    const { heading } = this.skate!.boardPose(this.data);
    const behind = 1.7, side = 0.55, height = 0.75;
    this.chaseOffset.set(-Math.cos(heading) * behind + Math.sin(heading) * side, -Math.sin(heading) * behind - Math.cos(heading) * side, height);
    const current = this.camera.position.clone().sub(this.controls.target);
    current.lerp(this.chaseOffset, 1 - Math.exp(-elapsed * 2.2));
    this.camera.position.copy(this.controls.target).add(current);
  }
  togglePilot() { const on = this.skate?.togglePilot() ?? false; this.report(0); return on; }
  setGrid(on: boolean) { this.grid.visible = on; }
  setCollision(on: boolean) {
    this.collisionView = on;
    for (const drawable of this.drawables) drawable.mesh.visible = drawable.collision === on;
  }
  setSkin(id: SkinId) {
    const skin = skins.find(skin => skin.id === id)!;
    for (const drawable of this.drawables) {
      if (drawable.collision) continue;
      const material = drawable.mesh.material;
      if (id === 'original') material.color.copy(drawable.color);
      else if (/upper_shell/.test(drawable.name)) material.color.set(skin.shell);
      else if (drawable.color.getHSL({ h: 0, s: 0, l: 0 }).l > 0.25) material.color.set(skin.limb);
      material.metalness = id === 'silver' ? 0.65 : 0.15;
    }
  }
  setEva() {
    this.renderer.domElement.setAttribute('aria-label', 'Modelo 3D de EVA-01. Arrastra para girar; usa la rueda para acercarte.');
    for (const { name, mesh, collision } of this.drawables) {
      if (!collision) dressEva(name, mesh);
    }
    this.draw();
  }
  cameraView(view: 'iso' | 'front' | 'top') {
    const x = this.data ? this.data.qpos[0] : 0;
    const y = this.data ? this.data.qpos[1] : 0;
    this.controls.target.set(x + 0.06, y, 0.065);
    if (this.skateMode && view === 'iso') this.camera.position.set(x + 0.35, y - 2.6, 0.75);
    else if (view === 'iso') this.camera.position.set(x + 1.15, y - 1.35, 1.1);
    if (view === 'front') this.camera.position.set(x + 1.8, y, 0.9);
    if (view === 'top') this.camera.position.set(x + 0.001, y, 2.5);
    this.controls.update();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.robot.dispose();
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.controls.dispose();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
    this.data?.delete();
    this.velocityBuffer?.delete();
    this.model?.delete();
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
