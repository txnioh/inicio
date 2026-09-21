import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { VideoFramesData } from './loadVideoFrames';
import type { FrameSettings } from './frameSettings';

const vertex = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0., 1.); }
`;

// Continuous space/time sampling, inspired by Video Summagator's ray-marched
// volume. A 3D texture interpolates between temporal samples instead of leaving
// gaps between individual planes. The played interval has an exact solid boundary.
const fragment = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D volume;
uniform sampler2D liveFrame;
uniform vec3 dimensions;
uniform vec3 halfSize;
uniform vec2 viewport;
uniform vec2 rotation;
uniform float zoom;
uniform float progress;
uniform float density;
uniform float brightness;
uniform bool showFrame;
uniform bool hasLive;
out vec4 outputColor;
vec3 decode(vec3 c) { return mix(c/12.92, pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c)); }
vec3 encode(vec3 c) { return mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c)); }
vec3 sampleAt(vec3 p) {
  vec3 uv = clamp(p/(2.*halfSize)+.5,0.,1.);
  uv.y = 1.-uv.y;
  uv = (uv*(dimensions-1.)+.5)/dimensions;
  return decode(texture(volume,uv).rgb)*brightness;
}
vec2 intersectBox(vec3 origin, vec3 direction, vec3 lo, vec3 hi) {
  vec3 safeDirection = mix(vec3(-1.),vec3(1.),greaterThanEqual(direction,vec3(0.)))*max(abs(direction),vec3(.000001));
  vec3 a=(lo-origin)/safeDirection, b=(hi-origin)/safeDirection;
  vec3 nearP=min(a,b), farP=max(a,b);
  return vec2(max(max(nearP.x,nearP.y),nearP.z),min(min(farP.x,farP.y),farP.z));
}
void main() {
  vec3 eye = vec3(sin(rotation.y)*cos(rotation.x),sin(rotation.x),cos(rotation.y)*cos(rotation.x));
  vec3 right = vec3(cos(rotation.y),0.,-sin(rotation.y));
  vec3 up = cross(eye,right);
  float aspect=viewport.x/viewport.y;
  float halfView=2.75/min(aspect,1.)/zoom;
  vec2 screen=(gl_FragCoord.xy/viewport*2.-1.)*vec2(halfView*aspect,halfView);
  vec3 origin=eye*10.+right*screen.x+up*screen.y, direction=-eye;
  vec2 box=intersectBox(origin,direction,-halfSize,halfSize);
  float entry=max(box.x,0.), exitT=box.y;
  if(exitT<entry) discard;
  float frameZ=mix(-halfSize.z,halfSize.z,progress);
  vec2 solid=intersectBox(origin,direction,-halfSize,vec3(halfSize.xy,frameZ));
  float solidEntry=max(entry,solid.x), solidExit=min(exitT,solid.y);
  bool hitsSolid=solidEntry<=solidExit;
  float endT=hitsSolid?solidEntry:exitT;
  float stepSize=max(endT-entry,0.)/160.;
  vec3 color=vec3(0.);
  float alpha=0.;
  for(int i=0;i<160;i++) {
    if(stepSize<=0. || alpha>.995) break;
    vec3 p=origin+direction*(entry+(float(i)+.5)*stepSize);
    float a=1.-exp(-density*5.*stepSize);
    color+=(1.-alpha)*a*sampleAt(p);
    alpha+=(1.-alpha)*a;
  }
  if(hitsSolid) {
    vec3 p=origin+direction*solidEntry;
    bool current=abs(p.z-frameZ)<.0002;
    vec3 surface=sampleAt(p);
    if(current && hasLive) {
      vec2 uv=clamp(vec2(p.x/(2.*halfSize.x)+.5,.5-p.y/(2.*halfSize.y)),0.,1.);
      surface=decode(texture(liveFrame,uv).rgb)*brightness;
    }
    if(current && showFrame) {
      vec2 edge=halfSize.xy-abs(p.xy);
      float border=1.-smoothstep(0.,2.*halfView/viewport.y,min(edge.x,edge.y));
      surface=mix(surface,vec3(1.),border);
    }
    color+=(1.-alpha)*surface;
    alpha=1.;
  }
  // Preserve the transparent interval over the same blurred gallery as video.
  // WebGL's default canvas compositor expects premultiplied sRGB output.
  outputColor=vec4(encode(color/max(alpha,.00001))*alpha,alpha);
}
`;

