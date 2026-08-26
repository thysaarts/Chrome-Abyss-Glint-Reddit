import { describe, it, expect } from "vitest";
import { newGame, place, describePlace, GameState, GLINT } from "./engine";

/**
 * THYS'S RULING (2026-08-26): a bust's forced tile RECONNECTS its neighbours —
 * busting beside an otherwise-lone Dross (or any gem) leaves BOTH on the board.
 * Only true isolation discards in the wake: lone tiles, or same-value plain
 * pairs. A mixed pair is not isolation.
 *
 * The bug this pins: the engine already waited for the forced drop before the
 * wake sweep, and already left mixed pairs alone — but the post-bust NUDGE
 * drifted one of the pair away first, and the sweep then correctly saw two
 * singles and discarded both (100/100 seeds on a sparse board). Letting that
 * stand also hands players a board-clearing cheat: bust next to the last Dross
 * and watch it vanish.
 *
 * The fix: the nudge is ISOLATION-NEUTRAL — a drift destination is legal only
 * if the move does not increase the number of stranded (size ≤ 2) occupied
 * groups. So the pair may drift, but never apart.
 */
describe("bust beside a lone Dross — the forced tile reconnects it", () => {
  const build = (seed: number) => {
    const s: GameState = newGame({ seed, side: 6, handSize: 9, nebulites: 0, dross: 0, collapseAt1: 0, collapseAt2: 0, bonusGems: { resurrect: false, quadriant: false, zenith: false } });
    for (const k of s.order) { const c = s.cells.get(k)!; c.tile = null; c.inert = false; c.buried = null; }
    const adj = (k: string) => s.adj.get(k) ?? [];
    const D = s.order.find((k) => adj(k).length >= 4)!;
    const [V, C1] = adj(D);
    const C2 = adj(C1).find((k) => k !== D && k !== V)!;
    const C3 = adj(C2).find((k) => k !== D && k !== V && k !== C1)!;
    s.cells.get(D)!.tile = GLINT;                       // the lone Dross
    for (const k of [C1, C2, C3]) s.cells.get(k)!.tile = 4; // activated Trips touching it
    s.activatedCombos = [{ name: "Trips", cells: [C1, C2, C3] } as GameState["activatedCombos"][number]];
    s.activatedCells = [C1, C2, C3];
    s.hand = [5, 2, 3, 1, 6, 2, 3, 1, 6];               // 5 busts at V (nothing matches)
    return { s, V };
  };

  it("both the Dross and the forced tile survive the wake, adjacent, across seeds", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { s, V } = build(seed);
      expect(describePlace(s, V).kind).toBe("bust");
      const after = place(s, V);
      // nothing was swept as "isolated" — the pair is mixed, not isolated
      expect(after.lastResolved.lateDiscarded, `seed ${seed}: wake discarded ${JSON.stringify(after.lastResolved.lateDiscarded)}`).toEqual([]);
      // both tiles still live on the board (the nudge may have drifted them)…
      const occupied = after.order.filter((k) => after.cells.get(k)!.tile !== null);
      const drossAt = occupied.filter((k) => after.cells.get(k)!.tile === GLINT);
      expect(drossAt.length, `seed ${seed}: dross missing`).toBe(1);
      const inertAt = after.lastResolved.inertAt;
      expect(inertAt, `seed ${seed}: forced tile missing`).toBeTruthy();
      expect(after.cells.get(inertAt!)!.tile, `seed ${seed}: forced cell empty`).not.toBeNull();
      // …and still connected to each other (the nudge may not separate them)
      expect(after.adj.get(drossAt[0])!.includes(inertAt!), `seed ${seed}: pair separated`).toBe(true);
    }
  });

  it("a genuinely lone tile in the wake still discards, unscored (the rule keeps its teeth)", () => {
    // same setup but NO vacant reconnection: bust far from the Dross, so the
    // cluster loss truly strands it — the wake must sweep it for 0 points.
    for (let seed = 1; seed <= 30; seed++) {
      const s: GameState = newGame({ seed, side: 6, handSize: 9, nebulites: 0, dross: 0, collapseAt1: 0, collapseAt2: 0, bonusGems: { resurrect: false, quadriant: false, zenith: false } });
      for (const k of s.order) { const c = s.cells.get(k)!; c.tile = null; c.inert = false; c.buried = null; }
      const adj = (k: string) => s.adj.get(k) ?? [];
      const D = s.order.find((k) => adj(k).length >= 4)!;
      const C1 = adj(D)[1];
      const C2 = adj(C1).find((k) => k !== D)!;
      const C3 = adj(C2).find((k) => k !== D && k !== C1)!;
      // a far-away vacant cell: no occupied neighbours, AND beyond one drift of
      // the Dross — otherwise the isolation-neutral nudge can legitimately step
      // the forced tile next to it and reconnect the pair
      const nearD = new Set([D, ...adj(D)]);
      const far = s.order.find((k) =>
        ![D, C1, C2, C3].includes(k) && !nearD.has(k) &&
        adj(k).every((n) => ![D, C1, C2, C3].includes(n) && !nearD.has(n)))!;
      s.cells.get(D)!.tile = GLINT;
      for (const k of [C1, C2, C3]) s.cells.get(k)!.tile = 4;
      // an ANCHOR group (size 4 — beyond every isolation rule) parked well away,
      // so the wake sweeping the strays can never empty the board and fire the
      // BOARD CLEARED jackpot (which is what muddied this test's first draft)
      // banned zone: the scenario cells AND everything within one drift of the
      // Dross or the bust cell — the nudge may reduce strays, so an anchor within
      // one cell of the Dross would let it legitimately reconnect and survive
      const banned = new Set([D, C1, C2, C3, far, ...adj(D), ...adj(far)]);
      const A0 = [...s.order].reverse().find((k) => !banned.has(k) && adj(k).every((n) => !banned.has(n)))!;
      const anchor = [A0];
      for (const nb of adj(A0)) { if (anchor.length < 4 && !banned.has(nb) && adj(nb).every((n) => !banned.has(n))) anchor.push(nb); }
      for (const k of anchor) s.cells.get(k)!.tile = 6;
      if (anchor.length < 4) continue; // geometry didn't fit this seed — skip
      s.activatedCombos = [{ name: "Trips", cells: [C1, C2, C3] } as GameState["activatedCombos"][number]];
      s.activatedCells = [C1, C2, C3];
      s.hand = [5, 2, 3, 1, 6, 2, 3, 1, 6];
      if (describePlace(s, far).kind !== "bust") continue; // anchor adjacency changed the read — skip
      const scoreBefore = s.score;
      const after = place(s, far);
      // the Dross was truly stranded by the cluster loss → swept, no points
      const stillDross = after.order.some((k) => after.cells.get(k)!.tile === GLINT);
      expect(stillDross, `seed ${seed}: stranded dross should discard`).toBe(false);
      expect(after.score, `seed ${seed}: a bust never pays`).toBe(scoreBefore);
    }
  });
});
