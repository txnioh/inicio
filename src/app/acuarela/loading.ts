// What shows while a photo is being painted: the photo itself, going wet.
// Water drifts over it in a slow, folding flow, carrying its colours along
// (each pigment a little differently, so they separate at the edges), with
// tide lines where the water pools and the grain of the paper coming up.
// When the painting is ready it blooms in through the wet photo, patch by
// patch from the middle out, each patch with the darker rim of a drying wash.

const VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * .5 + .5;
  gl_Position = vec4(a_position, 0., 1.);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_photo;
uniform sampler2D u_paint;
uniform vec2 u_size;
uniform float u_time;
uniform float u_wet;
uniform float u_reveal;

const vec3 SHEET = vec3(.953, .910, .839);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0., a = .5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= .5; }
  return v;
}

void main() {
  vec2 uv = v_uv;
  vec2 p = uv;
  float aspect = u_size.x / u_size.y;
  vec2 s = vec2(p.x * aspect, p.y) * 2.4;
  float t = u_time * .07;

  // The flow: noise folded through noise, turning slowly.
  vec2 q = vec2(fbm(s + vec2(0., t)), fbm(s + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(s + 3.5 * q + vec2(1.7, 9.2) + t), fbm(s + 3.5 * q + vec2(8.3, 2.8) - .8 * t));
  vec2 flow = (r - .5) * .07 * u_wet;

  // The photo's colour carried along it, each channel a little further.
  vec3 c = vec3(0.);
  for (int i = 0; i < 5; i++) {
    vec2 o = flow * (.4 + float(i) * .25);
    c.r += texture2D(u_photo, p + o * 1.12).r;
    c.g += texture2D(u_photo, p + o).g;
    c.b += texture2D(u_photo, p + o * .88).b;
  }
  c /= 5.;

  // As a glaze on paper, darker where the water pools, grainy.
  vec3 wet = mix(c, SHEET * (.28 + .78 * c), .4);
  float pool = fbm(s * 1.6 + 2. * r - t);
  wet *= 1. - .22 * smoothstep(.04, 0., abs(pool - .5));
  wet += (noise(uv * u_size * .5) - .5) * .035;
  vec3 base = mix(c, wet, u_wet);

  // The painting blooms in where this field is lowest, the middle first.
  float field = .8 * fbm(vec2(uv.x * aspect, uv.y) * 3. + 4.) + .3 * length((uv - .5) * vec2(aspect, 1.)) / max(aspect, 1.);
  float front = u_reveal * 1.3 - .12;
  float shown = 1. - smoothstep(front - .05, front, field);
  float rim = smoothstep(.07, 0., front - field) * shown;
  vec3 paint = texture2D(u_paint, uv).rgb * (1. - .2 * rim);

  gl_FragColor = vec4(mix(base, paint, shown), 1.);
}`;

const ease = (x: number) => x < .5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;

export type Loader = {
  /** Shows the photo going wet, or carries on if it already is. */
  start(photo: HTMLImageElement): void;
  /** Blooms the painting in over the photo, then hides. Resolves when done or interrupted. */
  reveal(painting: HTMLCanvasElement): Promise<void>;
  /** Hides at once, keeping what is underneath. */
  stop(): void;
  dispose(): void;
};

/** Runs the animation on `canvas`, which lies over the painting. Null without WebGL. */
export function createLoader(canvas: HTMLCanvasElement): Loader | null {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const at = (name: string) => gl.getUniformLocation(program, name);
  const uniforms = {
    size: at('u_size'), time: at('u_time'), wet: at('u_wet'), reveal: at('u_reveal'),
  };
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const texture = (unit: number, name: string) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, key, value);
    gl.uniform1i(at(name), unit);
    return t;
  };
  const photoTexture = texture(0, 'u_photo');
  const paintTexture = texture(1, 'u_paint');
  // Phone photos can be larger than a texture may be; the effect is soft anyway.
  const small = document.createElement('canvas');
  const upload = (unit: number, t: WebGLTexture | null, source: HTMLImageElement | HTMLCanvasElement, longest: number) => {
    const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    const scale = Math.min(1, longest / Math.max(w, h));
    small.width = Math.round(w * scale);
    small.height = Math.round(h * scale);
    small.getContext('2d')!.drawImage(source, 0, 0, small.width, small.height);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, small);
  };

  let photo: HTMLImageElement | null = null;
  let active = false;
  let frame = 0;
  let wet = 0;
  let clock = 0;
  let last = 0;
  // The reveal in progress: when it began, and how to finish it.
  let revealing: { from: number; done: () => void } | null = null;

  const draw = (now: number) => {
    frame = 0;
    const dt = Math.min(.1, (now - (last || now)) / 1000);
    last = now;
    if (!still.matches) clock += dt;
    wet = Math.min(1, wet + dt / 1.6);
    let reveal = 0;
    if (revealing) {
      reveal = Math.min(1, (now - revealing.from) / (still.matches ? 400 : 1700));
      if (reveal >= 1) {
        const { done } = revealing;
        revealing = null;
        hide();
        done();
      }
    }
    const scale = Math.min(devicePixelRatio, 2, 1000 / Math.max(1, canvas.clientWidth, canvas.clientHeight));
    const width = Math.max(1, Math.round(canvas.clientWidth * scale)), height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.uniform2f(uniforms.size, width, height);
    gl.uniform1f(uniforms.time, clock);
    gl.uniform1f(uniforms.wet, ease(wet));
    gl.uniform1f(uniforms.reveal, ease(reveal));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (active || revealing) frame = requestAnimationFrame(draw);
  };

  const hide = () => {
    active = false;
    delete canvas.dataset.active;
  };
  const interrupt = () => {
    const pending = revealing;
    revealing = null;
    pending?.done();
  };

  return {
    start(next) {
      interrupt();
      if (next !== photo) {
        photo = next;
        upload(0, photoTexture, next, 1024);
      }
      if (!active) {
        wet = 0;
        last = 0;
      }
      active = true;
      canvas.dataset.active = '';
      if (!frame) frame = requestAnimationFrame(draw);
    },
    reveal(painting) {
      interrupt();
      upload(1, paintTexture, painting, 1400);
      return new Promise(resolve => {
        revealing = { from: performance.now(), done: resolve };
        if (!frame) frame = requestAnimationFrame(draw);
      });
    },
    stop() {
      interrupt();
      hide();
    },
    // The context stays: a remount (React's strict mode) reuses this canvas.
    dispose() {
      interrupt();
      hide();
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
