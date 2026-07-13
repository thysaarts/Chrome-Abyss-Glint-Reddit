import { MutableRefObject, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, DepthOfField, Vignette, Noise, ChromaticAberration, ToneMapping } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { SceneDef } from "../scene-model";
import { Nebula } from "./Nebula";
import { Landmark } from "./Landmark";
import { HeroStars } from "./HeroStars";
import { DustField } from "./DustField";
import { Comets } from "./Comets";
import { GalaxyGlow } from "./GalaxyGlow";
import { Starfield } from "./Starfield";
import { AuroraVeil, SolarShafts } from "./LightFx";

/** Smoothly drive the camera UP the column from a shared progress ref (0..1). */
function CameraRig({ progress, pathLength }: { progress: MutableRefObject<number>; pathLength: number }) {
  const cur = useRef(0);
  const { camera } = useThree();
  useFrame((state, dt) => {
    cur.current += (progress.current - cur.current) * Math.min(1, dt * 3.5);
    const y = cur.current * pathLength;
    const t = state.clock.elapsedTime;
    camera.position.set(Math.sin(t * 0.12) * 1.2, y, 17 + Math.cos(t * 0.1) * 0.6);
    camera.lookAt(Math.sin(t * 0.08) * 0.6, y + 2.4, 0);
  });
  return null;
}

/** Fog + tone-mapping exposure baked as a light multiplier (ACES has no exposure knob). */
function SceneRig({ s }: { s: SceneDef["settings"] }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.fog = new THREE.FogExp2(new THREE.Color(s.fogColor), s.fogDensity * 0.02);
    return () => {
      scene.fog = null;
    };
  }, [scene, s.fogColor, s.fogDensity]);
  return null;
}

/**
 * DRIFT LIGHTS — a few coloured point lights that wander up the column and flicker,
 * so the gas and the models catch moving highlights instead of a static wash.
 */
function DriftLights({ amount, pathLength, follow }: { amount: number; pathLength: number; follow: MutableRefObject<number> }) {
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const specs = useMemo(
    () => [
      { color: "#8a5cff", base: 0.0, span: 6, speed: 0.13, flick: 7.3, dist: 34 },
      { color: "#37c8ff", base: 0.33, span: 8, speed: 0.17, flick: 5.1, dist: 30 },
      { color: "#ff7ad9", base: 0.66, span: 7, speed: 0.1, flick: 9.2, dist: 32 },
    ],
    []
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const camY = follow.current * pathLength;
    specs.forEach((sp, i) => {
      const L = lights.current[i];
      if (!L) return;
      L.position.set(Math.sin(t * sp.speed + i) * sp.span, camY + Math.cos(t * sp.speed * 1.3 + i * 2) * 12, -4 + Math.sin(t * sp.speed * 0.7 + i) * sp.span);
      const flick = 0.6 + 0.4 * Math.sin(t * sp.flick + i) * Math.sin(t * sp.flick * 0.37 + i);
      L.intensity = amount * (1.2 + flick) * 2.2;
    });
  });
  return (
    <>
      {specs.map((sp, i) => (
        <pointLight key={i} ref={(el) => (lights.current[i] = el)} color={sp.color} distance={sp.dist} decay={2} intensity={0} />
      ))}
    </>
  );
}

/** Player-side FX tweaks (Settings › Decor) — speed multipliers for the particle
 *  layers and tone tints for the light effects. All optional; default = as-authored. */
export interface SceneFx {
  dustSpeed?: number;
  emberSpeed?: number;
  rainSpeed?: number;
  cometSpeed?: number;
  galaxyTint?: string;
  auroraTint?: string;
  shaftTint?: string;
}

