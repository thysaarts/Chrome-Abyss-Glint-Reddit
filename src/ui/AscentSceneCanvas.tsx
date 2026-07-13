import { useEffect, useMemo, useRef } from "react";
import { Canvas, advance, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { JourneyScene, SceneFx } from "../demo/scene/JourneyScene";
import { liveScene } from "../demo/scene-model";
import { ascentItems, ascentKindOf } from "../game/collection";
import type { SceneOverride } from "./settings";

// tone presets for the light effects — gentle tints, not free colour
const TONES: Record<string, string> = { warm: "#ffd2a0", cool: "#a9c6ff", natural: "#ffffff" };

/** Fires once, on the first frame that actually RENDERS — so the wrapper's fade
 *  starts when there is something to fade in (not while GLB parsing blocks paint). */
export function FirstFrame({ cb }: { cb?: () => void }) {
  const fired = useRef(false);
  useFrame(() => {
    if (!fired.current) {
      fired.current = true;
      cb?.();
    }
  });
  return null;
}

/**
 * The 3D "Ascent" scene as a live background. Rendered lazily (this whole module +
 * three.js only load when the scene is enabled). Scroll drives the camera up the
 * column for parallax; otherwise it drifts on its own. `off` hides individual
 * elements (Settings toggles + unowned items). `lite` trims postprocessing.
 *
 * BATTERY: the canvas runs frameloop="never" and we advance it ourselves at
 * 30fps — half the GPU work of the default loop, invisible for a background.
 */
const FPS = 30;

// the three sky backgrounds are exclusive — highest priority wins
const BG_CRIMSON = "Crimson Drift";
const BG_EMERALD = "Emerald Abyss";
const BG_NEBULA = "Nebula";

export default function AscentSceneCanvas({ scrollRef, off, config, lite = true, onFirstFrame }: { scrollRef?: React.RefObject<HTMLElement | null>; off?: string[]; config?: Record<string, SceneOverride>; lite?: boolean; onFirstFrame?: () => void }) {
  const progress = useRef(0.04);

  const { scene, fx } = useMemo(() => {
    const s = liveScene();
    s.settings.dof = false; // never DoF a background
    const hide = new Set(off ?? []);
    const on = (name: string) => !hide.has(name);
    s.objects = s.objects.filter((o) => on(o.name));
    // atmosphere / FX elements (names mirror the Settings + Shop items)
    if (!on("Stars")) { s.settings.stars = 0; s.settings.heroStars = 0; }
    if (!on("Dust")) s.settings.dust = 0;
    if (!on("Comets")) s.settings.comets = 0;
    if (!on("Galaxy glow")) s.settings.galaxy = 0;
    if (!on("Gold Embers")) s.settings.embers = 0;
    if (!on("Stardust Rain")) s.settings.rain = 0;
    if (!on("Aurora Veil")) s.settings.aurora = 0;
    if (!on("Solar Shafts")) s.settings.shafts = 0;
    // backgrounds — alternates re-tint the nebula; none on = empty deep space
    if (on(BG_CRIMSON)) {
      s.settings.nebulaHueA = 0.985; // crimson
      s.settings.nebulaHueB = 0.045; // ember-orange
      s.settings.nebulaHueC = 0.93; // hot pink
      s.settings.fogColor = "#160709";
    } else if (on(BG_EMERALD)) {
      s.settings.nebulaHueA = 0.44; // deep green
      s.settings.nebulaHueB = 0.36; // emerald
      s.settings.nebulaHueC = 0.5; // teal flash
      s.settings.fogColor = "#04140f";
    } else if (!on(BG_NEBULA)) {
      s.settings.nebulaIntensity = 0;
    }

    // PLAYER TWEAKS (Settings › Decor, keyed by item key) over the CMS scene
    const fx: SceneFx = {};
    if (config) {
      const byElement = new Map(ascentItems().map((a) => [a.element, a] as const));
      for (const [key, c] of Object.entries(config)) {
        if (!c) continue;
        const item = ascentItems().find((a) => a.key === key);
        if (!item || hide.has(item.element)) continue;
        const kind = ascentKindOf(key);
        const tone = TONES[c.tone ?? "natural"] ?? "#ffffff";
        if (kind === "bg") {
          const i = c.intensity ?? 1;
          if (key === "stars") { s.settings.stars *= i; s.settings.heroStars = Math.round(s.settings.heroStars * i); }
          else s.settings.nebulaIntensity *= i; // whichever nebula variant is active
        } else if (kind === "light") {
          const i = c.intensity ?? 1;
          if (key === "galaxy-glow") { s.settings.galaxy *= i; fx.galaxyTint = tone; }
          if (key === "aurora-veil") { s.settings.aurora *= i; fx.auroraTint = tone; }
          if (key === "solar-shafts") { s.settings.shafts *= i; fx.shaftTint = tone; }
        } else if (kind === "particle") {
          const d = c.density ?? 1;
          const v = c.speed ?? 1;
          if (key === "dust") { s.settings.dust *= d; fx.dustSpeed = v; }
          if (key === "comets") { s.settings.comets *= d; fx.cometSpeed = v; }
          if (key === "gold-embers") { s.settings.embers *= d; fx.emberSpeed = v; }
          if (key === "stardust-rain") { s.settings.rain *= d; fx.rainSpeed = v; }
        } else {
          // prop: absolute position overrides on the matching scene object
          const el = byElement.get(item.element)?.element;
          s.objects = s.objects.map((o) =>
            o.name === el
              ? {
                  ...o,
                  lateral: typeof c.x === "number" ? Math.max(-1, Math.min(1, c.x)) : o.lateral,
                  t: typeof c.y === "number" ? Math.max(0, Math.min(1, c.y)) : o.t,
                  depth: typeof c.depth === "number" ? Math.max(-1, Math.min(1, c.depth)) : o.depth,
                }
              : o
          );
        }
      }
    }
    return { scene: s, fx };
  }, [off, config]);

  // drive progress from the level-list scroll (parallax ascent); else slow ambient drift.
  // Inverted: scrolling DOWN the list moves the scene down with it.
  useEffect(() => {
    let raf = 0;
    let amb = progress.current;
    const tick = () => {
      const el = scrollRef?.current;
      if (el && el.scrollHeight > el.clientHeight + 4) {
        const max = el.scrollHeight - el.clientHeight;
        // inverted (scroll down = scene moves down), damped to 75% so the
        // background drifts slower than the list
        progress.current = 1 - Math.min(1, Math.max(0, el.scrollTop / max)) * 0.75;
      } else {
        amb = (amb + 0.00018) % 1;
        progress.current = amb;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrollRef]);

  // the 30fps advance loop (also pauses automatically while the tab is hidden,
  // since requestAnimationFrame stops firing)
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const step = 1000 / FPS;
    const loop = (t: number) => {
      if (t - last >= step) {
        last = t - ((t - last) % step);
        // frameloop="never" assigns this straight to clock.elapsedTime, which is
        // in SECONDS — passing ms runs every animation ~1000× fast
        advance(t / 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Canvas
      frameloop="never"
      dpr={[1, lite ? 1.6 : 2]}
      gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping, alpha: false }}
      camera={{ fov: 50, near: 0.1, far: 600, position: [0, 0, 17] }}
      style={{ position: "absolute", inset: 0 }}
    >
      <JourneyScene scene={scene} progress={progress} selectedId={null} onSelect={() => {}} lite={lite} fx={fx} />
      <FirstFrame cb={onFirstFrame} />
    </Canvas>
  );
}
