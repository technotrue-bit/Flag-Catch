/**
 * How the game is drawn at each Graphics setting.
 *
 *   Low     drawn at 1x, fewer sparks and scenery, for older phones.
 *   Normal  the classic look, as sharp as the screen allows up to 2x.
 *   High    soft sun shadows, a glow on bright things (the sun, lava, your
 *           arrow), a gentle color grade and vignette, a sky dome with a sun,
 *           reflective water, swaying grass and rounder trees. Sharper too.
 *
 * The scenery side of High (water, grass, sky, tree detail) is in world.ts,
 * which reads `sceneryFor`; this file owns the renderer and the passes.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { Graphics } from "./settings";

/** What the scenery builds at a Graphics level. */
export interface Scenery {
  level: Graphics;
  /** Trees, flowers and props compared with Normal. */
  density: number;
  /** Ground squares per meter compared with Normal. */
  groundDetail: number;
  /** Rounder trees and rocks. */
  smooth: boolean;
  /** Reflective, rippling water and glowing, flowing lava. */
  richWater: boolean;
  /** A sky dome with a sun in place of the flat backdrop. */
  skyDome: boolean;
  /** Swaying grass tufts on green worlds. */
  grass: boolean;
  /** Sun shadows: things cast and receive them. */
  shadows: boolean;
}

export function sceneryFor(level: Graphics): Scenery {
  const high = level === "high";
  return {
    level,
    density: level === "low" ? 0.55 : high ? 1.35 : 1,
    groundDetail: high ? 2 : 1,
    smooth: high,
    richWater: high,
    skyDome: high,
    grass: high,
    shadows: high,
  };
}

/** The sharpest pixel ratio each level draws at, before the frame rate safety net. */
export function maxPixelRatio(level: Graphics, device: number): number {
  const d = device || 1;
  if (level === "low") return 1;
  if (level === "high") return Math.min(2.5, Math.max(1.25, d));
  return Math.min(2, d);
}

/** A soft color grade and vignette, drawn last, in screen colors. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.2 },
    uSaturation: { value: 1.1 },
    uContrast: { value: 1.05 },
    uWarm: { value: 0.012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uWarm;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 col = mix(vec3(l), c.rgb, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      // A touch of sunshine in the light parts, a touch of blue in the shade.
      col += vec3(uWarm, uWarm * 0.4, -uWarm) * (l - 0.35);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d * vec2(1.15, 1.0)));
      col *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export interface Look {
  readonly level: Graphics;
  /** Switch levels: shadows, passes and sharpness. Returns the new top pixel ratio. */
  set(level: Graphics): number;
  setSize(w: number, h: number): void;
  setPixelRatio(r: number): void;
  /** Snowy worlds are bright all over: only the brightest things glow there. */
  setBright(bright: boolean): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
}

export function createLook(renderer: THREE.WebGLRenderer): Look {
  let level: Graphics = "normal";
  let composer: EffectComposer | null = null;
  let renderPass: RenderPass | null = null;
  let bloom: UnrealBloomPass | null = null;
  const size = new THREE.Vector2(1, 1);
  let bright = false;
  const threshold = () => (bright ? 2.2 : 1.02);
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const build = () => {
    renderer.getSize(size);
    // Multisampled, so edges stay smooth with the passes on.
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    composer.addPass(renderPass);
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.35, threshold());
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass(GradeShader));
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
  };

  return {
    get level() {
      return level;
    },
    set(next) {
      level = next;
      const high = next === "high";
      renderer.shadowMap.enabled = high;
      if (high && !composer) build();
      if (!high && composer) {
        composer.dispose();
        composer.renderTarget1.dispose();
        composer.renderTarget2.dispose();
        bloom?.dispose();
        composer = null;
        renderPass = null;
        bloom = null;
      }
      return maxPixelRatio(next, window.devicePixelRatio);
    },
    setSize(w, h) {
      composer?.setSize(w, h);
    },
    setPixelRatio(r) {
      renderer.setPixelRatio(r);
      if (composer) {
        renderer.getSize(size);
        composer.setPixelRatio(r);
        composer.setSize(size.x, size.y);
      }
    },
    setBright(next) {
      bright = next;
      if (bloom) bloom.threshold = threshold();
    },
    render(scene, camera) {
      if (!composer || !renderPass) {
        renderer.render(scene, camera);
        return;
      }
      renderPass.scene = scene;
      renderPass.camera = camera;
      composer.render();
    },
  };
}
