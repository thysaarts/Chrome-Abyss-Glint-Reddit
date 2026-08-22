import { describe, it, expect } from "vitest";
import { newGame, place, isLegalTarget, rigRevealHand, CORE, GameState, TileVal, NewGameOpts } from "./engine";

/** The board+hand facts a rigged deal must reproduce exactly. */
const snapshot = (g: GameState) => ({
  tiles: g.order.map((k) => g.cells.get(k)!.tile),
  hand: [...g.hand],
});

/** The friendliness of a laid-out BOARD, re-implemented here on purpose: +2 per
 *  adjacent equal pair, +1 per adjacent consecutive pair. Independent of the
 *  engine's own scorer, so a bug in one can't hide in the other. */
function boardScore(g: GameState): number {
  let score = 0;
  for (const k of g.order) {
    const a = g.cells.get(k)!.tile;
    if (typeof a !== "number" || a < 1 || a > 6) continue;
    for (const nb of g.adj.get(k) ?? []) {
      if (nb <= k) continue; // each unordered pair once
      const b = g.cells.get(nb)!.tile;
      if (typeof b !== "number" || b < 1 || b > 6) continue;
      if (a === b) score += 2;
      else if (Math.abs(a - b) === 1) score += 1;
    }
  }
  return score;
}

/** The board's appetite per mineral, re-implemented for the tests: a visible cell
 *  counts 2 when it touches its own kind, 1 when it sits alone. */
function needScores(g: GameState): Map<number, number> {
  const need = new Map<number, number>();
  for (let v = 1; v <= 6; v++) need.set(v, 0);
  for (const k of g.order) {
    const t = g.cells.get(k)!.tile;
    if (typeof t !== "number" || t < 1 || t > 6) continue;
    const paired = (g.adj.get(k) ?? []).some((nb) => g.cells.get(nb)!.tile === t);
    need.set(t, need.get(t)! + (paired ? 2 : 1));
  }
  return need;
}

const BASE: NewGameOpts = { side: 4, nebulites: 0, dross: 0 };

describe("tutorialRig deal (best of 8)", () => {
  it("is deterministic for a given seed", () => {
    const a = newGame({ ...BASE, seed: 42, tutorialRig: true });
    const b = newGame({ ...BASE, seed: 42, tutorialRig: true });
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("is never worse than the plain deal, seed for seed", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const plain = boardScore(newGame({ ...BASE, seed }));
      const rigged = boardScore(newGame({ ...BASE, seed, tutorialRig: true }));
      expect(rigged, `seed ${seed}`).toBeGreaterThanOrEqual(plain);
    }
  });

  // the promise has to survive a level that carries GAPS — the gap draw sits
  // between candidate 1 and the rest precisely so it does
  it("is never worse on a gapped board either", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const plain = newGame({ ...BASE, seed, gaps: 3 });
      const rigged = newGame({ ...BASE, seed, gaps: 3, tutorialRig: true });
      const gapsOf = (g: GameState) => g.order.filter((k) => g.cells.get(k)!.tile === null).sort();
      expect(gapsOf(rigged), `seed ${seed}`).toEqual(gapsOf(plain)); // same holes, so it's the same board compared
      expect(boardScore(rigged), `seed ${seed}`).toBeGreaterThanOrEqual(boardScore(plain));
    }
  });

  it("carries the flag from the opts onto the state", () => {
    expect(newGame({ ...BASE, seed: 4, tutorialRig: true }).tutorialRig).toBe(true);
    expect(newGame({ ...BASE, seed: 4, tutorialRig: false }).tutorialRig).toBe(false);
    expect(newGame({ ...BASE, seed: 4 }).tutorialRig).toBe(false);
  });

  it("actually helps across a run of seeds", () => {
    let plain = 0;
    let rigged = 0;
    for (let seed = 1; seed <= 30; seed++) {
      plain += boardScore(newGame({ ...BASE, seed }));
      rigged += boardScore(newGame({ ...BASE, seed, tutorialRig: true }));
    }
    expect(rigged).toBeGreaterThan(plain);
  });

  it("leaves the plain deal untouched when the flag is absent", () => {
    expect(snapshot(newGame({ ...BASE, seed: 9 }))).toEqual(snapshot(newGame({ ...BASE, seed: 9, tutorialRig: false })));
  });
});

