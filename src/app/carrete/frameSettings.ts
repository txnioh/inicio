export const defaultFrameSettings = {
  depth: 1,
  scale: 1,
  opacity: 1,
  brightness: 1,
  saturation: 1,
  blur: 0,
  fade: 0,
  rotationX: -12,
  rotationY: -32,
  solidPast: true,
  playbackRate: 1,
  timelineZoom: 80,
};

export type FrameSettings = typeof defaultFrameSettings;
