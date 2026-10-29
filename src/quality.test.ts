import { describe, expect, it } from "vitest";
import { Sharpness } from "./quality";

/** Feeds `n` frames of `ms` each and returns every change asked for. */
function run(s: Sharpness, n: number, ms: number | ((i: number) => number)): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = s.frame(typeof ms === "number" ? ms : ms(i));
    if (r !== null) out.push(r);
  }
  return out;
}

describe("sharpness", () => {
  it("stays sharp while frames keep up", () => {
    const s = new Sharpness(2);
    expect(run(s, 3000, 16.7)).toEqual([]);
    expect(s.ratio).toBe(2);
  });

  it("says when it has no sharpness left to give", () => {
    const s = new Sharpness(1.5, 1.5);
    expect(s.struggling()).toBe(false);
    run(s, 90, 33);
    expect(s.struggling()).toBe(true);
    // Once per hard spell, not on every look.
    expect(s.struggling()).toBe(false);
    // Lowering the floor lets it step down again.
    s.min = 1;
    expect(run(s, 90 * 2, 33)).toEqual([1.25, 1]);
  });

  it("ignores a lone hitch", () => {
    const s = new Sharpness(2);
    expect(run(s, 600, (i) => (i % 90 === 40 ? 120 : 16.7))).toEqual([]);
  });

  it("steps down a notch at a time when frames keep dropping, never below 1", () => {
    const s = new Sharpness(2);
    expect(run(s, 90 * 6, 33)).toEqual([1.75, 1.5, 1.25, 1]);
    expect(s.ratio).toBe(1);
  });

  it("tries sharper again after a calm spell, and keeps it if it holds", () => {
    const s = new Sharpness(2);
    run(s, 90, 33);
    expect(s.ratio).toBe(1.75);
    expect(run(s, 90 * 8, 16.7)).toEqual([2]);
    expect(run(s, 90 * 20, 16.7)).toEqual([]);
  });

  it("goes back and stays there when the sharper step brings the drops back", () => {
    const s = new Sharpness(2);
    run(s, 90, 33);
    run(s, 90 * 8, 16.7);
    expect(s.ratio).toBe(2);
    expect(run(s, 90, 33)).toEqual([1.75]);
    expect(run(s, 90 * 40, 16.7)).toEqual([]);
    expect(s.ratio).toBe(1.75);
  });

  it("does nothing on a screen that already draws at 1x", () => {
    const s = new Sharpness(1);
    expect(run(s, 900, 40)).toEqual([]);
  });

  it("doesn't count long gaps like a hidden tab", () => {
    const s = new Sharpness(2);
    expect(run(s, 900, 5000)).toEqual([]);
  });
});
