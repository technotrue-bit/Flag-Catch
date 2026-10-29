import { describe, expect, it } from "vitest";
import { maxPixelRatio, sceneryFor } from "./look";

describe("graphics levels", () => {
  it("draw Low at 1x and High sharper than Normal", () => {
    expect(maxPixelRatio("low", 3)).toBe(1);
    expect(maxPixelRatio("normal", 3)).toBe(2);
    expect(maxPixelRatio("high", 3)).toBeGreaterThan(maxPixelRatio("normal", 3));
    // A 1x screen still gets a little extra sharpness on High.
    expect(maxPixelRatio("high", 1)).toBeGreaterThan(1);
  });

  it("only High turns on shadows, rich water, the sky dome and grass", () => {
    for (const level of ["low", "normal"] as const) {
      const s = sceneryFor(level);
      expect([s.shadows, s.richWater, s.skyDome, s.grass, s.smooth]).toEqual([false, false, false, false, false]);
    }
    const high = sceneryFor("high");
    expect([high.shadows, high.richWater, high.skyDome, high.grass, high.smooth]).toEqual([true, true, true, true, true]);
    expect(sceneryFor("low").density).toBeLessThan(1);
    expect(high.density).toBeGreaterThan(1);
  });
});
