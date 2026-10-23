/**
 * Everything drawn over the 3D view: score bar, timer, minimap, thumb
 * buttons, the stick ring, call outs, the start card and the results card.
 * Big, soft and tucked into the corners so the middle stays clear.
 */
import { ANIMALS, ANIMAL_IDS } from "./animals";
import type { Controls } from "./input";
import { FLAG_ENEMY, FLAG_FREE, PALETTE, TEAMS } from "./palette";
import { type Match, tune } from "./sim";
import { WORLD_RADIUS, groundHeight } from "./terrain";

const CSS = `
.fc-hud{position:fixed;inset:0;pointer-events:none;font-family:ui-rounded,"SF Pro Rounded","Nunito","Trebuchet MS",system-ui,sans-serif;color:${PALETTE.ink};-webkit-font-smoothing:antialiased}
.fc-hud *{box-sizing:border-box}
.fc-top{position:absolute;top:max(10px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px}
.fc-team{display:flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;font-weight:800;font-size:20px;color:#fff;box-shadow:0 3px 0 rgba(43,35,64,.25)}
.fc-team .ic{width:18px;height:18px;border-radius:50%;background:#fff}
.fc-team.moon .ic{background:transparent;box-shadow:inset -6px -2px 0 0 #fff}
.fc-timer{min-width:74px;text-align:center;padding:6px 12px;border-radius:14px;background:rgba(255,255,255,.88);font-weight:800;font-size:20px;box-shadow:0 3px 0 rgba(43,35,64,.18)}
.fc-timer.low{color:#e8455b}
.fc-map{position:absolute;top:max(10px,env(safe-area-inset-top));right:max(10px,env(safe-area-inset-right));width:112px;height:112px;border-radius:50%;background:rgba(255,255,255,.55);box-shadow:0 3px 0 rgba(43,35,64,.18)}
.fc-btn{position:absolute;pointer-events:auto;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;letter-spacing:.5px;user-select:none;-webkit-user-select:none;touch-action:none;box-shadow:0 5px 0 rgba(43,35,64,.28);border:3px solid rgba(255,255,255,.75);opacity:.88}
.fc-btn.down{transform:translateY(3px);box-shadow:0 2px 0 rgba(43,35,64,.28);opacity:1}
.fc-jump{width:96px;height:96px;right:max(22px,calc(env(safe-area-inset-right) + 12px));bottom:max(22px,env(safe-area-inset-bottom));background:#46b4e8;font-size:17px}
.fc-throw{width:78px;height:78px;right:max(132px,calc(env(safe-area-inset-right) + 122px));bottom:max(30px,env(safe-area-inset-bottom));background:#ff6b5b;font-size:15px}
.fc-item{width:56px;height:56px;right:max(52px,calc(env(safe-area-inset-right) + 42px));bottom:max(132px,calc(env(safe-area-inset-bottom) + 122px));background:rgba(150,150,170,.7);font-size:11px}
.fc-stick{position:absolute;width:128px;height:128px;margin:-64px 0 0 -64px;border-radius:50%;border:3px solid rgba(255,255,255,.7);background:rgba(255,255,255,.14);display:none}
.fc-knob{position:absolute;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.85);box-shadow:0 3px 0 rgba(43,35,64,.2);display:none}
.fc-hint{position:absolute;left:max(18px,env(safe-area-inset-left));bottom:max(18px,env(safe-area-inset-bottom));font-weight:700;font-size:13px;color:rgba(43,35,64,.55)}
.fc-arrow{position:absolute;top:calc(max(10px,env(safe-area-inset-top)) + 50px);left:50%;width:34px;height:34px;margin-left:-17px;display:flex;align-items:center;justify-content:center}
.fc-arrow i{width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:22px solid ${FLAG_FREE};filter:drop-shadow(0 2px 0 rgba(43,35,64,.3))}
.fc-call{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%) scale(.6);font-weight:900;font-size:44px;color:#fff;-webkit-text-stroke:2px ${PALETTE.ink};paint-order:stroke fill;opacity:0;transition:transform .18s cubic-bezier(.3,1.6,.5,1),opacity .18s;white-space:nowrap}
.fc-call.show{transform:translate(-50%,-50%) scale(1);opacity:1}
.fc-top-left{position:absolute;top:max(10px,env(safe-area-inset-top));left:max(10px,env(safe-area-inset-left));display:flex;gap:6px;pointer-events:auto}
.fc-chip{padding:6px 10px;border-radius:12px;background:rgba(255,255,255,.82);font-weight:800;font-size:12px;border:2px solid transparent;box-shadow:0 2px 0 rgba(43,35,64,.15)}
.fc-chip.on{border-color:${PALETTE.ink}}
.fc-card{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(124,196,242,.55);pointer-events:auto;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.fc-card .box{background:#fffaf0;border-radius:24px;padding:20px 28px;text-align:center;box-shadow:0 6px 0 rgba(43,35,64,.25);max-width:min(560px,90vw)}
.fc-card h1{margin:0 0 4px;font-size:40px;font-weight:900;letter-spacing:1px;color:#ff8a4c;-webkit-text-stroke:2px ${PALETTE.ink};paint-order:stroke fill}
.fc-card p{margin:6px 0;font-size:15px;font-weight:700;color:rgba(43,35,64,.75)}
.fc-card .go{margin-top:12px;display:inline-block;padding:12px 30px;border-radius:999px;background:#46b4e8;color:#fff;font-weight:900;font-size:20px;box-shadow:0 5px 0 rgba(43,35,64,.28)}
.fc-rotate{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:#7cc4f2;pointer-events:auto;font-weight:800;font-size:20px;color:#fff;text-align:center;padding:24px}
.fc-rotate .phone{width:46px;height:78px;border:5px solid #fff;border-radius:10px;animation:fcrot 1.6s ease-in-out infinite}
@keyframes fcrot{0%,20%{transform:rotate(0)}50%,80%{transform:rotate(-90deg)}100%{transform:rotate(0)}}
@media (orientation:portrait){.fc-rotate{display:flex}}
.fc-tune{position:absolute;top:56px;left:max(10px,env(safe-area-inset-left));background:rgba(255,255,255,.92);border-radius:14px;padding:8px 10px;font-size:11px;font-weight:700;pointer-events:auto;display:none;max-height:70vh;overflow:auto}
.fc-tune label{display:flex;justify-content:space-between;gap:8px;align-items:center}
.fc-tune input{width:110px}
`;

