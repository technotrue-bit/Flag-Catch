/**
 * Thumbs and keys. The left thumb points where to go: drag from wherever it
 * lands, and the animal heads that way relative to the camera, like the
 * original's stylus. The right thumb has Jump, Throw and Item.
 */
export interface Controls {
  /** Screen space steer: x right, y forward, length 0..1. */
  steerX: number;
  steerY: number;
  jump: boolean;
  throwQueued: boolean;
  /** Set by a tap on Item (or E); the game clears it once used. */
  itemQueued: boolean;
  /** Held to stay under water (swimmers only). */
  dive: boolean;
  /** The on-screen Jump button calls this; keys and button combine. */
  setButtonJump(down: boolean): void;
  setButtonDive(down: boolean): void;
  /** Where the left thumb started and is now, for drawing the stick. */
  stick: { active: boolean; ox: number; oy: number; x: number; y: number };
}

const STICK_RANGE = 64;

export function createControls(surface: HTMLElement): Controls {
  const c: Controls = {
    steerX: 0,
    steerY: 0,
    jump: false,
    throwQueued: false,
    itemQueued: false,
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
  };
  let stickId: number | null = null;
  let keyJump = false;
  let buttonJump = false;
  let keyDive = false;
  let buttonDive = false;
  const keys = new Set<string>();

  surface.addEventListener("pointerdown", (e) => {
    if (stickId !== null) return;
    if (e.clientX > window.innerWidth * 0.5) return;
    stickId = e.pointerId;
    c.stick.active = true;
    c.stick.ox = c.stick.x = e.clientX;
    c.stick.oy = c.stick.y = e.clientY;
    surface.setPointerCapture?.(e.pointerId);
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
