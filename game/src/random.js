// Deterministic RNG (mulberry32) plus small helpers the city and the world share.
// The same seed always builds the same city, traffic and pedestrians, so a screenshot
// taken with ?seed=1 is reproducible.

export function createRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max). */
export function randInt(random, min, max) {
  return min + Math.floor(random() * (max - min));
}

/** One element of an array, uniformly. */
export function randPick(random, array) {
  return array[Math.floor(random() * array.length)];
}

/** Value in [min, max). */
export function randRange(random, min, max) {
  return min + random() * (max - min);
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed angle from `a` to `b`, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distance on the ground plane. */
export function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
