/**
 * Home Isle height field. Pure math so the sim, the renderer and the tests
 * all read the same ground. Water sits at y = 0.
 */
export const WATER_Y = 0;
export const WORLD_RADIUS = 78;
const ISLAND_RADIUS = 58;

export function groundHeight(x: number, z: number): number {
  const d = Math.hypot(x, z) / ISLAND_RADIUS;
  const dome = 6.5 * (1 - d * d);
  const rolls = 1.4 * Math.sin(x * 0.11) * Math.cos(z * 0.09) + 0.9 * Math.sin((x + z) * 0.065);
  // A lagoon on the east side and a channel cutting the south shore, so
  // swimmers have a fast lane and land animals a reason to go around.
  const lagoon = 7.5 * Math.exp(-((x - 20) ** 2 + (z + 6) ** 2) / 150);
  const channel = 6 * Math.exp(-((x + 4) ** 2) / 30) * smooth(clamp01((z - 8) / 30));
  const h = dome + rolls - lagoon - channel - 1.2;
  return Math.max(h, -6);
}

/** Where an animal rests: the ground, or the water surface over water. */
export function surfaceHeight(x: number, z: number): number {
  return Math.max(groundHeight(x, z), WATER_Y);
}

export function isWater(x: number, z: number): boolean {
  return groundHeight(x, z) <= WATER_Y;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
