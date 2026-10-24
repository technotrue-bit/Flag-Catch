import { describe, expect, it } from "vitest";
import { DS_HINGE, dsLayout, dsWanted, mapRect } from "./ds";

describe("DS mode layout", () => {
  it("only splits the screen with DS mode on and the phone upright", () => {
    expect(dsWanted(true, 390, 664)).toBe(true);
    expect(dsWanted(true, 844, 390)).toBe(false);
    expect(dsWanted(false, 390, 664)).toBe(false);
  });

  // An iPhone held upright in Safari, and from the Home Screen with its notch and home bar.
  for (const [w, h, inset] of [
    [390, 664, { top: 0, right: 0, bottom: 0, left: 0 }],
    [390, 844, { top: 47, right: 0, bottom: 34, left: 0 }],
    [375, 553, { top: 0, right: 0, bottom: 0, left: 0 }],
    [430, 932, { top: 59, right: 0, bottom: 34, left: 0 }],
  ] as const) {
    it(`stacks two screens inside a ${w}x${h} view`, () => {
      const { top, bottom } = dsLayout(w, h, inset);
      expect(top.y).toBeGreaterThanOrEqual(inset.top);
      expect(bottom.y).toBe(top.y + top.h + DS_HINGE);
      expect(bottom.y + bottom.h).toBeLessThanOrEqual(h - inset.bottom);
      expect(top.x + top.w).toBeLessThanOrEqual(w);
      // A wide enough game view, and room on the bottom for the thumbs.
      expect(top.w / top.h).toBeGreaterThanOrEqual(1.1);
      expect(bottom.h).toBeGreaterThanOrEqual(240);
      expect(top.h).toBeGreaterThanOrEqual(220);
    });
  }

  it("keeps the map in the middle of the bottom screen, clear of the button column", () => {
    const { bottom } = dsLayout(390, 664);
    for (const ratio of [0.44, 0.61, 0.7, 0.92]) {
      const r = mapRect(bottom, ratio);
      expect(r.w / r.h).toBeCloseTo(ratio, 5);
      expect(r.y).toBeGreaterThanOrEqual(bottom.y);
      expect(r.y + r.h).toBeLessThanOrEqual(bottom.y + bottom.h);
      // The jump button is 84 wide, 8 in from the right edge.
      expect(r.x + r.w).toBeLessThanOrEqual(bottom.x + bottom.w - 92);
      expect(r.x - bottom.x).toBeCloseTo(bottom.x + bottom.w - (r.x + r.w), 5);
    }
  });
});
