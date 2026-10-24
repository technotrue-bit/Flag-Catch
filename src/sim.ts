/**
 * The match simulation. No Three.js here: plain numbers stepped at a fixed
 * 60 Hz, so a seed replays the same match and the tests can run it headless.
 */
import { ANIMALS, type AnimalDef } from "./animals";
import { mulberry32, type RNG } from "./rng";
import {
  BASE_Z,
  BRIDGES,
  type MapDef,
  WORLD_HALF_X,
  WORLD_HALF_Z,
  ZONE_EDGE,
  fromLayout,
  groundHeight,
  inWorld,
  isWater,
  landOf,
  mapFor,
  mapScale,
  outposts,
  setMap,
  surfaceHeight,
} from "./terrain";

export const STEP = 1 / 60;

export type Team = 0 | 1;
export type Medium = "land" | "water" | "air";

/** Feel knobs the prototype exposes in its tune panel. */
export const tune = {
  gravity: 26,
  accel: 26,
  throwSpeed: 20,
  throwLift: 6,
  throwCooldown: 0.65,
  skidFriction: 0.55,
  fireLife: 2.4,
  hitRadius: 1.5,
  stunTime: 1.0,
  popLift: 10,
  popPush: 9,
  grabRadius: 1.8,
  /** Seconds a diver can stay under, how deep they sit, and their speed there. */
  diveBreath: 4,
  diveDepth: 1.1,
  diveSpeed: 0.8,
  /** Bombs pop everyone this close to where they land. */
  bombRadius: 3,
  /** A flyer must be this high over the ground to drop a bomb. */
  bombHeight: 2.5,
  /** Power ups: how long Shield and Star last, Turbo too, and how fast it goes. */
  itemTime: 7,
  turboTime: 5,
  turboBoost: 1.45,
  starBoost: 1.3,
  /** Seconds a station waits before it offers another item. */
  stationCooldown: 8,
  stationRadius: 2.6,
  lightningRadius: 14,
  blastRadius: 6.5,
  missileSpeed: 24,
  missileTurn: 3.5,
  superJump: 22,
  /** Flyers stop climbing this high over the ground. */
  flyCeiling: 11,
  /** Hits an animal can take; the last one knocks it out. */
  maxHits: 3,
  /** A hit that doesn't knock you out only makes you flinch. */
  flinchTime: 0.35,
  /** One hit heals back after this long without being hit. */
  healTime: 6,
  /** Seconds out after a knockout, then you're back at a respawn point. */
  outTime: 2,
  /** Seconds of protection after coming back. */
  spawnShield: 1.5,
  /** A medic can plant a respawn flag this often, and keeps this many up. */
  medicCooldown: 30,
  medicFlags: 2,
  /** Enemies touching a respawn flag knock it down. */
  respawnRadius: 1.8,
};

/**
 * The eight power ups. Drive through a station to pick one up, and press
 * Item to use it. Shield and Star are Devin's: Shield blocks every pop for
 * 7 seconds; Star does too, adds speed, and pops any enemy you bump.
 */
export type ItemKind = "shield" | "star" | "triple" | "missile" | "superjump" | "lightning" | "blast" | "turbo";

export const ITEMS: Record<ItemKind, { name: string; info: string; weight: number }> = {
  shield: { name: "SHIELD", info: "No pops for 7 seconds", weight: 3 },
  star: { name: "STAR", info: "7 seconds unpoppable and faster; bump enemies to pop them", weight: 1 },
  triple: { name: "TRIPLE", info: "Three firecrackers in a fan", weight: 3 },
  missile: { name: "MISSILE", info: "A paper missile that chases the nearest enemy, flag carriers first", weight: 3 },
  superjump: { name: "SUPER JUMP", info: "A huge leap, over water and walls", weight: 2 },
  lightning: { name: "LIGHTNING", info: "Pops every enemy close by", weight: 1.5 },
  blast: { name: "BLAST", info: "Knocks nearby enemies flying", weight: 2 },
  turbo: { name: "TURBO", info: "Much faster for 5 seconds", weight: 3 },
};
const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

/**
 * How well a team's CPUs play. Easy reacts late, picks loosely, rarely
 * dodges, aims at where you are rather than where you're going and piles onto
 * one target; Hard reads the score and clock, dodges most shots and spreads
 * out. Your teammates always play Medium; the chosen difficulty sets the rivals.
 */
export type Difficulty = "easy" | "medium" | "hard";

export interface Skill {
  /** Seconds between decisions. */
  react: number;
  /** Randomness added to each choice; more means looser decisions. */
  noise: number;
  /** Chance of seeing a shot coming and dodging it. */
  dodge: number;
  /** How well lined up (radians) a throw must be, and whether it leads a moving target. */
  aimTol: number;
  leads: boolean;
  /** Keenness to throw per step once lined up. */
  throwRate: number;
  /** Share of top speed used. */
  pace: number;
  /** Teamwork: 0 lets everyone chase the same target; 3 spreads out like Medium. */
  coord: number;
  /** 0 to 1: reading the score and clock, and steering carriers around enemies. */
  tactics: number;
  /** Backs off to heal at one hit left. */
  cautious: boolean;
  /** Saves power ups for the right moment instead of firing them off. */
  itemSmart: boolean;
}

export const SKILLS: Record<Difficulty, Skill> = {
  easy: { react: 0.6, noise: 30, dodge: 0.1, aimTol: 0.3, leads: false, throwRate: 0.035, pace: 0.82, coord: 0, tactics: 0, cautious: false, itemSmart: false },
  medium: { react: 0.35, noise: 14, dodge: 0.4, aimTol: 0.18, leads: true, throwRate: 0.06, pace: 0.92, coord: 3, tactics: 0.6, cautious: true, itemSmart: true },
  hard: { react: 0.2, noise: 6, dodge: 0.75, aimTol: 0.12, leads: true, throwRate: 0.1, pace: 1, coord: 3, tactics: 1, cautious: true, itemSmart: true },
};

/**
 * The rivals' skill for a team size. With dozens of CPUs a side, small edges
 * add up and one human matters less, so the bigger the teams, the closer
 * Easy and Hard sit to Medium; that keeps each difficulty about as winnable
 * at 64v64 as at 8v8.
 */
export function rivalSkill(d: Difficulty, perTeam: number): Skill {
  const k = Math.min(1, Math.sqrt(8 / Math.max(1, perTeam)));
  const a = SKILLS.medium;
  const b = SKILLS[d];
  const mix = (x: number, y: number) => x + (y - x) * k;
  return {
    react: mix(a.react, b.react),
    noise: mix(a.noise, b.noise),
    dodge: mix(a.dodge, b.dodge),
    aimTol: mix(a.aimTol, b.aimTol),
    leads: k > 0.5 ? b.leads : a.leads,
    throwRate: mix(a.throwRate, b.throwRate),
    pace: mix(a.pace, b.pace),
    coord: mix(a.coord, b.coord),
    tactics: mix(a.tactics, b.tactics),
    cautious: k > 0.5 ? b.cautious : a.cautious,
    itemSmart: k > 0.5 ? b.itemSmart : a.itemSmart,
  };
}

export interface Station {
  id: number;
  x: number;
  z: number;
  /** Seconds until it offers an item again; ready at 0. */
  cd: number;
}

/** Station spots in layout units; point symmetric like the map. */
const STATION_SPOTS: Array<[number, number]> = [
  [0, 0],
  [16, 20],
  [-16, -20],
  [-18, 16],
  [18, -16],
  [-12, 52],
  [12, -52],
];
/** More on the gigantic maps, so nobody has a long trip to one. */
const GIGANTIC_STATION_SPOTS: Array<[number, number]> = [
  [0, 22],
  [0, -22],
  [-24, 60],
  [24, -60],
];

export interface Input {
  /** Desired direction in world space; length 0..1 is the throttle. */
  dirX: number;
  dirZ: number;
  jump: boolean;
  throwPressed: boolean;
  /** Held: water animals stay under while in water. */
  dive?: boolean;
  /** Pressed: use the held power up. */
  useItem?: boolean;
  /** Pressed: a medic plants a respawn flag. */
  plant?: boolean;
}

export const NO_INPUT: Input = { dirX: 0, dirZ: 0, jump: false, throwPressed: false, dive: false, useItem: false, plant: false };

