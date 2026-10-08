import { Mlp } from './mlp';

export interface Contract {
  wire_joint_order: string[];
  default_joint_pos: Record<string, number>;
  joint_limits: Record<string, [number, number]>;
  base_height: number;
  control: { sim_dt: number; control_dt: number; control_hz: number; effort_limit: number };
  reference?: { file: string };
}
interface Bundle {
  fsm: string; reference: string;
  modes: Record<string, { contract: string; models: { onnx: string } }>;
  files: Record<string, { sha256: string; bytes: number }>;
  runtimes: { web: { glue: string; wasm: string } };
}
export interface Fsm {
  free(): void;
  checkReference(text: string): string;
  set_state(q: Float32Array, qd: Float32Array, tau: Float32Array, quat: Float32Array, gyro: Float32Array, nowUs: number): void;
  setSignal(name: string, values: Float32Array): boolean;
  set_command(x: number, y: number, yaw: number, nowUs: number): void;
  setKeyCode(code: string, down: boolean, repeat: boolean, nowUs: number): boolean;
  setPad(name: string, down: boolean): boolean;
  setAxis(name: string, value: number): boolean;
  padFrame(nowUs: number): void;
  letGo(nowUs: number): boolean;
  tick(nowUs: number): string | undefined;
  resume(action: Float32Array): void;
  observation(): Float32Array;
  positions(): Float32Array;
  kp(): Float32Array;
  kd(): Float32Array;
  mode(): string;
  is_running_policy(): boolean;
  inputs(): string;
  bindings(): string;
}
interface Module { default(args: { module_or_path: ArrayBuffer }): Promise<unknown>; WebFsm: new (config: string, contracts: string, robot: string, nowUs: number, trajectories: string) => Fsm }
export interface Parity { frames: number; inferences: number; observation: number; target: number; modeMismatches: unknown[]; inference: number }

// The vendor glue and WASM are served byte-for-byte from the pinned upstream
// bundle. Only the host adapter below is ours; observations/inputs/targets are
// computed by the same Rust controller distributed for the robot's board.
export class RobotController {
  contracts: Record<string, Contract> = {};
  fsm!: Fsm;
  parity!: Parity;
  private module!: Module;
  private config = '';
  private trajectories: Record<string, string> = {};
  private robot = '';
  private bundle!: Bundle;
  private sessions = new Map<string, Promise<Mlp>>();
  private disposed = false;
  private generation = 0;

  constructor(private signal: AbortSignal) {}

  private async bytes(file: string, verify = true) {
    const response = await fetch(`/jumper/app/${file}`, { signal: this.signal });
    if (!response.ok) throw new Error(`Could not load ${file}.`);
    const data = await response.arrayBuffer();
    const expected = this.bundle?.files[file];
    if (verify && expected) {
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
      const digest = Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
      if (data.byteLength !== expected.bytes || digest !== expected.sha256) throw new Error(`Original file altered: ${file}.`);
    }
    return data;
  }

  async load() {
    const decode = (bytes: ArrayBuffer) => new TextDecoder().decode(bytes);
    this.bundle = JSON.parse(decode(await this.bytes('bundle.json')));
    // Verify the program before executing the shipped module.
    const glue = await this.bytes(this.bundle.runtimes.web.glue);
    const glueUrl = URL.createObjectURL(new Blob([glue], { type: 'text/javascript' }));
    try { this.module = await import(/* @vite-ignore */ glueUrl) as Module; }
    finally { URL.revokeObjectURL(glueUrl); }
    await this.module.default({ module_or_path: await this.bytes(this.bundle.runtimes.web.wasm) });
    const [config, reference] = await Promise.all([this.bytes(this.bundle.fsm), this.bytes(this.bundle.reference)]);
    this.config = decode(config);
    await Promise.all(Object.entries(this.bundle.modes).map(async ([mode, spec]) => {
      const contract: Contract = JSON.parse(decode(await this.bytes(spec.contract)));
      this.contracts[mode] = contract;
      if (contract.reference) this.trajectories[mode] = decode(await this.bytes(contract.reference.file));
    }));
    const { wire_joint_order: names, joint_limits: limits } = this.contracts.locomotion;
    this.robot = JSON.stringify({ joint_names: names, joint_pos_lo: names.map(n => limits[n][0]), joint_pos_hi: names.map(n => limits[n][1]), output_rate_hz: 200 });
    const check = this.create();
    try {
      this.parity = { ...JSON.parse(check.checkReference(decode(reference))), inference: 0 };
    } finally { check.free(); }
    if (this.parity.observation > 1e-6 || this.parity.target > 1e-6 || this.parity.modeMismatches.length) throw new Error('The controller does not match its official reference.');
    await Promise.all([this.session('locomotion'), this.session('jump')]);
    const frames = JSON.parse(decode(reference)).frames as { mode: string; obs?: number[]; act?: number[] }[];
    // Check the browser's inference (mlp.ts) against the original policy, separately from the controller.
    for (const frame of frames.filter(f => f.obs && f.act)) {
      const action = await this.infer(frame.mode, new Float32Array(frame.obs!));
      this.parity.inference = Math.max(this.parity.inference, ...action.map((a, i) => Math.abs(a - frame.act![i])));
    }
    if (this.parity.inference > 1e-4) throw new Error('Policy inference does not match the original policy.');
    if (!this.disposed) this.reset();
  }

  private create() { return new this.module.WebFsm(this.config, JSON.stringify(this.contracts), this.robot, 0, JSON.stringify(this.trajectories)); }
  reset() { ++this.generation; this.fsm?.free(); this.fsm = this.create(); }

  private session(mode: string) {
    if (this.disposed) throw new DOMException('Controller disposed', 'AbortError');
    const file = this.bundle.modes[mode]?.models.onnx;
    if (!file) throw new Error(`No such policy: ${mode}.`);
    let session = this.sessions.get(file);
    if (!session) {
      session = this.bytes(file).then(bytes => new Mlp(bytes));
      this.sessions.set(file, session);
      void session.catch(() => {});
    }
    return session;
  }

  private async infer(mode: string, observation: Float32Array) {
    return (await this.session(mode)).run(observation);
  }

  async tick(nowUs: number) {
    const generation = this.generation;
    const fsm = this.fsm;
    const mode = fsm.tick(nowUs);
    if (mode !== undefined) {
      const action = await this.infer(mode, fsm.observation());
      if (this.disposed || generation !== this.generation) return;
      if (action.some(value => !Number.isFinite(value))) throw new Error('The policy returned a non-finite value.');
      fsm.resume(action);
    }
  }

  dispose() {
    this.disposed = true;
    this.fsm?.free();
    this.sessions.clear();
  }
}
