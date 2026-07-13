import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Sparkles, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SceneObject } from "../scene-model";

/**
 * Per-model MATERIAL TREATMENT — Meshy bakes matte single-material textures, so the
 * glassy / glowing / reflective look is added here in three.js. `glass` swaps in a
 * transmissive physical material; `glow` lights the texture's own colours as emissive.
 */
interface Treatment {
  glass?: boolean;
  glow?: number; // emissive intensity driven by the base-colour map
  roughness?: number;
  metalness?: number;
  env?: number; // envMapIntensity (reflection strength)
  ior?: number;
  transmission?: number;
}
const TREATMENTS: Record<string, Treatment> = {
  // GEMS/CRYSTAL — glassy transmissive look (distinct from the metals' reflective shine)
  comet: { glass: true, glow: 0.55, roughness: 0.06, ior: 1.35, transmission: 0.55, env: 1.7 },
  // a blazing crystal reactor — the central gem glows intensely, less see-through so it reads solid-bright
  core: { glass: true, glow: 2.8, roughness: 0.06, ior: 1.4, transmission: 0.24, env: 2.0 },
  // emissiveMap = the base texture, so only the bright bits (gems / cracks / portal) glow
  "asteroid-gem": { glow: 0.5, env: 1.3, roughness: 0.4 }, // gems glow, rock stays matte
  "asteroid-ruby": { glow: 0.6, env: 1.3, roughness: 0.4 },
  "rock-b": { glow: 0.7, env: 1.0 }, // teal cracks glow
  "rock-lava": { glow: 1.4, env: 1.0 }, // molten cracks glow hot
  gate: { glow: 1.2, env: 1.6, roughness: 0.3 }, // portal + ring gems glow (brighter centre)
  // METAL — boosted environment reflection for a shiny metallic quality (not glassy)
  "satellite-img": { env: 1.8 },
  rocket: { env: 1.6 },
  miner: { glow: 0.6, env: 1.5 }, // orange nozzles + white eye lens self-illuminate
  beacon: { env: 1.6 },
  voyager: { metalness: 0.7, roughness: 0.28, env: 1.9 }, // more metallic + reflective
};

function treatModel(root: THREE.Object3D, t: Treatment) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    if (!src) return;
    if (t.glass) {
      mesh.material = new THREE.MeshPhysicalMaterial({
        map: src.map,
        normalMap: src.normalMap,
        color: src.color,
        metalness: t.metalness ?? 0.0,
        roughness: t.roughness ?? 0.1,
        transmission: t.transmission ?? 0.5,
        thickness: 1.4,
        ior: t.ior ?? 1.4,
        transparent: true,
        envMapIntensity: t.env ?? 1.5,
        emissiveMap: src.map,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: t.glow ?? 0.4,
        clearcoat: 0.5,
        clearcoatRoughness: 0.25,
      });
    } else {
      if (t.glow != null) { src.emissiveMap = src.map; src.emissive = new THREE.Color(0xffffff); src.emissiveIntensity = t.glow; }
      if (t.roughness != null) src.roughness = t.roughness;
      if (t.metalness != null) src.metalness = t.metalness;
      if (t.env != null) src.envMapIntensity = t.env;
      src.needsUpdate = true;
    }
  });
}

/** Load an optimised Meshy .glb, recentre it and normalise to a ~2u fit so per-object
 *  scale behaves. `fadeIn` eases the model in (opacity + a touch of scale) the moment
 *  it arrives — models load at their own pace, so props phase in one by one instead
 *  of snapping. Skipped for travel-motion objects (their spawn cycle fades them). */
