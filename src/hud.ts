/**
 * Everything drawn over the 3D view: the title screen, score bar, timer,
 * which land you are in, minimap, thumb buttons, the stick ring, call outs,
 * the pick your animal screen, the 3, 2, 1, GO! countdown, the pause menu,
 * Settings, How to play and the results card.
 * Big, soft and tucked into the corners so the middle stays clear.
 */
import { ANIMALS, ANIMAL_IDS, type AnimalDef } from "./animals";
import type { Controls } from "./input";
import { FLAG_FREE, ME_GLOW, PALETTE, TEAMS } from "./palette";
import { music, sfx } from "./audio";
import { type Settings, onSettings, setSetting, settings } from "./settings";
import { announce } from "./voice";
import { type Difficulty, HOARD_TARGET, ITEMS, type ItemKind, type Match, type Mode, nearestBase, tune } from "./sim";
import { type Award, type Progress, UNLOCKS, costOf, nextUnlock } from "./progress";
import { MAPS, type MapDef, WORLD_HALF_X, WORLD_HALF_Z, currentWorld, groundHeight, landOf, onBridge } from "./terrain";
import { WORLDS, type WorldDef, worldById } from "./worlds";

const MAP_W = 156;
const MAP_H = Math.round((MAP_W * WORLD_HALF_X) / WORLD_HALF_Z);

