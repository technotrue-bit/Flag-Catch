/**
 * The online screens: the menu (Quick Match, Make a Room, Join with a code) and the room you wait in before a
 * match. Built from the same cards and buttons as the rest of the menus. Players appear only by their site
 * username; nothing here lets anyone type to anyone.
 */
import { ANIMALS, ANIMAL_IDS } from "./animals";
import { sfx } from "./audio";
import { CODE_LENGTH, type Member, type Picks, type RoomState, type Rules, cleanCode } from "./net/room";
import { ONLINE_PER_TEAM } from "./net/match";
import { PALETTE, TEAMS } from "./palette";
import type { Mode, Difficulty } from "./sim";
import { WORLDS, worldById } from "./worlds";

const CSS = `
.fc-on .box{width:min(640px,94vw)}
.fc-on h1{font-size:30px}
.fc-on .sub{font-size:13px;font-weight:800;color:rgba(43,35,64,.65);margin:2px 0 8px}
.fc-on .opts{display:flex;flex-direction:column;gap:8px;align-items:stretch;min-width:240px;margin:8px auto 0;max-width:360px}
.fc-on .opts .go{margin-top:0}
.fc-on .opts .go small{display:block;font-size:11px;font-weight:800;opacity:.85;margin-top:1px}
.fc-on .code{font-size:40px;font-weight:900;letter-spacing:10px;color:${PALETTE.ink};margin:2px 0}
.fc-on .boxes{display:flex;gap:8px;justify-content:center;margin:6px 0 10px}
.fc-on .boxes i{width:46px;height:56px;border-radius:12px;background:#fff;border:3px solid ${PALETTE.ink};display:flex;align-items:center;justify-content:center;font-style:normal;font-size:30px;font-weight:900}
.fc-on .pad{display:grid;grid-template-columns:repeat(9,1fr);gap:5px;max-width:420px;margin:0 auto}
.fc-on .pad div{pointer-events:auto;padding:8px 0;border-radius:10px;background:rgba(43,35,64,.1);font-weight:900;font-size:17px;cursor:pointer;user-select:none;-webkit-user-select:none}
.fc-on .pad div:active{background:rgba(43,35,64,.25)}
.fc-on .pad .del{grid-column:span 2;background:#ffd8d8}
.fc-on .teams{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:6px 0;text-align:left}
.fc-on .team{border-radius:14px;padding:6px 10px 8px;background:rgba(43,35,64,.06)}
.fc-on .team h3{margin:0 0 4px;font-size:13px;font-weight:900;letter-spacing:.5px}
.fc-on .who{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:800;padding:2px 0;min-width:0}
.fc-on .who b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fc-on .who small{font-size:11px;font-weight:800;color:rgba(43,35,64,.55);white-space:nowrap}
.fc-on .who .you{padding:0 6px;border-radius:999px;background:#ffd166;font-size:10px;font-weight:900}
.fc-on .cpus{font-size:11px;font-weight:800;color:rgba(43,35,64,.5);margin-top:2px}
.fc-on .rules{display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;align-items:center;margin:6px 0}
.fc-on .rules .fc-group label{font-size:10px}
.fc-on .wpick{display:flex;align-items:center;gap:6px;font-weight:900;font-size:14px}
.fc-on .wpick .arw{pointer-events:auto;width:30px;height:30px;border-radius:50%;background:rgba(43,35,64,.1);display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer}
.fc-on .wpick .name{min-width:110px}
.fc-on .strip{display:flex;gap:6px;overflow-x:auto;padding:4px 2px 6px;touch-action:pan-x;scrollbar-width:none}
.fc-on .strip::-webkit-scrollbar{display:none}
.fc-on .strip div{pointer-events:auto;flex:0 0 auto;padding:6px 10px;border-radius:999px;background:rgba(43,35,64,.08);border:3px solid transparent;font-weight:900;font-size:13px;cursor:pointer;white-space:nowrap}
.fc-on .strip div.on{background:#fff;border-color:${PALETTE.ink}}
.fc-on .note{font-size:12px;font-weight:800;color:rgba(43,35,64,.6);margin:4px 0}
.fc-on .wait{font-size:16px;font-weight:900;color:${PALETTE.ink};margin:8px 0 2px}
.fc-on .slow{display:inline-block;margin-top:4px;padding:2px 10px;border-radius:999px;background:#ffe3b3;font-size:11px;font-weight:900}
.fc-on .row2 .go{min-width:130px}
@media (max-height:420px){.fc-on h1{font-size:22px}.fc-on .code{font-size:30px}.fc-on .boxes i{width:38px;height:44px;font-size:24px}.fc-on .pad div{padding:5px 0;font-size:15px}.fc-on .who{font-size:13px;padding:1px 0}}
`;

