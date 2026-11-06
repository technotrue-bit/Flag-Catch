/**
 * The main menu's Leave game. A web page can't quit itself, so it goes back where the player came from:
 *
 * - On TrueAIGaming.com's play page (the game in a frame), it tells the page ("tag:leave") and takes the whole tab
 *   back to the site.
 * - Opened on its own, it goes back a page if there is one, or closes the tab if the browser lets it (a tab the game
 *   opened, a Home Screen copy), and otherwise goes to TrueAIGaming.com.
 *
 * Portal copies never show Leave game: portals have their own way out.
 */
import { isSite } from "./cloud";

export const SITE_HOME = "https://trueaigaming.com/";

/** What Leave game will do here, worked out from where the game runs. */
export function leavePlan(framed: boolean, referrer: string, historyLength: number): { kind: "site"; url: string } | { kind: "tell" } | { kind: "back" } | { kind: "close" } {
  if (framed) {
    let origin = "";
    try {
      origin = new URL(referrer).origin;
    } catch {
      // No referrer: the page that framed us is unknown.
    }
    return isSite(origin) ? { kind: "site", url: `${origin}/` } : { kind: "tell" };
  }
  return historyLength > 1 ? { kind: "back" } : { kind: "close" };
}

export function leaveGame(game: string): void {
  const framed = window.parent !== window;
  if (framed) window.parent.postMessage({ type: "tag:leave", game, v: 1 }, "*");
  const plan = leavePlan(framed, document.referrer, history.length);
  if (plan.kind === "site") {
    try {
      window.top!.location.href = plan.url;
    } catch {
      // The frame may not move the tab; the page heard tag:leave and can do it.
    }
  } else if (plan.kind === "back") {
    history.back();
  } else if (plan.kind === "close") {
    window.close();
    // Still here: the browser keeps tabs it didn't open by script.
    window.setTimeout(() => {
      if (!document.hidden) location.href = SITE_HOME;
    }, 300);
  }
}
