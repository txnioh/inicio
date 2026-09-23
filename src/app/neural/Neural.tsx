import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { createRenderer, type TrainingRecording } from './render';
import { createAudioPlayer, diffusionSoundtrack, renderSoundtrack } from './sound';
import { createDiffusionRenderer, DIFFUSION_SECONDS } from './diffusion';
import { digitPixels, makeInputTile, type InputSource, type Shape } from './inputs';
import { evaluateInput, type NeuralModel } from './model';
import './neural.css';

const EMPTY = Array<number>(784).fill(0);
const SHAPES: Record<Shape, string> = { circle: 'Círculo', square: 'Cuadrado', triangle: 'Triángulo', star: 'Estrella', heart: 'Corazón' };

export default function Neural() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLElement>(null);
  const clock = useRef(.7);
  const playing = useRef(false);
  const draw = useRef<((time: number) => void) | null>(null);
  const sound = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const stroke = useRef<{ x: number; y: number } | null>(null);
  const playRequest = useRef(0);
  const uploadRequest = useRef(0);
  const [scene, setScene] = useState<'neural' | 'diffusion'>('neural');
  const [source, setSource] = useState<InputSource>('mnist');
  const [sample, setSample] = useState(0);
  const [shape, setShape] = useState<Shape>('circle');
  const [text, setText] = useState('hola');
  const [color, setColor] = useState('#fff5ee');
  const [target, setTarget] = useState(1);
  const [invert, setInvert] = useState(false);
  const [eraser, setEraser] = useState(false);
  const [drawing, setDrawing] = useState(EMPTY);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [fileName, setFileName] = useState('');
  const [paused, setPaused] = useState(true);
  const [recording, setRecording] = useState<TrainingRecording | null>(null);
  const [model, setModel] = useState<NeuralModel | null>(null);
  const [error, setError] = useState('');
  const [inputError, setInputError] = useState('');
  const [retry, setRetry] = useState(0);
  const [loadingImage, setLoadingImage] = useState(false);
  const example = recording?.traces[sample];
  const pixels = example?.pixels ?? EMPTY;
  const tile = useMemo(() => makeInputTile(source, { color, shape, text, image: bitmap, drawing, pixels }),
    [source, color, shape, text, bitmap, drawing, pixels]);
  const trace = useMemo(() => {
    if (!recording || !model) return null;
    if (source === 'mnist' && example?.label === target) return example;
    const input = source === 'draw' ? drawing : source === 'mnist' ? pixels : digitPixels(tile, invert);
    return evaluateInput(model, input, target);
  }, [recording, model, source, example, target, drawing, pixels, tile, invert]);
  const selectedRecording = useMemo(() => recording && trace ? { ...recording, traces: [trace] } : null, [recording, trace]);
  const caption = source === 'rabbit' ? 'a white rabbit on grass' : source === 'shape' ? SHAPES[shape]
    : source === 'text' ? text.replace(/\n/g, ' ') : source === 'image' ? fileName || 'tu imagen' : source === 'draw' ? 'tu dibujo' : `digit ${example?.label ?? 1}`;
  const duration = scene === 'neural' ? 8 : DIFFUSION_SECONDS;
  const ready = Boolean(selectedRecording && model);

  useEffect(() => {
    const controller = new AbortController();
    const oldTitle = document.title;
    document.title = 'Neural — Pixel playground';
    setError('');
    Promise.all(['/neural/training.json', '/neural/model.json'].map(async url => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('No se ha podido cargar la red. Pulsa play para reintentar.');
      return response.json();
    })).then(([data, weights]) => {
      if (controller.signal.aborted) return;
      if (!data.traces?.length || weights.architecture?.join(',') !== '784,16,16,10') throw new Error('Los datos de la red no son válidos.');
      setRecording(data); setModel(weights);
      root.current?.focus({ preventScroll: true });
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se ha podido cargar la red.'); });
    return () => { controller.abort(); document.title = oldTitle; };
  }, [retry]);

  useEffect(() => {
    const ctx = preview.current?.getContext('2d');
    if (ctx) { ctx.imageSmoothingEnabled = false; ctx.drawImage(tile, 0, 0, 64, 64); }
  }, [tile]);

  useEffect(() => {
    if (!canvas.current || !selectedRecording) return;
    ++playRequest.current;
    playing.current = false; setPaused(true);
    sound.current?.dispose(); sound.current = null;
    clock.current = .7;
    draw.current = scene === 'neural' ? createRenderer(canvas.current, selectedRecording)
      : createDiffusionRenderer(canvas.current, tile, caption);
    draw.current(clock.current);
    return () => { draw.current = null; };
  }, [scene, selectedRecording, tile, caption]);

  useEffect(() => {
    if (!ready || paused) return;
    let request = 0, previous = 0;
    const frame = (now: number) => {
      if (!playing.current || document.hidden) return;
      if (previous) clock.current = sound.current?.position() ?? (clock.current + Math.min((now - previous) / 1000, .1)) % duration;
      previous = now;
      draw.current?.(clock.current);
      request = requestAnimationFrame(frame);
    };
    const visibility = () => {
      cancelAnimationFrame(request); previous = 0;
      sound.current?.stop();
      if (!document.hidden && playing.current) {
        sound.current?.start(clock.current, 1);
        request = requestAnimationFrame(frame);
      }
    };
    request = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(request); document.removeEventListener('visibilitychange', visibility); };
  }, [paused, ready, duration]);

  useEffect(() => () => { ++playRequest.current; ++uploadRequest.current; sound.current?.dispose(); }, []);
  useEffect(() => () => bitmap?.close(), [bitmap]);

  async function togglePlayback() {
    if (error) { setRetry(value => value + 1); return; }
    if (!selectedRecording) return;
    const request = ++playRequest.current;
    if (playing.current) {
      clock.current = sound.current?.position() ?? clock.current;
      sound.current?.stop(); playing.current = false; setPaused(true);
      return;
    }
    try {
      sound.current ??= createAudioPlayer(scene === 'neural' ? renderSoundtrack(selectedRecording) : diffusionSoundtrack(caption));
      await sound.current.resume();
      if (request !== playRequest.current) return;
      sound.current.start(clock.current, 1);
    } catch {
      if (request !== playRequest.current) return;
      setInputError('El sonido no está disponible en este navegador. La animación puede reproducirse.');
    }
    playing.current = true; setPaused(false);
  }

  function drawStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (source !== 'draw' || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: ((event.clientX - bounds.left) / bounds.width * 64 - 4) / 2, y: ((event.clientY - bounds.top) / bounds.height * 64 - 4) / 2 };
    const from = stroke.current ?? point;
    stroke.current = point;
    const distance = Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) * 2));
    setDrawing(previous => {
      const next = [...previous];
      for (let step = 0; step <= distance; step++) {
        const x = from.x + (point.x - from.x) * step / distance, y = from.y + (point.y - from.y) * step / distance;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const ix = Math.floor(x) + dx, iy = Math.floor(y) + dy;
          if (ix < 0 || iy < 0 || ix >= 28 || iy >= 28) continue;
          const amount = Math.max(0, Math.min(1, (1.65 - Math.hypot(ix + .5 - x, iy + .5 - y)) * 1.8));
          next[iy * 28 + ix] = eraser ? next[iy * 28 + ix] * (1 - amount) : Math.max(next[iy * 28 + ix], Math.round(amount * 255));
        }
      }
      return next;
    });
  }

  return (
    <main className="neural-page" ref={root} tabIndex={-1} onKeyDown={event => {
      if ((event.target as HTMLElement).closest('button, input, select, textarea, canvas')) return;
      if (event.code === 'Space') { event.preventDefault(); void togglePlayback(); }
    }}>
      <h1 className="neural-sr-only">Laboratorio de redes neuronales en pixel art</h1>
      <div className="neural-stage">
        <canvas className="neural-canvas" ref={canvas} width="960" height="540" role="img"
          aria-label={scene === 'neural' ? 'Red neuronal que reconoce la entrada seleccionada, con propagación azul y gradientes rosas.' : 'Reconstrucción de la entrada desde ruido, en diez pasos, con una red neuronal en pixel art.'} />
        {!ready && <p className="neural-loading" role={error ? 'alert' : 'status'}>{error || 'Cargando la red…'}</p>}
      </div>
      <section className="neural-workbench" aria-label="Entrada manual">
        <button className="neural-play" onClick={() => void togglePlayback()} disabled={!ready && !error}
          aria-label={paused ? 'Reproducir' : 'Pausar'} title={paused ? 'Reproducir con sonido' : 'Pausar'}>
          {paused ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2 13 8 4 14Z" /></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h3v10H4zm5 0h3v10H9z" /></svg>}
        </button>
        <div className="neural-fields">
          <label>Escena<select value={scene} onChange={event => {
            const next = event.target.value as 'neural' | 'diffusion'; setScene(next);
            if (next === 'diffusion' && source === 'mnist') setSource('rabbit');
            if (next === 'neural' && source === 'rabbit') setSource('mnist');
          }}><option value="neural">Red neuronal</option><option value="diffusion">Difusión</option></select></label>
          <label>Entrada<select value={source} onChange={event => { setSource(event.target.value as InputSource); setInputError(''); }}>
            {scene === 'neural' && <option value="mnist">Dígitos de referencia</option>}
            {scene === 'diffusion' && <option value="rabbit">Conejo de referencia</option>}
            <option value="draw">Dibujar</option><option value="shape">Forma</option><option value="text">Texto</option><option value="image">Imagen local</option>
          </select></label>
          {source === 'mnist' && <label>Ejemplo<select value={sample} onChange={event => {
            const next = Number(event.target.value); setSample(next); setTarget(recording?.traces[next].label ?? 1);
          }}>{recording?.traces.map((item, i) => <option key={item.sampleIndex} value={i}>{item.label} · ejemplo {i + 1}</option>)}</select></label>}
          {source === 'shape' && <label>Forma<select value={shape} onChange={event => setShape(event.target.value as Shape)}>
            {Object.entries(SHAPES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select></label>}
          {source === 'text' && <label className="neural-text-field">Texto en la imagen<input aria-label="Texto en la imagen" value={text} maxLength={40} placeholder="Escribe algo" onChange={event => setText(event.target.value)} /></label>}
          {source === 'image' && <label className="neural-file-field"><span title={fileName}>{fileName || 'Imagen'}</span><input type="file" accept="image/*" aria-label="Cargar imagen local" onChange={async event => {
            const file = event.target.files?.[0]; if (!file) return;
            event.target.value = ''; const request = ++uploadRequest.current;
            if (file.size > 20 * 1024 * 1024) { setLoadingImage(false); setInputError('Elige una imagen de menos de 20 MB.'); return; }
            setLoadingImage(true); setInputError('');
            try {
              const image = await createImageBitmap(file);
              if (request !== uploadRequest.current) { image.close(); return; }
              setBitmap(image); setFileName(file.name);
            } catch { if (request === uploadRequest.current) setInputError('No se ha podido abrir esa imagen. Prueba con PNG, JPG o WebP.'); }
            finally { if (request === uploadRequest.current) setLoadingImage(false); }
          }} /></label>}
          {(source === 'shape' || source === 'text' || source === 'draw') && <label className="neural-color-field">Color<input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>}
          {scene === 'neural' && source !== 'mnist' && <label className="neural-target-field">Objetivo<select value={target} onChange={event => setTarget(Number(event.target.value))}>
            {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i}</option>)}
          </select></label>}
          {source === 'draw' && <label className="neural-check"><input type="checkbox" checked={eraser} onChange={event => setEraser(event.target.checked)} />Borrador</label>}
          {source === 'image' && scene === 'neural' && <label className="neural-check"><input type="checkbox" checked={invert} onChange={event => setInvert(event.target.checked)} />Invertir</label>}
        </div>
        <canvas className={`neural-input-preview${source === 'draw' ? ' is-drawing' : ''}`} ref={preview} width="64" height="64"
          role="img" aria-label={source === 'draw' ? 'Dibuja tu entrada. Doble clic o Suprimir para limpiar.' : 'Vista previa de la entrada'} tabIndex={source === 'draw' ? 0 : undefined}
          onPointerDown={event => { if (source !== 'draw') return; event.currentTarget.setPointerCapture(event.pointerId); stroke.current = null; drawStroke(event); }}
          onPointerMove={drawStroke} onPointerUp={() => { stroke.current = null; }} onPointerCancel={() => { stroke.current = null; }}
          onDoubleClick={() => { if (source === 'draw') setDrawing([...EMPTY]); }}
          onKeyDown={event => { if (source === 'draw' && ['Backspace', 'Delete'].includes(event.key)) { event.preventDefault(); setDrawing([...EMPTY]); } }} />
        <p className="neural-input-note" role="status">{inputError || (loadingImage ? 'Leyendo imagen…' : source === 'draw' ? 'Dibuja en el recuadro · doble clic para limpiar.'
          : scene === 'neural' ? `La red reconoce dígitos 0–9.${trace ? ` Predicción: ${trace.prediction}.` : ''}`
          : 'Reconstrucción visual de tu entrada desde ruido.')}</p>
      </section>
    </main>
  );
}
