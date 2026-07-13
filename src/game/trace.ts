/**
 * MOVE TRACER (dev tooling)
 * =========================
 * A structured, human-readable play-by-play of every placement, for verifying that the
 * engine does what we expect. Each entry records: the tile placed and where, the combo(s)
 * it formed, what BANKED (which tiles + combo names + score), what OVERFLOWED to the hand
 * and how much refined into Nebulites (Rule 1), the covered/buried tiles that moved to the
 * hand, isolation banking (Rule 2) and isolated-pair-to-hand (Rule 6), Nebulite respawns,
 * board collapses/reshuffles, the board-clear bonus, and the score change.
 *
 * It's PURE — derived by diffing the committed before/after states plus the engine's
 * per-move `lastResolved`. Gated behind ?debug=1 (or localStorage glint.debug="1") so it
 * costs nothing in normal play. Accumulated entries live on `window.__glintTrace`; call
 * `window.__glintTraceText()` for the full text log, or use the on-screen ⭳ button.
 */
import { GameState, TileVal, planMove, visibleTile, GLINT, CORE, ZENITH } from "./engine";

function tileLabel(v: TileVal | null | undefined): string {
  if (v === null || v === undefined) return "·";
  if (v === GLINT) return "Glint";
  if (v === CORE) return "Nebulite";
  if (v === ZENITH) return "Zenith";
  return String(v); // minerals 1..6
}

export interface MoveTrace {
  move: number; // state.moves after the placement
  placed: string; // the tile that was played
  at: string; // the cell it was played on
  covered: string | null; // the tile that was under it (null = empty cell)
  outcome: "activate" | "bank" | "bust";
  combos: { name: string; cells: string[] }[]; // combo(s) this placement activated
  banked?: { cells: string[]; combos: string[]; multiplier: number };
  overflow?: { cells: string[]; value: string; toHand: number; refinedNebulites: number; bonus: number };
  coveredTo?: "hand" | "wallet"; // where the covered tile went (mineral/Glint→hand, Nebulite→wallet)
  buriedToHand?: { cell: string; value: string }[];
  isolatedToScore?: { cell: string; value: string; points: number }[];
  pairToHand?: { cell: string; value: string }[];
  respawnedNebuliteAt?: string;
  collapsed?: boolean;
  reshuffled?: boolean;
  score: { before: number; after: number; delta: number };
  hand: { before: string[]; after: string[] };
  totals: { banks: number; busts: number };
  // Present only on the move that ENDS the run. The end-of-run bonuses/penalties
  // (board-clear bonus, unspent busts/banks/hand, tiles-left penalty…) are NOT added
  // to the score during play — they're applied HERE, in the end-card summary, each at
  // its own line. So `scoreBase` is the score carried out of play and `finalScore` is
  // where the summary lands after stepping through `tally` in order.
  end?: {
    outcome: "cleared" | "cashed out" | "game over" | "out of tiles";
    scoreBase: number;
    tally: { label: string; delta: number }[];
    finalScore: number;
  };
}

// end-of-run tally labels — mirror the end card's TALLY_META
const END_LABEL: Record<string, string> = {
  boardTiles: "Board tiles banked",
  busts: "Busts remaining",
  banks: "Free banks remaining",
  hand: "Gems in hand",
  zenith: "Zenith bonus",
  clear: "Board cleared",
  unbanked: "Unbanked combos",
  tiles: "Tiles on board",
};

/** Build a structured trace of one placement from the committed before/after states. */
export function traceMove(before: GameState, after: GameState, cellKey: string, choiceIdx = 0): MoveTrace {
  const placedVal = visibleTile(before);
  const coveredVal = before.cells.get(cellKey)?.tile ?? null;
  const outcome: MoveTrace["outcome"] =
    after.busts > before.busts ? "bust" : after.banks > before.banks ? "bank" : "activate";
  const lr = after.lastResolved;
  const plan = planMove(before, cellKey, choiceIdx);

  const t: MoveTrace = {
    move: after.moves,
    placed: tileLabel(placedVal),
    at: cellKey,
    covered: coveredVal === null ? null : tileLabel(coveredVal),
    outcome,
    combos: (plan?.newCombos ?? []).map((c) => ({ name: c.name, cells: [...c.cells] })),
    score: { before: before.score, after: after.score, delta: after.score - before.score },
    hand: { before: before.hand.map(tileLabel), after: after.hand.map(tileLabel) },
    totals: { banks: after.banks, busts: after.busts },
  };

  if (outcome === "bank" && plan) {
    t.banked = { cells: [...plan.clusterCells], combos: [...plan.clusterComboNames], multiplier: plan.multiplier };
  }
  if (lr.strandToHand.length || lr.motherLode) {
    t.overflow = {
      cells: lr.strandToHand.map((x) => x.key),
      value: tileLabel((lr.motherLode?.sourceValue ?? lr.strandToHand[0]?.value ?? null) as TileVal | null),
      toHand: lr.strandToHand.length,
      refinedNebulites: lr.motherLode?.nebulites ?? 0,
      bonus: lr.motherLode?.bonus ?? 0,
    };
  }
  if (coveredVal !== null && outcome !== "bank") {
    t.coveredTo = coveredVal === CORE ? "wallet" : "hand";
  }
  if (lr.buriedToHand.length) t.buriedToHand = lr.buriedToHand.map((x) => ({ cell: x.key, value: tileLabel(x.value as TileVal) }));
  if (lr.isolatedToScore.length) t.isolatedToScore = lr.isolatedToScore.map((x) => ({ cell: x.key, value: tileLabel(x.value as TileVal), points: x.points }));
  if (lr.pairToHand.length) t.pairToHand = lr.pairToHand.map((x) => ({ cell: x.key, value: tileLabel(x.value as TileVal) }));
  if (lr.coreRespawnedAt) t.respawnedNebuliteAt = lr.coreRespawnedAt;
  if (lr.shrunk) t.collapsed = true;
  if (lr.reshuffled) t.reshuffled = true;
  // the run just ended — attach the end-of-run score overview (the board-clear bonus
  // and every other adjustment live HERE, not in the in-play score above).
  if (after.phase !== "playing") {
    t.end = {
      outcome:
        after.phase === "won" ? "cleared"
        : after.cashedOut > 0 ? "cashed out"
        : after.livesLeft <= 0 ? "game over"
        : "out of tiles",
      scoreBase: after.scoreBase,
      tally: after.endTally.map((e) => ({ label: END_LABEL[e.kind] ?? e.kind, delta: e.delta })),
      finalScore: after.finalScore,
    };
  }
  return t;
}

