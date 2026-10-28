/**
 * The match simulation. No Three.js here: plain numbers stepped at a fixed
 * 60 Hz, so a seed replays the same match and the tests can run it headless.
 */
import { ANIMALS, type AnimalDef, type Style, flies } from "./animals";
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
  isLava,
  isWater,
  landOf,
  mapFor,
  mapScale,
  outposts,
  setMap,
  setWorld,
  surfaceHeight,
} from "./terrain";
import { type WorldDef, worldById } from "./worlds";
import { PLANS, type TeamBrain, newBrain, pickPlan, switchPlan } from "./plans";

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
  /** A flyer's bomb pops everyone this close to where it lands, twice as hard inside bombCore, and takes bombReload seconds to load. */
  bombRadius: 6,
  bombCore: 2.5,
  bombReload: 30,
  /**
   * A flyer's confetti gun: shots a second, their speed and life, and how many
   * confetti hits make one hit. Firing heats it up; gunHeat seconds of fire
   * overheat it, and it then cools for gunCool seconds before it fires again.
   */
  confettiRate: 7,
  confettiSpeed: 26,
  confettiLife: 0.55,
  confettiStings: 5,
  gunHeat: 7,
  gunCool: 3,
  /** How close a confetti shot must pass to sting, and how the gun aims: it locks on to an enemy within this many radians of straight ahead, or angles down to chest height this far ahead. */
  confettiReach: 1.4,
  gunLockCone: 0.45,
  gunAimDist: 10,
  /** How hard locked-on confetti bends toward its target, per second. */
  confettiSeek: 8,
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
  /** Flyers cruise this high over the ground or water: low enough to grab flags and items, and to be hit. */
  flyHeight: 2.2,
  /** Flyers never slow below this share of their top speed. */
  flyMinSpeed: 0.35,
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
  /** Frost Floe: how fast your slide turns to follow you (higher grips more). */
  iceGrip: 1.6,
  /** Lava Loop: a burn's cooldown, hop and shove back toward land. */
  burnCooldown: 1.1,
  burnLift: 9,
  burnPush: 13,
  /** Storm Spire: wind strength, lightning's warning and how wide it hits. */
  windSpeed: 4.5,
  strikeWarn: 1.2,
  strikeRadius: 3.5,
  /** Capture and Playful: a tie at the buzzer plays on this long for a winning capture. */
  overtime: 120,
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
  /** Held: a flyer fires its confetti gun. */
  fire?: boolean;
}

export const NO_INPUT: Input = { dirX: 0, dirZ: 0, jump: false, throwPressed: false, dive: false, useItem: false, plant: false, fire: false };

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
  /** Medics plant respawn flags; guardians start out as defenders. Day to day jobs come from the team plan (job). */
  role: "attack" | "defend" | "medic";
  /** The job the team plan gave this CPU, and who or what it's for (a player or flag id, or -1). */
  job: Job;
  jobTarget: number;
  /** Raiders: which side they come in from (-1 left, 0 middle, 1 right, as seen from home). Guards: their spot on the patrol ring. */
  lane: number;
  /** Seconds spent pushing on the stick without getting anywhere, and the escape run once stuck. */
  stuckT: number;
  lastX: number;
  lastZ: number;
  unstickT: number;
  unstickX: number;
  unstickZ: number;
  /** Plays at this skill instead of its team's (tests and sims). */
  skill?: Skill;
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
  /** The way the body is actually moving; lags the heading on ice. */
  sx: number;
  sz: number;
  /** Lava burns at most this often. */
  burnCd: number;
  /** Flyers: seconds until the bomb is loaded; below 0, how long it has sat ready. */
  bombCd: number;
  /** Flyers: the confetti gun's heat (0 to 1), seconds left cooling after overheating, and until the next shot. */
  heat: number;
  overheat: number;
  gunCd: number;
  /** CPU flyers: holding the trigger. */
  firing: boolean;
  /** Confetti hits taken toward the next hit, and seconds before they wear off. */
  stings: number;
  stingT: number;
  /** CPU runs: what the current run is for, the bend it takes on the way, and the angle it comes in at. */
  runFor: string;
  runOn: boolean;
  runX: number;
  runZ: number;
  run2X: number;
  run2Z: number;
  runStage: number;
  approach: number;
  /** CPU: goes in first and loud to pull the guards away from the real thieves. */
  decoy: boolean;
  /** CPU: its own sway while it runs under fire, so no two run alike, and whether enemies were close at its last look. */
  weave: number;
  pressed: boolean;
}

/**
 * Capture the flag rules. Each team's flags start in its own base. Steal
 * one from the enemy base and bring it to yours to score. With one flag a
 * side (Capture and Playful) it then goes back to its owners; in Hoard it
 * sits in your base and they can steal it back. A popped carrier drops the flag:
 * its owners touch it to send it home, the thieves can pick it up again,
 * and left alone it goes home on its own.
 */
export type FlagState = "home" | "carried" | "dropped";