export interface Player {
  id: number;
  team: Team;
  def: AnimalDef;
  cpu: boolean;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  vy: number;
  /** Knockback velocity, decays on its own. */
  kx: number;
  kz: number;
  onSurface: boolean;
  medium: Medium;
  floatLeft: number;
  jumpWasHeld: boolean;
  stun: number;
  throwCd: number;
  /** Seconds before this player may grab again after dropping a flag. */
  grabCd: number;
  carrying: number;
  score: number;
  /** Under water: firecrackers and bombs pass over. */
  diving: boolean;
  /** Seconds of dive left; refills at the surface. */
  breath: number;
  /** After running out of breath, a short wait before diving again. */
  diveCd: number;
  /** The power up waiting to be used, and the timers of those running. */
  item: ItemKind | null;
  shieldT: number;
  starT: number;
  turboT: number;
  /** CPU: seconds it has held its item, so it uses it eventually. */
  itemHeld: number;
  /** Hits left before a knockout, and seconds until one heals back. */
  hp: number;
  healCd: number;
  /** Seconds left knocked out; while above 0 the animal is off the field. */
  out: number;
  /** Medics plant respawn flags; medicCd counts down to the next one. */
  medic: boolean;
  medicCd: number;
  /** CPU state. Defenders hold their homeland, attackers raid, medics follow. */
  role: "attack" | "defend" | "medic";
  /** What the CPU decided to do last, so it sticks with a plan. */
  goalTag: string;
  /** Dodging: a sidestep direction and how long it lasts, a hop, and a pause before the next look. */
  dodgeT: number;
  dodgeX: number;
  dodgeZ: number;
  dodgeJump: number;
  dodgeCd: number;
  thinkCd: number;
  goalX: number;
  goalZ: number;
}

/**
 * Capture the flag rules. Each team's flags start in its own base. Steal
 * one from the enemy base and bring it to yours to score; it then sits in
 * your base and they can steal it back. A popped carrier drops the flag:
 * its owners touch it to send it home, the thieves can pick it up again,
 * and left alone it goes home on its own.
 */
export type FlagState = "home" | "carried" | "dropped";

export interface Flag {
  id: number;
  /** The team whose base the flag belongs to right now. */
  team: Team;
  state: FlagState;
  x: number;
  y: number;
  z: number;
  carrier: number;
  /** Slot in the base ring while home. */
  slot: number;
  /** The base it sits in, or was taken from while carried or dropped. */
  base: number;
  /** Seconds left before a dropped flag goes home by itself. */
  timer: number;
}

export interface Firecracker {
  id: number;
  owner: number;
  team: Team;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  skidding: boolean;
  life: number;
  /** Dropped by a flyer: falls straight and bursts on landing. */
  bomb: boolean;
  /** A paper missile chasing this player id; -1 for an ordinary shot. */
  homing?: number;
}

/** A forward spawn point a medic planted; knocked out teammates can come back here. */
export interface RespawnFlag {
  id: number;
  team: Team;
  owner: number;
  x: number;
  z: number;
}

export type SimEvent =
  | { kind: "throw"; x: number; y: number; z: number; player: number }
  | { kind: "pop"; x: number; y: number; z: number; player: number; by: number }
  | { kind: "fizzle"; x: number; y: number; z: number }
  | { kind: "grab"; x: number; y: number; z: number; player: number }
  | { kind: "drop"; x: number; y: number; z: number; player: number }
  | { kind: "bank"; x: number; y: number; z: number; player: number; team: Team }
  | { kind: "return"; x: number; y: number; z: number; player: number; team: Team }
  | { kind: "jump"; player: number }
  | { kind: "boom"; x: number; y: number; z: number; player: number }
  | { kind: "dive"; x: number; z: number; player: number }
  | { kind: "surface"; x: number; z: number; player: number }
  | { kind: "splash"; x: number; z: number; player: number }
  | { kind: "item"; x: number; z: number; player: number; item: ItemKind; station: number }
  | { kind: "use"; x: number; y: number; z: number; player: number; item: ItemKind }
  | { kind: "block"; x: number; y: number; z: number; player: number }
  | { kind: "zap"; x: number; y: number; z: number; player: number; by: number }
  | { kind: "hit"; x: number; y: number; z: number; player: number; by: number; hp: number }
  | { kind: "ko"; x: number; y: number; z: number; player: number; by: number }
  | { kind: "respawn"; x: number; y: number; z: number; player: number }
  | { kind: "plant"; x: number; z: number; player: number; flag: number }
  | { kind: "unplant"; x: number; z: number; flag: number; by: number }
  | { kind: "end"; winner: Team | -1 };

export interface Base {
  id: number;
  team: Team;
  x: number;
  z: number;
  /** Each team's home base; gigantic maps add smaller outposts. */
  main: boolean;
}

/**
 * Capture: most flags stolen and brought home when the clock runs out.
 * Hoard: every flag sitting in your base earns points over time, and the
 * first team to HOARD_TARGET wins; stealing shifts who earns faster.
 */
export type Mode = "capture" | "hoard";
export const HOARD_TARGET = 1000;
/**
 * Points per second each flag in your base earns in Hoard, for a match with
 * five flags a side. Maps with more flags pay less per flag, so the race to
 * 1000 takes about as long whatever the team size.
 */
export const HOARD_RATE = 1;

export interface Match {
  mode: Mode;
  map: MapDef;
  /** Carry a flag within this of your base center to bank it. */
  baseRadius: number;
  hoardRate: number;
  /** How keen CPUs are to throw; lower in big crowds. */
  aggro: number;
  /** CPU skill per team: your teammates, then the rivals. */
  skill: [Skill, Skill];
  difficulty: Difficulty;
  stations: Station[];
  /** Hoard points with fractions; `scores` shows them rounded down. */
  points: [number, number];
  rng: RNG;
  time: number;
  timeLeft: number;
  over: boolean;
  players: Player[];
  flags: Flag[];
  fires: Firecracker[];
  /** Main bases first (index = team), then any outposts. */
  bases: Base[];
  respawns: RespawnFlag[];
  nextRespawnId: number;
  /** Players in this step's order, and the reversed list it alternates with. */
  turn: Player[];
  turnBack: Player[];
  scores: [number, number];
  events: SimEvent[];
  nextFireId: number;
}

export interface MatchOptions {
  seed: number;
  humanAnimal: string;
  perTeam: number;
  duration: number;
  flagsPerTeam: number;
  mode?: Mode;
  /** Defaults to the map made for this many animals a side. */
  map?: MapDef;
  /** The human plays a medic. */
  humanMedic?: boolean;
  /** Sets the rival team's CPUs; teammates play Medium. Defaults to Medium. */
  difficulty?: Difficulty;
}

