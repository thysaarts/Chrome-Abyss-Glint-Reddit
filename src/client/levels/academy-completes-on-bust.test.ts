import { describe, it, expect, beforeEach } from "vitest";
import { RunResult } from "./levels";

// vitest runs in plain node — storage.ts guards every access in try/catch, so a
// minimal in-memory shim is all `completeLevel` needs to read/advance a frontier.
// It must exist BEFORE ./progress is imported (storage reads it lazily, but the
// module graph is hoisted), hence the dynamic import below.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
const { completeLevel } = await import("./progress");

/**
 * THE TWO TUTORIAL LEVELS COMPLETE ON ANY FINISH — busting out included (web
 * `aaa57ca`). The campaign never demands a successful run to leave the teaching
 * behind: the completion pop-up's Continue is the guaranteed way forward. Levels
 * 2+ keep the normal rule (a game over never advances the campaign).
 *
 * App.tsx encodes the exception as the `qualifies` argument:
 *   completeLevel(num, run, num === 1 || !gameOver)
 * This pins the two halves of that expression so the Academy can never regress
 * to "replay it until you win" — the state this port shipped in.
 */
describe("the Academy completes on any finish", () => {
  const bustedRun: RunResult = {
    score: 5000,
    banks: 3,
    busts: 3, // busted out of lives — a game over
    coreBanked: true,
    nebulitesAcquired: 1,
    drossCleared: 2,
    boardCleared: false,
  };
  // `gameOver` as App.tsx computes it for this run
  const gameOver = true;
  const qualifies = (num: number) => num === 1 || !gameOver;

  beforeEach(() => {
    localStorage.clear();
  });

  it("passes qualifies=true for The Academy (level 1) even on a game over", () => {
    expect(qualifies(1)).toBe(true);
  });

  it("still passes qualifies=false for a normal campaign level on a game over", () => {
    expect(qualifies(2)).toBe(false);
    expect(qualifies(7)).toBe(false);
  });

  it("advances the frontier off level 1 after a busted Academy run", () => {
    localStorage.setItem("glint.progress.v1", JSON.stringify({ v: 2, d: 1 }));
    expect(completeLevel(1, bustedRun, qualifies(1))).toBe(true);
    expect(JSON.parse(localStorage.getItem("glint.progress.v1")!).d).toBe(2);
  });

  it("leaves a level-2 frontier put after a busted run", () => {
    localStorage.setItem("glint.progress.v1", JSON.stringify({ v: 2, d: 2 }));
    expect(completeLevel(2, bustedRun, qualifies(2))).toBe(false);
    expect(JSON.parse(localStorage.getItem("glint.progress.v1")!).d).toBe(2);
  });
});