export interface Hud {
  update(m: Match, controls: Controls, camYaw: number): void;
  call(text: string, color?: string): void;
  showStart(onGo: () => void): void;
  showResults(m: Match, onAgain: () => void): void;
  onAnimal(cb: (id: string) => void): void;
  setAnimal(id: string): void;
}

export function createHud(controls: Controls): Hud {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = el("div", "fc-hud");
  document.body.appendChild(root);

  const top = el("div", "fc-top", root);
  const teamA = el("div", "fc-team sun", top);
  teamA.style.background = TEAMS[0].color;
  el("span", "ic", teamA);
  const scoreA = el("span", "", teamA);
  const timer = el("div", "fc-timer", top);
  const teamB = el("div", "fc-team moon", top);
  teamB.style.background = TEAMS[1].color;
  const scoreB = el("span", "", teamB);
  el("span", "ic", teamB);

  const map = el("canvas", "fc-map", root) as HTMLCanvasElement;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  map.width = map.height = 112 * dpr;
  const mctx = map.getContext("2d")!;
  const mapBg = drawMapBackground(112 * dpr);

  const arrow = el("div", "fc-arrow", root);
  el("i", "", arrow);

  const stick = el("div", "fc-stick", root);
  const knob = el("div", "fc-knob", root);
  const hint = el("div", "fc-hint", root);
  hint.textContent = "Drag on the left to steer";

  const jump = el("div", "fc-btn fc-jump", root);
  jump.textContent = "JUMP";
  const thr = el("div", "fc-btn fc-throw", root);
  thr.textContent = "THROW";
  const item = el("div", "fc-btn fc-item", root);
  item.textContent = "ITEM";

  const press = (node: HTMLElement, down: () => void, up: () => void) => {
    node.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      node.setPointerCapture?.(e.pointerId);
      node.classList.add("down");
      down();
    });
    const release = () => {
      node.classList.remove("down");
      up();
    };
    node.addEventListener("pointerup", release);
    node.addEventListener("pointercancel", release);
  };
  press(jump, () => controls.setButtonJump(true), () => controls.setButtonJump(false));
  press(thr, () => (controls.throwQueued = true), () => {});

  const call = el("div", "fc-call", root);
  let callTimer = 0;

  const tl = el("div", "fc-top-left", root);
  const animalChips = new Map<string, HTMLElement>();
  let animalCb: (id: string) => void = () => {};
  for (const id of ANIMAL_IDS) {
    const chip = el("div", "fc-chip", tl);
    chip.textContent = ANIMALS[id].name;
    chip.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      animalCb(id);
    });
    animalChips.set(id, chip);
  }
  const tuneChip = el("div", "fc-chip", tl);
  tuneChip.textContent = "Tune";
  const tunePanel = buildTunePanel(root);
  tuneChip.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    tunePanel.style.display = tunePanel.style.display === "block" ? "none" : "block";
  });

  const rotate = el("div", "fc-rotate", root);
  el("div", "phone", rotate);
  el("div", "", rotate).textContent = "Turn your phone sideways to play";

  let hintTimer = 8;

  return {
    update(m, c, camYaw) {
      scoreA.textContent = String(m.scores[0]);
      scoreB.textContent = String(m.scores[1]);
      const t = Math.ceil(m.timeLeft);
      timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      timer.classList.toggle("low", t <= 15);

      stick.style.display = knob.style.display = c.stick.active ? "block" : "none";
      if (c.stick.active) {
        stick.style.left = `${c.stick.ox}px`;
        stick.style.top = `${c.stick.oy}px`;
        knob.style.left = `${c.stick.x}px`;
        knob.style.top = `${c.stick.y}px`;
        hintTimer = 0;
      }
      hintTimer -= 1 / 60;
      hint.style.display = hintTimer > 0 ? "block" : "none";

      const me = m.players[0];
      // Point at your base while carrying, else at the nearest free flag.
      let tx = NaN;
      let tz = NaN;
      let color = FLAG_FREE;
      if (me.carrying >= 0) {
        tx = m.bases[0].x;
        tz = m.bases[0].z;
        color = TEAMS[0].color;
      } else {
        let best = Infinity;
        for (const f of m.flags) {
          if (f.state !== "free") continue;
          const d = Math.hypot(f.x - me.x, f.z - me.z);
          if (d < best) {
            best = d;
            tx = f.x;
            tz = f.z;
          }
        }
      }
      if (Number.isFinite(tx)) {
        arrow.style.display = "flex";
        const ang = Math.atan2(tx - me.x, tz - me.z) - camYaw;
        arrow.style.transform = `rotate(${-ang}rad)`;
        (arrow.firstChild as HTMLElement).style.borderBottomColor = color;
      } else {
        arrow.style.display = "none";
      }

      drawMap(mctx, mapBg, m, map.width);

      if (callTimer > 0) {
        callTimer -= 1 / 60;
        if (callTimer <= 0) call.classList.remove("show");
      }
    },
    call(text, color = "#ffffff") {
      call.textContent = text;
      call.style.color = color;
      call.classList.remove("show");
      void call.offsetWidth;
      call.classList.add("show");
      callTimer = 0.9;
    },
    showStart(onGo) {
      const card = el("div", "fc-card", root);
      const box = el("div", "box", card);
      el("h1", "", box).textContent = "FLAG CATCH";
      el("p", "", box).textContent = "Feel test. Grab green flags and bring them to your orange base.";
      el("p", "", box).textContent = "Left thumb steers. Jump (hold to float) and Throw firecrackers on the right.";
      el("p", "", box).textContent = "Try all three animals with the buttons top left.";
      const go = el("div", "go", box);
      go.textContent = "PLAY";
      card.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        card.remove();
        onGo();
      });
    },
    showResults(m, onAgain) {
      const card = el("div", "fc-card", root);
      const box = el("div", "box", card);
      const [a, b] = m.scores;
      el("h1", "", box).textContent = a === b ? "DRAW!" : a > b ? "YOU WIN!" : "SO CLOSE!";
      el("p", "", box).textContent = `${TEAMS[0].name} ${a}  :  ${b} ${TEAMS[1].name}`;
      el("p", "", box).textContent = `Your points: ${m.players[0].score}`;
      const go = el("div", "go", box);
      go.textContent = "AGAIN";
      card.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        card.remove();
        onAgain();
      });
    },
    onAnimal(cb) {
      animalCb = cb;
    },
    setAnimal(id) {
      animalChips.forEach((chip, key) => chip.classList.toggle("on", key === id));
    },
  };
}

