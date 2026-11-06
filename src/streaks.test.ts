import { describe, expect, it } from "vitest";
import { ANIMALS } from "./animals";
import { type Input, type Match, NO_INPUT, STEP, createMatch, giveItem, step, tune } from "./sim";
import { surfaceHeight } from "./terrain";
import { shortName, streakTitle } from "./streaks";

const opts = { seed: 3, humanAnimal: "lion", perTeam: 8, duration: 120, flagsPerTeam: 5 };
const USE: Input = { ...NO_INPUT, useItem: true };
type P = Match["players"][number];

/** A quiet match: everyone but player 0 and the listed enemies is parked and harmless. */
function setup(enemies: number, animal = "lion") {
  const m = createMatch({ ...opts, humanAnimal: animal });
  const me = m.players[0];
  const foes = m.players.filter((o) => o.team !== me.team).slice(0, enemies);
  for (const p of m.players) if (p !== me && !foes.includes(p)) p.stun = 999;
  for (const f of foes) f.cpu = false;
  me.cpu = false;
  return { m, me, foes };
}

function place(p: P, x: number, z: number) {
  p.x = x;
  p.z = z;
  p.y = surfaceHeight(x, z);
  p.shieldT = 0;
}

/** Knock out every listed rival at once with a lightning item, as `by`. */
function knockOut(m: Match, by: P, victims: P[]) {
  for (const v of victims) {
    place(v, by.x + 4, by.z + 2);
    v.hp = 1;
    // No healing back in the middle of the test.
    v.healCd = 99;
    v.stun = 0;
    v.out = 0;
  }
  by.stun = 0;
  by.out = 0;
  giveItem(by, "lightning");
  const kinds: Array<{ kind: string } & Record<string, unknown>> = [];
  step(m, by.id === 0 ? USE : NO_INPUT, by.id === 0 ? undefined : () => USE);
  for (const e of m.events) kinds.push(e as never);
  return kinds;
}

describe("kill streaks", () => {
  it("count knockouts in a row, pay a growing bonus and end when you're knocked out", () => {
    const { m, me, foes } = setup(1);
    place(me, 0, 20);
    const score0 = me.score;
    knockOut(m, me, foes);
    expect(me.streak).toBe(1);
    // Past the first, each knockout in a run pays a bonus on top of the usual 8.
    m.time += tune.multiWindow + 1;
    const ev = knockOut(m, me, foes);
    expect(me.streak).toBe(2);
    expect(ev.find((e) => e.kind === "streak")).toMatchObject({ player: 0, n: 2, multi: 1, bonus: tune.streakBonus });
    expect(me.score - score0).toBe(8 + 8 + tune.streakBonus);
    expect(me.bestStreak).toBe(2);
    // Knocked out yourself: the run ends, the best stays.
    const [foe] = foes;
    place(foe, me.x + 3, me.z);
    me.hp = 1;
    me.healCd = 99;
    foe.out = 0;
    foe.stun = 0;
    giveItem(foe, "lightning");
    step(m, NO_INPUT, (p) => (p === foe ? USE : NO_INPUT));
    expect(me.out).toBeGreaterThan(0);
    expect(me.streak).toBe(0);
    expect(me.bestStreak).toBe(2);
    expect(foe.streak).toBe(1);
  });

  it("knockouts close together are a multi KO", () => {
    const { m, me, foes } = setup(3);
    place(me, 0, 20);
    const ev = knockOut(m, me, foes);
    const streaks = ev.filter((e) => e.kind === "streak");
    expect(me.streak).toBe(3);
    expect(me.multi).toBe(3);
    expect(streaks.at(-1)).toMatchObject({ n: 3, multi: 3 });
  });

  it("ending a rival's streak of 3 or more is a shutdown, with its own bonus", () => {
    const { m, me, foes } = setup(1);
    const [foe] = foes;
    place(me, 0, 20);
    foe.streak = 4;
    const before = me.score;
    const ev = knockOut(m, me, [foe]);
    expect(ev.find((e) => e.kind === "shutdown")).toMatchObject({ player: foe.id, by: 0, n: 4 });
    expect(me.score - before).toBe(8 + tune.shutdownBonus);
    expect(foe.streak).toBe(0);
  });

  it("names streaks and multi KOs, bigger as they grow", () => {
    expect(streakTitle(1, 1)).toMatchObject({ title: "KNOCKOUT!", level: 1 });
    expect(streakTitle(2, 1)).toMatchObject({ title: "2 IN A ROW!", level: 2 });
    expect(streakTitle(3, 1).title).toBe("ON FIRE!");
    expect(streakTitle(4, 1)).toMatchObject({ title: "RAMPAGE!", level: 3 });
    expect(streakTitle(5, 1).title).toBe("UNSTOPPABLE!");
    expect(streakTitle(9, 1).title).toBe("LEGENDARY!");
    expect(streakTitle(2, 2).title).toBe("DOUBLE KO!");
    expect(streakTitle(3, 3)).toMatchObject({ title: "TRIPLE KO!", level: 3 });
    expect(streakTitle(6, 6).title).toBe("MEGA KO!");
    expect(shortName("Rally Lion")).toBe("LION");
  });
});

