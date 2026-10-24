/**
 * Thumbs and keys. The left thumb points where to go: drag from wherever it
 * lands, and the animal heads that way relative to the camera, like the
 * original's stylus. The right thumb has Jump, Throw and Item. Left handed
 * players can swap the sides in Settings.
 */
import { settings } from "./settings";

export interface Controls {
  /** Screen space steer: x right, y forward, length 0..1. */
  steerX: number;
  steerY: number;
  jump: boolean;
  throwQueued: boolean;
  /** Set by a tap on Item (or E); the game clears it once used. */
  itemQueued: boolean;
  /** Set by a tap on the medic's FLAG button (or R); cleared once used. */
  plantQueued: boolean;
  /** Held to stay under water (swimmers only). */
  dive: boolean;
  /** The on-screen Jump button calls this; keys and button combine. */
  setButtonJump(down: boolean): void;
  setButtonDive(down: boolean): void;
  /** Where the left thumb started and is now, for drawing the stick. */
  stick: { active: boolean; ox: number; oy: number; x: number; y: number };
  /** Whether a thumb landing at (x, y) steers; DS mode keeps it to the bottom screen. */
  canSteer(x: number, y: number): boolean;
}

const STICK_RANGE = 64;

/**
 * `surface` hears every touch that no button or card has taken, so a thumb
 * can land on the game view or, in DS mode, on the bottom screen.
 */
export function createControls(surface: HTMLElement): Controls {
  const c: Controls = {
    steerX: 0,
    steerY: 0,
    jump: false,
    throwQueued: false,
    itemQueued: false,
    plantQueued: false,
    setButtonJump(down: boolean) {
      buttonJump = down;
      c.jump = keyJump || buttonJump;
    },
    dive: false,
    setButtonDive(down: boolean) {
      buttonDive = down;
      c.dive = keyDive || buttonDive;
    },
    stick: { active: false, ox: 0, oy: 0, x: 0, y: 0 },
    canSteer: (x) => (x > window.innerWidth * 0.5) === settings.leftHanded,
  };
  let stickId: number | null = null;
  let keyJump = false;
  let buttonJump = false;
  let keyDive = false;
  let buttonDive = false;
  const keys = new Set<string>();

  surface.addEventListener("pointerdown", (e) => {
    if (stickId !== null || !c.canSteer(e.clientX, e.clientY)) return;
    stickId = e.pointerId;
    c.stick.active = true;
    c.stick.ox = c.stick.x = e.clientX;
    c.stick.oy = c.stick.y = e.clientY;
    try {
      surface.setPointerCapture?.(e.pointerId);
    } catch {
      // A pointer the browser has already let go of; the stick still works.
    }
  });
  surface.addEventListener("pointermove", (e) => {
    if (e.pointerId !== stickId) return;
    c.stick.x = e.clientX;
    c.stick.y = e.clientY;
    updateStick();
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    c.stick.active = false;
    c.steerX = 0;
    c.steerY = 0;
  };
  surface.addEventListener("pointerup", end);
  surface.addEventListener("pointercancel", end);

  function updateStick(): void {
    // The base stays where the thumb landed; the knob is held inside its ring.
    let dx = c.stick.x - c.stick.ox;
    let dy = c.stick.y - c.stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RANGE) {
      dx = (dx / len) * STICK_RANGE;
      dy = (dy / len) * STICK_RANGE;
      c.stick.x = c.stick.ox + dx;
      c.stick.y = c.stick.oy + dy;
    }
    const m = Math.min(1, Math.hypot(dx, dy) / STICK_RANGE);
    const dead = m < 0.12 ? 0 : (m - 0.12) / 0.88;
    const l = Math.hypot(dx, dy) || 1;
    c.steerX = (dx / l) * dead;
    c.steerY = (-dy / l) * dead;
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === "KeyJ" || e.code === "KeyK" || e.code === "Enter") c.throwQueued = true;
    if (e.code === "KeyE" || e.code === "KeyI") c.itemQueued = true;
    if (e.code === "KeyR" || e.code === "KeyQ") c.plantQueued = true;
    syncKeys();
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    syncKeys();
  });
  window.addEventListener("blur", () => {
    keys.clear();
    syncKeys();
  });

  let keysSteering = false;
  function syncKeys(): void {
    const x = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    const y = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    if (x || y) {
      const l = Math.hypot(x, y);
      c.steerX = x / l;
      c.steerY = y / l;
      keysSteering = true;
    } else if (keysSteering) {
      c.steerX = 0;
      c.steerY = 0;
      keysSteering = false;
    }
    keyJump = keys.has("Space");
    c.jump = keyJump || buttonJump;
    keyDive = keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("KeyL");
    c.dive = keyDive || buttonDive;
  }

  return c;
}
