/**
 * Portal build: the copy of Flag Catch uploaded to game portals (CrazyGames, itch.io). Built with
 * `npm run build:portal`, or try it with `?portal` on any build.
 *
 * Portals ask for a game with no fullscreen button of its own (they add one), no cross promotion
 * and no menu items that can't work there. Online play needs a TrueAIGaming.com sign in, so a
 * portal copy plays offline against CPU animals, and points stay on the player's device.
 */

export const isPortal = (envFlag: string | undefined, search: string): boolean =>
  envFlag === "1" || new URLSearchParams(search).has("portal");

export const PORTAL = isPortal(import.meta.env.VITE_PORTAL as string | undefined, typeof location === "undefined" ? "" : location.search);

/** What the two screen upright layout is called on screen. */
export const UPRIGHT_NAME = PORTAL ? "UPRIGHT MODE" : "DS MODE";