const CSS = `
.fc-hud{position:fixed;inset:0;pointer-events:none;font-family:ui-rounded,"SF Pro Rounded","Nunito","Trebuchet MS",system-ui,sans-serif;color:${PALETTE.ink};-webkit-font-smoothing:antialiased}
.fc-hud *{box-sizing:border-box}
.fc-top{position:absolute;top:max(10px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px}
.fc-team{display:flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;font-weight:800;font-size:20px;color:#fff;box-shadow:0 3px 0 rgba(43,35,64,.25)}
.fc-team .ic{width:18px;height:18px;border-radius:50%;background:#fff}
.fc-team.moon .ic{background:transparent;box-shadow:inset -6px -2px 0 0 #fff}
.fc-timer{min-width:74px;text-align:center;padding:6px 12px;border-radius:14px;background:rgba(255,255,255,.88);font-weight:800;font-size:20px;box-shadow:0 3px 0 rgba(43,35,64,.18)}
.fc-timer.low{color:#e8455b}
.fc-team,.fc-timer{transition:transform .2s}
.bump{animation:fcbump .45s cubic-bezier(.3,1.8,.5,1)}
@keyframes fcbump{0%{transform:scale(1)}35%{transform:scale(1.28)}100%{transform:scale(1)}}
.fc-map{position:absolute;top:max(10px,env(safe-area-inset-top));right:max(10px,env(safe-area-inset-right));width:${MAP_W}px;height:${MAP_H}px;border-radius:14px;background:rgba(255,255,255,.55);box-shadow:0 3px 0 rgba(43,35,64,.18)}
.fc-zone{position:absolute;top:calc(max(10px,env(safe-area-inset-top)) + 44px);left:50%;transform:translateX(-50%);padding:3px 12px;border-radius:999px;font-weight:800;font-size:12px;letter-spacing:1px;color:#fff;background:rgba(43,35,64,.45);white-space:nowrap}
.fc-btn{position:absolute;pointer-events:auto;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;letter-spacing:.5px;user-select:none;-webkit-user-select:none;touch-action:none;box-shadow:0 5px 0 rgba(43,35,64,.28);border:3px solid rgba(255,255,255,.75);opacity:.88}
.fc-btn.down{transform:translateY(3px);box-shadow:0 2px 0 rgba(43,35,64,.28);opacity:1}
.fc-jump{width:96px;height:96px;right:max(22px,calc(env(safe-area-inset-right) + 12px));bottom:max(22px,env(safe-area-inset-bottom));background:#46b4e8;font-size:17px}
.fc-throw{width:78px;height:78px;right:max(132px,calc(env(safe-area-inset-right) + 122px));bottom:max(30px,env(safe-area-inset-bottom));background:#ff6b5b;font-size:15px}
.fc-dive{width:66px;height:66px;right:max(140px,calc(env(safe-area-inset-right) + 130px));bottom:max(128px,calc(env(safe-area-inset-bottom) + 118px));background:#2fb5b0;font-size:13px;display:none}
.fc-item{width:64px;height:64px;right:max(46px,calc(env(safe-area-inset-right) + 36px));bottom:max(130px,calc(env(safe-area-inset-bottom) + 120px));background:rgba(150,150,170,.55);font-size:10px;text-align:center;line-height:1.05;padding:4px;box-sizing:border-box}
.fc-item.has{background:linear-gradient(135deg,#ff6b9a,#ffb347);opacity:1;animation:fcglow 1.2s ease-in-out infinite}
@keyframes fcglow{50%{box-shadow:0 5px 0 rgba(43,35,64,.28),0 0 18px 4px rgba(255,209,102,.9)}}
.fc-medic{width:64px;height:64px;right:max(222px,calc(env(safe-area-inset-right) + 212px));bottom:max(36px,calc(env(safe-area-inset-bottom) + 26px));background:#3cbf7a;font-size:11px;text-align:center;line-height:1.05;flex-direction:column;display:none}
.fc-medic b{font-size:20px;line-height:1}
.fc-hearts{position:absolute;top:calc(max(10px,env(safe-area-inset-top)) + 42px);left:max(10px,env(safe-area-inset-left));display:flex;gap:3px;font-size:20px;line-height:1;filter:drop-shadow(0 2px 0 rgba(43,35,64,.25))}
.fc-hearts i{font-style:normal;color:#e8455b;transition:transform .15s}
.fc-hearts i.gone{color:rgba(43,35,64,.25);transform:scale(.8)}
.fc-out{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);padding:10px 22px;border-radius:18px;background:rgba(43,35,64,.72);color:#fff;font-weight:900;font-size:22px;text-align:center;display:none;white-space:nowrap}
.fc-out small{display:block;font-size:13px;font-weight:700;opacity:.8}
.fc-power{position:absolute;top:calc(max(10px,env(safe-area-inset-top)) + 108px);left:50%;transform:translateX(-50%);padding:3px 12px;border-radius:999px;font-weight:900;font-size:13px;letter-spacing:1px;color:#fff;background:#ff6b9a;display:none;white-space:nowrap}
.fc-stick{position:absolute;width:128px;height:128px;margin:-64px 0 0 -64px;border-radius:50%;border:3px solid rgba(255,255,255,.7);background:rgba(255,255,255,.14);display:none}
.fc-knob{position:absolute;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.85);box-shadow:0 3px 0 rgba(43,35,64,.2);display:none}
.fc-hint{position:absolute;left:max(18px,env(safe-area-inset-left));bottom:max(18px,env(safe-area-inset-bottom));font-weight:700;font-size:13px;color:rgba(43,35,64,.55)}
.fc-arrow{position:absolute;top:calc(max(10px,env(safe-area-inset-top)) + 72px);left:50%;width:34px;height:34px;margin-left:-17px;display:flex;align-items:center;justify-content:center}
.fc-arrow i{width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:22px solid ${FLAG_FREE};filter:drop-shadow(0 2px 0 rgba(43,35,64,.3))}
.fc-call{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%) scale(.6);font-weight:900;font-size:44px;color:#fff;-webkit-text-stroke:2px ${PALETTE.ink};paint-order:stroke fill;opacity:0;transition:transform .18s cubic-bezier(.3,1.6,.5,1),opacity .18s;white-space:nowrap}
.fc-call.show{transform:translate(-50%,-50%) scale(1);opacity:1}
.fc-top-left{position:absolute;top:max(10px,env(safe-area-inset-top));left:max(10px,env(safe-area-inset-left));display:flex;gap:6px;pointer-events:auto}
.fc-chip{padding:8px 12px;border-radius:12px;background:rgba(255,255,255,.82);font-weight:800;font-size:12px;border:2px solid transparent;box-shadow:0 2px 0 rgba(43,35,64,.15)}
.fc-chip.on{border-color:${PALETTE.ink}}
.fc-card{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(124,196,242,.55);pointer-events:auto;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.fc-card .box{background:#fffaf0;border-radius:24px;padding:20px 28px;text-align:center;box-shadow:0 6px 0 rgba(43,35,64,.25);max-width:min(560px,90vw)}
.fc-card h1{margin:0 0 4px;font-size:40px;font-weight:900;letter-spacing:1px;color:#ffd166;-webkit-text-stroke:2px ${PALETTE.ink};paint-order:stroke fill}
.fc-card p{margin:6px 0;font-size:15px;font-weight:700;color:rgba(43,35,64,.75)}
.fc-card .go{margin-top:12px;display:inline-block;padding:12px 30px;border-radius:999px;background:#46b4e8;color:#fff;font-weight:900;font-size:20px;box-shadow:0 5px 0 rgba(43,35,64,.28)}
.fc-rotate{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:#7cc4f2;pointer-events:auto;font-weight:800;font-size:20px;color:#fff;text-align:center;padding:24px}
.fc-rotate .phone{width:46px;height:78px;border:5px solid #fff;border-radius:10px;animation:fcrot 1.6s ease-in-out infinite}
@keyframes fcrot{0%,20%{transform:rotate(0)}50%,80%{transform:rotate(-90deg)}100%{transform:rotate(0)}}
@media (orientation:portrait){.fc-rotate{display:flex}}
.fc-menu .fc-stick,.fc-menu .fc-knob{display:none!important}
.fc-menu .fc-top,.fc-menu .fc-map,.fc-menu .fc-zone,.fc-menu .fc-btn,.fc-menu .fc-arrow,.fc-menu .fc-hint,.fc-menu .fc-power,.fc-menu .fc-hearts,.fc-menu .fc-out{display:none!important}
.fc-sel{position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:8px;padding:max(10px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}
.fc-sel h2{flex:none;margin:0;text-align:center;font-size:30px;line-height:1.05;font-weight:900;letter-spacing:1px;color:#fff;-webkit-text-stroke:2px ${PALETTE.ink};paint-order:stroke fill}
.fc-logo{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:0 10px;font-size:38px!important;letter-spacing:2px!important;animation:fclogo 3s ease-in-out infinite}
.fc-logo .a{color:${TEAMS[0].color}}
.fc-logo .b{color:${TEAMS[1].color}}
.fc-logo .flag{position:relative;width:26px;height:34px}
.fc-logo .flag::before{content:"";position:absolute;left:3px;top:2px;width:5px;height:32px;border-radius:3px;background:#fff;box-shadow:0 0 0 2px ${PALETTE.ink}}
.fc-logo .flag::after{content:"";position:absolute;left:8px;top:3px;border-top:9px solid transparent;border-bottom:9px solid transparent;border-left:18px solid ${FLAG_FREE};filter:drop-shadow(1px 1px 0 ${PALETTE.ink})}
.fc-logo small{flex-basis:100%}
@keyframes fclogo{50%{transform:translateY(-3px) rotate(-1deg)}}
.fc-sel h2 small{display:block;margin-top:2px;font-size:13px;letter-spacing:0;-webkit-text-stroke:0;color:rgba(43,35,64,.75)}
.fc-setup{flex:none;pointer-events:auto;display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-end;gap:8px 14px;padding:6px 12px 8px;border-radius:20px;background:rgba(255,250,240,.82);box-shadow:0 4px 0 rgba(43,35,64,.18)}
.fc-group{display:flex;flex-direction:column;align-items:center;gap:3px}
.fc-group>label{font-size:10px;font-weight:900;letter-spacing:1px;color:rgba(43,35,64,.55)}
.fc-seg{display:flex;gap:4px;padding:3px;border-radius:999px;background:rgba(43,35,64,.1)}
.fc-mode,.fc-size{pointer-events:auto;min-height:40px;min-width:64px;padding:4px 14px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:999px;background:transparent;border:3px solid transparent;font-weight:900;font-size:15px;line-height:1.05;text-align:center;color:${PALETTE.ink};cursor:pointer;-webkit-tap-highlight-color:transparent}
.fc-mode small,.fc-size small{display:block;margin-top:1px;font-size:9px;font-weight:800;letter-spacing:.4px;color:rgba(43,35,64,.6)}
.fc-size.big small{color:#e8455b}
.fc-mode.on,.fc-size.on{background:#fffaf0;border-color:${PALETTE.ink};box-shadow:0 2px 0 rgba(43,35,64,.2)}
.fc-setup{max-width:min(760px,100%)}
@media (max-height:420px){.fc-sel{gap:6px}.fc-sel h2{font-size:22px}.fc-logo{font-size:28px!important}.fc-logo .flag{transform:scale(.8)}.fc-sel h2 small{display:none}.fc-mode,.fc-size{min-height:36px;padding:3px 11px;font-size:14px}.fc-setup{padding:4px 10px 6px;gap:4px 12px}}
@media (max-height:350px){.fc-sel h2{display:none}.fc-tile .perk{display:none}}
.fc-timer.goal{font-size:13px;line-height:1.1;padding:5px 10px}
.fc-row{flex:none;margin-top:auto;max-width:100%;display:flex;justify-content:center;align-items:flex-end;gap:8px}
.fc-tiles{pointer-events:auto;display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;touch-action:pan-x;padding:10px 4px 6px;min-width:0;flex:0 1 auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.fc-tiles::-webkit-scrollbar{display:none}
.fc-tile{pointer-events:auto;flex:0 0 auto;width:min(118px,17vw);padding:8px 9px 9px;border-radius:16px;background:rgba(255,250,240,.94);border:3px solid transparent;box-shadow:0 4px 0 rgba(43,35,64,.22);text-align:left;transition:transform .15s}
.fc-tile.on{border-color:${PALETTE.ink};transform:translateY(-6px)}
.fc-tile b{display:block;font-size:14px;font-weight:900;line-height:1.1}
.fc-tile .cls{display:inline-block;margin:3px 0 4px;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:900;color:#fff;letter-spacing:.5px}
.fc-tile .bar{display:flex;align-items:center;gap:5px;font-size:9px;font-weight:800;color:rgba(43,35,64,.6);margin-top:2px}
.fc-tile .bar span{width:30px}
.fc-tile .bar i{flex:1;height:6px;border-radius:3px;background:rgba(43,35,64,.12);overflow:hidden}
.fc-tile .bar i u{display:block;height:100%;border-radius:3px}
.fc-tile .perk{margin-top:5px;font-size:10px;font-weight:700;line-height:1.2;color:rgba(43,35,64,.75)}
.fc-play{pointer-events:auto;flex:0 0 auto;align-self:center;margin-left:6px;padding:16px 24px;border-radius:999px;background:#46b4e8;color:#fff;font-weight:900;font-size:22px;box-shadow:0 5px 0 rgba(43,35,64,.28);border:3px solid rgba(255,255,255,.8)}
.fc-count{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%) scale(.4);font-weight:900;font-size:120px;color:#fff;-webkit-text-stroke:4px ${PALETTE.ink};paint-order:stroke fill;opacity:0;pointer-events:none}
.fc-count.show{animation:fcpop .8s cubic-bezier(.3,1.6,.5,1) forwards}
@keyframes fcpop{0%{transform:translate(-50%,-50%) scale(.4);opacity:0}25%{transform:translate(-50%,-50%) scale(1.08);opacity:1}70%{transform:translate(-50%,-50%) scale(1);opacity:1}100%{transform:translate(-50%,-50%) scale(1.25);opacity:0}}
.fc-card .row2{display:flex;gap:10px;justify-content:center}
.fc-results .box{animation:fcin .45s cubic-bezier(.3,1.5,.5,1)}
@keyframes fcin{0%{transform:scale(.7) translateY(30px);opacity:0}100%{transform:none;opacity:1}}
.fc-board{display:flex;align-items:center;justify-content:center;gap:10px;margin:8px 0 6px}
.fc-pill{min-width:96px;padding:6px 14px 8px;border-radius:18px;color:#fff;box-shadow:0 4px 0 rgba(43,35,64,.25)}
.fc-pill small{display:block;font-size:10px;font-weight:900;letter-spacing:1px;opacity:.9}
.fc-pill b{display:block;font-size:34px;font-weight:900;line-height:1}
.fc-vs{font-size:11px;font-weight:900;letter-spacing:1px;color:rgba(43,35,64,.5)}
.fc-stats{display:flex;justify-content:center;gap:6px;margin:6px 0 2px}
.fc-stats div{min-width:58px;padding:5px 6px;border-radius:12px;background:rgba(43,35,64,.07)}
.fc-stats b{display:block;font-size:20px;font-weight:900;line-height:1.1}
.fc-stats small{display:block;font-size:9px;font-weight:900;letter-spacing:.6px;color:rgba(43,35,64,.55)}
@media (max-height:380px){.fc-card .box{padding:10px 18px}.fc-card h1{font-size:30px}.fc-pill b{font-size:26px}.fc-stats b{font-size:16px}.fc-card .go{margin-top:6px;padding:9px 22px;font-size:17px}}
.fc-card .go.alt{background:#ff8a4c}
.fc-tune{display:none;margin-top:8px;text-align:left;font-size:11px;font-weight:700;max-height:34vh;overflow:auto}
.fc-set{display:flex;align-items:center;gap:10px;margin:10px 0 4px;font-weight:800;font-size:15px}
.fc-set span{font-size:12px;color:rgba(43,35,64,.6)}
.fc-set input{flex:1;min-width:180px;height:28px}
.fc-card .small{margin-top:6px;display:inline-block;padding:6px 14px;border-radius:999px;background:rgba(43,35,64,.1);font-weight:800;font-size:13px}
.fc-tune label{display:flex;justify-content:space-between;gap:8px;align-items:center}
.fc-tune input{width:110px}
.fc-pts{flex:none;padding:3px 12px;border-radius:999px;background:rgba(43,35,64,.55);color:#fff;font-size:12px;font-weight:900;letter-spacing:.3px}
.fc-pts b{color:#ffd166}
.fc-world{display:flex;align-items:center;gap:4px;padding:3px;border-radius:999px;background:rgba(43,35,64,.1)}
.fc-world .arw{pointer-events:auto;width:34px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:999px;font-weight:900;font-size:20px;color:${PALETTE.ink};cursor:pointer;-webkit-tap-highlight-color:transparent}
.fc-world .name{min-width:132px;min-height:40px;padding:3px 10px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:999px;background:#fffaf0;border:3px solid ${PALETTE.ink};font-weight:900;font-size:15px;line-height:1.05;text-align:center}
.fc-world .name small{display:block;margin-top:1px;font-size:9px;font-weight:800;letter-spacing:.3px;color:rgba(43,35,64,.6)}
.fc-world .name.locked{background:#e9e4ee;color:rgba(43,35,64,.55)}
.fc-mode.locked,.fc-size.locked{opacity:.45}
.fc-tile{position:relative}
.fc-tile.locked{background:rgba(233,228,238,.94)}
.fc-tile.locked>*{opacity:.4}
.fc-tile .lock{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);opacity:1!important;padding:5px 10px;border-radius:999px;background:${PALETTE.ink};color:#fff;font-size:11px;font-weight:900;white-space:nowrap}
.fc-play.locked{background:#9a93a8}
.shake{animation:fcshake .35s}
@keyframes fcshake{20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
.fc-earn{margin:6px 0 0;font-weight:900;font-size:15px}
.fc-earn b{color:#e8a700}
.fc-new{display:inline-block;margin:4px 3px 0;padding:3px 10px;border-radius:999px;background:#7ee36b;color:#fff;font-size:12px;font-weight:900;-webkit-text-stroke:0;box-shadow:0 2px 0 rgba(43,35,64,.2)}
@media (max-height:420px){.fc-world .arw{height:36px;width:30px}.fc-world .name{min-height:36px;min-width:120px;font-size:14px}}
.fc-pad{position:absolute;inset:0;pointer-events:none}
.fc-left .fc-pad{transform:scaleX(-1)}
.fc-left .fc-pad .fc-btn{transform:scaleX(-1)}
.fc-left .fc-pad .fc-btn.down{transform:scaleX(-1) translateY(3px)}
.fc-big .fc-jump{width:114px;height:114px;right:max(16px,calc(env(safe-area-inset-right) + 6px));bottom:max(16px,env(safe-area-inset-bottom));font-size:19px}
.fc-big .fc-throw{width:92px;height:92px;right:max(142px,calc(env(safe-area-inset-right) + 132px));bottom:max(26px,env(safe-area-inset-bottom));font-size:17px}
.fc-big .fc-item{width:76px;height:76px;right:max(36px,calc(env(safe-area-inset-right) + 26px));bottom:max(142px,calc(env(safe-area-inset-bottom) + 132px));font-size:11px}
.fc-big .fc-dive{width:78px;height:78px;right:max(150px,calc(env(safe-area-inset-right) + 140px));bottom:max(136px,calc(env(safe-area-inset-bottom) + 126px));font-size:15px}
.fc-big .fc-medic{width:74px;height:74px;right:max(248px,calc(env(safe-area-inset-right) + 238px));bottom:max(30px,calc(env(safe-area-inset-bottom) + 20px))}
.fc-left .fc-hint{left:auto;right:max(18px,env(safe-area-inset-right))}
.fc-menu .fc-pause,.fc-pause.hide{display:none!important}
.fc-pause{width:44px;height:40px;display:flex;align-items:center;justify-content:center;gap:5px;padding:0!important}
.fc-pause i{width:6px;height:16px;border-radius:2px;background:${PALETTE.ink}}
.fc-top-left{z-index:2}
.fc-hearts{top:calc(max(10px,env(safe-area-inset-top)) + 48px)}
.fc-card .box{max-height:calc(100% - 16px);overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y}
.fc-card .box.wide{max-width:min(720px,94vw);width:min(720px,94vw)}
.fc-card h1.sm{font-size:28px}
.fc-menu-list{display:flex;flex-direction:column;align-items:stretch;gap:8px;margin-top:8px;min-width:220px}
.fc-menu-list .go{margin-top:0}
.fc-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;text-align:left}
@media (max-width:560px){.fc-grid{grid-template-columns:1fr}}
.fc-grid h3{grid-column:1/-1;margin:8px 0 0;font-size:11px;font-weight:900;letter-spacing:1px;color:rgba(43,35,64,.5)}
.fc-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:40px;font-weight:800;font-size:14px}
.fc-opt input[type=range]{flex:1;max-width:170px;height:28px;accent-color:#46b4e8}
.fc-opt .fc-seg{flex:none}
.fc-opt .seg{pointer-events:auto;padding:6px 10px;border-radius:999px;font-weight:900;font-size:11px;letter-spacing:.3px;border:2px solid transparent;cursor:pointer}
.fc-opt .seg.on{background:#fffaf0;border-color:${PALETTE.ink}}
.fc-tog{pointer-events:auto;position:relative;flex:none;width:52px;height:30px;border-radius:999px;background:rgba(43,35,64,.2);transition:background .15s;cursor:pointer}
.fc-tog::after{content:"";position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 0 rgba(43,35,64,.2);transition:transform .15s}
.fc-tog.on{background:#3cbf7a}
.fc-tog.on::after{transform:translateX(22px)}
.fc-title{position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:max(10px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
.fc-title .fc-logo{margin:0;font-size:64px!important;line-height:1;font-weight:900;color:#fff;-webkit-text-stroke:3px ${PALETTE.ink};paint-order:stroke fill}
.fc-title .fc-logo .flag{transform:scale(1.5);margin:0 10px}
.fc-title .tag{font-weight:900;font-size:15px;color:#fff;-webkit-text-stroke:0;padding:4px 14px;border-radius:999px;background:rgba(43,35,64,.5)}
.fc-title .big{pointer-events:auto;padding:14px 64px;border-radius:999px;background:#46b4e8;color:#fff;font-weight:900;font-size:30px;letter-spacing:1px;box-shadow:0 6px 0 rgba(43,35,64,.3);border:4px solid rgba(255,255,255,.85);animation:fcbreath 1.8s ease-in-out infinite;cursor:pointer}
@keyframes fcbreath{50%{transform:scale(1.05)}}
.fc-title .row3{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}
.fc-title .chip{pointer-events:auto;padding:9px 16px;border-radius:999px;background:rgba(255,250,240,.92);font-weight:900;font-size:14px;box-shadow:0 3px 0 rgba(43,35,64,.2);cursor:pointer}
.fc-title .chip.hot{background:#ffd166}
.fc-title .foot{position:absolute;bottom:max(8px,env(safe-area-inset-bottom));font-size:11px;font-weight:800;color:rgba(43,35,64,.55)}
.fc-title.out{animation:fcout .3s ease-in forwards}
@keyframes fcout{to{opacity:0;transform:scale(1.08)}}
@media (max-height:360px){.fc-title{gap:6px}.fc-title .fc-logo{font-size:44px!important}.fc-title .fc-logo .flag{transform:scale(1.1)}.fc-title .big{padding:10px 48px;font-size:24px}.fc-title .tag{font-size:12px}}
.fc-how{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0}
@media (max-width:560px){.fc-how{grid-template-columns:repeat(2,1fr)}}
.fc-how div{padding:8px;border-radius:14px;background:rgba(43,35,64,.06);font-size:12px;font-weight:700;line-height:1.25;color:rgba(43,35,64,.8)}
.fc-how b{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:26px;margin-bottom:4px;padding:0 8px;border-radius:999px;color:#fff;font-size:11px;font-weight:900}
.fc-steps{text-align:left;margin:8px auto;padding-left:22px;font-size:15px;font-weight:800;line-height:1.6;max-width:360px}
.fc-back{pointer-events:auto}
.fc-vig{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .5s ease-out}
.fc-pops{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.fc-pop{position:absolute;font-weight:900;font-size:22px;-webkit-text-stroke:2px ${PALETTE.ink};paint-order:stroke fill;white-space:nowrap;animation:fcfloat 1s ease-out forwards}
@keyframes fcfloat{0%{transform:translate(-50%,-30%) scale(.5);opacity:0}20%{transform:translate(-50%,-80%) scale(1.15);opacity:1}100%{transform:translate(-50%,-220%) scale(1);opacity:0}}
.fc-results .fc-stats b,.fc-results .fc-pill b{font-variant-numeric:tabular-nums}
.fc-results h1{animation:fcwiggle 1.2s ease-in-out .4s 2}
@keyframes fcwiggle{25%{transform:rotate(-4deg) scale(1.06)}75%{transform:rotate(4deg) scale(1.06)}}
.fc-next{margin:6px auto 0;max-width:340px}
.fc-next small{display:block;font-size:10px;font-weight:900;letter-spacing:.5px;color:rgba(43,35,64,.6)}
.fc-next i{display:block;height:10px;margin-top:3px;border-radius:5px;background:rgba(43,35,64,.12);overflow:hidden}
.fc-next u{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#ffd166,#ff9f1c);transition:width 1s cubic-bezier(.3,1,.5,1)}
@media (max-height:380px){.fc-menu-list{flex-direction:row;flex-wrap:wrap;justify-content:center}.fc-card h1.sm{font-size:22px}.fc-how div{padding:6px;font-size:11px}}
@media (max-height:300px){.fc-mode small,.fc-size small,.fc-world .name small{display:none}.fc-mode,.fc-size{min-height:30px;padding:2px 10px;font-size:13px}.fc-world .name{min-height:30px}.fc-world .arw{height:30px}.fc-tile .bar{display:none}.fc-tiles{padding-top:6px}.fc-play{padding:10px 18px;font-size:18px}}
@media (max-height:260px){.fc-group>label{display:none}.fc-pts{display:none}}
`;

