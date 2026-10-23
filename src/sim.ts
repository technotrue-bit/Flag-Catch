/**
 * The match simulation. No Three.js here: plain numbers stepped at a fixed
 * 60 Hz, so a seed replays the same match and the tests can run it headless.
 */
import { ANIMALS, type AnimalDef } from "./animals";
import { mulberry32, type RNG } from "./rng";
import { BRIDGE_X, WORLD_HALF_X, WORLD_HALF_Z, ZONE_EDGE, groundHeight, inWorld, isWater, landOf, surfaceHeight } from "./terrain";

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
  baseRadius: 4.2,
};

export interface Input {
  /** Desired direction in world space; length 0..1 is the throttle. */
  dirX: number;
  dirZ: number;
  jump: boolean;
  throwPressed: boolean;
}

export const NO_INPUT: Input = { dirX: 0, dirZ: 0, jump: false, throwPressed: false };

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
  /** CPU state. Defenders hold their homeland, attackers raid. */
  role: "attack" | "defend";
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
  | { kind: "splash"; x: number; z: number; player: number }
  | { kind: "end"; winner: Team | -1 };

export interface Base {
  team: Team;
  x: number;
  z: number;
}

export interface Match {
  rng: RNG;
  time: number;
  timeLeft: number;
  over: boolean;
  players: Player[];
  flags: Flag[];
  fires: Firecracker[];
  bases: [Base, Base];
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
}

