import { useMemo, useRef, useEffect, useId, useState } from "react";
import { GameState, lockedCoreValues } from "../game/engine";
import { TileGem } from "./TileGem";
import { computeLayout, HEX_RADIUS, type BoardLayout } from "./layout";

interface BoardProps {
  state: GameState;
  onPlace: (cellKey: string, tap?: { x: number; y: number }) => void;
  interactive: boolean; // false while an animation is playing
  litCells?: Set<string>; // cells lit-up (gold "banked" flash) during a bank animation
  redCells?: Set<string>; // cells flashed red ("danger" ring) — strand overflow / penalties / collapse
  hiddenCells?: Set<string>; // cells whose tile is mid-flight and should not render in place
  /** GLINT VERSUS: claimed clusters, ringed in the owning player's colour */
  claimRings?: { cells: Set<string>; color: string }[];
  /** GLINT VERSUS: the tap-to-claim window — a countdown chip beside the fresh
   *  combo, picker-style (full ring draining to empty); tap the combo to claim.
   *  `n` re-keys the chip so the drain restarts for every window. */
  claimOffer?: { cell: string; color: string; n: number };
  // During a sequential activation reveal, only show the white activated ring for
  // cells in this set (a subset of the frozen board's activated cells). Undefined =
  // show all activated cells (normal).
  activatedFilter?: Set<string>;
  // The just-placed cell, whose gem plays the drop-in bounce when it appears.
  dropCell?: string;
  /* ===== THE CELEBRATION LAYER (Motion Lab) ===== */
  /** bank light-up rings start WHITE (discovery) and only flip gold with the
   *  snake — when true, lit cells render the activated (white) ring style */
  litWhite?: boolean;
  /** THE SNAKE — a 1/6 outline segment travelling the cluster's outer edge.
   *  `seq` restarts the lap; `color` flips white→gold at the touch. */
  snake?: { cells: string[]; color: "white" | "gold"; lapMs: number; seq: number } | null;
  /** THE RELEASE LAP — lit rings let go one by one in clockwise order while the
   *  gems fly, so the board is dark when the score lands (Motion Lab 1+2). */
  releasing?: { cells: string[]; ms: number; seq: number } | null;
  /** family-tinted halos behind activated/lit gems, scaled by combo size */
  comboGlow?: boolean;
  /** cells whose white activated ring is hidden (a banked cluster past its gold
   *  flip — the frozen board's activation must not resurface under the gold) */
  suppressActivated?: Set<string>;
  // RESHUFFLE: every gem plays the staggered 3D flip while the banner sweeps.
  spinCells?: boolean;
  /** SINGULARITY: these cells (prism + gem) drop off the bottom of the screen */
  fallCells?: Set<string>;
  fallGo?: boolean; // false = the doomed cells just tremble; true = they fall
  // BUST discard: only the GEMS drop off the board — the tile wells they sat on
  // stay put (the SINGULARITY, by contrast, takes prism + gem down together).
  fallGemsOnly?: boolean;
  // ---- scripted-tutorial overlays (design_handoff_glint_tutorial_level) ----
  // Blue outline marking the existing combo being taught.
  hintCells?: Set<string>;
  greyCells?: Set<string>; // the combo picker's ALTERNATIVE cells — grey dashed rings
  // The one tappable cell during a forced placement — brighter, pulsing, double ring.
  targetCell?: string | null;
  // Within a blue recommended-combo hint, the ONE tile the player should tap/focus
  // (the placement/anchor cell) — gets a distinct pulsing double ring on top.
  focusCell?: string | null;
  // Small value chips floating above specific tiles (the Drift 1·2·3·4 lesson).
  chipCells?: Record<string, number>;
  // Scripted board swap: every gem shrinks out / drops in with a stagger.
  clearAll?: boolean;
  dropAll?: boolean;
  // Cap the board's rendered height (default 64vh). The tutorial screen shrinks
  // the board so its text panel stays above the fold on phones.
  maxHeightCss?: string;
  // PUZZLE BOARD: an image revealed under the tiles as they clear (each emptied
  // cell shows the slice of the image beneath it). The focal point (0–100 %)
  // chooses which part of the image the on-board cover-crop keeps.
  puzzleImage?: string;
  puzzleFocalX?: number;
  puzzleFocalY?: number;
  // Reports a function that maps a cell key -> screen-space center {x,y}, for the
  // flying-tile overlay. Called whenever layout/size changes.
  onMapper?: (fn: (key: string) => { x: number; y: number } | null) => void;
  /** cell-key -> centre as a FRACTION (0..1) of the board's viewBox — pure layout
   *  math, no DOM reads, so it's immune to the press-zoom / 3D tilt / transitions.
   *  Used by the focus-zoom fit pass to keep selections in view. */
  onFractionMapper?: (fn: (key: string) => { fx: number; fy: number } | null) => void;
}

