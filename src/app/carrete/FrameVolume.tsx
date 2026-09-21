import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { frameBackground, type VideoFramesData } from './loadVideoFrames';

export type FrameVolumeHandle = { rotate: (x: number, y: number) => void };

const vertex = `
attribute vec2 position;
attribute vec2 texcoord;
attribute float frame;
uniform vec2 viewport;
uniform vec2 size;
uniform vec2 rotation;
uniform float depth;
uniform float count;
uniform float selected;
varying vec2 uv;
varying vec2 local;
varying float active;
void main() {
  vec3 p = vec3(position * size, (frame / max(1., count - 1.) - .5) * depth);
  p = vec3(cos(rotation.y) * p.x + sin(rotation.y) * p.z, p.y, -sin(rotation.y) * p.x + cos(rotation.y) * p.z);
  p = vec3(p.x, cos(rotation.x) * p.y - sin(rotation.x) * p.z, sin(rotation.x) * p.y + cos(rotation.x) * p.z);
  gl_Position = vec4(p.xy * 2. / viewport, 0., 1. - p.z / 1100.);
  uv = texcoord;
  local = position + .5;
  active = abs(frame - selected) < .5 ? 1. : 0.;
}
`;
const fragment = `
precision mediump float;
uniform sampler2D atlas;
uniform float opacity;
uniform bool live;
varying vec2 uv;
varying vec2 local;
varying float active;
void main() {
  vec3 color = texture2D(atlas, live ? vec2(local.x, 1. - local.y) : uv).rgb;
  gl_FragColor = vec4(color, active > .5 ? .96 : opacity);
}
`;