export function createMatch(opts: MatchOptions): Match {
  const rng = mulberry32(opts.seed);
  const map = opts.map ?? mapFor(opts.perTeam);
  setMap(map);
  const bases: Base[] = [
    { id: 0, team: 0, x: 0, z: BASE_Z, main: true },
    { id: 1, team: 1, x: 0, z: -BASE_Z, main: true },
    ...outposts().map(([x, z, team], i) => ({ id: 2 + i, team, x, z, main: false })),
  ];
  const players: Player[] = [];
  const ids = Object.keys(ANIMALS);
  for (let team = 0 as Team; team <= 1; team = (team + 1) as Team) {
    for (let i = 0; i < opts.perTeam; i++) {
      const human = team === 0 && i === 0;
      const def = human ? ANIMALS[opts.humanAnimal] ?? ANIMALS.lion : ANIMALS[ids[Math.floor(rng() * ids.length)]];
      const b = bases[team];
      // A sunflower spiral around the base, so a big team starts spread out.
      const a = i * 2.39996;
      const r = 3 + 1.7 * Math.sqrt(i);
      // Mirrored through the island's center for the north team, like the map.
      const flip = team === 0 ? 1 : -1;
      const x = b.x + Math.cos(a) * r * flip;
      const z = b.z + Math.sin(a) * r * 0.8 * flip;
      const p = makePlayer(players.length, team, def, !human, x, z, Math.atan2(-b.x, -b.z));
      // A quarter defend; one in eight is a medic (the human only if picked).
      p.role = i % 4 === 1 ? "defend" : i % 8 === 3 ? "medic" : "attack";
      p.medic = human ? !!opts.humanMedic : p.role === "medic";
      players.push(p);
    }
    if (team === 1) break;
  }
  const flags: Flag[] = [];
  for (const team of [0, 1] as const) {
    // Half the flags at the main base, the rest shared among the outposts.
    const own = bases.filter((b) => b.team === team);
    const atMain = own.length > 1 ? Math.ceil(opts.flagsPerTeam / 2) : opts.flagsPerTeam;
    const used = new Map<number, number>();
    for (let i = 0; i < opts.flagsPerTeam; i++) {
      const b = i < atMain ? own[0] : own[1 + ((i - atMain) % (own.length - 1))];
      const slot = used.get(b.id) ?? 0;
      used.set(b.id, slot + 1);
      const [x, z] = baseSlot(b, slot, map.baseRadius);
      flags.push({ id: flags.length, team, state: "home", x, y: surfaceHeight(x, z), z, carrier: -1, slot, base: b.id, timer: 0 });
    }
  }
  const spots = map.gigantic ? [...STATION_SPOTS, ...GIGANTIC_STATION_SPOTS] : STATION_SPOTS;
  const stations: Station[] = spots.map(([u, v], id) => {
    const [x, z] = fromLayout(u, v);
    return { id, x, z, cd: 0 };
  });
  return {
    rng,
    map,
    baseRadius: map.baseRadius,
    hoardRate: (HOARD_RATE * 5) / Math.max(1, opts.flagsPerTeam),
    aggro: Math.min(1, Math.sqrt(8 / opts.perTeam)),
    skill: [SKILLS.medium, rivalSkill(opts.difficulty ?? "medium", opts.perTeam)],
    difficulty: opts.difficulty ?? "medium",
    stations,
    time: 0,
    mode: opts.mode ?? "capture",
    points: [0, 0],
    timeLeft: opts.duration,
    over: false,
    players,
    flags,
    fires: [],
    bases,
    respawns: [],
    nextRespawnId: 0,
    turn: [],
    turnBack: [...players].reverse(),
    scores: [0, 0],
    events: [],
    nextFireId: 0,
  };
}

function makePlayer(id: number, team: Team, def: AnimalDef, cpu: boolean, x: number, z: number, heading: number): Player {
  return {
    id,
    team,
    def,
    cpu,
    x,
    y: surfaceHeight(x, z),
    z,
    heading,
    speed: 0,
    vy: 0,
    kx: 0,
    kz: 0,
    onSurface: true,
    medium: isWater(x, z) ? "water" : "land",
    floatLeft: def.floatTime,
    jumpWasHeld: false,
    stun: 0,
    throwCd: 0,
    grabCd: 0,
    carrying: -1,
    score: 0,
    diving: false,
    breath: tune.diveBreath,
    diveCd: 0,
    item: null,
    shieldT: 0,
    starT: 0,
    turboT: 0,
    itemHeld: 0,
    hp: tune.maxHits,
    healCd: 0,
    out: 0,
    medic: false,
    medicCd: 0,
    role: "attack",
    goalTag: "",
    dodgeT: 0,
    dodgeX: 0,
    dodgeZ: 0,
    dodgeJump: 0,
    dodgeCd: 0,
    thinkCd: 0,
    goalX: x,
    goalZ: z,
  };
}

/** Swap a player's animal in place (prototype animal picker). */
export function setAnimal(p: Player, animalId: string): void {
  const def = ANIMALS[animalId];
  if (def) {
    p.def = def;
    p.floatLeft = def.floatTime;
  }
}

/** Advance one fixed step. `human` drives player 0; CPUs think for themselves. */
export function step(m: Match, human: Input): void {
  m.events.length = 0;
  if (m.over) return;
  m.time += STEP;
  m.timeLeft -= STEP;

  // Alternate who goes first each step (moving, hits, grabs, stations) so
  // neither team wins every tie.
  if (m.turn.length !== m.players.length) m.turnBack = [...m.players].reverse();
  m.turn = Math.round(m.time / STEP) % 2 === 1 ? m.turnBack : m.players;
  for (const p of m.turn) {
    const input = p.cpu ? cpuInput(m, p) : human;
    movePlayer(m, p, input);
  }
  stepFires(m);
  stepStars(m);
  stepStations(m);
  stepRespawns(m);
  stepFlags(m);

  if (m.mode === "hoard") {
    for (const team of [0, 1] as const) {
      const held = m.flags.filter((f) => f.team === team && f.state === "home").length;
      m.points[team] += held * m.hoardRate * STEP;
      m.scores[team] = Math.min(HOARD_TARGET, Math.floor(m.points[team]));
    }
    if (m.scores[0] >= HOARD_TARGET || m.scores[1] >= HOARD_TARGET) m.timeLeft = 0;
  }

  if (m.timeLeft <= 0) {
    m.timeLeft = 0;
    m.over = true;
    const [a, b] = m.scores;
    m.events.push({ kind: "end", winner: a === b ? -1 : a > b ? 0 : 1 });
  }
}

function speedFor(p: Player): number {
  const boost = (p.turboT > 0 ? tune.turboBoost : 1) * (p.starT > 0 ? tune.starBoost : 1);
  if (p.medium === "air") return p.def.airSpeed * boost;
  if (p.medium === "water") return p.def.waterSpeed * (p.diving ? tune.diveSpeed : 1) * boost;
  return p.def.landSpeed * boost;
}

function movePlayer(m: Match, p: Player, input: Input): void {
  if (p.out > 0) {
    p.out -= STEP;
    if (p.out <= 0) respawn(m, p);
    return;
  }
  p.medicCd = Math.max(0, p.medicCd - STEP);
  if (p.hp < tune.maxHits) {
    p.healCd -= STEP;
    if (p.healCd <= 0) {
      p.hp++;
      p.healCd = tune.healTime;
    }
  }
  p.throwCd = Math.max(0, p.throwCd - STEP);
  p.grabCd = Math.max(0, p.grabCd - STEP);
  p.diveCd = Math.max(0, p.diveCd - STEP);
  p.shieldT = Math.max(0, p.shieldT - STEP);
  p.starT = Math.max(0, p.starT - STEP);
  p.turboT = Math.max(0, p.turboT - STEP);
  if (p.item) p.itemHeld += STEP;
  const stunned = p.stun > 0;
  if (stunned) p.stun = Math.max(0, p.stun - STEP);

  // Steering: turn toward the pointed direction, throttle by how far you point.
  const mag = stunned ? 0 : Math.min(1, Math.hypot(input.dirX, input.dirZ));
  if (mag > 0.05) {
    const want = Math.atan2(input.dirX, input.dirZ);
    const diff = wrapAngle(want - p.heading);
    const control = p.onSurface || p.def.cls === "air" ? 1 : 0.6;
    const maxTurn = p.def.turnRate * control * STEP * (0.5 + 0.5 * mag);
    p.heading = wrapAngle(p.heading + clamp(diff, -maxTurn, maxTurn));
  }
  // Pointing behind you slows you down while you swing round, like a stylus pull.
  const facing = mag > 0.05 ? Math.cos(wrapAngle(Math.atan2(input.dirX, input.dirZ) - p.heading)) : 0;
  const target = speedFor(p) * mag * Math.max(0.35, facing);
  const rate = target > p.speed ? tune.accel : tune.accel * 1.4;
  p.speed += clamp(target - p.speed, -rate * STEP, rate * STEP);

  // Knockback decays fast so a pop reads as a burst, not a slide.
  const kDecay = Math.exp(-3.2 * STEP);
  p.kx *= kDecay;
  p.kz *= kDecay;

  let nx = p.x + (Math.sin(p.heading) * p.speed + p.kx) * STEP;
  let nz = p.z + (Math.cos(p.heading) * p.speed + p.kz) * STEP;
  if (!inWorld(nx, nz)) {
    nx = clamp(nx, -WORLD_HALF_X, WORLD_HALF_X);
    nz = clamp(nz, -WORLD_HALF_Z, WORLD_HALF_Z);
    p.speed *= 0.5;
  }
  p.x = nx;
  p.z = nz;

  // Jump, hold to float, flyers climb.
  const jumpDown = !stunned && input.jump;
  if (jumpDown && !p.jumpWasHeld && p.onSurface) {
    if (p.diving) {
      // Leap straight out of a dive.
      p.diving = false;
      p.y = surfaceHeight(p.x, p.z);
    }
    p.vy = p.def.jumpSpeed;
    p.onSurface = false;
    m.events.push({ kind: "jump", player: p.id });
  }
  let g = tune.gravity;
  if (p.def.climb > 0 && !p.onSurface) {
    // Flyers fly for as long as Jump is held, up to a ceiling, and glide
    // down slowly once it's let go.
    const height = p.y - surfaceHeight(p.x, p.z);
    if (jumpDown) {
      if (height < tune.flyCeiling) p.vy = Math.min(p.vy + p.def.climb * STEP, 7);
      else p.vy = Math.min(p.vy, 0);
      g = height < tune.flyCeiling ? g * 0.35 : 0;
    } else if (p.vy < 0) {
      g *= 0.25;
      p.vy = Math.max(p.vy, -6);
    }
  } else if (!p.onSurface && jumpDown && p.floatLeft > 0) {
    p.floatLeft -= STEP;
    if (p.vy < 2) g *= 0.3;
  }
  p.jumpWasHeld = jumpDown;
  p.vy -= g * STEP;
  p.y += p.vy * STEP;

  const surf = surfaceHeight(p.x, p.z);
  const water = isWater(p.x, p.z);
  if (p.y <= surf) {
    if (!p.onSurface && water && p.vy < -4) m.events.push({ kind: "splash", x: p.x, z: p.z, player: p.id });
    p.y = surf;
    p.vy = 0;
    p.onSurface = true;
    p.floatLeft = p.def.floatTime;
  } else if (p.onSurface && p.y - surf < 0.6 && p.vy <= 0) {
    // Stay glued over small bumps instead of flickering into the air.
    p.y = surf;
  } else if (p.y - surf > 0.6) {
    p.onSurface = false;
  }
  p.medium = !p.onSurface && p.y - surf > 1.2 ? "air" : water ? "water" : "land";
  stepDive(m, p, !stunned && !!input.dive && water && p.onSurface);

  if (!stunned && !p.diving && input.throwPressed && p.throwCd <= 0) throwFire(m, p);
  if (!stunned && input.useItem && p.item) useItem(m, p);
  if (!stunned && input.plant && p.medic) plantRespawn(m, p);
}

