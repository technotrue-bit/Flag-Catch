import { describe, expect, it } from "vitest";
import { ANIMALS } from "./animals";
import { POOR_FIT, pickLineup, worldFit } from "./lineup";
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
});