function createVolume(canvas: HTMLCanvasElement, data: VideoFramesData) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, depth: false });
  if (!gl || data.times.length > gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)) return null;
  const program = gl.createProgram()!;
  const shaders: WebGLShader[] = [], textures: WebGLTexture[] = [];
  const buffer = gl.createBuffer()!;
  const dispose = () => {
    shaders.forEach(shader => gl.deleteShader(shader)); textures.forEach(texture => gl.deleteTexture(texture));
    gl.deleteBuffer(buffer); gl.deleteProgram(program);
  };
  for (const [kind, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
    const shader = gl.createShader(kind)!; shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(shader)); dispose(); return null; }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { dispose(); return null; }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const volume = gl.createTexture()!; textures.push(volume);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, volume);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, axis, gl.CLAMP_TO_EDGE);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, data.width, data.height, data.times.length, 0, gl.RGBA, gl.UNSIGNED_BYTE, data.pixels as Uint8Array<ArrayBuffer>);
  gl.uniform1i(gl.getUniformLocation(program, 'volume'), 0);
  const live = gl.createTexture()!; textures.push(live);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, live);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
  gl.uniform1i(gl.getUniformLocation(program, 'liveFrame'), 1);
  const uniforms = Object.fromEntries(['dimensions','halfSize','viewport','rotation','zoom','progress','density','brightness','showFrame','hasLive'].map(name => [name, gl.getUniformLocation(program,name)]));
  gl.uniform3f(uniforms.dimensions, data.width, data.height, data.times.length);
  gl.clearColor(0,0,0,0);
  return {
    dispose,
    draw(_width: number, _height: number, ratio: number, settings: FrameSettings, time: number, video: HTMLVideoElement | null) {
      gl.viewport(0,0,canvas.width,canvas.height); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniforms.viewport,canvas.width,canvas.height);
      gl.uniform3f(uniforms.halfSize,1.35*Math.min(1,ratio),1.35/Math.max(1,ratio),settings.depth/2);
      gl.uniform2f(uniforms.rotation,settings.rotationX*Math.PI/180,settings.rotationY*Math.PI/180);
      gl.uniform1f(uniforms.zoom,settings.scale);
      gl.uniform1f(uniforms.progress,Math.max(0,Math.min(1,time/data.duration)));
      gl.uniform1f(uniforms.density,settings.density); gl.uniform1f(uniforms.brightness,settings.brightness);
      gl.uniform1i(uniforms.showFrame,settings.showFrame?1:0);
      const hasLive = Boolean(video && video.readyState>=2 && !video.seeking);
      gl.uniform1i(uniforms.hasLive,hasLive?1:0);
      if (hasLive) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,live); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video!); }
      gl.drawArrays(gl.TRIANGLES,0,6);
    },
  };
}

export default function FrameVolume({ data, time, settings, ratio, video }: {
  data: VideoFramesData; time: number; settings: FrameSettings; ratio: number; video: HTMLVideoElement | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), fallbackCanvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ time, settings, ratio, video }); latest.current = { time, settings, ratio, video };
  const draw = useRef(() => {});
  const [fallback, setFallback] = useState(false);
  useLayoutEffect(() => {
    const element = canvas.current!;
    let renderer = createVolume(element,data), pending = 0;
    setFallback(!renderer);
    const render = () => {
      pending = 0;
      const width=element.clientWidth, height=element.clientHeight;
      if (!width || !height) return;
      const dpr=Math.min(devicePixelRatio||1,1.5,1600/Math.max(width,height));
      if (element.width!==Math.round(width*dpr) || element.height!==Math.round(height*dpr)) { element.width=Math.round(width*dpr); element.height=Math.round(height*dpr); }
      const { time, settings, ratio, video }=latest.current;
      renderer?.draw(width,height,ratio,settings,time,video);
    };
    draw.current=()=>{if(!pending) pending=requestAnimationFrame(render);};
    const observer=new ResizeObserver(draw.current); observer.observe(element);
    const lost=(event:Event)=>{event.preventDefault();renderer?.dispose();renderer=null;setFallback(true);};
    const restored=()=>{renderer=createVolume(element,data);setFallback(!renderer);draw.current();};
    element.addEventListener('webglcontextlost',lost);element.addEventListener('webglcontextrestored',restored);
    render();
    return ()=>{cancelAnimationFrame(pending);observer.disconnect();renderer?.dispose();element.removeEventListener('webglcontextlost',lost);element.removeEventListener('webglcontextrestored',restored);draw.current=()=>{};};
  },[data]);
  useEffect(()=>{const drawFrame=()=>draw.current();video?.addEventListener('seeked',drawFrame);return()=>video?.removeEventListener('seeked',drawFrame);},[video]);
  useEffect(()=>{draw.current();},[time,settings,ratio,video]);
  useEffect(()=>{
    if(!fallback || !fallbackCanvas.current)return;
    const context=fallbackCanvas.current.getContext('2d')!;
    if(video && video.readyState>=2)context.drawImage(video,0,0,data.width,data.height);
    else {
      const index=Math.max(0,Math.min(data.times.length-1,Math.round(time/data.duration*(data.times.length-1))));
      const start=index*data.width*data.height*4;
      context.putImageData(new ImageData(new Uint8ClampedArray(data.pixels.slice(start,start+data.width*data.height*4)),data.width,data.height),0,0);
    }
  },[fallback,data,time,video]);
  return <>
    <canvas ref={canvas} className="carrete-frames-canvas" aria-hidden="true" data-sample-count={data.times.length} data-renderer="continuous-volume" />
    {fallback && <canvas ref={fallbackCanvas} className="carrete-frame-fallback" width={data.width} height={data.height} aria-label="Selected video frame. WebGL 2 is unavailable." />}
  </>;
}