export interface Hud {
  update(m: Match, controls: Controls, camYaw: number): void;
  call(text: string, color?: string): void;
  /** Pick your animal, mode and team size. onPick fires on every tap so the 3D preview can swap. */
  showSelect(
    current: string,
    setup: MatchSetup,
    progress: SelectInfo,
    onPick: (id: string) => void,
    onPlay: (setup: MatchSetup) => void,
    onWorld: (id: string) => void,
    onBack: () => void,
  ): void;
  /** The title screen: PLAY, How to play, Settings and Full screen. */
  showTitle(points: number, onPlay: () => void): void;
  /** Open the pause menu (a tap on the pause button, or the app going to the background). */
  pause(): void;
  /** What Restart and Quit to menu do. */
  setPauseActions(actions: PauseActions): void;
  /** A soft colored glow round the screen edges. */
  flash(color: string, strength?: number): void;
  /** Text that floats up from a point on the screen, like +10 over your head. */
  floatText(x: number, y: number, text: string, color?: string): void;
  /** 3, 2, 1, GO! then onDone. */
  countdown(onDone: () => void): void;
  showResults(m: Match, stats: MatchStats, award: Award | null, onAgain: () => void, onChange: () => void, progress?: Progress): void;
  /** True while the pause menu or a card over it is open; the match waits. */
  readonly paused: boolean;
  /** Camera distance multiplier from the Zoom setting (smaller is closer). */
  readonly camScale: number;
}

