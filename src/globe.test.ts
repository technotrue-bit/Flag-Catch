import { describe, expect, it } from "vitest";
import { BEND, dip, overHorizon, pinDip } from "./globe";

describe("the globe", () => {
  it("dips with the square of the distance", () => {
    expect(dip(0, 0)).toBe(0);
    expect(dip(10, 0)).toBeCloseTo(BEND * 100);
    expect(dip(30, 40)).toBeCloseTo(4 * dip(15, 20));
  });

  it("never hides what stands nearer than the horizon", () => {
    const eye = 7;
    const horizon = Math.sqrt(eye / BEND);
    for (let d = 0; d <= horizon; d += 5) expect(overHorizon(eye, d, 0)).toBe(false);
  });

  it("hides an animal far past the horizon, and keeps a tall one longer", () => {
    expect(overHorizon(7, 60, 4)).toBe(false);
    expect(overHorizon(7, 220, 4)).toBe(true);
    // Something taller pokes over the horizon from farther out.
    let short = 0;
    let tall = 0;
    for (let d = 1; d < 400; d++) {
      if (!short && overHorizon(7, d, 4)) short = d;
      if (!tall && overHorizon(7, d, 20)) tall = d;
    }
    expect(tall).toBeGreaterThan(short);
    // A higher eye sees farther.
    expect(overHorizon(20, short, 4)).toBe(false);
  });

  it("sinks a near pin with the land, and a far one only to the horizon", () => {
    expect(pinDip(7, 20, 6)).toBeCloseTo(dip(20, 0));
    const far = 300;
    expect(pinDip(7, far, 6)).toBeLessThan(dip(far, 0));
    // Right on the horizon line: as low as the farthest land can be seen.
    const seen = (6 - 7 - pinDip(7, far, 6)) / far;
    expect(seen).toBeCloseTo(-2 * Math.sqrt(7 * BEND));
  });

  it("agrees with drawing it: a hidden top is seen below the horizon line", () => {
    const eye = 6;
    const angle = (d: number, top: number) => (top - eye - BEND * d * d) / d;
    const horizon = Math.max(...Array.from({ length: 400 }, (_, i) => angle(i + 1, 0)));
    for (let d = 5; d < 400; d += 7) {
      for (const top of [0, 3, 8]) if (overHorizon(eye, d, top)) expect(angle(d, top)).toBeLessThan(horizon);
    }
  });
});
