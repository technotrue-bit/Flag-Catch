/**
 * The match an online room plays: the host's copy, which runs the game, and each other phone's copy, which only
 * draws it from that phone's side (see view.ts).
 */
import { ANIMALS } from "../animals";
import { type Difficulty, type Match, type Mode, type Team, createMatch, setAnimal } from "../sim";
import { mapFor } from "../terrain";
import { WORLDS } from "../worlds";
import { type View, makeView } from "./view";

/** Online rooms play on the classic island: 8 a side, real players first and CPUs in every other slot. */
export const ONLINE_PER_TEAM = 8;
/** Real players in one room at most (the host's phone sends the match to each of the others). */
export const ONLINE_MAX = 8;

export interface Seat {
  team: Team;
  slot: number;
  animal: string;
  medic: boolean;
}

/** Everything a phone needs to build the same match as the host; sent when the match starts. */
export interface OnlineSetup {
  v: 1;
  seed: number;
  mode: Mode;
  world: string;
  difficulty: Difficulty;
  perTeam: number;
  duration: number;
  flagsPerTeam: number;
  /** Every real player, the host first (team 0, slot 0). */
  seats: Seat[];
  /** Every animal in the host's match, by host player id, CPUs included. */
  animals: string[];
}

/** The setup the host plays, from its picks and the seats in its room. */
export function newSetup(seed: number, mode: Mode, world: string, difficulty: Difficulty, seats: Seat[]): OnlineSetup {
  const perTeam = ONLINE_PER_TEAM;
  const map = mapFor(perTeam);
  return {
    v: 1,
    seed,
    mode,
    world,
    difficulty,
    perTeam,
    duration: mode === "hoard" ? 900 : map.duration,
    flagsPerTeam: mode === "hoard" ? map.flagsPerTeam : 1,
    seats,
    animals: [],
  };
}

function build(s: OnlineSetup, seats: Seat[]): Match {
  const me = seats.find((x) => x.team === 0 && x.slot === 0);
  return createMatch({
    seed: s.seed,
    humanAnimal: me?.animal ?? "lion",
    humanMedic: !!me?.medic,
    perTeam: s.perTeam,
    duration: s.duration,
    flagsPerTeam: s.flagsPerTeam,
    mode: s.mode,
    map: mapFor(s.perTeam),
    difficulty: s.difficulty,
    world: s.world,
    seats,
    evenBots: true,
  });
}

/** The host's own match. Fills in `setup.animals` for the others. */
export function hostMatch(setup: OnlineSetup): Match {
  const m = build(setup, setup.seats);
  setup.animals = m.players.map((p) => p.def.id);
  return m;
}

/** A phone's copy of the host's match, seen from the seat with host id `me`. */
export function guestMatch(setup: OnlineSetup, me: number): { match: Match; view: View } {
  const n = setup.perTeam;
  // Seats as they sit from this phone's side: you in slot 0 of team 0.
  const probe = makeView(me, n, setup.flagsPerTeam, [], []);
  const seats = setup.seats.map((s) => {
    const l = probe.player(s.team * n + s.slot);
    return { ...s, team: Math.floor(l / n) as Team, slot: l % n };
  });
  const match = build(setup, seats);
  const view = makeView(me, n, setup.flagsPerTeam, match.bases, match.stations);
  setup.animals.forEach((id, h) => {
    if (ANIMALS[id]) setAnimal(match.players[view.player(h)], id);
  });
  return { match, view };
}

/** A setup from another phone, checked before anything is built from it. */
export function checkSetup(raw: unknown): OnlineSetup | null {
  const s = raw as Partial<OnlineSetup> | null;
  if (!s || s.v !== 1) return null;
  if (typeof s.seed !== "number" || !Number.isFinite(s.seed)) return null;
  if (s.mode !== "capture" && s.mode !== "hoard" && s.mode !== "playful") return null;
  if (!WORLDS.some((w) => w.id === s.world)) return null;
  if (s.difficulty !== "easy" && s.difficulty !== "medium" && s.difficulty !== "hard") return null;
  if (s.perTeam !== ONLINE_PER_TEAM) return null;
  if (typeof s.duration !== "number" || s.duration < 20 || s.duration > 900) return null;
  if (typeof s.flagsPerTeam !== "number" || s.flagsPerTeam < 1 || s.flagsPerTeam > 20) return null;
  if (!Array.isArray(s.seats) || s.seats.length < 1 || s.seats.length > ONLINE_MAX) return null;
  const used = new Set<number>();
  for (const seat of s.seats) {
    if (!seat || (seat.team !== 0 && seat.team !== 1) || !Number.isInteger(seat.slot) || seat.slot < 0 || seat.slot >= s.perTeam) return null;
    if (!ANIMALS[seat.animal]) return null;
    const id = seat.team * s.perTeam + seat.slot;
    if (used.has(id)) return null;
    used.add(id);
  }
  if (s.seats[0].team !== 0 || s.seats[0].slot !== 0) return null;
  if (!Array.isArray(s.animals) || s.animals.length !== s.perTeam * 2 || !s.animals.every((a) => typeof a === "string" && !!ANIMALS[a])) return null;
  return s as OnlineSetup;
}
