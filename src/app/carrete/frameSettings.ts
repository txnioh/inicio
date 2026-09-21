export const defaultFrameSettings = {
  samples: 160,
  depth: 4,
  scale: 1,
  showFrame: false,
  density: .88,
  brightness: 1.7,
  autoRotate: false,
  rotationX: 22,
  rotationY: 42,
  playbackRate: 1,
};

export type FrameSettings = typeof defaultFrameSettings;
