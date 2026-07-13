import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * COMET STREAKS (ref inspiration_003): occasional comets arc across the backdrop
 * near the current view — a bright billboarded head trailing a fading additive
 * tail. A tiny pool respawns on a cadence set by `rate`; travel is kept in the
 * X/Y plane at a fixed depth so a single Z-rotation aligns the tail cleanly.
 */
const POOL = 3;

let _head: THREE.Texture | null = null;
function headTexture(): THREE.Texture {
  if (_head) return _head;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(220,240,255,0.6)");
  g.addColorStop(1, "rgba(160,200,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _head = new THREE.CanvasTexture(c);
  _head.colorSpace = THREE.SRGBColorSpace;
  return _head;
}
let _tail: THREE.Texture | null = null;
function tailTexture(): THREE.Texture {
  if (_tail) return _tail;
  const w = 256;
  const h = 32;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(230,245,255,0.95)");
  ctx.fillStyle = g;
  // teardrop: taper the height toward the tail tip
  ctx.beginPath();
  ctx.moveTo(w, h / 2 - h * 0.5);
  ctx.lineTo(w, h / 2 + h * 0.5);
  ctx.lineTo(0, h / 2);
  ctx.closePath();
  ctx.fill();
  _tail = new THREE.CanvasTexture(c);
  _tail.colorSpace = THREE.SRGBColorSpace;
  return _tail;
}

interface Comet {
  active: boolean;
  next: number; // clock time to (re)spawn
  born: number;
  life: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  len: number;
  tint: THREE.Color;
}

export function Comets({ rate, speedMul = 1 }: { rate: number; speedMul?: number }) {
  const { camera } = useThree();
  const groups = useRef<(THREE.Group | null)[]>([]);
  const tints = useMemo(() => [new THREE.Color("#cdeaff"), new THREE.Color("#e7c7ff"), new THREE.Color("#bff0ff")], []);
  const comets = useRef<Comet[]>(
    Array.from({ length: POOL }, (_, i) => ({
      active: false,
      next: 1.5 + i * 2.4,
      born: 0,
      life: 3,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      len: 6,
      tint: tints[i % tints.length],
    }))
  );

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    const r = THREE.MathUtils.clamp(rate, 0, 1);
    const interval = THREE.MathUtils.lerp(16, 3.5, r); // avg seconds between spawns
    for (let i = 0; i < POOL; i++) {
      const c = comets.current[i];
      const grp = groups.current[i];
      if (!grp) continue;
      if (!c.active) {
        grp.visible = false;
        if (r > 0.001 && t >= c.next) {
          // spawn crossing the view near the camera's current height
          const camY = camera.position.y;
          const dir = Math.random() < 0.5 ? 1 : -1;
          const startX = -dir * (26 + Math.random() * 10);
          const y = camY + (Math.random() - 0.35) * 34;
          const z = -6 - Math.random() * 22;
          c.pos.set(startX, y, z);
          const speed = (26 + Math.random() * 20) * speedMul;
          const angle = (Math.random() - 0.5) * 0.5 - 0.15; // mostly horizontal, slight tilt
          c.vel.set(dir * Math.cos(angle) * speed, Math.sin(angle) * speed - 3, 0);
          c.len = 5 + Math.random() * 7;
          c.life = 1.6 + Math.random() * 1.6;
          c.born = t;
          c.tint = tints[i % tints.length];
          c.active = true;
        }
        continue;
      }
      const age = t - c.born;
      if (age > c.life) {
        c.active = false;
        c.next = t + interval * (0.5 + Math.random());
        grp.visible = false;
        continue;
      }
      c.pos.addScaledVector(c.vel, dt);
      // fade in/out over life
      const fade = Math.sin((age / c.life) * Math.PI);
      grp.visible = true;
      grp.position.copy(c.pos);
      grp.rotation.z = Math.atan2(c.vel.y, c.vel.x);
      const head = grp.children[0] as THREE.Sprite;
      const tail = grp.children[1] as THREE.Mesh;
      (head.material as THREE.SpriteMaterial).opacity = fade;
      (head.material as THREE.SpriteMaterial).color.copy(c.tint);
      head.scale.setScalar(1.1 + fade * 0.6);
      tail.scale.set(c.len, 0.9 + fade * 0.5, 1);
      tail.position.set(-c.len / 2, 0, 0);
      (tail.material as THREE.MeshBasicMaterial).opacity = fade * 0.9;
      (tail.material as THREE.MeshBasicMaterial).color.copy(c.tint);
    }
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i} ref={(el) => (groups.current[i] = el)} visible={false}>
          <sprite scale={1.3}>
            <spriteMaterial map={headTexture()} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>
          <mesh>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={tailTexture()} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </>
  );
}
