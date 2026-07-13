import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * The faint background starfield — replaces drei's <Stars>, whose shader made
 * every star pulse in sync (3+sin(t) on ALL sizes), tinted them across the full
 * hue wheel, and let sizes balloon to ~8px: on phones that read as pulsing
 * violet confetti (bug023/024). This field is deliberately tame: mostly-white
 * pinpricks with a hard size clamp, gentle per-star twinkle, additive (can only
 * brighten), and it follows the camera so density is uniform along the column.
 */
const vert = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPix;
  varying vec3 vColor;
  varying float vTw;
  void main(){
    vColor = aColor;
    // subtle PER-STAR twinkle — never a global pulse
    vTw = 0.72 + 0.28 * sin(uTime * (0.5 + aPhase * 1.8) + aPhase * 43.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float sz = aSize * uPix * (300.0 / -mv.z);
    gl_PointSize = clamp(sz, 1.1, 3.2); // pinpricks, never blobs
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
    float a = smoothstep(0.5, 0.1, d);
    gl_FragColor = vec4(vColor * vTw, a * vTw);
  }
`;

export function Starfield({ count }: { count: number }) {
  const grp = useRef<THREE.Group>(null);
  const mat = useRef<THREE.ShaderMaterial>(null);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    // white-dominant with the occasional gentle tint — like a real sky
    const tints = ["#ffffff", "#ffffff", "#ffffff", "#dfe8ff", "#ffeedd", "#cfe6ff"];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // spherical shell around the camera, biased outward
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = 70 + Math.random() * 80;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = s * Math.cos(a) * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = s * Math.sin(a) * r;
      c.set(tints[Math.floor(Math.random() * tints.length)]);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      size[i] = 0.8 + Math.random() * 1.4;
      phase[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPix: { value: 1 } }), []);

  useFrame((state, dt) => {
    if (mat.current) mat.current.uniforms.uTime.value += dt;
    uniforms.uPix.value = state.size.height / 1000;
    // stars sit at infinity: follow the camera so the field never parallaxes or thins
    if (grp.current) grp.current.position.y = state.camera.position.y;
  });

  if (count <= 0) return null;
  return (
    <group ref={grp}>
      <points geometry={geom} frustumCulled={false}>
        <shaderMaterial ref={mat} vertexShader={vert} fragmentShader={frag} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  );
}
