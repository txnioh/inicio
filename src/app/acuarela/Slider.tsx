import { useId, useRef, type CSSProperties, type PointerEvent } from 'react';

// A slider as one pill-shaped row, after Lichin Lin's: the label inside on
// the left, the value on the right, a darker fill up to the value with a
// thin handle at its end, and dots marking the scale that fade out as the
// fill reaches them. Dragging anywhere on the row sets the value; the native
// range input underneath keeps it working from the keyboard and for screen
// readers.

const DOTS = 6;
// The fill always covers the label; the scale runs from there to the end.
// The value sits in the last part, where the dots stop and the handle fades.
const LABEL = .42;
const VALUE = .74;

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

const show = (value: number, step: number) => step >= 1 ? String(Math.round(value)) : value.toFixed(2);

export default function Slider({ label, value, min, max, step, onChange }: Props) {
  const id = useId();
  const row = useRef<HTMLLabelElement>(null);
  const at = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const end = LABEL + at * (1 - LABEL);
  const handle = Math.min(1, Math.max(0, (VALUE + .04 - end) / .06));

  const set = (event: PointerEvent) => {
    const box = row.current!.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, ((event.clientX - box.left) / box.width - LABEL) / (1 - LABEL)));
    const next = Math.round((min + t * (max - min)) / step) * step;
    if (next !== value) onChange(+next.toFixed(4));
  };

  return (
    <label ref={row} className="acuarela-slider" htmlFor={id} style={{ '--end': end, '--handle': handle } as CSSProperties}
      onPointerDown={event => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.active = '';
        document.getElementById(id)?.focus({ preventScroll: true });
        set(event);
      }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) set(event); }}
      onPointerUp={event => { delete event.currentTarget.dataset.active; }}
      onPointerCancel={event => { delete event.currentTarget.dataset.active; }}>
      <span className="acuarela-slider-fill" aria-hidden="true" />
      <span className="acuarela-slider-dots" aria-hidden="true">
        {Array.from({ length: DOTS }, (_, i) => {
          const position = LABEL + .05 + (VALUE - LABEL - .07) * i / (DOTS - 1);
          // Hidden under the fill, fading in just past its end.
          const opacity = Math.min(1, Math.max(0, (position - end) / .08));
          return <i key={i} style={{ left: `${position * 100}%`, opacity }} />;
        })}
      </span>
      <span className="acuarela-slider-label">{label}</span>
      <output className="acuarela-slider-value" htmlFor={id}>{show(value, step)}</output>
      <input id={id} type="range" min={min} max={max} step={step} value={value} tabIndex={0}
        onChange={event => onChange(event.currentTarget.valueAsNumber)} />
    </label>
  );
}