function GLBModel({ id, fadeIn = true }: { id: string; fadeIn?: boolean }) {
  const { scene } = useGLTF(`/models3d/${id}/model.opt.glb`);
  const { obj, baseScale, mats } = useMemo(() => {
    const root = scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    root.position.sub(center);
    const treat = TREATMENTS[id];
    if (treat) treatModel(root, treat);
    const wrap = new THREE.Group();
    wrap.add(root);
    const baseScale = 2 / maxDim;
    wrap.scale.setScalar(baseScale);
    // snapshot original material transparency so the fade can restore it exactly
    const mats: { m: THREE.Material; t: boolean; o: number }[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (m) mats.push({ m, t: m.transparent, o: m.opacity });
      }
    });
    return { obj: wrap, baseScale, mats };
  }, [scene, id]);

  const born = useRef(-1);
  const done = useRef(!fadeIn);
  useFrame((state) => {
    if (done.current) return;
    const t = state.clock.elapsedTime;
    if (born.current < 0) born.current = t;
    const k = Math.min(1, (t - born.current) / 0.8);
    const e = 1 - Math.pow(1 - k, 3); // ease-out
    obj.scale.setScalar(baseScale * (0.94 + 0.06 * e));
    for (const { m, t: origT, o } of mats) {
      if (k < 1) {
        m.transparent = true;
        m.opacity = o * e;
      } else {
        m.transparent = origT;
        m.opacity = o;
      }
    }
    if (k >= 1) done.current = true;
  });

  return <primitive object={obj} />;
}

export const LATERAL_SPAN = 7.5;
export const DEPTH_SPAN = 8;

