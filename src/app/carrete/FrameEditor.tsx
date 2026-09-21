import { useEffect, useRef, useState } from 'react';
import { Pane } from 'tweakpane';
import { defaultFrameSettings, type FrameSettings } from './frameSettings';

type Props = {
  settings: FrameSettings; onChange: (settings: FrameSettings) => void;
  time: number; duration: number; playing: boolean; source: string; sourceName: string;
  onSeek: (time: number) => void; onPlay: (playing: boolean) => void;
  onSource: (source: string) => void; onChoose: () => void;
};
export default function FrameEditor(props: Props) {
  const container = useRef<HTMLDivElement>(null), latest = useRef(props); latest.current = props;
  const pane = useRef<Pane | null>(null), refreshing = useRef(false);
  const model = useRef({ ...props.settings, time: props.time, playing: props.playing, source: props.source });
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const gui = new Pane({ container: container.current!, title: 'Frames' }); pane.current = gui;
    const values = model.current;
    Object.assign(values, latest.current.settings, { time: latest.current.time, playing: latest.current.playing, source: latest.current.source });
    const source = gui.addFolder({ title: 'Video source', expanded: false });
    source.addBinding(values, 'source', { label: 'Source', options: { 'Carrete video': 'carrete', 'Local video': 'local' } })
      .on('change', event => {
        if (refreshing.current) return;
        const next = event.value;
        refreshing.current = true; values.source = latest.current.source; gui.refresh(); refreshing.current = false;
        latest.current.onSource(next);
      });
    source.addButton({ title: 'Choose video…' }).on('click', () => latest.current.onChoose());
    const setting = (key: keyof FrameSettings) => () => {
      if (!refreshing.current) latest.current.onChange({ ...latest.current.settings, [key]: values[key] });
    };
    source.addBinding(values, 'samples', { label: 'Samples', options: { '96 · fast': 96, '160 · balanced': 160, '240 · detailed': 240 } }).on('change', setting('samples'));
    const timeline = gui.addFolder({ title: 'Timeline', expanded: false });
    timeline.addBinding(values, 'time', { label: 'Time (s)', min: 0, max: props.duration, step: .01 })
      .on('change', event => { if (!refreshing.current) latest.current.onSeek(event.value); });
    timeline.addBinding(values, 'playing', { label: 'Play' }).on('change', event => { if (!refreshing.current) latest.current.onPlay(event.value); });
    timeline.addBinding(values, 'playbackRate', { label: 'Speed', min: .1, max: 2, step: .1 }).on('change', setting('playbackRate'));
    timeline.addButton({ title: 'Return to start' }).on('click', () => latest.current.onSeek(0));
    const volume = gui.addFolder({ title: 'Transparent volume' });
    volume.addBinding(values, 'depth', { label: 'Time depth', min: .5, max: 4, step: .05 }).on('change', setting('depth'));
    volume.addBinding(values, 'showFrame', { label: 'Frame plane' }).on('change', setting('showFrame'));
    volume.addBinding(values, 'density', { label: 'Density', min: .02, max: 2, step: .02 }).on('change', setting('density'));
    volume.addBinding(values, 'brightness', { label: 'Brightness', min: .5, max: 1.7, step: .05 }).on('change', setting('brightness'));
    const camera = gui.addFolder({ title: 'Camera', expanded: true });
    camera.addBinding(values, 'autoRotate', { label: 'Auto rotate' }).on('change', setting('autoRotate'));
    camera.addButton({ title: 'Reset camera' }).on('click', () => latest.current.onChange({ ...latest.current.settings,
      rotationX: defaultFrameSettings.rotationX, rotationY: defaultFrameSettings.rotationY, scale: 1 }));
    camera.addButton({ title: 'Front view' }).on('click', () => latest.current.onChange({ ...latest.current.settings, rotationX: 0, rotationY: 0 }));
    for (const row of container.current!.querySelectorAll('.tp-lblv')) {
      const label = row.querySelector('.tp-lblv_l')?.textContent;
      if (label) row.querySelectorAll('input,select').forEach(input => input.setAttribute('aria-label', label));
    }
    return () => { gui.dispose(); pane.current = null; };
  }, [props.duration]);
  useEffect(() => {
    Object.assign(model.current, latest.current.settings, { playing: props.playing, source: props.source });
    refreshing.current = true; pane.current?.refresh(); refreshing.current = false;
  }, [props.settings.samples, props.settings.depth, props.settings.showFrame, props.settings.density,
    props.settings.brightness, props.settings.autoRotate, props.settings.playbackRate, props.playing, props.source]);
  const lastRefresh = useRef(0);
  useEffect(() => {
    model.current.time = props.time;
    const now = performance.now();
    if (props.playing && now - lastRefresh.current < 100) return;
    lastRefresh.current = now;
    refreshing.current = true; pane.current?.refresh(); refreshing.current = false;
  }, [props.time, props.playing, props.duration]);
  return <>
    <button className="carrete-frame-reveal carrete-text-button" hidden={!hidden} aria-label="Show controls" onClick={() => setHidden(false)}>Controls</button>
    <aside className="carrete-frame-editor" hidden={hidden} aria-label="Video controls">
      <div className="carrete-frame-toolbar"><button className="carrete-text-button" onClick={() => setHidden(true)} aria-label="Hide controls">Hide ↗</button></div>
      <div className="carrete-frame-fields"><div ref={container} />
      <p className="carrete-frame-source-name">{props.sourceName}</p>
      <p className="carrete-frame-privacy">Local videos stay in this browser.</p></div>
    </aside>
  </>;
}
