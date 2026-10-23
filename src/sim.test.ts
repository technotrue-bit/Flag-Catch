import { describe, expect, it } from "vitest";
import { ANIMALS } from "./animals";
import { NO_INPUT, STEP, createMatch, step, tune } from "./sim";
import { BRIDGE_X, ZONE_EDGE, groundHeight, isWater, landOf } from "./terrain";

const opts = { seed: 3, humanAnimal: "lion", perTeam: 4, duration: 60, flagCount: 8 };

function run(seed: number, seconds: number) {
  const m = createMatch({ ...opts, seed });
  const log: string[] = [];
  for (let i = 0; i < seconds / STEP; i++) {
    step(m, NO_INPUT);
    for (const e of m.events) if (e.kind !== "jump") log.push(e.kind);
  }
  return { m, log };
}

describe("match sim", () => {
  it("replays the same match from the same seed", () => {
    const a = run(11, 30);
    const b = run(11, 30);
    expect(a.log).toEqual(b.log);
    expect(a.m.players.map((p) => [p.x, p.z])).toEqual(b.m.players.map((p) => [p.x, p.z]));
  });

  it("CPU teams grab, pop and bank flags in a full match", () => {
    const { m, log } = run(5, 61);
    expect(log).toContain("grab");
    expect(log).toContain("throw");
    expect(log).toContain("bank");
    expect(m.over).toBe(true);
    expect(m.scores[0] + m.scores[1]).toBeGreaterThan(0);
  });

  it("each class is fastest in its own medium", () => {
    const { lion, penguin, eagle } = ANIMALS;
    expect(lion.landSpeed).toBeGreaterThan(penguin.landSpeed);
    expect(penguin.waterSpeed).toBeGreaterThan(lion.waterSpeed);
    expect(eagle.floatTime).toBeGreaterThan(lion.floatTime);
  });

  it("the map is three lands split by channels, with bridges across", () => {
    expect(groundHeight(0, 0)).toBeGreaterThan(1);
    expect(groundHeight(0, 70)).toBeGreaterThan(1);
    expect(groundHeight(0, -70)).toBeGreaterThan(1);
    expect(isWater(0, ZONE_EDGE)).toBe(true);
    expect(isWater(0, -ZONE_EDGE)).toBe(true);
    expect(isWater(13, -6)).toBe(true);
    expect(isWater(48, 0)).toBe(true);
    // Every bridge stays dry from the middle land into the homeland.
    for (const x of [BRIDGE_X, -BRIDGE_X]) {
      for (let z = 20; z <= 52; z += 0.5) {
        expect(groundHeight(x, z)).toBeGreaterThan(0);
        expect(groundHeight(x, -z)).toBeGreaterThan(0);
      }
    }
  });

  it("the map is the same for both teams", () => {
    for (let i = 0; i < 400; i++) {
      const x = ((i * 37) % 100) - 50;
      const z = ((i * 53) % 228) - 114;
      expect(groundHeight(x, z)).toBeCloseTo(groundHeight(-x, -z), 9);
    }
  });

  it("bases sit in their homelands and flags start spread over all three lands", () => {
    const m = createMatch(opts);
    expect(landOf(m.bases[0].z)).toBe(0);
    expect(landOf(m.bases[1].z)).toBe(1);
    const lands = m.flags.map((f) => landOf(f.z));
    expect(lands.filter((l) => l === -1)).toHaveLength(4);
    expect(lands.filter((l) => l === 0)).toHaveLength(2);
    expect(lands.filter((l) => l === 1)).toHaveLength(2);
  });

  it("both teams bank flags over a full match", () => {
    const m = createMatch({ ...opts, seed: 9, duration: 180 });
    m.players[0].cpu = true;
    for (let i = 0; i < 181 / STEP; i++) step(m, NO_INPUT);
    expect(m.scores[0]).toBeGreaterThan(5);
    expect(m.scores[1]).toBeGreaterThan(5);
  });

  it("the wolf is the fastest car and shoots harder and more often", () => {
    const { lion, wolf } = ANIMALS;
    expect(wolf.cls).toBe("land");
    expect(wolf.landSpeed).toBeGreaterThan(lion.landSpeed);
    const m = createMatch({ ...opts, humanAnimal: "wolf" });
    const p = m.players[0];
    step(m, { ...NO_INPUT, throwPressed: true });
    const f = m.fires[0];
    expect(Math.hypot(f.vx, f.vz)).toBeGreaterThan(tune.throwSpeed * 1.2);
    expect(p.throwCd).toBeLessThan(tune.throwCooldown);
  });

  it("a held stick drives the player forward on land", () => {
    const m = createMatch(opts);
    const p = m.players[0];
    const x0 = p.x;
    const z0 = p.z;
    for (let i = 0; i < 60; i++) step(m, { dirX: Math.sin(p.heading), dirZ: Math.cos(p.heading), jump: false, throwPressed: false });
    expect(Math.hypot(p.x - x0, p.z - z0)).toBeGreaterThan(6);
  });
});
