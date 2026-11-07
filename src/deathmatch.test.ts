import { describe, expect, it } from "vitest";
import { DEATHMATCH_TIME, type Input, type Match, NO_INPUT, STEP, createMatch, giveItem, isMode, step } from "./sim";
import { surfaceHeight } from "./terrain";

const USE: Input = { ...NO_INPUT, useItem: true };
const dm = (seed = 3, perTeam = 8): Match => createMatch({ seed, humanAnimal: "lion", perTeam, duration: DEATHMATCH_TIME, flagsPerTeam: 5, mode: "deathmatch" });

describe("team deathmatch", () => {
  it("plays with no flags, on a 10 minute clock", () => {
    const m = dm();
    expect(m.flags).toHaveLength(0);
    expect(m.timeLeft).toBe(600);
    expect(isMode("deathmatch")).toBe(true);
    expect(isMode("tag")).toBe(false);
  });

  it("scores a point for the team with every rival knocked out", () => {
    const m = dm();
    const me = m.players[0];
    const foe = m.players.find((p) => p.team !== me.team)!;
    for (const p of m.players) if (p !== me && p !== foe) p.stun = 999;
    me.cpu = foe.cpu = false;
    me.x = 0;
    me.z = 20;
    me.y = surfaceHeight(0, 20);
    foe.x = 4;
    foe.z = 22;
    foe.y = surfaceHeight(4, 22);
    foe.hp = 1;
    foe.healCd = 99;
    foe.shieldT = 0;
    giveItem(me, "lightning");
    step(m, USE, () => NO_INPUT);
    expect(foe.out).toBeGreaterThan(0);
    expect(m.scores).toEqual([1, 0]);
  });

  it("CPUs go looking for fights, so knockouts pile up", () => {
    const m = dm(7, 8);
    for (const p of m.players) p.cpu = true;
    for (let i = 0; i < 90 / STEP && !m.over; i++) step(m, NO_INPUT);
    expect(m.scores[0] + m.scores[1]).toBeGreaterThan(3);
    // The score is exactly the knockouts of rivals each team made.
    for (const t of [0, 1] as const) expect(m.scores[t]).toBe(m.players.filter((p) => p.team === t).reduce((n, p) => n + p.kos, 0));
  });
});
