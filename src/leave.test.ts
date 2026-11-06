import { describe, expect, it } from "vitest";
import { leavePlan } from "./leave";

describe("Leave game", () => {
  it("takes a framed game back to the TrueAIGaming page that framed it", () => {
    expect(leavePlan(true, "https://trueaigaming.com/play/flag-catch", 3)).toEqual({ kind: "site", url: "https://trueaigaming.com/" });
    expect(leavePlan(true, "https://www.trueaigaming.com/", 1)).toEqual({ kind: "site", url: "https://www.trueaigaming.com/" });
  });

  it("only tells a page it doesn't know, and never moves it", () => {
    expect(leavePlan(true, "https://example.com/games", 3)).toEqual({ kind: "tell" });
    expect(leavePlan(true, "", 3)).toEqual({ kind: "tell" });
  });

  it("on its own goes back a page, or closes when there is none", () => {
    expect(leavePlan(false, "", 2)).toEqual({ kind: "back" });
    expect(leavePlan(false, "", 1)).toEqual({ kind: "close" });
  });
});
