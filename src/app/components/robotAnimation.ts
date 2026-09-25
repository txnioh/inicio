export function robotPortalPose(progress: number, departing: boolean) {
  const p = Math.max(0, Math.min(1, progress));
  return {
    opacity: departing ? 1 - p : p,
    transform: `translateY(${departing ? -15 * p : 12 * (1 - p)}px) scale(${departing ? 1 - .45 * p : .65 + .35 * p})`,
    clipPath: `inset(${departing ? -40 + 61 * p : -40}px -40px ${departing ? -40 : 21 - 61 * p}px -40px)`,
  };
}

// Pixel skin: the face canvas draws its own portal (see drawPortal), 14
// frames each way. Leaving must finish before the robot changes perch.
export type PixelPortal = 'leaving' | 'arriving';
export const PIXEL_PORTAL_MS = 14 * 35;

export const robotHoleFrames: Keyframe[] = [
  { opacity: 0, transform: 'scaleX(.2)', offset: 0 },
  { opacity: .7, transform: 'scaleX(1)', offset: .2 },
  { opacity: .7, transform: 'scaleX(1)', offset: .55 },
  { opacity: 0, transform: 'scaleX(.2)', offset: 1 },
];
