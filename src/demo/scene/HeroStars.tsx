import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * HERO STARS (ref inspiration_004): a handful of bright stars with 4-point
 * diffraction spikes + a soft flare, scattered far out and twinkling. They sit
 * on top of the dense faint starfield to give the sky a few focal sparkles that
 * the bloom pass catches. Cheap: N camera-facing sprites sharing one texture.
 */

let _tex: THREE.Texture | null = null;
function spikeTexture(): THREE.Texture {
  if (_tex) return _tex;
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const mid = s / 2;
  // soft round glow
  const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.12, "rgba(255,255,255,0.85)");
  g.addColorStop(0.35, "rgba(210,225,255,0.28)");
  g.addColorStop(1, "rgba(150,180,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // 4-point diffraction spikes (thin bright beams)
  ctx.globalCompositeOperation = "lighter";
  const beam = (w: number, h: number) => {
    const lg = ctx.createLinearGradient(mid - w, 0, mid + w, 0);
    lg.addColorStop(0, "rgba(255,255,255,0)");
    lg.addColorStop(0.5, "rgba(255,255,255,0.9)");
    lg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(mid - w, mid - h, w * 2, h * 2);
  };
  beam(2.2, mid); // vertical
  ctx.save();
  ctx.translate(mid, mid);
  ctx.rotate(Math.PI / 2);
  ctx.translate(-mid, -mid);
  beam(2.2, mid); // horizontal
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _tex = t;
  return t;
}

interface Star {
  pos: [number, number, number];
  size: number;
  tint: THREE.Color;
  phase: number;
  speed: number;
}

export function HeroStars({ count, pathLength }: { count: number; pathLength: number }) {
  const grp = useRef<THREE.Group>(null);
  const tex = spikeTexture();
  const stars = useMemo<Star[]>(() => {
    // deterministic-ish scatter so it doesn't reshuffle every render
    const rand = (n: number) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const tints = ["#ffffff", "#bcd4ff", "#e7c7ff", "#a9ecff", "#ffe6b0"];
    return Array.from({ length: Math.max(0, Math.round(count)) }, (_, i) => {
      const a = rand(i + 1) * Math.PI * 2;
      const r = 60 + rand(i + 7) * 60;
      const y = (rand(i + 3) - 0.1) * pathLength * 1.2;
      const depth = -20 - rand(i + 5) * 55;
      return {
        pos: [Math.cos(a) * r * 0.6, y, depth + Math.sin(a) * r * 0.3] as [number, number, number],
        size: 2.6 + rand(i + 11) * 5.5,
        tint: new THREE.Color(tints[Math.floor(rand(i + 13) * tints.length)]),
        phase: rand(i + 17) * Math.PI * 2,
        speed: 0.6 + rand(i + 19) * 1.8,
      };
    });
  }, [count, pathLength]);

  useFrame((state) => {
    if (!grp.current) return;
    const t = state.clock.elapsedTime;
    grp.current.children.forEach((child, i) => {
      const s = stars[i];
      if (!s) return;
      const tw = 0.62 + 0.38 * Math.sin(t * s.speed + s.phase);
      child.scale.setScalar(s.size * (0.75 + tw * 0.45));
      const m = (child as THREE.Sprite).material as THREE.SpriteMaterial;
      m.opacity = 0.5 + tw * 0.5;
    });
  });

  return (
    <group ref={grp}>
      {stars.map((s, i) => (
        <sprite key={i} position={s.pos} scale={s.size}>
          <spriteMaterial map={tex} color={s.tint} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
}
