import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * GALAXY GLOW (ref inspiration_006): a distant edge-on galaxy far behind the
 * column — a broad soft disc with an intense bloomed core and a faint dust lane —
 * giving the ascent a luminous destination. Two additive billboards (halo + core)
 * that drift and slowly turn; the bright core is what the bloom pass blooms.
 */
let _disc: THREE.Texture | null = null;
function discTexture(): THREE.Texture {
  if (_disc) return _disc;
  const s = 512;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const mid = s / 2;
  const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  g.addColorStop(0, "rgba(255,240,220,1)");
  g.addColorStop(0.08, "rgba(255,210,180,0.85)");
  g.addColorStop(0.3, "rgba(220,150,200,0.35)");
  g.addColorStop(0.6, "rgba(150,110,220,0.12)");
  g.addColorStop(1, "rgba(80,60,140,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // a faint dark dust lane across the middle
  ctx.globalCompositeOperation = "destination-out";
  const lane = ctx.createLinearGradient(0, mid - 10, 0, mid + 10);
  lane.addColorStop(0, "rgba(0,0,0,0)");
  lane.addColorStop(0.5, "rgba(0,0,0,0.5)");
  lane.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = lane;
  ctx.fillRect(0, mid - 10, s, 20);
  _disc = new THREE.CanvasTexture(c);
  _disc.colorSpace = THREE.SRGBColorSpace;
  return _disc;
}

export function GalaxyGlow({ intensity, pathLength, tint = "#ffffff" }: { intensity: number; pathLength: number; tint?: string }) {
  const grp = useRef<THREE.Group>(null);
  const tex = useMemo(() => discTexture(), []);
  useFrame((state) => {
    if (!grp.current) return;
    const t = state.clock.elapsedTime;
    grp.current.rotation.z = 0.35 + Math.sin(t * 0.03) * 0.05;
    grp.current.position.x = Math.sin(t * 0.02) * 4;
  });
  if (intensity <= 0.001) return null;
  return (
    <group ref={grp} position={[10, pathLength * 0.62, -150]}>
      {/* broad soft disc, tilted to read edge-on */}
      <mesh scale={[150, 60, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={tex} color={tint} transparent opacity={0.5 * intensity} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      {/* hot bloomed core */}
      <mesh scale={[26, 26, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={tex} color={tint} transparent opacity={0.9 * intensity} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  );
}