export interface Flag {
  id: number;
  /** The team whose flag it is: it always wears their color. */
  owner: Team;
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
  /** A flyer's confetti: flies straight and fast, and stings instead of popping. */
  confetti?: boolean;
  /** Confetti the gun locked on with curves gently toward this player. */
  seek?: number;
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
  | { kind: "spray"; x: number; y: number; z: number; player: number }
  | { kind: "sting"; x: number; y: number; z: number; player: number; by: number }
  | { kind: "bombReady"; player: number }
  | { kind: "overheat"; player: number }
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
  | { kind: "strike_warn"; x: number; z: number; t: number }
  | { kind: "strike"; x: number; y: number; z: number }
  | { kind: "burn"; x: number; y: number; z: number; player: number }
  | { kind: "overtime" }
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
export type Mode = "capture" | "hoard" | "playful";
export const HOARD_TARGET = 1000;
/**
 * Points per second each flag in your base earns in Hoard, for a match with
 * five flags a side. Maps with more flags pay less per flag, so the race to
 * 1000 takes about as long whatever the team size.
 */
export const HOARD_RATE = 1;

/** Lightning about to land on Storm Spire. */
export interface Strike {
  x: number;
  z: number;
  /** Seconds until it lands. */
  t: number;
}

export interface Match {
  mode: Mode;
  map: MapDef;
  world: WorldDef;
  /** Storm Spire's wind, in meters per second. */
  wind: [number, number];
  strikes: Strike[];
  nextStrike: number;
  strikeTeam: Team;
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
  /** One flag a side means one big flag each, standing in the middle of its base. */
  flagsPerTeam: number;
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
  /** Seconds until each team's CPUs share out jobs again. */
  planCd: [number, number];
  /** Tied at the buzzer: play on until the next capture, or until overtime runs out. */
  overtime: boolean;
  /** Each team's game plan and way of moving this match. */
  brains: [TeamBrain, TeamBrain];
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
  /** Which world; defaults to Home Isle. */
  world?: string;
  /** Plans the teams opened with last match; neither team opens with them again. */
  avoidPlans?: readonly string[];
}

export function createMatch(opts: MatchOptions): Match {
  const rng = mulberry32(opts.seed);
  const map = opts.map ?? mapFor(opts.perTeam);
  const world = worldById(opts.world ?? "home");
  setWorld(world);
  setMap(map);
  // Playful mode plays for one flag a side.
  const flagsPerTeam = opts.mode === "playful" ? 1 : opts.flagsPerTeam;
  const bases: Base[] = [
    { id: 0, team: 0, x: 0, z: BASE_Z, main: true },
    { id: 1, team: 1, x: 0, z: -BASE_Z, main: true },
    ...outposts().map(([x, z, team], i) => ({ id: 2 + i, team, x, z, main: false })),
  ];
  const players: Player[] = [];
  const ids = Object.keys(ANIMALS);
  // Each CPU slot gets the same animal on both teams, so the sides stay even.
  const picks = Array.from({ length: opts.perTeam }, () => ids[Math.floor(rng() * ids.length)]);
  for (let team = 0 as Team; team <= 1; team = (team + 1) as Team) {
    for (let i = 0; i < opts.perTeam; i++) {
      const human = team === 0 && i === 0;
      // Your rival in slot 0 gets your animal, so neither side has the edge.
      const def = human || (team === 1 && i === 0) ? ANIMALS[opts.humanAnimal] ?? ANIMALS.lion : ANIMALS[picks[i]];
      const b = bases[team];
      // A sunflower spiral around the base, so a big team starts spread out.
      const a = i * 2.39996;
      const r = 3 + 1.7 * Math.sqrt(i);
      // Mirrored through the island's center for the north team, like the map.
      const flip = team === 0 ? 1 : -1;
      const x = b.x + Math.cos(a) * r * flip;
      const z = b.z + Math.sin(a) * r * 0.8 * flip;
      const p = makePlayer(players.length, team, def, !human, x, z, Math.atan2(-b.x, -b.z));
      // One in eight is a medic (the human only if picked); guardians lean to defending.
      p.role = i % 8 === 3 ? "medic" : def.style === "guardian" ? "defend" : "attack";
      p.medic = human ? !!opts.humanMedic : p.role === "medic";
      players.push(p);
    }
    if (team === 1) break;
  }
  const flags: Flag[] = [];
  for (const team of [0, 1] as const) {
    // Half the flags at the main base, the rest shared among the outposts.
    const own = bases.filter((b) => b.team === team);
    const atMain = own.length > 1 ? Math.ceil(flagsPerTeam / 2) : flagsPerTeam;
    const used = new Map<number, number>();
    for (let i = 0; i < flagsPerTeam; i++) {
      const b = i < atMain ? own[0] : own[1 + ((i - atMain) % (own.length - 1))];
      const slot = used.get(b.id) ?? 0;
      used.set(b.id, slot + 1);
      const [x, z] = homeSpot(b, slot, map.baseRadius, flagsPerTeam);
      flags.push({ id: flags.length, owner: team, team, state: "home", x, y: surfaceHeight(x, z), z, carrier: -1, slot, base: b.id, timer: 0 });
    }
  }
  // Each CPU its own sway, and each team its own opening plan, never the other team's or last match's.
  for (const p of players) p.weave = rng() * Math.PI * 2;
  const avoid = opts.avoidPlans ?? [];
  const level = { behind: 0, late: 0, tactics: 0 };
  const plan0 = pickPlan(rng, level, avoid);
  const plan1 = pickPlan(rng, level, [...avoid, plan0]);
  const brains: [TeamBrain, TeamBrain] = [newBrain(rng, plan0, 0), newBrain(rng, plan1, 0)];
  const spots = map.gigantic ? [...STATION_SPOTS, ...GIGANTIC_STATION_SPOTS] : STATION_SPOTS;
  const stations: Station[] = spots.map(([u, v], id) => {
    const [x, z] = fromLayout(u, v);
    return { id, x, z, cd: 0 };
  });
  return {
    rng,
    map,
    world,
    wind: [0, 0],
    strikes: [],
    nextStrike: 7,
    strikeTeam: 0,
    baseRadius: map.baseRadius,
    hoardRate: (HOARD_RATE * 5) / Math.max(1, flagsPerTeam),
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
    flagsPerTeam,
    fires: [],
    bases,
    respawns: [],
    nextRespawnId: 0,
    turn: [],
    turnBack: [...players].reverse(),
    scores: [0, 0],
    events: [],
    nextFireId: 0,
    planCd: [0, 0],
    overtime: false,
    brains,
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
    job: "raid",
    jobTarget: -1,
    lane: 0,
    stuckT: 0,
    lastX: x,
    lastZ: z,
    unstickT: 0,
    unstickX: 0,
    unstickZ: 0,
    goalTag: "",
    dodgeT: 0,
    dodgeX: 0,
    dodgeZ: 0,
    dodgeJump: 0,
    dodgeCd: 0,
    thinkCd: 0,
    goalX: x,
    goalZ: z,
    sx: 0,
    sz: 0,
    burnCd: 0,
    bombCd: 0,
    heat: 0,
    overheat: 0,
    gunCd: 0,
    firing: false,
    stings: 0,
    stingT: 0,
    runFor: "",
    runOn: false,
    runX: x,
    runZ: z,
    run2X: x,
    run2Z: z,
    runStage: 0,
    approach: 0,
    decoy: false,
    weave: 0,
    pressed: false,
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

/** What changes as a match plays, as plain data. A match made with the same options takes it back with `restoreMatch`. */
export interface MatchState {
  v: 1;
  rng: number;
  players: Array<Omit<Player, "def"> & { def: string }>;
  match: Pick<
    Match,
    | "wind"
    | "strikes"
    | "nextStrike"
    | "strikeTeam"
    | "stations"
    | "points"
    | "time"
    | "timeLeft"
    | "over"
    | "flags"
    | "fires"
    | "respawns"
    | "nextRespawnId"
    | "scores"
    | "nextFireId"
    | "planCd"
    | "overtime"
    | "brains"
  >;
}

export function matchState(m: Match): MatchState {
  // A copy, so the live match goes on without changing what was saved.
  return JSON.parse(JSON.stringify(liveMatchState(m))) as MatchState;
}

/**
 * The same state, still sharing the live match's objects: only for turning
 * straight into text, which saves copying it first (it runs every few
 * seconds mid match).
 */
export function liveMatchState(m: Match): MatchState {
  const { wind, strikes, nextStrike, strikeTeam, stations, points, time, timeLeft, over, flags, fires, respawns, nextRespawnId, scores, nextFireId, planCd, overtime, brains } = m;
  const state: MatchState = {
    v: 1,
    rng: m.rng.state?.a ?? 1,
    players: m.players.map((p) => ({ ...p, def: p.def.id })),
    match: { wind, strikes, nextStrike, strikeTeam, stations, points, time, timeLeft, over, flags, fires, respawns, nextRespawnId, scores, nextFireId, planCd, overtime, brains },
  };
  return state;
}

/**
 * Puts a saved state back into `m`, a fresh match made with the options the saved one had. Returns false and leaves
 * `m` as it was when the state doesn't fit it (another team size, or a save from an older game).
 */
export function restoreMatch(m: Match, raw: unknown): boolean {
  const s = raw as Partial<MatchState> | null;
  if (!s || s.v !== 1 || typeof s.rng !== "number" || !Array.isArray(s.players) || typeof s.match !== "object" || s.match === null) return false;
  const ms = s.match;
  if (s.players.length !== m.players.length || !Array.isArray(ms.flags) || ms.flags.length !== m.flags.length) return false;
  if (!Array.isArray(ms.stations) || ms.stations.length !== m.stations.length) return false;
  if (typeof ms.timeLeft !== "number" || !Number.isFinite(ms.timeLeft) || ms.over) return false;
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[i];
    if (!p || p.id !== i || p.team !== m.players[i].team || !ANIMALS[p.def]) return false;
  }
  m.players.forEach((p, i) => {
    const fresh = { ...p };
    const saved = s.players![i];
    Object.assign(p, saved, { def: ANIMALS[saved.def] });
    // A number that didn't survive the trip (Infinity comes back as null) takes a fresh player's value.
    for (const k of Object.keys(fresh) as Array<keyof Player>) {
      if (typeof fresh[k] === "number" && !Number.isFinite(p[k] as number)) (p as unknown as Record<string, unknown>)[k] = fresh[k];
    }
  });
  const { brains, ...rest } = ms;
  Object.assign(m, rest);
  // A save from before team plans keeps the fresh match's plans.
  const known = (b: TeamBrain | undefined) => !!b && b.plan in PLANS && Array.isArray(b.history) && Number.isFinite(b.until);
  if (Array.isArray(brains) && brains.length === 2 && known(brains[0]) && known(brains[1])) m.brains = brains;
  if (m.rng.state) m.rng.state.a = s.rng | 0;
  m.turn = [];
  m.turnBack = [...m.players].reverse();
  m.events = [];
  return true;
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
  for (const team of [0, 1] as const) {
    m.planCd[team] -= STEP;
    if (m.planCd[team] <= 0) {
      m.planCd[team] = planEvery(m.skill[team]);
      planTeam(m, team);
    }
  }
  for (const p of m.turn) {
    const input = p.cpu ? cpuInput(m, p) : human;
    movePlayer(m, p, input);
  }
  stepFires(m);
  if (m.world.storm) stepStorm(m);
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

  // Overtime: the first capture wins it.
  if (m.overtime && m.scores[0] !== m.scores[1]) m.timeLeft = 0;
  if (m.timeLeft <= 0 && !m.overtime && m.mode !== "hoard" && m.scores[0] === m.scores[1] && tune.overtime > 0) {
    m.overtime = true;
    m.timeLeft = tune.overtime;
    m.events.push({ kind: "overtime" });
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
  if (p.medium === "air" || flies(p.def)) return p.def.airSpeed * boost;
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
  if (p.stings > 0) {
    p.stingT -= STEP;
    if (p.stingT <= 0) p.stings = 0;
  }
  const stunned = p.stun > 0;
  if (stunned) p.stun = Math.max(0, p.stun - STEP);

  // Steering: turn toward the pointed direction, throttle by how far you point.
  const mag = stunned ? 0 : Math.min(1, Math.hypot(input.dirX, input.dirZ));
  if (mag > 0.05) {
    const want = Math.atan2(input.dirX, input.dirZ);
    const diff = wrapAngle(want - p.heading);
    const control = p.onSurface || p.def.cls === "air" ? 1 : 0.6;
    // Flyers bank round hard whatever the push, so even cruising slowly they can turn onto a flag.
    const maxTurn = p.def.turnRate * control * STEP * (flies(p.def) ? 1 : 0.5 + 0.5 * mag);
    p.heading = wrapAngle(p.heading + clamp(diff, -maxTurn, maxTurn));
  }
  // Pointing behind you slows you down while you swing round, like a stylus pull.
  const facing = mag > 0.05 ? Math.cos(wrapAngle(Math.atan2(input.dirX, input.dirZ) - p.heading)) : 0;
  const push = mag * Math.max(0.35, facing);
  // Flyers never stop: with the stick let go they cruise on at their slowest.
  const target = speedFor(p) * (flies(p.def) ? tune.flyMinSpeed + (1 - tune.flyMinSpeed) * push : push);
  const rate = target > p.speed ? tune.accel : tune.accel * 1.4;
  p.speed += clamp(target - p.speed, -rate * STEP, rate * STEP);

  // Knockback decays fast so a pop reads as a burst, not a slide.
  const kDecay = Math.exp(-3.2 * STEP);
  p.kx *= kDecay;
  p.kz *= kDecay;

  // Where you are heading. On ice the body only drifts round to it slowly.
  const wantX = Math.sin(p.heading) * p.speed;
  const wantZ = Math.cos(p.heading) * p.speed;
  if (m.world.ice && p.medium === "land" && p.onSurface) {
    const grip = 1 - Math.exp(-(p.def.iceGrip ?? tune.iceGrip) * STEP);
    p.sx += (wantX - p.sx) * grip;
    p.sz += (wantZ - p.sz) * grip;
  } else {
    p.sx = wantX;
    p.sz = wantZ;
  }
  let vx = p.sx + p.kx;
  let vz = p.sz + p.kz;
  if (m.world.storm) {
    // The wind shoves flyers about, and walkers a little.
    const w = p.medium === "air" ? 1 : 0.3;
    vx += m.wind[0] * w;
    vz += m.wind[1] * w;
  }
  let nx = p.x + vx * STEP;
  let nz = p.z + vz * STEP;
  if (!inWorld(nx, nz)) {
    nx = clamp(nx, -WORLD_HALF_X, WORLD_HALF_X);
    nz = clamp(nz, -WORLD_HALF_Z, WORLD_HALF_Z);
    p.speed *= 0.5;
  }
  p.x = nx;
  p.z = nz;

  // Jump, hold to float. Flyers fly on their own instead, and Jump drops their bomb.
  const jumpDown = !stunned && input.jump;
  const flyer = flies(p.def);
  if (flyer) {
    fly(m, p);
    if (jumpDown && !p.jumpWasHeld) dropBomb(m, p);
    p.jumpWasHeld = jumpDown;
    stepGun(m, p, !stunned && (!!input.fire || input.throwPressed));
  } else landJump(m, p, jumpDown);
  const surf = surfaceHeight(p.x, p.z);
  const water = isWater(p.x, p.z);
  if (!flyer) settle(m, p, surf, water);
  p.medium = !p.onSurface && p.y - surf > 1.2 ? "air" : water ? "water" : "land";
  const lava = p.medium === "water" && p.onSurface && isLava(p.x, p.z);
  p.burnCd = Math.max(0, p.burnCd - STEP);
  if (lava && p.burnCd <= 0) burn(m, p);
  stepDive(m, p, !stunned && !!input.dive && water && !lava && p.onSurface);

  if (!flyer && !stunned && !p.diving && input.throwPressed && p.throwCd <= 0) throwFire(m, p);
  if (!stunned && input.useItem && p.item) useItem(m, p);
  if (!stunned && input.plant && p.medic) plantRespawn(m, p);
}

/** Jump, and hold it to float a moment longer. */
function landJump(m: Match, p: Player, jumpDown: boolean): void {
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
  if (!p.onSurface && jumpDown && p.floatLeft > 0) {
    p.floatLeft -= STEP;
    if (p.vy < 2) g *= 0.3;
  }
  p.jumpWasHeld = jumpDown;
  p.vy -= g * STEP;
  p.y += p.vy * STEP;
}

/** Land on the ground or the water, and stick to it over small bumps. */
function settle(m: Match, p: Player, surf: number, water: boolean): void {
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
}

/**
 * Flyers hold their cruising height over land and sea, rising and dipping
 * with the ground; a pop or a Super Jump knocks them about, and they settle
 * back down to it.
 */
function fly(m: Match, p: Player): void {
  const surf = surfaceHeight(p.x, p.z);
  const gap = surf + tune.flyHeight - p.y;
  // Above the line from a leap: fall back gently. Otherwise ease onto it.
  if (gap < -0.5 && p.vy > -6) p.vy = Math.max(-6, p.vy - tune.gravity * 0.5 * STEP);
  else p.vy += (clamp(gap * 6, -6, 9) - p.vy) * Math.min(1, 12 * STEP);
  p.y += p.vy * STEP;
  if (p.y < surf + 0.2) {
    p.y = surf + 0.2;
    p.vy = Math.max(0, p.vy);
  }
  // Taking off, after a respawn.
  if (p.onSurface) m.events.push({ kind: "jump", player: p.id });
  p.onSurface = false;
  p.floatLeft = 0;
}

/** A flyer's bomb, once it's loaded: falls from under it, carrying a little of its speed. */
function dropBomb(m: Match, p: Player): void {
  if (p.bombCd > 0) return;
  p.bombCd = tune.bombReload;
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
}

/**
 * The confetti gun fires while the trigger is held, tune.confettiRate shots
 * a second with a little spread. Holding it heats the gun; after
 * tune.gunHeat seconds of fire it overheats and won't fire again until it
 * has cooled for tune.gunCool seconds. Let go early and it cools as fast.
 */
function stepGun(m: Match, p: Player, trigger: boolean): void {
  const wasLoading = p.bombCd > 0;
  p.bombCd = Math.max(-60, p.bombCd - STEP);
  if (wasLoading && p.bombCd <= 0) m.events.push({ kind: "bombReady", player: p.id });
  p.gunCd = Math.max(0, p.gunCd - STEP);
  if (p.overheat > 0) {
    p.overheat = Math.max(0, p.overheat - STEP);
    p.heat = p.overheat / tune.gunCool;
    return;
  }
  const firing = trigger && !p.diving && p.out <= 0;
  if (!firing) {
    p.heat = Math.max(0, p.heat - STEP / tune.gunCool);
    return;
  }
  p.heat += STEP / tune.gunHeat;
  if (p.heat >= 1) {
    p.heat = 1;
    p.overheat = tune.gunCool;
    m.events.push({ kind: "overheat", player: p.id });
    return;
  }
  if (p.gunCd > 0) return;
  p.gunCd = 1 / tune.confettiRate;
  const speed = tune.confettiSpeed + Math.max(0, p.speed);
  const x0 = p.x + Math.sin(p.heading) * 1.2;
  const y0 = p.y + 0.3;
  const z0 = p.z + Math.cos(p.heading) * 1.2;
  // The gun locks on to the enemy most nearly ahead and leads them; with
  // nobody ahead it fires along the heading, angled down to chest height.
  const lock = gunTarget(m, p, speed);
  let tx: number;
  let ty: number;
  let tz: number;
  if (lock) {
    [tx, ty, tz] = lock;
  } else {
    tx = p.x + Math.sin(p.heading) * tune.gunAimDist;
    tz = p.z + Math.cos(p.heading) * tune.gunAimDist;
    ty = surfaceHeight(tx, tz) + 1;
  }
  const a = Math.atan2(tx - x0, tz - z0) + (m.rng() - 0.5) * 0.05;
  const flat = Math.max(1, Math.hypot(tx - x0, tz - z0));
  const pitch = Math.atan2(ty - y0, flat);
  const shot: Firecracker = {
    id: m.nextFireId++,
    owner: p.id,
    team: p.team,
    x: x0,
    y: y0,
    z: z0,
    vx: Math.sin(a) * Math.cos(pitch) * speed,
    vy: Math.sin(pitch) * speed,
    vz: Math.cos(a) * Math.cos(pitch) * speed,
    skidding: false,
    life: tune.confettiLife,
    bomb: false,
    confetti: true,
    seek: lock ? lock[3] : undefined,
  };
  m.fires.push(shot);
  m.events.push({ kind: "spray", x: shot.x, y: shot.y, z: shot.z, player: p.id });
}

/**
 * Where a flyer's confetti should go: the chest of the enemy closest to
 * straight ahead, within tune.gunLockCone of the heading and the shot's
 * reach, led by how far they'll move before the confetti gets there.
 */
function gunTarget(m: Match, p: Player, speed: number): [number, number, number, number] | null {
  const reach = speed * tune.confettiLife;
  let best: [number, number, number, number] | null = null;
  let bestScore = Infinity;
  for (const o of m.players) {
    // Skip anyone the confetti would only bounce off.
    if (o.team === p.team || o.out > 0 || o.diving || o.stun > 0 || protectedFrom(o)) continue;
    const ox = o.x - p.x;
    const oz = o.z - p.z;
    const od = Math.hypot(ox, oz);
    if (od > reach || od < 0.5 || o.y > p.y + 2 || o.y < p.y - 4) continue;
    const off = Math.abs(wrapAngle(Math.atan2(ox, oz) - p.heading));
    if (off > tune.gunLockCone) continue;
    const score = off + od / reach;
    if (score >= bestScore) continue;
    bestScore = score;
    const t = od / speed;
    const px = o.x + (o.sx + o.kx) * t;
    const pz = o.z + (o.sz + o.kz) * t;
    // A flyer rides the ground's ups and downs, so aim between where it is and where it's heading.
    const py = flies(o.def) ? (o.y + surfaceHeight(px, pz) + tune.flyHeight) / 2 : o.y;
    best = [px, py + 0.9, pz, o.id];
  }
  return best;
}

/** Lava stings: one hit, and a hop back toward the nearest dry ground. */
function burn(m: Match, p: Player): void {
  p.burnCd = tune.burnCooldown;
  let best: [number, number] = [0, 0];
  let bestD = Infinity;
  for (let r = 3; r <= 24 && bestD === Infinity; r += 3) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const dx = Math.cos(a) * r;
      const dz = Math.sin(a) * r;
      if (!isWater(p.x + dx, p.z + dz) && r < bestD) {
        bestD = r;
        best = [dx, dz];
      }
    }
  }
  m.events.push({ kind: "burn", x: p.x, y: p.y, z: p.z, player: p.id });
  const [dx, dz] = bestD === Infinity ? [-p.x, Math.sign(p.team === 0 ? 1 : -1) * 10] : best;
  const len = Math.hypot(dx, dz) || 1;
  p.diving = false;
  // Even a shield doesn't stop lava pushing you out, but it saves the hit.
  if (!protectedFrom(p)) pop(m, p, -1, dx, dz);
  if (p.out > 0) return;
  p.vy = tune.burnLift;
  p.onSurface = false;
  p.kx = (dx / len) * tune.burnPush;
  p.kz = (dz / len) * tune.burnPush;
  p.speed *= 0.3;
}

/**
 * Storm Spire: the wind swings once round the compass every 40 seconds,
 * and lightning lands near each team in turn after a warning glow.
 */
function stepStorm(m: Match): void {
  const a = (m.time / 40) * Math.PI * 2;
  const gust = tune.windSpeed * (0.75 + 0.25 * Math.sin(m.time * 0.9));
  m.wind[0] = Math.sin(a) * gust;
  m.wind[1] = Math.cos(a) * gust;
  m.nextStrike -= STEP;
  if (m.nextStrike <= 0) {
    m.nextStrike = 6 + m.rng() * 3;
    const team = m.strikeTeam;
    m.strikeTeam = team === 0 ? 1 : 0;
    const pool = m.players.filter((p) => p.team === team && p.out <= 0);
    if (pool.length > 0) {
      const o = pool[Math.floor(m.rng() * pool.length)];
      const ang = m.rng() * Math.PI * 2;
      const off = 1 + m.rng() * 4;
      const s: Strike = { x: o.x + Math.cos(ang) * off, z: o.z + Math.sin(ang) * off, t: tune.strikeWarn };
      m.strikes.push(s);
      m.events.push({ kind: "strike_warn", x: s.x, z: s.z, t: s.t });
    }
  }
  for (let i = m.strikes.length - 1; i >= 0; i--) {
    const s = m.strikes[i];
    s.t -= STEP;
    if (s.t > 0) continue;
    m.strikes.splice(i, 1);
    m.events.push({ kind: "strike", x: s.x, y: surfaceHeight(s.x, s.z), z: s.z });
    for (const p of m.turn) {
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      if (p.out <= 0 && dx * dx + dz * dz < tune.strikeRadius ** 2) pop(m, p, -1, dx || 1, dz);
    }
  }
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
  p.throwCd = tune.throwCooldown * p.def.shotCooldown;
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
      // Confetti is light and fast: it flies straight rather than arcing down.
      if (!f.confetti) f.vy -= tune.gravity * STEP;
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
    if (f.confetti) {
      if (f.seek !== undefined) seekConfetti(m, f);
      if (f.y > surf && f.life > 0 && inWorld(f.x, f.z) && !stingAny(m, f)) keep.push(f);
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
    const d2 = dx * dx + dz * dz;
    if (d2 < tune.bombRadius * tune.bombRadius && Math.abs(p.y - surf) < 3) pop(m, p, f.owner, dx, dz, d2 < tune.bombCore * tune.bombCore ? 2 : 1);
  }
}

/** Locked-on confetti bends toward its target's chest, enough to follow a dodge or a slope but not to turn round. */
function seekConfetti(m: Match, f: Firecracker): void {
  const o = m.players[f.seek!];
  if (o.out > 0 || o.diving) return;
  const dx = o.x - f.x;
  const dy = o.y + 0.9 - f.y;
  const dz = o.z - f.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const speed = Math.hypot(f.vx, f.vy, f.vz);
  // Gone past them: fly on straight.
  if ((dx * f.vx + dy * f.vy + dz * f.vz) / (d * speed) < 0.3) return;
  const k = Math.min(1, tune.confettiSeek * STEP);
  const vx = f.vx + (dx / d * speed - f.vx) * k;
  const vy = f.vy + (dy / d * speed - f.vy) * k;
  const vz = f.vz + (dz / d * speed - f.vz) * k;
  const n = speed / (Math.hypot(vx, vy, vz) || 1);
  f.vx = vx * n;
  f.vy = vy * n;
  f.vz = vz * n;
}

/** A confetti shot stings the first enemy it reaches; enough stings make a hit. Returns whether it hit anyone. */
function stingAny(m: Match, f: Firecracker): boolean {
  for (const p of m.turn) {
    if (p.team === f.team || p.out > 0 || p.diving) continue;
    const dx = p.x - f.x;
    const dz = p.z - f.z;
    if (dx * dx + dz * dz > tune.confettiReach * tune.confettiReach || f.y < p.y - 1 || f.y > p.y + 2.4) continue;
    // Flinching or shielded: the confetti bounces off.
    if (p.stun > 0 || protectedFrom(p)) return true;
    p.stings++;
    p.stingT = 2;
    m.events.push({ kind: "sting", x: f.x, y: f.y, z: f.z, player: p.id, by: f.owner });
    if (p.stings >= tune.confettiStings) {
      p.stings = 0;
      pop(m, p, f.owner, f.vx, f.vz);
    }
    return true;
  }
  return false;
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
  // Back in the game on a fresh run.
  p.runFor = "";
  m.events.push({ kind: "respawn", x, y: p.y, z, player: p.id });
}

/** True where a medic may plant: dry ground, outside the enemy's bases. */
export function canPlant(m: Match, p: Player): boolean {
  if (!p.medic || p.medicCd > 0 || p.out > 0) return false;
  if (isWater(p.x, p.z) || (!p.onSurface && !flies(p.def))) return false;
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

/** Where a home flag stands: one big flag a side takes the middle of the base, then the rings. */
function homeSpot(b: Base, slot: number, padRadius: number, flagsPerTeam: number): [number, number] {
  if (flagsPerTeam !== 1) return baseSlot(b, slot, padRadius);
  return slot === 0 ? [b.x, b.z] : baseSlot(b, slot - 1, padRadius);
}

function placeHome(m: Match, flag: Flag, base: Base): void {
  const taken = new Set(m.flags.filter((f) => f !== flag && f.base === base.id && f.state === "home").map((f) => f.slot));
  let slot = 0;
  while (taken.has(slot)) slot++;
  const [x, z] = homeSpot(base, slot, m.baseRadius, m.flagsPerTeam);
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
        if (m.mode !== "hoard") m.scores[c.team] += 1;
        // With one flag a side (Playful, and Capture now) it goes straight
        // back to its owners' base, so both teams always have one to steal.
        const back = m.mode !== "hoard" && m.flagsPerTeam === 1;
        placeHome(m, flag, back ? m.bases[flag.owner] : base);
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
  const sk = p.skill ?? m.skill[p.team];
  p.thinkCd -= STEP;
  if (p.thinkCd <= 0) {
    p.thinkCd = sk.react * (0.8 + m.rng() * 0.4);
    const [gx, gz] = cpuGoal(m, p, sk);
    p.pressed = sk.dodge > 0.2 && threatened(m, p);
    const bridges = p.def.cls === "land" || (m.world.liquid === "lava" && p.def.cls !== "air");
    // Never aim past the edge of the world.
    const [cx, cz] = [clamp(gx, 3 - WORLD_HALF_X, WORLD_HALF_X - 3), clamp(gz, 3 - WORLD_HALF_Z, WORLD_HALF_Z - 3)];
    [p.goalX, p.goalZ] = bridges ? viaBridge(p, cx, cz) : [cx, cz];
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
  // Shots flying about on a long run: jink side to side, each CPU to its own beat, so it's harder to hit and no two run alike.
  if (d > 8 && p.pressed && p.carrying < 0 && p.dodgeT <= 0) {
    const sway = Math.sin(m.time * (2.2 + (p.weave % 1.3)) + p.weave) * 0.3 * sk.dodge;
    [dx, dz] = [dx + dz * sway, dz - dx * sway];
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
      if (low && p.onSurface && p.def.cls === "land") p.dodgeJump = 0.15;
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
  // Stuck on a slope, a shore or a crowd: back out at an angle and hop.
  if (p.unstickT > 0) {
    p.unstickT -= STEP;
    dx = p.unstickX;
    dz = p.unstickZ;
    throttle = sk.pace;
    jump = jump || (p.onSurface && p.unstickT > 0.6);
  } else if (p.stun <= 0 && p.out <= 0 && Math.hypot(p.x - p.lastX, p.z - p.lastZ) < STEP) {
    // Pushing and getting nowhere, or just standing about: either way, get moving.
    p.stuckT += STEP;
    if (p.stuckT > (throttle > 0.4 ? 1.2 : 2.5)) {
      p.thinkCd = 0;
      p.stuckT = 0;
      p.unstickT = 0.8;
      const turn = (m.rng() < 0.5 ? -1 : 1) * (1.6 + m.rng());
      const a = Math.atan2(dx, dz) + turn;
      p.unstickX = Math.sin(a);
      p.unstickZ = Math.cos(a);
    }
  } else p.stuckT = 0;
  p.lastX = p.x;
  p.lastZ = p.z;
  // Lava Loop: steer round the lava rather than into it.
  if (m.world.liquid === "lava" && p.medium !== "air") [dx, dz] = avoidLava(p, dx, dz);

  // Throw when a target lines up; better CPUs aim where it's going. Flyers spray confetti instead.
  const flyer = flies(p.def);
  let throwPressed = false;
  const fire = flyer && cpuGun(m, p, sk);
  if (!flyer && p.throwCd <= 0 && !p.diving) {
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
  // Flyers fly themselves; for them Jump drops the bomb.
  if (flyer) jump = cpuBomb(m, p, sk);
  else if (!jump) {
    // Hop small rises and channels now and then.
    jump = p.onSurface ? groundHeight(p.x + fwdX * 3, p.z + fwdZ * 3) - p.y > 1.2 || m.rng() < 0.004 : p.vy > 0;
  }
  // Swimmers duck under incoming firecrackers, or to sneak a flag home.
  const dive = !flyer && p.def.dive && ((threatened(m, p) && m.rng() < sk.dodge + 0.2) || (p.carrying >= 0 && p.breath > 2.5));
  const useItem = p.item !== null && (sk.itemSmart ? cpuWantsItem(m, p, d) : p.itemHeld > 2 + ((p.id % (m.players.length / 2)) % 5));
  const plant = p.medic && cpuWantsPlant(m, p);
  return { dirX: dx * throttle, dirZ: dz * throttle, jump: jump && !dive, throwPressed, dive, useItem, plant, fire };
}

/**
 * A CPU flyer's trigger finger. It opens up once an enemy lines up ahead and
 * keeps spraying while they stay roughly in front. Good CPUs let go before
 * the gun overheats and wait for it to cool a little; Easy ones hold on until
 * it locks up.
 */
function cpuGun(m: Match, p: Player, sk: Skill): boolean {
  if (p.overheat > 0 || (sk.itemSmart && p.heat > 0.8)) return (p.firing = false);
  if (sk.itemSmart && !p.firing && p.heat > 0.35) return false;
  let keen = 0;
  for (const o of m.players) {
    if (o.team === p.team || o.stun > 0 || o.diving || o.out > 0) continue;
    const od = Math.hypot(o.x - p.x, o.z - p.z);
    if (od > 15 || od < 0.8 || o.y > p.y + 1.5 || o.y < p.y - 3) continue;
    let ax = o.x;
    let az = o.z;
    if (sk.leads) {
      const t = od / tune.confettiSpeed;
      ax += (Math.sin(o.heading) * o.speed + o.kx) * t;
      az += (Math.cos(o.heading) * o.speed + o.kz) * t;
    }
    const off = Math.abs(wrapAngle(Math.atan2(ax - p.x, az - p.z) - p.heading));
    if (off > sk.aimTol * (p.firing ? 3 : 1.6)) continue;
    keen = o.carrying >= 0 ? 2 : o.hp === 1 ? 1.4 : 1;
    break;
  }
  if (keen === 0) return (p.firing = false);
  if (!p.firing) p.firing = m.rng() < sk.throwRate * keen * m.aggro * 2;
  return p.firing;
}

/**
 * When a CPU flyer lets its bomb go. It lands a beat ahead, so the flyer
 * looks there. Easy CPUs drop it on the first enemy they pass; better ones
 * save it for a crowd, a thief, the guards on the flag they're after, or
 * once it has sat loaded a while.
 */
function cpuBomb(m: Match, p: Player, sk: Skill): boolean {
  if (p.bombCd > 0 || p.stun > 0) return false;
  const lx = p.x + Math.sin(p.heading) * p.speed * 0.18;
  const lz = p.z + Math.cos(p.heading) * p.speed * 0.18;
  const surf = surfaceHeight(lx, lz);
  const r = tune.bombRadius * 0.8;
  let n = 0;
  let thief = false;
  for (const o of m.players) {
    if (o.team === p.team || o.stun > 0 || o.diving || o.out > 0 || Math.abs(o.y - surf) > 3) continue;
    if (Math.hypot(o.x - lx, o.z - lz) > r) continue;
    n++;
    if (o.carrying >= 0) thief = true;
  }
  if (n === 0) return false;
  if (!sk.itemSmart) return true;
  return n >= 2 || thief || p.goalTag === "bomb" || p.goalTag === "steal" || p.bombCd < -12;
}

/** The closest heading to (dx, dz) that keeps lava out of the next few meters. */
function avoidLava(p: Player, dx: number, dz: number): [number, number] {
  const a = Math.atan2(dx, dz);
  for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5, 2.2, -2.2]) {
    const sx = Math.sin(a + off);
    const sz = Math.cos(a + off);
    if (!isLava(p.x + sx * 2.5, p.z + sz * 2.5) && !isLava(p.x + sx * 5, p.z + sz * 5)) return [sx, sz];
  }
  return [dx, dz];
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


/**
 * Team plans. Every second or so each team shares out jobs the way a real
 * team talks it over: someone runs down each thief, someone saves each
 * dropped flag, bodyguards go with each carrier, a few guard home while it
 * still has a flag to guard, and the rest raid (or hold the middle once
 * there are plenty of raiders). Who gets which job comes from what their
 * animal is good at (its style) and who's closest, so a wolf hunts, a
 * mammoth guards and a panther raids. Both teams plan with the same rules;
 * only their skill differs.
 */
export type Job = "raid" | "hunt" | "save" | "escort" | "guard" | "support";

/** How well each style suits each job, out of 10. */
const FIT: Record<Style, Record<Job, number>> = {
  raider: { raid: 10, hunt: 4, save: 5, escort: 5, guard: 1, support: 4 },
  hunter: { raid: 4, hunt: 10, save: 8, escort: 6, guard: 5, support: 7 },
  guardian: { raid: 2, hunt: 6, save: 8, escort: 9, guard: 10, support: 5 },
  bomber: { raid: 8, hunt: 7, save: 5, escort: 6, guard: 2, support: 8 },
  allrounder: { raid: 7, hunt: 7, save: 7, escort: 7, guard: 6, support: 7 },
};

interface Slot {
  job: Job;
  target: number;
  x: number;
  z: number;
}

/** Trailing late means push (up to 1), leading late means hold (down to -1). */
function pushFor(m: Match, team: Team, sk: Skill): number {
  const enemy: Team = team === 0 ? 1 : 0;
  const own = m.mode === "hoard" ? m.points[team] : m.scores[team];
  const theirs = m.mode === "hoard" ? m.points[enemy] : m.scores[enemy];
  const gap = m.mode === "hoard" ? (theirs - own) / 150 : (theirs - own) / 2;
  const late = m.mode === "hoard" ? Math.max(own, theirs) / HOARD_TARGET : m.overtime ? 1 : 1 - Math.min(1, m.timeLeft / 90);
  return clamp(gap, -1, 1) * (0.4 + 0.6 * late) * sk.tactics;
}

/** Seconds between team plans: good teams talk it over more often. */
function planEvery(sk: Skill): number {
  return 0.6 + (3 - sk.coord) * 0.5;
}

/** Rethinks the team's plan when its time is up, or straight away (for teams that read the game) when someone scores. */
function rethink(m: Match, team: Team, sk: Skill): void {
  const b = m.brains[team];
  const enemy: Team = team === 0 ? 1 : 0;
  // A goal against makes a team that reads the game rethink at once.
  const conceded = m.scores[enemy] > b.seen[enemy];
  // A plan that just scored keeps going a while longer.
  if (m.scores[team] > b.seen[team] && sk.tactics > 0.3) b.until = Math.max(b.until, m.time + 20);
  if (m.time < b.until && !(conceded && sk.tactics > 0.3)) {
    b.seen = [m.scores[0], m.scores[1]];
    return;
  }
  const own = m.mode === "hoard" ? m.points[team] / 150 : m.scores[team];
  const theirs = m.mode === "hoard" ? m.points[enemy] / 150 : m.scores[enemy];
  const late = m.mode === "hoard" ? Math.max(m.points[0], m.points[1]) / HOARD_TARGET : m.overtime ? 1 : 1 - Math.min(1, m.timeLeft / 150);
  // Not what it's doing now or just did, and not what the other team is up to.
  const avoid = [b.plan, ...b.history.slice(-3), m.brains[enemy].plan];
  // Good teams read what the other side is up to and answer it; it takes a little while to see.
  const other = m.brains[enemy];
  const vs = m.rng() < sk.tactics && m.time - other.since > 8 ? other.plan : undefined;
  switchPlan(b, m.rng, pickPlan(m.rng, { behind: theirs - own, late, tactics: sk.tactics, vs }, avoid), m.time, m.scores);
}

/** Where a wave of raiders meets before going in together: the far side of the middle, somewhere new each time. */
function stagePoint(m: Match, team: Team, lane: number): [number, number] {
  const flip = team === 0 ? 1 : -1;
  for (let i = 0; i < 4; i++) {
    const x = flip * (lane * 0.3 + (m.rng() - 0.5) * 0.4) * WORLD_HALF_X;
    const z = -flip * ZONE_EDGE * (0.35 + m.rng() * 0.35);
    if (!isWater(x, z) && !isLava(x, z) && inWorld(x, z)) return [x, z];
  }
  return [0, 0];
}

/** Waves and decoys: raiders hold in the middle until the wave is big enough, or the decoys have pulled the guards out. */
function stepWave(m: Match, team: Team, sk: Skill, raiders: Player[]): void {
  const b = m.brains[team];
  const plan = PLANS[b.plan];
  // Loose teams can't time a wave; they just go.
  if ((plan.wave <= 0 && plan.decoy <= 0) || sk.coord < 1 || !raiders.length) {
    b.wave = "go";
    return;
  }
  const s = mapScale();
  const enemy: Team = team === 0 ? 1 : 0;
  const prize = m.flags.find((f) => f.team === enemy && f.state !== "carried");
  if (b.wave === "gather") {
    if (b.waveT === m.time || (b.stageX === 0 && b.stageZ === 0)) [b.stageX, b.stageZ] = stagePoint(m, team, plan.lanes === "one" ? b.side : 0);
    const waiting = raiders.filter((p) => !p.decoy);
    const there = waiting.filter((p) => p.out <= 0 && Math.hypot(p.x - b.stageX, p.z - b.stageZ) < 14 * s).length;
    const decoysIn = !!prize && raiders.some((p) => p.decoy && p.out <= 0 && Math.hypot(p.x - prize.x, p.z - prize.z) < 30 * s);
    const ready = plan.decoy > 0 ? decoysIn : there >= Math.max(2, Math.ceil(waiting.length * plan.wave));
    if (ready || m.time - b.waveT > 7 || m.players.some((p) => p.team === team && p.carrying >= 0)) {
      b.wave = "go";
      b.waveT = m.time;
    }
  } else if (
    m.time - b.waveT > 8 &&
    !m.players.some((p) => p.team === team && p.carrying >= 0) &&
    // The wave is spent (everyone knocked out or back on our side): regroup for the next.
    !raiders.some((p) => p.out <= 0 && p.z * (team === 0 ? 1 : -1) < 0)
  ) {
    b.wave = "gather";
    b.waveT = m.time;
    [b.stageX, b.stageZ] = stagePoint(m, team, plan.lanes === "one" ? b.side : 0);
  }
}

function planTeam(m: Match, team: Team): void {
  const sk = m.skill[team];
  rethink(m, team, sk);
  const brain = m.brains[team];
  const plan = PLANS[brain.plan];
  const s = mapScale();
  const enemy: Team = team === 0 ? 1 : 0;
  const side = m.players.filter((p) => p.team === team);
  const n = side.length;
  const free = side.filter((p) => p.cpu && p.carrying < 0);
  const human = side.some((p) => !p.cpu && p.carrying < 0);
  const push = pushFor(m, team, sk);
  const slots: Slot[] = [];

  // Thieves with our flags, closest to scoring first: cut them off.
  const thieves = m.players.filter((o) => o.team === enemy && o.carrying >= 0 && m.flags[o.carrying].team === team);
  const toHome = (o: Player) => {
    const b = nearestBase(m, enemy, o.x, o.z);
    return Math.hypot(b.x - o.x, b.z - o.z);
  };
  thieves.sort((a, b) => toHome(a) - toHome(b));
  for (const o of thieves) {
    const urgent = toHome(o) < 45 * s && sk.tactics > 0.5;
    const k = (n <= 3 ? 1 : n <= 5 ? 2 : urgent ? 3 + (sk.coord >= 2 ? 1 : 0) : 2) + (n > 4 ? plan.hunters : 0);
    for (let i = 0; i < k; i++) slots.push({ job: "hunt", target: o.id, x: o.x, z: o.z });
    // Guards lean towards the side thieves keep coming from.
    const home = m.bases[team];
    brain.threatX = brain.threatX * 0.97 + clamp(o.x - home.x, -20 * s, 20 * s) * 0.03;
  }
  // Our dropped flags: someone runs over and touches them home.
  for (const f of m.flags) if (f.state === "dropped" && f.team === team) slots.push({ job: "save", target: f.id, x: f.x, z: f.z });
  // Our carriers get bodyguards.
  const carriers = side.filter((p) => p.carrying >= 0);
  const escorts = n <= 3 ? 0 : (n <= 6 ? 1 : 2) + plan.escorts;
  for (const c of carriers) for (let i = 0; i < escorts; i++) slots.push({ job: "escort", target: c.id, x: c.x, z: c.z });
  // Guards, only for bases with a flag at home to guard.
  const held = m.bases.filter((b) => b.team === team && m.flags.some((f) => f.state === "home" && f.base === b.id));
  if (held.length && n > 2) {
    const g = Math.max(1, Math.round(n * plan.guard * (1 - 0.6 * push) * (m.mode === "hoard" ? 1.4 : 1)));
    for (let i = 0; i < g; i++) {
      const b = held[i % held.length];
      slots.push({ job: "guard", target: b.id, x: b.x, z: b.z });
    }
  }
  // Everyone else raids while there's a flag to take; past the plan's cap the rest hold the middle.
  const prize = m.flags.find((f) => f.team === enemy && f.state !== "carried");
  const rest = free.length - slots.length;
  if (prize) {
    const cap = Math.max(2, Math.ceil(n * plan.raid)) - (human ? 1 : 0);
    for (let i = 0; i < Math.min(rest, cap); i++) slots.push({ job: "raid", target: -1, x: prize.x, z: prize.z });
  } else if (carriers.length) {
    for (let i = 0; i < Math.min(rest, 1 + plan.escorts); i++) slots.push({ job: "escort", target: carriers[0].id, x: carriers[0].x, z: carriers[0].z });
  }
  while (slots.length < free.length) slots.push({ job: "support", target: -1, x: 0, z: 0 });

  const taken = new Set<Player>();
  for (const slot of slots) {
    const urgency = slot.job === "hunt" || slot.job === "save" ? 2.5 : slot.job === "escort" ? 1.5 : slot.job === "support" ? 0 : 0.6;
    let best: Player | undefined;
    let bestFit = -Infinity;
    for (const p of free) {
      if (taken.has(p)) continue;
      let fit = FIT[p.def.style][slot.job] - urgency * (Math.hypot(p.x - slot.x, p.z - slot.z) / (10 * s));
      if (p.job === slot.job && p.jobTarget === slot.target) fit += 3;
      if (p.medic && slot.job === "guard") fit -= 6;
      if (p.out > 0) fit -= 4;
      // Loose teams don't share out jobs so well.
      fit += m.rng() * (3 - sk.coord) * 2;
      if (fit > bestFit) {
        bestFit = fit;
        best = p;
      }
    }
    if (!best) break;
    taken.add(best);
    best.job = slot.job;
    best.jobTarget = slot.target;
  }

  // Lanes: raiders come in the way the plan says, the middle fans out, guards round the ring.
  const flip = team === 0 ? 1 : -1;
  const byX = (job: Job) => free.filter((p) => p.job === job).sort((a, b) => a.x * flip - b.x * flip || a.id - b.id);
  const raiders = byX("raid");
  const decoys = plan.decoy > 0 ? Math.max(1, Math.round(raiders.length * plan.decoy)) : 0;
  // Decoys: the raiders nearest the enemy flag go in first, down the other side.
  const order = prize ? [...raiders].sort((a, b) => Math.hypot(a.x - prize.x, a.z - prize.z) - Math.hypot(b.x - prize.x, b.z - prize.z)) : raiders;
  for (const p of free) p.decoy = false;
  order.slice(0, decoys).forEach((p) => (p.decoy = raiders.length > 1));
  raiders.forEach((p, i) => {
    const k = raiders.length;
    if (p.decoy) p.lane = -brain.side;
    else if (plan.lanes === "one") p.lane = brain.side;
    else if (plan.lanes === "both") p.lane = i < k / 2 ? -1 : 1;
    else p.lane = k === 1 ? 0 : Math.round(-1 + (2 * i) / (k - 1));
  });
  const mids = byX("support");
  mids.forEach((p, i) => (p.lane = mids.length === 1 ? 0 : Math.round(-1 + (2 * i) / (mids.length - 1))));
  for (const b of held) {
    const guards = free.filter((p) => p.job === "guard" && p.jobTarget === b.id).sort((a, c) => a.id - c.id);
    guards.forEach((p, i) => (p.lane = i / guards.length));
  }
  for (const c of carriers) {
    free.filter((p) => p.job === "escort" && p.jobTarget === c.id).forEach((p, i) => (p.lane = i));
  }
  stepWave(m, team, sk, raiders);
}

/** Where a hunter heads to cut a thief off: the first spot on their run home it can reach first. */
function intercept(m: Match, p: Player, o: Player, sk: Skill): [number, number] {
  const s = mapScale();
  if (sk.tactics <= 0 || Math.hypot(o.x - p.x, o.z - p.z) < 9) return lead(o);
  const home = nearestBase(m, o.team, o.x, o.z);
  const hx = home.x - o.x;
  const hz = home.z - o.z;
  const len = Math.hypot(hx, hz) || 1;
  const ov = Math.max(4, speedFor(o));
  const pv = Math.max(4, speedFor(p) * sk.pace);
  for (let t = 0.1; t <= 1.001; t += 0.1) {
    const x = o.x + hx * t;
    const z = o.z + hz * t;
    if (Math.hypot(x - p.x, z - p.z) / pv <= (len * t) / ov) return [x, z];
  }
  // Too far behind to get ahead: block the mouth of their base, swaying side to side.
  const sway = Math.sin(m.time * 1.3 + p.id) * 3 * s;
  return [home.x - (hx / len) * 7 * s + (hz / len) * sway, home.z - (hz / len) * 7 * s - (hx / len) * sway];
}

/** A bodyguard stands between its carrier and the nearest chaser, or runs just ahead. */
function escortSpot(m: Match, p: Player, c: Player): [number, number] {
  const home = nearestBase(m, c.team, c.x, c.z);
  const hx = home.x - c.x;
  const hz = home.z - c.z;
  const len = Math.hypot(hx, hz) || 1;
  const threats = m.players
    .filter((o) => o.team !== c.team && o.stun <= 0 && o.out <= 0 && Math.hypot(o.x - c.x, o.z - c.z) < 22)
    .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
  const t = threats[p.lane] ?? threats[0];
  if (t) return [c.x + (t.x - c.x) * 0.5, c.z + (t.z - c.z) * 0.5];
  const side = p.lane % 2 === 0 ? 1 : -1;
  return [c.x + (hx / len) * 7 + (hz / len) * 3 * side, c.z + (hz / len) * 7 - (hx / len) * 3 * side];
}

/** A guard walks a ring in front of its base, so it's always on the move and covers every side. Each team walks it its own way. */
function patrolSpot(m: Match, p: Player, b: Base): [number, number] {
  const s = mapScale();
  const brain = m.brains[b.team];
  const flip = b.team === 0 ? 1 : -1;
  // Turned round the middle for the north team, so both sides patrol alike; shifted towards where thieves come from.
  const cx = b.x + brain.threatX * 0.5;
  const cz = b.z - flip * 5 * s;
  const r = 9 * s * PLANS[brain.plan].ring;
  const a = m.time * brain.patrolPace * brain.patrolDir + p.lane * Math.PI * 2 + 0.7;
  let x = cx + flip * Math.cos(a) * r;
  let z = cz + flip * Math.sin(a) * r * 0.7;
  if (p.def.cls !== "air" && (isWater(x, z) || isLava(x, z))) {
    x = cx + (x - cx) * 0.5;
    z = cz + (z - cz) * 0.5;
  }
  return [x, z];
}

/** The middle: each on its own lane, sweeping forward and back to the team's own rhythm; pushier plans sit further up. */
function sweepSpot(m: Match, p: Player): [number, number] {
  const brain = m.brains[p.team];
  const flip = p.team === 0 ? 1 : -1;
  const x = p.lane * WORLD_HALF_X * 0.35;
  const up = 0.15 + 0.2 * (PLANS[brain.plan].press - 0.5);
  const z = (-up + Math.sin(m.time * brain.sweepRate + brain.sweepPhase + p.lane * 1.7) * brain.sweepReach) * ZONE_EDGE;
  return [flip * x, flip * z];
}

/** Raiders on a side lane swing out wide and come at the flag from their flank, each run a little differently. */
function raidSpot(p: Player, f: Flag): [number, number] {
  const s = mapScale();
  if (Math.hypot(f.x - p.x, f.z - p.z) < 24 * s) return [f.x, f.z];
  const flip = p.team === 0 ? 1 : -1;
  const x = f.x + flip * (p.lane * 14 + p.approach * 5) * s;
  const z = f.z + flip * 12 * s;
  if (p.def.cls !== "air" && (isWater(x, z) || isLava(x, z) || !inWorld(x, z))) return [f.x, f.z];
  return [x, z];
}

/** Can this animal pass here (on foot, swimming or flying)? */
function passable(p: Player, x: number, z: number): boolean {
  if (!inWorld(x, z)) return false;
  if (p.def.cls === "air") return true;
  return !isLava(x, z) && (p.def.cls === "water" || !isWater(x, z));
}

/** A spot this animal can stand on, pulled in towards (x0, z0) until it's passable; null if none. */
function landing(p: Player, x0: number, z0: number, x: number, z: number): [number, number] | null {
  for (let k = 1; k >= 0.2; k *= 0.6) {
    const tx = x0 + (x - x0) * k;
    const tz = z0 + (z - z0) * k;
    if (passable(p, tx, tz)) return [tx, tz];
  }
  return null;
}

/**
 * Each run (a raid, or a flag carried home) takes its own way. A raid goes
 * through up to two turning points: one in the middle of the island, picked
 * fresh every run so it crosses by either bridge, and one in front of the
 * enemy base, out on its lane (all down one side for a flank, both sides for
 * a split), so it comes at the flag from somewhere new. Carriers bend off the
 * straight line home, away from the enemies when they can read the game.
 */
function planRun(m: Match, p: Player, gx: number, gz: number, sk: Skill): void {
  const s = mapScale();
  const brain = m.brains[p.team];
  const plan = PLANS[brain.plan];
  const flip = p.team === 0 ? 1 : -1;
  p.runOn = false;
  p.runStage = 0;
  p.approach = (m.rng() - 0.5) * 2.2;
  const dx = gx - p.x;
  const dz = gz - p.z;
  if (Math.hypot(dx, dz) < 30 * s) return;
  const wide = Math.max(0.3, plan.wide) * brain.wideJitter;
  if (p.carrying >= 0) {
    // Bend round the side with fewer enemies, when it can tell; otherwise either way.
    let left = 0;
    let right = 0;
    for (const o of m.players) {
      if (o.team === p.team || o.out > 0 || Math.hypot(o.x - p.x, o.z - p.z) > 40 * s) continue;
      if ((o.x - p.x) * flip > 0) right++;
      else left++;
    }
    let lean = sk.tactics > 0.3 && left !== right ? (left > right ? 1 : -1) : m.rng() < 0.5 ? -1 : 1;
    lean *= 0.5 + m.rng() * 0.8;
    const t = 0.35 + m.rng() * 0.35;
    const spot = landing(p, p.x + dx * t, p.z + dz * t, p.x + dx * t + flip * lean * 14 * s * wide, p.z + dz * t);
    if (spot) [p.runX, p.runZ, p.runOn] = [spot[0], spot[1], true];
    return;
  }
  const side = p.lane !== 0 ? p.lane : m.rng() * 2 - 1;
  // In front of the enemy base, out on the lane.
  const out = clamp(side * (0.6 + 0.4 * m.rng()) * 17 * s * wide, -26 * s, 26 * s);
  const front = landing(p, gx, gz + flip * 22 * s, gx + flip * out, gz + flip * (18 + m.rng() * 10) * s);
  if (front) [p.run2X, p.run2Z] = front;
  else [p.run2X, p.run2Z] = [gx, gz];
  // Still at home: cross the middle somewhere new first.
  if (p.z * flip > ZONE_EDGE * 0.6) {
    const mid = landing(p, 0, 0, flip * (side * 0.5 + (m.rng() - 0.5)) * 26 * s, (m.rng() - 0.5) * 16 * s);
    if (mid) {
      [p.runX, p.runZ, p.runOn] = [mid[0], mid[1], true];
      return;
    }
  }
  [p.runX, p.runZ, p.runOn, p.runStage] = [p.run2X, p.run2Z, true, 1];
}

/** The next spot on this run: its turning point until it gets there, then the goal itself. */
function along(m: Match, p: Player, tag: string, gx: number, gz: number, sk: Skill): [number, number] {
  if (p.runFor !== tag) {
    p.runFor = tag;
    planRun(m, p, gx, gz, sk);
  }
  if (p.runOn && Math.hypot(p.runX - p.x, p.runZ - p.z) < 7 * mapScale()) {
    // On to the next turning point, if the run has one.
    if (p.runStage === 0 && p.carrying < 0 && (p.run2X !== p.runX || p.run2Z !== p.runZ) && (p.run2X !== gx || p.run2Z !== gz)) [p.runX, p.runZ, p.runStage] = [p.run2X, p.run2Z, 1];
    else p.runOn = false;
  }
  return p.runOn ? [p.runX, p.runZ] : [gx, gz];
}

interface Option {
  tag: string;
  score: number;
  x: number;
  z: number;
}

/**
 * Pick the best thing to do now. The job from the team plan comes first,
 * and anything urgent close by (a thief running past, a flag on the ground,
 * a raider at home) can still pull a CPU off it. Each option gets a score
 * from how much it matters, minus how far away it is, plus a little
 * randomness (more for weaker CPUs) and a bonus for sticking with the plan.
 */
function cpuGoal(m: Match, p: Player, sk: Skill): [number, number] {
  const s = mapScale();
  const enemyTeam: Team = p.team === 0 ? 1 : 0;
  const near = (o: { x: number; z: number }) => Math.hypot(o.x - p.x, o.z - p.z);
  // In tens of meters at this map's size, so scores read the same on every map.
  const far = (o: { x: number; z: number }) => near(o) / (10 * s);
  const shared = (o: { x: number; z: number }, max: number) => sk.coord === 0 || fewCloser(m, p, o, Math.max(1, Math.round((max * sk.coord) / 3)));
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
    return along(m, p, `carry${p.carrying}`, best.x, best.z, sk);
  }

  const job = p.job;
  const brain = m.brains[p.team];
  const plan = PLANS[brain.plan];
  // A new raid starts a new run.
  if (job !== "raid") p.runFor = "";
  const enemies = m.players.filter((o) => o.team !== p.team && o.stun <= 0 && o.out <= 0);

  // The steal target: the nearest prize, or with tactics the one fewest guard.
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

  // The job first.
  if (job === "hunt") {
    const o = m.players[p.jobTarget];
    if (o && o.team !== p.team && o.carrying >= 0) {
      const [x, z] = intercept(m, p, o, sk);
      add("hunt", 84, x, z);
    }
  } else if (job === "save") {
    const f = m.flags[p.jobTarget];
    if (f && f.team === p.team && f.state === "dropped") add("save", 86, f.x, f.z);
  } else if (job === "escort") {
    const c = m.players[p.jobTarget];
    if (c && c.team === p.team && c.carrying >= 0) {
      const [x, z] = escortSpot(m, p, c);
      add("escort", 74, x, z);
    }
  } else if (job === "guard") {
    const b = m.bases[p.jobTarget] ?? m.bases[p.team];
    const [x, z] = patrolSpot(m, p, b);
    add("guard", 64, x, z);
  } else if (job === "raid") {
    if (stealBest) {
      const waiting = brain.wave === "gather" && !p.decoy && (plan.wave > 0 || plan.decoy > 0) && sk.coord >= 1 && near(stealBest) > 35 * s;
      if (waiting) {
        // Hold in the middle for the wave (or the decoys), milling about rather than standing.
        const a = m.time * 0.9 + p.weave;
        add("stage", 76, brain.stageX + Math.sin(a) * 4 * s, brain.stageZ + Math.cos(a) * 4 * s);
        p.runFor = "";
      } else {
        const [x, z] = along(m, p, "raid", ...raidSpot(p, stealBest), sk);
        add("steal", 76 * (1 + 0.2 * push(m, p, sk)), x, z);
      }
      // Flyers with a bomb loaded clear the guards off a flag from above before anyone grabs it; bombers most keenly.
      if (flies(p.def) && p.bombCd <= 0) {
        const guard = nearest(p, enemies.filter((o) => Math.hypot(o.x - stealBest!.x, o.z - stealBest!.z) < 10 * s), Infinity);
        if (guard && near(stealBest) < 40 * s) add("bomb", p.def.style === "bomber" ? 80 : 74, guard.x, guard.z);
      }
    }
  }
  if (job === "support" || opts.length === 0) {
    const [x, z] = sweepSpot(m, p);
    add("support", 56, x, z);
  }

  // A flag on the ground nearby: theirs to grab, ours to save.
  for (const f of m.flags) {
    if (f.state !== "dropped") continue;
    if (f.team === p.team) {
      if (near(f) < 18 * s && shared(f, 2)) add("save", 88 - 6 * far(f), f.x, f.z);
    } else if (job === "raid" || near(f) < 25 * s) add("prize", 95 - 5 * far(f), f.x, f.z);
  }
  // A thief running past: anyone close gives chase.
  for (const o of enemies) {
    if (o.carrying < 0 || m.flags[o.carrying].team !== p.team || near(o) > 16 * s || !shared(o, 2)) continue;
    const [lx, lz] = lead(o);
    add("chase", (job === "guard" ? 94 : 86) - 5 * far(o), lx, lz);
  }
  // Anyone else close by: guards see off raiders, bodyguards stop chasers, the middle fights for ground.
  const carrier = job === "escort" ? m.players[p.jobTarget] : undefined;
  const post = job === "guard" ? (m.bases[p.jobTarget] ?? m.bases[p.team]) : undefined;
  for (const o of enemies) {
    if (o.carrying >= 0) continue;
    const d = near(o);
    let score = -Infinity;
    if (post && Math.hypot(o.x - post.x, o.z - post.z) < 30 * s) score = 76 - 2 * far(o);
    else if (carrier && carrier.carrying >= 0 && Math.hypot(o.x - carrier.x, o.z - carrier.z) < 14) score = 80 - d;
    else if (d < 22) {
      // Pushy plans pick more fights in the middle; decoys pick them at the enemy's door. Good CPUs take on
      // anyone in reach, not just whoever is nearest, so the middle is a real fight.
      const loud = p.decoy && stealBest && near(stealBest) < 30 * s ? 34 : 0;
      const reach = sk.tactics > 0.3 ? 0.3 : 1.2;
      score = (job === "support" ? 62 + 12 * (plan.press - 0.5) : job === "raid" ? 40 + loud : 34) + (o.hp === 1 ? 10 : 0) - d * reach;
    }
    if (score === -Infinity || !shared(o, 2)) continue;
    // Too close to throw: step back to get a clear shot.
    const [lx, lz] = d < 2.5 ? [p.x + ((p.x - o.x) / (d || 1)) * 6, p.z + ((p.z - o.z) / (d || 1)) * 6] : lead(o);
    add("fight", score, lx, lz);
  }
  // Anyone close to the enemy flag may as well take it.
  if (stealBest && job !== "raid" && job !== "hunt" && near(stealBest) < 15 * s) add("steal", 70 - 2 * far(stealBest), stealBest.x, stealBest.z);

  // Back off at one hit left and let it heal, near friends or a station.
  if (sk.cautious && p.hp === 1 && countNear(m, enemyTeam, p.x, p.z, 12) > 0) {
    let spot = { x: m.bases[p.team].x, z: m.bases[p.team].z };
    let bestD = Infinity;
    for (const b of m.bases) if (b.team === p.team && near(b) < bestD) [spot, bestD] = [b, near(b)];
    for (const f of m.respawns) if (f.team === p.team && near(f) < bestD) [spot, bestD] = [f, near(f)];
    add("retreat", job === "hunt" || job === "save" ? 76 : 90, spot.x, spot.z);
  }

  if (!p.item) {
    for (const st of m.stations) if (st.cd <= 0 && near(st) < 25 * s) add("station", (job === "support" ? 58 : 46) - 1.5 * (near(st) / s), st.x, st.z);
  }
  for (const f of m.respawns) {
    if (f.team !== p.team && near(f) < 20 * s) add("unplant", (job === "support" || job === "guard" ? 64 : 56) - 1.5 * (near(f) / s), f.x, f.z);
  }

  if (p.role === "medic" && (job === "raid" || job === "support")) {
    // Follow the teammate furthest into enemy ground, a little behind them.
    const enemyZ = m.bases[enemyTeam].z;
    let front: Player | undefined;
    for (const t of m.players) {
      if (t.team !== p.team || t === p || t.out > 0 || t.job === "guard" || t.medic) continue;
      if (!front || Math.abs(t.z - enemyZ) < Math.abs(front.z - enemyZ)) front = t;
    }
    if (front) add("follow", 72, front.x, front.z - Math.sign(enemyZ) * 8 * s);
  }

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

function push(m: Match, p: Player, sk: Skill): number {
  return pushFor(m, p.team, sk);
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
