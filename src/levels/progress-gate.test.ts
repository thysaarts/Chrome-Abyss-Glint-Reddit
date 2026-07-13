import { describe, it, expect } from "vitest";
import { completeLevel } from "./progress";
import { RunResult } from "./levels";

/**
 * A game over (busted out of lives) must never advance the campaign, even if the run
 * hit the next level's target number mid-play (e.g. refined a Nebulite that's then
 * forfeited on the loss). completeLevel's `qualifies` flag gates that: a legitimate
 * finish (win / cash-out / out-of-tiles) passes true; a game over passes false.
 *
 * Frontier defaults to 0 in the test env, so this checks level 0's advance — the only
 * variable is `qualifies`, isolating the gate from the unlock predicate itself.
 */
describe("completeLevel gates the campaign on a legitimate finish", () => {
  const run: RunResult = {
    score: 5000,
    banks: 3,
    busts: 3, // busted out
    coreBanked: true,
    nebulitesAcquired: 1, // a target was hit mid-run…
    drossCleared: 2,
    boardCleared: false, // …but the run was lost (game over)
  };

  it("does NOT advance when the run does not qualify (game over)", () => {
    expect(completeLevel(0, run, false)).toBe(false);
  });

  it("advances the same run when it qualifies (legitimate finish)", () => {
    expect(completeLevel(0, run, true)).toBe(true);
  });
});
