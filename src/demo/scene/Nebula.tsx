import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Deep-space NEBULA backdrop — a huge inverted sphere the camera lives inside,
 * painted with animated fbm noise. Upgraded (ref inspiration_001 / 004): RIDGED
 * filaments carve bright thin veins through the gas, a tri-tone palette (deep base →
 * mid → hot accent) layers colour, density peaks bloom into glowing cores, and the
 * floor sits near-black so the wisps pop. Cheap (all fragment shader), no textures.
 */
const frag = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform float uTime;
  uniform vec3 uColA;      // deep base
  uniform vec3 uColB;      // mid
  uniform vec3 uColC;      // hot accent
  uniform float uIntensity;
  uniform float uFilaments; // 0..1 ridge strength

  float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 x){
    vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                   mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                   mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  // 4 octaves, not 5 — the finest octave is per-pixel grain that turns into
  // pixelated dots when a bright layer (the book's sector glow) lifts the sky
  // over the visibility threshold and the low-dpr canvas is upscaled on phones
  float fbm(vec3 p){
    float a=0.5, s=0.0;
    for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.02; a*=0.5; }
    return s;
  }
  // ridged fbm — sharp bright veins (1 - |2n-1|), stacked
  float ridged(vec3 p){
    float a=0.5, s=0.0;
    for(int i=0;i<4;i++){ float n=noise(p); n=1.0-abs(2.0*n-1.0); s+=a*n*n; p*=2.03; a*=0.5; }
    return s;
  }

  void main(){
    vec3 d = normalize(vDir);
    vec3 p = d*2.4 + vec3(0.0, uTime*0.018, uTime*0.012);
    float base = fbm(p);
    base = pow(base, 1.7);
    float veil = fbm(d*1.1 - vec3(0.0, uTime*0.008, 0.0));
    float fil = ridged(d*2.9 + vec3(uTime*0.01, uTime*0.02, 0.0));
    fil = pow(clamp(fil, 0.0, 1.0), 2.2);

    float m = clamp(base*0.65 + veil*0.45, 0.0, 1.0);
    // filaments add bright structured veins on top of the soft gas
    float density = clamp(m + fil * uFilaments * 0.9, 0.0, 1.4);

    // gate empty space to true black so the wisps pop (ref 001/005 — dark negative space)
    float soft = smoothstep(0.28, 1.0, density);

    // brighten the central column so the corridor glows
    float band = smoothstep(0.5, 0.0, abs(d.x)) * smoothstep(0.55, 0.0, abs(d.z));

    // tri-tone: base→mid across soft density, then punch toward the hot accent in veins/cores
    vec3 col = mix(uColA, uColB, smoothstep(0.15, 0.85, m));
    col = mix(col, uColC, clamp(fil * uFilaments * 1.2 + smoothstep(0.95, 1.3, density) * 0.5, 0.0, 1.0));
    col *= soft * (0.32 + density * 1.05) * uIntensity;
    // bright structured veins
    col += uColC * fil * fil * uFilaments * 0.55 * uIntensity;
    // glowing cores: where density is highest, add an emissive bloom-catching kick
    col += uColC * smoothstep(1.05, 1.4, density) * 0.7 * uIntensity;
    col += uColB * band * soft * 0.16 * uIntensity;
    // near-black deep-space floor
    col += vec3(0.004, 0.006, 0.013);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const vert = /* glsl */ `
  varying vec3 vDir;
  void main(){
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export function Nebula({ hueA, hueB, hueC, intensity, filaments }: { hueA: number; hueB: number; hueC: number; intensity: number; filaments: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColA: { value: new THREE.Color() },
      uColB: { value: new THREE.Color() },
      uColC: { value: new THREE.Color() },
      uIntensity: { value: intensity },
      uFilaments: { value: filaments },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // keep uniforms live as the editor changes them
  uniforms.uColA.value.setHSL(hueA, 0.8, 0.36);
  uniforms.uColB.value.setHSL(hueB, 0.72, 0.5);
  uniforms.uColC.value.setHSL(hueC, 0.85, 0.6);
  uniforms.uIntensity.value = intensity;
  uniforms.uFilaments.value = filaments;

  useFrame((_, dt) => {
    if (mat.current) mat.current.uniforms.uTime.value += dt;
  });

  return (
    <mesh scale={400} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[1, 48, 48]} />
      <shaderMaterial ref={mat} vertexShader={vert} fragmentShader={frag} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
