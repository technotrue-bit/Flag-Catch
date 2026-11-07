import { describe, expect, it } from "vitest";
import { type Match, type Mode, NO_INPUT, STEP, createMatch, setAnimal, step } from "./sim";
import { isWater, surfaceHeight } from "./terrain";

type P = Match["players"][number];
const match = (mode: Mode = "capture", world = "home", perTeam = 8, seed = 5) => createMatch({ seed, humanAnimal: "lion", perTeam, duration: 300, flagsPerTeam: 1, mode, world });
const place = (p: P, x: number, z: number) => {
  p.x = x;
  p.z = z;
  p.y = surfaceHeight(x, z);
  p.speed = 0;
  p.shieldT = 0;
};
/** Everyone but the listed animals parked and harmless. */
function only(m: Match, ...keep: P[]) {
  for (const p of m.players) {
    p.cpu = true;
    if (!keep.includes(p)) {
      p.stun = 999;
      place(p, 0, p.team === 0 ? 60 : -60);
    }
  }
}
/** A point in open water and one on dry land about `gap` meters from it. */
function shore(gap: number): { water: [number, number]; land: [number, number] } {
  for (let z = -80; z <= 80; z += 0.5) {
    for (let x = -30; x <= 30; x += 1) {
      if (!isWater(x, z) || !isWater(x + 2, z) || !isWater(x - 2, z) || !isWater(x, z + 2) || !isWater(x, z - 2)) continue;
      for (const dz of [gap, -gap]) if (!isWater(x, z + dz) && !isWater(x, z + dz * 1.4)) return { water: [x, z], land: [x, z + dz] };
    }
  }
  throw new Error("no shore");
}

