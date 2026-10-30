/**
 * Account saves through TrueAIGaming. When the game runs inside the site's play page and the player is signed in,
 * the page sends the account's copy of the save ("tag:load"); the game folds it into its own and sends the result
 * back ("tag:save") after every change. The page does the storing, so the game never sees a sign-in. Played on its
 * own, or signed out, nothing is sent and the save stays on this device as before.
 */

/** The site and its preview builds. Saves are only ever posted to one of these. */
const SITE = [/^https:\/\/(www\.)?trueaigaming\.com$/, /^https:\/\/trueaigaming-[a-z0-9-]+-true-team2\.vercel\.app$/];

export const isSite = (origin: string): boolean => SITE.some((re) => re.test(origin));

/** The game served from this computer (development and tests): any page framing it may play the site. */
const devHost = (): boolean => typeof location !== "undefined" && (location.hostname === "localhost" || location.hostname === "127.0.0.1");

/**
 * What the play page says about online play ("tag:online"): signed out, or signed in with a ticket that names the
 * player (see net/ticket.ts), the site's public key to check tickets with, and the site's Realtime address and public
 * key that rooms meet on.
 */
export interface OnlineInfo {
  signedIn: boolean;
  ticket?: string;
  siteKey?: JsonWebKey;
  realtime?: { url: string; key: string };
}

/** Only the site's own Supabase project address is used for rooms. */
const REALTIME_URL = /^https:\/\/[a-z0-9]{8,40}\.supabase\.co$/;

export function readOnline(m: Record<string, unknown>, dev = devHost()): OnlineInfo | null {
  if (m.signedIn !== true) return { signedIn: false };
  const rt = m.realtime as { url?: unknown; key?: unknown } | undefined;
  const key = m.key as JsonWebKey | undefined;
  if (typeof m.ticket !== "string" || m.ticket.length > 600) return null;
  if (!key || typeof key !== "object" || key.kty !== "EC" || key.crv !== "P-256" || typeof key.x !== "string" || typeof key.y !== "string") return null;
  if (!rt || typeof rt.url !== "string" || typeof rt.key !== "string" || rt.key.length > 2000) return null;
  const url = rt.url.replace(/\/+$/, "");
  if (!REALTIME_URL.test(url) && !(dev && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url))) return null;
  return { signedIn: true, ticket: m.ticket, siteKey: { kty: "EC", crv: "P-256", x: key.x, y: key.y }, realtime: { url, key: rt.key } };
}

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
  onOnline: (info: OnlineInfo) => void = () => {},
): Cloud {
  if (window.parent === window) return { push() {} };
  let site: string | null = null;
  const push = () => {
    if (site) window.parent.postMessage({ type: "tag:save", game, v: 1, data: get() }, site);
  };
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window.parent || !(isSite(e.origin) || devHost())) return;
    const m = e.data as { type?: unknown; game?: unknown; data?: unknown; name?: unknown } | null;
    if (!m || m.game !== game) return;
    if (m.type === "tag:online") {
      const info = readOnline(m as Record<string, unknown>);
      if (info) onOnline(info);
      return;
    }
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
