import { useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { JourneyScene } from "./scene/JourneyScene";
import { liveScene, SceneDef } from "./scene-model";

/**
 * THUMB MODE — demo.html?thumb=<element name> renders the scene framed on one
 * element, IN SITU (nebula, neighbours and lighting all live), for the decor
 * thumbnails the CMS/Shop show. scripts/ascent-thumbs.mjs screenshots each one.
 *
 * Landmarks: the target is pulled toward the column centre and scaled up a
 * touch so it fills the frame; its travel motion is stripped so it holds still.
 * Atmosphere layers (Nebula/Stars/Dust/Comets/Galaxy glow): a sky viewpoint
 * with that layer emphasised.
 */
const ATMO_VIEWS: Record<string, (s: SceneDef) => number> = {
  Nebula: (s) => {
    s.settings.nebulaIntensity = 0.9;
    s.settings.nebulaFilaments = 0.8;
    return 0.33;
  },
  Stars: (s) => {
    s.settings.nebulaIntensity = 0.28;
    s.settings.stars = 12;
    s.settings.heroStars = 26;
    return 0.33;
  },
  Dust: (s) => {
    s.settings.nebulaIntensity = 0.4;
    s.settings.dust = 1;
    s.settings.dustWarm = 0.3;
    return 0.33;
  },
  Comets: (s) => {
    s.settings.nebulaIntensity = 0.45;
    s.settings.comets = 1;
    return 0.33;
  },
  "Galaxy glow": (s) => {
    s.settings.nebulaIntensity = 0.18;
    s.settings.stars = 4;
    s.settings.galaxy = 1;
    return 0.58;
  },
  "Gold Embers": (s) => {
    s.settings.nebulaIntensity = 0.32;
    s.settings.dust = 0;
    s.settings.embers = 1;
    return 0.33;
  },
  "Stardust Rain": (s) => {
    s.settings.nebulaIntensity = 0.32;
    s.settings.dust = 0;
    s.settings.rain = 1;
    return 0.33;
  },
  "Aurora Veil": (s) => {
    s.settings.nebulaIntensity = 0.24;
    s.settings.stars = 5;
    s.settings.aurora = 1;
    return 0.33;
  },
  "Solar Shafts": (s) => {
    s.settings.nebulaIntensity = 0.34;
    s.settings.shafts = 1;
    return 0.33;
  },
  "Crimson Drift": (s) => {
    s.settings.nebulaHueA = 0.985;
    s.settings.nebulaHueB = 0.045;
    s.settings.nebulaHueC = 0.93;
    s.settings.nebulaIntensity = 0.85;
    s.settings.nebulaFilaments = 0.75;
    return 0.33;
  },
  "Emerald Abyss": (s) => {
    s.settings.nebulaHueA = 0.44;
    s.settings.nebulaHueB = 0.36;
    s.settings.nebulaHueC = 0.5;
    s.settings.nebulaIntensity = 0.85;
    s.settings.nebulaFilaments = 0.75;
    return 0.33;
  },
};

function buildThumbScene(name: string): { scene: SceneDef; progress: number } {
  const scene = liveScene();
  scene.settings.dof = false;
  // shop FX off by default in thumbs — each FX view switches its own back on
  scene.settings.embers = 0;
  scene.settings.rain = 0;
  scene.settings.aurora = 0;
  scene.settings.shafts = 0;

  const atmo = ATMO_VIEWS[name];
  if (atmo) {
    // a clear-sky viewpoint — landmarks stay (in situ) but none sit at this height
    const progress = atmo(scene);
    scene.objects = scene.objects.map((o) => ({ ...o, motion: undefined }));
    return { scene, progress };
  }

  const target = scene.objects.find((o) => o.name === name);
  if (target) {
    // freeze ALL travel so nothing photobombs and the target holds its mark
    scene.objects = scene.objects.map((o) => ({ ...o, motion: undefined }));
    const t = scene.objects.find((o) => o.name === name)!;
    t.lateral = Math.max(-0.14, Math.min(0.14, t.lateral));
    t.depth = Math.max(0.05, Math.min(0.3, t.depth)); // pull toward the camera
    t.scale = Math.min(Math.max(t.scale * 1.75, 2.2), 2.7); // fill the frame without overflowing it
    t.bob = 0;
    // camera at progress*pathLength looks at +2.4 above itself → centre the target there
    const progress = Math.max(0, t.t - 2.4 / scene.settings.pathLength);
    return { scene, progress };
  }

  return { scene, progress: 0.3 };
}

export function ThumbApp({ name }: { name: string }) {
  const built = useMemo(() => buildThumbScene(name), [name]);
  const progress = useRef(built.progress);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#05060d" }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping, alpha: false }}
        camera={{ fov: 50, near: 0.1, far: 600, position: [0, built.progress * built.scene.settings.pathLength, 17] }}
      >
        <JourneyScene scene={built.scene} progress={progress} selectedId={null} onSelect={() => {}} />
      </Canvas>
    </div>
  );
}
