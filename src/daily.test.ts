import { describe, expect, it } from "vitest";
import { ANIMALS, ANIMAL_IDS } from "./animals";
import { DAILY_BONUS, dailyFor, dayBefore, dayKey, goalProgress, goalText } from "./daily";
import { clearDaily, fresh, merge, parse, streakOn } from "./progress";
import { WORLD_IDS } from "./worlds";

const days = (from: string, n: number): string[] => {
  const [y, m, d] = from.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => dayKey(new Date(y, m - 1, d + i, 12)));
};
const stats = (s: Partial<Record<"banks" | "steals" | "knockouts", number>> = {}) => ({ steals: 0, banks: 0, hits: 0, knockouts: 0, saves: 0, items: 0, ...s });

describe("Daily Flag", () => {
  it("gives every phone the same challenge for a date", () => {
    expect(dailyFor("2026-11-01")).toEqual(dailyFor(new Date(2026, 10, 1, 23, 59)));
    expect(dailyFor("2026-11-01")).toEqual(dailyFor(new Date(2026, 10, 1, 0, 1)));
  });

  // trueaigaming.com's home page copies dailyFor; its test pins these same days, so both copies must agree.
  it("keeps these pinned days the same", () => {
    const pins = Object.fromEntries(
      ["2026-11-01", "2026-11-02", "2026-12-25", "2027-02-28"].map((k) => {
        const d = dailyFor(k);
        return [k, `${d.world} ${d.animal} ${d.mode} ${d.per} ${d.difficulty} ${d.goal.kind}${d.goal.n}`];
      }),
    );
    expect(pins).toMatchInlineSnapshot(`
      {
        "2026-11-01": "lava bat playful 8 medium steals3",
        "2026-11-02": "home mammoth capture 16 easy win1",
        "2026-12-25": "lava lion capture 16 medium knockouts4",
        "2027-02-28": "bluffs wolf capture 8 easy steals2",
      }
    `);
  });

  it("picks real worlds and animals, and keeps swimmers off lava and the dunes and land animals out of the lagoon", () => {
    const seen = new Set<string>();
    for (const k of days("2026-11-01", 400)) {
      const d = dailyFor(k);
      expect(WORLD_IDS).toContain(d.world);
      expect(ANIMAL_IDS).toContain(d.animal);
      expect([8, 16]).toContain(d.per);
      expect(["capture", "playful"]).toContain(d.mode);
      expect(["easy", "medium"]).toContain(d.difficulty);
      const cls = ANIMALS[d.animal].cls;
      if (d.world === "lava" || d.world === "dunes") expect(cls).not.toBe("water");
      if (d.world === "lagoon") expect(cls).not.toBe("land");
      seen.add(d.world);
    }
    // Over a year every world comes up.
    expect(seen.size).toBe(WORLD_IDS.length);
  });

  it("names the goal and checks it against the match", () => {
    expect(goalText({ mode: "capture", goal: { kind: "banks", n: 1 } })).toBe("SCORE A FLAG YOURSELF");
    expect(goalText({ mode: "playful", goal: { kind: "banks", n: 2 } })).toBe("SCORE 2 FLAGS YOURSELF");
    expect(goalText({ mode: "capture", goal: { kind: "knockouts", n: 4 } })).toBe("POP 4 RIVALS");
    expect(goalProgress({ kind: "steals", n: 2 }, stats({ steals: 3 }), false)).toEqual({ have: 2, done: true });
    expect(goalProgress({ kind: "win", n: 1 }, stats(), false)).toEqual({ have: 0, done: false });
    expect(goalProgress({ kind: "win", n: 1 }, stats(), true).done).toBe(true);
  });

  it("knows the day before, across months and years", () => {
    expect(dayBefore("2026-11-01")).toBe("2026-10-31");
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
    expect(dayBefore("2028-03-01")).toBe("2028-02-29");
  });
});

describe("daily streak", () => {
  it("pays the bonus once a day and counts days in a row", () => {
    const p = fresh();
    const first = clearDaily(p, "2026-11-01", "a");
    expect(first).toMatchObject({ bonus: DAILY_BONUS, streak: 1, first: true });
    expect(p.points).toBe(DAILY_BONUS);
    expect(clearDaily(p, "2026-11-01", "a")).toMatchObject({ bonus: 0, streak: 1, first: false });
    expect(p.points).toBe(DAILY_BONUS);
    expect(clearDaily(p, "2026-11-02", "a").streak).toBe(2);
    expect(clearDaily(p, "2026-11-03", "a").streak).toBe(3);
    expect(p.daily).toEqual({ last: "2026-11-03", streak: 3, best: 3 });
  });

  it("starts again at 1 after a missed day, keeping the best run", () => {
    const p = fresh();
    for (const k of ["2026-11-01", "2026-11-02", "2026-11-03"]) clearDaily(p, k);
    expect(clearDaily(p, "2026-11-05").streak).toBe(1);
    expect(p.daily.best).toBe(3);
  });

  it("shows a streak only while it's alive", () => {
    const p = fresh();
    clearDaily(p, "2026-11-01");
    expect(streakOn(p, "2026-11-01")).toBe(1);
    expect(streakOn(p, "2026-11-02")).toBe(1);
    expect(streakOn(p, "2026-11-03")).toBe(0);
  });

  it("opens what the bonus reaches", () => {
    const p = fresh();
    p.dev.a = { points: 90, played: 3, wins: 0 };
    p.points = 90;
    expect(clearDaily(p, "2026-11-01", "a").opened).toEqual(expect.arrayContaining(["penguin", "reef"]));
  });

  it("keeps the streak through a save and an account sync, either way round", () => {
    const phone = fresh();
    clearDaily(phone, "2026-11-01", "a");
    clearDaily(phone, "2026-11-02", "a");
    const tablet = fresh();
    clearDaily(tablet, "2026-10-20", "b");
    tablet.daily.best = 6;
    const back = parse(JSON.parse(JSON.stringify(phone)), "a");
    expect(back.daily).toEqual(phone.daily);
    const ab = parse(JSON.parse(JSON.stringify(phone)), "z");
    merge(ab, tablet);
    const ba = parse(JSON.parse(JSON.stringify(tablet)), "z");
    merge(ba, phone);
    expect(ab.daily).toEqual({ last: "2026-11-02", streak: 2, best: 6 });
    expect(ba.daily).toEqual(ab.daily);
    expect(ba.points).toBe(ab.points);
  });

  it("ignores a broken daily in a save", () => {
    expect(parse({ daily: { last: "soon", streak: 3 } }, "a").daily).toEqual(fresh().daily);
    expect(parse({ daily: { last: "2026-11-01", streak: -2 } }, "a").daily).toEqual(fresh().daily);
    expect(parse({ daily: "x" }, "a").daily).toEqual(fresh().daily);
  });
});