export function createMatch(opts: MatchOptions): Match {
  const rng = mulberry32(opts.seed);
  const bases: [Base, Base] = [
    { team: 0, x: 0, z: 84 },
    { team: 1, x: 0, z: -84 },
  ];
  const players: Player[] = [];
  const ids = Object.keys(ANIMALS);
  for (let team = 0 as Team; team <= 1; team = (team + 1) as Team) {
    for (let i = 0; i < opts.perTeam; i++) {
      const human = team === 0 && i === 0;
      const def = human ? ANIMALS[opts.humanAnimal] ?? ANIMALS.lion : ANIMALS[ids[Math.floor(rng() * ids.length)]];
      const b = bases[team];
      const a = (i / opts.perTeam) * Math.PI * 2 + team;
      const x = b.x + Math.cos(a) * 3;
      const z = b.z + Math.sin(a) * 3;
      const p = makePlayer(players.length, team, def, !human, x, z, Math.atan2(-b.x, -b.z));
      p.role = i % 3 === 1 ? "defend" : "attack";
      players.push(p);
    }
    if (team === 1) break;
  }
  const flags: Flag[] = [];
  for (const team of [0, 1] as const) {
    for (let i = 0; i < opts.flagsPerTeam; i++) {
      const [x, z] = baseSlot(bases[team], i);
      flags.push({ id: flags.length, team, state: "home", x, y: surfaceHeight(x, z), z, carrier: -1, slot: i, timer: 0 });
    }
  }
  return {
    rng,
    time: 0,
    timeLeft: opts.duration,
    over: false,
    players,
    flags,
    fires: [],
    bases,
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
    role: "attack",
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

  for (const p of m.players) {
    const input = p.cpu ? cpuInput(m, p) : human;
    movePlayer(m, p, input);
  }
  stepFires(m);
  stepFlags(m);

  if (m.timeLeft <= 0) {
    m.timeLeft = 0;
    m.over = true;
    const [a, b] = m.scores;
    m.events.push({ kind: "end", winner: a === b ? -1 : a > b ? 0 : 1 });
  }
}

function speedFor(p: Player): number {
  if (p.medium === "air") return p.def.airSpeed;
  return p.medium === "water" ? p.def.waterSpeed : p.def.landSpeed;
}

function movePlayer(m: Match, p: Player, input: Input): void {
  p.throwCd = Math.max(0, p.throwCd - STEP);
  p.grabCd = Math.max(0, p.grabCd - STEP);
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
    p.vy = p.def.jumpSpeed;
    p.onSurface = false;
    m.events.push({ kind: "jump", player: p.id });
  }
  let g = tune.gravity;
  if (!p.onSurface && jumpDown && p.floatLeft > 0) {
    p.floatLeft -= STEP;
    if (p.def.climb > 0) {
      p.vy = Math.min(p.vy + p.def.climb * STEP, 7);
      g *= 0.35;
    } else if (p.vy < 2) {
      g *= 0.3;
    }
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

  if (!stunned && input.throwPressed && p.throwCd <= 0) throwFire(m, p);
}

function throwFire(m: Match, p: Player): void {
  const d = p.def;
  p.throwCd = tune.throwCooldown * d.shotCooldown;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const speed = tune.throwSpeed * d.shotSpeed + Math.max(0, p.speed) * 0.6;
  const fire: Firecracker = {
    id: m.nextFireId++,
    owner: p.id,
    team: p.team,
    x: p.x + fx * 1.4,
    y: p.y + 1.2,
    z: p.z + fz * 1.4,
    vx: fx * speed,
    vy: tune.throwLift * d.shotLift,
    vz: fz * speed,
    skidding: false,
    life: tune.fireLife,
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
    if (!f.skidding && f.y <= surf + 0.3) {
      // Landed: skid along the ground and the water like a shell.
      f.skidding = true;
      f.vy = 0;
    }
    if (f.skidding) {
      f.y = surf + 0.3;
      const k = Math.exp(-tune.skidFriction * STEP);
      f.vx *= k;
      f.vz *= k;
    }
    let hit = false;
    for (const p of m.players) {
      if (p.team === f.team || p.stun > 0) continue;
      const dx = p.x - f.x;
      const dz = p.z - f.z;
      const dy = p.y + 0.7 - f.y;
      if (dx * dx + dz * dz + dy * dy < tune.hitRadius * tune.hitRadius) {
        pop(m, p, f);
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

function pop(m: Match, p: Player, f: Firecracker): void {
  p.stun = tune.stunTime;
  p.vy = tune.popLift;
  p.onSurface = false;
  const len = Math.hypot(f.vx, f.vz) || 1;
  p.kx = (f.vx / len) * tune.popPush;
  p.kz = (f.vz / len) * tune.popPush;
  p.speed *= 0.2;
  const owner = m.players[f.owner];
  if (owner) owner.score += 5;
  m.events.push({ kind: "pop", x: p.x, y: p.y + 0.8, z: p.z, player: p.id, by: f.owner });
  dropFlag(m, p);
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

/** Where flag number `slot` stands in a base: an outer ring, then an inner one. */
export function baseSlot(b: Base, slot: number): [number, number] {
  const outer = slot < 8;
  const k = outer ? slot : slot - 8;
  const a = outer ? (k / 8) * Math.PI * 2 + Math.PI / 8 : (k / 4) * Math.PI * 2;
  const r = outer ? 2.7 : slot < 12 ? 1.3 : 0.4;
  return [b.x + Math.cos(a) * r, b.z + Math.sin(a) * r];
}

function placeHome(m: Match, flag: Flag, team: Team): void {
  const taken = new Set(m.flags.filter((f) => f !== flag && f.team === team && f.state === "home").map((f) => f.slot));
  let slot = 0;
  while (taken.has(slot)) slot++;
  const [x, z] = baseSlot(m.bases[team], slot);
  flag.team = team;
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
      const base = m.bases[c.team];
      if (Math.hypot(c.x - base.x, c.z - base.z) < tune.baseRadius) {
        c.carrying = -1;
        c.score += 25;
        m.scores[c.team] += 1;
        placeHome(m, flag, c.team);
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
    for (const p of m.players) {
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
  placeHome(m, flag, flag.team);
  m.events.push({ kind: "return", ...at, player: by, team: flag.team });
}

/**
 * Prototype CPU. Everyone carries a stolen flag home. Defenders hunt
 * whoever took one of their flags, save dropped ones, chase raiders in
 * their homeland and otherwise guard the base. Attackers save nearby dropped
 * flags, chase thieves close by, else raid the enemy base. Land animals use
 * the bridges. Throws when an enemy is ahead.
 */
function cpuInput(m: Match, p: Player): Input {
  p.thinkCd -= STEP;
  if (p.thinkCd <= 0) {
    p.thinkCd = 0.25 + m.rng() * 0.2;
    const [gx, gz] = cpuGoal(m, p);
    [p.goalX, p.goalZ] = p.def.cls === "land" ? viaBridge(p, gx, gz) : [gx, gz];
  }
  const dx = p.goalX - p.x;
  const dz = p.goalZ - p.z;
  const d = Math.hypot(dx, dz) || 1;
  const throttle = Math.min(1, d / 4) * 0.92;

  let throwPressed = false;
  const fwdX = Math.sin(p.heading);
  const fwdZ = Math.cos(p.heading);
  for (const o of m.players) {
    if (o.team === p.team || o.stun > 0) continue;
    const ox = o.x - p.x;
    const oz = o.z - p.z;
    const od = Math.hypot(ox, oz);
    if (od < 14 && od > 1 && (ox * fwdX + oz * fwdZ) / od > 0.93) {
      throwPressed = m.rng() < (o.carrying >= 0 ? 0.12 : 0.03);
      break;
    }
  }
  // Hop small rises and channels now and then.
  const jump = p.onSurface ? groundHeight(p.x + fwdX * 3, p.z + fwdZ * 3) - p.y > 1.2 || m.rng() < 0.004 : p.vy > 0;
  return { dirX: (dx / d) * throttle, dirZ: (dz / d) * throttle, jump, throwPressed };
}

function cpuGoal(m: Match, p: Player): [number, number] {
  const home = m.bases[p.team];
  if (p.carrying >= 0) return [home.x, home.z];
  const enemies = m.players.filter((o) => o.team !== p.team && o.stun <= 0);
  const thieves = enemies.filter((o) => o.carrying >= 0 && m.flags[o.carrying].team === p.team);
  const ourDropped = m.flags.filter((f) => f.team === p.team && f.state === "dropped");
  if (p.role === "defend") {
    const thief = nearest(p, thieves, 70);
    if (thief) return lead(thief);
    const dropped = nearest(p, ourDropped, 60);
    if (dropped) return [dropped.x, dropped.z];
    const raider = nearest(p, enemies.filter((o) => landOf(o.z) === p.team), 45);
    if (raider) return lead(raider);
    // Stand guard in front of the base.
    const side = p.id % 2 === 0 ? 1 : -1;
    return [home.x + side * 7, home.z * 0.84];
  }
  const dropped = nearest(p, ourDropped, 25);
  if (dropped) return [dropped.x, dropped.z];
  const thief = nearest(p, thieves, 22);
  if (thief) return lead(thief);
  const prize = nearest(p, m.flags.filter((f) => f.team !== p.team && f.state !== "carried"), Infinity);
  if (prize) return [prize.x, prize.z];
  const enemyHome = m.bases[p.team === 0 ? 1 : 0];
  return [0, enemyHome.z * 0.6];
}

function lead(o: Player): [number, number] {
  return [o.x + Math.sin(o.heading) * 3, o.z + Math.cos(o.heading) * 3];
}

/** Route a land animal over the nearest bridge when its goal is across a channel. */
function viaBridge(p: Player, gx: number, gz: number): [number, number] {
  let best: [number, number] | null = null;
  let bestGap = Infinity;
  for (const g of [ZONE_EDGE, -ZONE_EDGE]) {
    const away = Math.abs(p.z - g);
    if ((p.z - g) * (gz - g) >= 0 || away < 5 || away >= bestGap) continue;
    const bx = (p.x + gx) / 2 >= 0 ? BRIDGE_X : -BRIDGE_X;
    // Line up with the bridge first, then drive across it.
    best = away > 11 ? [bx, g + Math.sign(p.z - g) * 9] : [bx, g];
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