function el(tag: string, cls: string, parent?: HTMLElement): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  parent?.appendChild(n);
  return n;
}

function drawMapBackground(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px / size - 0.5) * 2 * WORLD_RADIUS;
      const z = (py / size - 0.5) * 2 * WORLD_RADIUS;
      const i = (py * size + px) * 4;
      const inside = Math.hypot(px - size / 2, py - size / 2) < size / 2;
      const h = groundHeight(x, z);
      const [r, g, b] = h > 0.9 ? [126, 200, 100] : h > 0 ? [240, 218, 160] : [95, 200, 214];
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = inside ? 200 : 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function drawMap(ctx: CanvasRenderingContext2D, bg: HTMLCanvasElement, m: Match, size: number): void {
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(bg, 0, 0);
  const toPx = (v: number) => (v / (2 * WORLD_RADIUS) + 0.5) * size;
  const s = size / 112;
  for (const b of m.bases) {
    ctx.fillStyle = TEAMS[b.team].color;
    ctx.fillRect(toPx(b.x) - 5 * s, toPx(b.z) - 5 * s, 10 * s, 10 * s);
  }
  for (const f of m.flags) {
    if (f.state !== "free") continue;
    ctx.fillStyle = FLAG_FREE;
    ctx.beginPath();
    ctx.arc(toPx(f.x), toPx(f.z), 3.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = s;
    ctx.stroke();
  }
  for (const p of m.players) {
    const me = p.id === 0;
    ctx.fillStyle = p.carrying >= 0 && p.team === 1 ? FLAG_ENEMY : TEAMS[p.team].color;
    ctx.beginPath();
    ctx.arc(toPx(p.x), toPx(p.z), (me ? 4.5 : 3) * s, 0, Math.PI * 2);
    ctx.fill();
    if (me) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    }
  }
}

function buildTunePanel(root: HTMLElement): HTMLElement {
  const panel = el("div", "fc-tune", root);
  const knobs: Array<[keyof typeof tune, number, number, number]> = [
    ["accel", 8, 60, 1],
    ["gravity", 12, 40, 1],
    ["throwSpeed", 8, 36, 1],
    ["throwLift", 0, 14, 0.5],
    ["throwCooldown", 0.2, 1.5, 0.05],
    ["skidFriction", 0, 2, 0.05],
    ["stunTime", 0.3, 2.5, 0.1],
    ["popLift", 2, 18, 0.5],
    ["popPush", 0, 20, 0.5],
  ];
  for (const [key, min, max, stepv] of knobs) {
    const row = el("label", "", panel);
    const name = el("span", "", row);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(stepv);
    input.value = String(tune[key]);
    const sync = () => (name.textContent = `${key} ${tune[key]}`);
    input.addEventListener("input", () => {
      tune[key] = Number(input.value);
      sync();
    });
    input.addEventListener("pointerdown", (e) => e.stopPropagation());
    sync();
    row.appendChild(input);
  }
  return panel;
}
