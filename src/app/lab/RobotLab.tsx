import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { RobotEffects, RobotFace, SpeechLetters } from '../components/RobotVisuals';
import { robotPortalPose } from '../components/robotAnimation';
import {
  easings, expressions, makeStep, MAX_STEPS, movements, presets, readProject,
  sampleSequence, seconds, sequenceDuration, stepStart, type RobotProject, type RobotStep,
} from './robotLabModel';
import './robotLab.css';

function Slider({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void;
}) {
  const id = useId();
  return <div className="bot-lab-slider">
    <label htmlFor={id}>{label}<output htmlFor={id}>{Number(value.toFixed(1))}{unit}</output></label>
    <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
  </div>;
}

type StageProps = {
  steps: RobotStep[]; selected: number; loop: boolean;
  onLoop: (loop: boolean) => void; onSelect: (index: number) => void;
  onPosition: (x: number, y: number) => void; onActive: (index: number | null) => void;
};

function RobotStage({ steps, selected, loop, onLoop, onSelect, onPosition, onActive }: StageProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; dx: number; dy: number } | null>(null);
  const clock = useRef(0);
  const [size, setSize] = useState({ width: 640, height: 470 });
  const [mode, setMode] = useState<'edit' | 'playing' | 'paused' | 'finished'>('edit');
  const [elapsed, setElapsed] = useState(0);
  const [onlyStep, setOnlyStep] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [systemReduced, setSystemReduced] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [visible, setVisible] = useState(true);
  const reduced = reduce || systemReduced;
  const duration = sequenceDuration(steps);
  const start = onlyStep ? stepStart(steps, selected) : 0;
  const end = onlyStep ? start + steps[selected].duration + steps[selected].hold : duration;
  const step = steps[selected];
  const frame = mode === 'edit' ? {
    index: selected, step, local: Infinity, x: step.x, y: step.y, angle: step.angle, scale: step.scale,
    lift: 0, offsetX: 0, portal: false, portalOut: false, portalProgress: 1,
  } : sampleSequence(steps, Math.min(elapsed, end - .01), reduced);
  const padX = Math.min(100, size.width * .25);
  const plotWidth = size.width - padX * 2;
  const plotHeight = Math.max(90, size.height - 210);
  const point = (x: number, y: number) => ({ x: padX + plotWidth * x / 100, y: 140 + plotHeight * y / 100 });
  const location = point(frame.x, frame.y);
  const portal = frame.portal ? robotPortalPose(frame.portalProgress, frame.portalOut) : undefined;
  const speaking = Boolean(frame.step.text) && !frame.portal && frame.local >= frame.step.speechDelay;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    const intersection = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    resize.observe(canvas);
    intersection.observe(canvas);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setSystemReduced(media.matches);
    const hide = () => { if (document.hidden) setMode(current => current === 'playing' ? 'paused' : current); };
    updateMotion();
    media.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', hide);
    return () => { resize.disconnect(); intersection.disconnect(); media.removeEventListener('change', updateMotion); document.removeEventListener('visibilitychange', hide); };
  }, []);

  useEffect(() => { if (!visible) setMode(current => current === 'playing' ? 'paused' : current); }, [visible]);
  useEffect(() => {
    clock.current = 0;
    setElapsed(0);
    setMode('edit');
  }, [steps, selected]);
  useEffect(() => { onActive(mode === 'edit' ? null : frame.index); }, [mode, frame.index, onActive]);
  useEffect(() => {
    if (mode !== 'playing') return;
    let request = 0;
    let previous: number | null = null;
    const tick = (now: number) => {
      const delta = previous === null ? 0 : now - previous;
      previous = now;
      let next = clock.current + delta * speed;
      if (next >= end) {
        if (loop) next = start + (next - start) % (end - start);
        else {
          clock.current = end;
          setElapsed(end);
          setMode('finished');
          return;
        }
      }
      clock.current = next;
      setElapsed(next);
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [mode, speed, loop, start, end]);

  const play = (single = false) => {
    if (mode === 'paused' && single === onlyStep) { setMode('playing'); return; }
    const time = single ? stepStart(steps, selected) : 0;
    setOnlyStep(single);
    clock.current = time;
    setElapsed(time);
    setMode('playing');
  };
  const stop = () => { clock.current = 0; setElapsed(0); setMode('edit'); };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const grab = drag.current;
    const box = canvasRef.current?.getBoundingClientRect();
    if (!grab || grab.pointer !== event.pointerId || !box) return;
    const x = (event.clientX - box.left - grab.dx - padX) / plotWidth * 100;
    const y = (event.clientY - box.top - grab.dy - 140) / plotHeight * 100;
    onPosition(Math.round(Math.max(0, Math.min(100, x))), Math.round(Math.max(0, Math.min(100, y))));
  };

  return <section className="bot-lab-stage-panel" aria-label="Escenario de animación">
    <div className="bot-lab-stage-top"><span><i /> escenario</span><span>{mode === 'playing' ? `paso ${frame.index + 1} de ${steps.length}` : mode === 'paused' ? 'en pausa' : mode === 'finished' ? 'fin de la secuencia' : 'arrastra el bot para colocarlo'}</span></div>
    <div ref={canvasRef} className="bot-lab-canvas" data-reduced={reduced}>
      <div className="bot-lab-canvas-caption">pequeño robot, infinitas ideas.</div>
      <svg className="bot-lab-route" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
        <polyline points={steps.map(item => { const p = point(item.x, item.y); return `${p.x},${p.y}`; }).join(' ')} />
      </svg>
      {steps.map((item, index) => {
        const p = point(item.x, item.y);
        return <button key={item.id} type="button" className="bot-lab-waypoint" style={{ left: p.x, top: p.y }}
          aria-label={`Editar destino ${index + 1}: ${item.name}`} aria-pressed={selected === index} onClick={() => onSelect(index)}>{index + 1}</button>;
      })}
      <div className="minimal-footer-robot-gallery bot-lab-actor" data-expression={frame.step.expression}
        data-active={visible && mode !== 'paused' && !reduced} style={{ left: location.x + frame.offsetX, top: location.y + frame.lift }}>
        <div className="bot-lab-actor-size" style={{ transform: `rotate(${frame.angle}deg) scale(${frame.scale})` }}>
          <span className="minimal-robot-hole" style={{ top: frame.portalOut ? -6 : 19, opacity: frame.portal ? Math.sin(Math.PI * frame.portalProgress) * .7 : 0 }} aria-hidden="true" />
          <span className="minimal-robot-entrance" style={portal}>
            <button type="button" className="minimal-robot-option minimal-robot-button" aria-label="Colocar el bot. Usa las flechas para moverlo."
              onPointerDown={event => {
                if (event.button !== 0 || !event.isPrimary) return;
                if (mode !== 'edit') { stop(); return; }
                const box = canvasRef.current?.getBoundingClientRect();
                if (!box) return;
                event.preventDefault();
                event.currentTarget.focus({ preventScroll: true });
                drag.current = { pointer: event.pointerId, dx: event.clientX - box.left - location.x, dy: event.clientY - box.top - location.y };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={move}
              onPointerUp={() => { drag.current = null; }}
              onPointerCancel={() => { drag.current = null; }}
              onLostPointerCapture={() => { drag.current = null; }}
              onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.preventDefault(); stop();
                const amount = event.shiftKey ? 10 : 2;
                const x = step.x + (event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0);
                const y = step.y + (event.key === 'ArrowDown' ? amount : event.key === 'ArrowUp' ? -amount : 0);
                onPosition(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
              }}>
              <RobotFace /><RobotEffects mode={frame.step.expression} />
            </button>
          </span>
        </div>
      </div>
      {speaking && <div className="minimal-robot-speech bot-lab-speech" style={{
        left: Math.max(96, Math.min(location.x, size.width - 96)),
        bottom: size.height - Math.max(130, location.y + frame.lift - frame.scale * 11 - 14),
        '--robot-speech-tail': '50%',
      } as CSSProperties} aria-hidden="true">
        <SpeechLetters text={frame.step.text} letterDelay={frame.step.letterDelay} elapsed={reduced || mode === 'edit' ? Infinity : frame.local - frame.step.speechDelay} />
      </div>}
      <span className="bot-lab-origin" aria-hidden="true">x {Math.round(frame.x)} · y {Math.round(frame.y)}</span>
      <span className="bot-lab-canvas-scale">{frame.scale.toFixed(1)}×</span>
    </div>
    <span className="minimal-hidden-nav" role="status" aria-live="polite">{mode === 'playing' ? `Paso ${frame.index + 1}: ${frame.step.name}` : mode === 'paused' ? 'Animación en pausa.' : mode === 'finished' ? 'Secuencia terminada.' : ''}</span>
    <div className="bot-lab-transport">
      <div className="bot-lab-transport-actions">
        <button type="button" className="bot-lab-primary" onClick={() => mode === 'playing' ? setMode('paused') : play(onlyStep && mode === 'paused')}>
          <span aria-hidden="true">{mode === 'playing' ? 'Ⅱ' : '▶'}</span> {mode === 'playing' ? 'pausar' : mode === 'paused' ? 'continuar' : 'reproducir'}
        </button>
        <button type="button" onClick={stop} aria-label="Detener y volver a editar">■</button>
        <button type="button" onClick={() => play(true)}>este paso</button>
        <button type="button" aria-pressed={loop} onClick={() => onLoop(!loop)}>↻ bucle</button>
        <select aria-label="Velocidad de reproducción" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
          {[.5, 1, 1.5, 2].map(rate => <option key={rate} value={rate}>{rate}×</option>)}
        </select>
        <output className="bot-lab-clock">{seconds(elapsed)} / {seconds(duration)}</output>
      </div>
      <input className="bot-lab-scrubber" type="range" aria-label="Posición en la secuencia" min={0} max={duration} step={10} value={elapsed}
        onChange={event => { const time = Number(event.target.value); setOnlyStep(false); clock.current = time; setElapsed(time); setMode('paused'); }} />
      <label className="bot-lab-reduce"><input type="checkbox" checked={reduced} disabled={systemReduced} onChange={event => setReduce(event.target.checked)} /> movimiento reducido{systemReduced ? ' · activo en tu sistema' : ''}</label>
    </div>
  </section>;
}

export default function RobotLab() {
  const [project, setProject] = useState<RobotProject>(() => presets[0].create());
  const [selected, setSelected] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const step = project.steps[selected];
  const patch = useCallback((changes: Partial<RobotStep>) => {
    setProject(previous => ({ ...previous, steps: previous.steps.map((item, index) => index === selected ? { ...item, ...changes } : item) }));
  }, [selected]);
  const position = useCallback((x: number, y: number) => patch({ x, y }), [patch]);
  const changeLoop = useCallback((loop: boolean) => setProject(previous => ({ ...previous, loop })), []);
  const replace = (next: RobotProject) => { setProject(next); setSelected(0); setActive(null); setError(''); setNotice(''); };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'bot lab — Antonio J. Gonzalez';
    return () => { document.title = previousTitle; };
  }, []);

  const add = (duplicate = false) => {
    if (project.steps.length >= MAX_STEPS) return;
    const next = duplicate ? makeStep({ ...step, name: `${step.name} · copia`.slice(0, 40) })
      : makeStep({ x: step.x, y: step.y, scale: step.scale, name: `paso ${project.steps.length + 1}` });
    const steps = [...project.steps];
    steps.splice(selected + 1, 0, next);
    setProject({ ...project, steps }); setSelected(selected + 1);
  };
  const reorder = (direction: number) => {
    const destination = selected + direction;
    if (destination < 0 || destination >= project.steps.length) return;
    const steps = [...project.steps];
    [steps[selected], steps[destination]] = [steps[destination], steps[selected]];
    setProject({ ...project, steps }); setSelected(destination);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${project.name.replace(/[^a-z0-9áéíóúñ_-]/gi, '-').slice(0, 60) || 'bot-animation'}.json`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('animación exportada. puedes importarla aquí para seguir editando.'); setError('');
  };

  return <main className="bot-lab" tabIndex={-1}>
    <header className="bot-lab-header">
      <div><a className="bot-lab-back" href="/">← volver al índice</a><div className="bot-lab-title"><h1>bot lab<span>.</span></h1><span className="bot-lab-tag">playground</span></div>
        <p>un pequeño escenario para darle vida. crea un gesto, un paseo o una historia.</p></div>
      <div className="bot-lab-file-actions">
        <button type="button" onClick={() => fileRef.current?.click()}>↑ importar</button>
        <button type="button" onClick={download}>↓ exportar animación</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          try {
            if (file.size > 128_000) throw new Error('El archivo es demasiado grande para una secuencia del bot.');
            replace(readProject(await file.text())); setNotice('animación importada. lista para seguir jugando.');
          } catch (failure) { setError(failure instanceof SyntaxError ? 'No se puede leer ese archivo. Elige un .json exportado desde bot lab.' : failure instanceof Error ? failure.message : 'No se pudo importar ese archivo.'); }
        }} />
      </div>
    </header>
    {error && <p className="bot-lab-error" role="alert">{error}</p>}
    <p className="bot-lab-notice" role="status">{notice}</p>
    <div className="bot-lab-layout">
      <div className="bot-lab-workspace">
        <RobotStage steps={project.steps} selected={selected} loop={project.loop} onLoop={changeLoop} onSelect={setSelected} onPosition={position} onActive={setActive} />
        <section className="bot-lab-sequence" aria-labelledby="bot-sequence-heading">
          <div className="bot-lab-section-heading"><h2 id="bot-sequence-heading">la secuencia <span>{project.steps.length} / {MAX_STEPS}</span></h2>
            <button type="button" disabled={project.steps.length >= MAX_STEPS} onClick={() => add()}>+ añadir paso</button></div>
          <label className="bot-lab-project-name">nombre<input value={project.name} maxLength={80} onChange={event => setProject({ ...project, name: event.target.value })} /></label>
          <ol className="bot-lab-timeline">
            {project.steps.map((item, index) => <li key={item.id} data-playing={active === index}>
              <button type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}>
                <span className="bot-lab-step-number">{String(index + 1).padStart(2, '0')}<span>{seconds(item.duration + item.hold)}</span></span>
                <strong>{item.name || 'sin nombre'}</strong><small>{movements.find(option => option.value === item.movement)?.label} · {expressions.find(option => option.value === item.expression)?.label}</small>
              </button>
            </li>)}
          </ol>
          <p className="bot-lab-hint">cada paso se mueve a su destino y después espera. selecciona uno para editarlo.</p>
        </section>
        <section className="bot-lab-presets" aria-labelledby="bot-presets-heading"><h2 id="bot-presets-heading">un punto de partida</h2>
          <div>{presets.map((preset, index) => <button key={preset.name} type="button" onClick={() => replace(preset.create())}>
            <span className="bot-lab-preset-icon" aria-hidden="true">{['✳', '↗', '♫', 'z'][index]}</span><strong>{preset.name}</strong><small>{preset.description}</small>
          </button>)}</div>
          <p className="bot-lab-hint">los ejemplos sustituyen la secuencia. exporta la tuya para guardarla antes.</p>
        </section>
      </div>
      <aside className="bot-lab-inspector" aria-label={`Editar paso ${selected + 1}`}>
        <div className="bot-lab-inspector-heading"><span>paso {String(selected + 1).padStart(2, '0')}</span><div>
          <button type="button" disabled={selected === 0} onClick={() => reorder(-1)} aria-label="Mover paso antes">←</button>
          <button type="button" disabled={selected === project.steps.length - 1} onClick={() => reorder(1)} aria-label="Mover paso después">→</button>
        </div></div>
        <label className="bot-lab-field">nombre del paso<input value={step.name} maxLength={40} onChange={event => patch({ name: event.target.value })} /></label>
        <fieldset><legend>01 · expresión</legend><div className="bot-lab-expression-options">
          {expressions.map(option => <button key={option.value} type="button" aria-pressed={step.expression === option.value} onClick={() => patch({ expression: option.value })}>
            <span className="minimal-footer-robot-gallery" data-expression={option.value} data-active="false" aria-hidden="true"><span className="minimal-robot-option"><RobotFace /></span></span>{option.label}
          </button>)}
        </div></fieldset>
        <fieldset><legend>02 · movimiento</legend>
          <div className="bot-lab-two-fields"><label className="bot-lab-field">cómo se mueve<select value={step.movement} onChange={event => patch({ movement: event.target.value as RobotStep['movement'] })}>{movements.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="bot-lab-field">ritmo<select value={step.easing} onChange={event => patch({ easing: event.target.value as RobotStep['easing'] })}>{easings.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
          <Slider label="duración" value={step.duration} min={100} max={4000} step={50} unit=" ms" onChange={duration => patch({ duration })} />
          <Slider label="espera al llegar" value={step.hold} min={0} max={5000} step={100} unit=" ms" onChange={hold => patch({ hold })} />
          {(step.movement === 'hop' || step.movement === 'shake') && <Slider label="intensidad" value={step.intensity} min={0} max={80} unit=" px" onChange={intensity => patch({ intensity })} />}
        </fieldset>
        <fieldset><legend>03 · destino y postura</legend>
          <div className="bot-lab-two-fields"><Slider label="horizontal" value={step.x} min={0} max={100} unit="%" onChange={x => patch({ x })} /><Slider label="vertical" value={step.y} min={0} max={100} unit="%" onChange={y => patch({ y })} /></div>
          <Slider label="inclinación" value={step.angle} min={-180} max={180} unit="°" onChange={angle => patch({ angle })} />
          <Slider label="tamaño" value={step.scale} min={1} max={5} step={.1} unit="×" onChange={scale => patch({ scale })} />
          <p className="bot-lab-hint">1× es el tamaño del pie de página. también puedes arrastrarlo o usar las flechas.</p>
        </fieldset>
        <fieldset><legend>04 · qué dice</legend>
          <label className="bot-lab-field">bocadillo<textarea value={step.text} maxLength={120} rows={2} placeholder="algo pequeño que decir…" onChange={event => patch({ text: event.target.value.toLocaleLowerCase() })} /></label>
          <Slider label="espera antes de hablar" value={step.speechDelay} min={0} max={2000} step={20} unit=" ms" onChange={speechDelay => patch({ speechDelay })} />
          <Slider label="tiempo entre letras" value={step.letterDelay} min={10} max={80} step={2} unit=" ms" onChange={letterDelay => patch({ letterDelay })} />
          <p className="bot-lab-hint">deja el texto vacío para un gesto en silencio.</p>
        </fieldset>
        <div className="bot-lab-step-actions"><button type="button" disabled={project.steps.length >= MAX_STEPS} onClick={() => add(true)}>duplicar paso</button>
          <button type="button" className="bot-lab-delete" disabled={project.steps.length === 1} onClick={() => {
            const steps = project.steps.filter((_, index) => index !== selected);
            setProject({ ...project, steps }); setSelected(Math.min(selected, steps.length - 1));
          }}>eliminar</button></div>
      </aside>
    </div>
    <footer className="bot-lab-footer"><span>hecho para jugar un rato.</span><span>exporta tu archivo para continuar luego · <a href="/">volver a casa ↗</a></span></footer>
  </main>;
}
