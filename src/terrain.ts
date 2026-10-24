/**
 * Island height fields. Pure math so the sim, the renderer and the tests
 * all read the same ground. Water sits at y = 0.
 *
 * Three lands in a row: your homeland in the south (+z), the middle land,
 * and the enemy's homeland in the north (-z). Water channels split them,
 * with bridges across each channel. The map is point symmetric, so (x, z)
 * and (-x, -z) are always the same ground and neither team is favored.
 *
 * Every map is the same layout drawn at a different size: bigger team sizes
 * get a bigger island, and the gigantic ones are also wider, with more
 * bridges, so a crowd of 128 animals has room to spread out. Call setMap
 * before building a match or the world; the exported sizes follow it.
 */
import { type WorldDef, WORLDS } from "./worlds";

export const WATER_Y = 0;

export interface MapDef {
  /** Animals per team this map is made for. */
  size: number;
  name: string;
  gigantic: boolean;
  /** Everything but height grows by this. */
  scale: number;
  /** Extra stretch across the island (x), on top of scale. */
  wide: number;
  /** Bridge centers across each channel, in layout units (|u| <= 12 stays on land). */
  bridges: number[];
  /** Capture match length in seconds. */
  duration: number;
  flagsPerTeam: number;
  /** Radius of each base pad; carry a flag inside it to bank. */
  baseRadius: number;
}

export const MAPS: readonly MapDef[] = [
  { size: 8, name: "Home Isle", gigantic: false, scale: 1.2, wide: 1, bridges: [-12, 12], duration: 180, flagsPerTeam: 5, baseRadius: 4.2 },
  { size: 16, name: "Wide Isle", gigantic: false, scale: 1.25, wide: 1.4, bridges: [-12, 0, 12], duration: 240, flagsPerTeam: 7, baseRadius: 5 },
  { size: 32, name: "Gigantic Isle", gigantic: true, scale: 1.9, wide: 1.6, bridges: [-12, -4, 4, 12], duration: 300, flagsPerTeam: 10, baseRadius: 6 },
  { size: 64, name: "Colossal Isle", gigantic: true, scale: 2.3, wide: 2.1, bridges: [-12, -6, 0, 6, 12], duration: 360, flagsPerTeam: 14, baseRadius: 7 },
];

/** The smallest map made for at least `perTeam` animals a side. */
export function mapFor(perTeam: number): MapDef {
  return MAPS.find((m) => m.size >= perTeam) ?? MAPS[MAPS.length - 1];
}

// The layout in its own units: 100 wide, 228 long, channels at v = +-35.
const LAYOUT_HALF_X = 50;
const LAYOUT_HALF_Z = 114;
const LAYOUT_EDGE = 35;
const LAYOUT_BASE_Z = 84;
const DOME = 6.2;
/**
 * Gigantic maps give each team two outpost bases on the flanks of its
 * homeland, in layout units: (u, v) for the south team, mirrored for the north.
 */
const OUTPOSTS: ReadonlyArray<readonly [number, number]> = [
  [-18, 56],
  [18, 56],
  [18, -56],
  [-18, -56],
];
const HOME_V = 70;

let map: MapDef = MAPS[0];
let world: WorldDef = WORLDS[0];
let sx = 1;
let sz = 1;
let bridgeXs: number[] = [];
let bridgeWidth = 20;

export let WORLD_HALF_X = 0;
export let WORLD_HALF_Z = 0;
/** Channel centers between the lands; past these lines you are in a homeland. */
export let ZONE_EDGE = 0;
/** Where each team's base sits, as +-z. */
export let BASE_Z = 0;
/** Bridge centers in world x, the same across both channels. */
export let BRIDGES: readonly number[] = [];
/** The outermost bridge, for tests and scenery. */
export let BRIDGE_X = 0;

export function setMap(def: MapDef): void {
  map = def;
  sz = def.scale;
  sx = def.scale * def.wide;
  WORLD_HALF_X = LAYOUT_HALF_X * sx;
  WORLD_HALF_Z = LAYOUT_HALF_Z * sz;
  ZONE_EDGE = LAYOUT_EDGE * sz;
  BASE_Z = LAYOUT_BASE_Z * sz;
  bridgeXs = def.bridges.map((u) => u * sx);
  BRIDGES = bridgeXs;
  BRIDGE_X = Math.max(...bridgeXs);
  // Decks get a little wider on the big maps so crowds can pass.
  bridgeWidth = 20 * (1 + (def.scale - 1) * 0.35) ** 2 * world.bridgeWidth;
}
setMap(MAPS[0]);

/** Reshape and repaint the island; call before setMap so bridge widths follow. */
export function setWorld(def: WorldDef): void {
  world = def;
  setMap(map);
}

export function currentWorld(): WorldDef {
  return world;
}

/** True where the liquid is lava rather than water. */
export function isLava(x: number, z: number): boolean {
  return world.liquid === "lava" && groundHeight(x, z) <= WATER_Y;
}

