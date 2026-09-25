import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { RobotFace } from './RobotVisuals';
import type { RobotSkin } from './robotSkin';

export default function RobotSkinReveal({ skin, reducedMotion, ...face }: ComponentProps<typeof RobotFace> & {
  skin: RobotSkin; reducedMotion: boolean;
}) {
  const previous = useRef(skin);
  const [from, setFrom] = useState<RobotSkin | null>(null);

  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = skin;
    if (old === skin || reducedMotion) {
      setFrom(null);
      return;
    }
    setFrom(old);
    const timer = window.setTimeout(() => setFrom(null), 850);
    return () => window.clearTimeout(timer);
  }, [skin, reducedMotion]);

  return (
    <span className="robot-skin-reveal" data-changing={from ? skin : undefined} aria-hidden="true">
      {from && <span key={from} className="robot-skin-layer robot-skin-before"><RobotFace skin={from} /></span>}
      <span key={skin} className="robot-skin-layer robot-skin-after"><RobotFace {...face} skin={skin} /></span>
      {from && <span key={`scan-${skin}`} className="robot-skin-scan" />}
    </span>
  );
}