export interface PauseActions {
  restart(): void;
  quit(): void;
}

const CLASS_COLORS = { land: "#5cb85c", water: "#46b4e8", air: "#9b7be8" } as const;

/** What you did in a match, counted from its events for the results card. */
export interface MatchStats {
  steals: number;
  banks: number;
  hits: number;
  knockouts: number;
  saves: number;
  items: number;
}

/** What the start screen sets up besides the animal. */
export interface MatchSetup {
  mode: Mode;
  size: number;
  medic: boolean;
  difficulty: Difficulty;
  world: string;
}

/** Your points and what they have opened, for the start screen. */
export interface SelectInfo {
  progress: Progress;
  open: Set<string>;
}

/** A display name for anything on the unlock track. */
export function unlockName(id: string): string {
  if (ANIMALS[id]) return ANIMALS[id].name;
  if (WORLDS.some((w) => w.id === id)) return worldById(id).name;
  return id === "playful" ? "Playful mode" : id;
}

const fmt = (n: number) => n.toLocaleString("en-US");

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
  map.width = MAP_W * dpr;
  map.height = MAP_H * dpr;
  const mctx = map.getContext("2d")!;
  // Redrawn whenever a match on another map starts.
  let mapBg = drawMapBackground(MAP_W * dpr, MAP_H * dpr);
  let mapFor: MapDef | null = null;
  let mapWorld: WorldDef | null = null;

  const zone = el("div", "fc-zone", root);
  let lastLand = -2;

  const arrow = el("div", "fc-arrow", root);
  el("i", "", arrow);

  const stick = el("div", "fc-stick", root);
  const knob = el("div", "fc-knob", root);
  const hint = el("div", "fc-hint", root);
  hint.textContent = "Drag on the left to steer";

  // The thumb buttons sit on a pad that flips over for left handed play.
  const pad = el("div", "fc-pad", root);
  const jump = el("div", "fc-btn fc-jump", pad);
  jump.textContent = "JUMP";
  const thr = el("div", "fc-btn fc-throw", pad);
  thr.textContent = "THROW";
  const item = el("div", "fc-btn fc-item", pad);
  item.textContent = "ITEM";
  let shownItem: ItemKind | null | undefined;
  const power = el("div", "fc-power", root);
  // Shows only for swimmers in water; the ring drains with their breath.
  const dive = el("div", "fc-btn fc-dive", pad);
  dive.textContent = "DIVE";
  // Medics only: plant a respawn flag; the ring fills back up over 30 seconds.
  const medicBtn = el("div", "fc-btn fc-medic", pad);
  el("b", "", medicBtn).textContent = "+";
  const medicLabel = el("span", "", medicBtn);
  const hearts = el("div", "fc-hearts", root);
  const heartIcons = Array.from({ length: tune.maxHits }, () => {
    const h = el("i", "", hearts);
    h.textContent = "\u2665";
    return h;
  });
  const outCard = el("div", "fc-out", root);

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
  press(dive, () => controls.setButtonDive(true), () => controls.setButtonDive(false));
  press(item, () => (controls.itemQueued = true), () => {});
  press(medicBtn, () => (controls.plantQueued = true), () => {});

  const call = el("div", "fc-call", root);
  let callTimer = 0;

  // The pause button (and Settings inside it) waits in the top left corner.
  let paused = false;
  let pauseActions: PauseActions = { restart() {}, quit() {} };
  const tl = el("div", "fc-top-left", root);
  const pauseChip = el("div", "fc-chip fc-pause", tl);
  el("i", "", pauseChip);
  el("i", "", pauseChip);
  pauseChip.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    openPause();
  });

  /** A card over everything that swallows taps meant for the game. */
  const card = (cls = "") => {
    const c = el("div", `fc-card ${cls}`, root);
    c.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    return { card: c, box: el("div", "box", c) };
  };
  const button = (parent: HTMLElement, text: string, cls: string, onTap: () => void) => {
    const b = el("div", cls, parent);
    b.textContent = text;
    b.addEventListener("click", () => {
      sfx.pick();
      onTap();
    });
    return b;
  };

  function openPause(): void {
    if (paused || root.classList.contains("fc-menu")) return;
    paused = true;
    music.duck(true);
    const { card: c, box } = card();
    el("h1", "", box).textContent = "PAUSED";
    const list = el("div", "fc-menu-list", box);
    const close = () => {
      c.remove();
      paused = false;
      music.duck(false);
    };
    button(list, "RESUME", "go", close);
    button(list, "SETTINGS", "go alt", () => openSettings());
    button(list, "HOW TO PLAY", "go alt", () => openHow());
    const row = el("div", "row2", list);
    button(row, "RESTART", "small", () => {
      close();
      pauseActions.restart();
    });
    button(row, "QUIT TO MENU", "small", () => {
      close();
      pauseActions.quit();
    });
  }

  /** Every setting on one card: sound, view and controls. */
  function openSettings(): void {
    const wasPaused = paused;
    paused = true;
    const { card: c, box } = card();
    box.classList.add("wide");
    el("h1", "sm", box).textContent = "SETTINGS";
    const grid = el("div", "fc-grid", box);
    const head = (t: string) => (el("h3", "", grid).textContent = t);
    const row = (label: string) => {
      const r = el("div", "fc-opt", grid);
      el("span", "", r).textContent = label;
      return r;
    };
    const slider = <K extends "zoom" | "music" | "sound" | "shake">(label: string, key: K) => {
      const input = document.createElement("input");
      input.type = "range";
      input.min = "0";
      input.max = "1";
      input.step = "0.05";
      input.value = String(settings[key]);
      input.addEventListener("input", () => setSetting(key, Number(input.value)));
      input.addEventListener("change", () => sfx.pick());
      row(label).appendChild(input);
    };
    const choice = <K extends "voice" | "camTurn">(label: string, key: K, options: Array<[Settings[K], string]>) => {
      const seg = el("div", "fc-seg", row(label));
      const btns = options.map(([v, text]) => {
        const b = el("div", "seg", seg);
        b.textContent = text;
        b.addEventListener("click", () => {
          setSetting(key, v);
          btns.forEach((n, i) => n.classList.toggle("on", options[i][0] === v));
          sfx.pick();
          if (key === "voice" && v !== "off") announce("powerUp");
        });
        b.classList.toggle("on", settings[key] === v);
        return b;
      });
    };
    const toggle = <K extends "calm" | "leftHanded" | "bigButtons" | "vibrate">(label: string, key: K) => {
      const t = el("div", "fc-tog", row(label));
      t.classList.toggle("on", settings[key]);
      t.addEventListener("click", () => {
        setSetting(key, !settings[key]);
        t.classList.toggle("on", settings[key]);
        sfx.pick();
      });
    };
    head("SOUND");
    slider("Music", "music");
    slider("Sounds", "sound");
    choice("Voices", "voice", [
      ["announcer", "ALL"],
      ["chatter", "ANIMALS"],
      ["off", "OFF"],
    ]);
    head("VIEW");
    slider("Zoom", "zoom");
    choice("Camera turn", "camTurn", [
      ["slow", "SLOW"],
      ["normal", "NORMAL"],
      ["fast", "FAST"],
    ]);
    slider("Screen shake", "shake");
    toggle("Calm effects", "calm");
    head("CONTROLS");
    toggle("Left handed", "leftHanded");
    toggle("Big buttons", "bigButtons");
    if (typeof navigator.vibrate === "function") toggle("Vibration", "vibrate");
    if (new URLSearchParams(location.search).has("dev")) {
      const feelBtn = el("div", "small", box);
      feelBtn.textContent = "Feel tuning";
      const tunePanel = buildTunePanel(box);
      feelBtn.addEventListener("click", () => {
        tunePanel.style.display = tunePanel.style.display === "block" ? "none" : "block";
      });
      el("div", "", box);
    }
    button(box, "DONE", "go", () => {
      c.remove();
      paused = wasPaused;
    });
  }

  /** The rules in six tiles, matching the colors of the buttons. */
  function openHow(): void {
    const wasPaused = paused;
    paused = true;
    const { card: c, box } = card();
    box.classList.add("wide");
    el("h1", "sm", box).textContent = "HOW TO PLAY";
    const how = el("div", "fc-how", box);
    const left = settings.leftHanded ? "right" : "left";
    const tiles: Array<[string, string, string]> = [
      ["STEER", "#9b7be8", `Drag anywhere on the ${left} side and your animal heads that way.`],
      ["FLAGS", FLAG_FREE, "Grab a flag from the enemy base and bring it home to score."],
      ["THROW", "#ff6b5b", "Throw firecrackers. Three hits knock a rival out for a moment."],
      ["JUMP", "#46b4e8", "Hop over trouble. Flyers stay up while you hold it."],
      ["ITEM", "#ff6b9a", "Drive through a gift box for a power up, then tap ITEM."],
      ["DIVE", "#2fb5b0", "Swimmers can dive under the water to slip past."],
    ];
    for (const [name, color, text] of tiles) {
      const d = el("div", "", how);
      const b = el("b", "", d);
      b.textContent = name;
      b.style.background = color;
      el("div", "", d).textContent = text;
    }
    el("p", "", box).textContent = "Carrying a flag? A hit drops it. Touch your own dropped flag to send it home.";
    button(box, "GOT IT", "go", () => {
      c.remove();
      paused = wasPaused;
    });
  }

  /** Full screen where the browser allows it; on iPhone, how to add it to the Home Screen. */
  function openFullscreen(): void {
    if (requestFullscreen()) return;
    const { card: c, box } = card();
    el("h1", "sm", box).textContent = "PLAY FULL SCREEN";
    el("p", "", box).textContent = "Safari keeps its bars on web pages, but a Home Screen game has none:";
    const steps = el("ol", "fc-steps", box);
    for (const step of ["Tap the Share button in Safari", "Choose Add to Home Screen", "Open Flag Catch from your Home Screen"]) el("li", "", steps).textContent = step;
    el("p", "", box).textContent = "Your points and unlocks come along.";
    button(box, "OK", "go", () => c.remove());
  }

  // Settings that change the layout take effect at once.
  const applyLayout = () => {
    root.classList.toggle("fc-left", settings.leftHanded);
    root.classList.toggle("fc-big", settings.bigButtons);
    hint.textContent = `Drag on the ${settings.leftHanded ? "right" : "left"} to steer`;
  };
  onSettings(applyLayout);
  applyLayout();

  // A soft glow round the edges for big moments, and floating text over the action.
  const vig = el("div", "fc-vig", root);
  let vigTimer = 0;
  const pops = el("div", "fc-pops", root);

  const rotate = el("div", "fc-rotate", root);
  el("div", "phone", rotate);
  el("div", "", rotate).textContent = "Turn your phone sideways to play";

  const count = el("div", "fc-count", root);
  let shownScores: [number, number] = [0, 0];
  let shownSecond = Infinity;
  const bump = (node: HTMLElement) => {
    node.classList.remove("bump");
    void node.offsetWidth;
    node.classList.add("bump");
  };
  let hintTimer = 8;

  return {
    get paused() {
      return paused;
    },
    get camScale() {
      // Slider 0 is zoomed out, 1 is zoomed in; the middle is the default view.
      return 1.35 - settings.zoom * 0.7;
    },
    pause: openPause,
    setPauseActions(a) {
      pauseActions = a;
    },
    flash(color, strength = 1) {
      const k = Math.min(1, strength) * (settings.calm ? 0.5 : 1);
      vig.style.transition = "none";
      vig.style.boxShadow = `inset 0 0 ${Math.round(60 + 60 * k)}px ${Math.round(18 + 30 * k)}px ${color}`;
      vig.style.opacity = String(0.55 + 0.4 * k);
      vigTimer = 0.12;
    },
    floatText(x, y, text, color = "#ffd166") {
      if (pops.childElementCount > 12) pops.firstElementChild?.remove();
      const n = el("div", "fc-pop", pops);
      n.textContent = text;
      n.style.left = `${x}px`;
      n.style.top = `${y}px`;
      n.style.color = color;
      window.setTimeout(() => n.remove(), 1000);
    },
    showTitle(points, onPlay) {
      root.classList.add("fc-menu");
      const t = el("div", "fc-title", root);
      const logo = el("h2", "fc-logo", t);
      el("span", "a", logo).textContent = "FLAG";
      el("span", "flag", logo);
      el("span", "b", logo).textContent = "CATCH";
      el("div", "tag", t).textContent = points > 0 ? `★ ${fmt(points)} POINTS` : "Steal their flags and bring them home!";
      const play = el("div", "big", t);
      play.textContent = "PLAY";
      play.addEventListener("click", (e) => {
        e.stopPropagation();
        sfx.go();
        t.classList.add("out");
        window.setTimeout(() => {
          t.remove();
          onPlay();
        }, 220);
      });
      const row = el("div", "row3", t);
      button(row, "HOW TO PLAY", "chip", openHow);
      button(row, "SETTINGS", "chip", openSettings);
      if (!isFullscreen()) {
        const fs = button(row, "FULL SCREEN", "chip hot", () => {
          openFullscreen();
          if (isFullscreen()) fs.remove();
        });
      }
      el("div", "foot", t).textContent = "A TrueAIGaming.com game";
      t.addEventListener("pointerdown", (e) => e.stopPropagation());
    },
    update(m, c, camYaw) {
      scoreA.textContent = String(m.scores[0]);
      scoreB.textContent = String(m.scores[1]);
      // A score pill pops when it goes up (in Capture; Hoard ticks every second).
      if (m.mode !== "hoard") {
        if (m.scores[0] > shownScores[0]) bump(teamA);
        if (m.scores[1] > shownScores[1]) bump(teamB);
      }
      shownScores = [m.scores[0], m.scores[1]];
      if (m.mode === "hoard") {
        timer.textContent = `FIRST TO ${HOARD_TARGET}`;
        timer.classList.add("goal");
        timer.classList.toggle("low", Math.max(...m.scores) >= HOARD_TARGET * 0.9);
      } else {
        const t = Math.ceil(m.timeLeft);
        timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
        timer.classList.remove("goal");
        timer.classList.toggle("low", t <= 15);
        // The last ten seconds tick out loud.
        if (t !== shownSecond && t <= 10 && t > 0 && t < shownSecond && !m.over) {
          sfx.tick(t <= 3);
          bump(timer);
        }
        shownSecond = t;
      }

      stick.style.display = knob.style.display = c.stick.active ? "block" : "none";
      if (m.map !== mapFor || currentWorld() !== mapWorld) {
        mapFor = m.map;
        mapWorld = currentWorld();
        mapBg = drawMapBackground(MAP_W * dpr, MAP_H * dpr);
      }
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
      if (me.item !== shownItem) {
        shownItem = me.item;
        item.textContent = me.item ? ITEMS[me.item].name : "ITEM";
        item.classList.toggle("has", !!me.item);
      }
      // A pill for whatever power is running, with its seconds left.
      const running: Array<[string, number, string]> = [
        ["STAR", me.starT, "#ffb347"],
        ["SHIELD", me.shieldT, "#46b4e8"],
        ["TURBO", me.turboT, "#ff6b5b"],
      ];
      const on = running.find(([, t]) => t > 0);
      power.style.display = on ? "block" : "none";
      if (on) {
        power.textContent = `${on[0]} ${Math.ceil(on[1])}`;
        power.style.background = on[2];
      }
      heartIcons.forEach((h, i) => h.classList.toggle("gone", i >= me.hp));
      outCard.style.display = me.out > 0 ? "block" : "none";
      if (me.out > 0) outCard.innerHTML = `KNOCKED OUT<small>Back in ${Math.ceil(me.out)}</small>`;
      medicBtn.style.display = me.medic ? "flex" : "none";
      if (me.medic) {
        const ready = me.medicCd <= 0;
        const fill = Math.round((1 - me.medicCd / tune.medicCooldown) * 360);
        medicBtn.style.background = ready ? "#3cbf7a" : `conic-gradient(#3cbf7a ${fill}deg, #8fa3b8 ${fill}deg)`;
        medicLabel.textContent = ready ? "FLAG" : String(Math.ceil(me.medicCd));
        medicBtn.style.opacity = ready ? "1" : "0.75";
      }
      const canDive = me.def.dive && (me.medium === "water" || me.diving);
      dive.style.display = canDive ? "flex" : "none";
      if (canDive) {
        const left = Math.round((me.breath / tune.diveBreath) * 360);
        dive.style.background = `conic-gradient(#2fb5b0 ${left}deg, #8fa3b8 ${left}deg)`;
        dive.style.opacity = me.diveCd > 0 ? "0.5" : "";
      } else if (controls.dive) {
        controls.setButtonDive(false);
        dive.classList.remove("down");
      }
      const land = landOf(me.z);
      if (land !== lastLand) {
        zone.textContent = land === -1 ? "MIDDLE LAND" : land === me.team ? "YOUR LAND" : "ENEMY LAND";
        zone.style.background = land === -1 ? "rgba(43,35,64,.45)" : TEAMS[land].color;
        lastLand = land;
      }
      // Point home while carrying; else at the nearest flag to steal from
      // the enemy, or one of ours lying dropped that needs saving.
      let tx = NaN;
      let tz = NaN;
      let color: string = TEAMS[1].color;
      if (me.carrying >= 0) {
        const home = nearestBase(m, me.team, me.x, me.z);
        tx = home.x;
        tz = home.z;
        color = TEAMS[0].color;
      } else {
        let best = Infinity;
        for (const f of m.flags) {
          const steal = f.team !== me.team && f.state !== "carried";
          const save = f.team === me.team && f.state === "dropped";
          if (!steal && !save) continue;
          const d = Math.hypot(f.x - me.x, f.z - me.z);
          if (d < best) {
            best = d;
            tx = f.x;
            tz = f.z;
            color = TEAMS[f.team].color;
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

      drawMap(mctx, mapBg, m, map.width, map.height);

      if (vigTimer > 0) {
        vigTimer -= 1 / 60;
        if (vigTimer <= 0) {
          vig.style.transition = "";
          vig.style.opacity = "0";
        }
      }
      pauseChip.classList.toggle("hide", m.over);
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
    showSelect(current, chosen, info, onPick, onPlay, onWorld, onBack) {
      let { mode, size, medic, difficulty, world } = chosen;
      const { progress, open } = info;
      root.classList.add("fc-menu");
      const sel = el("div", "fc-sel", root);
      const title = el("h2", "fc-logo", sel);
      el("span", "a", title).textContent = "FLAG";
      el("span", "flag", title);
      el("span", "b", title).textContent = "CATCH";
      el("small", "", title).textContent = "Pick your animal, steal their flags and bring them home!";
      // Your points, and what they open next.
      const pts = el("div", "fc-pts", sel);
      const next = nextUnlock(progress);
      const nextIds = next ? [...(next.animals ?? []), ...(next.worlds ?? []), ...(next.modes ?? [])].filter((id) => !open.has(id)) : [];
      pts.innerHTML = `<b>★ ${fmt(progress.points)}</b> POINTS` + (next && nextIds.length ? ` · NEXT: ${nextIds.map(unlockName).join(", ").toUpperCase()} AT ${fmt(next.at)}` : "");
      // Back to the title screen, and Settings from here too.
      const corner = el("div", "fc-top-left", sel);
      corner.style.pointerEvents = "auto";
      button(corner, "‹ MENU", "fc-chip fc-back", () => {
        sel.remove();
        onBack();
      });
      button(corner, "SETTINGS", "fc-chip fc-back", openSettings);
      // Mode and team size share one panel above the animals, so nothing overlaps.
      const setup = el("div", "fc-setup", sel);
      setup.addEventListener("pointerdown", (e) => e.stopPropagation());
      // The world: step through all eight; locked ones show what opens them.
      const worldGroup = el("div", "fc-group", setup);
      el("label", "", worldGroup).textContent = "WORLD";
      const worldBox = el("div", "fc-world", worldGroup);
      const prevW = el("div", "arw", worldBox);
      prevW.textContent = "‹";
      const worldName = el("div", "name", worldBox);
      const nextW = el("div", "arw", worldBox);
      nextW.textContent = "›";
      const showWorld = () => {
        const w = worldById(world);
        const locked = !open.has(world);
        worldName.textContent = w.name.toUpperCase();
        worldName.classList.toggle("locked", locked);
        const best = progress.best[world];
        el("small", "", worldName).textContent = locked ? `LOCKED · ${fmt(costOf(world))} PTS` : best ? `${w.blurb.toUpperCase()} · BEST ${best}` : w.blurb.toUpperCase();
        refreshPlay();
      };
      const stepWorld = (d: number) => {
        const i = WORLDS.findIndex((w) => w.id === world);
        world = WORLDS[(i + d + WORLDS.length) % WORLDS.length].id;
        showWorld();
        sfx.pick();
        onWorld(world);
      };
      prevW.addEventListener("click", () => stepWorld(-1));
      nextW.addEventListener("click", () => stepWorld(1));
      const modeGroup = el("div", "fc-group", setup);
      el("label", "", modeGroup).textContent = "MODE";
      const modes = el("div", "fc-seg", modeGroup);
      const modeBtns = new Map<Mode, HTMLElement>();
      const modeInfo: Array<[Mode, string, string]> = [
        ["capture", "CAPTURE", "Most steals wins"],
        ["hoard", "HOARD", `First to ${HOARD_TARGET} points`],
        ["playful", "PLAYFUL", "One flag each"],
      ];
      for (const [id, name, info] of modeInfo) {
        const locked = !open.has(id);
        const b = el("div", locked ? "fc-mode locked" : "fc-mode", modes);
        b.textContent = name;
        el("small", "", b).textContent = locked ? `${fmt(costOf(id))} PTS` : info;
        b.addEventListener("click", () => {
          if (locked) {
            nope(b);
            return;
          }
          mode = id;
          modeBtns.forEach((n, k) => n.classList.toggle("on", k === mode));
          sfx.pick();
        });
        modeBtns.set(id, b);
      }
      modeBtns.forEach((n, k) => n.classList.toggle("on", k === mode));
      // Team size; the two biggest play on gigantic maps with outposts.
      const sizeGroup = el("div", "fc-group", setup);
      el("label", "", sizeGroup).textContent = "TEAM SIZE";
      const sizes = el("div", "fc-seg", sizeGroup);
      const sizeBtns = new Map<number, HTMLElement>();
      for (const def of MAPS) {
        const b = el("div", def.gigantic ? "fc-size big" : "fc-size", sizes);
        b.textContent = `${def.size}v${def.size}`;
        el("small", "", b).textContent = def.gigantic ? "GIGANTIC" : def.size === 8 ? "CLASSIC" : "BIG";
        b.addEventListener("click", () => {
          size = def.size;
          sizeBtns.forEach((n, k) => n.classList.toggle("on", k === size));
          sfx.pick();
        });
        sizeBtns.set(def.size, b);
      }
      sizeBtns.forEach((n, k) => n.classList.toggle("on", k === size));
      // Runner, or a medic who plants respawn flags for the team.
      const roleGroup = el("div", "fc-group", setup);
      el("label", "", roleGroup).textContent = "ROLE";
      const roles = el("div", "fc-seg", roleGroup);
      const roleBtns: Array<[boolean, HTMLElement]> = [];
      for (const [isMedic, name, info] of [
        [false, "RUNNER", "STEAL FLAGS"],
        [true, "MEDIC", "RESPAWN FLAGS"],
      ] as const) {
        const b = el("div", "fc-size", roles);
        b.textContent = name;
        el("small", "", b).textContent = info;
        b.addEventListener("click", () => {
          medic = isMedic;
          roleBtns.forEach(([k, n]) => n.classList.toggle("on", k === medic));
          sfx.pick();
        });
        roleBtns.push([isMedic, b]);
      }
      roleBtns.forEach(([k, n]) => n.classList.toggle("on", k === medic));
      // How good the rival CPUs are; your teammates always play Medium.
      const diffGroup = el("div", "fc-group", setup);
      el("label", "", diffGroup).textContent = "RIVALS";
      const diffs = el("div", "fc-seg", diffGroup);
      const diffBtns = new Map<Difficulty, HTMLElement>();
      for (const [id, name, info] of [
        ["easy", "EASY", "RELAXED"],
        ["medium", "MEDIUM", "FAIR FIGHT"],
        ["hard", "HARD", "SHARP"],
      ] as const) {
        const b = el("div", "fc-size", diffs);
        b.textContent = name;
        el("small", "", b).textContent = info;
        b.addEventListener("click", () => {
          difficulty = id;
          diffBtns.forEach((n, k) => n.classList.toggle("on", k === difficulty));
          sfx.pick();
        });
        diffBtns.set(id, b);
      }
      diffBtns.forEach((n, k) => n.classList.toggle("on", k === difficulty));
      const row = el("div", "fc-row", sel);
      const tiles = new Map<string, HTMLElement>();
      const pick = (id: string) => {
        if (!open.has(id)) {
          nope(tiles.get(id)!);
          return;
        }
        current = id;
        tiles.forEach((t, key) => t.classList.toggle("on", key === id));
        onPick(id);
      };
      // The tiles don't fit a phone, so they scroll sideways; a tap (not a swipe) picks.
      const strip = el("div", "fc-tiles", row);
      strip.addEventListener("pointerdown", (e) => e.stopPropagation());
      for (const id of ANIMAL_IDS) {
        const tile = animalTile(ANIMALS[id], strip);
        if (!open.has(id)) {
          tile.classList.add("locked");
          el("div", "lock", tile).textContent = `LOCKED · ${fmt(costOf(id))} PTS`;
        }
        tile.addEventListener("click", () => pick(id));
        tiles.set(id, tile);
      }
      tiles.get(current)?.scrollIntoView({ inline: "center", block: "nearest" });
      const play = el("div", "fc-play", row);
      play.textContent = "PLAY";
      function refreshPlay() {
        play.classList.toggle("locked", !open.has(world));
      }
      play.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        if (!open.has(world)) {
          nope(worldName);
          nope(play);
          return;
        }
        sel.remove();
        root.classList.remove("fc-menu");
        onPlay({ mode, size, medic, difficulty, world });
      });
      showWorld();
      pick(open.has(current) ? current : "lion");
    },
    countdown(onDone) {
      hintTimer = 8;
      const beats = ["3", "2", "1", "GO!"];
      let i = 0;
      const next = () => {
        const last = i === beats.length - 1;
        count.textContent = beats[i];
        count.style.color = last ? "#7ee36b" : "#ffffff";
        count.classList.remove("show");
        void count.offsetWidth;
        count.classList.add("show");
        i++;
        if (i === 1) announce("ready");
        if (last) {
          // GO! hands over control at once; its pop finishes on its own.
          sfx.go();
          announce("go");
          onDone();
        } else {
          sfx.count();
          setTimeout(next, 800);
        }
      };
      next();
    },
    showResults(m, stats, award, onAgain, onChange, progress) {
      const card = el("div", "fc-card fc-results", root);
      const box = el("div", "box", card);
      const [a, b] = m.scores;
      const head = el("h1", "", box);
      head.textContent = a === b ? "DRAW!" : a > b ? "YOU WIN!" : "SO CLOSE!";
      head.style.color = a === b ? "#ffd166" : a > b ? TEAMS[0].color : TEAMS[1].color;
      const board = el("div", "fc-board", box);
      const pill = (team: 0 | 1, score: number) => {
        const p = el("div", "fc-pill", board);
        p.style.background = TEAMS[team].color;
        el("small", "", p).textContent = TEAMS[team].name.toUpperCase();
        countUp(el("b", "", p), score);
      };
      pill(0, a);
      el("div", "fc-vs", board).textContent = m.mode === "hoard" ? "POINTS" : "FLAGS";
      pill(1, b);
      // Your match in five numbers, then the best player on the island.
      const row = el("div", "fc-stats", box);
      const stat = (n: number, label: string) => {
        const c = el("div", "", row);
        countUp(el("b", "", c), n);
        el("small", "", c).textContent = label;
      };
      stat(stats.banks, m.mode === "hoard" ? "BANKED" : "SCORED");
      stat(stats.steals, "GRABS");
      stat(stats.knockouts, "KOS");
      stat(stats.saves, "SAVES");
      stat(m.players[0].score, "POINTS");
      const mvp = m.players.reduce((best, p) => (p.score > best.score ? p : best), m.players[0]);
      el("p", "", box).textContent =
        mvp.id === 0 ? "You were the MVP!" : `MVP: ${mvp.def.name} on ${TEAMS[mvp.team].name}, ${mvp.score} points`;
      // What this match paid, a new best and anything it opened.
      if (award) {
        const earn = el("div", "fc-earn", box);
        earn.innerHTML = `<b>+${fmt(award.gained)}</b> POINTS` + (award.record ? ` · NEW BEST ON ${worldById(m.world.id).name.toUpperCase()}!` : "");
        if (award.opened.length) {
          const opened = el("div", "", box);
          for (const id of award.opened) el("span", "fc-new", opened).textContent = `NEW: ${unlockName(id).toUpperCase()}`;
          sfx.bank(0, 1);
        }
        // How close the next unlock is, filling from where this match started.
        const next = progress && nextUnlock(progress);
        if (progress && next) {
          const prevAt = [...UNLOCKS].reverse().find((u) => u.at <= progress.points)?.at ?? 0;
          const span = next.at - prevAt;
          const bar = el("div", "fc-next", box);
          const ids = [...(next.animals ?? []), ...(next.worlds ?? []), ...(next.modes ?? [])];
          el("small", "", bar).textContent = `NEXT: ${ids.map(unlockName).join(", ").toUpperCase()} · ${fmt(next.at - progress.points)} TO GO`;
          const fill = el("u", "", el("i", "", bar));
          fill.style.width = `${Math.round((Math.max(0, progress.points - award.gained - prevAt) / span) * 100)}%`;
          window.setTimeout(() => (fill.style.width = `${Math.round(((progress.points - prevAt) / span) * 100)}%`), 500);
        }
      }
      const btns = el("div", "row2", box);
      const again = el("div", "go", btns);
      again.textContent = "PLAY AGAIN";
      const change = el("div", "go alt", btns);
      change.textContent = "CHANGE SETUP";
      card.addEventListener("pointerdown", (e) => e.stopPropagation());
      again.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        card.remove();
        onAgain();
      });
      change.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        card.remove();
        onChange();
      });
    },
  };
}