// a soft radial glow sprite, generated once and tinted per-object
let _glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (_glowTex) return _glowTex;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(0.6, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

// ─── PROCEDURAL PLANET ───────────────────────────────────────────────────────
// A real sphere with a noise-painted equirectangular surface (so the scene lights
// carve a day/night terminator — ref inspiration_005), a fresnel atmosphere halo,
// and shader-banded rings. Perfect geometry that Meshy can't give us.

function h3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return lerp(
    lerp(lerp(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), lerp(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
    lerp(lerp(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), lerp(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v),
    w
  );
}
function fbm3(x: number, y: number, z: number): number {
  let a = 0.5, s = 0;
  for (let i = 0; i < 5; i++) {
    s += a * vnoise(x, y, z);
    x *= 2.03;
    y *= 2.03;
    z *= 2.03;
    a *= 0.5;
  }
  return s;
}

/** Paint an equirectangular planet surface + a matching normal map so the scene
 *  lights carve real relief (craters / storm bands) — gives the worlds depth. */
function usePlanetMaps(seed: number, baseColor: string, banded: number) {
  return useMemo(() => {
    const w = 512, h = 256;
    // pass 1 — height field (seamless, sampled on the sphere direction)
    const H = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const lat = (y / h - 0.5) * Math.PI;
      const cy = Math.sin(lat), cr = Math.cos(lat);
      for (let x = 0; x < w; x++) {
        const lon = (x / w) * Math.PI * 2;
        const dx = Math.cos(lon) * cr, dz = Math.sin(lon) * cr;
        const blotch = fbm3(dx * 2.6 + seed, cy * 2.6 + seed * 0.7, dz * 2.6 - seed);
        const detail = fbm3(dx * 6.5 + seed, cy * 6.5, dz * 6.5) * 0.32;
        const bandN = Math.sin(cy * 9 + fbm3(dx * 1.2, cy * 3.5, dz * 1.2) * 3.5) * 0.5 + 0.5;
        H[y * w + x] = Math.min(1, Math.max(0, (blotch * (1 - banded) + bandN * banded) * 0.82 + detail));
      }
    }
    // pass 2 — colour map (richer palette + storm tint + poles)
    const cc = document.createElement("canvas");
    cc.width = w; cc.height = h;
    const cx = cc.getContext("2d")!;
    const img = cx.createImageData(w, h);
    const base = new THREE.Color(baseColor);
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    const tmp = new THREE.Color();
    for (let y = 0; y < h; y++) {
      const cy = Math.sin((y / h - 0.5) * Math.PI);
      const pole = Math.pow(Math.abs(cy), 3);
      for (let x = 0; x < w; x++) {
        const n = H[y * w + x];
        const shade = 0.42 + n * 1.0; // stronger light/dark for depth
        tmp.setHSL((hsl.h + (n - 0.5) * 0.08 + 1) % 1, Math.max(0.05, hsl.s - pole * 0.35 + (n - 0.5) * 0.15), Math.min(0.96, hsl.l * shade + pole * 0.4));
        const i = (y * w + x) * 4;
        img.data[i] = tmp.r * 255; img.data[i + 1] = tmp.g * 255; img.data[i + 2] = tmp.b * 255; img.data[i + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    const map = new THREE.CanvasTexture(cc);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    // pass 3 — normal map from the height gradient (the "depth")
    const nc = document.createElement("canvas");
    nc.width = w; nc.height = h;
    const nx = nc.getContext("2d")!;
    const nimg = nx.createImageData(w, h);
    const S = 2.6;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const l = H[y * w + ((x - 1 + w) % w)], r = H[y * w + ((x + 1) % w)];
        const u = H[((y - 1 + h) % h) * w + x], d = H[((y + 1) % h) * w + x];
        let a = (l - r) * S, b = (u - d) * S;
        const len = Math.hypot(a, b, 1);
        a /= len; b /= len;
        const i = (y * w + x) * 4;
        nimg.data[i] = (a * 0.5 + 0.5) * 255; nimg.data[i + 1] = (b * 0.5 + 0.5) * 255; nimg.data[i + 2] = (1 / len) * 255; nimg.data[i + 3] = 255;
      }
    }
    nx.putImageData(nimg, 0, 0);
    const normalMap = new THREE.CanvasTexture(nc);
    normalMap.anisotropy = 4;
    return { map, normalMap };
  }, [seed, baseColor, banded]);
}

// a soft atmospheric halo: transparent core, a gentle bright band right at the
// planet's edge, fading out into space — hugs the sphere with no detached ring.
let _atmoTex: THREE.Texture | null = null;
function atmosphereTexture(): THREE.Texture {
  if (_atmoTex) return _atmoTex;
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, "rgba(255,255,255,0)");
  g.addColorStop(0.52, "rgba(255,255,255,0)");
  g.addColorStop(0.70, "rgba(255,255,255,0.85)"); // peak sits at the planet's limb
  g.addColorStop(0.80, "rgba(255,255,255,0.34)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _atmoTex = new THREE.CanvasTexture(c);
  _atmoTex.colorSpace = THREE.SRGBColorSpace;
  return _atmoTex;
}
/** A camera-facing halo whose bright band lands on the planet's edge (scale 2.85 ≈
 *  edge at the gradient's 0.70 peak) — soft atmosphere that fades into space. */
function Atmosphere({ color, intensity = 1 }: { color: string; intensity?: number }) {
  const tint = useMemo(() => new THREE.Color(color), []);
  tint.set(color);
  return (
    <Billboard>
      <mesh scale={2.85}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={atmosphereTexture()} color={tint} transparent opacity={0.9 * intensity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

const ringFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uInner; uniform float uOuter;
  varying vec2 vLocal;
  float hash(float n){ return fract(sin(n)*43758.5453); }
  void main(){
    float r = length(vLocal);
    float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
    // concentric bands with gaps
    float bands = 0.5 + 0.5 * sin(t * 46.0);
    float gap = smoothstep(0.0, 0.06, abs(sin(t * 9.0)));
    float edge = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.86, t);
    float a = edge * gap * (0.35 + bands * 0.5);
    gl_FragColor = vec4(uColor * (0.7 + bands * 0.6), a);
  }
`;
const ringVert = /* glsl */ `
  varying vec2 vLocal;
  void main(){ vLocal = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
function PlanetRing({ color, inner, outer }: { color: string; inner: number; outer: number }) {
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color(color) }, uInner: { value: inner }, uOuter: { value: outer } }), []);
  uniforms.uColor.value.set(color);
  return (
    <mesh rotation={[Math.PI / 2.3, 0.18, 0]}>
      <ringGeometry args={[inner, outer, 128, 1]} />
      <shaderMaterial vertexShader={ringVert} fragmentShader={ringFrag} uniforms={uniforms} side={THREE.DoubleSide} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </mesh>
  );
}

/** A small procedural moon orbiting the planet on a gently tilted, bobbing path. */
function OrbitMoon() {
  const ref = useRef<THREE.Group>(null);
  const maps = usePlanetMaps(31, "#9aa0b8", 0.12);
  const ns = useMemo(() => new THREE.Vector2(1.0, 1.0), []);
  useFrame((s) => {
    if (!ref.current) return;
    const t = s.clock.elapsedTime * 0.32;
    ref.current.position.set(Math.cos(t) * 2.7, Math.sin(t * 0.7) * 0.55, Math.sin(t) * 2.7);
    ref.current.rotation.y += 0.004;
  });
  return (
    <group ref={ref}>
      <mesh scale={0.26} rotation={[0.35, 0, 0]}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial map={maps.map} normalMap={maps.normalMap} normalScale={ns} roughness={0.95} metalness={0.03} />
      </mesh>
    </group>
  );
}

function Planet({ o }: { o: SceneObject }) {
  const seed = useMemo(() => (o.name.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) % 97) + o.t * 13, [o.name, o.t]);
  const banded = useMemo(() => 0.35 + (seed % 5) / 8, [seed]); // some worlds gassy-banded, some blotchy
  const maps = usePlanetMaps(seed, o.color, banded);
  const normalScale = useMemo(() => new THREE.Vector2(0.85, 0.85), []);
  const atmo = o.emissive && o.emissive !== "#000000" ? o.emissive : o.color;
  return (
    <group>
      <mesh>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial map={maps.map} normalMap={maps.normalMap} normalScale={normalScale} roughness={0.88} metalness={0.06} emissive={atmo} emissiveIntensity={o.emissiveIntensity * 0.22} />
      </mesh>
      <Atmosphere color={atmo} intensity={1.05} />
      {o.effects.ring && <PlanetRing color={atmo} inner={1.4} outer={2.3} />}
      {o.orbitMoon && <OrbitMoon />}
    </group>
  );
}

/** A rocky, irregular geometry — a subdivided icosahedron pushed around by hash noise. */
function useRockGeometry(seed: number) {
  return useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 4);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const h = (x: number) => {
      const s = Math.sin(x * 12.9898 + seed) * 43758.5453;
      return s - Math.floor(s);
    };
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = h(v.x * 3.1) * 0.3 + h(v.y * 2.3 + 4) * 0.3 + h(v.z * 4.7 + 9) * 0.4;
      const d = 1 + (n - 0.5) * 0.55 + Math.sin(v.y * 5 + seed) * 0.08;
      v.multiplyScalar(d);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }, [seed]);
}

