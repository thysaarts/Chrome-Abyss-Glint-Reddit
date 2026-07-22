/** Types shared between the game client and the Devvit server. */

export type LeaderboardEntry = {
  rank: number;
  username: string;
  score: number;
};

/** What today's daily challenge RANKS. Every metric is a per-run "higher is
 *  better" number on the shared board — never first-to-X (that rewards
 *  timezones, not play). */
export type DailyMetric = "score" | "bankscore" | "refined" | "nebulite" | "banks" | "chains";

/** GET /api/daily — today's challenge: the shared seed everyone plays, what
 *  metric it ranks, the subreddit's leaderboard, and the caller's standing. */
export type DailyResponse = {
  type: "daily";
  /** YYYY-MM-DD (UTC) — the challenge rolls over at midnight UTC */
  day: string;
  /** deterministic seed for today's board — same for every player */
  seed: number;
  /** which per-run number today's board ranks */
  metric: DailyMetric;
  /** player-facing name for the metric ("Highest single bank" etc.) */
  metricLabel: string;
  username: string | null;
  leaderboard: LeaderboardEntry[];
  /** the caller's best score today (null = hasn't played yet) */
  yourScore: number | null;
  yourRank: number | null;
};

/** POST /api/daily/score {score} — records the caller's daily result (keeps
 *  their best). Returns the refreshed standings. */
export type SubmitScoreResponse = {
  type: "score";
  day: string;
  accepted: boolean; // false = not an improvement (best is kept)
  best: number;
  leaderboard: LeaderboardEntry[];
  yourRank: number | null;
};

/** One row of the ALL-TIME community leaderboard — the same info as the
 *  personal high-scores list (score + the level it was set on), plus who. */
export type AllTimeEntry = {
  rank: number;
  username: string;
  score: number;
  level: string; // "Quick Start" or the campaign level title
};

/** GET /api/leaderboard — the community's best (one entry per redditor). */
export type LeaderboardResponse = {
  type: "leaderboard";
  username: string | null;
  entries: AllTimeEntry[];
  yourBest: number | null;
  yourRank: number | null;
};

export type ErrorResponse = {
  status: "error";
  message: string;
};

/** Response to POST /api/export-code — a one-time code + deep link to the web game
 *  that redeems this player's Reddit save into the chromeabyss.com version. */
export type ImportCodeResponse = {
  type: "import-code";
  code: string;
  url: string;
};
