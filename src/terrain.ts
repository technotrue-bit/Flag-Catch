/**
 * Home Isle height field. Pure math so the sim, the renderer and the tests
 * all read the same ground. Water sits at y = 0.
 *
 * Three lands in a row: your homeland in the south (+z), the middle land,
 * and the enemy's homeland in the north (-z). Water channels split them,
 * with two bridges across each channel. The map is point symmetric, so
 * (x, z) and (-x, -z) are always the same ground and neither team is favored.
 */
export const WATER_Y = 0;
export const WORLD_HALF_X = 50;
export const WORLD_HALF_Z = 114;

/** Channel centers between the lands; past these lines you are in a homeland. */
export const ZONE_EDGE = 35;
export const BRIDGE_X = 12;

const DOME = 6.2;
const HOME_Z = 70;

export function groundHeight(x: number, z: number): number {
  const f = Math.max(lobe(x, z, 0, 0, 40, 32), lobe(x, z, 0, HOME_Z, 34, 32), lobe(x, z, 0, -HOME_Z, 34, 32));
  // Rolls only on land, so the channels stay clean water.
  const land = clamp01((f - 0.08) * 3);
  const rolls = 1.3 * Math.cos(x * 0.13) * Math.cos(z * 0.1) + 0.8 * Math.cos((x - z) * 0.07);
  // Two lagoons in the middle land give swimmers a fast lane.
  const lagoons = 5.5 * (bump(x - 13, z + 6, 55) + bump(x + 13, z - 6, 55));
  // A lookout hill on each homeland's flank, for defenders.
  const hills = 3.2 * (bump(x + 20, z - 66, 90) + bump(x - 20, z + 66, 90));
  const h = DOME * f + (rolls + hills) * land - lagoons - 1.2;
  const b = bridge(x, z);
  return Math.max(h, b > 0.01 ? DOME * b - 1.2 : -Infinity, -6);
}

/** Where an animal rests: the ground, or the water surface over water. */
export function surfaceHeight(x: number, z: number): number {
  return Math.max(groundHeight(x, z), WATER_Y);
}

export function isWater(x: number, z: number): boolean {
  return groundHeight(x, z) <= WATER_Y;
}

/** True on a bridge deck, for drawing planks. */
export function onBridge(x: number, z: number): boolean {
  return bridge(x, z) > 0.19 && Math.abs(Math.abs(z) - ZONE_EDGE) < 9;
}

/** Whose homeland a spot is in: team 0 (south), team 1 (north), or -1 for the middle. */
export function landOf(z: number): 0 | 1 | -1 {
  return z > ZONE_EDGE ? 0 : z < -ZONE_EDGE ? 1 : -1;
}

export function inWorld(x: number, z: number): boolean {
  return Math.abs(x) <= WORLD_HALF_X && Math.abs(z) <= WORLD_HALF_Z;
}

function lobe(x: number, z: number, cx: number, cz: number, rx: number, rz: number): number {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return 1 - dx * dx - dz * dz;
}

function bridge(x: number, z: number): number {
  const along = 1 - smooth(clamp01((Math.abs(Math.abs(z) - ZONE_EDGE) - 8) / 5));
  if (along <= 0) return 0;
  const across = Math.max(Math.exp(-((x - BRIDGE_X) ** 2) / 20), Math.exp(-((x + BRIDGE_X) ** 2) / 20));
  return 0.45 * across * along;
}

function bump(dx: number, dz: number, spread: number): number {
  return Math.exp(-(dx * dx + dz * dz) / spread);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
