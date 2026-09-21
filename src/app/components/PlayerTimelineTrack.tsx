import * as motion from 'framer-motion/m';
import { useReducedMotion } from 'framer-motion';

const transition = { duration: .16, ease: [.22, 1, .36, 1] as const };

export default function PlayerTimelineTrack({ progress, preview, buffered = 0, seeking }: {
  progress: number;
  preview: number | null;
  buffered?: number;
  seeking: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const animation = reduceMotion ? { duration: 0 } : transition;
  const scaleY = seeking ? 2 : 1;
  return <>
    <motion.span className="minimal-timeline-track" aria-hidden="true" initial={false}
      animate={{ scaleY }} transition={animation} />
    <motion.span className="minimal-timeline-buffered" aria-hidden="true" initial={false}
      animate={{ scaleX: buffered / 100, scaleY }} transition={animation} />
    <motion.span className="minimal-timeline-preview" aria-hidden="true" initial={false}
      animate={{ scaleX: Math.max(preview ?? progress, progress) / 100, scaleY, opacity: preview !== null || seeking ? 1 : 0 }}
      transition={animation} />
    <motion.span className="minimal-timeline-progress" aria-hidden="true" initial={false}
      animate={{ scaleX: progress / 100, scaleY }} transition={animation} />
  </>;
}