describe("the Glide Fish's missiles", () => {
  it("fires three homing missiles, each after its own enemy, then reloads for 30 seconds", () => {
    expect(ANIMALS.flyfish.special).toBe("missiles");
    expect(tune.fishReload).toBe(30);
    const { m, me, foes } = setup(3, "flyfish");
    place(me, 0, 20);
    me.heading = Math.PI;
    foes.forEach((f, i) => place(f, -10 + i * 10, 4));
    step(m, { ...NO_INPUT, jump: true });
    const missiles = m.fires.filter((f) => f.owner === 0 && f.homing !== undefined && f.homing !== -1);
    expect(missiles.length).toBe(3);
    expect(new Set(missiles.map((f) => f.homing)).size).toBe(3);
    expect(m.fires.some((f) => f.owner === 0 && f.bomb)).toBe(false);
    expect(me.bombCd).toBeCloseTo(tune.fishReload, 0);
    // Pressing again while it reloads does nothing.
    step(m, NO_INPUT);
    step(m, { ...NO_INPUT, jump: true });
    expect(m.fires.filter((f) => f.owner === 0 && f.homing !== undefined && f.homing !== -1).length).toBe(3);
    // They find their targets.
    for (let i = 0; i < 4 / STEP; i++) step(m, NO_INPUT);
    expect(foes.filter((f) => f.hp < tune.maxHits || f.stun > 0).length).toBeGreaterThanOrEqual(2);
    // Ready again after 30 seconds, and says so.
    let ready = false;
    for (let i = 0; i < 27 / STEP && !ready; i++) {
      step(m, NO_INPUT);
      ready = m.events.some((e) => e.kind === "bombReady" && e.player === 0);
    }
    expect(ready).toBe(true);
  });

  it("other flyers still drop bombs", () => {
    const { m, me } = setup(0, "eagle");
    place(me, 0, 20);
    step(m, { ...NO_INPUT, jump: true });
    expect(m.events.some((e) => e.kind === "boom" && e.player === 0) || m.fires.some((f) => f.owner === 0 && f.bomb)).toBe(true);
    expect(m.events.some((e) => e.kind === "missiles")).toBe(false);
  });

  it("CPU Glide Fish fire their missiles in a real match", () => {
    let volleys = 0;
    for (const seed of [1, 2]) {
      const m = createMatch({ ...opts, seed, humanAnimal: "flyfish" });
      for (let i = 0; i < 60 / STEP; i++) {
        step(m, NO_INPUT);
        volleys += m.events.filter((e) => e.kind === "missiles" && e.player !== 0).length;
      }
    }
    expect(volleys).toBeGreaterThan(0);
  });
});
