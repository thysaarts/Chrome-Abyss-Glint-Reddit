import { describe, it, expect } from "vitest";
import { newGame, GameState, place, cashOut, isLegalTarget, QUADRIANT } from "./engine";
import { chooseSoloAction, shouldBankNowSolo, chooseBrokerAction } from "./brokerAI";

/**
 * SOLO AUTOPILOT HARNESS (DEV TOOLS › AI player) — the AI plays full solo runs
 * headlessly across seeds. Proves:
 *  1. it finishes real games without stalling or crashing,
 *  2. the GLINT RUSH forfeit rule is respected: once the rush is on it NEVER
 *     places a busting tile — the moment no safe build exists it cashes out.
 */

const seededRng = (seed: number) => {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 0xffffffff; };
};

function playSolo(seed: number): { s: GameState; turns: number; cashedOut: boolean; rushBust: boolean } {
  let s: GameState = newGame({ seed, side: 6 });
  const rng = seededRng(seed * 3 + 1);
  let turns = 0;
  let cashedOut = false;
  let rushBust = false;
  while (s.phase === "playing" && turns < 400) {
    const a = chooseSoloAction(s, rng);
    if (!a) break;
    const before = s;
    if (a.kind === "cashout") {
      cashedOut = true;
      s = cashOut(s);
    } else if (a.kind === "place") {
      const i = a.rotateTo ?? 0;
      const rs = i > 0 ? { ...s, hand: [...s.hand.slice(i), ...s.hand.slice(0, i)] } : s;
      // the forfeit rule: in the rush the AI must only ever take SAFE builds
      if (s.deathMatch && !isLegalTarget(rs, a.cell!)) rushBust = true;
      s = place(rs, a.cell!, 0);
    }
    if (s === before) break; // guard: a no-op action must not loop forever
    turns++;
  }
  return { s, turns, cashedOut, rushBust };
}

