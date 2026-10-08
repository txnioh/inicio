// The shipped policies are small MLPs exported to ONNX: (obs - mean) / std,
// then Gemm and Elu layers. This runs exactly those graphs in plain JS from the
// same .onnx bytes, instead of ONNX Runtime's WebAssembly, which a phone's
// Safari often cannot fit beside MuJoCo's and the controller's ("RangeError:
// Out of memory"). Any other op or layout is refused, never approximated; the
// controller still checks the result against the original policy's frames.

type Tensor = { dims: number[]; data: Float32Array };
type Node = { op: string; inputs: string[]; outputs: string[]; attributes: Map<string, number> };

/** Protobuf fields of one message: number -> values (varints as numbers, bytes as views). */
function fields(bytes: Uint8Array) {
  const out = new Map<number, (number | Uint8Array)[]>();
  let at = 0;
  const varint = () => {
    let value = 0, scale = 1, byte: number;
    do { byte = bytes[at++]; value += (byte & 0x7f) * scale; scale *= 128; } while (byte & 0x80);
    return value;
  };
  while (at < bytes.length) {
    const key = varint(), field = Math.floor(key / 8), wire = key & 7;
    let value: number | Uint8Array;
    if (wire === 0) value = varint();
    else if (wire === 1) { value = bytes.subarray(at, at + 8); at += 8; }
    else if (wire === 2) { const length = varint(); value = bytes.subarray(at, at + length); at += length; }
    else if (wire === 5) { value = bytes.subarray(at, at + 4); at += 4; }
    else throw new Error(`Unsupported protobuf wire type ${wire}.`);
    const list = out.get(field) ?? []; list.push(value); out.set(field, list);
  }
  return out;
}
const text = (bytes: number | Uint8Array) => new TextDecoder().decode(bytes as Uint8Array);
const float = (bytes: number | Uint8Array) => { const b = bytes as Uint8Array; return new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true); };
/** Packed or repeated varints (TensorProto.dims). */
function ints(values: (number | Uint8Array)[] = []) {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === 'number') { out.push(value); continue; }
    let at = 0;
    while (at < value.length) { let v = 0, scale = 1, byte: number; do { byte = value[at++]; v += (byte & 0x7f) * scale; scale *= 128; } while (byte & 0x80); out.push(v); }
  }
  return out;
}

function tensor(bytes: Uint8Array): [string, Tensor] {
  const f = fields(bytes);
  const dims = ints(f.get(1)), type = (f.get(2)?.[0] as number) ?? 0, name = text(f.get(8)![0]);
  if (type !== 1) throw new Error(`Policy weight ${name} is not float32.`);
  const count = dims.reduce((a, b) => a * b, 1);
  const raw = f.get(9)?.[0] as Uint8Array | undefined;
  let data: Float32Array;
  if (raw) {
    // Copy: the view may not be 4-byte aligned. ONNX raw data is little-endian.
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    data = new Float32Array(count);
    for (let i = 0; i < count; i++) data[i] = view.getFloat32(i * 4, true);
  } else {
    const packed = f.get(4) ?? [];
    data = new Float32Array(count);
    let i = 0;
    for (const chunk of packed) { const b = chunk as Uint8Array; for (let at = 0; at + 4 <= b.length; at += 4) data[i++] = float(b.subarray(at, at + 4)); }
  }
  if (data.length !== count) throw new Error(`Policy weight ${name} has the wrong size.`);
  return [name, { dims, data }];
}

function node(bytes: Uint8Array): Node {
  const f = fields(bytes);
  const attributes = new Map<string, number>();
  for (const a of f.get(5) ?? []) {
    const af = fields(a as Uint8Array), name = text(af.get(1)![0]);
    if (af.has(2)) attributes.set(name, float(af.get(2)![0]));
    else if (af.has(3)) attributes.set(name, af.get(3)![0] as number);
  }
  return { op: text(f.get(4)![0]), inputs: (f.get(1) ?? []).map(text), outputs: (f.get(2) ?? []).map(text), attributes };
}

export class Mlp {
  private nodes: Node[];
  private weights = new Map<string, Tensor>();
  readonly input: string;
  readonly output: string;

  constructor(onnx: ArrayBuffer) {
    const graph = fields(fields(new Uint8Array(onnx)).get(7)![0] as Uint8Array);
    for (const t of graph.get(5) ?? []) { const [name, value] = tensor(t as Uint8Array); this.weights.set(name, value); }
    this.nodes = (graph.get(1) ?? []).map(n => node(n as Uint8Array));
    const inputs = (graph.get(11) ?? []).map(i => text(fields(i as Uint8Array).get(1)![0])).filter(name => !this.weights.has(name));
    const outputs = (graph.get(12) ?? []).map(o => text(fields(o as Uint8Array).get(1)![0]));
    if (inputs.length !== 1 || outputs.length !== 1) throw new Error('Policy graph must have one input and one output.');
    [this.input, this.output] = [inputs[0], outputs[0]];
    for (const n of this.nodes) {
      if (!['Sub', 'Div', 'Gemm', 'Elu'].includes(n.op)) throw new Error(`Unsupported policy op: ${n.op}.`);
      if (n.op === 'Gemm' && (n.attributes.get('transA') ?? 0) !== 0) throw new Error('Unsupported Gemm layout.');
    }
  }

  run(observation: Float32Array) {
    const values = new Map<string, Float32Array>([[this.input, observation]]);
    const get = (name: string) => values.get(name) ?? this.weights.get(name)?.data ?? (() => { throw new Error(`Missing policy value ${name}.`); })();
    for (const n of this.nodes) {
      const a = get(n.inputs[0]);
      let out: Float32Array;
      if (n.op === 'Sub' || n.op === 'Div') {
        // The normaliser: a [1, n] row against a [1, n] constant.
        const b = get(n.inputs[1]);
        if (b.length !== a.length) throw new Error('Unsupported policy broadcast.');
        out = new Float32Array(a.length);
        for (let i = 0; i < a.length; i++) out[i] = n.op === 'Sub' ? a[i] - b[i] : a[i] / b[i];
      } else if (n.op === 'Elu') {
        const alpha = n.attributes.get('alpha') ?? 1;
        out = new Float32Array(a.length);
        for (let i = 0; i < a.length; i++) out[i] = a[i] > 0 ? a[i] : alpha * Math.expm1(a[i]);
      } else {
        // Gemm, one row: y = alpha * a·Wᵀ (or a·W) + beta * c.
        const w = this.weights.get(n.inputs[1]);
        if (!w || w.dims.length !== 2) throw new Error('Unsupported Gemm weights.');
        const transB = (n.attributes.get('transB') ?? 0) === 1, alpha = n.attributes.get('alpha') ?? 1, beta = n.attributes.get('beta') ?? 1;
        const [rows, cols] = w.dims, inner = transB ? cols : rows, width = transB ? rows : cols;
        if (inner !== a.length) throw new Error('Policy layer size mismatch.');
        const c = n.inputs[2] ? get(n.inputs[2]) : undefined;
        if (c && c.length !== width) throw new Error('Unsupported Gemm bias.');
        out = new Float32Array(width);
        for (let j = 0; j < width; j++) {
          let sum = 0;
          if (transB) { const row = j * inner; for (let k = 0; k < inner; k++) sum += a[k] * w.data[row + k]; }
          else for (let k = 0; k < inner; k++) sum += a[k] * w.data[k * width + j];
          out[j] = alpha * sum + (c ? beta * c[j] : 0);
        }
      }
      values.set(n.outputs[0], out);
    }
    return get(this.output);
  }
}
