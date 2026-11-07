/**
 * The scoreboard: every animal's knockouts, times knocked out and current streak, one column a team. Pure, so the
 * tests can check who makes the cut when a big match has more animals than the board has rows.
 */

export interface BoardEntry {
  id: number;
  team: 0 | 1;
  name: string;
  kos: number;
  outs: number;
  streak: number;
  /** You: always on the board, picked out. */
  me: boolean;
}

export interface BoardColumn {
  team: 0 | 1;
  rows: BoardEntry[];
  /** Animals on this team the board had no row for. */
  more: number;
}

/** Most knockouts first, then fewest times knocked out, then the longer streak. */
export function byStanding(a: BoardEntry, b: BoardEntry): number {
  return b.kos - a.kos || a.outs - b.outs || b.streak - a.streak || a.id - b.id;
}

/**
 * The two columns, each at most `maxRows` long. When a team has more animals than rows, the leaders get them, but
 * you always keep yours: you take the last row from whoever was in it.
 */
export function boardColumns(entries: readonly BoardEntry[], maxRows: number): [BoardColumn, BoardColumn] {
  const rows = Math.max(1, Math.floor(maxRows));
  const column = (team: 0 | 1): BoardColumn => {
    const all = entries.filter((e) => e.team === team).sort(byStanding);
    const shown = all.slice(0, rows);
    const me = all.find((e) => e.me);
    if (me && !shown.includes(me)) shown[shown.length - 1] = me;
    return { team, rows: shown, more: all.length - shown.length };
  };
  return [column(0), column(1)];
}

/** A short key that changes whenever the board would draw differently, so it only redraws then. */
export function boardKey(cols: readonly BoardColumn[]): string {
  return cols.map((c) => `${c.more}:${c.rows.map((r) => `${r.id},${r.kos},${r.outs},${r.streak}`).join(";")}`).join("|");
}