let styled = false;
function style(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = CSS;
  document.head.appendChild(s);
}

function el(tag: string, cls: string, parent?: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

function button(parent: HTMLElement, text: string, cls: string, onTap: () => void, info?: string): HTMLElement {
  const b = el("div", cls, parent);
  b.textContent = text;
  if (info) el("small", "", b).textContent = info;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    sfx.pick();
    onTap();
  });
  return b;
}

/** A card over the game that keeps taps to itself. */
function card(root: HTMLElement): { card: HTMLElement; box: HTMLElement } {
  style();
  const c = el("div", "fc-card fc-on", root);
  c.addEventListener("pointerdown", (e) => e.stopPropagation());
  return { card: c, box: el("div", "box wide", c) };
}

/** A short message with one button. */
export function showMessage(root: HTMLElement, title: string, text: string, ok = "OK", onOk: () => void = () => {}): () => void {
  const { card: c, box } = card(root);
  el("h1", "sm", box).textContent = title;
  el("p", "", box).textContent = text;
  button(box, ok, "go", () => {
    c.remove();
    onOk();
  });
  return () => c.remove();
}

/** "Finding a match", "Joining", with a way out. */
export function showBusy(root: HTMLElement, text: string, onCancel: () => void): () => void {
  const { card: c, box } = card(root);
  el("h1", "sm", box).textContent = "ONLINE";
  el("div", "wait", box).textContent = text;
  button(box, "CANCEL", "go alt", () => {
    c.remove();
    onCancel();
  });
  return () => c.remove();
}

export interface MenuActions {
  quick(): void;
  make(): void;
  join(code: string): void;
  back(): void;
}

/** Quick Match, Make a Room or Join with a code. */
export function showOnlineMenu(root: HTMLElement, name: string, act: MenuActions): () => void {
  const { card: c, box } = card(root);
  const close = () => c.remove();
  el("h1", "", box).textContent = "PLAY ONLINE";
  el("div", "sub", box).textContent = `Playing as ${name}. Real players on both teams, CPUs fill the rest.`;
  const opts = el("div", "opts", box);
  button(opts, "QUICK MATCH", "go", () => (close(), act.quick()), "Join anyone who's looking for a game");
  button(opts, "MAKE A ROOM", "go alt", () => (close(), act.make()), "Get a code to share with friends");
  button(opts, "JOIN WITH A CODE", "go alt", () => {
    close();
    showCodePad(root, act.join, () => showOnlineMenu(root, name, act));
  }, "Type a friend's room code");
  button(box, "BACK", "small", () => (close(), act.back()));
  return close;
}

