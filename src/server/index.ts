import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { context, createServer, getServerPort, redis, reddit } from "@devvit/web/server";
import type { AllTimeEntry, DailyResponse, ErrorResponse, LeaderboardEntry, LeaderboardResponse, SubmitScoreResponse } from "../shared/api";

/**
 * GLINT on Reddit — the server side of the DAILY CHALLENGE.
 *
 * Every player in the subreddit gets the same board each day (a deterministic
 * seed from the UTC date); their best score lands on a per-day leaderboard in
 * Redis (a sorted set, one entry per user, best-only writes). The game itself
 * runs entirely in the client web view.
 */

const app = new Hono();
const internal = new Hono();

/** YYYY-MM-DD in UTC — the challenge rolls over at midnight UTC everywhere. */
const utcDay = (): string => new Date().toISOString().slice(0, 10);

/** Deterministic daily seed: FNV-1a over the day string, kept positive and
 *  stable across servers. Everyone plays the same board. */
const dailySeed = (day: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 1_000_000_000;
};

const boardKey = (day: string) => `glint:daily:${day}`;

/** Top-N standings from the day's sorted set (highest score first). */
async function topStandings(day: string, n = 10): Promise<LeaderboardEntry[]> {
  const rows = await redis.zRange(boardKey(day), 0, n - 1, { by: "rank", reverse: true });
  return rows.map((r, i) => ({ rank: i + 1, username: r.member, score: r.score }));
}

async function standingFor(day: string, username: string | null): Promise<{ score: number | null; rank: number | null }> {
  if (!username) return { score: null, rank: null };
  const score = await redis.zScore(boardKey(day), username);
  if (score === undefined || score === null) return { score: null, rank: null };
  // rank among descending scores = (members above) + 1
  const above = await redis.zCard(boardKey(day)) - (await redis.zRank(boardKey(day), username) ?? 0);
  return { score, rank: above };
}

app.get("/api/daily", async (c) => {
  try {
    const day = utcDay();
    const username = (await reddit.getCurrentUsername()) ?? null;
    const [leaderboard, mine] = await Promise.all([topStandings(day), standingFor(day, username)]);
    return c.json<DailyResponse>({
      type: "daily",
      day,
      seed: dailySeed(day),
      username,
      leaderboard,
      yourScore: mine.score,
      yourRank: mine.rank,
    });
  } catch (err) {
    console.error("daily init failed", err);
    return c.json<ErrorResponse>({ status: "error", message: "daily init failed" }, 500);
  }
});

app.post("/api/daily/score", async (c) => {
  try {
    const day = utcDay();
    const username = (await reddit.getCurrentUsername()) ?? null;
    if (!username) return c.json<ErrorResponse>({ status: "error", message: "not signed in" }, 401);
    const body = await c.req.json<{ score?: number }>().catch(() => ({}) as { score?: number });
    const score = Math.floor(Number(body.score));
    // sanity: scores are positive and bounded (no plausible run exceeds this)
    if (!Number.isFinite(score) || score < 0 || score > 1_000_000) {
      return c.json<ErrorResponse>({ status: "error", message: "invalid score" }, 400);
    }
    const key = boardKey(day);
    const prev = await redis.zScore(key, username);
    const accepted = prev === undefined || prev === null || score > prev;
    if (accepted) {
      await redis.zAdd(key, { member: username, score });
      // keep the board tidy for ~a week of history, then let it expire
      await redis.expire(key, 60 * 60 * 24 * 8);
    }
    const [leaderboard, mine] = await Promise.all([topStandings(day), standingFor(day, username)]);
    return c.json<SubmitScoreResponse>({
      type: "score",
      day,
      accepted,
      best: mine.score ?? score,
      leaderboard,
      yourRank: mine.rank,
    });
  } catch (err) {
    console.error("score submit failed", err);
    return c.json<ErrorResponse>({ status: "error", message: "score submit failed" }, 500);
  }
});

// ---- ALL-TIME community leaderboard: one best score per redditor ----

const ALLTIME = "glint:alltime";
const ALLTIME_META = "glint:alltime:meta"; // username -> the level the best was set on

async function allTimeTop(n = 10): Promise<AllTimeEntry[]> {
  const rows = await redis.zRange(ALLTIME, 0, n - 1, { by: "rank", reverse: true });
  if (rows.length === 0) return [];
  const labels = await Promise.all(rows.map((r) => redis.hGet(ALLTIME_META, r.member)));
  return rows.map((r, i) => ({ rank: i + 1, username: r.member, score: r.score, level: labels[i] ?? "Quick Start" }));
}

async function allTimeStanding(username: string | null): Promise<{ score: number | null; rank: number | null }> {
  if (!username) return { score: null, rank: null };
  const score = await redis.zScore(ALLTIME, username);
  if (score === undefined || score === null) return { score: null, rank: null };
  const above = (await redis.zCard(ALLTIME)) - ((await redis.zRank(ALLTIME, username)) ?? 0);
  return { score, rank: above };
}

app.get("/api/leaderboard", async (c) => {
  try {
    const username = (await reddit.getCurrentUsername()) ?? null;
    const [entries, mine] = await Promise.all([allTimeTop(), allTimeStanding(username)]);
    return c.json<LeaderboardResponse>({ type: "leaderboard", username, entries, yourBest: mine.score, yourRank: mine.rank });
  } catch (err) {
    console.error("leaderboard failed", err);
    return c.json<ErrorResponse>({ status: "error", message: "leaderboard failed" }, 500);
  }
});

app.post("/api/score", async (c) => {
  try {
    const username = (await reddit.getCurrentUsername()) ?? null;
    if (!username) return c.json<ErrorResponse>({ status: "error", message: "not signed in" }, 401);
    const body = await c.req.json<{ score?: number; level?: string }>().catch(() => ({}) as { score?: number; level?: string });
    const score = Math.floor(Number(body.score));
    const level = String(body.level ?? "Quick Start").slice(0, 60);
    if (!Number.isFinite(score) || score <= 0 || score > 1_000_000) {
      return c.json<ErrorResponse>({ status: "error", message: "invalid score" }, 400);
    }
    const prev = await redis.zScore(ALLTIME, username);
    if (prev === undefined || prev === null || score > prev) {
      await redis.zAdd(ALLTIME, { member: username, score });
      await redis.hSet(ALLTIME_META, { [username]: level });
    }
    return c.json({ type: "score-recorded" });
  } catch (err) {
    console.error("all-time score failed", err);
    return c.json<ErrorResponse>({ status: "error", message: "score failed" }, 500);
  }
});

/** Moderator menu action + install trigger — create a post running the game. */
async function createGamePost() {
  return reddit.submitCustomPost({
    title: "Chrome Abyss: Glint — today's gem puzzle",
  });
}

internal.post("/menu/post-create", async (c) => {
  const post = await createGamePost();
  return c.json({
    navigateTo: `https://reddit.com${post.permalink}`,
    showToast: { text: "Glint post created!" },
  });
});

internal.post("/triggers/on-app-install", async (c) => {
  try {
    await createGamePost();
  } catch (err) {
    console.error("install post failed", err);
  }
  return c.json({});
});

app.route("/internal", internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