/** Numbers on the results card tick up from zero. */
function countUp(node: HTMLElement, to: number): void {
  node.textContent = "0";
  if (to <= 0) return;
  const start = performance.now() + 350;
  const dur = Math.min(900, 300 + to * 40);
  const tick = (now: number) => {
    const k = Math.max(0, Math.min(1, (now - start) / dur));
    node.textContent = String(Math.round(to * (1 - (1 - k) * (1 - k))));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function isFullscreen(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return !!document.fullscreenElement || nav.standalone === true || matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches;
}

/** Ask the browser for full screen and a landscape lock; false where it can't (iPhone Safari). */
export function requestFullscreen(): boolean {
  const doc = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const req = doc.requestFullscreen?.bind(doc) ?? doc.webkitRequestFullscreen?.bind(doc);
  if (!req || !(document.fullscreenEnabled ?? true)) return false;
  try {
    const p = req() as unknown as Promise<void> | undefined;
    p?.then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.("landscape")).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** A little shake and buzz for a tap on something still locked. */
function nope(n: HTMLElement): void {
  n.classList.remove("shake");
  void n.offsetWidth;
  n.classList.add("shake");
  sfx.fizzle(0, 0.6);
}

function el(tag: string, cls: string, parent?: HTMLElement): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  parent?.appendChild(n);
  return n;
}

function animalTile(a: AnimalDef, parent: HTMLElement): HTMLElement {
  const tile = el("div", "fc-tile", parent);
  el("b", "", tile).textContent = a.name;
  const cls = el("span", "cls", tile);
  cls.textContent = a.cls.toUpperCase();
  cls.style.background = CLASS_COLORS[a.cls];
  const bars: Array<[string, number, string]> = [
    ["Land", a.landSpeed / 17, CLASS_COLORS.land],
    ["Swim", a.waterSpeed / 16, CLASS_COLORS.water],
    ["Fly", a.floatTime / 3.2, CLASS_COLORS.air],
  ];
  for (const [label, v, color] of bars) {
    const bar = el("div", "bar", tile);
    el("span", "", bar).textContent = label;
    const fill = el("u", "", el("i", "", bar));
    fill.style.width = `${Math.round(Math.max(0.08, Math.min(1, v)) * 100)}%`;
    fill.style.background = color;
  }
  el("div", "perk", tile).textContent = a.perk;
  return tile;
}

/**
 * The minimap lies on its side: your homeland on the left, the enemy's on
 * the right, so "forward" on the map matches heading out to raid.
 */
function mapX(z: number, w: number): number {
  return (0.5 - z / (2 * WORLD_HALF_Z)) * w;
}

function mapY(x: number, h: number): number {
  return (0.5 + x / (2 * WORLD_HALF_X)) * h;
}

function drawMapBackground(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const P = currentWorld().palette;
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const grass = rgb(P.grassLow);
  const sand = rgb(P.sand);
  const sea = rgb(P.waterShallow);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const z = (0.5 - px / w) * 2 * WORLD_HALF_Z;
      const x = (py / h - 0.5) * 2 * WORLD_HALF_X;
      const i = (py * w + px) * 4;
      const g = groundHeight(x, z);
      let [r, gr, b] = onBridge(x, z) ? [201, 154, 104] : g > 0.9 ? grass : g > 0 ? sand : sea;
      const land = landOf(z);
      if (land >= 0 && g > 0) {
        // Tint each homeland toward its team, like the ground does.
        const tint = TEAMS[land as 0 | 1].light;
        r = Math.round(r * 0.75 + parseInt(tint.slice(1, 3), 16) * 0.25);
        gr = Math.round(gr * 0.75 + parseInt(tint.slice(3, 5), 16) * 0.25);
        b = Math.round(b * 0.75 + parseInt(tint.slice(5, 7), 16) * 0.25);
      }
      img.data[i] = r;
      img.data[i + 1] = gr;
      img.data[i + 2] = b;
      img.data[i + 3] = 200;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function drawMap(ctx: CanvasRenderingContext2D, bg: HTMLCanvasElement, m: Match, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 14 * (w / MAP_W));
  ctx.clip();
  ctx.drawImage(bg, 0, 0);
  const s = w / MAP_W;
  for (const st of m.stations) {
    if (st.cd > 0) continue;
    ctx.fillStyle = "#ff6b9a";
    ctx.fillRect(mapX(st.z, w) - 2 * s, mapY(st.x, h) - 2 * s, 4 * s, 4 * s);
  }
  // Respawn flags as small crosses in their team's color.
  for (const f of m.respawns) {
    const x = mapX(f.z, w);
    const y = mapY(f.x, h);
    ctx.fillStyle = TEAMS[f.team].color;
    ctx.fillRect(x - 3 * s, y - 1 * s, 6 * s, 2 * s);
    ctx.fillRect(x - 1 * s, y - 3 * s, 2 * s, 6 * s);
  }
  for (const b of m.bases) {
    const r = b.main ? 5 : 3.5;
    ctx.fillStyle = TEAMS[b.team].color;
    ctx.fillRect(mapX(b.z, w) - r * s, mapY(b.x, h) - r * s, 2 * r * s, 2 * r * s);
    // Pips for how many flags this base holds right now.
    const held = m.flags.filter((f) => f.base === b.id && f.state === "home").length;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < held; i++) ctx.fillRect(mapX(b.z, w) - 6 * s + (i % 5) * 2.6 * s, mapY(b.x, h) + (b.team === 0 ? 7 : -9) * s - Math.floor(i / 5) * 2.6 * s, 2 * s, 2 * s);
  }
  for (const f of m.flags) {
    if (f.state !== "dropped") continue;
    // Dropped flags stand out; the ones at home sit inside the base square.
    ctx.fillStyle = TEAMS[f.team].color;
    ctx.beginPath();
    ctx.arc(mapX(f.z, w), mapY(f.x, h), 3.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = s;
    ctx.stroke();
  }
  // Smaller dots when the teams are big, so a crowd still reads.
  const dot = m.players.length > 40 ? 1.6 : m.players.length > 20 ? 2.2 : 3;
  for (const p of m.players) {
    if (p.out > 0) continue;
    const me = p.id === 0;
    // A thief carrying one of our flags gets a bigger dot with a white edge.
    const thief = p.carrying >= 0 && p.team === 1;
    ctx.fillStyle = TEAMS[p.team].color;
    ctx.beginPath();
    ctx.arc(mapX(p.z, w), mapY(p.x, h), (me ? 4.5 : thief ? Math.max(dot, 3.4) : dot) * s, 0, Math.PI * 2);
    ctx.fill();
    if (me || thief) {
      ctx.strokeStyle = me ? ME_GLOW : "#ffffff";
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function buildTunePanel(parent: HTMLElement): HTMLElement {
  const panel = el("div", "fc-tune", parent);
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
