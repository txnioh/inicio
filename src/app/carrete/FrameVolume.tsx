import { useEffect, useRef, useState } from 'react';
import { frameBackground, type VideoFramesData } from './loadVideoFrames';
import type { FrameSettings } from './frameSettings';

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
varying float upcoming;
void main() {
  vec3 p = vec3(position * size, (frame / max(1., count - 1.) - .5) * depth);
  p = vec3(cos(rotation.y) * p.x + sin(rotation.y) * p.z, p.y, -sin(rotation.y) * p.x + cos(rotation.y) * p.z);
  p = vec3(p.x, cos(rotation.x) * p.y - sin(rotation.x) * p.z, sin(rotation.x) * p.y + cos(rotation.x) * p.z);
  gl_Position = vec4(p.xy * 2. / viewport, -p.z / 1100., 1. - p.z / 1100.);
  uv = texcoord;
  local = position + .5;
  active = abs(frame - selected) < .5 ? 1. : 0.;
  upcoming = max(0., (frame - selected) / max(1., count - 1. - selected));
}
`;
const fragment = `
precision mediump float;
uniform sampler2D atlas;
uniform float opacity;
uniform float futureOpacity;
uniform bool live;
uniform bool solid;
uniform vec2 texel;
uniform vec2 cellSize;
uniform vec3 effects;
uniform float fade;
varying vec2 uv;
varying vec2 local;
varying float active;
varying float upcoming;
void main() {
  vec3 color = texture2D(atlas, live ? vec2(local.x, 1. - local.y) : uv).rgb;
  if (!solid && active < .5 && upcoming > 0.) {
    if (effects.z > 0.) {
      vec2 origin = floor(uv / cellSize) * cellSize;
      vec2 lo = origin + texel * .5;
      vec2 hi = origin + cellSize - texel * .5;
      vec2 radius = texel * effects.z;
      color *= 4.;
      color += texture2D(atlas, clamp(uv + vec2(radius.x, 0.), lo, hi)).rgb;
      color += texture2D(atlas, clamp(uv - vec2(radius.x, 0.), lo, hi)).rgb;
      color += texture2D(atlas, clamp(uv + vec2(0., radius.y), lo, hi)).rgb;
      color += texture2D(atlas, clamp(uv - vec2(0., radius.y), lo, hi)).rgb;
      color /= 8.;
    }
    color = mix(vec3(dot(color, vec3(.2126, .7152, .0722))), color, effects.y) * effects.x;
  }
  float alpha = solid || active > .5 ? 1. : opacity * (upcoming > 0. ? futureOpacity : 1.) * (1. - fade * upcoming);
  gl_FragColor = vec4(clamp(color, 0., 1.), alpha);
}
`;

function createVolume(canvas: HTMLCanvasElement, data: VideoFramesData) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true });
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
  const uploadBuffer = (values: number[]) => {
    const buffer = gl.createBuffer()!;
    buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
    return buffer;
  };
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
    const vertexAt = (cell: number, x: number, y: number, frame: number) => {
      // Half-texel insets prevent adjacent atlas frames bleeding into each other.
      const u = ((cell % data.columns) * data.width + .5 + (x + .5) * (data.width - 1)) / sheet.naturalWidth;
      const v = (Math.floor(cell / data.columns) * data.height + .5 + (.5 - y) * (data.height - 1)) / sheet.naturalHeight;
      return [x, y, u, v, frame];
    };
    const createBuffer = (reverse: boolean) => {
      const values: number[] = [];
      for (let offset = 0; offset < length; offset++) {
        const cell = reverse ? length - 1 - offset : offset;
        for (const [x, y] of corners) {
          values.push(...vertexAt(cell, x, y, sheetIndex * capacity + cell));
        }
      }
      return uploadBuffer(values);
    };
    // Join each image's perimeter to the next slice. These textured strips
    // close the played volume, including at large spacing and atlas boundaries.
    const sides: number[] = [];
    const perimeter = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]];
    for (let cell = 0; cell < length; cell++) {
      const frame = sheetIndex * capacity + cell;
      for (let edge = 0; edge < 4; edge++) {
        const a = perimeter[edge];
        const b = perimeter[(edge + 1) % 4];
        for (const [point, offset] of [[a, 0], [b, 0], [a, 1], [a, 1], [b, 0], [b, 1]] as const) {
          sides.push(...vertexAt(cell, point[0], point[1], frame + offset));
        }
      }
    }
    return { texture, forward: createBuffer(false), reverse: createBuffer(true), sides: uploadBuffer(sides),
      start: sheetIndex * capacity, length, width: sheet.naturalWidth, height: sheet.naturalHeight };
  });
  const uniforms = Object.fromEntries(['viewport', 'size', 'rotation', 'depth', 'count', 'selected', 'opacity', 'futureOpacity', 'solid', 'texel', 'cellSize', 'effects', 'fade']
    .map(name => [name, gl.getUniformLocation(program, name)]));
  const attributes = ['position', 'texcoord', 'frame'].map(name => gl.getAttribLocation(program, name));
  attributes.forEach(attribute => gl.enableVertexAttribArray(attribute));
  const bindBuffer = (buffer: WebGLBuffer) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(attributes[0], 2, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(attributes[1], 2, gl.FLOAT, false, 20, 8);
    gl.vertexAttribPointer(attributes[2], 1, gl.FLOAT, false, 20, 16);
  };
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
    draw(width: number, height: number, ratio: number, settings: FrameSettings, selected: number, video: HTMLVideoElement | null) {
      const { rotationX: x, rotationY: y, depth, scale, opacity, solidPast, brightness, saturation, blur, fade } = settings;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const frameWidth = Math.min(width * .57, height * .57 * ratio, 460) * scale;
      const radians = Math.PI / 180;
      gl.uniform2f(uniforms.viewport, width, height);
      gl.uniform2f(uniforms.size, frameWidth, frameWidth / ratio);
      gl.uniform2f(uniforms.rotation, -x * radians, -y * radians);
      gl.uniform1f(uniforms.depth, Math.min(width * .36, height * .7, 260) * depth);
      gl.uniform1f(uniforms.count, data.times.length);
      gl.uniform1f(uniforms.selected, selected);
      gl.uniform3f(uniforms.effects, brightness, saturation, blur);
      gl.uniform1f(uniforms.fade, fade);
      gl.uniform1i(liveUniform, 0);
      // Keep each layer above the 8-bit drawing buffer's alpha precision.
      gl.uniform1f(uniforms.opacity, Math.max(1 / 128, 1 - Math.pow(.9, 32 / data.times.length)));
      gl.uniform1f(uniforms.futureOpacity, opacity);
      gl.enable(gl.DEPTH_TEST);
      if (solidPast && selected > 0) {
        gl.uniform1i(uniforms.solid, 1);
        for (const batch of batches) {
          const length = Math.min(batch.length, selected - batch.start);
          if (length <= 0) break;
          gl.bindTexture(gl.TEXTURE_2D, batch.texture);
          bindBuffer(batch.sides);
          gl.drawArrays(gl.TRIANGLES, 0, length * 24);
        }
        // The first and current images cap the accumulated image strips.
        for (const frame of [0, selected]) {
          const batch = batches[Math.floor(frame / capacity)];
          gl.bindTexture(gl.TEXTURE_2D, batch.texture);
          bindBuffer(batch.forward);
          gl.drawArrays(gl.TRIANGLES, frame % capacity * 6, 6);
        }
      }
      gl.uniform1i(uniforms.solid, 0);
      gl.depthMask(false);
      const reverse = Math.cos(x * radians) * Math.cos(y * radians) < 0;
      for (let index = 0; index < batches.length; index++) {
        const batch = batches[reverse ? batches.length - 1 - index : index];
        const start = solidPast ? Math.max(batch.start, selected + 1) : batch.start;
        const length = batch.start + batch.length - start;
        if (length <= 0) continue;
        gl.bindTexture(gl.TEXTURE_2D, batch.texture);
        gl.uniform2f(uniforms.texel, 1 / batch.width, 1 / batch.height);
        gl.uniform2f(uniforms.cellSize, data.width / batch.width, data.height / batch.height);
        bindBuffer(reverse ? batch.reverse : batch.forward);
        gl.drawArrays(gl.TRIANGLES, reverse ? 0 : (start - batch.start) * 6, length * 6);
      }
      // Draw the inspected slice last so it stays readable inside the volume.
      // Use the original player for a sharp live frame; its atlas cell covers seeks.
      gl.disable(gl.DEPTH_TEST);
      const batch = batches[Math.floor(selected / capacity)];
      gl.bindTexture(gl.TEXTURE_2D, batch.texture);
      if (video && video.readyState >= 2 && !video.seeking) {
        gl.bindTexture(gl.TEXTURE_2D, liveTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.uniform1i(liveUniform, 1);
      }
      gl.uniform1f(uniforms.selected, selected);
      bindBuffer(batch.forward);
      gl.drawArrays(gl.TRIANGLES, selected % capacity * 6, 6);
    },
  };
}

export default function FrameVolume({ data, selected, settings, ratio, video }: {
  data: VideoFramesData;
  selected: number;
  settings: FrameSettings;
  ratio: number;
  video: HTMLVideoElement | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ selected, settings, ratio });
  latest.current = { selected, settings, ratio };
  const draw = useRef(() => {});
  const [fallback, setFallback] = useState(false);
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
      const { selected, settings, ratio } = latest.current;
      renderer?.draw(width, height, ratio, settings, selected, video);
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
  useEffect(() => { draw.current(); }, [selected, settings, ratio]);
  return <>
    <canvas ref={canvas} className="carrete-frames-canvas" aria-hidden="true" data-frame-count={data.times.length} />
    {fallback && <div className="carrete-frame-fallback" aria-hidden="true"
      style={{ ...frameBackground(data, selected), aspectRatio: ratio }} />}
  </>;
}
