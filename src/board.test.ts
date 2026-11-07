import { describe, expect, it } from "vitest";
import { type BoardEntry, boardColumns, boardKey } from "./board";

const entry = (id: number, team: 0 | 1, kos: number, outs = 0, streak = 0): BoardEntry => ({ id, team, name: `P${id}`, kos, outs, streak, me: id === 0 });

describe("scoreboard", () => {
  it("lists each team in its own column, most knockouts first, then fewest times knocked out", () => {
    const [a, b] = boardColumns([entry(0, 0, 1, 2), entry(1, 0, 3), entry(2, 0, 1, 0), entry(3, 1, 0), entry(4, 1, 5, 1)], 5);
    expect(a.rows.map((r) => r.id)).toEqual([1, 2, 0]);
    expect(b.rows.map((r) => r.id)).toEqual([4, 3]);
    expect(a.more).toBe(0);
  });

  it("keeps you on the board when your team has more animals than rows", () => {
    const team = [entry(0, 0, 0, 5), ...[1, 2, 3, 4, 5].map((id) => entry(id, 0, 10 - id))];
    const [a] = boardColumns(team, 3);
    expect(a.rows.map((r) => r.id)).toEqual([1, 2, 0]);
    expect(a.more).toBe(3);
    // Leading, you hold your own row with no swap.
    const [lead] = boardColumns([entry(0, 0, 9), ...team.slice(1)], 3);
    expect(lead.rows.map((r) => r.id)).toEqual([0, 1, 2]);
  });

  it("only redraws when a number on show changes", () => {
    const players = [entry(0, 0, 1), entry(1, 1, 0)];
    const k = boardKey(boardColumns(players, 4));
    expect(boardKey(boardColumns(players.map((p) => ({ ...p })), 4))).toBe(k);
    expect(boardKey(boardColumns([entry(0, 0, 1, 0, 1), entry(1, 1, 0)], 4))).not.toBe(k);
  });
});
