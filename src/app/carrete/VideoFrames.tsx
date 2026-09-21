import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { frameAtTime, loadVideoFrames, type VideoFramesData } from './loadVideoFrames';
import FrameVolume from './FrameVolume';
import FrameEditor from './FrameEditor';
import FrameTimeline from './FrameTimeline';
import { defaultFrameSettings } from './frameSettings';
import type { MediaQuality } from './quality';

export default function VideoFrames({ src, width, height, initialTime, video, onSeek, quality }: {
  src: string;
  width: number;
  height: number;
  initialTime: number;
  video: HTMLVideoElement | null;
  onSeek: (time: number) => void;
  quality: MediaQuality;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState({ ...defaultFrameSettings });
  const rotation = useRef({ x: settings.rotationX, y: settings.rotationY });
  rotation.current = { x: settings.rotationX, y: settings.rotationY };
  const pointer = useRef<{ id: number; x: number; y: number; startX: number; startY: number; dragged: boolean } | null>(null);
  const startTime = useRef(initialTime).current;
  const [data, setData] = useState<VideoFramesData | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playError, setPlayError] = useState(false);
  const times = data?.times;
  const count = times?.length ?? 0;

  useEffect(() => {
    if (!video) return;
    const previous = video.playbackRate;
    return () => { video.playbackRate = previous; };
  }, [video]);
  useEffect(() => { if (video) video.playbackRate = settings.playbackRate; }, [video, settings.playbackRate]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(false);
    setProgress(0);
    void loadVideoFrames(src, quality, controller.signal, setProgress).then(result => {
      if (controller.signal.aborted) return;
      setData(result);
      setSelected(frameAtTime(result.times, video?.currentTime ?? startTime));
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [src, startTime, attempt, quality, video]);

  useEffect(() => {
    if (!video || !times) return;
    let animation = 0;
    const update = () => setSelected(frameAtTime(times, video.currentTime));
    let previous = 0;
    const tick = (now: number) => {
      if (quality === 'high' || now - previous >= 1000 / 30) { update(); previous = now; }
      animation = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(animation);
      const running = !video.paused && !video.ended;
      setPlaying(running);
      update();
      if (running) animation = requestAnimationFrame(tick);
    };
    const events = ['play', 'pause', 'ended', 'seeked'] as const;
    events.forEach(event => video.addEventListener(event, sync));
    sync();
    return () => {
      cancelAnimationFrame(animation);
      events.forEach(event => video.removeEventListener(event, sync));
    };
  }, [video, times, quality]);

  const rotate = (x: number, y: number) => {
    rotation.current = { x: Math.max(-65, Math.min(65, x)), y: ((y + 180) % 360 + 360) % 360 - 180 };
    setSettings(previous => ({ ...previous, rotationX: rotation.current.x, rotationY: rotation.current.y }));
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current?.id !== event.pointerId) return;
    const tap = event.type === 'pointerup' && !pointer.current.dragged;
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.removeAttribute('data-dragging');
    if (tap) togglePlayback();
  };
  const select = (index: number) => {
    const next = Math.max(0, Math.min(count - 1, index));
    if (!times) return;
    video?.pause();
    setSelected(next);
    onSeek(times[next] + .0001);
  };
  const togglePlayback = () => {
    if (!video || !times) return;
    setPlayError(false);
    if (!video.paused) { video.pause(); return; }
    if (video.ended || selected === count - 1) onSeek(times[0]);
    void video.play().catch(() => setPlayError(true));
  };

  return <section className="carrete-frames" aria-label="Explorar fotogramas"
    onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation(); }}>
    <div ref={viewport} className="carrete-frames-viewport" role="group" tabIndex={count ? 0 : -1}
      aria-label={`Volumen de fotogramas. Pulsa, usa Intro o espacio para ${playing ? 'pausar' : 'reproducir'}. Arrastra o usa las flechas para girar. Mayús y flechas izquierda o derecha para avanzar un fotograma.`}
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary || !count) return;
        pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
          startX: event.clientX, startY: event.clientY, dragged: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.setAttribute('data-dragging', 'true');
        event.currentTarget.focus({ preventScroll: true });
      }}
      onPointerMove={event => {
        const previous = pointer.current;
        if (!previous || previous.id !== event.pointerId) return;
        previous.dragged ||= Math.hypot(event.clientX - previous.startX, event.clientY - previous.startY) > 5;
        if (!previous.dragged) return;
        rotate(rotation.current.x - (event.clientY - previous.y) * .35,
          rotation.current.y + (event.clientX - previous.x) * .35);
        previous.x = event.clientX;
        previous.y = event.clientY;
      }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); togglePlayback(); return; }
        if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault(); select(selected + (event.key === 'ArrowLeft' ? -1 : 1)); return;
        }
        if (!event.key.startsWith('Arrow')) return;
        event.preventDefault();
        rotate(rotation.current.x + (event.key === 'ArrowUp' ? -5 : event.key === 'ArrowDown' ? 5 : 0),
          rotation.current.y + (event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0));
      }}>
      {data && <FrameVolume data={data} selected={selected} settings={settings} ratio={width / height} video={video} quality={quality} />}
      {!count && <div className="carrete-frames-status" role="status">
        {error ? <><p>No se han podido cargar los fotogramas.</p><button className="minimal-basic-link carrete-text-button" onClick={() => setAttempt(value => value + 1)}>Reintentar</button></>
          : <><p>Cargando fotogramas…</p><progress max={100} value={progress} aria-label="Cargando fotogramas" /><span>{progress}%</span></>}
      </div>}
    </div>
    {count > 0 && <>
      <FrameEditor settings={settings} onChange={setSettings} />
      <FrameTimeline times={times!} selected={selected} playing={playing}
        onSelect={select} onToggle={togglePlayback} />
    </>}
    {playError && <p className="carrete-frames-play-error" role="status">No se pudo reproducir. Vuelve a pulsar el visor.</p>}
  </section>;
}