describe("combat feel", () => {
  it("a CPU squares up at throwing range instead of ramming into its rival", () => {
    const m = match("deathmatch");
    const me = m.players.find((p) => p.team === 0 && p.def.cls === "land")!;
    const foe = m.players.find((p) => p.team === 1 && p.def.cls === "land")!;
    only(m, me, foe);
    place(me, 0, 6);
    place(foe, 0, -6);
    let closest = Infinity;
    for (let i = 0; i < 3 / STEP; i++) {
      step(m, NO_INPUT);
      if (me.out <= 0 && foe.out <= 0) closest = Math.min(closest, Math.hypot(me.x - foe.x, me.z - foe.z));
    }
    expect(closest).toBeGreaterThan(3);
  });

  it("a swimmer fights a rival on the shore from the water, and a land animal won't wade in after a swimmer", () => {
    const m = match("deathmatch");
    const { water, land } = shore(8);
    const shark = m.players.find((p) => p.team === 0 && p.id !== 0)!;
    setAnimal(shark, "shark");
    const lion = m.players.find((p) => p.team === 1)!;
    setAnimal(lion, "lion");
    only(m, shark, lion);
    place(shark, ...water);
    place(lion, ...land);
    let wetTime = 0;
    let lionWet = 0;
    for (let i = 0; i < 5 / STEP; i++) {
      // Nobody gets knocked out here: this is about where they choose to fight from.
      shark.hp = lion.hp = 3;
      step(m, NO_INPUT);
      // It may cut over a spit of land on the way; once it has its spot, it stays in the water.
      if (i * STEP >= 3 && isWater(shark.x, shark.z)) wetTime += STEP;
      if (isWater(lion.x, lion.z)) lionWet += STEP;
    }
    expect(wetTime).toBeGreaterThan(1.8);
    expect(lionWet).toBeLessThan(0.5);
  });

  it("swimmers spend much of a match in the water, and make most of their knockouts there", () => {
    let wet = 0;
    let n = 0;
    let kos = 0;
    let wetKos = 0;
    for (const seed of [21, 22]) {
      const m = match("deathmatch", "home", 8, seed);
      for (const p of m.players) p.cpu = true;
      const before = new Map(m.players.map((p) => [p.id, 0]));
      for (let i = 0; i < 120 / STEP; i++) {
        step(m, NO_INPUT);
        for (const p of m.players) {
          if (p.def.cls !== "water") continue;
          const got = p.kos - before.get(p.id)!;
          if (got > 0) {
            kos += got;
            if (isWater(p.x, p.z)) wetKos += got;
          }
          before.set(p.id, p.kos);
          if (i % 30 === 0 && p.out <= 0) {
            n++;
            if (isWater(p.x, p.z)) wet++;
          }
        }
      }
    }
    expect(wet / n).toBeGreaterThan(0.35);
    expect(wetKos / kos).toBeGreaterThan(0.5);
  });

  it("Team Deathmatch spreads into several fights instead of one pile in the middle", () => {
    let crowd = 0;
    let n = 0;
    for (const seed of [21, 22]) {
      const m = match("deathmatch", "home", 8, seed);
      for (const p of m.players) p.cpu = true;
      for (let i = 0; i < 120 / STEP; i++) {
        step(m, NO_INPUT);
        if (i % 30) continue;
        const live = m.players.filter((p) => p.out <= 0);
        for (const p of live) {
          n++;
          for (const o of live) if (o !== p && Math.hypot(o.x - p.x, o.z - p.z) < 5) crowd++;
        }
      }
    }
    // Before the fighters learned to square up and spread out this was about 1 other animal within 5 m.
    expect(crowd / n).toBeLessThan(0.9);
  });

  it("a flyer comes to cover a teammate carrying a flag that rivals are closing in on", () => {
    const m = match("capture");
    const eagle = m.players.find((p) => p.team === 0 && p.id !== 0 && p.def.cls !== "air")!;
    setAnimal(eagle, "eagle");
    const mate = m.players.find((p) => p.team === 0 && p.def.cls === "land" && p.id !== 0 && p !== eagle)!;
    const foes = m.players.filter((p) => p.team === 1 && p.def.cls === "land").slice(0, 2);
    only(m, eagle, mate, ...foes);
    eagle.bombCd = 20;
    place(mate, 0, 4);
    place(foes[0], 5, -2);
    place(foes[1], -5, -2);
    place(eagle, 0, 40);
    // The teammate has the enemy flag.
    const flag = m.flags.find((f) => f.team === 1)!;
    flag.state = "carried";
    flag.carrier = mate.id;
    mate.carrying = flag.id;
    const start = Math.hypot(eagle.x - mate.x, eagle.z - mate.z);
    // The teammate and the rivals stand still (no CPU at the wheel) so the picture holds.
    for (const f of [mate, ...foes]) f.cpu = false;
    const tags = new Set<string>();
    for (let i = 0; i < 1.5 / STEP; i++) {
      for (const f of [mate, ...foes]) f.hp = 3;
      step(m, NO_INPUT, () => NO_INPUT);
      tags.add(eagle.goalTag);
    }
    expect(tags.has("cover") || tags.has("escort") || tags.has("fight")).toBe(true);
    expect(Math.hypot(eagle.x - mate.x, eagle.z - mate.z)).toBeLessThan(start - 10);
  });

  it("a flyer with its bomb loaded goes for a bunch of rivals", () => {
    const m = match("capture");
    const eagle = m.players.find((p) => p.team === 0 && p.id !== 0)!;
    setAnimal(eagle, "eagle");
    const foes = m.players.filter((p) => p.team === 1 && p.def.cls === "land").slice(0, 3);
    only(m, eagle, ...foes);
    eagle.bombCd = 0;
    foes.forEach((f, i) => place(f, -15 + i * 2, 0));
    place(eagle, 20, 25);
    for (const f of foes) f.cpu = false;
    const start = Math.hypot(eagle.x - foes[1].x, eagle.z - foes[1].z);
    const tags = new Set<string>();
    for (let i = 0; i < 1 / STEP; i++) {
      for (const f of foes) f.hp = 3;
      step(m, NO_INPUT, () => NO_INPUT);
      tags.add(eagle.goalTag);
    }
    expect(tags.has("bombrun")).toBe(true);
    expect(Math.hypot(eagle.x - foes[1].x, eagle.z - foes[1].z)).toBeLessThan(start - 8);
  });
});
