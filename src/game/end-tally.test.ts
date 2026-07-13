import { describe, it, expect } from "vitest";
import { newGame, place, describePlace, cashOut, isLegalTarget, GameState } from "./engine";

const firstLegal = (g: GameState) => g.order.find((k) => isLegalTarget(g, k));
const tallySum = (g: GameState) => g.endTally.reduce((n, t) => n + t.delta, 0);

/** Regression for the double/triple end-summary rows: describePlace previews the move
 *  (committing internally on a discarded clone). A shared endTally reference let those
 *  previews push duplicate entries onto the real state — each end-of-run kind appeared
 *  2–3×. After the finish, every tally kind must be unique. */
describe("end tally is not polluted by describePlace previews", () => {
  it("each end-of-run kind appears at most once, across finished runs", () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 150 && bad.length < 4; seed++) {
      let g = newGame({ seed, side: 6 });
      for (let m = 0; m < 500 && g.phase === "playing"; m++) {
        const t = firstLegal(g);
        if (!t) break;
        describePlace(g, t); // the UI previews each move — must not touch g.endTally
        g = place(g, t);
      }
      if (g.phase === "playing") continue;
      const kinds = g.endTally.map((e) => e.kind);
      const dupes = kinds.filter((k, i) => kinds.indexOf(k) !== i);
      if (dupes.length) bad.push(`seed ${seed}: duplicate kinds [${[...new Set(dupes)].join(",")}] in [${kinds.join(",")}]`);
    }
    expect(bad).toEqual([]);
  });
});

/**
 * The end-of-run reveal must not award anything before the pop-up. So a finished run's
 * `score` STAYS at scoreBase (the board-collected total shown during play), and `finalScore`
 * is the floored total the summary lands on: finalScore = max(0, scoreBase + Σ endTally).
 * This must hold on every finished run so the header never jumps before the summary and the
 * animated tally always lands exactly on the recorded score.
 */
describe("end-of-run score tally is consistent", () => {
  it("score stays at scoreBase; finalScore = max(0, scoreBase + Σ deltas)", () => {
    const bad: string[] = [];
    let wins = 0, losses = 0;
    for (let seed = 1; seed <= 150 && bad.length < 5; seed++) {
      let g = newGame({ seed, side: 6 });
      for (let m = 0; m < 500 && g.phase === "playing"; m++) {
        const t = firstLegal(g);
        if (!t) break;
        g = place(g, t);
      }
      if (g.phase === "playing") continue; // didn't finish in the move budget
      g.phase === "won" ? wins++ : losses++;
      if (g.score !== g.scoreBase) {
        bad.push(`seed ${seed}: score ${g.score} != scoreBase ${g.scoreBase} (bonuses awarded before pop-up)`);
      }
      if (Math.max(0, g.scoreBase + tallySum(g)) !== g.finalScore) {
        bad.push(`seed ${seed}: base ${g.scoreBase} + Σ${tallySum(g)} floored != finalScore ${g.finalScore}`);
      }
      if (g.scoreBase < 0) bad.push(`seed ${seed}: negative scoreBase ${g.scoreBase}`);
      if (g.finalScore < 0) bad.push(`seed ${seed}: negative finalScore ${g.finalScore}`);
    }
    expect(bad).toEqual([]);
    expect(losses).toBeGreaterThan(0); // the sweep actually reached finished runs
  });

  it("holds for a cash-out (Glint Rush voluntary end)", () => {
    // drive a game into Glint Rush (deathMatch), then cash out, and check the invariant
    const bad: string[] = [];
    let cashed = 0;
    for (let seed = 1; seed <= 400 && cashed < 8; seed++) {
      let g = newGame({ seed, side: 6, collapseAt1: 50, collapseAt2: 40 });
      for (let m = 0; m < 500 && g.phase === "playing"; m++) {
        if (g.deathMatch) {
          const c = cashOut(g);
          if (c !== g) {
            cashed++;
            if (c.score !== c.scoreBase) {
              bad.push(`seed ${seed}: cashout score ${c.score} != scoreBase ${c.scoreBase}`);
            }
            if (Math.max(0, c.scoreBase + tallySum(c)) !== c.finalScore) {
              bad.push(`seed ${seed}: cashout base ${c.scoreBase} + Σ${tallySum(c)} != finalScore ${c.finalScore}`);
            }
            if (c.cashedOut <= 0) bad.push(`seed ${seed}: cashout but cashedOut=${c.cashedOut}`);
          }
          break;
        }
        const t = firstLegal(g);
        if (!t) break;
        g = place(g, t);
      }
    }
    expect(bad).toEqual([]);
    expect(cashed).toBeGreaterThan(0);
  });
});