function stepDive(m: Match, p: Player, want: boolean): void {
  const can = p.def.dive && p.diveCd <= 0 && p.breath > 0;
  if (want && can && !p.diving) {
    p.diving = true;
    m.events.push({ kind: "dive", x: p.x, z: p.z, player: p.id });
  } else if (p.diving && !(want && can)) {
    p.diving = false;
    if (p.breath <= 0) p.diveCd = 1.5;
    m.events.push({ kind: "surface", x: p.x, z: p.z, player: p.id });
  }
  if (p.diving) {
    p.breath = Math.max(0, p.breath - STEP);
    p.y = surfaceHeight(p.x, p.z) - tune.diveDepth;
  } else {
    p.breath = Math.min(tune.diveBreath, p.breath + STEP * 0.8);
  }
}

function throwFire(m: Match, p: Player): void {
  const d = p.def;
  p.throwCd = tune.throwCooldown * d.shotCooldown;
  if (d.bomber && !p.onSurface && p.y - surfaceHeight(p.x, p.z) > tune.bombHeight) {
    // Bombs away: falls from under the flyer, carrying a little of its speed.
    const bomb: Firecracker = {
      id: m.nextFireId++,
      owner: p.id,
      team: p.team,
      x: p.x,
      y: p.y - 0.4,
      z: p.z,
      vx: Math.sin(p.heading) * p.speed * 0.7,
      vy: -3,
      vz: Math.cos(p.heading) * p.speed * 0.7,
      skidding: false,
      life: 5,
      bomb: true,
    };
    m.fires.push(bomb);
    m.events.push({ kind: "throw", x: bomb.x, y: bomb.y, z: bomb.z, player: p.id });
    return;
  }
  launch(m, p, 0);
}

/** One firecracker off the front, turned `offset` radians from the heading. */
function launch(m: Match, p: Player, offset: number, homing = -1): void {
  const d = p.def;
  const fx = Math.sin(p.heading + offset);
  const fz = Math.cos(p.heading + offset);
  // -1 is an ordinary shot; a missile carries its target id, or -2 for none.
  const missile = homing !== -1;
  const speed = missile ? tune.missileSpeed : tune.throwSpeed * d.shotSpeed + Math.max(0, p.speed) * 0.6;
  const fire: Firecracker = {
    id: m.nextFireId++,
    owner: p.id,
    team: p.team,
    x: p.x + fx * 1.4,
    y: p.y + 1.2,
    z: p.z + fz * 1.4,
    vx: fx * speed,
    vy: missile ? 0 : tune.throwLift * d.shotLift,
    vz: fz * speed,
    skidding: false,
    life: missile ? 4 : tune.fireLife,
    bomb: false,
    homing,
  };
  m.fires.push(fire);
  m.events.push({ kind: "throw", x: fire.x, y: fire.y, z: fire.z, player: p.id });
}

function stepFires(m: Match): void {
  const keep: Firecracker[] = [];
  for (const f of m.fires) {
    f.life -= STEP;
    if (!f.skidding) {
      f.vy -= tune.gravity * STEP;
      f.y += f.vy * STEP;
    }
    f.x += f.vx * STEP;
    f.z += f.vz * STEP;
    const surf = surfaceHeight(f.x, f.z);
    if (f.bomb) {
      if (f.y <= surf + 0.3) explode(m, f, surf);
      else if (inWorld(f.x, f.z) && f.life > 0) keep.push(f);
      continue;
    }
    const missile = f.homing !== undefined && f.homing !== -1;
    if (missile) {
      steerMissile(m, f);
      // Paper missiles glide at chest height over ground and water alike.
      f.vy = 0;
      f.y = surf + 1;
    } else if (!f.skidding && f.y <= surf + 0.3) {
      // Landed: skid along the ground and the water like a shell.
      f.skidding = true;
      f.vy = 0;
    }
    if (f.skidding && !missile) {
      f.y = surf + 0.3;
      const k = Math.exp(-tune.skidFriction * STEP);
      f.vx *= k;
      f.vz *= k;
    }
    let hit = false;
    for (const p of m.turn) {
      if (p.team === f.team || p.stun > 0 || p.diving) continue;
      const dx = p.x - f.x;
      const dz = p.z - f.z;
      const dy = p.y + 0.7 - f.y;
      if (dx * dx + dz * dz + dy * dy < tune.hitRadius * tune.hitRadius) {
        pop(m, p, f.owner, f.vx, f.vz);
        hit = true;
        break;
      }
    }
    if (hit) continue;
    if (f.life <= 0 || !inWorld(f.x, f.z)) {
      m.events.push({ kind: "fizzle", x: f.x, y: f.y, z: f.z });
      continue;
    }
    keep.push(f);
  }
  m.fires = keep;
}

/** Turn a missile toward its target, picking a new one if the old is down. */
function steerMissile(m: Match, f: Firecracker): void {
  let t = f.homing !== undefined && f.homing >= 0 ? m.players[f.homing] : undefined;
  if (!t || t.stun > 0 || t.diving) {
    t = missileTarget(m, f.team, f.x, f.z, Math.atan2(f.vx, f.vz));
    f.homing = t ? t.id : -2;
  }
  if (!t) return;
  const heading = Math.atan2(f.vx, f.vz);
  const want = Math.atan2(t.x - f.x, t.z - f.z);
  const turn = clamp(wrapAngle(want - heading), -tune.missileTurn * STEP, tune.missileTurn * STEP);
  const speed = Math.hypot(f.vx, f.vz);
  f.vx = Math.sin(heading + turn) * speed;
  f.vz = Math.cos(heading + turn) * speed;
}

