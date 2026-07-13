import { useEffect, useMemo, useRef, useState } from "react";
import { theme } from "../theme/theme";
import { TileGem } from "./TileGem";
import { LINEUP_T, Mapper } from "./useNebuliteGame";
import { TileVal } from "../game/engine";

/**
 * COMBO LINEUP — the banked tiles' "show your hand" moment. Instead of diving
 * straight into the score, the tiles first fly UP from the board and line up
 * just beneath it, one row per combo with the combo's name beside it. A tile
 * that completed TWO combos (the placed tile bridging a set and a run) appears
 * once for real and once as a translucent GHOST copy — a visual aid only, it is
 * not banked twice. The rows linger a beat (the player reads what they banked),
 * then every real tile dives into the score and the ghosts fade away.
 *
 * The component runs its own three-phase timeline ("fly" → "linger" → "dive")
 * against the shared LINEUP_T constants, so it stays in lock-step with the
 * awaited sleeps in useNebuliteGame's bank paths.
 */

interface XY { x: number; y: number }

interface LineupTile {
  cell: string | null;
  value: TileVal;
  ghost: boolean;
}

interface Props {
  lineup: { rows: { name: string; tiles: LineupTile[] }[]; chain: string | null; quadriant?: { value: number; face: number; bonus: number } | null };
  mapper: Mapper | null;
  scoreAnchor: () => XY | null;
}

const TILE = 30; // lineup tile size (a touch smaller than the board's gems)
const GAP = 5; // gap between tiles in a row
const ROW_H = 40; // vertical rhythm per combo row
const LABEL_W = 84; // reserved width for the combo name beside the row

