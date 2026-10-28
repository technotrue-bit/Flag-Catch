import { afterEach, describe, expect, it } from "vitest";
import { cleanName, isSite, NAME_MAX, startCloud } from "./cloud";

type Listener = (e: { source: unknown; origin: string; data: unknown }) => void;

/** A stand-in for the game's window inside a frame: records what it posts to its parent. */
function fakeFrame(framed = true) {
  const posted: { msg: { type: string; data?: unknown }; target: string }[] = [];
  const listeners: Listener[] = [];
  const parent = { postMessage: (msg: { type: string }, target: string) => posted.push({ msg, target }) };
  const win: Record<string, unknown> = { addEventListener: (_: string, fn: Listener) => listeners.push(fn) };
  win.parent = framed ? parent : win;
  (globalThis as { window?: unknown }).window = win;
  const send = (data: unknown, origin = "https://trueaigaming.com", source: unknown = parent) => {
    for (const fn of listeners) fn({ source, origin, data });
  };
  return { posted, send, parent };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("account saves bridge", () => {
  it("knows the site and its previews, and nothing else", () => {
    expect(isSite("https://trueaigaming.com")).toBe(true);
    expect(isSite("https://www.trueaigaming.com")).toBe(true);
    expect(isSite("https://trueaigaming-git-main-true-team2.vercel.app")).toBe(true);
    expect(isSite("https://trueaigaming.com.evil.example")).toBe(false);
    expect(isSite("http://trueaigaming.com")).toBe(false);
    expect(isSite("https://evil-true-team2.vercel.app")).toBe(false);
  });

  it("says ready, then merges the account copy and sends the result only to the site", () => {
    const f = fakeFrame();
    const applied: unknown[] = [];
    const save = { points: 5 };
    const cloud = startCloud("flag-catch", () => save, (d) => applied.push(d));
    expect(f.posted).toEqual([{ msg: { type: "tag:ready", game: "flag-catch", v: 1 }, target: "*" }]);
    cloud.push();
    expect(f.posted.length).toBe(1);
    f.send({ type: "tag:load", game: "flag-catch", data: { points: 9 } });
    expect(applied).toEqual([{ points: 9 }]);
    expect(f.posted.at(-1)).toEqual({ msg: { type: "tag:save", game: "flag-catch", v: 1, data: save }, target: "https://trueaigaming.com" });
    cloud.push();
    expect(f.posted.length).toBe(3);
  });

  it("ignores other origins, other windows and other games", () => {
    const f = fakeFrame();
    const applied: unknown[] = [];
    startCloud("flag-catch", () => ({}), (d) => applied.push(d));
    f.send({ type: "tag:load", game: "flag-catch", data: { points: 1 } }, "https://evil.example");
    f.send({ type: "tag:load", game: "flag-catch", data: { points: 1 } }, "https://trueaigaming.com", {});
    f.send({ type: "tag:load", game: "other", data: { points: 1 } });
    expect(applied).toEqual([]);
    expect(f.posted.length).toBe(1);
  });

  it("hears the player's username from the site only, cleaned up", () => {
    const f = fakeFrame();
    const names: string[] = [];
    startCloud("flag-catch", () => ({}), () => {}, (n) => names.push(n));
    f.send({ type: "tag:player", game: "flag-catch", name: "  devin\u0000_423 " });
    f.send({ type: "tag:player", game: "flag-catch", name: "sneaky" }, "https://evil.example");
    f.send({ type: "tag:player", game: "other", name: "other" });
    f.send({ type: "tag:player", game: "flag-catch", name: 42 });
    f.send({ type: "tag:player", game: "flag-catch", name: "   " });
    expect(names).toEqual(["devin_423"]);
    expect(f.posted.length).toBe(1);
  });

  it("keeps names short enough for the map", () => {
    expect(cleanName("a".repeat(40))).toBe("a".repeat(NAME_MAX));
    expect(cleanName("😀".repeat(20))).toBe("😀".repeat(NAME_MAX));
    expect(cleanName(null)).toBeNull();
  });

  it("does nothing when not in a frame", () => {
    const f = fakeFrame(false);
    startCloud("flag-catch", () => ({}), () => {}).push();
    expect(f.posted).toEqual([]);
  });
});
