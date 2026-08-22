import { describe, expect, it } from "vitest";
import { foldDaily, FinishedRun } from "./stats";
import { measureRun } from "./challenges";

const run = (over: Partial<FinishedRun>): FinishedRun => ({
  score: 0, won: false, busts: 0, drossCleared: 0, nebulitesAcquired: 0, banks: 0,
  reachedRush: false, cashedOut: false, fullDrift: false, fullDrifts: 0, levelNum: -1,
  shaped: false, square: false, harmony: false, boss: false, maxBankScore: 0,
  chains: { convergence: 0, harmony: 0, accord: 0, turn: 0 },
  ...over,
});

describe("daily-challenge folding (run-best vs day-accumulating)", () => {
  it("max keeps the best single run; sum counts every run from 0 that day", () => {
    // "Reach 20,000 in one game" — three runs, only the best matters
    expect(foldDaily(foldDaily(foldDaily(0, 8000, "max"), 20500, "max"), 12000, "max")).toBe(20500);
    // "Clear a board 3 times" (day scope) — three 0/1 runs ADD UP: this is the
    // fix for the seven formerly-impossible bank entries (binary type, target > 1)
    expect(foldDaily(foldDaily(foldDaily(0, 1, "sum"), 0, "sum"), 1, "sum")).toBe(2);
    // undefined mode = legacy entries — behaves as max
    expect(foldDaily(5, 3)).toBe(5);
  });

  it("fulldrift measures the run's COUNT, no longer a 0/1 flag", () => {
    expect(measureRun("fulldrift", run({ fullDrifts: 4, fullDrift: true }))).toBe(4);
    // pre-count callers (Reddit port lag, old test fixtures) fall back to the flag
    expect(measureRun("fulldrift", run({ fullDrifts: undefined as unknown as number, fullDrift: true }))).toBe(1);
  });

  it("binary types stay 0/1 per run — day scope is what makes N-times targets real", () => {
    expect(measureRun("clear", run({ won: true }))).toBe(1);
    expect(measureRun("rush", run({ reachedRush: true }))).toBe(1);
    expect(measureRun("cashout", run({ cashedOut: true }))).toBe(1);
  });
});