export function currentMap(): MapDef {
  return map;
}

/** How much bigger than the layout the current map is along z; CPU ranges scale with it. */
export function mapScale(): number {
  return sz;
}

export function groundHeight(x: number, z: number): number {
  const u = x / sx;
  const v = z / sz;
  const f = Math.max(lobe(u, v, 0, 0, 40, 32), lobe(u, v, 0, HOME_V, 34, 32), lobe(u, v, 0, -HOME_V, 34, 32));
  // Rolls only on land, so the channels stay clean water.
  const land = clamp01((f - 0.08) * 3);
  const rolls = 1.3 * Math.cos(u * 0.13) * Math.cos(v * 0.1) + 0.8 * Math.cos((u - v) * 0.07);
  // Two lagoons in the middle land give swimmers a fast lane.
  const lagoons = 5.5 * world.lagoons * (bump(u - 13, v + 6, 55) + bump(u + 13, v - 6, 55));
  // A lookout hill on each homeland's flank, for defenders.
  const hills = 3.2 * (bump(u + 20, v - 66, 90) + bump(u - 20, v + 66, 90));
  let h = DOME * f + (rolls + hills) * land - lagoons - 1.2;
  // Each world's own shape, kept off the bases and the bridge landings.
  if (world.id !== "home") h += world.shape(u, v, land) * calm(x, u, v);
  if (map.gigantic) {
    // Gigantic maps add side lakes in the middle land, a pond in each
    // homeland and two more lookout hills, so the open ground has shape.
    const lakes = world.liquid === "lava" ? 0 : 1;
    h -= 6 * lakes * (bump(u + 26, v + 14, 70) + bump(u - 26, v - 14, 70));
    h -= 5 * lakes * (bump(u - 22, v - 82, 40) + bump(u + 22, v + 82, 40));
    h += 3 * land * (bump(u + 24, v - 46, 60) + bump(u - 24, v + 46, 60));
    // A raised pad under each outpost base.
    let pad = 0;
    for (const [ou, ov] of OUTPOSTS) pad = Math.max(pad, bump(u - ou, v - ov, 40));
    h = Math.max(h, h * (1 - pad) + 2.6 * pad);
  }
  const b = bridge(x, v);
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
  const v = z / sz;
  return bridge(x, v) > 0.19 && Math.abs(Math.abs(v) - LAYOUT_EDGE) < 9;
}

/** Whose homeland a spot is in: team 0 (south), team 1 (north), or -1 for the middle. */
export function landOf(z: number): 0 | 1 | -1 {
  return z > ZONE_EDGE ? 0 : z < -ZONE_EDGE ? 1 : -1;
}

export function inWorld(x: number, z: number): boolean {
  return Math.abs(x) <= WORLD_HALF_X && Math.abs(z) <= WORLD_HALF_Z;
}

/** Outpost bases on the current map as [x, z, team]; none on the smaller maps. */
export function outposts(): Array<[number, number, 0 | 1]> {
  if (!map.gigantic) return [];
  return OUTPOSTS.map(([u, v]) => [u * sx, v * sz, v > 0 ? 0 : 1]);
}

/** A point given in layout units, placed on the current map. */
export function fromLayout(u: number, v: number): [number, number] {
  return [u * sx, v * sz];
}

/** 1 on open ground, falling to 0 on each base pad and where a bridge lands, so worlds never tilt them. */
function calm(x: number, u: number, v: number): number {
  let c = (1 - bump(u, v - LAYOUT_BASE_Z, 110)) * (1 - bump(u, v + LAYOUT_BASE_Z, 110));
  if (map.gigantic) for (const [ou, ov] of OUTPOSTS) c *= 1 - bump(u - ou, v - ov, 60);
  const landing = 1 - smooth(clamp01((Math.abs(Math.abs(v) - LAYOUT_EDGE) - 6) / 8));
  if (landing > 0) {
    let near = 0;
    for (const bx of bridgeXs) near = Math.max(near, Math.exp(-((x - bx) ** 2) / (bridgeWidth * 3)));
    c *= 1 - landing * near;
  }
  return c;
}

function lobe(u: number, v: number, cu: number, cv: number, ru: number, rv: number): number {
  const du = (u - cu) / ru;
  const dv = (v - cv) / rv;
  return 1 - du * du - dv * dv;
}

/** Bridge decks: laid out along the channel in layout units, but a fixed width in meters. */
function bridge(x: number, v: number): number {
  const along = 1 - smooth(clamp01((Math.abs(Math.abs(v) - LAYOUT_EDGE) - 8) / 5));
  if (along <= 0) return 0;
  let across = 0;
  for (const bx of bridgeXs) across = Math.max(across, Math.exp(-((x - bx) ** 2) / bridgeWidth));
  return 0.45 * across * along;
}

function bump(du: number, dv: number, spread: number): number {
  return Math.exp(-(du * du + dv * dv) / spread);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