function createVolume(canvas: HTMLCanvasElement, data: VideoFramesData) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: false });
  if (!gl) return null;
  const program = gl.createProgram()!;
  const shaders: WebGLShader[] = [];
  const textures: WebGLTexture[] = [];
  const buffers: WebGLBuffer[] = [];
  const dispose = () => {
    shaders.forEach(shader => gl.deleteShader(shader));
    textures.forEach(texture => gl.deleteTexture(texture));
    buffers.forEach(buffer => gl.deleteBuffer(buffer));
    gl.deleteProgram(program);
  };
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
    const shader = gl.createShader(type)!;
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { dispose(); return null; }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { dispose(); return null; }
  gl.useProgram(program);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  const capacity = data.columns * data.rows;
  const corners = [[-.5, -.5], [.5, -.5], [-.5, .5], [-.5, .5], [.5, -.5], [.5, .5]];
  const batches = data.sheets.map((sheet, sheetIndex) => {
    const texture = gl.createTexture()!;
    textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sheet);
    const length = Math.min(capacity, data.times.length - sheetIndex * capacity);
    const createBuffer = (reverse: boolean) => {
      const values: number[] = [];
      for (let offset = 0; offset < length; offset++) {
        const cell = reverse ? length - 1 - offset : offset;
        for (const [x, y] of corners) {
          // Half-texel insets prevent adjacent atlas frames bleeding into each other.
          const u = ((cell % data.columns) * data.width + .5 + (x + .5) * (data.width - 1)) / sheet.naturalWidth;
          const v = (Math.floor(cell / data.columns) * data.height + .5 + (.5 - y) * (data.height - 1)) / sheet.naturalHeight;
          values.push(x, y, u, v, sheetIndex * capacity + cell);
        }
      }
      const buffer = gl.createBuffer()!;
      buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
      return buffer;
    };
    return { texture, forward: createBuffer(false), reverse: createBuffer(true), vertices: length * 6 };
  });
  const uniforms = Object.fromEntries(['viewport', 'size', 'rotation', 'depth', 'count', 'selected', 'opacity']
    .map(name => [name, gl.getUniformLocation(program, name)]));
  const attributes = ['position', 'texcoord', 'frame'].map(name => gl.getAttribLocation(program, name));
  attributes.forEach(attribute => gl.enableVertexAttribArray(attribute));
  const liveUniform = gl.getUniformLocation(program, 'live');
  const liveTexture = gl.createTexture()!;
  textures.push(liveTexture);
  gl.bindTexture(gl.TEXTURE_2D, liveTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return {
    dispose,
    draw(width: number, height: number, ratio: number, x: number, y: number, depth: number, selected: number, video: HTMLVideoElement | null) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const frameWidth = Math.min(width * .57, height * .57 * ratio, 460);
      const radians = Math.PI / 180;
      gl.uniform2f(uniforms.viewport, width, height);
      gl.uniform2f(uniforms.size, frameWidth, frameWidth / ratio);
      gl.uniform2f(uniforms.rotation, -x * radians, -y * radians);
      gl.uniform1f(uniforms.depth, Math.min(width * .36, height * .7, 260) * depth);
      gl.uniform1f(uniforms.count, data.times.length);
      gl.uniform1f(uniforms.selected, -1);
      gl.uniform1i(liveUniform, 0);
      // Keep each layer above the 8-bit drawing buffer's alpha precision.
      gl.uniform1f(uniforms.opacity, Math.max(1 / 128, 1 - Math.pow(.9, 32 / data.times.length)));
      const reverse = Math.cos(x * radians) * Math.cos(y * radians) < 0;
      for (let index = 0; index < batches.length; index++) {
        const batch = batches[reverse ? batches.length - 1 - index : index];
        gl.bindTexture(gl.TEXTURE_2D, batch.texture);
        gl.bindBuffer(gl.ARRAY_BUFFER, reverse ? batch.reverse : batch.forward);
        gl.vertexAttribPointer(attributes[0], 2, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(attributes[1], 2, gl.FLOAT, false, 20, 8);
        gl.vertexAttribPointer(attributes[2], 1, gl.FLOAT, false, 20, 16);
        gl.drawArrays(gl.TRIANGLES, 0, batch.vertices);
      }
      // Draw the inspected slice last so it stays readable inside the volume.
      // Use the original player for a sharp live frame; its atlas cell covers seeks.
      const batch = batches[Math.floor(selected / capacity)];
      gl.bindTexture(gl.TEXTURE_2D, batch.texture);
      if (video && video.readyState >= 2 && !video.seeking) {
        gl.bindTexture(gl.TEXTURE_2D, liveTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.uniform1i(liveUniform, 1);
      }
      gl.uniform1f(uniforms.selected, selected);
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.forward);
      gl.vertexAttribPointer(attributes[0], 2, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(attributes[1], 2, gl.FLOAT, false, 20, 8);
      gl.vertexAttribPointer(attributes[2], 1, gl.FLOAT, false, 20, 16);
      gl.drawArrays(gl.TRIANGLES, selected % capacity * 6, 6);
    },
  };
}

export default function FrameVolume({ data, selected, depth, ratio, video, ref }: {
  data: VideoFramesData;
  selected: number;
  depth: number;
  ratio: number;
  video: HTMLVideoElement | null;
  ref: Ref<FrameVolumeHandle>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ selected, depth, ratio });
  latest.current = { selected, depth, ratio };
  const rotation = useRef({ x: -12, y: -32 });
  const draw = useRef(() => {});
  const [fallback, setFallback] = useState(false);
  useImperativeHandle(ref, () => ({ rotate(x, y) { rotation.current = { x, y }; draw.current(); } }), []);
  useEffect(() => {
    const element = canvas.current!;
    let renderer = createVolume(element, data);
    setFallback(!renderer);
    let pending = 0;
    const render = () => {
      pending = 0;
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      if (element.width !== Math.round(width * dpr) || element.height !== Math.round(height * dpr)) {
        element.width = Math.round(width * dpr);
        element.height = Math.round(height * dpr);
      }
      const { selected, depth, ratio } = latest.current;
      renderer?.draw(width, height, ratio, rotation.current.x, rotation.current.y, depth, selected, video);
    };
    draw.current = () => { if (!pending) pending = requestAnimationFrame(render); };
    const observer = new ResizeObserver(draw.current);
    observer.observe(element);
    const lost = (event: Event) => { event.preventDefault(); renderer?.dispose(); renderer = null; setFallback(true); };
    const restored = () => { renderer = createVolume(element, data); setFallback(!renderer); draw.current(); };
    element.addEventListener('webglcontextlost', lost);
    element.addEventListener('webglcontextrestored', restored);
    video?.addEventListener('seeked', draw.current);
    draw.current();
    return () => {
      cancelAnimationFrame(pending);
      observer.disconnect();
      renderer?.dispose();
      video?.removeEventListener('seeked', draw.current);
      draw.current = () => {};
      element.removeEventListener('webglcontextlost', lost);
      element.removeEventListener('webglcontextrestored', restored);
    };
  }, [data, video]);
  useEffect(() => { draw.current(); }, [selected, depth, ratio]);
  return <>
    <canvas ref={canvas} className="carrete-frames-canvas" aria-hidden="true" data-frame-count={data.times.length} />
    {fallback && <div className="carrete-frame-fallback" aria-hidden="true"
      style={{ ...frameBackground(data, selected), aspectRatio: ratio }} />}
  </>;
}
