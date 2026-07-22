import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { context, createServer, getServerPort, redis, reddit } from "@devvit/web/server";
import type { AllTimeEntry, DailyMetric, DailyResponse, ErrorResponse, ImportCodeResponse, LeaderboardEntry, LeaderboardResponse, SubmitScoreResponse } from "../shared/api";

// Supabase edge function that parks a save under a one-time code for the web game.
const REDDIT_EXPORT_URL = "https://kszcacyzyveytvjlrohk.supabase.co/functions/v1/reddit-export";
// Shared anti-spam token — MUST match REDDIT_IMPORT_SECRET set in Supabase. A plain
// constant (not a Devvit setting, which didn't surface for @devvit/web): it's a
// low-value token — it only gates "park a save"; redeeming needs a valid one-time
// code + a signed-in web session that only imports into that player's OWN account.
// This is a private repo; rotate by editing here + Supabase together.
const REDDIT_IMPORT_SECRET = "ZQkIhxSPLU0pvRufVtvk";

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

/** The metric rotation. Mon/Wed/Fri anchor on Highest score (the most legible
 *  challenge, ~3 days of 7); the other weekdays cycle through the five
 *  specialist metrics by day number, so each one comes around roughly weekly. */
const SPECIALIST_METRICS: DailyMetric[] = ["bankscore", "refined", "nebulite", "banks", "chains"];
const METRIC_LABEL: Record<DailyMetric, string> = {
  score: "Highest score",
  bankscore: "Highest single bank",
  refined: "Most Nebulite refined",
  nebulite: "Most Nebulite banked",
  banks: "Most banks in one game",
  chains: "Most chains banked",
};
const metricFor = (day: string): DailyMetric => {
  const d = new Date(`${day}T00:00:00Z`);
  const weekday = d.getUTCDay();
  if (weekday === 1 || weekday === 3 || weekday === 5) return "score";
  return SPECIALIST_METRICS[Math.floor(d.getTime() / 86_400_000) % SPECIALIST_METRICS.length] ?? "score";
};

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
    const metric = metricFor(day);
    return c.json<DailyResponse>({
      type: "daily",
      day,
      seed: dailySeed(day),
      metric,
      metricLabel: METRIC_LABEL[metric],
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
    const body = await c.req.json<{ score?: number; day?: string }>().catch(() => ({}) as { score?: number; day?: string });
    const score = Math.floor(Number(body.score));
    // sanity: scores are positive (zeros never land on the board) and bounded
    if (!Number.isFinite(score) || score <= 0 || score > 1_000_000) {
      return c.json<ErrorResponse>({ status: "error", message: "invalid score" }, 400);
    }
    // a run that started on a previous day must not pollute today's board
    if (body.day && body.day !== day) {
      return c.json<ErrorResponse>({ status: "error", message: "challenge day rolled over" }, 409);
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

/** FULL export of the all-time board (every redditor's best), for the one-off
 *  manual import into the web app's leaderboard. Secret-gated (the shared token)
 *  so it isn't publicly scrapable. Read-only; unbounded but the set is small. */
async function allTimeExport(): Promise<{ username: string; score: number; level: string }[]> {
  const rows = await redis.zRange(ALLTIME, 0, -1, { by: "rank", reverse: true }); // all, high→low
  if (rows.length === 0) return [];
  const labels = await Promise.all(rows.map((r) => redis.hGet(ALLTIME_META, r.member)));
  return rows.map((r, i) => ({ username: r.member, score: r.score, level: labels[i] ?? "Quick Start" }));
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

// ONE-OFF EXPORT for the manual web import. Gate with the shared secret via
// header (x-import-secret) or ?secret= query. Returns the whole all-time board.
app.get("/api/alltime-export", async (c) => {
  try {
    const provided = c.req.header("x-import-secret") ?? c.req.query("secret") ?? "";
    if (!REDDIT_IMPORT_SECRET || REDDIT_IMPORT_SECRET.startsWith("PASTE_") || provided !== REDDIT_IMPORT_SECRET) {
      return c.json<ErrorResponse>({ status: "error", message: "unauthorized" }, 401);
    }
    const entries = await allTimeExport();
    return c.json({ type: "alltime-export", count: entries.length, entries });
  } catch (err) {
    console.error("alltime-export failed", err);
    return c.json<ErrorResponse>({ status: "error", message: "export failed" }, 500);
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

// ---- SAVE SYNC: the player's full local save, mirrored per Reddit account ----
// The value is a JSON object of the client's `glint.*` localStorage keys. The
// server treats it as an opaque blob — the client owns the shape.

const saveKey = (username: string) => `glint:save:${username}`;
const SAVE_LIMIT = 200_000; // bytes — a real save is a few KB

app.get("/api/save", async (c) => {
  try {
    const username = (await reddit.getCurrentUsername()) ?? null;
    if (!username) return c.json<ErrorResponse>({ status: "error", message: "not signed in" }, 401);
    const raw = await redis.get(saveKey(username));
    return c.json({ type: "save", data: raw ? JSON.parse(raw) : null });
  } catch (err) {
    console.error("save get failed", err);
    return c.json<ErrorResponse>({ status: "error", message: "save get failed" }, 500);
  }
});

app.post("/api/save", async (c) => {
  try {
    const username = (await reddit.getCurrentUsername()) ?? null;
    if (!username) return c.json<ErrorResponse>({ status: "error", message: "not signed in" }, 401);
    const body = await c.req.json<{ data?: Record<string, string> }>().catch(() => ({}) as { data?: Record<string, string> });
    if (!body.data || typeof body.data !== "object") {
      return c.json<ErrorResponse>({ status: "error", message: "invalid save" }, 400);
    }
    const raw = JSON.stringify(body.data);
    if (raw.length > SAVE_LIMIT) return c.json<ErrorResponse>({ status: "error", message: "save too large" }, 413);
    await redis.set(saveKey(username), raw);
    return c.json({ type: "save-stored" });
  } catch (err) {
    console.error("save put failed", err);
    return c.json<ErrorResponse>({ status: "error", message: "save put failed" }, 500);
  }
});

// EXPORT to the web game: park THIS player's save under a one-time code via the
// Supabase reddit-export function (secret-auth'd, server-to-server). The client
// sends its fresh localStorage snapshot; we add the shared secret and forward it.
app.post("/api/export-code", async (c) => {
  try {
    const username = (await reddit.getCurrentUsername()) ?? null;
    if (!username) return c.json<ErrorResponse>({ status: "error", message: "not signed in" }, 401);
    if (!REDDIT_IMPORT_SECRET || REDDIT_IMPORT_SECRET.startsWith("PASTE_")) return c.json<ErrorResponse>({ status: "error", message: "import not configured" }, 500);
    const body = await c.req.json<{ data?: Record<string, string> }>().catch(() => ({}) as { data?: Record<string, string> });
    const payload = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : null;
    if (!payload) return c.json<ErrorResponse>({ status: "error", message: "no save to export" }, 400);
    const res = await fetch(REDDIT_EXPORT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-import-secret": REDDIT_IMPORT_SECRET },
      body: JSON.stringify({ payload }),
    });
    const j = (await res.json().catch(() => ({}))) as { code?: string; url?: string; error?: string };
    if (!res.ok || !j.code || !j.url) return c.json<ErrorResponse>({ status: "error", message: j.error ?? "export failed" }, 502);
    return c.json<ImportCodeResponse>({ type: "import-code", code: j.code, url: j.url });
  } catch (err) {
    console.error("export-code failed", err);
    return c.json<ErrorResponse>({ status: "error", message: "export failed" }, 500);
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

/** Moderator menu action — export the all-time board for the one-off web import.
 *  Writes the JSON to the logs (chunked so a long board can't be truncated);
 *  read it with `devvit logs` between the BEGIN/END markers. No HTTP/secret
 *  needed — reachable only from the mod menu. (Reddit blocks app→user DMs for
 *  non-whitelisted accounts, so logs are the delivery path.) */
internal.post("/menu/alltime-export", async (c) => {
  const entries = await allTimeExport();
  const json = JSON.stringify({ type: "alltime-export", count: entries.length, entries });
  console.log("GLINT_ALLTIME_EXPORT_BEGIN");
  for (let i = 0; i < json.length; i += 1500) console.log("GLINT_EXPORT " + json.slice(i, i + 1500));
  console.log("GLINT_ALLTIME_EXPORT_END");
  return c.json({
    showToast: { text: `Exported ${entries.length} scores — see: devvit logs` },
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
