import { describe, expect, it } from "vitest";
import { place, bankClusterNow, isLegalTarget, GameState } from "./engine";
import { dailyInitial, dailySeed, metricFor, measureDaily, dailySnapshot } from "./daily";
import type { DailyMetric } from "../../shared/api";
import { NetMove } from "../net/moves";
import { replayDailyScore, isMoveStream, MAX_DAILY_MOVES } from "../../server/verifyDaily";

/**
 * ANTI-CHEAT — the core the server route relies on: a recorded daily move
 * stream, replayed through the SAME engine from the SAME seeded board,
 * reproduces the run's metric exactly. If this holds, the server can score a
 * submitted game itself, so a client can never post a number it didn't earn.
 */

/** Play a scripted daily run, recording each action exactly as the client
 *  recorder does (place = resolved cell + choice, bank = cluster cell). */
function playAndRecord(seed: number, metric: DailyMetric = "score"): { moves: NetMove[]; final: GameState } {
  let g = dailyInitial(seed, metric);
  const moves: NetMove[] = [];
  const rec = (m: Omit<NetMove, "seq" | "seat">) => moves.push({ ...m, seq: moves.length, seat: 0 });
  for (let step = 0; step < 80 && g.phase === "playing"; step++) {
    // bank a ready cluster now and then (mirrors an early-bank tap)
    if (g.activatedCells.length >= 6 && step % 3 === 0) {
      const cell = g.activatedCells[0];
      rec({ kind: "bank", cell });
      g = bankClusterNow(g, cell);
      if (g.phase !== "playing") break;
    }
    const legal = g.order.filter((k) => !g.activatedCells.includes(k) && isLegalTarget(g, k));
    if (!legal.length) break;
    const cell = legal[(step * 17 + 3) % legal.length];
    rec({ kind: "place", cell, choice: 0 });
    g = place(g, cell, 0);
  }
  return { moves, final: g };
}

describe("daily replay verification (the server's whole defence)", () => {
  it("a recorded stream replays to the exact earned metric, across seeds and metrics", () => {
    for (const day of ["2026-08-22", "2026-08-23", "2026-12-25"]) {
      const seed = dailySeed(day);
      const metric = metricFor(day);
      const { moves, final } = playAndRecord(seed, metric);
      expect(moves.length).toBeGreaterThan(3); // the script actually played
      if (final.phase === "playing") continue; // the 80-step cap rarely leaves a run open
      const replayed = replayDailyScore(seed, metric, moves);
      expect(replayed).toBe(measureDaily(metric, dailySnapshot(final)));
    }
  });

  it("a 'Most Nebulite refined' day still replays (the rig is part of the board)", () => {
    const seed = dailySeed("2026-09-01");
    const { moves, final } = playAndRecord(seed, "refined");
    if (final.phase !== "playing") {
      expect(replayDailyScore(seed, "refined", moves)).toBe(measureDaily("refined", dailySnapshot(final)));
    }
  });

  it("a doctored score cannot land: the replay's number wins, garbage posts nothing", () => {
    const seed = dailySeed("2026-08-22");
    const metric = metricFor(seed.toString()) as DailyMetric; // any metric works for the negative cases
    // an unfinished stream (the run never ended) posts nothing
    const { moves, final } = playAndRecord(seed, "score");
    if (final.phase === "playing") expect(replayDailyScore(seed, "score", moves)).toBeNull();
    // an illegal stream posts nothing (one bogus placement can never finish a run)
    expect(replayDailyScore(seed, "score", [{ seq: 0, seat: 0, kind: "place", cell: "no-such-cell" }])).toBeNull();
    // structural vetting
    expect(isMoveStream([])).toBe(false);
    expect(isMoveStream([{ seq: 0, kind: "hack" }])).toBe(false);
    expect(isMoveStream(new Array(MAX_DAILY_MOVES + 1).fill({ seq: 0, kind: "place", cell: "0,0" }))).toBe(false);
    expect(isMoveStream([{ seq: 0, kind: "place", cell: "0,0", choice: 0 }])).toBe(true);
    void metric;
  });
});
