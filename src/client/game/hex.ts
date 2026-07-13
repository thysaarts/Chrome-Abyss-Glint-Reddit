/**
 * HEX GEOMETRY
 * ============
 * Axial coordinates (q, r). A hexagon board of `side` tiles per edge contains
 * all cells within cube-distance (side - 1) of the centre.
 *
 *   side 6 -> 91 cells   (the GDD default)
 *   side 5 -> 61 cells
 *   side 4 -> 37 cells
 *
 * Pointy-top hexes. Each interior cell has exactly six edge-neighbours.
 */

export interface Axial {
  q: number;
  r: number;
}

export function keyOf(c: Axial): string {
  return `${c.q},${c.r}`;
}

export const HEX_DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexCells(side: number): Axial[] {
  const R = side - 1;
  const cells: Axial[] = [];
  for (let q = -R; q <= R; q++) {
    for (let r = -R; r <= R; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= R) {
        cells.push({ q, r });
      }
    }
  }
  return cells;
}

/**
 * BOARD SHAPES (side-6 only). A non-standard shape EXPANDS the 91-cell hexagon
 * with corner wedges that fill the hexagon's own screen bounding box — the board
 * never renders wider or taller than the plain hexagon, it just spends the dead
 * corner space. Each wedge is ~6 cells; the full square uses all four (115).
 * The SINGULARITY event later drops every wedge cell into the abyss, reducing
 * the board to the standard hexagon.
 */
export type BoardShape = "hexagon" | "tl" | "tr" | "bl" | "br" | "tl-br" | "tr-bl" | "square";

export const SHAPE_CORNERS: Record<BoardShape, ("tl" | "tr" | "bl" | "br")[]> = {
  hexagon: [],
  tl: ["tl"],
  tr: ["tr"],
  bl: ["bl"],
  br: ["br"],
  "tl-br": ["tl", "br"],
  "tr-bl": ["tr", "bl"],
  square: ["tl", "tr", "bl", "br"],
};

/** The corner wedge: every cell OUTSIDE the side-6 hexagon whose rendered
 *  position still falls inside the hexagon's screen bounding box, in the given
 *  screen quadrant. (Screen x follows q; screen y follows r + q/2.) */
export function wedgeCells(corner: "tl" | "tr" | "bl" | "br"): Axial[] {
  const R = 5;
  const out: Axial[] = [];
  for (let q = -R; q <= R; q++) {
    if (q === 0) continue; // the centre column is already full height
    for (let r = -2 * R; r <= 2 * R; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= R) continue; // inside the hexagon
      const y = r + q / 2; // screen-vertical position in cell units
      if (Math.abs(y) > R) continue; // outside the hexagon's screen box
      const which = y < 0 ? (q < 0 ? "tl" : "tr") : q < 0 ? "bl" : "br";
      if (which === corner) out.push({ q, r });
    }
  }
  return out;
}

/** The full starting cell set for a board: the hexagon plus the shape's wedges.
 *  Non-standard shapes only exist at side 6. */
export function shapeCells(side: number, shape: BoardShape): Axial[] {
  const base = hexCells(side);
  if (side !== 6 || shape === "hexagon") return base;
  return [...base, ...SHAPE_CORNERS[shape].flatMap(wedgeCells)];
}

export function neighbours(c: Axial, cellSet: Set<string>): Axial[] {
  const out: Axial[] = [];
  for (const d of HEX_DIRS) {
    const n = { q: c.q + d.q, r: c.r + d.r };
    if (cellSet.has(keyOf(n))) out.push(n);
  }
  return out;
}

/** Cube distance of a cell from the centre (its "ring"). */
export function ringOf(c: Axial): number {
  return Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(-c.q - c.r));
}

/** Cube distance between two cells. */
export function hexDistance(a: Axial, b: Axial): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(-a.q - a.r - (-b.q - b.r)));
}

/** Parse a "q,r" key back to an Axial. */
export function parseKey(key: string): Axial {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

/** Pixel position (flat-top) for rendering — the overall board is TALLER than wide,
 *  which fits a portrait phone better. size = hex radius in px. */
export function axialToPixel(c: Axial, size: number): { x: number; y: number } {
  const x = size * (3 / 2) * c.q;
  const y = size * Math.sqrt(3) * (c.r + c.q / 2);
  return { x, y };
}