function Mat({ o }: { o: SceneObject }) {
  return (
    <meshStandardMaterial
      color={o.color}
      emissive={o.emissive}
      emissiveIntensity={o.emissiveIntensity}
      metalness={o.metalness}
      roughness={o.roughness}
      flatShading={o.kind === "asteroid"}
    />
  );
}

function Body({ o }: { o: SceneObject }) {
  const rock = useRockGeometry(o.name.length + o.t * 100);
  if (o.model) {
    return (
      <Suspense fallback={null}>
        <GLBModel id={o.model} fadeIn={!o.motion || o.motion === "hover"} />
      </Suspense>
    );
  }
  switch (o.kind) {
    case "planet":
      return <Planet o={o} />;
    case "asteroid":
      return (
        <>
          <mesh geometry={rock}>
            <Mat o={o} />
          </mesh>
          {/* embedded gems — small emissive octahedra */}
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2 + o.t;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.75, Math.sin(a * 1.7) * 0.6, Math.sin(a) * 0.75]} rotation={[a, a * 2, 0]} scale={0.18}>
                <octahedronGeometry args={[1, 0]} />
                <meshStandardMaterial color={o.emissive} emissive={o.emissive} emissiveIntensity={1.8} metalness={0.1} roughness={0.15} />
              </mesh>
            );
          })}
        </>
      );
    case "crystal":
      return (
        <group>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            const h = 1.1 + (i % 3) * 0.5;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.35, (i % 3) * 0.2 - 0.2, Math.sin(a) * 0.35]} rotation={[Math.sin(a) * 0.3, a, Math.cos(a) * 0.35]} scale={[0.35, h, 0.35]}>
                <octahedronGeometry args={[1, 0]} />
                <meshStandardMaterial color={o.color} emissive={o.emissive} emissiveIntensity={o.emissiveIntensity} metalness={o.metalness} roughness={o.roughness} transparent opacity={0.9} />
              </mesh>
            );
          })}
        </group>
      );
    case "station":
      return (
        <group>
          <mesh scale={[0.55, 1.4, 0.55]}>
            <cylinderGeometry args={[1, 1, 1, 12]} />
            <Mat o={o} />
          </mesh>
          <mesh position={[0, 0.2, 0]} scale={[1.5, 0.35, 1.0]}>
            <boxGeometry args={[1, 1, 1]} />
            <Mat o={o} />
          </mesh>
          {/* solar panels */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 1.7, 0.2, 0]} rotation={[0, 0, 0]} scale={[1.4, 0.9, 0.05]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#1c2a55" emissive="#2b4cff" emissiveIntensity={0.5} metalness={0.6} roughness={0.35} />
            </mesh>
          ))}
          {/* beacon */}
          <mesh position={[0, 0.95, 0]} scale={0.16}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial color={o.emissive} emissive={o.emissive} emissiveIntensity={3} />
          </mesh>
        </group>
      );
    case "gate":
      return (
        <group>
          <mesh rotation={[0, 0, 0]}>
            <torusGeometry args={[1.1, 0.16, 24, 80]} />
            <Mat o={o} />
          </mesh>
          {/* the portal membrane */}
          <mesh>
            <circleGeometry args={[1.05, 64]} />
            <meshBasicMaterial color={o.emissive} transparent opacity={0.35} side={THREE.DoubleSide} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      );
    case "core":
      return (
        <group>
          <mesh>
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial color={o.color} emissive={o.emissive} emissiveIntensity={o.emissiveIntensity} metalness={o.metalness} roughness={o.roughness} flatShading />
          </mesh>
          {/* radiant shell */}
          <mesh scale={1.35}>
            <icosahedronGeometry args={[1, 1]} />
            <meshBasicMaterial color={o.emissive} transparent opacity={0.14} side={THREE.BackSide} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      );
  }
}

