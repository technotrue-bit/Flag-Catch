import { describe, expect, it } from "vitest";
import { TICKER_HOLD, TICKER_HOLD_BUSY, TICKER_MAX, TickerQueue, inkOn } from "./ticker";

const news = (text: string) => ({ text, color: "#ff4f5e" });
/** Steps until the queue answers, up to `secs`. */
function run(q: TickerQueue, secs: number) {
  const out: Array<string> = [];
  for (let t = 0; t < secs; t += 1 / 60) {
    const r = q.step(1 / 60);
    if (r) out.push(r === "rest" ? "rest" : r.text);
  }
  return out;
}

describe("ticker", () => {
  it("rolls news in, holds it, then rolls back to the land", () => {
    const q = new TickerQueue();
    q.push(news("THEY TOOK A FLAG!"));
    expect(q.step(1 / 60)).toMatchObject({ text: "THEY TOOK A FLAG!" });
    expect(run(q, TICKER_HOLD - 0.1)).toEqual([]);
    expect(run(q, 0.3)).toEqual(["rest"]);
    expect(q.showing).toBeNull();
  });

  it("shows news in order, quicker while more waits", () => {
    const q = new TickerQueue();
    q.push(news("A"));
    q.push(news("B"));
    q.push(news("C"));
    const shown = run(q, TICKER_HOLD_BUSY * 2 + TICKER_HOLD + 0.2);
    expect(shown).toEqual(["A", "B", "C", "rest"]);
  });

  it("never falls far behind: the oldest news waiting is dropped", () => {
    const q = new TickerQueue();
    for (const t of ["A", "B", "C", "D", "E"]) q.push(news(t));
    expect(q.size).toBe(TICKER_MAX);
    expect(q.step(1 / 60)).toMatchObject({ text: "C" });
  });

  it("says the same thing once", () => {
    const q = new TickerQueue();
    q.push(news("HIT!"));
    q.step(1 / 60);
    q.push(news("HIT!"));
    q.push(news("BLOCKED!"));
    q.push(news("BLOCKED!"));
    expect(q.size).toBe(1);
  });

  it("picks dark text on light colors and white on strong ones", () => {
    expect(inkOn("#ffd166")).toBe("ink");
    expect(inkOn("#ffffff")).toBe("ink");
    expect(inkOn("#3d8bff")).toBe("white");
    expect(inkOn("#ff4f5e")).toBe("white");
    expect(inkOn("rgba(0,0,0,.5)")).toBe("white");
  });
});
