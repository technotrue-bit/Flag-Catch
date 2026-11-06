import { describe, expect, it } from "vitest";
import { ANIMALS } from "./animals";
import { POOR_FIT, allowedAnimals, allowedOn, allowedPick, pickLineup, whoPlays, worldFit } from "./lineup";
import { dailyFor } from "./daily";
import { mulberry32 } from "./rng";
import { createMatch } from "./sim";
import { WORLD_IDS } from "./worlds";

const lineups = (world: string, n = 15, seeds = 60) => Array.from({ length: seeds }, (_, s) => pickLineup(mulberry32(s + 1), world, n, "lion"));

describe("CPU line ups fit the world", () => {
  it("keeps swimmers off lava and the dunes, and land animals out of the lagoon", () => {
    for (const id of ["shark", "penguin"]) {
      expect(worldFit(ANIMALS[id], "lava")).toBeLessThan(POOR_FIT);
      expect(worldFit(ANIMALS[id], "dunes")).toBeLessThan(POOR_FIT);
    }
    for (const id of ["lion", "wolf", "panther", "bird", "mammoth"]) expect(worldFit(ANIMALS[id], "lagoon")).toBeLessThan(POOR_FIT);
    for (const ids of lineups("lava")) for (const id of ids) expect(["shark", "penguin"]).not.toContain(id);
    for (const ids of lineups("lagoon")) for (const id of ids) expect(ANIMALS[id].cls).not.toBe("land");
  });

  it("the bowl and the pogo still get about on land, so they stay picks on lava", () => {
    expect(worldFit(ANIMALS.goldfish, "lava")).toBeGreaterThan(POOR_FIT);
    expect(worldFit(ANIMALS.frog, "lava")).toBeGreaterThan(POOR_FIT);
  });

  it("favors swimmers on the reef, grippy animals on ice and leaves flyers out of the storm more often", () => {
    const share = (world: string, test: (id: string) => boolean) => {
      const all = lineups(world).flat();
      return all.filter(test).length / all.length;
    };
    expect(share("reef", (id) => ANIMALS[id].cls === "water")).toBeGreaterThan(share("home", (id) => ANIMALS[id].cls === "water"));
    expect(share("frost", (id) => id === "mammoth")).toBeGreaterThan(share("home", (id) => id === "mammoth"));
    expect(share("storm", (id) => ANIMALS[id].cls === "air")).toBeLessThan(share("home", (id) => ANIMALS[id].cls === "air"));
  });

  it("gives every team a mix of jobs", () => {
    for (const world of WORLD_IDS) {
      for (const ids of lineups(world)) {
        const styles = new Set(ids.map((id) => ANIMALS[id].style));
        // Fifteen CPUs always cover stealing, chasing and guarding.
        expect(styles.has("raider") || styles.has("allrounder")).toBe(true);
        expect(styles.has("hunter") || styles.has("allrounder")).toBe(true);
        expect(styles.has("guardian") || styles.has("allrounder")).toBe(true);
        // Never one animal for most of the team.
        const most = Math.max(...[...new Set(ids)].map((id) => ids.filter((x) => x === id).length));
        expect(most).toBeLessThanOrEqual(6);
      }
    }
  });

  it("is the same for the same seed, and both teams in a match get it slot by slot", () => {
    expect(pickLineup(mulberry32(7), "reef", 7)).toEqual(pickLineup(mulberry32(7), "reef", 7));
    const m = createMatch({ seed: 5, humanAnimal: "penguin", perTeam: 8, duration: 60, flagsPerTeam: 5, world: "lava" });
    for (let i = 0; i < 8; i++) expect(m.players[8 + i].def.id).toBe(m.players[i].def.id);
    for (const p of m.players.slice(1)) if (p.def.id !== "penguin") expect(worldFit(p.def, "lava")).toBeGreaterThanOrEqual(POOR_FIT);
  });

  it("each map has its own animals", () => {
    expect(whoPlays("home")).toBe("EVERYONE");
    expect(whoPlays("lagoon")).toBe("SWIMMERS & FLYERS");
    expect(whoPlays("dunes")).toBe("LAND & FLYERS + GOLDFISH, FROG");
    expect(allowedAnimals("lava")).not.toContain("shark");
    for (const world of WORLD_IDS) {
      // Every map has animals of every job, so a team is never short.
      const styles = new Set(allowedAnimals(world).map((id) => ANIMALS[id].style));
      for (const s of ["raider", "hunter", "guardian", "allrounder"] as const) expect(styles.has(s), `${world} ${s}`).toBe(true);
      for (const ids of lineups(world)) for (const id of ids) expect(allowedOn(id, world), `${world} ${id}`).toBe(true);
    }
  });

  it("a pick that can't play the map swaps for one that can, and the daily's animal always can", () => {
    expect(allowedPick("lion", "lagoon")).not.toBe("lion");
    expect(allowedOn(allowedPick("lion", "lagoon"), "lagoon")).toBe(true);
    expect(allowedPick("penguin", "home")).toBe("penguin");
    const m = createMatch({ seed: 2, humanAnimal: "wolf", perTeam: 4, duration: 60, flagsPerTeam: 5, world: "lagoon" });
    for (const p of m.players) expect(allowedOn(p.def.id, "lagoon"), p.def.id).toBe(true);
    for (let d = 0; d < 400; d++) {
      const day = dailyFor(new Date(2026, 10, 1 + d, 12));
      expect(allowedOn(day.animal, day.world), `${day.key} ${day.world} ${day.animal}`).toBe(true);
    }
  });
});
