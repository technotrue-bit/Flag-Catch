import { describe, expect, it } from "vitest";
import { ANIMALS } from "./animals";
import { NO_INPUT, STEP, createMatch, step } from "./sim";
import { groundHeight, isWater } from "./terrain";

const opts = { seed: 3, humanAnimal: "lion", perTeam: 4, duration: 60, flagCount: 6 };

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

  it("the island has land, a lagoon and open sea", () => {
    expect(groundHeight(0, 0)).toBeGreaterThan(1);
    expect(isWater(20, -6)).toBe(true);
    expect(isWater(75, 0)).toBe(true);
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
