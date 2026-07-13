import { useEffect, useState } from "react";
import { TileGem } from "./TileGem";
import { theme } from "../theme/theme";
import { FlyingTile, Mapper } from "./useNebuliteGame";

interface OverlayProps {
  flying: FlyingTile[];
  mapper: Mapper | null;
  multiplierLabel?: string | null;
  // anchor getters (screen coords) for the targets
  scoreAnchor: () => { x: number; y: number } | null;
  bustAnchor: () => { x: number; y: number } | null;
  handAnchor: () => { x: number; y: number } | null;
  walletAnchor?: () => { x: number; y: number } | null;
  gapResolver: (key: string) => { x: number; y: number } | null;
}

interface Placed {
  tile: FlyingTile;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

const FLY_MS = 620;
const SIZE = 40;

export function FlyingOverlay({ flying, mapper, multiplierLabel, scoreAnchor, bustAnchor, handAnchor, walletAnchor, gapResolver }: OverlayProps) {
  const [tick, setTick] = useState(0);

  // Recompute positions on mount/changes (screen coords can shift).
  useEffect(() => {
    const id = requestAnimationFrame(() => setTick((t) => t + 1));
    return () => cancelAnimationFrame(id);
  }, [flying]);

  if (flying.length === 0) return null;

  const placed: Placed[] = [];
  for (const f of flying) {
    const screenCentre = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    let from = f.fromXY ?? (f.fromKey ? mapper?.(f.fromKey) ?? null : null);
    if (!from && f.fromCentre) from = mapper?.("0,0") ?? null; // board centre
    if (!from && f.fromScreen) from = screenCentre(); // viewport centre (Mother Lode)
    let to: { x: number; y: number } | null = null;
    if (f.to === "screen") to = screenCentre();
    else if (f.to === "score") to = scoreAnchor();
    else if (f.to === "wallet") to = walletAnchor?.() ?? scoreAnchor();
    else if (f.to === "bust") to = bustAnchor();
    else if (f.to === "hand") to = handAnchor();
    else if (f.to === "gap" && f.toKey) to = gapResolver(f.toKey);
    else if (f.to === "multiplier") {
      // park just to the left of the score box
      const s = scoreAnchor();
      to = s ? { x: s.x - 70, y: s.y } : null;
    }
    if (from && to) placed.push({ tile: f, from, to });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 100,
        overflow: "visible",
      }}
    >
      {placed.map((p) => (
        <FlyingPiece key={p.tile.id} placed={p} label={multiplierLabel} />
      ))}
    </div>
  );
}

function FlyingPiece({ placed, label }: { placed: Placed; label?: string | null }) {
  const { tile, from, to } = placed;
  const [pos, setPos] = useState(from);
  // fadeIn arrivals must be invisible on their VERY FIRST paint — initialising
  // via effect leaves one rendered frame at full opacity (an occasional flash)
  const [op, setOp] = useState(tile.fadeIn ? 0 : 1);

  const isMultiplier = tile.to === "multiplier";
  const isGap = tile.to === "gap";

  useEffect(() => {
    setPos(from);
    const startTimer = setTimeout(() => {
      setPos(to);
      // gap-fill and parked multiplier stay fully visible; others fade as they
      // sink into the score/bust/hand box.
      setOp(isGap || isMultiplier ? 1 : 0.15);
    }, tile.delay + 20);
    return () => clearTimeout(startTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dur = tile.magnetic ? 240 : tile.fast ? 300 : FLY_MS;
  // magnetic snap accelerates into the target then settles hard (a magnet catch)
  const ease = tile.magnetic ? "cubic-bezier(0.5, 0, 0.2, 1.25)" : "cubic-bezier(0.5,0,0.4,1)";
  // a labelled flyer (e.g. the +5000 clear bonus, or a red -300 penalty) renders
  // as a text bubble
  if (tile.label) {
    return (
      <div
        style={{
          position: "absolute",
          left: pos.x - 40,
          top: pos.y - 16,
          opacity: op,
          transform: "scale(1)",
          transition: `left ${dur}ms cubic-bezier(0.5,0,0.4,1), top ${dur}ms cubic-bezier(0.5,0,0.4,1), opacity ${dur}ms ease-in`,
          fontFamily: theme.fonts.disp,
          fontWeight: 700,
          fontSize: 28,
          color: tile.negative ? theme.color.bad : theme.color.good,
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
          whiteSpace: "nowrap",
        }}
      >
        {tile.label}
      </div>
    );
  }
  // a bonus gem being seeded: it DROPS in big from above, holds, then spins and
  // shrinks away into the board (the player never sees which tile it slips under)
  if (tile.swirl) {
    const sz = tile.size ?? SIZE;
    return (
      <div
        style={{
          position: "absolute",
          left: pos.x - sz / 2,
          top: pos.y - sz / 2,
          width: sz,
          height: sz,
          // the fall from the top (position), quick and eased into the centre
          transition: `left 560ms cubic-bezier(0.3,0.7,0.3,1), top 560ms cubic-bezier(0.3,0.9,0.4,1)`,
          filter: tile.glow ? `drop-shadow(0 0 22px ${tile.glow}) drop-shadow(0 0 8px ${tile.glow})` : "drop-shadow(0 4px 12px rgba(0,0,0,0.5))",
        }}
      >
        {/* the swirl-away spin runs on an inner wrapper so it composes with the
            outer drop (position) without fighting the transform */}
        <div className="gl-gem-swirl" style={{ width: "100%", height: "100%" }}>
          <TileGem value={tile.value} size={sz} />
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        left: pos.x - SIZE / 2,
        top: pos.y - SIZE / 2,
        width: SIZE,
        height: SIZE,
        opacity: op,
        transform: isGap || isMultiplier ? "scale(1)" : "scale(0.7)",
        transition: `left ${dur}ms ${ease}, top ${dur}ms ${ease}, opacity ${tile.fadeIn ? Math.round(dur * 0.45) + "ms ease-out" : dur + "ms ease-in"}, transform ${dur}ms ease-in`,
        filter: tile.glow ? `drop-shadow(0 0 8px ${tile.glow}) drop-shadow(0 2px 6px rgba(0,0,0,0.4))` : "drop-shadow(0 2px 6px rgba(0,0,0,0.4))",
      }}
    >
      <TileGem value={tile.value} size={SIZE} />
      {isMultiplier && label && (
        <div
          style={{
            position: "absolute",
            top: -6,
            right: -18,
            fontFamily: theme.fonts.disp,
            fontWeight: 700,
            fontSize: 16,
            color: theme.color.gold,
            textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
