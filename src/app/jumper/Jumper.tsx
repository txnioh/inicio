import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Playground } from './playground';
import { initialStats, motions, skins, type SkinId } from './settings';
import { langs, storeLang, storedLang, strings, type Lang } from './i18n';
import SkateHud, { SkateFinish, skateMaps } from './SkateHud';
import './jumper.css';

function Icon({ name }: { name: 'play' | 'pause' | 'reset' | 'jump' | 'maps' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'play' ? <path d="m9 5 11 7-11 7Z" /> : null}
    {name === 'pause' ? <path d="M8 5v14M16 5v14" /> : null}
    {name === 'reset' ? <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /> : null}
    {name === 'jump' ? <path d="M12 20V4m-6 6 6-6 6 6" /> : null}
    {name === 'maps' ? <path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" /> : null}
  </svg>;
}

function storedSkin(): SkinId {
  try { const value = localStorage.getItem('jumper-skin'); if (skins.some(item => item.id === value)) return value as SkinId; } catch { /* private mode */ }
  return 'original';
}
/** Ride a run: the skate page, with its map in the address. */
function enter(map: string) { location.href = `/jumper/skate?map=${map}`; }

export default function Jumper({ variant = 'jumper', initialSkin }: { variant?: 'jumper' | 'skate'; initialSkin?: SkinId }) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Playground | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<'robot' | 'run' | ''>('');
  const [lang, setLang] = useState<Lang>(storedLang);
  const t = strings[lang];
  const [error, setError] = useState('');
  const [stats, setStats] = useState(initialStats);
  const [settings, setSettings] = useState(false);
  // The skin follows Jumper into the runs (stored per browser).
  const [skin, setSkin] = useState<SkinId>(() => initialSkin ?? storedSkin());
  const [grid, setGrid] = useState(false);
  const [collision, setCollision] = useState(false);
  // The run comes from the address (?map=calle|costa|minimal), set by the playground's signs
  // (?mapa= is the older spelling).
  const [run] = useState(() => { const query = new URLSearchParams(location.search); return skateMaps.find(item => item.id === (query.get('map') ?? query.get('mapa'))); });
  const portal = useRef<string | undefined>(undefined);
  portal.current = stats.portal;
  useEffect(() => { if (variant === 'skate' && !run) location.replace('/jumper'); }, [variant, run]);
  useEffect(() => { try { localStorage.setItem('jumper-skin', skin); } catch { /* private mode */ } }, [skin]);
  useEffect(() => { storeLang(lang); document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'; engine.current?.setLang(lang); }, [lang]);
  const runName = run ? t.maps[run.id][0] : 'Skate';
  useEffect(() => { document.title = variant === 'skate' ? `Jumper · ${runName}` : 'Jumper'; }, [variant, runName]);

  useEffect(() => {
    const title = document.title;
    let active = true;
    let playground: Playground | undefined;
    setReady(false); setProgress(0); setStage(''); setStats(initialStats);
    if (variant === 'skate' && !run) return () => { document.title = title; };
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
      }, message => { if (active) setError(message); }, variant === 'skate' && run ? run.board : false, run?.look, lang);
      engine.current = playground;
      void playground.load((value, label) => { if (active) { setProgress(value); if (label) setStage(label); } }).then(() => {
        if (!active) return;
        if (skin !== 'original') playground!.setSkin(skin);
        playground!.setPlaying(!matchMedia('(prefers-reduced-motion: reduce)').matches);
        setReady(true);
      }).catch(error => {
        if (active) { setError(error instanceof Error ? error.message : strings[lang].loadFailed); playground?.dispose(); }
      });
    } catch (error) { setError(error instanceof Error ? error.message : strings[lang].noWebgl); }
    return () => { active = false; playground?.dispose(); engine.current = null; document.title = title; };
  }, [variant, run]);

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
      else if (variant === 'jumper' && event.code === 'Enter' && !event.repeat && portal.current) { event.preventDefault(); enter(portal.current); }
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
    <div className="jumper-canvas" ref={host} tabIndex={0} aria-label={t.canvas} onPointerDown={() => host.current?.focus({ preventScroll: true })} />
    <header className="jumper-header"><div><a className="minimal-basic-link" href="/">Index</a><nav className="jumper-models" aria-label={t.section}>{variant === 'jumper' ? <h1>Jumper</h1> : <><a href="/jumper">Jumper</a><span aria-hidden="true">/</span><h1>{runName}</h1></>}</nav></div><button aria-expanded={settings} aria-controls="jumper-settings" onClick={() => setSettings(value => !value)}>{t.settings}</button></header>
    {!ready ? <div className="jumper-loading" role="status">{error ? <><p>{error}</p><button onClick={() => location.reload()}>{t.retry}</button></> : <>
      <span className="jumper-loading-label">{stage === 'robot' ? t.loadingRobot : stage === 'run' ? t.loadingRun : t.loading}</span>
      <span className="jumper-loading-bar" aria-hidden="true"><i style={{ transform: `scaleX(${progress / 100})` }} /></span>
      <span className="jumper-loading-value">{progress}%</span>
    </>}</div> : null}
    {ready && error ? <p className="jumper-error jumper-runtime-error" role="alert">{error}</p> : null}
    {settings ? <section className="jumper-settings" id="jumper-settings" aria-label={t.settings}>
      <label className="jumper-setting">{t.action}<select aria-label={t.action} value={stats.controllerMode} disabled={!ready || !stats.playing} onChange={event => engine.current?.action(event.target.value)}>{motions.map(motion => <option key={motion.id} value={motion.id} disabled={!engine.current?.canAction(motion.id)}>{t.motions[motion.id]}</option>)}{stats.controllerMode === 'safe' ? <option value="safe">{t.stopped}</option> : null}</select></label>
      {<div className="jumper-setting"><span>{t.colour}</span><div className="jumper-colors">{skins.map(item => <button key={item.id} style={{ background: item.shell }} title={t.skins[item.id]} aria-label={t.skins[item.id]} aria-pressed={skin === item.id} disabled={!ready} onClick={() => { setSkin(item.id); engine.current?.setSkin(item.id); }} />)}</div></div>}
      <label className="jumper-setting">{t.grid}<input type="checkbox" checked={grid} onChange={event => { setGrid(event.target.checked); engine.current?.setGrid(event.target.checked); }} /></label>
      <label className="jumper-setting">{t.collisions}<input type="checkbox" checked={collision} onChange={event => { setCollision(event.target.checked); engine.current?.setCollision(event.target.checked); }} /></label>
      <div className="jumper-setting"><span>{t.camera}</span><div className="jumper-views"><button onClick={() => engine.current?.cameraView('iso')}>3D</button><button onClick={() => engine.current?.cameraView('front')}>{t.front}</button><button onClick={() => engine.current?.cameraView('top')}>{t.top}</button></div></div>
      <div className="jumper-measurements"><span>{(stats.height * 100).toFixed(1)} cm</span><span>{stats.simRate.toFixed(2)}×</span><span>{stats.contacts} {t.contacts}</span></div>
      <p className="jumper-provenance">{skin === 'eva' ? <>{t.evaSkin}<br /></> : null}{t.provenance[0]}<br />{t.provenance[1]}</p>
      <div className="jumper-setting"><span>{t.language}</span><div className="jumper-views">{langs.map(item => <button key={item.id} lang={item.id === 'zh' ? 'zh-CN' : 'en'} aria-pressed={lang === item.id} onClick={() => setLang(item.id)}>{item.name}</button>)}</div></div>
      <div className="jumper-links"><a href="https://github.com/KingKongRobotics/jumper" target="_blank" rel="noreferrer">Repo ↗</a><a href="https://beunlimited.me/en/simulator" target="_blank" rel="noreferrer">{t.simulator} ↗</a></div>
    </section> : null}
    <footer className="jumper-controls"><div className="jumper-actions">
      {variant === 'jumper' && stats.portal ? <button className="skate-pill skate-pill-primary" onClick={() => enter(stats.portal!)}>{t.maps[stats.portal as keyof typeof t.maps]?.[0]} <kbd>Enter</kbd></button> : null}
      {variant === 'skate' && ready && stats.skate && !stats.skate.released ? <>
        <button className="skate-pill skate-pill-primary" onClick={() => engine.current?.releaseBoard()}>{t.start} <kbd>Enter</kbd></button>
        <button className="skate-pill" aria-pressed={stats.skate.pilot} onClick={() => engine.current?.togglePilot()}>{stats.skate.pilot ? t.pilotOn : t.pilot} <kbd>P</kbd></button>
      </> : null}
      <button aria-label={stats.playing ? t.pause : t.play} title={stats.playing ? t.pause : t.play} disabled={!ready} onClick={() => engine.current?.setPlaying(!stats.playing)}><Icon name={stats.playing ? 'pause' : 'play'} /></button><button aria-label={t.reset} title={t.reset} disabled={!ready} onClick={() => { setError(''); engine.current?.reset(); }}><Icon name="reset" /></button>{variant === 'skate' ? <button aria-label={t.back} title={t.back} onClick={() => { location.href = '/jumper'; }}><Icon name="maps" /></button> : null}</div>
      <span className="jumper-hint">{variant === 'skate' ? t.hintSkate : t.hintJumper}</span>
      <span className="jumper-mode">{ready && !stats.policyRunning ? stats.controllerMode === 'safe' ? t.stopped : t.preparing : stats.controllerMode === 'locomotion' ? '' : t.motions[stats.controllerMode as keyof typeof t.motions]}</span>
    </footer>
    {variant === 'skate' && ready && stats.skate ? <SkateHud stats={stats.skate} t={t} /> : null}
    {variant === 'skate' && ready && stats.skate?.finished ? <SkateFinish stats={stats.skate} t={t} onAgain={() => engine.current?.reset()} /> : null}
    {ready ? <div className="jumper-touch"><div className="jumper-joystick" aria-label={t.move} onPointerDown={joystick} onPointerMove={joystick} onPointerUp={releaseJoystick} onPointerCancel={releaseJoystick} onLostPointerCapture={releaseJoystick}><span /></div>{variant === 'skate' ? null : <button aria-label={t.jump} title={t.jump} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engine.current?.padButton('A', true); }} onPointerUp={() => engine.current?.padButton('A', false)} onPointerCancel={() => engine.current?.padButton('A', false)} onLostPointerCapture={() => engine.current?.padButton('A', false)} onClick={event => { if (event.detail === 0) engine.current?.action('jump'); }}><Icon name="jump" /></button>}</div> : null}
  </main>;
}