/** One trace entry as a multi-line, human-readable block. */
export function formatMoveTrace(t: MoveTrace): string {
  const L: string[] = [];
  L.push(`#${t.move}  play ${t.placed} @ ${t.at}${t.covered ? ` (covers ${t.covered})` : ""}  →  ${t.outcome.toUpperCase()}`);
  if (t.combos.length) L.push(`   combo: ${t.combos.map((c) => `${c.name}[${c.cells.join(" ")}]`).join("  +  ")}`);
  if (t.banked) L.push(`   BANK ${t.banked.combos.join("+") || "—"}${t.banked.multiplier > 1 ? ` ×${t.banked.multiplier}` : ""}: ${t.banked.cells.length} tiles → score  [${t.banked.cells.join(" ")}]`);
  if (t.overflow) L.push(`   overflow→hand: ${t.overflow.toHand}× "${t.overflow.value}"  [${t.overflow.cells.join(" ")}]${t.overflow.refinedNebulites ? `  ⇒ refined ${t.overflow.refinedNebulites} Nebulite(s)` : ""}${t.overflow.bonus ? `  (+${t.overflow.bonus})` : ""}`);
  if (t.coveredTo) L.push(`   covered → ${t.coveredTo}: ${t.covered}`);
  if (t.buriedToHand) L.push(`   buried→hand: ${t.buriedToHand.map((b) => `${b.value}@${b.cell}`).join(" ")}`);
  if (t.isolatedToScore) L.push(`   isolated→score (Rule 2): ${t.isolatedToScore.map((b) => `${b.value}@${b.cell}(+${b.points})`).join(" ")}`);
  if (t.pairToHand) L.push(`   isolated pair→hand (Rule 6): ${t.pairToHand.map((b) => `${b.value}@${b.cell}`).join(" ")}`);
  if (t.respawnedNebuliteAt) L.push(`   Nebulite respawned @ ${t.respawnedNebuliteAt}`);
  if (t.collapsed) L.push(`   board COLLAPSED`);
  if (t.reshuffled) L.push(`   hand RESHUFFLED`);
  L.push(`   score ${t.score.before} → ${t.score.after} (${t.score.delta >= 0 ? "+" : ""}${t.score.delta})   banks:${t.totals.banks} busts:${t.totals.busts}   hand:[${t.hand.after.join(",")}]`);
  if (t.end) {
    // the end-card score overview: in-play score, then each bonus/penalty applied in order
    L.push(`   ┌─ END OF RUN · ${t.end.outcome.toUpperCase()} ─ (bonuses applied here in the summary, not during play)`);
    L.push(`   │ in-play score (carried in): ${t.end.scoreBase.toLocaleString()}`);
    let running = t.end.scoreBase;
    for (const s of t.end.tally) {
      running += s.delta;
      L.push(`   │   ${s.label}: ${s.delta >= 0 ? "+" : "−"}${Math.abs(s.delta).toLocaleString()}   → ${Math.max(0, running).toLocaleString()}`);
    }
    L.push(`   └─ FINAL SCORE: ${t.end.finalScore.toLocaleString()}`);
  }
  return L.join("\n");
}

// ---- buffer + browser hooks ----
const buffer: MoveTrace[] = [];

/** Trace is on when the URL has ?debug (any value) or localStorage glint.debug === "1". */
export function isTraceEnabled(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (new URLSearchParams(window.location.search).has("debug")) return true;
    return window.localStorage?.getItem("glint.debug") === "1";
  } catch {
    return false;
  }
}

/** Turn the dev tracer on/off, persisted in localStorage (survives reloads). Used by
 *  the hidden STUDIO FUNK triple-tap so it can be enabled on an installed iOS web app
 *  where you can't edit the URL. */
export function setTraceEnabled(on: boolean): void {
  try {
    if (on) window.localStorage?.setItem("glint.debug", "1");
    else window.localStorage?.removeItem("glint.debug");
  } catch {
    /* storage unavailable */
  }
}

export function getTrace(): MoveTrace[] {
  return buffer;
}
export function traceText(): string {
  return buffer.map(formatMoveTrace).join("\n\n");
}
export function clearTrace(): void {
  buffer.length = 0;
  if (typeof window !== "undefined") (window as unknown as Record<string, unknown>).__glintTrace = buffer;
}

/** Record a move (no-op unless trace is enabled). Also mirrors to the console + window. */
export function recordMoveTrace(before: GameState, after: GameState, cellKey: string, choiceIdx = 0): void {
  if (!isTraceEnabled()) return;
  const t = traceMove(before, after, cellKey, choiceIdx);
  buffer.push(t);
  const w = window as unknown as Record<string, unknown>;
  w.__glintTrace = buffer;
  w.__glintTraceText = () => traceText();
  // eslint-disable-next-line no-console
  console.log("%c" + formatMoveTrace(t), "color:#b08bff;font-family:monospace;white-space:pre");
}