/** A board made rich in Vigilite-5 with a hand holding two dud minerals, a Core
 *  and a 5. needScore[5] is huge; needScore[1] and [2] are zero. */
function craft(tutorialRig: boolean): GameState {
  const g = newGame({ ...BASE, seed: 3 });
  for (const k of g.order) g.cells.get(k)!.tile = 5;
  g.tutorialRig = tutorialRig;
  g.hand = [3, 1, 2, CORE, 5] as TileVal[];
  return g;
}

describe("rigRevealHand", () => {
  it("swaps at most two undrawn duds and never touches the active tile", () => {
    const g = craft(true);
    const before = [...g.hand];
    rigRevealHand(g);
    expect(g.hand.length).toBe(before.length);
    expect(g.hand[0]).toBe(before[0]); // the tile already being placed
    expect(g.hand[3]).toBe(CORE); // non-minerals hold their slot
    // exactly the two zero-need minerals became the high-need value
    const changed = g.hand.filter((t, i) => t !== before[i]).length;
    expect(changed).toBeLessThanOrEqual(2);
    expect(g.hand.slice(1).filter((t) => t === 5).length).toBe(3);
    expect(g.hand).toEqual([3, 5, 5, CORE, 5]);
  });

  it("is stable when run again — reorder only, never fresh swaps", () => {
    const g = craft(true);
    rigRevealHand(g);
    const once = [...g.hand];
    rigRevealHand(g);
    expect(g.hand).toEqual(once);
  });

  it("orders the undrawn minerals by how much the board wants them", () => {
    const g = newGame({ ...BASE, seed: 3 });
    // a board of paired 5s, a pair of 6s and one lonely 4 → three DISTINCT
    // appetites left standing once the two-swap cap is spent on the duds
    g.order.forEach((k, i) => (g.cells.get(k)!.tile = i === 0 ? 4 : i <= 2 ? 6 : 5));
    g.tutorialRig = true;
    const need = needScores(g);
    expect(need.get(5)!).toBeGreaterThan(need.get(6)!);
    expect(need.get(6)!).toBeGreaterThan(need.get(4)!);
    expect(need.get(4)!).toBeGreaterThan(need.get(1)!);

    g.hand = [3, 1, 2, CORE, 4, 6, 5] as TileVal[];
    rigRevealHand(g);

    expect(g.hand[0]).toBe(3); // the tile already on its way out
    expect(g.hand[3]).toBe(CORE); // the Core holds its slot
    // the two zero-need duds became the hungriest value; 4, 6 and 5 survive and
    // fall into descending-appetite order around the Core
    const minerals = [g.hand[1], g.hand[2], g.hand[4], g.hand[5], g.hand[6]] as number[];
    expect(minerals).toEqual([5, 5, 5, 6, 4]);
    const wants = minerals.map((v) => need.get(v)!);
    expect(wants).toEqual([...wants].sort((a, b) => b - a));
  });

  it("fires for real when GLINT RUSH is the first reveal, and only for a rigged run", () => {
    // collapseAt2 above the side-4 board's occupancy → the rush arms on the very
    // first placement, and the hand (5 tiles) is still above revealAt, so GLINT
    // RUSH is the reveal that gets there first
    const craftArm = (tutorialRig: boolean): GameState => {
      const g = newGame({ ...BASE, seed: 11, collapseAt1: 40, collapseAt2: 40 });
      g.hand = [g.hand[0], 1, 2, CORE, 6] as TileVal[]; // a Core and two duds behind the active tile
      g.tutorialRig = tutorialRig;
      return g;
    };
    const base = craftArm(false);
    expect(base.hand.length).toBeGreaterThan(base.revealAt); // the threshold can't beat the rush here
    const target = base.order.find((k) => isLegalTarget(base, k))!;
    const plain = place(craftArm(false), target);
    const rigged = place(craftArm(true), target);

    expect(plain.deathMatch).toBe(true); // the rush really armed
    expect(rigged.deathMatch).toBe(true);
    expect(rigged.handRevealed).toBe(true); // …and the reveal it drove is where the rig rode in
    expect(plain.hand.slice(1)).toEqual([2, CORE, 6, 4]); // the un-rigged twin's stack is untouched
    expect(rigged.hand).toEqual([1, 1, CORE, 1, 2]); // and the rigged one is not

    expect(rigged.hand.length).toBe(plain.hand.length);
    expect(rigged.hand[0]).toBe(plain.hand[0]); // the active tile is never rigged
    expect(rigged.hand.indexOf(CORE)).toBe(plain.hand.indexOf(CORE)); // the Core holds its slot

    const need = needScores(plain);
    const isMin = (t: TileVal) => typeof t === "number" && t >= 1 && t <= 6;
    const before = plain.hand.slice(1).filter(isMin) as number[];
    const after = rigged.hand.slice(1).filter(isMin) as number[];
    expect(after.length).toBe(before.length);
    // exactly the two hungriest-order rules: ≤2 values replaced, and everything
    // that arrived is wanted more than everything that left
    const left = before.filter((v) => { const i = after.indexOf(v); return i < 0 || before.filter((x) => x === v).length > after.filter((x) => x === v).length; });
    const arrived = after.filter((v) => after.filter((x) => x === v).length > before.filter((x) => x === v).length);
    expect(left.length).toBeLessThanOrEqual(2);
    for (const a of arrived) for (const b of left) expect(need.get(a)!).toBeGreaterThan(need.get(b)!);
    // and the survivors read out in descending appetite
    const wants = after.map((v) => need.get(v)!);
    expect(wants).toEqual([...wants].sort((a, b) => b - a));
  });

  it("rides the THRESHOLD reveal when that comes first, and never fires again at the rush", () => {
    // hand of 6 with revealAt 5: placing into a gap drops it to the threshold
    // while occupancy is still miles above collapseAt2, so the wheel opens long
    // before GLINT RUSH. Four duds behind the active tile — more than the two-swap
    // cap — so a second run of the rig would visibly eat another one.
    const craftReveal = (tutorialRig: boolean): GameState => {
      const g = newGame({ ...BASE, seed: 11, gaps: 6, revealAt: 5 });
      g.hand = [g.hand[0], 3, 6, 3, 6, 1] as TileVal[];
      g.tutorialRig = tutorialRig;
      return g;
    };
    const base = craftReveal(false);
    const gap = base.order.find((k) => base.cells.get(k)!.tile === null && isLegalTarget(base, k))!;
    const plain = place(craftReveal(false), gap);
    const rigged = place(craftReveal(true), gap);

    expect(plain.handRevealed).toBe(true); // the threshold flipped it…
    expect(plain.deathMatch).toBe(false); // …with the rush still far off
    expect(plain.hand).toEqual([3, 6, 3, 6, 1]); // the un-rigged twin keeps the stack it was dealt
    expect(rigged.hand[0]).toBe(plain.hand[0]); // the tile in the placing slot is never rigged
    expect(rigged.hand).not.toEqual(plain.hand); // the help landed WITH the reveal
    expect(rigged.hand).toEqual([3, 1, 1, 1, 6]); // two duds upgraded, the rest sorted by appetite

    // …and now the rush arms, one placement later. Nothing may move: the player
    // has been looking at this stack since the threshold.
    const armed = (s: GameState) => {
      const t = { ...s, collapseAt2: 40 } as GameState; // the next placement crosses it
      return place(t, t.order.find((k) => isLegalTarget(t, k))!);
    };
    const after = armed(rigged);
    expect(after.deathMatch).toBe(true); // the rush did arm
    // the stack simply lost its front tile (a covered mineral rides in at the back)
    expect(after.hand.slice(0, rigged.hand.length - 1)).toEqual(rigged.hand.slice(1));
    expect(after.hand).toContain(6); // a second rig would have swapped this dud away
  });

  it("no-ops without the flag", () => {
    const g = craft(false);
    const before = [...g.hand];
    rigRevealHand(g);
    expect(g.hand).toEqual(before);
  });
});