export function ComboLineupOverlay({ lineup, mapper, scoreAnchor }: Props) {
  const [phase, setPhase] = useState<"fly" | "linger" | "dive">("fly");
  const timers = useRef<number[]>([]);

  // Slot geometry — computed once on mount (the score box doesn't move mid-bank).
  const geo = useMemo(() => {
    const score = scoreAnchor() ?? { x: window.innerWidth / 2, y: 90 };
    const vw = window.innerWidth;
    // the widest row decides the strip's centring clamp (so the name never clips)
    const maxTiles = Math.max(...lineup.rows.map((r) => r.tiles.length));
    const stripW = maxTiles * TILE + (maxTiles - 1) * GAP;
    const cx = Math.min(Math.max(score.x, stripW / 2 + 14), vw - stripW / 2 - LABEL_W - 14);
    const y0 = score.y + 44; // first row sits just under the score card
    let idx = 0; // global tile index → the form-up / dive stagger order
    const rows = lineup.rows.map((r, ri) => {
      const w = r.tiles.length * TILE + (r.tiles.length - 1) * GAP;
      const x0 = cx - w / 2;
      const y = y0 + ri * ROW_H;
      return {
        name: r.name,
        y,
        labelX: x0 + w + 10,
        tiles: r.tiles.map((t, ti) => ({
          ...t,
          idx: idx++,
          slot: { x: x0 + ti * (TILE + GAP) + TILE / 2, y: y + TILE / 2 },
          from: (!t.ghost && t.cell ? mapper?.(t.cell) : null) ?? null,
        })),
      };
    });
    // the soft scrim behind the whole block (readability over a busy board)
    const xs = rows.flatMap((r) => r.tiles.map((t) => t.slot.x));
    const box = {
      left: Math.min(...xs) - TILE / 2 - 14,
      right: Math.max(...rows.map((r) => r.labelX)) + LABEL_W,
      top: y0 - 14,
      bottom: y0 + rows.length * ROW_H + 4,
    };
    return { rows, score, nTiles: idx, box };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The timeline — mirrors the hook's awaited sleeps exactly.
  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("linger"), LINEUP_T.fly + geo.nTiles * LINEUP_T.stagger);
    const t2 = window.setTimeout(() => setPhase("dive"), LINEUP_T.fly + geo.nTiles * LINEUP_T.stagger + LINEUP_T.linger);
    timers.current = [t1, t2];
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showLabels = phase !== "fly";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, pointerEvents: "none" }}>
      {/* a soft dark scrim behind the block, so the rows read over a busy board */}
      <div
        style={{
          position: "absolute",
          left: geo.box.left,
          top: geo.box.top,
          width: geo.box.right - geo.box.left,
          height: geo.box.bottom - geo.box.top,
          borderRadius: 16,
          background: "radial-gradient(ellipse at 50% 40%, rgba(4,5,12,0.78), rgba(4,5,12,0.45) 70%, rgba(4,5,12,0) 100%)",
          filter: "blur(2px)",
          opacity: showLabels && phase !== "dive" ? 1 : 0,
          transition: "opacity 0.35s ease",
        }}
      />
      {/* chain header — the bonus the combination formed (Convergence / Accord / …) */}
      {lineup.chain && (
        <div
          style={{
            position: "absolute",
            left: geo.rows[0] ? geo.rows[0].labelX - LABEL_W / 2 : geo.score.x,
            top: geo.rows[0] ? geo.rows[0].y - 20 : geo.score.y + 24,
            transform: "translateX(-50%)",
            fontFamily: theme.fonts.mono,
            fontSize: 9.5,
            letterSpacing: "0.26em",
            color: theme.color.gold,
            textShadow: "0 0 12px rgba(232,181,63,0.5)",
            opacity: showLabels ? (phase === "dive" ? 0 : 1) : 0,
            transition: "opacity 0.3s ease",
            whiteSpace: "nowrap",
          }}
        >
          {lineup.chain.toUpperCase()}
        </div>
      )}

      {geo.rows.map((row) => (
        <div key={row.name + row.y}>
          {/* the combo's name, beside the formed row */}
          <div
            style={{
              position: "absolute",
              left: row.labelX,
              top: row.y + TILE / 2,
              transform: "translateY(-50%)",
              fontFamily: theme.fonts.disp,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.06em",
              color: "#e2dcff",
              textShadow: "0 0 14px rgba(157,123,255,0.55)",
              opacity: showLabels ? (phase === "dive" ? 0 : 1) : 0,
              transition: "opacity 0.32s ease",
              whiteSpace: "nowrap",
            }}
          >
            {row.name}
          </div>

          {row.tiles.map((t) => (
            <LineupPiece key={`${row.y}-${t.idx}`} tile={t} phase={phase} score={geo.score} />
          ))}
        </div>
      ))}

      {/* QUADRIANT overview line — its own row beneath the combos: the gem · ×4 ·
          the tile it covered · that tile's face value */}
      {lineup.quadriant && (
        <div
          style={{
            position: "absolute",
            left: geo.rows.length ? geo.rows[geo.rows.length - 1].tiles[0].slot.x - TILE / 2 - 6 : geo.score.x,
            top: (geo.rows.length ? geo.rows[geo.rows.length - 1].y + ROW_H : geo.score.y + 44) + 2,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 9px",
            borderRadius: 9,
            background: "rgba(213,30,60,0.14)",
            border: "1px solid rgba(255,132,150,0.4)",
            opacity: showLabels ? (phase === "dive" ? 0 : 1) : 0,
            transition: "opacity 0.32s ease",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ width: TILE, height: TILE, filter: "drop-shadow(0 0 6px #ff8496)" }}><TileGem value={9 as TileVal} size={TILE} /></div>
          <span style={{ fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 15, color: "#ff8496" }}>×4</span>
          <div style={{ width: TILE - 4, height: TILE - 4 }}><TileGem value={lineup.quadriant.value as TileVal} size={TILE - 4} /></div>
          <span style={{ fontFamily: theme.fonts.mono, fontSize: 11, color: "#e2dcff" }}>{lineup.quadriant.face} → +{lineup.quadriant.bonus.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

/** One tile of the lineup. Real tiles: board cell → slot → score. Ghost copies:
 *  fade in AT the slot once their real twin has arrived, fade out on the dive. */
function LineupPiece({
  tile,
  phase,
  score,
}: {
  tile: { idx: number; slot: XY; from: XY | null; value: TileVal; ghost: boolean };
  phase: "fly" | "linger" | "dive";
  score: XY;
}) {
  // ghosts (and any tile without a resolvable origin) start at the slot
  const start = tile.ghost || !tile.from ? tile.slot : tile.from;
  const [pos, setPos] = useState<XY>(start);
  const [arrived, setArrived] = useState(tile.ghost ? false : start === tile.slot);

  useEffect(() => {
    // fly to the slot, staggered by the tile's global index
    const t = window.setTimeout(() => {
      setPos(tile.slot);
      setArrived(true);
    }, 30 + tile.idx * LINEUP_T.stagger);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const diving = phase === "dive" && !tile.ghost;
  const target = diving ? score : pos;
  const gone = phase === "dive" && tile.ghost; // ghosts simply fade away

  return (
    <div
      style={{
        position: "absolute",
        left: target.x - TILE / 2,
        top: target.y - TILE / 2,
        width: TILE,
        height: TILE,
        transition: diving
          ? `left ${LINEUP_T.dive}ms cubic-bezier(0.5,0,0.8,0.4) ${tile.idx * LINEUP_T.diveStagger}ms, top ${LINEUP_T.dive}ms cubic-bezier(0.5,0,0.8,0.4) ${tile.idx * LINEUP_T.diveStagger}ms, transform ${LINEUP_T.dive}ms ease ${tile.idx * LINEUP_T.diveStagger}ms, opacity ${LINEUP_T.dive}ms ease ${tile.idx * LINEUP_T.diveStagger}ms`
          : `left ${LINEUP_T.fly}ms cubic-bezier(0.35,0,0.25,1), top ${LINEUP_T.fly}ms cubic-bezier(0.35,0,0.25,1), opacity 0.4s ease`,
        opacity: gone ? 0 : diving ? 0.15 : tile.ghost ? (arrived && phase !== "fly" ? 0.42 : 0) : 1,
        transform: diving ? "scale(0.45)" : "scale(1)",
        filter: tile.ghost
          ? "saturate(0.55) drop-shadow(0 0 8px rgba(157,123,255,0.35))"
          : "drop-shadow(0 5px 9px rgba(0,0,0,0.5)) drop-shadow(0 0 10px rgba(192,132,252,0.3))",
      }}
    >
      <TileGem value={tile.value} size={TILE} jokerValue={(tile as { jokerValue?: number }).jokerValue} />
      {tile.ghost && (
        // the ghost's dashed ring — reads as "shown, not banked"
        <div
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: 9,
            border: "1.5px dashed rgba(157,123,255,0.55)",
          }}
        />
      )}
    </div>
  );
}