/** Four boxes and a letter pad (no keyboard, so nothing but a code can be typed). */
function showCodePad(root: HTMLElement, onJoin: (code: string) => void, onBack: () => void): void {
  const { card: c, box } = card(root);
  el("h1", "sm", box).textContent = "ROOM CODE";
  const boxes = el("div", "boxes", box);
  const cells = Array.from({ length: CODE_LENGTH }, () => el("i", "", boxes));
  let code = "";
  const show = () => cells.forEach((cell, i) => (cell.textContent = code[i] ?? ""));
  const pad = el("div", "pad", box);
  for (const ch of "BCDFGHJKMNPQRTVWXZ2346789") {
    const k = el("div", "", pad);
    k.textContent = ch;
    k.addEventListener("click", (e) => {
      e.stopPropagation();
      if (code.length >= CODE_LENGTH) return;
      sfx.pick();
      code += ch;
      show();
    });
  }
  const del = el("div", "del", pad);
  del.textContent = "⌫";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    code = code.slice(0, -1);
    show();
  });
  const row = el("div", "row2", box);
  button(row, "BACK", "go alt", () => (c.remove(), onBack()));
  button(row, "JOIN", "go", () => {
    const clean = cleanCode(code);
    if (!clean) return;
    c.remove();
    onJoin(clean);
  });
}

export interface RoomActions {
  pick(p: Picks): void;
  rules(r: Rules): void;
  start(): void;
  leave(): void;
}

export interface RoomScreen {
  update(state: RoomState): void;
  close(): void;
}

const MODES: Array<[Mode, string]> = [
  ["capture", "CAPTURE"],
  ["hoard", "HOARD"],
  ["playful", "PLAYFUL"],
];
const SKILLS: Array<[Difficulty, string]> = [
  ["easy", "EASY"],
  ["medium", "MEDIUM"],
  ["hard", "HARD"],
];

/**
 * The room you wait in: who's on each team, your animal and role, and (for the host) the world, mode and CPU skill
 * and the Start button. `open` says which animals, worlds and modes you have unlocked.
 */
