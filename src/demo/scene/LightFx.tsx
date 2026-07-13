import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Shop-gated LIGHT EFFECTS for the Ascent — both are cheap additive shader quads
 * that follow the camera up the column (they're sky, not scenery).
 *
 * AuroraVeil — a waving teal-green aurora curtain far behind the landmarks.
 * SolarShafts — long diagonal god-rays drifting slowly through the gas.
 */

function FollowCam({ children, z }: { children: React.ReactNode; z: number }) {
  const grp = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (grp.current) grp.current.position.set(0, state.camera.position.y, z);
  });
  return <group ref={grp}>{children}</group>;
}

/* ---------------------------------- aurora --------------------------------- */

const auroraVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const auroraFrag = /* glsl */ `
  precision highp float; varying vec2 vUv; uniform float uTime; uniform float uAmount; uniform vec3 uTint;
  void main(){
    // three drifting sine curtains, each fading upward from its own base line
    float x = vUv.x * 6.2831;
    float a = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float base = 0.22 + 0.16 * sin(x * (1.0 + fi * 0.7) + uTime * (0.22 + fi * 0.11) + fi * 2.1);
      float band = smoothstep(base, base + 0.05, vUv.y) * smoothstep(base + 0.55, base + 0.08, vUv.y);
      a += band * (0.5 - fi * 0.12);
    }
    // soften the curtain's side edges
    a *= smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    vec3 teal = vec3(0.25, 0.95, 0.72);
    vec3 violet = vec3(0.55, 0.45, 0.95);
    vec3 col = mix(teal, violet, vUv.y) * uTint;
    gl_FragColor = vec4(col * a * uAmount, a * 0.55 * uAmount);
  }
`;

export function AuroraVeil({ amount, tint = "#ffffff" }: { amount: number; tint?: string }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uAmount: { value: amount }, uTint: { value: new THREE.Color(tint) } }), []);
  uniforms.uTint.value.set(tint);
  uniforms.uAmount.value = amount;
  useFrame((_, dt) => { if (mat.current) mat.current.uniforms.uTime.value += dt; });
  if (amount <= 0.001) return null;
  return (
    <FollowCam z={-46}>
      <mesh position={[0, 10, 0]} scale={[130, 56, 1]}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial ref={mat} vertexShader={auroraVert} fragmentShader={auroraFrag} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </FollowCam>
  );
}

/* ---------------------------------- shafts --------------------------------- */

let _shaftTex: THREE.Texture | null = null;
function shaftTexture(): THREE.Texture {
  if (_shaftTex) return _shaftTex;
  const w = 64, h = 256;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const along = Math.sin(v * Math.PI); // fade both ends
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x / w - 0.5) * 2;
      const a = along * Math.max(0, 1 - dx * dx) * 0.55;
      ctx.fillStyle = `rgba(255,244,220,${a.toFixed(3)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  _shaftTex = new THREE.CanvasTexture(c);
  _shaftTex.colorSpace = THREE.SRGBColorSpace;
  return _shaftTex;
}

export function SolarShafts({ amount, tint = "#ffffff" }: { amount: number; tint?: string }) {
  const grp = useRef<THREE.Group>(null);
  const specs = useMemo(
    () => [
      { x: -16, tilt: 0.42, len: 70, w: 5.5, speed: 0.05, op: 0.16 },
      { x: 2, tilt: 0.36, len: 84, w: 7, speed: 0.035, op: 0.12 },
      { x: 18, tilt: 0.47, len: 64, w: 4.5, speed: 0.06, op: 0.15 },
    ],
    []
  );
  useFrame((state) => {
    if (!grp.current) return;
    const t = state.clock.elapsedTime;
    grp.current.children.forEach((child, i) => {
      const sp = specs[i];
      if (!sp) return;
      child.position.x = sp.x + Math.sin(t * sp.speed + i * 2.4) * 6;
      child.rotation.z = sp.tilt + Math.sin(t * sp.speed * 0.7 + i) * 0.05;
      const m = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = sp.op * amount * (0.7 + 0.3 * Math.sin(t * 0.3 + i * 1.7));
    });
  });
  if (amount <= 0.001) return null;
  return (
    <FollowCam z={-24}>
      <group ref={grp}>
        {specs.map((sp, i) => (
          <mesh key={i} position={[sp.x, 6, 0]} rotation={[0, 0, sp.tilt]} scale={[sp.w, sp.len, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={shaftTexture()} color={new THREE.Color("#ffe9c4").multiply(new THREE.Color(tint))} transparent opacity={sp.op * amount} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </FollowCam>
  );
}
