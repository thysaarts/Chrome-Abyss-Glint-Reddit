import { useEffect, useState } from "react";
import { TileGem } from "./TileGem";
import { ZENITH } from "../game/engine";

/**
 * THE ZENITH ARRIVAL — shown once at GLINT RUSH the moment the Zenith is dealt (see
 * commitFinal in useNebuliteGame). A soft lime-tinted light overlay lifts the screen,
 * the Zenith springs in BIG at centre and holds with a gentle bob, then flies down
 * into the active NOW PLACING slot (whose incoming gem the footer hides meanwhile).
 * The celebratory sting is fired by the choreography; this owns the visuals only.
 *
 * Timeline (must fit inside ZENITH_ARRIVAL_MS): spring-in ~0.45s → hold to ~1.15s →
 * fly-to-hand ~0.62s → the choreography clears it.
 */
const BIG = 132; // the centre-stage size
const HAND = 62; // the active-slot size it shrinks to

export function ZenithArrival({ handAnchor }: { handAnchor: () => { x: number; y: number } | null }) {
  const [entered, setEntered] = useState(false); // spring up from nothing
  const [fly, setFly] = useState(false); // then dive into the hand

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    const t = window.setTimeout(() => setFly(true), 1150);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, []);

  const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
  const cy = typeof window !== "undefined" ? window.innerHeight / 2 : 0;
  const target = fly ? handAnchor() : null;
  const x = target ? target.x : cx;
  const y = target ? target.y : cy - 28; // float a touch above centre while it holds
  const scale = fly ? HAND / BIG : entered ? 1 : 0;

  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 130, pointerEvents: "none" }}>
      {/* the light overlay — soft lime glow at the top, dimming the game behind it;
          fades away as the gem flies in so the board reads normally again */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 42%, rgba(228,255,107,0.14), rgba(4,6,12,0.62) 55%)",
          opacity: fly ? 0 : entered ? 1 : 0,
          transition: "opacity 0.55s ease",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x - BIG / 2,
          top: y - BIG / 2,
          width: BIG,
          height: BIG,
          transform: `scale(${scale})`,
          transformOrigin: "center",
          transition: fly
            ? "left 0.62s cubic-bezier(0.5,0,0.25,1), top 0.62s cubic-bezier(0.5,0,0.25,1), transform 0.62s ease-in"
            : "transform 0.45s cubic-bezier(0.34,1.5,0.5,1)",
          filter: "drop-shadow(0 0 30px #E4FF6B) drop-shadow(0 0 12px #E4FF6B)",
        }}
      >
        <div className={fly ? undefined : "gl-np-hover"} style={{ width: "100%", height: "100%" }}>
          <TileGem value={ZENITH} size={BIG} />
        </div>
      </div>
    </div>
  );
}
