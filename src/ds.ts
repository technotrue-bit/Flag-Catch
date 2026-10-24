/**
 * DS mode: with the phone held upright, the screen splits like a two screen
 * handheld. The 3D game plays on the top screen; the map and the touch
 * controls sit on the bottom one, with a hinge between. Turn the phone
 * sideways and the normal wide layout comes back.
 *
 * The sums are pure so the tests can check them; `applyDs` puts them on the page.
 */
import { settings } from "./settings";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DsLayout {
  /** The game view. */
  top: Rect;
  /** Map and controls. */
  bottom: Rect;
}

/** Room round the two screens and between them, in CSS pixels. */
export const DS_SIDE = 14;
export const DS_HINGE = 30;
const DS_TOP_GAP = 12;
const DS_BOTTOM_GAP = 14;

/** Whether the split layout applies: DS mode on and the phone upright. */
export function dsWanted(on: boolean, w: number, h: number): boolean {
  return on && h > w && w > 0;
}

/**
 * The two screens for a `w` x `h` view with the given safe area insets. The
 * top screen takes a little under half the height, never taller than a
 * little under its width, so the game view stays wide enough to steer by.
 */
export function dsLayout(w: number, h: number, inset: Insets = { top: 0, right: 0, bottom: 0, left: 0 }): DsLayout {
  const x = inset.left + DS_SIDE;
  const width = Math.max(0, w - inset.left - inset.right - DS_SIDE * 2);
  const y = inset.top + DS_TOP_GAP;
  const room = Math.max(0, h - y - inset.bottom - DS_BOTTOM_GAP - DS_HINGE);
  const topH = Math.round(Math.min(room * 0.48, width * 0.9));
  return {
    top: { x, y, w: width, h: topH },
    bottom: { x, y: y + topH + DS_HINGE, w: width, h: room - topH },
  };
}

/**
 * Where the map sits on the bottom screen: upright (the enemy's land at the
 * top), centered, as tall as fits, and no wider than the middle of the screen
 * so both thumbs keep their sides. `ratio` is the island's width over length.
 */
export function mapRect(bottom: Rect, ratio: number): Rect {
  const maxW = bottom.w * 0.46;
  const maxH = Math.max(0, bottom.h - 16);
  const h = Math.min(maxH, maxW / ratio);
  const w = h * ratio;
  return { x: bottom.x + (bottom.w - w) / 2, y: bottom.y + (bottom.h - h) / 2, w, h };
}

/** The safe area insets, read off a hidden element padded by env(). */
let probe: HTMLElement | null = null;
function readInsets(): Insets {
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  const n = (v: string) => parseFloat(v) || 0;
  return { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
}

/** The current split, or null when the normal layout applies. */
export let ds: DsLayout | null = null;

/**
 * Lay the page out for DS mode or undo it: a class and size variables on
 * <html> for the CSS, and the game canvas's box moved onto the top screen.
 */
export function applyDs(app: HTMLElement): DsLayout | null {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const html = document.documentElement;
  ds = dsWanted(settings.dsMode, w, h) ? dsLayout(w, h, readInsets()) : null;
  html.classList.toggle("fc-ds", !!ds);
  if (!ds) {
    app.style.cssText = "";
    return null;
  }
  const { top, bottom } = ds;
  const px = (v: number) => `${Math.round(v)}px`;
  html.style.setProperty("--dsx", px(top.x));
  html.style.setProperty("--dsw", px(top.w));
  html.style.setProperty("--dst", px(top.y));
  html.style.setProperty("--dsh", px(top.h));
  html.style.setProperty("--dsb", px(bottom.y));
  html.style.setProperty("--dsbh", px(bottom.h));
  html.style.setProperty("--dsbb", px(h - bottom.y - bottom.h));
  app.style.cssText = `left:${px(top.x)};top:${px(top.y)};width:${px(top.w)};height:${px(top.h)};right:auto;bottom:auto`;
  return ds;
}
