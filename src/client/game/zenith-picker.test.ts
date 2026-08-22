import { describe, it, expect } from "vitest";
import { newGame, place, planMove, describePlace, ZENITH, GameState } from "./engine";
import { lineupRows } from "../ui/useNebuliteGame";

/**
 * THE ZENITH MUST PICK THE BEST *OUTCOME*, NOT THE BEST-NAMED COMBO (bug: a
 * Zenith between two Nuracite chose a Vigilite Echo instead). Combo points are
 * flat per name — Echo(2s) and Echo(6s) both score 300 — so a name-based rank
 * ties and falls to loop order, blind to the isolation sweep that banks every
 * stranded tile at face value. The picker must weigh the full simulated
 * placement: bank score PLUS isolation sweeps PLUS board clearing.
 */

const occ = (g: GameState) => [...g.cells.values()].filter((c) => c.tile !== null).length;

/** A board where the Zenith has two Echo options with EQUAL combo scores but
 *  very different sweeps:
 *  - X (covers a Chromite) next to a Vigilite `a` and a Nuracite `b`
 *  - one Umbrite hangs off `a`; TWO mutually-unconnected Umbrites hang off `b`
 *  Banking the Vigilite pair strands b's side (2 tiles stay); banking the
 *  Nuracite pair sweeps BOTH its Umbrites and clears more of the board. */
function rig(): { g: GameState; X: string } {
  const g = newGame({ side: 4, nebulites: 0, dross: 0, seed: 11 });
  for (const k of g.order) {
    const c = g.cells.get(k)!;
    c.tile = null;
    c.buried = null;
    c.bonusGem = undefined;
  }
  const adj = (k: string) => g.adj.get(k) ?? [];
  const touching = (p: string, q: string) => adj(p).includes(q);

  // find X, non-adjacent neighbours a/b, one leaf e off a, two mutually
  // non-adjacent leaves f/g off b — every leaf touching nothing else occupied
  for (const X of g.order) {
    for (const a of adj(X)) {
      for (const b of adj(X)) {
        if (b === a || touching(a, b)) continue;
        const leaves = (h: string, avoid: string[]) =>
          adj(h).filter((k) => k !== X && !touching(k, X) && avoid.every((o) => k !== o && !touching(k, o)));
        for (const e of leaves(a, [b])) {
          const fs = leaves(b, [a, e]);
          for (const f of fs) {
            const gCand = fs.find((k) => k !== f && !touching(k, f));
            if (!gCand) continue;
            g.cells.get(X)!.tile = 3; // Chromite (the ×3 the Zenith covers)
            g.cells.get(a)!.tile = 2; // Vigilite
            g.cells.get(b)!.tile = 6; // Nuracite
            g.cells.get(e)!.tile = 5; // Umbrite leaf on the Vigilite side
            g.cells.get(f)!.tile = 5; // Umbrite leaves on the Nuracite side…
            g.cells.get(gCand)!.tile = 5; // …both strand when the 6s bank
            g.deathMatch = true; // GLINT RUSH: any combo banks
            g.hand = [ZENITH];
            return { g, X };
          }
        }
      }
    }
  }
  throw new Error("no board cell fits the rig pattern");
}

describe("Zenith wildcard picker", () => {
  it("prefers the value whose FULL outcome (bank + isolation sweep) is best", () => {
    const { g, X } = rig();
    const plan = planMove(g, X);
    expect(plan?.isLegalBuild).toBe(true);
    // the Nuracite pairing sweeps two stranded Umbrites; the Vigilite pairing
    // (equal combo score, earlier in loop order) sweeps only one
    expect(plan?.wildValue).toBe(6);
  });

  it("lines up in its TRUE Drift slot, not sorted as value 10", () => {
    // 3 · [gap] · 5 · 6 — the Zenith fills the 4 and must stand SECOND in the
    // Drift row, not sort to the end as value 10
    const g = newGame({ side: 4, nebulites: 0, dross: 0, seed: 5 });
    for (const k of g.order) {
      const c = g.cells.get(k)!;
      c.tile = null;
      c.buried = null;
      c.bonusGem = undefined;
    }
    const adj = (k: string) => g.adj.get(k) ?? [];
    // X with two non-adjacent neighbours a/b, and a tail c off b
    let X = "", a = "", b = "", cc = "";
    outer: for (const k of g.order) {
      for (const n1 of adj(k)) {
        for (const n2 of adj(k)) {
          if (n2 === n1 || adj(n1).includes(n2)) continue;
          const tail = adj(n2).find((t) => t !== k && t !== n1 && !adj(k).includes(t));
          if (tail) { X = k; a = n1; b = n2; cc = tail; break outer; }
        }
      }
    }
    expect(X).not.toBe("");
    g.cells.get(a)!.tile = 3;
    g.cells.get(b)!.tile = 5;
    g.cells.get(cc)!.tile = 6;
    g.deathMatch = true;
    g.hand = [ZENITH];

    const outcome = describePlace(g, X);
    expect(outcome.kind).toBe("bank");
    expect(outcome.placedAs).toBe(4); // the 3-4-5-6 Drift is the only legal fill

    // the frozen view the UI hands to the lineup still shows the raw Zenith
    const frozen: GameState = { ...g, cells: new Map(g.cells) };
    frozen.cells.set(X, { ...frozen.cells.get(X)!, tile: ZENITH });
    const rows = lineupRows(outcome.bankCombos, frozen, { cell: X, value: outcome.placedAs! });
    const run = rows.find((r) => r.tiles.length === 4)!;
    expect(run.tiles.map((t) => t.cell)).toEqual([a, X, b, cc]); // 3 · Z-as-4 · 5 · 6
  });

  it("its chosen value achieves the maximum simulated score of any candidate", () => {
    const { g, X } = rig();
    const chosen = planMove(g, X)!;
    const after = place(g, X, 0, { preview: true });
    const chosenDelta = after.score - g.score;
    for (let v = 1; v <= 6; v++) {
      const probe = rig();
      probe.g.hand = [v as 1];
      const p = planMove(probe.g, X);
      if (!p || !p.isLegalBuild) continue;
      const a2 = place(probe.g, X, 0, { preview: true });
      expect(chosenDelta, `zenith (as ${chosen.wildValue}) must beat plain ${v}`).toBeGreaterThanOrEqual(
        a2.score - probe.g.score
      );
    }
  });
});
