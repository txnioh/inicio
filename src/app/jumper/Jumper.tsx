import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Playground } from './playground';
import { initialStats, motions, skins, type SkinId } from './settings';
import SkateHud, { SkateFinish, SkateStart } from './SkateHud';
import type { BoardKind, Look } from './skate';
import './jumper.css';

function Icon({ name }: { name: 'play' | 'pause' | 'reset' | 'jump' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'play' ? <path d="m9 5 11 7-11 7Z" /> : null}
    {name === 'pause' ? <path d="M8 5v14M16 5v14" /> : null}
    {name === 'reset' ? <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /> : null}
    {name === 'jump' ? <path d="M12 20V4m-6 6 6-6 6 6" /> : null}
  </svg>;
}

export default function Jumper({ variant = 'jumper' }: { variant?: 'jumper' | 'eva' | 'skate' }) {
  const modelName = variant === 'eva' ? 'EVA-01' : 'Jumper';
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Playground | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [stats, setStats] = useState(initialStats);
  const [settings, setSettings] = useState(false);
  const [skin, setSkin] = useState<SkinId>('original');
  const [grid, setGrid] = useState(false);
  const [collision, setCollision] = useState(false);
  const [board, setBoard] = useState<BoardKind>('skate');
  const [look, setLook] = useState<Look>('scenic');

  useEffect(() => {
    const title = document.title;
    document.title = variant === 'eva' ? 'EVA-01' : variant === 'skate' ? 'Jumper · Skate' : 'Jumper';
    let active = true;
    let playground: Playground | undefined;
    setReady(false); setProgress(0); setStage(''); setStats(initialStats);
    try {
      playground = new Playground(host.current!, value => {
        if (!active) return;
        setStats(value);
        if (host.current) {
          host.current.dataset.position = JSON.stringify([value.x, value.y, value.height]);
          host.current.dataset.grounded = String(value.grounded);
          host.current.dataset.mode = value.controllerMode;
          host.current.dataset.policy = String(value.policyRunning);
          host.current.dataset.time = String(value.time);
          host.current.dataset.parity = JSON.stringify(value.parity);
        }
      }, message => { if (active) setError(message); }, variant === 'skate' ? board : false, look);
      engine.current = playground;
      void playground.load((value, label) => { if (active) { setProgress(value); if (label) setStage(label); } }).then(() => {
        if (!active) return;
        if (variant === 'eva') playground!.setEva();
        playground!.setPlaying(!matchMedia('(prefers-reduced-motion: reduce)').matches);
        setReady(true);
      }).catch(error => {
        if (active) { setError(error instanceof Error ? error.message : 'No se pudo cargar.'); playground?.dispose(); }
      });
    } catch (error) { setError(error instanceof Error ? error.message : 'WebGL no está disponible.'); }
    return () => { active = false; playground?.dispose(); engine.current = null; document.title = title; };
  }, [variant, board, look]);

  useEffect(() => {
    function clear() { engine.current?.release(); }
    function key(event: KeyboardEvent) {
      if (!ready) return;
      // Always pass releases, even if focus moved to a control mid-press.
      if (event.type === 'keyup') { engine.current?.key(event.code, false, event.repeat); return; }
      if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable]')) return;
      if (event.code === 'Space' && event.target instanceof Element && event.target.closest('button, a')) return;
      if (event.code === 'KeyR' && !event.repeat) { engine.current?.reset(); setError(''); }
      else if (variant === 'skate' && event.code === 'Enter' && !event.repeat && !(event.target instanceof Element && event.target.closest('button, a'))) { engine.current?.releaseBoard(); event.preventDefault(); }
      else if (variant === 'skate' && event.code === 'KeyP' && !event.repeat) engine.current?.togglePilot();
      else if (event.code === 'Escape') { setSettings(false); clear(); }
      else if (engine.current?.key(event.code, true, event.repeat)) event.preventDefault();
    }
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => { clear(); window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear); };
  }, [ready, variant]);

  function joystick(event: PointerEvent<HTMLDivElement>) {
    if (!ready) return;
    if (event.type === 'pointerdown') event.currentTarget.setPointerCapture(event.pointerId);
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    let x = (event.clientX - bounds.left - bounds.width / 2) / 26;
    let y = (event.clientY - bounds.top - bounds.height / 2) / 26;
    const length = Math.max(1, Math.hypot(x, y));
    x /= length; y /= length;
    (event.currentTarget.firstElementChild as HTMLElement).style.transform = `translate(${x * 22}px, ${y * 22}px)`;
    engine.current?.pad(x, y);
  }
  function releaseJoystick(event: PointerEvent<HTMLDivElement>) {
    (event.currentTarget.firstElementChild as HTMLElement).style.transform = '';
    engine.current?.pad(0, 0);
  }

  return <main className={`minimal-portfolio-page jumper-page${variant === 'skate' ? ' jumper-skate' : ''}`} tabIndex={-1}>
    <div className="jumper-canvas" ref={host} tabIndex={0} aria-label={`Playground de ${modelName}. WASD: caminar. J/L: girar. Espacio: salto. R: reiniciar.`} onPointerDown={() => host.current?.focus({ preventScroll: true })} />
    <header className="jumper-header"><div><a className="minimal-basic-link" href="/">Index</a><nav className="jumper-models" aria-label="Modelo">{variant === 'jumper' ? <h1>Jumper</h1> : <a href="/jumper">Jumper</a>}<span aria-hidden="true">/</span>{variant === 'eva' ? <h1>EVA-01</h1> : <a href="/jumper/eva">EVA-01</a>}<span aria-hidden="true">/</span>{variant === 'skate' ? <h1>Skate</h1> : <a href="/jumper/skate">Skate</a>}</nav></div><button aria-expanded={settings} aria-controls="jumper-settings" onClick={() => setSettings(value => !value)}>Ajustes</button></header>
    {!ready ? <div className="jumper-loading" role="status">{error ? <><p>{error}</p><button onClick={() => location.reload()}>Reintentar</button></> : <>
      <span className="jumper-loading-label">{stage || 'Cargando'}</span>
      <span className="jumper-loading-bar" aria-hidden="true"><i style={{ transform: `scaleX(${progress / 100})` }} /></span>
      <span className="jumper-loading-value">{progress}%</span>
    </>}</div> : null}
    {ready && error ? <p className="jumper-error jumper-runtime-error" role="alert">{error}</p> : null}
    {settings ? <section className="jumper-settings" id="jumper-settings" aria-label="Ajustes">
      <label className="jumper-setting">Acción<select aria-label="Acción" value={stats.controllerMode} disabled={!ready || !stats.playing} onChange={event => engine.current?.action(event.target.value)}>{motions.map(motion => <option key={motion.id} value={motion.id} disabled={!engine.current?.canAction(motion.id)}>{motion.name}</option>)}{stats.controllerMode === 'safe' ? <option value="safe">Detenido</option> : null}</select></label>
      {variant === 'jumper' ? <div className="jumper-setting"><span>Color</span><div className="jumper-colors">{skins.map(item => <button key={item.id} style={{ background: item.shell }} title={item.name} aria-label={item.name} aria-pressed={skin === item.id} disabled={!ready} onClick={() => { setSkin(item.id); engine.current?.setSkin(item.id); }} />)}</div></div> : null}
      <label className="jumper-setting">Cuadrícula<input type="checkbox" checked={grid} onChange={event => { setGrid(event.target.checked); engine.current?.setGrid(event.target.checked); }} /></label>
      <label className="jumper-setting">Colisiones<input type="checkbox" checked={collision} onChange={event => { setCollision(event.target.checked); engine.current?.setCollision(event.target.checked); }} /></label>
      <div className="jumper-setting"><span>Cámara</span><div className="jumper-views"><button onClick={() => engine.current?.cameraView('iso')}>3D</button><button onClick={() => engine.current?.cameraView('front')}>Frente</button><button onClick={() => engine.current?.cameraView('top')}>Planta</button></div></div>
      <div className="jumper-measurements"><span>{(stats.height * 100).toFixed(1)} cm</span><span>{stats.simRate.toFixed(2)}×</span><span>{stats.contacts} contactos</span></div>
      <p className="jumper-provenance">{variant === 'eva' ? <>EVA-01 · apariencia sobre Jumper<br /></> : null}Políticas originales · MuJoCo<br />Simulación sin calibración en hardware</p>
      <div className="jumper-links"><a href="https://github.com/KingKongRobotics/jumper" target="_blank" rel="noreferrer">Repo ↗</a><a href="https://beunlimited.me/en/simulator" target="_blank" rel="noreferrer">Simulador ↗</a></div>
    </section> : null}
    <footer className="jumper-controls"><div className="jumper-actions"><button aria-label={stats.playing ? 'Pausar' : 'Reproducir'} title={stats.playing ? 'Pausar' : 'Reproducir'} disabled={!ready} onClick={() => engine.current?.setPlaying(!stats.playing)}><Icon name={stats.playing ? 'pause' : 'play'} /></button><button aria-label="Reiniciar" title="Reiniciar" disabled={!ready} onClick={() => { setError(''); engine.current?.reset(); }}><Icon name="reset" /></button></div>
      <span className="jumper-hint">{variant === 'skate' ? 'Enter soltar · ←/→ girar · W/S peso · P piloto · R reiniciar' : 'WASD · J/L · Espacio'}</span>
      <span className="jumper-mode">{ready && !stats.policyRunning ? stats.controllerMode === 'safe' ? 'Detenido' : 'Preparando' : stats.controllerMode === 'locomotion' ? '' : motions.find(item => item.id === stats.controllerMode)?.name}</span>
    </footer>
    {variant === 'skate' && ready && stats.skate ? <SkateHud stats={stats.skate} /> : null}
    {variant === 'skate' && ready && stats.skate && !stats.skate.released ? <SkateStart stats={stats.skate} board={board} onBoard={setBoard} look={look} onLook={setLook} onStart={() => engine.current?.releaseBoard()} onPilot={() => engine.current?.togglePilot()} /> : null}
    {variant === 'skate' && ready && stats.skate?.finished ? <SkateFinish stats={stats.skate} onAgain={() => engine.current?.reset()} /> : null}
    {ready ? <div className="jumper-touch"><div className="jumper-joystick" aria-label={`Mover a ${modelName}`} onPointerDown={joystick} onPointerMove={joystick} onPointerUp={releaseJoystick} onPointerCancel={releaseJoystick} onLostPointerCapture={releaseJoystick}><span /></div>{variant === 'skate' ? null : <button aria-label="Saltar" title="Saltar" onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engine.current?.padButton('A', true); }} onPointerUp={() => engine.current?.padButton('A', false)} onPointerCancel={() => engine.current?.padButton('A', false)} onLostPointerCapture={() => engine.current?.padButton('A', false)} onClick={event => { if (event.detail === 0) engine.current?.action('jump'); }}><Icon name="jump" /></button>}</div> : null}
  </main>;
}
