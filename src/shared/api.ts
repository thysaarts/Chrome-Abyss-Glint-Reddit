/** Types shared between the game client and the Devvit server. */

export type LeaderboardEntry = {
  rank: number;
  username: string;
  score: number;
};

/** GET /api/daily — today's challenge: the shared seed everyone plays, the
 *  subreddit's leaderboard for it, and the caller's own standing. */
export type DailyResponse = {
  type: "daily";
  /** YYYY-MM-DD (UTC) — the challenge rolls over at midnight UTC */
  day: string;
  /** deterministic seed for today's board — same for every player */
  seed: number;
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

export type ErrorResponse = {
  status: "error";
  message: string;
};
