import { describe, expect, it } from "vitest";
import { award, deviceId, fresh, load, merge, parse, save, unlocked } from "./progress";

const memory = (init: Record<string, string> = {}) => {
  const data = new Map(Object.entries(init));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

describe("progress", () => {
  it("keeps a save from before device tallies under this device", () => {
    const store = memory({ "flagcatch.progress": JSON.stringify({ points: 520, best: { home: 80 }, played: 6, wins: 2, extra: [] }) });
    const p = load(store, "phone1");
    expect(p.points).toBe(520);
    expect(p.dev).toEqual({ phone1: { points: 520, played: 6, wins: 2 } });
    expect(p.best).toEqual({ home: 80 });
  });

  it("pays a match to this device and saves and loads it", () => {
    const store = memory();
    const p = load(store, "a");
    const got = award(p, "home", 60, "win", "a");
    expect(got.gained).toBe(160);
    expect(p).toMatchObject({ points: 160, played: 1, wins: 1, dev: { a: { points: 160, played: 1, wins: 1 } } });
    save(store, p);
    expect(load(store, "a")).toEqual(p);
  });

  it("adds up two phones that both played since the last sync", () => {
    const base = fresh();
    award(base, "home", 100, "loss", "a");
    const phoneA = parse(JSON.parse(JSON.stringify(base)), "a");
    const phoneB = parse(JSON.parse(JSON.stringify(base)), "b");
    award(phoneA, "home", 300, "win", "a");
    award(phoneB, "reef", 50, "loss", "b");
    const cloud = parse(JSON.parse(JSON.stringify(phoneA)), "x");
    expect(merge(cloud, phoneB)).toBe(true);
    expect(cloud.points).toBe(100 + 400 + 50);
    expect(cloud.played).toBe(3);
    expect(cloud.wins).toBe(1);
    expect(cloud.best).toEqual({ home: 300, reef: 50 });
    expect(unlocked(cloud).has("reef")).toBe(true);
  });

  it("merges the same save twice, or either way round, to the same result", () => {
    const a = fresh();
    award(a, "home", 120, "win", "a");
    const b = fresh();
    award(b, "home", 40, "draw", "b");
    b.extra = ["penguin"];
    const ab = parse(JSON.parse(JSON.stringify(a)), "z");
    merge(ab, b);
    const ba = parse(JSON.parse(JSON.stringify(b)), "z");
    merge(ba, a);
    expect(ab).toEqual({ ...ba, extra: ab.extra });
    expect([...ab.extra].sort()).toEqual([...ba.extra].sort());
    expect(merge(ab, b)).toBe(false);
    expect(merge(ab, ab)).toBe(false);
  });

  it("never loses points to an older copy", () => {
    const now = fresh();
    award(now, "home", 500, "win", "a");
    const old = fresh();
    award(old, "home", 10, "loss", "a");
    expect(merge(now, old)).toBe(false);
    expect(now.points).toBe(600);
  });

  it("drops anything malformed from a save it did not make", () => {
    const p = parse(
      {
        dev: { ok: { points: 50, played: 1, wins: "x" }, "<bad>": { points: 9e9 }, neg: { points: -5, played: -1 } },
        best: { home: 20, "x y": 5, reef: "lots" },
        extra: ["lion", 3, "<script>"],
        points: 9e9,
      },
      "me",
    );
    expect(p.dev).toEqual({ ok: { points: 50, played: 1, wins: 0 }, neg: { points: 0, played: 0, wins: 0 } });
    expect(p.points).toBe(50);
    expect(p.best).toEqual({ home: 20 });
    expect(p.extra).toEqual(["lion"]);
    expect(parse(null, "me")).toEqual(fresh());
    expect(parse([1, 2], "me")).toEqual(fresh());
  });

  it("keeps one device id per store", () => {
    const store = memory();
    const id = deviceId(store);
    expect(id).toMatch(/^[a-z0-9]{9}$/);
    expect(deviceId(store)).toBe(id);
    expect(deviceId(memory())).not.toBe(id);
  });
});
