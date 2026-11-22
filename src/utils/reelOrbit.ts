export interface ReelOrbitPose {
  index: number;
  /** Horizontal offset in px relative to circle center */
  x: number;
  /** Vertical arc offset in px relative to circle center */
  y: number;
  /** Normalized front-to-back depth in [0, 1] (1 = front center, 0 = far back) */
  depth: number;
  /** Compositor scale factor */
  scale: number;
  /** Compositor opacity */
  opacity: number;
  /** Perspective Y-axis rotation in degrees */
  rotateY: number;
  /** Integer stacking order derived from depth */
  zIndex: number;
  /** True when this card sits in the front-center focus zone */
  isFront: boolean;
}

const TWO_PI = Math.PI * 2;

export function normalizeAngle(rad: number): number {
  const wrapped = rad % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

/**
 * Signed shortest angular difference from `fromRad` to `toRad` in [-PI, PI].
 */
export function shortestAngularDelta(fromRad: number, toRad: number): number {
  const diff = normalizeAngle(toRad - fromRad);
  return diff > Math.PI ? diff - TWO_PI : diff;
}

/**
 * Computes the circular 3D orbital pose for one 9:16 vertical reel card.
 * `orbitAngleRad` increases as the ring rotates forward through items 0 -> 1 -> 2 ...
 */
export function computeReelOrbitPose(
  index: number,
  total: number,
  orbitAngleRad: number,
  radiusX: number,
  radiusY: number
): ReelOrbitPose {
  const safeTotal = Math.max(1, total);
  const step = TWO_PI / safeTotal;
  const theta = index * step - orbitAngleRad;

  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const depth = (cosT + 1) / 2;

  const x = sinT * radiusX;
  const y = (1 - cosT) * radiusY;
  const scale = 0.68 + depth * 0.34;
  const opacity = 0.42 + depth * 0.58;
  const rotateY = -sinT * 24;
  const zIndex = Math.round(depth * 100);
  const isFront = cosT >= Math.cos(step * 0.45);

  return {
    index,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    depth: Math.round(depth * 1000) / 1000,
    scale: Math.round(scale * 1000) / 1000,
    opacity: Math.round(opacity * 1000) / 1000,
    rotateY: Math.round(rotateY * 100) / 100,
    zIndex,
    isFront,
  };
}

/**
 * Returns the target orbit angle (in radians) that places `targetIndex` dead-center in front.
 */
export function getOrbitAngleForIndex(targetIndex: number, total: number): number {
  const safeTotal = Math.max(1, total);
  const normalizedIdx = ((targetIndex % safeTotal) + safeTotal) % safeTotal;
  return (normalizedIdx / safeTotal) * TWO_PI;
}

/**
 * Returns the index of the reel currently closest to the front-center of the circle.
 */
export function getFrontReelIndex(total: number, orbitAngleRad: number): number {
  const safeTotal = Math.max(1, total);
  const normalized = normalizeAngle(orbitAngleRad);
  const raw = Math.round((normalized / TWO_PI) * safeTotal);
  return ((raw % safeTotal) + safeTotal) % safeTotal;
}
