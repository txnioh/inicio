import { useId, type Dispatch, type SetStateAction } from 'react';
import { defaultSettings, numericSettings, type CarreteSettings, type NumericSetting } from './settings';

const introControls: NumericSetting[] = ['introDuration', 'introStagger', 'orbitCount', 'circleScale', 'orbitSpeed'];
const lensControls: NumericSetting[] = ['distortion', 'ripple', 'dispersion', 'sideStart'];
const gridControls: NumericSetting[] = ['fadeDuration'];

export default function EffectSettings({ settings, setSettings, entered, canEnter, reducedMotion, onIntro, onGrid, onReplay }: {
  settings: CarreteSettings;
  setSettings: Dispatch<SetStateAction<CarreteSettings>>;
  entered: boolean;
  canEnter: boolean;
  reducedMotion: boolean;
  onIntro: () => void;
  onGrid: () => void;
  onReplay: () => void;
}) {
  const id = useId();
  const sliders = (keys: NumericSetting[]) => keys.map(key => {
    const { label, min, max, step, unit } = numericSettings[key];
    const value = settings[key];
    const display = unit === 'ms' ? `${(value / 1000).toLocaleString('en', { maximumFractionDigits: 2 })} s`
      : `${value.toLocaleString('en')}${unit}`;
    return <label className="carrete-setting" key={key} htmlFor={`${id}-${key}`}>
      <span>{label}<output htmlFor={`${id}-${key}`}>{display}</output></span>
      <input id={`${id}-${key}`} type="range" min={min} max={max} step={step} value={value}
        aria-valuetext={display} onChange={event => {
          const next = event.currentTarget.valueAsNumber;
          setSettings(current => ({ ...current, [key]: next }));
        }} />
    </label>;
  });

  return <div id="carrete-settings" className="carrete-settings" popover="auto" role="dialog" aria-labelledby={`${id}-title`}>
    <div className="carrete-settings-heading">
      <h2 id={`${id}-title`}>Settings</h2>
      <button className="carrete-text-button" popoverTarget="carrete-settings" popoverTargetAction="hide" aria-label="Close settings">×</button>
    </div>
    <div className="carrete-settings-views" role="group" aria-label="View settings">
      <button className="carrete-text-button" aria-pressed={!entered} onClick={onIntro}>Intro</button>
      <button className="carrete-text-button" aria-pressed={entered} disabled={!canEnter} onClick={onGrid}>Grid</button>
    </div>
    {reducedMotion && <p className="carrete-settings-note" role="status">Reduced motion is enabled. Animations are shown without movement.</p>}
    {entered ? <>
      <fieldset><legend>Image entrance</legend>{sliders(gridControls)}</fieldset>
    </> : <>
      <fieldset><legend>Circles</legend>{sliders(introControls)}</fieldset>
      <fieldset><legend>Glass · sides only</legend>{sliders(lensControls)}</fieldset>
    </>}
    <div className="carrete-settings-actions">
      <button className="minimal-basic-link carrete-text-button" onClick={onReplay}>Replay entrance <span aria-hidden="true">↻</span></button>
      <button className="minimal-basic-link carrete-text-button" onClick={() => setSettings({ ...defaultSettings })}>Reset</button>
    </div>
    <p className="carrete-settings-note">Settings are saved in this browser.</p>
  </div>;
}
