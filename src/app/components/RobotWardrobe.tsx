import { useEffect, useRef, useState, type CSSProperties } from 'react';
import FooterRobotMark from './FooterRobotMark';
import { HANGER, PIXEL_LOOK, PIXEL_LOOK_COLORS, PixelSprite, RAIL } from './PixelSprite';
import { preloadPixelLook, RobotFace } from './RobotVisuals';
import { setRobotSkin, useRobotSkin, type RobotSkin } from './robotSkin';
import './robotWardrobe.css';

// The look hops from the hanger onto the robot in whole-pixel steps, taking
// longer and arcing higher the farther it has to go.
const flightMs = (distance: number) => Math.round(Math.min(720, 280 + distance * .8));
const flightLift = (distance: number) => Math.round(Math.min(48, 8 + distance * .1));

// Each look in miniature and in its own style, as it hangs on the hanger.
function Look({ skin }: { skin: RobotSkin }) {
  return skin === 'pixel'
    ? <PixelSprite className="robot-wardrobe-look" rows={PIXEL_LOOK} palette={PIXEL_LOOK_COLORS} unit={1} />
    : <span className="robot-wardrobe-look robot-wardrobe-look-classic"><RobotFace skin="classic" /></span>;
}

// A wall rail beside the robot. Its hanger carries the look the robot is not
// wearing; pressing it swaps them, so the old look ends up on the hanger.
export default function RobotWardrobe() {
  const worn = useRobotSkin();
  const spare: RobotSkin = worn === 'pixel' ? 'classic' : 'pixel';
  const outfit = useRef<HTMLSpanElement>(null);
  const [flight, setFlight] = useState<{ skin: RobotSkin; x: number; y: number; ms: number } | null>(null);
  const [eyeing, setEyeing] = useState(false);
  const [dressedAt, setDressedAt] = useState<number | null>(null);

  const dress = (skin: RobotSkin) => {
    setRobotSkin(skin);
    setDressedAt(Date.now());
  };

  useEffect(() => {
    if (!flight) return;
    const timer = window.setTimeout(() => {
      setFlight(null);
      dress(flight.skin);
    }, flight.ms);
    return () => window.clearTimeout(timer);
  }, [flight]);

  const swap = () => {
    if (flight) return;
    preloadPixelLook();
    const from = outfit.current?.getBoundingClientRect();
    const to = document.querySelector('.minimal-robot-companion [data-robot-face]')?.getBoundingClientRect();
    const x = to && from ? Math.round(to.left + to.width / 2 - (from.left + from.width / 2)) : 0;
    const y = to && from ? Math.round(to.top + to.height / 2 - (from.top + from.height / 2)) : 0;
    // Only fly to a robot that is on screen (it may be away at another perch).
    const visible = to && to.bottom > 0 && to.top < innerHeight && to.right > 0 && to.left < innerWidth;
    if (!visible || matchMedia('(prefers-reduced-motion: reduce)').matches) dress(spare);
    else setFlight({ skin: spare, x, y, ms: flightMs(Math.hypot(x, y)) });
  };

  return (
    <div className="robot-wardrobe">
      <FooterRobotMark dressing={flight !== null} dressedAt={dressedAt} eyeing={eyeing && !flight} />
      <button type="button" className="robot-wardrobe-hook" onClick={swap}
        onPointerEnter={() => { preloadPixelLook(); setEyeing(true); }} onPointerLeave={() => setEyeing(false)}
        onFocus={() => { preloadPixelLook(); setEyeing(true); }} onBlur={() => setEyeing(false)}
        onPointerDown={preloadPixelLook}
        aria-label={`Dress the robot in its ${spare} look`} title="Wardrobe">
        <PixelSprite className="robot-wardrobe-rail" rows={RAIL} unit={1} />
        {/* Remounted on every change so the empty hanger swings again. */}
        <span key={dressedAt ?? 0} className="robot-wardrobe-hanger" data-settling={dressedAt ? '' : undefined}>
          <span ref={outfit} className="robot-wardrobe-outfit">
            {flight
              ? <span className="robot-wardrobe-flight" style={{
                '--x': `${flight.x}px`, '--y': `${flight.y}px`, '--flight-ms': `${flight.ms}ms`,
                '--lift': `${flightLift(Math.hypot(flight.x, flight.y))}px`,
              } as CSSProperties}>
                <Look skin={flight.skin} />
              </span>
              : <span key={spare} className="robot-wardrobe-hung"><Look skin={spare} /></span>}
          </span>
          <PixelSprite className="robot-wardrobe-wire" rows={HANGER} unit={1} />
        </span>
      </button>
    </div>
  );
}
