import { useEffect, useRef } from 'react';
import GUI from 'lil-gui';
import { defaultFrameSettings, type FrameSettings } from './frameSettings';

export default function FrameEditor({ settings, onChange }: {
  settings: FrameSettings;
  onChange: (settings: FrameSettings) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const model = useRef({ ...settings });
  const change = useRef(onChange);
  change.current = onChange;
  Object.assign(model.current, settings);

  useEffect(() => {
    const gui = new GUI({ container: container.current!, title: 'Edit visualization', width: 250 });
    const values = model.current;
    const volume = gui.addFolder('Volume');
    volume.add(values, 'depth', .15, 2, .01).name('Depth').listen();
    volume.add(values, 'scale', .5, 1.5, .01).name('Size').listen();
    volume.add(values, 'rotationX', -65, 65, 1).name('Vertical rotation').listen();
    volume.add(values, 'rotationY', -180, 180, 1).name('Horizontal rotation').listen();
    const past = gui.addFolder('Played frames');
    past.add(values, 'solidPast').name('Solid block').listen();
    const future = gui.addFolder('Upcoming frames');
    future.add(values, 'opacity', 0, 3, .01).name('Opacity').listen();
    future.add(values, 'brightness', .25, 2, .01).name('Brightness').listen();
    future.add(values, 'saturation', 0, 2, .01).name('Saturation').listen();
    future.add(values, 'blur', 0, 6, .1).name('Blur').listen();
    future.add(values, 'fade', 0, 1, .01).name('Fade').listen();
    const timeline = gui.addFolder('Playback');
    timeline.add(values, 'playbackRate', .25, 2, .25).name('Speed').listen();
    gui.onChange(() => change.current({ ...values }));
    gui.add({ reset: () => {
      Object.assign(values, defaultFrameSettings);
      change.current({ ...values });
    } }, 'reset').name('Reset');
    gui.close();
    return () => gui.destroy();
  }, []);

  return <div ref={container} className="carrete-frame-editor" />;
}