describe("the solo autopilot (DEV TOOLS › AI player)", () => {
  it("finishes real solo runs across seeds without stalling", () => {
    const scores: number[] = [];
    for (const seed of [7, 19, 42, 101, 333]) {
      const { s, turns } = playSolo(seed);
      expect(turns).toBeGreaterThan(4); // a real game happened
      expect(s.phase).not.toBe("playing"); // and actually concluded
      scores.push(s.finalScore ?? s.score);
    }
    // STRATEGY FLOOR: the two-step opening + survival play (2026-08-27) averages
    // ~40k on these seeds (the greedy baseline averaged ~33k) — a regression
    // below this floor means the strategy weights broke something real
    expect(scores.reduce((a, b) => a + b, 0) / scores.length).toBeGreaterThan(25_000);
  }, 120_000);

  it("never busts during GLINT RUSH — it cashes out instead (forfeit rule)", () => {
    for (const seed of [7, 19, 42, 101, 333, 555, 777]) {
      const { rushBust } = playSolo(seed);
      expect(rushBust).toBe(false);
    }
  }, 120_000);

  it("banks a BANK NOW offer without hesitation during the rush", () => {
    const s = newGame({ seed: 9, side: 6 });
    expect(shouldBankNowSolo({ ...s, deathMatch: true }, s.order[0])).toBe(true);
  });

  it("returns null for versus states (the duel driver owns those)", () => {
    const duel = newGame({ seed: 12, versus: { names: ["A", "B"] }, side: 6 });
    expect(chooseSoloAction(duel, seededRng(1))).toBeNull();
  });

  // OPENING DISCIPLINE (Thys field report 2026-08-27): pre-collapse the AI must
  // play TWO-STEP — activate setups and bank what it BUILT, not flash instant
  // 6+ banks from scratch. Before the instant/built split the profile over
  // these seeds was 61 instant / 21 built / 33 activations (a bank-chaser);
  // after, 3 / 67 / 76. This pins the shape, with margin.
  it("pre-collapse it sets up and builds — instant banks stay rare", () => {
    const preBuilt = (s: GameState, cell: string): number => {
      const act = new Set(s.activatedCells);
      const seen = new Set<string>();
      const stack = [...(s.adj.get(cell) ?? [])].filter((k) => act.has(k));
      for (const k of stack) seen.add(k);
      while (stack.length) {
        const c = stack.pop()!;
        for (const nb of s.adj.get(c) ?? []) if (act.has(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb); }
      }
      return seen.size;
    };
    let instant = 0, built = 0, activations = 0, rushReached = 0;
    for (const seed of [7, 19, 42, 101, 333, 555, 777, 901, 1234, 4321]) {
      let s: GameState = newGame({ seed, side: 6 });
      const rng = seededRng(seed * 3 + 1);
      let turns = 0, sawRush = false;
      while (s.phase === "playing" && turns < 400) {
        const a = chooseSoloAction(s, rng);
        if (!a) break;
        const before = s;
        if (a.kind === "cashout") s = cashOut(s);
        else {
          const i = a.rotateTo ?? 0;
          const rs = i > 0 ? { ...s, hand: [...s.hand.slice(i), ...s.hand.slice(0, i)] } : s;
          const opening = rs.side === 6 && !rs.deathMatch;
          const pb = opening ? preBuilt(rs, a.cell!) : -1;
          s = place(rs, a.cell!, 0);
          if (opening) {
            if (s.banks > rs.banks) { if (pb < 3) instant++; else built++; }
            else if (s.activatedCells.length > rs.activatedCells.length) activations++;
          }
        }
        if (s.deathMatch) sawRush = true;
        if (s === before) break;
        turns++;
      }
      if (sawRush || s.phase === "won") rushReached++;
    }
    expect(instant).toBeLessThanOrEqual(10); // was 61 as a bank-chaser
    expect(activations).toBeGreaterThanOrEqual(40); // setups dominate the opening
    expect(built).toBeGreaterThanOrEqual(instant * 3); // banks complete INVESTMENTS
    // GEM ECONOMY (second field report): the AI must not starve out early —
    // with the always-on gem terms + coverage + lookahead it reaches GLINT
    // RUSH (or clears) in 10/10 of these games; was 7/10 before the fix
    expect(rushReached).toBeGreaterThanOrEqual(9);
  }, 300_000);

  // HONEST HANDS (Thys 2026-08-27): until the hand is revealed a human can only
  // place the FRONT tile — the AI must never rotate to a hidden one. Checked
  // across whole playthroughs, solo AND versus (the Broker cheated too).
  it("never slides to an unrevealed tile — solo", () => {
    for (const seed of [3, 21, 88]) {
      let s: GameState = newGame({ seed, side: 6 });
      const rng = seededRng(seed);
      let turns = 0, preRevealChoices = 0;
      while (s.phase === "playing" && turns < 400) {
        const a = chooseSoloAction(s, rng);
        if (!a) break;
        if (a.kind === "cashout") { s = cashOut(s); turns++; continue; }
        if (!s.handRevealed) { preRevealChoices++; expect(a.rotateTo ?? 0).toBe(0); }
        const i = a.rotateTo ?? 0;
        const rs = i > 0 ? { ...s, hand: [...s.hand.slice(i), ...s.hand.slice(0, i)] } : s;
        const before = s;
        s = place(rs, a.cell!, 0);
        if (s === before) break;
        turns++;
      }
      expect(preRevealChoices).toBeGreaterThan(0); // the rule was actually exercised
    }
  }, 120_000);

  // FAIR VIEW (Thys 2026-08-27): buried Resurrect / Quadriant are "hidden until
  // revealed" — the AI's one-move simulations must not see them. The choice on
  // a board WITH buried bonus gems must equal the choice on its gem-blind twin,
  // at every step of a playthrough. Finding one stays pure luck.
  it("FAIR VIEW: buried bonus gems never influence the solo choice", () => {
    const strip = (st: GameState): GameState => {
      const cells = new Map(st.cells);
      for (const [k, c] of cells) if (c.bonusGem != null) cells.set(k, { ...c, bonusGem: null });
      return { ...st, cells };
    };
    for (const seed of [5, 23, 77, 141]) {
      let s: GameState = newGame({ seed, side: 6, bonusGems: { quadriant: true, resurrect: true } });
      expect([...s.cells.values()].some((c) => c.bonusGem != null)).toBe(true); // gems really buried
      let turns = 0;
      while (s.phase === "playing" && turns < 60) {
        const a = chooseSoloAction(s, seededRng(seed * 100 + turns));
        const b = chooseSoloAction(strip(s), seededRng(seed * 100 + turns));
        expect(a).toEqual(b);
        if (!a) break;
        const before = s;
        if (a.kind === "cashout") s = cashOut(s);
        else {
          const i = a.rotateTo ?? 0;
          const rs = i > 0 ? { ...s, hand: [...s.hand.slice(i), ...s.hand.slice(0, i)] } : s;
          s = place(rs, a.cell!, 0);
        }
        if (s === before) break;
        turns++;
      }
      expect(turns).toBeGreaterThan(4);
    }
  }, 120_000);

  it("FAIR VIEW: the Broker is blind to a planted Quadriant", () => {
    const base = newGame({ seed: 31, versus: { names: ["A", "B"] }, side: 6 });
    const k = base.order.find((key) => {
      const c = base.cells.get(key)!;
      return typeof c.tile === "number" && c.buried === null && c.bonusGem == null;
    })!;
    const planted: GameState = { ...base, cells: new Map(base.cells) };
    planted.cells.set(k, { ...planted.cells.get(k)!, bonusGem: QUADRIANT });
    expect(chooseBrokerAction(planted, 3, seededRng(9))).toEqual(chooseBrokerAction(base, 3, seededRng(9)));
  });

  it("never slides to an unrevealed tile — the Broker (both seats, tier 3)", async () => {
    const { chooseBrokerAction, applyBrokerAction } = await import("./brokerAI");
    for (const seed of [11, 47]) {
      let s: GameState = newGame({ seed, versus: { names: ["A", "B"] }, side: 6 });
      const rng = seededRng(seed * 5 + 2);
      let turns = 0, preRevealChoices = 0;
      while (s.phase === "playing" && turns < 400) {
        const a = chooseBrokerAction(s, 3, rng);
        if (!a) break;
        if (a.kind === "place" && !s.handRevealed) { preRevealChoices++; expect(a.rotateTo ?? 0).toBe(0); }
        const before = s;
        s = applyBrokerAction(s, a);
        if (s === before) break;
        turns++;
      }
      expect(preRevealChoices).toBeGreaterThan(0);
    }
  }, 120_000);
});
