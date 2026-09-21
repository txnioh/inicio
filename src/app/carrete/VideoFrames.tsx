import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { loadVideoFrames, sampleLocalVideo, type VideoFramesData } from './loadVideoFrames';
import FrameVolume from './FrameVolume';
import FrameEditor from './FrameEditor';
import { defaultFrameSettings } from './frameSettings';
import type { MediaQuality } from './quality';

const formatTime = (time: number) => `${String(Math.floor(time / 60)).padStart(2, '0')}:${(time % 60).toFixed(2).padStart(5, '0')}`;
export default function VideoFrames({ src, initialTime, initialData, video, onSeek, quality }: {
  src: string; width: number; height: number; initialTime: number; video: HTMLVideoElement | null;
  onSeek: (time: number) => void; quality: MediaQuality; initialData: VideoFramesData;
}) {
  const viewport = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), preview = useRef<HTMLCanvasElement>(null);
  const [settings, setSettings] = useState({ ...defaultFrameSettings, samples: quality === 'lite' ? 96 : 160, rotationX: 0, rotationY: 0 });
  const [source, setSource] = useState('carrete');
  const [local, setLocal] = useState<{ src: string; name: string } | null>(null);
  const [localVideo, setLocalVideo] = useState<HTMLVideoElement | null>(null);
  const active = source === 'local' ? localVideo : video;
  const activeRef = useRef(active); activeRef.current = active;
  const activeSrc = source === 'local' && local ? local.src : src;
  const [data, setData] = useState<VideoFramesData | null>(initialData);
  const [progress, setProgress] = useState(0), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [time, setTime] = useState(initialTime), [playing, setPlaying] = useState(false), [playError, setPlayError] = useState(false);
  const [entering, setEntering] = useState(false);
  const enteringRef = useRef(false), enteredSource = useRef<string | null>(null);
  const stopEntrance = useRef(() => {}), seekRef = useRef(onSeek); seekRef.current = onSeek;
  const points = useRef(new Map<number, { x: number; y: number; moved: boolean; distance: number }>());
  useEffect(() => () => { if (local) URL.revokeObjectURL(local.src); }, [local]);
  useEffect(() => {
    if (!active) return;
    const rate = active.playbackRate;
    return () => { active.pause(); active.playbackRate = rate; };
  }, [active]);
  useEffect(() => { if (active) active.playbackRate = settings.playbackRate; }, [active, settings.playbackRate]);
  useEffect(() => {
    const controller = new AbortController();
    let animation = 0;
    const prepared = activeSrc === src && settings.samples === initialData.times.length;
    activeRef.current?.pause(); if (!prepared) setData(null); setError(''); setProgress(0);
    const loader = activeSrc.startsWith('blob:') ? sampleLocalVideo : loadVideoFrames;
    void (prepared ? Promise.resolve(initialData) : loader(activeSrc, settings.samples, controller.signal, setProgress)).then(result => {
      if (controller.signal.aborted) return;
      setData(result);
      if (enteredSource.current === activeSrc) { setTime(activeRef.current?.currentTime ?? 0); return; }
      enteredSource.current = activeSrc;
      const target = result.duration * .3;
      const finish = () => {
        cancelAnimationFrame(animation);
        enteringRef.current = false; setEntering(false); setTime(target);
        setSettings(value => ({ ...value, rotationX: defaultFrameSettings.rotationX, rotationY: defaultFrameSettings.rotationY }));
        if (source === 'carrete') seekRef.current(target);
        else if (activeRef.current) activeRef.current.currentTime = target;
        stopEntrance.current = () => {};
      };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
      enteringRef.current = true; setEntering(true); setTime(result.duration);
      setSettings(value => ({ ...value, rotationX: 0, rotationY: 0 }));
      stopEntrance.current = finish;
      let start: number | undefined;
      const tick = (now: number) => {
        start ??= now;
        const progress = Math.min(1, (now - start) / 700);
        const eased = progress * progress * (3 - 2 * progress);
        setTime(result.duration * (1 - .7 * eased));
        setSettings(value => ({ ...value, rotationX: defaultFrameSettings.rotationX * eased, rotationY: defaultFrameSettings.rotationY * eased }));
        if (progress < 1) animation = requestAnimationFrame(tick);
        else finish();
      };
      animation = requestAnimationFrame(tick);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Samples could not be loaded.'); });
    return () => { controller.abort(); cancelAnimationFrame(animation); enteringRef.current = false; stopEntrance.current = () => {}; };
  }, [activeSrc, settings.samples, attempt]);
  useEffect(() => {
    if (!active) return;
    let animation = 0;
    const tick = () => { setTime(active.currentTime); animation = requestAnimationFrame(tick); };
    const sync = () => {
      cancelAnimationFrame(animation); const running = !active.paused && !active.ended;
      setPlaying(running); if (!enteringRef.current) setTime(active.currentTime); if (running) animation = requestAnimationFrame(tick);
    };
    const events = ['play', 'pause', 'ended', 'seeked', 'loadeddata'] as const;
    events.forEach(event => active.addEventListener(event, sync)); sync();
    return () => { cancelAnimationFrame(animation); events.forEach(event => active.removeEventListener(event, sync)); };
  }, [active]);
  useEffect(() => {
    if (!settings.autoRotate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let animation = 0, previous = 0;
    const tick = (now: number) => {
      const delta = previous ? Math.min(.1, (now - previous) / 1000) : 0; previous = now;
      setSettings(value => ({ ...value, rotationY: (value.rotationY + delta * 3.6) % 360 }));
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick); return () => cancelAnimationFrame(animation);
  }, [settings.autoRotate]);
  useEffect(() => {
    const element = viewport.current!;
    const wheel = (event: WheelEvent) => { event.preventDefault(); stopEntrance.current(); setSettings(value => ({ ...value, scale: Math.max(.45, Math.min(2.5, value.scale * Math.exp(-event.deltaY * .001))) })); };
    element.addEventListener('wheel', wheel, { passive: false }); return () => element.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    if (!data || !preview.current) return;
    const canvas = preview.current, context = canvas.getContext('2d')!;
    if (canvas.width !== data.width || canvas.height !== data.height) { canvas.width = data.width; canvas.height = data.height; }
    if (!entering && active && active.readyState >= 2 && !active.seeking) context.drawImage(active, 0, 0, data.width, data.height);
    else {
      const index = Math.max(0, Math.min(data.times.length - 1, Math.round(time / data.duration * (data.times.length - 1))));
      const offset = index * data.width * data.height * 4;
      context.putImageData(new ImageData(new Uint8ClampedArray(data.pixels.slice(offset, offset + data.width * data.height * 4)), data.width, data.height), 0, 0);
    }
  }, [active, data, time, entering]);
  const seek = (value: number) => {
    if (!data || !active) return;
    active.pause(); const next = Math.max(0, Math.min(data.duration - .0001, value));
    if (source === 'carrete') onSeek(next); else active.currentTime = next;
    setTime(next);
  };
  const play = (run: boolean) => {
    if (!active || !data) return;
    setPlayError(false);
    if (!run) { active.pause(); return; }
    if (active.ended) seek(0);
    void active.play().catch(() => setPlayError(true));
  };
  const reset = () => setSettings(value => ({ ...value, rotationX: defaultFrameSettings.rotationX, rotationY: defaultFrameSettings.rotationY, scale: 1 }));
  const release = (event: PointerEvent<HTMLDivElement>) => {
    const point = points.current.get(event.pointerId); points.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!points.current.size) event.currentTarget.removeAttribute('data-dragging');
    if (point && !point.moved && event.type === 'pointerup') play(!playing);
  };
  const selected = data ? Math.min(data.times.length - 1, Math.round(time / data.duration * (data.times.length - 1))) : 0;
  return <section className="carrete-frames" aria-label="Explore frames" data-entering={entering || undefined}
    onPointerDownCapture={() => stopEntrance.current()}
    onKeyDownCapture={() => stopEntrance.current()}
    onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation(); }}>
    <div ref={viewport} className="carrete-frames-viewport" role="group" tabIndex={data ? 0 : -1}
      aria-label="Video time volume. Drag to orbit, scroll or pinch to zoom. Left and Right step through time. Space plays. R resets the camera."
      onPointerDown={event => {
        if (event.button !== 0 || !data) return;
        const point = { x: event.clientX, y: event.clientY, moved: false, distance: 0 };
        points.current.set(event.pointerId, point);
        if (points.current.size > 1) for (const p of points.current.values()) p.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.setAttribute('data-dragging', 'true'); event.currentTarget.focus({ preventScroll: true });
      }}
      onPointerMove={event => {
        const point = points.current.get(event.pointerId); if (!point) return;
        const dx = event.clientX - point.x, dy = event.clientY - point.y;
        point.distance += Math.hypot(dx, dy); point.moved ||= point.distance > 5;
        const other = [...points.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
        if (other) {
          const before = Math.hypot(point.x - other.x, point.y - other.y), after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
          if (before > 0) setSettings(value => ({ ...value, scale: Math.max(.45, Math.min(2.5, value.scale * after / before)) }));
        } else if (point.moved) setSettings(value => ({ ...value, rotationX: Math.max(-85, Math.min(85, value.rotationX + dy * .35)), rotationY: (value.rotationY - dx * .35) % 360 }));
        point.x = event.clientX; point.y = event.clientY;
      }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !data) return;
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); play(!playing); }
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); seek(time + (event.key === 'ArrowLeft' ? -1 : 1) * data.duration / (data.times.length - 1)); }
        else if (event.key.toLowerCase() === 'r') { event.preventDefault(); reset(); }
      }}>
      {data && <FrameVolume data={data} time={time} settings={settings} ratio={data.width / data.height} video={entering ? null : active} />}
      {!data && <div className="carrete-frames-status" role="status">
        {error ? <><p>{error}</p><button className="carrete-text-button" onClick={() => setAttempt(value => value + 1)}>Retry</button></>
          : <><p>Loading samples…</p><progress max={100} value={progress} aria-label="Loading samples" /><span>{progress}%</span></>}
      </div>}
    </div>
    <FrameEditor settings={settings} onChange={setSettings} time={time} duration={data?.duration ?? (active && Number.isFinite(active.duration) ? active.duration : 1)} playing={playing}
      source={source} sourceName={source === 'local' ? local?.name ?? 'Local video' : 'Carrete video'}
      onSeek={seek} onPlay={play} onChoose={() => input.current?.click()}
      onSource={next => { if (next === 'local' && !local) { input.current?.click(); return; } active?.pause(); setSource(next); }} />
    <input ref={input} type="file" accept="video/*,.mp4,.mov,.webm,.m4v" hidden onChange={event => {
      const file = event.target.files?.[0]; if (!file) return;
      active?.pause(); setLocal({ src: URL.createObjectURL(file), name: file.name }); setSource('local'); event.target.value = '';
    }} />
    {local && <video ref={setLocalVideo} src={local.src} muted playsInline preload="auto" hidden />}
    {data && <>
      <figure className="carrete-frame-preview"><div><span>Selected frame</span><output>{formatTime(time)}</output></div>
        <canvas ref={preview} aria-label="Selected video frame" /><figcaption>Sample {String(selected + 1).padStart(3, '0')} / {data.times.length}</figcaption>
      </figure>
      <p className="carrete-frame-instructions">Drag to orbit · Scroll to zoom · ← → step through time · Space to play</p>
      <div className="carrete-frame-mobile-transport"><button className="carrete-text-button" aria-label={playing ? 'Pause video' : 'Play video'} onClick={() => play(!playing)}>{playing ? 'Ⅱ' : '▷'}</button>
        <input type="range" aria-label="Video timeline" min={0} max={data.duration} step={.01} value={time} onChange={event => seek(Number(event.target.value))} /><output>{formatTime(time)}</output>
      </div>
    </>}
    {playError && <p className="carrete-frames-play-error" role="status">Playback could not start. Tap the volume to try again.</p>}
  </section>;
}