/** The enemy a missile should chase: a flag carrier first, else the nearest ahead. */
function missileTarget(m: Match, team: Team, x: number, z: number, heading: number): Player | undefined {
  let best: Player | undefined;
  let bestScore = Infinity;
  for (const o of m.players) {
    if (o.team === team || o.stun > 0 || o.diving) continue;
    const d = Math.hypot(o.x - x, o.z - z);
    if (d > 45) continue;
    const ahead = Math.cos(wrapAngle(Math.atan2(o.x - x, o.z - z) - heading));
    const score = d * (1.6 - ahead * 0.6) * (o.carrying >= 0 ? 0.4 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

function explode(m: Match, f: Firecracker, surf: number): void {
  m.events.push({ kind: "boom", x: f.x, y: surf, z: f.z, player: f.owner });
  for (const p of m.players) {
    if (p.team === f.team || p.stun > 0 || p.diving) continue;
    const dx = p.x - f.x;
    const dz = p.z - f.z;
    if (dx * dx + dz * dz < tune.bombRadius * tune.bombRadius && Math.abs(p.y - surf) < 3) pop(m, p, f.owner, dx, dz);
  }
}

function protectedFrom(p: Player): boolean {
  return p.shieldT > 0 || p.starT > 0;
}

/**
 * Hit `p` from along (dirX, dirZ). Every animal takes tune.maxHits hits:
 * the earlier ones make it flinch and stagger back, the last one pops it
 * out of the match for tune.outTime seconds, dropping any flag, before it
 * comes back at a respawn point. Shield and Star block hits. A power 2 hit
 * (Blast) counts twice. Returns whether the hit landed.
 */
function pop(m: Match, p: Player, by: number, dirX: number, dirZ: number, power = 1): boolean {
  if (p.out > 0) return false;
  if (protectedFrom(p)) {
    m.events.push({ kind: "block", x: p.x, y: p.y + 0.8, z: p.z, player: p.id });
    return false;
  }
  p.hp = Math.max(0, p.hp - (power >= 2 ? 2 : 1));
  p.healCd = tune.healTime;
  const owner = m.players[by];
  const len = Math.hypot(dirX, dirZ) || 1;
  const t = p.def.toughness;
  if (p.hp > 0) {
    // A flinch: a short stagger and a shove, but the animal keeps going.
    p.stun = tune.flinchTime * t;
    p.vy = tune.popLift * 0.3;
    p.onSurface = false;
    const push = tune.popPush * 0.5 * (0.5 + 0.5 * t) * power;
    p.kx = (dirX / len) * push;
    p.kz = (dirZ / len) * push;
    p.speed *= 0.5;
    if (owner) owner.score += 2;
    m.events.push({ kind: "hit", x: p.x, y: p.y + 0.8, z: p.z, player: p.id, by, hp: p.hp });
    return true;
  }
  // Knocked out: drop the flag and leave the field for a moment.
  if (owner) owner.score += 8;
  m.events.push({ kind: "pop", x: p.x, y: p.y + 0.8, z: p.z, player: p.id, by });
  m.events.push({ kind: "ko", x: p.x, y: p.y + 0.8, z: p.z, player: p.id, by });
  dropFlag(m, p);
  p.out = tune.outTime;
  p.stun = tune.outTime;
  p.speed = 0;
  p.kx = p.kz = p.vy = 0;
  p.diving = false;
  p.shieldT = p.starT = p.turboT = 0;
  return true;
}

/**
 * Bring a knocked out animal back at the closest of its team's bases and
 * respawn flags to where it fell, with full health and a moment of shield.
 */
function respawn(m: Match, p: Player): void {
  const spots: Array<{ x: number; z: number; r: number }> = [
    ...m.bases.filter((b) => b.team === p.team).map((b) => ({ x: b.x, z: b.z, r: m.baseRadius + 2 })),
    ...m.respawns.filter((f) => f.team === p.team).map((f) => ({ x: f.x, z: f.z, r: 2 })),
  ];
  let best = spots[0];
  let bestD = Infinity;
  for (const sp of spots) {
    const d = (sp.x - p.x) ** 2 + (sp.z - p.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = sp;
    }
  }
  // Land in a dry spot around it, facing the middle of the island.
  let x = best.x;
  let z = best.z;
  for (let i = 0; i < 8; i++) {
    const a = m.rng() * Math.PI * 2;
    const tx = best.x + Math.cos(a) * best.r;
    const tz = best.z + Math.sin(a) * best.r;
    if (!isWater(tx, tz) && inWorld(tx, tz)) {
      x = tx;
      z = tz;
      break;
    }
  }
  p.x = x;
  p.z = z;
  p.y = surfaceHeight(x, z);
  p.vy = 0;
  p.kx = p.kz = 0;
  p.speed = 0;
  p.onSurface = true;
  p.medium = isWater(x, z) ? "water" : "land";
  p.heading = Math.atan2(-x, -z);
  p.hp = tune.maxHits;
  p.healCd = 0;
  p.out = 0;
  p.stun = 0;
  p.breath = tune.diveBreath;
  p.shieldT = tune.spawnShield;
  p.grabCd = 0.5;
  m.events.push({ kind: "respawn", x, y: p.y, z, player: p.id });
}

/** True where a medic may plant: dry ground, outside the enemy's bases. */
export function canPlant(m: Match, p: Player): boolean {
  if (!p.medic || p.medicCd > 0 || p.out > 0) return false;
  if (isWater(p.x, p.z) || !p.onSurface) return false;
  return !m.bases.some((b) => b.team !== p.team && Math.hypot(b.x - p.x, b.z - p.z) < m.baseRadius + 6);
}

function plantRespawn(m: Match, p: Player): void {
  if (!canPlant(m, p)) return;
  // Each medic keeps a couple up; a new one replaces their oldest.
  const mine = m.respawns.filter((f) => f.owner === p.id);
  if (mine.length >= tune.medicFlags) m.respawns.splice(m.respawns.indexOf(mine[0]), 1);
  const flag: RespawnFlag = { id: m.nextRespawnId++, team: p.team, owner: p.id, x: p.x, z: p.z };
  m.respawns.push(flag);
  p.medicCd = tune.medicCooldown;
  p.score += 3;
  m.events.push({ kind: "plant", x: p.x, z: p.z, player: p.id, flag: flag.id });
}

/** Enemies who drive into a respawn flag knock it down. */
function stepRespawns(m: Match): void {
  for (let i = m.respawns.length - 1; i >= 0; i--) {
    const f = m.respawns[i];
    const surf = surfaceHeight(f.x, f.z);
    const by = m.players.find(
      (o) => o.team !== f.team && o.out <= 0 && o.stun <= 0 && Math.hypot(o.x - f.x, o.z - f.z) < tune.respawnRadius && o.y - surf < 2.5,
    );
    if (!by) continue;
    m.respawns.splice(i, 1);
    by.score += 3;
    m.events.push({ kind: "unplant", x: f.x, z: f.z, flag: f.id, by: by.id });
  }
}

/** A Star pops any enemy it bumps into. */
function stepStars(m: Match): void {
  for (const p of m.players) {
    if (p.starT <= 0 || p.stun > 0) continue;
    for (const o of m.players) {
      if (o.team === p.team || o.stun > 0 || o.diving) continue;
      const dx = o.x - p.x;
      const dz = o.z - p.z;
      if (dx * dx + dz * dz < 3.2 && Math.abs(o.y - p.y) < 2) pop(m, o, p.id, dx, dz, 1.3);
    }
  }
}

/** Drive through a ready station with empty hands to get an item. */
function stepStations(m: Match): void {
  for (const st of m.stations) {
    if (st.cd > 0) {
      st.cd = Math.max(0, st.cd - STEP);
      continue;
    }
    const surf = surfaceHeight(st.x, st.z);
    for (const p of m.turn) {
      if (p.item || p.stun > 0) continue;
      const dx = p.x - st.x;
      const dz = p.z - st.z;
      if (dx * dx + dz * dz > tune.stationRadius * tune.stationRadius || p.y - surf > 3) continue;
      p.item = rollItem(m);
      p.itemHeld = 0;
      st.cd = tune.stationCooldown;
      m.events.push({ kind: "item", x: st.x, z: st.z, player: p.id, item: p.item, station: st.id });
      break;
    }
  }
}

function rollItem(m: Match): ItemKind {
  let total = 0;
  for (const k of ITEM_KINDS) total += ITEMS[k].weight;
  let r = m.rng() * total;
  for (const k of ITEM_KINDS) {
    r -= ITEMS[k].weight;
    if (r <= 0) return k;
  }
  return "turbo";
}

/** Give `p` a power up directly (tests and the CPU sandbox). */
export function giveItem(p: Player, item: ItemKind): void {
  p.item = item;
  p.itemHeld = 0;
}

function useItem(m: Match, p: Player): void {
  const item = p.item!;
  p.item = null;
  p.itemHeld = 0;
  if (p.diving && item !== "shield" && item !== "star") {
    p.diving = false;
    p.y = surfaceHeight(p.x, p.z);
  }
  m.events.push({ kind: "use", x: p.x, y: p.y, z: p.z, player: p.id, item });
  switch (item) {
    case "shield":
      p.shieldT = tune.itemTime;
      break;
    case "star":
      p.starT = tune.itemTime;
      break;
    case "turbo":
      p.turboT = tune.turboTime;
      break;
    case "triple":
      for (const off of [-0.26, 0, 0.26]) launch(m, p, off);
      p.throwCd = tune.throwCooldown * p.def.shotCooldown;
      break;
    case "missile": {
      const t = missileTarget(m, p.team, p.x, p.z, p.heading);
      launch(m, p, 0, t ? t.id : -2);
      break;
    }
    case "superjump":
      p.vy = tune.superJump;
      p.onSurface = false;
      p.floatLeft = p.def.floatTime + 0.6;
      m.events.push({ kind: "jump", player: p.id });
      break;
    case "lightning":
      for (const o of m.players) {
        if (o.team === p.team || o.stun > 0 || o.diving) continue;
        if (Math.hypot(o.x - p.x, o.z - p.z) > tune.lightningRadius) continue;
        if (!protectedFrom(o)) m.events.push({ kind: "zap", x: o.x, y: o.y, z: o.z, player: o.id, by: p.id });
        pop(m, o, p.id, o.x - p.x, o.z - p.z);
      }
      break;
    case "blast":
      for (const o of m.players) {
        if (o.team === p.team || o.stun > 0 || o.diving) continue;
        if (Math.hypot(o.x - p.x, o.z - p.z) > tune.blastRadius) continue;
        pop(m, o, p.id, o.x - p.x, o.z - p.z, 2);
      }
      break;
  }
}

function dropFlag(m: Match, p: Player): void {
  if (p.carrying < 0) return;
  const flag = m.flags[p.carrying];
  p.carrying = -1;
  p.grabCd = 0.8;
  flag.state = "dropped";
  flag.timer = 12;
  flag.carrier = -1;
  flag.x = p.x;
  flag.z = p.z;
  flag.y = surfaceHeight(p.x, p.z);
  m.events.push({ kind: "drop", x: flag.x, y: flag.y, z: flag.z, player: p.id });
}

/** Rings of flag slots in a base: 8 around, 4 inside, then wider rings outward. */
const SLOT_RINGS: Array<[radius: number, count: number]> = [
  [2.7, 8],
  [1.3, 4],
  [4.0, 12],
  [5.3, 16],
  [6.5, 20],
  [7.7, 24],
];

/** Where flag number `slot` stands in a base, kept inside the pad. */
export function baseSlot(b: Base, slot: number, padRadius = 4.2): [number, number] {
  let k = slot;
  for (const [r0, count] of SLOT_RINGS) {
    if (k < count) {
      const r = Math.min(r0, padRadius - 0.5);
      // The north team's slots turn half a circle, so both bases mirror.
      const a = (k / count) * Math.PI * 2 + Math.PI / count + (b.team === 1 ? Math.PI : 0);
      return [b.x + Math.cos(a) * r, b.z + Math.sin(a) * r];
    }
    k -= count;
  }
  return [b.x, b.z];
}

function placeHome(m: Match, flag: Flag, base: Base): void {
  const taken = new Set(m.flags.filter((f) => f !== flag && f.base === base.id && f.state === "home").map((f) => f.slot));
  let slot = 0;
  while (taken.has(slot)) slot++;
  const [x, z] = baseSlot(base, slot, m.baseRadius);
  flag.team = base.team;
  flag.base = base.id;
  flag.state = "home";
  flag.slot = slot;
  flag.carrier = -1;
  flag.x = x;
  flag.z = z;
  flag.y = surfaceHeight(x, z);
}

function stepFlags(m: Match): void {
  for (const flag of m.flags) {
    if (flag.state === "carried") {
      const c = m.players[flag.carrier];
      flag.x = c.x;
      flag.y = c.y;
      flag.z = c.z;
      const base = nearestBase(m, c.team, c.x, c.z);
      if (Math.hypot(c.x - base.x, c.z - base.z) < m.baseRadius) {
        c.carrying = -1;
        c.score += 25;
        // In Hoard the flag pays out by sitting in the base instead.
        if (m.mode === "capture") m.scores[c.team] += 1;
        placeHome(m, flag, base);
        m.events.push({ kind: "bank", x: base.x, y: surfaceHeight(base.x, base.z), z: base.z, player: c.id, team: c.team });
      }
      continue;
    }
    if (flag.state === "dropped") {
      flag.timer -= STEP;
      if (flag.timer <= 0) {
        sendHome(m, flag, -1);
        continue;
      }
    }
    for (const p of m.turn) {
      if (p.stun > 0) continue;
      const dx = p.x - flag.x;
      const dz = p.z - flag.z;
      if (dx * dx + dz * dz >= tune.grabRadius * tune.grabRadius || Math.abs(p.y - flag.y) >= 2.5) continue;
      if (p.team === flag.team) {
        // Owners can't pick up their own flag, but touching a dropped one saves it.
        if (flag.state !== "dropped") continue;
        p.score += 5;
        sendHome(m, flag, p.id);
        break;
      }
      if (p.carrying >= 0 || p.grabCd > 0) continue;
      flag.state = "carried";
      flag.carrier = p.id;
      p.carrying = flag.id;
      m.events.push({ kind: "grab", x: flag.x, y: flag.y, z: flag.z, player: p.id });
      break;
    }
  }
}

function sendHome(m: Match, flag: Flag, by: number): void {
  const at = { x: flag.x, y: flag.y, z: flag.z };
  placeHome(m, flag, m.bases[flag.base]);
  m.events.push({ kind: "return", ...at, player: by, team: flag.team });
}

/** The closest base of `team` to a spot; where carriers head to bank. */
export function nearestBase(m: Match, team: Team, x: number, z: number): Base {
  let best = m.bases[team];
  let bestD = Infinity;
  for (const b of m.bases) {
    if (b.team !== team) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/**
 * CPU brains. Every few tenths of a second a CPU weighs what it could do
 * (steal, carry home, chase a thief, save a dropped flag, fight, grab a
 * power up, back off to heal, guard, escort, knock down a respawn flag) and
 * picks the best, the way a player would: by distance, danger, the score and
 * the clock. Between decisions it steers, dodges shots it sees coming and
 * throws when a target lines up. How well it does each of those comes from
 * its team's Skill, so Easy CPUs react late, choose loosely and miss more.
 */
function cpuInput(m: Match, p: Player): Input {
  const sk = m.skill[p.team];
  p.thinkCd -= STEP;
  if (p.thinkCd <= 0) {
    p.thinkCd = sk.react * (0.8 + m.rng() * 0.4);
    const [gx, gz] = cpuGoal(m, p, sk);
    [p.goalX, p.goalZ] = p.def.cls === "land" ? viaBridge(p, gx, gz) : [gx, gz];
  }
  let dx = p.goalX - p.x;
  let dz = p.goalZ - p.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  // Carriers and the badly hurt steer around enemies in the way.
  if (sk.tactics > 0 && (p.carrying >= 0 || p.goalTag === "retreat")) {
    let ax = 0;
    let az = 0;
    for (const o of m.players) {
      if (o.team === p.team || o.stun > 0) continue;
      const rx = p.x - o.x;
      const rz = p.z - o.z;
      const r2 = rx * rx + rz * rz;
      if (r2 > 100 || r2 < 0.01) continue;
      ax += (rx / r2) * 4;
      az += (rz / r2) * 4;
    }
    dx += ax * sk.tactics;
    dz += az * sk.tactics;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
  }
  let throttle = Math.min(1, d / 4) * sk.pace;
  let jump = false;
  const fwdX = Math.sin(p.heading);
  const fwdZ = Math.cos(p.heading);

  // Dodge: notice a shot coming (or not), then hop it or sidestep.
  p.dodgeCd -= STEP;
  const shot = p.dodgeCd <= 0 && !p.diving ? incoming(m, p) : undefined;
  if (shot) {
    p.dodgeCd = 0.7;
    if (m.rng() < sk.dodge) {
      const low = shot.skidding || shot.y - surfaceHeight(shot.x, shot.z) < 1.4;
      if (low && p.onSurface && p.def.cls !== "water") p.dodgeJump = 0.15;
      else {
        // Step off the shot's line, to whichever side is already closer.
        const v = Math.hypot(shot.vx, shot.vz) || 1;
        const side = Math.sign((p.x - shot.x) * shot.vz - (p.z - shot.z) * shot.vx) || 1;
        p.dodgeX = (shot.vz / v) * side;
        p.dodgeZ = (-shot.vx / v) * side;
        p.dodgeT = 0.35;
      }
    }
  }
  if (p.dodgeT > 0) {
    p.dodgeT -= STEP;
    dx = dx * 0.3 + p.dodgeX;
    dz = dz * 0.3 + p.dodgeZ;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    throttle = sk.pace;
  }
  if (p.dodgeJump > 0) {
    p.dodgeJump -= STEP;
    jump = true;
  }

  // Throw when a target lines up; better CPUs aim where it's going.
  let throwPressed = false;
  if (p.throwCd <= 0 && !p.diving) {
    for (const o of m.players) {
      if (o.team === p.team || o.stun > 0 || o.diving) continue;
      const ox = o.x - p.x;
      const oz = o.z - p.z;
      const od = Math.hypot(ox, oz);
      if (od > 16 || od < 1) continue;
      let ax = o.x;
      let az = o.z;
      if (sk.leads) {
        const t = od / tune.throwSpeed;
        ax += (Math.sin(o.heading) * o.speed + o.kx) * t;
        az += (Math.cos(o.heading) * o.speed + o.kz) * t;
      }
      const off = Math.abs(wrapAngle(Math.atan2(ax - p.x, az - p.z) - p.heading));
      if (off > sk.aimTol) continue;
      // Big crowds would turn into a wall of firecrackers, so each CPU throws less.
      const keen = o.carrying >= 0 ? 2 : o.hp === 1 ? 1.4 : 1;
      throwPressed = m.rng() < sk.throwRate * keen * m.aggro;
      break;
    }
  }
  if (p.def.cls === "air" && d > 18) {
    // Flyers take to the air for long trips: tap off the ground, then hold.
    jump = p.onSurface ? !p.jumpWasHeld : true;
    if (p.def.bomber && !p.onSurface) throwPressed = enemyBelow(m, p);
  } else if (!jump) {
    // Hop small rises and channels now and then.
    jump = p.onSurface ? groundHeight(p.x + fwdX * 3, p.z + fwdZ * 3) - p.y > 1.2 || m.rng() < 0.004 : p.vy > 0;
  }
  // Swimmers duck under incoming firecrackers, or to sneak a flag home.
  const dive = p.def.dive && ((threatened(m, p) && m.rng() < sk.dodge + 0.2) || (p.carrying >= 0 && p.breath > 2.5));
  const useItem = p.item !== null && (sk.itemSmart ? cpuWantsItem(m, p, d) : p.itemHeld > 2 + ((p.id % (m.players.length / 2)) % 5));
  const plant = p.medic && cpuWantsPlant(m, p);
  return { dirX: dx * throttle, dirZ: dz * throttle, jump: jump && !dive, throwPressed, dive, useItem, plant };
}

/** An enemy shot about to pass close by, if there is one. */
function incoming(m: Match, p: Player): Firecracker | undefined {
  for (const f of m.fires) {
    if (f.team === p.team) continue;
    const rx = p.x - f.x;
    const rz = p.z - f.z;
    if (rx * rx + rz * rz > 100) continue;
    const v = Math.hypot(f.vx, f.vz);
    if (v < 1) continue;
    const closing = (rx * f.vx + rz * f.vz) / v;
    if (closing <= 0 || closing / v > 0.7) continue;
    if (Math.abs(rx * f.vz - rz * f.vx) / v < 1.8) return f;
  }
  return undefined;
}

/** Medics plant once they're out of their homeland and well clear of any other spawn point. */
function cpuWantsPlant(m: Match, p: Player): boolean {
  if (!canPlant(m, p) || landOf(p.z) === p.team) return false;
  const far = 30 * mapScale();
  const clear = (x: number, z: number) => Math.hypot(x - p.x, z - p.z) > far;
  return m.bases.every((b) => b.team !== p.team || clear(b.x, b.z)) && m.respawns.every((f) => f.team !== p.team || clear(f.x, f.z));
}

/** When a CPU fires its power up. Anything held too long gets used anyway. */
function cpuWantsItem(m: Match, p: Player, goalDist: number): boolean {
  if (p.itemHeld > 9) return true;
  if (p.itemHeld < 0.4) return false;
  const near = (r: number) => countEnemies(m, p, r);
  switch (p.item) {
    case "shield":
    case "star":
      return threatened(m, p) || (p.carrying >= 0 && near(16) > 0) || (p.item === "star" && near(10) > 1);
    case "turbo":
      return p.carrying >= 0 || goalDist > 40;
    case "triple":
    case "missile": {
      const t = missileTarget(m, p.team, p.x, p.z, p.heading);
      return !!t && Math.hypot(t.x - p.x, t.z - p.z) < (p.item === "missile" ? 35 : 15);
    }
    case "superjump": {
      // Leap channels and lakes on the way to the goal.
      const ahead = isWater(p.x + Math.sin(p.heading) * 6, p.z + Math.cos(p.heading) * 6);
      return p.onSurface && p.medium === "land" && ahead && p.def.cls !== "water";
    }
    case "lightning":
      return near(tune.lightningRadius) > 1 || m.players.some((o) => o.team !== p.team && o.carrying >= 0 && o.stun <= 0 && Math.hypot(o.x - p.x, o.z - p.z) < tune.lightningRadius);
    case "blast":
      return near(tune.blastRadius - 1) > 0;
    default:
      return false;
  }
}

function countEnemies(m: Match, p: Player, r: number): number {
  let n = 0;
  for (const o of m.players) if (o.team !== p.team && o.stun <= 0 && !o.diving && Math.hypot(o.x - p.x, o.z - p.z) < r) n++;
  return n;
}

function threatened(m: Match, p: Player): boolean {
  return m.fires.some((f) => f.team !== p.team && Math.hypot(f.x - p.x, f.z - p.z) < 7);
}

function enemyBelow(m: Match, p: Player): boolean {
  return m.players.some((o) => o.team !== p.team && o.stun <= 0 && !o.diving && Math.hypot(o.x - p.x, o.z - p.z) < 3.5);
}

interface Option {
  tag: string;
  score: number;
  x: number;
  z: number;
}

/**
 * Pick the best thing to do now. Each option gets a score from how much it
 * matters, minus how far away it is, plus a little randomness (more for
 * weaker CPUs) and a bonus for sticking with the current plan.
 */
function cpuGoal(m: Match, p: Player, sk: Skill): [number, number] {
  const s = mapScale();
  const enemyTeam: Team = p.team === 0 ? 1 : 0;
  const near = (o: { x: number; z: number }) => Math.hypot(o.x - p.x, o.z - p.z);
  // In tens of meters at this map's size, so scores read the same on every map.
  const far = (o: { x: number; z: number }) => near(o) / (10 * s);
  const shared = (o: { x: number; z: number }, max: number) => sk.coord === 0 || fewCloser(m, p, o, Math.max(1, Math.round(max * sk.coord / 3)));
  const opts: Option[] = [];
  const add = (tag: string, score: number, x: number, z: number) => opts.push({ tag, score, x, z });

  if (p.carrying >= 0) {
    // Head for the closest base, or with tactics the one fewer enemies watch.
    let best = nearestBase(m, p.team, p.x, p.z);
    if (sk.tactics > 0.5) {
      let bestCost = Infinity;
      for (const b of m.bases) {
        if (b.team !== p.team) continue;
        const cost = near(b) + 12 * s * countNear(m, enemyTeam, b.x, b.z, 15 * s);
        if (cost < bestCost) {
          bestCost = cost;
          best = b;
        }
      }
    }
    p.goalTag = "carry";
    return [best.x, best.z];
  }

  // Reading the game: trailing late means push, leading late means hold.
  const own = m.mode === "hoard" ? m.points[p.team] : m.scores[p.team];
  const theirs = m.mode === "hoard" ? m.points[enemyTeam] : m.scores[enemyTeam];
  const gap = m.mode === "hoard" ? (theirs - own) / 150 : (theirs - own) / 2;
  const late = m.mode === "hoard" ? Math.max(own, theirs) / HOARD_TARGET : 1 - Math.min(1, m.timeLeft / 90);
  const push = clamp(gap, -1, 1) * (0.4 + 0.6 * late) * sk.tactics;
  const attack = p.role === "attack" || p.role === "medic";
  const defend = p.role === "defend";

  const enemies = m.players.filter((o) => o.team !== p.team && o.stun <= 0);
  const thieves = enemies.filter((o) => o.carrying >= 0 && m.flags[o.carrying].team === p.team);
  for (const o of thieves) {
    if (!shared(o, 3)) continue;
    const [lx, lz] = lead(o);
    add("chase", (defend ? 100 : 88) + (m.mode === "hoard" ? 8 : 0) - 5 * far(o), lx, lz);
  }
  for (const f of m.flags) {
    if (f.state !== "dropped") continue;
    if (f.team === p.team) {
      if (shared(f, 2)) add("save", (defend ? 92 : 82) - 6 * far(f), f.x, f.z);
    } else add("prize", 95 - 6 * far(f), f.x, f.z);
  }

  // Back off at one hit left and let it heal, near friends or a station.
  if (sk.cautious && p.hp === 1 && countNear(m, enemyTeam, p.x, p.z, 12) > 0) {
    let spot = { x: m.bases[p.team].x, z: m.bases[p.team].z };
    let bestD = Infinity;
    for (const b of m.bases) if (b.team === p.team && near(b) < bestD) [spot, bestD] = [b, near(b)];
    for (const f of m.respawns) if (f.team === p.team && near(f) < bestD) [spot, bestD] = [f, near(f)];
    add("retreat", 78, spot.x, spot.z);
  }

  // Steal: the nearest prize, or with tactics the base fewest guard.
  let stealBest: Flag | undefined;
  let stealCost = Infinity;
  for (const f of m.flags) {
    if (f.team === p.team || f.state !== "home") continue;
    const guards = sk.tactics > 0.5 ? countNear(m, enemyTeam, f.x, f.z, 15 * s) * 12 * s : 0;
    // Hoard: hit the base holding the most, it pays them the most.
    const pile = m.mode === "hoard" ? m.flags.filter((g) => g.base === f.base && g.state === "home").length * 3 * s : 0;
    const cost = near(f) + guards - pile;
    if (cost < stealCost) {
      stealCost = cost;
      stealBest = f;
    }
  }
  if (stealBest) add("steal", (attack ? 62 : 22) * (1 + 0.35 * push) - 2 * (stealCost / (10 * s)), stealBest.x, stealBest.z);

  // Fight anyone close, especially a hurt one; defenders hunt raiders at home.
  for (const o of enemies) {
    const d = near(o);
    if (o.carrying >= 0 || d > 22) continue;
    const raider = defend && landOf(o.z) === p.team;
    if (!shared(o, raider ? 1 : 2)) continue;
    const [lx, lz] = lead(o);
    add("fight", (raider ? 72 : 44) + (o.hp === 1 ? 10 : 0) - d * 1.2, lx, lz);
  }
  if (defend) {
    for (const o of enemies) {
      if (o.carrying >= 0 || landOf(o.z) !== p.team || near(o) > 30 * s || !shared(o, 1)) continue;
      const [lx, lz] = lead(o);
      add("raider", 66 - 3 * far(o), lx, lz);
    }
  }

  if (!p.item) {
    for (const st of m.stations) if (st.cd <= 0 && near(st) < 25 * s) add("station", 46 - 1.5 * (near(st) / s), st.x, st.z);
  }
  for (const f of m.respawns) {
    if (f.team !== p.team && near(f) < 20 * s) add("unplant", 56 - 1.5 * (near(f) / s), f.x, f.z);
  }

  // Escort a teammate carrying a flag home: run just ahead and clear the way.
  if (!defend) {
    for (const o of m.players) {
      if (o.team !== p.team || o.carrying < 0 || o.stun > 0 || near(o) > 30 * s || !shared(o, 2)) continue;
      const goal = nearestBase(m, p.team, o.x, o.z);
      const hx = goal.x - o.x;
      const hz = goal.z - o.z;
      const hd = Math.hypot(hx, hz) || 1;
      add("escort", 56 - 4 * far(o), o.x + (hx / hd) * 6, o.z + (hz / hd) * 6);
    }
  }

  if (p.role === "medic") {
    // Follow the teammate furthest into enemy ground, a little behind them.
    const enemyZ = m.bases[enemyTeam].z;
    let front: Player | undefined;
    for (const t of m.players) {
      if (t.team !== p.team || t === p || t.out > 0 || t.role === "defend" || t.medic) continue;
      if (!front || Math.abs(t.z - enemyZ) < Math.abs(front.z - enemyZ)) front = t;
    }
    if (front) add("follow", 64, front.x, front.z - Math.sign(enemyZ) * 8 * s);
  }

  // Each defender minds one base: stand guard in a line in front of it.
  const ownBases = m.bases.filter((b) => b.team === p.team);
  // Counted within the team and mirrored in x, so both sides post the same way.
  const idx = p.id % (m.players.length / 2);
  const post = ownBases[idx % ownBases.length];
  const slot = ((Math.floor(idx / ownBases.length) % 5) - 2) * (p.team === 0 ? 1 : -1);
  add("guard", (defend ? 52 : 12) * (1 - 0.4 * push), post.x + slot * 5 * s, post.z - Math.sign(post.z) * 14 * s);

  let best: Option | undefined;
  let bestScore = -Infinity;
  for (const o of opts) {
    const score = o.score + m.rng() * sk.noise + (o.tag === p.goalTag ? 8 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  if (!best) return [0, m.bases[enemyTeam].z * 0.6];
  p.goalTag = best.tag;
  return [best.x, best.z];
}

function countNear(m: Match, team: Team, x: number, z: number, r: number): number {
  let n = 0;
  for (const o of m.players) if (o.team === team && o.stun <= 0 && Math.hypot(o.x - x, o.z - z) < r) n++;
  return n;
}

/** True when fewer than `max` teammates are already closer to `o` than `p` is. */
function fewCloser(m: Match, p: Player, o: { x: number; z: number }, max: number): boolean {
  const d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2;
  let n = 0;
  for (const t of m.players) {
    if (t === p || t.team !== p.team || t.stun > 0 || t === o) continue;
    if ((o.x - t.x) ** 2 + (o.z - t.z) ** 2 < d && ++n >= max) return false;
  }
  return true;
}

function lead(o: Player): [number, number] {
  return [o.x + Math.sin(o.heading) * 3, o.z + Math.cos(o.heading) * 3];
}

/** Route a land animal over the best bridge when its goal is across a channel. */
function viaBridge(p: Player, gx: number, gz: number): [number, number] {
  const s = mapScale();
  let best: [number, number] | null = null;
  let bestGap = Infinity;
  for (const g of [ZONE_EDGE, -ZONE_EDGE]) {
    const away = Math.abs(p.z - g);
    if ((p.z - g) * (gz - g) >= 0 || away < 5 || away >= bestGap) continue;
    // The bridge closest to the straight line from here to the goal.
    const t = (g - p.z) / (gz - p.z || 1);
    const crossX = p.x + (gx - p.x) * Math.max(0, Math.min(1, t));
    let bx = BRIDGES[0];
    for (const b of BRIDGES) {
      // On a tie each team takes its own side, so the map stays mirrored.
      const gap = Math.abs(b - crossX) - Math.abs(bx - crossX);
      if (gap < -1e-6 || (gap < 1e-6 && (p.team === 0 ? b < bx : b > bx))) bx = b;
    }
    // Line up with the bridge first, then drive across it.
    best = away > 11 * s ? [bx, g + Math.sign(p.z - g) * 9 * s] : [bx, g];
    bestGap = away;
  }
  return best ?? [gx, gz];
}

function nearest<T extends { x: number; z: number }>(p: Player, list: T[], maxD: number): T | undefined {
  let best: T | undefined;
  let bestD = maxD;
  for (const o of list) {
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
