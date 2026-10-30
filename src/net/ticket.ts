/**
 * Who's who in a room. The only name another player ever sees is a TrueAIGaming.com username, and only one the site
 * itself vouched for: signed in, the play page asks the site for a ticket (the username, signed by the site's key,
 * good for a few hours) and hands it to the game with the site's public key. Every phone checks every ticket it is
 * shown, so nobody can make up a name, and a ticket that doesn't check out is never shown.
 */

export interface Who {
  name: string;
  /** The account, as a short tag (not the account id), to spot the same player twice. */
  uid: string;
  /** Milliseconds since 1970 after which the ticket stops working. */
  exp: number;
}

/** The site's public signing key, as the site sends it (an ECDSA P-256 key in JWK form). */
export type SiteKey = JsonWebKey;

const NAME_MAX = 24;
const cache = new Map<string, Promise<Who | null>>();
let keyFor: { jwk: string; key: Promise<CryptoKey | null> } | null = null;

function b64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

function importKey(jwk: SiteKey): Promise<CryptoKey | null> {
  const text = JSON.stringify(jwk);
  if (keyFor?.jwk !== text) {
    const clean: JsonWebKey = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
    keyFor = {
      jwk: text,
      key: crypto.subtle.importKey("jwk", clean, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]).catch(() => null),
    };
  }
  return keyFor.key;
}

/** The player a ticket names, or null if it isn't the site's, has run out or is broken. */
export function checkTicket(ticket: unknown, siteKey: SiteKey | null, now = Date.now()): Promise<Who | null> {
  if (typeof ticket !== "string" || ticket.length > 600 || !siteKey) return Promise.resolve(null);
  const at = `${siteKey.x}.${siteKey.y}|${ticket}`;
  let hit = cache.get(at);
  if (!hit) {
    if (cache.size > 200) cache.clear();
    hit = verify(ticket, siteKey);
    cache.set(at, hit);
  }
  return hit.then((who) => (who && who.exp > now ? who : null));
}

async function verify(ticket: string, siteKey: SiteKey): Promise<Who | null> {
  const dot = ticket.indexOf(".");
  if (dot < 1) return null;
  const body = ticket.slice(0, dot);
  const key = await importKey(siteKey);
  if (!key) return null;
  try {
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64url(ticket.slice(dot + 1)), new TextEncoder().encode(body));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(b64url(body))) as { v?: unknown; h?: unknown; u?: unknown; e?: unknown };
    if (data.v !== 1 || typeof data.h !== "string" || typeof data.u !== "string" || typeof data.e !== "number") return null;
    const name = Array.from(data.h.replace(/[\p{C}]/gu, "").trim()).slice(0, NAME_MAX).join("");
    return name ? { name, uid: data.u.slice(0, 32), exp: data.e } : null;
  } catch {
    return null;
  }
}

/** When it was made, how long before it runs out a ticket should be asked for again. */
export function ticketExpiry(ticket: string): number {
  try {
    const data = JSON.parse(new TextDecoder().decode(b64url(ticket.slice(0, ticket.indexOf("."))))) as { e?: unknown };
    return typeof data.e === "number" ? data.e : 0;
  } catch {
    return 0;
  }
}
