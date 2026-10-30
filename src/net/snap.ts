/**
 * What the host sends about a running match, about 20 times a second, and how a phone puts it into its own copy of
 * the match. The host's copy is the real one; every other phone only draws, so a snapshot carries what is drawn and
 * shown (positions, flags, shots, scores, the clock) and not what the CPUs are thinking. Numbers are rounded and
 * packed in flat arrays to keep each one small (well under 2 KB for 8 a side).
 */
import { ITEMS, type ItemKind, type Match, type Player, type SimEvent, type Team } from "../sim";
import type { View } from "./view";

const ITEM_IDS = Object.keys(ITEMS) as ItemKind[];

/** Numbers per player in Snap.P. */
export const PN = 16;
/** Numbers per flag in Snap.F. */
const FN = 9;
/** Numbers per shot in Snap.X. */
const XN = 13;

export interface Snap {
  /** Host match time, seconds. */
  t: number;
  tl: number;
  sc: [number, number];
  pt: [number, number];
  ot: 0 | 1;
  ov: 0 | 1;
  w: [number, number];
  P: number[];
  F: number[];
  X: number[];
  R: number[];
  S: number[];
  K: number[];
  /** For the phone it goes to: the last of its inputs the host has used, and its own player in full (see ME_KEYS). */
  a?: number;
  me?: Partial<Record<MeKey, unknown>>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function encodeSnap(m: Match): Snap {
  const P: number[] = [];
  for (const p of m.players) {
    const bits =
      (p.onSurface ? 1 : 0) | (p.diving ? 2 : 0) | (p.medium === "water" ? 4 : 0) | (p.medium === "air" ? 8 : 0) | (p.medic ? 16 : 0) | (p.cpu ? 32 : 0);
    P.push(
      r2(p.x),
      r2(p.y),
      r2(p.z),
      r3(p.heading),
      r2(p.speed),
      r2(p.vy),
      bits,
      p.carrying,
      r1(p.stun),
      r1(p.out),
      p.hp,
      p.item ? ITEM_IDS.indexOf(p.item) : -1,
      r1(p.shieldT),
      r1(p.starT),
      r1(p.turboT),
      p.score,
    );
  }
  const F: number[] = [];
  for (const f of m.flags) F.push(f.state === "home" ? 0 : f.state === "carried" ? 1 : 2, r2(f.x), r2(f.y), r2(f.z), f.carrier, f.team, f.base, f.slot, r1(f.timer));
  const X: number[] = [];
  for (const f of m.fires) {
    X.push(f.id, f.owner, f.team, r2(f.x), r2(f.y), r2(f.z), r2(f.vx), r2(f.vy), r2(f.vz), (f.bomb ? 1 : 0) | (f.confetti ? 2 : 0) | (f.skidding ? 4 : 0), f.homing ?? -1, f.seek ?? -1, r2(f.life));
  }
  const R: number[] = [];
  for (const r of m.respawns) R.push(r.id, r.team, r.owner, r2(r.x), r2(r.z));
  const K: number[] = [];
  for (const s of m.strikes) K.push(r2(s.x), r2(s.z), r2(s.t));
  return {
    t: r3(m.time),
    tl: r2(m.timeLeft),
    sc: [m.scores[0], m.scores[1]],
    pt: [r2(m.points[0]), r2(m.points[1])],
    ot: m.overtime ? 1 : 0,
    ov: m.over ? 1 : 0,
    w: [r2(m.wind[0]), r2(m.wind[1])],
    P,
    F,
    X,
    R,
    S: m.stations.map((s) => r1(s.cd)),
    K,
  };
}

/** Your own player, sent whole to your phone so it can keep moving you ahead of the host (see sim predict). */
export const ME_KEYS = [
  "x",
  "y",
  "z",
  "heading",
  "speed",
  "vy",
  "kx",
  "kz",
  "onSurface",
  "medium",
  "floatLeft",
  "jumpWasHeld",
  "stun",
  "diving",
  "breath",
  "diveCd",
  "sx",
  "sz",
  "shieldT",
  "starT",
  "turboT",
  "out",
  "hp",
  "healCd",
  "item",
  "itemHeld",
  "throwCd",
  "grabCd",
  "medicCd",
  "bombCd",
  "heat",
  "overheat",
  "gunCd",
  "stings",
  "stingT",
  "burnCd",
  "carrying",
  "score",
  "medic",
] as const satisfies ReadonlyArray<keyof Player>;
export type MeKey = (typeof ME_KEYS)[number];

export function encodeMe(p: Player): Partial<Record<MeKey, unknown>> {
  const out: Partial<Record<MeKey, unknown>> = {};
  for (const k of ME_KEYS) out[k] = p[k];
  return out;
}

/** Puts your own player from the host (in the host's frame) into your copy, turned into your frame. */
export function applyMe(local: Match, view: View, me: Partial<Record<MeKey, unknown>>): void {
  const p = local.players[0];
  for (const k of ME_KEYS) {
    const v = me[k];
    if (v === undefined) continue;
    if (typeof v === "number" && !Number.isFinite(v)) continue;
    (p as unknown as Record<string, unknown>)[k] = v;
  }
  p.x = view.x(p.x);
  p.z = view.z(p.z);
  p.kx = view.x(p.kx);
  p.kz = view.z(p.kz);
  p.sx = view.x(p.sx);
  p.sz = view.z(p.sz);
  p.heading = view.heading(p.heading);
  p.carrying = view.flag(p.carrying);
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/**
 * Puts the match as it was part way (k, 0 to 1) from snapshot `a` to `b` into `local`, this phone's copy, turned into
 * its frame by `view`. `skip` leaves a player's position alone (yours, which this phone moves itself).
 */
export function applySnap(local: Match, view: View, a: Snap, b: Snap, k: number, skip = -1): void {
  const n = local.players.length;
  if (b.P.length !== n * PN || a.P.length !== b.P.length) return;
  for (let h = 0; h < n; h++) {
    const p = local.players[view.player(h)];
    const o = h * PN;
    const B = b.P;
    const A = a.P;
    const bits = B[o + 6];
    p.cpu = (bits & 32) !== 0;
    p.medic = (bits & 16) !== 0;
    p.score = B[o + 15];
    p.item = B[o + 11] >= 0 ? (ITEM_IDS[B[o + 11]] ?? null) : null;
    if (p.id === skip) continue;
    // A jump across the island (a respawn) snaps instead of sliding.
    const far = Math.abs(A[o] - B[o]) + Math.abs(A[o + 2] - B[o + 2]) > 6;
    const kk = far ? 1 : k;
    p.x = view.x(lerp(A[o], B[o], kk));
    p.y = lerp(A[o + 1], B[o + 1], kk);
    p.z = view.z(lerp(A[o + 2], B[o + 2], kk));
    p.heading = view.heading(lerpAngle(A[o + 3], B[o + 3], kk));
    p.speed = lerp(A[o + 4], B[o + 4], kk);
    p.vy = B[o + 5];
    p.onSurface = (bits & 1) !== 0;
    p.diving = (bits & 2) !== 0;
    p.medium = bits & 8 ? "air" : bits & 4 ? "water" : "land";
    p.carrying = view.flag(B[o + 7]);
    p.stun = B[o + 8];
    p.out = B[o + 9];
    p.hp = B[o + 10];
    p.shieldT = B[o + 12];
    p.starT = B[o + 13];
    p.turboT = B[o + 14];
  }
  for (let h = 0; h < local.flags.length && (h + 1) * FN <= b.F.length; h++) {
    const f = local.flags[view.flag(h)];
    const o = h * FN;
    const B = b.F;
    const A = a.F;
    const state = B[o];
    f.state = state === 0 ? "home" : state === 1 ? "carried" : "dropped";
    const kk = A[o] === state ? k : 1;
    f.x = view.x(lerp(A[o + 1], B[o + 1], kk));
    f.y = lerp(A[o + 2], B[o + 2], kk);
    f.z = view.z(lerp(A[o + 3], B[o + 3], kk));
    f.carrier = view.player(B[o + 4]);
    f.team = view.team(B[o + 5] as Team);
    f.base = view.base(B[o + 6]);
    f.slot = B[o + 7];
    f.timer = B[o + 8];
    // A carried flag rides its carrier, wherever this phone draws them.
    if (f.state === "carried" && f.carrier >= 0 && f.carrier < n) {
      const c = local.players[f.carrier];
      f.x = c.x;
      f.y = c.y;
      f.z = c.z;
    }
  }
  // Shots: each one where it was part way between the two, new ones where they start.
  const before = new Map<number, number>();
  for (let o = 0; o + XN <= a.X.length; o += XN) before.set(a.X[o], o);
  local.fires.length = 0;
  for (let o = 0; o + XN <= b.X.length; o += XN) {
    const B = b.X;
    const ao = before.get(B[o]);
    const A = ao === undefined ? B : a.X;
    const at = ao === undefined ? o : ao;
    const bits = B[o + 9];
    local.fires.push({
      id: B[o],
      owner: view.player(B[o + 1]),
      team: view.team(B[o + 2] as Team),
      x: view.x(lerp(A[at + 3], B[o + 3], k)),
      y: lerp(A[at + 4], B[o + 4], k),
      z: view.z(lerp(A[at + 5], B[o + 5], k)),
      vx: view.x(B[o + 6]),
      vy: B[o + 7],
      vz: view.z(B[o + 8]),
      bomb: (bits & 1) !== 0,
      confetti: (bits & 2) !== 0,
      skidding: (bits & 4) !== 0,
      homing: B[o + 10] >= 0 ? view.player(B[o + 10]) : -1,
      seek: B[o + 11] >= 0 ? view.player(B[o + 11]) : undefined,
      life: B[o + 12],
    });
  }
  local.respawns.length = 0;
  for (let o = 0; o + 5 <= b.R.length; o += 5) {
    local.respawns.push({ id: b.R[o], team: view.team(b.R[o + 1] as Team), owner: view.player(b.R[o + 2]), x: view.x(b.R[o + 3]), z: view.z(b.R[o + 4]) });
  }
  b.S.forEach((cd, h) => {
    const s = local.stations[view.station(h)];
    if (s) s.cd = cd;
  });
  local.strikes.length = 0;
  for (let o = 0; o + 3 <= b.K.length; o += 3) local.strikes.push({ x: view.x(b.K[o]), z: view.z(b.K[o + 1]), t: b.K[o + 2] });
  local.time = lerp(a.t, b.t, k);
  local.timeLeft = Math.max(0, lerp(a.tl, b.tl, k));
  const t0 = view.team(0);
  local.scores[t0] = b.sc[0];
  local.scores[1 - t0] = b.sc[1];
  local.points[t0] = b.pt[0];
  local.points[1 - t0] = b.pt[1];
  local.overtime = b.ot === 1;
  local.over = b.ov === 1;
  local.wind[0] = view.x(b.w[0]);
  local.wind[1] = view.z(b.w[1]);
}

/** A host event turned into this phone's frame. */
export function mapEvent(e: SimEvent, view: View): SimEvent {
  const out = { ...e } as Record<string, unknown>;
  if (typeof out.x === "number") out.x = view.x(out.x);
  if (typeof out.z === "number") out.z = view.z(out.z);
  if (typeof out.player === "number" && out.player >= 0) out.player = view.player(out.player);
  if (typeof out.by === "number" && out.by >= 0) out.by = view.player(out.by);
  if (out.team === 0 || out.team === 1) out.team = view.team(out.team);
  if (typeof out.station === "number") out.station = view.station(out.station);
  if (e.kind === "end" && e.winner !== -1) out.winner = view.team(e.winner);
  return out as unknown as SimEvent;
}