export function JourneyScene({
  scene,
  progress,
  selectedId,
  onSelect,
  lite = false,
  fx,
}: {
  scene: SceneDef;
  progress: MutableRefObject<number>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  lite?: boolean; // background mode — trims the postprocessing stack for mobile perf
  fx?: SceneFx;
}) {
  const s = scene.settings;
  const ex = s.exposure;

  return (
    <>
      <color attach="background" args={["#030409"]} />
      <SceneRig s={s} />
      <CameraRig progress={progress} pathLength={s.pathLength} />

      {/* KEY / FILL / RIM — deliberately UNDER-lit: low key + ambient (from settings)
          and a soft fill, so objects read as lit by the surrounding nebula (the IBL
          + coloured rim) rather than a studio. Distance falls into the fog. */}
      <ambientLight intensity={s.ambient * ex} />
      <directionalLight position={[6, 10, 8]} intensity={s.keyLightIntensity * ex} color={s.keyLightColor} />
      <directionalLight position={[-8, -4, -6]} intensity={0.3 * ex} color="#4a63c8" />
      <directionalLight position={[0, 2, -14]} intensity={1.0 * ex} color="#c56bf5" />
      <DriftLights amount={s.flicker} pathLength={s.pathLength} follow={progress} />

      {/* self-contained IBL — the nebula's own colours reflected off the objects */}
      <Environment resolution={256} background={false}>
        <Lightformer form="rect" intensity={1.7} color="#cdd6ff" position={[0, 8, 6]} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#7a55ff" position={[-8, 0, 2]} scale={[6, 14, 1]} rotation={[0, Math.PI / 2, 0]} />
        <Lightformer form="rect" intensity={0.9} color="#37c8ff" position={[8, -2, 2]} scale={[6, 14, 1]} rotation={[0, -Math.PI / 2, 0]} />
        <Lightformer form="circle" intensity={1.1} color="#ffd9a0" position={[0, -8, 4]} scale={6} />
      </Environment>

      <Nebula hueA={s.nebulaHueA} hueB={s.nebulaHueB} hueC={s.nebulaHueC} intensity={s.nebulaIntensity} filaments={s.nebulaFilaments} />
      <GalaxyGlow intensity={s.galaxy} pathLength={s.pathLength} tint={fx?.galaxyTint} />
      <Starfield count={Math.round(s.stars * 160)} />
      <HeroStars count={s.heroStars} pathLength={s.pathLength} />
      <DustField density={s.dust} warm={s.dustWarm} pathLength={s.pathLength} speedMul={fx?.dustSpeed} />
      <Comets rate={s.comets} speedMul={fx?.cometSpeed} />
      {/* shop-gated FX (ownership/toggles zero these out) */}
      {s.embers > 0.001 && <DustField density={s.embers} warm={0} pathLength={s.pathLength} palette="ember" speedMul={fx?.emberSpeed} />}
      {s.rain > 0.001 && <DustField density={s.rain} warm={0} pathLength={s.pathLength} palette="rain" speedMul={fx?.rainSpeed} />}
      <AuroraVeil amount={s.aurora} tint={fx?.auroraTint} />
      <SolarShafts amount={s.shafts} tint={fx?.shaftTint} />

      {/* click empty space to deselect */}
      <mesh position={[0, s.pathLength / 2, -30]} onClick={() => onSelect(null)} visible={false}>
        <planeGeometry args={[400, s.pathLength * 2]} />
        <meshBasicMaterial />
      </mesh>

      {scene.objects.map((o) => (
        <group key={o.id} position={[0, o.t * s.pathLength, 0]}>
          <Landmark o={o} selected={o.id === selectedId} onSelect={() => onSelect(o.id)} pathLength={s.pathLength} />
        </group>
      ))}

      <EffectComposer multisampling={lite ? 0 : 4}>
        <Bloom intensity={s.bloom} luminanceThreshold={0.5} luminanceSmoothing={0.28} mipmapBlur radius={0.78} />
        {!lite && s.dof ? <DepthOfField focusDistance={0.012} focalLength={0.02} bokehScale={2.4} /> : <></>}
        {lite ? <></> : <ChromaticAberration blendFunction={BlendFunction.NORMAL} offset={new THREE.Vector2(0.0006, 0.0009)} radialModulation modulationOffset={0.4} />}
        <Vignette eskil={false} offset={0.28} darkness={s.vignette} />
        {lite ? <></> : <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={s.grain} />}
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}
