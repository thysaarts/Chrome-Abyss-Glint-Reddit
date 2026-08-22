/**
 * ANTI-CHEAT — the daily leaderboard's replay verifier.
 *
 * The client submits its recorded MOVE STREAM with the score; the server
 * rebuilds the day's board from its own seed + metric (never the client's
 * claim), replays the moves through the SAME pure engine, and the score that
 * goes on the board is whatever the replay actually produces. A client can no
 * longer post a number it didn't earn — the worst a doctored stream can do is
 * score itself honestly.
 *
 * Legacy clients (pre-parity builds still live in old posts) submit no moves;
 * their plain scores keep the old range check. Once every client submits
 * streams, the plain path can be retired.
 */
import { dailyInitial, dailySnapshot, measureDaily } from "../client/game/daily";
import { replayMoves, NetMove, NetMoveKind } from "../client/net/moves";
import type { DailyMetric } from "../shared/api";

/** Far above any real game (a run is bounded by the tile bag; ~120 actions is a
 *  long game) — a backstop against abusive payloads, not a gameplay limit. */
export const MAX_DAILY_MOVES = 400;

const KINDS = new Set<NetMoveKind>(["place", "bank", "claim", "pass", "cashout", "rotate", "swap", "cashoutOffer", "cashoutAccept", "cashoutDecline"]);

/** Structural vetting of an untrusted move stream. */
export function isMoveStream(x: unknown): x is NetMove[] {
  if (!Array.isArray(x) || x.length === 0 || x.length > MAX_DAILY_MOVES) return false;
  return x.every((m) => {
    if (!m || typeof m !== "object") return false;
    const r = m as Record<string, unknown>;
    if (typeof r.seq !== "number" || typeof r.kind !== "string" || !KINDS.has(r.kind as NetMoveKind)) return false;
    if (r.cell !== undefined && typeof r.cell !== "string") return false;
    if (r.index !== undefined && typeof r.index !== "number") return false;
    if (r.choice !== undefined && typeof r.choice !== "number") return false;
    return true;
  });
}

/** Replay a submitted stream against the day's board. Returns the metric value
 *  the run REALLY earned, or null when the stream is invalid — a broken or
 *  unfinished stream posts nothing. */
export function replayDailyScore(seed: number, metric: DailyMetric, moves: NetMove[]): number | null {
  try {
    const g = replayMoves(dailyInitial(seed, metric), moves);
    if (g.phase === "playing") return null; // the stream must play to a finished run
    return measureDaily(metric, dailySnapshot(g));
  } catch {
    return null; // an illegal action mid-stream = an invalid submission
  }
}