// an animated swirling portal disc — layered over the gate's baked vortex so it moves
const swirlVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const swirlFrag = /* glsl */ `
  precision highp float; varying vec2 vUv; uniform float uTime; uniform vec3 uColA; uniform vec3 uColB;
  void main(){
    vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float spiral = 0.5 + 0.5 * sin(a * 2.0 - log(r + 0.06) * 7.0 + uTime * 3.0);
    float glow = smoothstep(1.0, 0.0, r);
    vec3 col = mix(uColA, uColB, spiral);
    float alpha = glow * (0.3 + 0.7 * spiral) * (1.0 - smoothstep(0.6, 1.0, r));
    gl_FragColor = vec4(col * (1.1 + spiral * 0.8), alpha);
  }
`;
function PortalSwirl({ radius }: { radius: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uColA: { value: new THREE.Color("#37c8ff") }, uColB: { value: new THREE.Color("#ff7ad9") } }), []);
  useFrame((_, dt) => { if (mat.current) mat.current.uniforms.uTime.value += dt; });
  return (
    <Billboard>
      <mesh scale={radius * 2}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial ref={mat} vertexShader={swirlVert} fragmentShader={swirlFrag} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

// a soft, feathered flame plume — white/grayscale so it can be tinted per thruster.
// Rounded taper + fade-in at the nozzle + squared radial falloff so no hard triangle edge.
let _flameTex: THREE.Texture | null = null;
function flameTexture(): THREE.Texture {
  if (_flameTex) return _flameTex;
  const w = 96, h = 160;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    const v = y / h; // 0 nozzle (top) → 1 tip (bottom)
    const hw = 0.5 * Math.pow(1 - v, 0.6) + 0.03; // rounded taper
    const along = Math.pow(Math.max(0, 1 - v * 1.02), 1.2) * Math.min(1, v * 7.0); // feather both ends
    const white = Math.round(200 + (1 - v) * 55);
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x / w - 0.5) / hw;
      const rad = Math.max(0, 1 - dx * dx);
      const a = along * rad * rad; // soft feathered edges
      ctx.fillStyle = `rgba(255,${white},${Math.round(white * 0.82)},${a.toFixed(3)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  _flameTex = new THREE.CanvasTexture(c);
  _flameTex.colorSpace = THREE.SRGBColorSpace;
  return _flameTex;
}
/** A flickering thruster plume + light at an object's underside (miner, rocket). */
function FlameJet({ color = "#ffa42a", len = 1.7, dist = 9, intensity = 3, ox = 0, oy = -0.98, oz = 0 }: { color?: string; len?: number; dist?: number; intensity?: number; ox?: number; oy?: number; oz?: number }) {
  const grp = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame((s) => {
    const f = 0.7 + 0.3 * Math.sin(s.clock.elapsedTime * 28) * Math.sin(s.clock.elapsedTime * 13);
    if (grp.current) grp.current.scale.set(1, 0.85 + f * 0.3, 1);
    if (light.current) light.current.intensity = intensity + f * intensity;
  });
  return (
    <group position={[ox, oy, oz]}>
      <group ref={grp}>
        <Billboard>
          <mesh position={[0, -len * 0.44, 0]}>
            <planeGeometry args={[len * 0.55, len]} />
            <meshBasicMaterial map={flameTexture()} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
        </Billboard>
      </group>
      <pointLight ref={light} color={color} distance={dist} decay={2} position={[0, -0.35, 0]} />
    </group>
  );
}
// a soft volumetric ray — fresnel fades the edges (no hard wedge), length fades the tip
const beamVert = /* glsl */ `
  varying float vA; varying vec3 vN; varying vec3 vV;
  void main(){
    vA = clamp((position.y + 1.6) / 3.2, 0.0, 1.0);
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const beamFrag = /* glsl */ `
  precision mediump float; varying float vA; varying vec3 vN; varying vec3 vV; uniform vec3 uColor;
  void main(){
    float facing = abs(dot(normalize(vN), normalize(vV)));
    // vA=1 at the apex (on the lens) → bright there, fading to the far tip; soft fresnel edges
    float a = pow(facing, 1.6) * smoothstep(0.0, 0.32, vA) * 0.32;
    gl_FragColor = vec4(uColor * (1.0 + a), a);
  }`;
/** The voyager's engine flow — a glowing rear thruster + a trailing particle stream (+X = rear). */
function VoyagerFlow() {
  const light = useRef<THREE.PointLight>(null);
  useFrame((s) => { if (light.current) light.current.intensity = 2 + Math.abs(Math.sin(s.clock.elapsedTime * 20)) * 1.6; });
  return (
    <group position={[0.95, 0.08, 0]}>
      <pointLight ref={light} color="#8fd8ff" distance={6} decay={2} />
      <Billboard>
        <mesh scale={0.8}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={glowTexture()} color="#bfe6ff" transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </Billboard>
      <Sparkles count={18} scale={[3, 0.5, 0.5]} position={[1.4, 0, 0]} size={3} speed={1.2} opacity={0.7} color="#bfe6ff" />
    </group>
  );
}
/** The miner's eye: a glowing lens, a warm light, and a soft light ray FROM the lens. */
function EyeBeam() {
  const beam = useMemo(() => ({ uColor: { value: new THREE.Color("#caa4ff") } }), []);
  const eye = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((s) => { if (eye.current) eye.current.opacity = 0.7 + 0.3 * Math.sin(s.clock.elapsedTime * 4); });
  return (
    <group position={[0, 0.08, 0.34]}>
      <mesh scale={0.15}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial ref={eye} color="#e6d2ff" transparent toneMapped={false} />
      </mesh>
      <pointLight color="#c489ff" intensity={3} distance={7} decay={2} />
      {/* cone base sits ON the lens (z≈0), apex extends forward — beam starts at the eye */}
      <mesh position={[0, 0, 1.55]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.4, 3.2, 32, 1, true]} />
        <shaderMaterial vertexShader={beamVert} fragmentShader={beamFrag} uniforms={beam} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The Master Core's heartbeat — a pulsing warm light + halo. */
function CorePulse({ scale }: { scale: number }) {
  const light = useRef<THREE.PointLight>(null);
  const halo = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const p = 0.55 + 0.45 * Math.sin(s.clock.elapsedTime * 1.5);
    if (light.current) light.current.intensity = (4 + p * 6) * scale;
    if (halo.current) {
      const sc = scale * (3.6 + p * 1.5);
      halo.current.scale.set(sc, sc, sc);
      (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.34 + p * 0.4;
    }
  });
  return (
    <>
      <pointLight ref={light} color="#ffd9a0" distance={scale * 26} decay={2} />
      <Billboard>
        <mesh ref={halo}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={glowTexture()} color="#ffe2b4" transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </Billboard>
    </>
  );
}

const DRIFT = 15; // vertical travel band for driftUp before respawn
const ss = (a: number, b: number, x: number) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

export function Landmark({ o, selected, onSelect, pathLength }: { o: SceneObject; selected: boolean; onSelect: () => void; pathLength: number }) {
  const grp = useRef<THREE.Group>(null);
  const rootRef = useRef<THREE.Group>(null);
  const mref = useRef({ offY: NaN, hideUntil: 0 });
  const base = useMemo(() => new THREE.Vector3(o.lateral * LATERAL_SPAN, 0, o.depth * DEPTH_SPAN), [o.lateral, o.depth]);
  const emissiveColor = useMemo(() => new THREE.Color(o.effects.light ? o.emissive : "#ffffff"), [o.effects.light, o.emissive]);
  const phase = useMemo(() => (o.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 100) / 100, [o.name]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const camRel = state.camera.position.y - o.t * pathLength;
    if (grp.current) {
      grp.current.rotation.y = o.rotation[1] + t * o.spin * 0.35;
      grp.current.position.y = Math.sin(t * 0.5 + o.t * 12) * o.bob;
    }
    const root = rootRef.current;
    if (!root) return;
    let ox = 0, oy = 0, oz = 0, fade = 1;
    const m = mref.current;
    if (o.motion === "driftUp") {
      if (Number.isNaN(m.offY)) m.offY = -DRIFT + phase * 2 * DRIFT;
      if (t < m.hideUntil) fade = 0;
      else {
        m.offY += Math.min(dt, 0.05) * 1.7 * (o.motionSpeed ?? 1);
        if (m.offY > DRIFT) { m.offY = -DRIFT; m.hideUntil = t + 5; fade = 0; } // respawn after 5s
        oy = m.offY;
        fade = ss(-DRIFT, -DRIFT + 4, m.offY) * ss(DRIFT, DRIFT - 4, m.offY); // fade in on spawn / out before respawn
      }
    } else if (o.motion === "hover") {
      ox = Math.sin(t * 0.6 + phase * 6.28) * 0.9;
      oy = Math.cos(t * 0.47 + phase * 6.28) * 0.7;
      oz = Math.sin(t * 0.38 + phase) * 0.6;
    } else if (o.motion === "flyby") {
      // comet: nose points down-left → streaks diagonally down from top-right
      const period = 13, passDur = 3.8;
      const local = (t + phase * period) % period;
      if (local > passDur) fade = 0;
      else {
        const k = local / passDur;
        const slot = Math.floor(t / period + phase) % 3;
        oz = [-3, 3, -11][slot];
        ox = 36 - k * 74;
        oy = camRel + 30 - k * 56;
        fade = ss(0, 0.12, k) * ss(1, 0.86, k);
      }
    } else if (o.motion === "cruise") {
      // voyager: nose points -X → cruises left with a slight downward diagonal
      const period = 18, passDur = 6;
      const local = (t + phase * period) % period;
      if (local > passDur) fade = 0;
      else {
        const k = local / passDur;
        const slot = Math.floor(t / period + phase) % 3;
        oz = [0, -8, 4][slot];
        ox = 42 - k * 84;
        oy = camRel + [6, -3, 10][slot] - k * 8;
        fade = ss(0, 0.1, k) * ss(1, 0.9, k);
      }
    }
    root.position.set(base.x + ox, base.y + oy, base.z + oz);
    root.visible = fade > 0.01;
    if (o.motion && o.motion !== "hover") {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) if (mat) { mat.transparent = true; mat.opacity = fade; }
      });
    }
  });

  return (
    <group position={base} ref={rootRef}>
      <group
        ref={grp}
        rotation={[o.rotation[0], o.rotation[1], o.rotation[2]]}
        scale={o.scale}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <Body o={o} />
        {/* miner extras live inside the spun body so the flame/eye track the model */}
        {o.model === "miner" && (
          <>
            <FlameJet color="#ffb24a" len={1.1} ox={0.03} oy={-0.9} oz={-0.45} intensity={3.5} dist={7} />
            <EyeBeam />
          </>
        )}
        {o.model === "rocket" && <FlameJet color="#bfe6ff" len={2.6} dist={13} intensity={4} oy={-1.0} />}
        {o.model === "voyager" && <VoyagerFlow />}
        {selected && (
          <mesh scale={1.14}>
            <icosahedronGeometry args={[1, 1]} />
            <meshBasicMaterial color="#9d7bff" wireframe transparent opacity={0.35} toneMapped={false} />
          </mesh>
        )}
      </group>

      {/* effects sit OUTSIDE the spun/scaled body so they read cleanly */}
      {o.effects.light && <pointLight color={o.emissive} intensity={o.effects.lightIntensity * o.scale * 2} distance={o.scale * 22} decay={2} />}
      {o.effects.halo && (
        <Billboard>
          <mesh scale={o.scale * 4.5}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={glowTexture()} color={o.emissive} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </Billboard>
      )}
      {o.effects.ring && o.kind !== "planet" && (
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={o.scale}>
          <torusGeometry args={[1.9, 0.03, 12, 96]} />
          <meshBasicMaterial color={o.emissive} transparent opacity={0.7} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
      {o.effects.dust && <Sparkles count={40} scale={o.scale * 6} size={3} speed={0.3} opacity={0.6} color={emissiveColor} />}

      {/* gate: a moving swirl over the baked portal + energy motes drawn around it */}
      {o.model === "gate" && (
        <>
          <PortalSwirl radius={o.scale * 0.82} />
          <Sparkles count={30} scale={o.scale * 2.4} size={4} speed={0.6} opacity={0.7} color="#9fe6ff" />
          <pointLight color="#8fd8ff" intensity={o.scale * 3.2} distance={o.scale * 22} decay={2} />
          <Billboard>
            <mesh scale={o.scale * 2.3}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial map={glowTexture()} color="#a8e0ff" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
          </Billboard>
        </>
      )}
      {o.model === "core" && <CorePulse scale={o.scale} />}
    </group>
  );
}
