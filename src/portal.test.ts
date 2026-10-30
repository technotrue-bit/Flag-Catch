import { describe, expect, it } from "vitest";
import { isPortal } from "./portal";

describe("portal build", () => {
  it("turns on from the build flag or ?portal", () => {
    expect(isPortal("1", "")).toBe(true);
    expect(isPortal(undefined, "?portal")).toBe(true);
    expect(isPortal(undefined, "?unlock=all&portal=1")).toBe(true);
  });
  it("stays off for the TrueAIGaming.com build", () => {
    expect(isPortal(undefined, "")).toBe(false);
    expect(isPortal("0", "?dev")).toBe(false);
  });
});
