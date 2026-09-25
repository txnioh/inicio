import { useId } from 'react';
import { RobotFace } from './RobotVisuals';
import { robotSkins, setRobotSkin, useRobotSkin, type RobotSkin } from './robotSkin';

export default function RobotSkinSelector({ previews = false, onSelect }: {
  previews?: boolean; onSelect?: (skin: RobotSkin) => void;
}) {
  const name = useId();
  const skin = useRobotSkin();

  return (
    <fieldset className="robot-skin-selector" aria-label="Robot skin">
      {robotSkins.map(option => (
        <label key={option}>
          <input
            className="minimal-hidden-nav"
            type="radio"
            name={name}
            value={option}
            checked={skin === option}
            onChange={() => { setRobotSkin(option); onSelect?.(option); }}
          />
          <span className="robot-skin-choice">
            {previews && (
              <span className="minimal-footer-robot-gallery" data-skin={option} data-expression="idle" aria-hidden="true">
                <span className="minimal-robot-option"><RobotFace skin={option} /></span>
              </span>
            )}
            <span>{option === 'pixel' ? 'Pixel' : 'Normal'}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