export function showRoom(root: HTMLElement, picks: Picks, open: ReadonlySet<string>, act: RoomActions): RoomScreen {
  const { card: c, box } = card(root);
  const head = el("h1", "sm", box);
  const sub = el("div", "sub", box);
  const codeLine = el("div", "code", box);
  const teams = el("div", "teams", box);
  const rulesRow = el("div", "rules", box);
  const strip = el("div", "strip", box);
  const roleRow = el("div", "rules", box);
  const wait = el("div", "wait", box);
  const slow = el("div", "slow", box);
  const row = el("div", "row2", box);
  button(row, "LEAVE", "go alt", () => act.leave());
  const startBtn = button(row, "START", "go", () => act.start());
  el("div", "note", box).textContent = "Only usernames are shown. There's no chat.";

  let mine = { ...picks };
  const tiles = new Map<string, HTMLElement>();
  for (const id of ANIMAL_IDS) {
    if (!open.has(id)) continue;
    const t = el("div", "", strip);
    t.textContent = ANIMALS[id].name;
    t.addEventListener("click", (e) => {
      e.stopPropagation();
      sfx.pick();
      mine = { ...mine, animal: id };
      tiles.forEach((n, k) => n.classList.toggle("on", k === id));
      act.pick(mine);
    });
    tiles.set(id, t);
  }
  tiles.forEach((n, k) => n.classList.toggle("on", k === mine.animal));
  tiles.get(mine.animal)?.scrollIntoView({ inline: "center", block: "nearest" });
  const roles = el("div", "fc-seg", roleRow);
  const roleBtns: Array<[boolean, HTMLElement]> = [];
  for (const [medic, name] of [
    [false, "RUNNER"],
    [true, "MEDIC"],
  ] as const) {
    const b = el("div", "fc-size", roles);
    b.textContent = name;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      sfx.pick();
      mine = { ...mine, medic };
      roleBtns.forEach(([k, n]) => n.classList.toggle("on", k === medic));
      act.pick(mine);
    });
    roleBtns.push([medic, b]);
  }
  roleBtns.forEach(([k, n]) => n.classList.toggle("on", k === mine.medic));

  let rules: Rules | null = null;
  let builtFor = "";
  const buildRules = (state: RoomState) => {
    const key = `${state.host}:${state.rules.world}:${state.rules.mode}:${state.rules.difficulty}`;
    if (key === builtFor) return;
    builtFor = key;
    rules = { ...state.rules };
    rulesRow.textContent = "";
    if (!state.host) {
      const w = worldById(state.rules.world);
      const mode = MODES.find(([m]) => m === state.rules.mode)?.[1] ?? "CAPTURE";
      el("div", "wait", rulesRow).textContent = `${w.name.toUpperCase()} · ${mode} · CPUS ${state.rules.difficulty.toUpperCase()}`;
      return;
    }
    const wg = el("div", "fc-group", rulesRow);
    el("label", "", wg).textContent = "WORLD";
    const wp = el("div", "wpick", wg);
    const worlds = WORLDS.filter((w) => open.has(w.id));
    const stepWorld = (d: number) => {
      const i = Math.max(0, worlds.findIndex((w) => w.id === rules!.world));
      act.rules({ ...rules!, world: worlds[(i + d + worlds.length) % worlds.length].id });
    };
    button(wp, "‹", "arw", () => stepWorld(-1));
    el("div", "name", wp).textContent = worldById(state.rules.world).name.toUpperCase();
    button(wp, "›", "arw", () => stepWorld(1));
    const seg = (label: string, list: Array<[string, string]>, cur: string, set: (v: string) => void) => {
      const g = el("div", "fc-group", rulesRow);
      el("label", "", g).textContent = label;
      const s = el("div", "fc-seg", g);
      for (const [v, name] of list) {
        if (label === "MODE" && !open.has(v)) continue;
        const b = el("div", "fc-size", s);
        b.textContent = name;
        b.classList.toggle("on", v === cur);
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          sfx.pick();
          set(v);
        });
      }
    };
    seg("MODE", MODES, state.rules.mode, (v) => act.rules({ ...rules!, mode: v as Mode }));
    seg("CPUS", SKILLS, state.rules.difficulty, (v) => act.rules({ ...rules!, difficulty: v as Difficulty }));
  };

  const who = (parent: HTMLElement, m: Member) => {
    const r = el("div", "who", parent);
    if (m.host) el("small", "", r).textContent = "★";
    el("b", "", r).textContent = m.name;
    el("small", "", r).textContent = `${ANIMALS[m.animal]?.name ?? ""}${m.medic ? " · MEDIC" : ""}`;
    if (m.you) el("span", "you", r).textContent = "YOU";
  };

  return {
    update(state) {
      head.textContent = state.open ? "QUICK MATCH" : "YOUR ROOM";
      sub.textContent = state.open ? "Waiting for players. CPUs fill any empty spots." : "Friends tap Join with a Code and type:";
      codeLine.style.display = state.open ? "none" : "block";
      codeLine.textContent = state.code;
      teams.textContent = "";
      // Your own team is always Blue on your screen.
      const myTeam = state.members.find((m) => m.you)?.team ?? 0;
      for (const side of [myTeam, myTeam === 0 ? 1 : 0] as const) {
        const col = el("div", "team", teams);
        const shown = side === myTeam ? TEAMS[0] : TEAMS[1];
        const h = el("h3", "", col);
        h.textContent = side === myTeam ? `${shown.name.toUpperCase()} (YOURS)` : shown.name.toUpperCase();
        h.style.color = shown.color;
        const on = state.members.filter((m) => m.team === side).sort((a, b) => a.slot - b.slot);
        on.forEach((m) => who(col, m));
        el("div", "cpus", col).textContent = `+ ${ONLINE_PER_TEAM - on.length} CPUs`;
      }
      buildRules(state);
      if (state.playing) wait.textContent = "Match in progress…";
      else if (state.autoIn !== null) wait.textContent = `Starting in ${state.autoIn}…`;
      else if (state.host) wait.textContent = state.members.length > 1 ? "Tap Start when everyone's in." : "Waiting for friends… or start with CPUs.";
      else wait.textContent = "Waiting for the host to start…";
      startBtn.style.display = state.host ? "inline-block" : "none";
      slow.style.display = state.slow ? "inline-block" : "none";
      slow.textContent = "A slow link: some players are connected through the site";
    },
    close() {
      c.remove();
    },
  };
}
