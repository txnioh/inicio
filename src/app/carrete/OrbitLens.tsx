import { useEffect, useRef, useState } from 'react';
import type { LoadedMedia } from './media';
import type { CarreteSettings } from './settings';
import type { MediaQuality } from './quality';

const vertex = `
attribute vec2 position;
varying vec2 uv;
void main() { uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }
`;

// Adapted from VGPU Lab's ripple-12.wgsl. A horizontal mask keeps the
// photographs untouched until they pass through either side of the orbit.
const fragment = `
precision highp float;
uniform sampler2D scene;
uniform vec2 resolution;
uniform float time;
uniform float distortion;
uniform float rippleAmount;
uniform float dispersionAmount;
uniform float sideStart;
varying vec2 uv;
vec2 lens(float channel, float side) {
  vec2 delta = (uv - .5) * resolution;
  float unit = min(resolution.x, resolution.y);
  float radius = length(delta);
  float n = radius / (unit * .70);
  float pincushion = distortion * channel * pow(clamp(n, 0., 1.6), 2.2) * side;
  float ripple = rippleAmount * sin(6.28318 * radius / (unit * .42) - time * 1.1) * side;
  return .5 + delta / (1. + pincushion + ripple) / resolution;
}
vec4 sampleScene(vec2 p) {
  if (p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1.) return vec4(.99216, .99216, .98824, 1.);
  return texture2D(scene, p);
}
void main() {
  float orbitRadiusX = min(resolution.x * .48, resolution.y * .46);
  float side = smoothstep(sideStart, 1.05, abs((uv.x - .5) * resolution.x) / orbitRadiusX);
  float dispersion = dispersionAmount * side;
  gl_FragColor = vec4(sampleScene(lens(1. + dispersion, side)).r,
    sampleScene(lens(1., side)).g, sampleScene(lens(1. - dispersion, side)).b, 1.);
}
`;

function createLens(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
  if (!gl) return null;
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram()!;
  const buffer = gl.createBuffer()!;
  const texture = gl.createTexture()!;
  const dispose = () => {
    shaders.forEach(shader => gl.deleteShader(shader));
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    gl.deleteTexture(texture);
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
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const resolution = gl.getUniformLocation(program, 'resolution');
  const time = gl.getUniformLocation(program, 'time');
  const distortion = gl.getUniformLocation(program, 'distortion');
  const rippleAmount = gl.getUniformLocation(program, 'rippleAmount');
  const dispersionAmount = gl.getUniformLocation(program, 'dispersionAmount');
  const sideStart = gl.getUniformLocation(program, 'sideStart');
  return {
    draw(source: HTMLCanvasElement, elapsed: number, settings: CarreteSettings) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, elapsed);
      gl.uniform1f(distortion, settings.distortion / 100);
      gl.uniform1f(rippleAmount, settings.ripple / 100);
      gl.uniform1f(dispersionAmount, settings.dispersion / 100);
      gl.uniform1f(sideStart, settings.sideStart / 100);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose,
  };
}

export default function OrbitLens({ frames, reducedMotion, settings, quality }: { frames: LoadedMedia[]; reducedMotion: boolean; settings: CarreteSettings; quality: MediaQuality }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fallbackCanvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(frames);
  latest.current = frames;
  const currentSettings = useRef(settings);
  currentSettings.current = settings;
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const output = canvas.current!;
    const fallbackOutput = fallbackCanvas.current!;
    const source = document.createElement('canvas');
    const context = source.getContext('2d')!;
    const fallbackContext = fallbackOutput.getContext('2d')!;
    let lens = createLens(output);
    setFallback(!lens);
    let frame = 0;
    let width = 1;
    let height = 1;
    let elapsed = 0;
    let orbitAngle = 0;
    let entranceElapsed = 0;
    let entranceStarted = false;
    let previous = 0;

    const draw = (now: number) => {
      frame = 0;
      if (document.hidden) { previous = 0; return; }
      const delta = previous && !reducedMotion ? Math.min((now - previous) / 1000, .05) : 0;
      const effects = currentSettings.current;
      elapsed += delta;
      orbitAngle += delta * .075 * effects.orbitSpeed / 100;
      previous = now;
      const dpr = Math.min(devicePixelRatio || 1, quality === 'lite' ? 1 : 1.5);
      if (source.width !== Math.round(width * dpr) || source.height !== Math.round(height * dpr)) {
        source.width = output.width = fallbackOutput.width = Math.round(width * dpr);
        source.height = output.height = fallbackOutput.height = Math.round(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = '#fdfdfc';
      context.fillRect(0, 0, width, height);
      const unit = Math.min(width, height);
      const radiusX = Math.min(width * .48, height * .46);
      const radiusY = Math.min(height * .32, width * .5);
      const photos = latest.current;
      // Start only once previews exist, so slow downloads cannot skip the entrance.
      if (photos.length && !entranceStarted) entranceStarted = true;
      if (entranceStarted) entranceElapsed += delta * 1000;
      const count = photos.length ? effects.orbitCount : 0;
      const size = unit * (width < 600 ? .075 : .085) * effects.circleScale / 100;
      for (let index = 0; index < count; index++) {
        const { image } = photos[index % photos.length];
        const progress = reducedMotion ? 1 : Math.max(0, Math.min(1,
          (entranceElapsed - index * effects.introStagger) / effects.introDuration));
        const reveal = progress * progress * (3 - 2 * progress);
        if (reveal === 0) continue;
        const angle = (index / count) * Math.PI * 2 + orbitAngle - Math.PI / 2;
        const crop = Math.min(image.naturalWidth, image.naturalHeight);
        context.save();
        context.globalAlpha = reveal;
        context.translate(width / 2 + Math.cos(angle) * radiusX * (.96 + .04 * reveal), height / 2 + Math.sin(angle) * radiusY * (.96 + .04 * reveal));
        context.scale(.82 + .18 * reveal, .82 + .18 * reveal);
        context.rotate(angle + Math.PI / 2);
        context.beginPath();
        context.arc(0, 0, size / 2, 0, Math.PI * 2);
        context.clip();
        context.drawImage(image,
          (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop,
          -size / 2, -size / 2, size, size);
        context.restore();
      }
      if (lens) lens.draw(source, elapsed, effects);
      else fallbackContext.drawImage(source, 0, 0);
      // A static lens still refreshes while the loading previews are replaced.
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      schedule();
    });
    resize.observe(output);
    const lost = (event: Event) => {
      event.preventDefault();
      lens?.dispose();
      lens = null;
      setFallback(true);
      schedule();
    };
    output.addEventListener('webglcontextlost', lost);
    document.addEventListener('visibilitychange', schedule);
    // The static accessibility version updates only when new images finish loading.
    const refresh = () => schedule();
    output.addEventListener('carrete:loaded', refresh);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      lens?.dispose();
      output.removeEventListener('webglcontextlost', lost);
      output.removeEventListener('carrete:loaded', refresh);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [reducedMotion, quality]);

  useEffect(() => { canvas.current?.dispatchEvent(new Event('carrete:loaded')); }, [frames, settings]);

  return <div className="carrete-orbit" aria-hidden="true">
    <canvas ref={canvas} style={{ opacity: fallback ? 0 : 1 }} />
    <canvas ref={fallbackCanvas} hidden={!fallback} />
  </div>;
}
