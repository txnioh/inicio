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
    const gui = new GUI({ container: container.current!, title: 'Editar visualización', width: 250 });
    const values = model.current;
    const volume = gui.addFolder('Volumen');
    volume.add(values, 'depth', .15, 2, .01).name('Profundidad').listen();
    volume.add(values, 'scale', .5, 1.5, .01).name('Tamaño').listen();
    volume.add(values, 'rotationX', -65, 65, 1).name('Giro vertical').listen();
    volume.add(values, 'rotationY', -180, 180, 1).name('Giro horizontal').listen();
    const past = gui.addFolder('Tramo recorrido');
    past.add(values, 'solidPast').name('Bloque sólido').listen();
    const future = gui.addFolder('Fotogramas siguientes');
    future.add(values, 'opacity', 0, 3, .01).name('Opacidad').listen();
    future.add(values, 'brightness', .25, 2, .01).name('Luminosidad').listen();
    future.add(values, 'saturation', 0, 2, .01).name('Saturación').listen();
    future.add(values, 'blur', 0, 6, .1).name('Desenfoque').listen();
    future.add(values, 'fade', 0, 1, .01).name('Desvanecimiento').listen();
    const timeline = gui.addFolder('Reproducción');
    timeline.add(values, 'playbackRate', .25, 2, .25).name('Velocidad').listen();
    gui.onChange(() => change.current({ ...values }));
    gui.add({ reset: () => {
      Object.assign(values, defaultFrameSettings);
      change.current({ ...values });
    } }, 'reset').name('Restablecer');
    gui.close();
    return () => gui.destroy();
  }, []);

  return <div ref={container} className="carrete-frame-editor" />;
}
