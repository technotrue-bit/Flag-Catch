import { describe, expect, it } from "vitest";
import { ANIMALS } from "./animals";
import { HOARD_TARGET, NO_INPUT, STEP, createMatch, step, tune } from "./sim";
import { BRIDGE_X, ZONE_EDGE, groundHeight, isWater, landOf } from "./terrain";

const opts = { seed: 3, humanAnimal: "lion", perTeam: 4, duration: 60, flagsPerTeam: 5 };

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

  it("CPU teams steal, pop and bank flags in a full match", () => {
    const { m, log } = run(5, 90);
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

  it("each team's flags start at home in its own base, and nobody scores early", () => {
    const m = createMatch(opts);
    expect(landOf(m.bases[0].z)).toBe(0);
    expect(landOf(m.bases[1].z)).toBe(1);
    for (const team of [0, 1] as const) {
      const mine = m.flags.filter((f) => f.team === team);
      expect(mine).toHaveLength(5);
      for (const f of mine) {
        expect(f.state).toBe("home");
        expect(Math.hypot(f.x - m.bases[team].x, f.z - m.bases[team].z)).toBeLessThan(tune.baseRadius);
      }
    }
    m.players[0].cpu = true;
    for (let i = 0; i < 15 / STEP; i++) step(m, NO_INPUT);
    expect(m.scores).toEqual([0, 0]);
  });

  it("you can't pick up your own flag, only steal the enemy's", () => {
    const m = createMatch({ ...opts, perTeam: 1 });
    const [me, them] = m.players;
    them.cpu = false;
    const own = m.flags.find((f) => f.team === 0)!;
    me.x = own.x;
    me.z = own.z;
    step(m, NO_INPUT);
    expect(me.carrying).toBe(-1);
    const prize = m.flags.find((f) => f.team === 1)!;
    me.x = prize.x;
    me.z = prize.z;
    me.y = prize.y;
    step(m, NO_INPUT);
    expect(me.carrying).toBe(prize.id);
    // Bring it home: score, and the flag now sits in our base.
    me.x = m.bases[0].x;
    me.z = m.bases[0].z;
    step(m, NO_INPUT);
    expect(m.scores).toEqual([1, 0]);
    expect(prize.team).toBe(0);
    expect(prize.state).toBe("home");
  });

  it("owners save a dropped flag by touching it", () => {
    const m = createMatch({ ...opts, perTeam: 1 });
    const [me, them] = m.players;
    them.cpu = false;
    const ours = m.flags.find((f) => f.team === 0)!;
    ours.state = "dropped";
    ours.timer = 12;
    ours.x = me.x = 0;
    ours.z = me.z = 20;
    ours.y = me.y = groundHeight(0, 20);
    step(m, NO_INPUT);
    expect(ours.state).toBe("home");
    expect(Math.hypot(ours.x - m.bases[0].x, ours.z - m.bases[0].z)).toBeLessThan(tune.baseRadius);
  });

  it("both teams capture flags over a full match", () => {
    let a = 0;
    let b = 0;
    for (const seed of [1, 2, 4, 9]) {
      const m = createMatch({ ...opts, seed, duration: 180 });
      m.players[0].cpu = true;
      for (let i = 0; i < 181 / STEP; i++) step(m, NO_INPUT);
      a += m.scores[0];
      b += m.scores[1];
    }
    expect(a).toBeGreaterThan(3);
    expect(b).toBeGreaterThan(3);
  });

  it("Hoard: flags in your base count points up, and the first to the target wins", () => {
    const m = createMatch({ ...opts, duration: 900, mode: "hoard" });
    m.players[0].cpu = true;
    for (let i = 0; i < 10 / STEP; i++) step(m, NO_INPUT);
    // Five flags each for ten seconds is about 50 points a side, still climbing.
    expect(m.scores[0]).toBeGreaterThan(40);
    expect(m.scores[1]).toBeGreaterThan(40);
    expect(m.over).toBe(false);
    while (!m.over) step(m, NO_INPUT);
    expect(Math.max(...m.scores)).toBe(HOARD_TARGET);
    expect(m.time).toBeLessThan(600);
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