export function Board({ state, onPlace, interactive, litCells, redCells, hiddenCells, claimRings, claimOffer, activatedFilter, dropCell, litWhite, snake, releasing, comboGlow, suppressActivated, spinCells, fallCells, fallGo, fallGemsOnly, hintCells, greyCells, targetCell, focusCell, chipCells, clearAll, dropAll, maxHeightCss, puzzleImage, puzzleFocalX, puzzleFocalY, onMapper, onFractionMapper }: BoardProps) {
  const HEX = HEX_RADIUS;
  const svgRef = useRef<SVGSVGElement | null>(null);
  // load the puzzle image's native size so the on-board crop can honour a focal
  // point (SVG's preserveAspectRatio only offers 9 fixed positions — we place the
  // image manually for an arbitrary focal %).
  const [puzzleDims, setPuzzleDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!puzzleImage) { setPuzzleDims(null); return; }
    let live = true;
    const im = new Image();
    im.onload = () => { if (live) setPuzzleDims({ w: im.naturalWidth, h: im.naturalHeight }); };
    im.src = puzzleImage;
    return () => { live = false; };
  }, [puzzleImage]);

  const layout = useMemo(() => computeLayout(state), [state.order, state.side]);
  // halo gradient ids must be unique PER BOARD INSTANCE (the TileGem lesson:
  // a shared id binds to the document's first match, which may be hidden)
  const haloId = useId().replace(/:/g, "");
  // how big a combo each cell belongs to — drives the halo's size (card 6).
  // Lit (banking) cells all share the cluster's size; activated cells read
  // their own combo off the frozen state.
  const comboSizeOf = useMemo(() => {
    const size = new Map<string, number>();
    for (const c of state.activatedCombos) for (const k of c.cells) size.set(k, Math.max(size.get(k) ?? 0, c.cells.length));
    const litN = litCells?.size ?? 0;
    return (k: string) => (litCells?.has(k) ? Math.max(litN, size.get(k) ?? 0) : size.get(k) ?? 3);
  }, [state.activatedCombos, litCells]);
  /** THE GLOW TIERS (Thys's spec, 2026-08-26): a pair barely registers, Trips
   *  glow subtly, a Quad clearly, a Pentad is on fire — and 6+ shares the
   *  Pentad tier, because a Hex banks instantly and the flip celebration owns
   *  that moment. Tier drives BOTH strength and radius, so the difference is
   *  visible (the first cut scaled radius alone by ~6% a tile — invisible). */
  const glowTier = (n: number) => (n <= 2 ? 0 : n === 3 ? 1 : n === 4 ? 2 : 3);
  const GLOW_ALPHA = [0, 0.3, 0.6, 0.95];
  const GLOW_R = [0, 0.95, 1.12, 1.32];
  const activatedSet = useMemo(() => new Set(state.activatedCells), [state.activatedCells]);

  // THE SNAKE'S DIM (Thys, 2026-08-26): while the snake runs its lap the
  // white/gold rings it circles sit at 90% opacity so the full-opacity snake
  // reads against them; the moment the lap closes they breathe up to 100%.
  // Timer-driven (never a frame landing in a window) and re-armed on every
  // snake remount — the gold flip re-keys the overlay and restarts the lap.
  const [snakeLapDone, setSnakeLapDone] = useState(false);
  const snakeCellSet = useMemo(() => new Set(snake?.cells ?? []), [snake]);
  useEffect(() => {
    setSnakeLapDone(false);
    if (!snake) return;
    const t = window.setTimeout(() => setSnakeLapDone(true), snake.lapMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snake?.seq, snake?.color, snake?.lapMs]);

  // PUZZLE PEEL: as each tile clears, its grey lid peels off to uncover the image
  // beneath. We diff the revealed (emptied) set between renders; every newly
  // emptied cell gets a short staggered peel with a randomised tilt. Only meaningful
  // on a puzzle board — cheap no-op otherwise.
  const [peels, setPeels] = useState<Map<string, { delay: number; rot: number }>>(new Map());
  const prevRevealedRef = useRef<Set<string> | null>(null);
  const peelTimersRef = useRef<number[]>([]);
  const revealedKey = useMemo(
    () => (puzzleImage ? state.order.filter((k) => state.cells.get(k)?.tile === null).join(",") : ""),
    [puzzleImage, state.order, state.cells]
  );
  useEffect(() => () => { peelTimersRef.current.forEach(clearTimeout); }, []);
  useEffect(() => {
    if (!puzzleImage) return;
    const revealed = new Set(state.order.filter((k) => state.cells.get(k)?.tile === null));
    const prev = prevRevealedRef.current;
    prevRevealedRef.current = revealed;
    if (prev === null) return; // first paint: don't peel already-cleared cells
    const fresh = [...revealed].filter((k) => !prev.has(k));
    if (fresh.length === 0) return;
    setPeels((m) => {
      const next = new Map(m);
      fresh.forEach((k, i) => next.set(k, { delay: i * 45, rot: (Math.random() * 2 - 1) * 15 }));
      return next;
    });
    fresh.forEach((k, i) => {
      const t = window.setTimeout(() => setPeels((m) => { const n = new Map(m); n.delete(k); return n; }), i * 45 + 430);
      peelTimersRef.current.push(t);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedKey, puzzleImage]);

  // A Nebulite that's part of an activated combo is a "joker" mirroring the value
  // it locked onto — the engine is the single source of truth (a hand-placed
  // Nebulite completing a Drift shows the Drift's missing value, not a neighbour).
  const jokerCoreValues = useMemo(
    () => lockedCoreValues(state),
    [state.activatedCombos, state.cells, state.coreLocks],
  );

  // flat-top hexagon vertices (points left/right, flat edges top/bottom) — matches the
  // flat-top axial layout, which makes the overall board taller than wide.
  const hexVerts = (x: number, y: number, r: number): [number, number][] => {
    const v: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      v.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
    }
    return v;
  };
  const ptsOf = (v: [number, number][]) => v.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const hexPath = (x: number, y: number, r: number) => ptsOf(hexVerts(x, y, r));

  // Provide a cell-key -> screen-center mapper for the flying overlay. Measures the
  // cell's own <g> element, so the position is exact under the board's 3D tilt /
  // press-zoom (a linear viewBox mapping is wrong under a perspective projection).
  useEffect(() => {
    if (!onMapper) return;
    const mapper = (key: string) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const el = svg.querySelector<SVGGElement>(`g[data-ck="${key}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      // fallback: linear mapping against the (projected) svg box
      const p = layout.pos.get(key);
      if (!p) return null;
      const rect = svg.getBoundingClientRect();
      const x = rect.left + ((p.x - layout.minX) / layout.w) * rect.width;
      const y = rect.top + ((p.y - layout.minY) / layout.h) * rect.height;
      return { x, y };
    };
    onMapper(mapper);
  }, [onMapper, layout]);

  useEffect(() => {
    if (!onFractionMapper) return;
    onFractionMapper((key: string) => {
      const p = layout.pos.get(key);
      if (!p) return null;
      return { fx: (p.x - layout.minX) / layout.w, fy: (p.y - layout.minY) / layout.h };
    });
  }, [onFractionMapper, layout]);

  // Painter's algorithm for the extrusion: draw cells sorted by screen Y ascending so
  // each row's top face occludes the side walls of the row above.
  const drawOrder = useMemo(() => {
    const keys = [...state.order];
    keys.sort((a, b) => {
      const pa = layout.pos.get(a)!;
      const pb = layout.pos.get(b)!;
      return pa.y - pb.y || pa.x - pb.x;
    });
    return keys;
  }, [state.order, layout]);

  // Centroid of the visible activated cluster — a soft bloom pulses beneath it.
  const bloomAt = useMemo(() => {
    const cells = state.activatedCells.filter((k) => !activatedFilter || activatedFilter.has(k));
    if (cells.length === 0) return null;
    let x = 0, y = 0;
    for (const k of cells) {
      const p = layout.pos.get(k);
      if (!p) return null;
      x += p.x;
      y += p.y;
    }
    return { x: x / cells.length, y: y / cells.length };
  }, [state.activatedCells, activatedFilter, layout]);

  // Prism extrusion depth (design_handoff_glint_depth §1): base + side walls under
  // every top face. Lit from the top-left: left wall lightest, right wall darkest.
  const EXD = HEX * 0.98 * 0.34;
  // Gems sit PROUD of the tile: lifted this far above their contact shadow.
  const LIFT = HEX * 0.13;
  // ...and stand MORE UPRIGHT than the surface: the board's ~22° tilt compresses
  // everything drawn in its plane by cos(22°) ≈ 0.93, which makes flat-drawn gems
  // read as lying on the tile. Stretching each gem vertically about its BASE
  // (the contact point) counters that foreshortening — with a little extra — so
  // the gem faces the viewer while its tile stays tilted.
  const STAND = 1.14;

  // One delegated click handler on the svg. Per-cell onClick is unreliable here:
  // the press-zoom moves the board between pointerdown and pointerup, so the
  // browser retargets `click` to a common ancestor and the cell handler never
  // fires (clicks felt "dead"). Instead, resolve the cell with a fresh hit-test,
  // falling back to the nearest cell within a cell's reach.
  const cellAtPoint = (x: number, y: number): string | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const hit = document.elementFromPoint(x, y);
    let key = hit?.closest?.("[data-ck]")?.getAttribute("data-ck") ?? null;
    if (!key) {
      let best: string | null = null;
      let bestD = Infinity;
      let reach = 0;
      svg.querySelectorAll<SVGGElement>("g[data-ck]").forEach((g) => {
        const r = g.getBoundingClientRect();
        const d = (r.left + r.width / 2 - x) ** 2 + (r.top + r.height / 2 - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = g.getAttribute("data-ck");
          reach = Math.max(r.width, r.height) * 0.75;
        }
      });
      if (best && bestD <= reach * reach) key = best;
    }
    return key;
  };

  // The board is ALWAYS in motion — the idle sway/breathe, and on desktop the
  // press-zoom springs between pointerdown and pointerup — so a release-time
  // hit-test can land on the NEIGHBOUR of the cell the player aimed at. Resolve
  // the cell at PRESS time instead, against the geometry the player actually
  // saw; the release confirms it. If the pointer travelled (a drag / change of
  // mind), the press cell is stale and the release point resolves fresh.
  const pressHitRef = useRef<{ key: string | null; x: number; y: number } | null>(null);
  const handleBoardPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || state.phase !== "playing") return;
    pressHitRef.current = { key: cellAtPoint(e.clientX, e.clientY), x: e.clientX, y: e.clientY };
  };
  const handleBoardClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive || state.phase !== "playing") return;
    const press = pressHitRef.current;
    pressHitRef.current = null;
    const moved = press ? Math.hypot(e.clientX - press.x, e.clientY - press.y) : Infinity;
    const key = moved <= 14 && press?.key ? press.key : cellAtPoint(e.clientX, e.clientY);
    if (key) onPlace(key, { x: e.clientX, y: e.clientY });
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`${layout.minX} ${layout.minY} ${layout.w} ${layout.h}`}
      onPointerDown={handleBoardPointerDown}
      onClick={handleBoardClick}
      style={{
        width: "100%",
        height: "auto",
        maxHeight: maxHeightCss ?? "64vh",
        touchAction: "manipulation",
        overflow: "visible",
        // the whole board reads as clickable — set here (not per cell) so the cursor
        // never flickers back to an arrow over the gaps between hexes
        cursor: interactive && state.phase === "playing" ? "pointer" : "default",
      }}
    >
      {/* Invisible hit-catcher: the svg's empty canvas doesn't hit-test, so without
          this, hovers over the seams between hexes fall through to the divs behind
          and the cursor flickers arrow/hand while moving across the board. */}
      <rect x={layout.minX} y={layout.minY} width={layout.w} height={layout.h} fill="none" pointerEvents="all" />

      <defs>
        {/* GEM GLOW halos — one gradient per mineral family (Motion Lab card 6):
            a lighter, hotter sibling of the body colour, painted (Safari rule) */}
        {Object.entries(HALO_GLOW).map(([v, hue]) => (
          <radialGradient key={v} id={`gl-halo-${haloId}-${v}`}>
            <stop offset="0%" stopColor={hue} stopOpacity={0.5} />
            <stop offset="55%" stopColor={hue} stopOpacity={0.22} />
            <stop offset="100%" stopColor={hue} stopOpacity={0} />
          </radialGradient>
        ))}
        <radialGradient id="gl-bloom-grad">
          <stop offset="0%" stopColor="rgba(230,240,255,0.32)" />
          <stop offset="70%" stopColor="rgba(230,240,255,0)" />
        </radialGradient>
        {/* soft-edged contact shadow the gems cast on their tiles */}
        <radialGradient id="gl-gem-shadow-grad">
          <stop offset="0%" stopColor="rgba(0,0,0,0.5)" />
          <stop offset="62%" stopColor="rgba(0,0,0,0.3)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>

      {/* soft bloom pulsing under the activated cluster */}
      {bloomAt && (
        <>
          <ellipse
            cx={bloomAt.x}
            cy={bloomAt.y}
            rx={HEX * 2.4}
            ry={HEX * 2}
            fill="url(#gl-bloom-grad)"
            style={{ animation: "gl-bloom 5s ease-in-out infinite" }}
          />
        </>
      )}

      {/* cells, painter-sorted so each row's top face occludes the extrusion above it */}
      {drawOrder.map((k, ci) => {
        const cell = state.cells.get(k)!;
        const p = layout.pos.get(k)!;
        const isHidden = hiddenCells?.has(k);
        // the well itself only animates for a full-tile drop (SINGULARITY); on a
        // bust the tile stays and just its gem falls away (fallGemsOnly).
        const doomed = !fallGemsOnly && fallCells?.has(k);

        // top face + the base hexagon it extrudes down to
        const wv = hexVerts(p.x, p.y, HEX * 0.98);
        const bv = wv.map(([x, y]) => [x, y + EXD] as [number, number]);
        const lightFacet = [wv[0], wv[5], wv[4], wv[3]]; // left half
        const darkFacet = [wv[0], wv[1], wv[2], wv[3]]; // right half

        return (
          <g
            key={k}
            data-ck={k}
            className={doomed ? (fallGo ? "gl-abyss-fall" : "gl-abyss-doom") : undefined}
            style={doomed && fallGo ? { animationDelay: `${(ci % 9) * 50}ms` } : undefined}
          >
            {/* extrusion: base, then the three visible side walls (lit from top-left).
                Fills are CSS vars so light mode can lift the well (theme/settings). */}
            <polygon points={ptsOf(bv)} fill="var(--tile-base)" />
            <polygon points={ptsOf([wv[0], wv[1], bv[1], bv[0]])} fill="var(--tile-wall-1)" />
            <polygon points={ptsOf([wv[1], wv[2], bv[2], bv[1]])} fill="var(--tile-wall-2)" />
            <polygon points={ptsOf([wv[2], wv[3], bv[3], bv[2]])} fill="var(--tile-wall-3)" />
            <polygon points={ptsOf(bv)} fill="none" stroke="#0b0c15" strokeWidth={1} />

            {/* top face (Foundry slate well) */}
            <polygon points={ptsOf(wv)} fill="var(--tile-face)" />
            <polygon points={ptsOf(lightFacet)} fill="var(--tile-facet)" opacity={0.42} />
            <polygon points={ptsOf(darkFacet)} fill="#000000" opacity={0.2} />
            <polygon points={ptsOf(wv)} fill="none" stroke="var(--tile-stroke)" strokeWidth={1.1} />

            {/* the gem's contact shadow — cast ON the tile (it stays glued to the
                face while the gem layer above drifts with the board sway). On a
                gems-only bust drop it goes with the gem: once the gem lifts away,
                its shadow shouldn't linger on the now-empty well. */}
            {cell.tile !== null && !isHidden && !(fallGemsOnly && fallGo && fallCells?.has(k)) && (
              <ellipse
                cx={p.x + HEX * 0.03}
                cy={p.y + HEX * 0.42}
                rx={HEX * 0.52}
                ry={HEX * 0.17}
                fill="url(#gl-gem-shadow-grad)"
              />
            )}
          </g>
        );
      })}

      {/* PUZZLE BOARD: the image, revealed only through CLEARED (empty) cells —
          each emptied well shows the slice of the picture beneath it, so the full
          image assembles as the board is cleared. Cover-cropped to the board box. */}
      {puzzleImage && (() => {
        const revealed = state.order.filter((k) => state.cells.get(k)?.tile === null);
        if (revealed.length === 0) return null;
        // focal-point COVER: scale the image to fill the board box, then offset so
        // the chosen focal %/% stays in view. Falls back to a centred slice until
        // the image's native size has loaded.
        const fx = Math.max(0, Math.min(100, puzzleFocalX ?? 50)) / 100;
        const fy = Math.max(0, Math.min(100, puzzleFocalY ?? 50)) / 100;
        let placement: { x: number; y: number; w: number; h: number; par: string };
        if (puzzleDims) {
          const scale = Math.max(layout.w / puzzleDims.w, layout.h / puzzleDims.h);
          const sw = puzzleDims.w * scale;
          const sh = puzzleDims.h * scale;
          placement = { x: layout.minX - (sw - layout.w) * fx, y: layout.minY - (sh - layout.h) * fy, w: sw, h: sh, par: "none" };
        } else {
          placement = { x: layout.minX, y: layout.minY, w: layout.w, h: layout.h, par: "xMidYMid slice" };
        }
        return (
          <g style={{ pointerEvents: "none" }}>
            <defs>
              <clipPath id="gl-puzzle-clip">
                {revealed.map((k) => {
                  const p = layout.pos.get(k)!;
                  return <polygon key={k} points={hexPath(p.x, p.y, HEX * 0.99)} />;
                })}
              </clipPath>
            </defs>
            <image
              href={puzzleImage}
              x={placement.x}
              y={placement.y}
              width={placement.w}
              height={placement.h}
              preserveAspectRatio={placement.par}
              clipPath="url(#gl-puzzle-clip)"
              className="gl-fade"
            />
            {/* a slight grey film knocks back the (often bright) image so the gems
                and board still read over it, and a BEVELLED double outline — a dark
                shadow edge shifted down, a light highlight edge shifted up — keeps
                every tile border crisp on light AND dark pictures alike. */}
            {revealed.map((k) => {
              const p = layout.pos.get(k)!;
              return (
                <g key={`pe-${k}`}>
                  <polygon points={hexPath(p.x, p.y, HEX * 0.99)} fill="rgba(16,16,24,0.30)" />
                  <polygon points={hexPath(p.x, p.y + 0.9, HEX * 0.985)} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={1.4} />
                  <polygon points={hexPath(p.x, p.y - 0.9, HEX * 0.985)} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1.1} />
                </g>
              );
            })}
          </g>
        );
      })()}

      {/* PEEL LIDS: a grey tile top drawn OVER a freshly-cleared cell, lifting,
          tilting and poofing away to uncover the image piece below. Sits above the
          image group so the reveal is the lid coming off, not the image fading in. */}
      {puzzleImage && peels.size > 0 && (
        <g style={{ pointerEvents: "none" }}>
          {[...peels.entries()].map(([k, pl]) => {
            const p = layout.pos.get(k);
            if (!p) return null;
            const wv = hexVerts(p.x, p.y, HEX * 0.98);
            const lightFacet = [wv[0], wv[5], wv[4], wv[3]];
            const darkFacet = [wv[0], wv[1], wv[2], wv[3]];
            return (
              <g
                key={`peel-${k}`}
                className="gl-peel"
                style={{ ["--peel-rot" as string]: `${pl.rot}deg`, animationDelay: `${pl.delay}ms`, filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.55))" }}
              >
                <polygon points={ptsOf(wv)} fill="var(--tile-face)" />
                <polygon points={ptsOf(lightFacet as [number, number][])} fill="var(--tile-facet)" opacity={0.42} />
                <polygon points={ptsOf(darkFacet as [number, number][])} fill="#000000" opacity={0.2} />
                <polygon points={ptsOf(wv)} fill="none" stroke="var(--tile-stroke)" strokeWidth={1.1} />
              </g>
            );
          })}
        </g>
      )}

      {/* GEM LAYER — the gems sit PROUD of the surface: lifted a few px above their
          contact shadows, and the whole layer drifts a touch against the tiles on
          the same 12s cycle as the board sway (gl-gem-sit) — the parallax a real
          object with height shows when the surface under it tilts. */}
      <g className="gl-gem-sit">
        {drawOrder.map((k, i) => {
          const cell = state.cells.get(k)!;
          if (cell.tile === null || hiddenCells?.has(k)) return null;
          const p = layout.pos.get(k)!;
          const isActivated = activatedSet.has(k) && !suppressActivated?.has(k) && (!activatedFilter || activatedFilter.has(k));
          const isLit = litCells?.has(k);
          const joker = jokerCoreValues.get(k);
          const ring = redCells?.has(k) || isLit || isActivated;
          const doomed = fallCells?.has(k);
          // sparse, slow twinkle on some resting mineral tiles (never dross, not
          // while a ring is active, and not until the entry/exit animations are
          // done — a sparkle must never glint on a tile whose gem hasn't landed).
          // gl-twinkle starts from opacity 0 on its own stagger, so they blink
          // in naturally once the reveal completes.
          const twinkles = cell.tile !== 0 && !ring && i % 9 === 4 && !dropAll && !clearAll;
          // the gem's contact point — the vertical stretch is anchored here, so the
          // gem "stands up" from where it touches the tile
          const baseY = p.y + HEX * 0.66 - LIFT;
          return (
            <g
              key={k}
              data-ck={k}
              className={doomed ? (fallGo ? "gl-abyss-fall" : "gl-abyss-doom") : undefined}
              style={doomed && fallGo ? { animationDelay: `${(i % 9) * 50}ms` } : undefined}
            >
              {/* GEM GLOW (Motion Lab card 6): a painted halo in the mineral's own
                  family — radius scales with the combo it belongs to. A painted
                  gradient, never a CSS filter (the Safari clipping rule). */}
              {comboGlow && cell.tile !== null &&
                (isLit || (activatedSet.has(k) && !suppressActivated?.has(k) && (!activatedFilter || activatedFilter.has(k)))) &&
                glowTier(comboSizeOf(k)) > 0 && (() => {
                  // gold (banked) settles to tier-1 strength; activated combos
                  // carry the full ladder so the build-up is the show
                  const tier = isLit && !litWhite ? 1 : glowTier(comboSizeOf(k));
                  return (
                    <ellipse
                      cx={p.x}
                      cy={p.y - HEX * 0.15}
                      rx={HEX * GLOW_R[tier]}
                      ry={HEX * GLOW_R[tier] * 0.94}
                      fill={`url(#gl-halo-${haloId}-${cell.tile})`}
                      opacity={GLOW_ALPHA[tier]}
                      style={{ pointerEvents: "none", transition: "opacity 0.25s" }}
                    />
                  );
                })()}
              <g
                transform={`translate(${p.x}, ${baseY}) scale(1, ${STAND}) translate(${-HEX * 0.66}, ${-HEX * 1.32})`}
                style={{
                  filter: isLit ? "brightness(1.45)" : undefined,
                  transition: "filter 0.15s",
                }}
              >
                {clearAll ? (
                  <g className="gl-tut-out" style={{ animationDelay: `${i * 22}ms` }}>
                    <TileGem value={cell.tile} size={HEX * 1.32} jokerValue={joker} />
                  </g>
                ) : dropAll ? (
                  // adaptive stagger: a full 91-cell board rains in within ~1.2s
                  // (small tutorial boards keep the original 22ms/cell beat)
                  <g className="gl-tut-drop" style={{ animationDelay: `${i * Math.min(22, 1200 / state.order.length)}ms` }}>
                    <TileGem value={cell.tile} size={HEX * 1.32} jokerValue={joker} />
                  </g>
                ) : k === dropCell ? (
                  <g className="gl-tile-pop">
                    <TileGem value={cell.tile} size={HEX * 1.32} jokerValue={joker} />
                  </g>
                ) : spinCells ? (
                  <g className="gl-gem-flip" style={{ animationDelay: `${(i % 7) * 0.06}s` }}>
                    <TileGem value={cell.tile} size={HEX * 1.32} jokerValue={joker} />
                  </g>
                ) : (
                  <TileGem value={cell.tile} size={HEX * 1.32} jokerValue={joker} />
                )}
              </g>

              {/* sparse glimmer — a tiny specular that blinks on its own clock. Three
                  shape variants (sparkle / diamond / thin sparkle) so they don't look uniform. */}
              {twinkles && (
                <path
                  d={glimmerPath(p.x - HEX * 0.18, baseY - HEX * STAND, HEX * (0.2 + (i % 3) * 0.02), i % 3)}
                  fill="#ffffff"
                  style={{
                    animation: `gl-twinkle ${3.2 + (i % 5) * 0.4}s ease-in-out infinite`,
                    animationDelay: `${(i % 6) * 0.45}s`,
                  }}
                />
              )}
            </g>
          );
        })}
      </g>

      {/* overlay pass: state rings + inert outlines draw over every top face, so a
          ring on an upper row is never hidden under the row below */}
      {drawOrder.map((k) => {
        const cell = state.cells.get(k)!;
        const p = layout.pos.get(k)!;
        const isActivated = activatedSet.has(k) && !suppressActivated?.has(k) && (!activatedFilter || activatedFilter.has(k));
        const isLit = litCells?.has(k);
        const isRed = redCells?.has(k);
        const isHidden = hiddenCells?.has(k);
        const claim = claimRings?.find((c) => c.cells.has(k)) ?? null;

        // ring state precedence: danger > banked(lit) > claim > activated.
        // During the WHITE-FIRST reveal a lit cell still wears the activated
        // (white) ring — the gold arrives only with the snake's touch.
        const ring: "danger" | "banked" | "claim" | "activated" | null = isRed
          ? "danger"
          : isLit
          ? (litWhite ? "activated" : "banked")
          : claim
          ? "claim"
          : isActivated
          ? "activated"
          : null;
        // THE RELEASE LAP: this ring is letting go — fade it on its clockwise
        // slot so the board darkens the way the snake travels.
        const rel = releasing && releasing.cells.includes(k)
          ? { delay: (releasing.cells.indexOf(k) / releasing.cells.length) * releasing.ms }
          : null;

        // freshly bust-placed tile: a red outline for one turn (a normal tile
        // otherwise). No state ring overrides it (activated/banked/danger).
        if (cell.inert && !isHidden && !ring) {
          return (
            <g key={`ov-${k}`} style={{ filter: "drop-shadow(0 0 4px rgba(255,90,118,0.55))", pointerEvents: "none" }}>
              <polygon points={hexPath(p.x, p.y, HEX * 0.98)} fill="none" stroke="#ff5a76" strokeWidth={2.4} opacity={0.9} />
              <polygon points={hexPath(p.x, p.y, HEX * 0.98 * 1.1)} fill="none" stroke="#ff5a76" strokeWidth={1.6} opacity={0.28} />
            </g>
          );
        }
        if (!ring) return null;
        // 90% while the snake is mid-lap (the release lap manages its own fade)
        const snakeDim = !!snake && !releasing && !snakeLapDone
          && (ring === "activated" || ring === "banked") && snakeCellSet.has(k);
        return (
          <g key={`ov-${k}${rel ? `-rel${releasing!.seq}` : ""}`}
             className={rel ? "gl-ring-release" : undefined}
             style={{ pointerEvents: "none",
               ...(rel
                 ? { animationDelay: `${rel.delay.toFixed(0)}ms` }
                 : { opacity: snakeDim ? 0.9 : 1, transition: "opacity 180ms ease-out" }) }}>
            <RingOverlay path={(f: number) => hexPath(p.x, p.y, HEX * 0.98 * f)} ring={ring} claimColor={claim?.color} />
          </g>
        );
      })}

      {/* THE SNAKE — the discovery segment running the cluster's outer edge.
          Perimeter at FULL hex radius (the drawn tiles are 0.98 with a mortar
          gap, so only the full lattice shares vertices) with signed-zero-safe
          keys — both lessons from the Motion Lab's own perimeter bug. */}
      {snake && snake.cells.length > 0 && (
        <SnakeOverlay
          key={`snake-${snake.seq}-${snake.color}`}
          points={clusterPerimeter(snake.cells, layout)}
          color={snake.color}
          lapMs={snake.lapMs}
          glowFadeMs={releasing ? releasing.ms : null}
        />
      )}

      {/* placement impact — a bright ring snaps outward from the just-placed
          cell (keyed to the cell so it replays on every placement) */}
      {dropCell && (() => {
        const p = layout.pos.get(dropCell);
        if (!p) return null;
        return (
          <g key={`shock-${dropCell}`} style={{ pointerEvents: "none", filter: "drop-shadow(0 0 4px rgba(223,250,255,0.7))" }}>
            <polygon className="gl-shock" points={hexPath(p.x, p.y, HEX * 0.98)} fill="none" stroke="#dffaff" strokeWidth={2.2} />
          </g>
        );
      })()}

      {/* VERSUS tap-to-claim: dashed halo over the WHOLE claimable cluster and a
          picker-style countdown chip (full ring radially draining to empty)
          parked OUTSIDE the cluster's bounding box — tap the combo to claim */}
      {claimOffer && (() => {
        // the claimable cluster = activated cells connected to the placed one
        const activated = new Set(state.activatedCells);
        const cluster: string[] = [];
        const seen = new Set([claimOffer.cell]);
        const stack = [claimOffer.cell];
        while (stack.length) {
          const k = stack.pop()!;
          if (!activated.has(k)) continue;
          cluster.push(k);
          for (const nb of state.adj.get(k) ?? []) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
        }
        const pts = cluster.map((k) => layout.pos.get(k)).filter(Boolean) as { x: number; y: number }[];
        if (pts.length === 0) return null;
        const minY = Math.min(...pts.map((p) => p.y));
        const maxY = Math.max(...pts.map((p) => p.y));
        let cx = pts.reduce((n, p) => n + p.x, 0) / pts.length;
        // park the chip clear of the cluster: above it, or below when the
        // cluster hugs the board's top edge; clamp into the drawing area
        let cy = minY - HEX * 2.0;
        if (cy < layout.minY + HEX * 1.1) cy = maxY + HEX * 2.0;
        cx = Math.max(layout.minX + HEX * 1.4, Math.min(layout.minX + layout.w - HEX * 1.4, cx));
        const R = 9;
        const C = 2 * Math.PI * R;
        return (
          <g key={`claim-${claimOffer.n}`} style={{ pointerEvents: "none" }}>
            {cluster.map((k) => {
              const p = layout.pos.get(k)!;
              return (
                <polygon
                  key={k}
                  className="gl-pulse"
                  points={hexPath(p.x, p.y, HEX * 1.1)}
                  fill="none"
                  stroke={claimOffer.color}
                  strokeWidth={1.8}
                  strokeDasharray="6 5"
                  opacity={0.85}
                />
              );
            })}
            {/* the countdown chip — same anatomy as the picker's: dark disc,
                faint track ring, bright ring draining from FULL to empty */}
            <circle cx={cx} cy={cy} r={R + 4.5} fill="rgba(10,14,24,0.88)" stroke={claimOffer.color} strokeWidth={1.2} opacity={0.95} />
            <circle cx={cx} cy={cy} r={R} fill="none" stroke={claimOffer.color} strokeWidth={2.6} opacity={0.22} />
            <circle
              className="gl-claim-drain"
              cx={cx}
              cy={cy}
              r={R}
              fill="none"
              stroke={claimOffer.color}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeDasharray={C}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
            <text
              x={cx}
              y={cy - R - 9}
              textAnchor="middle"
              fontSize={9}
              fontWeight={700}
              letterSpacing="0.2em"
              fill={claimOffer.color}
              stroke="#05060d"
              strokeWidth={3}
              paintOrder="stroke"
              style={{ fontFamily: "inherit" }}
            >
              CLAIM
            </text>
          </g>
        );
      })()}
      {/* choice layer: the picker's dashed ALTERNATIVES (blue wins overlaps).
          Amber, not grey — an alternative can run through already-activated
          tiles whose white glow swallowed a grey ring entirely; the warm dash
          stands out on white yet still reads second to the solid blue pick. */}
      {greyCells &&
        [...greyCells].map((k) => {
          const p = layout.pos.get(k);
          if (!p) return null;
          return (
            <polygon
              key={`grey-${k}`}
              points={hexPath(p.x, p.y, HEX * 0.98)}
              fill="none"
              stroke="#f2b04a"
              strokeWidth={2.4}
              strokeDasharray="6 6"
              opacity={0.9}
              style={{ pointerEvents: "none" }}
            />
          );
        })}
      {/* tutorial layer: blue combo hints, the pulsing forced-placement target, and
          value chips — all pointer-transparent (the delegated click handler decides) */}
      {hintCells &&
        [...hintCells].map((k) => {
          const p = layout.pos.get(k);
          if (!p) return null;
          return (
            <polygon
              key={`hint-${k}`}
              points={hexPath(p.x, p.y, HEX * 0.98)}
              fill="rgba(77,163,255,0.08)"
              stroke="#4da3ff"
              strokeWidth={2.6}
              style={{ pointerEvents: "none", filter: "drop-shadow(0 0 4px rgba(77,163,255,0.5))" }}
            />
          );
        })}
      {/* the ONE focus tile inside the blue hint — a brighter pulsing double ring so
          the player knows exactly which tile to select. Drawn on top of the hints. */}
      {focusCell && hintCells?.has(focusCell) &&
        (() => {
          const p = layout.pos.get(focusCell);
          if (!p) return null;
          return (
            <g className="gl-tut-tgt" style={{ pointerEvents: "none", filter: "drop-shadow(0 0 7px rgba(77,163,255,0.85))" }}>
              <polygon points={hexPath(p.x, p.y, HEX * 0.98)} fill="rgba(77,163,255,0.24)" stroke="#bfe0ff" strokeWidth={3.4} />
              <polygon points={hexPath(p.x, p.y, HEX * 0.98 * 1.14)} fill="none" stroke="#4da3ff" strokeWidth={1.8} opacity={0.65} />
            </g>
          );
        })()}
      {targetCell &&
        (() => {
          const p = layout.pos.get(targetCell);
          if (!p) return null;
          return (
            <g className="gl-tut-tgt" style={{ pointerEvents: "none", filter: "drop-shadow(0 0 6px rgba(143,208,255,0.6))" }}>
              <polygon points={hexPath(p.x, p.y, HEX * 0.98)} fill="rgba(143,208,255,0.16)" stroke="#a8dcff" strokeWidth={3} />
              <polygon points={hexPath(p.x, p.y, HEX * 0.98 * 1.14)} fill="none" stroke="#8fd0ff" strokeWidth={1.6} opacity={0.5} />
            </g>
          );
        })()}
      {chipCells &&
        Object.entries(chipCells).map(([k, v]) => {
          const p = layout.pos.get(k);
          if (!p) return null;
          const w = HEX * 0.92;
          const h = HEX * 0.58;
          const cy = p.y - HEX * 1.02; // just above the cell's own gem
          return (
            <g key={`chip-${k}`} className="gl-fade" style={{ pointerEvents: "none" }}>
              <rect x={p.x - w / 2} y={cy - h / 2} width={w} height={h} rx={h * 0.32} fill="rgba(10,14,24,0.85)" stroke="rgba(143,208,255,0.4)" strokeWidth={1} />
              <text
                x={p.x}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#a8dcff"
                fontSize={HEX * 0.42}
                fontWeight={700}
                fontFamily="'Chakra Petch', sans-serif"
              >
                {v}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

// A small "glimmer" mark that blinks on some resting tiles — three shape variants so
// they don't look uniform: a 4-point sparkle, a diamond, and a thin/spiky sparkle.
function glimmerPath(cx: number, cy: number, r: number, variant: number): string {
  if (variant === 1) {
    const rx = r * 0.66; // diamond
    return `M${cx},${cy - r} L${cx + rx},${cy} L${cx},${cy + r} L${cx - rx},${cy} Z`;
  }
  const w = variant === 2 ? 0.1 : 0.2; // sparkle waist (thinner = spikier)
  return (
    `M${cx},${cy - r} ` +
    `Q${cx + r * w},${cy - r * w} ${cx + r},${cy} ` +
    `Q${cx + r * w},${cy + r * w} ${cx},${cy + r} ` +
    `Q${cx - r * w},${cy + r * w} ${cx - r},${cy} ` +
    `Q${cx - r * w},${cy - r * w} ${cx},${cy - r} Z`
  );
}

function RingOverlay({ path, ring, claimColor }: { path: (f: number) => string; ring: "danger" | "banked" | "claim" | "activated"; claimColor?: string }) {
  if (ring === "claim" && claimColor) {
    // the Wicked pair — the claim ring in the owning player's colour (green opens,
    // purple answers). SUBTLER glow than the gold bank, and a GREEN claim glows a
    // touch bluer than its ring so it separates further from the (oranger) gold —
    // for colour-blind readability. Purple is unchanged.
    const [gr, gg, gb] = [1, 3, 5].map((i) => parseInt(claimColor.slice(i, i + 2) || "0", 16));
    const isGreen = gg > 150 && gr < 90 && gb < gg;
    const glow = isGreen ? "#12d6c4" : claimColor; // bluer green glow
    return (
      <g style={{ filter: `drop-shadow(0 0 3.5px ${glow}88)` }}>
        <polygon points={path(1.0)} fill={claimColor} opacity={0.09} />
        <polygon points={path(1.0)} fill="none" stroke={claimColor} strokeWidth={2.6} opacity={0.9} />
        <polygon points={path(1.1)} fill="none" stroke={glow} strokeWidth={1.7} opacity={0.26} />
        <polygon points={path(1.2)} fill="none" stroke={glow} strokeWidth={1.3} opacity={0.11} />
      </g>
    );
  }
  if (ring === "activated") {
    // the ring pops in (scale 1.35 -> 1) when it first mounts during the reveal.
    // The faint fill is Motion Lab card 3's face-light: the tile itself glows
    // a touch under the ring, so the combo reads as lit rather than outlined.
    return (
      <g className="gl-ring-pop" style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.85))" }}>
        <polygon points={path(1.0)} fill="#ffffff" opacity={0.07} />
        <polygon points={path(1.0)} fill="none" stroke="#ffffff" strokeWidth={3} opacity={0.95} />
        <polygon points={path(1.1)} fill="none" stroke="#ffffff" strokeWidth={2} opacity={0.3} />
        <polygon points={path(1.2)} fill="none" stroke="#dffaff" strokeWidth={1.6} opacity={0.14} />
      </g>
    );
  }
  if (ring === "banked") {
    // BIGGER, ORANGER glow than the seat claims — pushes the gold well clear of the
    // (bluer) green for colour-blind readability.
    return (
      <g style={{ filter: "drop-shadow(0 0 13px rgba(255,138,26,0.85))" }}>
        <polygon points={path(1.0)} fill="#f0972c" opacity={0.18} />
        <polygon points={path(1.0)} fill="none" stroke="#ffce6a" strokeWidth={3} opacity={0.97} />
        <polygon points={path(1.1)} fill="none" stroke="#ff9e2e" strokeWidth={2.2} opacity={0.5} />
        <polygon points={path(1.2)} fill="none" stroke="#ffb84e" strokeWidth={1.8} opacity={0.28} />
      </g>
    );
  }
  // danger
  return (
    <g style={{ filter: "drop-shadow(0 0 6px rgba(255,90,118,0.7))" }}>
      <polygon points={path(1.0)} fill="#ff5a76" opacity={0.12} />
      <polygon points={path(1.0)} fill="none" stroke="#ff5a76" strokeWidth={3} opacity={0.95} />
      <polygon points={path(1.1)} fill="none" stroke="#ff5a76" strokeWidth={2} opacity={0.3} />
    </g>
  );
}

/* ===== THE SNAKE (Motion Lab cards 1+2) ===== */

/** The halo families — a lighter, hotter sibling per mineral (keys = TileVal). */
const HALO_GLOW: Record<number, string> = {
  1: "#e8eef8", 2: "#ffd98a", 3: "#eef3fa", 4: "#8affc4", 5: "#d9a6ff", 6: "#a6f2ff",
  0: "#ffe9a8", 7: "#e0bbff", 8: "#ffb3c2", 9: "#ffb3bd", 10: "#f0ffb0",
};

/** The cluster's outer edge as a closed point loop. Computed at FULL hex radius
 *  (the drawn tiles are 0.98·HEX with a mortar gap, so only the full lattice
 *  shares vertices) with signed-zero-safe keys — both were real bugs in the
 *  Motion Lab's first perimeter. Clockwise on screen (y-down positive area). */
function clusterPerimeter(cells: string[], layout: BoardLayout): string {
  const R = HEX_RADIUS;
  const kv = (x: number, y: number) => `${(Math.round(x * 10) + 0) / 10}_${(Math.round(y * 10) + 0) / 10}`;
  const verts = (cx: number, cy: number): [number, number][] => {
    const v: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      v.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    return v;
  };
  const edges = new Map<string, [[number, number], [number, number]]>();
  for (const k of cells) {
    const p = layout.pos.get(k);
    if (!p) continue;
    const v = verts(p.x, p.y);
    for (let i = 0; i < 6; i++) {
      const a = v[i], b = v[(i + 1) % 6];
      const key = [kv(a[0], a[1]), kv(b[0], b[1])].sort().join("|");
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, [a, b]);
    }
  }
  const rem = [...edges.values()];
  if (rem.length === 0) return "";
  const loop: [number, number][] = [rem[0][0], rem[0][1]];
  rem.shift();
  while (rem.length) {
    const tail = loop[loop.length - 1];
    const tk = kv(tail[0], tail[1]);
    const i = rem.findIndex(([a, b]) => kv(a[0], a[1]) === tk || kv(b[0], b[1]) === tk);
    if (i < 0) break;
    const [a, b] = rem.splice(i, 1)[0];
    loop.push(kv(a[0], a[1]) === tk ? b : a);
  }
  loop.pop();
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (area < 0) loop.reverse();
  return "M" + loop.map((pt) => `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join("L") + "Z";
}

/** One lap of the 1/6 segment around the cluster. Self-driving (rAF); re-keyed
 *  by the hook per lap/colour. Pure decoration — nothing awaits it.
 *
 *  Two paths share the dash animation: a soft LIT-UP GLOW underlay and the
 *  crisp segment on top. `glowFadeMs` set (the release lap — the rings are
 *  going dark) fades the glow 1→0 over that window while the segment itself
 *  stays full opacity to the end (Thys, 2026-08-26). */
function SnakeOverlay({ points, color, lapMs, glowFadeMs }: { points: string; color: "white" | "gold"; lapMs: number; glowFadeMs?: number | null }) {
  const ref = useRef<SVGPathElement | null>(null);
  const glowRef = useRef<SVGPathElement | null>(null);
  useEffect(() => {
    const path = ref.current, glow = glowRef.current;
    if (!path || !points) return;
    const total = path.getTotalLength();
    path.setAttribute("stroke-dasharray", `${total / 6} ${total}`);
    glow?.setAttribute("stroke-dasharray", `${total / 6} ${total}`);
    let raf: number | null = null;
    const t0 = performance.now();
    const run = () => {
      const u = Math.min((performance.now() - t0) / lapMs, 1);
      path.setAttribute("stroke-dashoffset", String(-total * u));
      glow?.setAttribute("stroke-dashoffset", String(-total * u));
      if (u < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => { if (raf != null) cancelAnimationFrame(raf); };
  }, [points, lapMs]);
  if (!points) return null;
  const hue = color === "gold" ? "#ffce6a" : "#ffffff";
  return (
    <g style={{ pointerEvents: "none" }}>
      <path
        ref={glowRef}
        d={points}
        fill="none"
        stroke={hue}
        strokeWidth={11}
        strokeLinecap="round"
        style={{
          filter: "blur(6px)",
          opacity: 0.85,
          ...(glowFadeMs != null ? { animation: `gl-snake-glow-fade ${glowFadeMs}ms ease-out both` } : {}),
        }}
      />
      <path
        ref={ref}
        d={points}
        fill="none"
        stroke={hue}
        strokeWidth={4}
        strokeLinecap="round"
        style={{ filter: color === "gold" ? "drop-shadow(0 0 6px rgba(255,158,46,0.8))" : "drop-shadow(0 0 5px rgba(255,255,255,0.8))" }}
      />
    </g>
  );
}
