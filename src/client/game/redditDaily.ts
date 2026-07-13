/**
 * REDDIT DAILY CHALLENGE — the client side.
 *
 * The Devvit server (src/server) hands out one shared board seed per UTC day
 * and keeps a per-subreddit leaderboard in Redis. Outside Reddit (local dev,
 * tests) the endpoints don't exist: every call resolves to null and the
 * community UI simply doesn't render.
 */
import type { DailyResponse, LeaderboardResponse, SubmitScoreResponse } from "../../shared/api";

let cache: { day: string; data: DailyResponse } | null = null;

export async function fetchDaily(force = false): Promise<DailyResponse | null> {
  const today = new Date().toISOString().slice(0, 10);
  if (!force && cache && cache.day === today) return cache.data;
  try {
    const res = await fetch("/api/daily");
    if (!res.ok) return null;
    const data = (await res.json()) as DailyResponse;
    if (data.type !== "daily") return null;
    cache = { day: data.day, data };
    return data;
  } catch {
    return null;
  }
}

export async function submitDailyScore(score: number): Promise<SubmitScoreResponse | null> {
  try {
    const res = await fetch("/api/daily/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ score }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SubmitScoreResponse;
    cache = null; // standings changed — next fetch is fresh
    return data;
  } catch {
    return null;
  }
}

/** Set (to the challenge day) while a daily-challenge run is in flight, so the
 *  end-of-run bookkeeping knows to submit the score. */
export const dailyRun: { day: string | null } = { day: null };

// ---- the ALL-TIME community leaderboard ----

let lbCache: LeaderboardResponse | null = null;

export async function fetchLeaderboard(force = false): Promise<LeaderboardResponse | null> {
  if (!force && lbCache) return lbCache;
  try {
    const res = await fetch("/api/leaderboard");
    if (!res.ok) return null;
    const data = (await res.json()) as LeaderboardResponse;
    if (data.type !== "leaderboard") return null;
    lbCache = data;
    return data;
  } catch {
    return null;
  }
}

/** Every finished run reports here (server keeps each redditor's best). */
export async function submitAllTimeScore(score: number, level: string): Promise<void> {
  if (score <= 0) return;
  try {
    await fetch("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ score, level }),
    });
    lbCache = null; // standings may have changed
  } catch {
    /* not on Reddit — the community leaderboard simply doesn't apply */
  }
}
