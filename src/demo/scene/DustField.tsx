import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * DUST FIELD (ref inspiration_002): a volume of fine drifting motes filling the
 * column — mostly cool violet with a scatter of warm-gold accents — rising slowly
 * with a gentle swirl and scintillating. One BufferGeometry of points driven by a
 * shader (additive, soft round), so thousands of motes cost one draw call.
 */
const vert = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uHeight;
  uniform float uPix;
  varying vec3 vColor;
  varying float vTw;
  void main(){
    vColor = aColor;
    vec3 p = position;
    // rise and wrap within the column height
    p.y = mod(p.y + uTime * 1.4 + uHeight, uHeight * 2.0) - uHeight;
    // gentle swirl around the column
    float sw = uTime * 0.15 + aPhase;
    p.x += sin(sw + p.y * 0.05) * 1.6;
    p.z += cos(sw * 0.9 + p.y * 0.05) * 1.6;
    vTw = 0.55 + 0.45 * sin(uTime * 2.0 + aPhase * 6.2831);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uPix * (300.0 / -mv.z) * (0.6 + vTw * 0.6);
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vTw;
  void main(){
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * (0.5 + vTw), a * a * (0.35 + vTw * 0.5));
  }
`;

// colour/motion presets — "cool" is the base dust; "ember"/"rain" are the
// shop-gated particle effects (warm rising embers / falling stardust)
const PALETTES: Record<string, { a: string; b: string; accent: string; accentOdds: number; sizeBase: number; speed: number }> = {
  cool: { a: "#c7b8ff", b: "#7fd0ff", accent: "#ffd28a", accentOdds: -1, sizeBase: 0.8, speed: 1 },
  ember: { a: "#ff9a4d", b: "#ff7a3c", accent: "#ffe0a8", accentOdds: 0.25, sizeBase: 1.5, speed: 1.9 },
  rain: { a: "#eef4ff", b: "#9fd8ff", accent: "#ffffff", accentOdds: 0.2, sizeBase: 0.7, speed: -3.2 },
};

export function DustField({ density, warm, pathLength, palette = "cool", speedMul = 1 }: { density: number; warm: number; pathLength: number; palette?: keyof typeof PALETTES; speedMul?: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const P = PALETTES[palette] ?? PALETTES.cool;
  const count = Math.round(THREE.MathUtils.clamp(density, 0, 1) * (palette === "cool" ? 1100 : 700));

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const colA = new THREE.Color(P.a);
    const colB = new THREE.Color(P.b);
    const accent = new THREE.Color(P.accent);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const r = 4 + Math.random() * 13;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * pathLength * 2;
      pos[i * 3 + 2] = Math.sin(a) * r;
      const odds = P.accentOdds < 0 ? warm : P.accentOdds;
      const isAccent = Math.random() < odds;
      c.copy(isAccent ? accent : Math.random() < 0.5 ? colA : colB);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      size[i] = (isAccent ? P.sizeBase * 1.7 : P.sizeBase) + Math.random() * 1.8;
      phase[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, warm, pathLength, palette]);

  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uHeight: { value: pathLength }, uPix: { value: 1 } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  uniforms.uHeight.value = pathLength;

  useFrame((state, dt) => {
    if (mat.current) mat.current.uniforms.uTime.value += dt * P.speed * speedMul;
    uniforms.uPix.value = state.size.height / 1000;
  });

  if (count === 0) return null;
  return (
    <points geometry={geom} frustumCulled={false} position={[0, pathLength / 2, 0]}>
      <shaderMaterial ref={mat} vertexShader={vert} fragmentShader={frag} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}
