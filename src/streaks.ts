/**
 * What a kill streak is called on screen. A multi KO (knockouts within a few seconds of each other) takes the
 * title when there is one; otherwise the run of knockouts without being knocked out names it. `level` (1 to 3) sets
 * how big the banner, the chime and the shake get.
 */
export interface StreakTitle {
  title: string;
  level: 1 | 2 | 3;
  color: string;
}

const MULTI = ["", "", "DOUBLE KO!", "TRIPLE KO!", "QUAD KO!"];
const RUN = ["", "", "2 IN A ROW!", "ON FIRE!", "RAMPAGE!", "UNSTOPPABLE!", "WILD STREAK!", "WILD STREAK!"];

export function streakTitle(n: number, multi: number): StreakTitle {
  const level: 1 | 2 | 3 = n >= 4 || multi >= 3 ? 3 : n >= 2 || multi >= 2 ? 2 : 1;
  const color = level === 3 ? "#ff6b5b" : level === 2 ? "#ff9f1c" : "#ffd166";
  if (multi >= 2) return { title: MULTI[multi] ?? "MEGA KO!", level, color };
  if (n >= 2) return { title: RUN[n] ?? "LEGENDARY!", level, color };
  return { title: "KNOCKOUT!", level: 1, color };
}

/** A short name for an animal in the feed and calls: "LION" for the Rally Lion. */
export function shortName(name: string): string {
  return name.split(" ").pop()!.toUpperCase();
}
