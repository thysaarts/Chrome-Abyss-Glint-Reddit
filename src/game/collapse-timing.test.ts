import { describe, it, expect } from "vitest";
import { newGame, place, isLegalTarget, GameState } from "./engine";

// occupancy = tiles actually on the board (mirrors the engine's countOccupied)
const occ = (g: GameState) => g.order.filter((k) => g.cells.get(k)!.tile !== null).length;

// the occupancy at/below which a board of this size owes a collapse
const trigger = (g: GameState) => (g.side === 6 ? g.collapseAt1 : g.side === 5 ? g.collapseAt2 : -1);

const legalTargets = (g: GameState) => g.order.filter((k) => isLegalTarget(g, k));

// an occupied, non-combo cell to place onto for a deliberate BUST (exercises doBust)
const bustCell = (g: GameState) =>
  g.order.find((k) => g.cells.get(k)!.tile !== null && !g.activatedCells.includes(k) && !isLegalTarget(g, k));

/**
 * ROOT-CAUSE INVARIANT (regression guard for the mid-activation collapse snap):
 * after every resolved move, the board must NEVER sit at or below its collapse
 * trigger while still collapsible — the collapse must have fired THIS turn.
 *
 * The isolation cleanup that runs after the shrink check itself removes tiles, which
 * can drop occupancy across a trigger the first check couldn't see. Before the fix
 * that collapse was left "owed" and fired on a later move (e.g. a covering
 * activation), snapping the board mid-action. settleCollapse re-checks so this can
 * never happen.
 *
 * The place/bank deferral reproduces readily (at default triggers, legal play alone
 * trips this on the pre-fix engine). The sweep also varies the collapse triggers and
 * interleaves deliberate busts near a trigger, to exercise doBust's discard removals —
 * whose identical ordering is fixed by the same settleCollapse mechanism.
 */
describe("collapse is never left owing (late isolation cannot defer it)", () => {
  it("holds across seeded playthroughs", () => {
    const offenders: string[] = [];
    for (let seed = 1; seed <= 250 && offenders.length < 5; seed++) {
      // vary the collapse triggers (a per-level parameter): higher triggers put more
      // traffic across the collapse line, exercising late-removal crossings on all paths
      const hi = seed % 3;
      let g = newGame({ seed, side: 6, collapseAt1: hi ? 40 + hi * 8 : 30, collapseAt2: hi ? 24 + hi * 6 : 15 });
      for (let m = 0; m < 400 && g.phase === "playing"; m++) {
        const targets = legalTargets(g);
        // exercise doBust's reshuffle/discard removals — and aim busts at NEAR-trigger
        // states, where a wake discard is most likely to cross the collapse line (the
        // bust-path deferral). Keep a life in reserve so the game doesn't just end.
        const margin = g.side > 4 ? occ(g) - trigger(g) : 99;
        const wantBust = (margin >= 1 && margin <= 6) || m % 4 === 3;
        const bust = wantBust && g.livesLeft > 1 ? bustCell(g) : undefined;
        const target = bust ?? (targets.length ? targets[(seed * 7 + m * 13) % targets.length] : undefined);
        if (!target) break;
        g = place(g, target);
        if (g.side > 4 && occ(g) <= trigger(g)) {
          offenders.push(`seed ${seed}, move ${m}: side ${g.side}, occ ${occ(g)} <= trigger ${trigger(g)}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // Regression: when a bust both collapses the board AND drops a forced inert tile,
  // settleCollapse's afterShrink must remap that tile through the collapse EXACTLY once
  // — never re-apply a stale mapping (which set lastResolved.inertAt to null). Since
  // ageInertTiles clears inert flags each turn, a lone inert cell is this move's forced
  // tile, and its UI ref must point to it.
  it("keeps the forced inert tile's UI ref correct through a bust collapse", () => {
    const offenders: string[] = [];
    for (let seed = 1; seed <= 250 && offenders.length < 5; seed++) {
      const hi = seed % 3;
      let g = newGame({ seed, side: 6, collapseAt1: hi ? 40 + hi * 8 : 30, collapseAt2: hi ? 24 + hi * 6 : 15 });
      for (let m = 0; m < 400 && g.phase === "playing"; m++) {
        const targets = legalTargets(g);
        const margin = g.side > 4 ? occ(g) - trigger(g) : 99;
        const wantBust = (margin >= 1 && margin <= 6) || m % 4 === 3;
        const bust = wantBust && g.livesLeft > 1 ? bustCell(g) : undefined;
        const target = bust ?? (targets.length ? targets[(seed * 7 + m * 13) % targets.length] : undefined);
        if (!target) break;
        g = place(g, target);
        const inert = g.order.filter((k) => g.cells.get(k)!.inert);
        if (inert.length === 1 && g.lastResolved.inertAt !== inert[0]) {
          offenders.push(`seed ${seed} m${m}: inert cell ${inert[0]} but inertAt=${g.lastResolved.inertAt}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
