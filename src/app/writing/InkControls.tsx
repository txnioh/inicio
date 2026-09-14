import { useId, type ButtonHTMLAttributes, type ChangeEventHandler, type CSSProperties, type KeyboardEventHandler, type PointerEventHandler, type Ref } from 'react';

type InkSliderProps = {
  label: string;
  ariaLabel: string;
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  ink?: string;
  inputRef?: Ref<HTMLInputElement>;
  outputRef?: Ref<HTMLOutputElement>;
  rootRef?: Ref<HTMLLabelElement>;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onPointerDown?: PointerEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
};

export function InkSlider({ label, ariaLabel, value, defaultValue, min = 0, max = 100, step = 1,
  suffix = '', ink = '#918BD6', inputRef, outputRef, rootRef, onChange, onPointerDown, onKeyDown }: InkSliderProps) {
  const id = useId();
  const current = value ?? defaultValue ?? min;
  const progress = (n: number) => Math.max(0, Math.min(1, (n - min) / (max - min || 1)));

  return <label className="ink-slider" ref={rootRef} style={{ '--control-ink': ink, '--ink-progress': progress(current) } as CSSProperties}>
    <span>{label}</span>
    <span className="ink-slider-track">
      <input ref={inputRef} id={id} aria-label={ariaLabel} type="range" min={min} max={max} step={step}
        value={value} defaultValue={defaultValue} onPointerDown={onPointerDown} onKeyDown={onKeyDown}
        onChange={event => {
          event.currentTarget.closest<HTMLElement>('.ink-slider')?.style.setProperty('--ink-progress', String(progress(Number(event.currentTarget.value))));
          onChange(event);
        }} />
    </span>
    <output ref={outputRef} htmlFor={id} aria-live="off">{current}{suffix}</output>
  </label>;
}

type InkButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { ink?: string; icon?: 'replay' | 'stroke' | 'layers' };

export function InkButton({ children, className = '', ink = '#918BD6', icon, style, ...props }: InkButtonProps) {
  return <button type="button" {...props} className={`ink-button ${className}`} style={{ '--control-ink': ink, ...style } as CSSProperties}>
    {icon && <svg className={`ink-button-icon ink-icon-${icon}`} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      {icon === 'replay' && <><path d="M4 6.5C5 2.6 11.5 2.3 14 6.5c2.8 5-2.2 9.9-6.5 7.4" /><path d="m3.6 2.8.1 4.4 4.3-.7" /></>}
      {icon === 'stroke' && <><path d="m4 12 7.5-8.2 2.7 2.4L6.5 14Z" /><path d="m3.2 15.3 3.3-1.2M10.3 5.2l2.6 2.4" /></>}
      {icon === 'layers' && <><path className="ink-layer-one" d="m2 6 9-.7 1 5.5-9 .8Z" /><path className="ink-layer-two" d="m6 7 9-.7.8 5.7-8.8.7Z" /></>}
    </svg>}
    <span className="ink-button-label">{children}</span>
  </button>;
}
