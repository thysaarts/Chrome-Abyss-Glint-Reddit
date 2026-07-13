import { GameState } from "../game/engine";
import { axialToPixel } from "../game/hex";

export const HEX_RADIUS = 30; // logical hex radius in px (SVG scales responsively)

export interface BoardLayout {
  pos: Map<string, { x: number; y: number }>;
  minX: number;
  minY: number;
  w: number;
  h: number;
}

export function computeLayout(state: GameState): BoardLayout {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const pos = new Map<string, { x: number; y: number }>();
  for (const k of state.order) {
    const cell = state.cells.get(k)!;
    const p = axialToPixel(cell.coord, HEX_RADIUS);
    pos.set(k, p);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  // Breathing margin around the board. It must be >= a cell's own extent (a flat-top
  // hex reaches ~0.87*R vertically and ~1.0*R to its side points) PLUS the prism
  // extrusion (0.33*R below the bottom row) and the activated ring (1.18*R), so the
  // outermost tiles, walls and rings all stay inside the viewBox — the board now
  // renders inside a clipping viewport, so anything past the edge is cut off.
  const pad = HEX_RADIUS * 1.25;
  return { pos, minX: minX - pad, minY: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}
