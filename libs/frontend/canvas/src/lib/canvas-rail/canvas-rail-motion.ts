/** Tunable timings and distances for the rail's hand-carried motion. */
export const RAIL_HAND_MOTION = {
  carriedBaseMs: 750,
  carriedMsPerPx: 0.3,
  carriedMinMs: 700,
  carriedMaxMs: 1000,
  displacedMs: 600,
  displacedDelayMs: 80,
  freshMs: 400,
  reducedFreshMs: 120,
  freshOffsetPx: -12,
  freshScale: 0.97,
  liftScale: 1.03,
  liftOffset: 0.15,
  travelOffset: 0.82,
  overshootOffset: 0.9,
  overshootPx: 3,
  settleOffset: 1,
  travelEasing: 'cubic-bezier(0.45, 0, 0.55, 1)',
  overshootEasing: 'cubic-bezier(0.2, 0, 0.8, 1)',
  settleEasing: 'cubic-bezier(0.2, 0, 0.2, 1)',
} as const;

export function carriedFrames(delta: number, opacity: number, scale = 1): Keyframe[] {
  const m = RAIL_HAND_MOTION;
  const overshoot = -Math.sign(delta) * m.overshootPx;
  return [
    { offset: 0, transform: `translateY(${delta}px) scale(${scale})`, opacity, easing: m.travelEasing },
    { offset: m.liftOffset, transform: `translateY(${delta}px) scale(${m.liftScale})`, easing: m.travelEasing },
    { offset: m.travelOffset, transform: `translateY(${overshoot}px) scale(${m.liftScale})`, easing: m.overshootEasing },
    { offset: m.overshootOffset, transform: `translateY(${overshoot}px) scale(1)`, easing: m.settleEasing },
    { offset: m.settleOffset, transform: 'translateY(0) scale(1)', opacity: 1 },
  ];
}

export function displacedFrames(delta: number, opacity: number, scale = 1): Keyframe[] {
  return [
    { offset: 0, transform: `translateY(${delta}px) scale(${scale})`, opacity },
    { offset: 1, transform: 'translateY(0) scale(1)', opacity: 1 },
  ];
}

export function freshFrames(opacity: number, scale = RAIL_HAND_MOTION.freshScale): Keyframe[] {
  const m = RAIL_HAND_MOTION;
  return [
    { offset: 0, transform: `translateY(${m.freshOffsetPx}px) scale(${scale})`, opacity },
    { offset: 1, transform: 'translateY(0) scale(1)', opacity: 1 },
  ];
}

export function shadowFrames(): Keyframe[] {
  const m = RAIL_HAND_MOTION;
  return [
    { offset: 0, opacity: 0 },
    { offset: m.liftOffset, opacity: 1 },
    { offset: m.travelOffset, opacity: 1 },
    { offset: 1, opacity: 0 },
  ];
}
