/**
 * Account saves through TrueAIGaming. When the game runs inside the site's play page and the player is signed in,
 * the page sends the account's copy of the save ("tag:load"); the game folds it into its own and sends the result
 * back ("tag:save") after every change. The page does the storing, so the game never sees a sign-in. Played on its
 * own, or signed out, nothing is sent and the save stays on this device as before.
 */

/** The site and its preview builds. Saves are only ever posted to one of these. */
const SITE = [/^https:\/\/(www\.)?trueaigaming\.com$/, /^https:\/\/trueaigaming-[a-z0-9-]+-true-team2\.vercel\.app$/];

export const isSite = (origin: string): boolean => SITE.some((re) => re.test(origin));

export interface Cloud {
  /** Send the current save to the account, once the page has said it keeps one. */
  push(): void;
}

/** Longest name shown on the map (site handles go up to 24). */
export const NAME_MAX = 24;

/** A site username fit to draw: trimmed, no control characters, at most NAME_MAX letters. Anything else gives null. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = Array.from(raw.replace(/[\p{C}]/gu, "").trim()).slice(0, NAME_MAX).join("").trim();
  return name || null;
}

/**
 * `onName` hears the signed-in player's site username ("tag:player"), so the minimap can label them. Signed out, it
 * never fires and the game says "You".
 */
export function startCloud(
  game: string,
  get: () => unknown,
  apply: (data: unknown) => void,
  onName: (name: string) => void = () => {},
): Cloud {
  if (window.parent === window) return { push() {} };
  let site: string | null = null;
  const push = () => {
    if (site) window.parent.postMessage({ type: "tag:save", game, v: 1, data: get() }, site);
  };
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window.parent || !isSite(e.origin)) return;
    const m = e.data as { type?: unknown; game?: unknown; data?: unknown; name?: unknown } | null;
    if (!m || m.game !== game) return;
    if (m.type === "tag:player") {
      const name = cleanName(m.name);
      if (name) onName(name);
      return;
    }
    if (m.type !== "tag:load") return;
    site = e.origin;
    if (m.data != null) apply(m.data);
    push();
  });
  // Says which game this is and nothing else, so any page may hear it.
  window.parent.postMessage({ type: "tag:ready", game, v: 1 }, "*");
  return { push };
}
