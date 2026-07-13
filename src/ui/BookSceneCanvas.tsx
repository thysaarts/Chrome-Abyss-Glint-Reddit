import { useEffect, useMemo, useRef } from "react";
import { Canvas, advance, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { JourneyScene } from "../demo/scene/JourneyScene";
import { liveStickerScene } from "../demo/scene-model";
import { FirstFrame } from "./AscentSceneCanvas";

/**
 * The Sticker Book's 3D background — the "Interstellar" journey (planets only,
 * its own indigo/cyan/gold sky). Same battery discipline as the Ascent: 30fps
 * advance loop, lite postprocessing, scroll-driven parallax (damped, inverted).
 *
 * SECTOR LIGHT: `tintRef` carries the current sector's colour (updated by the
 * book as the player scrolls). A camera-following light + a soft full-screen
 * glow + a fog shift ease toward it, so the whole background settles into the
 * sector's tone family.
 */
const FPS = 30;

// the sector glow is computed IN the shader (float-precision radial falloff) —
// a canvas-gradient texture stretched fullscreen bands/dithers into visible
// dots on phones, a procedural gradient cannot
const glowVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const glowFrag = /* glsl */ `
  precision highp float; varying vec2 vUv; uniform vec3 uColor; uniform float uAmount;
  void main(){
    float d = length(vUv - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    a = a * a * 0.9;
    gl_FragColor = vec4(uColor * a * uAmount, a * uAmount);
  }
`;

function SectorLight({ tintRef }: { tintRef: React.MutableRefObject<string> }) {
  const light = useRef<THREE.PointLight>(null);
  const glow = useRef<THREE.Mesh>(null);
  const cur = useMemo(() => new THREE.Color("#9d7bff"), []);
  const target = useMemo(() => new THREE.Color("#9d7bff"), []);
  const baseFog = useMemo(() => new THREE.Color("#060a16"), []);
  const fogMix = useMemo(() => new THREE.Color(), []);
  const { scene, camera } = useThree();
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color("#9d7bff") }, uAmount: { value: 0.16 } }), []);

  useFrame((_, dt) => {
    target.set(tintRef.current || "#9d7bff");
    cur.lerp(target, Math.min(1, dt * 1.6)); // ease into the sector's tone
    if (light.current) {
      light.current.color.copy(cur);
      light.current.position.set(0, camera.position.y + 4, 2);
    }
    if (glow.current) glow.current.position.set(0, camera.position.y, -34);
    uniforms.uColor.value.copy(cur);
    // let the fog itself drift toward the sector's family — the "background colour" shift
    if (scene.fog && (scene.fog as THREE.FogExp2).color) {
      fogMix.copy(baseFog).lerp(cur, 0.3);
      (scene.fog as THREE.FogExp2).color.copy(fogMix);
    }
  });

  return (
    <>
      <pointLight ref={light} intensity={2.4} distance={40} decay={2} />
      <mesh ref={glow} scale={[110, 110, 1]}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial vertexShader={glowVert} fragmentShader={glowFrag} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </>
  );
}

export default function BookSceneCanvas({ scrollRef, tintRef, onFirstFrame }: { scrollRef?: React.RefObject<HTMLElement | null>; tintRef: React.MutableRefObject<string>; onFirstFrame?: () => void }) {
  const progress = useRef(0.1);
  const scene = useMemo(() => {
    const s = liveStickerScene();
    s.settings.dof = false;
    return s;
  }, []);

  // scroll → progress (inverted + damped to 75%, matching the Ascent's feel)
  useEffect(() => {
    let raf = 0;
    let amb = progress.current;
    const tick = () => {
      const el = scrollRef?.current;
      if (el && el.scrollHeight > el.clientHeight + 4) {
        const max = el.scrollHeight - el.clientHeight;
        progress.current = 1 - Math.min(1, Math.max(0, el.scrollTop / max)) * 0.75;
      } else {
        amb = (amb + 0.00016) % 1;
        progress.current = amb;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrollRef]);

  // 30fps advance loop — advance() takes SECONDS under frameloop="never"
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const step = 1000 / FPS;
    const loop = (t: number) => {
      if (t - last >= step) {
        last = t - ((t - last) % step);
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
      dpr={[1, 1.6]}
      gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping, alpha: false }}
      camera={{ fov: 50, near: 0.1, far: 600, position: [0, 0, 17] }}
      style={{ position: "absolute", inset: 0 }}
    >
      <JourneyScene scene={scene} progress={progress} selectedId={null} onSelect={() => {}} lite />
      <SectorLight tintRef={tintRef} />
      <FirstFrame cb={onFirstFrame} />
    </Canvas>
  );
}
